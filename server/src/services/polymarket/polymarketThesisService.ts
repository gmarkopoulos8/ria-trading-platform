import { prisma } from '../../lib/prisma';
import type { NormalizedMarket } from './polymarketMarketService';
import type { PricePoint } from './polymarketClobReadService';

export type PolyActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';
export type PolyBias = 'yes' | 'no' | 'neutral';

export interface PolyThesisResult {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  healthScore: number;
  bias: PolyBias;
  confidenceScore: number;
  liquidityScore: number;
  momentumScore: number;
  riskScore: number;
  actionLabel: PolyActionLabel;
  thesisSummary: string;
  supportingReasons: string[];
  mainRisk: string;
  suggestedHold: string;
  priceSnapshot: {
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
  };
  analyzedAt: Date;
}

function clamp(val: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val));
}

function liquidityScore(liquidity: number): number {
  if (liquidity >= 500_000) return 100;
  if (liquidity >= 100_000) return 85;
  if (liquidity >= 50_000)  return 70;
  if (liquidity >= 10_000)  return 55;
  if (liquidity >= 1_000)   return 35;
  return 20;
}

function volumeScore(volume: number): number {
  if (volume >= 1_000_000) return 100;
  if (volume >= 200_000)   return 85;
  if (volume >= 50_000)    return 70;
  if (volume >= 10_000)    return 55;
  if (volume >= 1_000)     return 35;
  return 20;
}

function computeMomentum(history: PricePoint[]): number {
  if (history.length < 4) return 50;
  const mid = Math.floor(history.length / 2);
  const firstHalfAvg = history.slice(0, mid).reduce((s, p) => s + p.p, 0) / mid;
  const secondHalfAvg = history.slice(mid).reduce((s, p) => s + p.p, 0) / (history.length - mid);
  const change = secondHalfAvg - firstHalfAvg;
  return clamp(50 + change * 400);
}

function computeVolatility(history: PricePoint[]): number {
  if (history.length < 2) return 50;
  const changes = history.slice(1).map((p, i) => Math.abs(p.p - history[i].p));
  const avgChange = changes.reduce((s, c) => s + c, 0) / changes.length;
  return clamp(avgChange * 1000);
}

function biasFromPrice(yesPrice: number): PolyBias {
  if (yesPrice >= 0.6) return 'yes';
  if (yesPrice <= 0.4) return 'no';
  return 'neutral';
}

function actionLabelFromScore(score: number): PolyActionLabel {
  if (score >= 80) return 'high conviction';
  if (score >= 65) return 'tradable';
  if (score >= 50) return 'developing';
  if (score >= 35) return 'weak';
  return 'avoid';
}

function consensusConfidence(yesPrice: number): number {
  const extremeness = Math.abs(yesPrice - 0.5) * 2;
  return clamp(extremeness * 100);
}

function eventRecencyScore(endDate: string | null): number {
  if (!endDate) return 40;
  const msUntil = new Date(endDate).getTime() - Date.now();
  const daysUntil = msUntil / 86_400_000;
  if (daysUntil < 0)  return 10;
  if (daysUntil < 1)  return 95;
  if (daysUntil < 7)  return 80;
  if (daysUntil < 30) return 60;
  if (daysUntil < 90) return 40;
  return 25;
}

function spreadRiskScore(yesPrice: number, noPrice: number): number {
  const impliedSpread = Math.abs((yesPrice + noPrice) - 1);
  return clamp(100 - impliedSpread * 500);
}

function reversalRisk(yesPrice: number, momentum: number): number {
  const extremeness = Math.abs(yesPrice - 0.5) * 2;
  const counterMomentum = Math.abs(momentum - 50) / 50;
  return clamp((extremeness * 0.4 + counterMomentum * 0.6) * 80 + 10);
}

function suggestedHold(endDate: string | null): string {
  if (!endDate) return 'event-dependent';
  const daysUntil = (new Date(endDate).getTime() - Date.now()) / 86_400_000;
  if (daysUntil < 1)  return 'hours';
  if (daysUntil < 3)  return '1–3 days';
  if (daysUntil < 7)  return '3–7 days';
  if (daysUntil < 14) return '1–2 weeks';
  if (daysUntil < 30) return '2–4 weeks';
  return '1–3 months';
}

function generateSummary(market: NormalizedMarket, bias: PolyBias, score: number, liq: number, mom: number): string {
  const side = bias === 'yes' ? 'YES' : bias === 'no' ? 'NO' : 'neutral';
  const tier = score >= 80 ? 'high-conviction' : score >= 65 ? 'tradable' : score >= 50 ? 'developing' : 'weak';
  const liqLabel = liq > 80 ? 'deep liquidity' : liq > 50 ? 'adequate liquidity' : 'thin liquidity';
  const momLabel = mom > 65 ? 'accelerating momentum' : mom < 35 ? 'fading momentum' : 'stable pricing';
  return `${tier.toUpperCase()} ${side} setup on "${market.question.substring(0, 60)}…". Market shows ${liqLabel} and ${momLabel}. ${bias !== 'neutral' ? `Current pricing strongly favors ${side}.` : 'Market is pricing near 50/50 with high uncertainty.'}`;
}

