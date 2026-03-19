import { IStocksProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe } from '../types';
import { AlphaVantageProvider } from './AlphaVantageProvider';
import { YahooFinanceProvider } from './YahooFinanceProvider';
import { MockStocksProvider } from './MockStocksProvider';
import { getCachedQuote, setCachedQuote, getCachedHistory, setCachedHistory } from '../cache';

function createProvider(): IStocksProvider {
  const key = process.env.STOCKS_API_KEY;
  if (key && key.trim().length > 0) {
    console.log('[StocksService] Using Alpha Vantage provider');
    return new AlphaVantageProvider(key.trim());
  }
  console.log('[StocksService] Using Yahoo Finance provider (finance.yahoo.com)');
  return new YahooFinanceProvider();
}

class StocksService {
  private provider: IStocksProvider;
  private yahoo: YahooFinanceProvider;
  private mock: MockStocksProvider;

  constructor() {
    this.provider = createProvider();
    this.yahoo = new YahooFinanceProvider();
    this.mock  = new MockStocksProvider();
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      const results = await this.provider.search(query);
      if (results.length > 0) return results;
      // If primary returns empty, try Yahoo directly
      return await this.yahoo.search(query);
    } catch (err) {
      console.warn('[StocksService] search error, trying Yahoo Finance:', (err as Error).message);
      try {
        return await this.yahoo.search(query);
      } catch {
        return this.mock.search(query);
      }
    }
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const cached = getCachedQuote(symbol);
    if (cached) return cached;

    // Always try Yahoo Finance first for real prices
    try {
      const quote = await this.yahoo.quote(symbol);
      setCachedQuote(symbol, quote);
      return quote;
    } catch (yfErr) {
      console.warn(`[StocksService] Yahoo Finance quote failed for ${symbol}:`, (yfErr as Error).message);
    }

    // If AlphaVantage is configured, try that as secondary
    if (!(this.provider instanceof YahooFinanceProvider)) {
      try {
        const quote = await this.provider.quote(symbol);
        setCachedQuote(symbol, quote);
        return quote;
      } catch (err) {
        console.warn('[StocksService] AlphaVantage quote error, using mock:', (err as Error).message);
      }
    }

    return this.mock.quote(symbol);
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const cached = getCachedHistory(symbol, timeframe);
    if (cached) return cached;

    // Prefer Yahoo Finance for history
    try {
      const bars = await this.yahoo.history(symbol, timeframe);
      if (bars.length > 0) {
        setCachedHistory(symbol, timeframe, bars);
        return bars;
      }
    } catch (yfErr) {
      console.warn(`[StocksService] Yahoo Finance history failed for ${symbol}:`, (yfErr as Error).message);
    }

    // Fall back to configured provider
    if (!(this.provider instanceof YahooFinanceProvider)) {
      try {
        const bars = await this.provider.history(symbol, timeframe);
        if (bars.length > 0) {
          setCachedHistory(symbol, timeframe, bars);
          return bars;
        }
      } catch (err) {
        console.warn('[StocksService] history error, falling back to mock:', (err as Error).message);
      }
    }

    return this.mock.history(symbol, timeframe);
  }
}

export const stocksService = new StocksService();
