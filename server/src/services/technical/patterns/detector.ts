import { OHLCVBar, PatternResult, PatternType, SignalDirection } from '../types';

function round2(n: number) { return Math.round(n * 100) / 100; }
function pct(a: number, b: number) { return Math.abs((a - b) / b); }

function localMaxima(bars: OHLCVBar[], w = 5): Array<{ idx: number; price: number }> {
  const results: Array<{ idx: number; price: number }> = [];
  for (let i = w; i < bars.length - w; i++) {
    const price = bars[i].high;
    let isPeak = true;
    for (let j = 1; j <= w; j++) {
      if (bars[i - j].high >= price || bars[i + j].high >= price) { isPeak = false; break; }
    }
    if (isPeak) results.push({ idx: i, price });
  }
  return results;
}

function localMinima(bars: OHLCVBar[], w = 5): Array<{ idx: number; price: number }> {
  const results: Array<{ idx: number; price: number }> = [];
  for (let i = w; i < bars.length - w; i++) {
    const price = bars[i].low;
    let isTrough = true;
    for (let j = 1; j <= w; j++) {
      if (bars[i - j].low <= price || bars[i + j].low <= price) { isTrough = false; break; }
    }
    if (isTrough) results.push({ idx: i, price });
  }
  return results;
}

function makePattern(
  type: PatternType,
  direction: SignalDirection,
  confidence: number,
  priceTarget: number | null,
  stopLoss: number | null,
  description: string,
  explanation: string,
  bars: OHLCVBar[],
  startIdx?: number,
  endIdx?: number
): PatternResult {
  return {
    type,
    direction,
    confidence: Math.min(1, Math.max(0, Math.round(confidence * 100) / 100)),
    priceTarget: priceTarget !== null ? round2(priceTarget) : null,
    stopLoss: stopLoss !== null ? round2(stopLoss) : null,
    description,
    explanation,
    startDate: startIdx !== undefined ? bars[startIdx]?.timestamp ?? null : null,
    endDate: endIdx !== undefined ? bars[endIdx]?.timestamp ?? null : null,
  };
}

export function detectDoubleTop(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const peaks = localMaxima(bars, 4).slice(-4);
  if (peaks.length < 2) return null;
  const [p1, p2] = peaks.slice(-2);
  if (pct(p1.price, p2.price) > 0.03) return null;
  const currentPrice = bars.at(-1)!.close;
  if (currentPrice >= p2.price * 0.98) return null;
  const neckline = Math.min(...bars.slice(p1.idx, p2.idx).map((b) => b.low));
  const target = neckline - (p2.price - neckline);
  const confidence = 0.65 - pct(p1.price, p2.price) * 5;
  return makePattern(
    'DOUBLE_TOP', 'BEARISH', confidence,
    target, p2.price * 1.02,
    'Double Top',
    `Two peaks near $${round2(p1.price)} and $${round2(p2.price)} with neckline at $${round2(neckline)}. Pattern projects a move to $${round2(target)}.`,
    bars, p1.idx, p2.idx
  );
}

export function detectDoubleBottom(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const troughs = localMinima(bars, 4).slice(-4);
  if (troughs.length < 2) return null;
  const [t1, t2] = troughs.slice(-2);
  if (pct(t1.price, t2.price) > 0.03) return null;
  const currentPrice = bars.at(-1)!.close;
  if (currentPrice <= t2.price * 1.02) return null;
  const neckline = Math.max(...bars.slice(t1.idx, t2.idx).map((b) => b.high));
  const target = neckline + (neckline - t2.price);
  const confidence = 0.65 - pct(t1.price, t2.price) * 5;
  return makePattern(
    'DOUBLE_BOTTOM', 'BULLISH', confidence,
    target, t2.price * 0.98,
    'Double Bottom',
    `Two troughs near $${round2(t1.price)} and $${round2(t2.price)} with neckline at $${round2(neckline)}. Pattern projects a move to $${round2(target)}.`,
    bars, t1.idx, t2.idx
  );
}

