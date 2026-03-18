import { ICryptoProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe } from '../types';
import { CoinGeckoProvider } from './CoinGeckoProvider';
import { MockCryptoProvider } from './MockCryptoProvider';
import { getCachedQuote, setCachedQuote, getCachedHistory, setCachedHistory } from '../cache';

function createProvider(): ICryptoProvider {
  const key = process.env.CRYPTO_API_KEY;
  console.log('[CryptoService] Using CoinGecko provider' + (key ? ' (with API key)' : ' (free tier)'));
  return new CoinGeckoProvider(key?.trim());
}

class CryptoService {
  private provider: ICryptoProvider;
  private mock: MockCryptoProvider;

  constructor() {
    this.provider = createProvider();
    this.mock = new MockCryptoProvider();
  }

  async search(query: string): Promise<SearchResult[]> {
    try {
      return await this.provider.search(query);
    } catch (err) {
      console.warn('[CryptoService] search error, falling back to mock:', (err as Error).message);
      return this.mock.search(query);
    }
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const cacheKey = `CRYPTO:${symbol}`;
    const cached = getCachedQuote(cacheKey);
    if (cached) return cached;

    try {
      const quote = await this.provider.quote(symbol);
      setCachedQuote(cacheKey, quote);
      return quote;
    } catch (err) {
      console.warn('[CryptoService] quote error, falling back to mock:', (err as Error).message);
      return this.mock.quote(symbol);
    }
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const cacheKey = `CRYPTO:${symbol}`;
    const cached = getCachedHistory(cacheKey, timeframe);
    if (cached) return cached;

    try {
      const bars = await this.provider.history(symbol, timeframe);
      setCachedHistory(cacheKey, timeframe, bars);
      return bars;
    } catch (err) {
      console.warn('[CryptoService] history error, falling back to mock:', (err as Error).message);
      return this.mock.history(symbol, timeframe);
    }
  }
}

export const cryptoService = new CryptoService();
