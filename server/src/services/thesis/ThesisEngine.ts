import { marketService } from '../market/MarketService';
import { technicalService } from '../technical/TechnicalService';
import { newsService } from '../news/NewsService';
import { finnhubProvider } from '../market/stocks/FinnhubProvider';
import { runMarketStructureAgent } from './MarketStructureAgent';
import { runCatalystAgent } from './CatalystAgent';
import { runRiskAgent } from './RiskAgent';
import { runThesisAgent } from './ThesisAgent';
import { isCryptoSymbol } from '../market/utils';
import prisma from '../../lib/prisma';
import type {
  FullThesisResult, ThesisSummary, MarketStructureOutput, CatalystOutput, RiskOutput,
} from './types';

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { result: FullThesisResult; ts: number }>();

const SCAN_TICKERS = [
  { ticker: 'NVDA', name: 'NVIDIA Corp', assetClass: 'stock' },
  { ticker: 'TSLA', name: 'Tesla Inc', assetClass: 'stock' },
  { ticker: 'AAPL', name: 'Apple Inc', assetClass: 'stock' },
  { ticker: 'AMZN', name: 'Amazon', assetClass: 'stock' },
  { ticker: 'META', name: 'Meta Platforms', assetClass: 'stock' },
  { ticker: 'MSFT', name: 'Microsoft', assetClass: 'stock' },
  { ticker: 'SPY', name: 'S&P 500 ETF', assetClass: 'stock' },
  { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto' },
  { ticker: 'ETH', name: 'Ethereum', assetClass: 'crypto' },
  { ticker: 'SOL', name: 'Solana', assetClass: 'crypto' },
];

class ThesisEngine {
  async analyze(ticker: string, assetClass?: string, opts?: { scanMode?: boolean }): Promise<FullThesisResult> {
    const key = `${ticker}:${assetClass ?? ''}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.result;

    const resolvedClass = assetClass ?? (isCryptoSymbol(ticker) ? 'crypto' : 'stock');
    const useFinnhubHistory = !!(opts?.scanMode && process.env.FINNHUB_API_KEY && resolvedClass !== 'crypto');

    const historyProvider = useFinnhubHistory
      ? () => finnhubProvider.history(ticker, '3M')
      : () => marketService.history(ticker, '3M', resolvedClass as 'stock' | 'crypto' | 'etf');

    const [quote, historyResult, catalystAnalysis] = await Promise.allSettled([
      marketService.quote(ticker, resolvedClass as 'stock' | 'crypto' | 'etf'),
      historyProvider(),
      newsService.getCatalysts(ticker, { limit: 15 }),
    ]);

    const quoteData = quote.status === 'fulfilled' ? quote.value : null;
    const bars = historyResult.status === 'fulfilled' ? historyResult.value : [];
    const catalysts = catalystAnalysis.status === 'fulfilled' ? catalystAnalysis.value : null;

    const currentPrice = quoteData?.price ?? (bars.length > 0 ? bars[bars.length - 1].close : 100);

    const [taResult, patResult] = await Promise.all([
      technicalService.analyze(ticker, bars, '3M'),
      technicalService.analyzePatterns(ticker, bars, '3M'),
    ]);

    const ms: MarketStructureOutput = runMarketStructureAgent(taResult, patResult);
    ms.currentPrice = currentPrice;

    const cat: CatalystOutput = catalysts
      ? runCatalystAgent(catalysts)
      : this.defaultCatalystOutput(ticker);

    const quoteForRisk = {
      price: currentPrice,
      volume: quoteData?.volume,
      marketCap: quoteData?.marketCap,
      assetClass: resolvedClass,
    };

    const risk: RiskOutput = runRiskAgent(ms, cat, quoteForRisk);
    const thesis = runThesisAgent(ms, cat, risk);

    const result: FullThesisResult = {
      ticker,
      marketStructure: ms,
      catalysts: cat,
      risk,
      thesis,
      analyzedAt: new Date(),
    };

    cache.set(key, { result, ts: Date.now() });
    this.persist(ticker, result, quoteData).catch(() => {});

    return result;
  }

  async scan(
    assetClass?: string,
    limit = 10
  ): Promise<ThesisSummary[]> {
    const tickers = SCAN_TICKERS.filter(
      (t) => !assetClass || t.assetClass === assetClass
    ).slice(0, Math.min(limit, SCAN_TICKERS.length));

    const results = await Promise.allSettled(
      tickers.map((t) => this.analyze(t.ticker, t.assetClass))
    );

    const summaries: ThesisSummary[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const meta = tickers[i];
      if (r.status !== 'fulfilled') continue;
      const { thesis, marketStructure } = r.value;

      let price = 100;
      let changePercent = 0;
      try {
        const q = await marketService.quote(meta.ticker, meta.assetClass as 'stock' | 'crypto' | 'etf').catch(() => null);
        if (q) { price = q.price; changePercent = q.changePercent; }
        else { price = marketStructure.currentPrice; }
      } catch {
        price = marketStructure.currentPrice;
      }

      summaries.push({
        ticker: meta.ticker,
        name: meta.name,
        price,
        changePercent,
        assetClass: meta.assetClass,
        bias: thesis.bias,
        convictionScore: thesis.convictionScore,
        confidenceScore: thesis.confidenceScore,
        riskScore: thesis.riskScore,
        recommendedAction: thesis.recommendedAction,
        thesisSummary: thesis.thesisSummary,
        entryLow: thesis.entryZone.low,
        entryHigh: thesis.entryZone.high,
        invalidation: thesis.invalidationZone.level,
        takeProfit1: thesis.takeProfit1.level,
        isMock: false,
      });
    }

    return summaries.sort((a, b) => b.convictionScore - a.convictionScore);
  }

  private defaultCatalystOutput(ticker: string): CatalystOutput {
    const base = {
      score: 50, signals: ['No catalyst data available'], description: 'N/A',
    };
    return {
      ticker,
      recentDevelopments: { ...base, count: 0 },
      eventImportance: { ...base, highImpactCount: 0 },
      sentiment: { ...base, label: 'NEUTRAL', trend: 'STABLE' },
      urgency: { ...base, urgentCount: 0 },
      sourceCredibility: { ...base, avgQuality: 50 },
      catalystBalance: { ...base, positiveCount: 0, negativeCount: 0, ratio: 0.5 },
      bullishCatalysts: 0,
      bearishCatalysts: 0,
      overallScore: 50,
      catalystBias: 'NEUTRAL',
      dominantEventType: null,
      summary: 'No catalyst data available.',
      analyzedAt: new Date(),
    };
  }

  private async persist(ticker: string, result: FullThesisResult, quote: { price: number } | null): Promise<void> {
    try {
      const symbol = await prisma.symbol.findUnique({ where: { ticker } });
      const symbolId = symbol?.id;

      await prisma.agentOutput.createMany({
        data: [
          {
            symbolId, ticker, agentType: 'MARKET_STRUCTURE',
            output: result.marketStructure as unknown as object,
            score: result.marketStructure.overallScore,
            confidence: result.marketStructure.multiTimeframeAlignment.score / 100,
          },
          {
            symbolId, ticker, agentType: 'CATALYST',
            output: result.catalysts as unknown as object,
            score: result.catalysts.overallScore,
            confidence: result.catalysts.sourceCredibility.score / 100,
          },
          {
            symbolId, ticker, agentType: 'RISK',
            output: result.risk as unknown as object,
            score: result.risk.overallRiskScore,
            confidence: result.risk.invalidationClarity.score / 100,
          },
          {
            symbolId, ticker, agentType: 'THESIS',
            output: result.thesis as unknown as object,
            score: result.thesis.thesisHealthScore,
            confidence: result.thesis.confidenceScore / 100,
          },
        ],
      });

      if (symbolId) {
        await prisma.riskScore.create({
          data: {
            symbolId,
            ticker,
            overallRisk: result.risk.overallRiskScore,
            volatilityRisk: result.risk.volatilityFit.score,
            liquidityRisk: result.risk.liquidityFit.score,
            concentrationRisk: 0,
            marketRisk: result.risk.drawdownRisk.score,
            metadata: {
              riskCategory: result.risk.riskCategory,
              mainRisks: result.risk.mainRisks,
            },
          },
        });
      }
    } catch {
    }
  }
}

export const thesisEngine = new ThesisEngine();