export function detectHeadAndShoulders(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 30) return null;
  const peaks = localMaxima(bars, 4).slice(-5);
  if (peaks.length < 3) return null;
  const [left, head, right] = peaks.slice(-3);
  if (head.price <= left.price || head.price <= right.price) return null;
  if (pct(left.price, right.price) > 0.06) return null;
  const neckline = (bars[left.idx].low + bars[right.idx].low) / 2;
  const target = neckline - (head.price - neckline);
  const confidence = 0.7 - pct(left.price, right.price) * 3;
  return makePattern(
    'HEAD_AND_SHOULDERS', 'BEARISH', confidence,
    target, head.price,
    'Head and Shoulders',
    `Left shoulder $${round2(left.price)}, head $${round2(head.price)}, right shoulder $${round2(right.price)}, neckline ~$${round2(neckline)}. Bearish reversal targets $${round2(target)}.`,
    bars, left.idx, right.idx
  );
}

export function detectInverseHnS(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 30) return null;
  const troughs = localMinima(bars, 4).slice(-5);
  if (troughs.length < 3) return null;
  const [left, head, right] = troughs.slice(-3);
  if (head.price >= left.price || head.price >= right.price) return null;
  if (pct(left.price, right.price) > 0.06) return null;
  const neckline = (bars[left.idx].high + bars[right.idx].high) / 2;
  const target = neckline + (neckline - head.price);
  const confidence = 0.7 - pct(left.price, right.price) * 3;
  return makePattern(
    'INVERSE_HEAD_AND_SHOULDERS', 'BULLISH', confidence,
    target, head.price,
    'Inverse Head and Shoulders',
    `Left shoulder $${round2(left.price)}, head $${round2(head.price)}, right shoulder $${round2(right.price)}, neckline ~$${round2(neckline)}. Bullish reversal targets $${round2(target)}.`,
    bars, left.idx, right.idx
  );
}

export function detectAscendingTriangle(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-25);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);
  const resistance = Math.max(...highs);
  const flatTest = highs.filter((h) => Math.abs(h - resistance) / resistance < 0.015).length;
  if (flatTest < 3) return null;
  const firstLow = lows[0], lastLow = lows[lows.length - 1];
  if (lastLow <= firstLow) return null;
  const target = resistance + (resistance - firstLow);
  return makePattern(
    'ASCENDING_TRIANGLE', 'BULLISH', 0.6,
    target, lastLow * 0.98,
    'Ascending Triangle',
    `Flat resistance at $${round2(resistance)} with rising lows (${round2(firstLow)} → ${round2(lastLow)}). Breakout above $${round2(resistance)} targets $${round2(target)}.`,
    bars, recent.length > 0 ? bars.length - 25 : 0, bars.length - 1
  );
}

export function detectDescendingTriangle(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-25);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);
  const support = Math.min(...lows);
  const flatTest = lows.filter((l) => Math.abs(l - support) / support < 0.015).length;
  if (flatTest < 3) return null;
  const firstHigh = highs[0], lastHigh = highs[highs.length - 1];
  if (lastHigh >= firstHigh) return null;
  const target = support - (firstHigh - support);
  return makePattern(
    'DESCENDING_TRIANGLE', 'BEARISH', 0.6,
    target, lastHigh * 1.02,
    'Descending Triangle',
    `Flat support at $${round2(support)} with declining highs (${round2(firstHigh)} → ${round2(lastHigh)}). Breakdown below $${round2(support)} targets $${round2(target)}.`,
    bars, bars.length - 25, bars.length - 1
  );
}

export function detectSymmetricalTriangle(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const recent = bars.slice(-20);
  const highs = recent.map((b) => b.high);
  const lows = recent.map((b) => b.low);
  const highsDescending = highs[highs.length - 1] < highs[0];
  const lowsAscending = lows[lows.length - 1] > lows[0];
  if (!highsDescending || !lowsAscending) return null;
  const apex = (highs.at(-1)! + lows.at(-1)!) / 2;
  const direction: SignalDirection = 'NEUTRAL';
  return makePattern(
    'SYMMETRICAL_TRIANGLE', direction, 0.5,
    null, null,
    'Symmetrical Triangle',
    `Converging highs (${round2(highs[0])} → ${round2(highs.at(-1)!)}) and rising lows (${round2(lows[0])} → ${round2(lows.at(-1)!)}) coiling near $${round2(apex)}. Watch for breakout direction.`,
    bars, bars.length - 20, bars.length - 1
  );
}

