import { EventType, UrgencyLevel, CatalystCategory, SentimentLabel } from './types';

const EVENT_PATTERNS: Array<{ type: EventType; keywords: string[] }> = [
  { type: 'EARNINGS', keywords: ['earnings', 'eps', 'revenue', 'quarterly results', 'q1', 'q2', 'q3', 'q4', 'fiscal', 'profit', 'net income', 'results'] },
  { type: 'GUIDANCE', keywords: ['guidance', 'outlook', 'forecast', 'raises guidance', 'cuts guidance', 'full-year', 'fy2', 'expects revenue', 'projects'] },
  { type: 'FILING', keywords: ['sec filing', '10-k', '10-q', '8-k', 'proxy', 'filing', 'form 4', 'insider'] },
  { type: 'PARTNERSHIP', keywords: ['partnership', 'collaboration', 'alliance', 'joint venture', 'teams up', 'works with'] },
  { type: 'CONTRACT', keywords: ['contract', 'deal', 'agreement', 'awarded', 'wins deal', 'government contract', 'multi-year'] },
  { type: 'PRODUCT_LAUNCH', keywords: ['launches', 'unveils', 'releases', 'new product', 'new model', 'introduces', 'debuts'] },
  { type: 'LAWSUIT', keywords: ['lawsuit', 'sued', 'litigation', 'class action', 'legal action', 'court', 'complaint'] },
  { type: 'REGULATORY', keywords: ['fda', 'sec', 'ftc', 'doj', 'regulatory', 'approval', 'approved', 'compliance', 'investigation', 'subpoena', 'antitrust'] },
  { type: 'EXECUTIVE_CHANGE', keywords: ['ceo', 'cfo', 'cto', 'president', 'resigns', 'appointed', 'names new', 'steps down', 'executive'] },
  { type: 'SECURITY_BREACH', keywords: ['breach', 'hack', 'hacked', 'cyberattack', 'ransomware', 'data leak', 'compromised', 'unauthorized access'] },
  { type: 'ANALYST_ACTION', keywords: ['analyst', 'rating', 'upgrade', 'downgrade', 'buy', 'sell', 'hold', 'price target', 'initiates', 'reiterates', 'overweight', 'underweight'] },
  { type: 'MACRO', keywords: ['fed', 'federal reserve', 'interest rate', 'inflation', 'cpi', 'gdp', 'jobs report', 'unemployment', 'fomc', 'macro', 'treasury'] },
  { type: 'SECTOR', keywords: ['sector', 'industry', 'market share', 'competitive', 'supply chain', 'tariff', 'chip shortage', 'ai demand'] },
  { type: 'CRYPTO_EXCHANGE', keywords: ['exchange', 'binance', 'coinbase', 'kraken', 'delisting', 'listing', 'trading halt'] },
  { type: 'TOKEN_UNLOCK', keywords: ['token unlock', 'vesting', 'cliff', 'unlock', 'supply increase', 'circulating supply'] },
  { type: 'CHAIN_OUTAGE', keywords: ['outage', 'down', 'network issues', 'halted', 'validators', 'consensus failure', 'block production'] },
  { type: 'PROTOCOL_EXPLOIT', keywords: ['exploit', 'vulnerability', 'drained', 'rug pull', 'flash loan', 'smart contract bug', 'defi hack', 'bridge exploit', 'protocol hack'] },
];

export function classifyEventType(text: string): EventType {
  const lower = text.toLowerCase();
  for (const pattern of EVENT_PATTERNS) {
    if (pattern.keywords.some((kw) => lower.includes(kw))) {
      return pattern.type;
    }
  }
  return 'GENERAL';
}

export function scoreImportance(eventType: EventType, sentimentScore: number): number {
  const base: Record<EventType, number> = {
    PROTOCOL_EXPLOIT: 90,
    SECURITY_BREACH: 85,
    EARNINGS: 80,
    REGULATORY: 75,
    EXECUTIVE_CHANGE: 70,
    GUIDANCE: 70,
    LAWSUIT: 65,
    CHAIN_OUTAGE: 65,
    ANALYST_ACTION: 60,
    CONTRACT: 60,
    PARTNERSHIP: 55,
    TOKEN_UNLOCK: 55,
    PRODUCT_LAUNCH: 50,
    MACRO: 50,
    CRYPTO_EXCHANGE: 50,
    FILING: 45,
    SECTOR: 40,
    GENERAL: 30,
  };

  const b = base[eventType] ?? 30;
  const magnitudeBoost = Math.abs(sentimentScore) * 15;
  return Math.min(100, Math.round(b + magnitudeBoost));
}

export function classifyUrgency(eventType: EventType, importanceScore: number, sentimentScore: number): UrgencyLevel {
  const criticalTypes: EventType[] = ['PROTOCOL_EXPLOIT', 'SECURITY_BREACH', 'CHAIN_OUTAGE'];
  if (criticalTypes.includes(eventType) && Math.abs(sentimentScore) > 0.5) return 'CRITICAL';
  if (importanceScore >= 80) return 'HIGH';
  if (importanceScore >= 55) return 'MEDIUM';
  return 'LOW';
}

export function classifyCategory(sentiment: SentimentLabel, urgency: UrgencyLevel, eventType: EventType): CatalystCategory {
  const alwaysUrgent: EventType[] = ['PROTOCOL_EXPLOIT', 'SECURITY_BREACH', 'CHAIN_OUTAGE'];
  if (urgency === 'CRITICAL' || alwaysUrgent.includes(eventType)) return 'URGENT_FLAG';
  if (sentiment === 'POSITIVE') return 'POSITIVE_CATALYST';
  if (sentiment === 'NEGATIVE') return 'NEGATIVE_CATALYST';
  return 'NEUTRAL';
}

export function computeCatalystScore(scores: {
  importance: number;
  recency: number;
  sourceQuality: number;
  sentiment: number;
}): number {
  const { importance, recency, sourceQuality, sentiment } = scores;
  const weighted =
    importance * 0.40 +
    recency * 0.25 +
    sourceQuality * 0.15 +
    Math.abs(sentiment) * 100 * 0.20;
  return Math.min(100, Math.round(weighted));
}

export function computeSentimentTrend(items: Array<{ scores: { sentiment: number }; publishedAt: Date }>): number {
  if (items.length < 2) return 0;
  const sorted = [...items].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const half = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, half);
  const recent = sorted.slice(half);
  const avgEarly = early.reduce((s, i) => s + i.scores.sentiment, 0) / early.length;
  const avgRecent = recent.reduce((s, i) => s + i.scores.sentiment, 0) / recent.length;
  return Math.round((avgRecent - avgEarly) * 100) / 100;
}
