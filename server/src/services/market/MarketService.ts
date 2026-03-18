import { stocksService } from './stocks/StocksService';
import { cryptoService } from './crypto/CryptoService';
import { MockStocksProvider } from './stocks/MockStocksProvider';
import { MockCryptoProvider } from './crypto/MockCryptoProvider';
import {
  SearchResult, NormalizedQuote, OHLCVBar, Timeframe, AssetClass,
} from './types';
import { isCryptoSymbol } from './utils';

export interface UnifiedSearchResult extends SearchResult {
  assetClass: AssetClass;
}

class MarketService {
  private mockStocks = new MockStocksProvider();
  private mockCrypto = new MockCryptoProvider();

  detectAssetClass(symbol: string): AssetClass {
    return isCryptoSymbol(symbol) ? 'crypto' : 'stock';
  }

  async search(query: string): Promise<UnifiedSearchResult[]> {
    const [stocks, cryptos] = await Promise.allSettled([
      stocksService.search(query),
      cryptoService.search(query),
    ]);

    const results: UnifiedSearchResult[] = [];

    if (stocks.status === 'fulfilled') {
      results.push(...stocks.value.map((r) => ({ ...r, assetClass: r.assetClass })));
    }
    if (cryptos.status === 'fulfilled') {
      cryptos.value.forEach((r) => {
        if (!results.some((x) => x.symbol === r.symbol)) {
          results.push({ ...r, assetClass: 'crypto' });
        }
      });
    }

    return results;
  }

  async quote(symbol: string, assetClass?: AssetClass): Promise<NormalizedQuote> {
    const cls = assetClass ?? this.detectAssetClass(symbol);
    if (cls === 'crypto') {
      return cryptoService.quote(symbol);
    }
    return stocksService.quote(symbol);
  }

  async history(
    symbol: string,
    timeframe: Timeframe,
    assetClass?: AssetClass
  ): Promise<OHLCVBar[]> {
    const cls = assetClass ?? this.detectAssetClass(symbol);
    if (cls === 'crypto') {
      return cryptoService.history(symbol, timeframe);
    }
    return stocksService.history(symbol, timeframe);
  }

  async getScanOpportunities(
    assetClass?: AssetClass,
    limit = 20
  ): Promise<NormalizedQuote[]> {
    const stockSymbols = ['NVDA', 'AMD', 'TSLA', 'PLTR', 'SMCI', 'MARA', 'COIN', 'SOFI', 'AFRM', 'RIOT'];
    const cryptoSymbols = ['BTC', 'ETH', 'SOL', 'ARB', 'NEAR', 'AVAX', 'LINK', 'MATIC'];

    const toFetch: Array<{ symbol: string; cls: AssetClass }> = [];

    if (!assetClass || assetClass === 'stock') {
      stockSymbols.forEach((s) => toFetch.push({ symbol: s, cls: 'stock' }));
    }
    if (!assetClass || assetClass === 'crypto') {
      cryptoSymbols.forEach((s) => toFetch.push({ symbol: s, cls: 'crypto' }));
    }

    const results = await Promise.allSettled(
      toFetch.slice(0, limit).map(({ symbol, cls }) => this.quote(symbol, cls))
    );

    return results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<NormalizedQuote>).value);
  }
}

export const marketService = new MarketService();
