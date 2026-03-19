import axios from 'axios';
import { prisma } from '../../lib/prisma';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface EarningsEvent {
  ticker: string;
  reportDate: Date;
  epsEstimate: number | null;
  revenueEstimate: number | null;
  quarter: number | null;
  year: number | null;
}

const cache = new Map<string, { data: EarningsEvent[]; ts: number }>();

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getUpcomingEarnings(tickers: string[], daysAhead = 7): Promise<EarningsEvent[]> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  const today = new Date();
  const end = new Date(Date.now() + daysAhead * 86_400_000);
  const cacheKey = `${fmt(today)}-${daysAhead}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data.filter((e) => tickers.includes(e.ticker));
  }

  try {
    const { data } = await axios.get(`${FINNHUB_BASE}/calendar/earnings`, {
      params: { from: fmt(today), to: fmt(end), token: key },
      timeout: 8000,
    });

    const all: EarningsEvent[] = [];
    if (data?.earningsCalendar) {
      for (const item of data.earningsCalendar) {
        all.push({
          ticker: item.symbol,
          reportDate: new Date(item.date),
          epsEstimate: item.epsEstimate ?? null,
          revenueEstimate: item.revenueEstimate ?? null,
          quarter: item.quarter ?? null,
          year: item.year ?? null,
        });
      }
    }

    cache.set(cacheKey, { data: all, ts: Date.now() });

    const filtered = all.filter((e) => tickers.includes(e.ticker));

    // Persist to DB (upsert to avoid duplicates)
    for (const ev of filtered) {
      try {
        await prisma.earningsEvent.upsert({
          where: { ticker_reportDate: { ticker: ev.ticker, reportDate: ev.reportDate } },
          update: { epsEstimate: ev.epsEstimate ?? undefined, revenueEstimate: ev.revenueEstimate ?? undefined },
          create: {
            ticker: ev.ticker,
            reportDate: ev.reportDate,
            epsEstimate: ev.epsEstimate ?? undefined,
            revenueEstimate: ev.revenueEstimate ?? undefined,
            quarter: ev.quarter ?? undefined,
            year: ev.year ?? undefined,
          },
        });
      } catch { }
    }

    return filtered;
  } catch (err) {
    console.warn('[EarningsCalendar] Fetch error:', err instanceof Error ? err.message : err);
    return [];
  }
}

const riskCache = new Map<string, { result: boolean; ts: number }>();

export async function hasEarningsRisk(ticker: string, daysAhead = 5): Promise<boolean> {
  const cacheKey = `${ticker}-${daysAhead}`;
  const cached = riskCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

  const upcoming = await getUpcomingEarnings([ticker], daysAhead);
  const result = upcoming.length > 0;
  riskCache.set(cacheKey, { result, ts: Date.now() });
  return result;
}
