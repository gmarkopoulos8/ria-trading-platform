import axios from 'axios';
import { prisma } from '../../lib/prisma';

const GAMMA = process.env.POLY_GAMMA_BASE_URL ?? 'https://gamma-api.polymarket.com';
const CLOB  = process.env.POLY_CLOB_BASE_URL  ?? 'https://clob.polymarket.com';

const gamma = axios.create({ baseURL: GAMMA, timeout: 12_000 });
const clob  = axios.create({ baseURL: CLOB,  timeout: 12_000 });

export interface PolyMarketRaw {
  id: string;
  slug?: string;
  question: string;
  description?: string;
  category?: string;
  conditionId?: string;
  outcomes: string;
  outcomePrices: string;
  volume?: number | string;
  liquidity?: number | string;
  active?: boolean;
  closed?: boolean;
  archived?: boolean;
  endDate?: string;
  image?: string;
  events?: PolyEventRaw[];
}

export interface PolyEventRaw {
  id: string;
  slug?: string;
  title?: string;
  description?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  closed?: boolean;
  image?: string;
}

export interface NormalizedMarket {
  id: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  conditionId: string;
  outcomes: string[];
  outcomePrices: number[];
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  endDate: string | null;
  imageUrl: string;
  eventId: string | null;
  eventTitle: string | null;
  eventCategory: string | null;
}

export interface MarketListFilters {
  keyword?: string;
  category?: string;
  status?: 'active' | 'closed' | 'all';
  minLiquidity?: number;
  minVolume?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'volume' | 'liquidity' | 'endDate';
}

function parseJson<T>(val: string | T): T {
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return [] as unknown as T; }
  }
  return val;
}

function normalizeMarket(m: PolyMarketRaw): NormalizedMarket {
  const outcomes: string[] = parseJson<string[]>(m.outcomes as unknown as string);
  const rawPrices = parseJson<Array<string | number>>(m.outcomePrices as unknown as string);
  const outcomePrices: number[] = rawPrices.map((p) => parseFloat(String(p)));
  const yesPrice  = outcomePrices[0] ?? 0;
  const noPrice   = outcomePrices[1] ?? (1 - yesPrice);
  const evt       = m.events?.[0];

  return {
    id: m.id,
    slug: m.slug ?? '',
    question: m.question,
    description: m.description ?? '',
    category: m.category ?? evt?.category ?? 'General',
    conditionId: m.conditionId ?? '',
    outcomes,
    outcomePrices,
    yesPrice,
    noPrice,
    volume: parseFloat(String(m.volume ?? 0)),
    liquidity: parseFloat(String(m.liquidity ?? 0)),
    active: m.active !== false,
    closed: m.closed === true,
    archived: m.archived === true,
    endDate: m.endDate ?? null,
    imageUrl: m.image ?? '',
    eventId: evt?.id ?? null,
    eventTitle: evt?.title ?? null,
    eventCategory: evt?.category ?? null,
  };
}

export async function fetchMarkets(filters: MarketListFilters = {}): Promise<NormalizedMarket[]> {
  const {
    keyword, category, status = 'active',
    minLiquidity, minVolume,
    limit = 50, offset = 0,
    sortBy = 'volume',
  } = filters;

  const params: Record<string, unknown> = {
    limit: Math.min(limit, 200),
    offset,
    order: sortBy === 'volume' ? 'volume' : sortBy === 'liquidity' ? 'liquidity' : 'endDate',
    ascending: false,
  };
  if (keyword) params.keyword = keyword;
  if (category) params.category = category;
  if (status === 'active')  { params.active = true;  params.closed = false; }
  if (status === 'closed')  { params.active = false; params.closed = true;  }
  if (minLiquidity) params.liquidity_num_min = minLiquidity;
  if (minVolume)    params.volume_num_min    = minVolume;

  try {
    const { data } = await gamma.get<PolyMarketRaw[]>('/markets', { params });
    const markets = Array.isArray(data) ? data : [];
    return markets.map(normalizeMarket);
  } catch (err) {
    console.error('[PolymarketMarketService] fetchMarkets error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchMarket(id: string): Promise<NormalizedMarket | null> {
  try {
    const { data } = await gamma.get<PolyMarketRaw>(`/markets/${id}`);
    if (!data?.id) return null;
    const nm = normalizeMarket(data);

    await upsertMarket(nm, data);
    return nm;
  } catch (err) {
    console.error('[PolymarketMarketService] fetchMarket error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function fetchEvent(eventId: string) {
  try {
    const { data } = await gamma.get(`/events/${eventId}`);
    return data;
  } catch {
    return null;
  }
}

export async function fetchRelatedMarkets(eventId: string): Promise<NormalizedMarket[]> {
  try {
    const { data } = await gamma.get<PolyMarketRaw[]>('/markets', { params: { event_id: eventId, limit: 20 } });
    return Array.isArray(data) ? data.map(normalizeMarket) : [];
  } catch {
    return [];
  }
}

async function upsertMarket(nm: NormalizedMarket, raw: PolyMarketRaw) {
  try {
    if (nm.eventId) {
      const evt = raw.events?.[0];
      if (evt) {
        await prisma.polymarketEvent.upsert({
          where: { id: nm.eventId },
          create: {
            id: nm.eventId,
            slug: evt.slug,
            title: evt.title ?? 'Untitled Event',
            description: evt.description,
            category: evt.category,
            endDate: evt.endDate ? new Date(evt.endDate) : undefined,
            closed: evt.closed ?? false,
            imageUrl: evt.image,
            rawPayload: evt as object,
          },
          update: { title: evt.title ?? 'Untitled Event', closed: evt.closed ?? false },
        });
      }
    }

    await prisma.polymarketMarket.upsert({
      where: { id: nm.id },
      create: {
        id: nm.id,
        eventId: nm.eventId,
        slug: nm.slug,
        question: nm.question,
        description: nm.description,
        category: nm.category,
        conditionId: nm.conditionId,
        outcomes: nm.outcomes,
        outcomePrices: nm.outcomePrices,
        volume: nm.volume,
        liquidity: nm.liquidity,
        active: nm.active,
        closed: nm.closed,
        archived: nm.archived,
        endDate: nm.endDate ? new Date(nm.endDate) : undefined,
        imageUrl: nm.imageUrl,
        rawPayload: raw as object,
      },
      update: {
        volume: nm.volume,
        liquidity: nm.liquidity,
        outcomePrices: nm.outcomePrices,
        active: nm.active,
        closed: nm.closed,
      },
    });
  } catch (err) {
    console.warn('[PolymarketMarketService] upsertMarket:', err instanceof Error ? err.message : err);
  }
}

export async function recordSearch(userId: string, market: NormalizedMarket, healthScore?: number, actionLabel?: string) {
  await prisma.polymarketSearchHistory.upsert({
    where: { userId_marketId: { userId, marketId: market.id } },
    create: {
      userId,
      marketId: market.id,
      question: market.question,
      lastHealthScore: healthScore,
      lastActionLabel: actionLabel,
      searchCount: 1,
    },
    update: {
      lastHealthScore: healthScore ?? undefined,
      lastActionLabel: actionLabel ?? undefined,
      searchCount: { increment: 1 },
      lastSearchedAt: new Date(),
    },
  });
}
