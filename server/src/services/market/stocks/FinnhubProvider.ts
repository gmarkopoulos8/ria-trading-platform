import axios from 'axios';
import type { IStocksProvider, NormalizedQuote, OHLCVBar, SearchResult, Timeframe } from '../types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY ?? '';

class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens = 55;
  private readonly refillIntervalMs = 60_000;

  constructor() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  async waitForToken(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed >= this.refillIntervalMs) {
      this.tokens = this.maxTokens;
      this.lastRefill = now;
    }

    if (this.tokens > 0) {
      this.tokens--;
      return;
    }

    const waitMs = this.refillIntervalMs - (Date.now() - this.lastRefill) + 100;
    console.log(`[FinnhubProvider] Rate limit reached — waiting ${waitMs}ms`);
    await new Promise((r) => setTimeout(r, waitMs));
    this.tokens = this.maxTokens - 1;
    this.lastRefill = Date.now();
  }
}

export const finnhubRateLimiter = new RateLimiter();

export interface FinnhubSymbol {
  description: string;
  displaySymbol: string;
  symbol: string;
  type: string;
}

export interface FinnhubQuote {
  c: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  v: number;
  t: number;
}

export interface FinnhubMetric {
  marketCapM: number;
  high52Week: number;
  low52Week: number;
  avgVolume10D: number;
  beta: number | null;
  pe: number | null;
}

const symbolCache = new Map<string, { data: FinnhubSymbol[]; ts: number }>();
const SYMBOL_CACHE_TTL = 24 * 60 * 60 * 1000;

const metricsCache = new Map<string, { data: FinnhubMetric; ts: number }>();
const METRICS_CACHE_TTL = 6 * 60 * 60 * 1000;

async function finnhubGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const { data } = await axios.get<T>(`${FINNHUB_BASE}${path}`, {
    params: { token: API_KEY, ...params },
    timeout: 10_000,
  });
  return data;
}

class FinnhubProviderClass implements IStocksProvider {
  async getStockSymbols(exchange: 'US' | 'NYSE' | 'NASDAQ' = 'US'): Promise<FinnhubSymbol[]> {
    const cacheKey = `symbols:${exchange}`;
    const cached = symbolCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < SYMBOL_CACHE_TTL) return cached.data;

    await finnhubRateLimiter.waitForToken();
    try {
      const raw = await finnhubGet<FinnhubSymbol[]>('/stock/symbol', { exchange });
      const filtered = raw.filter((s) => s.type === 'Common Stock');
      symbolCache.set(cacheKey, { data: filtered, ts: Date.now() });
      return filtered;
    } catch (err) {
      console.warn('[FinnhubProvider] Failed to fetch symbols:', err instanceof Error ? err.message : err);
      return symbolCache.get(cacheKey)?.data ?? [];
    }
  }

  async getQuote(symbol: string): Promise<FinnhubQuote | null> {
    await finnhubRateLimiter.waitForToken();
    try {
      const data = await finnhubGet<FinnhubQuote>('/quote', { symbol });
      if (!data || data.c === 0) return null;
      return data;
    } catch (err) {
      console.warn(`[FinnhubProvider] getQuote failed for ${symbol}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async getBasicFinancials(symbol: string): Promise<FinnhubMetric | null> {
    const cached = metricsCache.get(symbol);
    if (cached && Date.now() - cached.ts < METRICS_CACHE_TTL) return cached.data;

    await finnhubRateLimiter.waitForToken();
    try {
      const raw = await finnhubGet<{ metric: Record<string, number | null> }>('/stock/metric', { symbol, metric: 'all' });
      const m = raw?.metric ?? {};
      const result: FinnhubMetric = {
        marketCapM: (m['marketCapitalization'] as number) ?? 0,
        high52Week: (m['52WeekHigh'] as number) ?? 0,
        low52Week: (m['52WeekLow'] as number) ?? 0,
        avgVolume10D: (m['10DayAverageTradingVolume'] as number) ?? 0,
        beta: (m['beta'] as number | null) ?? null,
        pe: (m['peBasicExclExtraTTM'] as number | null) ?? null,
      };
      metricsCache.set(symbol, { data: result, ts: Date.now() });
      return result;
    } catch (err) {
      console.warn(`[FinnhubProvider] getBasicFinancials failed for ${symbol}:`, err instanceof Error ? err.message : err);
      return null;
    }
  }

  async getCandles(symbol: string, resolution: string, from: number, to: number): Promise<OHLCVBar[]> {
    await finnhubRateLimiter.waitForToken();
    try {
      const raw = await finnhubGet<{
        c: number[]; h: number[]; l: number[]; o: number[]; v: number[]; t: number[]; s: string;
      }>('/stock/candle', {
        symbol,
        resolution,
        from: String(Math.floor(from)),
        to: String(Math.floor(to)),
      });

      if (!raw || raw.s !== 'ok' || !raw.c?.length) return [];

      return raw.c.map((close, i) => ({
        timestamp: new Date(raw.t[i] * 1000),
        open: raw.o[i],
        high: raw.h[i],
        low: raw.l[i],
        close,
        volume: raw.v[i],
      }));
    } catch (err) {
      console.warn(`[FinnhubProvider] getCandles failed for ${symbol}:`, err instanceof Error ? err.message : err);
      return [];
    }
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const q = await this.getQuote(symbol);
    const price = q?.c ?? 0;
    const prevClose = q?.pc ?? 0;
    return {
      symbol,
      name: symbol,
      price,
      open: q?.o ?? price,
      high: q?.h ?? price,
      low: q?.l ?? price,
      previousClose: prevClose,
      change: price - prevClose,
      changePercent: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0,
      volume: q?.v ?? 0,
      currency: 'USD',
      assetClass: 'stock',
      timestamp: q?.t ? new Date(q.t * 1000) : new Date(),
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const now = Math.floor(Date.now() / 1000);
    const map: Record<Timeframe, { resolution: string; from: number }> = {
      '1D': { resolution: '5',  from: now - 86_400 },
      '1W': { resolution: '60', from: now - 7 * 86_400 },
      '1M': { resolution: 'D',  from: now - 30 * 86_400 },
      '3M': { resolution: 'D',  from: now - 90 * 86_400 },
      '6M': { resolution: 'D',  from: now - 180 * 86_400 },
      '1Y': { resolution: 'W',  from: now - 365 * 86_400 },
      '5Y': { resolution: 'W',  from: now - 5 * 365 * 86_400 },
    };
    const { resolution, from } = map[timeframe] ?? map['3M'];
    return this.getCandles(symbol, resolution, from, now);
  }

  async search(query: string): Promise<SearchResult[]> {
    await finnhubRateLimiter.waitForToken();
    try {
      const raw = await finnhubGet<{ result: Array<{ description: string; displaySymbol: string; symbol: string; type: string }> }>('/search', { q: query });
      return (raw?.result ?? []).map((r) => ({
        symbol: r.symbol,
        name: r.description,
        assetClass: 'stock' as const,
        currency: 'USD',
        description: r.description,
      }));
    } catch (err) {
      console.warn('[FinnhubProvider] search failed:', err instanceof Error ? err.message : err);
      return [];
    }
  }
}

export const finnhubProvider = new FinnhubProviderClass();
