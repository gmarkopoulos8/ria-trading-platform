import axios from 'axios';
import type { OptionContract, OptionsChain, IVRank } from './types';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';
const API_KEY = process.env.FINNHUB_API_KEY ?? '';

// Rate limiter (share tokens — 55 req/min)
let _tokens = 10;
let _lastRefill = Date.now();
function waitForToken(): Promise<void> {
  return new Promise((resolve) => {
    const attempt = () => {
      const now = Date.now();
      if (now - _lastRefill >= 60_000) { _tokens = 10; _lastRefill = now; }
      if (_tokens > 0) { _tokens--; resolve(); }
      else { setTimeout(attempt, 1000); }
    };
    attempt();
  });
}

const _chainCache = new Map<string, { chain: OptionsChain; ts: number }>();
const _ivCache = new Map<string, { ivRank: IVRank; ts: number }>();
const CHAIN_TTL = 15 * 60 * 1000;
const IV_TTL = 60 * 60 * 1000;

export function getDTE(expiration: string): number {
  const exp = new Date(expiration + 'T00:00:00Z');
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return Math.max(0, Math.round((exp.getTime() - now.getTime()) / 86_400_000));
}

export function getBidAskSpreadPct(contract: OptionContract): number {
  if (contract.mid <= 0) return 100;
  return ((contract.ask - contract.bid) / contract.mid) * 100;
}

export function filterByDTE(contracts: OptionContract[], minDTE: number, maxDTE: number): OptionContract[] {
  return contracts.filter((c) => c.dte >= minDTE && c.dte <= maxDTE);
}

export function filterByDelta(contracts: OptionContract[], minDelta: number, maxDelta: number): OptionContract[] {
  return contracts.filter((c) => c.delta !== null && Math.abs(c.delta) >= minDelta && Math.abs(c.delta) <= maxDelta);
}

export function filterByLiquidity(contracts: OptionContract[], minVolume: number, minOI: number): OptionContract[] {
  return contracts.filter((c) => c.volume >= minVolume && c.openInterest >= minOI);
}

interface FinnhubOptionEntry {
  contractSymbol?: string;
  expirationDate?: string;
  strike?: number;
  lastPrice?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  openInterest?: number;
  impliedVolatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  inTheMoney?: boolean;
}

interface FinnhubOptionsResponse {
  data?: Array<{
    expirationDate: string;
    options: {
      CALL?: FinnhubOptionEntry[];
      PUT?: FinnhubOptionEntry[];
    };
  }>;
}

function mapContract(entry: FinnhubOptionEntry, type: 'call' | 'put', expiration: string): OptionContract {
  const bid = entry.bid ?? 0;
  const ask = entry.ask ?? 0;
  const mid = (bid + ask) / 2;
  return {
    contractSymbol: entry.contractSymbol ?? `${expiration}${type[0].toUpperCase()}${entry.strike ?? 0}`,
    type,
    strike: entry.strike ?? 0,
    expiration,
    dte: getDTE(expiration),
    bid,
    ask,
    mid,
    last: entry.lastPrice ?? 0,
    volume: entry.volume ?? 0,
    openInterest: entry.openInterest ?? 0,
    impliedVolatility: entry.impliedVolatility ?? 0,
    delta: entry.delta ?? null,
    gamma: entry.gamma ?? null,
    theta: entry.theta ?? null,
    vega: entry.vega ?? null,
    inTheMoney: entry.inTheMoney ?? false,
  };
}

export async function getOptionsChain(ticker: string): Promise<OptionsChain | null> {
  const cached = _chainCache.get(ticker);
  if (cached && Date.now() - cached.ts < CHAIN_TTL) return cached.chain;

  if (!API_KEY) return null;

  try {
    await waitForToken();
    const { data } = await axios.get<FinnhubOptionsResponse>(
      `${FINNHUB_BASE}/stock/option-chain`,
      { params: { symbol: ticker, token: API_KEY }, timeout: 10000 },
    );

    if (!data?.data || data.data.length === 0) return null;

    const expirations: string[] = [];
    const calls: OptionContract[] = [];
    const puts: OptionContract[] = [];

    for (const expGroup of data.data) {
      const exp = expGroup.expirationDate;
      if (!expirations.includes(exp)) expirations.push(exp);

      for (const entry of expGroup.options?.CALL ?? []) {
        if ((entry.volume ?? 0) < 10 || (entry.openInterest ?? 0) < 50 || (entry.bid ?? 0) === 0) continue;
        calls.push(mapContract(entry, 'call', exp));
      }
      for (const entry of expGroup.options?.PUT ?? []) {
        if ((entry.volume ?? 0) < 10 || (entry.openInterest ?? 0) < 50 || (entry.bid ?? 0) === 0) continue;
        puts.push(mapContract(entry, 'put', exp));
      }
    }

    const chain: OptionsChain = { ticker, expirations, calls, puts, fetchedAt: new Date() };
    _chainCache.set(ticker, { chain, ts: Date.now() });
    return chain;
  } catch (err) {
    console.warn(`[OptionsDataService] Failed to fetch chain for ${ticker}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

interface FinnhubMetricResponse {
  metric?: {
    '52WeekHigh'?: number;
    '52WeekLow'?: number;
    beta?: number;
  };
}

export async function computeIVRank(ticker: string): Promise<IVRank | null> {
  const cached = _ivCache.get(ticker);
  if (cached && Date.now() - cached.ts < IV_TTL) return cached.ivRank;

  if (!API_KEY) return null;

  try {
    await waitForToken();
    const { data } = await axios.get<FinnhubMetricResponse>(
      `${FINNHUB_BASE}/stock/metric`,
      { params: { symbol: ticker, metric: 'all', token: API_KEY }, timeout: 8000 },
    );

    const beta = data?.metric?.beta ?? 1.0;
    const rank = Math.min(100, Math.max(0, Math.round((beta - 0.5) / 2.0 * 100)));
    const current = beta;

    // Also use chain to get actual ATM IV if available
    let atm_iv = 0;
    const chain = _chainCache.get(ticker)?.chain;
    if (chain) {
      const nearTerm = filterByDTE(chain.calls, 20, 40);
      if (nearTerm.length > 0) {
        atm_iv = nearTerm.reduce((s, c) => s + c.impliedVolatility, 0) / nearTerm.length;
      }
    }

    const ivRank: IVRank = {
      current: atm_iv > 0 ? atm_iv : current,
      rank,
      percentile: rank,
      isHigh: rank > 50,
      isLow: rank < 30,
    };
    _ivCache.set(ticker, { ivRank, ts: Date.now() });
    return ivRank;
  } catch {
    return null;
  }
}
