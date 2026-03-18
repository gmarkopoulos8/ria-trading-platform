import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { period = 'all' } = req.query;
  res.json({
    success: true,
    message: 'Performance report — not yet implemented',
    data: { period, metrics: null, equityCurve: [] },
  });
});

router.get('/metrics', async (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Performance metrics — not yet implemented',
    data: { metrics: null },
  });
});

router.get('/equity-curve', async (req: Request, res: Response) => {
  const { period = 'all' } = req.query;
  res.json({
    success: true,
    message: 'Equity curve — not yet implemented',
    data: { period, points: [] },
  });
});

router.get('/trade-log', async (req: Request, res: Response) => {
  const { page = 1, pageSize = 20 } = req.query;
  res.json({
    success: true,
    message: 'Trade log — not yet implemented',
    data: { trades: [], total: 0, page, pageSize },
  });
});

export default router;
