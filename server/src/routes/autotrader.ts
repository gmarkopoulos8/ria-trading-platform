import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { prisma } from '../lib/prisma';
import { runTradingCycle, DEFAULT_AUTO_TRADE_CONFIG, type AutoTradeConfig } from '../services/autotrader/AutoTradeExecutor';
import { buildSignalsFromLatestScan } from '../services/scans/dynamicUniverseService';
import { getPortfolioState } from '../services/portfolio/PortfolioStateService';
import { checkCircuitBreakers } from '../services/autotrader/CircuitBreaker';
import {
  getConfig,
  saveConfig,
  validateConfig,
  checkSessionActive,
  startSession,
  pauseSession,
} from '../services/autotrader/ExchangeAutoConfigService';
import { computeAdaptive, getCachedAdaptive, DEFAULT_BOUNDS, type AdaptiveExchange } from '../services/autotrader/UniversalAdaptiveEngine';
import { runAutonomousCycle } from '../services/autotrader/AutonomousExecutor';
import { hasAlpacaCredentials, getAlpacaCredentials, setAlpacaRuntimeCredentials } from '../services/alpaca/alpacaConfig';
import { scanIntradaySignals } from '../services/autotrader/IntradaySignalEngine';
import { filterSignalsWithAI } from '../services/autotrader/IntradayAIFilter';
import { getOpenIntradayPositions } from '../services/autotrader/IntradayTradeManager';
import { setIntradayScanInterval, type ScanTimeframe } from '../services/autotrader/IntradayMonitorLoop';

const router = Router();
router.use(requireAuth);

async function getUserSettings(userId: string) {
  let settings = await prisma.userSettings.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.userSettings.create({ data: { userId } });
  }
  return settings;
}

function parseConfig(settings: { autoTradeConfig: unknown; autoTradeEnabled: boolean }): AutoTradeConfig {
  const raw = typeof settings.autoTradeConfig === 'object' && settings.autoTradeConfig !== null
    ? (settings.autoTradeConfig as Partial<AutoTradeConfig>)
    : {};
  return { ...DEFAULT_AUTO_TRADE_CONFIG, ...raw, enabled: settings.autoTradeEnabled };
}

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const config = parseConfig(settings);
    const portfolioState = await getPortfolioState();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStats = await prisma.autoTradeLog.aggregate({
      where: { userSettingsId: settings.id, executedAt: { gte: todayStart } },
      _count: { id: true },
      _sum: { pnl: true },
    });

    const activeCount = await prisma.autoTradeLog.count({
      where: { userSettingsId: settings.id, status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
    });

    const cbResult = await checkCircuitBreakers({
      exchange: config.exchange,
      dailyLossLimit: config.dailyLossLimit,
      maxDrawdownPct: config.maxDrawdownPct,
      maxOpenPositions: config.maxOpenPositions,
      currentOpenPositions: portfolioState.openPositionCount,
      currentEquity: portfolioState.totalEquity,
    }, settings.id);

    res.json({
      success: true,
      data: {
        enabled: settings.autoTradeEnabled,
        config,
        portfolioState,
        todayTradeCount: todayStats._count.id,
        todayPnl: todayStats._sum.pnl ?? 0,
        activePositionCount: activeCount,
        circuitBreaker: cbResult,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Status error' });
  }
});

router.post('/enable', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    await prisma.userSettings.update({ where: { id: settings.id }, data: { autoTradeEnabled: true } });
    res.json({ success: true, data: { enabled: true } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Enable error' });
  }
});

router.post('/disable', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    await prisma.userSettings.update({ where: { id: settings.id }, data: { autoTradeEnabled: false } });
    res.json({ success: true, data: { enabled: false } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Disable error' });
  }
});

router.put('/config', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const current = parseConfig(settings);
    const updated: AutoTradeConfig = { ...current, ...req.body };
    updated.maxPositionPct = Math.min(10, Math.max(0.5, updated.maxPositionPct));
    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { autoTradeConfig: updated as object },
    });
    res.json({ success: true, data: { config: updated } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Config error' });
  }
});

