import { runDailyScan } from './dailyScanOrchestrator';
import { runAutonomousCycle } from '../autotrader/AutonomousExecutor';
import { hasAlpacaCredentials } from '../alpaca/alpacaConfig';
import telegramService from '../notifications/TelegramService';
import { prisma } from '../../lib/prisma';

const ENABLE_DAILY_SCANS = process.env.ENABLE_DAILY_SCANS !== 'false';
const MARKET_TIMEZONE = process.env.MARKET_TIMEZONE ?? 'America/New_York';
const MARKET_OPEN_HOUR = parseInt(process.env.MARKET_OPEN_HOUR ?? '9', 10);
const MARKET_OPEN_MINUTE = parseInt(process.env.MARKET_OPEN_MINUTE ?? '30', 10);
const PREMARKET_SCAN_ENABLED = process.env.PREMARKET_SCAN_ENABLED === 'true';
const PREMARKET_OFFSET_MINUTES = parseInt(process.env.PREMARKET_OFFSET_MINUTES ?? '30', 10);

let schedulerInterval: NodeJS.Timeout | null = null;
let lastScheduledDate = '';
let enabled = ENABLE_DAILY_SCANS;

function getNYTime(): Date {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: MARKET_TIMEZONE }));
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isMarketOpenTime(date: Date): boolean {
  return date.getHours() === MARKET_OPEN_HOUR && date.getMinutes() === MARKET_OPEN_MINUTE;
}

function isPremarketTime(date: Date): boolean {
  if (!PREMARKET_SCAN_ENABLED) return false;
  const preHour = MARKET_OPEN_HOUR;
  const preMin = MARKET_OPEN_MINUTE - PREMARKET_OFFSET_MINUTES;
  const adjustedHour = preMin < 0 ? preHour - 1 : preHour;
  const adjustedMin = preMin < 0 ? 60 + preMin : preMin;
  return date.getHours() === adjustedHour && date.getMinutes() === adjustedMin;
}

function isEndOfDayTime(date: Date): boolean {
  return date.getHours() === 15 && date.getMinutes() === 45;
}

async function runEndOfDay(): Promise<void> {
  console.log('[Scheduler] Smart EOD — closing intraday positions only');

  if (!hasAlpacaCredentials()) {
    console.log('[Scheduler] EOD: Alpaca not connected — skipping');
    await telegramService.sendDailySummary().catch(() => {});
    console.log('[Scheduler] End-of-day routine complete');
    return;
  }

  try {
    const { getPositions } = await import('../alpaca/alpacaInfoService');
    const { closePosition } = await import('../alpaca/alpacaExchangeService');
    const alpacaPositions = await getPositions();

    if (!alpacaPositions || alpacaPositions.length === 0) {
      console.log('[Scheduler] EOD: No open positions');
    } else {
      let closedCount = 0;
      let heldCount   = 0;

      for (const pos of alpacaPositions) {
        const symbol = (pos as any).symbol;

        const tradeLog = await prisma.autoTradeLog.findFirst({
          where: {
            symbol,
            exchange: 'PAPER',
            status:   { in: ['FILLED', 'DRY_RUN'] },
            phase:    'ENTRY',
          },
          orderBy: { executedAt: 'desc' },
        });

        const currentPrice = parseFloat((pos as any).current_price ?? '0');
        const entryPrice   = parseFloat((pos as any).avg_entry_price ?? '0');
        const pnlPct       = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

        const shouldClose = determineEODClose(tradeLog, pos, pnlPct);

        if (shouldClose.close) {
          console.log(`[EOD] Closing ${symbol}: ${shouldClose.reason}`);
          try {
            await closePosition(symbol);
            closedCount++;

            if (tradeLog) {
              const dollarPnl = (pnlPct / 100) * parseFloat((pos as any).market_value ?? '0');
              await prisma.autoTradeLog.update({
                where: { id: tradeLog.id },
                data:  { status: 'CLOSED', exitPrice: currentPrice, pnl: dollarPnl, reason: shouldClose.reason },
              });
            }
          } catch (err: any) {
            console.warn(`[EOD] Failed to close ${symbol}:`, err?.message);
          }
        } else {
          console.log(`[EOD] Holding ${symbol}: ${shouldClose.reason} | P&L: ${pnlPct.toFixed(2)}%`);
          heldCount++;

          if (tradeLog && currentPrice > ((tradeLog as any).highWaterMark ?? 0)) {
            await prisma.autoTradeLog.update({
              where: { id: tradeLog.id },
              data:  { highWaterMark: currentPrice } as any,
            });
          }
        }
      }

      console.log(`[Scheduler] EOD complete: ${closedCount} closed, ${heldCount} held overnight`);
    }
  } catch (err: any) {
    console.error('[Scheduler] EOD error:', err?.message);
  }

  await telegramService.sendDailySummary().catch(() => {});
  console.log('[Scheduler] End-of-day routine complete');
}

