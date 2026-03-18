import { OHLCVBar, TechnicalAnalysisResult, PatternAnalysisResult, Timeframe, SignalDirection } from './types';
import { computeSMA } from './indicators/sma';
import { computeEMA } from './indicators/ema';
import { computeRSI } from './indicators/rsi';
import { computeMACD } from './indicators/macd';
import { computeATR } from './indicators/atr';
import { computeVolumeTrend } from './indicators/volume';
import { computeSupportResistance } from './indicators/levels';
import { computeTrend } from './indicators/trend';
import { computeRelativeStrength } from './indicators/relativeStrength';
import { detectAllPatterns } from './patterns/detector';
import prisma from '../../lib/prisma';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: TechnicalAnalysisResult; ts: number }>();
const patternCache = new Map<string, { result: PatternAnalysisResult; ts: number }>();

function computeTechnicalScore(signals: SignalDirection[]): number {
  const total = signals.length;
  if (total === 0) return 50;
  const bullish = signals.filter((s) => s === 'BULLISH').length;
  const bearish = signals.filter((s) => s === 'BEARISH').length;
  const ratio = (bullish - bearish) / total;
  return Math.round(50 + ratio * 50);
}

class TechnicalService {
  async analyze(
    ticker: string,
    bars: OHLCVBar[],
    timeframe: Timeframe = '1M'
  ): Promise<TechnicalAnalysisResult> {
    const cacheKey = `${ticker}:${timeframe}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

    if (bars.length < 10) {
      const empty: TechnicalAnalysisResult = {
        ticker, timeframe, currentPrice: 0, analyzedAt: new Date(),
        sma: { sma20: null, sma50: null, sma200: null, signal: 'NEUTRAL', explanation: 'Insufficient data.' },
        ema: { ema9: null, ema21: null, ema50: null, signal: 'NEUTRAL', explanation: 'Insufficient data.' },
        rsi: { value: null, signal: 'NEUTRAL', zone: 'NEUTRAL', explanation: 'Insufficient data.' },
        macd: { macdLine: null, signalLine: null, histogram: null, signal: 'NEUTRAL', explanation: 'Insufficient data.' },
        atr: { value: null, valuePercent: null, volatility: 'MEDIUM', explanation: 'Insufficient data.' },
        volume: { currentVolume: 0, avgVolume: 0, ratio: 1, trend: 'NORMAL', signal: 'NEUTRAL', explanation: 'Insufficient data.' },
        supportResistance: { supports: [], resistances: [], nearestSupport: null, nearestResistance: null, explanation: 'Insufficient data.' },
        trend: { direction: 'NEUTRAL', strength: 'WEAK', priceVsSma20: 'AT', priceVsSma50: 'AT', priceVsSma200: 'AT', slopeAngle: 0, explanation: 'Insufficient data.' },
        relativeStrength: { value: 50, percentile: 50, signal: 'NEUTRAL', explanation: 'Insufficient data.' },
        technicalScore: 50,
        scoreExplanation: 'Insufficient data for scoring.',
        overallSignal: 'NEUTRAL',
        summary: 'Insufficient price history for technical analysis.',
      };
      return empty;
    }

    const currentPrice = bars.at(-1)!.close;
    const sma = computeSMA(bars, currentPrice);
    const ema = computeEMA(bars, currentPrice);
    const rsi = computeRSI(bars);
    const macd = computeMACD(bars);
    const atr = computeATR(bars);
    const volume = computeVolumeTrend(bars);
    const supportResistance = computeSupportResistance(bars);
    const trend = computeTrend(bars, currentPrice);
    const relativeStrength = computeRelativeStrength(bars);

    const signals: SignalDirection[] = [
      sma.signal, ema.signal, rsi.signal, macd.signal,
      volume.signal, trend.direction, relativeStrength.signal,
    ];

    const technicalScore = computeTechnicalScore(signals);

    let overallSignal: SignalDirection = 'NEUTRAL';
    if (technicalScore >= 62) overallSignal = 'BULLISH';
    else if (technicalScore <= 38) overallSignal = 'BEARISH';

    const bullCount = signals.filter((s) => s === 'BULLISH').length;
    const bearCount = signals.filter((s) => s === 'BEARISH').length;

    const scoreExplanation = `Technical score ${technicalScore}/100 based on ${bullCount} bullish and ${bearCount} bearish signals across SMA, EMA, RSI, MACD, volume, trend, and relative strength.`;

    const summary = `${trend.strength} ${trend.direction} trend. RSI ${rsi.value ?? 'N/A'} (${rsi.zone}). ${
      macd.signal === 'BULLISH' ? 'MACD confirming.' : macd.signal === 'BEARISH' ? 'MACD diverging.' : 'MACD neutral.'
    } ${volume.trend === 'SPIKE' ? 'Volume spike detected.' : ''} Overall technical score: ${technicalScore}/100.`;

    const result: TechnicalAnalysisResult = {
      ticker, timeframe, currentPrice, analyzedAt: new Date(),
      sma, ema, rsi, macd, atr, volume, supportResistance, trend, relativeStrength,
      technicalScore, scoreExplanation, overallSignal, summary,
    };

    cache.set(cacheKey, { result, ts: Date.now() });
    this.persistSignals(ticker, result).catch(() => {});
    return result;
  }

  async analyzePatterns(
    ticker: string,
    bars: OHLCVBar[],
    timeframe: Timeframe = '1M'
  ): Promise<PatternAnalysisResult> {
    const cacheKey = `patterns:${ticker}:${timeframe}`;
    const cached = patternCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

    const patterns = detectAllPatterns(bars);
    const dominantPattern = patterns.length > 0 ? patterns[0] : null;

    const result: PatternAnalysisResult = {
      ticker, timeframe, patterns, dominantPattern, analyzedAt: new Date(),
    };

    patternCache.set(cacheKey, { result, ts: Date.now() });
    this.persistPatterns(ticker, result).catch(() => {});
    return result;
  }

  private async persistSignals(ticker: string, result: TechnicalAnalysisResult): Promise<void> {
    try {
      const symbol = await prisma.symbol.findUnique({ where: { ticker } });
      if (!symbol) return;

      const signals = [
        { type: 'RSI', value: result.rsi.value ?? 0, signal: result.rsi.signal },
        { type: 'MACD', value: result.macd.macdLine ?? 0, signal: result.macd.signal },
        { type: 'ATR', value: result.atr.value ?? 0, signal: 'NEUTRAL' as SignalDirection },
        { type: 'SMA20', value: result.sma.sma20 ?? 0, signal: result.sma.signal },
        { type: 'TREND', value: result.trend.slopeAngle, signal: result.trend.direction },
        { type: 'TECH_SCORE', value: result.technicalScore, signal: result.overallSignal },
      ];

      await prisma.technicalSignal.createMany({
        data: signals.map((s) => ({
          symbolId: symbol.id,
          ticker,
          signalType: s.type,
          value: s.value,
          signal: s.signal,
          timeframe: result.timeframe,
          capturedAt: new Date(),
        })),
        skipDuplicates: false,
      });
    } catch {
    }
  }

  private async persistPatterns(ticker: string, result: PatternAnalysisResult): Promise<void> {
    try {
      const symbol = await prisma.symbol.findUnique({ where: { ticker } });
      if (!symbol) return;

      if (result.patterns.length === 0) return;

      await prisma.pattern.createMany({
        data: result.patterns.slice(0, 5).map((p) => ({
          symbolId: symbol.id,
          ticker,
          patternType: p.type,
          direction: p.direction,
          confidence: p.confidence,
          startDate: p.startDate,
          endDate: p.endDate,
          priceTarget: p.priceTarget,
          metadata: { description: p.description, explanation: p.explanation },
          detectedAt: new Date(),
        })),
        skipDuplicates: false,
      });
    } catch {
    }
  }
}

export const technicalService = new TechnicalService();
