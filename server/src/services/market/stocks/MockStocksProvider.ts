import {
  IStocksProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe,
} from '../types';
import {
  generateMockOHLCV, getHistoryParams, getStartDate, randomBetween, roundTo,
} from '../utils';

const MOCK_STOCKS: Record<string, { name: string; price: number; exchange: string }> = {
  AAPL: { name: 'Apple Inc', price: 189.30, exchange: 'NASDAQ' },
  NVDA: { name: 'NVIDIA Corporation', price: 875.40, exchange: 'NASDAQ' },
  TSLA: { name: 'Tesla Inc', price: 245.50, exchange: 'NASDAQ' },
  AMD:  { name: 'Advanced Micro Devices', price: 178.20, exchange: 'NASDAQ' },
  MSFT: { name: 'Microsoft Corporation', price: 420.15, exchange: 'NASDAQ' },
  GOOG: { name: 'Alphabet Inc', price: 175.80, exchange: 'NASDAQ' },
  META: { name: 'Meta Platforms Inc', price: 510.30, exchange: 'NASDAQ' },
  AMZN: { name: 'Amazon.com Inc', price: 195.20, exchange: 'NASDAQ' },
  PLTR: { name: 'Palantir Technologies', price: 27.90, exchange: 'NYSE' },
  SOFI: { name: 'SoFi Technologies', price: 8.40, exchange: 'NASDAQ' },
  SMCI: { name: 'Super Micro Computer', price: 870.20, exchange: 'NASDAQ' },
  MARA: { name: 'Marathon Digital Holdings', price: 18.70, exchange: 'NASDAQ' },
  RIOT: { name: 'Riot Platforms Inc', price: 12.30, exchange: 'NASDAQ' },
  GME:  { name: 'GameStop Corp', price: 13.80, exchange: 'NYSE' },
  SPY:  { name: 'SPDR S&P 500 ETF', price: 520.40, exchange: 'NYSE' },
  QQQ:  { name: 'Invesco QQQ ETF', price: 447.90, exchange: 'NASDAQ' },
};

const MOCK_SEARCH_EXTRAS: SearchResult[] = [
  { symbol: 'INTC', name: 'Intel Corporation', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'BA',   name: 'Boeing Company', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'DIS',  name: 'Walt Disney Company', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'NFLX', name: 'Netflix Inc', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'CRM',  name: 'Salesforce Inc', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'SNOW', name: 'Snowflake Inc', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'UBER', name: 'Uber Technologies', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'COIN', name: 'Coinbase Global Inc', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD' },
  { symbol: 'PATH', name: 'UiPath Inc', assetClass: 'stock', exchange: 'NYSE', currency: 'USD' },
  { symbol: 'AFRM', name: 'Affirm Holdings', assetClass: 'stock', exchange: 'NASDAQ', currency: 'USD' },
];

export class MockStocksProvider implements IStocksProvider {
  async search(query: string): Promise<SearchResult[]> {
    const q = query.toLowerCase();
    const all = [
      ...Object.entries(MOCK_STOCKS).map(([symbol, info]) => ({
        symbol,
        name: info.name,
        assetClass: 'stock' as const,
        exchange: info.exchange,
        currency: 'USD',
      })),
      ...MOCK_SEARCH_EXTRAS,
    ];
    return all
      .filter(
        (s) =>
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q)
      )
      .slice(0, 10);
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const sym = symbol.toUpperCase();
    const info = MOCK_STOCKS[sym] ?? { name: `${sym} Corp`, price: 50 + Math.random() * 200, exchange: 'NASDAQ' };
    const noise = randomBetween(-0.04, 0.06);
    const price = roundTo(info.price * (1 + noise / 10));
    const previousClose = roundTo(info.price);
    const change = roundTo(price - previousClose);
    const changePercent = roundTo((change / previousClose) * 100, 4);

    return {
      symbol: sym,
      name: info.name,
      price,
      open: roundTo(previousClose * (1 + randomBetween(-0.005, 0.01))),
      high: roundTo(Math.max(price, previousClose) * (1 + randomBetween(0, 0.015))),
      low: roundTo(Math.min(price, previousClose) * (1 - randomBetween(0, 0.015))),
      previousClose,
      change,
      changePercent,
      volume: Math.round(randomBetween(5_000_000, 80_000_000)),
      marketCap: Math.round(price * randomBetween(1e9, 3e12)),
      high52Week: roundTo(price * randomBetween(1.1, 1.8)),
      low52Week: roundTo(price * randomBetween(0.4, 0.85)),
      currency: 'USD',
      assetClass: 'stock',
      exchange: info.exchange,
      timestamp: new Date(),
      isMock: true,
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const sym = symbol.toUpperCase();
    const info = MOCK_STOCKS[sym] ?? { price: 100 };
    const { bars, intervalMs } = getHistoryParams(timeframe);
    const startDate = getStartDate(timeframe);
    return generateMockOHLCV(info.price, bars, startDate, intervalMs, 0.025);
  }
}
