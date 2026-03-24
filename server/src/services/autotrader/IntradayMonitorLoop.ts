import { prisma } from '../../lib/prisma';
import { DEFAULT_AUTO_TRADE_CONFIG, type AutoTradeConfig } from './AutoTradeExecutor';
import { checkSessionActive, pauseSession } from './ExchangeAutoConfigService';
import { isKillswitchActive as isHLStopped } from '../hyperliquid/hyperliquidConfig';
import { isKillswitchActive as isTOSStopped } from '../tos/tosConfig';
import { scanIntradaySignals, scanFastSignals } from './IntradaySignalEngine';
import { runAutonomousCycle } from './AutonomousExecutor';
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
    where:   { userSettingsId, status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
    orderBy: { executedAt: 'desc' },
    take:    20,
  });

  if (activeLogs.length === 0) return;

  // Batch-fetch Alpaca positions for live prices
  let alpacaPositions: Record<string, number> = {};
  try {
    const { hasAlpacaCredentials } = await import('../alpaca/alpacaConfig');
    if (hasAlpacaCredentials()) {
      const { getPositions } = await import('../alpaca/alpacaInfoService');
      const positions = await getPositions();
      for (const p of (positions ?? [])) {
        alpacaPositions[(p as any).symbol] = parseFloat((p as any).current_price ?? '0');
      }
    }
  } catch { /* non-fatal */ }

  for (const log of activeLogs) {
    if (!log.entryPrice || !log.stopLoss) continue;

    try {
      let currentPrice: number | null = null;

      if (log.exchange === 'PAPER') {
        currentPrice = alpacaPositions[log.symbol] ?? null;
        if (!currentPrice) {
          try {
            const { getAlpacaLatestQuote } = await import('../alpaca/alpacaMarketDataService');
            const q = await (getAlpacaLatestQuote as any)(log.symbol);
            currentPrice = q?.price ?? null;
          } catch { /* non-fatal */ }
        }
      } else if (log.assetClass === 'crypto' || log.assetClass === 'CRYPTO') {
        const { getAssetPrice } = await import('../hyperliquid/hyperliquidInfoService');
        currentPrice = await getAssetPrice(log.symbol);
      } else {
        const { getQuotes } = await import('../tos/tosInfoService');
        const quotes = await getQuotes([log.symbol]);
        const q = quotes[log.symbol];
        currentPrice = q?.lastPrice ?? q?.mark ?? null;
      }

      if (!currentPrice || currentPrice <= 0) continue;

      const entryPrice      = log.entryPrice;
      const currentStop     = log.stopLoss;
      const currentTarget   = log.takeProfit ?? entryPrice * 1.06;
      const highWaterMark   = (log as any).highWaterMark ?? entryPrice;
      const trailingStopPct = (log as any).trailingStopPct ?? 2.5;
      const pnlPct          = ((currentPrice - entryPrice) / entryPrice) * 100;

      // ── Update high water mark ────────────────────────────────────────────
      let newHighWater = highWaterMark;
      if (currentPrice > highWaterMark) {
        newHighWater = currentPrice;
        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data:  { highWaterMark: newHighWater } as any,
        });
      }

      // ── Compute trailing stop (only when profitable, only moves up) ───────
      let effectiveStop = currentStop;
      if (currentPrice > entryPrice * 1.01 && newHighWater > entryPrice) {
        const trailedStop = newHighWater * (1 - trailingStopPct / 100);
        if (trailedStop > currentStop) {
          effectiveStop = trailedStop;
          await prisma.autoTradeLog.update({
            where: { id: log.id },
            data:  { stopLoss: effectiveStop },
          });
          console.info(
            `[Monitor] ${log.symbol} trailing stop raised: $${currentStop.toFixed(2)} → $${effectiveStop.toFixed(2)}` +
            ` (high: $${newHighWater.toFixed(2)}, current: $${currentPrice.toFixed(2)})`
          );
        }
      }

      // ── Check exit conditions ─────────────────────────────────────────────
      const hitTP = currentPrice >= currentTarget;
      const hitSL = currentPrice <= effectiveStop;

      const isHardStopped = log.exchange === 'HYPERLIQUID'
        ? isHLStopped()
        : isTOSStopped();
      if (isHardStopped) continue;

      // Check Claude's exit condition via Haiku (only when down > 1%, non-fatal)
      const exitCondition = (log as any).exitCondition as string | null;
      let claudeExitTriggered = false;

      if (exitCondition && pnlPct < -1 && process.env.ANTHROPIC_API_KEY) {
        try {
          const axios = (await import('axios')).default;
          const checkPrompt =
            `Position: ${log.symbol} at $${currentPrice.toFixed(2)} (entered $${entryPrice.toFixed(2)}, P&L: ${pnlPct.toFixed(2)}%)\n` +
            `Exit condition: "${exitCondition}"\n` +
            `Does this exit condition apply right now? Reply with only YES or NO.`;

          const resp = await axios.post(
            'https://api.anthropic.com/v1/messages',
            { model: 'claude-haiku-4-5-20251001', max_tokens: 5, messages: [{ role: 'user', content: checkPrompt }] },
            { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, timeout: 8000 },
          );
          const answer = resp.data?.content?.[0]?.text?.trim().toUpperCase();
          claudeExitTriggered = answer === 'YES';
          if (claudeExitTriggered) {
            console.info(`[Monitor] ${log.symbol} Claude exit condition triggered: "${exitCondition}"`);
          }
        } catch { /* non-fatal */ }
      }

      if (hitTP || hitSL || claudeExitTriggered) {
        const exitReason = claudeExitTriggered
          ? 'CLAUDE_EXIT_CONDITION'
          : hitTP ? 'TAKE_PROFIT' : 'STOP_LOSS';

        const dollarPnl = (currentPrice - entryPrice) * (log.quantity ?? 0);

        // Close on exchange
        if (log.exchange === 'PAPER' && log.status === 'FILLED') {
          try {
            const { closePosition } = await import('../alpaca/alpacaExchangeService');
            await closePosition(log.symbol);
          } catch (closeErr: any) {
            console.warn(`[Monitor] Failed to close ${log.symbol} on Alpaca:`, closeErr?.message);
          }
        }

        await prisma.autoTradeLog.create({
          data: {
            userSettingsId,
            sessionId:  log.sessionId ?? '',
            phase:      'EXIT',
            exchange:   log.exchange,
            symbol:     log.symbol,
            assetClass: log.assetClass,
            action:     'SELL',
            status:     log.status === 'DRY_RUN' ? 'DRY_RUN' : 'FILLED',
            dryRun:     log.dryRun,
            quantity:   log.quantity,
            entryPrice: log.entryPrice,
            exitPrice:  currentPrice,
            pnl:        dollarPnl,
            stopLoss:   effectiveStop,
            reason:     exitReason,
          },
        });

        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data:  { status: 'CLOSED', exitPrice: currentPrice, pnl: dollarPnl, reason: exitReason },
        });

        const { default: telegramService } = await import('../notifications/TelegramService');
        telegramService.notify({
          type:   'TRADE_CLOSED',
          ticker: log.symbol,
          data: {
            ticker:      log.symbol,
            closeReason: exitReason,
            pnl:         dollarPnl.toFixed(2),
            pnlPct:      pnlPct.toFixed(2),
            holdDays:    Math.floor((Date.now() - new Date(log.executedAt).getTime()) / 86_400_000),
            exchange:    log.exchange,
          },
        }, userSettingsId).catch(() => {});

        console.info(`[Monitor] ${exitReason}: ${log.symbol} @ $${currentPrice.toFixed(2)} | P&L: ${pnlPct.toFixed(2)}% ($${dollarPnl.toFixed(2)})`);

        const nyHourNow = getNYHour();
        if (nyHourNow >= 9 && nyHourNow < 15) {
          setTimeout(() => {
            runAutonomousCycle('REENTRY').catch((err) => {
              console.warn('[Monitor] Re-entry cycle error:', err?.message);
            });
          }, 30_000);
        }
      }
    } catch (err: any) {
      console.warn(`[Monitor] Error checking ${log.symbol}:`, err?.message);
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
