import { finnhubProvider, type FinnhubQuote, type FinnhubMetric } from '../market/stocks/FinnhubProvider';
import { getMeta, getAllMids } from '../hyperliquid/hyperliquidInfoService';
import { CRYPTO_UNIVERSE, type CandidateAsset, type AssetScope, type RiskMode } from './scanUniverseService';
import { rankCandidates, type RankedResult } from './dailyRankingService';

export interface FilterCriteria {
  minPrice: number;
  maxPrice: number;
  minMarketCapM: number;
  minAvgVolumeM: number;
  maxAvgVolumeM?: number;
  minPriceChangePct: number;
  maxPriceChangePct: number;
  excludeExchanges: string[];
}

export interface FullScanOptions {
  assetScope: AssetScope;
  riskMode: RiskMode;
  filterCriteria?: Partial<FilterCriteria>;
  maxCandidates?: number;
  maxFinalResults?: number;
  onProgress?: (phase: string, done: number, total: number) => void;
}

interface PreScore {
  symbol: string;
  score: number;
  reasons: string[];
}

interface CandidateWithScore extends CandidateAsset {
  prescore: number;
}

const candidateCache = new Map<string, { data: CandidateWithScore[]; ts: number }>();
const CANDIDATE_CACHE_TTL = 4 * 60 * 60 * 1000;

const COMMON_SYMBOL_REGEX = /^[A-Z]{1,5}$/;

function getFilterCriteriaForRiskMode(riskMode: RiskMode, overrides: Partial<FilterCriteria> = {}): FilterCriteria {
  const defaults: FilterCriteria = {
    minPrice: 1.00,
    maxPrice: 5000,
    minMarketCapM: 300,
    minAvgVolumeM: 0.5,
    minPriceChangePct: -50,
    maxPriceChangePct: 50,
    excludeExchanges: ['PNK', 'OTC', 'GREY'],
  };

  if (riskMode === 'CONSERVATIVE') {
    return { ...defaults, minMarketCapM: 5000, minAvgVolumeM: 2.0, ...overrides };
  }
  if (riskMode === 'AGGRESSIVE') {
    return { ...defaults, minMarketCapM: 100, minAvgVolumeM: 0.2, ...overrides };
  }
  return { ...defaults, ...overrides };
}

function getPreScoreThreshold(riskMode: RiskMode): number {
  if (riskMode === 'CONSERVATIVE') return 55;
  if (riskMode === 'AGGRESSIVE') return 35;
  return 45;
}

function prescoreCandidate(symbol: string, quote: FinnhubQuote, metrics: FinnhubMetric): PreScore {
  const reasons: string[] = [];
  let score = 0;

  const currentPrice = quote.c;
  const prevClose = quote.pc;
  const changePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;

  let momentumScore = 3;
  if (changePct > 3) { momentumScore = 25; reasons.push('Strong momentum >+3%'); }
  else if (changePct >= 1) { momentumScore = 18; reasons.push('Positive momentum +1–3%'); }
  else if (changePct >= 0) { momentumScore = 12; }
  else if (changePct >= -1) { momentumScore = 8; }
  score += momentumScore;

  const avgVolumeShares = metrics.avgVolume10D * 1_000_000;
  const volumeRatio = avgVolumeShares > 0 ? quote.v / avgVolumeShares : 0;
  let volumeScore = 5;
  if (volumeRatio > 3) { volumeScore = 25; reasons.push('Volume surge >3x avg'); }
  else if (volumeRatio >= 2) { volumeScore = 20; reasons.push('Volume surge 2–3x avg'); }
  else if (volumeRatio >= 1.5) { volumeScore = 15; }
  else if (volumeRatio >= 1) { volumeScore = 10; }
  score += volumeScore;

  const high52 = metrics.high52Week;
  const low52 = metrics.low52Week;
  const range52 = high52 - low52;
  let positionScore = 6;
  if (range52 > 0) {
    const posInRange = (currentPrice - low52) / range52;
    if (posInRange >= 0.9) { positionScore = 25; reasons.push('Near 52-week high (top 10%)'); }
    else if (posInRange >= 0.75) { positionScore = 20; reasons.push('Near 52-week high (top 25%)'); }
    else if (posInRange >= 0.25) { positionScore = 12; }
    else if (posInRange >= 0.1) { positionScore = 6; }
    else { positionScore = 2; }
  }
  score += positionScore;

  const marketCapM = metrics.marketCapM;
  let sizeScore = 15;
  if (marketCapM >= 10_000) { sizeScore = 25; reasons.push('Large cap >$10B'); }
  else if (marketCapM >= 2_000) { sizeScore = 20; reasons.push('Mid cap $2B–$10B'); }
  else if (marketCapM >= 300) { sizeScore = 15; }
  score += sizeScore;

  return { symbol, score, reasons };
}

