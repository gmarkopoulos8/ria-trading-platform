import { buildUniverse, type AssetScope, type RiskMode } from './scanUniverseService';
import { runAutonomousCycle } from '../autotrader/AutonomousExecutor';
import { rankCandidates } from './dailyRankingService';
import { generateDailyReport } from './dailyMarketReportService';
import {
  createScanRun,
  markRunStarted,
  markRunCompleted,
  markRunFailed,
  persistRankedResults,
  hasDuplicateRunToday,
} from './scanPersistenceService';
import { fullUniverseScanner } from './FullUniverseScanner';
import type { FilterCriteria } from './FullUniverseScanner';
import { updateScanProgress } from './scanProgressStore';

export interface RunScanOptions {
  runType?: string;
  marketSession?: string;
  assetScope?: AssetScope;
  riskMode?: RiskMode;
  scheduledFor?: Date;
  skipDuplicateCheck?: boolean;
  fullUniverse?: boolean;
  filterCriteria?: Partial<FilterCriteria>;
}

export async function runDailyScan(opts: RunScanOptions = {}): Promise<string> {
  const {
    runType = 'MANUAL',
    marketSession = 'MARKET_OPEN',
    assetScope = 'ALL',
    riskMode = 'ALL',
    scheduledFor,
    skipDuplicateCheck = false,
    fullUniverse = false,
    filterCriteria = {},
  } = opts;

  if (!skipDuplicateCheck) {
    const isDuplicate = await hasDuplicateRunToday(runType, marketSession);
    if (isDuplicate) {
      console.log(`[DailyScan] Duplicate scan detected for ${runType}/${marketSession} today — skipping`);
      throw new Error('A scan for this session already completed today. Use force=true to override.');
    }
  }

  const scanRun = await createScanRun({ runType, marketSession, assetScope, riskMode, scheduledFor, isFullUniverseScan: fullUniverse });
  console.log(`[DailyScan] Starting scan run ${scanRun.id} (${runType}/${marketSession})`);

  await markRunStarted(scanRun.id);

  const useFullUniverse = fullUniverse && process.env.ENABLE_FULL_UNIVERSE_SCAN === 'true' && !!process.env.FINNHUB_API_KEY;

  try {
    if (useFullUniverse) {
      console.log('[DailyScan] Full universe scan mode active');

      const fullResults = await fullUniverseScanner.runFullUniverse({
        assetScope,
        riskMode,
        filterCriteria,
        maxCandidates: 200,
        maxFinalResults: 100,
        onProgress: (phase, done, total) => {
          updateScanProgress(scanRun.id, phase, done, total);
          if (done % 10 === 0 || done === total) {
            console.log(`[DailyScan] ${phase}: ${done}/${total}`);
          }
        },
      });

      console.log(`[DailyScan] Full universe ranked ${fullResults.length} results — persisting...`);
      await persistRankedResults(scanRun.id, fullResults);

      const topSymbol = fullResults[0]?.symbol;
      const avgConviction = fullResults.length > 0
        ? Math.round(fullResults.reduce((s, r) => s + r.convictionScore, 0) / fullResults.length)
        : 0;
      const summary = `Full universe scan: ${fullResults.length} results. Top: ${topSymbol ?? 'N/A'} (avg conviction: ${avgConviction})`;

      console.log('[DailyScan] Generating market report...');
      await generateDailyReport(scanRun.id, fullResults);

      await markRunCompleted(scanRun.id, {
        totalUniverseCount: fullResults.length,
        totalRankedCount: fullResults.length,
        topSymbol,
        summary,
        isFullUniverseScan: true,
        filterCriteriaJson: filterCriteria,
      });

      console.log(`[DailyScan] ✅ Full universe scan run ${scanRun.id} completed. Top: ${topSymbol}`);
      runAutonomousCycle('SCAN_COMPLETE', scanRun.id).catch((err) => {
        console.warn('[DailyScan] Post-scan autonomous cycle error:', err?.message);
      });
      return scanRun.id;

    } else {
      if (fullUniverse) {
        console.log('[DailyScan] Full universe requested but ENABLE_FULL_UNIVERSE_SCAN or FINNHUB_API_KEY not set — falling back to static universe');
      } else {
        console.log('[DailyScan] Static universe mode (set ENABLE_FULL_UNIVERSE_SCAN=true to enable full scan)');
      }

      const universe = buildUniverse(assetScope, riskMode);
      console.log(`[DailyScan] Universe: ${universe.length} candidates (scope=${assetScope}, mode=${riskMode})`);

      let progressTick = 0;
      const results = await rankCandidates(universe, 100, (done, total) => {
        progressTick++;
        if (progressTick % 5 === 0 || done === total) {
          console.log(`[DailyScan] Progress: ${done}/${total} analyzed`);
        }
      });

      console.log(`[DailyScan] Ranked ${results.length} results — persisting...`);
      await persistRankedResults(scanRun.id, results);

      const topSymbol = results[0]?.symbol;
      const avgConviction = results.length > 0
        ? Math.round(results.reduce((s, r) => s + r.convictionScore, 0) / results.length)
        : 0;
      const summary = `Ranked ${results.length} from ${universe.length} candidates. Top: ${topSymbol ?? 'N/A'} (avg conviction: ${avgConviction})`;

      console.log('[DailyScan] Generating market report...');
      await generateDailyReport(scanRun.id, results);

      await markRunCompleted(scanRun.id, {
        totalUniverseCount: universe.length,
        totalRankedCount: results.length,
        topSymbol,
        summary,
        isFullUniverseScan: false,
      });

      console.log(`[DailyScan] ✅ Scan run ${scanRun.id} completed. Top: ${topSymbol}`);
      runAutonomousCycle('SCAN_COMPLETE', scanRun.id).catch((err) => {
        console.warn('[DailyScan] Post-scan autonomous cycle error:', err?.message);
      });
      return scanRun.id;
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DailyScan] ❌ Scan run ${scanRun.id} failed:`, msg);
    await markRunFailed(scanRun.id, msg);
    throw err;
  }
}
