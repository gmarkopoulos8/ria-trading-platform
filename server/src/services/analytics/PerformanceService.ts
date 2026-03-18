import { prisma } from '../../lib/prisma';

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  assetClass?: string;
  side?: string;
  outcome?: string;
  userId: string;
}

interface ClosedTrade {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  side: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  targetPrice: number | null;
  stopLoss: number | null;
  pnl: number;
  pnlPercent: number;
  thesis: string;
  thesisOutcome: string | null;
  closeReason: string | null;
  holdingPeriodDays: number | null;
  tags: string[];
  openedAt: Date;
  closedAt: Date;
}

function buildWhere(filters: AnalyticsFilters) {
  const where: Record<string, unknown> = { userId: filters.userId };
  if (filters.startDate) where.closedAt = { ...(where.closedAt as object ?? {}), gte: new Date(filters.startDate) };
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    where.closedAt = { ...(where.closedAt as object ?? {}), lte: end };
  }
  if (filters.assetClass && filters.assetClass !== 'all') where.assetClass = filters.assetClass;
  if (filters.side && filters.side !== 'all') where.side = filters.side.toUpperCase();
  if (filters.outcome && filters.outcome !== 'all') where.thesisOutcome = filters.outcome;
  return where;
}

function isWin(trade: ClosedTrade): boolean {
  return trade.pnl > 0;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item);
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

function computeGroupStats(trades: ClosedTrade[]): GroupStats {
  if (trades.length === 0) return { trades: 0, wins: 0, winRate: 0, avgReturn: 0, totalPnl: 0, avgHold: 0 };
  const wins = trades.filter(isWin);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgReturn = trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length;
  const holds = trades.filter((t) => t.holdingPeriodDays !== null).map((t) => t.holdingPeriodDays!);
  const avgHold = holds.length > 0 ? holds.reduce((s, h) => s + h, 0) / holds.length : 0;
  return {
    trades: trades.length,
    wins: wins.length,
    winRate: (wins.length / trades.length) * 100,
    avgReturn,
    totalPnl,
    avgHold,
  };
}

interface GroupStats {
  trades: number;
  wins: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
  avgHold: number;
}

async function fetchTrades(filters: AnalyticsFilters): Promise<ClosedTrade[]> {
  const where = buildWhere(filters);
  return prisma.closedPosition.findMany({
    where: where as Parameters<typeof prisma.closedPosition.findMany>[0]['where'],
    orderBy: { closedAt: 'asc' },
  }) as Promise<ClosedTrade[]>;
}

