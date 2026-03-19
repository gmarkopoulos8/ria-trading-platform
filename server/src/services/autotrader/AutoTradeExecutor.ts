import { prisma } from '../../lib/prisma';
import { checkCircuitBreakers } from './CircuitBreaker';
import { sizePosition, computeStopLoss, computeTakeProfit } from '../portfolio/PositionSizer';
import { getPortfolioState } from '../portfolio/PortfolioStateService';
import { placeOrder as tosPlaceOrder, type TosOrderRequest } from '../tos/tosExchangeService';
import { placeOrder as hlPlaceOrder, type OrderRequest as HlOrderRequest } from '../hyperliquid/hyperliquidExchangeService';
import { TOS_CONFIG } from '../tos/tosConfig';
import { HL_CONFIG } from '../hyperliquid/hyperliquidConfig';

export type AutoTradeExchange = 'TOS' | 'HYPERLIQUID' | 'PAPER';

export interface AutoTradeSignal {
  symbol: string;
  assetClass: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  setupType?: string;
  reason?: string;
  scanRunId?: string;
  exchange?: AutoTradeExchange;
}

export interface AutoTradeConfig {
  enabled: boolean;
  exchange: AutoTradeExchange;
  maxPositionPct: number;
  dailyLossLimit: number;
  maxDrawdownPct: number;
  maxOpenPositions: number;
  minConvictionScore: number;
  minConfidenceScore: number;
  allowedBiases: string[];
  stopLossPct: number;
  takeProfitPct: number;
  dryRun: boolean;
}

export const DEFAULT_AUTO_TRADE_CONFIG: AutoTradeConfig = {
  enabled: false,
  exchange: 'PAPER',
  maxPositionPct: 5,
  dailyLossLimit: 2000,
  maxDrawdownPct: 5,
  maxOpenPositions: 5,
  minConvictionScore: 70,
  minConfidenceScore: 65,
  allowedBiases: ['BULLISH'],
  stopLossPct: 3.0,
  takeProfitPct: 6.0,
  dryRun: true,
};

export interface AutoTradeResult {
  success: boolean;
  logId?: string;
  status: 'FILLED' | 'DRY_RUN' | 'REJECTED' | 'BLOCKED' | 'ERROR';
  symbol: string;
  exchange: string;
  reason?: string;
  quantity?: number;
  entryPrice?: number;
  dollarAmount?: number;
}

async function resolveEntryPrice(signal: AutoTradeSignal): Promise<number> {
  if (signal.entryPrice && signal.entryPrice > 0) return signal.entryPrice;
  try {
    if (signal.assetClass === 'crypto' || signal.assetClass === 'CRYPTO') {
      const { getAssetPrice } = await import('../hyperliquid/hyperliquidInfoService');
      const price = await getAssetPrice(signal.symbol);
      if (price) return price;
    } else {
      const { getQuotes } = await import('../tos/tosInfoService');
      const quotes = await getQuotes([signal.symbol]);
      const q = quotes[signal.symbol];
      if (q) return q.lastPrice ?? q.mark ?? q.askPrice ?? 0;
    }
  } catch {
  }
  return 0;
}

async function getUserSettings(userSettingsId: string) {
  return prisma.userSettings.findUnique({ where: { id: userSettingsId } });
}

