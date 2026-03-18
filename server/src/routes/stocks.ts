import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { analyzeStockHealth, getSearchHistory, clearSearchHistory } from '../services/health/StockHealthService';

const router = Router();
router.use(requireAuth);

const TICKER_RE = /^[A-Z]{1,6}(\.[A-Z]{1,2})?$/;

router.get('/:ticker/health', async (req: Request, res: Response) => {
  try {
    const ticker = req.params.ticker.toUpperCase().trim();

    if (!TICKER_RE.test(ticker)) {
      return res.status(400).json({ success: false, error: `Invalid ticker format: "${ticker}". Tickers must be 1-6 uppercase letters.` });
    }

    const userId = req.session.userId!;
    const result = await analyzeStockHealth(ticker, userId);

    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed';
    const status = message.includes('crypto') ? 400 : 500;
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/search/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt((req.query.limit as string) ?? '20', 10);
    const history = await getSearchHistory(req.session.userId!, limit);
    res.json({ success: true, data: { history } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch search history' });
  }
});

router.delete('/search/history', async (req: Request, res: Response) => {
  try {
    await clearSearchHistory(req.session.userId!);
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to clear history' });
  }
});

export default router;
