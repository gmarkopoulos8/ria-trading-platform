import { prisma } from '../../lib/prisma';
import { checkCircuitBreakers } from './CircuitBreaker';
import { sizePosition, computeStopLoss, computeTakeProfit } from '../portfolio/PositionSizer';
import { getPortfolioState } from '../portfolio/PortfolioStateService';
import { placeOrder as tosPlaceOrder, type TosOrderRequest } from '../tos/tosExchangeService';
import { placeOrder as hlPlaceOrder, type OrderRequest as HlOrderRequest } from '../hyperliquid/hyperliquidExchangeService';
import { TOS_CONFIG, isKillswitchActive as isTOSStopped, isPauseActive as isTOSPaused } from '../tos/tosConfig';
import { HL_CONFIG, isKillswitchActive as isHLStopped, isPauseActive as isHLPaused } from '../hyperliquid/hyperliquidConfig';
import { getConfig, checkSessionActive } from './ExchangeAutoConfigService';
import { detectRegime } from '../market/RegimeDetector';
import { getRecommendation } from '../options/OptionsAnalyzer';

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
  intradayConfirmation?: string;
  atrPercent?: number;
  fixedDollarAmount?: number;
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

  const exchange = signal.exchange ?? 'PAPER';

  try {
    if (signal.assetClass === 'crypto' || signal.assetClass === 'CRYPTO') {
      const { getAssetPrice } = await import('../hyperliquid/hyperliquidInfoService');
      const price = await getAssetPrice(signal.symbol);
      if (price && price > 0) return price;
    }

    // For PAPER exchange, use Alpaca's own quote — never depend on TOS being connected
    if (exchange === 'PAPER') {
      try {
        const { getLatestQuote } = await import('../alpaca/alpacaInfoService');
        const quote = await getLatestQuote(signal.symbol);
        if (quote && quote > 0) return quote;
      } catch {
        // fall through to Yahoo Finance
      }
    }

    // For TOS exchange, use TOS quotes
    if (exchange === 'TOS') {
      try {
        const { getQuotes } = await import('../tos/tosInfoService');
        const quotes = await getQuotes([signal.symbol]);
        const q = quotes[signal.symbol];
        if (q) return q.lastPrice ?? q.mark ?? q.askPrice ?? 0;
      } catch {
        // fall through
      }
    }

    // Universal fallback — Yahoo Finance via StocksService (always available, no auth needed)
    const { stocksService } = await import('../market/stocks/StocksService');
    const quote = await stocksService.quote(signal.symbol);
    if (quote?.price && quote.price > 0) return quote.price;
  } catch {
    // last resort below
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
  perScanTradeCount?: Map<string, number>,
): Promise<AutoTradeResult> {
  const exchange = signal.exchange ?? config.exchange;

  if (!config.enabled) {
    return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: 'Auto-trading is disabled' };
  }

  // ─── Exchange-level pause / hard stop checks ─────────────────────────────
  if (exchange === 'HYPERLIQUID' && (isHLPaused() || isHLStopped())) {
    return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `HL trading ${isHLStopped() ? 'hard-stopped' : 'paused'}` };
  }
  if (exchange === 'TOS' && (isTOSPaused() || isTOSStopped())) {
    return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `TOS trading ${isTOSStopped() ? 'hard-stopped' : 'paused'}` };
  }

  // ─── Phase 4: Regime check ─────────────────────────────────────────────
  let regimePositionSizeMultiplier = 1.0;
  try {
    const regime = await detectRegime();
    if (!regime.autoTraderAdjustments.allowNewEntries) {
      return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `REGIME_BLOCK: ${regime.regime} — new entries blocked` };
    }
    if (regime.autoTraderAdjustments.longOnly && signal.bias === 'BEARISH') {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `REGIME_LONG_ONLY: ${regime.regime} requires long-only mode` };
    }
    const effectiveMinConvictionFromRegime = regime.autoTraderAdjustments.minConvictionOverride;
    if (signal.convictionScore < effectiveMinConvictionFromRegime) {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `REGIME_CONVICTION: ${regime.regime} requires conviction >= ${effectiveMinConvictionFromRegime}` };
    }
    regimePositionSizeMultiplier = regime.autoTraderAdjustments.positionSizeMultiplier;
  } catch {
    // regime check non-fatal
  }

  // ─── Per-Exchange Config Enforcement ─────────────────────────────────────
  const exchangeKey = exchange === 'TOS' ? 'tos' : exchange === 'HYPERLIQUID' ? 'hyperliquid' : null;

  if (exchangeKey) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
      const userId = settings?.userId;

      if (userId) {
        const exCfg = await getConfig(userId, exchangeKey as 'hyperliquid' | 'tos');

        // Session active check
        const sessionCheck = await checkSessionActive(userId, exchangeKey);
        if (!sessionCheck.active) {
          return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `Exchange session inactive: ${sessionCheck.reason}` };
        }

        // Max trades per scan throttle
        if (perScanTradeCount) {
          const countForExchange = perScanTradeCount.get(exchange) ?? 0;
          if (countForExchange >= exCfg.maxTradesPerScan) {
            return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `Max trades per scan (${exCfg.maxTradesPerScan}) reached for ${exchange}` };
          }
        }

        // Order cooldown check
        const cooldownCutoff = new Date(Date.now() - exCfg.orderCooldownMinutes * 60_000);
        const recentOrder = await prisma.autoTradeLog.findFirst({
          where: { userSettingsId, exchange, executedAt: { gte: cooldownCutoff } },
          orderBy: { executedAt: 'desc' },
        });
        if (recentOrder) {
          return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `ORDER_COOLDOWN: must wait ${exCfg.orderCooldownMinutes}min between orders` };
        }

        // Signal threshold enforcement (use more restrictive of global vs per-exchange)
        const effectiveMinConviction = Math.max(config.minConvictionScore, exCfg.minConvictionScore);
        const effectiveMinConfidence = Math.max(config.minConfidenceScore, exCfg.minConfidenceScore);

        if (signal.convictionScore < effectiveMinConviction) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Conviction ${signal.convictionScore} below exchange threshold ${effectiveMinConviction}` };
        }
        if (signal.confidenceScore < effectiveMinConfidence) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Confidence ${signal.confidenceScore} below exchange threshold ${effectiveMinConfidence}` };
        }
        if (!exCfg.allowedBias.includes(signal.bias)) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Bias ${signal.bias} not allowed on ${exchange}` };
        }

        // HL-specific checks
        if (exchangeKey === 'hyperliquid') {
          if (!exCfg.allowShorts && signal.bias === 'BEARISH') {
            return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'Short positions disabled on Hyperliquid' };
          }
          if (exCfg.allowedAssets.length > 0 && !exCfg.allowedAssets.includes(signal.symbol)) {
            return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `${signal.symbol} not in Hyperliquid allowed assets list` };
          }
          if (exCfg.blockedAssets.includes(signal.symbol)) {
            return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `${signal.symbol} is blocked on Hyperliquid` };
          }
        }
      }
    } catch (exCfgErr) {
      console.warn(`[AutoTrader] Per-exchange config check failed for ${exchange}:`, exCfgErr instanceof Error ? exCfgErr.message : exCfgErr);
    }
  }

  // ─── Global Signal Filters ──────────────────────────────────────────────
  if (!config.allowedBiases.includes(signal.bias)) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Bias ${signal.bias} not in allowed list` };
  }
  if (signal.convictionScore < config.minConvictionScore) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Conviction ${signal.convictionScore} below threshold ${config.minConvictionScore}` };
  }
  if (signal.confidenceScore < config.minConfidenceScore) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Confidence ${signal.confidenceScore} below threshold ${config.minConfidenceScore}` };
  }

  // ─── Phase 5: Intraday confirmation check ───────────────────────────────
  if (signal.intradayConfirmation === 'EXTENDED') {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'INTRADAY_EXTENDED — price overbought on hourly, waiting for pullback' };
  }
  if (signal.intradayConfirmation === 'WAIT') {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'INTRADAY_NOT_CONFIRMED — hourly trend contradicts daily setup' };
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

  const stopLoss = signal.stopLoss ?? computeStopLoss(entryPrice, 'LONG', config.stopLossPct);
  const takeProfit = signal.takeProfit ?? computeTakeProfit(entryPrice, 'LONG', config.takeProfitPct);

  // ─── Stop Distance & R:R Checks (using per-exchange config if available) ──
  if (exchangeKey) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
      if (settings?.userId) {
        const exCfg = await getConfig(settings.userId, exchangeKey as 'hyperliquid' | 'tos');
        const stopDistPct = Math.abs(entryPrice - stopLoss) / entryPrice * 100;
        if (stopDistPct < exCfg.minStopDistancePct) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Stop distance ${stopDistPct.toFixed(2)}% below minimum ${exCfg.minStopDistancePct}%` };
        }
        if (stopDistPct > exCfg.maxStopDistancePct) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Stop distance ${stopDistPct.toFixed(2)}% exceeds maximum ${exCfg.maxStopDistancePct}%` };
        }
        const rr = (takeProfit - entryPrice) / (entryPrice - stopLoss);
        if (rr < exCfg.minRewardRiskRatio) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Reward:Risk ratio ${rr.toFixed(2)} below minimum ${exCfg.minRewardRiskRatio}` };
        }

        // Capital hard limit check
        const openNotional = await prisma.autoTradeLog.aggregate({
          where: { userSettingsId, exchange, phase: 'ENTRY', status: { in: ['FILLED', 'DRY_RUN'] } },
          _sum: { quantity: true },
        });
        const approxDeployed = (openNotional._sum.quantity ?? 0) * entryPrice;
        if (approxDeployed >= exCfg.capitalHardLimitUsd) {
          return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: 'CAPITAL_HARD_LIMIT_REACHED' };
        }
      }
    } catch {
      // non-fatal
    }
  }

  let sized = sizePosition({
    totalEquity,
    maxPositionPct: config.maxPositionPct,
    convictionScore: signal.convictionScore,
    riskScore: (signal.riskScore ?? 50) / 100,
    atrPercent: signal.atrPercent,
    stopLossPrice: signal.stopLoss ?? computeStopLoss(entryPrice, 'LONG', config.stopLossPct),
    entryPrice,
    regimeSizeMultiplier: regimePositionSizeMultiplier,
  }, entryPrice);

  // Clamp to per-exchange position size limits
  if (exchangeKey) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
      if (settings?.userId) {
        const exCfg = await getConfig(settings.userId, exchangeKey as 'hyperliquid' | 'tos');
        if (sized.dollarAmount > exCfg.maxPositionSizeUsd) {
          const clampedQty = exCfg.maxPositionSizeUsd / entryPrice;
          sized = { ...sized, quantity: clampedQty, dollarAmount: exCfg.maxPositionSizeUsd };
        }
        if (sized.dollarAmount < exCfg.minPositionSizeUsd) {
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `Position size $${sized.dollarAmount.toFixed(2)} below exchange minimum $${exCfg.minPositionSizeUsd}` };
        }
      }
    } catch {
      // non-fatal
    }
  }

  if (sized.quantity <= 0) {
    return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'Position size too small' };
  }

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

  // Increment per-scan counter
  if (perScanTradeCount) {
    perScanTradeCount.set(exchange, (perScanTradeCount.get(exchange) ?? 0) + 1);
  }

  // ─── Phase 9: Options evaluation path (TOS only) ────────────────────────
  if (exchange === 'TOS' && exchangeKey) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
      if (settings?.userId) {
        const exCfg = await getConfig(settings.userId, 'tos');
        if (exCfg.optionsEnabled) {
          const optionsRec = await getRecommendation(
            { ticker: signal.symbol, thesis: { bias: signal.bias, convictionScore: signal.convictionScore, suggestedHoldWindow: '2-4 WEEKS', invalidationZone: { level: signal.stopLoss ?? 0, description: '' } } } as any,
            portfolioState.totalEquity,
            portfolioState.totalEquity * (exCfg.maxOptionsRiskPct / 100),
          ).catch(() => null);

          if (optionsRec && optionsRec.strategy !== 'NONE' && exCfg.allowedOptionStrategies.includes(optionsRec.strategy)) {
            await prisma.autoTradeLog.update({
              where: { id: log.id },
              data: {
                metadata: JSON.parse(JSON.stringify({ signal, sized, optionsRecommendation: optionsRec })),
                reason: `OPTIONS_AVAILABLE: ${optionsRec.strategy} — ${optionsRec.reasoning[0] ?? ''}`,
              },
            });
          }
        }
      }
    } catch {
      // options check is non-fatal
    }
  }

  try {
    // Dry run — simulate only, no exchange calls
    if (config.dryRun) {
      await prisma.autoTradeLog.update({
        where: { id: log.id },
        data: { status: 'DRY_RUN', entryPrice, stopLoss, takeProfit, quantity: sized.quantity, dollarAmount: sized.dollarAmount },
      });
      return { success: true, status: 'DRY_RUN', symbol: signal.symbol, exchange, logId: log.id, quantity: sized.quantity, entryPrice, dollarAmount: sized.dollarAmount };
    }

    // PAPER — route to Alpaca paper API
    if (exchange === 'PAPER') {
      try {
        const { placeOrder: alpacaPlace } = await import('../alpaca/alpacaExchangeService');
        const { hasAlpacaCredentials, isPauseActive: alpacaPaused, isKillswitchActive: alpacaStopped } = await import('../alpaca/alpacaConfig');

        if (!hasAlpacaCredentials()) {
          await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'REJECTED', reason: 'Alpaca not connected' } });
          return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'Alpaca not connected' };
        }
        if (alpacaPaused() || alpacaStopped()) {
          await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'BLOCKED', reason: 'Alpaca paused or stopped' } });
          return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: 'Alpaca trading is paused' };
        }

        const dollarAmount = (signal as any).fixedDollarAmount ?? sized.dollarAmount;

        const alpacaResult = await alpacaPlace({
          symbol: signal.symbol.toUpperCase(),
          notional: dollarAmount,
          side: 'buy',
          type: 'market',
          timeInForce: 'day',
          userId: userSettingsId,
          scanRunId: signal.scanRunId,
          submittedPrice: entryPrice,
        });

        if (!alpacaResult.success) {
          await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'ERROR', reason: alpacaResult.error ?? 'Alpaca order failed' } });
          return { success: false, status: 'ERROR', symbol: signal.symbol, exchange, reason: alpacaResult.error };
        }

        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data: { status: 'FILLED', entryPrice, stopLoss, takeProfit, quantity: sized.quantity, dollarAmount, orderId: alpacaResult.orderId, executedAt: new Date() },
        });

        return { success: true, status: 'FILLED', symbol: signal.symbol, exchange, logId: log.id, quantity: sized.quantity, entryPrice, dollarAmount };
      } catch (err: any) {
        await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status: 'ERROR', reason: err?.message ?? 'PAPER order error' } });
        return { success: false, status: 'ERROR', symbol: signal.symbol, exchange, reason: err?.message };
      }
    }

    if (exchange === 'TOS') {
      // Apply per-exchange TOS order settings
      let duration: string = 'DAY';
      let session: string = 'NORMAL';
      try {
        const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
        if (settings?.userId) {
          const exCfg = await getConfig(settings.userId, 'tos');
          duration = exCfg.orderDuration;
          session = exCfg.orderSession;
        }
      } catch {}

      const orderReq: TosOrderRequest = {
        symbol: signal.symbol.toUpperCase(),
        instruction: 'BUY',
        quantity: Math.round(sized.quantity),
        orderType: 'MARKET',
        duration: duration as 'DAY' | 'GTC' | 'FOK' | 'IOC',
        session: session as 'NORMAL' | 'SEAMLESS',
      };
      const result = await tosPlaceOrder(orderReq);
      const status = result.success ? 'FILLED' : 'ERROR';
      await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status, metadata: JSON.parse(JSON.stringify({ signal, sized, result })) } });
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
      // Apply per-exchange HL settings
      let leverage = 2;
      let isBuy = true;
      try {
        const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
        if (settings?.userId) {
          const exCfg = await getConfig(settings.userId, 'hyperliquid');
          leverage = Math.min(exCfg.defaultLeverage, exCfg.maxLeverage);
          isBuy = signal.bias !== 'BEARISH' || !exCfg.allowShorts;
        }
      } catch {}

      const hlReq: HlOrderRequest = {
        asset: signal.symbol,
        isBuy,
        size: sized.quantity,
        price: entryPrice,
        orderType: 'limit',
        tif: 'Gtc',
        reduceOnly: false,
      };
      const result = await hlPlaceOrder(hlReq);
      const status = result.success ? 'FILLED' : 'ERROR';
      await prisma.autoTradeLog.update({ where: { id: log.id }, data: { status, metadata: JSON.parse(JSON.stringify({ signal, sized, result, leverage })) } });
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
  const perScanTradeCount = new Map<string, number>();

  const sorted = [...signals].sort((a, b) => b.convictionScore - a.convictionScore);

  for (const signal of sorted) {
    const result = await executeAutoTrade(signal, config, userSettingsId, sessionId, perScanTradeCount);
    results.push(result);
    if (result.status === 'FILLED' || result.status === 'DRY_RUN') {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
