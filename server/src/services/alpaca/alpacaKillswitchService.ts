import {
  activatePause,
  deactivatePause,
  activateKillswitch,
  deactivateKillswitch,
  isPauseActive,
  isKillswitchActive,
  getControlLevel,
  getPauseState,
  getKillswitchState,
  hasAlpacaCredentials,
  getAlpacaCredentials,
} from './alpacaConfig';
import { cancelAllOrders, closeAllPositions } from './alpacaExchangeService';
import { getAccount, computeDrawdownPct } from './alpacaInfoService';
import { prisma } from '../../lib/prisma';

let _monitorInterval: ReturnType<typeof setInterval> | null = null;
let _monitorRunning = false;

async function logKillEvent(params: {
  userId?: string;
  reason: string;
  trigger: string;
  level: string;
  snapshot?: unknown;
}): Promise<void> {
  try {
    await prisma.alpacaKillEvent.create({
      data: {
        userId:   params.userId ?? null,
        reason:   params.reason,
        trigger:  params.trigger,
        level:    params.level,
        snapshot: (params.snapshot as any) ?? undefined,
      },
    });
  } catch {
    // non-fatal
  }
}

export async function pauseTrading(reason: string, userId?: string): Promise<void> {
  activatePause(reason);
  await logKillEvent({ userId, reason, trigger: 'manual', level: 'PAUSE' });
  console.info(`[AlpacaKillswitch] PAUSE activated — ${reason}`);
}

export async function hardStop(reason: string, userId?: string): Promise<number> {
  activateKillswitch(reason);
  const cancelled = await cancelAllOrders(userId);
  await logKillEvent({ userId, reason, trigger: 'manual', level: 'HARD_STOP' });
  console.info(`[AlpacaKillswitch] HARD STOP activated — ${reason} — ${cancelled} orders cancelled`);
  return cancelled;
}

export async function executeEmergencyExit(
  reason: string,
  userId?: string,
): Promise<{ ordersCancelled: number; positionsClosed: number; errors: string[] }> {
  activateKillswitch(reason);
  const [cancelled, result] = await Promise.all([
    cancelAllOrders(userId),
    closeAllPositions(userId),
  ]);
  await logKillEvent({ userId, reason, trigger: 'emergency_exit', level: 'HARD_STOP' });
  console.info(
    `[AlpacaKillswitch] EMERGENCY EXIT — ${cancelled} orders cancelled, ${result.closed} positions closed`,
  );
  return { ordersCancelled: cancelled, positionsClosed: result.closed, errors: result.errors };
}

export async function resumeTrading(userId?: string): Promise<void> {
  deactivatePause();
  deactivateKillswitch();
  await logKillEvent({ userId, reason: 'Manual resume', trigger: 'manual', level: 'ACTIVE' });
  console.info('[AlpacaKillswitch] Trading resumed');
}

export function getControlStatus(): {
  controlLevel: 'ACTIVE' | 'PAUSE' | 'HARD_STOP';
  pause: ReturnType<typeof getPauseState>;
  killswitch: ReturnType<typeof getKillswitchState>;
  active: boolean;
  dryRun: boolean;
  monitorRunning: boolean;
} {
  const creds = getAlpacaCredentials();
  return {
    controlLevel: getControlLevel(),
    pause:        getPauseState(),
    killswitch:   getKillswitchState(),
    active:       isKillswitchActive(),
    dryRun:       creds?.dryRun ?? true,
    monitorRunning: _monitorRunning,
  };
}

export function startDrawdownMonitor(intervalMs = 60_000): void {
  if (_monitorInterval) return;
  _monitorRunning = true;
  _monitorInterval = setInterval(async () => {
    if (!hasAlpacaCredentials()) return;
    try {
      const creds = getAlpacaCredentials()!;
      const account = await getAccount();
      const drawdown = computeDrawdownPct(account);
      if (drawdown >= creds.maxDrawdownPct) {
        console.warn(`[AlpacaMonitor] Drawdown ${drawdown.toFixed(2)}% >= max ${creds.maxDrawdownPct}% — emergency exit`);
        await executeEmergencyExit(
          `Drawdown limit breached: ${drawdown.toFixed(2)}%`,
          'system',
        );
      }
    } catch (err: any) {
      console.warn('[AlpacaMonitor] Monitor error:', err?.message);
    }
  }, intervalMs);
}

export function stopDrawdownMonitor(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
    _monitorRunning = false;
  }
}