router.post('/run-cycle', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const config = parseConfig(settings);

    if (!config.enabled) {
      return res.status(400).json({ success: false, error: 'Auto-trading is disabled. Enable it first.' });
    }

    const exchange = (config.exchange ?? 'PAPER') as AdaptiveExchange;
    const base = {
      stopLossPct:        config.stopLossPct,
      takeProfitPct:      config.takeProfitPct,
      minConvictionScore: config.minConvictionScore,
    };

    const adaptive = await computeAdaptive(userId, exchange, base, undefined, 24).catch(() => null);
    const effectiveConviction = adaptive?.minConvictionScore ?? config.minConvictionScore;

    const rawSignals = await buildSignalsFromLatestScan({
      minConvictionScore: Math.max(50, effectiveConviction - 10),
      minConfidenceScore: config.minConfidenceScore,
      allowedBiases:      config.allowedBiases,
      maxSymbols:         config.maxOpenPositions * 5,
    });

    const sortedSignals = rawSignals.sort((a: any, b: any) => {
      const scoreA = (a.thesisHealthScore ?? 0) * 0.4 + (a.convictionScore ?? 0) * 0.4 + (a.confidenceScore ?? 0) * 0.2;
      const scoreB = (b.thesisHealthScore ?? 0) * 0.4 + (b.convictionScore ?? 0) * 0.4 + (b.confidenceScore ?? 0) * 0.2;
      return scoreB - scoreA;
    });

    const signals = sortedSignals.slice(0, config.maxOpenPositions);

    if (signals.length === 0) {
      return res.json({ success: true, data: { message: 'No qualifying signals from latest scan', results: [], adaptive } });
    }

    const results = await runTradingCycle(settings.id, config, signals);
    const filled = results.filter((r) => r.status === 'FILLED' || r.status === 'DRY_RUN');
    const blocked = results.filter((r) => r.status === 'BLOCKED' || r.status === 'REJECTED');
    const errors = results.filter((r) => r.status === 'ERROR');

    res.json({
      success: true,
      data: {
        signalCount: signals.length,
        results,
        adaptive,
        summary: {
          filled: filled.length,
          blocked: blocked.length,
          errors: errors.length,
          dryRun: config.dryRun,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Cycle run error' });
  }
});

router.get('/logs', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const limit = Math.min(100, parseInt(String(req.query.limit ?? '50'), 10));
    const status = req.query.status as string | undefined;
    const phase = req.query.phase as string | undefined;

    const where: Record<string, unknown> = { userSettingsId: settings.id };
    if (status) where.status = status;
    if (phase) where.phase = phase;

    const logs = await prisma.autoTradeLog.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: limit,
    });

    res.json({ success: true, data: { logs, count: logs.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Logs error' });
  }
});

router.get('/signals/preview', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const config = parseConfig(settings);

    const signals = await buildSignalsFromLatestScan({
      minConvictionScore: config.minConvictionScore,
      minConfidenceScore: config.minConfidenceScore,
      allowedBiases: config.allowedBiases,
      maxSymbols: 20,
    });

    res.json({ success: true, data: { signals, count: signals.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Signals error' });
  }
});

// ─── Adaptive Status ──────────────────────────────────────────────

router.get('/adaptive-status', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const settings = await getUserSettings(userId);
    const config = parseConfig(settings);
    const exchange = (config.exchange ?? 'PAPER') as AdaptiveExchange;

    const cached = getCachedAdaptive(userId, exchange);
    if (cached) {
      return res.json({ success: true, data: cached });
    }

    const base = {
      stopLossPct:        config.stopLossPct,
      takeProfitPct:      config.takeProfitPct,
      minConvictionScore: config.minConvictionScore,
    };
    const fresh = await computeAdaptive(userId, exchange, base, undefined, 24);
    res.json({ success: true, data: fresh });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Adaptive status error' });
  }
});

// ─── Exchange Config Routes ───────────────────────────────────────

router.get('/exchange-config/:exchange', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange. Must be hyperliquid or tos.' });
    }
    const config = await getConfig(userId, exchange as 'hyperliquid' | 'tos');
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to get exchange config' });
  }
});

router.put('/exchange-config/:exchange', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    const saved = await saveConfig(userId, exchange, req.body);
    res.json({ success: true, data: saved });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : 'Failed to save exchange config' });
  }
});

router.post('/exchange-config/:exchange/validate', async (req: Request, res: Response) => {
  try {
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    const result = validateConfig(req.body, exchange);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Validation error' });
  }
});

router.get('/exchange-config/:exchange/session-status', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    const status = await checkSessionActive(userId, exchange);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Session status error' });
  }
});