export function detectBullFlag(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const poleEnd = bars.length - 8;
  const pole = bars.slice(Math.max(0, poleEnd - 10), poleEnd);
  const flag = bars.slice(poleEnd);
  if (pole.length < 5 || flag.length < 4) return null;

  const poleMove = (pole.at(-1)!.close - pole[0].close) / pole[0].close;
  if (poleMove < 0.08) return null;

  const flagHigh = Math.max(...flag.map((b) => b.high));
  const flagLow = Math.min(...flag.map((b) => b.low));
  const flagSlope = (flag.at(-1)!.close - flag[0].close) / flag[0].close;
  if (flagSlope > 0.01) return null;

  const currentPrice = bars.at(-1)!.close;
  const target = flagHigh + (pole.at(-1)!.close - pole[0].close);
  return makePattern(
    'BULL_FLAG', 'BULLISH', 0.62,
    target, flagLow * 0.98,
    'Bull Flag',
    `Strong ${Math.round(poleMove * 100)}% pole followed by tight consolidation (${round2(flagLow)}–${round2(flagHigh)}). Breakout above $${round2(flagHigh)} targets $${round2(target)}.`,
    bars, Math.max(0, poleEnd - 10), bars.length - 1
  );
}

export function detectBearFlag(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const poleEnd = bars.length - 8;
  const pole = bars.slice(Math.max(0, poleEnd - 10), poleEnd);
  const flag = bars.slice(poleEnd);
  if (pole.length < 5 || flag.length < 4) return null;

  const poleMove = (pole.at(-1)!.close - pole[0].close) / pole[0].close;
  if (poleMove > -0.08) return null;

  const flagHigh = Math.max(...flag.map((b) => b.high));
  const flagLow = Math.min(...flag.map((b) => b.low));
  const flagSlope = (flag.at(-1)!.close - flag[0].close) / flag[0].close;
  if (flagSlope < -0.01) return null;

  const target = flagLow - (pole[0].close - pole.at(-1)!.close);
  return makePattern(
    'BEAR_FLAG', 'BEARISH', 0.62,
    target, flagHigh * 1.02,
    'Bear Flag',
    `Strong ${Math.round(Math.abs(poleMove) * 100)}% drop followed by a weak consolidation (${round2(flagLow)}–${round2(flagHigh)}). Breakdown below $${round2(flagLow)} targets $${round2(target)}.`,
    bars, Math.max(0, poleEnd - 10), bars.length - 1
  );
}

export function detectCupAndHandle(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 40) return null;
  const cup = bars.slice(-40, -10);
  const handle = bars.slice(-10);
  const cupHigh = Math.max(cup[0].high, cup.at(-1)!.high);
  const cupLow = Math.min(...cup.map((b) => b.low));
  const depth = (cupHigh - cupLow) / cupHigh;
  if (depth < 0.1 || depth > 0.5) return null;
  const handleLow = Math.min(...handle.map((b) => b.low));
  if (handleLow < cupLow) return null;
  const target = cupHigh + (cupHigh - cupLow);
  return makePattern(
    'CUP_AND_HANDLE', 'BULLISH', 0.58,
    target, handleLow * 0.98,
    'Cup and Handle',
    `U-shaped cup (${Math.round(depth * 100)}% depth) with a tight handle. Breakout above $${round2(cupHigh)} targets $${round2(target)}.`,
    bars, bars.length - 40, bars.length - 1
  );
}

export function detectRangeBreakout(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const range = bars.slice(-21, -1);
  const currentBar = bars.at(-1)!;
  const rangeHigh = Math.max(...range.map((b) => b.high));
  const rangeLow = Math.min(...range.map((b) => b.low));
  const currentPrice = currentBar.close;

  if (currentPrice > rangeHigh * 1.005) {
    const target = rangeHigh + (rangeHigh - rangeLow);
    return makePattern(
      'RANGE_BREAKOUT', 'BULLISH', 0.6,
      target, rangeHigh * 0.99,
      'Range Breakout',
      `Price broke above 20-bar range resistance at $${round2(rangeHigh)} (range: ${round2(rangeLow)}–${round2(rangeHigh)}). Target: $${round2(target)}.`,
      bars, bars.length - 21, bars.length - 1
    );
  }

  if (currentPrice < rangeLow * 0.995) {
    const target = rangeLow - (rangeHigh - rangeLow);
    return makePattern(
      'RANGE_BREAKOUT', 'BEARISH', 0.6,
      target, rangeLow * 1.01,
      'Range Breakdown',
      `Price broke below 20-bar range support at $${round2(rangeLow)}. Target: $${round2(target)}.`,
      bars, bars.length - 21, bars.length - 1
    );
  }
  return null;
}

