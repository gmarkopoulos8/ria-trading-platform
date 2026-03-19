/**
 * Yahoo Finance provider — fetches real-time price data from
 * https://finance.yahoo.com public API. No API key required.
 *
 * Endpoints used:
 *   Chart (quote + OHLCV history):
 *     https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=2d&interval=1d
 *   Search:
 *     https://query2.finance.yahoo.com/v1/finance/search?q={query}&quotesCount=10
 */

import axios, { type AxiosInstance } from 'axios';
import { IStocksProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe } from '../types';

const YF_USER_AGENT = 'Mozilla/5.0 (compatible; RIA-BOT/1.0)';

function createClient(baseURL: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: 10_000,
    headers: {
      'User-Agent':  YF_USER_AGENT,
      'Accept':      'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Origin':      'https://finance.yahoo.com',
      'Referer':     'https://finance.yahoo.com/',
    },
  });
}

const q1 = createClient('https://query1.finance.yahoo.com');
const q2 = createClient('https://query2.finance.yahoo.com');

// ─── Timeframe → Yahoo Finance range + interval ───────────────────

const TF_MAP: Record<Timeframe, { range: string; interval: string }> = {
  '1D':  { range: '1d',  interval: '5m'  },
  '1W':  { range: '7d',  interval: '60m' },
  '1M':  { range: '1mo', interval: '1d'  },
  '3M':  { range: '3mo', interval: '1d'  },
  '6M':  { range: '6mo', interval: '1d'  },
  '1Y':  { range: '1y',  interval: '1wk' },
  '5Y':  { range: '5y',  interval: '1mo' },
};

// ─── Internal helpers ─────────────────────────────────────────────

interface YFMeta {
  symbol: string;
  currency: string;
  exchangeName: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  regularMarketOpen?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  regularMarketChange?: number;
  regularMarketChangePercent?: number;
  previousClose?: number;
  marketCap?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  chartPreviousClose?: number;
}

function exchangeToAssetClass(ex: string): 'stock' | 'etf' {
  return ex.toLowerCase().includes('etf') ? 'etf' : 'stock';
}

async function fetchChart(symbol: string, range: string, interval: string): Promise<{ meta: YFMeta; timestamps: number[]; ohlcv: { o: number[]; h: number[]; l: number[]; c: number[]; v: number[] } }> {
  const { data } = await q1.get(`/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    params: { range, interval, includePrePost: false, events: 'div,splits' },
  });

  const result = data?.chart?.result?.[0];
  if (!result) {
    const err = data?.chart?.error;
    throw new Error(err?.description ?? `Yahoo Finance returned no data for "${symbol}"`);
  }

  const meta: YFMeta = result.meta ?? {};
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};

  return {
    meta,
    timestamps,
    ohlcv: {
      o: q.open  ?? [],
      h: q.high  ?? [],
      l: q.low   ?? [],
      c: q.close ?? [],
      v: q.volume ?? [],
    },
  };
}

// ─── Provider implementation ──────────────────────────────────────

export class YahooFinanceProvider implements IStocksProvider {
  async quote(symbol: string): Promise<NormalizedQuote> {
    console.log(`[YahooFinance] Fetching quote: ${symbol}`);
    const { meta } = await fetchChart(symbol, '2d', '1d');

    const price = meta.regularMarketPrice ?? 0;
    const prevClose = meta.previousClose ?? meta.chartPreviousClose ?? price;
    const change = meta.regularMarketChange ?? (price - prevClose);
    const changePct = meta.regularMarketChangePercent ?? (prevClose > 0 ? (change / prevClose) * 100 : 0);

    return {
      symbol:          meta.symbol ?? symbol.toUpperCase(),
      name:            meta.longName ?? meta.shortName ?? symbol.toUpperCase(),
      price,
      open:            meta.regularMarketOpen ?? price,
      high:            meta.regularMarketDayHigh ?? price,
      low:             meta.regularMarketDayLow ?? price,
      previousClose:   prevClose,
      change:          parseFloat(change.toFixed(4)),
      changePercent:   parseFloat(changePct.toFixed(4)),
      volume:          meta.regularMarketVolume ?? 0,
      marketCap:       meta.marketCap,
      high52Week:      meta.fiftyTwoWeekHigh,
      low52Week:       meta.fiftyTwoWeekLow,
      currency:        meta.currency ?? 'USD',
      assetClass:      exchangeToAssetClass(meta.exchangeName ?? ''),
      exchange:        meta.exchangeName,
      timestamp:       new Date(),
      isMock:          false,
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    console.log(`[YahooFinance] Fetching history: ${symbol} (${timeframe})`);
    const { range, interval } = TF_MAP[timeframe] ?? TF_MAP['1M'];
    const { timestamps, ohlcv } = await fetchChart(symbol, range, interval);

    const bars: OHLCVBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = ohlcv.c[i];
      if (c == null || isNaN(c)) continue;
      bars.push({
        timestamp:  new Date(timestamps[i] * 1000),
        open:       ohlcv.o[i] ?? c,
        high:       ohlcv.h[i] ?? c,
        low:        ohlcv.l[i] ?? c,
        close:      c,
        volume:     ohlcv.v[i] ?? 0,
      });
    }
    return bars;
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const { data } = await q2.get('/v1/finance/search', {
        params: { q: query, quotesCount: 10, newsCount: 0, listsCount: 0 },
      });

      const quotes = data?.quotes ?? [];
      return quotes
        .filter((q: any) => q.quoteType === 'EQUITY' || q.quoteType === 'ETF')
        .map((q: any) => ({
          symbol:     q.symbol,
          name:       q.longname ?? q.shortname ?? q.symbol,
          assetClass: (q.quoteType === 'ETF' ? 'etf' : 'stock') as 'stock' | 'etf',
          exchange:   q.exchange,
          currency:   'USD',
        }));
    } catch (err) {
      console.warn('[YahooFinance] search failed:', (err as Error).message);
      return [];
    }
  }
}
