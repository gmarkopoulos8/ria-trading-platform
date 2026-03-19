/**
 * Schwab / ThinkorSwim Killswitch + Drawdown Monitor + Strategy Scheduler
 *
 * Killswitch triggers:
 *  1. POST /api/tos/killswitch
 *  2. KILLSWITCH_TOS=true env var (checked at startup)
 *  3. Automatic: account drawdown exceeds SCHWAB_MAX_DRAWDOWN_PCT (default 5%)
 *
 * When activated:
 *  - Cancels ALL open orders
 *  - Closes ALL open positions at market
 *  - Halts further trading (isKillswitchActive() returns true)
 *  - Logs kill event to TosKillEvent table
 *
 * Scheduler:
 *  - Runs registered strategy functions at a configurable interval
 *  - Defaults to checking every 60s and firing at market open (09:31 ET)
 */

import { prisma } from '../../lib/prisma';
import {
  activateKillswitch, deactivateKillswitch,
  isKillswitchActive, getKillswitchState,
  TOS_CONFIG, hasCredentials,
  activatePause, deactivatePause, isPauseActive, getPauseState,
} from './tosConfig';
import { getPrimaryAccount, getOpenOrders, computeDrawdownPct } from './tosInfoService';
import { cancelAllOpenOrders, closePosition } from './tosExchangeService';
import telegramService from '../notifications/TelegramService';

// ─── Killswitch ───────────────────────────────────────────────────

export async function executeKillswitch(
  reason:  string,
  trigger: 'api' | 'env' | 'drawdown' | 'manual',
  userId?: string,
): Promise<{ success: boolean; ordersCancelled: number; positionsClosed: number; errors: string[]; isDryRun: boolean }> {
  activateKillswitch(reason, trigger);

  const errors: string[] = [];
  let ordersCancelled = 0;
  let positionsClosed = 0;

  console.warn(`[TOS-KILLSWITCH] Executing — trigger=${trigger} reason=${reason}`);

  let snapshot: object | null = null;

  try {
    const [account, openOrders] = await Promise.all([
      getPrimaryAccount(),
      getOpenOrders(),
    ]);

    snapshot = { account: account?.securitiesAccount?.accountNumber, openOrders };

    if (openOrders.length > 0) {
      console.warn(`[TOS-KILLSWITCH] Cancelling ${openOrders.length} open orders`);
      ordersCancelled = await cancelAllOpenOrders(
        openOrders.map((o) => ({ orderId: o.orderId })),
      );
    }

    const positions = account?.securitiesAccount?.positions ?? [];
    for (const pos of positions) {
      const sym = pos.instrument.symbol;
      const hasPosition = pos.longQuantity > 0 || pos.shortQuantity > 0;
      if (!hasPosition) continue;

      console.warn(`[TOS-KILLSWITCH] Closing ${sym} long=${pos.longQuantity} short=${pos.shortQuantity}`);
      try {
        const result = await closePosition({
          symbol:       sym,
          longQuantity:  pos.longQuantity,
          shortQuantity: pos.shortQuantity,
          assetType:     pos.instrument.assetType,
        }, userId);
        if (result.success) positionsClosed++;
        else errors.push(`${sym}: ${result.error}`);
      } catch (err) {
        errors.push(`${sym}: ${err instanceof Error ? err.message : 'unknown'}`);
      }
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Killswitch execution error');
  }

  try {
    await prisma.tosKillEvent.create({
      data: {
        userId,
        reason,
        trigger,
        snapshot: snapshot as object,
      },
    });
  } catch (e) {
    console.warn('[TOS-KILLSWITCH] Failed to log kill event:', e);
  }

  console.warn(`[TOS-KILLSWITCH] Complete — cancelled=${ordersCancelled} closed=${positionsClosed} errors=${errors.length}`);
  return { success: errors.length === 0, ordersCancelled, positionsClosed, errors, isDryRun: TOS_CONFIG.DRY_RUN };
}

export async function resetKillswitch(userId?: string) {
  deactivateKillswitch();
  console.info('[TOS-KILLSWITCH] Reset by userId:', userId ?? 'unknown');
}

// ─── Level 1 — Pause ──────────────────────────────────────────────

export async function pauseTrading(reason: string, userId?: string): Promise<{
  success: boolean;
  level: 'PAUSE';
}> {
  activatePause(reason);

  try {
    await prisma.tosKillEvent.create({
      data: { userId, reason, trigger: 'pause' as any, snapshot: { level: 'PAUSE' } },
    });
  } catch {}

  try {
    await telegramService.notify({ type: 'KILLSWITCH', exchange: 'tos', data: { event: 'PAUSE', reason } });
  } catch {}

  console.info(`[TOS-PAUSE] Trading paused — reason: ${reason}`);
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
    const openOrders = await getOpenOrders();
    if (openOrders.length > 0) {
      console.warn(`[TOS-HARD-STOP] Cancelling ${openOrders.length} open orders`);
      ordersCancelled = await cancelAllOpenOrders(openOrders.map((o) => ({ orderId: o.orderId })));
    }
  } catch (err) {
    errors.push(err instanceof Error ? err.message : 'Order cancellation error');
  }

  try {
    await prisma.tosKillEvent.create({
      data: { userId, reason, trigger: 'manual', snapshot: { level: 'HARD_STOP', ordersCancelled } },
    });
  } catch {}

  try {
    await telegramService.notify({
      type: 'KILLSWITCH', exchange: 'tos',
      data: { event: 'HARD_STOP', reason, ordersCancelled },
    });
  } catch {}

  console.warn(`[TOS-HARD-STOP] Complete — cancelled=${ordersCancelled} errors=${errors.length}`);
  return { success: errors.length === 0, level: 'HARD_STOP', ordersCancelled, errors, isDryRun: TOS_CONFIG.DRY_RUN };
}

