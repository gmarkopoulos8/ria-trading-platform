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
} from './hyperliquidConfig';
import { getUserState, getOpenOrders, getDrawdownPct } from './hyperliquidInfoService';
import { cancelAllOrders, closePosition } from './hyperliquidExchangeService';

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
    maxDrawdownPct: HL_CONFIG.MAX_DRAWDOWN_PCT,
    dryRun: HL_CONFIG.DRY_RUN,
    monitorRunning: _monitorTimer !== null,
  };
}
