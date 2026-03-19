/**
 * Schwab / ThinkorSwim Exchange Service — order execution.
 *
 * SAFETY:
 * - DRY_RUN=true by default (HL_CONFIG.DRY_RUN)
 * - All orders blocked when killswitch is active
 * - Every order logged to TosOrderLog
 *
 * Supported order types:
 *   market, limit, stop, stop_limit, bracket (OTOCO)
 * Supported asset classes:
 *   EQUITY, OPTION, FUTURE
 * Supported durations:
 *   DAY, GOOD_TILL_CANCEL, FILL_OR_KILL, IMMEDIATE_OR_CANCEL
 */

import axios from 'axios';
import { TOS_CONFIG, isKillswitchActive, isPauseActive, hasAccountNumber } from './tosConfig';
import { getValidAccessToken } from './tosAuthService';
import { getQuotes } from './tosInfoService';
import { prisma } from '../../lib/prisma';

const client = axios.create({ timeout: TOS_CONFIG.REQUEST_TIMEOUT_MS });

async function tosPost(url: string, body: unknown): Promise<{ orderId?: string; location?: string }> {
  const token = await getValidAccessToken();
  const resp  = await client.post(url, body, {
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    validateStatus: (s) => s < 500,
  });

  if (resp.status === 400 || resp.status === 422) {
    throw new Error(resp.data?.message ?? JSON.stringify(resp.data));
  }

  const location = resp.headers['location'] as string | undefined;
  const orderId  = location?.split('/').pop();
  return { orderId, location };
}

