import { prisma } from '../../lib/prisma';
import { DEFAULT_AUTO_TRADE_CONFIG, type AutoTradeConfig } from './AutoTradeExecutor';
import { checkSessionActive, pauseSession } from './ExchangeAutoConfigService';

let monitorInterval: NodeJS.Timeout | null = null;

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
  } catch (err) {
    console.error('[AutoTrader] Intraday monitor cycle error:', err instanceof Error ? err.message : err);
  }
}

export function startIntradayMonitor(): void {
  if (monitorInterval) return;
  console.log('[AutoTrader] Starting intraday monitor loop (5-min interval)');
  monitorInterval = setInterval(() => {
    runIntradayMonitor().catch((err) => {
      console.warn('[AutoTrader] Monitor tick error:', err?.message);
    });
  }, 5 * 60 * 1000);
}

export function stopIntradayMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    console.log('[AutoTrader] Intraday monitor stopped');
  }
}

export type { AutoTradeConfig };