export async function fetchAndFilterStocks(
  criteria: FilterCriteria,
  riskMode: RiskMode,
  onProgress?: (phase: string, done: number, total: number) => void,
): Promise<CandidateWithScore[]> {
  const cacheKey = `stocks:${riskMode}`;
  const cached = candidateCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CANDIDATE_CACHE_TTL) {
    console.log(`[FullUniverseScanner] Using cached candidates (${cached.data.length})`);
    return cached.data;
  }

  console.log('[FullUniverseScanner] Phase 1: Fetching stock symbols from Finnhub...');
  const allSymbols = await finnhubProvider.getStockSymbols('US');
  const pureCommon = allSymbols.filter((s) => COMMON_SYMBOL_REGEX.test(s.displaySymbol));
  console.log(`[FullUniverseScanner] Filtered to ${pureCommon.length} common stock symbols`);

  const prescoreThreshold = getPreScoreThreshold(riskMode);
  const BATCH_SIZE = 50;
  const survivorsWithMetrics: Array<{ symbol: string; metrics: FinnhubMetric }> = [];
  const totalBatches = Math.ceil(pureCommon.length / BATCH_SIZE);

  for (let i = 0; i < pureCommon.length; i += BATCH_SIZE) {
    const batch = pureCommon.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map((s) => finnhubProvider.getBasicFinancials(s.displaySymbol))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === 'fulfilled' && r.value) {
        const m = r.value;
        if (m.marketCapM >= criteria.minMarketCapM && m.avgVolume10D >= criteria.minAvgVolumeM) {
          survivorsWithMetrics.push({ symbol: batch[j].displaySymbol, metrics: m });
        }
      }
    }

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    onProgress?.('FILTERING', batchNum, totalBatches);
    if (batchNum % 5 === 0) {
      console.log(`[FullUniverseScanner] Metrics batch ${batchNum}/${totalBatches}, survivors so far: ${survivorsWithMetrics.length}`);
    }
  }

  console.log(`[FullUniverseScanner] ${survivorsWithMetrics.length} stocks passed market cap/volume filter. Fetching quotes...`);

  const QUOTE_BATCH = 50;
  const scored: CandidateWithScore[] = [];

  for (let i = 0; i < survivorsWithMetrics.length; i += QUOTE_BATCH) {
    const batch = survivorsWithMetrics.slice(i, i + QUOTE_BATCH);
    const quoteResults = await Promise.allSettled(
      batch.map((s) => finnhubProvider.getQuote(s.symbol))
    );

    for (let j = 0; j < quoteResults.length; j++) {
      const r = quoteResults[j];
      if (r.status !== 'fulfilled' || !r.value) continue;
      const quote = r.value;
      const { symbol, metrics } = batch[j];

      if (quote.c < criteria.minPrice || quote.c > criteria.maxPrice) continue;
      if (quote.pc > 0) {
        const chgPct = ((quote.c - quote.pc) / quote.pc) * 100;
        if (chgPct < criteria.minPriceChangePct || chgPct > criteria.maxPriceChangePct) continue;
      }

      const pre = prescoreCandidate(symbol, quote, metrics);
      if (pre.score >= prescoreThreshold) {
        scored.push({
          ticker: symbol,
          name: symbol,
          assetClass: 'stock',
          isCrypto: false,
          prescore: pre.score,
        });
      }
    }
  }

  const deduped = Array.from(new Map(scored.map((s) => [s.ticker, s])).values());
  deduped.sort((a, b) => b.prescore - a.prescore);

  console.log(`[FullUniverseScanner] ${deduped.length} stocks passed all filters and prescore threshold`);
  candidateCache.set(cacheKey, { data: deduped, ts: Date.now() });
  return deduped;
}

