import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { runDailyScan } from '../services/scans/dailyScanOrchestrator';
import { prisma } from '../lib/prisma';
import {
  listScanRuns,
  getRunById,
  getRunResults,
  getLatestCompletedRun,
  getSymbolRankingHistory,
  createScanRun,
  markRunStarted,
  hasDuplicateRunToday,
} from '../services/scans/scanPersistenceService';
import {
  getSchedulerStatus,
  setSchedulerEnabled,
} from '../services/scans/dailyScanScheduler';
import { getScanProgress } from '../services/scans/scanProgressStore';

const router = Router();
router.use(requireAuth);

router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const {
      runType       = 'MANUAL',
      marketSession = 'MARKET_OPEN',
      assetScope    = 'ALL',
      riskMode      = 'ALL',
      force         = false,
      fullUniverse  = false,
      filterCriteria = {},
    } = req.body ?? {};

    if (!(force === true || force === 'true')) {
      const isDuplicate = await hasDuplicateRunToday(runType, marketSession);
      if (isDuplicate) {
        // Return existing completed run ID so the auto trader can use it
        const existing = await getLatestCompletedRun();
        if (existing) {
          return res.json({ success: true, data: { scanRunId: existing.id, alreadyCompleted: true } });
        }
        return res.status(400).json({ success: false, error: 'A scan already ran today. Use force=true to re-run.' });
      }
    }

    const scanRun = await createScanRun({ runType, marketSession, assetScope, riskMode, isFullUniverseScan: fullUniverse });
    await markRunStarted(scanRun.id);

    // Respond immediately with the scan ID — scan runs in the background
    res.json({ success: true, data: { scanRunId: scanRun.id } });

    runDailyScan({
      runType,
      marketSession,
      assetScope,
      riskMode,
      skipDuplicateCheck: true,
      fullUniverse,
      filterCriteria,
      existingScanRunId: scanRun.id,
    }).catch((err) => {
      console.error('[Trigger] Background scan failed:', err?.message);
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Scan trigger failed';
    res.status(400).json({ success: false, error: message });
  }
});

router.get('/runs/:id/progress', requireAuth, (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    const progress = getScanProgress(req.params.id);
    if (progress) {
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    }
  };

  send();
  const interval = setInterval(send, 2000);
  req.on('close', () => clearInterval(interval));
});

router.get('/latest', async (req: Request, res: Response) => {
  try {
    const run = await getLatestCompletedRun();
    res.json({ success: true, data: { run } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch latest run' });
  }
});

router.get('/runs', async (req: Request, res: Response) => {
  try {
    const { page, limit, status, runType } = req.query as Record<string, string>;
    const result = await listScanRuns({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      status: status || undefined,
      runType: runType || undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to list scan runs' });
  }
});

router.get('/runs/:id', async (req: Request, res: Response) => {
  try {
    const run = await getRunById(req.params.id);
    if (!run) return res.status(404).json({ success: false, error: 'Scan run not found' });
    res.json({ success: true, data: { run } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch scan run' });
  }
});

router.get('/runs/:id/results', async (req: Request, res: Response) => {
  try {
    const { page, limit, assetClass, bias, action } = req.query as Record<string, string>;
    const result = await getRunResults(req.params.id, {
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 100,
      assetClass: assetClass || undefined,
      bias: bias || undefined,
      action: action || undefined,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch scan results' });
  }
});

router.get('/history/:symbol', async (req: Request, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt((req.query.days as string) ?? '30', 10);
    const history = await getSymbolRankingHistory(symbol, days);
    res.json({ success: true, data: { symbol, history } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch symbol history' });
  }
});

router.get('/scheduler/status', async (req: Request, res: Response) => {
  try {
    const status = getSchedulerStatus();
    res.json({ success: true, data: { scheduler: status } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to get scheduler status' });
  }
});

router.post('/scheduler/toggle', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: '"enabled" must be a boolean' });
    }
    setSchedulerEnabled(enabled);
    const status = getSchedulerStatus();
    res.json({ success: true, data: { scheduler: status } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to toggle scheduler' });
  }
});

// Reset any stuck RUNNING scans to FAILED (manual emergency fix)
router.post('/reset-stuck', async (req: Request, res: Response) => {
  try {
    const result = await prisma.dailyScanRun.updateMany({
      where: { status: 'RUNNING' },
      data:  { status: 'FAILED', errorMessage: 'Manually reset via API' },
    });
    res.json({ success: true, data: { reset: result.count, message: `Reset ${result.count} stuck scan(s)` } });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : 'Reset failed' });
  }
});

export default router;