export async function getOverview(filters: AnalyticsFilters) {
  const trades = await fetchTrades(filters);

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      evenTrades: 0,
      winRate: 0,
      totalPnl: 0,
      avgReturn: 0,
      medianReturn: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: null,
      worstTrade: null,
      profitFactor: 0,
      medianHoldDays: 0,
      avgHoldDays: 0,
      equityCurve: [],
      pnlByMonth: [],
      pnlByCloseReason: [],
      pnlBySide: [],
      pnlByAssetClass: [],
      streaks: { currentWin: 0, currentLoss: 0, bestWin: 0, worstLoss: 0 },
    };
  }

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const evens = trades.filter((t) => t.pnl === 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const avgReturn = trades.reduce((s, t) => s + t.pnlPercent, 0) / trades.length;
  const returns = trades.map((t) => t.pnlPercent);
  const medianReturn = median(returns);
  const winSum = wins.reduce((s, t) => s + t.pnl, 0);
  const lossSum = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const profitFactor = lossSum === 0 ? winSum > 0 ? 99 : 1 : winSum / lossSum;

  const holds = trades.filter((t) => t.holdingPeriodDays !== null).map((t) => t.holdingPeriodDays!);
  const medianHoldDays = median(holds);
  const avgHoldDays = holds.length > 0 ? holds.reduce((s, h) => s + h, 0) / holds.length : 0;

  const sorted = [...trades].sort((a, b) => b.pnlPercent - a.pnlPercent);
  const bestTrade = sorted[0] ? { symbol: sorted[0].symbol, pnl: sorted[0].pnl, pnlPct: sorted[0].pnlPercent, closedAt: sorted[0].closedAt } : null;
  const worstTrade = sorted[sorted.length - 1] ? { symbol: sorted[sorted.length - 1].symbol, pnl: sorted[sorted.length - 1].pnl, pnlPct: sorted[sorted.length - 1].pnlPercent, closedAt: sorted[sorted.length - 1].closedAt } : null;

  let running = 100_000;
  const equityCurve = trades.map((t) => {
    running += t.pnl;
    return { date: t.closedAt.toISOString().slice(0, 10), value: running, pnl: t.pnl, symbol: t.symbol };
  });

  const monthMap: Record<string, number> = {};
  for (const t of trades) {
    const key = t.closedAt.toISOString().slice(0, 7);
    monthMap[key] = (monthMap[key] ?? 0) + t.pnl;
  }
  const pnlByMonth = Object.entries(monthMap).map(([month, pnl]) => ({ month, pnl })).sort((a, b) => a.month.localeCompare(b.month));

  const reasonGroups = groupBy(trades, (t) => t.closeReason ?? 'MANUAL');
  const pnlByCloseReason = Object.entries(reasonGroups).map(([reason, ts]) => ({
    reason,
    trades: ts.length,
    winRate: (ts.filter(isWin).length / ts.length) * 100,
    avgReturn: ts.reduce((s, t) => s + t.pnlPercent, 0) / ts.length,
    totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
  }));

  const sideGroups = groupBy(trades, (t) => t.side);
  const pnlBySide = Object.entries(sideGroups).map(([side, ts]) => ({
    side,
    ...computeGroupStats(ts),
  }));

  const classGroups = groupBy(trades, (t) => t.assetClass);
  const pnlByAssetClass = Object.entries(classGroups).map(([assetClass, ts]) => ({
    assetClass,
    ...computeGroupStats(ts),
  }));

  let currentWin = 0, currentLoss = 0, bestWin = 0, worstLoss = 0;
  for (const t of [...trades].reverse()) {
    if (isWin(t)) { currentWin++; currentLoss = 0; bestWin = Math.max(bestWin, currentWin); }
    else { currentLoss++; currentWin = 0; worstLoss = Math.max(worstLoss, currentLoss); }
  }

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    evenTrades: evens.length,
    winRate: (wins.length / trades.length) * 100,
    totalPnl,
    avgReturn,
    medianReturn,
    avgWin: wins.length > 0 ? wins.reduce((s, t) => s + t.pnlPercent, 0) / wins.length : 0,
    avgLoss: losses.length > 0 ? losses.reduce((s, t) => s + t.pnlPercent, 0) / losses.length : 0,
    bestTrade,
    worstTrade,
    profitFactor,
    medianHoldDays,
    avgHoldDays,
    equityCurve,
    pnlByMonth,
    pnlByCloseReason,
    pnlBySide,
    pnlByAssetClass,
    streaks: { currentWin, currentLoss, bestWin, worstLoss },
  };
}