async function tosDelete(url: string): Promise<void> {
  const token = await getValidAccessToken();
  await client.delete(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

function assertSafe(action: string): void {
  if (isKillswitchActive()) {
    throw new Error(`HARD STOP ACTIVE — ${action} blocked`);
  }
  if (isPauseActive()) {
    throw new Error(`TRADING PAUSED — ${action} blocked. Resume trading to continue.`);
  }
}

// ─── Order request shape ──────────────────────────────────────────

export type TosOrderType      = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT' | 'BRACKET';
export type TosDuration       = 'DAY' | 'GOOD_TILL_CANCEL' | 'FILL_OR_KILL' | 'IMMEDIATE_OR_CANCEL';
export type TosInstruction    = 'BUY' | 'SELL' | 'BUY_TO_OPEN' | 'SELL_TO_OPEN' | 'BUY_TO_CLOSE' | 'SELL_TO_CLOSE';
export type TosAssetType      = 'EQUITY' | 'OPTION' | 'FUTURE';
export type TosSession        = 'NORMAL' | 'AM' | 'PM' | 'SEAMLESS';

export interface TosOrderRequest {
  symbol:        string;
  instruction:   TosInstruction;
  quantity:      number;
  orderType:     TosOrderType;
  duration?:     TosDuration;
  session?:      TosSession;
  price?:        number;
  stopPrice?:    number;
  takeProfitPct?: number;
  stopLossPct?:   number;
  assetType?:    TosAssetType;
  userId?:       string;
  accountNumber?: string;
}

export interface TosOrderResult {
  success:    boolean;
  isDryRun:   boolean;
  orderId?:   string;
  error?:     string;
  orderType?: string;
}

// ─── Build Schwab order payload ───────────────────────────────────

function buildOrderPayload(req: TosOrderRequest, effectivePrice?: number | null): object {
  const duration  = req.duration  ?? 'DAY';
  const session   = req.session   ?? 'NORMAL';
  const assetType = req.assetType ?? 'EQUITY';

  const leg = {
    instruction: req.instruction,
    quantity:    req.quantity,
    instrument:  { symbol: req.symbol.toUpperCase(), assetType },
  };

  if (req.orderType === 'BRACKET') {
    if (!effectivePrice) throw new Error('Bracket orders require a reference price');
    const tp  = req.takeProfitPct ? effectivePrice * (1 + req.takeProfitPct / 100) : effectivePrice * 1.05;
    const sl  = req.stopLossPct   ? effectivePrice * (1 - req.stopLossPct   / 100) : effectivePrice * 0.97;
    const isBuy = req.instruction.startsWith('BUY');

    return {
      orderType:          'LIMIT',
      session,
      duration,
      price:              effectivePrice.toFixed(2),
      orderStrategyType:  'TRIGGER',
      orderLegCollection: [leg],
      childOrderStrategies: [
        {
          orderType:          'LIMIT',
          session:            'NORMAL',
          duration:           'GOOD_TILL_CANCEL',
          price:              tp.toFixed(2),
          orderStrategyType:  'OCO',
          orderLegCollection: [{
            instruction: isBuy ? 'SELL' : 'BUY',
            quantity:    req.quantity,
            instrument:  { symbol: req.symbol.toUpperCase(), assetType },
          }],
          childOrderStrategies: [{
            orderType:          'STOP',
            session:            'NORMAL',
            duration:           'GOOD_TILL_CANCEL',
            stopPrice:          sl.toFixed(2),
            orderStrategyType:  'SINGLE',
            orderLegCollection: [{
              instruction: isBuy ? 'SELL' : 'BUY',
              quantity:    req.quantity,
              instrument:  { symbol: req.symbol.toUpperCase(), assetType },
            }],
          }],
        },
      ],
    };
  }

  const payload: Record<string, unknown> = {
    orderType:          req.orderType,
    session,
    duration,
    orderStrategyType:  'SINGLE',
    orderLegCollection: [leg],
  };

  if (req.orderType === 'LIMIT' || req.orderType === 'STOP_LIMIT') {
    if (!req.price) throw new Error('Limit/Stop-Limit orders require a price');
    payload.price = req.price.toFixed(2);
  }
  if (req.orderType === 'STOP' || req.orderType === 'STOP_LIMIT') {
    if (!req.stopPrice) throw new Error('Stop orders require a stopPrice');
    payload.stopPrice = req.stopPrice.toFixed(2);
  }

  return payload;
}

// ─── Place order ──────────────────────────────────────────────────

export async function placeOrder(req: TosOrderRequest): Promise<TosOrderResult> {
  assertSafe('placeOrder');

  const acct = req.accountNumber ?? TOS_CONFIG.ACCOUNT_NUMBER;
  if (!acct) return { success: false, isDryRun: TOS_CONFIG.DRY_RUN, error: 'No account number. Set SCHWAB_ACCOUNT_NUMBER.' };

  const logEntry = await prisma.tosOrderLog.create({
    data: {
      userId:      req.userId ?? 'system',
      symbol:      req.symbol.toUpperCase(),
      instruction: req.instruction,
      orderType:   req.orderType,
      quantity:    req.quantity.toString(),
      price:       req.price?.toString() ?? null,
      stopPrice:   req.stopPrice?.toString() ?? null,
      duration:    req.duration ?? 'DAY',
      isDryRun:    TOS_CONFIG.DRY_RUN,
      status:      'pending',
    },
  });

  let effectivePrice: number | null = null;

  if (TOS_CONFIG.DRY_RUN) {
    if (req.orderType === 'MARKET' || req.orderType === 'BRACKET') {
      const quotes = await getQuotes([req.symbol.toUpperCase()]);
      effectivePrice = quotes[req.symbol.toUpperCase()]?.lastPrice ?? null;
    } else {
      effectivePrice = req.price ?? null;
    }
    console.info(`[TOS-DRY-RUN] ${req.instruction} ${req.quantity} ${req.symbol} @ ${effectivePrice ?? 'market'} (${req.orderType})`);
    await prisma.tosOrderLog.update({ where: { id: logEntry.id }, data: { status: 'dry_run', price: effectivePrice?.toFixed(2) } });
    return { success: true, isDryRun: true, orderId: `dry-${logEntry.id}`, orderType: req.orderType };
  }

  try {
    if (req.orderType === 'MARKET' || req.orderType === 'BRACKET') {
      const quotes = await getQuotes([req.symbol.toUpperCase()]);
      effectivePrice = quotes[req.symbol.toUpperCase()]?.lastPrice ?? null;
    }

    const payload = buildOrderPayload(req, effectivePrice);
    console.info(`[TOS-Exchange] ${req.instruction} ${req.quantity} ${req.symbol} (${req.orderType})`);
    const { orderId } = await tosPost(`${TOS_CONFIG.TRADER_URL}/accounts/${acct}/orders`, payload);

    await prisma.tosOrderLog.update({
      where: { id: logEntry.id },
      data: { status: 'submitted', exchangeOid: orderId, price: effectivePrice?.toFixed(2) },
    });
    return { success: true, isDryRun: false, orderId, orderType: req.orderType };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[TOS-Exchange] placeOrder error: ${msg}`);
    await prisma.tosOrderLog.update({ where: { id: logEntry.id }, data: { status: 'failed', errorMessage: msg } });
    return { success: false, isDryRun: false, error: msg };
  }
}

// ─── Cancel order ─────────────────────────────────────────────────

export async function cancelOrder(orderId: string | number, accountNumber?: string): Promise<TosOrderResult> {
  assertSafe('cancelOrder');

  if (TOS_CONFIG.DRY_RUN) {
    console.info(`[TOS-DRY-RUN] cancelOrder orderId=${orderId}`);
    return { success: true, isDryRun: true };
  }

  const acct = accountNumber ?? TOS_CONFIG.ACCOUNT_NUMBER;
  if (!acct) return { success: false, isDryRun: false, error: 'No account number' };

  try {
    await tosDelete(`${TOS_CONFIG.TRADER_URL}/accounts/${acct}/orders/${orderId}`);
    return { success: true, isDryRun: false, orderId: orderId.toString() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[TOS-Exchange] cancelOrder error: ${msg}`);
    return { success: false, isDryRun: false, error: msg };
  }
}

export async function cancelAllOpenOrders(openOrders: Array<{ orderId: number }>, accountNumber?: string): Promise<number> {
  let cancelled = 0;
  for (const o of openOrders) {
    const result = await cancelOrder(o.orderId, accountNumber);
    if (result.success) cancelled++;
  }
  return cancelled;
}

// ─── Close all positions ──────────────────────────────────────────

export interface PositionToClose {
  symbol:      string;
  longQuantity: number;
  shortQuantity: number;
  assetType:   string;
}

export async function closePosition(pos: PositionToClose, userId?: string): Promise<TosOrderResult> {
  const qty       = pos.longQuantity > 0 ? pos.longQuantity : pos.shortQuantity;
  const instruction: TosInstruction = pos.longQuantity > 0 ? 'SELL' : 'BUY';
  if (!qty) return { success: false, isDryRun: TOS_CONFIG.DRY_RUN, error: 'Zero quantity' };

  return placeOrder({
    symbol:    pos.symbol,
    instruction,
    quantity:  qty,
    orderType: 'MARKET',
    duration:  'DAY',
    assetType: (pos.assetType as TosAssetType) ?? 'EQUITY',
    userId,
  });
}

// ─── Order history ────────────────────────────────────────────────

export async function getOrderHistory(userId: string, limit = 50) {
  return prisma.tosOrderLog.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: limit,
  });
}
