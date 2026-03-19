import axios from 'axios';
import { nanoid } from 'nanoid';
import type { NormalizedNewsItem } from './types';
import { generateNewsItems } from './generator';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CRYPTOPANIC_BASE = 'https://cryptopanic.com/api/free/v1';

// ─── Token Bucket Rate Limiter (55 req/min) ───────────────────────

let tokensAvailable = 55;
let lastRefill = Date.now();
const callQueue: Array<() => void> = [];
let processingQueue = false;

function refillTokens() {
  const now = Date.now();
  const elapsed = now - lastRefill;
  if (elapsed >= 60_000) {
    tokensAvailable = 55;
    lastRefill = now;
  }
}

function processQueue() {
  if (processingQueue) return;
  processingQueue = true;
  const run = () => {
    refillTokens();
    if (callQueue.length === 0) { processingQueue = false; return; }
    if (tokensAvailable > 0) {
      tokensAvailable--;
      const fn = callQueue.shift();
      if (fn) fn();
      setTimeout(run, 1100);
    } else {
      const msUntilRefill = 60_000 - (Date.now() - lastRefill);
      setTimeout(run, msUntilRefill + 100);
    }
  };
  run();
}

async function rateLimitedGet(url: string, params: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    callQueue.push(async () => {
      try {
        const { data } = await axios.get(url, { params, timeout: 8000 });
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
    processQueue();
  });
}

function finnhubGet(path: string, extra: Record<string, string> = {}): Promise<unknown> {
  const key = process.env.FINNHUB_API_KEY ?? '';
  return rateLimitedGet(`${FINNHUB_BASE}${path}`, { token: key, ...extra });
}

// ─── Mappers ──────────────────────────────────────────────────────

function mapSentiment(bullish: number, bearish: number): 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' {
  if (bullish > bearish + 10) return 'POSITIVE';
  if (bearish > bullish + 10) return 'NEGATIVE';
  return 'NEUTRAL';
}

function importanceFromHeadline(headline: string): number {
  const h = headline.toLowerCase();
  if (h.includes('earnings') || h.includes('guidance') || h.includes('beats') || h.includes('misses')) return 0.85;
  if (h.includes('upgrade') || h.includes('downgrade') || h.includes('price target')) return 0.75;
  if (h.includes('partnership') || h.includes('acquisition') || h.includes('merger')) return 0.70;
  return 0.55;
}

function recencyScore(publishedAt: Date): number {
  const ageHours = (Date.now() - publishedAt.getTime()) / 3_600_000;
  if (ageHours < 2) return 1.0;
  if (ageHours < 12) return 0.85;
  if (ageHours < 24) return 0.7;
  if (ageHours < 72) return 0.5;
  return 0.3;
}

// ─── Fetch Company News ───────────────────────────────────────────

