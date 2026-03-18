import type { TechnicalAnalysisResult, PatternAnalysisResult, SignalDirection } from '../technical/types';

export type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
export type ConvictionLevel = 'HIGH' | 'MODERATE' | 'LOW';
export type RiskCategory = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
export type RecommendedAction = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT' | 'STRONG_SHORT';
export type MonitoringFrequency = 'HOURLY' | 'DAILY' | 'WEEKLY';
export type HoldWindow = 'INTRADAY' | '1-3 DAYS' | '1-2 WEEKS' | '2-4 WEEKS' | '1-3 MONTHS' | '3-6 MONTHS';

export interface AgentSubScore {
  score: number;
  signals: string[];
  description: string;
}

export interface MarketStructureOutput {
  ticker: string;
  currentPrice: number;

  chartStructure: AgentSubScore;
  trend: AgentSubScore & { direction: SignalDirection; strength: string };
  supportResistance: AgentSubScore & { nearestSupport: number | null; nearestResistance: number | null };
  momentum: AgentSubScore & { rsi: number | null; macdSignal: SignalDirection };
  volatility: AgentSubScore & { level: string; atrPercent: number | null };
  patterns: AgentSubScore & { detected: string[]; dominant: string | null };
  multiTimeframeAlignment: AgentSubScore;

  bullishScore: number;
  bearishScore: number;
  overallScore: number;
  overallSignal: SignalDirection;
  summary: string;
  analyzedAt: Date;
}

export interface CatalystOutput {
  ticker: string;

  recentDevelopments: AgentSubScore & { count: number };
  eventImportance: AgentSubScore & { highImpactCount: number };
  sentiment: AgentSubScore & { label: string; trend: string };
  urgency: AgentSubScore & { urgentCount: number };
  sourceCredibility: AgentSubScore & { avgQuality: number };
  catalystBalance: AgentSubScore & { positiveCount: number; negativeCount: number; ratio: number };

  bullishCatalysts: number;
  bearishCatalysts: number;
  overallScore: number;
  catalystBias: string;
  dominantEventType: string | null;
  summary: string;
  analyzedAt: Date;
}

export interface RiskOutput {
  ticker: string;

  volatilityFit: AgentSubScore & { acceptable: boolean };
  liquidityFit: AgentSubScore & { acceptable: boolean };
  drawdownRisk: AgentSubScore & { estimatedMaxDrawdown: number };
  eventRisk: AgentSubScore & { events: string[] };
  invalidationClarity: AgentSubScore & { clear: boolean; level: number | null };
  rewardRiskStructure: AgentSubScore & { ratio: number; acceptable: boolean };
  conservativeFit: AgentSubScore & { suitable: boolean };
  aggressiveFit: AgentSubScore & { suitable: boolean };

  overallRiskScore: number;
  riskCategory: RiskCategory;
  mainRisks: string[];
  summary: string;
  analyzedAt: Date;
}

export interface PriceZone {
  low: number;
  high: number;
  description: string;
}

export interface PriceLevel {
  level: number;
  description: string;
}

export interface ThesisOutput {
  symbol: string;
  bias: Bias;
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  volatilityScore: number;
  bullishScore: number;
  bearishScore: number;
  thesisHealthScore: number;
  monitoringFrequency: MonitoringFrequency;

  entryZone: PriceZone;
  invalidationZone: PriceLevel;
  takeProfit1: PriceLevel;
  takeProfit2: PriceLevel;
  suggestedHoldWindow: HoldWindow;

  thesisSummary: string;
  supportingReasons: string[];
  mainRiskToThesis: string;
  monitoringPriorities: string[];

  recommendedAction: RecommendedAction;
  explanation: string;

  marketStructureScore: number;
  catalystScore: number;

  generatedAt: Date;
  expiresAt: Date;
}

export interface FullThesisResult {
  ticker: string;
  marketStructure: MarketStructureOutput;
  catalysts: CatalystOutput;
  risk: RiskOutput;
  thesis: ThesisOutput;
  analyzedAt: Date;
}

export interface ThesisSummary {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  assetClass: string;
  bias: Bias;
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  recommendedAction: RecommendedAction;
  thesisSummary: string;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  takeProfit1: number;
  isMock: boolean;
}

export type { TechnicalAnalysisResult, PatternAnalysisResult, SignalDirection };
