import { prisma } from '../../lib/prisma';

export interface OpenPositionInput {
  marketId: string;
  eventId?: string;
  question: string;
  selectedSide: 'YES' | 'NO';
  entryProbability: number;
  quantity: number;
  capitalAllocated: number;
  thesisId?: string;
  thesisHealth?: number;
  notes?: string;
}

export interface ClosePositionInput {
  positionId: string;
  exitProbability: number;
  resolution?: string;
  notes?: string;
}

export async function openPosition(userId: string, input: OpenPositionInput) {
  const market = await prisma.polymarketMarket.findUnique({ where: { id: input.marketId } });
  if (!market) throw new Error(`Market ${input.marketId} not found — fetch it first via the explorer.`);

  const position = await prisma.polymarketPaperPosition.create({
    data: {
      userId,
      marketId: input.marketId,
      eventId: input.eventId,
      question: input.question,
      selectedSide: input.selectedSide,
      entryProbability: input.entryProbability,
      quantity: input.quantity,
      capitalAllocated: input.capitalAllocated,
      currentMark: input.entryProbability,
      unrealizedPnl: 0,
      thesisId: input.thesisId,
      thesisHealth: input.thesisHealth,
      notes: input.notes,
      status: 'open',
    },
  });

  return position;
}

export async function closePosition(userId: string, input: ClosePositionInput) {
  const pos = await prisma.polymarketPaperPosition.findFirst({
    where: { id: input.positionId, userId, status: 'open' },
  });
  if (!pos) throw new Error('Position not found or already closed.');

  const direction = pos.selectedSide === 'YES' ? 1 : -1;
  const priceDelta = (input.exitProbability - pos.entryProbability) * direction;
  const realizedPnl = priceDelta * pos.quantity * pos.capitalAllocated;
  const pnlPercent  = (realizedPnl / pos.capitalAllocated) * 100;

  const [updatedPos, closedRecord] = await prisma.$transaction([
    prisma.polymarketPaperPosition.update({
      where: { id: pos.id },
      data: {
        status: 'closed',
        closedAt: new Date(),
        currentMark: input.exitProbability,
        unrealizedPnl: 0,
      },
    }),
    prisma.polymarketClosedPosition.create({
      data: {
        positionId: pos.id,
        userId,
        marketId: pos.marketId,
        question: pos.question,
        selectedSide: pos.selectedSide,
        entryProbability: pos.entryProbability,
        exitProbability: input.exitProbability,
        quantity: pos.quantity,
        capitalAllocated: pos.capitalAllocated,
        realizedPnl,
        pnlPercent,
        resolution: input.resolution,
        thesisId: pos.thesisId ?? undefined,
        notes: input.notes ?? pos.notes ?? undefined,
        openedAt: pos.openedAt,
      },
    }),
  ]);

  return { position: updatedPos, closed: closedRecord };
}

export async function getOpenPositions(userId: string) {
  return prisma.polymarketPaperPosition.findMany({
    where: { userId, status: 'open' },
    include: { market: { select: { question: true, outcomePrices: true, volume: true, liquidity: true, endDate: true } } },
    orderBy: { openedAt: 'desc' },
  });
}

export async function getClosedPositions(userId: string) {
  return prisma.polymarketClosedPosition.findMany({
    where: { userId },
    orderBy: { closedAt: 'desc' },
    take: 100,
  });
}

export async function getPosition(userId: string, positionId: string) {
  return prisma.polymarketPaperPosition.findFirst({
    where: { id: positionId, userId },
    include: {
      market: true,
      closed: true,
      alerts: { orderBy: { createdAt: 'desc' }, take: 10 },
    },
  });
}

export async function refreshPositionMarks(userId: string) {
  const positions = await prisma.polymarketPaperPosition.findMany({
    where: { userId, status: 'open' },
    include: { market: true },
  });

  for (const pos of positions) {
    const prices = pos.market.outcomePrices as number[] | string[];
    const currentMark = pos.selectedSide === 'YES'
      ? parseFloat(String(prices[0] ?? 0.5))
      : parseFloat(String(prices[1] ?? 0.5));

    const direction = pos.selectedSide === 'YES' ? 1 : -1;
    const priceDelta = (currentMark - pos.entryProbability) * direction;
    const unrealizedPnl = priceDelta * pos.quantity * pos.capitalAllocated;

    await prisma.polymarketPaperPosition.update({
      where: { id: pos.id },
      data: { currentMark, unrealizedPnl },
    });
  }
}
