import type { TechnicalAnalysisResult, PatternAnalysisResult, SignalDirection } from '../technical/types';
import type { MarketStructureOutput, AgentSubScore } from './types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreChartStructure(ta: TechnicalAnalysisResult): AgentSubScore {
  const signals: string[] = [];
  let score = 50;

  if (ta.trend.priceVsSma200 === 'ABOVE') { score += 15; signals.push('Price above 200 SMA — long-term uptrend intact'); }
  else if (ta.trend.priceVsSma200 === 'BELOW') { score -= 15; signals.push('Price below 200 SMA — long-term downtrend'); }
  if (ta.trend.priceVsSma50 === 'ABOVE') { score += 10; signals.push('Price above 50 SMA — medium-term bullish'); }
  else if (ta.trend.priceVsSma50 === 'BELOW') { score -= 10; signals.push('Price below 50 SMA — medium-term bearish'); }
  if (ta.trend.priceVsSma20 === 'ABOVE') { score += 5; signals.push('Price above 20 SMA — short-term momentum positive'); }
  else if (ta.trend.priceVsSma20 === 'BELOW') { score -= 5; signals.push('Price below 20 SMA — short-term momentum negative'); }
  if (ta.trend.strength === 'STRONG') { score += 10; signals.push('Strong trend conviction'); }
  else if (ta.trend.strength === 'WEAK') { score -= 5; signals.push('Weak trend — indecisive structure'); }

  return { score: clamp(score), signals, description: ta.trend.explanation };
}

function scoreTrend(ta: TechnicalAnalysisResult): MarketStructureOutput['trend'] {
  const signals: string[] = [];
  let score = 50;

  if (ta.trend.direction === 'BULLISH') { score += 25; signals.push('Upward trend confirmed'); }
  else if (ta.trend.direction === 'BEARISH') { score -= 25; signals.push('Downward trend confirmed'); }

  if (ta.trend.slopeAngle > 20) { score += 10; signals.push(`Steep upward slope (${ta.trend.slopeAngle}°)`); }
  else if (ta.trend.slopeAngle < -20) { score -= 10; signals.push(`Steep downward slope (${ta.trend.slopeAngle}°)`); }

  signals.push(ta.trend.explanation);

  return {
    score: clamp(score),
    signals,
    description: `${ta.trend.direction} trend (${ta.trend.strength})`,
    direction: ta.trend.direction,
    strength: ta.trend.strength,
  };
}

function scoreSupportResistance(ta: TechnicalAnalysisResult): MarketStructureOutput['supportResistance'] {
  const signals: string[] = [];
  let score = 50;
  const { supports, resistances, nearestSupport, nearestResistance } = ta.supportResistance;
  const price = ta.currentPrice;

  if (supports.length >= 3) { score += 10; signals.push(`${supports.length} support levels identified`); }
  else if (supports.length === 0) { score -= 10; signals.push('No clear support — elevated breakdown risk'); }

  if (nearestSupport !== null) {
    const distPct = ((price - nearestSupport) / price) * 100;
    if (distPct < 3) { score += 15; signals.push(`Tight support at $${nearestSupport.toFixed(2)} (${distPct.toFixed(1)}% away)`); }
    else if (distPct < 8) { score += 5; signals.push(`Support at $${nearestSupport.toFixed(2)} (${distPct.toFixed(1)}% away)`); }
    else { score -= 5; signals.push(`Support distant at $${nearestSupport.toFixed(2)} (${distPct.toFixed(1)}% away)`); }
  }

  if (nearestResistance !== null) {
    const distPct = ((nearestResistance - price) / price) * 100;
    if (distPct > 15) { score += 10; signals.push(`Wide upside to resistance at $${nearestResistance.toFixed(2)}`); }
    else if (distPct < 3) { score -= 10; signals.push(`Resistance overhead at $${nearestResistance.toFixed(2)} — constrained upside`); }
  }

  if (resistances.length === 0 && ta.trend.direction === 'BULLISH') {
    score += 5; signals.push('No clear resistance overhead — open runway');
  }

  signals.push(ta.supportResistance.explanation);

  return {
    score: clamp(score),
    signals,
    description: `${supports.length}S / ${resistances.length}R levels`,
    nearestSupport,
    nearestResistance,
  };
}

