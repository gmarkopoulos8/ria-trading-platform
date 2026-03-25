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
import { hasAlpacaCredentials, setAlpacaRuntimeCredentials, getAlpacaCredentials } from '../services/alpaca/alpacaConfig';
import {
  computeAdaptiveParameters,
  getCurrentParams,
  registerUserForAdaptation,
  type ParameterBounds,
} from '../services/alpaca/AdaptiveParameterEngine';
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

    // Auto-reload credentials from DB if runtime cache is empty
    if (!hasAlpacaCredentials()) {
      try {
        const userId = req.session!.userId as string;
        const { credentialService } = await import('../services/credentials/CredentialService');
        const creds = await credentialService.getAlpacaCredentials(userId);
        if (creds) setAlpacaRuntimeCredentials(creds);
      } catch { /* non-fatal */ }
    }

    if (!hasAlpacaCredentials()) {
      return res.json({
        success: true,
        data: {
          connected:      false,
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
        connected:      true,
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

// ─── Autonomous Trading Routes ────────────────────────────────────────────────

router.post('/auto/start', requireAuth, requireAlpacaCredentials, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).session?.userId as string;
    const {
      capitalTotal       = 500,
      maxPositions       = 3,
      capitalPerTrade,
      stopLossPct        = 3.0,
      takeProfitPct      = 6.0,
      minConvictionScore = 75,
      dryRun             = false,
      runNow             = true,
    } = req.body;

    // Update Alpaca dry run setting if changed
    const { credentialService } = await import('../services/credentials/CredentialService');
    const existing = await credentialService.getAlpacaCredentials(userId);
    if (existing && existing.dryRun !== dryRun) {
      await credentialService.saveAlpacaCredentials(userId, { ...existing, dryRun });
      setAlpacaRuntimeCredentials({ ...getAlpacaCredentials()!, dryRun });
    }

    // Enable autonomous mode via the unified system
    let settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) settings = await prisma.userSettings.create({ data: { userId } });

    await prisma.userSettings.update({
      where: { id: settings.id },
      data: {
        autoTradeEnabled:        true,
        autonomousMode:          true,
        autonomousMinConviction: minConvictionScore,
        autonomousMaxPositions:  maxPositions,
        autonomousCapitalPct:    capitalPerTrade
          ? (capitalPerTrade / capitalTotal) * 100
          : (100 / maxPositions),
      } as any,
    });

    // Optionally run one cycle immediately (don't wait for 9:30 AM)
    let immediateResult = null;
    if (runNow) {
      const { runAutonomousCycle } = await import('../services/autotrader/AutonomousExecutor');
      const results = await runAutonomousCycle('MANUAL');
      immediateResult = results[0] ?? null;
    }

    return res.json({
      success: true,
      data: {
        autonomousMode:   true,
        autoTradeEnabled: true,
        dryRun,
        ordersPlaced:     immediateResult?.tradesPlaced ?? 0,
        message: runNow
          ? `Autonomous trading enabled. ${immediateResult?.tradesPlaced ?? 0} trade(s) placed immediately.`
          : 'Autonomous trading enabled. Next cycle at market open (9:30 AM ET).',
        immediateResult,
      },
    });
  } catch (err: any) {
    console.error('[Alpaca Auto Start]', err?.message);
    res.status(500).json({ success: false, error: err?.message ?? 'Failed to start' });
  }
});

// (old one-shot auto/start replaced — now delegates to unified autonomous system)

