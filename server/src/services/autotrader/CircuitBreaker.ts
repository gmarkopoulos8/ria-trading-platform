import { isKillswitchActive as isTosKillswitchActive } from '../tos/tosConfig';
import { isKillswitchActive as isHlKillswitchActive } from '../hyperliquid/hyperliquidConfig';
import { isKillswitchActive as isAlpacaKillswitchActive, isPauseActive as isAlpacaPauseActive } from '../alpaca/alpacaConfig';
import { prisma } from '../../lib/prisma';

export interface CircuitBreakerConfig {
  exchange: 'TOS' | 'HYPERLIQUID' | 'PAPER';
  dailyLossLimit: number;
  maxDrawdownPct: number;
  maxOpenPositions: number;
  currentDailyPnl?: number;
  currentEquity?: number;
  startEquity?: number;
  currentOpenPositions?: number;
}

export interface CircuitBreakerResult {
  allowed: boolean;
  reason?: string;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

function getNYHour(): number {
  const now = new Date();
  const nyStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  return parseInt(nyStr, 10);
}

export async function checkCircuitBreakers(
  config: CircuitBreakerConfig,
  userSettingsId: string,
): Promise<CircuitBreakerResult> {
  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

  if (config.exchange === 'TOS') {
    const ksActive = isTosKillswitchActive();
    checks.push({ name: 'TOS Killswitch', passed: !ksActive, detail: ksActive ? 'TOS killswitch is active' : undefined });
  }

  if (config.exchange === 'HYPERLIQUID') {
    const ksActive = isHlKillswitchActive();
    checks.push({ name: 'HL Killswitch', passed: !ksActive, detail: ksActive ? 'Hyperliquid killswitch is active' : undefined });
  }

  if (config.exchange === 'PAPER') {
    const ksActive = isAlpacaKillswitchActive();
    const paused   = isAlpacaPauseActive();
    checks.push({ name: 'Alpaca Killswitch', passed: !ksActive, detail: ksActive ? 'Alpaca killswitch active' : undefined });
    checks.push({ name: 'Alpaca Pause',      passed: !paused,   detail: paused   ? 'Alpaca trading paused'    : undefined });
    if (ksActive || paused) return { allowed: false, reason: ksActive ? 'Alpaca killswitch active' : 'Alpaca trading paused', checks };
  }

  const nyHour = getNYHour();
  const marketOpen = nyHour >= 9 && nyHour < 16;
  const inPremarket = nyHour >= 7 && nyHour < 9;
  const tradingAllowed = config.exchange === 'HYPERLIQUID' ? true : (marketOpen || inPremarket);
  checks.push({
    name: 'Market Hours',
    passed: tradingAllowed,
    detail: tradingAllowed ? undefined : `Market closed (NY hour: ${nyHour})`,
  });

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const todayLogs = await prisma.autoTradeLog.aggregate({
    where: {
      userSettingsId,
      executedAt: { gte: startOfDay },
      status: 'FILLED',
    },
    _sum: { pnl: true },
  });
  const dailyPnl = todayLogs._sum.pnl ?? 0;
  const dailyLossExceeded = dailyPnl <= -config.dailyLossLimit;
  checks.push({
    name: 'Daily Loss Limit',
    passed: !dailyLossExceeded,
    detail: dailyLossExceeded ? `Daily loss $${Math.abs(dailyPnl).toFixed(0)} exceeds limit $${config.dailyLossLimit}` : undefined,
  });

  if (config.currentEquity !== undefined && config.startEquity !== undefined && config.startEquity > 0) {
    const drawdownPct = ((config.startEquity - config.currentEquity) / config.startEquity) * 100;
    const drawdownExceeded = drawdownPct > config.maxDrawdownPct;
    checks.push({
      name: 'Max Drawdown',
      passed: !drawdownExceeded,
      detail: drawdownExceeded ? `Drawdown ${drawdownPct.toFixed(1)}% exceeds limit ${config.maxDrawdownPct}%` : undefined,
    });
  }

  if (config.currentOpenPositions !== undefined) {
    const posLimitOk = config.currentOpenPositions < config.maxOpenPositions;
    checks.push({
      name: 'Max Open Positions',
      passed: posLimitOk,
      detail: posLimitOk ? undefined : `${config.currentOpenPositions} positions at limit ${config.maxOpenPositions}`,
    });
  }

  const failing = checks.filter((c) => !c.passed);
  const allowed = failing.length === 0;

  return {
    allowed,
    reason: failing.map((c) => c.detail ?? c.name).join('; ') || undefined,
    checks,
  };
}
