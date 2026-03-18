export type EventType =
  | 'EARNINGS'
  | 'GUIDANCE'
  | 'FILING'
  | 'PARTNERSHIP'
  | 'CONTRACT'
  | 'PRODUCT_LAUNCH'
  | 'LAWSUIT'
  | 'REGULATORY'
  | 'EXECUTIVE_CHANGE'
  | 'SECURITY_BREACH'
  | 'ANALYST_ACTION'
  | 'MACRO'
  | 'SECTOR'
  | 'CRYPTO_EXCHANGE'
  | 'TOKEN_UNLOCK'
  | 'CHAIN_OUTAGE'
  | 'PROTOCOL_EXPLOIT'
  | 'GENERAL';

export type SentimentLabel = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
export type UrgencyLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type CatalystCategory = 'POSITIVE_CATALYST' | 'NEGATIVE_CATALYST' | 'NEUTRAL' | 'URGENT_FLAG';

export interface NewsSource {
  name: string;
  domain: string;
  qualityScore: number;
}

export interface NormalizedNewsItem {
  id: string;
  ticker: string | null;
  headline: string;
  summary: string;
  url: string;
  source: NewsSource;
  publishedAt: Date;

  eventType: EventType;
  sentiment: SentimentLabel;
  category: CatalystCategory;
  urgency: UrgencyLevel;

  scores: {
    sentiment: number;
    sentimentTrend: number;
    importance: number;
    recency: number;
    sourceQuality: number;
    catalyst: number;
  };

  explanation: string;
  keyPoints: string[];
  isMock?: boolean;
}

export interface SentimentSummary {
  ticker: string;
  overallSentiment: SentimentLabel;
  sentimentScore: number;
  sentimentTrend: 'IMPROVING' | 'DETERIORATING' | 'STABLE';
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  urgentCount: number;
  dominantEventType: EventType | null;
  summary: string;
}

export interface CatalystAnalysis {
  ticker: string;
  newsItems: NormalizedNewsItem[];
  sentimentSummary: SentimentSummary;
  analyzedAt: Date;
  timespan: string;
}
