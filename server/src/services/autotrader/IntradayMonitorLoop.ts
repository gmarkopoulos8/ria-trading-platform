import { prisma } from '../../lib/prisma';
import { DEFAULT_AUTO_TRADE_CONFIG, type AutoTradeConfig } from './AutoTradeExecutor';
import { checkSessionActive, pauseSession } from './ExchangeAutoConfigService';
import { isKillswitchActive as isHLStopped } from '../hyperliquid/hyperliquidConfig';
import { isKillswitchActive as isTOSStopped } from '../tos/tosConfig';
import { scanIntradaySignals, scanFastSignals } from './IntradaySignalEngine';
import { filterSignalsWithAI } from './IntradayAIFilter';
import { executeIntradayTrade, monitorIntradayPositions, getOpenIntradayPositions, clearClosedPositions } from './IntradayTradeManager';

export type ScanTimeframe = '1min' | '3min' | '5min';

let monitorInterval: NodeJS.Timeout | null = null;
let _scanIntervalMs = 5 * 60_000;
let _scanTimeframe: ScanTimeframe = '5min';

export function setIntradayScanInterval(intervalSeconds: number, timeframe: ScanTimeframe): void {
  _scanIntervalMs = intervalSeconds * 1000;
  _scanTimeframe  = timeframe;
  console.info(`[IntradayMonitor] Scan interval set to ${intervalSeconds}s (${timeframe})`);
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    startIntradayMonitor();
  }
}

function getNYHour(): number {
  const now = new Date();
  const nyStr = now.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false });
  return parseInt(nyStr, 10);
}

async function monitorOpenAutoTrades(userSettingsId: string, config: AutoTradeConfig): Promise<void> {
  const activeLogs = await prisma.autoTradeLog.findMany({
    where: {
      userSettingsId,
      status: { in: ['FILLED', 'DRY_RUN'] },
      phase: 'ENTRY',
    },
    orderBy: { executedAt: 'desc' },
    take: 20,
  });

  if (activeLogs.length === 0) return;

  for (const log of activeLogs) {
    if (!log.entryPrice || !log.takeProfit || !log.stopLoss) continue;

    try {
      let currentPrice: number | null = null;

      if (log.assetClass === 'crypto' || log.assetClass === 'CRYPTO') {
        const { getAssetPrice } = await import('../hyperliquid/hyperliquidInfoService');
        currentPrice = await getAssetPrice(log.symbol);
      } else {
        const { getQuotes } = await import('../tos/tosInfoService');
        const quotes = await getQuotes([log.symbol]);
        const q = quotes[log.symbol];
        if (q) currentPrice = q.lastPrice ?? q.mark ?? null;
      }

      if (!currentPrice) continue;

      const pnl = (currentPrice - log.entryPrice) * (log.quantity ?? 0);
      const hitTP = currentPrice >= log.takeProfit;
      const hitSL = currentPrice <= log.stopLoss;

      // Hard stop blocks auto-exits (user has taken manual control); pause does not
      const isHardStopped = log.assetClass === 'crypto' || log.assetClass === 'CRYPTO'
        ? isHLStopped()
        : isTOSStopped();
      if (isHardStopped) continue;

      if (hitTP || hitSL) {
        const exitReason = hitTP ? 'TAKE_PROFIT' : 'STOP_LOSS';
        await prisma.autoTradeLog.create({
          data: {
            userSettingsId,
            sessionId: log.sessionId,
            phase: 'EXIT',
            exchange: log.exchange,
            symbol: log.symbol,
            assetClass: log.assetClass,
            action: 'SELL',
            status: log.dryRun ? 'DRY_RUN' : 'FILLED',
            dryRun: log.dryRun,
            quantity: log.quantity,
            entryPrice: log.entryPrice,
            exitPrice: currentPrice,
            pnl,
            reason: exitReason,
            metadata: JSON.parse(JSON.stringify({ entryLogId: log.id, currentPrice, hitTP, hitSL })),
          },
        });

        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data: { status: 'CLOSED', exitPrice: currentPrice, pnl },
        });

        console.log(`[AutoTrader] ${exitReason} for ${log.symbol} @ ${currentPrice} | PnL: $${pnl.toFixed(2)}`);
      }
    } catch (err) {
      console.error(`[AutoTrader] Monitor error for ${log.symbol}:`, err instanceof Error ? err.message : err);
    }
  }
}

