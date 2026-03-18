import type { MarketStructureOutput, CatalystOutput, RiskOutput, AgentSubScore, RiskCategory } from './types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

interface QuoteBasic {
  price: number;
  volume?: number;
  marketCap?: number;
  assetClass: string;
}

function scoreVolatilityFit(ms: MarketStructureOutput): RiskOutput['volatilityFit'] {
  const signals: string[] = [];
  const atrPct = ms.volatility.atrPercent;
  let score = 60;
  let acceptable = true;

  if (atrPct !== null) {
    if (atrPct > 8) {
      score = 20; acceptable = false;
      signals.push(`ATR ${atrPct.toFixed(1)}% — extreme volatility, stop-outs likely`);
    } else if (atrPct > 4) {
      score = 45; acceptable = true;
      signals.push(`ATR ${atrPct.toFixed(1)}% — elevated volatility, widen stops`);
    } else if (atrPct > 2) {
      score = 70; acceptable = true;
      signals.push(`ATR ${atrPct.toFixed(1)}% — normal volatility range`);
    } else {
      score = 90; acceptable = true;
      signals.push(`ATR ${atrPct.toFixed(1)}% — low volatility, tight stops feasible`);
    }
  } else {
    signals.push('ATR data unavailable');
  }

  return { score: clamp(score), signals, description: `Volatility fit: ${acceptable ? 'acceptable' : 'caution'}`, acceptable };
}

function scoreLiquidityFit(ms: MarketStructureOutput, quote: QuoteBasic): RiskOutput['liquidityFit'] {
  const signals: string[] = [];
  let score = 65;
  let acceptable = true;

  const isLiquidCrypto = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA'].includes(ms.ticker.toUpperCase());
  const isMajorStock = !['crypto'].includes(quote.assetClass.toLowerCase());

  if (isLiquidCrypto || isMajorStock) {
    score = 80; signals.push('High-liquidity asset — tight bid/ask spreads');
  } else if (quote.assetClass === 'crypto') {
    score = 50; acceptable = true;
    signals.push('Crypto liquidity varies by exchange and time of day');
  }

  const volumeRatio = ms.volatility.level === 'HIGH' ? 2 : ms.volatility.level === 'LOW' ? 0.5 : 1;
  if (volumeRatio > 1.5) { score += 10; signals.push('Above-average volume confirms adequate liquidity'); }
  else if (volumeRatio < 0.5) { score -= 15; acceptable = false; signals.push('Low volume — fill risk on large orders'); }

  return { score: clamp(score), signals, description: `Liquidity: ${acceptable ? 'adequate' : 'limited'}`, acceptable };
}

function scoreDrawdownRisk(ms: MarketStructureOutput): RiskOutput['drawdownRisk'] {
  const signals: string[] = [];
  const atrPct = ms.volatility.atrPercent ?? 3;
  const estimatedMaxDrawdown = Math.round(atrPct * 3.5 * 10) / 10;
  let score = 60;

  if (estimatedMaxDrawdown > 25) { score = 20; signals.push(`Estimated max drawdown ~${estimatedMaxDrawdown}% — high loss potential`); }
  else if (estimatedMaxDrawdown > 12) { score = 45; signals.push(`Estimated max drawdown ~${estimatedMaxDrawdown}% — moderate risk`); }
  else if (estimatedMaxDrawdown > 6) { score = 70; signals.push(`Estimated max drawdown ~${estimatedMaxDrawdown}% — manageable`); }
  else { score = 88; signals.push(`Estimated max drawdown ~${estimatedMaxDrawdown}% — controlled risk`); }

  if (ms.supportResistance.nearestSupport !== null) {
    const bufferPct = ((ms.currentPrice - ms.supportResistance.nearestSupport) / ms.currentPrice) * 100;
    signals.push(`Support buffer: ${bufferPct.toFixed(1)}% below current price`);
    if (bufferPct < 3) { score += 10; signals.push('Tight support minimizes drawdown window'); }
    else if (bufferPct > 15) { score -= 15; signals.push('Distant support — drawdown could extend further'); }
  }

  return { score: clamp(100 - score + 50), signals, description: `Est. drawdown ~${estimatedMaxDrawdown}%`, estimatedMaxDrawdown };
}

