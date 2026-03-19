export interface ScanProgressState {
  phase: string;
  done: number;
  total: number;
  log: string[];
}

const scanProgress = new Map<string, ScanProgressState>();

export function updateScanProgress(
  scanRunId: string,
  phase: string,
  done: number,
  total: number,
  logMsg?: string,
): void {
  const existing = scanProgress.get(scanRunId) ?? { phase, done, total, log: [] };
  existing.phase = phase;
  existing.done = done;
  existing.total = total;
  if (logMsg) existing.log = [...existing.log.slice(-20), logMsg];
  scanProgress.set(scanRunId, existing);
}

export function getScanProgress(scanRunId: string): ScanProgressState | undefined {
  return scanProgress.get(scanRunId);
}

export function clearScanProgress(scanRunId: string): void {
  scanProgress.delete(scanRunId);
}
