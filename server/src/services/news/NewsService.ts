import {
  NormalizedNewsItem, SentimentSummary, CatalystAnalysis,
  SentimentLabel, EventType,
} from './types';
import { generateNewsItems } from './generator';
import { computeSentimentTrend } from './classifier';
import { isCryptoSymbol } from '../market/utils';
import prisma from '../../lib/prisma';

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { data: CatalystAnalysis; ts: number }>();

function buildSentimentSummary(ticker: string, items: NormalizedNewsItem[]): SentimentSummary {
  const positive = items.filter((i) => i.sentiment === 'POSITIVE');
  const negative = items.filter((i) => i.sentiment === 'NEGATIVE');
  const neutral = items.filter((i) => i.sentiment === 'NEUTRAL');
  const urgent = items.filter((i) => i.urgency === 'CRITICAL' || i.urgency === 'HIGH');

  const totalSentiment = items.reduce((s, i) => s + i.scores.sentiment, 0);
  const avgSentiment = items.length > 0 ? Math.round((totalSentiment / items.length) * 100) / 100 : 0;

  const trend = computeSentimentTrend(items);
  let sentimentTrend: SentimentSummary['sentimentTrend'] = 'STABLE';
  if (trend > 0.1) sentimentTrend = 'IMPROVING';
  else if (trend < -0.1) sentimentTrend = 'DETERIORATING';

  let overallSentiment: SentimentLabel = 'NEUTRAL';
  if (positive.length > negative.length + neutral.length * 0.5) overallSentiment = 'POSITIVE';
  else if (negative.length > positive.length + neutral.length * 0.5) overallSentiment = 'NEGATIVE';

  const typeCounts = new Map<EventType, number>();
  for (const item of items) {
    typeCounts.set(item.eventType, (typeCounts.get(item.eventType) ?? 0) + 1);
  }
  let dominantEventType: EventType | null = null;
  let maxCount = 0;
  for (const [type, count] of typeCounts) {
    if (count > maxCount) { maxCount = count; dominantEventType = type; }
  }

  const sentimentPct = items.length > 0 ? Math.round((positive.length / items.length) * 100) : 50;
  const summary = `${items.length} recent ${ticker} developments: ${positive.length} positive, ${negative.length} negative, ${neutral.length} neutral. Sentiment ${sentimentTrend.toLowerCase()} (avg score: ${avgSentiment > 0 ? '+' : ''}${avgSentiment}). ${urgent.length > 0 ? `${urgent.length} high-impact items require attention.` : 'No urgent flags.'}`;

  return {
    ticker,
    overallSentiment,
    sentimentScore: avgSentiment,
    sentimentTrend,
    positiveCount: positive.length,
    negativeCount: negative.length,
    neutralCount: neutral.length,
    urgentCount: urgent.length,
    dominantEventType,
    summary,
  };
}

class NewsService {
  async getCatalysts(
    ticker: string,
    options: { limit?: number; eventType?: string; sentiment?: string } = {}
  ): Promise<CatalystAnalysis> {
    const cacheKey = `${ticker}`;
    const cached = cache.get(cacheKey);

    let items: NormalizedNewsItem[];

    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      items = cached.data.newsItems;
    } else {
      const assetClass = isCryptoSymbol(ticker) ? 'crypto' : 'stock';
      items = generateNewsItems(ticker, assetClass, 15);

      const analysis: CatalystAnalysis = {
        ticker,
        newsItems: items,
        sentimentSummary: buildSentimentSummary(ticker, items),
        analyzedAt: new Date(),
        timespan: '5 days',
      };

      cache.set(cacheKey, { data: analysis, ts: Date.now() });
      this.persistItems(ticker, items).catch(() => {});
    }

    let filtered = [...items];
    if (options.eventType && options.eventType !== 'ALL') {
      filtered = filtered.filter((i) => i.eventType === options.eventType);
    }
    if (options.sentiment && options.sentiment !== 'ALL') {
      filtered = filtered.filter((i) => i.sentiment === options.sentiment);
    }
    const limited = filtered.slice(0, options.limit ?? 15);
    const sentimentSummary = buildSentimentSummary(ticker, items);

    return {
      ticker,
      newsItems: limited,
      sentimentSummary,
      analyzedAt: new Date(),
      timespan: '5 days',
    };
  }

  async getMarketNews(options: { limit?: number; eventType?: string } = {}): Promise<NormalizedNewsItem[]> {
    const tickers = ['NVDA', 'BTC', 'ETH', 'TSLA', 'AAPL', 'SPY'];
    const allItems: NormalizedNewsItem[] = [];

    for (const ticker of tickers) {
      const assetClass = isCryptoSymbol(ticker) ? 'crypto' : 'stock';
      const items = generateNewsItems(ticker, assetClass, 3);
      allItems.push(...items);
    }

    let result = allItems.sort((a, b) => b.scores.catalyst - a.scores.catalyst);
    if (options.eventType && options.eventType !== 'ALL') {
      result = result.filter((i) => i.eventType === options.eventType);
    }
    return result.slice(0, options.limit ?? 20);
  }

  private async persistItems(ticker: string, items: NormalizedNewsItem[]): Promise<void> {
    try {
      const symbol = await prisma.symbol.findUnique({ where: { ticker } });
      if (!symbol) return;

      await prisma.newsItem.createMany({
        data: items.slice(0, 5).map((item) => ({
          symbolId: symbol.id,
          ticker,
          headline: item.headline,
          summary: item.summary,
          url: item.url,
          source: item.source.name,
          sentiment: item.sentiment,
          impact: item.urgency,
          publishedAt: item.publishedAt,
          metadata: {
            eventType: item.eventType,
            category: item.category,
            scores: item.scores,
            keyPoints: item.keyPoints,
            explanation: item.explanation,
            isMock: item.isMock,
          },
        })),
        skipDuplicates: false,
      });

      await prisma.catalystScore.create({
        data: {
          symbolId: symbol.id,
          ticker,
          scoreType: 'CATALYST_COMPOSITE',
          score: items.reduce((s, i) => s + i.scores.catalyst, 0) / items.length,
          direction: items[0]?.sentiment ?? 'NEUTRAL',
          magnitude: items[0]?.urgency ?? 'LOW',
          metadata: {
            positiveCount: items.filter((i) => i.sentiment === 'POSITIVE').length,
            negativeCount: items.filter((i) => i.sentiment === 'NEGATIVE').length,
            urgentCount: items.filter((i) => i.urgency === 'CRITICAL' || i.urgency === 'HIGH').length,
          },
          expiresAt: new Date(Date.now() + CACHE_TTL_MS),
          scoredAt: new Date(),
        },
      });
    } catch {
    }
  }
}

export const newsService = new NewsService();
