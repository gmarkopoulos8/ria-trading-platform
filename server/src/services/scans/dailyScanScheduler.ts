import { runDailyScan } from './dailyScanOrchestrator';
import { runAutonomousCycle } from '../autotrader/AutonomousExecutor';
import { hasAlpacaCredentials } from '../alpaca/alpacaConfig';
import telegramService from '../notifications/TelegramService';
import { prisma } from '../../lib/prisma';

const ENABLE_DAILY_SCANS        = process.env.ENABLE_DAILY_SCANS !== 'false';
const MARKET_TIMEZONE           = process.env.MARKET_TIMEZONE ?? 'America/New_York';
const MARKET_OPEN_HOUR          = parseInt(process.env.MARKET_OPEN_HOUR   ?? '9',  10);
const MARKET_OPEN_MINUTE        = parseInt(process.env.MARKET_OPEN_MINUTE ?? '30', 10);
const PREMARKET_SCAN_ENABLED    = process.env.PREMARKET_SCAN_ENABLED !== 'false'; // on by default
const PREMARKET_HOUR            = parseInt(process.env.PREMARKET_HOUR   ?? '8',  10);
const PREMARKET_MINUTE          = parseInt(process.env.PREMARKET_MINUTE ?? '0',  10);
const ENABLE_MIDDAY_SCAN        = process.env.ENABLE_MIDDAY_SCAN !== 'false'; // on by default

let schedulerInterval: NodeJS.Timeout | null = null;
let lastScheduledDate = '';
let enabled = ENABLE_DAILY_SCANS;

// ─── Time helpers ─────────────────────────────────────────────────────────────

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

function atTime(date: Date, hour: number, minute: number): boolean {
  return date.getHours() === hour && date.getMinutes() === minute;
}

// ─── Checkpoint: Premarket — 8:00 AM ─────────────────────────────────────────
// Scan universe before open; review overnight held positions

async function runPremarket(): Promise<void> {
  console.log('[Scheduler] Premarket: scanning universe + reviewing overnight holds');

  // Refresh high-water marks for overnight positions
  await refreshHighWaterMarks('premarket');

  // Premarket opportunity scan (no autonomous execution — market not open yet)
  try {
    await runDailyScan({
      runType:       'PREMARKET',
      marketSession: 'PREMARKET',
      scheduledFor:  getNYTime(),
      fullUniverse:  false,
    });
  } catch (err: any) {
    console.error('[Scheduler] Premarket scan failed:', err?.message);
  }
}

// ─── Checkpoint: Market Open — 9:30 AM ───────────────────────────────────────
// Full universe scan + autonomous entry cycle

async function runMarketOpen(fullUniverse: boolean): Promise<string | null> {
  console.log('[Scheduler] Market open: full scan + autonomous cycle');
  try {
    const scanId = await runDailyScan({
      runType:       'SCHEDULED',
      marketSession: 'MARKET_OPEN',
      scheduledFor:  getNYTime(),
      fullUniverse,
    });
    runAutonomousCycle('MARKET_OPEN', scanId).catch((err) => {
      console.error('[Scheduler] Autonomous cycle failed after open scan:', err?.message);
    });
    return scanId;
  } catch (err: any) {
    console.error('[Scheduler] Market open scan failed:', err?.message);
    return null;
  }
}

// ─── Checkpoint: Midday — 12:00 PM ───────────────────────────────────────────
// Trail-stop refresh + midday scan for new entries while existing trades run

async function runMidday(): Promise<void> {
  console.log('[Scheduler] Midday: updating trailing stops + scanning for new opportunities');

  // Refresh high-water marks and trailing stops for open positions
  await refreshHighWaterMarks('midday');

  // Midday scan — runs autonomous cycle for new entries (existing positions unaffected)
  try {
    const scanId = await runDailyScan({
      runType:       'MIDDAY',
      marketSession: 'MIDDAY',
      scheduledFor:  getNYTime(),
      fullUniverse:  false,
    });
    runAutonomousCycle('MIDDAY', scanId).catch((err) => {
      console.warn('[Scheduler] Midday autonomous cycle error:', err?.message);
    });
  } catch (err: any) {
    console.error('[Scheduler] Midday scan failed:', err?.message);
  }
}

// ─── Checkpoint: Pre-Close — 3:00 PM ─────────────────────────────────────────
// Preview EOD decisions; send Telegram alert for positions being held vs closed

