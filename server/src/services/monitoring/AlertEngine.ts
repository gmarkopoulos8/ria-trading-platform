import type { FullThesisResult } from '../thesis/types';

export type MonitorAlertSeverity = 'INFO' | 'CAUTION' | 'WARNING' | 'CRITICAL';
export type MonitorAlertType =
  | 'ENTRY_ZONE_REACHED'
  | 'BREAKOUT_CONFIRMED'
  | 'SUPPORT_LOST'
  | 'MOMENTUM_ACCELERATING'
  | 'MOMENTUM_FADING'
  | 'MAJOR_NEWS_DETECTED'
  | 'EVENT_RISK_ELEVATED'
  | 'INVALIDATION_THREATENED'
  | 'TARGET_APPROACHED'
  | 'HOLD_WINDOW_NEARLY_EXHAUSTED'
  | 'SETUP_INVALIDATED'
  | 'THESIS_HEALTH_IMPROVED'
  | 'THESIS_HEALTH_DETERIORATED'
  | 'OPTIONS_DELTA_DEGRADED'
  | 'OPTIONS_THETA_ACCELERATING'
  | 'OPTIONS_IV_COLLAPSED'
  | 'OPTIONS_EXPIRING_SOON';

export type RecommendedPositionAction =
  | 'HOLD'
  | 'HOLD_WITH_CAUTION'
  | 'TRIM_INTO_STRENGTH'
  | 'TIGHTEN_INVALIDATION'
  | 'TAKE_PARTIAL_PROFITS'
  | 'CLOSE_POSITION'
  | 'SETUP_INVALIDATED';

