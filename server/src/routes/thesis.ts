import { Router, Request, Response } from 'express';
import { thesisEngine } from '../services/thesis/ThesisEngine';
import { isCryptoSymbol } from '../services/market/utils';

const router = Router();

function resolveAssetClass(symbol: string, raw?: string): string {
  if (raw) return raw.toLowerCase();
  return isCryptoSymbol(symbol) ? 'crypto' : 'stock';
}

router.get('/symbols/:symbol/analyze', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const assetClass = resolveAssetClass(symbol, String(req.query.assetClass ?? ''));

    const result = await thesisEngine.analyze(symbol, assetClass);

    return res.json({
      success: true,
      data: {
        ticker: result.ticker,
        marketStructure: result.marketStructure,
        catalysts: result.catalysts,
        risk: result.risk,
        thesis: result.thesis,
        analyzedAt: result.analyzedAt,
      },
    });
  } catch (err) {
    console.error('[/analyze]', err);
    return res.status(500).json({ success: false, error: 'Analysis failed' });
  }
});

router.get('/symbols/:symbol/thesis', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const assetClass = resolveAssetClass(symbol, String(req.query.assetClass ?? ''));

    const result = await thesisEngine.analyze(symbol, assetClass);

    return res.json({
      success: true,
      data: { thesis: result.thesis },
    });
  } catch (err) {
    console.error('[/thesis]', err);
    return res.status(500).json({ success: false, error: 'Failed to generate thesis' });
  }
});

router.get('/scan', async (req: Request, res: Response) => {
  try {
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass = ['stock', 'crypto'].includes(assetClassRaw) ? assetClassRaw : undefined;
    const limit = Math.min(10, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10)));

    const summaries = await thesisEngine.scan(assetClass, limit);

    const bullish = summaries.filter((s) => s.bias === 'BULLISH').length;
    const highConviction = summaries.filter((s) => s.convictionScore >= 70).length;
    const avgConviction = summaries.length > 0
      ? Math.round(summaries.reduce((s, x) => s + x.convictionScore, 0) / summaries.length)
      : 0;

    return res.json({
      success: true,
      data: {
        summaries,
        meta: {
          total: summaries.length,
          bullish,
          bearish: summaries.filter((s) => s.bias === 'BEARISH').length,
          neutral: summaries.filter((s) => s.bias === 'NEUTRAL').length,
          highConviction,
          avgConviction,
        },
      },
    });
  } catch (err) {
    console.error('[/scan]', err);
    return res.status(500).json({ success: false, error: 'Scan failed' });
  }
});

export default router;
