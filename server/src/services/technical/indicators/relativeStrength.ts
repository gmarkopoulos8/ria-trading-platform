import { OHLCVBar, RelativeStrengthResult, SignalDirection } from '../types';

export function computeRelativeStrength(bars: OHLCVBar[]): RelativeStrengthResult {
  if (bars.length < 10) {
    return { value: 50, percentile: 50, signal: 'NEUTRAL', explanation: 'Insufficient data for relative strength.' };
  }

  const n = Math.min(bars.length, 252);
  const recent = bars.slice(-n);
  const firstClose = recent[0].close;
  const lastClose = recent.at(-1)!.close;
  const totalReturn = (lastClose - firstClose) / firstClose;

  const windowReturns: number[] = [];
  const step = Math.max(1, Math.floor(n / 20));
  for (let i = step; i < recent.length; i += step) {
    const r = (recent[i].close - recent[i - step].close) / recent[i - step].close;
    windowReturns.push(r);
  }

  const avgReturn = windowReturns.length > 0
    ? windowReturns.reduce((a, b) => a + b, 0) / windowReturns.length
    : 0;

  const positiveWindows = windowReturns.filter((r) => r > 0).length;
  const winRate = windowReturns.length > 0 ? positiveWindows / windowReturns.length : 0.5;
  const value = Math.min(99, Math.max(1, Math.round(winRate * 100)));
  const percentile = value;

  let signal: SignalDirection = 'NEUTRAL';
  if (value >= 65) signal = 'BULLISH';
  else if (value <= 35) signal = 'BEARISH';

  const direction = totalReturn >= 0 ? 'gained' : 'lost';
  const totalPct = Math.abs(Math.round(totalReturn * 1000) / 10);

  const explanation = `Relative strength at ${value}/100 (${percentile}th percentile). Asset has ${direction} ${totalPct}% over the analysis period with positive momentum in ${Math.round(winRate * 100)}% of windows.`;

  return { value, percentile, signal, explanation };
}