export async function getPatternAnalysis(filters: AnalyticsFilters) {
  const trades = await fetchTrades(filters);

  if (trades.length === 0) return { byHoldDuration: [], byReturnBucket: [], byOutcome: [], setupMatrix: [] };

  const holdBuckets = [
    { label: 'Intraday (<1d)', test: (d: number) => d < 1 },
    { label: 'Short (1–3d)', test: (d: number) => d >= 1 && d <= 3 },
    { label: 'Swing (4–10d)', test: (d: number) => d > 3 && d <= 10 },
    { label: 'Medium (11–30d)', test: (d: number) => d > 10 && d <= 30 },
    { label: 'Long (>30d)', test: (d: number) => d > 30 },
  ];

  const byHoldDuration = holdBuckets.map((bucket) => {
    const group = trades.filter((t) => t.holdingPeriodDays !== null && bucket.test(t.holdingPeriodDays!));
    return { label: bucket.label, ...computeGroupStats(group) };
  });

  const returnBuckets = [
    { label: 'Big Loss (<-10%)', test: (p: number) => p < -10 },
    { label: 'Small Loss (-10% to 0%)', test: (p: number) => p >= -10 && p < 0 },
    { label: 'Breakeven (0–2%)', test: (p: number) => p >= 0 && p < 2 },
    { label: 'Small Win (2–10%)', test: (p: number) => p >= 2 && p < 10 },
    { label: 'Big Win (>10%)', test: (p: number) => p >= 10 },
  ];

  const byReturnBucket = returnBuckets.map((bucket) => {
    const group = trades.filter((t) => bucket.test(t.pnlPercent));
    return { label: bucket.label, count: group.length, pct: (group.length / trades.length) * 100, avgHold: computeGroupStats(group).avgHold };
  });

  const outcomeGroups = groupBy(trades, (t) => t.thesisOutcome ?? 'UNKNOWN');
  const byOutcome = Object.entries(outcomeGroups).map(([outcome, ts]) => ({
    outcome,
    ...computeGroupStats(ts),
  })).sort((a, b) => b.trades - a.trades);

  const setupMatrix = (filters.assetClass === 'all' || !filters.assetClass)
    ? (Object.entries(groupBy(trades, (t) => `${t.assetClass}::${t.side}`)).map(([key, ts]) => {
        const [assetClass, side] = key.split('::');
        return { assetClass, side, ...computeGroupStats(ts) };
      }))
    : [];

  const bestTags: Record<string, { wins: number; total: number; totalPnl: number }> = {};
  for (const t of trades) {
    for (const tag of t.tags) {
      if (!bestTags[tag]) bestTags[tag] = { wins: 0, total: 0, totalPnl: 0 };
      bestTags[tag].total++;
      if (isWin(t)) bestTags[tag].wins++;
      bestTags[tag].totalPnl += t.pnl;
    }
  }
  const byTag = Object.entries(bestTags)
    .map(([tag, stats]) => ({ tag, ...stats, winRate: (stats.wins / stats.total) * 100 }))
    .sort((a, b) => b.winRate - a.winRate);

  return { byHoldDuration, byReturnBucket, byOutcome, setupMatrix, byTag };
}

export async function getSectorAnalysis(filters: AnalyticsFilters) {
  const trades = await fetchTrades(filters);
  if (trades.length === 0) return { byAssetClass: [], symbolLeaderboard: [], concentrationRisk: [] };

  const classGroups = groupBy(trades, (t) => t.assetClass);
  const byAssetClass = Object.entries(classGroups).map(([assetClass, ts]) => ({
    assetClass: assetClass.toUpperCase(),
    ...computeGroupStats(ts),
    pnlPct: (ts.reduce((s, t) => s + t.pnl, 0) / trades.reduce((s, t) => s + t.pnl, 1)) * 100,
  })).sort((a, b) => b.totalPnl - a.totalPnl);

  const symbolGroups = groupBy(trades, (t) => t.symbol);
  const symbolLeaderboard = Object.entries(symbolGroups).map(([symbol, ts]) => {
    const stats = computeGroupStats(ts);
    const sorted = [...ts].sort((a, b) => b.pnlPercent - a.pnlPercent);
    return { symbol, name: ts[0]?.name ?? symbol, ...stats, bestReturn: sorted[0]?.pnlPercent ?? 0, worstReturn: sorted[sorted.length - 1]?.pnlPercent ?? 0 };
  }).sort((a, b) => b.totalPnl - a.totalPnl);

  const total = trades.length;
  const concentrationRisk = symbolLeaderboard.slice(0, 10).map((s) => ({
    symbol: s.symbol,
    tradePct: (s.trades / total) * 100,
    pnlShare: s.totalPnl,
  }));

  return { byAssetClass, symbolLeaderboard, concentrationRisk };
}

