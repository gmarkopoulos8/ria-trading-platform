import { OHLCVBar, VolumeTrendResult, SignalDirection } from '../types';

export function computeVolumeTrend(bars: OHLCVBar[]): VolumeTrendResult {
  if (bars.length < 5) {
    const last = bars.at(-1);
    return {
      currentVolume: last?.volume ?? 0,
      avgVolume: 0,
      ratio: 1,
      trend: 'NORMAL',
      signal: 'NEUTRAL',
      explanation: 'Insufficient data for volume analysis.',
    };
  }

  const avgPeriod = Math.min(20, bars.length - 1);
  const avgVolume = bars.slice(-avgPeriod - 1, -1).reduce((s, b) => s + b.volume, 0) / avgPeriod;
  const currentVolume = bars.at(-1)!.volume;
  const ratio = avgVolume > 0 ? Math.round((currentVolume / avgVolume) * 100) / 100 : 1;

  const recentPriceChange = bars.at(-1)!.close - bars.at(-2)!.close;
  const priceUp = recentPriceChange >= 0;

  let trend: VolumeTrendResult['trend'];
  let signal: SignalDirection = 'NEUTRAL';
  let explanation = '';

  const fmt = (v: number) =>
    v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`;

  if (ratio >= 2.0) {
    trend = 'SPIKE';
    signal = priceUp ? 'BULLISH' : 'BEARISH';
    explanation = `Volume spike: ${fmt(currentVolume)} vs ${fmt(avgVolume)} avg (${ratio}× normal). ${priceUp ? 'Strong buying conviction on up-move.' : 'Heavy selling pressure confirmed by volume.'}`;
  } else if (ratio >= 1.3) {
    trend = 'ELEVATED';
    signal = priceUp ? 'BULLISH' : 'BEARISH';
    explanation = `Elevated volume at ${ratio}× average (${fmt(currentVolume)} vs ${fmt(avgVolume)}). ${priceUp ? 'Above-average participation on buying.' : 'Above-average participation on selling.'}`;
  } else if (ratio < 0.6) {
    trend = 'LOW';
    signal = 'NEUTRAL';
    explanation = `Low volume at ${ratio}× average (${fmt(currentVolume)} vs ${fmt(avgVolume)}). Weak participation — moves may not be sustainable.`;
  } else {
    trend = 'NORMAL';
    signal = 'NEUTRAL';
    explanation = `Volume is normal at ${ratio}× average (${fmt(currentVolume)} vs ${fmt(avgVolume)}).`;
  }

  return { currentVolume, avgVolume: Math.round(avgVolume), ratio, trend, signal, explanation };
}
