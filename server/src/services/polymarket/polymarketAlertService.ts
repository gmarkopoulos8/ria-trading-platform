import { prisma } from '../../lib/prisma';

export type PolyAlertType =
  | 'thesis_strengthening'
  | 'thesis_weakening'
  | 'momentum_accelerating'
  | 'momentum_fading'
  | 'liquidity_risk'
  | 'event_approaching'
  | 'review_position'
  | 'simulated_exit';

const SEVERITY: Record<PolyAlertType, string> = {
  thesis_strengthening: 'info',
  thesis_weakening: 'warning',
  momentum_accelerating: 'info',
  momentum_fading: 'caution',
  liquidity_risk: 'warning',
  event_approaching: 'critical',
  review_position: 'caution',
  simulated_exit: 'critical',
};

export async function generateAlertsForUser(userId: string) {
  const positions = await prisma.polymarketPaperPosition.findMany({
    where: { userId, status: 'open' },
    include: { market: true },
  });

  const created: string[] = [];

  for (const pos of positions) {
    const prices = pos.market.outcomePrices as Array<string | number>;
    const currentMark = pos.selectedSide === 'YES'
      ? parseFloat(String(prices[0] ?? 0.5))
      : parseFloat(String(prices[1] ?? 0.5));

    const entryProb = pos.entryProbability;
    const movePct   = Math.abs(currentMark - entryProb) / entryProb;
    const endDate   = pos.market.endDate;
    const liquidity = pos.market.liquidity ?? 0;

    const alerts: Array<{ type: PolyAlertType; title: string; message: string }> = [];

    if (movePct >= 0.15) {
      const direction = (pos.selectedSide === 'YES' && currentMark > entryProb) ||
                        (pos.selectedSide === 'NO'  && currentMark < entryProb);
      alerts.push({
        type: direction ? 'thesis_strengthening' : 'thesis_weakening',
        title: direction ? 'Thesis Strengthening' : 'Thesis Weakening',
        message: `${pos.selectedSide} probability moved ${(movePct * 100).toFixed(1)}% since entry. Current mark: ${(currentMark * 100).toFixed(1)}¢`,
      });
    }

    if (endDate) {
      const hoursUntil = (new Date(endDate).getTime() - Date.now()) / 3_600_000;
      if (hoursUntil > 0 && hoursUntil <= 24) {
        alerts.push({
          type: 'event_approaching',
          title: 'Event Resolving Soon',
          message: `Market resolves in ${hoursUntil < 1 ? 'under 1 hour' : `~${Math.round(hoursUntil)} hours`}. Review your ${pos.selectedSide} position.`,
        });
      }
    }

    if (liquidity < 5_000) {
      alerts.push({
        type: 'liquidity_risk',
        title: 'Liquidity Risk Elevated',
        message: `Market liquidity has dropped to $${(liquidity / 1000).toFixed(1)}k. Exit may be difficult.`,
      });
    }

    const unrealizedPnl = pos.unrealizedPnl ?? 0;
    const lossThreshold = pos.capitalAllocated * 0.5;
    if (unrealizedPnl <= -lossThreshold) {
      alerts.push({
        type: 'simulated_exit',
        title: 'Simulated Exit Condition Hit',
        message: `Unrealized P&L of -$${Math.abs(unrealizedPnl).toFixed(2)} has exceeded 50% of allocated capital. Consider closing.`,
      });
    }

    for (const alert of alerts) {
      const existing = await prisma.polymarketAlert.findFirst({
        where: { positionId: pos.id, alertType: alert.type, isRead: false, isDismissed: false },
      });
      if (!existing) {
        await prisma.polymarketAlert.create({
          data: {
            userId,
            positionId: pos.id,
            marketId: pos.marketId,
            alertType: alert.type,
            severity: SEVERITY[alert.type],
            title: alert.title,
            message: alert.message,
          },
        });
        created.push(alert.type);
      }
    }
  }

  return { created };
}

export async function getAlerts(userId: string, includeRead = false) {
  return prisma.polymarketAlert.findMany({
    where: {
      userId,
      isDismissed: false,
      ...(includeRead ? {} : { isRead: false }),
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function markAlertRead(userId: string, alertId: string) {
  return prisma.polymarketAlert.updateMany({
    where: { id: alertId, userId },
    data: { isRead: true },
  });
}

export async function dismissAlert(userId: string, alertId: string) {
  return prisma.polymarketAlert.updateMany({
    where: { id: alertId, userId },
    data: { isDismissed: true },
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.polymarketAlert.count({ where: { userId, isRead: false, isDismissed: false } });
}
