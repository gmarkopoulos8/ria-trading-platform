import axios from 'axios';
import { prisma } from '../../lib/prisma';
import { detectRegime } from '../market/RegimeDetector';
import { getPortfolioState } from '../portfolio/PortfolioStateService';
import type { AutoTradeSignal, AutoTradeConfig } from './AutoTradeExecutor';

export interface ClaudeTradeDecision {
  symbol:                  string;
  approved:                boolean;
  adjustedPositionSizePct: number | null;
  stopLossOverride:        number | null;
  takeProfitOverride:      number | null;
  holdWindowDays:          number;
  reasoning:               string;
  riskWarning:             string | null;
  exitCondition:           string | null;
  confidenceInDecision:    number;
}

export interface BrainResult {
  decisions:    Map<string, ClaudeTradeDecision>;
  modelUsed:    string;
  tokensUsed:   number;
  processingMs: number;
  fallback:     boolean;
}

async function buildContext(
  signals: AutoTradeSignal[],
  config:  AutoTradeConfig,
  userId:  string,
): Promise<string> {
  const [regime, portfolio] = await Promise.all([
    detectRegime().catch(() => null),
    getPortfolioState().catch(() => null),
  ]);

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [recentTrades, openPositions] = await Promise.all([
    prisma.autoTradeLog.findMany({
      where:   { phase: 'ENTRY', executedAt: { gte: weekAgo }, status: { in: ['FILLED', 'DRY_RUN'] } },
      orderBy: { executedAt: 'desc' },
      take:    10,
      select:  { symbol: true, entryPrice: true, stopLoss: true, takeProfit: true, convictionScore: true, executedAt: true, pnl: true },
    }),
    prisma.autoTradeLog.findMany({
      where:  { phase: 'ENTRY', status: { in: ['FILLED', 'DRY_RUN'] } },
      select: { symbol: true, entryPrice: true, convictionScore: true },
      take:   20,
    }),
  ]);

  const openSymbols = openPositions.map(p => p.symbol);

  return `You are the autonomous trading brain for RIA BOT, an AI trading platform. You make final trade decisions with full accountability.

## CURRENT MARKET STATE
Regime: ${regime?.regime ?? 'UNKNOWN'} | VIX: ${regime?.vix?.toFixed(1) ?? 'N/A'}
SPY above 50 SMA: ${regime?.spyAbove50sma ?? 'N/A'} | SPY above 200 SMA: ${regime?.spyAbove200sma ?? 'N/A'}
Recent SPY drawdown: ${(regime as any)?.spyRecentDrawdown?.toFixed(1) ?? '0'}%

## PORTFOLIO STATE
Total equity: $${portfolio?.totalEquity?.toFixed(2) ?? 'N/A'}
Open positions: ${portfolio?.openPositionCount ?? 0} | Today's P&L: ${portfolio?.dailyPnl !== undefined ? (portfolio.dailyPnl >= 0 ? '+' : '') + '$' + portfolio.dailyPnl.toFixed(2) : 'N/A'}
Currently holding: ${openSymbols.length > 0 ? openSymbols.join(', ') : 'nothing'}

## RECENT TRADE HISTORY (last 7 days)
${recentTrades.length === 0
  ? 'No recent trades.'
  : recentTrades.map(t =>
      `${t.symbol} @ $${t.entryPrice?.toFixed(2) ?? '?'} | Conviction: ${t.convictionScore} | P&L: ${t.pnl !== null ? (t.pnl >= 0 ? '+' : '') + '$' + t.pnl?.toFixed(2) : 'open'}`
    ).join('\n')
}

## CONFIG
Mode: ${config.dryRun ? 'DRY RUN (no real money)' : 'LIVE PAPER TRADING'}
Default stop loss: ${config.stopLossPct}% | Default target: ${config.takeProfitPct}%
Max position size: ${config.maxPositionPct}% of portfolio

## PROPOSED TRADES (${signals.length} signals from today's scan)
${signals.map((s, i) => `
### Signal ${i + 1}: ${s.symbol} (${s.assetClass ?? 'STOCK'})
- Bias: ${s.bias} | Action: ${(s as any).recommendedAction ?? 'BUY'}
- Conviction: ${s.convictionScore}/100 | Confidence: ${s.confidenceScore}/100 | Risk score: ${s.riskScore ?? 'N/A'}/100
- Entry zone: ${s.entryPrice ? '$' + s.entryPrice.toFixed(2) : 'market'} | Stop: ${s.stopLoss ? '$' + s.stopLoss.toFixed(2) : 'default'} | Target: ${s.takeProfit ? '$' + s.takeProfit.toFixed(2) : 'default'}
- Setup: ${s.setupType ?? 'scan signal'} | Hold window: ${(s as any).suggestedHoldWindow ?? '2-4 WEEKS'}
- Thesis: ${s.reason ?? 'No thesis available'}
- Supporting reasons: ${(s as any).supportingReasons?.join('; ') ?? 'N/A'}
- Main risk: ${(s as any).mainRiskToThesis ?? 'N/A'}
- Market structure score: ${(s as any).marketStructureScore ?? 'N/A'}/100
- Catalyst score: ${(s as any).catalystScore ?? 'N/A'}/100
- Already holding this: ${openSymbols.includes(s.symbol) ? 'YES — consider position sizing carefully' : 'no'}
`).join('')}`;
}

