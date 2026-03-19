/**
 * Hyperliquid Killswitch Service
 *
 * Triggers:
 *  1. POST /api/hyperliquid/killswitch (API endpoint)
 *  2. KILLSWITCH=true environment variable (checked on startup)
 *  3. Automatic: drawdown exceeds MAX_DRAWDOWN_PCT
 *
 * When activated:
 *  - Cancels ALL open orders
 *  - Closes ALL open positions at market price
 *  - Halts further order execution (isKillswitchActive() returns true)
 *  - Logs event to HyperliquidKillEvent table
 */

import { prisma } from '../../lib/prisma';
import {
  activateKillswitch,
  deactivateKillswitch,
  isKillswitchActive,
  getKillswitchState,
  HL_CONFIG,
  hasSigningKey,
  activatePause,
  deactivatePause,
  isPauseActive,
  getPauseState,
} from './hyperliquidConfig';
import { getUserState, getOpenOrders, getDrawdownPct } from './hyperliquidInfoService';
import { cancelAllOrders, closePosition } from './hyperliquidExchangeService';
import telegramService from '../notifications/TelegramService';

export async function executeKillswitch(reason: string, trigger: 'api' | 'env' | 'drawdown' | 'manual', userId?: string): Promise<{
  success: boolean;
  ordersCancelled: number;
  positionsClosed: number;
  errors: string[];
  isDryRun: boolean;
}> {
  activateKillswitch(reason, trigger);

  const errors: string[] = [];
  let ordersCancelled = 0;
  let positionsClosed = 0;

  console.warn(`[HL-KILLSWITCH] Executing — trigger=${trigger} reason=${reason}`);

  const walletAddr = HL_CONFIG.WALLET_ADDRESS;
  let snapshot: object | null = null;

  try {
    const [userState, openOrders] = await Promise.all([
      getUserState(walletAddr),
      getOpenOrders(walletAddr),
    ]);

    snapshot = { userState, openOrders };

    if (openOrders.length > 0) {
      console.warn(`[HL-KILLSWITCH] Cancelling ${openOrders.length} open orders`);
      ordersCancelled = await cancelAllOrders(openOrders, userId);
    }

    const positions = userState?.assetPositions?.filter((ap) => parseFloat(ap.position.szi) !== 0) ?? [];
    for (const ap of positions) {
      const pos = ap.position;
      const size = parseFloat(pos.szi);
      const isBuy = size < 0;
      console.warn(`[HL-KILLSWITCH] Closing ${pos.coin} position szi=${pos.szi}`);
      try {
        const result = await closePosition(pos.coin, Math.abs(size).toString(), isBuy, userId);
        if (result.success) positionsClosed++;
        else errors.push(`${pos.coin}: ${result.error}`);
      } catch (err) {
        errors.push(`${pos.coin}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Killswitch execution error');
  }

  try {
    await prisma.hyperliquidKillEvent.create({
      data: {
        userId,
        reason,
        trigger,
        snapshot: snapshot as object,
      },
    });
  } catch (e) {
    console.warn('[HL-KILLSWITCH] Failed to log kill event:', e);
  }

  console.warn(`[HL-KILLSWITCH] Complete — cancelled=${ordersCancelled} closed=${positionsClosed} errors=${errors.length}`);
  return {
    success: errors.length === 0,
    ordersCancelled,
    positionsClosed,
    errors,
    isDryRun: HL_CONFIG.DRY_RUN,
  };
}

export async function resetKillswitch(userId?: string) {
  deactivateKillswitch();
  console.info('[HL-KILLSWITCH] Reset by userId:', userId ?? 'unknown');
}

// ─── Level 1 — Pause ──────────────────────────────────────────────

export async function pauseTrading(reason: string, userId?: string): Promise<{
  success: boolean;
  level: 'PAUSE';
}> {
  activatePause(reason);

  try {
    await prisma.hyperliquidKillEvent.create({
      data: { userId, reason, trigger: 'pause' as any, snapshot: { level: 'PAUSE' } },
    });
  } catch {}

  try {
    await telegramService.notify({ type: 'KILLSWITCH', exchange: 'hyperliquid', data: { event: 'PAUSE', reason } });
  } catch {}

  console.info(`[HL-PAUSE] Trading paused — reason: ${reason}`);
  return { success: true, level: 'PAUSE' };
}

// ─── Level 2 — Hard Stop ──────────────────────────────────────────

export async function hardStop(reason: string, userId?: string): Promise<{
  success: boolean;
  level: 'HARD_STOP';
  ordersCancelled: number;
  errors: string[];
  isDryRun: boolean;
}> {
  activateKillswitch(reason, 'manual');
  deactivatePause();

  let ordersCancelled = 0;
  const errors: string[] = [];

  try {
    const openOrders = await getOpenOrders(HL_CONFIG.WALLET_ADDRESS);
    if (openOrders.length > 0) {
      console.warn(`[HL-HARD-STOP] Cancelling ${openOrders.length} open orders`);
      ordersCancelled = await cancelAllOrders(openOrders, userId);
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Order cancellation error');
  }

  try {
    await prisma.hyperliquidKillEvent.create({
      data: { userId, reason, trigger: 'manual', snapshot: { level: 'HARD_STOP', ordersCancelled } },
    });
  } catch {}

  try {
    await telegramService.notify({
      type: 'KILLSWITCH', exchange: 'hyperliquid',
      data: { event: 'HARD_STOP', reason, ordersCancelled },
    });
  } catch {}

  console.warn(`[HL-HARD-STOP] Complete — cancelled=${ordersCancelled} errors=${errors.length}`);
  return { success: errors.length === 0, level: 'HARD_STOP', ordersCancelled, errors, isDryRun: HL_CONFIG.DRY_RUN };
}

// ─── Resume (from any level) ──────────────────────────────────────

export async function resumeTrading(userId?: string): Promise<void> {
  deactivatePause();
  deactivateKillswitch();

  try {
    await telegramService.notify({ type: 'KILLSWITCH', exchange: 'hyperliquid', data: { event: 'RESUMED' } });
  } catch {}

  console.info('[HL] Trading resumed by userId:', userId ?? 'unknown');
}

// ─── Drawdown monitor ─────────────────────────────────────────────

let _monitorTimer: NodeJS.Timeout | null = null;

export function startDrawdownMonitor(intervalMs = 60_000) {
  if (_monitorTimer) return;
  console.info(`[HL-Risk] Drawdown monitor started (interval=${intervalMs}ms, max=${HL_CONFIG.MAX_DRAWDOWN_PCT}%)`);
  _monitorTimer = setInterval(async () => {
    if (isKillswitchActive()) return;
    if (!HL_CONFIG.WALLET_ADDRESS?.startsWith('0x')) return;
    try {
      const userState = await getUserState();
      const drawdownPct = await getDrawdownPct(userState);
      if (drawdownPct >= HL_CONFIG.MAX_DRAWDOWN_PCT) {
        console.warn(`[HL-Risk] Drawdown ${drawdownPct.toFixed(2)}% ≥ ${HL_CONFIG.MAX_DRAWDOWN_PCT}% — triggering killswitch`);
        await executeKillswitch(
          `Drawdown ${drawdownPct.toFixed(2)}% exceeded limit of ${HL_CONFIG.MAX_DRAWDOWN_PCT}%`,
          'drawdown',
        );
      }
    } catch (err) {
      console.error('[HL-Risk] Monitor error:', err instanceof Error ? err.message : err);
    }
  }, intervalMs);
}

export function stopDrawdownMonitor() {
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
}

export function getKillswitchStatus() {
  return {
    ...getKillswitchState(),
    pause: getPauseState(),
    controlLevel: isKillswitchActive() ? 'HARD_STOP' : isPauseActive() ? 'PAUSE' : 'ACTIVE',
    maxDrawdownPct: HL_CONFIG.MAX_DRAWDOWN_PCT,
    dryRun: HL_CONFIG.DRY_RUN,
    monitorRunning: _monitorTimer !== null,
  };
}