// ─── Resume (from any level) ──────────────────────────────────────

export async function resumeTrading(userId?: string): Promise<void> {
  deactivatePause();
  deactivateKillswitch();

  try {
    await telegramService.notify({ type: 'KILLSWITCH', exchange: 'tos', data: { event: 'RESUMED' } });
  } catch {}

  console.info('[TOS] Trading resumed by userId:', userId ?? 'unknown');
}

export function getKillswitchStatus() {
  return {
    ...getKillswitchState(),
    pause: getPauseState(),
    controlLevel: isKillswitchActive() ? 'HARD_STOP' : isPauseActive() ? 'PAUSE' : 'ACTIVE',
    maxDrawdownPct:   TOS_CONFIG.MAX_DRAWDOWN_PCT,
    dryRun:           TOS_CONFIG.DRY_RUN,
    monitorRunning:   _monitorTimer !== null,
    schedulerRunning: _schedulerTimer !== null,
    nextScheduledRun: _nextScheduledRun,
    registeredStrategies: _strategies.length,
  };
}

// ─── Drawdown monitor ─────────────────────────────────────────────

let _monitorTimer: NodeJS.Timeout | null = null;

export function startDrawdownMonitor(intervalMs = 60_000) {
  if (_monitorTimer) return;
  console.info(`[TOS-Risk] Drawdown monitor started (interval=${intervalMs}ms, max=${TOS_CONFIG.MAX_DRAWDOWN_PCT}%)`);

  _monitorTimer = setInterval(async () => {
    if (isKillswitchActive()) return;
    if (!hasCredentials()) return;

    try {
      const account     = await getPrimaryAccount();
      const drawdownPct = await computeDrawdownPct(account);

      if (drawdownPct >= TOS_CONFIG.MAX_DRAWDOWN_PCT) {
        console.warn(`[TOS-Risk] Drawdown ${drawdownPct.toFixed(2)}% ≥ ${TOS_CONFIG.MAX_DRAWDOWN_PCT}% — triggering killswitch`);
        await executeKillswitch(
          `Drawdown ${drawdownPct.toFixed(2)}% exceeded limit of ${TOS_CONFIG.MAX_DRAWDOWN_PCT}%`,
          'drawdown',
        );
      }
    } catch (err) {
      console.error('[TOS-Risk] Monitor error:', err instanceof Error ? err.message : err);
    }
  }, intervalMs);
}

export function stopDrawdownMonitor() {
  if (_monitorTimer) { clearInterval(_monitorTimer); _monitorTimer = null; }
}

// ─── Strategy Scheduler ───────────────────────────────────────────
// Runs registered strategy functions at market-hours intervals.
// Each strategy is a named async function.

type Strategy = { name: string; fn: () => Promise<void>; runAtOpen: boolean; runAtClose: boolean; everyNMin: number };

const _strategies: Strategy[] = [];
let _schedulerTimer: NodeJS.Timeout | null = null;
let _nextScheduledRun: string | null = null;
let _lastTickMin = -1;

function getEasternTime(): { hour: number; minute: number; isWeekday: boolean } {
  const now = new Date();
  const et  = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(now);
  const hour   = parseInt(et.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = parseInt(et.find((p) => p.type === 'minute')?.value ?? '0');
  const day    = now.toLocaleDateString('en-US', { timeZone: 'America/New_York', weekday: 'short' });
  const isWeekday = !['Sat', 'Sun'].includes(day);
  return { hour, minute, isWeekday };
}

function isMarketHours(hour: number, minute: number): boolean {
  const totalMin = hour * 60 + minute;
  return totalMin >= 9 * 60 + 30 && totalMin < 16 * 60;
}

export function registerStrategy(
  name:       string,
  fn:         () => Promise<void>,
  opts: { runAtOpen?: boolean; runAtClose?: boolean; everyNMin?: number } = {},
) {
  _strategies.push({
    name,
    fn,
    runAtOpen:  opts.runAtOpen  ?? false,
    runAtClose: opts.runAtClose ?? false,
    everyNMin:  opts.everyNMin  ?? 0,
  });
  console.info(`[TOS-Scheduler] Registered strategy: "${name}"`);
}

export function startScheduler() {
  if (_schedulerTimer) return;
  console.info('[TOS-Scheduler] Started (tick every 60s)');

  _schedulerTimer = setInterval(async () => {
    if (isKillswitchActive()) return;
    if (!hasCredentials()) return;

    const { hour, minute, isWeekday } = getEasternTime();
    if (!isWeekday) return;
    if (!isMarketHours(hour, minute)) return;

    const totalMin = hour * 60 + minute;
    if (totalMin === _lastTickMin) return;
    _lastTickMin = totalMin;

    const isOpen  = hour === 9 && minute === 31;
    const isClose = hour === 15 && minute === 55;

    _nextScheduledRun = null;

    for (const s of _strategies) {
      let shouldRun = false;
      if (s.runAtOpen  && isOpen)  shouldRun = true;
      if (s.runAtClose && isClose) shouldRun = true;
      if (s.everyNMin > 0 && totalMin % s.everyNMin === 0) shouldRun = true;

      if (shouldRun) {
        console.info(`[TOS-Scheduler] Running strategy: "${s.name}"`);
        try {
          await s.fn();
        } catch (err) {
          console.error(`[TOS-Scheduler] Strategy "${s.name}" error:`, err instanceof Error ? err.message : err);
        }
      }
    }
  }, 60_000);
}

export function stopScheduler() {
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null; }
}

export function listStrategies() {
  return _strategies.map((s) => ({ name: s.name, runAtOpen: s.runAtOpen, runAtClose: s.runAtClose, everyNMin: s.everyNMin }));
}