async function runPreClose(): Promise<void> {
  console.log('[Scheduler] Pre-close: evaluating hold/close decisions for 3:45 PM');

  if (!hasAlpacaCredentials()) return;

  try {
    const { getPositions } = await import('../alpaca/alpacaInfoService');
    const positions = await getPositions();
    if (!positions || positions.length === 0) return;

    const decisions: Array<{ symbol: string; action: string; reason: string; pnlPct: string }> = [];

    for (const pos of positions) {
      const symbol       = (pos as any).symbol;
      const currentPrice = parseFloat((pos as any).current_price ?? '0');
      const entryPrice   = parseFloat((pos as any).avg_entry_price ?? '0');
      const pnlPct       = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

      const tradeLog = await prisma.autoTradeLog.findFirst({
        where:   { symbol, exchange: 'PAPER', status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
        orderBy: { executedAt: 'desc' },
      });

      const decision = determineEODClose(tradeLog, pos, pnlPct);
      decisions.push({
        symbol,
        action: decision.close ? 'CLOSE' : 'HOLD',
        reason: decision.reason,
        pnlPct: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`,
      });

      // Update high-water mark one more time before close
      if (!decision.close && tradeLog && currentPrice > ((tradeLog as any).highWaterMark ?? 0)) {
        await prisma.autoTradeLog.update({
          where: { id: tradeLog.id },
          data:  { highWaterMark: currentPrice } as any,
        });
      }
    }

    const holdCount  = decisions.filter(d => d.action === 'HOLD').length;
    const closeCount = decisions.filter(d => d.action === 'CLOSE').length;

    console.log(`[Scheduler] Pre-close preview: ${holdCount} held overnight, ${closeCount} closing at 3:45`);
    decisions.forEach(d =>
      console.log(`  ${d.action === 'HOLD' ? '↗' : '✗'} ${d.symbol} ${d.pnlPct} — ${d.reason}`)
    );

    // Send Telegram preview (non-fatal)
    telegramService.sendDailySummary().catch(() => {});
  } catch (err: any) {
    console.error('[Scheduler] Pre-close error:', err?.message);
  }
}

// ─── Checkpoint: Smart EOD — 3:45 PM ─────────────────────────────────────────
// Only close: Hyperliquid, explicit intraday, holdWindowDays=1, thesis-broken
// Hold everything else: multi-day setups, options strategies

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
        const symbol       = (pos as any).symbol;
        const currentPrice = parseFloat((pos as any).current_price ?? '0');
        const entryPrice   = parseFloat((pos as any).avg_entry_price ?? '0');
        const pnlPct       = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0;

        const tradeLog = await prisma.autoTradeLog.findFirst({
          where:   { symbol, exchange: 'PAPER', status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
          orderBy: { executedAt: 'desc' },
        });

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

// ─── Helper: refresh high-water marks from live Alpaca positions ──────────────

async function refreshHighWaterMarks(checkpoint: string): Promise<void> {
  if (!hasAlpacaCredentials()) return;
  try {
    const { getPositions } = await import('../alpaca/alpacaInfoService');
    const positions = await getPositions();
    if (!positions || positions.length === 0) return;

    let updated = 0;
    for (const pos of positions) {
      const symbol       = (pos as any).symbol;
      const currentPrice = parseFloat((pos as any).current_price ?? '0');
      if (!currentPrice) continue;

      const tradeLog = await prisma.autoTradeLog.findFirst({
        where:   { symbol, exchange: 'PAPER', status: { in: ['FILLED', 'DRY_RUN'] }, phase: 'ENTRY' },
        orderBy: { executedAt: 'desc' },
      });

      if (tradeLog && currentPrice > ((tradeLog as any).highWaterMark ?? 0)) {
        await prisma.autoTradeLog.update({
          where: { id: tradeLog.id },
          data:  { highWaterMark: currentPrice } as any,
        });
        updated++;
      }
    }

    if (updated > 0) {
      console.log(`[Scheduler] ${checkpoint}: updated high-water marks for ${updated} position(s)`);
    }
  } catch { /* non-fatal */ }
}

// ─── EOD close decision logic ─────────────────────────────────────────────────

function determineEODClose(
  tradeLog: any,
  position: any,
  pnlPct: number,
): { close: boolean; reason: string } {
  // Always close Hyperliquid (funding costs overnight)
  if (tradeLog?.exchange === 'HYPERLIQUID') {
    return { close: true, reason: 'EOD_INTRADAY: Hyperliquid funding cost' };
  }

  // Always close explicit intraday trades
  if (tradeLog?.isIntraday === true) {
    return { close: true, reason: 'EOD_INTRADAY: marked as intraday setup' };
  }

  // Close if holdWindowDays = 1 or no trade log found
  if (!tradeLog || (tradeLog as any).holdWindowDays === 1) {
    return { close: true, reason: 'EOD_INTRADAY: 1-day hold window' };
  }

  // Close if thesis is broken (down > 60% of max stop distance)
  if (tradeLog?.stopLoss && tradeLog?.entryPrice) {
    const maxStopDist = Math.abs(tradeLog.entryPrice - tradeLog.stopLoss);
    const currentPx   = tradeLog.entryPrice * (1 + pnlPct / 100);
    const currentDist = Math.abs(currentPx - tradeLog.entryPrice);
    const stopUsed    = maxStopDist > 0 ? currentDist / maxStopDist : 0;
    if (pnlPct < 0 && stopUsed > 0.6) {
      return { close: true, reason: `EOD_THESIS_BROKEN: down ${Math.abs(pnlPct).toFixed(1)}% (>60% of stop used)` };
    }
  }

  // Close if hold window has expired
  if ((tradeLog as any).holdUntil && new Date() > new Date((tradeLog as any).holdUntil)) {
    return { close: true, reason: `EOD_HOLD_EXPIRED: hold window of ${(tradeLog as any).holdWindowDays} days elapsed` };
  }

  // Never close options strategies — theta decay needs time
  const strategy = tradeLog?.metadata?.claudeDecision?.strategy
    ?? tradeLog?.metadata?.optionsRecommendation?.strategy;
  if (['IRON_CONDOR', 'CASH_SECURED_PUT', 'COVERED_CALL', 'BEAR_PUT_SPREAD'].includes(strategy)) {
    return { close: false, reason: `HOLD: options strategy ${strategy} — theta decay needs time` };
  }

  // Multi-day setup — hold overnight
  const holdDays = (tradeLog as any).holdWindowDays ?? 5;
  const daysHeld = Math.floor((Date.now() - new Date(tradeLog.executedAt).getTime()) / 86_400_000);
  return { close: false, reason: `HOLD: ${holdDays}-day setup, day ${daysHeld + 1} of ${holdDays}` };
}

// ─── Main scheduler tick (runs every minute) ──────────────────────────────────

async function schedulerTick() {
  if (!enabled) return;

  const nyTime = getNYTime();
  if (!isWeekday(nyTime)) return;

  const dateKey            = getDateKey(nyTime);
  const enableFullUniverse = process.env.ENABLE_FULL_UNIVERSE_SCAN === 'true';

  // 8:00 AM — Premarket scan + overnight hold review
  if (PREMARKET_SCAN_ENABLED && atTime(nyTime, PREMARKET_HOUR, PREMARKET_MINUTE)) {
    const key = `premarket:${dateKey}`;
    if (lastScheduledDate !== key) {
      lastScheduledDate = key;
      console.log(`[Scheduler] 8:00 AM — Premarket checkpoint`);
      runPremarket().catch((err) => console.error('[Scheduler] Premarket failed:', err?.message));
    }
  }

  // 9:30 AM — Market open scan + autonomous entry cycle
  if (atTime(nyTime, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE)) {
    const key = `open:${dateKey}`;
    if (lastScheduledDate !== key) {
      lastScheduledDate = key;
      console.log(`[Scheduler] 9:30 AM — Market open checkpoint`);
      runMarketOpen(enableFullUniverse).catch((err) => console.error('[Scheduler] Market open failed:', err?.message));
    }
  }

  // 12:00 PM — Midday scan + trailing stop refresh
  if (ENABLE_MIDDAY_SCAN && atTime(nyTime, 12, 0)) {
    const key = `midday:${dateKey}`;
    if (lastScheduledDate !== key) {
      lastScheduledDate = key;
      console.log(`[Scheduler] 12:00 PM — Midday checkpoint`);
      runMidday().catch((err) => console.error('[Scheduler] Midday failed:', err?.message));
    }
  }

  // 3:00 PM — Pre-close position audit + Telegram preview
  if (atTime(nyTime, 15, 0)) {
    const key = `preclose:${dateKey}`;
    if (lastScheduledDate !== key) {
      lastScheduledDate = key;
      console.log(`[Scheduler] 3:00 PM — Pre-close audit checkpoint`);
      runPreClose().catch((err) => console.error('[Scheduler] Pre-close failed:', err?.message));
    }
  }

  // 3:45 PM — Smart EOD: close only intraday + thesis-broken positions
  if (atTime(nyTime, 15, 45)) {
    const key = `eod:${dateKey}`;
    if (lastScheduledDate !== key) {
      lastScheduledDate = key;
      console.log(`[Scheduler] 3:45 PM — Smart EOD checkpoint`);
      runEndOfDay().catch((err) => console.error('[Scheduler] EOD failed:', err?.message));
    }
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export function startDailyScanScheduler() {
  if (schedulerInterval) return;
  console.log(
    `[Scheduler] Daily scan scheduler initializing` +
    ` (enabled=${enabled}, tz=${MARKET_TIMEZONE})` +
    ` | Schedule: 8:00 premarket → 9:30 open → 12:00 midday → 15:00 pre-close → 15:45 smart-EOD`
  );
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
    running:  schedulerInterval !== null,
    timezone: MARKET_TIMEZONE,
    schedule: [
      { time: '08:00', label: 'Premarket scan + overnight hold review',   enabled: PREMARKET_SCAN_ENABLED },
      { time: '09:30', label: 'Market open scan + autonomous entry cycle', enabled: true },
      { time: '12:00', label: 'Midday scan + trailing stop refresh',       enabled: ENABLE_MIDDAY_SCAN },
      { time: '15:00', label: 'Pre-close position audit',                  enabled: true },
      { time: '15:45', label: 'Smart EOD: close intraday only',            enabled: true },
    ],
  };
}
