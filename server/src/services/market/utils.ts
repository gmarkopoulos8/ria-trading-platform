import { OHLCVBar, Timeframe } from './types';

export function roundTo(n: number, decimals = 2): number {
  return Math.round(n * 10 ** decimals) / 10 ** decimals;
}

export function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function generateMockOHLCV(
  startPrice: number,
  bars: number,
  startDate: Date,
  intervalMs: number,
  volatility = 0.02
): OHLCVBar[] {
  const result: OHLCVBar[] = [];
  let price = startPrice;
  for (let i = 0; i < bars; i++) {
    const change = price * volatility * (Math.random() - 0.48);
    const open = roundTo(price);
    const close = roundTo(Math.max(0.01, price + change));
    const high = roundTo(Math.max(open, close) * (1 + Math.random() * 0.01));
    const low = roundTo(Math.min(open, close) * (1 - Math.random() * 0.01));
    const volume = Math.round(randomBetween(500_000, 5_000_000));
    result.push({
      timestamp: new Date(startDate.getTime() + i * intervalMs),
      open,
      high,
      low,
      close,
      volume,
    });
    price = close;
  }
  return result;
}

export function getHistoryParams(timeframe: Timeframe): { bars: number; intervalMs: number } {
  switch (timeframe) {
    case '1D':
      return { bars: 390, intervalMs: 60 * 1000 };
    case '1W':
      return { bars: 7 * 24, intervalMs: 60 * 60 * 1000 };
    case '1M':
      return { bars: 30, intervalMs: 24 * 60 * 60 * 1000 };
    case '3M':
      return { bars: 90, intervalMs: 24 * 60 * 60 * 1000 };
    case '6M':
      return { bars: 180, intervalMs: 24 * 60 * 60 * 1000 };
    case '1Y':
      return { bars: 252, intervalMs: 24 * 60 * 60 * 1000 };
    case '5Y':
      return { bars: 60, intervalMs: 30 * 24 * 60 * 60 * 1000 };
    default:
      return { bars: 30, intervalMs: 24 * 60 * 60 * 1000 };
  }
}

export function getStartDate(timeframe: Timeframe): Date {
  const now = new Date();
  const { bars, intervalMs } = getHistoryParams(timeframe);
  return new Date(now.getTime() - bars * intervalMs);
}

export function safeParseFloat(val: unknown, fallback = 0): number {
  const n = parseFloat(String(val));
  return isNaN(n) ? fallback : n;
}

export function pctChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return roundTo(((current - previous) / Math.abs(previous)) * 100, 4);
}

export function normalizeSymbol(s: string): string {
  return s.toUpperCase().trim();
}

export function isCryptoSymbol(symbol: string): boolean {
  const KNOWN_CRYPTO = new Set([
    'BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'AVAX', 'DOGE', 'DOT',
    'MATIC', 'SHIB', 'LTC', 'LINK', 'UNI', 'ATOM', 'XLM', 'ALGO', 'FIL',
    'VET', 'ICP', 'NEAR', 'APT', 'ARB', 'OP', 'SUI', 'PEPE', 'WIF', 'BONK',
  ]);
  return KNOWN_CRYPTO.has(symbol.toUpperCase());
}