export async function fetchCompanyNews(ticker: string, daysBack = 5): Promise<NormalizedNewsItem[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return generateNewsItems(ticker, 'stock', 15);

  const to = new Date();
  const from = new Date(Date.now() - daysBack * 86_400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const [newsRaw, sentimentRaw, upgradesRaw, recRaw] = await Promise.allSettled([
      finnhubGet('/company-news', { symbol: ticker, from: fmt(from), to: fmt(to) }),
      finnhubGet('/news-sentiment', { symbol: ticker }),
      finnhubGet('/stock/upgrade-downgrade', { symbol: ticker }),
      finnhubGet('/stock/recommendation', { symbol: ticker }),
    ]);

    const sentiment = sentimentRaw.status === 'fulfilled' ? (sentimentRaw.value as any) : null;
    const bullishPct = sentiment?.sentiment?.bullishPercent ?? 50;
    const bearishPct = sentiment?.sentiment?.bearishPercent ?? 50;
    const overallSentiment = mapSentiment(bullishPct * 100, bearishPct * 100);

    const items: NormalizedNewsItem[] = [];

    // Map raw news articles
    if (newsRaw.status === 'fulfilled' && Array.isArray(newsRaw.value)) {
      for (const art of (newsRaw.value as any[]).slice(0, 12)) {
        if (!art.headline) continue;
        const publishedAt = new Date(art.datetime * 1000);
        const recency = recencyScore(publishedAt);
        const importance = importanceFromHeadline(art.headline);
        items.push({
          id: nanoid(),
          ticker,
          headline: art.headline,
          summary: art.summary || art.headline,
          url: art.url || '',
          source: { name: art.source || 'Finnhub', domain: 'finnhub.io', qualityScore: 0.75 },
          publishedAt,
          eventType: 'GENERAL',
          sentiment: overallSentiment,
          category: overallSentiment === 'POSITIVE' ? 'POSITIVE_CATALYST' : overallSentiment === 'NEGATIVE' ? 'NEGATIVE_CATALYST' : 'NEUTRAL',
          urgency: importance > 0.8 ? 'HIGH' : importance > 0.65 ? 'MEDIUM' : 'LOW',
          scores: {
            sentiment: overallSentiment === 'POSITIVE' ? 0.65 : overallSentiment === 'NEGATIVE' ? -0.65 : 0,
            sentimentTrend: 0,
            importance,
            recency,
            sourceQuality: 0.75,
            catalyst: (importance + recency) / 2,
          },
          explanation: art.summary || art.headline,
          keyPoints: [art.headline],
        });
      }
    }

    // Map analyst upgrades/downgrades
    if (upgradesRaw.status === 'fulfilled' && Array.isArray(upgradesRaw.value)) {
      for (const upg of (upgradesRaw.value as any[]).slice(0, 3)) {
        if (!upg.company) continue;
        const isUpgrade = upg.action?.toLowerCase().includes('up') || upg.toGrade?.toLowerCase().includes('buy');
        const sentLabel: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = isUpgrade ? 'POSITIVE' : 'NEGATIVE';
        const publishedAt = new Date(upg.gradeDate);
        items.push({
          id: nanoid(),
          ticker,
          headline: `${upg.company}: ${upg.action ?? 'Rating'} ${ticker} — ${upg.fromGrade ?? '?'} → ${upg.toGrade ?? '?'}${upg.priceTarget ? ` (PT: $${upg.priceTarget})` : ''}`,
          summary: `Analyst ${upg.company} changed rating from ${upg.fromGrade ?? 'N/A'} to ${upg.toGrade ?? 'N/A'}`,
          url: '',
          source: { name: upg.company, domain: 'analyst', qualityScore: 0.8 },
          publishedAt,
          eventType: 'ANALYST_ACTION',
          sentiment: sentLabel,
          category: sentLabel === 'POSITIVE' ? 'POSITIVE_CATALYST' : 'NEGATIVE_CATALYST',
          urgency: 'MEDIUM',
          scores: { sentiment: isUpgrade ? 0.7 : -0.7, sentimentTrend: 0, importance: 0.75, recency: recencyScore(publishedAt), sourceQuality: 0.8, catalyst: 0.72 },
          explanation: `Analyst action from ${upg.company}`,
          keyPoints: [`Grade: ${upg.fromGrade} → ${upg.toGrade}`, upg.priceTarget ? `Price Target: $${upg.priceTarget}` : ''],
        });
      }
    }

    // Synthetic consensus item
    if (recRaw.status === 'fulfilled' && Array.isArray(recRaw.value) && (recRaw.value as any[]).length > 0) {
      const rec = (recRaw.value as any[])[0];
      const totalAnalysts = (rec.strongBuy ?? 0) + (rec.buy ?? 0) + (rec.hold ?? 0) + (rec.sell ?? 0) + (rec.strongSell ?? 0);
      const bullishAnalysts = (rec.strongBuy ?? 0) + (rec.buy ?? 0);
      const bullishPctAna = totalAnalysts > 0 ? (bullishAnalysts / totalAnalysts) * 100 : 50;
      const consensusSentiment = bullishPctAna > 60 ? 'POSITIVE' : bullishPctAna < 40 ? 'NEGATIVE' : 'NEUTRAL';
      items.push({
        id: nanoid(),
        ticker,
        headline: `Analyst Consensus: ${totalAnalysts} analysts — Strong Buy: ${rec.strongBuy ?? 0}, Buy: ${rec.buy ?? 0}, Hold: ${rec.hold ?? 0}, Sell: ${rec.sell ?? 0}`,
        summary: `Wall Street consensus for ${ticker}: ${bullishPctAna.toFixed(0)}% bullish across ${totalAnalysts} analysts`,
        url: '',
        source: { name: 'Finnhub Consensus', domain: 'finnhub.io', qualityScore: 0.85 },
        publishedAt: new Date(),
        eventType: 'ANALYST_ACTION',
        sentiment: consensusSentiment,
        category: consensusSentiment === 'POSITIVE' ? 'POSITIVE_CATALYST' : 'NEUTRAL',
        urgency: 'LOW',
        scores: { sentiment: (bullishPctAna - 50) / 50, sentimentTrend: 0, importance: 0.65, recency: 1.0, sourceQuality: 0.85, catalyst: 0.65 },
        explanation: 'Wall Street analyst consensus',
        keyPoints: [`${rec.strongBuy ?? 0} Strong Buy`, `${rec.buy ?? 0} Buy`, `${rec.hold ?? 0} Hold`, `${rec.sell ?? 0} Sell`],
      });
    }

    return items.length > 0 ? items : generateNewsItems(ticker, 'stock', 15);
  } catch (err) {
    console.warn(`[FinnhubNews] Error fetching news for ${ticker}:`, err instanceof Error ? err.message : err);
    return generateNewsItems(ticker, 'stock', 15);
  }
}

