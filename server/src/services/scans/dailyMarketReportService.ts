import { prisma } from '../../lib/prisma';
import type { RankedResult } from './dailyRankingService';

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export async function generateDailyReport(scanRunId: string, results: RankedResult[]) {
  const reportDate = new Date();
  reportDate.setHours(0, 0, 0, 0);

  const bySector = groupBy(results, (r) => r.sector ?? 'Unknown');
  const sectorStats = Object.entries(bySector).map(([sector, items]) => ({
    sector,
    count: items.length,
    avgConviction: Math.round(items.reduce((s, i) => s + i.convictionScore, 0) / items.length),
    avgTechnical: Math.round(items.reduce((s, i) => s + i.technicalScore, 0) / items.length),
    bullishCount: items.filter((i) => i.bias === 'BULLISH').length,
  }));

  const strongestSectors = [...sectorStats].sort((a, b) => b.avgConviction - a.avgConviction).slice(0, 5);
  const weakestSectors = [...sectorStats].sort((a, b) => a.avgConviction - b.avgConviction).slice(0, 5);

  const strongestMomentum = results
    .filter((r) => r.bias === 'BULLISH' && r.technicalScore >= 60)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, conviction: r.convictionScore, technical: r.technicalScore, action: r.recommendedAction }));

  const highestRisk = results
    .filter((r) => r.riskScore >= 60)
    .sort((a, b) => b.riskScore - a.riskScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, risk: r.riskScore, action: r.recommendedAction }));

  const conservative = results
    .filter((r) => r.liquidityScore >= 60 && r.riskScore <= 50 && r.bias === 'BULLISH')
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, conviction: r.convictionScore, risk: r.riskScore }));

  const aggressive = results
    .filter((r) => r.convictionScore >= 65 && r.volatilityScore <= 55)
    .sort((a, b) => b.compositeScore - a.compositeScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, conviction: r.convictionScore, volatility: r.volatilityScore }));

  const topConviction = results
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, rank: r.rank, conviction: r.convictionScore, action: r.recommendedAction, bias: r.bias }));

  const topCatalysts = results
    .filter((r) => r.catalystScore >= 60)
    .sort((a, b) => b.catalystScore - a.catalystScore)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, catalyst: r.catalystSummary, score: r.catalystScore }));

  const topRewardRisk = results
    .sort((a, b) => b.scoreRewardRisk - a.scoreRewardRisk)
    .slice(0, 10)
    .map((r) => ({ symbol: r.symbol, name: r.name, rank: r.rank, rewardRisk: r.scoreRewardRisk, conviction: r.convictionScore }));

  const byAssetClass = groupBy(results, (r) => r.assetClass);
  const countsByAssetClass = Object.fromEntries(Object.entries(byAssetClass).map(([k, v]) => [k, v.length]));

  const byBias = groupBy(results, (r) => r.bias);
  const countsByBias = Object.fromEntries(Object.entries(byBias).map(([k, v]) => [k, v.length]));

  const byAction = groupBy(results, (r) => r.recommendedAction);
  const countsByAction = Object.fromEntries(Object.entries(byAction).map(([k, v]) => [k, v.length]));

  const bullishPct = Math.round((countsByBias['BULLISH'] ?? 0) / results.length * 100);
  const bearishPct = Math.round((countsByBias['BEARISH'] ?? 0) / results.length * 100);
  const avgConviction = Math.round(results.reduce((s, r) => s + r.convictionScore, 0) / results.length);

  let marketRegime = '';
  if (bullishPct >= 65) marketRegime = `Strongly bullish session — ${bullishPct}% of scanned assets show bullish bias with average conviction of ${avgConviction}. Momentum trades favored.`;
  else if (bullishPct >= 50) marketRegime = `Mildly bullish session — ${bullishPct}% bullish bias. Selective entry on high-conviction setups. Average conviction ${avgConviction}.`;
  else if (bearishPct >= 55) marketRegime = `Risk-off environment — ${bearishPct}% bearish bias. Defensive posture recommended. Watch for short setups or cash preservation.`;
  else marketRegime = `Mixed/sideways session — market lacks clear directional bias. ${bullishPct}% bullish, ${bearishPct}% bearish. Focus on stock-specific catalysts.`;

  const topSymbol = results[0]?.symbol ?? 'N/A';
  const reportSummary = `Daily scan completed with ${results.length} ranked opportunities. Top pick: ${topSymbol} (conviction ${results[0]?.convictionScore ?? 0}). ${marketRegime}`;

  await prisma.dailyMarketReport.create({
    data: {
      scanRunId,
      reportDate,
      marketRegimeSummary: marketRegime,
      strongestSectorsJson: strongestSectors as any,
      weakestSectorsJson: weakestSectors as any,
      strongestMomentumJson: strongestMomentum as any,
      highestRiskNamesJson: highestRisk as any,
      topConservativeCandidatesJson: conservative as any,
      topAggressiveCandidatesJson: aggressive as any,
      topCatalystsJson: topCatalysts as any,
      topConvictionSetupsJson: topConviction as any,
      topRiskRewardSetupsJson: topRewardRisk as any,
      reportSummary,
      countsByAssetClass: countsByAssetClass as any,
      countsByBias: countsByBias as any,
      countsByAction: countsByAction as any,
    },
  });

  return reportSummary;
}
