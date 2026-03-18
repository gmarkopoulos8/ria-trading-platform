import type {
  MarketStructureOutput, CatalystOutput, RiskOutput,
  ThesisOutput, Bias, RecommendedAction, MonitoringFrequency, HoldWindow,
  PriceZone, PriceLevel,
} from './types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function computeBias(ms: MarketStructureOutput, catalyst: CatalystOutput): Bias {
  const msSignal = ms.overallScore;
  const catSignal = catalyst.overallScore;
  const compositeScore = msSignal * 0.6 + catSignal * 0.4;

  if (compositeScore >= 60) return 'BULLISH';
  if (compositeScore <= 40) return 'BEARISH';
  return 'NEUTRAL';
}

function computeRecommendedAction(
  bias: Bias,
  conviction: number,
  risk: number
): RecommendedAction {
  if (bias === 'BULLISH') {
    if (conviction >= 75 && risk <= 40) return 'STRONG_BUY';
    if (conviction >= 55 && risk <= 60) return 'BUY';
    return 'WATCH';
  }
  if (bias === 'BEARISH') {
    if (conviction >= 75 && risk <= 40) return 'STRONG_SHORT';
    if (conviction >= 55 && risk <= 60) return 'SHORT';
    return 'AVOID';
  }
  return conviction < 40 ? 'AVOID' : 'WATCH';
}

function computeMonitoringFrequency(
  risk: RiskOutput,
  ms: MarketStructureOutput
): MonitoringFrequency {
  if (risk.overallRiskScore > 60 || risk.eventRisk.events.length > 0) return 'HOURLY';
  if (ms.volatility.level === 'HIGH' || risk.riskCategory === 'HIGH') return 'DAILY';
  return 'DAILY';
}

function computeHoldWindow(
  bias: Bias,
  ms: MarketStructureOutput,
  risk: RiskOutput
): HoldWindow {
  if (risk.overallRiskScore > 65) return '1-3 DAYS';
  if (ms.volatility.level === 'HIGH') return '1-2 WEEKS';
  if (bias === 'NEUTRAL') return '1-2 WEEKS';
  if (ms.trend.strength === 'STRONG') return '1-3 MONTHS';
  if (ms.trend.strength === 'MODERATE') return '2-4 WEEKS';
  return '1-2 WEEKS';
}

function computeEntryZone(ms: MarketStructureOutput, bias: Bias): PriceZone {
  const price = ms.currentPrice;
  const support = ms.supportResistance.nearestSupport;

  if (bias === 'BULLISH' && support !== null) {
    const low = Math.round(Math.max(support * 1.005, price * 0.985) * 100) / 100;
    const high = Math.round(price * 1.01 * 100) / 100;
    return { low, high, description: `Entry on retest of $${support.toFixed(2)} support to current price` };
  }
  if (bias === 'BEARISH' && ms.supportResistance.nearestResistance !== null) {
    const resistance = ms.supportResistance.nearestResistance;
    const low = Math.round(price * 0.99 * 100) / 100;
    const high = Math.round(Math.min(resistance * 0.995, price * 1.015) * 100) / 100;
    return { low, high, description: `Short entry below resistance at $${resistance.toFixed(2)}` };
  }

  const low = Math.round(price * 0.98 * 100) / 100;
  const high = Math.round(price * 1.01 * 100) / 100;
  return { low, high, description: 'Entry near current market price' };
}

function computeInvalidation(ms: MarketStructureOutput, bias: Bias): PriceLevel {
  const price = ms.currentPrice;
  const support = ms.supportResistance.nearestSupport;
  const resistance = ms.supportResistance.nearestResistance;

  if (bias === 'BULLISH' && support !== null) {
    const level = Math.round(support * 0.98 * 100) / 100;
    return { level, description: `Close below $${level.toFixed(2)} negates bullish thesis` };
  }
  if (bias === 'BEARISH' && resistance !== null) {
    const level = Math.round(resistance * 1.02 * 100) / 100;
    return { level, description: `Close above $${level.toFixed(2)} negates bearish thesis` };
  }

  const level = bias === 'BULLISH'
    ? Math.round(price * 0.95 * 100) / 100
    : Math.round(price * 1.05 * 100) / 100;
  return { level, description: `Invalidation at $${level.toFixed(2)} (5% stop)` };
}

