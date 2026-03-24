import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(requireAuth);

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { status, exchange, assetClass, limit = '50', offset = '0', days = '30' } = req.query;

    const since = new Date(Date.now() - parseInt(String(days)) * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {
      userId,
      entryTime: { gte: since },
    };
    if (status)     where.status     = status;
    if (exchange)   where.exchange   = exchange;
    if (assetClass) where.assetClass = assetClass;

    const [trades, total] = await Promise.all([
      prisma.trade.findMany({
        where,
        orderBy: { entryTime: 'desc' },
        take:    parseInt(String(limit)),
        skip:    parseInt(String(offset)),
      }),
      prisma.trade.count({ where }),
    ]);

    res.json({ success: true, data: { trades, total } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch trades' });
  }
});

router.get('/summary', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { days = '30' } = req.query;
    const since = new Date(Date.now() - parseInt(String(days)) * 24 * 60 * 60 * 1000);

    const [closed, open, byExchange, byAsset] = await Promise.all([
      prisma.trade.aggregate({
        where:  { userId, status: 'CLOSED', entryTime: { gte: since } },
        _sum:   { realizedPnl: true },
        _count: { id: true },
      }),
      prisma.trade.aggregate({
        where:  { userId, status: 'OPEN' },
        _sum:   { unrealizedPnl: true },
        _count: { id: true },
      }),
      prisma.trade.groupBy({
        by:     ['exchange'],
        where:  { userId, status: 'CLOSED', entryTime: { gte: since } },
        _sum:   { realizedPnl: true },
        _count: { id: true },
      }),
      prisma.trade.groupBy({
        by:     ['assetClass'],
        where:  { userId, status: 'CLOSED', entryTime: { gte: since } },
        _sum:   { realizedPnl: true },
        _count: { id: true },
      }),
    ]);

    const wins = await prisma.trade.count({
      where: { userId, status: 'CLOSED', entryTime: { gte: since }, realizedPnl: { gt: 0 } },
    });

    const totalClosed = closed._count.id;

    res.json({
      success: true,
      data: {
        realizedPnl:   closed._sum.realizedPnl ?? 0,
        unrealizedPnl: open._sum.unrealizedPnl ?? 0,
        totalPnl:      (closed._sum.realizedPnl ?? 0) + (open._sum.unrealizedPnl ?? 0),
        totalTrades:   totalClosed,
        openTrades:    open._count.id,
        winRate:       totalClosed > 0 ? (wins / totalClosed) * 100 : 0,
        byExchange,
        byAsset,
        days: parseInt(String(days)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Summary failed' });
  }
});

export default router;
