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
import { hasAlpacaCredentials, setAlpacaRuntimeCredentials } from '../services/alpaca/alpacaConfig';
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
      useAdaptive        = true,
      bounds,
      tradingMode        = 'stocks',
      maxOptionsRiskPct  = 1.5,
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
      stopLoss:    { min: 1.5, max: 7.0  },
      takeProfit:  { min: 4.0, max: 25.0 },
      conviction:  { min: 68,  max: 90   },
      positionPct: { min: 0.5, max: 1.5  },
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

    // Auto-run a scan if none exists or last scan was more than 6 hours ago
    const { getLatestCompletedRun } = await import('../services/scans/scanPersistenceService');
    const latestScan = await getLatestCompletedRun();
    const scanAge = latestScan?.completedAt
      ? (Date.now() - new Date(latestScan.completedAt).getTime()) / (1000 * 60 * 60)
      : Infinity;

    let scanRunId: string | undefined;

    if (!latestScan || scanAge > 6) {
      console.log('[AutoStart] No recent scan found — running scan automatically');
      try {
        const { createScanRun, markRunStarted } = await import('../services/scans/scanPersistenceService');
        const { runDailyScan } = await import('../services/scans/dailyScanOrchestrator');

        const scanRun = await createScanRun({
          runType: 'AUTO_TRIGGERED',
          marketSession: 'MARKET_OPEN',
          assetScope: 'ALL' as any,
          riskMode: 'ALL' as any,
        });
        await markRunStarted(scanRun.id);
        scanRunId = scanRun.id;

        await runDailyScan({
          runType: 'AUTO_TRIGGERED',
          marketSession: 'MARKET_OPEN',
          skipDuplicateCheck: true,
          existingScanRunId: scanRun.id,
        });
        console.log('[AutoStart] Auto-scan complete, proceeding with trading');
      } catch (scanErr: any) {
        console.warn('[AutoStart] Auto-scan failed:', scanErr?.message);
      }
    }

    const { buildSignalsFromLatestScan } = await import('../services/scans/dynamicUniverseService');
    let rawSignals = await buildSignalsFromLatestScan({
      minConvictionScore:  activeConviction,
      minConfidenceScore:  60,
      allowedBiases:       ['BULLISH'],
      maxSymbols:          maxPositions * 5,
    });

    // If AI raised conviction too high and nothing passes, retry with the base conviction
    if ((!rawSignals || rawSignals.length === 0) && activeConviction > minConvictionScore) {
      console.log(`[AutoStart] No signals at adaptive conviction ${activeConviction}, retrying with base ${minConvictionScore}`);
      rawSignals = await buildSignalsFromLatestScan({
        minConvictionScore:  minConvictionScore,
        minConfidenceScore:  55,
        allowedBiases:       ['BULLISH'],
        maxSymbols:          maxPositions * 5,
      });
    }

    const isOptionsMode = tradingMode === 'options' || tradingMode === 'both';

    if ((!rawSignals || rawSignals.length === 0) && !isOptionsMode) {
      return res.status(400).json({
        success: false,
        error: 'No qualifying signals found after scanning. The market may be in a choppy/bearish regime with no strong bullish setups right now. Try again later or lower your conviction threshold.',
        scanAge: latestScan ? Math.round(scanAge * 10) / 10 : null,
        tip: 'Lower the conviction slider in parameters or wait for clearer market conditions.',
      });
    }

    const sortedSignals = [...rawSignals].sort((a: any, b: any) => {
      const aScore = (a.thesisHealthScore ?? 0) * 0.4
                   + (a.convictionScore   ?? 0) * 0.4
                   + (a.confidenceScore   ?? 0) * 0.2;
      const bScore = (b.thesisHealthScore ?? 0) * 0.4
                   + (b.convictionScore   ?? 0) * 0.4
                   + (b.confidenceScore   ?? 0) * 0.2;
      return bScore - aScore;
    });

    const signals = sortedSignals.slice(0, maxPositions).map((s: any) => ({
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

    // ── Options Trading ──────────────────────────────────────────────────────
    const optionsPlaced:   Array<{ symbol: string; strategy: string; cost: number; legs: any[] }> = [];
    const optionsRejected: Array<{ symbol: string; reason: string }> = [];

    if ((tradingMode === 'options' || tradingMode === 'both') && process.env.FINNHUB_API_KEY) {
      const { getRecommendation } = await import('../services/options/OptionsAnalyzer');
      const { thesisEngine }      = await import('../services/thesis/ThesisEngine');
      const { placeOptionsOrder } = await import('../services/alpaca/alpacaExchangeService');

      let optionCandidates: any[] = tradingMode === 'options'
        ? sortedSignals.slice(0, maxPositions)
        : sortedSignals.slice(0, maxPositions * 2);

      if (optionCandidates.length < maxPositions) {
        try {
          const { buildSignalsFromLatestScan: buildNeutral } = await import('../services/scans/dynamicUniverseService');
          const neutralSignals = await buildNeutral({
            minConvictionScore: 55,
            minConfidenceScore: 55,
            allowedBiases:      ['NEUTRAL', 'BEARISH'],
            maxSymbols:         maxPositions * 3,
          });
          const existing = new Set(optionCandidates.map((s: any) => s.symbol));
          optionCandidates = [
            ...optionCandidates,
            ...neutralSignals.filter((s: any) => !existing.has(s.symbol)),
          ].slice(0, maxPositions * 3);
        } catch { /* best effort */ }
      }

      if (optionCandidates.length === 0) {
        const WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'];
        optionCandidates = WATCHLIST.slice(0, maxPositions * 2).map(sym => ({
          symbol: sym, assetClass: 'stock', bias: 'NEUTRAL', convictionScore: 60, confidenceScore: 60, riskScore: 0.5, scanRunId: null,
        }));
      }

      const maxOptionsRisk = Math.max(50, Math.floor(adjustedPerTrade * (maxOptionsRiskPct / 100)));

      for (const candidate of optionCandidates) {
        if (candidate.assetClass === 'crypto' || candidate.assetClass === 'CRYPTO') continue;
        if (tradingMode === 'both' && placed.some((p: any) => p.symbol === candidate.symbol)) continue;

        try {
          const thesis       = await thesisEngine.analyze(candidate.symbol, 'stock');
          const acct         = await getAccount();
          const accountEquity = parseFloat((acct as any).equity ?? '100000');
          const forPremiumSelling = candidate.bias !== 'BULLISH' || (candidate.convictionScore ?? 60) < 70;
          const recommendation = await getRecommendation(thesis, accountEquity, maxOptionsRisk, forPremiumSelling);

          if (!recommendation || recommendation.strategy === 'NONE') {
            optionsRejected.push({ symbol: candidate.symbol, reason: 'No viable options strategy found' });
            continue;
          }

          const legOrders = recommendation.legs.map((leg: any) => ({
            action:         leg.action,
            contractSymbol: leg.contract.contractSymbol,
            contracts:      leg.contracts,
            limitPrice:     leg.contract.mid,
          }));

          if (legOrders.length === 0) {
            optionsRejected.push({ symbol: candidate.symbol, reason: 'No valid legs in recommendation' });
            continue;
          }

          const totalCost = recommendation.netDebit > 0
            ? recommendation.netDebit * (recommendation.legs[0]?.contracts ?? 1) * 100
            : 0;

          const optResult = await placeOptionsOrder(
            candidate.symbol,
            recommendation.strategy,
            legOrders,
            settings!.id,
            totalCost,
          );

          if (optResult.success) {
            optionsPlaced.push({
              symbol:   candidate.symbol,
              strategy: recommendation.strategy,
              cost:     totalCost,
              legs:     optResult.orders.map((o: any) => ({ action: o.leg, contractSymbol: o.contractSymbol, orderId: o.orderId })),
            });
          } else {
            optionsRejected.push({ symbol: candidate.symbol, reason: optResult.error ?? 'Options order failed' });
          }

          await new Promise(r => setTimeout(r, 300));
        } catch (err: any) {
          optionsRejected.push({ symbol: candidate.symbol, reason: err?.message ?? 'Options error' });
        }
      }
    }

    return res.json({
      success: true,
      data: {
        signalsEvaluated:  results.length,
        ordersPlaced:      placed.length,
        optionsPlaced:     optionsPlaced.length,
        ordersRejected:    rejected.length,
        optionsRejected:   optionsRejected.length,
        dryRun,
        tradingMode,
        autoScanned:       !!scanRunId,
        scanRunId,
        adaptiveParams,
        activeParams: {
          stopLossPct:            activeStop,
          takeProfitPct:          activeTarget,
          minConvictionScore:     activeConviction,
          positionSizeMultiplier: activeSizeMult,
          perTradeAmount:         adjustedPerTrade,
        },
        placed:         placed.map((r: any)   => ({ symbol: r.symbol, status: r.status, dollarAmount: r.dollarAmount, entryPrice: r.entryPrice })),
        rejected:       rejected.map((r: any) => ({ symbol: r.symbol, reason: r.reason })),
        optionsResults: optionsPlaced,
        optionsSkipped: optionsRejected,
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
      // Skip options contract positions — handled by dedicated options loop below
      if (/\d{6}[CP]\d{8}/.test((pos as any).symbol ?? '')) continue;

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

        try {
          const exitPrice = current;
          const dollarPnl = (exitPrice - entry) / entry * parseFloat((pos as any).market_value ?? '0');
          await prisma.autoTradeLog.updateMany({
            where: { symbol: (pos as any).symbol, exchange: 'PAPER', status: 'FILLED', exitPrice: null },
            data:  { exitPrice, pnl: dollarPnl, status: 'CLOSED' },
          });
        } catch (writeErr: any) {
          console.warn('[Alpaca Monitor] PnL writeback failed:', writeErr?.message);
        }
      }

      actions.push({
        symbol:  (pos as any).symbol,
        action:  shouldClose ? (dryRun ? 'WOULD_CLOSE' : 'CLOSED') : 'HOLD',
        reason:  shouldClose ? closeReason : `Holding at ${pnlPct.toFixed(2)}%`,
        pnlPct,
      });
    }

    // ── Options position monitoring ──────────────────────────────────────────
    for (const pos of positions) {
      const symbol   = (pos as any).symbol ?? '';
      const isOption = /\d{6}[CP]\d{8}/.test(symbol);
      if (!isOption) continue;

      const entry   = parseFloat((pos as any).avg_entry_price ?? '0');
      const current = parseFloat((pos as any).current_price   ?? '0');
      if (entry <= 0 || current <= 0) continue;

      const pnlPct = ((current - entry) / entry) * 100;
      const isLong = parseFloat((pos as any).qty ?? '0') > 0;

      let shouldClose = false;
      let closeReason = '';

      if (isLong) {
        if (pnlPct <= -50)  { shouldClose = true; closeReason = `Option 50% stop: ${pnlPct.toFixed(1)}%`; }
        else if (pnlPct >= 100) { shouldClose = true; closeReason = `Option 100% target: +${pnlPct.toFixed(1)}%`; }
      } else {
        if (pnlPct >= 200)  { shouldClose = true; closeReason = `Short option loss 200%: +${pnlPct.toFixed(1)}%`; }
        else if (pnlPct <= -80) { shouldClose = true; closeReason = `Short option profit 80% captured`; }
      }

      if (shouldClose && !dryRun) {
        const closeSide = isLong ? 'sell' : 'buy';
        try {
          const { placeOrder: alpacaClose } = await import('../services/alpaca/alpacaExchangeService');
          await alpacaClose({
            symbol,
            qty:         Math.abs(parseFloat((pos as any).qty ?? '1')),
            side:        closeSide as 'buy' | 'sell',
            type:        'market',
            timeInForce: 'day',
            userId,
          });
        } catch (e: any) {
          console.warn(`[Options Monitor] Close ${symbol} failed:`, e?.message);
        }
      }

      actions.push({
        symbol,
        action:  shouldClose ? (dryRun ? 'WOULD_CLOSE' : 'CLOSED') : 'HOLD',
        reason:  closeReason || `Option holding at ${pnlPct.toFixed(1)}%`,
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

export default router;
