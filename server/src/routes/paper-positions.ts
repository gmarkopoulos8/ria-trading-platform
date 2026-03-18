import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { OpenPositionSchema, ClosePositionSchema } from '@ria-bot/shared';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';
import { marketService } from '../services/market/MarketService';
import { refreshPosition } from '../services/monitoring/PositionMonitor';

const router = Router();
router.use(requireAuth);

const UpdatePositionSchema = z.object({
  targetPrice: z.number().positive().optional(),
  stopLoss: z.number().positive().optional(),
  thesis: z.string().min(1).max(2000).optional(),
  thesisHealth: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
});

async function getOrCreatePortfolio(userId: string) {
  let portfolio = await prisma.portfolio.findFirst({ where: { userId } });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId, name: 'Main Portfolio', cashBalance: 100_000 },
    });
    await auditLog(userId, 'PORTFOLIO_CREATED', 'Portfolio', portfolio.id, {
      name: portfolio.name,
      startingCash: portfolio.cashBalance,
    });
  }
  return portfolio;
}

async function auditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  metadata?: object,
) {
  try {
    await prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata },
    });
  } catch {}
}

function computeUnrealizedPnl(
  side: string,
  entryPrice: number,
  currentPrice: number,
  quantity: number,
): { unrealizedPnl: number; unrealizedPct: number } {
  const dir = side === 'LONG' ? 1 : -1;
  const unrealizedPnl = (currentPrice - entryPrice) * quantity * dir;
  const unrealizedPct = ((currentPrice - entryPrice) / entryPrice) * 100 * dir;
  return { unrealizedPnl, unrealizedPct };
}

function computeProximity(
  currentPrice: number,
  targetPrice?: number | null,
  stopLoss?: number | null,
): { invalidationProximity: number | null; targetProximity: number | null } {
  const invalidationProximity =
    stopLoss != null ? Math.abs((currentPrice - stopLoss) / stopLoss) * 100 : null;
  const targetProximity =
    targetPrice != null ? Math.abs((targetPrice - currentPrice) / targetPrice) * 100 : null;
  return { invalidationProximity, targetProximity };
}

async function enrichPositions(positions: any[]) {
  return Promise.all(
    positions.map(async (pos) => {
      let currentPrice = pos.currentPrice ?? pos.entryPrice;
      try {
        const q = await marketService.quote(
          pos.symbol,
          pos.assetClass as 'stock' | 'crypto' | 'etf',
        ).catch(() => null);
        if (q?.price) currentPrice = q.price;
      } catch {}

      const { unrealizedPnl, unrealizedPct } = computeUnrealizedPnl(
        pos.side,
        pos.entryPrice,
        currentPrice,
        pos.quantity,
      );
      const { invalidationProximity, targetProximity } = computeProximity(
        currentPrice,
        pos.targetPrice,
        pos.stopLoss,
      );

      return {
        ...pos,
        currentPrice,
        unrealizedPnl,
        unrealizedPct,
        marketValue: currentPrice * pos.quantity,
        costBasis: pos.entryPrice * pos.quantity,
        invalidationProximity,
        targetProximity,
      };
    }),
  );
}

function buildPortfolioSummary(
  portfolio: { cashBalance: number },
  enriched: any[],
  closed: any[],
) {
  const totalUnrealized = enriched.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalMarketValue = enriched.reduce((s, p) => s + p.marketValue, 0);
  const portfolioValue = portfolio.cashBalance + totalMarketValue;
  const totalRealizedPnl = closed.reduce((s, p) => s + p.pnl, 0);

  const wins = closed.filter((p) => p.pnl > 0);
  const losses = closed.filter((p) => p.pnl <= 0);
  const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, p) => s + p.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, p) => s + p.pnl, 0)) / losses.length : 0;
  const profitFactor = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? 99 : 1;

  const longCount = enriched.filter((p) => p.side === 'LONG').length;
  const shortCount = enriched.filter((p) => p.side === 'SHORT').length;

  return {
    cashBalance: portfolio.cashBalance,
    portfolioValue,
    totalMarketValue,
    totalUnrealized,
    totalRealizedPnl,
    totalPnl: totalUnrealized + totalRealizedPnl,
    totalPnlPct: ((totalUnrealized + totalRealizedPnl) / 100_000) * 100,
    openCount: enriched.length,
    closedCount: closed.length,
    longCount,
    shortCount,
    winRate,
    avgWin,
    avgLoss,
    profitFactor,
    wins: wins.length,
    losses: losses.length,
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const portfolio = await getOrCreatePortfolio(userId);

    const [rawPositions, closed] = await Promise.all([
      prisma.paperPosition.findMany({
        where: { portfolioId: portfolio.id, status: 'OPEN' },
        orderBy: { openedAt: 'desc' },
      }),
      prisma.closedPosition.findMany({
        where: { portfolioId: portfolio.id },
        orderBy: { closedAt: 'desc' },
        take: 50,
      }),
    ]);

    const positions = await enrichPositions(rawPositions);
    const summary = buildPortfolioSummary(portfolio, positions, closed);

    return res.json({ success: true, data: { portfolio: summary, positions, closed } });
  } catch (err) {
    console.error('[GET /paper-positions]', err);
    return res.status(500).json({ success: false, error: 'Failed to load portfolio' });
  }
});

