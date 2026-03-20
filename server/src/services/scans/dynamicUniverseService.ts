import { prisma } from '../../lib/prisma';
import type { AutoTradeSignal } from '../autotrader/AutoTradeExecutor';

export interface DynamicUniverseOptions {
  minConvictionScore?: number;
  minConfidenceScore?: number;
  allowedBiases?: string[];
  maxSymbols?: number;
  exchange?: string;
}

export async function buildSignalsFromLatestScan(
  opts: DynamicUniverseOptions = {},
): Promise<AutoTradeSignal[]> {
  const {
    minConvictionScore = 65,
    minConfidenceScore = 60,
    allowedBiases = ['BULLISH'],
    maxSymbols = 10,
  } = opts;

  const latestRun = await prisma.dailyScanRun.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
  });

  if (!latestRun) return [];

  const results = await prisma.dailyScanResult.findMany({
    where: {
      scanRunId: latestRun.id,
      bias: { in: allowedBiases.length > 0 ? allowedBiases : ['BULLISH', 'NEUTRAL'] },
      convictionScore: { gte: minConvictionScore },
      confidenceScore: { gte: minConfidenceScore },
    },
    orderBy: [
      { rank: 'asc' },              // rank 1 = best overall setup, computed by scanner
      { convictionScore: 'desc' },
      { confidenceScore: 'desc' },
    ],
    take: maxSymbols,
  });

  const signals: AutoTradeSignal[] = results.map((r) => {
    const entryZone = r.entryZoneJson as { low?: number; high?: number } | null;
    const tp1       = r.takeProfit1Json as { price?: number } | null;
    const inv       = r.invalidationZoneJson as { price?: number } | null;

    return {
      symbol:            r.symbol,
      assetClass:        r.assetClass,
      bias:              r.bias as 'BULLISH' | 'BEARISH' | 'NEUTRAL',
      convictionScore:   r.convictionScore,
      confidenceScore:   r.confidenceScore,
      riskScore:         r.riskScore,
      thesisHealthScore: r.thesisHealthScore,
      entryPrice:        entryZone?.low ?? entryZone?.high ?? undefined,
      stopLoss:          inv?.price ?? undefined,
      takeProfit:        tp1?.price ?? undefined,
      setupType:         r.setupType ?? undefined,
      reason:            r.catalystSummary ?? r.patternSummary ?? undefined,
      scanRunId:         latestRun.id,
    };
  });

  return signals;
}
