import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getOverview,
  getPatternAnalysis,
  getSectorAnalysis,
  getCatalystAnalysis,
  getThesisQuality,
  type AnalyticsFilters,
} from '../services/analytics/PerformanceService';

const router = Router();
router.use(requireAuth);

function parseFilters(req: Request): AnalyticsFilters {
  const { startDate, endDate, assetClass, side, outcome } = req.query as Record<string, string>;
  return {
    userId: req.session.userId!,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    assetClass: assetClass || undefined,
    side: side || undefined,
    outcome: outcome || undefined,
  };
}

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getOverview(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[perf.overview]', err);
    res.status(500).json({ success: false, error: 'Failed to compute performance overview' });
  }
});

router.get('/patterns', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getPatternAnalysis(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[perf.patterns]', err);
    res.status(500).json({ success: false, error: 'Failed to compute pattern analysis' });
  }
});

router.get('/sectors', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getSectorAnalysis(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[perf.sectors]', err);
    res.status(500).json({ success: false, error: 'Failed to compute sector analysis' });
  }
});

router.get('/catalysts', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getCatalystAnalysis(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[perf.catalysts]', err);
    res.status(500).json({ success: false, error: 'Failed to compute catalyst analysis' });
  }
});

router.get('/thesis-quality', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getThesisQuality(filters);
    res.json({ success: true, data });
  } catch (err) {
    console.error('[perf.thesis-quality]', err);
    res.status(500).json({ success: false, error: 'Failed to compute thesis quality' });
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getOverview(filters);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to compute performance' });
  }
});

router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getOverview(filters);
    res.json({ success: true, data: { metrics: data } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to compute metrics' });
  }
});

router.get('/equity-curve', async (req: Request, res: Response) => {
  try {
    const filters = parseFilters(req);
    const data = await getOverview(filters);
    res.json({ success: true, data: { points: data.equityCurve } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to compute equity curve' });
  }
});

router.get('/trade-log', async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const page = parseInt((req.query.page as string) ?? '1', 10);
    const pageSize = Math.min(parseInt((req.query.pageSize as string) ?? '20', 10), 100);
    const { assetClass, side, outcome } = req.query as Record<string, string>;

    const where: Record<string, unknown> = { userId };
    if (assetClass && assetClass !== 'all') where.assetClass = assetClass;
    if (side && side !== 'all') where.side = side.toUpperCase();
    if (outcome && outcome !== 'all') where.thesisOutcome = outcome;

    const { prisma } = await import('../lib/prisma');
    const [trades, total] = await Promise.all([
      prisma.closedPosition.findMany({
        where: where as Parameters<typeof prisma.closedPosition.findMany>[0]['where'],
        orderBy: { closedAt: 'desc' },
        take: pageSize,
        skip: (page - 1) * pageSize,
      }),
      prisma.closedPosition.count({
        where: where as Parameters<typeof prisma.closedPosition.count>[0]['where'],
      }),
    ]);

    res.json({ success: true, data: { trades, total, page, pageSize, pages: Math.ceil(total / pageSize) } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch trade log' });
  }
});

export default router;
