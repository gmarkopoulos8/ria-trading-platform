import { SentimentLabel } from './types';

const STRONG_POSITIVE = [
  'beats', 'beat', 'surpasses', 'surpassed', 'exceeds', 'exceeded', 'smashes',
  'record', 'breakthrough', 'soars', 'soared', 'rallies', 'rallied', 'surge',
  'surges', 'acquisition', 'partnership', 'approved', 'approval', 'launches',
  'wins', 'won', 'contract', 'upgrade', 'upgraded', 'outperform', 'bullish',
  'growth', 'profit', 'revenue beat', 'all-time high', 'major deal',
  'expands', 'expansion', 'breakthrough', 'strong', 'raised guidance',
  'buy rating', 'price target raised', 'positive', 'optimistic',
];

const MODERATE_POSITIVE = [
  'increases', 'increased', 'improves', 'improved', 'gains', 'gained',
  'rises', 'rose', 'higher', 'above expectations', 'positive', 'healthy',
  'solid', 'in-line', 'progress', 'advances', 'advancing', 'recovery',
  'collaboration', 'agreement', 'alliance', 'expansion',
];

const STRONG_NEGATIVE = [
  'misses', 'missed', 'disappoints', 'disappointing', 'falls', 'fell',
  'plunges', 'plunged', 'crashes', 'crashed', 'lawsuit', 'sued', 'breach',
  'hack', 'exploit', 'loses', 'loss', 'deficit', 'downgrade', 'downgraded',
  'sell rating', 'price target cut', 'cuts guidance', 'below expectations',
  'warning', 'investigation', 'fraud', 'violation', 'recall', 'halt',
  'suspended', 'bankrupt', 'default', 'layoffs', 'restructuring', 'scandal',
  'fine', 'penalty', 'ban', 'outage', 'exploit',
];

const MODERATE_NEGATIVE = [
  'declines', 'declined', 'drops', 'dropped', 'lower', 'weak', 'concern',
  'cautious', 'headwinds', 'uncertainty', 'pressure', 'challenges',
  'delays', 'delayed', 'below', 'reduces', 'reduced', 'cuts', 'cut',
  'volatility', 'risks',
];

export function analyzeSentiment(text: string): {
  label: SentimentLabel;
  score: number;
} {
  const lower = text.toLowerCase();

  let score = 0;

  for (const word of STRONG_POSITIVE) {
    if (lower.includes(word)) score += 2;
  }
  for (const word of MODERATE_POSITIVE) {
    if (lower.includes(word)) score += 1;
  }
  for (const word of STRONG_NEGATIVE) {
    if (lower.includes(word)) score -= 2;
  }
  for (const word of MODERATE_NEGATIVE) {
    if (lower.includes(word)) score -= 1;
  }

  const clampedScore = Math.max(-10, Math.min(10, score));
  const normalized = Math.round((clampedScore / 10) * 100) / 100;

  let label: SentimentLabel = 'NEUTRAL';
  if (normalized > 0.15) label = 'POSITIVE';
  else if (normalized < -0.15) label = 'NEGATIVE';

  return { label, score: normalized };
}

export function scoreRecency(publishedAt: Date): number {
  const ageMs = Date.now() - publishedAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours <= 1) return 100;
  if (ageHours <= 6) return 90;
  if (ageHours <= 24) return 75;
  if (ageHours <= 48) return 60;
  if (ageHours <= 72) return 45;
  if (ageHours <= 168) return 30;
  return 15;
}

export function scoreSourceQuality(sourceName: string): number {
  const tier1 = ['Bloomberg', 'Reuters', 'WSJ', 'Financial Times', 'CNBC', 'SEC.gov'];
  const tier2 = ['MarketWatch', 'Barrons', 'The Economist', 'Fortune', 'Business Insider', 'CoinDesk', 'The Block'];
  const tier3 = ['Yahoo Finance', 'Seeking Alpha', 'Motley Fool', 'Benzinga', 'TheStreet', 'Decrypt'];

  if (tier1.some((s) => sourceName.includes(s))) return 95;
  if (tier2.some((s) => sourceName.includes(s))) return 80;
  if (tier3.some((s) => sourceName.includes(s))) return 65;
  return 50;
}