function computeTakeProfits(ms: MarketStructureOutput, bias: Bias): [PriceLevel, PriceLevel] {
  const price = ms.currentPrice;
  const resistance = ms.supportResistance.nearestResistance;
  const support = ms.supportResistance.nearestSupport;

  if (bias === 'BULLISH') {
    const tp1Level = resistance ?? Math.round(price * 1.08 * 100) / 100;
    const tp2Level = Math.round(tp1Level * 1.08 * 100) / 100;
    return [
      { level: tp1Level, description: `TP1: $${tp1Level.toFixed(2)} at resistance` },
      { level: tp2Level, description: `TP2: $${tp2Level.toFixed(2)} extended target` },
    ];
  }

  const tp1Level = support ?? Math.round(price * 0.92 * 100) / 100;
  const tp2Level = Math.round(tp1Level * 0.92 * 100) / 100;
  return [
    { level: tp1Level, description: `TP1: $${tp1Level.toFixed(2)} at support` },
    { level: tp2Level, description: `TP2: $${tp2Level.toFixed(2)} extended downside target` },
  ];
}

function buildSupportingReasons(ms: MarketStructureOutput, catalyst: CatalystOutput, bias: Bias): string[] {
  const reasons: string[] = [];

  if (ms.trend.direction === bias && ms.trend.strength !== 'WEAK') {
    reasons.push(`${ms.trend.direction} trend with ${ms.trend.strength.toLowerCase()} conviction`);
  }
  if (ms.momentum.score >= 60 && bias === 'BULLISH') {
    reasons.push('Positive momentum — RSI and MACD supporting upside');
  } else if (ms.momentum.score <= 40 && bias === 'BEARISH') {
    reasons.push('Negative momentum — RSI and MACD confirming downside pressure');
  }
  if (ms.patterns.dominant) {
    reasons.push(`${ms.patterns.dominant} pattern detected (${ms.patterns.detected.length} total)`);
  }
  if (catalyst.overallScore >= 60 && bias === 'BULLISH') {
    reasons.push(`Positive catalyst backdrop: ${catalyst.bullishCatalysts} bullish events`);
  } else if (catalyst.overallScore <= 40 && bias === 'BEARISH') {
    reasons.push(`Negative catalyst backdrop: ${catalyst.bearishCatalysts} bearish events`);
  }
  if (ms.multiTimeframeAlignment.score >= 70) {
    reasons.push('Strong multi-indicator alignment confirms directional bias');
  }
  if (ms.supportResistance.nearestSupport !== null && bias === 'BULLISH') {
    reasons.push(`Support at $${ms.supportResistance.nearestSupport.toFixed(2)} provides clear risk anchor`);
  }
  if (catalyst.sourceCredibility.avgQuality >= 80) {
    reasons.push(`High-quality sources (${catalyst.sourceCredibility.avgQuality}% avg) confirm narrative`);
  }

  return reasons.slice(0, 5);
}

function buildMonitoringPriorities(ms: MarketStructureOutput, risk: RiskOutput, catalyst: CatalystOutput): string[] {
  const priorities: string[] = [];

  if (risk.invalidationClarity.level !== null) {
    priorities.push(`Watch invalidation at $${risk.invalidationClarity.level.toFixed(2)}`);
  }
  if (catalyst.urgency.urgentCount > 0) {
    priorities.push('Monitor high-urgency catalyst developments');
  }
  if (ms.volatility.level === 'HIGH') {
    priorities.push('Track volatility — consider scaled position sizing');
  }
  if (ms.momentum.rsi !== null && (ms.momentum.rsi > 65 || ms.momentum.rsi < 35)) {
    priorities.push(`RSI at ${ms.momentum.rsi.toFixed(0)} — monitor for momentum reversal`);
  }
  if (risk.eventRisk.events.length > 0) {
    priorities.push(`Monitor event risk: ${risk.eventRisk.events[0]}`);
  }
  priorities.push('Re-evaluate thesis if price action invalidates key levels');

  return priorities.slice(0, 4);
}

function buildThesisSummary(
  ticker: string, bias: Bias, conviction: number, action: RecommendedAction,
  ms: MarketStructureOutput, catalyst: CatalystOutput, risk: RiskOutput
): string {
  const actionMap: Record<RecommendedAction, string> = {
    STRONG_BUY: 'strong buy setup', BUY: 'buy opportunity', WATCH: 'watchlist candidate',
    AVOID: 'avoid — unfavorable risk', SHORT: 'short opportunity', STRONG_SHORT: 'strong short setup',
  };
  const biasText = bias === 'BULLISH' ? 'bullish' : bias === 'BEARISH' ? 'bearish' : 'neutral';
  const convText = conviction >= 75 ? 'high' : conviction >= 50 ? 'moderate' : 'low';

  return `${ticker} presents a ${actionMap[action]} with ${convText} conviction (${conviction}/100). ` +
    `Market structure is ${biasText} with a technical score of ${ms.overallScore}/100. ` +
    `Catalyst environment is ${catalyst.catalystBias.toLowerCase()} (${catalyst.overallScore}/100). ` +
    `Risk profile: ${risk.riskCategory} (${risk.overallRiskScore}/100). ` +
    `${risk.rewardRiskStructure.acceptable ? `Favorable R:R of ${risk.rewardRiskStructure.ratio}:1.` : 'R:R needs improvement.'}`;
}