function generateReasons(
  market: NormalizedMarket,
  bias: PolyBias,
  liq: number,
  vol: number,
  mom: number,
  confidence: number,
  recency: number,
): string[] {
  const reasons: string[] = [];
  if (liq > 70) reasons.push(`High liquidity ($${(market.liquidity / 1000).toFixed(0)}k) supports clean entries and exits`);
  else if (liq < 40) reasons.push(`Low liquidity ($${(market.liquidity / 1000).toFixed(0)}k) — slippage risk elevated`);
  if (vol > 70) reasons.push(`Strong recent volume ($${(market.volume / 1000).toFixed(0)}k) indicates active participation`);
  if (mom > 65) reasons.push(`Price momentum is accelerating toward ${bias === 'yes' ? 'YES' : 'NO'} consensus`);
  else if (mom < 35) reasons.push('Momentum is fading — potential reversal risk');
  if (confidence > 70) reasons.push(`High market consensus (${market.yesPrice > 0.5 ? (market.yesPrice * 100).toFixed(0) : ((1 - market.yesPrice) * 100).toFixed(0)}% implied probability)`);
  if (recency > 70) reasons.push(`Event resolves soon — high urgency, favors decisive positioning`);
  if (bias !== 'neutral') reasons.push(`Current pricing: YES @ ${(market.yesPrice * 100).toFixed(1)}¢ / NO @ ${(market.noPrice * 100).toFixed(1)}¢`);
  return reasons.slice(0, 5);
}

function generateRisk(market: NormalizedMarket, liq: number, rev: number, endDate: string | null): string {
  if (liq < 40) return 'Thin liquidity — exit may be difficult at full size. Wide implied spread.';
  if (rev > 70) return 'High reversal risk — market is trading at an extreme with potential for sharp mean-reversion.';
  if (!endDate) return 'No resolution date set — position duration is indefinite and capital may be locked.';
  const daysUntil = (new Date(endDate).getTime() - Date.now()) / 86_400_000;
  if (daysUntil < 1) return 'Market resolves within 24h — extreme binary risk. Small position size recommended.';
  return 'Binary event risk: a single outcome determines full win/loss. Position sizing is critical.';
}

export async function analyzeMarket(
  market: NormalizedMarket,
  history: PricePoint[] = [],
  userId?: string,
): Promise<PolyThesisResult> {
  const liq         = liquidityScore(market.liquidity);
  const vol         = volumeScore(market.volume);
  const mom         = computeMomentum(history);
  const volatility  = computeVolatility(history);
  const confidence  = consensusConfidence(market.yesPrice);
  const recency     = eventRecencyScore(market.endDate);
  const spreadRisk  = spreadRiskScore(market.yesPrice, market.noPrice);
  const rev         = reversalRisk(market.yesPrice, mom);

  const riskScore = clamp(100 - (rev * 0.4 + (100 - spreadRisk) * 0.3 + (100 - liq) * 0.3));

  const healthScore = clamp(
    liq          * 0.25 +
    vol          * 0.15 +
    mom          * 0.15 +
    confidence   * 0.15 +
    recency      * 0.15 +
    riskScore    * 0.10 +
    spreadRisk   * 0.05,
  );

  const bias        = biasFromPrice(market.yesPrice);
  const actionLabel = actionLabelFromScore(healthScore);
  const hold        = suggestedHold(market.endDate);

  const result: PolyThesisResult = {
    marketId: market.id,
    question: market.question,
    yesPrice: market.yesPrice,
    noPrice: market.noPrice,
    healthScore: Math.round(healthScore),
    bias,
    confidenceScore: Math.round(confidence),
    liquidityScore: Math.round(liq),
    momentumScore: Math.round(mom),
    riskScore: Math.round(riskScore),
    actionLabel,
    thesisSummary: generateSummary(market, bias, healthScore, liq, mom),
    supportingReasons: generateReasons(market, bias, liq, vol, mom, confidence, recency),
    mainRisk: generateRisk(market, liq, rev, market.endDate),
    suggestedHold: hold,
    priceSnapshot: {
      yesPrice: market.yesPrice,
      noPrice: market.noPrice,
      volume: market.volume,
      liquidity: market.liquidity,
    },
    analyzedAt: new Date(),
  };

  try {
    await prisma.polymarketThesis.create({
      data: {
        marketId: market.id,
        userId,
        healthScore: result.healthScore,
        bias: result.bias,
        confidenceScore: result.confidenceScore,
        liquidityScore: result.liquidityScore,
        momentumScore: result.momentumScore,
        riskScore: result.riskScore,
        actionLabel: result.actionLabel,
        thesisSummary: result.thesisSummary,
        supportingReasons: result.supportingReasons,
        mainRisk: result.mainRisk,
        suggestedHold: result.suggestedHold,
        priceSnapshot: result.priceSnapshot,
      },
    });
  } catch (err) {
    console.warn('[PolyThesisService] Failed to persist thesis:', err instanceof Error ? err.message : err);
  }

  return result;
}
