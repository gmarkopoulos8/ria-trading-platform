import { prisma } from '../../lib/prisma';
import type { RankedResult } from './dailyRankingService';
import type { AssetScope, RiskMode } from './scanUniverseService';

export interface CreateRunOptions {
  runType?: string;
  marketSession?: string;
  assetScope?: AssetScope;
  riskMode?: RiskMode;
  scheduledFor?: Date;
  isFullUniverseScan?: boolean;
}

export async function createScanRun(opts: CreateRunOptions = {}) {
  return prisma.dailyScanRun.create({
    data: {
      runType: opts.runType ?? 'MANUAL',
      status: 'PENDING',
      marketSession: opts.marketSession ?? 'MARKET_OPEN',
      assetScope: opts.assetScope ?? 'ALL',
      riskMode: opts.riskMode ?? 'ALL',
      scheduledFor: opts.scheduledFor,
      isFullUniverseScan: opts.isFullUniverseScan ?? false,
    },
  });
}

export async function markRunStarted(id: string) {
  return prisma.dailyScanRun.update({
    where: { id },
    data: { status: 'RUNNING', startedAt: new Date() },
  });
}

export async function markRunCompleted(id: string, extras: {
  totalUniverseCount: number;
  totalRankedCount: number;
  topSymbol?: string;
  summary?: string;
  isFullUniverseScan?: boolean;
  totalSymbolsScreened?: number;
  totalPassedFilter?: number;
  totalPrescored?: number;
  filterCriteriaJson?: object;
}) {
  const { isFullUniverseScan, totalSymbolsScreened, totalPassedFilter, totalPrescored, filterCriteriaJson, ...rest } = extras;
  return prisma.dailyScanRun.update({
    where: { id },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      ...rest,
      ...(isFullUniverseScan !== undefined && { isFullUniverseScan }),
      ...(totalSymbolsScreened !== undefined && { totalSymbolsScreened }),
      ...(totalPassedFilter !== undefined && { totalPassedFilter }),
      ...(totalPrescored !== undefined && { totalPrescored }),
      ...(filterCriteriaJson !== undefined && { filterCriteriaJson }),
    },
  });
}

export async function markRunFailed(id: string, errorMessage: string) {
  return prisma.dailyScanRun.update({
    where: { id },
    data: { status: 'FAILED', completedAt: new Date(), errorMessage },
  });
}

export async function persistRankedResults(scanRunId: string, results: RankedResult[]) {
  const rows = results.map((r) => ({
    scanRunId,
    symbol: r.symbol,
    assetClass: r.assetClass,
    rank: r.rank,
    bias: r.bias,
    convictionScore: r.convictionScore,
    confidenceScore: r.confidenceScore,
    technicalScore: r.technicalScore,
    catalystScore: r.catalystScore,
    riskScore: r.riskScore,
    volatilityScore: r.volatilityScore,
    liquidityScore: r.liquidityScore,
    setupType: r.setupType,
    trendState: r.trendState,
    supportZoneJson: r.supportZone ?? undefined,
    resistanceZoneJson: r.resistanceZone ?? undefined,
    entryZoneJson: r.entryZone as any,
    invalidationZoneJson: r.invalidationZone as any,
    takeProfit1Json: r.takeProfit1 as any,
    takeProfit2Json: r.takeProfit2 as any,
    suggestedHoldWindow: r.suggestedHoldWindow,
    thesisHealthScore: r.thesisHealthScore,
    monitoringFrequency: r.monitoringFrequency,
    supportingReasonsJson: r.supportingReasons as any,
    mainRiskToThesis: r.mainRiskToThesis,
    catalystSummary: r.catalystSummary,
    patternSummary: r.patternSummary,
    recommendedAction: r.recommendedAction,
    rawAgentOutputJson: {
      marketStructure: r.rawThesis.marketStructure,
      catalysts: r.rawThesis.catalysts,
      risk: r.rawThesis.risk,
      thesis: r.rawThesis.thesis,
    } as any,
  }));

  await prisma.dailyScanResult.createMany({ data: rows });

  const snapRows = results.map((r) => ({
    scanRunId,
    symbol: r.symbol,
    rank: r.rank,
    scoreComposite: r.compositeScore,
    scoreTechnical: r.scoreTechnical,
    scoreCatalyst: r.scoreCatalyst,
    scoreRiskAdjusted: r.scoreRiskAdjusted,
    scoreVolatilityFit: r.scoreVolatilityFit,
    scoreLiquidity: r.scoreLiquidity,
    scoreTimeHorizonFit: r.scoreTimeHorizonFit,
    scoreMonitorability: r.scoreMonitorability,
    scoreRewardRisk: r.scoreRewardRisk,
    scoreInvalidationClarity: r.scoreInvalidationClarity,
    snapshotDate: new Date(),
  }));

  await prisma.rankedOpportunitySnapshot.createMany({ data: snapRows });
}

export async function getLatestCompletedRun() {
  return prisma.dailyScanRun.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { completedAt: 'desc' },
    include: { report: true },
  });
}

export async function getRunById(id: string) {
  return prisma.dailyScanRun.findUnique({
    where: { id },
    include: { report: true },
  });
}

export async function getRunResults(scanRunId: string, opts: {
  page?: number;
  limit?: number;
  assetClass?: string;
  bias?: string;
  action?: string;
} = {}) {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 100, 100);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = { scanRunId };
  if (opts.assetClass && opts.assetClass !== 'ALL') where.assetClass = opts.assetClass.toUpperCase();
  if (opts.bias && opts.bias !== 'ALL') where.bias = opts.bias.toUpperCase();
  if (opts.action && opts.action !== 'ALL') where.recommendedAction = opts.action;

  const [total, results] = await Promise.all([
    prisma.dailyScanResult.count({ where }),
    prisma.dailyScanResult.findMany({
      where,
      orderBy: { rank: 'asc' },
      skip,
      take: limit,
    }),
  ]);

  return { total, page, limit, results };
}

export async function listScanRuns(opts: {
  page?: number;
  limit?: number;
  status?: string;
  runType?: string;
} = {}) {
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 50);
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (opts.status) where.status = opts.status;
  if (opts.runType) where.runType = opts.runType;

  const [total, runs] = await Promise.all([
    prisma.dailyScanRun.count({ where }),
    prisma.dailyScanRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: { report: { select: { reportDate: true, marketRegimeSummary: true } } },
    }),
  ]);

  return { total, page, limit, runs };
}

export async function getSymbolRankingHistory(symbol: string, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return prisma.dailyScanResult.findMany({
    where: {
      symbol: symbol.toUpperCase(),
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      scanRun: { select: { id: true, runType: true, status: true, completedAt: true, marketSession: true } },
    },
  });
}

export async function hasDuplicateRunToday(runType: string, marketSession: string): Promise<boolean> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.dailyScanRun.findFirst({
    where: {
      runType,
      marketSession,
      status: { in: ['RUNNING', 'COMPLETED'] },
      createdAt: { gte: todayStart },
    },
  });
  return existing !== null;
}
