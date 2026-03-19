import { OHLCVBar, RelativeStrengthResult, SignalDirection } from '../types';

export function computeRelativeStrength(
  tickerBars: OHLCVBar[],
  benchmarkBars: OHLCVBar[] | null
): RelativeStrengthResult {
  if (tickerBars.length < 20) {
    return { value: 50, percentile: 50, signal: 'NEUTRAL', explanation: 'Insufficient data for relative strength.' };
  }

  if (!benchmarkBars || benchmarkBars.length < 20) {
    return computeAbsoluteMomentum(tickerBars);
  }

  const n = Math.min(tickerBars.length, benchmarkBars.length, 60);
  const tBars = tickerBars.slice(-n);
  const bBars = benchmarkBars.slice(-n);

  const tStart = tBars[0].close;
  const bStart = bBars[0].close;
  const tEnd = tBars[tBars.length - 1].close;
  const bEnd = bBars[bBars.length - 1].close;

  const tReturn = (tEnd - tStart) / tStart;
  const bReturn = (bEnd - bStart) / bStart;
  const relativeReturn = tReturn - bReturn;

  const rollingRS: number[] = [];
  for (let i = 20; i <= n; i++) {
    const tSlice = tBars.slice(i - 20, i);
    const bSlice = bBars.slice(i - 20, i);
    const tr = (tSlice[tSlice.length - 1].close - tSlice[0].close) / tSlice[0].close;
    const br = (bSlice[bSlice.length - 1].close - bSlice[0].close) / bSlice[0].close;
    rollingRS.push(tr - br);
  }

  const value = Math.min(99, Math.max(1, Math.round(50 + relativeReturn * 250)));
  const percentile = value;

  let signal: SignalDirection = 'NEUTRAL';
  if (value >= 65) signal = 'BULLISH';
  else if (value <= 35) signal = 'BEARISH';

  const recentRS = rollingRS.slice(-5);
  const olderRS = rollingRS.slice(-10, -5);
  const recentAvg = recentRS.length > 0 ? recentRS.reduce((a, b) => a + b, 0) / recentRS.length : 0;
  const olderAvg = olderRS.length > 0 ? olderRS.reduce((a, b) => a + b, 0) / olderRS.length : 0;
  const trend = recentAvg > olderAvg ? 'improving' : recentAvg < olderAvg ? 'deteriorating' : 'stable';

  const direction = relativeReturn >= 0 ? 'outperforming' : 'underperforming';
  const pct = Math.round(Math.abs(relativeReturn) * 1000) / 10;

  const explanation = `Relative strength ${value}/100 — ${direction} benchmark by ${pct}% over ${n} bars. RS trend is ${trend}.`;

  return { value, percentile, signal, explanation };
}

function computeAbsoluteMomentum(bars: OHLCVBar[]): RelativeStrengthResult {
  const n = Math.min(bars.length, 60);
  const recent = bars.slice(-n);
  const step = Math.max(1, Math.floor(n / 20));
  const windowReturns: number[] = [];
  for (let i = step; i < recent.length; i += step) {
    windowReturns.push((recent[i].close - recent[i - step].close) / recent[i - step].close);
  }
  const positiveWindows = windowReturns.filter((r) => r > 0).length;
  const winRate = windowReturns.length > 0 ? positiveWindows / windowReturns.length : 0.5;
  const value = Math.min(99, Math.max(1, Math.round(winRate * 100)));
  let signal: SignalDirection = 'NEUTRAL';
  if (value >= 65) signal = 'BULLISH';
  else if (value <= 35) signal = 'BEARISH';
  return {
    value, percentile: value, signal,
    explanation: `Absolute momentum ${value}/100 (no benchmark available). Positive in ${Math.round(winRate * 100)}% of windows.`,
  };
}
