import { OHLCVBar, MACDResult, SignalDirection } from '../types';
import { calcEMA } from './ema';

export function computeMACD(bars: OHLCVBar[]): MACDResult {
  if (bars.length < 26) {
    return {
      macdLine: null,
      signalLine: null,
      histogram: null,
      signal: 'NEUTRAL',
      explanation: 'Insufficient data to compute MACD (need ≥26 bars).',
    };
  }

  const closes = bars.map((b) => b.close);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);

  if (ema12 === null || ema26 === null) {
    return { macdLine: null, signalLine: null, histogram: null, signal: 'NEUTRAL', explanation: 'Unable to compute EMA for MACD.' };
  }

  const macdLine = ema12 - ema26;

  const macdSeries: number[] = [];
  const k12 = 2 / 13, k26 = 2 / 27;
  let e12 = closes.slice(0, 12).reduce((a, b) => a + b, 0) / 12;
  let e26 = closes.slice(0, 26).reduce((a, b) => a + b, 0) / 26;
  for (let i = 12; i < closes.length; i++) {
    e12 = closes[i] * k12 + e12 * (1 - k12);
    if (i >= 26) {
      e26 = closes[i] * k26 + e26 * (1 - k26);
      macdSeries.push(e12 - e26);
    }
  }

  const signalLine = macdSeries.length >= 9
    ? calcEMA(macdSeries, 9)
    : null;

  const histogram = signalLine !== null ? macdLine - signalLine : null;

  let signal: SignalDirection = 'NEUTRAL';
  let explanation = '';

  const r2 = (n: number) => Math.round(n * 100) / 100;

  if (histogram !== null) {
    if (macdLine > 0 && histogram > 0) {
      signal = 'BULLISH';
      explanation = `MACD line (${r2(macdLine)}) is above zero and histogram (${r2(histogram)}) is positive — bullish momentum is building.`;
    } else if (macdLine < 0 && histogram < 0) {
      signal = 'BEARISH';
      explanation = `MACD line (${r2(macdLine)}) is below zero and histogram (${r2(histogram)}) is negative — bearish momentum is building.`;
    } else if (macdLine > 0 && histogram < 0) {
      signal = 'BEARISH';
      explanation = `MACD line (${r2(macdLine)}) is above zero but histogram is contracting (${r2(histogram)}) — bullish momentum may be fading.`;
    } else if (macdLine < 0 && histogram > 0) {
      signal = 'BULLISH';
      explanation = `MACD line (${r2(macdLine)}) is below zero but histogram is expanding (${r2(histogram)}) — bearish momentum may be weakening.`;
    } else {
      explanation = `MACD near zero — no clear directional bias.`;
    }
  } else if (signalLine === null) {
    explanation = `MACD line at ${r2(macdLine)}, signal line forming (need more data).`;
    signal = macdLine > 0 ? 'BULLISH' : 'BEARISH';
  }

  return {
    macdLine: Math.round(macdLine * 10000) / 10000,
    signalLine: signalLine !== null ? Math.round(signalLine * 10000) / 10000 : null,
    histogram: histogram !== null ? Math.round(histogram * 10000) / 10000 : null,
    signal,
    explanation,
  };
}
