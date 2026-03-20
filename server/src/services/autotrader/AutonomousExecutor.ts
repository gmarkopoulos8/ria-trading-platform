import { prisma } from '../../lib/prisma';
import { buildSignalsFromLatestScan } from '../scans/dynamicUniverseService';
import { runTradingCycle, type AutoTradeConfig, DEFAULT_AUTO_TRADE_CONFIG } from './AutoTradeExecutor';
import { computeAdaptive, getCachedAdaptive, registerForAdaptation, DEFAULT_BOUNDS } from './UniversalAdaptiveEngine';
import { hasAlpacaCredentials, getAlpacaCredentials } from '../alpaca/alpacaConfig';
import telegramService from '../notifications/TelegramService';

export interface AutonomousRunResult {
  userId:              string;
  scanRunId?:          string;
  signalsFound:        number;
  tradesPlaced:        number;
  tradesRejected:      number;
  dryRun:              boolean;
  adaptiveRegime:      string;
  effectiveConviction: number;
  errors:              string[];
  ranAt:               Date;
}

export async function runAutonomousCycle(
  trigger: 'MARKET_OPEN' | 'SCAN_COMPLETE' | 'REENTRY' | 'MANUAL',
  scanRunId?: string,
): Promise<AutonomousRunResult[]> {
  const results: AutonomousRunResult[] = [];

  const users = await prisma.userSettings.findMany({
    where: { autonomousMode: true, autoTradeEnabled: true },
  });

  if (users.length === 0) {
    console.info('[Autonomous] No users with autonomous mode enabled — skipping');
    return results;
  }

  for (const settings of users) {
    const result: AutonomousRunResult = {
      userId:              settings.userId,
      scanRunId,
      signalsFound:        0,
      tradesPlaced:        0,
      tradesRejected:      0,
      dryRun:              true,
      adaptiveRegime:      'UNKNOWN',
      effectiveConviction: (settings as any).autonomousMinConviction ?? 75,
      errors:              [],
      ranAt:               new Date(),
    };

    try {
      if (!hasAlpacaCredentials()) {
        result.errors.push('Alpaca not connected — skipping autonomous cycle');
        results.push(result);
        continue;
      }

      const creds = getAlpacaCredentials();
      result.dryRun = creds?.dryRun ?? true;

      const rawConfig = typeof settings.autoTradeConfig === 'object' && settings.autoTradeConfig !== null
        ? (settings.autoTradeConfig as Partial<AutoTradeConfig>)
        : {};

      const baseConfig: AutoTradeConfig = {
        ...DEFAULT_AUTO_TRADE_CONFIG,
        ...rawConfig,
        enabled:            true,
        exchange:           'PAPER',
        dryRun:             result.dryRun,
        maxOpenPositions:   (settings as any).autonomousMaxPositions ?? 3,
        maxPositionPct:     (settings as any).autonomousCapitalPct ?? 5.0,
        minConvictionScore: (settings as any).autonomousMinConviction ?? 75,
      };

      let adaptiveParams = getCachedAdaptive(settings.userId, 'PAPER');
      if (!adaptiveParams) {
        adaptiveParams = await computeAdaptive(
          settings.userId,
          'PAPER',
          {
            stopLossPct:        baseConfig.stopLossPct,
            takeProfitPct:      baseConfig.takeProfitPct,
            minConvictionScore: baseConfig.minConvictionScore,
          },
          DEFAULT_BOUNDS['PAPER'],
        ).catch(() => null);

        if (adaptiveParams) {
          registerForAdaptation(settings.userId, 'PAPER', {
            stopLossPct:        baseConfig.stopLossPct,
            takeProfitPct:      baseConfig.takeProfitPct,
            minConvictionScore: baseConfig.minConvictionScore,
          });
        }
      }

      result.adaptiveRegime = adaptiveParams?.regime ?? 'UNKNOWN';

      const effectiveConviction = adaptiveParams
        ? Math.max(baseConfig.minConvictionScore, adaptiveParams.minConvictionScore)
        : baseConfig.minConvictionScore;

      result.effectiveConviction = effectiveConviction;

      if (adaptiveParams) {
        if (adaptiveParams.stopLossPct < baseConfig.stopLossPct) {
          baseConfig.stopLossPct = adaptiveParams.stopLossPct;
        }
        if (adaptiveParams.takeProfitPct > baseConfig.takeProfitPct) {
          baseConfig.takeProfitPct = adaptiveParams.takeProfitPct;
        }
      }

      const rawSignals = await buildSignalsFromLatestScan({
        minConvictionScore: effectiveConviction,
        minConfidenceScore: 60,
        allowedBiases:      ['BULLISH'],
        maxSymbols:         ((settings as any).autonomousMaxPositions ?? 3) * 5,
      });

      const signals = [...rawSignals]
        .sort((a: any, b: any) => {
          const aScore = (a.thesisHealthScore ?? 0) * 0.4 + (a.convictionScore ?? 0) * 0.4 + (a.confidenceScore ?? 0) * 0.2;
          const bScore = (b.thesisHealthScore ?? 0) * 0.4 + (b.convictionScore ?? 0) * 0.4 + (b.confidenceScore ?? 0) * 0.2;
          return bScore - aScore;
        })
        .slice(0, (settings as any).autonomousMaxPositions ?? 3)
        .map((s: any) => ({ ...s, exchange: 'PAPER' as const }));

      result.signalsFound = signals.length;

      if (signals.length === 0) {
        console.info(`[Autonomous] No qualifying signals for ${settings.userId} (conviction >= ${effectiveConviction}, regime: ${result.adaptiveRegime})`);
        results.push(result);
        continue;
      }

      const cycleResults = await runTradingCycle(settings.id, baseConfig, signals);

      result.tradesPlaced   = cycleResults.filter(r => ['FILLED', 'DRY_RUN'].includes(r.status)).length;
      result.tradesRejected = cycleResults.filter(r => !['FILLED', 'DRY_RUN'].includes(r.status)).length;

      await prisma.userSettings.update({
        where: { id: settings.id },
        data:  { lastAutonomousRun: new Date() },
      });

      if (result.tradesPlaced > 0) {
        const placed   = cycleResults.filter(r => ['FILLED', 'DRY_RUN'].includes(r.status));
        const topTrade = placed[0];
        await telegramService.notify({
          type:     'TRADE_PLACED',
          exchange: 'hyperliquid',
          ticker:   topTrade?.symbol,
          data: {
            ticker:     placed.map(r => r.symbol).join(', '),
            side:       'LONG',
            quantity:   placed.length,
            entryPrice: topTrade?.entryPrice?.toFixed(2) ?? '?',
            stop:       'adaptive',
            target:     'adaptive',
            conviction: result.effectiveConviction,
            rr:         (baseConfig.takeProfitPct / baseConfig.stopLossPct).toFixed(1),
            dryRun:     result.dryRun,
            regime:     result.adaptiveRegime,
            trigger,
          },
        }).catch(() => { /* Telegram non-fatal */ });
      }

      console.info(`[Autonomous] ${trigger} cycle for ${settings.userId}: ${result.tradesPlaced} placed, ${result.tradesRejected} rejected, regime: ${result.adaptiveRegime}`);

    } catch (err: any) {
      result.errors.push(err?.message ?? 'Unknown error');
      console.error('[Autonomous] Cycle error:', err?.message);
    }

    results.push(result);
  }

  return results;
}
