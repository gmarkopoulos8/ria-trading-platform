import axios from 'axios';
import { ALPACA_PAPER_URL, getAlpacaCredentials } from './alpacaConfig';

export interface AlpacaAccount {
  id: string;
  equity: string;
  buying_power: string;
  cash: string;
  last_equity: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  portfolio_value: string;
  status: string;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  current_price: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  market_value: string;
  cost_basis: string;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  symbol: string;
  qty: string;
  notional: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  side: string;
  type: string;
  status: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  submitted_at: string;
  filled_at: string | null;
  legs: AlpacaOrder[] | null;
  order_class: string;
}

export interface AlpacaPortfolioHistory {
  timestamp: number[];
  equity: number[];
  profit_loss: number[];
  profit_loss_pct: number[];
  base_value: number;
}

export interface AlpacaAsset {
  id: string;
  symbol: string;
  tradable: boolean;
  fractionable: boolean;
  shortable: boolean;
  easy_to_borrow: boolean;
  status: string;
}

function authHeaders(): Record<string, string> {
  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');
  return {
    'APCA-API-KEY-ID': creds.apiKeyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
  };
}

async function alpacaGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const { data } = await axios.get<T>(`${ALPACA_PAPER_URL}${path}`, {
    headers: authHeaders(),
    params,
    timeout: 10_000,
  });
  return data;
}

export async function getAccount(): Promise<AlpacaAccount> {
  return alpacaGet<AlpacaAccount>('/v2/account');
}

export async function getPositions(): Promise<AlpacaPosition[]> {
  return alpacaGet<AlpacaPosition[]>('/v2/positions');
}

export async function getOpenOrders(): Promise<AlpacaOrder[]> {
  return alpacaGet<AlpacaOrder[]>('/v2/orders', { status: 'open' });
}

export async function getAllOrders(limit = 50): Promise<AlpacaOrder[]> {
  return alpacaGet<AlpacaOrder[]>('/v2/orders', { status: 'all', limit });
}

export async function getPortfolioHistory(
  period = '1M',
  timeframe = '1D',
): Promise<AlpacaPortfolioHistory> {
  return alpacaGet<AlpacaPortfolioHistory>('/v2/account/portfolio/history', {
    period,
    timeframe,
  });
}

export async function getMarketClock(): Promise<{
  is_open: boolean;
  next_open: string;
  next_close: string;
}> {
  return alpacaGet('/v2/clock');
}

export async function getAsset(symbol: string): Promise<AlpacaAsset | null> {
  try {
    return await alpacaGet<AlpacaAsset>(`/v2/assets/${encodeURIComponent(symbol)}`);
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

export function computeDrawdownPct(account: AlpacaAccount): number {
  const equity = parseFloat(account.equity ?? '0');
  const lastEquity = parseFloat(account.last_equity ?? '0');
  if (lastEquity <= 0 || equity >= lastEquity) return 0;
  return ((lastEquity - equity) / lastEquity) * 100;
}

export async function getLatestQuote(symbol: string): Promise<number | null> {
  try {
    const headers = authHeaders();
    const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/quotes/latest`;
    const { data } = await axios.get(url, { headers, timeout: 5000 });
    const bid = parseFloat(data?.quote?.bp ?? '0');
    const ask = parseFloat(data?.quote?.ap ?? '0');
    if (bid > 0 && ask > 0) return (bid + ask) / 2;
    // Fallback to last trade price
    const tradeUrl = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest`;
    const { data: tradeData } = await axios.get(tradeUrl, { headers, timeout: 5000 });
    const last = parseFloat(tradeData?.trade?.p ?? '0');
    return last > 0 ? last : null;
  } catch {
    return null;
  }
}