function determineEODClose(
  tradeLog: any,
  position: any,
  pnlPct: number,
): { close: boolean; reason: string } {
  if (tradeLog?.exchange === 'HYPERLIQUID') {
    return { close: true, reason: 'EOD_INTRADAY: Hyperliquid funding cost' };
  }

  if (tradeLog?.isIntraday === true) {
    return { close: true, reason: 'EOD_INTRADAY: marked as intraday setup' };
  }

  if (!tradeLog || (tradeLog as any).holdWindowDays === 1) {
    return { close: true, reason: 'EOD_INTRADAY: 1-day hold window' };
  }

  if (tradeLog?.stopLoss && tradeLog?.entryPrice) {
    const maxStopDist = Math.abs(tradeLog.entryPrice - tradeLog.stopLoss);
    const currentPx   = tradeLog.entryPrice * (1 + pnlPct / 100);
    const currentDist = Math.abs(currentPx - tradeLog.entryPrice);
    const stopUsed    = maxStopDist > 0 ? currentDist / maxStopDist : 0;
    if (pnlPct < 0 && stopUsed > 0.6) {
      return { close: true, reason: `EOD_THESIS_BROKEN: down ${Math.abs(pnlPct).toFixed(1)}% (>60% of stop used)` };
    }
  }

  if ((tradeLog as any).holdUntil) {
    if (new Date() > new Date((tradeLog as any).holdUntil)) {
      return { close: true, reason: `EOD_HOLD_EXPIRED: hold window of ${(tradeLog as any).holdWindowDays} days elapsed` };
    }
  }

  const strategy = tradeLog?.metadata?.claudeDecision?.strategy
    ?? tradeLog?.metadata?.optionsRecommendation?.strategy;
  if (['IRON_CONDOR', 'CASH_SECURED_PUT', 'COVERED_CALL', 'BEAR_PUT_SPREAD'].includes(strategy)) {
    return { close: false, reason: `HOLD: options strategy ${strategy} — theta decay needs time` };
  }

  const holdDays = (tradeLog as any).holdWindowDays ?? 5;
  const daysHeld = Math.floor((Date.now() - new Date(tradeLog.executedAt).getTime()) / 86_400_000);
  return { close: false, reason: `HOLD: ${holdDays}-day setup, day ${daysHeld + 1} of ${holdDays}` };
}

async function schedulerTick() {
  if (!enabled) return;

  const nyTime = getNYTime();
  if (!isWeekday(nyTime)) return;

  const dateKey = getDateKey(nyTime);

  const enableFullUniverse = process.env.ENABLE_FULL_UNIVERSE_SCAN === 'true';

  if (isMarketOpenTime(nyTime)) {
    const runKey = `open:${dateKey}`;
    if (lastScheduledDate === runKey) return;
    lastScheduledDate = runKey;
    console.log(`[Scheduler] Triggering market open scan at ${nyTime.toISOString()} (fullUniverse=${enableFullUniverse})`);
    try {
      const scanId = await runDailyScan({
        runType:       'SCHEDULED',
        marketSession: 'MARKET_OPEN',
        scheduledFor:  nyTime,
        fullUniverse:  enableFullUniverse,
      });
      console.log(`[Scheduler] Scan ${scanId} complete — triggering autonomous cycle`);
      runAutonomousCycle('MARKET_OPEN', scanId).catch((err) => {
        console.error('[Scheduler] Autonomous cycle failed after market open scan:', err?.message);
      });
    } catch (err) {
      console.error('[Scheduler] Market open scan failed:', err instanceof Error ? err.message : err);
    }
  }

  if (isEndOfDayTime(nyTime)) {
    const runKey = `eod:${dateKey}`;
    if (lastScheduledDate === runKey) return;
    lastScheduledDate = runKey;
    console.log(`[Scheduler] End-of-day triggered at ${nyTime.toISOString()}`);
    runEndOfDay().catch((err) => {
      console.error('[Scheduler] End-of-day routine failed:', err?.message);
    });
  }

  if (isPremarketTime(nyTime)) {
    const runKey = `premarket:${dateKey}`;
    if (lastScheduledDate === runKey) return;
    lastScheduledDate = runKey;
    console.log(`[Scheduler] Triggering premarket scan at ${nyTime.toISOString()}`);
    try {
      await runDailyScan({
        runType: 'PREMARKET',
        marketSession: 'PREMARKET',
        scheduledFor: nyTime,
        fullUniverse: false,
      });
    } catch (err) {
      console.error('[Scheduler] Premarket scan failed:', err instanceof Error ? err.message : err);
    }
  }
}

export function startDailyScanScheduler() {
  if (schedulerInterval) return;
  console.log(`[Scheduler] Daily scan scheduler initializing (enabled=${enabled}, tz=${MARKET_TIMEZONE}, open=${MARKET_OPEN_HOUR}:${String(MARKET_OPEN_MINUTE).padStart(2, '0')})`);
  schedulerInterval = setInterval(schedulerTick, 60_000);
}

export function stopDailyScanScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

export function setSchedulerEnabled(state: boolean) {
  enabled = state;
  console.log(`[Scheduler] Scan scheduler ${state ? 'enabled' : 'disabled'}`);
}

export function getSchedulerStatus() {
  return {
    enabled,
    timezone: MARKET_TIMEZONE,
    marketOpenHour: MARKET_OPEN_HOUR,
    marketOpenMinute: MARKET_OPEN_MINUTE,
    premarketEnabled: PREMARKET_SCAN_ENABLED,
    premarketOffsetMinutes: PREMARKET_OFFSET_MINUTES,
    running: schedulerInterval !== null,
  };
}
