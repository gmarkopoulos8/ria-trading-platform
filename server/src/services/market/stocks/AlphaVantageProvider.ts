import axios from 'axios';
import {
  IStocksProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe,
} from '../types';
import { safeParseFloat, pctChange, roundTo } from '../utils';

const BASE = 'https://www.alphavantage.co/query';

export class AlphaVantageProvider implements IStocksProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async fetch<T>(params: Record<string, string>): Promise<T> {
    const { data } = await axios.get<T>(BASE, {
      params: { ...params, apikey: this.apiKey },
      timeout: 10000,
    });
    return data;
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetch<{
      bestMatches?: Array<{
        '1. symbol': string;
        '2. name': string;
        '3. type': string;
        '4. region': string;
        '8. currency': string;
      }>;
    }>({ function: 'SYMBOL_SEARCH', keywords: query });

    return (data.bestMatches ?? [])
      .filter((m) => m['4. region'] === 'United States')
      .map((m) => ({
        symbol: m['1. symbol'],
        name: m['2. name'],
        assetClass: m['3. type'] === 'ETF' ? 'etf' : ('stock' as const),
        currency: m['8. currency'] ?? 'USD',
      }))
      .slice(0, 10);
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const data = await this.fetch<{
      'Global Quote'?: {
        '01. symbol': string;
        '02. open': string;
        '03. high': string;
        '04. low': string;
        '05. price': string;
        '06. volume': string;
        '07. latest trading day': string;
        '08. previous close': string;
        '09. change': string;
        '10. change percent': string;
      };
    }>({ function: 'GLOBAL_QUOTE', symbol });

    const q = data['Global Quote'];
    if (!q || !q['05. price']) {
      throw new Error(`No quote data for ${symbol}`);
    }

    const price = safeParseFloat(q['05. price']);
    const previousClose = safeParseFloat(q['08. previous close']);
    const change = safeParseFloat(q['09. change']);
    const changePct = safeParseFloat(q['10. change percent'].replace('%', ''));

    return {
      symbol: q['01. symbol'],
      name: symbol,
      price,
      open: safeParseFloat(q['02. open']),
      high: safeParseFloat(q['03. high']),
      low: safeParseFloat(q['04. low']),
      previousClose,
      change: roundTo(change),
      changePercent: roundTo(changePct, 4),
      volume: safeParseFloat(q['06. volume']),
      currency: 'USD',
      assetClass: 'stock',
      timestamp: new Date(),
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const useDaily = ['1M', '3M', '6M', '1Y'].includes(timeframe);
    const useWeekly = timeframe === '5Y';
    const useIntraday = timeframe === '1D' || timeframe === '1W';

    let fn: string;
    let seriesKey: string;

    if (useWeekly) {
      fn = 'TIME_SERIES_WEEKLY';
      seriesKey = 'Weekly Time Series';
    } else if (useDaily) {
      fn = 'TIME_SERIES_DAILY';
      seriesKey = 'Time Series (Daily)';
    } else {
      fn = 'TIME_SERIES_INTRADAY';
      seriesKey = 'Time Series (5min)';
    }

    const params: Record<string, string> = { function: fn, symbol };
    if (useIntraday) params['interval'] = '5min';
    if (!useIntraday) params['outputsize'] = 'compact';

    const data = await this.fetch<Record<string, unknown>>(params);
    const series = data[seriesKey] as Record<string, Record<string, string>> | undefined;

    if (!series) throw new Error(`No history data for ${symbol} [${timeframe}]`);

    const cutoffDays: Record<Timeframe, number> = {
      '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, '1Y': 365, '5Y': 1825,
    };
    const cutoff = new Date(Date.now() - cutoffDays[timeframe] * 24 * 60 * 60 * 1000);

    return Object.entries(series)
      .map(([ts, v]) => ({
        timestamp: new Date(ts),
        open: safeParseFloat(v['1. open']),
        high: safeParseFloat(v['2. high']),
        low: safeParseFloat(v['3. low']),
        close: safeParseFloat(v['4. close']),
        volume: safeParseFloat(v['5. volume']),
      }))
      .filter((b) => b.timestamp >= cutoff)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-500);
  }
}
