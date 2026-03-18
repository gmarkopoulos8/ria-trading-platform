/**
 * Hyperliquid Exchange Service — order execution.
 *
 * IMPORTANT SAFETY NOTES:
 * - DRY_RUN=true by default (checks HL_CONFIG.DRY_RUN)
 * - All order execution blocked when killswitch is active
 * - Every order is logged to HyperliquidOrderLog
 * - Wrap all calls in try/catch with detailed logging
 */

import axios from 'axios';
import { HL_CONFIG, isKillswitchActive, hasSigningKey } from './hyperliquidConfig';
import { signL1Action, nowNonce } from './hyperliquidSigningService';
import { getAssetIndex, getAssetPrice } from './hyperliquidInfoService';
import { prisma } from '../../lib/prisma';

const exchangeClient = axios.create({
  timeout: HL_CONFIG.REQUEST_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
});

export interface OrderRequest {
  asset: string;
  isBuy: boolean;
  price?: number | null;
  size: number;
  reduceOnly?: boolean;
  orderType?: 'limit' | 'market';
  tif?: 'Gtc' | 'Ioc' | 'Alo';
  leverage?: number;
  userId?: string;
}

export interface OrderResult {
  success: boolean;
  isDryRun: boolean;
  orderId?: string | number;
  error?: string;
  rawResponse?: unknown;
}

async function postExchange(payload: object): Promise<unknown> {
  const { data } = await exchangeClient.post(`${HL_CONFIG.API_URL}/exchange`, payload);
  return data;
}

// ─── Safety gate ─────────────────────────────────────────────────

function assertSafe(action: string): void {
  if (isKillswitchActive()) {
    throw new Error(`KILLSWITCH ACTIVE — ${action} blocked`);
  }
}

// ─── Leverage update ─────────────────────────────────────────────

export async function setLeverage(asset: string, leverage: number, isCross = true, userId?: string): Promise<OrderResult> {
  assertSafe('setLeverage');
  const logEntry = await prisma.hyperliquidOrderLog.create({
    data: { userId: userId ?? 'system', asset, side: 'N/A', orderType: 'leverage', size: '0', leverage, isDryRun: HL_CONFIG.DRY_RUN },
  });

  if (HL_CONFIG.DRY_RUN) {
    console.info(`[HL-DRY-RUN] setLeverage ${asset} x${leverage}`);
    await prisma.hyperliquidOrderLog.update({ where: { id: logEntry.id }, data: { status: 'dry_run' } });
    return { success: true, isDryRun: true };
  }

  if (!hasSigningKey()) throw new Error('No signing key configured for live trading');

  try {
    const assetIdx = await getAssetIndex(asset);
    const nonce    = nowNonce();
    const action   = { type: 'updateLeverage', asset: assetIdx, isCross, leverage };
    const sig      = await signL1Action(action, null, nonce);

    const resp = await postExchange({ action, nonce, signature: sig, vaultAddress: null });
    await prisma.hyperliquidOrderLog.update({ where: { id: logEntry.id }, data: { status: 'submitted', rawResponse: resp as object } });
    return { success: true, isDryRun: false, rawResponse: resp };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[HL-Exchange] setLeverage error: ${msg}`);
    await prisma.hyperliquidOrderLog.update({ where: { id: logEntry.id }, data: { status: 'failed', errorMessage: msg } });
    return { success: false, isDryRun: false, error: msg };
  }
}

// ─── Place order ──────────────────────────────────────────────────

export async function placeOrder(req: OrderRequest): Promise<OrderResult> {
  assertSafe('placeOrder');

  const {
    asset, isBuy, size, reduceOnly = false,
    orderType = req.price != null ? 'limit' : 'market',
    tif = 'Gtc',
    leverage = HL_CONFIG.DEFAULT_LEVERAGE,
    userId,
  } = req;

  let { price } = req;

  const side = isBuy ? 'long' : 'short';
  const logEntry = await prisma.hyperliquidOrderLog.create({
    data: {
      userId: userId ?? 'system',
      asset, side, orderType,
      price: price?.toString(),
      size: size.toString(),
      leverage,
      reduceOnly,
      isDryRun: HL_CONFIG.DRY_RUN,
      status: 'pending',
    },
  });

  if (HL_CONFIG.DRY_RUN) {
    const dryPrice = price ?? (await getAssetPrice(asset) ?? 0);
    console.info(`[HL-DRY-RUN] ${isBuy ? 'BUY' : 'SELL'} ${size} ${asset} @ ${dryPrice} (${orderType})`);
    await prisma.hyperliquidOrderLog.update({ where: { id: logEntry.id }, data: { status: 'dry_run', price: dryPrice.toString() } });
    return { success: true, isDryRun: true, orderId: `dry-${logEntry.id}` };
  }

  if (!hasSigningKey()) throw new Error('No signing key. Set HL_PRIVATE_KEY or HL_AGENT_PRIVATE_KEY in Secrets.');

  try {
    const assetIdx = await getAssetIndex(asset);
    const nonce    = nowNonce();

    if (orderType === 'market' || price == null) {
      const mid = await getAssetPrice(asset) ?? 0;
      const slippage = HL_CONFIG.DEFAULT_SLIPPAGE_PCT / 100;
      price = isBuy ? mid * (1 + slippage) : mid * (1 - slippage);
    }

    const priceStr = price.toFixed(8).replace(/\.?0+$/, '');
    const sizeStr  = size.toString();

    const order = {
      a: assetIdx,
      b: isBuy,
      p: priceStr,
      s: sizeStr,
      r: reduceOnly,
      t: orderType === 'market'
        ? { limit: { tif: 'Ioc' } }
        : { limit: { tif } },
    };

    const action = { type: 'order', orders: [order], grouping: 'na' };
    const sig    = await signL1Action(action, null, nonce);

    console.info(`[HL-Exchange] ${isBuy ? 'BUY' : 'SELL'} ${size} ${asset} @ ${priceStr}`);
    const resp = await postExchange({ action, nonce, signature: sig, vaultAddress: null });

    const statuses = (resp as any)?.response?.data?.statuses ?? [];
    const first    = statuses[0];
    const oid      = first?.resting?.oid ?? first?.filled?.oid;
    const status   = first?.error ? 'failed' : 'submitted';

    await prisma.hyperliquidOrderLog.update({
      where: { id: logEntry.id },
      data: { status, exchangeOid: oid?.toString(), errorMessage: first?.error, rawResponse: resp as object, price: priceStr },
    });

    if (first?.error) return { success: false, isDryRun: false, error: first.error };
    return { success: true, isDryRun: false, orderId: oid, rawResponse: resp };

  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[HL-Exchange] placeOrder error: ${msg}`);
    await prisma.hyperliquidOrderLog.update({ where: { id: logEntry.id }, data: { status: 'failed', errorMessage: msg } });
    return { success: false, isDryRun: false, error: msg };
  }
}