export async function executeAutoTrade(
  signal: AutoTradeSignal,
  config: AutoTradeConfig,
  userSettingsId: string,
  sessionId: string,
): Promise<AutoTradeResult> {
  const exchange = signal.exchange ?? config.exchange;

  if (!config.enabled) {
    return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: 'Auto-trading is disabled' };
  }

  if (!config.allowedBiases.includes(signal.bias)) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Bias ${signal.bias} not in allowed list` };
  }
  if (signal.convictionScore < config.minConvictionScore) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Conviction ${signal.convictionScore} below threshold ${config.minConvictionScore}` };
  }
  if (signal.confidenceScore < config.minConfidenceScore) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Confidence ${signal.confidenceScore} below threshold ${config.minConfidenceScore}` };
  }

  const portfolioState = await getPortfolioState();
  const totalEquity = portfolioState.totalEquity;

  const cb = await checkCircuitBreakers({
    exchange,
    dailyLossLimit: config.dailyLossLimit,
    maxDrawdownPct: config.maxDrawdownPct,
    maxOpenPositions: config.maxOpenPositions,
    currentOpenPositions: portfolioState.openPositionCount,
    currentEquity: totalEquity,
  }, userSettingsId);

  if (!cb.allowed) {
    const log = await prisma.autoTradeLog.create({
      data: {
        userSettingsId,
        sessionId,
        phase: 'CIRCUIT_BREAKER',
        exchange,
        symbol: signal.symbol,
        assetClass: signal.assetClass,
        action: 'ENTRY',
        status: 'BLOCKED',
        dryRun: config.dryRun,
        convictionScore: signal.convictionScore,
        circuitBreakerTripped: true,
        circuitBreakerReason: cb.reason,
        reason: cb.reason,
        metadata: JSON.parse(JSON.stringify({ signal, cbChecks: cb.checks })),
      },
    });
    return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: cb.reason, logId: log.id };
  }

  const entryPrice = await resolveEntryPrice(signal);
  if (entryPrice <= 0) {
    return { success: false, status: 'ERROR', symbol: signal.symbol, exchange, reason: 'Could not resolve entry price' };
  }

  const sized = sizePosition({
    totalEquity,
    maxPositionPct: config.maxPositionPct,
    convictionScore: signal.convictionScore,
    riskScore: (signal.riskScore ?? 50) / 100,
  }, entryPrice);

  if (sized.quantity <= 0) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'Position size too small' };
  }

  const stopLoss = signal.stopLoss ?? computeStopLoss(entryPrice, 'LONG', config.stopLossPct);
  const takeProfit = signal.takeProfit ?? computeTakeProfit(entryPrice, 'LONG', config.takeProfitPct);

  const log = await prisma.autoTradeLog.create({
    data: {
      userSettingsId,
      sessionId,
      phase: 'ENTRY',
      exchange,
      symbol: signal.symbol,
      assetClass: signal.assetClass,
      action: 'BUY',
      status: 'PENDING',
      dryRun: config.dryRun,
      quantity: sized.quantity,
      entryPrice,
      stopLoss,
      takeProfit,
      positionSizePct: sized.positionPct,
      convictionScore: signal.convictionScore,
      reason: signal.reason ?? `Conviction ${signal.convictionScore} | Setup: ${signal.setupType ?? 'scan'}`,
      metadata: JSON.parse(JSON.stringify({ signal, sized, cbChecks: cb.checks })),
    },
  });

  try {
    if (config.dryRun || exchange === 'PAPER') {
      await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'DRY_RUN' } });
      return {
        success: true,
        status: 'DRY_RUN',
        symbol: signal.symbol,
        exchange,
        logId: log.id,
        quantity: sized.quantity,
        entryPrice,
        dollarAmount: sized.dollarAmount,
      };
    }

    if (exchange === 'TOS') {
      const orderReq: TosOrderRequest = {
        symbol: signal.symbol.toUpperCase(),
        instruction: 'BUY',
        quantity: Math.round(sized.quantity),
        orderType: 'MARKET',
        duration: 'DAY',
        session: 'NORMAL',
      };
      const result = await tosPlaceOrder(orderReq);
      const status = result.success ? 'FILLED' : 'ERROR';
      await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status, metadata: { signal, sized, result } as object } });
      return {
        success: result.success,
        status: result.success ? 'FILLED' : 'ERROR',
        symbol: signal.symbol,
        exchange,
        logId: log.id,
        quantity: sized.quantity,
        entryPrice,
        dollarAmount: sized.dollarAmount,
        reason: result.error,
      };
    }

    if (exchange === 'HYPERLIQUID') {
      const hlReq: HlOrderRequest = {
        asset: signal.symbol,
        isBuy: true,
        size: sized.quantity,
        price: entryPrice,
        orderType: 'limit',
        tif: 'Gtc',
        reduceOnly: false,
      };
      const result = await hlPlaceOrder(hlReq);
      const status = result.success ? 'FILLED' : 'ERROR';
      await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status, metadata: { signal, sized, result } as object } });
      return {
        success: result.success,
        status: result.success ? 'FILLED' : 'ERROR',
        symbol: signal.symbol,
        exchange,
        logId: log.id,
        quantity: sized.quantity,
        entryPrice,
        dollarAmount: sized.dollarAmount,
        reason: result.error,
      };
    }

    return { success: false, status: 'ERROR', symbol: signal.symbol, exchange, reason: 'Unknown exchange' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'ERROR', reason: message } });
    return { success: false, status: 'ERROR', symbol: signal.symbol, exchange, reason: message, logId: log.id };
  }
}

export async function runTradingCycle(
  userSettingsId: string,
  config: AutoTradeConfig,
  signals: AutoTradeSignal[],
): Promise<AutoTradeResult[]> {
  const sessionId = `session_${Date.now()}`;
  const results: AutoTradeResult[] = [];

  const sorted = [...signals].sort((a, b) => b.convictionScore - a.convictionScore);

  for (const signal of sorted) {
    const result = await executeAutoTrade(signal, config, userSettingsId, sessionId);
    results.push(result);
    if (result.status === 'FILLED' || result.status === 'DRY_RUN') {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
