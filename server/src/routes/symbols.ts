import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { marketService } from '../services/market/MarketService';
import { Timeframe } from '../services/market/types';
import { technicalService } from '../services/technical/TechnicalService';
import { Timeframe as TechTimeframe } from '../services/technical/types';

const router = Router();

const VALID_TIMEFRAMES = new Set<Timeframe>(['1D', '1W', '1M', '3M', '6M', '1Y', '5Y']);

function parseTimeframe(raw: unknown): Timeframe {
  const t = String(raw ?? '1M').toUpperCase();
  return VALID_TIMEFRAMES.has(t as Timeframe) ? (t as Timeframe) : '1M';
}

router.get('/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q ?? '').trim();
    if (!q || q.length < 1) {
      return res.json({ success: true, data: { results: [] } });
    }
    if (q.length > 50) {
      return res.status(400).json({ success: false, error: 'Query too long' });
    }

    const results = await marketService.search(q);
    return res.json({ success: true, data: { query: q, results } });
  } catch (err) {
    console.error('[/symbols/search]', err);
    return res.status(500).json({ success: false, error: 'Search failed' });
  }
});

router.get('/:symbol/quote', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'etf' ? 'etf' :
      assetClassRaw === 'stock' ? 'stock' : undefined;

    const quote = await marketService.quote(symbol, assetClass);
    return res.json({ success: true, data: { quote } });
  } catch (err) {
    console.error('[/symbols/:symbol/quote]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch quote' });
  }
});

router.get('/:symbol/history', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = parseTimeframe(req.query.timeframe ?? req.query.period);
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'etf' ? 'etf' :
      assetClassRaw === 'stock' ? 'stock' : undefined;

    const bars = await marketService.history(symbol, timeframe, assetClass);
    return res.json({ success: true, data: { symbol, timeframe, bars } });
  } catch (err) {
    console.error('[/symbols/:symbol/history]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

router.get('/:symbol/catalysts', async (req: Request, res: Response) => {
  const { symbol } = req.params;
  return res.json({
    success: true,
    data: { symbol: symbol.toUpperCase(), catalysts: [] },
  });
});

router.get('/:symbol/technical', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = parseTimeframe(req.query.timeframe) as TechTimeframe;
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'etf' ? 'etf' :
      assetClassRaw === 'stock' ? 'stock' : undefined;

    const bars = await marketService.history(symbol, timeframe, assetClass);

    const ohlcvBars = bars.map((b: any) => ({
      timestamp: new Date(b.timestamp),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    const analysis = await technicalService.analyze(symbol, ohlcvBars, timeframe);
    return res.json({ success: true, data: { analysis } });
  } catch (err) {
    console.error('[/symbols/:symbol/technical]', err);
    return res.status(500).json({ success: false, error: 'Technical analysis failed' });
  }
});

router.get('/:symbol/patterns', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = parseTimeframe(req.query.timeframe) as TechTimeframe;
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'etf' ? 'etf' :
      assetClassRaw === 'stock' ? 'stock' : undefined;

    const bars = await marketService.history(symbol, timeframe, assetClass);

    const ohlcvBars = bars.map((b: any) => ({
      timestamp: new Date(b.timestamp),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    const patterns = await technicalService.analyzePatterns(symbol, ohlcvBars, timeframe);
    return res.json({ success: true, data: { patterns } });
  } catch (err) {
    console.error('[/symbols/:symbol/patterns]', err);
    return res.status(500).json({ success: false, error: 'Pattern analysis failed' });
  }
});

router.get('/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const quote = await marketService.quote(symbol);
    return res.json({ success: true, data: { symbol, quote } });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Failed to fetch symbol data' });
  }
});

export default router;