async function runSessionLifecycleChecks(userId: string): Promise<void> {
  const exchanges = ['hyperliquid', 'tos'] as const;

  for (const exchange of exchanges) {
    try {
      const config = await prisma.exchangeAutoConfig.findUnique({
        where: { userId_exchange: { userId, exchange } },
      });

      if (!config || !config.enabled) continue;
      if (!config.sessionStartedAt || config.sessionPausedAt) continue;

      const sessionCheck = await checkSessionActive(userId, exchange);
      if (!sessionCheck.active) {
        const reason = sessionCheck.reason ?? 'Auto-paused by intraday monitor';
        console.log(`[AutoTrader] Pausing ${exchange} session for userId=${userId}: ${reason}`);
        await pauseSession(userId, exchange, reason);

        if (reason.includes('DAILY_LOSS') || reason.includes('daily loss')) {
          const settings = await prisma.userSettings.findFirst({ where: { userId } });
          if (settings) {
            await prisma.alert.create({
              data: {
                userSettingsId: settings.id,
                type: 'SYSTEM',
                severity: 'CRITICAL',
                title: `Daily Loss Limit Reached — ${exchange.toUpperCase()}`,
                message: `Autonomous trading on ${exchange} has been paused: ${reason}`,
                symbol: exchange.toUpperCase(),
                metadata: JSON.parse(JSON.stringify({ exchange, reason, pausedAt: new Date().toISOString() })),
              },
            });
          }
        }
      }

      // Daily loss check after monitoring cycle
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const settings = await prisma.userSettings.findFirst({ where: { userId } });
      if (!settings) continue;

      const exitLogs = await prisma.autoTradeLog.findMany({
        where: {
          userSettingsId: settings.id,
          exchange: exchange.toUpperCase(),
          phase: 'EXIT',
          pnl: { lt: 0 },
          executedAt: { gte: startOfDay },
        },
        select: { pnl: true },
      });

      const todayLoss = Math.abs(exitLogs.reduce((s, l) => s + (l.pnl ?? 0), 0));
      if (todayLoss >= config.maxDailyLossUsd && config.sessionStartedAt && !config.sessionPausedAt) {
        const reason = 'DAILY_LOSS_LIMIT_REACHED';
        console.log(`[AutoTrader] Daily loss limit reached on ${exchange} for userId=${userId}. Loss: $${todayLoss.toFixed(2)}`);
        await pauseSession(userId, exchange, reason);

        await prisma.alert.create({
          data: {
            userSettingsId: settings.id,
            type: 'SYSTEM',
            severity: 'CRITICAL',
            title: `Daily Loss Limit Reached — ${exchange.toUpperCase()}`,
            message: `Autonomous trading paused. Today's loss: $${todayLoss.toFixed(2)} exceeded limit of $${config.maxDailyLossUsd.toFixed(2)}`,
            symbol: exchange.toUpperCase(),
            metadata: JSON.parse(JSON.stringify({ exchange, todayLoss, maxDailyLossUsd: config.maxDailyLossUsd })),
          },
        });
      }
    } catch (err) {
      console.error(`[AutoTrader] Session lifecycle error for ${exchange}:`, err instanceof Error ? err.message : err);
    }
  }
}

