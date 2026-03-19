import { prisma } from '../../lib/prisma';
import { detectRegime } from '../market/RegimeDetector';
import { getPositions } from './alpacaInfoService';

export interface ParameterBounds {
  stopLoss:    { min: number; max: number };
  takeProfit:  { min: number; max: number };
  conviction:  { min: number; max: number };
  positionPct: { min: number; max: number };
}

export interface AdaptiveParameters {
  stopLossPct:            number;
  takeProfitPct:          number;
  minConvictionScore:     number;
  positionSizeMultiplier: number;
  reasoning:              string[];
  regime:                 string;
  adjustedAt:             Date;
  nextAdjustAt:           Date;
}

const _adapted = new Map<string, AdaptiveParameters>();

export function getCurrentParams(userId: string): AdaptiveParameters | null {
  return _adapted.get(userId) ?? null;
}

export async function computeAdaptiveParameters(
  userId:        string,
  base:          { stopLossPct: number; takeProfitPct: number; minConvictionScore: number },
  bounds:        ParameterBounds,
  lookbackHours = 24,
): Promise<AdaptiveParameters> {

  const reasoning: string[] = [];

  // ── 1. Market Regime ────────────────────────────────────────────────────────
  const regime    = await detectRegime();
  const regimeAdj = regime.autoTraderAdjustments;

  let stopLoss   = base.stopLossPct;
  let takeProfit = base.takeProfitPct;
  let conviction = Math.max(base.minConvictionScore, regimeAdj.minConvictionOverride);
  let sizeMult   = regimeAdj.positionSizeMultiplier;

  reasoning.push(`Market regime: ${regime.regime} (VIX ${regime.vix?.toFixed(1) ?? 'N/A'})`);

  if (regime.regime === 'CHOPPY') {
    stopLoss   = Math.min(stopLoss * 0.8,   bounds.stopLoss.max);
    takeProfit = Math.min(takeProfit * 0.75, bounds.takeProfit.max);
    reasoning.push('Choppy regime → tightened stops and targets, reduced size');
  } else if (regime.regime === 'ELEVATED_VOLATILITY') {
    stopLoss   = Math.min(stopLoss * 1.3,   bounds.stopLoss.max);
    takeProfit = Math.min(takeProfit * 1.2,  bounds.takeProfit.max);
    reasoning.push('Elevated volatility → widened stops to avoid noise-outs, strict conviction');
  } else if (regime.regime === 'BULL_TREND') {
    takeProfit = Math.min(takeProfit * 1.1,  bounds.takeProfit.max);
    reasoning.push('Bull trend → extended take-profit targets');
  }

  // ── 2. Recent Trade Performance ─────────────────────────────────────────────
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings) {
    const since      = new Date(Date.now() - lookbackHours * 3_600_000);
    const recentLogs = await prisma.autoTradeLog.findMany({
      where: {
        userSettingsId: settings.id,
        exchange:       'PAPER',
        status:         { in: ['FILLED'] },
        executedAt:     { gte: since },
      },
      orderBy: { executedAt: 'desc' },
      take: 20,
    });

    if (recentLogs.length >= 3) {
      const withPnl  = recentLogs.filter(l => l.pnl !== null);
      const wins     = withPnl.filter(l => (l.pnl ?? 0) > 0);
      const losses   = withPnl.filter(l => (l.pnl ?? 0) < 0);
      const winRate  = withPnl.length > 0 ? wins.length / withPnl.length : 0.5;
      const avgWin   = wins.length   > 0 ? wins.reduce((s, l)   => s + (l.pnl ?? 0), 0) / wins.length   : 0;
      const avgLoss  = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + (l.pnl ?? 0), 0) / losses.length) : 0;
      const profitFactor = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 2 : 1);

      reasoning.push(`Last ${withPnl.length} closed trades: ${Math.round(winRate * 100)}% win rate, ${profitFactor.toFixed(2)} profit factor`);

      const last3         = withPnl.slice(0, 3);
      const recentLosses  = last3.filter(l => (l.pnl ?? 0) < 0).length;

      if (recentLosses >= 3) {
        stopLoss   = Math.max(stopLoss * 0.7,   bounds.stopLoss.min);
        takeProfit = Math.max(takeProfit * 0.8,  bounds.takeProfit.min);
        conviction = Math.min(conviction + 5,    bounds.conviction.max);
        sizeMult   = Math.max(sizeMult * 0.6,    bounds.positionPct.min);
        reasoning.push('3 consecutive losses → tightened stops, raised conviction bar, reduced size');
      } else if (last3.every(l => (l.pnl ?? 0) > 0) && profitFactor > 1.8) {
        takeProfit = Math.min(takeProfit * 1.1,  bounds.takeProfit.max);
        sizeMult   = Math.min(sizeMult * 1.1,    bounds.positionPct.max);
        reasoning.push('3 consecutive wins with strong profit factor → extended targets, slight size increase');
      }

      if (profitFactor < 1.0 && withPnl.length >= 5) {
        conviction = Math.min(conviction + 4, bounds.conviction.max);
        reasoning.push(`Low profit factor (${profitFactor.toFixed(2)}) → raised conviction threshold`);
      }
    } else if (recentLogs.length === 0) {
      reasoning.push('No recent trades — using base parameters');
    }
  }

  // ── 3. Current Open Position P&L ────────────────────────────────────────────
  try {
    const openPositions = await getPositions();
    if (openPositions.length > 0) {
      const totalPnlPct = openPositions.reduce((sum, p) => {
        return sum + parseFloat((p as any).unrealized_plpc ?? '0') * 100;
      }, 0) / openPositions.length;

      if (totalPnlPct < -2.5) {
        conviction = Math.min(conviction + 5, bounds.conviction.max);
        sizeMult   = Math.max(sizeMult * 0.7, bounds.positionPct.min);
        reasoning.push(`Open positions avg -${Math.abs(totalPnlPct).toFixed(1)}% → raised bar and reduced new size`);
      } else if (totalPnlPct > 3.0) {
        takeProfit = Math.min(takeProfit * 1.05, bounds.takeProfit.max);
        reasoning.push(`Open positions avg +${totalPnlPct.toFixed(1)}% → slightly extended take-profit`);
      }
    }
  } catch {
    // position fetch can fail — ignore
  }

  // ── 4. Time of Day ──────────────────────────────────────────────────────────
  const nyHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
    10,
  );

  if (nyHour >= 9 && nyHour < 10) {
    stopLoss   = Math.max(stopLoss * 0.85, bounds.stopLoss.min);
    conviction = Math.min(conviction + 3,  bounds.conviction.max);
    reasoning.push('First 30 min of session (high spread/volatility) → tighter stops, stricter conviction');
  } else if (nyHour >= 15) {
    takeProfit = Math.max(takeProfit * 0.9, bounds.takeProfit.min);
    reasoning.push('Last hour of session → lowered take-profit targets to secure gains before close');
  } else if (nyHour >= 11 && nyHour < 14) {
    reasoning.push('Midday session — base parameters active');
  }

  // ── 5. Clamp to bounds ──────────────────────────────────────────────────────
  stopLoss   = Math.min(Math.max(stopLoss,   bounds.stopLoss.min),   bounds.stopLoss.max);
  takeProfit = Math.min(Math.max(takeProfit, bounds.takeProfit.min), bounds.takeProfit.max);
  conviction = Math.min(Math.max(Math.round(conviction), bounds.conviction.min), bounds.conviction.max);
  sizeMult   = Math.min(Math.max(sizeMult,  bounds.positionPct.min), bounds.positionPct.max);

  const result: AdaptiveParameters = {
    stopLossPct:            Math.round(stopLoss   * 10) / 10,
    takeProfitPct:          Math.round(takeProfit * 10) / 10,
    minConvictionScore:     conviction,
    positionSizeMultiplier: Math.round(sizeMult   * 100) / 100,
    reasoning,
    regime:      regime.regime,
    adjustedAt:  new Date(),
    nextAdjustAt: new Date(Date.now() + 30 * 60_000),
  };

  _adapted.set(userId, result);
  return result;
}

