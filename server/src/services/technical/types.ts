export interface OHLCVBar {
  timestamp: Date;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  vwap?:     number;
}

export type SignalDirection = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type TrendStrength = 'STRONG' | 'MODERATE' | 'WEAK';
export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export interface IndicatorResult {
  value: number | null;
  signal: SignalDirection;
  explanation: string;
}

export interface SMAResult {
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  signal: SignalDirection;
  explanation: string;
}

export interface EMAResult {
  ema9: number | null;
  ema21: number | null;
  ema50: number | null;
  signal: SignalDirection;
  explanation: string;
}

export interface RSIResult {
  value: number | null;
  signal: SignalDirection;
  zone: 'OVERBOUGHT' | 'OVERSOLD' | 'NEUTRAL';
  explanation: string;
}

export interface MACDResult {
  macdLine: number | null;
  signalLine: number | null;
  histogram: number | null;
  signal: SignalDirection;
  explanation: string;
}

export interface ATRResult {
  value: number | null;
  valuePercent: number | null;
  volatility: 'HIGH' | 'MEDIUM' | 'LOW';
  explanation: string;
}

export interface VolumeTrendResult {
  currentVolume: number;
  avgVolume: number;
  ratio: number;
  trend: 'SPIKE' | 'ELEVATED' | 'NORMAL' | 'LOW';
  signal: SignalDirection;
  explanation: string;
}

export interface SupportResistanceResult {
  supports: number[];
  resistances: number[];
  nearestSupport: number | null;
  nearestResistance: number | null;
  explanation: string;
}

export interface TrendResult {
  direction: SignalDirection;
  strength: TrendStrength;
  priceVsSma20: 'ABOVE' | 'BELOW' | 'AT';
  priceVsSma50: 'ABOVE' | 'BELOW' | 'AT';
  priceVsSma200: 'ABOVE' | 'BELOW' | 'AT';
  slopeAngle: number;
  explanation: string;
}

export interface RelativeStrengthResult {
  value: number;
  percentile: number;
  signal: SignalDirection;
  explanation: string;
}

export interface MultiTimeframeAlignment {
  timeframe: Timeframe;
  trend: SignalDirection;
  rsi: number | null;
  aboveSma20: boolean;
  aboveSma50: boolean;
}

export type PatternType =
  | 'ASCENDING_TRIANGLE'
  | 'DESCENDING_TRIANGLE'
  | 'SYMMETRICAL_TRIANGLE'
  | 'BULL_FLAG'
  | 'BEAR_FLAG'
  | 'CUP_AND_HANDLE'
  | 'DOUBLE_TOP'
  | 'DOUBLE_BOTTOM'
  | 'HEAD_AND_SHOULDERS'
  | 'INVERSE_HEAD_AND_SHOULDERS'
  | 'RANGE_BREAKOUT'
  | 'TREND_CHANNEL'
  | 'MEAN_REVERSION'
  | 'MOMENTUM_CONTINUATION'
  | 'FAILED_BREAKOUT'
  | 'FAILED_BREAKDOWN';

export interface PatternResult {
  type: PatternType;
  direction: SignalDirection;
  confidence: number;
  priceTarget: number | null;
  stopLoss: number | null;
  description: string;
  explanation: string;
  startDate: Date | null;
  endDate: Date | null;
}

export interface TechnicalAnalysisResult {
  ticker: string;
  timeframe: Timeframe;
  currentPrice: number;
  analyzedAt: Date;

  sma: SMAResult;
  ema: EMAResult;
  rsi: RSIResult;
  macd: MACDResult;
  atr: ATRResult;
  volume: VolumeTrendResult;
  supportResistance: SupportResistanceResult;
  trend: TrendResult;
  relativeStrength: RelativeStrengthResult;

  technicalScore: number;
  scoreExplanation: string;
  overallSignal: SignalDirection;
  summary: string;
}

export interface PatternAnalysisResult {
  ticker: string;
  timeframe: Timeframe;
  patterns: PatternResult[];
  dominantPattern: PatternResult | null;
  analyzedAt: Date;
}
