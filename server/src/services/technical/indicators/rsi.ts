import { OHLCVBar, RSIResult, SignalDirection } from '../types';

export function calcRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;

  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (deltas[i] > 0) avgGain += deltas[i];
    else avgLoss += Math.abs(deltas[i]);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < deltas.length; i++) {
    const gain = deltas[i] > 0 ? deltas[i] : 0;
    const loss = deltas[i] < 0 ? Math.abs(deltas[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function computeRSI(bars: OHLCVBar[]): RSIResult {
  const closes = bars.map((b) => b.close);
  const rsi = calcRSI(closes);
  const rounded = rsi !== null ? Math.round(rsi * 10) / 10 : null;

  let signal: SignalDirection = 'NEUTRAL';
  let zone: RSIResult['zone'] = 'NEUTRAL';
  let explanation = 'Insufficient data to compute RSI.';

  if (rounded !== null) {
    if (rounded >= 70) {
      signal = 'BEARISH';
      zone = 'OVERBOUGHT';
      explanation = `RSI at ${rounded} is overbought (≥70). Price may be extended and due for a pullback or consolidation.`;
    } else if (rounded <= 30) {
      signal = 'BULLISH';
      zone = 'OVERSOLD';
      explanation = `RSI at ${rounded} is oversold (≤30). Selling may be exhausted and a bounce or reversal could be near.`;
    } else if (rounded >= 55) {
      signal = 'BULLISH';
      explanation = `RSI at ${rounded} is in bullish territory (55–70), indicating sustained buying pressure without being overbought.`;
    } else if (rounded <= 45) {
      signal = 'BEARISH';
      explanation = `RSI at ${rounded} is in bearish territory (30–45), indicating sustained selling pressure.`;
    } else {
      explanation = `RSI at ${rounded} is neutral (45–55), showing no strong directional bias.`;
    }
  }

  return { value: rounded, signal, zone, explanation };
}
