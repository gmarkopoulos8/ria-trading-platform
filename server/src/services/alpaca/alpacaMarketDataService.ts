import axios from 'axios';
import WebSocket from 'ws';
import { ALPACA_DATA_URL, getAlpacaCredentials } from './alpacaConfig';
import type { OHLCVBar } from '../technical/types';

// ── REST: Historical Bars ─────────────────────────────────────────────────────

export type AlpacaTimeframe = '1Min' | '5Min' | '15Min' | '30Min' | '1Hour' | '1Day' | '1Week';

interface AlpacaBar {
  t:  string;  // ISO timestamp
  o:  number;  // open
  h:  number;  // high
  l:  number;  // low
  c:  number;  // close
  v:  number;  // volume
  vw: number;  // VWAP
  n:  number;  // trade count
}

interface AlpacaBarsResponse {
  bars:             AlpacaBar[];
  symbol:           string;
  next_page_token?: string;
}

function alpacaBarToOHLCV(bar: AlpacaBar): OHLCVBar {
  return {
    timestamp: new Date(bar.t),
    open:      bar.o,
    high:      bar.h,
    low:       bar.l,
    close:     bar.c,
    volume:    bar.v,
    vwap:      bar.vw,
  };
}

function authHeaders(): Record<string, string> {
  const creds = getAlpacaCredentials();
  if (!creds) return {};
  return {
    'APCA-API-KEY-ID':     creds.apiKeyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
  };
}

// Cache to avoid hammering the API during scans
const _barCache = new Map<string, { bars: OHLCVBar[]; ts: number }>();
const BAR_CACHE_TTL_MS = 3 * 60_000; // 3 minutes

export async function getAlpacaBars(
  symbol:    string,
  timeframe: AlpacaTimeframe = '1Day',
  limit      = 100,
  useCache   = true,
): Promise<OHLCVBar[]> {
  const cacheKey = `${symbol}:${timeframe}:${limit}`;
  if (useCache) {
    const cached = _barCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < BAR_CACHE_TTL_MS) return cached.bars;
  }

  const creds = getAlpacaCredentials();
  if (!creds) {
    console.warn('[AlpacaData] No credentials — cannot fetch bars');
    return [];
  }

  try {
    const { data } = await axios.get<AlpacaBarsResponse>(
      `${ALPACA_DATA_URL}/v2/stocks/${symbol.toUpperCase()}/bars`,
      {
        headers: authHeaders(),
        params: {
          timeframe,
          limit,
          feed:  'iex',
          sort:  'asc',
        },
        timeout: 10_000,
      },
    );

    const bars = (data.bars ?? []).map(alpacaBarToOHLCV);
    _barCache.set(cacheKey, { bars, ts: Date.now() });
    return bars;
  } catch (err: any) {
    console.warn(`[AlpacaData] Failed to fetch bars for ${symbol}:`, err?.response?.data?.message ?? err?.message);
    return [];
  }
}

export async function getAlpacaLatestQuote(symbol: string): Promise<{ price: number; bid: number; ask: number } | null> {
  const creds = getAlpacaCredentials();
  if (!creds) return null;

  try {
    const { data } = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/${symbol.toUpperCase()}/quotes/latest`,
      {
        headers: authHeaders(),
        params:  { feed: 'iex' },
        timeout: 8_000,
      },
    );
    const q = data?.quote;
    if (!q) return null;
    const mid = (q.ap + q.bp) / 2;
    return { price: mid, bid: q.bp, ask: q.ap };
  } catch {
    return null;
  }
}

export async function getAlpacaLatestBar(symbol: string): Promise<OHLCVBar | null> {
  const creds = getAlpacaCredentials();
  if (!creds) return null;

  try {
    const { data } = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/${symbol.toUpperCase()}/bars/latest`,
      {
        headers: authHeaders(),
        params:  { feed: 'iex' },
        timeout: 8_000,
      },
    );
    if (!data?.bar) return null;
    return alpacaBarToOHLCV(data.bar);
  } catch {
    return null;
  }
}

// Batch latest bars for multiple symbols in one request
export async function getAlpacaMultiLatestBars(symbols: string[]): Promise<Record<string, OHLCVBar>> {
  const creds = getAlpacaCredentials();
  if (!creds || symbols.length === 0) return {};

  try {
    const { data } = await axios.get(
      `${ALPACA_DATA_URL}/v2/stocks/bars/latest`,
      {
        headers: authHeaders(),
        params:  { symbols: symbols.join(','), feed: 'iex' },
        timeout: 12_000,
      },
    );

    const result: Record<string, OHLCVBar> = {};
    for (const [sym, bar] of Object.entries(data?.bars ?? {})) {
      result[sym] = alpacaBarToOHLCV(bar as AlpacaBar);
    }
    return result;
  } catch (err: any) {
    console.warn('[AlpacaData] Multi-bar fetch failed:', err?.message);
    return {};
  }
}

