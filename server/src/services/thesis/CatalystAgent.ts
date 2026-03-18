import type { CatalystAnalysis } from '../news/types';
import type { CatalystOutput, AgentSubScore } from './types';

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function scoreDevelopments(analysis: CatalystAnalysis): CatalystOutput['recentDevelopments'] {
  const count = analysis.newsItems.length;
  const signals: string[] = [];
  let score = 50;

  if (count >= 10) { score += 15; signals.push(`${count} recent developments — active information environment`); }
  else if (count >= 5) { score += 5; signals.push(`${count} recent items — moderate coverage`); }
  else if (count <= 2) { score -= 10; signals.push(`Only ${count} news items — sparse coverage`); }

  return { score: clamp(score), signals, description: `${count} recent developments`, count };
}

function scoreEventImportance(analysis: CatalystAnalysis): CatalystOutput['eventImportance'] {
  const highImpact = analysis.newsItems.filter((i) => i.urgency === 'CRITICAL' || i.urgency === 'HIGH');
  const signals: string[] = [];
  let score = 50;

  if (highImpact.length >= 3) { score += 25; signals.push(`${highImpact.length} high-impact events — elevated catalyst environment`); }
  else if (highImpact.length >= 1) { score += 10; signals.push(`${highImpact.length} high-impact event(s) present`); }
  else { score -= 5; signals.push('No high-impact events — low catalyst urgency'); }

  for (const item of highImpact.slice(0, 2)) {
    signals.push(`[${item.urgency}] ${item.headline.slice(0, 60)}...`);
  }

  return { score: clamp(score), signals, description: `${highImpact.length} high-impact events`, highImpactCount: highImpact.length };
}

function scoreSentiment(analysis: CatalystAnalysis): CatalystOutput['sentiment'] {
  const { sentimentSummary } = analysis;
  const signals: string[] = [];
  let score = 50;

  if (sentimentSummary.overallSentiment === 'POSITIVE') { score += 30; signals.push('Overall positive sentiment confirmed by majority of sources'); }
  else if (sentimentSummary.overallSentiment === 'NEGATIVE') { score -= 30; signals.push('Overall negative sentiment — bearish narrative dominates'); }

  if (sentimentSummary.sentimentTrend === 'IMPROVING') { score += 10; signals.push('Sentiment trend improving — narrative shifting positive'); }
  else if (sentimentSummary.sentimentTrend === 'DETERIORATING') { score -= 10; signals.push('Sentiment trend deteriorating — narrative shifting negative'); }

  const scoreVal = sentimentSummary.sentimentScore;
  signals.push(`Average sentiment score: ${scoreVal > 0 ? '+' : ''}${scoreVal.toFixed(2)}`);

  return {
    score: clamp(score),
    signals,
    description: `${sentimentSummary.overallSentiment} (${sentimentSummary.sentimentTrend})`,
    label: sentimentSummary.overallSentiment,
    trend: sentimentSummary.sentimentTrend,
  };
}

function scoreUrgency(analysis: CatalystAnalysis): CatalystOutput['urgency'] {
  const urgent = analysis.newsItems.filter((i) => i.urgency === 'CRITICAL' || i.urgency === 'HIGH');
  const signals: string[] = [];
  let score = 50;

  if (urgent.some((i) => i.urgency === 'CRITICAL')) {
    score += 20; signals.push('CRITICAL urgency item detected — requires immediate monitoring');
  } else if (urgent.length > 0) {
    score += 10; signals.push(`${urgent.length} HIGH urgency item(s) requiring active monitoring`);
  } else {
    signals.push('No urgent flags — stable monitoring conditions');
  }

  return { score: clamp(score), signals, description: `${urgent.length} urgent items`, urgentCount: urgent.length };
}

