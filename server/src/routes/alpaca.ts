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
      useAdaptive        = true,
      bounds,
    } = req.body;

    const perTrade = Math.floor(capitalPerTrade ?? capitalTotal / maxPositions);

    if (!dryRun) {
      const account = await getAccount();
      const bp = parseFloat(account.buying_power ?? '0');
      if (bp < perTrade) {
        return res.status(400).json({
          success: false,
          error: `Insufficient buying power. Need $${perTrade}, have $${bp.toFixed(2)}`,
        });
      }
    }

    const effectiveBounds: ParameterBounds = bounds ?? {
      stopLoss:    { min: 1.5, max: 8.0 },
      takeProfit:  { min: 3.0, max: 20.0 },
      conviction:  { min: 65,  max: 92   },
      positionPct: { min: 0.3, max: 1.0  },
    };

    let activeStop       = stopLossPct;
    let activeTarget     = takeProfitPct;
    let activeConviction = minConvictionScore;
    let activeSizeMult   = 1.0;
    let adaptiveParams   = null;

    if (useAdaptive) {
      registerUserForAdaptation(userId, { stopLossPct, takeProfitPct, minConvictionScore }, effectiveBounds);
      adaptiveParams   = await computeAdaptiveParameters(userId, { stopLossPct, takeProfitPct, minConvictionScore }, effectiveBounds);
      activeStop       = adaptiveParams.stopLossPct;
      activeTarget     = adaptiveParams.takeProfitPct;
      activeConviction = adaptiveParams.minConvictionScore;
      activeSizeMult   = adaptiveParams.positionSizeMultiplier;
    }

    const adjustedPerTrade = Math.floor(perTrade * activeSizeMult);
    if (adjustedPerTrade < 10) {
      return res.status(400).json({
        success: false,
        error: `Adjusted position size ($${adjustedPerTrade}) too small after AI sizing. Increase capital or relax bounds.`,
      });
    }

    const { buildSignalsFromLatestScan } = await import('../services/scans/dynamicUniverseService');
    const rawSignals = await buildSignalsFromLatestScan({
      minConvictionScore:  activeConviction,
      minConfidenceScore:  60,
      allowedBiases:       ['BULLISH'],
      maxSymbols:          maxPositions * 3,
    });

    if (!rawSignals || rawSignals.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No qualifying signals. Run a Daily Scan first, or the AI raised conviction threshold too high — try widening your bounds.',
      });
    }

    const signals = rawSignals.slice(0, maxPositions).map((s: any) => ({
      ...s,
      exchange:          'PAPER' as const,
      fixedDollarAmount: adjustedPerTrade,
    }));

    const config = {
      enabled:            true,
      exchange:           'PAPER' as const,
      maxPositionPct:     100,
      dailyLossLimit:     capitalTotal * 0.20,
      maxDrawdownPct:     25,
      maxOpenPositions:   maxPositions,
      minConvictionScore: activeConviction,
      minConfidenceScore: 60,
      allowedBiases:      ['BULLISH'],
      stopLossPct:        activeStop,
      takeProfitPct:      activeTarget,
      dryRun,
    };

    const { runTradingCycle } = await import('../services/autotrader/AutoTradeExecutor');
    let settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) settings = await prisma.userSettings.create({ data: { userId } });

    const results  = await runTradingCycle(settings.id, config, signals);
    const placed   = results.filter((r: any) => ['FILLED', 'DRY_RUN'].includes(r.status));
    const rejected = results.filter((r: any) => !['FILLED', 'DRY_RUN'].includes(r.status));

    return res.json({
      success: true,
      data: {
        signalsEvaluated:  results.length,
        ordersPlaced:      placed.length,
        ordersRejected:    rejected.length,
        dryRun,
        adaptiveParams,
        activeParams: {
          stopLossPct:            activeStop,
          takeProfitPct:          activeTarget,
          minConvictionScore:     activeConviction,
          positionSizeMultiplier: activeSizeMult,
          perTradeAmount:         adjustedPerTrade,
        },
        placed:   placed.map((r: any)   => ({ symbol: r.symbol, status: r.status, dollarAmount: r.dollarAmount, entryPrice: r.entryPrice })),
        rejected: rejected.map((r: any) => ({ symbol: r.symbol, reason: r.reason })),
      },
    });
  } catch (err: any) {
    console.error('[Alpaca Auto Start]', err?.message);
    res.status(500).json({ success: false, error: err?.message ?? 'Auto trade failed' });
  }
});

router.post('/auto/monitor', requireAuth, requireAlpacaCredentials, async (req: Request, res: Response) => {
  try {
    const userId        = (req as any).session?.userId as string;
    const { dryRun = false } = req.body;

    const adapted       = getCurrentParams(userId);
    const stopLossPct   = adapted?.stopLossPct   ?? (req.body.stopLossPct   ?? 3.0);
    const takeProfitPct = adapted?.takeProfitPct ?? (req.body.takeProfitPct ?? 6.0);

    const positions = await getPositions();
    if (!positions || positions.length === 0) {
      return res.json({ success: true, data: { message: 'No open positions', actions: [] } });
    }

    const actions: any[] = [];
    for (const pos of positions) {
      const entry   = parseFloat((pos as any).avg_entry_price ?? '0');
      const current = parseFloat((pos as any).current_price  ?? '0');
      if (entry <= 0 || current <= 0) continue;

      const pnlPct = ((current - entry) / entry) * 100;
      let shouldClose = false;
      let closeReason = '';

      if (pnlPct <= -stopLossPct) {
        shouldClose = true;
        closeReason = `Stop loss: ${pnlPct.toFixed(2)}% ≤ -${stopLossPct}%`;
      } else if (pnlPct >= takeProfitPct) {
        shouldClose = true;
        closeReason = `Take profit: +${pnlPct.toFixed(2)}% ≥ +${takeProfitPct}%`;
      }

      if (shouldClose && !dryRun) {
        await closePosition((pos as any).symbol).catch((e: any) =>
          console.warn(`[Alpaca Monitor] Close ${(pos as any).symbol}:`, e?.message)
        );
      }

      actions.push({
        symbol:  (pos as any).symbol,
        action:  shouldClose ? (dryRun ? 'WOULD_CLOSE' : 'CLOSED') : 'HOLD',
        reason:  shouldClose ? closeReason : `Holding at ${pnlPct.toFixed(2)}%`,
        pnlPct,
      });
    }

    return res.json({ success: true, data: { actions, dryRun, stopLossPct, takeProfitPct, usingAdaptive: !!adapted } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Monitor failed' });
  }
});

router.get('/auto/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).session?.userId as string;
    const today  = new Date(); today.setHours(0, 0, 0, 0);

    let settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) settings = await prisma.userSettings.create({ data: { userId } });

    const logs = await prisma.autoTradeLog.findMany({
      where: { userSettingsId: settings.id, exchange: 'PAPER', executedAt: { gte: today } },
      orderBy: { executedAt: 'desc' },
      take: 20,
    });

    const placed         = logs.filter((l: any) => ['FILLED', 'DRY_RUN'].includes(l.status));
    const totalDeployed  = placed.reduce((s: number, l: any) => s + (Number(l.dollarAmount) || 0), 0);
    const adaptiveParams = getCurrentParams(userId);

    return res.json({ success: true, data: { todayTrades: placed.length, totalDeployed, logs, adaptiveParams } });
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

export default router;
