import { prisma } from '../../lib/prisma';
import { marketService } from '../market/MarketService';
import { thesisEngine } from '../thesis/ThesisEngine';
import { evaluateAlerts } from './AlertEngine';
import type { RecommendedPositionAction } from './AlertEngine';

const DEDUP_WINDOW_MS = 30 * 60 * 1000;

export async function refreshPosition(positionId: string, userId: string) {
  const position = await prisma.paperPosition.findFirst({
    where: { id: positionId, userId, status: 'OPEN' },
    include: {
      snapshots: { orderBy: { snapshotAt: 'desc' }, take: 1 },
      monitoringAlerts: { orderBy: { triggeredAt: 'desc' }, take: 10 },
    },
  });

  if (!position) throw new Error('Position not found or not open');

  const assetClass = position.assetClass ?? 'stock';

  const [quoteResult, thesisResult] = await Promise.allSettled([
    marketService.quote(position.symbol, assetClass as 'stock' | 'crypto' | 'etf'),
    thesisEngine.analyze(position.symbol, assetClass),
  ]);

  const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;
  const thesis = thesisResult.status === 'fulfilled' ? thesisResult.value : null;

  if (!thesis) throw new Error('Failed to fetch thesis analysis');

  const currentPrice = quote?.price ?? thesis.marketStructure.currentPrice;
  const previousThesisHealth = position.snapshots[0]?.thesisHealth ?? position.thesisHealth ?? null;

  const snapshot = evaluateAlerts(
    {
      symbol: position.symbol,
      side: position.side as 'LONG' | 'SHORT',
      entryPrice: position.entryPrice,
      targetPrice: position.targetPrice,
      stopLoss: position.stopLoss,
      openedAt: position.openedAt,
      previousThesisHealth,
    },
    thesis,
    currentPrice,
  );

  await prisma.$transaction(async (tx) => {
    await tx.positionSnapshot.create({
      data: {
        positionId: position.id,
        symbol: position.symbol,
        currentPrice: snapshot.currentPrice,
        thesisHealth: snapshot.thesisHealth,
        recommendedAction: snapshot.recommendedAction,
        technicalScore: snapshot.technicalScore,
        catalystScore: snapshot.catalystScore,
        riskScore: snapshot.riskScore,
        targetProximityPct: snapshot.targetProximityPct,
        stopProximityPct: snapshot.stopProximityPct,
        holdWindowPct: snapshot.holdWindowPct,
        unrealizedPnl: snapshot.unrealizedPnl,
        unrealizedPnlPct: snapshot.unrealizedPnlPct,
        metadata: { thesis: thesis.thesis as unknown as object },
      },
    });

    await tx.paperPosition.update({
      where: { id: position.id },
      data: {
        currentPrice: snapshot.currentPrice,
        thesisHealth: snapshot.thesisHealth,
        recommendedAction: snapshot.recommendedAction,
        lastMonitoredAt: new Date(),
        lastThesisAnalysis: thesis.thesis as unknown as object,
      },
    });

    if (snapshot.alerts.length > 0) {
      const recentAlertTypes = new Set(
        position.monitoringAlerts
          .filter((a) => Date.now() - a.triggeredAt.getTime() < DEDUP_WINDOW_MS)
          .map((a) => a.alertType),
      );

      const newAlerts = snapshot.alerts.filter((a) => !recentAlertTypes.has(a.type as never));

      if (newAlerts.length > 0) {
        await tx.monitoringAlert.createMany({
          data: newAlerts.map((a) => ({
            userId,
            positionId: position.id,
            symbol: position.symbol,
            severity: a.severity,
            alertType: a.type,
            title: a.title,
            message: a.message,
            metadata: a.metadata ?? {},
            isRead: false,
          })),
        });
      }
    }
  });

  return {
    positionId: position.id,
    symbol: position.symbol,
    currentPrice: snapshot.currentPrice,
    thesisHealth: snapshot.thesisHealth,
    recommendedAction: snapshot.recommendedAction as RecommendedPositionAction,
    technicalScore: snapshot.technicalScore,
    catalystScore: snapshot.catalystScore,
    riskScore: snapshot.riskScore,
    targetProximityPct: snapshot.targetProximityPct,
    stopProximityPct: snapshot.stopProximityPct,
    holdWindowPct: snapshot.holdWindowPct,
    unrealizedPnl: snapshot.unrealizedPnl,
    unrealizedPnlPct: snapshot.unrealizedPnlPct,
    alertsGenerated: snapshot.alerts.length,
    thesis: {
      bias: thesis.thesis.bias,
      thesisSummary: thesis.thesis.thesisSummary,
      entryZone: thesis.thesis.entryZone,
      takeProfit1: thesis.thesis.takeProfit1,
      invalidationZone: thesis.thesis.invalidationZone,
      suggestedHoldWindow: thesis.thesis.suggestedHoldWindow,
    },
  };
}

export async function monitorAllOpenPositions(): Promise<void> {
  const openPositions = await prisma.paperPosition.findMany({
    where: { status: 'OPEN' },
    select: { id: true, userId: true, symbol: true },
  });

  if (openPositions.length === 0) return;

  console.log(`[Monitor] Running monitoring cycle for ${openPositions.length} open position(s)`);

  const results = await Promise.allSettled(
    openPositions.map((p) => refreshPosition(p.id, p.userId)),
  );

  let ok = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok++;
    else {
      failed++;
      console.warn('[Monitor] Position refresh failed:', r.reason?.message);
    }
  }

  console.log(`[Monitor] Cycle complete — ${ok} refreshed, ${failed} failed`);
}