router.post('/exchange-config/:exchange/session/start', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    await startSession(userId, exchange);
    res.json({ success: true, data: { message: `${exchange} session started` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Session start error' });
  }
});

router.post('/exchange-config/:exchange/session/pause', async (req: Request, res: Response) => {
  try {
    const userId = req.session!.userId as string;
    const { exchange } = req.params;
    if (!['hyperliquid', 'tos'].includes(exchange)) {
      return res.status(400).json({ success: false, error: 'Invalid exchange' });
    }
    const reason = req.body?.reason ?? 'Manually paused by user';
    await pauseSession(userId, exchange, reason);
    res.json({ success: true, data: { message: `${exchange} session paused` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Session pause error' });
  }
});

router.post('/autonomous/enable', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).session?.userId as string;
    const { minConviction = 75, maxPositions = 3, capitalPct = 5.0 } = req.body;
    const settings = await getUserSettings(userId);
    await prisma.userSettings.update({
      where: { id: settings.id },
      data: {
        autonomousMode:          true,
        autoTradeEnabled:        true,
        autonomousMinConviction: minConviction,
        autonomousMaxPositions:  maxPositions,
        autonomousCapitalPct:    capitalPct,
      },
    });
    res.json({ success: true, data: { autonomousMode: true, minConviction, maxPositions, capitalPct } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Enable failed' });
  }
});

router.post('/autonomous/disable', async (req: Request, res: Response) => {
  try {
    const userId   = (req as any).session?.userId as string;
    const settings = await getUserSettings(userId);
    await prisma.userSettings.update({
      where: { id: settings.id },
      data: { autonomousMode: false, autoTradeEnabled: false } as any,
    });
    res.json({ success: true, data: { autonomousMode: false, autoTradeEnabled: false } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Disable failed' });
  }
});

router.post('/autonomous/run', async (req: Request, res: Response) => {
  try {
    const results = await runAutonomousCycle('MANUAL');
    res.json({ success: true, data: { results, cyclesRun: results.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Manual run failed' });
  }
});

router.get('/autonomous/status', async (req: Request, res: Response) => {
  try {
    const userId   = (req as any).session?.userId as string;
    const settings = await getUserSettings(userId);
    res.json({
      success: true,
      data: {
        autonomousMode:          (settings as any).autonomousMode          ?? false,
        autonomousMinConviction: (settings as any).autonomousMinConviction ?? 75,
        autonomousMaxPositions:  (settings as any).autonomousMaxPositions  ?? 3,
        autonomousCapitalPct:    (settings as any).autonomousCapitalPct    ?? 5.0,
        lastAutonomousRun:       (settings as any).lastAutonomousRun       ?? null,
        alpacaConnected:         hasAlpacaCredentials(),
        alpacaDryRun:            getAlpacaCredentials()?.dryRun ?? true,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Status failed' });
  }
});

router.get('/intraday/signals', async (req: Request, res: Response) => {
  try {
    const withAI = req.query.ai !== 'false';
    const raw    = await scanIntradaySignals();
    if (!withAI) return res.json({ success: true, data: { signals: raw, count: raw.length } });
    const filtered = await filterSignalsWithAI(raw, 5);
    return res.json({ success: true, data: { signals: filtered, count: filtered.length, approved: filtered.filter((s: any) => s.aiApproved).length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Signal scan error' });
  }
});

router.get('/intraday/positions', async (req: Request, res: Response) => {
  try {
    const positions = getOpenIntradayPositions();
    res.json({ success: true, data: { positions, count: positions.length } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Positions error' });
  }
});

router.post('/intraday/run', async (req: Request, res: Response) => {
  try {
    const userId   = (req as any).session?.userId as string;
    const settings = await getUserSettings(userId);
    const config   = parseConfig(settings);
    const { maxSignals = 2, dryRun } = req.body;
    const effectiveDryRun = dryRun ?? config.dryRun;

    const raw      = await scanIntradaySignals();
    const filtered = await filterSignalsWithAI(raw, maxSignals);
    const approved = filtered.filter((s: any) => s.aiApproved);

    const { executeIntradayTrade: execTrade } = await import('../services/autotrader/IntradayTradeManager');
    const results: any[] = [];
    const intradayDollarSize = Math.max(25, (config.maxPositionPct / 100) * 1000 * 0.25);

    for (const signal of approved) {
      const result = await execTrade(signal, settings.id, intradayDollarSize, effectiveDryRun);
      results.push({ symbol: signal.symbol, direction: signal.direction, aiConviction: (signal as any).aiConviction, aiReasoning: (signal as any).aiReasoning, ...result });
    }

    res.json({
      success: true,
      data: {
        scanned:    raw.length,
        approved:   approved.length,
        executed:   results,
        allSignals: filtered,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Intraday run error' });
  }
});

router.post('/intraday/config', async (req: Request, res: Response) => {
  try {
    const { intervalSeconds, timeframe } = req.body as { intervalSeconds: number; timeframe: ScanTimeframe };
    const safeInterval  = Math.min(600, Math.max(30, intervalSeconds ?? 60));
    const safeTimeframe: ScanTimeframe = (['1min', '3min', '5min'] as const).includes(timeframe) ? timeframe : '1min';
    setIntradayScanInterval(safeInterval, safeTimeframe);
    res.json({ success: true, data: { intervalSeconds: safeInterval, timeframe: safeTimeframe } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Config error' });
  }
});

// GET unified live positions from all connected exchanges
router.get('/live-positions', async (req: Request, res: Response) => {
  try {
    const positions: Array<{
      exchange: string;
      symbol: string;
      side: 'long' | 'short';
      size: number;
      entryPrice: number;
      currentPrice: number;
      unrealizedPnl: number;
      unrealizedPnlPct: number;
      marketValue: number;
    }> = [];

    // Alpaca paper positions
    try {
      const { getPositions: getAlpacaPositions } = await import('../services/alpaca/alpacaInfoService');
      const { hasAlpacaCredentials } = await import('../services/alpaca/alpacaConfig');
      if (hasAlpacaCredentials()) {
        const alpacaPos = await getAlpacaPositions();
        for (const p of (alpacaPos ?? [])) {
          positions.push({
            exchange:         'PAPER',
            symbol:           p.symbol,
            side:             p.side === 'long' ? 'long' : 'short',
            size:             parseFloat(p.qty ?? '0'),
            entryPrice:       parseFloat(p.avg_entry_price ?? '0'),
            currentPrice:     parseFloat(p.current_price ?? '0'),
            unrealizedPnl:    parseFloat(p.unrealized_pl ?? '0'),
            unrealizedPnlPct: parseFloat(p.unrealized_plpc ?? '0') * 100,
            marketValue:      parseFloat(p.market_value ?? '0'),
          });
        }
      }
    } catch { /* Alpaca offline */ }

    // Hyperliquid positions
    try {
      const { hasCredentials } = await import('../services/hyperliquid/hyperliquidConfig');
      const { getUserState, getAllMids } = await import('../services/hyperliquid/hyperliquidInfoService');
      if (hasCredentials()) {
        const state = await getUserState();
        const mids  = await getAllMids();
        for (const pos of (state?.assetPositions ?? [])) {
          const p = pos.position;
          if (!p || parseFloat(p.szi ?? '0') === 0) continue;
          const size    = parseFloat(p.szi ?? '0');
          const entry   = parseFloat(p.entryPx ?? '0');
          const current = parseFloat((mids as any)[p.coin] ?? '0');
          const pnl     = (current - entry) * Math.abs(size);
          const pnlPct  = entry > 0 ? ((current - entry) / entry) * 100 * Math.sign(size) : 0;
          positions.push({
            exchange: 'HYPERLIQUID', symbol: p.coin, side: size > 0 ? 'long' : 'short',
            size: Math.abs(size), entryPrice: entry, currentPrice: current,
            unrealizedPnl: pnl, unrealizedPnlPct: pnlPct, marketValue: Math.abs(size) * current,
          });
        }
      }
    } catch { /* HL offline */ }

    // TOS positions
    try {
      const { hasCredentials: hasTosCredentials } = await import('../services/tos/tosConfig');
      const { getAccounts } = await import('../services/tos/tosInfoService');
      if (hasTosCredentials()) {
        const accounts = await getAccounts();
        for (const acct of (accounts ?? [])) {
          for (const pos of ((acct as any).securitiesAccount?.positions ?? [])) {
            const inst    = pos.instrument;
            const qty     = pos.longQuantity > 0 ? pos.longQuantity : -pos.shortQuantity;
            const entry   = pos.averagePrice ?? 0;
            const current = pos.currentDayProfitLossPercentage != null
              ? entry * (1 + pos.currentDayProfitLossPercentage / 100) : entry;
            if (qty === 0) continue;
            positions.push({
              exchange: 'TOS', symbol: inst?.symbol ?? '?',
              side: qty > 0 ? 'long' : 'short', size: Math.abs(qty),
              entryPrice: entry, currentPrice: current,
              unrealizedPnl: pos.currentDayProfitLoss ?? 0,
              unrealizedPnlPct: pos.currentDayProfitLossPercentage ?? 0,
              marketValue: pos.marketValue ?? 0,
            });
          }
        }
      }
    } catch { /* TOS offline */ }

    res.json({ success: true, data: { positions, count: positions.length, fetchedAt: new Date() } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Failed to fetch live positions' });
  }
});

// POST — Claude Trading Brain: full per-signal decisions with parameter overrides
router.post('/brain-preview', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.session.userId!;
    const settings = await prisma.userSettings.findUnique({ where: { userId } });
    if (!settings) return res.status(404).json({ success: false, error: 'User settings not found' });

    const rawSignals = await buildSignalsFromLatestScan({
      minConviction: 60,
      maxResults:    8,
      exchange:      'PAPER',
    });

    if (rawSignals.length === 0) {
      return res.json({ success: true, data: { decisions: [], modelUsed: 'fallback', message: 'No signals from latest scan' } });
    }

    const { runClaudeTradingBrain } = await import('../services/autotrader/ClaudeTradingBrain');
    const { DEFAULT_AUTO_TRADE_CONFIG } = await import('../services/autotrader/AutoTradeExecutor');

    const config = { ...DEFAULT_AUTO_TRADE_CONFIG, dryRun: true };
    const result = await runClaudeTradingBrain(rawSignals, config, userId);

    const decisions = [...result.decisions.values()].map(d => ({
      ...d,
      signal: rawSignals.find(s => s.symbol === d.symbol),
    }));

    res.json({
      success: true,
      data: {
        decisions,
        modelUsed:    result.modelUsed,
        tokensUsed:   result.tokensUsed,
        processingMs: result.processingMs,
        fallback:     result.fallback,
        signalCount:  rawSignals.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message ?? 'Brain preview failed' });
  }
});

// POST — Claude AI reviews trade signals and returns go/no-go decisions
router.post('/ai-decision', async (req: Request, res: Response) => {
  try {
    const { signals, regime, portfolioState, exchange } = req.body;

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({
        success: true,
        data: {
          decisions: (signals ?? []).map((s: any) => ({
            symbol:      s.symbol,
            approved:    s.convictionScore >= 72,
            conviction:  s.convictionScore,
            reasoning:   'Auto-approved (no API key configured)',
            riskWarning: null,
            holdDays:    14,
          })),
          modelUsed: 'fallback',
        },
      });
    }

    const axios = (await import('axios')).default;

    const prompt = `You are an expert autonomous trading system making final go/no-go decisions on stock and crypto trades.

Exchange: ${exchange ?? 'PAPER'}
Market regime: ${regime?.regime ?? 'UNKNOWN'} | VIX: ${regime?.vix?.toFixed(1) ?? 'N/A'}
Portfolio equity: $${portfolioState?.totalEquity?.toFixed(0) ?? 'N/A'} | Open positions: ${portfolioState?.openPositionCount ?? 0} | Today P&L: $${portfolioState?.dailyPnl?.toFixed(2) ?? '0'}

Proposed trades:
${(signals ?? []).slice(0, 6).map((s: any, i: number) => `
${i + 1}. ${s.symbol} (${s.assetClass ?? 'stock'}) — ${s.bias}
   Conviction: ${s.convictionScore}/100 | Confidence: ${s.confidenceScore ?? 'N/A'}/100 | Risk: ${s.riskScore ?? 'N/A'}
   Entry: $${s.entryPrice?.toFixed(2) ?? 'market'} | Stop: $${s.stopLoss?.toFixed(2) ?? 'N/A'} | Target: $${s.takeProfit?.toFixed(2) ?? 'N/A'}
   Setup: ${s.setupType ?? 'N/A'} | Reason: ${s.reason ?? 'scan signal'}
`).join('')}

For each trade decide:
1. Should this execute NOW given current regime and portfolio state?
2. Any immediate risk factors (earnings tonight, macro event, correlated position)?
3. Appropriate hold window in days?

Respond ONLY with JSON array, no other text:
[{"symbol":"AAPL","approved":true,"conviction":82,"reasoning":"Clean breakout, low correlation to existing holdings, regime supports longs","riskWarning":null,"holdDays":10}]

Approve max 3 trades. Reject if: regime is BEAR_CRISIS, conviction < 68, or obvious near-term risk.`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      { model: 'claude-sonnet-4-20250514', max_tokens: 800, messages: [{ role: 'user', content: prompt }] },
      {
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        timeout: 20_000,
      },
    );

    const text      = response.data?.content?.[0]?.text ?? '[]';
    const clean     = text.replace(/```json|```/g, '').trim();
    const decisions = JSON.parse(clean);

    res.json({ success: true, data: { decisions, modelUsed: 'claude-sonnet-4-20250514' } });
  } catch (err: any) {
    const { signals } = req.body;
    res.json({
      success: true,
      data: {
        decisions: (signals ?? []).map((s: any) => ({
          symbol: s.symbol, approved: s.convictionScore >= 72, conviction: s.convictionScore,
          reasoning: `Fallback approval: ${err?.message ?? 'AI unavailable'}`, riskWarning: null, holdDays: 14,
        })),
        modelUsed: 'fallback',
        error: err?.message,
      },
    });
  }
});

router.get('/mission-control', async (req: Request, res: Response) => {
  try {
    const userId   = (req as any).session?.userId as string;
    const settings = await getUserSettings(userId);

    let alpacaConnected = hasAlpacaCredentials();
    if (!alpacaConnected) {
      try {
        const { credentialService } = await import('../services/credentials/CredentialService');
        const creds = await credentialService.getAlpacaCredentials(userId);
        if (creds) { setAlpacaRuntimeCredentials(creds); alpacaConnected = true; }
      } catch { /* non-fatal */ }
    }

    const [regime, portfolio, latestScan, recentLogs, signals] = await Promise.allSettled([
      import('../services/market/RegimeDetector').then(m => m.detectRegime()),
      import('../services/portfolio/PortfolioStateService').then(m => m.getPortfolioState()),
      prisma.dailyScanRun.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { completedAt: 'desc' },
        select: { id: true, completedAt: true, resultCount: true, runType: true },
      }),
      prisma.autoTradeLog.findMany({
        where:   { userSettingsId: settings.id },
        orderBy: { executedAt: 'desc' },
        take:    10,
        select:  { symbol: true, status: true, exchange: true, entryPrice: true,
                   exitPrice: true, pnl: true, executedAt: true, reason: true,
                   convictionScore: true, assetClass: true },
      }),
      buildSignalsFromLatestScan({
        minConvictionScore: Math.max(60, ((settings as any).autonomousMinConviction ?? 75) - 10),
        minConfidenceScore: 55,
        allowedBiases:      ['BULLISH', 'BEARISH', 'NEUTRAL'],
        maxSymbols:         8,
      }).catch(() => []),
    ]);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayStats = await prisma.autoTradeLog.aggregate({
      where: { userSettingsId: settings.id, executedAt: { gte: todayStart } },
      _count: { id: true },
      _sum:   { pnl: true },
    });

    res.json({
      success: true,
      data: {
        autonomousMode:          (settings as any).autonomousMode          ?? false,
        autoTradeEnabled:        settings.autoTradeEnabled,
        autonomousMinConviction: (settings as any).autonomousMinConviction ?? 75,
        autonomousMaxPositions:  (settings as any).autonomousMaxPositions  ?? 3,
        autonomousCapitalPct:    (settings as any).autonomousCapitalPct    ?? 5.0,
        lastAutonomousRun:       (settings as any).lastAutonomousRun       ?? null,
        dryRun:                  getAlpacaCredentials()?.dryRun ?? true,
        alpacaConnected,
        regime:    regime.status    === 'fulfilled' ? regime.value    : null,
        portfolio: portfolio.status === 'fulfilled' ? portfolio.value : null,
        latestScan: latestScan.status === 'fulfilled' ? latestScan.value : null,
        signals:   signals.status   === 'fulfilled' ? signals.value   : [],
        todayTrades: todayStats._count.id,
        todayPnl:    todayStats._sum.pnl ?? 0,
        recentLogs:  recentLogs.status === 'fulfilled' ? recentLogs.value : [],
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Mission control status failed' });
  }
});

export default router;
