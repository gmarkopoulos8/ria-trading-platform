import { thesisEngine } from '../thesis/ThesisEngine';
import { marketService } from '../market/MarketService';
import { isCryptoSymbol } from '../market/utils';
import { prisma } from '../../lib/prisma';

export type ActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';
export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface StockHealthResult {
  ticker: string;
  companyName: string;
  exchange: string;
  currentPrice: number;
  changePercent: number;
  healthScore: number;
  bias: Bias;
  confidenceScore: number;
  riskScore: number;
  trendState: string;
  supportZone: { min: number; max: number };
  resistanceZone: { min: number; max: number };
  volatilityState: string;
  patternsDetected: string[];
  catalystSummary: string;
  sentimentSummary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  invalidationLevel: number;
  suggestedHoldWindow: string;
  actionLabel: ActionLabel;
  explanation: string;
  technicalBreakdown: {
    chartStructure: number;
    trend: number;
    momentum: number;
    supportResistance: number;
    volatility: number;
    patterns: number;
    multiTimeframe: number;
  };
  catalystBreakdown: {
    recentDevelopments: number;
    eventImportance: number;
    sentiment: number;
    urgency: number;
    catalystBalance: number;
  };
  scoreWeights: {
    technical: number;
    catalyst: number;
    momentum: number;
    risk: number;
    volatility: number;
    liquidity: number;
  };
  analyzedAt: Date;
  isMock: boolean;
}

const COMPANY_NAMES: Record<string, string> = {
  AAPL: 'Apple Inc.', MSFT: 'Microsoft Corporation', GOOGL: 'Alphabet Inc.', GOOG: 'Alphabet Inc.',
  AMZN: 'Amazon.com Inc.', NVDA: 'NVIDIA Corporation', META: 'Meta Platforms Inc.', TSLA: 'Tesla Inc.',
  BRK: 'Berkshire Hathaway', JPM: 'JPMorgan Chase & Co.', V: 'Visa Inc.', UNH: 'UnitedHealth Group',
  XOM: 'Exxon Mobil Corporation', JNJ: 'Johnson & Johnson', WMT: 'Walmart Inc.', PG: 'Procter & Gamble',
  MA: 'Mastercard Incorporated', HD: 'The Home Depot Inc.', CVX: 'Chevron Corporation',
  LLY: 'Eli Lilly and Company', ABBV: 'AbbVie Inc.', MRK: 'Merck & Co. Inc.',
  PEP: 'PepsiCo Inc.', KO: 'The Coca-Cola Company', COST: 'Costco Wholesale Corporation',
  AVGO: 'Broadcom Inc.', MCD: 'McDonald\'s Corporation', CRM: 'Salesforce Inc.',
  ACN: 'Accenture plc', TMO: 'Thermo Fisher Scientific', ABT: 'Abbott Laboratories',
  AMD: 'Advanced Micro Devices Inc.', NFLX: 'Netflix Inc.', INTC: 'Intel Corporation',
  DIS: 'The Walt Disney Company', ADBE: 'Adobe Inc.', ORCL: 'Oracle Corporation',
  IBM: 'International Business Machines', GE: 'General Electric Company', CAT: 'Caterpillar Inc.',
  BA: 'The Boeing Company', GS: 'The Goldman Sachs Group', MS: 'Morgan Stanley',
  AXP: 'American Express Company', BLK: 'BlackRock Inc.', SPGI: 'S&P Global Inc.',
  RTX: 'RTX Corporation', LMT: 'Lockheed Martin Corporation', HON: 'Honeywell International',
  DE: 'Deere & Company', MMM: '3M Company', UPS: 'United Parcel Service',
  FDX: 'FedEx Corporation', NKE: 'Nike Inc.', SHW: 'The Sherwin-Williams Company',
  CL: 'Colgate-Palmolive Company', PFE: 'Pfizer Inc.', T: 'AT&T Inc.',
  VZ: 'Verizon Communications Inc.', CMCSA: 'Comcast Corporation',
  TXN: 'Texas Instruments Incorporated', QCOM: 'QUALCOMM Incorporated',
  NEE: 'NextEra Energy Inc.', SO: 'The Southern Company', DUK: 'Duke Energy Corporation',
  SPY: 'SPDR S&P 500 ETF Trust', QQQ: 'Invesco QQQ Trust', IWM: 'iShares Russell 2000 ETF',
  PLTR: 'Palantir Technologies', COIN: 'Coinbase Global Inc.', SHOP: 'Shopify Inc.',
  MSTR: 'MicroStrategy Inc.', RKLB: 'Rocket Lab USA Inc.', IONQ: 'IonQ Inc.',
  ARM: 'ARM Holdings plc', SMCI: 'Super Micro Computer Inc.', MRVL: 'Marvell Technology Inc.',
};

function getCompanyName(ticker: string): string {
  return COMPANY_NAMES[ticker.toUpperCase()] ?? `${ticker.toUpperCase()} Corp.`;
}

