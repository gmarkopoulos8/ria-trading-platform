import { Router, Request, Response } from 'express';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const { symbol, limit = 20, category } = req.query;
  res.json({
    success: true,
    message: 'News feed — data integration not yet implemented',
    data: { filters: { symbol, limit, category }, articles: [] },
  });
});

router.get('/catalysts', async (req: Request, res: Response) => {
  const { symbol, type } = req.query;
  res.json({
    success: true,
    message: 'Catalyst intelligence — not yet implemented',
    data: { filters: { symbol, type }, catalysts: [] },
  });
});

router.get('/sentiment', async (req: Request, res: Response) => {
  const { symbol } = req.query;
  res.json({
    success: true,
    message: 'Sentiment analysis — not yet implemented',
    data: { symbol, sentiment: null },
  });
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: `News article ${id} — not yet implemented`,
    data: null,
  });
});

export default router;
