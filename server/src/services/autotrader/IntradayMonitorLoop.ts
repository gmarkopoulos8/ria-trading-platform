import { prisma } from '../../lib/prisma';
import { DEFAULT_AUTO_TRADE_CONFIG, type AutoTradeConfig } from './AutoTradeExecutor';

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
            metadata: { entryLogId: log.id, currentPrice, hitTP, hitSL },
          },
        });

        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data: {
            status: 'CLOSED',
            exitPrice: currentPrice,
            pnl,
          },
        });

        console.log(`[AutoTrader] ${exitReason} for ${log.symbol} @ ${currentPrice} | PnL: $${pnl.toFixed(2)}`);
      }
    } catch (err) {
      console.error(`[AutoTrader] Monitor error for ${log.symbol}:`, err instanceof Error ? err.message : err);
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