export function runThesisAgent(
  ms: MarketStructureOutput,
  catalyst: CatalystOutput,
  risk: RiskOutput
): ThesisOutput {
  const bias = computeBias(ms, catalyst);

  const convictionScore = clamp(
    ms.overallScore * 0.50 +
    catalyst.overallScore * 0.30 +
    (100 - risk.overallRiskScore) * 0.20
  );

  const confidenceScore = clamp(
    ms.multiTimeframeAlignment.score * 0.30 +
    catalyst.sourceCredibility.score * 0.25 +
    (bias === ms.overallSignal ? 80 : 40) * 0.25 +
    risk.invalidationClarity.score * 0.20
  );

  const riskScore = risk.overallRiskScore;
  const volatilityScore = clamp(ms.volatility.atrPercent !== null ? ms.volatility.atrPercent * 8 : 40);
  const bullishScore = ms.bullishScore;
  const bearishScore = ms.bearishScore;

  const thesisHealthScore = clamp(
    convictionScore * 0.35 +
    confidenceScore * 0.25 +
    (100 - riskScore) * 0.20 +
    (risk.rewardRiskStructure.acceptable ? 85 : 40) * 0.10 +
    risk.invalidationClarity.score * 0.10
  );

  const recommendedAction = computeRecommendedAction(bias, convictionScore, riskScore);
  const monitoringFrequency = computeMonitoringFrequency(risk, ms);
  const suggestedHoldWindow = computeHoldWindow(bias, ms, risk);
  const entryZone = computeEntryZone(ms, bias);
  const invalidationZone = computeInvalidation(ms, bias);
  const [takeProfit1, takeProfit2] = computeTakeProfits(ms, bias);

  const supportingReasons = buildSupportingReasons(ms, catalyst, bias);
  const monitoringPriorities = buildMonitoringPriorities(ms, risk, catalyst);
  const thesisSummary = buildThesisSummary(ms.ticker, bias, convictionScore, recommendedAction, ms, catalyst, risk);
  const mainRiskToThesis = risk.mainRisks[0] ?? 'Unexpected market reversal';

  const actionMap: Record<RecommendedAction, string> = {
    STRONG_BUY: 'Strong buy signal',
    BUY: 'Buy signal',
    WATCH: 'Watch — await confirmation',
    AVOID: 'Avoid — unfavorable conditions',
    SHORT: 'Short signal',
    STRONG_SHORT: 'Strong short signal',
  };

  const explanation =
    `Thesis synthesized from market structure (${ms.overallScore}/100), ` +
    `catalysts (${catalyst.overallScore}/100), and risk analysis (risk: ${riskScore}/100). ` +
    `${actionMap[recommendedAction]}. ` +
    `Entry: $${entryZone.low.toFixed(2)}–$${entryZone.high.toFixed(2)}, ` +
    `invalidation: $${invalidationZone.level.toFixed(2)}, ` +
    `TP1: $${takeProfit1.level.toFixed(2)}, TP2: $${takeProfit2.level.toFixed(2)}. ` +
    `Hold window: ${suggestedHoldWindow}. ` +
    `Monitor: ${monitoringFrequency.toLowerCase()}.`;

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 4 * 60 * 60 * 1000);

  return {
    symbol: ms.ticker,
    bias,
    convictionScore,
    confidenceScore,
    riskScore,
    volatilityScore,
    bullishScore,
    bearishScore,
    thesisHealthScore,
    monitoringFrequency,
    entryZone,
    invalidationZone,
    takeProfit1,
    takeProfit2,
    suggestedHoldWindow,
    thesisSummary,
    supportingReasons,
    mainRiskToThesis,
    monitoringPriorities,
    recommendedAction,
    explanation,
    marketStructureScore: ms.overallScore,
    catalystScore: catalyst.overallScore,
    generatedAt: now,
    expiresAt,
  };
}
