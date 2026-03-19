import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  getAccount,
  getPositions,
  getOpenOrders,
  getAllOrders,
  getPortfolioHistory,
  getMarketClock,
  computeDrawdownPct,
} from '../services/alpaca/alpacaInfoService';
import {
  placeOrder,
  cancelOrder,
  cancelAllOrders,
  closePosition,
} from '../services/alpaca/alpacaExchangeService';
import {
  pauseTrading,
  hardStop,
  executeEmergencyExit,
  resumeTrading,
  getControlStatus,
} from '../services/alpaca/alpacaKillswitchService';
import { runTestSuite, getLastTestResult } from '../services/alpaca/AlpacaTestSuite';
import { runStrategyReplay } from '../services/alpaca/StrategyReplayService';
import { getLatencyStats } from '../services/alpaca/LatencyMonitor';
import { hasAlpacaCredentials } from '../services/alpaca/alpacaConfig';
import { prisma } from '../lib/prisma';

const router = Router();

function requireAlpacaCredentials(req: any, res: any, next: any) {
  if (!hasAlpacaCredentials()) {
    return res.status(400).json({ success: false, error: 'Alpaca credentials not configured' });
  }
  next();
}

router.get('/status', requireAuth, async (req, res) => {
  try {
    const controlStatus = getControlStatus();
    if (!hasAlpacaCredentials()) {
      return res.json({
        success: true,
        data: {
          hasCredentials: false,
          killswitch: { ...controlStatus, controlLevel: controlStatus.controlLevel },
        },
      });
    }
    const [account, positions, openOrders] = await Promise.all([
      getAccount(),
      getPositions(),
      getOpenOrders(),
    ]);
    const drawdownPct = computeDrawdownPct(account);
    return res.json({
      success: true,
      data: {
        hasCredentials: true,
        account,
        positionCount: positions.length,
        openOrderCount: openOrders.length,
        drawdownPct,
        killswitch: {
          active:       controlStatus.active,
          controlLevel: controlStatus.controlLevel,
          reason:       controlStatus.killswitch.reason,
          activatedAt:  controlStatus.killswitch.activatedAt,
          pause:        controlStatus.pause,
          monitorRunning: controlStatus.monitorRunning,
        },
        dryRun: controlStatus.dryRun,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Failed to get status' });
  }
});

router.get('/account', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const account = await getAccount();
    res.json({ success: true, data: account });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/positions', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const positions = await getPositions();
    res.json({ success: true, data: positions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/orders', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const orders = await getOpenOrders();
    res.json({ success: true, data: orders });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/orders/history', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const limit = parseInt(String(req.query.limit ?? '50'));
    const orders = await getAllOrders(limit);
    res.json({ success: true, data: orders });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/portfolio/history', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const period    = String(req.query.period ?? '1M');
    const timeframe = String(req.query.timeframe ?? '1D');
    const history = await getPortfolioHistory(period, timeframe);
    res.json({ success: true, data: history });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/orders', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const userId = (req as any).session?.userId;
    const result = await placeOrder({ ...req.body, userId });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

router.delete('/orders', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const count = await cancelAllOrders((req as any).session?.userId);
    res.json({ success: true, data: { cancelled: count } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.delete('/orders/:id', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const ok = await cancelOrder(req.params.id, (req as any).session?.userId);
    res.json({ success: ok, data: { cancelled: ok } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.delete('/positions/:symbol', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const result = await closePosition(req.params.symbol, (req as any).session?.userId);
    res.json({ success: result.success, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/controls/pause', requireAuth, async (req, res) => {
  try {
    const reason = req.body.reason ?? 'Manual pause';
    await pauseTrading(reason, (req as any).session?.userId);
    res.json({ success: true, data: { controlLevel: 'PAUSE', reason } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/controls/hard-stop', requireAuth, async (req, res) => {
  try {
    const reason = req.body.reason ?? 'Manual hard stop';
    const cancelled = await hardStop(reason, (req as any).session?.userId);
    res.json({ success: true, data: { controlLevel: 'HARD_STOP', reason, ordersCancelled: cancelled } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/controls/emergency-exit', requireAuth, async (req, res) => {
  try {
    if (req.body.confirmText !== 'CONFIRM') {
      return res.status(400).json({ success: false, error: 'confirmText must be "CONFIRM"' });
    }
    const reason = req.body.reason ?? 'Emergency exit';
    const result = await executeEmergencyExit(reason, (req as any).session?.userId);
    res.json({ success: true, data: { controlLevel: 'HARD_STOP', ...result } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/controls/resume', requireAuth, async (req, res) => {
  try {
    await resumeTrading((req as any).session?.userId);
    res.json({ success: true, data: { controlLevel: 'ACTIVE' } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/order-log', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).session?.userId ?? '';
    const logs = await prisma.alpacaOrderLog.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data: logs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/clock', requireAuth, async (req, res) => {
  try {
    if (!hasAlpacaCredentials()) {
      return res.json({ success: true, data: { is_open: false, next_open: null, next_close: null } });
    }
    const clock = await getMarketClock();
    res.json({ success: true, data: clock });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/latency/stats', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).session?.userId ?? '';
    const stats = await getLatencyStats(userId);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.post('/test-suite/run', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const userId = (req as any).session?.userId ?? 'system';
    const result = await runTestSuite(userId);
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

router.get('/test-suite/last', requireAuth, async (req, res) => {
  const last = getLastTestResult();
  res.json({ success: true, data: last });
});

router.post('/replay', requireAuth, requireAlpacaCredentials, async (req, res) => {
  try {
    const userId = (req as any).session?.userId ?? 'system';
    const result = await runStrategyReplay({ ...req.body, userId });
    res.json({ success: true, data: result });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err?.message });
  }
});

router.get('/replay/history', requireAuth, async (req, res) => {
  try {
    const userId = (req as any).session?.userId ?? '';
    const groups = await prisma.alpacaOrderLog.groupBy({
      by: ['scanRunId'],
      where: { userId, scanRunId: { not: null } },
      _count: { id: true },
      _max: { submittedAt: true },
      orderBy: { _max: { submittedAt: 'desc' } },
      take: 10,
    });
    res.json({ success: true, data: groups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export default router;
