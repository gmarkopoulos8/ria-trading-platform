import { thesisEngine } from '../thesis/ThesisEngine';
import type { CandidateAsset } from './scanUniverseService';
import type { FullThesisResult } from '../thesis/types';

export interface RankedResult {
  rank: number;
  symbol: string;
  name: string;
  assetClass: string;
  sector?: string;

  bias: string;
  convictionScore: number;
  confidenceScore: number;
  technicalScore: number;
  catalystScore: number;
  riskScore: number;
  volatilityScore: number;
  liquidityScore: number;

  compositeScore: number;
  scoreTechnical: number;
  scoreCatalyst: number;
  scoreRiskAdjusted: number;
  scoreVolatilityFit: number;
  scoreLiquidity: number;
  scoreTimeHorizonFit: number;
  scoreMonitorability: number;
  scoreRewardRisk: number;
  scoreInvalidationClarity: number;

  setupType: string;
  trendState: string;
  supportZone: { low: number; high: number } | null;
  resistanceZone: { low: number; high: number } | null;
  entryZone: { low: number; high: number; description: string };
  invalidationZone: { level: number; description: string };
  takeProfit1: { level: number; description: string };
  takeProfit2: { level: number; description: string };
  suggestedHoldWindow: string;

  thesisHealthScore: number;
  monitoringFrequency: string;
  supportingReasons: string[];
  mainRiskToThesis: string;
  catalystSummary: string;
  patternSummary: string;
  recommendedAction: string;

  rawThesis: FullThesisResult;
}

function mapRecommendedAction(action: string, conviction: number): string {
  if (action === 'STRONG_BUY' || action === 'STRONG_SHORT') return 'high-priority watch';
  if (action === 'BUY' || action === 'SHORT') {
    return conviction >= 75 ? 'paper trade candidate' : 'watch for confirmation';
  }
  if (action === 'WATCH') return conviction >= 65 ? 'momentum candidate' : 'watch for confirmation';
  if (action === 'AVOID') return 'risk elevated';
  return 'watch for confirmation';
}

function computeCompositeScore(thesis: FullThesisResult): {
  composite: number;
  scoreTechnical: number;
  scoreCatalyst: number;
  scoreRiskAdjusted: number;
  scoreVolatilityFit: number;
  scoreLiquidity: number;
  scoreTimeHorizonFit: number;
  scoreMonitorability: number;
  scoreRewardRisk: number;
  scoreInvalidationClarity: number;
} {
  const t = thesis.thesis;
  const ms = thesis.marketStructure;
  const risk = thesis.risk;

  const scoreTechnical = ms.overallScore;
  const scoreCatalyst = thesis.catalysts.overallScore;
  const riskAdjusted = Math.max(0, t.convictionScore - (risk.overallRiskScore * 0.3));
  const scoreRiskAdjusted = Math.min(100, riskAdjusted);
  const scoreVolatilityFit = risk.volatilityFit.score;
  const scoreLiquidity = risk.liquidityFit.score;
  const scoreTimeHorizonFit = t.confidenceScore;
  const scoreMonitorability = risk.invalidationClarity.score;
  const rr = risk.rewardRiskStructure.ratio;
  const scoreRewardRisk = Math.min(100, (rr / 3) * 100);
  const scoreInvalidationClarity = risk.invalidationClarity.score;

  const composite =
    scoreTechnical * 0.20 +
    scoreCatalyst * 0.15 +
    scoreRiskAdjusted * 0.20 +
    scoreVolatilityFit * 0.10 +
    scoreLiquidity * 0.10 +
    scoreTimeHorizonFit * 0.10 +
    scoreMonitorability * 0.05 +
    scoreRewardRisk * 0.05 +
    scoreInvalidationClarity * 0.05;

  return {
    composite,
    scoreTechnical,
    scoreCatalyst,
    scoreRiskAdjusted,
    scoreVolatilityFit,
    scoreLiquidity,
    scoreTimeHorizonFit,
    scoreMonitorability,
    scoreRewardRisk,
    scoreInvalidationClarity,
  };
}

