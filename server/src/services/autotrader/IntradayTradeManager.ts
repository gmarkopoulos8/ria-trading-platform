import { prisma } from '../../lib/prisma';
import { livePriceManager } from '../market/LivePriceManager';
import { getAllMids } from '../hyperliquid/hyperliquidInfoService';
import type { AIFilteredSignal } from './IntradayAIFilter';

export interface IntradayPosition {
  id:            string;
  symbol:        string;
  assetClass:    'stock' | 'crypto';
  exchange:      string;
  direction:     'LONG' | 'SHORT';
  entryPrice:    number;
  currentPrice:  number;
  stopLoss:      number;
  target:        number;
  quantity:      number;
  dollarSize:    number;
  entryTime:     Date;
  maxHoldUntil:  Date;
  pnlPct:        number;
  pnlDollars:    number;
  status:        'OPEN' | 'CLOSED' | 'PENDING';
  closeReason?:  string;
  aiConviction:  number;
  aiHoldMinutes: number;
  triggerType:   string;
}

const _openPositions = new Map<string, IntradayPosition>();

export function getOpenIntradayPositions(): IntradayPosition[] {
  return Array.from(_openPositions.values()).filter(p => p.status === 'OPEN');
}

export function clearClosedPositions(): void {
  for (const [id, pos] of _openPositions) {
    if (pos.status === 'CLOSED') _openPositions.delete(id);
  }
}

export async function executeIntradayTrade(
  signal: AIFilteredSignal,
  userSettingsId: string,
  dollarSizePerTrade: number,
  dryRun = false,
): Promise<{ success: boolean; positionId: string; reason?: string }> {

  const existing = Array.from(_openPositions.values()).find(
    p => p.symbol === signal.symbol && p.status === 'OPEN',
  );
  if (existing) return { success: false, positionId: '', reason: 'Already in position' };

  const entryPrice = signal.currentPrice;
  const quantity   = Math.floor((dollarSizePerTrade / entryPrice) * 100) / 100;
  if (quantity <= 0) return { success: false, positionId: '', reason: 'Size too small' };

  const positionId   = `intraday_${signal.symbol}_${Date.now()}`;
  const maxHoldUntil = new Date(Date.now() + signal.aiHoldMinutes * 60_000);

  const log = await prisma.autoTradeLog.create({
    data: {
      userSettingsId,
      sessionId:    positionId,
      phase:        'ENTRY',
      exchange:     signal.exchange,
      symbol:       signal.symbol,
      assetClass:   signal.assetClass,
      action:       signal.direction === 'LONG' ? 'BUY' : 'SELL_SHORT',
      status:       dryRun ? 'DRY_RUN' : 'FILLED',
      dryRun,
      quantity,
      entryPrice,
      stopLoss:   signal.suggestedStop,
      takeProfit: signal.suggestedTarget,
      reason:     `INTRADAY: ${signal.triggerType} | AI: ${signal.aiReasoning}`,
      metadata:   JSON.parse(JSON.stringify({ signal, maxHoldUntil: maxHoldUntil.toISOString(), dollarSize: dollarSizePerTrade })),
    },
  });

  if (!dryRun) {
    if (signal.exchange === 'PAPER') {
      try {
        const { placeOrder: alpacaPlace } = await import('../alpaca/alpacaExchangeService');
        await alpacaPlace({
          symbol:         signal.symbol,
          side:           signal.direction === 'LONG' ? 'buy' : 'sell',
          notional:       dollarSizePerTrade,
          type:           'market',
          timeInForce:    'day',
          submittedPrice: entryPrice,
        });
      } catch (err: any) {
        console.warn(`[IntradayTrader] Alpaca order failed for ${signal.symbol}:`, err?.message);
      }
    }

    if (signal.exchange === 'HYPERLIQUID') {
      try {
        const { placeOrder: hlPlace } = await import('../hyperliquid/hyperliquidExchangeService');
        await hlPlace({
          asset:      signal.symbol,
          isBuy:      signal.direction === 'LONG',
          size:       quantity,
          price:      entryPrice * (signal.direction === 'LONG' ? 1.002 : 0.998),
          orderType:  'limit',
          tif:        'Ioc',
          reduceOnly: false,
        });
      } catch (err: any) {
        console.warn(`[IntradayTrader] HL order failed for ${signal.symbol}:`, err?.message);
      }
    }
  }

  const position: IntradayPosition = {
    id:            positionId,
    symbol:        signal.symbol,
    assetClass:    signal.assetClass,
    exchange:      signal.exchange,
    direction:     signal.direction,
    entryPrice,
    currentPrice:  entryPrice,
    stopLoss:      signal.suggestedStop,
    target:        signal.suggestedTarget,
    quantity,
    dollarSize:    dollarSizePerTrade,
    entryTime:     new Date(),
    maxHoldUntil,
    pnlPct:        0,
    pnlDollars:    0,
    status:        'OPEN',
    aiConviction:  signal.aiConviction,
    aiHoldMinutes: signal.aiHoldMinutes,
    triggerType:   signal.triggerType,
  };

  _openPositions.set(positionId, position);
  console.info(`[IntradayTrader] Opened ${signal.direction} ${signal.symbol} @ $${entryPrice.toFixed(2)} | AI: ${signal.aiConviction} | Hold: ${signal.aiHoldMinutes}min`);

  return { success: true, positionId: log.id };
}