function scoreEventRisk(catalyst: CatalystOutput): RiskOutput['eventRisk'] {
  const signals: string[] = [];
  const events: string[] = [];
  let score = 70;

  const urgentItems = catalyst.eventImportance.highImpactCount;
  if (urgentItems >= 3) { score = 30; signals.push(`${urgentItems} high-impact events — binary catalyst risk`); }
  else if (urgentItems >= 1) { score = 55; signals.push(`${urgentItems} high-impact event(s) — monitor closely`); }
  else { signals.push('No high-impact upcoming events'); }

  if (catalyst.urgency.urgentCount > 0) {
    events.push('High-urgency catalysts detected');
    score -= 10;
  }

  if (catalyst.dominantEventType && ['EARNINGS', 'REGULATORY', 'LAWSUIT'].includes(catalyst.dominantEventType)) {
    score -= 15;
    events.push(`Key event type: ${catalyst.dominantEventType.replace(/_/g, ' ').toLowerCase()}`);
    signals.push(`Binary event risk from ${catalyst.dominantEventType.replace(/_/g, ' ').toLowerCase()}`);
  }

  return { score: clamp(score), signals, description: `Event risk: ${events.length > 0 ? events[0] : 'low'}`, events };
}

function scoreInvalidationClarity(ms: MarketStructureOutput): RiskOutput['invalidationClarity'] {
  const signals: string[] = [];
  const support = ms.supportResistance.nearestSupport;
  const resistance = ms.supportResistance.nearestResistance;
  let clear = false;
  let level: number | null = null;
  let score = 50;

  if (ms.overallSignal === 'BULLISH' && support !== null) {
    level = Math.round(support * 0.98 * 100) / 100;
    clear = true; score = 80;
    signals.push(`Clear invalidation: close below $${level.toFixed(2)} (below key support)`);
  } else if (ms.overallSignal === 'BEARISH' && resistance !== null) {
    level = Math.round(resistance * 1.02 * 100) / 100;
    clear = true; score = 80;
    signals.push(`Clear invalidation: close above $${level.toFixed(2)} (above key resistance)`);
  } else {
    score = 35;
    signals.push('Invalidation level unclear — mixed market structure');
  }

  return { score: clamp(score), signals, description: clear ? `Invalidation at $${level?.toFixed(2)}` : 'Unclear', clear, level };
}

function scoreRewardRisk(ms: MarketStructureOutput): RiskOutput['rewardRiskStructure'] {
  const signals: string[] = [];
  const price = ms.currentPrice;
  const support = ms.supportResistance.nearestSupport;
  const resistance = ms.supportResistance.nearestResistance;

  let ratio = 1.5;
  let acceptable = false;
  let score = 40;

  if (support !== null && resistance !== null) {
    const risk = price - support;
    const reward = resistance - price;
    if (risk > 0) {
      ratio = Math.round((reward / risk) * 10) / 10;
      acceptable = ratio >= 2;
      score = acceptable ? 75 : ratio >= 1 ? 50 : 25;
      signals.push(`R:R ratio ${ratio}:1 (reward: $${reward.toFixed(2)}, risk: $${risk.toFixed(2)})`);
      if (acceptable) signals.push('Acceptable reward-to-risk for entry');
      else signals.push('Suboptimal reward-to-risk — consider waiting for better entry');
    }
  } else {
    signals.push('Cannot compute R:R — missing support/resistance levels');
  }

  return { score: clamp(score), signals, description: `R:R ${ratio}:1`, ratio, acceptable };
}