export interface AlertTrigger {
  type: MonitorAlertType;
  severity: MonitorAlertSeverity;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface MonitoringSnapshot {
  currentPrice: number;
  thesisHealth: number;
  recommendedAction: RecommendedPositionAction;
  technicalScore: number;
  catalystScore: number;
  riskScore: number;
  targetProximityPct: number | null;
  stopProximityPct: number | null;
  holdWindowPct: number | null;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  alerts: AlertTrigger[];
  previousThesisHealth: number | null;
}

interface PositionContext {
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  openedAt: Date;
  previousThesisHealth: number | null;
}

function pct(a: number, b: number): number {
  if (b === 0) return 0;
  return ((a - b) / b) * 100;
}

function proximityPct(current: number, level: number, side: 'LONG' | 'SHORT', isTarget: boolean): number {
  if (isTarget) {
    return side === 'LONG'
      ? ((level - current) / level) * 100
      : ((current - level) / level) * 100;
  } else {
    return side === 'LONG'
      ? ((current - level) / current) * 100
      : ((level - current) / current) * 100;
  }
}

export function evaluateAlerts(
  position: PositionContext,
  thesis: FullThesisResult,
  currentPrice: number,
): MonitoringSnapshot {
  const { side, entryPrice, targetPrice, stopLoss, openedAt, previousThesisHealth } = position;
  const { thesis: t, marketStructure: ms, catalysts: cat, risk } = thesis;

  const thesisHealth = t.thesisHealthScore;
  const technicalScore = ms.overallScore;
  const catalystScore = cat.overallScore;
  const riskScore = risk.overallRiskScore;

  const dir = side === 'LONG' ? 1 : -1;
  const unrealizedPnl = (currentPrice - entryPrice) * dir;
  const unrealizedPnlPct = ((currentPrice - entryPrice) / entryPrice) * 100 * dir;

  const nowMs = Date.now();
  const openMs = openedAt.getTime();
  const holdWindowDays = parseDays(t.suggestedHoldWindow);
  const elapsedDays = (nowMs - openMs) / (1000 * 60 * 60 * 24);
  const holdWindowPct = holdWindowDays > 0 ? Math.min((elapsedDays / holdWindowDays) * 100, 100) : null;

  const targetProximityPct = targetPrice !== null
    ? Math.max(0, proximityPct(currentPrice, targetPrice, side, true))
    : null;

  const stopProximityPct = stopLoss !== null
    ? Math.max(0, proximityPct(currentPrice, stopLoss, side, false))
    : null;

  const entryZoneLow = t.entryZone.low;
  const entryZoneHigh = t.entryZone.high;

  const alerts: AlertTrigger[] = [];

  const invalidationLevel = t.invalidationZone.level;
  const targetLevel = targetPrice ?? t.takeProfit1.level;
  const stopLevel = stopLoss ?? t.invalidationZone.level;

  const stopDistPct = Math.abs(pct(currentPrice, stopLevel));
  const targetDistPct = Math.abs(pct(targetLevel, currentPrice));

  if (side === 'LONG') {
    if (currentPrice <= stopLevel) {
      alerts.push({
        type: 'SETUP_INVALIDATED',
        severity: 'CRITICAL',
        title: 'Setup Invalidated',
        message: `${position.symbol} has crossed the invalidation level at ${formatPrice(invalidationLevel)}. The long thesis is invalidated.`,
        metadata: { currentPrice, invalidationLevel },
      });
    } else if (stopDistPct <= 2) {
      alerts.push({
        type: 'INVALIDATION_THREATENED',
        severity: 'WARNING',
        title: 'Invalidation Threatened',
        message: `${position.symbol} is within ${stopDistPct.toFixed(1)}% of the stop/invalidation level (${formatPrice(stopLevel)}).`,
        metadata: { currentPrice, stopLevel, stopDistPct },
      });
    }
    if (currentPrice >= targetLevel) {
      alerts.push({
        type: 'TARGET_APPROACHED',
        severity: 'INFO',
        title: 'Target Reached',
        message: `${position.symbol} has reached the target price of ${formatPrice(targetLevel)}. Consider taking profits.`,
        metadata: { currentPrice, targetLevel },
      });
    } else if (targetDistPct <= 3) {
      alerts.push({
        type: 'TARGET_APPROACHED',
        severity: 'CAUTION',
        title: 'Approaching Target',
        message: `${position.symbol} is within ${targetDistPct.toFixed(1)}% of the target (${formatPrice(targetLevel)}). Prepare to trim or close.`,
        metadata: { currentPrice, targetLevel, targetDistPct },
      });
    }
    if (currentPrice >= entryZoneLow && currentPrice <= entryZoneHigh && elapsedDays < 0.5) {
      alerts.push({
        type: 'ENTRY_ZONE_REACHED',
        severity: 'INFO',
        title: 'Entry Zone Active',
        message: `${position.symbol} is trading within the ideal entry zone (${formatPrice(entryZoneLow)}–${formatPrice(entryZoneHigh)}).`,
        metadata: { currentPrice, entryZoneLow, entryZoneHigh },
      });
    }
  } else {
    if (currentPrice >= stopLevel) {
      alerts.push({
        type: 'SETUP_INVALIDATED',
        severity: 'CRITICAL',
        title: 'Short Setup Invalidated',
        message: `${position.symbol} has crossed the invalidation level at ${formatPrice(invalidationLevel)}. The short thesis is invalidated.`,
        metadata: { currentPrice, invalidationLevel },
      });
    } else if (stopDistPct <= 2) {
      alerts.push({
        type: 'INVALIDATION_THREATENED',
        severity: 'WARNING',
        title: 'Short Invalidation Threatened',
        message: `${position.symbol} is within ${stopDistPct.toFixed(1)}% of the short stop level (${formatPrice(stopLevel)}).`,
        metadata: { currentPrice, stopLevel, stopDistPct },
      });
    }
    if (currentPrice <= targetLevel) {
      alerts.push({
        type: 'TARGET_APPROACHED',
        severity: 'INFO',
        title: 'Short Target Reached',
        message: `${position.symbol} has reached the short target of ${formatPrice(targetLevel)}. Consider covering.`,
        metadata: { currentPrice, targetLevel },
      });
    } else if (targetDistPct <= 3) {
      alerts.push({
        type: 'TARGET_APPROACHED',
        severity: 'CAUTION',
        title: 'Approaching Short Target',
        message: `${position.symbol} is within ${targetDistPct.toFixed(1)}% of the short target (${formatPrice(targetLevel)}).`,
        metadata: { currentPrice, targetLevel, targetDistPct },
      });
    }
  }

  if (holdWindowPct !== null && holdWindowPct >= 85) {
    alerts.push({
      type: 'HOLD_WINDOW_NEARLY_EXHAUSTED',
      severity: 'CAUTION',
      title: 'Hold Window Nearing End',
      message: `${position.symbol} has been held for ${elapsedDays.toFixed(1)} days (${holdWindowPct.toFixed(0)}% of the suggested ${t.suggestedHoldWindow} window). Consider exiting.`,
      metadata: { elapsedDays, holdWindowDays, holdWindowPct },
    });
  }

  if (technicalScore >= 75 && dir === 1) {
    alerts.push({
      type: 'MOMENTUM_ACCELERATING',
      severity: 'INFO',
      title: 'Momentum Accelerating',
      message: `Technical score for ${position.symbol} is ${technicalScore}/100 — strong bullish momentum. Consider holding or adding.`,
      metadata: { technicalScore },
    });
  } else if (technicalScore <= 35 && dir === 1) {
    alerts.push({
      type: 'MOMENTUM_FADING',
      severity: 'CAUTION',
      title: 'Bullish Momentum Fading',
      message: `Technical score for ${position.symbol} dropped to ${technicalScore}/100. Bullish momentum may be weakening.`,
      metadata: { technicalScore },
    });
  } else if (technicalScore >= 75 && dir === -1) {
    alerts.push({
      type: 'MOMENTUM_FADING',
      severity: 'CAUTION',
      title: 'Bearish Momentum Weakening',
      message: `Technical score for ${position.symbol} is ${technicalScore}/100 — bearish momentum in short may be fading.`,
      metadata: { technicalScore },
    });
  } else if (technicalScore <= 35 && dir === -1) {
    alerts.push({
      type: 'MOMENTUM_ACCELERATING',
      severity: 'INFO',
      title: 'Bearish Momentum Accelerating',
      message: `Technical score for ${position.symbol} is ${technicalScore}/100 — strong bearish momentum. Short thesis strengthening.`,
      metadata: { technicalScore },
    });
  }

  if (cat.overallScore >= 80) {
    alerts.push({
      type: 'MAJOR_NEWS_DETECTED',
      severity: 'CAUTION',
      title: 'Major Catalyst Detected',
      message: `${position.symbol} catalyst score spiked to ${cat.overallScore}/100 — ${cat.summary}`,
      metadata: { catalystScore: cat.overallScore, summary: cat.summary },
    });
  }

  if (risk.overallRiskScore >= 80) {
    alerts.push({
      type: 'EVENT_RISK_ELEVATED',
      severity: 'WARNING',
      title: 'Event Risk Elevated',
      message: `Risk score for ${position.symbol} is ${risk.overallRiskScore}/100 — ${risk.mainRisks.slice(0, 2).join('; ')}.`,
      metadata: { riskScore: risk.overallRiskScore, mainRisks: risk.mainRisks },
    });
  }

  if (previousThesisHealth !== null) {
    const delta = thesisHealth - previousThesisHealth;
    if (delta >= 15) {
      alerts.push({
        type: 'THESIS_HEALTH_IMPROVED',
        severity: 'INFO',
        title: 'Thesis Health Improved',
        message: `${position.symbol} thesis health improved by ${delta.toFixed(0)} points to ${thesisHealth.toFixed(0)}/100.`,
        metadata: { thesisHealth, previousThesisHealth, delta },
      });
    } else if (delta <= -15) {
      alerts.push({
        type: 'THESIS_HEALTH_DETERIORATED',
        severity: 'WARNING',
        title: 'Thesis Health Deteriorated',
        message: `${position.symbol} thesis health dropped by ${Math.abs(delta).toFixed(0)} points to ${thesisHealth.toFixed(0)}/100.`,
        metadata: { thesisHealth, previousThesisHealth, delta },
      });
    }
  }

  const recommendedAction = computeRecommendedAction({
    side,
    thesisHealth,
    technicalScore,
    stopDistPct,
    targetDistPct,
    holdWindowPct,
    riskScore,
    hasInvalidation: alerts.some((a) => a.type === 'SETUP_INVALIDATED'),
  });

  return {
    currentPrice,
    thesisHealth,
    recommendedAction,
    technicalScore,
    catalystScore,
    riskScore,
    targetProximityPct,
    stopProximityPct,
    holdWindowPct,
    unrealizedPnl,
    unrealizedPnlPct,
    alerts,
    previousThesisHealth,
  };
}

function computeRecommendedAction(ctx: {
  side: 'LONG' | 'SHORT';
  thesisHealth: number;
  technicalScore: number;
  stopDistPct: number;
  targetDistPct: number;
  holdWindowPct: number | null;
  riskScore: number;
  hasInvalidation: boolean;
}): RecommendedPositionAction {
  const { thesisHealth, stopDistPct, targetDistPct, holdWindowPct, riskScore, hasInvalidation } = ctx;

  if (hasInvalidation) return 'SETUP_INVALIDATED';
  if (stopDistPct <= 1.5) return 'CLOSE_POSITION';
  if (thesisHealth <= 25) return 'CLOSE_POSITION';
  if (targetDistPct <= 1) return 'TAKE_PARTIAL_PROFITS';
  if (targetDistPct <= 5) return 'TRIM_INTO_STRENGTH';
  if (holdWindowPct !== null && holdWindowPct >= 90) return 'CLOSE_POSITION';
  if (stopDistPct <= 3 || thesisHealth <= 40) return 'TIGHTEN_INVALIDATION';
  if (riskScore >= 75 || thesisHealth <= 50) return 'HOLD_WITH_CAUTION';
  return 'HOLD';
}

function parseDays(holdWindow: string): number {
  const lower = holdWindow.toLowerCase();
  const match = lower.match(/(\d+)\s*(day|week|month)/);
  if (!match) return 14;
  const n = parseInt(match[1], 10);
  if (match[2] === 'day') return n;
  if (match[2] === 'week') return n * 7;
  if (match[2] === 'month') return n * 30;
  return 14;
}

function formatPrice(p: number): string {
  return p >= 1000
    ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