export async function monitorIntradayPositions(userSettingsId: string, dryRun = false): Promise<void> {
  const openPositions = getOpenIntradayPositions();
  if (openPositions.length === 0) return;

  let hlMids: Record<string, string> = {};
  try { hlMids = await getAllMids(); } catch { /* HL offline */ }

  for (const pos of openPositions) {
    try {
      let currentPrice: number;
      if (pos.assetClass === 'crypto') {
        currentPrice = hlMids[pos.symbol] ? parseFloat(hlMids[pos.symbol]) : pos.currentPrice;
      } else {
        currentPrice = livePriceManager.getLastPrice(pos.symbol) ?? pos.currentPrice;
      }

      const pnlPct     = pos.direction === 'LONG'
        ? (currentPrice - pos.entryPrice) / pos.entryPrice * 100
        : (pos.entryPrice - currentPrice) / pos.entryPrice * 100;
      const pnlDollars = pnlPct / 100 * pos.dollarSize;

      _openPositions.set(pos.id, { ...pos, currentPrice, pnlPct, pnlDollars });

      const now       = new Date();
      const isExpired = now >= pos.maxHoldUntil;
      const hitStop   = pos.direction === 'LONG' ? currentPrice <= pos.stopLoss : currentPrice >= pos.stopLoss;
      const hitTarget = pos.direction === 'LONG' ? currentPrice >= pos.target   : currentPrice <= pos.target;

      // Trail stop to breakeven once up 1.5%
      if (pnlPct >= 1.5 && pos.direction === 'LONG' && pos.entryPrice > pos.stopLoss) {
        const updatedStop = Math.max(pos.stopLoss, pos.entryPrice * 1.001);
        if (updatedStop !== pos.stopLoss) {
          _openPositions.set(pos.id, { ...pos, stopLoss: updatedStop, currentPrice, pnlPct, pnlDollars });
          console.info(`[IntradayTrader] Trailed stop for ${pos.symbol} to $${updatedStop.toFixed(2)}`);
        }
      }

      let closeReason: string | null = null;
      if      (hitStop)   closeReason = `STOP_LOSS @ $${currentPrice.toFixed(2)} (${pnlPct.toFixed(2)}%)`;
      else if (hitTarget) closeReason = `TARGET_HIT @ $${currentPrice.toFixed(2)} (+${pnlPct.toFixed(2)}%)`;
      else if (isExpired) closeReason = `TIME_EXIT: ${pos.aiHoldMinutes}min hold expired (${pnlPct.toFixed(2)}%)`;

      if (closeReason) {
        await closeIntradayPosition(pos, currentPrice, closeReason, userSettingsId, dryRun);
      }
    } catch (err: any) {
      console.warn(`[IntradayTrader] Monitor error for ${pos.symbol}:`, err?.message);
    }
  }

  // Force close all stock positions 15 min before market close (3:45 PM ET)
  const nyHour = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10);
  const nyMin  = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', minute: 'numeric' }), 10);
  if (nyHour === 15 && nyMin >= 45) {
    for (const pos of getOpenIntradayPositions()) {
      if (pos.assetClass === 'stock') {
        const livePrice = livePriceManager.getLastPrice(pos.symbol) ?? pos.currentPrice;
        await closeIntradayPosition(pos, livePrice, 'SESSION_END: forced close before market close', userSettingsId, dryRun);
      }
    }
  }
}

async function closeIntradayPosition(
  pos: IntradayPosition,
  exitPrice: number,
  reason: string,
  userSettingsId: string,
  dryRun: boolean,
): Promise<void> {
  const pnlPct     = pos.direction === 'LONG'
    ? (exitPrice - pos.entryPrice) / pos.entryPrice * 100
    : (pos.entryPrice - exitPrice) / pos.entryPrice * 100;
  const pnlDollars = pnlPct / 100 * pos.dollarSize;

  _openPositions.set(pos.id, { ...pos, status: 'CLOSED', currentPrice: exitPrice, pnlPct, pnlDollars, closeReason: reason });

  await prisma.autoTradeLog.create({
    data: {
      userSettingsId,
      sessionId:  pos.id,
      phase:      'EXIT',
      exchange:   pos.exchange,
      symbol:     pos.symbol,
      assetClass: pos.assetClass,
      action:     pos.direction === 'LONG' ? 'SELL' : 'BUY_TO_COVER',
      status:     dryRun ? 'DRY_RUN' : 'FILLED',
      dryRun,
      quantity:   pos.quantity,
      entryPrice: pos.entryPrice,
      exitPrice,
      pnl:        pnlDollars,
      reason,
      metadata:   JSON.parse(JSON.stringify({ entryId: pos.id, exitPrice, pnlPct, pnlDollars })),
    },
  }).catch(() => null);

  console.info(`[IntradayTrader] Closed ${pos.symbol}: ${reason} | PnL: ${pnlPct.toFixed(2)}% ($${pnlDollars.toFixed(2)})`);
}
