import { OHLCVBar, ATRResult } from '../types';

export function calcATR(bars: OHLCVBar[], period = 14): number | null {
  if (bars.length < period + 1) return null;

  const trueRanges = bars.slice(1).map((bar, i) => {
    const prev = bars[i];
    return Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - prev.close),
      Math.abs(bar.low - prev.close)
    );
  });

  let atr = trueRanges.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
  }

  return atr;
}

export function computeATR(bars: OHLCVBar[]): ATRResult {
  const atr = calcATR(bars, 14);

  if (atr === null) {
    return {
      value: null,
      valuePercent: null,
      volatility: 'MEDIUM',
      explanation: 'Insufficient data for ATR calculation.',
    };
  }

  const currentPrice = bars.at(-1)!.close;
  const valuePercent = Math.round((atr / currentPrice) * 10000) / 100;
  const rounded = Math.round(atr * 100) / 100;

  let volatility: ATRResult['volatility'] = 'MEDIUM';
  let explanation = '';

  if (valuePercent > 4) {
    volatility = 'HIGH';
    explanation = `ATR is $${rounded} (${valuePercent}% of price), indicating HIGH volatility. Wider stops are required and reward targets should be adjusted accordingly.`;
  } else if (valuePercent < 1.5) {
    volatility = 'LOW';
    explanation = `ATR is $${rounded} (${valuePercent}% of price), indicating LOW volatility. This is a tight-range environment — a volatility expansion may be approaching.`;
  } else {
    explanation = `ATR is $${rounded} (${valuePercent}% of price), indicating MODERATE volatility. Standard position sizing applies.`;
  }

  return { value: rounded, valuePercent, volatility, explanation };
}
