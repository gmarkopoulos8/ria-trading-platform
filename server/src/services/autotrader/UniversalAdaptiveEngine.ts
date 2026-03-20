import { prisma } from '../../lib/prisma';
import { detectRegime } from '../market/RegimeDetector';

export type AdaptiveExchange = 'PAPER' | 'TOS' | 'HYPERLIQUID';

export interface UniversalAdaptiveBounds {
  stopLoss:    { min: number; max: number };
  takeProfit:  { min: number; max: number };
  conviction:  { min: number; max: number };
  positionPct: { min: number; max: number };
}

export interface UniversalAdaptiveParams {
  stopLossPct:            number;
  takeProfitPct:          number;
  minConvictionScore:     number;
  positionSizeMultiplier: number;
  reasoning:              string[];
  regime:                 string;
  exchange:               AdaptiveExchange;
  adjustedAt:             Date;
  nextAdjustAt:           Date;
}

const _cache = new Map<string, UniversalAdaptiveParams>();

export function getCachedAdaptive(userId: string, exchange: AdaptiveExchange): UniversalAdaptiveParams | null {
  return _cache.get(`${userId}:${exchange}`) ?? null;
}

export const DEFAULT_BOUNDS: Record<AdaptiveExchange, UniversalAdaptiveBounds> = {
  PAPER:       { stopLoss: { min: 1.5, max: 7.0 }, takeProfit: { min: 4.0, max: 25.0 }, conviction: { min: 68, max: 90 }, positionPct: { min: 0.5, max: 1.5 } },
  TOS:         { stopLoss: { min: 1.5, max: 8.0 }, takeProfit: { min: 3.0, max: 20.0 }, conviction: { min: 70, max: 92 }, positionPct: { min: 0.4, max: 1.3 } },
  HYPERLIQUID: { stopLoss: { min: 1.0, max: 6.0 }, takeProfit: { min: 2.0, max: 30.0 }, conviction: { min: 72, max: 92 }, positionPct: { min: 0.3, max: 2.0 } },
};

