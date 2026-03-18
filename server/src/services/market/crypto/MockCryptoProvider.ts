import {
  ICryptoProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe,
} from '../types';
import {
  generateMockOHLCV, getHistoryParams, getStartDate, randomBetween, roundTo,
} from '../utils';

const MOCK_CRYPTOS: Record<string, { name: string; price: number; coinId: string }> = {
  BTC:  { name: 'Bitcoin', price: 67_200, coinId: 'bitcoin' },
  ETH:  { name: 'Ethereum', price: 3_450, coinId: 'ethereum' },
  BNB:  { name: 'BNB', price: 590, coinId: 'binancecoin' },
  SOL:  { name: 'Solana', price: 182, coinId: 'solana' },
  XRP:  { name: 'XRP', price: 0.62, coinId: 'ripple' },
  ADA:  { name: 'Cardano', price: 0.59, coinId: 'cardano' },
  AVAX: { name: 'Avalanche', price: 40.50, coinId: 'avalanche-2' },
  DOGE: { name: 'Dogecoin', price: 0.165, coinId: 'dogecoin' },
  DOT:  { name: 'Polkadot', price: 9.80, coinId: 'polkadot' },
  LINK: { name: 'Chainlink', price: 18.70, coinId: 'chainlink' },
  MATIC:{ name: 'Polygon', price: 0.98, coinId: 'matic-network' },
  NEAR: { name: 'NEAR Protocol', price: 6.20, coinId: 'near' },
  ARB:  { name: 'Arbitrum', price: 1.40, coinId: 'arbitrum' },
  OP:   { name: 'Optimism', price: 3.10, coinId: 'optimism' },
  PEPE: { name: 'Pepe', price: 0.0000142, coinId: 'pepe' },
};

export class MockCryptoProvider implements ICryptoProvider {
  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    return Object.entries(MOCK_CRYPTOS)
      .filter(
        ([symbol, info]) =>
          symbol.toLowerCase().includes(q) ||
          info.name.toLowerCase().includes(q) ||
          info.coinId.toLowerCase().includes(q)
      )
      .map(([symbol, info]) => ({
        symbol,
        name: info.name,
        assetClass: 'crypto' as const,
        currency: 'USD',
        description: info.coinId,
      }))
      .slice(0, 10);
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const sym = symbol.toUpperCase();
    const info = MOCK_CRYPTOS[sym] ?? { name: `${sym}`, price: 1.0 + Math.random() * 100 };
    const noise = randomBetween(-0.06, 0.08);
    const price = roundTo(info.price * (1 + noise / 10), info.price < 0.01 ? 8 : info.price < 1 ? 6 : 2);
    const previousClose = roundTo(info.price, info.price < 0.01 ? 8 : 4);
    const change = roundTo(price - previousClose, 4);
    const changePercent = roundTo((change / previousClose) * 100, 4);

    return {
      symbol: sym,
      name: info.name,
      price,
      open: roundTo(previousClose * (1 + randomBetween(-0.01, 0.02)), 4),
      high: roundTo(Math.max(price, previousClose) * (1 + randomBetween(0, 0.025)), 4),
      low: roundTo(Math.min(price, previousClose) * (1 - randomBetween(0, 0.025)), 4),
      previousClose,
      change,
      changePercent,
      volume: Math.round(randomBetween(500_000_000, 20_000_000_000)),
      marketCap: Math.round(price * randomBetween(1e9, 1.5e12)),
      currency: 'USD',
      assetClass: 'crypto',
      timestamp: new Date(),
      isMock: true,
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const sym = symbol.toUpperCase();
    const info = MOCK_CRYPTOS[sym] ?? { price: 100 };
    const { bars, intervalMs } = getHistoryParams(timeframe);
    const startDate = getStartDate(timeframe);
    return generateMockOHLCV(info.price, bars, startDate, intervalMs, 0.04);
  }
}
