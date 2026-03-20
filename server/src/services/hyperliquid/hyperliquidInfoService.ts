import axios from 'axios';
import { HL_CONFIG, hasCredentials } from './hyperliquidConfig';

const client = axios.create({
  timeout: HL_CONFIG.REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

async function postInfo<T>(body: object): Promise<T> {
  const { data } = await client.post<T>(`${HL_CONFIG.API_URL}/info`, body);
  return data;
}

// ─── Market Data (public, no auth) ───────────────────────────────

export interface AssetMeta {
  name: string;
  szDecimals: number;
  maxLeverage: number;
  marginTableId: number;
}

export interface UniverseMeta {
  universe: AssetMeta[];
}

export interface AllMids {
  [asset: string]: string;
}

export interface CandleSnap {
  t: number; T: number; s: string; i: string;
  o: string; c: string; h: string; l: string; v: string; n: number;
}

export async function getMeta(): Promise<UniverseMeta> {
  return postInfo<UniverseMeta>({ type: 'meta' });
}

export async function getAllMids(): Promise<AllMids> {
  return postInfo<AllMids>({ type: 'allMids' });
}

export async function getAssetPrice(asset: string): Promise<number | null> {
  const mids = await getAllMids();
  const key = Object.keys(mids).find((k) => k.toUpperCase() === asset.toUpperCase());
  return key ? parseFloat(mids[key]) : null;
}

export async function getCandles(asset: string, interval = '1h', startMs?: number, endMs?: number): Promise<CandleSnap[]> {
  try {
    const req: Record<string, unknown> = { type: 'candleSnapshot', req: { coin: asset, interval, startTime: startMs ?? Date.now() - 86_400_000 } };
    if (endMs) (req.req as any).endTime = endMs;
    return postInfo<CandleSnap[]>(req);
  } catch {
    return [];
  }
}

export async function get1MinCandles(asset: string, count = 60): Promise<CandleSnap[]> {
  const endMs   = Date.now();
  const startMs = endMs - count * 60_000;
  try {
    return await getCandles(asset, '1m', startMs, endMs);
  } catch {
    try { return await getCandles(asset, '3m', startMs - count * 2 * 60_000, endMs); }
    catch { return []; }
  }
}

export function candleSnapToOHLCV(snap: CandleSnap): import('../technical/types').OHLCVBar {
  return {
    timestamp: new Date(snap.t),
    open:      parseFloat(snap.o),
    high:      parseFloat(snap.h),
    low:       parseFloat(snap.l),
    close:     parseFloat(snap.c),
    volume:    parseFloat(snap.v),
  };
}

// ─── User State (requires wallet address) ────────────────────────

export interface Position {
  coin: string;
  szi: string;
  entryPx: string | null;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  liquidationPx: string | null;
  leverage: { type: string; value: number; rawUsd: string };
  maxLeverage: number;
  marginUsed: string;
  cumFunding: { allTime: string; sinceOpen: string; sinceChange: string };
}

export interface UserState {
  marginSummary: {
    accountValue: string;
    totalNtlPos: string;
    totalRawUsd: string;
    totalMarginUsed: string;
  };
  crossMaintenanceMarginUsed: string;
  withdrawable: string;
  assetPositions: Array<{ position: Position; type: string }>;
  time: number;
}

export interface OpenOrder {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  triggerCondition: string;
  isTrigger: boolean;
  triggerPx: string;
  cloid: string | null;
  isPositionTpsl: boolean;
  orderType: string;
}

export interface UserFill {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  liquidationMarkPx: string | null;
  tid: number;
  cloid: string | null;
}

export async function getUserState(address?: string): Promise<UserState | null> {
  const addr = address ?? HL_CONFIG.WALLET_ADDRESS;
  if (!addr || !addr.startsWith('0x')) return null;
  try {
    return postInfo<UserState>({ type: 'clearinghouseState', user: addr });
  } catch (err) {
    console.error('[HL-Info] getUserState error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getOpenOrders(address?: string): Promise<OpenOrder[]> {
  const addr = address ?? HL_CONFIG.WALLET_ADDRESS;
  if (!addr || !addr.startsWith('0x')) return [];
  try {
    return postInfo<OpenOrder[]>({ type: 'openOrders', user: addr });
  } catch {
    return [];
  }
}

export async function getUserFills(address?: string, limit = 50): Promise<UserFill[]> {
  const addr = address ?? HL_CONFIG.WALLET_ADDRESS;
  if (!addr || !addr.startsWith('0x')) return [];
  try {
    const fills = await postInfo<UserFill[]>({ type: 'userFills', user: addr });
    return Array.isArray(fills) ? fills.slice(0, limit) : [];
  } catch {
    return [];
  }
}

export async function getDrawdownPct(userState: UserState | null): Promise<number> {
  if (!userState) return 0;
  const unrealizedPnlTotal = userState.assetPositions.reduce((sum, ap) => {
    return sum + parseFloat(ap.position.unrealizedPnl ?? '0');
  }, 0);
  const accountValue = parseFloat(userState.marginSummary.accountValue ?? '0');
  if (accountValue <= 0) return 0;
  const drawdown = -(unrealizedPnlTotal / accountValue) * 100;
  return Math.max(0, drawdown);
}

// ─── Funding Rate ─────────────────────────────────────────────────

interface AssetContext {
  funding: string;
  openInterest: string;
  prevDayPx: string;
  dayNtlVlm: string;
  premium: string;
  oraclePx: string;
  markPx: string;
  midPx: string | null;
  impactPxs: string[] | null;
}

const _fundingCache = new Map<string, { rate: number; annualized: number; ts: number }>();
const FUNDING_TTL = 5 * 60 * 1000;

export async function getFundingRate(asset: string): Promise<{ rate: number; annualized: number } | null> {
  const cached = _fundingCache.get(asset.toUpperCase());
  if (cached && Date.now() - cached.ts < FUNDING_TTL) {
    return { rate: cached.rate, annualized: cached.annualized };
  }
  try {
    const data = await postInfo<[UniverseMeta, AssetContext[]]>({ type: 'metaAndAssetCtxs' });
    const [meta, contexts] = data;
    const idx = meta.universe.findIndex((a) => a.name.toUpperCase() === asset.toUpperCase());
    if (idx === -1) return null;
    const ctx = contexts[idx];
    const rate = parseFloat(ctx?.funding ?? '0');
    const annualized = rate * 3 * 365 * 100;
    _fundingCache.set(asset.toUpperCase(), { rate, annualized, ts: Date.now() });
    return { rate, annualized };
  } catch {
    return null;
  }
}

// ─── Asset index lookup ───────────────────────────────────────────

let _metaCache: UniverseMeta | null = null;
let _metaCacheTime = 0;

export async function getAssetIndex(coin: string): Promise<number> {
  const now = Date.now();
  if (!_metaCache || now - _metaCacheTime > 300_000) {
    _metaCache = await getMeta();
    _metaCacheTime = now;
  }
  const idx = _metaCache.universe.findIndex((a) => a.name.toUpperCase() === coin.toUpperCase());
  if (idx < 0) throw new Error(`Asset "${coin}" not found in Hyperliquid universe`);
  return idx;
}