function scoreSourceCredibility(analysis: CatalystAnalysis): CatalystOutput['sourceCredibility'] {
  const items = analysis.newsItems;
  const signals: string[] = [];
  let avgQuality = 50;

  if (items.length > 0) {
    avgQuality = Math.round(items.reduce((s, i) => s + (i.scores.sourceQuality ?? 50), 0) / items.length);
  }

  let score = avgQuality;
  if (avgQuality >= 85) { signals.push(`Tier-1 sources (avg quality ${avgQuality}%) — Bloomberg, Reuters, WSJ coverage`); }
  else if (avgQuality >= 70) { signals.push(`Quality sources (avg quality ${avgQuality}%)`); }
  else { signals.push(`Mixed source quality (avg ${avgQuality}%)`); }

  const topSources = [...new Set(items.map((i) => i.source.name))].slice(0, 3);
  if (topSources.length > 0) signals.push(`Sources: ${topSources.join(', ')}`);

  return { score: clamp(score), signals, description: `Avg quality: ${avgQuality}%`, avgQuality };
}

function scoreCatalystBalance(analysis: CatalystAnalysis): CatalystOutput['catalystBalance'] {
  const positiveItems = analysis.newsItems.filter((i) => i.sentiment === 'POSITIVE');
  const negativeItems = analysis.newsItems.filter((i) => i.sentiment === 'NEGATIVE');
  const total = analysis.newsItems.length || 1;
  const ratio = positiveItems.length / total;
  const signals: string[] = [];
  let score = 50;

  score = clamp(ratio * 100);
  if (ratio > 0.6) signals.push(`${positiveItems.length}/${total} items positive — bullish catalyst momentum`);
  else if (ratio < 0.4) signals.push(`${negativeItems.length}/${total} items negative — bearish catalyst pressure`);
  else signals.push('Balanced positive/negative catalyst mix');

  signals.push(`Positive: ${positiveItems.length}, Negative: ${negativeItems.length}, Neutral: ${total - positiveItems.length - negativeItems.length}`);

  return {
    score: clamp(score),
    signals,
    description: `${positiveItems.length}+ / ${negativeItems.length}−`,
    positiveCount: positiveItems.length,
    negativeCount: negativeItems.length,
    ratio,
  };
}

export function runCatalystAgent(analysis: CatalystAnalysis): CatalystOutput {
  const recentDevelopments = scoreDevelopments(analysis);
  const eventImportance = scoreEventImportance(analysis);
  const sentiment = scoreSentiment(analysis);
  const urgency = scoreUrgency(analysis);
  const sourceCredibility = scoreSourceCredibility(analysis);
  const catalystBalance = scoreCatalystBalance(analysis);

  const weights = { sentiment: 0.30, catalystBalance: 0.25, eventImportance: 0.20, sourceCredibility: 0.12, urgency: 0.08, developments: 0.05 };
  const overallScore = clamp(
    sentiment.score * weights.sentiment +
    catalystBalance.score * weights.catalystBalance +
    eventImportance.score * weights.eventImportance +
    sourceCredibility.score * weights.sourceCredibility +
    urgency.score * weights.urgency +
    recentDevelopments.score * weights.developments
  );

  const { sentimentSummary } = analysis;
  const bullishCatalysts = sentimentSummary.positiveCount;
  const bearishCatalysts = sentimentSummary.negativeCount;
  const catalystBias = sentimentSummary.overallSentiment;
  const dominantEventType = sentimentSummary.dominantEventType;

  const summary = `${analysis.ticker} catalyst environment is ${catalystBias.toLowerCase()} (score: ${overallScore}/100). ` +
    `${bullishCatalysts} bullish, ${bearishCatalysts} bearish catalysts. ` +
    `${sentimentSummary.urgentCount > 0 ? `${sentimentSummary.urgentCount} urgent items require monitoring.` : 'No urgent flags.'} ` +
    `Source quality: ${sentiment.description}.`;

  return {
    ticker: analysis.ticker,
    recentDevelopments,
    eventImportance,
    sentiment,
    urgency,
    sourceCredibility,
    catalystBalance,
    bullishCatalysts,
    bearishCatalysts,
    overallScore,
    catalystBias,
    dominantEventType,
    summary,
    analyzedAt: new Date(),
  };
}