// ─── Cancel order ─────────────────────────────────────────────────

export async function cancelOrder(asset: string, oid: number, userId?: string): Promise<OrderResult> {
  assertSafe('cancelOrder');
  if (HL_CONFIG.DRY_RUN) {
    console.info(`[HL-DRY-RUN] cancelOrder ${asset} oid=${oid}`);
    return { success: true, isDryRun: true };
  }
  if (!hasSigningKey()) throw new Error('No signing key configured');
  try {
    const assetIdx = await getAssetIndex(asset);
    const nonce    = nowNonce();
    const action   = { type: 'cancel', cancels: [{ a: assetIdx, o: oid }] };
    const sig      = await signL1Action(action, null, nonce);
    const resp     = await postExchange({ action, nonce, signature: sig, vaultAddress: null });
    return { success: true, isDryRun: false, rawResponse: resp };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[HL-Exchange] cancelOrder error: ${msg}`);
    return { success: false, isDryRun: false, error: msg };
  }
}

// ─── Close position (market order, reduceOnly) ────────────────────

export async function closePosition(asset: string, sizeStr: string, isBuy: boolean, userId?: string): Promise<OrderResult> {
  const size = Math.abs(parseFloat(sizeStr));
  if (!size || isNaN(size)) return { success: false, isDryRun: HL_CONFIG.DRY_RUN, error: 'Invalid size' };
  return placeOrder({ asset, isBuy, size, reduceOnly: true, orderType: 'market', userId });
}

// ─── Cancel all orders for an asset ──────────────────────────────

export async function cancelAllOrders(openOrders: Array<{ coin: string; oid: number }>, userId?: string): Promise<number> {
  let cancelled = 0;
  for (const o of openOrders) {
    const result = await cancelOrder(o.coin, o.oid, userId);
    if (result.success) cancelled++;
  }
  return cancelled;
}

// ─── Order history ────────────────────────────────────────────────

export async function getOrderHistory(userId: string, limit = 50) {
  return prisma.hyperliquidOrderLog.findMany({
    where: { userId },
    orderBy: { submittedAt: 'desc' },
    take: limit,
  });
}