function computeHealthScore(ms: any, cat: any, risk: any, thesis: any): {
  healthScore: number;
  weights: StockHealthResult['scoreWeights'];
} {
  const technical = ms.overallScore ?? 50;
  const catalyst = cat.overallScore ?? 50;
  const momentum = ((ms.trend?.score ?? 50) + (ms.momentum?.score ?? 50)) / 2;
  const riskAdj = Math.max(0, 100 - (risk.overallRiskScore ?? 50));
  const volatility = risk.volatilityFit?.score ?? 50;
  const liquidity = risk.liquidityFit?.score ?? 50;

  const healthScore =
    technical * 0.30 +
    catalyst * 0.20 +
    momentum * 0.15 +
    riskAdj * 0.15 +
    volatility * 0.10 +
    liquidity * 0.10;

  return {
    healthScore: Math.min(100, Math.max(0, Math.round(healthScore))),
    weights: {
      technical: Math.round(technical),
      catalyst: Math.round(catalyst),
      momentum: Math.round(momentum),
      risk: Math.round(riskAdj),
      volatility: Math.round(volatility),
      liquidity: Math.round(liquidity),
    },
  };
}

function getActionLabel(healthScore: number, thesis: any, risk: any): ActionLabel {
  const conviction = thesis.convictionScore ?? healthScore;
  const riskScore = risk.overallRiskScore ?? 50;

  if (healthScore >= 82 && conviction >= 75 && riskScore <= 45) return 'high conviction';
  if (healthScore >= 65 && conviction >= 60) return 'tradable';
  if (healthScore >= 48) return 'developing';
  if (healthScore >= 35) return 'weak';
  return 'avoid';
}

function getBias(ms: any, thesis: any): Bias {
  const b = thesis.bias?.toLowerCase();
  if (b === 'bullish') return 'bullish';
  if (b === 'bearish') return 'bearish';
  const sig = ms.overallSignal?.toLowerCase();
  if (sig === 'bullish') return 'bullish';
  if (sig === 'bearish') return 'bearish';
  return 'neutral';
}

function getVolatilityState(ms: any): string {
  const level = ms.volatility?.level;
  if (level) return level;
  const atr = ms.volatility?.atrPercent ?? 0;
  if (atr >= 4) return 'High Volatility';
  if (atr >= 2) return 'Moderate Volatility';
  return 'Low Volatility';
}

function buildWeaknesses(ms: any, risk: any, thesis: any): string[] {
  const out: string[] = [];
  if (thesis.mainRiskToThesis) out.push(thesis.mainRiskToThesis);
  if (risk.mainRisks?.length) out.push(...risk.mainRisks.slice(0, 2));
  if (ms.bearishScore > 60) out.push('Elevated bearish pressure in price structure');
  if (risk.volatilityFit?.acceptable === false) out.push('Volatility profile may not suit the current setup');
  if (risk.liquidityFit?.acceptable === false) out.push('Liquidity concern — thin volume relative to risk exposure');
  if (risk.drawdownRisk?.estimatedMaxDrawdown > 0.15) out.push(`Max drawdown risk estimated at ${Math.round(risk.drawdownRisk.estimatedMaxDrawdown * 100)}%`);
  return out.slice(0, 4);
}

function buildExplanation(
  ticker: string,
  healthScore: number,
  actionLabel: ActionLabel,
  bias: Bias,
  thesis: any,
  ms: any,
  risk: any,
  cat: any,
): string {
  const biasDesc = bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral';
  const riskDesc = risk.riskCategory?.toLowerCase() ?? 'moderate';
  const catBias = cat.catalystBias ?? 'neutral';
  return (
    `${ticker} receives a Stock Health Score of ${healthScore}/100, classified as "${actionLabel.toUpperCase()}". ` +
    `The technical structure shows a ${biasDesc} bias with an overall structure score of ${Math.round(ms.overallScore)}/100. ` +
    `Trend direction is ${ms.trend?.direction?.toLowerCase() ?? 'unclear'} with ${ms.trend?.strength?.toLowerCase() ?? 'moderate'} strength. ` +
    `Catalyst intelligence rates news quality at ${Math.round(cat.overallScore)}/100 with a ${catBias.toLowerCase()} catalyst balance. ` +
    `Risk profile is ${riskDesc} with an overall risk score of ${Math.round(risk.overallRiskScore)}/100. ` +
    `${thesis.thesisSummary ?? thesis.explanation ?? ''} ` +
    `Key invalidation sits at $${thesis.invalidationZone?.level?.toFixed(2) ?? '—'}, with a suggested hold window of ${thesis.suggestedHoldWindow ?? '—'}.`
  ).trim();
}

