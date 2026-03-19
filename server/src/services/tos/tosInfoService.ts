/**
 * Schwab / ThinkorSwim Info Service
 * Read-only account and market data calls.
 */

import axios from 'axios';
import { TOS_CONFIG, hasCredentials, hasAccountNumber } from './tosConfig';
import { getValidAccessToken } from './tosAuthService';

async function tosGet<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const token = await getValidAccessToken();
  const { data } = await axios.get<T>(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    params,
    timeout: TOS_CONFIG.REQUEST_TIMEOUT_MS,
  });
  return data;
}

// ─── Account ──────────────────────────────────────────────────────

export interface TosAccount {
  securitiesAccount: {
    accountNumber: string;
    type: string;
    roundTrips: number;
    isDayTrader: boolean;
    isClosingOnlyRestricted: boolean;
    currentBalances: {
      liquidationValue: number;
      cashBalance: number;
      totalCash: number;
      buyingPower: number;
      availableFunds: number;
      maintenanceRequirement: number;
      dayTradingBuyingPower: number;
      equity: number;
    };
    initialBalances?: {
      equity: number;
      cashAvailableForWithdrawal: number;
      totalCash: number;
    };
    positions?: TosPosition[];
    orderStrategies?: TosOrder[];
  };
}

export interface TosPosition {
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  longQuantity: number;
  settledLongQuantity: number;
  settledShortQuantity: number;
  instrument: {
    assetType: string;
    cusip?: string;
    symbol: string;
    description?: string;
    instrumentId?: number;
    type?: string;
    putCall?: string;
    underlyingSymbol?: string;
  };
  marketValue: number;
  maintenanceRequirement: number;
  averageLongPrice?: number;
  taxLotAverageLongPrice?: number;
  longOpenProfitLoss?: number;
  previousSessionLongQuantity?: number;
  currentDayCost?: number;
}

export interface TosOrder {
  session: string;
  duration: string;
  orderType: string;
  cancelTime?: string;
  complexOrderStrategyType?: string;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  requestedDestination?: string;
  destinationLinkName?: string;
  price?: number;
  stopPrice?: number;
  orderLegCollection: Array<{
    orderLegType: string;
    legId: number;
    instrument: {
      assetType: string;
      symbol: string;
      description?: string;
    };
    instruction: string;
    positionEffect?: string;
    quantity: number;
  }>;
  orderStrategyType: string;
  orderId: number;
  cancelable: boolean;
  editable: boolean;
  status: string;
  enteredTime: string;
  closeTime?: string;
  accountNumber: string;
  statusDescription?: string;
}

export interface TosQuote {
  assetMainType: string;
  assetSubType?: string;
  quoteType?: string;
  symbol: string;
  description?: string;
  bidPrice?: number;
  askPrice?: number;
  lastPrice?: number;
  openPrice?: number;
  highPrice?: number;
  lowPrice?: number;
  closePrice?: number;
  netChange?: number;
  netPercentChange?: number;
  totalVolume?: number;
  tradeTime?: number;
  mark?: number;
}

export async function getAccounts(): Promise<TosAccount[]> {
  if (!hasCredentials()) return [];
  try {
    return tosGet<TosAccount[]>(`${TOS_CONFIG.TRADER_URL}/accounts`, { fields: 'positions,orders' });
  } catch (err) {
    console.error('[TOS-Info] getAccounts error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getPrimaryAccount(): Promise<TosAccount | null> {
  if (!hasCredentials()) return null;
  try {
    const accountNum = TOS_CONFIG.ACCOUNT_NUMBER;
    if (!accountNum) {
      const accounts = await getAccounts();
      return accounts[0] ?? null;
    }
    return tosGet<TosAccount>(`${TOS_CONFIG.TRADER_URL}/accounts/${accountNum}`, { fields: 'positions,orders' });
  } catch (err) {
    console.error('[TOS-Info] getPrimaryAccount error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getOpenOrders(accountNumber?: string): Promise<TosOrder[]> {
  if (!hasCredentials()) return [];
  try {
    const acct = accountNumber ?? TOS_CONFIG.ACCOUNT_NUMBER;
    if (!acct) return [];
    const now   = new Date();
    const from  = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const orders = await tosGet<TosOrder[]>(`${TOS_CONFIG.TRADER_URL}/accounts/${acct}/orders`, {
      fromEnteredTime: from,
      toEnteredTime:   now.toISOString(),
      status:          'WORKING',
    });
    return Array.isArray(orders) ? orders : [];
  } catch (err) {
    console.error('[TOS-Info] getOpenOrders error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getAllOrders(accountNumber?: string, limit = 50): Promise<TosOrder[]> {
  if (!hasCredentials()) return [];
  try {
    const acct = accountNumber ?? TOS_CONFIG.ACCOUNT_NUMBER;
    if (!acct) return [];
    const now  = new Date();
    const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
    const orders = await tosGet<TosOrder[]>(`${TOS_CONFIG.TRADER_URL}/accounts/${acct}/orders`, {
      fromEnteredTime: from,
      toEnteredTime:   now.toISOString(),
      maxResults:      limit,
    });
    return Array.isArray(orders) ? orders : [];
  } catch (err) {
    console.error('[TOS-Info] getAllOrders error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getQuotes(symbols: string[]): Promise<Record<string, TosQuote>> {
  if (!hasCredentials() || symbols.length === 0) return {};
  try {
    const data = await tosGet<Record<string, { quote: TosQuote }>>(`${TOS_CONFIG.MARKET_URL}/quotes`, {
      symbols: symbols.join(','),
      fields:  'quote',
    });
    const result: Record<string, TosQuote> = {};
    for (const [sym, val] of Object.entries(data)) {
      result[sym] = val.quote ?? (val as unknown as TosQuote);
    }
    return result;
  } catch (err) {
    console.error('[TOS-Info] getQuotes error:', err instanceof Error ? err.message : err);
    return {};
  }
}

export async function computeDrawdownPct(account: TosAccount | null): Promise<number> {
  if (!account) return 0;
  const balances = account.securitiesAccount.currentBalances;
  const initial  = account.securitiesAccount.initialBalances;
  if (!initial) return 0;
  const startEquity = initial.equity;
  if (startEquity <= 0) return 0;
  const currentEquity = balances.equity ?? balances.liquidationValue;
  const dd = -(currentEquity - startEquity) / startEquity * 100;
  return Math.max(0, dd);
}

export async function computeUnrealizedPnl(account: TosAccount | null): Promise<number> {
  if (!account) return 0;
  const positions = account.securitiesAccount.positions ?? [];
  return positions.reduce((sum, p) => sum + (p.currentDayProfitLoss ?? 0), 0);
}
