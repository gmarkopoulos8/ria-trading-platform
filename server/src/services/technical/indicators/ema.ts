import { OHLCVBar, EMAResult, SignalDirection } from '../types';

export function calcEMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const k = 2 / (period + 1);
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeEMA(bars: OHLCVBar[], currentPrice: number): EMAResult {
  const closes = bars.map((b) => b.close);

  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const ema50 = calcEMA(closes, 50);

  let bullish = 0, bearish = 0;
  const parts: string[] = [];

  if (ema9 !== null) {
    if (currentPrice > ema9) { bullish++; parts.push(`above EMA9 ($${ema9.toFixed(2)})`); }
    else { bearish++; parts.push(`below EMA9 ($${ema9.toFixed(2)})`); }
  }
  if (ema21 !== null) {
    if (currentPrice > ema21) { bullish++; parts.push(`EMA21 ($${ema21.toFixed(2)})`); }
    else { bearish++; parts.push(`below EMA21 ($${ema21.toFixed(2)})`); }
  }
  if (ema21 && ema9 && ema9 > ema21) parts.push('EMA9 crossed above EMA21 (bullish cross)');
  if (ema21 && ema9 && ema9 < ema21) parts.push('EMA9 below EMA21 (bearish cross)');

  let signal: SignalDirection = 'NEUTRAL';
  if (bullish > bearish) signal = 'BULLISH';
  else if (bearish > bullish) signal = 'BEARISH';

  return {
    ema9,
    ema21,
    ema50,
    signal,
    explanation: `Exponential averages show price ${parts.join(', ')}.`,
  };
}
