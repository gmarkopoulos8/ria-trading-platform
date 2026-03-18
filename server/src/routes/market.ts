import { Router, Request, Response } from 'express';
import { marketService } from '../services/market/MarketService';
import { AssetClass } from '../services/market/types';

const router = Router();

router.get('/overview', async (req: Request, res: Response) => {
  try {
    const [indexQuotes, cryptoQuotes] = await Promise.allSettled([
      Promise.all([
        marketService.quote('SPY', 'stock'),
        marketService.quote('QQQ', 'stock'),
      ]),
      Promise.all([
        marketService.quote('BTC', 'crypto'),
        marketService.quote('ETH', 'crypto'),
      ]),
    ]);

    const indices = indexQuotes.status === 'fulfilled' ? indexQuotes.value : [];
    const cryptos = cryptoQuotes.status === 'fulfilled' ? cryptoQuotes.value : [];

    const now = new Date();
    const hour = now.getUTCHours();
    const day = now.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    const isMarketHours = !isWeekend && hour >= 13 && hour < 21;
    const isPreMarket = !isWeekend && hour >= 9 && hour < 13;

    return res.json({
      success: true,
      data: {
        status: isMarketHours ? 'open' : isPreMarket ? 'pre-market' : 'closed',
        indices,
        crypto: cryptos,
        timestamp: now,
      },
    });
  } catch (err) {
    console.error('[/market/overview]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch overview' });
  }
});

router.get('/opportunities', async (req: Request, res: Response) => {
  try {
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass: AssetClass | undefined =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'stock' ? 'stock' : undefined;
    const limit = Math.min(parseInt(String(req.query.limit ?? '20')), 50);

    const quotes = await marketService.getScanOpportunities(assetClass, limit);

    const opportunities = quotes.map((q) => {
      const absChange = Math.abs(q.changePercent);
      const momentum = Math.min(100, Math.round(absChange * 8 + 40 + Math.random() * 20));
      const thesisScore = Math.min(99, Math.round(momentum * 0.7 + absChange * 3 + Math.random() * 15));
      const volumeAnomaly = Math.round(1 + Math.random() * 4.5 * 10) / 10;

      return {
        id: `${q.symbol}-${Date.now()}`,
        symbol: q.symbol,
        name: q.name,
        assetClass: q.assetClass,
        price: q.price,
        change: q.change,
        changePercent: q.changePercent,
        thesisScore,
        momentum,
        volumeAnomaly,
        trend: q.changePercent >= 0 ? 'up' : 'down',
        riskLevel:
          thesisScore >= 80 ? 'low' :
          thesisScore >= 60 ? 'medium' : 'high',
        catalysts: [],
        isMock: q.isMock ?? false,
      };
    });

    const sorted = opportunities.sort((a, b) => b.thesisScore - a.thesisScore);
    const highConviction = sorted.filter((o) => o.thesisScore >= 80).length;
    const avgScore =
      sorted.length > 0
        ? Math.round(sorted.reduce((s, o) => s + o.thesisScore, 0) / sorted.length)
        : 0;

    return res.json({
      success: true,
      data: {
        opportunities: sorted,
        meta: {
          total: sorted.length,
          highConviction,
          avgScore,
        },
      },
    });
  } catch (err) {
    console.error('[/market/opportunities]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch opportunities' });
  }
});

router.get('/movers', async (req: Request, res: Response) => {
  try {
    const assetClassRaw = String(req.query.assetClass ?? '').toLowerCase();
    const assetClass: AssetClass | undefined =
      assetClassRaw === 'crypto' ? 'crypto' :
      assetClassRaw === 'stock' ? 'stock' : undefined;
    const direction = String(req.query.direction ?? 'up');
    const limit = Math.min(parseInt(String(req.query.limit ?? '10')), 30);

    const quotes = await marketService.getScanOpportunities(assetClass, 20);
    const movers = quotes
      .sort((a, b) =>
        direction === 'up'
          ? b.changePercent - a.changePercent
          : a.changePercent - b.changePercent
      )
      .slice(0, limit);

    return res.json({
      success: true,
      data: { direction, movers },
    });
  } catch (err) {
    console.error('[/market/movers]', err);
    return res.status(500).json({ success: false, error: 'Failed to fetch movers' });
  }
});

router.get('/sectors', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: { sectors: [] },
  });
});

router.get('/heatmap', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    data: { cells: [] },
  });
});

export default router;