// ── WebSocket: Real-time minute bars ─────────────────────────────────────────

type BarCallback   = (symbol: string, bar: OHLCVBar) => void;
type TradeCallback = (symbol: string, price: number, size: number) => void;

class AlpacaMarketStream {
  private ws:         WebSocket | null = null;
  private barCbs:     Map<string, Set<BarCallback>>   = new Map();
  private tradeCbs:   Map<string, Set<TradeCallback>> = new Map();
  private subscribed: Set<string> = new Set();
  private connected   = false;
  private reconnectMs = 2_000;
  private _lastBars   = new Map<string, OHLCVBar>();

  connect(): void {
    const creds = getAlpacaCredentials();
    if (!creds) return;

    this.ws = new WebSocket('wss://stream.data.alpaca.markets/v2/iex');

    this.ws.on('open', () => {
      this.ws!.send(JSON.stringify({ action: 'auth', key: creds.apiKeyId, secret: creds.secretKey }));
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msgs = JSON.parse(raw.toString()) as Array<Record<string, unknown>>;
        for (const msg of msgs) {
          if (msg.T === 'success' && msg.msg === 'authenticated') {
            this.connected   = true;
            this.reconnectMs = 2_000;
            console.info('[AlpacaStream] Authenticated — resubscribing');
            this._resubscribe();
          } else if (msg.T === 'b') {
            const sym = msg.S as string;
            const bar = alpacaBarToOHLCV({
              t: msg.t as string, o: msg.o as number, h: msg.h as number,
              l: msg.l as number, c: msg.c as number, v: msg.v as number,
              vw: msg.vw as number, n: msg.n as number,
            });
            this._lastBars.set(sym, bar);
            this.barCbs.get(sym)?.forEach(cb => { try { cb(sym, bar); } catch { } });
            this.barCbs.get('*')?.forEach(cb => { try { cb(sym, bar); } catch { } });
          } else if (msg.T === 't') {
            const sym = msg.S as string;
            this.tradeCbs.get(sym)?.forEach(cb => { try { cb(sym, msg.p as number, msg.s as number); } catch { } });
          }
        }
      } catch { /* ignore parse errors */ }
    });

    this.ws.on('close', () => {
      this.connected = false;
      setTimeout(() => this.connect(), Math.min(this.reconnectMs *= 2, 30_000));
    });

    this.ws.on('error', () => {
      this.connected = false;
    });
  }

  private _resubscribe(): void {
    if (!this.connected || this.subscribed.size === 0) return;
    const syms      = Array.from(this.subscribed);
    const hasBars   = syms.filter(s => this.barCbs.has(s) || this.barCbs.has('*'));
    const hasTrades = syms.filter(s => this.tradeCbs.has(s));
    this.ws!.send(JSON.stringify({
      action: 'subscribe',
      bars:   hasBars.length   > 0 ? hasBars   : undefined,
      trades: hasTrades.length > 0 ? hasTrades : undefined,
    }));
  }

  subscribeBars(symbol: string, cb: BarCallback): () => void {
    const sym = symbol === '*' ? '*' : symbol.toUpperCase();
    if (!this.barCbs.has(sym)) this.barCbs.set(sym, new Set());
    this.barCbs.get(sym)!.add(cb);
    this.subscribed.add(sym);
    if (this.connected) {
      this.ws!.send(JSON.stringify({ action: 'subscribe', bars: [sym] }));
    }
    return () => { this.barCbs.get(sym)?.delete(cb); };
  }

  subscribeTrades(symbol: string, cb: TradeCallback): () => void {
    const sym = symbol.toUpperCase();
    if (!this.tradeCbs.has(sym)) this.tradeCbs.set(sym, new Set());
    this.tradeCbs.get(sym)!.add(cb);
    this.subscribed.add(sym);
    if (this.connected) {
      this.ws!.send(JSON.stringify({ action: 'subscribe', trades: [sym] }));
    }
    return () => { this.tradeCbs.get(sym)?.delete(cb); };
  }

  getLastBarCache(): Map<string, OHLCVBar> { return this._lastBars; }
}

export const alpacaMarketStream = new AlpacaMarketStream();