function scoreMomentum(ta: TechnicalAnalysisResult): MarketStructureOutput['momentum'] {
  const signals: string[] = [];
  let score = 50;

  const rsi = ta.rsi.value;
  if (rsi !== null) {
    if (rsi > 70) { score -= 10; signals.push(`RSI overbought (${rsi.toFixed(0)}) — pullback risk`); }
    else if (rsi > 55) { score += 15; signals.push(`RSI in bullish territory (${rsi.toFixed(0)})`); }
    else if (rsi < 30) { score += 10; signals.push(`RSI oversold (${rsi.toFixed(0)}) — potential reversal`); }
    else if (rsi < 45) { score -= 15; signals.push(`RSI in bearish territory (${rsi.toFixed(0)})`); }
    else { score += 5; signals.push(`RSI neutral (${rsi.toFixed(0)})`); }
  }

  if (ta.macd.signal === 'BULLISH') { score += 15; signals.push('MACD bullish crossover active'); }
  else if (ta.macd.signal === 'BEARISH') { score -= 15; signals.push('MACD bearish crossover active'); }

  if (ta.macd.histogram !== null && ta.macd.histogram > 0) {
    score += 5; signals.push(`MACD histogram expanding positive (${ta.macd.histogram.toFixed(4)})`);
  } else if (ta.macd.histogram !== null && ta.macd.histogram < 0) {
    score -= 5; signals.push(`MACD histogram negative (${ta.macd.histogram.toFixed(4)})`);
  }

  signals.push(ta.rsi.explanation);

  return {
    score: clamp(score),
    signals,
    description: `RSI: ${rsi?.toFixed(0) ?? '—'} | MACD: ${ta.macd.signal}`,
    rsi,
    macdSignal: ta.macd.signal,
  };
}

function scoreVolatility(ta: TechnicalAnalysisResult): MarketStructureOutput['volatility'] {
  const signals: string[] = [];
  let score = 50;
  const atrPct = ta.atr.valuePercent;

  if (atrPct !== null) {
    if (atrPct > 8) { score -= 20; signals.push(`Very high ATR (${atrPct.toFixed(1)}%) — extreme volatility, elevated stop-out risk`); }
    else if (atrPct > 4) { score -= 5; signals.push(`Elevated ATR (${atrPct.toFixed(1)}%) — increased volatility`); }
    else if (atrPct < 1.5) { score += 15; signals.push(`Low ATR (${atrPct.toFixed(1)}%) — stable conditions`); }
    else { score += 5; signals.push(`Moderate ATR (${atrPct.toFixed(1)}%)`); }
  }

  if (ta.volume.trend === 'SPIKE') { score -= 10; signals.push('Volume spike — potential climax or breakout move'); }
  else if (ta.volume.ratio > 1.5) { score += 5; signals.push('Above-average volume confirming move'); }

  signals.push(ta.atr.explanation);

  return {
    score: clamp(score),
    signals,
    description: `${ta.atr.volatility} volatility (ATR ${atrPct?.toFixed(1) ?? '—'}%)`,
    level: ta.atr.volatility,
    atrPercent: atrPct,
  };
}

function scorePatterns(patterns: PatternAnalysisResult): MarketStructureOutput['patterns'] {
  const signals: string[] = [];
  let score = 50;
  const detected: string[] = patterns.patterns.map((p) => p.type.replace(/_/g, ' '));
  const dominant = patterns.dominantPattern;

  for (const p of patterns.patterns) {
    if (p.direction === 'BULLISH' && p.confidence > 0.6) {
      score += Math.round(p.confidence * 15);
      signals.push(`${p.type.replace(/_/g, ' ')} (bullish, ${Math.round(p.confidence * 100)}% confidence)`);
    } else if (p.direction === 'BEARISH' && p.confidence > 0.6) {
      score -= Math.round(p.confidence * 15);
      signals.push(`${p.type.replace(/_/g, ' ')} (bearish, ${Math.round(p.confidence * 100)}% confidence)`);
    }
  }

  if (patterns.patterns.length === 0) {
    signals.push('No significant chart patterns detected');
  }

  return {
    score: clamp(score),
    signals,
    description: dominant ? `Dominant: ${dominant.type.replace(/_/g, ' ')}` : 'No dominant pattern',
    detected,
    dominant: dominant?.type.replace(/_/g, ' ') ?? null,
  };
}

