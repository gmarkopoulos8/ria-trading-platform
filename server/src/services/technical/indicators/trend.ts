import { OHLCVBar, TrendResult, SignalDirection, TrendStrength } from '../types';
import { calcSMA } from './sma';

function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (values[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function position(price: number, level: number | null): 'ABOVE' | 'BELOW' | 'AT' {
  if (level === null) return 'AT';
  const pct = (price - level) / level;
  if (pct > 0.002) return 'ABOVE';
  if (pct < -0.002) return 'BELOW';
  return 'AT';
}

export function computeTrend(bars: OHLCVBar[], currentPrice: number): TrendResult {
  const closes = bars.map((b) => b.close);
  const recent = closes.slice(-20);

  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma200 = calcSMA(closes, 200);

  const slope = linearSlope(recent);
  const slopeAngle = Math.round(Math.atan(slope / (currentPrice / 100)) * (180 / Math.PI) * 10) / 10;

  const priceVsSma20 = position(currentPrice, sma20);
  const priceVsSma50 = position(currentPrice, sma50);
  const priceVsSma200 = position(currentPrice, sma200);

  let bullScore = 0, bearScore = 0;
  if (priceVsSma20 === 'ABOVE') bullScore++;
  else if (priceVsSma20 === 'BELOW') bearScore++;
  if (priceVsSma50 === 'ABOVE') bullScore++;
  else if (priceVsSma50 === 'BELOW') bearScore++;
  if (priceVsSma200 === 'ABOVE') bullScore++;
  else if (priceVsSma200 === 'BELOW') bearScore++;
  if (slope > 0) bullScore++; else if (slope < 0) bearScore++;

  let direction: SignalDirection = 'NEUTRAL';
  let strength: TrendStrength = 'WEAK';

  const total = bullScore + bearScore;
  const dominantScore = Math.max(bullScore, bearScore);

  if (bullScore > bearScore) direction = 'BULLISH';
  else if (bearScore > bullScore) direction = 'BEARISH';

  if (total > 0) {
    const ratio = dominantScore / total;
    if (ratio >= 0.85) strength = 'STRONG';
    else if (ratio >= 0.65) strength = 'MODERATE';
    else strength = 'WEAK';
  }

  const smaStr = [
    sma20 ? `SMA20=$${sma20.toFixed(2)}` : null,
    sma50 ? `SMA50=$${sma50.toFixed(2)}` : null,
    sma200 ? `SMA200=$${sma200.toFixed(2)}` : null,
  ].filter(Boolean).join(', ');

  const explanation = `${strength} ${direction} trend (slope: ${slopeAngle > 0 ? '+' : ''}${slopeAngle}°). Price is ${priceVsSma20.toLowerCase()} SMA20, ${priceVsSma50.toLowerCase()} SMA50${sma200 ? `, ${priceVsSma200.toLowerCase()} SMA200` : ''}. ${smaStr}.`;

  return {
    direction,
    strength,
    priceVsSma20,
    priceVsSma50,
    priceVsSma200,
    slopeAngle,
    explanation,
  };
}
