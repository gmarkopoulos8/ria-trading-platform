import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  fetchMarkets,
  fetchMarket,
  fetchEvent,
  fetchRelatedMarkets,
  recordSearch,
  type MarketListFilters,
} from '../services/polymarket/polymarketMarketService';
import {
  fetchPriceHistory,
  fetchOrderbook,
} from '../services/polymarket/polymarketClobReadService';
import { analyzeMarket } from '../services/polymarket/polymarketThesisService';
import {
  openPosition,
  closePosition,
  getOpenPositions,
  getClosedPositions,
  getPosition,
  refreshPositionMarks,
} from '../services/polymarket/polymarketPaperTradeService';
import {
  getAlerts,
  markAlertRead,
  dismissAlert,
  generateAlertsForUser,
  getUnreadCount,
} from '../services/polymarket/polymarketAlertService';
import { prisma } from '../lib/prisma';

const router = Router();
router.use(requireAuth);

// ─── Market Discovery ─────────────────────────────────────────────

router.get('/markets', async (req: Request, res: Response) => {
  try {
    const filters: MarketListFilters = {
      keyword:      req.query.keyword     as string | undefined,
      category:     req.query.category    as string | undefined,
      status:      (req.query.status      as 'active' | 'closed' | 'all') ?? 'active',
      minLiquidity: req.query.minLiquidity ? Number(req.query.minLiquidity) : undefined,
      minVolume:    req.query.minVolume    ? Number(req.query.minVolume)    : undefined,
      limit:        req.query.limit        ? Number(req.query.limit)        : 50,
      offset:       req.query.offset       ? Number(req.query.offset)       : 0,
      sortBy:      (req.query.sortBy       as 'volume' | 'liquidity' | 'endDate') ?? 'volume',
    };
    const markets = await fetchMarkets(filters);
    res.json({ success: true, data: { markets, count: markets.length } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch markets';
    res.status(500).json({ success: false, error: message });
  }
});

router.get('/markets/:id', async (req: Request, res: Response) => {
  try {
    const market = await fetchMarket(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });
    res.json({ success: true, data: { market } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const event = await fetchEvent(req.params.id);
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    const related = await fetchRelatedMarkets(req.params.id);
    res.json({ success: true, data: { event, related } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Thesis / Analysis ────────────────────────────────────────────

router.get('/markets/:id/thesis', async (req: Request, res: Response) => {
  try {
    const market = await fetchMarket(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    let history: any[] = [];
    if (market.conditionId) {
      history = await fetchPriceHistory(market.conditionId, '7d');
    }

    const thesis = await analyzeMarket(market, history, req.session.userId!);

    await recordSearch(req.session.userId!, market, thesis.healthScore, thesis.actionLabel);

    res.json({ success: true, data: { thesis, market } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Analysis failed' });
  }
});

// ─── Price History ────────────────────────────────────────────────

router.get('/markets/:id/history', async (req: Request, res: Response) => {
  try {
    const market = await fetchMarket(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const conditionId = market.conditionId || req.params.id;
    const interval    = (req.query.interval as string) ?? '1d';
    const history     = await fetchPriceHistory(conditionId, interval);
    res.json({ success: true, data: { history, conditionId, interval } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Order Book ───────────────────────────────────────────────────

router.get('/markets/:id/orderbook', async (req: Request, res: Response) => {
  try {
    const market = await fetchMarket(req.params.id);
    if (!market) return res.status(404).json({ success: false, error: 'Market not found' });

    const conditionId = market.conditionId || req.params.id;
    const orderbook   = await fetchOrderbook(conditionId);
    res.json({ success: true, data: { orderbook } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Paper Positions ──────────────────────────────────────────────

router.post('/paper-positions', async (req: Request, res: Response) => {
  try {
    const { marketId, eventId, question, selectedSide, entryProbability, quantity, capitalAllocated, thesisId, thesisHealth, notes } = req.body;
    if (!marketId || !question || !selectedSide || entryProbability == null || !quantity || !capitalAllocated) {
      return res.status(400).json({ success: false, error: 'Missing required fields: marketId, question, selectedSide, entryProbability, quantity, capitalAllocated' });
    }
    if (!['YES', 'NO'].includes(selectedSide)) {
      return res.status(400).json({ success: false, error: 'selectedSide must be YES or NO' });
    }
    const position = await openPosition(req.session.userId!, { marketId, eventId, question, selectedSide, entryProbability: parseFloat(entryProbability), quantity: parseFloat(quantity), capitalAllocated: parseFloat(capitalAllocated), thesisId, thesisHealth, notes });
    res.status(201).json({ success: true, data: { position } });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to open position';
    res.status(400).json({ success: false, error: message });
  }
});

router.get('/paper-positions', async (req: Request, res: Response) => {
  try {
    await refreshPositionMarks(req.session.userId!);
    const open   = await getOpenPositions(req.session.userId!);
    const closed = await getClosedPositions(req.session.userId!);
    const totalPnl   = closed.reduce((s, c) => s + c.realizedPnl, 0);
    const openPnl    = open.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
    res.json({ success: true, data: { open, closed, summary: { openCount: open.length, closedCount: closed.length, totalRealizedPnl: totalPnl, totalUnrealizedPnl: openPnl } } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.get('/paper-positions/:id', async (req: Request, res: Response) => {
  try {
    const pos = await getPosition(req.session.userId!, req.params.id);
    if (!pos) return res.status(404).json({ success: false, error: 'Position not found' });
    res.json({ success: true, data: { position: pos } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/paper-positions/:id/close', async (req: Request, res: Response) => {
  try {
    const { exitProbability, resolution, notes } = req.body;
    if (exitProbability == null) return res.status(400).json({ success: false, error: 'exitProbability is required' });
    const result = await closePosition(req.session.userId!, { positionId: req.params.id, exitProbability: parseFloat(exitProbability), resolution, notes });
    res.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to close position';
    res.status(400).json({ success: false, error: message });
  }
});

// ─── Alerts ───────────────────────────────────────────────────────

router.get('/alerts', async (req: Request, res: Response) => {
  try {
    await generateAlertsForUser(req.session.userId!);
    const includeRead = req.query.all === 'true';
    const alerts = await getAlerts(req.session.userId!, includeRead);
    const count  = await getUnreadCount(req.session.userId!);
    res.json({ success: true, data: { alerts, unreadCount: count } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/alerts/:id/read', async (req: Request, res: Response) => {
  try {
    await markAlertRead(req.session.userId!, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

router.post('/alerts/:id/dismiss', async (req: Request, res: Response) => {
  try {
    await dismissAlert(req.session.userId!, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed' });
  }
});

// ─── Search History ───────────────────────────────────────────────

router.get('/search-history', async (req: Request, res: Response) => {
  try {
    const history = await prisma.polymarketSearchHistory.findMany({
      where: { userId: req.session.userId! },
      orderBy: { lastSearchedAt: 'desc' },
      take: 20,
    });
    res.json({ success: true, data: { history } });
  } catch {
    res.status(500).json({ success: false, error: 'Failed to fetch history' });
  }
});

export default router;