export async function runIntradayMonitor(): Promise<void> {
  const hour = getNYHour();
  if (hour < 7 || hour >= 17) return;

  try {
    const allSettings = await prisma.userSettings.findMany({
      where: { autoTradeEnabled: true },
    });

    for (const settings of allSettings) {
      const config: AutoTradeConfig = {
        ...DEFAULT_AUTO_TRADE_CONFIG,
        ...(typeof settings.autoTradeConfig === 'object' && settings.autoTradeConfig !== null
          ? (settings.autoTradeConfig as Partial<AutoTradeConfig>)
          : {}),
        enabled: settings.autoTradeEnabled,
      };

      await monitorOpenAutoTrades(settings.id, config);

      if (settings.userId) {
        await runSessionLifecycleChecks(settings.userId);
      }
    }
    // ── Intraday Signal Scan + AI Execution ──────────────────────────────────
    const nyHour2 = getNYHour();
    if (nyHour2 >= 9 && nyHour2 < 16) {
      try {
        for (const settings of allSettings) {
          const cfg: AutoTradeConfig = {
            ...DEFAULT_AUTO_TRADE_CONFIG,
            ...(typeof settings.autoTradeConfig === 'object' && settings.autoTradeConfig !== null
              ? (settings.autoTradeConfig as Partial<AutoTradeConfig>)
              : {}),
            enabled: settings.autoTradeEnabled,
          };
          await monitorIntradayPositions(settings.id, cfg.dryRun);
        }

        clearClosedPositions();

        const MAX_INTRADAY_POSITIONS = 2;
        const openCount = getOpenIntradayPositions().length;
        if (openCount >= MAX_INTRADAY_POSITIONS) return;

        const cryptoEnabled = allSettings.some(s => {
          const cfg = s.autoTradeConfig as any;
          return cfg?.exchange === 'HYPERLIQUID';
        });

        const rawSignals = _scanTimeframe === '5min'
          ? await scanIntradaySignals({ stocks: true, crypto: cryptoEnabled })
          : await scanFastSignals(_scanTimeframe);

        if (rawSignals.length === 0) return;

        const filteredSignals = await filterSignalsWithAI(rawSignals, MAX_INTRADAY_POSITIONS - openCount);
        const approvedSignals  = filteredSignals.filter(s => s.aiApproved);
        if (approvedSignals.length === 0) return;

        for (const settings of allSettings) {
          const cfg: AutoTradeConfig = {
            ...DEFAULT_AUTO_TRADE_CONFIG,
            ...(typeof settings.autoTradeConfig === 'object' && settings.autoTradeConfig !== null
              ? (settings.autoTradeConfig as Partial<AutoTradeConfig>)
              : {}),
            enabled: settings.autoTradeEnabled,
          };
          if (!cfg.enabled) continue;

          const intradayDollarSize = Math.max(25, (cfg.maxPositionPct / 100) * 1000 * 0.25);

          for (const signal of approvedSignals) {
            if (signal.exchange === 'HYPERLIQUID' && (cfg as any).exchange !== 'HYPERLIQUID') continue;
            if (signal.exchange === 'PAPER' && (cfg as any).exchange === 'HYPERLIQUID') continue;
            await executeIntradayTrade(signal, settings.id, intradayDollarSize, cfg.dryRun);
          }
        }
      } catch (err: any) {
        console.warn('[IntradayMonitor] Signal scan error:', err?.message);
      }
    }
  } catch (err) {
    console.error('[AutoTrader] Intraday monitor cycle error:', err instanceof Error ? err.message : err);
  }
}

export function startIntradayMonitor(): void {
  if (monitorInterval) return;
  console.log(`[AutoTrader] Starting intraday monitor (${_scanIntervalMs / 1000}s interval, ${_scanTimeframe} timeframe)`);
  monitorInterval = setInterval(() => {
    runIntradayMonitor().catch((err) => {
      console.warn('[AutoTrader] Monitor tick error:', err?.message);
    });
  }, _scanIntervalMs);
}

export function stopIntradayMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[AutoTrader] Intraday monitor stopped');
  }
}

export type { AutoTradeConfig };
