import { marketService } from './MarketService';

export type MarketRegime = 'BULL_TREND' | 'CHOPPY' | 'ELEVATED_VOLATILITY' | 'BEAR_CRISIS';

export interface RegimeState {
  regime: MarketRegime;
  vix: number | null;
  spyAbove50sma: boolean;
  spyAbove200sma: boolean;
  spyRecentDrawdown: number;
  description: string;
  autoTraderAdjustments: {
    minConvictionOverride: number;
    positionSizeMultiplier: number;
    allowNewEntries: boolean;
    longOnly: boolean;
  };
  detectedAt: Date;
}

const REGIME_CACHE_TTL = 15 * 60 * 1000;
let _regimeCache: { state: RegimeState; ts: number } | null = null;

const ADJUSTMENTS: Record<MarketRegime, RegimeState['autoTraderAdjustments']> = {
  BULL_TREND:          { minConvictionOverride: 78,  positionSizeMultiplier: 1.0,  allowNewEntries: true,  longOnly: false },
  CHOPPY:              { minConvictionOverride: 85,  positionSizeMultiplier: 0.60, allowNewEntries: true,  longOnly: true  },
  ELEVATED_VOLATILITY: { minConvictionOverride: 88,  positionSizeMultiplier: 0.40, allowNewEntries: true,  longOnly: true  },
  BEAR_CRISIS:         { minConvictionOverride: 99,  positionSizeMultiplier: 0.0,  allowNewEntries: false, longOnly: true  },
};

function computeSMA(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function classifyRegime(
  vix: number | null,
  spyAbove50: boolean,
  spyAbove200: boolean,
  drawdownPct: number,
): MarketRegime {
  if (vix !== null && vix > 30) return 'BEAR_CRISIS';
  if (vix !== null && vix > 22) return 'ELEVATED_VOLATILITY';
  if (!spyAbove200 || drawdownPct > 10) return 'BEAR_CRISIS';
  if (!spyAbove50 || drawdownPct > 5) return 'ELEVATED_VOLATILITY';
  if (spyAbove50 && spyAbove200 && (vix === null || vix < 18)) return 'BULL_TREND';
  return 'CHOPPY';
}

const DESCRIPTIONS: Record<MarketRegime, string> = {
  BULL_TREND: 'SPY trending above both SMAs with low volatility — favorable conditions for new entries',
  CHOPPY: 'Sideways price action — higher conviction required, long-only mode active',
  ELEVATED_VOLATILITY: 'Elevated VIX/drawdown — reduced size, long-only, strict conviction threshold',
  BEAR_CRISIS: 'Bear market or crisis conditions — new entries blocked, existing positions monitored only',
};

export async function detectRegime(): Promise<RegimeState> {
  if (_regimeCache && Date.now() - _regimeCache.ts < REGIME_CACHE_TTL) {
    return _regimeCache.state;
  }

  let vix: number | null = null;
  let spyAbove50 = true;
  let spyAbove200 = true;
  let spyRecentDrawdown = 0;

  try {
    const vixQuote = await marketService.quote('^VIX', 'stock');
    vix = vixQuote?.price ?? null;
  } catch {
    vix = null;
  }

  try {
    const spyBars = await marketService.history('SPY', '3M', 'stock');
    if (spyBars.length >= 20) {
      const closes = spyBars.map((b) => b.close);
      const currentClose = closes[closes.length - 1];
      const sma50 = computeSMA(closes, Math.min(50, closes.length));
      const sma200 = computeSMA(closes, Math.min(200, closes.length));
      spyAbove50 = sma50 !== null ? currentClose > sma50 : true;
      spyAbove200 = sma200 !== null ? currentClose > sma200 : true;
      const peak = Math.max(...closes);
      spyRecentDrawdown = peak > 0 ? ((peak - currentClose) / peak) * 100 : 0;
    }
  } catch {
    // keep defaults
  }

  const regime = classifyRegime(vix, spyAbove50, spyAbove200, spyRecentDrawdown);
  const state: RegimeState = {
    regime,
    vix,
    spyAbove50sma: spyAbove50,
    spyAbove200sma: spyAbove200,
    spyRecentDrawdown,
    description: DESCRIPTIONS[regime],
    autoTraderAdjustments: ADJUSTMENTS[regime],
    detectedAt: new Date(),
  };

  _regimeCache = { state, ts: Date.now() };
  return state;
}