function scoreMultiTimeframeAlignment(ta: TechnicalAnalysisResult): AgentSubScore {
  const signals: string[] = [];
  let score = 50;

  const bullishCount = [
    ta.trend.direction === 'BULLISH',
    ta.trend.priceVsSma20 === 'ABOVE',
    ta.trend.priceVsSma50 === 'ABOVE',
    ta.trend.priceVsSma200 === 'ABOVE',
    ta.macd.signal === 'BULLISH',
    (ta.rsi.value ?? 50) > 50,
  ].filter(Boolean).length;

  const bearishCount = 6 - bullishCount;

  if (bullishCount >= 5) { score = 90; signals.push('Strong multi-indicator bullish alignment'); }
  else if (bullishCount >= 4) { score = 75; signals.push('Most indicators bullish — good alignment'); }
  else if (bullishCount === 3) { score = 55; signals.push('Mixed signals — partial alignment'); }
  else if (bearishCount >= 5) { score = 10; signals.push('Strong multi-indicator bearish alignment'); }
  else { score = 25; signals.push('Mostly bearish alignment across indicators'); }

  signals.push(`${bullishCount}/6 indicators bullish, ${bearishCount}/6 bearish`);

  return { score: clamp(score), signals, description: `${bullishCount}/6 indicators aligned bullish` };
}

export function runMarketStructureAgent(
  ta: TechnicalAnalysisResult,
  patterns: PatternAnalysisResult
): MarketStructureOutput {
  const chartStructure = scoreChartStructure(ta);
  const trend = scoreTrend(ta);
  const supportResistance = scoreSupportResistance(ta);
  const momentum = scoreMomentum(ta);
  const volatility = scoreVolatility(ta);
  const patternsScore = scorePatterns(patterns);
  const multiTimeframeAlignment = scoreMultiTimeframeAlignment(ta);

  const weights = { chartStructure: 0.20, trend: 0.20, momentum: 0.20, supportResistance: 0.15, patterns: 0.15, volatility: 0.05, multiTF: 0.05 };
  const overallScore = clamp(
    chartStructure.score * weights.chartStructure +
    trend.score * weights.trend +
    momentum.score * weights.momentum +
    supportResistance.score * weights.supportResistance +
    patternsScore.score * weights.patterns +
    volatility.score * weights.volatility +
    multiTimeframeAlignment.score * weights.multiTF
  );

  const bullishScore = clamp(overallScore + (ta.trend.direction === 'BULLISH' ? 5 : -5));
  const bearishScore = clamp(100 - overallScore + (ta.trend.direction === 'BEARISH' ? 5 : -5));

  let overallSignal: SignalDirection = 'NEUTRAL';
  if (overallScore >= 62) overallSignal = 'BULLISH';
  else if (overallScore <= 38) overallSignal = 'BEARISH';

  const summary = `${ta.ticker} market structure is ${overallSignal.toLowerCase()} (score: ${overallScore}/100). ` +
    `Trend: ${ta.trend.direction} ${ta.trend.strength}. ` +
    `${patterns.patterns.length > 0 ? `${patterns.patterns.length} pattern(s) detected.` : 'No patterns.'} ` +
    `Momentum ${momentum.score >= 60 ? 'supportive' : momentum.score <= 40 ? 'diverging' : 'neutral'}.`;

  return {
    ticker: ta.ticker,
    currentPrice: ta.currentPrice,
    chartStructure,
    trend,
    supportResistance,
    momentum,
    volatility,
    patterns: patternsScore,
    multiTimeframeAlignment,
    bullishScore,
    bearishScore,
    overallScore,
    overallSignal,
    summary,
    analyzedAt: new Date(),
  };
}