router.post('/auto/monitor', requireAuth, requireAlpacaCredentials, async (req: Request, res: Response) => {
  try {
    const { runAutonomousCycle } = await import('../services/autotrader/AutonomousExecutor');
    const results = await runAutonomousCycle('MANUAL');
    const r = results[0];

    res.json({
      success: true,
      data: {
        tradesPlaced:   r?.tradesPlaced   ?? 0,
        tradesRejected: r?.tradesRejected ?? 0,
        regime:         r?.adaptiveRegime ?? 'UNKNOWN',
        dryRun:         r?.dryRun         ?? true,
        errors:         r?.errors         ?? [],
        actions: [],
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Monitor cycle failed' });
  }
});

router.get('/auto/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).session?.userId as string;

    let alpacaConnected = hasAlpacaCredentials();
    if (!alpacaConnected) {
      try {
        const { credentialService } = await import('../services/credentials/CredentialService');
        const creds = await credentialService.getAlpacaCredentials(userId);
        if (creds) { setAlpacaRuntimeCredentials(creds); alpacaConnected = true; }
      } catch { /* non-fatal */ }
    }

    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    const isActive  = !!(settings?.autoTradeEnabled && (settings as any)?.autonomousMode);
    const creds     = getAlpacaCredentials();

    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const todayStats = settings ? await prisma.autoTradeLog.aggregate({
      where: { userSettingsId: settings.id, executedAt: { gte: todayStart } },
      _count: { id: true },
      _sum:   { pnl: true },
    }) : null;

    const todayLogs = settings ? await prisma.autoTradeLog.findMany({
      where:   { userSettingsId: settings.id, executedAt: { gte: todayStart } },
      orderBy: { executedAt: 'desc' },
      take: 20,
    }) : [];

    const placed        = todayLogs.filter((l: any) => ['FILLED', 'DRY_RUN'].includes(l.status));
    const totalDeployed = placed.reduce((s: number, l: any) => s + (Number((l as any).dollarAmount) || 0), 0);

    const openCount = settings ? await prisma.autoTradeLog.count({
      where: { userSettingsId: settings.id, status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
    }) : 0;

    const { getCachedAdaptive } = await import('../services/autotrader/UniversalAdaptiveEngine');
    const adaptiveParams = getCachedAdaptive(userId, 'PAPER') ?? getCurrentParams(userId);

    return res.json({
      success: true,
      data: {
        active:           isActive,
        alpacaConnected,
        dryRun:           creds?.dryRun ?? true,
        autonomousMode:   (settings as any)?.autonomousMode ?? false,
        autoTradeEnabled: settings?.autoTradeEnabled ?? false,
        minConviction:    (settings as any)?.autonomousMinConviction ?? 75,
        maxPositions:     (settings as any)?.autonomousMaxPositions  ?? 3,
        capitalPct:       (settings as any)?.autonomousCapitalPct    ?? 5.0,
        lastRun:          (settings as any)?.lastAutonomousRun       ?? null,
        today: {
          trades: todayStats?._count.id ?? 0,
          pnl:    todayStats?._sum.pnl  ?? 0,
        },
        todayTrades:   placed.length,
        totalDeployed,
        logs:          todayLogs,
        openPositions: openCount,
        adaptiveParams,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Status failed' });
  }
});

router.post('/auto/adjust', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId        = (req as any).session?.userId as string;
    const { base, bounds } = req.body;
    if (!base || !bounds) {
      return res.status(400).json({ success: false, error: 'base and bounds are required' });
    }
    registerUserForAdaptation(userId, base, bounds);
    const params = await computeAdaptiveParameters(userId, base, bounds);
    return res.json({ success: true, data: params });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Adjust failed' });
  }
});

// GET historical bars for a symbol via Alpaca Market Data API
router.get('/market-data/bars/:symbol', requireAuth, async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const timeframe  = (req.query.timeframe as string) ?? '1Day';
    const limit      = parseInt(req.query.limit as string ?? '100', 10);
    const { getAlpacaBars } = await import('../services/alpaca/alpacaMarketDataService');
    const { hasAlpacaCredentials } = await import('../services/alpaca/alpacaConfig');
    if (!hasAlpacaCredentials()) {
      return res.status(503).json({ success: false, error: 'Alpaca credentials not configured' });
    }
    const bars = await getAlpacaBars(symbol.toUpperCase(), timeframe as any, isNaN(limit) ? 100 : limit);
    res.json({ success: true, data: { symbol: symbol.toUpperCase(), bars, count: bars.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Failed to fetch bars' });
  }
});

// GET latest quote for a symbol via Alpaca Market Data API
router.get('/market-data/quote/:symbol', requireAuth, async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    const { getAlpacaLatestQuote } = await import('../services/alpaca/alpacaMarketDataService');
    const { hasAlpacaCredentials } = await import('../services/alpaca/alpacaConfig');
    if (!hasAlpacaCredentials()) {
      return res.status(503).json({ success: false, error: 'Alpaca credentials not configured' });
    }
    const quote = await getAlpacaLatestQuote(symbol.toUpperCase());
    if (!quote) return res.status(404).json({ success: false, error: 'No quote available' });
    res.json({ success: true, data: { symbol: symbol.toUpperCase(), ...quote } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Failed to fetch quote' });
  }
});

router.post('/auto/stop', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId   = (req as any).session?.userId as string;
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (settings) {
      await prisma.userSettings.update({
        where: { id: settings.id },
        data: {
          autoTradeEnabled: false,
          autonomousMode:   false,
        } as any,
      });
    }
    res.json({ success: true, data: { autonomousMode: false, autoTradeEnabled: false } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message });
  }
});

export default router;