export async function analyzeStockHealth(ticker: string, userId: string): Promise<StockHealthResult> {
  const upper = ticker.toUpperCase().trim();

  if (isCryptoSymbol(upper)) {
    throw new Error(`${upper} appears to be a crypto asset. This analyzer is for NYSE/NASDAQ equities.`);
  }

  const [thesisResult, quoteResult] = await Promise.allSettled([
    thesisEngine.analyze(upper, 'stock'),
    marketService.quote(upper, 'stock'),
  ]);

  if (thesisResult.status === 'rejected') {
    throw new Error(`Analysis failed for ${upper}: ${thesisResult.reason?.message ?? 'Unknown error'}`);
  }

  const fullThesis = thesisResult.value;
  const quote = quoteResult.status === 'fulfilled' ? quoteResult.value : null;

  const { thesis, marketStructure: ms, catalysts: cat, risk } = fullThesis;

  const { healthScore, weights } = computeHealthScore(ms, cat, risk, thesis);
  const bias = getBias(ms, thesis);
  const actionLabel = getActionLabel(healthScore, thesis, risk);
  const currentPrice = quote?.price ?? ms.currentPrice ?? 0;
  const changePercent = quote?.changePercent ?? 0;

  const patternsDetected = ms.patterns?.detected ?? [];
  if (ms.patterns?.dominant && !patternsDetected.includes(ms.patterns.dominant)) {
    patternsDetected.unshift(ms.patterns.dominant);
  }

  const strengths = thesis.supportingReasons?.length
    ? thesis.supportingReasons.slice(0, 4)
    : [ms.summary ?? 'Technical structure intact'];

  const weaknesses = buildWeaknesses(ms, risk, thesis);
  const explanation = buildExplanation(upper, healthScore, actionLabel, bias, thesis, ms, risk, cat);

  await persistSearch(userId, upper, healthScore, actionLabel).catch(() => {});

  return {
    ticker: upper,
    companyName: getCompanyName(upper),
    exchange: 'NYSE/NASDAQ',
    currentPrice,
    changePercent,
    healthScore,
    bias,
    confidenceScore: Math.round(thesis.confidenceScore),
    riskScore: Math.round(risk.overallRiskScore),
    trendState: `${ms.trend?.direction ?? 'NEUTRAL'} — ${ms.trend?.strength ?? 'Moderate'}`,
    supportZone: {
      min: ms.supportResistance?.nearestSupport ? ms.supportResistance.nearestSupport * 0.99 : currentPrice * 0.95,
      max: ms.supportResistance?.nearestSupport ?? currentPrice * 0.97,
    },
    resistanceZone: {
      min: ms.supportResistance?.nearestResistance ?? currentPrice * 1.03,
      max: ms.supportResistance?.nearestResistance ? ms.supportResistance.nearestResistance * 1.01 : currentPrice * 1.05,
    },
    volatilityState: getVolatilityState(ms),
    patternsDetected,
    catalystSummary: cat.summary ?? 'No catalyst data available.',
    sentimentSummary: `Catalyst bias: ${cat.catalystBias ?? 'NEUTRAL'} — ${cat.sentiment?.label ?? 'Neutral'} sentiment trend (${cat.sentiment?.trend ?? 'stable'}).`,
    topStrengths: strengths,
    topWeaknesses: weaknesses,
    invalidationLevel: thesis.invalidationZone?.level ?? currentPrice * 0.92,
    suggestedHoldWindow: thesis.suggestedHoldWindow ?? '1-2 WEEKS',
    actionLabel,
    explanation,
    technicalBreakdown: {
      chartStructure: Math.round(ms.chartStructure?.score ?? ms.overallScore),
      trend: Math.round(ms.trend?.score ?? 50),
      momentum: Math.round(ms.momentum?.score ?? 50),
      supportResistance: Math.round(ms.supportResistance?.score ?? 50),
      volatility: Math.round(ms.volatility?.score ?? 50),
      patterns: Math.round(ms.patterns?.score ?? 50),
      multiTimeframe: Math.round(ms.multiTimeframeAlignment?.score ?? 50),
    },
    catalystBreakdown: {
      recentDevelopments: Math.round(cat.recentDevelopments?.score ?? 50),
      eventImportance: Math.round(cat.eventImportance?.score ?? 50),
      sentiment: Math.round(cat.sentiment?.score ?? 50),
      urgency: Math.round(cat.urgency?.score ?? 50),
      catalystBalance: Math.round(cat.catalystBalance?.score ?? 50),
    },
    scoreWeights: weights,
    analyzedAt: fullThesis.analyzedAt,
    isMock: !quote,
  };
}

async function persistSearch(userId: string, ticker: string, healthScore: number, actionLabel: string) {
  await prisma.stockSearchHistory.upsert({
    where: { userId_ticker: { userId, ticker } },
    create: { userId, ticker, lastHealthScore: healthScore, lastActionLabel: actionLabel, searchCount: 1, lastSearchedAt: new Date() },
    update: { lastHealthScore: healthScore, lastActionLabel: actionLabel, searchCount: { increment: 1 }, lastSearchedAt: new Date() },
  });
}

export async function getSearchHistory(userId: string, limit = 20) {
  return prisma.stockSearchHistory.findMany({
    where: { userId },
    orderBy: { lastSearchedAt: 'desc' },
    take: limit,
  });
}

export async function clearSearchHistory(userId: string) {
  await prisma.stockSearchHistory.deleteMany({ where: { userId } });
}
