import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
router.use(requireAuth);

const QuerySchema = z.object({
  symbol: z.string().optional(),
  severity: z.string().optional(),
  alertType: z.string().optional(),
  unread: z.string().optional(),
  positionId: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const q = QuerySchema.parse(req.query);
    const limit = Math.min(parseInt(q.limit ?? '50', 10), 100);
    const offset = parseInt(q.offset ?? '0', 10);

    const where: Record<string, unknown> = { userId };
    if (q.symbol) where.symbol = q.symbol.toUpperCase();
    if (q.severity) where.severity = q.severity.toUpperCase();
    if (q.alertType) where.alertType = q.alertType;
    if (q.positionId) where.positionId = q.positionId;
    if (q.unread === 'true') where.isRead = false;

    const [alerts, total, unreadCount] = await Promise.all([
      prisma.monitoringAlert.findMany({
        where: where as Parameters<typeof prisma.monitoringAlert.findMany>[0]['where'],
        orderBy: { triggeredAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.monitoringAlert.count({ where: where as Parameters<typeof prisma.monitoringAlert.count>[0]['where'] }),
      prisma.monitoringAlert.count({ where: { userId, isRead: false } }),
    ]);

    res.json({
      success: true,
      data: { alerts, total, unreadCount, limit, offset },
    });
  } catch (err) {
    console.error('[alerts.GET /]', err);
    res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
  }
});

router.get('/unread-count', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const count = await prisma.monitoringAlert.count({ where: { userId, isRead: false } });
    res.json({ success: true, data: { count } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to count unread alerts' });
  }
});

router.post('/:id/read', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const alert = await prisma.monitoringAlert.findFirst({ where: { id, userId } });
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
    const updated = await prisma.monitoringAlert.update({
      where: { id },
      data: { isRead: true },
    });
    res.json({ success: true, data: { alert: updated } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to mark alert as read' });
  }
});

router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { symbol } = req.body as { symbol?: string };
    const where: Record<string, unknown> = { userId, isRead: false };
    if (symbol) where.symbol = symbol.toUpperCase();
    const { count } = await prisma.monitoringAlert.updateMany({
      where: where as Parameters<typeof prisma.monitoringAlert.updateMany>[0]['where'],
      data: { isRead: true },
    });
    res.json({ success: true, data: { count } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to mark alerts as read' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { id } = req.params;
    const alert = await prisma.monitoringAlert.findFirst({ where: { id, userId } });
    if (!alert) return res.status(404).json({ success: false, error: 'Alert not found' });
    await prisma.monitoringAlert.delete({ where: { id } });
    res.json({ success: true, message: 'Alert deleted' });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to delete alert' });
  }
});

router.delete('/', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const { symbol, read } = req.query;
    const where: Record<string, unknown> = { userId };
    if (symbol) where.symbol = (symbol as string).toUpperCase();
    if (read === 'true') where.isRead = true;
    const { count } = await prisma.monitoringAlert.deleteMany({
      where: where as Parameters<typeof prisma.monitoringAlert.deleteMany>[0]['where'],
    });
    res.json({ success: true, data: { count } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to clear alerts' });
  }
});

export default router;
