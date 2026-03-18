import { IStocksProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe } from '../types';
import { AlphaVantageProvider } from './AlphaVantageProvider';
import { MockStocksProvider } from './MockStocksProvider';
import { getCachedQuote, setCachedQuote, getCachedHistory, setCachedHistory } from '../cache';

function createProvider(): IStocksProvider {
  const key = process.env.STOCKS_API_KEY;
  if (key && key.trim().length > 0) {
    console.log('[StocksService] Using Alpha Vantage provider');
    return new AlphaVantageProvider(key.trim());
  }
  console.log('[StocksService] No STOCKS_API_KEY — using mock provider');
  return new MockStocksProvider();
}

class StocksService {
  private provider: IStocksProvider;
  private mock: MockStocksProvider;

  constructor() {
    this.provider = createProvider();
    this.mock = new MockStocksProvider();
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      return await this.provider.search(query);
    } catch (err) {
      console.warn('[StocksService] search error, falling back to mock:', (err as Error).message);
      return this.mock.search(query);
    }
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const cached = getCachedQuote(symbol);
    if (cached) return cached;

    try {
      const quote = await this.provider.quote(symbol);
      setCachedQuote(symbol, quote);
      return quote;
    } catch (err) {
      console.warn('[StocksService] quote error, falling back to mock:', (err as Error).message);
      return this.mock.quote(symbol);
    }
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const cached = getCachedHistory(symbol, timeframe);
    if (cached) return cached;

    try {
      const bars = await this.provider.history(symbol, timeframe);
      setCachedHistory(symbol, timeframe, bars);
      return bars;
    } catch (err) {
      console.warn('[StocksService] history error, falling back to mock:', (err as Error).message);
      return this.mock.history(symbol, timeframe);
    }
  }
}

export const stocksService = new StocksService();