export async function getCatalystAnalysis(filters: AnalyticsFilters) {
  const trades = await fetchTrades(filters);
  if (trades.length === 0) return {
    outcomeDistribution: [],
    closeReasonQuality: [],
    falsePositiveRate: 0,
    stopSuccessRate: 0,
    thesisByOutcome: [],
  };

  const outcomeGroups = groupBy(trades, (t) => t.thesisOutcome ?? 'UNKNOWN');
  const outcomeDistribution = Object.entries(outcomeGroups).map(([outcome, ts]) => ({
    outcome,
    count: ts.length,
    pct: (ts.length / trades.length) * 100,
    avgReturn: ts.reduce((s, t) => s + t.pnlPercent, 0) / ts.length,
    totalPnl: ts.reduce((s, t) => s + t.pnl, 0),
  })).sort((a, b) => b.count - a.count);

  const reasonGroups = groupBy(trades, (t) => t.closeReason ?? 'MANUAL');
  const closeReasonQuality = Object.entries(reasonGroups).map(([reason, ts]) => ({
    reason,
    count: ts.length,
    pct: (ts.length / trades.length) * 100,
    winRate: (ts.filter(isWin).length / ts.length) * 100,
    avgReturn: ts.reduce((s, t) => s + t.pnlPercent, 0) / ts.length,
  })).sort((a, b) => b.count - a.count);

  const invalidated = trades.filter((t) =>
    t.thesisOutcome === 'INVALIDATED' || t.closeReason === 'THESIS_INVALIDATED' || t.closeReason === 'HIT_STOP'
  );
  const falsePositiveRate = (invalidated.length / trades.length) * 100;

  const hitsStop = trades.filter((t) => t.closeReason === 'HIT_STOP');
  const stopSaved = hitsStop.filter((t) => {
    if (t.stopLoss === null || t.exitPrice === null) return false;
    const wouldBeWorse = t.side === 'LONG' ? t.exitPrice > t.entryPrice * 0.85 : t.exitPrice < t.entryPrice * 1.15;
    return wouldBeWorse;
  });
  const stopSuccessRate = hitsStop.length > 0 ? (stopSaved.length / hitsStop.length) * 100 : 0;

  const returnBins = [-20, -10, -5, 0, 5, 10, 20, 50];
  const returnDistribution = returnBins.map((bin, i) => {
    const next = returnBins[i + 1];
    const group = next !== undefined
      ? trades.filter((t) => t.pnlPercent >= bin && t.pnlPercent < next)
      : trades.filter((t) => t.pnlPercent >= bin);
    return { bin: `${bin}%${next !== undefined ? ` to ${next}%` : '+'}`, count: group.length };
  });

  return { outcomeDistribution, closeReasonQuality, falsePositiveRate, stopSuccessRate, returnDistribution };
}