router.get('/closed', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const portfolio = await getOrCreatePortfolio(userId);
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const pageSize = Math.min(50, parseInt(String(req.query.pageSize ?? '20'), 10));

    const [closed, total] = await Promise.all([
      prisma.closedPosition.findMany({
        where: { portfolioId: portfolio.id },
        orderBy: { closedAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.closedPosition.count({ where: { portfolioId: portfolio.id } }),
    ]);

    return res.json({ success: true, data: { closed, total, page, pageSize } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load closed positions' });
  }
});

router.post('/open', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = OpenPositionSchema.parse(req.body);
    const portfolio = await getOrCreatePortfolio(userId);

    const positionCost = body.entryPrice * body.quantity;
    if (portfolio.cashBalance < positionCost) {
      return res.status(400).json({
        success: false,
        error: `Insufficient paper cash. Required: $${positionCost.toFixed(2)}, Available: $${portfolio.cashBalance.toFixed(2)}`,
      });
    }

    let symbolName = body.name ?? body.symbol;
    if (!symbolName || symbolName === body.symbol) {
      try {
        const q = await marketService.quote(body.symbol, body.assetClass);
        if (q?.name) symbolName = q.name;
      } catch {}
    }

    const [position] = await prisma.$transaction([
      prisma.paperPosition.create({
        data: {
          portfolioId: portfolio.id,
          userId,
          symbol: body.symbol,
          name: symbolName,
          assetClass: body.assetClass ?? 'stock',
          side: body.side === 'long' ? 'LONG' : 'SHORT',
          quantity: body.quantity,
          entryPrice: body.entryPrice,
          currentPrice: body.entryPrice,
          targetPrice: body.targetPrice,
          stopLoss: body.stopLoss,
          thesis: body.thesis,
          thesisHealth: body.thesisHealth ?? null,
          tags: body.tags ?? [],
          status: 'OPEN',
        },
      }),
      prisma.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: { decrement: positionCost } },
      }),
    ]);

    await auditLog(userId, 'POSITION_OPENED', 'PaperPosition', position.id, {
      symbol: body.symbol,
      side: body.side,
      quantity: body.quantity,
      entryPrice: body.entryPrice,
      positionCost,
      cashAfter: portfolio.cashBalance - positionCost,
    });

    const { unrealizedPnl, unrealizedPct } = computeUnrealizedPnl(
      position.side,
      position.entryPrice,
      position.entryPrice,
      position.quantity,
    );

    return res.status(201).json({
      success: true,
      message: `Position opened: ${body.side.toUpperCase()} ${body.quantity} ${body.symbol} @ $${body.entryPrice}`,
      data: { position: { ...position, unrealizedPnl, unrealizedPct } },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid position data',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    console.error('[POST /paper-positions/open]', err);
    return res.status(500).json({ success: false, error: 'Failed to open position' });
  }
});