export async function getCryptoUniverse(): Promise<CandidateWithScore[]> {
  const staticTickers = new Set(CRYPTO_UNIVERSE.map((c) => c.ticker));
  const result: CandidateWithScore[] = CRYPTO_UNIVERSE.map((c) => ({ ...c, prescore: 50 }));

  try {
    const [meta, mids] = await Promise.allSettled([getMeta(), getAllMids()]);

    if (meta.status === 'fulfilled' && mids.status === 'fulfilled') {
      const assets = meta.value.universe ?? [];
      const prices = mids.value;

      for (const asset of assets) {
        const name = asset.name;
        if (name.endsWith('-PERP')) continue;
        const normalizedName = name.replace(/-PERP$/, '');
        if (staticTickers.has(normalizedName)) continue;

        const midStr = prices[normalizedName] ?? prices[name];
        if (!midStr) continue;
        const price = parseFloat(midStr);
        if (price <= 0.001) continue;

        result.push({
          ticker: normalizedName,
          name: normalizedName,
          assetClass: 'crypto',
          isCrypto: true,
          sector: 'Crypto',
          prescore: 40,
        });
      }
    }
  } catch (err) {
    console.warn('[FullUniverseScanner] getCryptoUniverse error:', err instanceof Error ? err.message : err);
  }

  const deduped = Array.from(new Map(result.map((c) => [c.ticker, c])).values());
  return deduped.slice(0, 80);
}

export async function runFullUniverse(opts: FullScanOptions): Promise<RankedResult[]> {
  const {
    assetScope,
    riskMode,
    filterCriteria = {},
    maxCandidates = 200,
    maxFinalResults = 100,
    onProgress,
  } = opts;

  const criteria = getFilterCriteriaForRiskMode(riskMode, filterCriteria);
  const allCandidates: CandidateWithScore[] = [];

  if (assetScope === 'ALL' || assetScope === 'STOCKS_ONLY') {
    console.log('[FullUniverseScanner] Starting stock universe fetch...');
    const stocks = await fetchAndFilterStocks(criteria, riskMode, onProgress);
    allCandidates.push(...stocks);
    console.log(`[FullUniverseScanner] Stock candidates: ${stocks.length}`);
  }

  if (assetScope === 'ALL' || assetScope === 'CRYPTO_ONLY') {
    console.log('[FullUniverseScanner] Fetching crypto universe...');
    const cryptos = await getCryptoUniverse();
    allCandidates.push(...cryptos);
    console.log(`[FullUniverseScanner] Crypto candidates: ${cryptos.length}`);
  }

  allCandidates.sort((a, b) => b.prescore - a.prescore);
  const topCandidates = allCandidates.slice(0, maxCandidates);
  console.log(`[FullUniverseScanner] Running deep thesis analysis on top ${topCandidates.length} candidates...`);

  let analyzedCount = 0;
  const results = await rankCandidates(
    topCandidates,
    maxFinalResults,
    (done, total) => {
      analyzedCount = done;
      onProgress?.('ANALYZING', done, total);
    },
    true,
  );

  console.log(`[FullUniverseScanner] Full universe scan complete. Analyzed: ${analyzedCount}, returned: ${results.length}`);
  return results;
}

export const fullUniverseScanner = { runFullUniverse, fetchAndFilterStocks, getCryptoUniverse };

export type { RankedResult };
