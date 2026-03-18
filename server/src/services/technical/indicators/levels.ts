import { OHLCVBar, SupportResistanceResult } from '../types';

function findPivotHighs(bars: OHLCVBar[], lookback = 3): number[] {
  const highs: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const center = bars[i].high;
    let isPivot = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i - j].high >= center || bars[i + j].high >= center) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) highs.push(center);
  }
  return highs;
}

function findPivotLows(bars: OHLCVBar[], lookback = 3): number[] {
  const lows: number[] = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    const center = bars[i].low;
    let isPivot = true;
    for (let j = 1; j <= lookback; j++) {
      if (bars[i - j].low <= center || bars[i + j].low <= center) {
        isPivot = false;
        break;
      }
    }
    if (isPivot) lows.push(center);
  }
  return lows;
}

function clusterLevels(levels: number[], tolerance = 0.015): number[] {
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[] = [];
  let i = 0;
  while (i < sorted.length) {
    const group = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && (sorted[j] - sorted[i]) / sorted[i] < tolerance) {
      group.push(sorted[j]);
      j++;
    }
    clusters.push(group.reduce((a, b) => a + b, 0) / group.length);
    i = j;
  }
  return clusters;
}

export function computeSupportResistance(bars: OHLCVBar[]): SupportResistanceResult {
  const currentPrice = bars.at(-1)!.close;
  const lookback = Math.min(3, Math.floor(bars.length / 10));

  const rawSupports = findPivotLows(bars, Math.max(2, lookback));
  const rawResistances = findPivotHighs(bars, Math.max(2, lookback));

  const supports = clusterLevels(rawSupports)
    .filter((l) => l < currentPrice * 1.01)
    .sort((a, b) => b - a)
    .slice(0, 4);

  const resistances = clusterLevels(rawResistances)
    .filter((l) => l > currentPrice * 0.99)
    .sort((a, b) => a - b)
    .slice(0, 4);

  const nearestSupport = supports[0] ?? null;
  const nearestResistance = resistances[0] ?? null;

  const fmt = (v: number) => `$${v.toFixed(2)}`;
  const distToSupport = nearestSupport ? Math.round(((currentPrice - nearestSupport) / currentPrice) * 1000) / 10 : null;
  const distToResist = nearestResistance ? Math.round(((nearestResistance - currentPrice) / currentPrice) * 1000) / 10 : null;

  let explanation = '';
  if (nearestSupport && nearestResistance) {
    explanation = `Key support at ${fmt(nearestSupport)} (${distToSupport}% below), resistance at ${fmt(nearestResistance)} (${distToResist}% above). ${
      distToResist! < distToSupport! ? 'Price is closer to resistance.' : 'Price has more room to the upside.'
    }`;
  } else if (nearestSupport) {
    explanation = `Support at ${fmt(nearestSupport)} (${distToSupport}% below current price). No near-term resistance identified.`;
  } else if (nearestResistance) {
    explanation = `Resistance at ${fmt(nearestResistance)} (${distToResist}% above). No nearby support found — watch for potential breakdown.`;
  } else {
    explanation = 'Insufficient data to identify support/resistance levels.';
  }

  return {
    supports: supports.map((v) => Math.round(v * 100) / 100),
    resistances: resistances.map((v) => Math.round(v * 100) / 100),
    nearestSupport: nearestSupport !== null ? Math.round(nearestSupport * 100) / 100 : null,
    nearestResistance: nearestResistance !== null ? Math.round(nearestResistance * 100) / 100 : null,
    explanation,
  };
}
