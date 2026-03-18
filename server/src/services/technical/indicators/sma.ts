import { OHLCVBar, SMAResult, SignalDirection } from '../types';

export function calcSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function computeSMA(bars: OHLCVBar[], currentPrice: number): SMAResult {
  const closes = bars.map((b) => b.close);

  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);

  let signal: SignalDirection = 'NEUTRAL';
  let bullishCount = 0;
  let bearishCount = 0;
  const explanationParts: string[] = [];

  if (sma20 !== null) {
    if (currentPrice > sma20) { bullishCount++; explanationParts.push(`price above SMA20 ($${sma20.toFixed(2)})`); }
    else { bearishCount++; explanationParts.push(`price below SMA20 ($${sma20.toFixed(2)})`); }
  }
  if (sma50 !== null) {
    if (currentPrice > sma50) { bullishCount++; explanationParts.push(`above SMA50 ($${sma50.toFixed(2)})`); }
    else { bearishCount++; explanationParts.push(`below SMA50 ($${sma50.toFixed(2)})`); }
  }
  if (sma200 !== null) {
    if (currentPrice > sma200) { bullishCount++; explanationParts.push(`above SMA200 ($${sma200.toFixed(2)})`); }
    else { bearishCount++; explanationParts.push(`below SMA200 ($${sma200.toFixed(2)})`); }
  }

  if (bullishCount > bearishCount) signal = 'BULLISH';
  else if (bearishCount > bullishCount) signal = 'BEARISH';

  const stacked = sma20 && sma50 && sma200 && sma20 > sma50 && sma50 > sma200;
  const bearStacked = sma20 && sma50 && sma200 && sma20 < sma50 && sma50 < sma200;
  let extra = '';
  if (stacked) extra = ' — moving averages are bullishly stacked (20 > 50 > 200).';
  if (bearStacked) extra = ' — moving averages are bearishly stacked (20 < 50 < 200).';

  return {
    sma20,
    sma50,
    sma200,
    signal,
    explanation: `Price is ${explanationParts.join(', ')}${extra}`,
  };
}
