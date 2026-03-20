import { runDailyScan } from './dailyScanOrchestrator';
import { runAutonomousCycle } from '../autotrader/AutonomousExecutor';
import { closeAllPositions } from '../alpaca/alpacaExchangeService';
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
  console.log('[Scheduler] End-of-day routine starting');

  if (hasAlpacaCredentials()) {
    try {
      const { closed, errors } = await closeAllPositions();
      console.log(`[Scheduler] EOD: closed ${closed} positions, ${errors.length} errors`);
      if (errors.length > 0) console.warn('[Scheduler] EOD close errors:', errors);
    } catch (err: any) {
      console.error('[Scheduler] EOD close all failed:', err?.message);
    }
  }

  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await prisma.autoTradeLog.updateMany({
      where: { exchange: 'PAPER', status: 'FILLED', phase: 'ENTRY', executedAt: { gte: today } },
      data:  { status: 'CLOSED', exitPrice: 0, reason: 'EOD_FORCED_CLOSE' },
    });
  } catch (err: any) {
    console.warn('[Scheduler] EOD log cleanup error:', err?.message);
  }

  await telegramService.sendDailySummary().catch(() => {});
  console.log('[Scheduler] End-of-day routine complete');
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