function getSetupType(thesis: FullThesisResult): string {
  const patterns = thesis.marketStructure.patterns?.detected ?? [];
  const dominant = thesis.marketStructure.patterns?.dominant;
  if (dominant) return dominant;
  if (patterns.length > 0) return patterns[0];
  const trend = thesis.marketStructure.trend?.direction;
  if (trend === 'BULLISH') return 'Trend Continuation';
  if (trend === 'BEARISH') return 'Downtrend Setup';
  return 'Range Setup';
}

export async function rankCandidates(
  candidates: CandidateAsset[],
  limit = 100,
  onProgress?: (done: number, total: number) => void,
  scanMode = false,
): Promise<RankedResult[]> {
  const CONCURRENCY = scanMode ? 5 : 3;
  const results: { asset: CandidateAsset; thesis: FullThesisResult; scores: ReturnType<typeof computeCompositeScore> }[] = [];
  let done = 0;

  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map((a) => thesisEngine.analyze(a.ticker, a.assetClass, { scanMode }))
    );
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j];
      done++;
      onProgress?.(done, candidates.length);
      if (s.status === 'fulfilled') {
        const scores = computeCompositeScore(s.value);
        results.push({ asset: batch[j], thesis: s.value, scores });
      }
    }
  }

  results.sort((a, b) => b.scores.composite - a.scores.composite);

  const top = results.slice(0, limit);

  return top.map((r, idx) => {
    const { thesis, asset, scores } = r;
    const t = thesis.thesis;
    const ms = thesis.marketStructure;
    const risk = thesis.risk;

    const convictionScore = Math.round(t.convictionScore);
    const action = mapRecommendedAction(t.recommendedAction, convictionScore);

    return {
      rank: idx + 1,
      symbol: asset.ticker,
      name: asset.name,
      assetClass: asset.assetClass.toUpperCase(),
      sector: asset.sector,

      bias: t.bias,
      convictionScore,
      confidenceScore: Math.round(t.confidenceScore),
      technicalScore: Math.round(ms.overallScore),
      catalystScore: Math.round(thesis.catalysts.overallScore),
      riskScore: Math.round(risk.overallRiskScore),
      volatilityScore: Math.round(risk.volatilityFit.score),
      liquidityScore: Math.round(risk.liquidityFit.score),

      compositeScore: Math.round(scores.composite),
      scoreTechnical: Math.round(scores.scoreTechnical),
      scoreCatalyst: Math.round(scores.scoreCatalyst),
      scoreRiskAdjusted: Math.round(scores.scoreRiskAdjusted),
      scoreVolatilityFit: Math.round(scores.scoreVolatilityFit),
      scoreLiquidity: Math.round(scores.scoreLiquidity),
      scoreTimeHorizonFit: Math.round(scores.scoreTimeHorizonFit),
      scoreMonitorability: Math.round(scores.scoreMonitorability),
      scoreRewardRisk: Math.round(scores.scoreRewardRisk),
      scoreInvalidationClarity: Math.round(scores.scoreInvalidationClarity),

      setupType: getSetupType(thesis),
      trendState: ms.trend?.direction ?? 'NEUTRAL',

      supportZone: ms.supportResistance?.nearestSupport != null
        ? { low: ms.supportResistance.nearestSupport * 0.99, high: ms.supportResistance.nearestSupport }
        : null,
      resistanceZone: ms.supportResistance?.nearestResistance != null
        ? { low: ms.supportResistance.nearestResistance, high: ms.supportResistance.nearestResistance * 1.01 }
        : null,
      entryZone: t.entryZone,
      invalidationZone: t.invalidationZone,
      takeProfit1: t.takeProfit1,
      takeProfit2: t.takeProfit2,
      suggestedHoldWindow: t.suggestedHoldWindow,

      thesisHealthScore: Math.round(t.thesisHealthScore),
      monitoringFrequency: t.monitoringFrequency,
      supportingReasons: t.supportingReasons,
      mainRiskToThesis: t.mainRiskToThesis,
      catalystSummary: thesis.catalysts.summary,
      patternSummary: ms.patterns?.dominant ?? ms.summary ?? '',
      recommendedAction: action,

      rawThesis: thesis,
    };
  });
}
