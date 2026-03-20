import prisma from '../../lib/prisma';
import { NormalizedQuote, OHLCVBar, Timeframe } from './types';

const QUOTE_TTL_MS = 5 * 60 * 1000;
const HISTORY_TTL_MS = 60 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const quoteCache = new Map<string, CacheEntry<NormalizedQuote>>();
const historyCache = new Map<string, CacheEntry<OHLCVBar[]>>();

export function getCachedQuote(symbol: string): NormalizedQuote | null {
  const entry = quoteCache.get(symbol);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    quoteCache.delete(symbol);
    return null;
  }
  return entry.value;
}

export function setCachedQuote(symbol: string, quote: NormalizedQuote): void {
  quoteCache.set(symbol, { value: quote, expiresAt: Date.now() + QUOTE_TTL_MS });
  persistSymbol(quote).catch(() => {});
}

export function getCachedHistory(symbol: string, timeframe: Timeframe): OHLCVBar[] | null {
  const key = `${symbol}:${timeframe}`;
  const entry = historyCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    historyCache.delete(key);
    return null;
  }
  return entry.value;
}

export function setCachedHistory(
  symbol: string,
  timeframe: Timeframe,
  bars: OHLCVBar[]
): void {
  const key = `${symbol}:${timeframe}`;
  historyCache.set(key, { value: bars, expiresAt: Date.now() + HISTORY_TTL_MS });
}

async function persistSymbol(quote: NormalizedQuote): Promise<void> {
  try {
    const assetClass =
      quote.assetClass === 'crypto' ? 'CRYPTO' :
      quote.assetClass === 'etf' ? 'ETF' : 'STOCK';

    await prisma.symbol.upsert({
      where: { ticker: quote.symbol },
      create: {
        ticker:     quote.symbol,
        name:       quote.name ?? quote.symbol,
        assetClass: assetClass as 'STOCK' | 'CRYPTO' | 'ETF',
        exchange:   quote.exchange,
        isActive:   true,
      },
      update: {
        name:      quote.name ?? undefined,
        updatedAt: new Date(),
      },
    });
  } catch {
  }
}

export function getCacheStats(): { quotes: number; historyEntries: number } {
  return {
    quotes: quoteCache.size,
    historyEntries: historyCache.size,
  };
}