function scoreConservativeFit(ms: MarketStructureOutput, riskScore: number): RiskOutput['conservativeFit'] {
  const suitable = riskScore <= 45 && ms.volatility.level !== 'HIGH';
  const signals: string[] = [];
  let score = suitable ? 75 : 30;

  if (suitable) {
    signals.push('Suitable for conservative portfolios — volatility and risk within acceptable range');
  } else {
    signals.push('Not suitable for conservative accounts — elevated risk profile');
    if (ms.volatility.level === 'HIGH') signals.push('High volatility exceeds conservative risk parameters');
    if (riskScore > 60) signals.push('Overall risk score too high for conservative positioning');
  }

  return { score: clamp(score), signals, description: suitable ? 'Conservative suitable' : 'Not for conservatives', suitable };
}

function scoreAggressiveFit(ms: MarketStructureOutput, catalyst: CatalystOutput): RiskOutput['aggressiveFit'] {
  const suitable = ms.overallScore >= 55 || catalyst.overallScore >= 60;
  const signals: string[] = [];
  let score = suitable ? 80 : 35;

  if (suitable) {
    signals.push('Good setup for aggressive positioning — directional momentum present');
    if (ms.volatility.level === 'HIGH') signals.push('High volatility creates larger profit potential');
  } else {
    signals.push('Weak setup for aggressive plays — insufficient directional conviction');
  }

  return { score: clamp(score), signals, description: suitable ? 'Aggressive suitable' : 'Aggressive caution', suitable };
}

export function runRiskAgent(
  ms: MarketStructureOutput,
  catalyst: CatalystOutput,
  quote: QuoteBasic
): RiskOutput {
  const volatilityFit = scoreVolatilityFit(ms);
  const liquidityFit = scoreLiquidityFit(ms, quote);
  const drawdownRisk = scoreDrawdownRisk(ms);
  const eventRisk = scoreEventRisk(catalyst);
  const invalidationClarity = scoreInvalidationClarity(ms);
  const rewardRiskStructure = scoreRewardRisk(ms);

  const rawRiskScore = clamp(
    (100 - volatilityFit.score) * 0.25 +
    (100 - liquidityFit.score) * 0.15 +
    drawdownRisk.score * 0.20 +
    (100 - eventRisk.score) * 0.15 +
    (100 - invalidationClarity.score) * 0.15 +
    (100 - rewardRiskStructure.score) * 0.10
  );

  const conservativeFit = scoreConservativeFit(ms, rawRiskScore);
  const aggressiveFit = scoreAggressiveFit(ms, catalyst);

  let riskCategory: RiskCategory = 'MEDIUM';
  if (rawRiskScore <= 25) riskCategory = 'LOW';
  else if (rawRiskScore <= 50) riskCategory = 'MEDIUM';
  else if (rawRiskScore <= 75) riskCategory = 'HIGH';
  else riskCategory = 'EXTREME';

  const mainRisks: string[] = [];
  if (!volatilityFit.acceptable) mainRisks.push('Extreme volatility risk');
  if (!liquidityFit.acceptable) mainRisks.push('Liquidity constraints');
  if (drawdownRisk.estimatedMaxDrawdown > 15) mainRisks.push(`High drawdown potential (~${drawdownRisk.estimatedMaxDrawdown}%)`);
  if (eventRisk.events.length > 0) mainRisks.push(...eventRisk.events.slice(0, 1));
  if (!rewardRiskStructure.acceptable) mainRisks.push('Poor reward-to-risk ratio');
  if (mainRisks.length === 0) mainRisks.push('No critical risk flags — well-structured setup');

  const summary = `Risk profile: ${riskCategory} (score ${rawRiskScore}/100). ` +
    `Volatility: ${ms.volatility.level}. R:R ${rewardRiskStructure.ratio}:1. ` +
    `${invalidationClarity.clear ? `Invalidation at $${invalidationClarity.level?.toFixed(2)}.` : 'Invalidation unclear.'} ` +
    `${conservativeFit.suitable ? 'Conservative-suitable.' : 'Not for conservative accounts.'}`;

  return {
    ticker: ms.ticker,
    volatilityFit,
    liquidityFit,
    drawdownRisk,
    eventRisk,
    invalidationClarity,
    rewardRiskStructure,
    conservativeFit,
    aggressiveFit,
    overallRiskScore: rawRiskScore,
    riskCategory,
    mainRisks,
    summary,
    analyzedAt: new Date(),
  };
}