// ─── Fetch Crypto News ────────────────────────────────────────────

export async function fetchCryptoNews(ticker: string): Promise<NormalizedNewsItem[]> {
  const key = process.env.CRYPTOPANIC_API_KEY;
  if (!key) return generateNewsItems(ticker, 'crypto', 15);

  const currency = ticker.replace('-USD', '').replace('USDT', '').toUpperCase();

  try {
    const { data } = await axios.get(`${CRYPTOPANIC_BASE}/posts/`, {
      params: { auth_token: key, currencies: currency, public: 'true', filter: 'important', kind: 'news' },
      timeout: 8000,
    });

    if (!data?.results?.length) return generateNewsItems(ticker, 'crypto', 15);

    return (data.results as any[]).slice(0, 15).map((post: any) => {
      const pos = post.votes?.positive ?? 0;
      const neg = post.votes?.negative ?? 0;
      const sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = pos > neg ? 'POSITIVE' : neg > pos ? 'NEGATIVE' : 'NEUTRAL';
      const publishedAt = new Date(post.published_at);
      const importance = importanceFromHeadline(post.title ?? '');
      return {
        id: nanoid(),
        ticker,
        headline: post.title ?? 'Crypto News',
        summary: post.title ?? '',
        url: post.url ?? '',
        source: { name: post.source?.title ?? 'CryptoPanic', domain: post.source?.domain ?? 'cryptopanic.com', qualityScore: 0.7 },
        publishedAt,
        eventType: 'GENERAL' as const,
        sentiment,
        category: (sentiment === 'POSITIVE' ? 'POSITIVE_CATALYST' : sentiment === 'NEGATIVE' ? 'NEGATIVE_CATALYST' : 'NEUTRAL') as any,
        urgency: importance > 0.8 ? 'HIGH' : 'MEDIUM' as const,
        scores: {
          sentiment: sentiment === 'POSITIVE' ? 0.6 : sentiment === 'NEGATIVE' ? -0.6 : 0,
          sentimentTrend: 0,
          importance,
          recency: recencyScore(publishedAt),
          sourceQuality: 0.7,
          catalyst: (importance + recencyScore(publishedAt)) / 2,
        },
        explanation: post.title ?? '',
        keyPoints: [post.title ?? ''],
      };
    });
  } catch (err) {
    console.warn(`[CryptoPanic] Error fetching news for ${ticker}:`, err instanceof Error ? err.message : err);
    return generateNewsItems(ticker, 'crypto', 15);
  }
}

// ─── Insider Signal (stocks only, Phase 7) ────────────────────────

const _insiderCache = new Map<string, { data: InsiderSignal | null; ts: number }>();
const INSIDER_TTL = 4 * 60 * 60 * 1000;

export interface InsiderSignal {
  recentBuys: number;
  recentSells: number;
  netSharesBought: number;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  explanation: string;
}

export async function getInsiderSignal(ticker: string): Promise<InsiderSignal | null> {
  const cached = _insiderCache.get(ticker);
  if (cached && Date.now() - cached.ts < INSIDER_TTL) return cached.data;

  const key = process.env.FINNHUB_API_KEY ?? '';
  if (!key) return null;

  try {
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const data = await finnhubGet(`/stock/insider-transactions`, {
      symbol: ticker, from, to,
    }) as { data?: Array<{ name: string; share: number; change: number; transactionCode: string; transactionPrice: number }> };

    const transactions = data?.data ?? [];
    const buys = transactions.filter((t) => t.transactionCode === 'P' && t.change > 0);
    const sells = transactions.filter((t) => t.transactionCode === 'S' && t.change < 0);

    const netShares = buys.reduce((s, t) => s + t.change, 0) + sells.reduce((s, t) => s + t.change, 0);
    const buyCount = buys.length;
    const sellCount = sells.length;

    let signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    let explanation = '';

    if (buyCount >= 2 && netShares > 0) {
      signal = 'BULLISH';
      explanation = `${buyCount} insider purchase${buyCount > 1 ? 's' : ''} in last 90 days — net ${netShares.toLocaleString()} shares bought. Strong insider conviction.`;
    } else if (sellCount >= 3 && netShares < 0) {
      signal = 'BEARISH';
      explanation = `${sellCount} insider sales in last 90 days. Distribution by insiders.`;
    } else {
      explanation = `${buyCount} buys, ${sellCount} sells in last 90 days. No clear insider signal.`;
    }

    const result: InsiderSignal = { recentBuys: buyCount, recentSells: sellCount, netSharesBought: netShares, signal, explanation };
    _insiderCache.set(ticker, { data: result, ts: Date.now() });
    return result;
  } catch {
    _insiderCache.set(ticker, { data: null, ts: Date.now() });
    return null;
  }
}