export async function computeAdaptive(
  userId:       string,
  exchange:     AdaptiveExchange,
  base:         { stopLossPct: number; takeProfitPct: number; minConvictionScore: number },
  bounds?:      UniversalAdaptiveBounds,
  lookbackHours = 24,
): Promise<UniversalAdaptiveParams> {

  const b = bounds ?? DEFAULT_BOUNDS[exchange];
  const reasoning: string[] = [];

  const regime    = await detectRegime();
  const regimeAdj = regime.autoTraderAdjustments;

  let stopLoss   = base.stopLossPct;
  let takeProfit = base.takeProfitPct;
  let conviction = Math.max(base.minConvictionScore, regimeAdj.minConvictionOverride);
  let sizeMult   = regimeAdj.positionSizeMultiplier;

  reasoning.push(`Market regime: ${regime.regime} (VIX ${regime.vix?.toFixed(1) ?? 'N/A'})`);

  if (regime.regime === 'BULL_TREND') {
    takeProfit = Math.min(takeProfit * 1.25, b.takeProfit.max);
    sizeMult   = Math.min(sizeMult   * 1.15, b.positionPct.max);
    conviction = Math.max(conviction - 3,    b.conviction.min);
    reasoning.push('Bull trend → targets +25%, size +15%, conviction -3');
  } else if (regime.regime === 'CHOPPY') {
    stopLoss   = Math.min(stopLoss   * 0.80, b.stopLoss.max);
    takeProfit = Math.min(takeProfit * 0.75, b.takeProfit.max);
    reasoning.push('Choppy → tightened stops and targets');
  } else if (regime.regime === 'ELEVATED_VOLATILITY') {
    stopLoss   = Math.min(stopLoss   * 1.30, b.stopLoss.max);
    takeProfit = Math.min(takeProfit * 1.20, b.takeProfit.max);
    reasoning.push('Elevated volatility → wider stops, strict conviction');
  }

  if (exchange === 'HYPERLIQUID') {
    reasoning.push('HL: applying leverage-aware sizing (crypto volatility)');
    conviction = Math.max(conviction, 75);
    if (regime.regime === 'ELEVATED_VOLATILITY') {
      sizeMult = Math.max(sizeMult * 0.7, b.positionPct.min);
      reasoning.push('HL elevated volatility → extra size reduction for crypto exposure');
    }
  }

  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (settings) {
    const since      = new Date(Date.now() - lookbackHours * 3_600_000);
    const recentLogs = await prisma.autoTradeLog.findMany({
      where: {
        userSettingsId: settings.id,
        exchange,
        status:         { in: ['FILLED', 'CLOSED'] },
        executedAt:     { gte: since },
      },
      orderBy: { executedAt: 'desc' },
      take:    20,
    });

    if (recentLogs.length >= 3) {
      const withPnl  = recentLogs.filter(l => l.pnl !== null);
      const wins     = withPnl.filter(l => (l.pnl ?? 0) > 0);
      const losses   = withPnl.filter(l => (l.pnl ?? 0) < 0);
      const winRate  = withPnl.length > 0 ? wins.length / withPnl.length : 0.5;
      const avgWin   = wins.length   > 0 ? wins.reduce((s, l) => s + (l.pnl ?? 0), 0) / wins.length   : 0;
      const avgLoss  = losses.length > 0 ? Math.abs(losses.reduce((s, l) => s + (l.pnl ?? 0), 0) / losses.length) : 0;
      const profitFactor = avgLoss > 0 ? avgWin / avgLoss : (avgWin > 0 ? 2 : 1);

      reasoning.push(`${exchange} last ${withPnl.length} trades: ${Math.round(winRate * 100)}% win rate, ${profitFactor.toFixed(2)} PF`);

      const last3        = withPnl.slice(0, 3);
      const recentLosses = last3.filter(l => (l.pnl ?? 0) < 0).length;

      if (recentLosses >= 3) {
        stopLoss   = Math.max(stopLoss   * 0.70, b.stopLoss.min);
        takeProfit = Math.max(takeProfit * 0.80, b.takeProfit.min);
        conviction = Math.min(conviction + 5,    b.conviction.max);
        sizeMult   = Math.max(sizeMult   * 0.60, b.positionPct.min);
        reasoning.push('3 consecutive losses → tightened stops, raised conviction, reduced size');
      } else if (last3.every(l => (l.pnl ?? 0) > 0) && profitFactor > 1.5) {
        takeProfit = Math.min(takeProfit * 1.20, b.takeProfit.max);
        sizeMult   = Math.min(sizeMult   * 1.20, b.positionPct.max);
        conviction = Math.max(conviction - 2,    b.conviction.min);
        reasoning.push(`3 wins, PF ${profitFactor.toFixed(2)} → targets +20%, size +20%`);
      }

      if (profitFactor < 1.3 && withPnl.length >= 4) {
        const bump = profitFactor < 0.8 ? 7 : profitFactor < 1.0 ? 5 : 3;
        conviction = Math.min(conviction + bump, b.conviction.max);
        stopLoss   = Math.max(stopLoss   * 0.90, b.stopLoss.min);
        reasoning.push(`PF ${profitFactor.toFixed(2)} < 1.3 → conviction +${bump}, tighter stops`);
      } else if (profitFactor > 2.5 && withPnl.length >= 4) {
        conviction = Math.max(conviction - 3, b.conviction.min);
        reasoning.push(`Strong PF ${profitFactor.toFixed(2)} → conviction -3 to catch more setups`);
      }
    } else {
      reasoning.push(`${exchange}: no recent trade data — using base + regime params`);
    }
  }

  const nyHour = parseInt(
    new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10
  );

  if (exchange !== 'HYPERLIQUID') {
    if (nyHour >= 9 && nyHour < 10) {
      stopLoss   = Math.max(stopLoss   * 0.85, b.stopLoss.min);
      conviction = Math.min(conviction + 3,    b.conviction.max);
      reasoning.push('First 30 min → tighter stops, stricter conviction');
    } else if (nyHour >= 15) {
      takeProfit = Math.max(takeProfit * 0.90, b.takeProfit.min);
      reasoning.push('Last hour → lowered targets to lock in gains before close');
    }
  }

  stopLoss   = Math.min(Math.max(stopLoss,   b.stopLoss.min),   b.stopLoss.max);
  takeProfit = Math.min(Math.max(takeProfit, b.takeProfit.min), b.takeProfit.max);
  conviction = Math.min(Math.max(Math.round(conviction), b.conviction.min), b.conviction.max);
  sizeMult   = Math.min(Math.max(sizeMult,  b.positionPct.min), b.positionPct.max);

  const result: UniversalAdaptiveParams = {
    stopLossPct:            Math.round(stopLoss   * 10) / 10,
    takeProfitPct:          Math.round(takeProfit * 10) / 10,
    minConvictionScore:     conviction,
    positionSizeMultiplier: Math.round(sizeMult   * 100) / 100,
    reasoning,
    regime:      regime.regime,
    exchange,
    adjustedAt:  new Date(),
    nextAdjustAt: new Date(Date.now() + 30 * 60_000),
  };

  _cache.set(`${userId}:${exchange}`, result);
  return result;
}

const _registrations = new Map<string, { userId: string; exchange: AdaptiveExchange; base: any; bounds?: UniversalAdaptiveBounds }>();
let _loopTimer: NodeJS.Timeout | null = null;

export function registerForAdaptation(userId: string, exchange: AdaptiveExchange, base: any, bounds?: UniversalAdaptiveBounds) {
  _registrations.set(`${userId}:${exchange}`, { userId, exchange, base, bounds });
}

export function startUniversalAdaptiveLoop() {
  if (_loopTimer) return;
  console.info('[UniversalAdaptive] Loop started — updating every 30 min during market hours');
  _loopTimer = setInterval(async () => {
    const nyHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
    const isMarketHours = nyHour >= 9 && nyHour < 16;
    if (!isMarketHours && nyHour !== 8) return;

    for (const [, reg] of _registrations) {
      try {
        await computeAdaptive(reg.userId, reg.exchange, reg.base, reg.bounds);
      } catch (err: any) {
        console.warn(`[UniversalAdaptive] Failed for ${reg.userId}/${reg.exchange}:`, err?.message);
      }
    }
  }, 30 * 60_000);
}

export function stopUniversalAdaptiveLoop() {
  if (_loopTimer) { clearInterval(_loopTimer); _loopTimer = null; }
}