router.post('/close', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;

    const CloseSchema = z.object({
      positionId: z.string().min(1),
      exitPrice: z.number().positive('Exit price must be positive'),
      notes: z.string().max(500).optional(),
      closeReason: z.enum(['HIT_TARGET', 'HIT_STOP', 'MANUAL', 'THESIS_INVALIDATED', 'TIME_EXIT']).optional().default('MANUAL'),
    });

    const body = CloseSchema.parse(req.body);
    const portfolio = await getOrCreatePortfolio(userId);

    const position = await prisma.paperPosition.findFirst({
      where: { id: body.positionId, portfolioId: portfolio.id, status: 'OPEN' },
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found or already closed' });
    }

    const dir = position.side === 'LONG' ? 1 : -1;
    const pnl = (body.exitPrice - position.entryPrice) * position.quantity * dir;
    const pnlPercent = ((body.exitPrice - position.entryPrice) / position.entryPrice) * 100 * dir;
    const openMs = Date.now() - new Date(position.openedAt).getTime();
    const holdingPeriodDays = Math.round(openMs / (1000 * 60 * 60 * 24));
    const exitValue = body.exitPrice * position.quantity;

    let thesisOutcome: string;
    if (pnl > 0) {
      thesisOutcome =
        body.closeReason === 'HIT_TARGET' ? 'TARGET_HIT' : 'PARTIAL_WIN';
    } else if (pnl < 0) {
      thesisOutcome =
        body.closeReason === 'HIT_STOP' || body.closeReason === 'THESIS_INVALIDATED'
          ? 'INVALIDATED'
          : 'STOPPED_OUT';
    } else {
      thesisOutcome = 'BREAKEVEN';
    }

    const [closed] = await prisma.$transaction([
      prisma.closedPosition.create({
        data: {
          portfolioId: portfolio.id,
          userId,
          symbol: position.symbol,
          name: position.name,
          assetClass: position.assetClass,
          side: position.side,
          quantity: position.quantity,
          entryPrice: position.entryPrice,
          exitPrice: body.exitPrice,
          targetPrice: position.targetPrice,
          stopLoss: position.stopLoss,
          pnl,
          pnlPercent,
          thesis: position.thesis,
          thesisOutcome,
          tags: position.tags,
          notes: body.notes,
          closeReason: body.closeReason,
          openedAt: position.openedAt,
          holdingPeriodDays,
        },
      }),
      prisma.paperPosition.update({
        where: { id: position.id },
        data: { status: 'CLOSED' },
      }),
      prisma.portfolio.update({
        where: { id: portfolio.id },
        data: { cashBalance: { increment: exitValue } },
      }),
    ]);

    await auditLog(userId, 'POSITION_CLOSED', 'ClosedPosition', closed.id, {
      symbol: position.symbol,
      side: position.side,
      entryPrice: position.entryPrice,
      exitPrice: body.exitPrice,
      pnl,
      pnlPercent,
      holdingPeriodDays,
      closeReason: body.closeReason,
      thesisOutcome,
    });

    return res.json({
      success: true,
      message: `Position closed: ${pnl >= 0 ? 'WIN' : 'LOSS'} $${Math.abs(pnl).toFixed(2)} (${pnlPercent.toFixed(2)}%)`,
      data: { closed },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid close data',
        details: err.errors.map((e) => ({ field: e.path.join('.'), message: e.message })),
      });
    }
    console.error('[POST /paper-positions/close]', err);
    return res.status(500).json({ success: false, error: 'Failed to close position' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const portfolio = await getOrCreatePortfolio(userId);

    const position = await prisma.paperPosition.findFirst({
      where: { id: req.params.id, portfolioId: portfolio.id },
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    const [enriched] = await enrichPositions([position]);
    return res.json({ success: true, data: { position: enriched } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to load position' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const body = UpdatePositionSchema.parse(req.body);
    const portfolio = await getOrCreatePortfolio(userId);

    const position = await prisma.paperPosition.findFirst({
      where: { id: req.params.id, portfolioId: portfolio.id, status: 'OPEN' },
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Open position not found' });
    }

    const updated = await prisma.paperPosition.update({
      where: { id: position.id },
      data: {
        ...(body.targetPrice !== undefined && { targetPrice: body.targetPrice }),
        ...(body.stopLoss !== undefined && { stopLoss: body.stopLoss }),
        ...(body.thesis !== undefined && { thesis: body.thesis }),
        ...(body.thesisHealth !== undefined && { thesisHealth: body.thesisHealth }),
        ...(body.tags !== undefined && { tags: body.tags }),
      },
    });

    await auditLog(userId, 'POSITION_UPDATED', 'PaperPosition', position.id, {
      changes: body,
    });

    return res.json({ success: true, data: { position: updated } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: 'Invalid update data' });
    }
    return res.status(500).json({ success: false, error: 'Failed to update position' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const portfolio = await getOrCreatePortfolio(userId);

    const position = await prisma.paperPosition.findFirst({
      where: { id: req.params.id, portfolioId: portfolio.id },
    });

    if (!position) {
      return res.status(404).json({ success: false, error: 'Position not found' });
    }

    if (position.status === 'OPEN') {
      const refund = position.entryPrice * position.quantity;
      await prisma.$transaction([
        prisma.paperPosition.delete({ where: { id: position.id } }),
        prisma.portfolio.update({
          where: { id: portfolio.id },
          data: { cashBalance: { increment: refund } },
        }),
      ]);
    } else {
      await prisma.paperPosition.delete({ where: { id: position.id } });
    }

    await auditLog(userId, 'POSITION_DELETED', 'PaperPosition', position.id, {
      symbol: position.symbol,
    });

    return res.json({ success: true, message: 'Position deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to delete position' });
  }
});

router.post('/:id/refresh', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { id } = req.params;
  try {
    const result = await refreshPosition(id, userId);
    return res.json({ success: true, data: result });
  } catch (err: any) {
    const msg = err?.message ?? 'Failed to refresh position';
    const status = msg === 'Position not found or not open' ? 404 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
});

router.get('/:id/snapshots', async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  const { id } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
  try {
    const position = await prisma.paperPosition.findFirst({
      where: { id, userId },
      select: { id: true, symbol: true },
    });
    if (!position) return res.status(404).json({ success: false, error: 'Position not found' });

    const snapshots = await prisma.positionSnapshot.findMany({
      where: { positionId: id },
      orderBy: { snapshotAt: 'desc' },
      take: limit,
    });
    return res.json({ success: true, data: { snapshots: snapshots.reverse() } });
  } catch {
    return res.status(500).json({ success: false, error: 'Failed to fetch snapshots' });
  }
});

export default router;