export function detectMomentumContinuation(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 15) return null;
  const recent = bars.slice(-15);
  const moves = recent.slice(1).map((b, i) => (b.close - recent[i].close) / recent[i].close);
  const positives = moves.filter((m) => m > 0).length;
  const pctPos = positives / moves.length;
  if (pctPos < 0.65 && pctPos > 0.35) return null;
  const isBullish = pctPos >= 0.65;
  const totalMove = (recent.at(-1)!.close - recent[0].close) / recent[0].close;
  const target = bars.at(-1)!.close * (1 + totalMove * 0.5);
  return makePattern(
    'MOMENTUM_CONTINUATION', isBullish ? 'BULLISH' : 'BEARISH', 0.52,
    target, bars.at(-1)!.close * (isBullish ? 0.97 : 1.03),
    'Momentum Continuation',
    `${Math.round(pctPos * 100)}% of recent bars closed ${isBullish ? 'up' : 'down'}. ${isBullish ? 'Bullish' : 'Bearish'} momentum continuation setup.`,
    bars, bars.length - 15, bars.length - 1
  );
}

export function detectMeanReversion(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 20) return null;
  const closes = bars.map((b) => b.close);
  const mean = closes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const current = closes.at(-1)!;
  const deviation = (current - mean) / mean;
  if (Math.abs(deviation) < 0.08) return null;
  const isBullish = deviation < 0;
  return makePattern(
    'MEAN_REVERSION', isBullish ? 'BULLISH' : 'BEARISH', 0.48,
    mean, isBullish ? current * 0.97 : current * 1.03,
    'Mean Reversion',
    `Price is ${Math.round(Math.abs(deviation) * 100)}% ${deviation > 0 ? 'above' : 'below'} 20-period mean ($${round2(mean)}). ${isBullish ? 'Oversold — reversion to mean is likely.' : 'Overbought — reversion to mean is likely.'}`,
    bars, bars.length - 20, bars.length - 1
  );
}

export function detectFailedBreakout(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 15) return null;
  const rangeEnd = bars.length - 6;
  const range = bars.slice(rangeEnd - 10, rangeEnd);
  const attempt = bars.slice(rangeEnd);
  const rangeHigh = Math.max(...range.map((b) => b.high));
  const peakAbove = attempt.filter((b) => b.high > rangeHigh);
  if (peakAbove.length === 0) return null;
  const currentPrice = bars.at(-1)!.close;
  if (currentPrice >= rangeHigh) return null;
  return makePattern(
    'FAILED_BREAKOUT', 'BEARISH', 0.58,
    Math.min(...range.map((b) => b.low)),
    rangeHigh * 1.01,
    'Failed Breakout',
    `Price broke above $${round2(rangeHigh)} but reversed back below — a bearish bull-trap. Sellers are in control.`,
    bars, rangeEnd - 10, bars.length - 1
  );
}

export function detectFailedBreakdown(bars: OHLCVBar[]): PatternResult | null {
  if (bars.length < 15) return null;
  const rangeEnd = bars.length - 6;
  const range = bars.slice(rangeEnd - 10, rangeEnd);
  const attempt = bars.slice(rangeEnd);
  const rangeLow = Math.min(...range.map((b) => b.low));
  const dipsBelow = attempt.filter((b) => b.low < rangeLow);
  if (dipsBelow.length === 0) return null;
  const currentPrice = bars.at(-1)!.close;
  if (currentPrice <= rangeLow) return null;
  return makePattern(
    'FAILED_BREAKDOWN', 'BULLISH', 0.58,
    Math.max(...range.map((b) => b.high)),
    rangeLow * 0.99,
    'Failed Breakdown',
    `Price dipped below $${round2(rangeLow)} but buyers stepped in and recovered — a bearish bear-trap. Bulls are in control.`,
    bars, rangeEnd - 10, bars.length - 1
  );
}

export function detectAllPatterns(bars: OHLCVBar[]): PatternResult[] {
  const detectors = [
    detectDoubleBottom,
    detectDoubleTop,
    detectHeadAndShoulders,
    detectInverseHnS,
    detectAscendingTriangle,
    detectDescendingTriangle,
    detectSymmetricalTriangle,
    detectBullFlag,
    detectBearFlag,
    detectCupAndHandle,
    detectRangeBreakout,
    detectMomentumContinuation,
    detectMeanReversion,
    detectFailedBreakout,
    detectFailedBreakdown,
  ];

  const results: PatternResult[] = [];
  for (const detect of detectors) {
    try {
      const result = detect(bars);
      if (result) results.push(result);
    } catch {
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}