export async function getThesisQuality(filters: AnalyticsFilters) {
  const trades = await fetchTrades(filters);
  if (trades.length === 0) return {
    overallQuality: 0,
    targetHitRate: 0,
    invalidationRate: 0,
    manualExitRate: 0,
    avgReturnByOutcome: [],
    holdQualityMatrix: [],
    assetClassQuality: [],
    riskRewardActual: [],
    topInsights: [],
  };

  const targetHits = trades.filter((t) => t.thesisOutcome === 'TARGET_HIT').length;
  const partialWins = trades.filter((t) => t.thesisOutcome === 'PARTIAL_WIN').length;
  const invalidated = trades.filter((t) => t.thesisOutcome === 'INVALIDATED').length;
  const stoppedOut = trades.filter((t) => t.thesisOutcome === 'STOPPED_OUT').length;
  const manual = trades.filter((t) => t.closeReason === 'MANUAL').length;
  const n = trades.length;

  const overallQuality = ((targetHits + partialWins * 0.6) / n) * 100;
  const targetHitRate = (targetHits / n) * 100;
  const invalidationRate = ((invalidated + stoppedOut) / n) * 100;
  const manualExitRate = (manual / n) * 100;

  const outcomeGroups = groupBy(trades, (t) => t.thesisOutcome ?? 'UNKNOWN');
  const avgReturnByOutcome = Object.entries(outcomeGroups).map(([outcome, ts]) => ({
    outcome,
    count: ts.length,
    avgReturn: ts.reduce((s, t) => s + t.pnlPercent, 0) / ts.length,
    avgHold: median(ts.filter(t => t.holdingPeriodDays !== null).map(t => t.holdingPeriodDays!)),
  })).sort((a, b) => b.avgReturn - a.avgReturn);

  const holdBuckets = [
    { label: '<1d', max: 1 },
    { label: '1–3d', min: 1, max: 3 },
    { label: '4–10d', min: 4, max: 10 },
    { label: '>10d', min: 10 },
  ];
  const holdQualityMatrix = holdBuckets.map(({ label, min = 0, max = Infinity }) => {
    const group = trades.filter((t) => t.holdingPeriodDays !== null && t.holdingPeriodDays >= min && t.holdingPeriodDays < max);
    const gs = computeGroupStats(group);
    return { label, ...gs };
  });

  const classGroups = groupBy(trades, (t) => t.assetClass);
  const assetClassQuality = Object.entries(classGroups).map(([assetClass, ts]) => {
    const hits = ts.filter((t) => t.thesisOutcome === 'TARGET_HIT').length;
    return {
      assetClass: assetClass.toUpperCase(),
      trades: ts.length,
      targetHitRate: (hits / ts.length) * 100,
      avgReturn: ts.reduce((s, t) => s + t.pnlPercent, 0) / ts.length,
      falsePositiveRate: (ts.filter((t) => t.thesisOutcome === 'INVALIDATED' || t.thesisOutcome === 'STOPPED_OUT').length / ts.length) * 100,
    };
  });

  const withRR = trades.filter((t) => t.targetPrice !== null && t.stopLoss !== null);
  const riskRewardActual = withRR.slice(0, 50).map((t) => {
    const dir = t.side === 'LONG' ? 1 : -1;
    const plannedRR = t.targetPrice && t.stopLoss
      ? Math.abs((t.targetPrice - t.entryPrice) / (t.entryPrice - t.stopLoss))
      : null;
    const actualRR = Math.abs(t.pnlPercent / 100);
    return { symbol: t.symbol, plannedRR, actualRR: actualRR * dir, pnlPct: t.pnlPercent, outcome: t.thesisOutcome };
  });

  const topInsights: string[] = [];
  const bestClass = assetClassQuality.sort((a, b) => b.avgReturn - a.avgReturn)[0];
  if (bestClass) topInsights.push(`${bestClass.assetClass} trades have the highest avg return (${bestClass.avgReturn.toFixed(1)}%)`);
  if (targetHitRate >= 50) topInsights.push(`Strong thesis quality: ${targetHitRate.toFixed(0)}% of trades hit their target`);
  else if (targetHitRate < 30) topInsights.push(`Only ${targetHitRate.toFixed(0)}% of trades hit the target — review entry timing and thesis criteria`);
  if (invalidationRate >= 40) topInsights.push(`High invalidation rate (${invalidationRate.toFixed(0)}%) — consider tightening pre-trade filters`);
  const bestHold = [...holdQualityMatrix].sort((a, b) => b.avgReturn - a.avgReturn)[0];
  if (bestHold && bestHold.trades >= 2) topInsights.push(`${bestHold.label} hold duration has the best avg return (${bestHold.avgReturn.toFixed(1)}%)`);
  const longTrades = trades.filter((t) => t.side === 'LONG');
  const shortTrades = trades.filter((t) => t.side === 'SHORT');
  if (longTrades.length > 0 && shortTrades.length > 0) {
    const longWR = (longTrades.filter(isWin).length / longTrades.length) * 100;
    const shortWR = (shortTrades.filter(isWin).length / shortTrades.length) * 100;
    const better = longWR > shortWR ? 'LONG' : 'SHORT';
    topInsights.push(`${better} positions have a higher win rate (${Math.max(longWR, shortWR).toFixed(0)}% vs ${Math.min(longWR, shortWR).toFixed(0)}%)`);
  }

  return {
    overallQuality,
    targetHitRate,
    invalidationRate,
    manualExitRate,
    avgReturnByOutcome,
    holdQualityMatrix,
    assetClassQuality,
    riskRewardActual: riskRewardActual.slice(0, 20),
    topInsights,
  };
}
