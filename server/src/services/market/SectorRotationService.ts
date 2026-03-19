import { marketService } from './MarketService';

export const SECTOR_ETFS: Record<string, string> = {
  Technology: 'XLK',
  Financials: 'XLF',
  Energy: 'XLE',
  Healthcare: 'XLV',
  Industrials: 'XLI',
  'Consumer Discretionary': 'XLY',
  'Consumer Staples': 'XLP',
  'Real Estate': 'XLRE',
  Utilities: 'XLU',
  'Communication Services': 'XLC',
  Materials: 'XLB',
};

export interface SectorMomentum {
  sector: string;
  etf: string;
  fiveDayReturn: number;
  twentyDayReturn: number;
  relativeStrength: number;
  trend: 'LEADING' | 'NEUTRAL' | 'LAGGING';
}

export type SectorMomentumMap = Record<string, SectorMomentum>;

let momentumCache: { data: SectorMomentumMap; ts: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

function dailyReturns(prices: number[]): number[] {
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    rets.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }
  return rets;
}

function cumulativeReturn(prices: number[], days: number): number {
  if (prices.length < days + 1) return 0;
  const start = prices[prices.length - days - 1];
  const end = prices[prices.length - 1];
  if (start === 0) return 0;
  return ((end - start) / start) * 100;
}

export async function getSectorMomentum(): Promise<SectorMomentumMap> {
  if (momentumCache && Date.now() - momentumCache.ts < CACHE_TTL_MS) return momentumCache.data;

  const tickers = ['SPY', ...Object.values(SECTOR_ETFS)];
  const historyMap = new Map<string, number[]>();

  await Promise.allSettled(
    tickers.map(async (ticker) => {
      try {
oryMap.set(ticker, hist.map((h: any) => h.close ?? h.price ?? 0).filter(Boolean));
        }
      } catch { }
    })
  );

  const spyPrices = historyMap.get('SPY') ?? [];
  const spyReturns = dailyReturns(spyPrices);
  const spy20 = cumulativeReturn(spyPrices, 20) || 1;

  const result: SectorMomentumMap = {};

  for (const [sector, etf] of Object.entries(SECTOR_ETFS)) {
    const prices = historyMap.get(etf);
    if (!prices || prices.length < 5) {
      result[sector] = { sector, etf, fiveDayReturn: 0, twentyDayReturn: 0, relativeStrength: 1, trend: 'NEUTRAL' };
      continue;
    }

    const fiveDayReturn = cumulativeReturn(prices, 5);
    const twentyDayReturn = cumulativeReturn(prices, 20);
    const relativeStrength = spy20 !== 0 ? twentyDayReturn / Math.abs(spy20) : 1;
    const trend: 'LEADING' | 'NEUTRAL' | 'LAGGING' =
      relativeStrength > 1.2 ? 'LEADING' : relativeStrength < 0.8 ? 'LAGGING' : 'NEUTRAL';

    result[sector] = { sector, etf, fiveDayReturn, twentyDayReturn, relativeStrength, trend };
  }

  momentumCache = { data: result, ts: Date.now() };
  return result;
}

export async function getSectorBonus(ticker: string, sector: string): Promise<number> {
  try {
    const momentum = await getSectorMomentum();
    const sm = momentum[sector];
    if (!sm) return 0;
    return sm.trend === 'LEADING' ? 5 : sm.trend === 'LAGGING' ? -10 : 0;
  } catch {
    return 0;
  }
}