export async function runClaudeTradingBrain(
  signals: AutoTradeSignal[],
  config:  AutoTradeConfig,
  userId:  string,
): Promise<BrainResult> {
  const start = Date.now();

  const makeFallback = (reason: string): BrainResult => ({
    decisions: new Map(
      signals.map(s => [s.symbol, {
        symbol:                  s.symbol,
        approved:                s.convictionScore >= (config.minConvictionScore ?? 70),
        adjustedPositionSizePct: null,
        stopLossOverride:        null,
        takeProfitOverride:      null,
        holdWindowDays:          14,
        reasoning:               `Fallback approval: ${reason}`,
        riskWarning:             null,
        exitCondition:           null,
        confidenceInDecision:    60,
      }])
    ),
    modelUsed:    'fallback',
    tokensUsed:   0,
    processingMs: Date.now() - start,
    fallback:     true,
  });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)          return makeFallback('ANTHROPIC_API_KEY not configured');
  if (signals.length === 0) return makeFallback('No signals to evaluate');

  try {
    const context = await buildContext(signals, config, userId);

    const prompt = `${context}

## YOUR TASK

Evaluate each proposed trade and return a JSON array with one decision per signal.

For each signal decide:
1. **approved**: Should this trade execute? Consider: regime fit, conviction quality, portfolio concentration, correlation with existing positions, recent performance, macro risk.
2. **adjustedPositionSizePct**: Override the default position size (0.5–${config.maxPositionPct}%). Reduce if: high portfolio correlation, uncertain setup, elevated regime risk. Increase (up to ${config.maxPositionPct}%) if: highest conviction, low portfolio correlation, strong catalyst.
3. **stopLossOverride**: Override the stop loss price if the scan's stop seems wrong. null to keep the scan's stop.
4. **takeProfitOverride**: Override the take profit if you see a better target. null to keep the scan's target.
5. **holdWindowDays**: How many calendar days to hold this position (3–90).
6. **reasoning**: 1–2 sentences explaining the decision. Be specific — mention the setup, catalyst, or risk that drove the decision.
7. **riskWarning**: Any specific near-term risk (earnings, Fed meeting, macro event, sector headwind). null if none.
8. **exitCondition**: A plain-English rule for when to exit regardless of stop (e.g. "Exit if daily close below 200d SMA"). null if the stop covers it.
9. **confidenceInDecision**: 0–100 how confident you are in this decision.

**Rules:**
- Approve at most ${Math.min(signals.length, config.maxOpenPositions ?? 3)} signals
- Reject if: conviction < 68, regime is BEAR_CRISIS and bias is BULLISH, already holding same sector with 2+ positions, obvious near-term binary event
- Reduce size if: holding correlated position, elevated volatility, CHOPPY regime
- NEVER approve more than you have portfolio capacity for
- This is ${config.dryRun ? 'DRY RUN — no real money at risk' : 'REAL paper trading — be appropriately selective'}

Respond ONLY with a JSON array. No markdown, no explanation outside the JSON:
[
  {
    "symbol": "AAPL",
    "approved": true,
    "adjustedPositionSizePct": 3.0,
    "stopLossOverride": null,
    "takeProfitOverride": 195.00,
    "holdWindowDays": 14,
    "reasoning": "Clean breakout above resistance with volume confirmation. Services revenue momentum intact.",
    "riskWarning": "iPhone 17 launch in 6 weeks — market may price in ahead of time",
    "exitCondition": "Exit if weekly close below 50-week SMA",
    "confidenceInDecision": 78
  }
]`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages:   [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key':         apiKey,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        timeout: 30_000,
      },
    );

    const rawText    = response.data?.content?.[0]?.text ?? '[]';
    const tokensUsed = (response.data?.usage?.input_tokens ?? 0) + (response.data?.usage?.output_tokens ?? 0);
    const cleaned    = rawText.replace(/```json|```/g, '').trim();
    const parsed: ClaudeTradeDecision[] = JSON.parse(cleaned);

    const decisions = new Map<string, ClaudeTradeDecision>();
    for (const d of parsed) {
      if (d.symbol) decisions.set(d.symbol, d);
    }

    for (const s of signals) {
      if (!decisions.has(s.symbol)) {
        decisions.set(s.symbol, {
          symbol:                  s.symbol,
          approved:                false,
          adjustedPositionSizePct: null,
          stopLossOverride:        null,
          takeProfitOverride:      null,
          holdWindowDays:          0,
          reasoning:               'Not included in Claude\'s approved list',
          riskWarning:             null,
          exitCondition:           null,
          confidenceInDecision:    0,
        });
      }
    }

    const approved = [...decisions.values()].filter(d => d.approved).length;
    console.info(`[ClaudeBrain] Evaluated ${signals.length} signals → ${approved} approved | ${tokensUsed} tokens | ${Date.now() - start}ms`);

    return {
      decisions,
      modelUsed:    'claude-sonnet-4-20250514',
      tokensUsed,
      processingMs: Date.now() - start,
      fallback:     false,
    };

  } catch (err: any) {
    console.warn('[ClaudeBrain] API call failed, using fallback:', err?.message);
    return makeFallback(err?.message ?? 'API error');
  }
}
