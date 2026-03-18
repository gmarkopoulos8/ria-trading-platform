import { runDailyScan } from './dailyScanOrchestrator';

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

async function schedulerTick() {
  if (!enabled) return;

  const nyTime = getNYTime();
  if (!isWeekday(nyTime)) return;

  const dateKey = getDateKey(nyTime);

  if (isMarketOpenTime(nyTime)) {
    const runKey = `open:${dateKey}`;
    if (lastScheduledDate === runKey) return;
    lastScheduledDate = runKey;
    console.log(`[Scheduler] Triggering market open scan at ${nyTime.toISOString()}`);
    try {
      await runDailyScan({
        runType: 'SCHEDULED',
        marketSession: 'MARKET_OPEN',
        scheduledFor: nyTime,
      });
    } catch (err) {
      console.error('[Scheduler] Market open scan failed:', err instanceof Error ? err.message : err);
    }
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
