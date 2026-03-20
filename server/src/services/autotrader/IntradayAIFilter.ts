import axios from 'axios';
import type { IntradaySignal } from './IntradaySignalEngine';
import { detectRegime } from '../market/RegimeDetector';

export interface AIFilteredSignal extends IntradaySignal {
  aiApproved:    boolean;
  aiConviction:  number;
  aiReasoning:   string;
  aiRiskWarning: string | null;
  aiHoldMinutes: number;
}

export async function filterSignalsWithAI(
  signals: IntradaySignal[],
  maxSignals = 3,
): Promise<AIFilteredSignal[]> {
  if (signals.length === 0) return [];

  if (!process.env.ANTHROPIC_API_KEY) {
    return signals.slice(0, maxSignals).map(s => ({
      ...s,
      aiApproved:    s.momentumScore >= 70,
      aiConviction:  s.momentumScore,
      aiReasoning:   `Auto-approved: momentum score ${s.momentumScore}/100`,
      aiRiskWarning: null,
      aiHoldMinutes: s.assetClass === 'crypto' ? 30 : 60,
    }));
  }

  let regime = 'UNKNOWN';
  let vix: number | null = null;
  try {
    const r = await detectRegime();
    regime = r.regime;
    vix    = r.vix;
  } catch { /* non-fatal */ }

  const prompt = `You are an expert intraday trader and risk manager. Evaluate these momentum signals and decide which ones to trade.

Market context:
- Current market regime: ${regime}
- VIX: ${vix?.toFixed(1) ?? 'unknown'}
- Time: ${new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York' })} ET

Signals detected (sorted by momentum score):
${signals.slice(0, 8).map((s, i) => `
${i + 1}. ${s.symbol} (${s.assetClass}) — ${s.direction}
   Score: ${s.momentumScore}/100 | Trigger: ${s.triggerType}
   Price: $${s.currentPrice.toFixed(2)} | Stop: $${s.suggestedStop.toFixed(2)} | Target: $${s.suggestedTarget.toFixed(2)}
   R:R: ${s.riskRewardRatio}:1 | Reasoning: ${s.reasoning}
`).join('')}

For each signal, evaluate:
1. Does this fit the current market regime? (BULL_TREND favors longs, CHOPPY needs higher quality, ELEVATED_VOLATILITY widens stops)
2. Is the R:R ratio acceptable for intraday (minimum 1.5:1)?
3. Are there any risk factors (earnings, news, correlated positions)?
4. How long should this be held (minutes to hours)?

Respond ONLY with a JSON array, no other text:
[
  {
    "symbol": "AAPL",
    "approved": true,
    "conviction": 82,
    "reasoning": "Clean VWAP reclaim on above-average volume. Bull regime supports long entries.",
    "riskWarning": null,
    "holdMinutes": 45
  }
]

Approve maximum ${maxSignals} signals. Reject anything with R:R below 1.5, anything in bear-crisis regime, or anything that looks like a false breakout.`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'x-api-key':         process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type':      'application/json',
        },
        timeout: 15_000,
      },
    );

    const text    = response.data?.content?.[0]?.text ?? '';
    const clean   = text.replace(/```json|```/g, '').trim();
    const decisions: Array<{
      symbol:      string;
      approved:    boolean;
      conviction:  number;
      reasoning:   string;
      riskWarning: string | null;
      holdMinutes: number;
    }> = JSON.parse(clean);

    return signals.map(signal => {
      const decision = decisions.find(d => d.symbol === signal.symbol);
      return {
        ...signal,
        aiApproved:    decision?.approved ?? false,
        aiConviction:  decision?.conviction ?? 0,
        aiReasoning:   decision?.reasoning ?? 'Not evaluated by AI',
        aiRiskWarning: decision?.riskWarning ?? null,
        aiHoldMinutes: decision?.holdMinutes ?? 60,
      };
    });
  } catch (err: any) {
    console.warn('[IntradayAI] AI filter failed, using score-based fallback:', err?.message);
    return signals.slice(0, maxSignals).map(s => ({
      ...s,
      aiApproved:    s.momentumScore >= 72,
      aiConviction:  s.momentumScore,
      aiReasoning:   `Fallback approval: momentum ${s.momentumScore}/100`,
      aiRiskWarning: null,
      aiHoldMinutes: s.assetClass === 'crypto' ? 30 : 60,
    }));
  }
}
