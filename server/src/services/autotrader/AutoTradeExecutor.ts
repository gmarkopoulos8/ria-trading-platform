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
import { getCachedAdaptive } from './UniversalAdaptiveEngine';
import { runClaudeTradingBrain, type ClaudeTradeDecision } from './ClaudeTradingBrain';

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
  thesisHealthScore?: number;
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

    if (exchange === 'PAPER') {
      try {
        const { getAlpacaLatestQuote, getAlpacaLatestBar } = await import('../alpaca/alpacaMarketDataService');
        const { hasAlpacaCredentials } = await import('../alpaca/alpacaConfig');
        if (hasAlpacaCredentials()) {
          const quote = await getAlpacaLatestQuote(signal.symbol);
          if (quote && quote.price > 0) return quote.price;
          const bar = await getAlpacaLatestBar(signal.symbol);
          if (bar && bar.close > 0) return bar.close;
        }
      } catch { /* fall through */ }

      // Fallback: Yahoo Finance (via StocksService)
      try {
        const { stocksService } = await import('../market/stocks/StocksService');
        const q = await stocksService.quote(signal.symbol);
        if (q?.price && q.price > 0) return q.price;
      } catch { /* ignore */ }
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
  const isPremiumSelling = (signal as any)._premiumSelling === true;
  try {
    const regime = await detectRegime();
    if (!regime.autoTraderAdjustments.allowNewEntries) {
      return { success: false, status: 'BLOCKED', symbol: signal.symbol, exchange, reason: `REGIME_BLOCK: ${regime.regime} — new entries blocked` };
    }
    if (regime.autoTraderAdjustments.longOnly && signal.bias === 'BEARISH') {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `REGIME_LONG_ONLY: ${regime.regime} requires long-only mode` };
    }
    const effectiveMinConvictionFromRegime = regime.autoTraderAdjustments.minConvictionOverride;
    // Skip regime conviction hard-block for premium-selling signals (AutonomousExecutor already applied
    // appropriate relaxed thresholds) and in dry-run mode (no real capital at risk).
    const skipConvictionBlock = isPremiumSelling || config.dryRun;
    if (!skipConvictionBlock && signal.convictionScore < effectiveMinConvictionFromRegime) {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: `REGIME_CONVICTION: ${regime.regime} requires conviction >= ${effectiveMinConvictionFromRegime}` };
    }
    if (skipConvictionBlock && signal.convictionScore < effectiveMinConvictionFromRegime) {
      console.info(`[AutoTrader] REGIME_CONVICTION soft-skip: ${signal.symbol} conviction ${signal.convictionScore} < ${effectiveMinConvictionFromRegime} (${isPremiumSelling ? 'premium-selling' : 'dry-run'})`);
    }
    regimePositionSizeMultiplier = regime.autoTraderAdjustments.positionSizeMultiplier;
  } catch {
    // regime check non-fatal
  }

  // ─── AI Adaptive Decision Gate ───────────────────────────────────────────
  {
    const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } }).catch(() => null);
    if (settings?.userId) {
      const adaptiveParams = getCachedAdaptive(settings.userId, exchange as any);
      if (adaptiveParams) {
        if (signal.convictionScore < adaptiveParams.minConvictionScore) {
          return {
            success: false, status: 'REJECTED', symbol: signal.symbol, exchange,
            reason: `AI_GATE: conviction ${signal.convictionScore} < AI-adjusted threshold ${adaptiveParams.minConvictionScore} (regime: ${adaptiveParams.regime})`,
          };
        }
        const aiSizeMult = Math.min(Math.max(regimePositionSizeMultiplier * adaptiveParams.positionSizeMultiplier, 0.1), 2.0);
        regimePositionSizeMultiplier = aiSizeMult;
      }
    }
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
  // Premium-selling strategies (Iron Condors, CSPs) benefit from overbought/range-bound
  // conditions, so EXTENDED/WAIT confirmations are not disqualifying — skip filter.
  // Last-resort fallback signals (_lastResort=true) also bypass this filter since the
  // guarantee is that at least one trade logs per active session regardless of conditions.
  const isLastResort = (signal as any)._lastResort === true;
  if (!isPremiumSelling && !isLastResort) {
    if (signal.intradayConfirmation === 'EXTENDED') {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'INTRADAY_EXTENDED — price overbought on hourly, waiting for pullback' };
    }
    if (signal.intradayConfirmation === 'WAIT') {
      return { success: false, status: 'REJECTED', symbol: signal.symbol, exchange, reason: 'INTRADAY_NOT_CONFIRMED — hourly trend contradicts daily setup' };
    }
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

  // Apply per-trade dollar amount from UserSettings (takes priority over % sizing)
  try {
    const userSettingsForSize = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
    const perTradeUsd = (userSettingsForSize as any)?.perTradeUsd as number | null | undefined;
    if (perTradeUsd && perTradeUsd > 0 && entryPrice > 0) {
      const minGuard = 25;
      const maxGuard = totalEquity * 0.25;
      const clamped  = Math.min(maxGuard, Math.max(minGuard, perTradeUsd));
      const qty      = clamped / entryPrice;
      sized = { ...sized, dollarAmount: clamped, quantity: qty, positionPct: (clamped / totalEquity) * 100 };
      console.info(`[AutoTrader] Per-trade override: ${signal.symbol} → $${clamped.toFixed(0)} (${(clamped / totalEquity * 100).toFixed(1)}% of equity)`);
    }
  } catch {
    // non-fatal
  }

  // Apply Claude's position size override if provided
  const claudeDecision = (signal as any)._claudeDecision as ClaudeTradeDecision | undefined;
  if (claudeDecision?.adjustedPositionSizePct && claudeDecision.adjustedPositionSizePct > 0) {
    const overrideDollar = totalEquity * (claudeDecision.adjustedPositionSizePct / 100);
    const overrideQty    = overrideDollar / entryPrice;
    sized = { ...sized, dollarAmount: overrideDollar, quantity: overrideQty, positionPct: claudeDecision.adjustedPositionSizePct };
    console.info(`[ClaudeBrain] ${signal.symbol} size overridden to ${claudeDecision.adjustedPositionSizePct}% ($${overrideDollar.toFixed(0)})`);
  }

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

  const isIntraday = (
    claudeDecision?.holdWindowDays === 1 ||
    ((signal as any)._premiumSelling === false &&
      (signal.setupType?.toLowerCase().includes('momentum') ||
       signal.setupType?.toLowerCase().includes('intraday') ||
       (signal.assetClass === 'crypto' && exchange === 'HYPERLIQUID')))
  );

  const holdWindowDays = claudeDecision?.holdWindowDays ?? (isIntraday ? 1 : 5);
  const holdUntil = new Date(Date.now() + holdWindowDays * 24 * 60 * 60 * 1000);

  const stopDist = entryPrice > 0 && stopLoss > 0
    ? Math.abs((entryPrice - stopLoss) / entryPrice) * 100
    : config.stopLossPct;
  const trailingStopPct = Math.max(1.5, stopDist * 0.4);

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
      holdWindowDays,
      holdUntil,
      exitCondition:  claudeDecision?.exitCondition ?? null,
      isIntraday,
      trailingStopPct,
      highWaterMark:  entryPrice,
      dollarAmount:   sized.dollarAmount,
      reason: claudeDecision
        ? `[Claude] ${claudeDecision.reasoning.slice(0, 200)}`
        : signal.reason ?? `Conviction ${signal.convictionScore} | Setup: ${signal.setupType ?? 'scan'}`,
      metadata: JSON.parse(JSON.stringify({ signal, sized, cbChecks: cb.checks, claudeDecision: claudeDecision ?? null })),
    } as any,
  });

  // Increment per-scan counter
  if (perScanTradeCount) {
    perScanTradeCount.set(exchange, (perScanTradeCount.get(exchange) ?? 0) + 1);
  }

  // ─── Phase 9b: Premium-selling mode for PAPER (Alpaca) ─────────────────
  // When regime is BEAR_CRISIS or ELEVATED_VOLATILITY and the signal is flagged
  // for premium selling, route to options analysis instead of a directional buy.
  if ((signal as any)._premiumSelling && exchange === 'PAPER') {
    try {
      const targetStrategy: string = (signal as any)._targetStrategy ?? 'IRON_CONDOR';
      console.info(`[Executor] Premium-selling signal: ${signal.symbol} → ${targetStrategy}`);

      const { getRecommendation } = await import('../options/OptionsAnalyzer');
      const fullThesis = {
        ticker: signal.symbol,
        marketStructure: { currentPrice: entryPrice },
        thesis: {
          bias:                signal.bias,
          convictionScore:     signal.convictionScore,
          suggestedHoldWindow: '2-4 WEEKS',
          invalidationZone:    { level: signal.stopLoss ?? 0, description: '' },
        },
      } as any;

      const optionsRec = await getRecommendation(
        fullThesis,
        portfolioState.totalEquity,
        portfolioState.totalEquity * (config.maxPositionPct / 100),
        true,
      ).catch(() => null);

      if (optionsRec && optionsRec.strategy !== 'NONE') {
        console.info(`[Executor] Options rec: ${optionsRec.strategy} on ${signal.symbol} | Premium: $${optionsRec.netCredit?.toFixed(2) ?? '?'}`);
        await prisma.autoTradeLog.update({
          where: { id: log.id },
          data: {
            status:   'DRY_RUN',
            reason:   `PREMIUM SELL (${optionsRec.strategy}): ${optionsRec.reasoning?.[0] ?? targetStrategy}`,
            metadata: JSON.parse(JSON.stringify({ signal, sized, optionsRecommendation: optionsRec, premiumSelling: true })),
          },
        });
        return {
          success:     true,
          status:      'DRY_RUN',
          symbol:      signal.symbol,
          exchange,
          logId:       log.id,
          quantity:    optionsRec.legs?.[0]?.contracts ?? 1,
          entryPrice,
          dollarAmount: optionsRec.maxRisk,
        };
      }
      // If no options rec available, fall through to standard stock execution
    } catch (premiumErr: any) {
      console.warn('[Phase9b] Premium-selling options error:', premiumErr?.message);
    }
  }

  // ─── Phase 9: Options execution path (TOS only) ─────────────────────────
  if (exchange === 'TOS' && exchangeKey) {
    try {
      const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
      if (settings?.userId) {
        const exCfg = await getConfig(settings.userId, 'tos');
        if (exCfg.optionsEnabled) {
          const forPremiumSelling = signal.bias !== 'BULLISH' || signal.convictionScore < 72;
          const optionsRec = await getRecommendation(
            { ticker: signal.symbol, thesis: { bias: signal.bias, convictionScore: signal.convictionScore, suggestedHoldWindow: '2-4 WEEKS', invalidationZone: { level: signal.stopLoss ?? 0, description: '' } } } as any,
            portfolioState.totalEquity,
            portfolioState.totalEquity * (exCfg.maxOptionsRiskPct / 100),
            forPremiumSelling,
          ).catch(() => null);

          if (optionsRec && optionsRec.strategy !== 'NONE' && exCfg.allowedOptionStrategies.includes(optionsRec.strategy)) {
            await prisma.autoTradeLog.update({
              where: { id: log.id },
              data: {
                metadata: JSON.parse(JSON.stringify({ signal, sized, optionsRecommendation: optionsRec })),
                reason: `OPTIONS_EXECUTING: ${optionsRec.strategy} — ${optionsRec.reasoning[0] ?? ''}`,
              },
            });

            if (!config.dryRun) {
              try {
                const { placeTOSOptionsOrder } = await import('../tos/tosExchangeService');
                const legResults = await Promise.allSettled(
                  optionsRec.legs.map(leg =>
                    placeTOSOptionsOrder({
                      symbol: leg.contract.symbol,
                      action: leg.action === 'BUY' ? 'BUY_TO_OPEN' : 'SELL_TO_OPEN',
                      quantity: leg.contracts,
                      orderType: 'NET_CREDIT',
                      price: Math.abs(optionsRec.netDebit ?? 0),
                      duration: 'DAY',
                    }),
                  ),
                );
                const anyFilled = legResults.some(r => r.status === 'fulfilled');
                if (anyFilled) {
                  await prisma.autoTradeLog.update({
                    where: { id: log.id },
                    data: { status: 'FILLED', reason: `TOS OPTIONS FILLED: ${optionsRec.strategy}` },
                  });
                  return { success: true, status: 'FILLED', symbol: signal.symbol, exchange, logId: log.id, quantity: optionsRec.legs[0]?.contracts ?? 1, entryPrice, dollarAmount: optionsRec.maxRisk };
                }
              } catch (tosOptErr: any) {
                console.warn('[Phase9] TOS options execution error:', tosOptErr?.message);
              }
            } else {
              await prisma.autoTradeLog.update({
                where: { id: log.id },
                data: { status: 'DRY_RUN', reason: `DRY_RUN TOS OPTIONS: ${optionsRec.strategy} — ${optionsRec.reasoning[0] ?? ''}` },
              });
              return { success: true, status: 'DRY_RUN', symbol: signal.symbol, exchange, logId: log.id, quantity: optionsRec.legs[0]?.contracts ?? 1, entryPrice, dollarAmount: optionsRec.maxRisk };
            }
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
  options?: { skipClaudeBrain?: boolean },
): Promise<AutoTradeResult[]> {
  if (signals.length === 0) return [];

  const settings = await prisma.userSettings.findUnique({ where: { id: userSettingsId } });
  const userId   = settings?.userId ?? '';

  // ── Claude Trading Brain ─────────────────────────────────────────────────
  let brainDecisions = new Map<string, ClaudeTradeDecision>();
  let brainFallback  = true;

  if (!options?.skipClaudeBrain && process.env.ANTHROPIC_API_KEY) {
    try {
      const brainResult = await runClaudeTradingBrain(signals, config, userId);
      brainDecisions    = brainResult.decisions;
      brainFallback     = brainResult.fallback;

      for (const [sym, d] of brainDecisions) {
        const icon = d.approved ? '✅' : '❌';
        console.info(`[ClaudeBrain] ${icon} ${sym}: ${d.reasoning.slice(0, 80)}${d.riskWarning ? ` ⚠️ ${d.riskWarning}` : ''}`);
      }
    } catch (err: any) {
      console.warn('[ClaudeBrain] Failed, proceeding with rule-based execution:', err?.message);
    }
  }

  // Enrich signals with Claude's decisions
  const sorted = [...signals].sort((a, b) => b.convictionScore - a.convictionScore);
  const enrichedSignals = sorted.map(s => {
    const decision = brainDecisions.get(s.symbol);
    if (!decision) return s;
    return {
      ...s,
      stopLoss:        decision.stopLossOverride   ?? s.stopLoss,
      takeProfit:      decision.takeProfitOverride ?? s.takeProfit,
      _claudeDecision: decision,
    } as AutoTradeSignal & { _claudeDecision: ClaudeTradeDecision };
  });

  // Filter to only Claude-approved signals (or all if fallback/no API key)
  const approvedSignals = brainDecisions.size > 0
    ? enrichedSignals.filter(s => {
        const d = brainDecisions.get(s.symbol);
        return !d || d.approved;
      })
    : enrichedSignals;

  if (approvedSignals.length === 0 && brainDecisions.size > 0) {
    console.info('[ClaudeBrain] No signals approved — skipping execution');
    return signals.map(s => ({
      success:  false,
      status:   'REJECTED' as const,
      symbol:   s.symbol,
      exchange: s.exchange ?? config.exchange,
      reason:   `Claude rejected: ${brainDecisions.get(s.symbol)?.reasoning ?? 'Not approved'}`,
    }));
  }

  // ── Execute approved signals ─────────────────────────────────────────────
  const sessionId          = `session_${Date.now()}`;
  const perScanTradeCount  = new Map<string, number>();
  const results: AutoTradeResult[] = [];

  for (const signal of approvedSignals) {
    const result = await executeAutoTrade(signal, config, userSettingsId, sessionId, perScanTradeCount);
    results.push(result);
    if (result.status === 'FILLED' || result.status === 'DRY_RUN') {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