// ── Background loop ─────────────────────────────────────────────────────────

let _loopTimer: NodeJS.Timeout | null = null;
const _userBounds = new Map<string, { bounds: ParameterBounds; base: any }>();

export function registerUserForAdaptation(userId: string, base: any, bounds: ParameterBounds) {
  _userBounds.set(userId, { bounds, base });
}

export function unregisterUser(userId: string) {
  _userBounds.delete(userId);
  _adapted.delete(userId);
}

export function startAdaptiveLoop() {
  if (_loopTimer) return;
  console.info('[AdaptiveParams] Loop started — adjusting every 30 min during market hours');
  _loopTimer = setInterval(async () => {
    const nyHour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }),
      10,
    );
    const isMarketHours = nyHour >= 9 && nyHour < 16;
    if (!isMarketHours && nyHour !== 8) return;

    for (const [userId, { base, bounds }] of _userBounds) {
      try {
        await computeAdaptiveParameters(userId, base, bounds);
        console.info(`[AdaptiveParams] Updated params for user ${userId.slice(0, 8)}…`);
      } catch (err: any) {
        console.warn(`[AdaptiveParams] Failed for ${userId.slice(0, 8)}:`, err?.message);
      }
    }
  }, 30 * 60_000);
}

export function stopAdaptiveLoop() {
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
}
