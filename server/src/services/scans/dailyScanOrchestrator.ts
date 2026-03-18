import { buildUniverse, type AssetScope, type RiskMode } from './scanUniverseService';
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

export interface RunScanOptions {
  runType?: string;
  marketSession?: string;
  assetScope?: AssetScope;
  riskMode?: RiskMode;
  scheduledFor?: Date;
  skipDuplicateCheck?: boolean;
}

export async function runDailyScan(opts: RunScanOptions = {}): Promise<string> {
  const {
    runType = 'MANUAL',
    marketSession = 'MARKET_OPEN',
    assetScope = 'ALL',
    riskMode = 'ALL',
    scheduledFor,
    skipDuplicateCheck = false,
  } = opts;

  if (!skipDuplicateCheck) {
    const isDuplicate = await hasDuplicateRunToday(runType, marketSession);
    if (isDuplicate) {
      console.log(`[DailyScan] Duplicate scan detected for ${runType}/${marketSession} today — skipping`);
      throw new Error('A scan for this session already completed today. Use force=true to override.');
    }
  }

  const scanRun = await createScanRun({ runType, marketSession, assetScope, riskMode, scheduledFor });
  console.log(`[DailyScan] Starting scan run ${scanRun.id} (${runType}/${marketSession})`);

  await markRunStarted(scanRun.id);

  try {
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

    console.log(`[DailyScan] Generating market report...`);
    await generateDailyReport(scanRun.id, results);

    await markRunCompleted(scanRun.id, {
      totalUniverseCount: universe.length,
      totalRankedCount: results.length,
      topSymbol,
      summary,
    });

    console.log(`[DailyScan] ✅ Scan run ${scanRun.id} completed. Top: ${topSymbol}`);
    return scanRun.id;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[DailyScan] ❌ Scan run ${scanRun.id} failed:`, msg);
    await markRunFailed(scanRun.id, msg);
    throw err;
  }
}
