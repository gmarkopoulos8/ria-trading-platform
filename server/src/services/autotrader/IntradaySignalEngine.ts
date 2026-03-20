import { marketService } from '../market/MarketService';
import { livePriceManager } from '../market/LivePriceManager';
import { getAllMids } from '../hyperliquid/hyperliquidInfoService';
import { tickBarAggregator } from '../market/TickBarAggregator';
import { get1MinCandles, candleSnapToOHLCV } from '../hyperliquid/hyperliquidInfoService';
import type { OHLCVBar } from '../technical/types';

export interface IntradaySignal {
  symbol:          string;
  assetClass:      'stock' | 'crypto';
  exchange:        'TOS' | 'HYPERLIQUID' | 'PAPER';
  currentPrice:    number;
  momentumScore:   number;
  direction:       'LONG' | 'SHORT';
  triggerType:     'VWAP_RECLAIM' | 'VOLUME_SURGE_BREAKOUT' | 'RSI_MOMENTUM' | 'PRICE_BREAKOUT' | 'CRYPTO_SURGE';
  suggestedEntry:  number;
  suggestedStop:   number;
  suggestedTarget: number;
  riskRewardRatio: number;
  reasoning:       string;
  detectedAt:      Date;
  barsAnalyzed:    number;
}

export type ScanTimeframe = '1min' | '3min' | '5min';

const INTRADAY_STOCK_WATCHLIST = [
  'SPY', 'QQQ', 'AAPL', 'NVDA', 'TSLA', 'MSFT', 'META', 'AMZN',
  'AMD', 'GOOGL', 'NFLX', 'CRM', 'COIN', 'MSTR', 'PLTR', 'SMCI',
];

const INTRADAY_CRYPTO_WATCHLIST = ['BTC', 'ETH', 'SOL', 'AVAX', 'LINK', 'DOGE'];

function computeVWAP(bars: OHLCVBar[]): number {
  let cumTPV = 0, cumVol = 0;
  for (const bar of bars) {
    const tp = (bar.high + bar.low + bar.close) / 3;
    cumTPV  += tp * bar.volume;
    cumVol  += bar.volume;
  }
  return cumVol > 0 ? cumTPV / cumVol : bars[bars.length - 1].close;
}

export function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const deltas = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (deltas[i] > 0) avgGain += deltas[i]; else avgLoss += Math.abs(deltas[i]);
  }
  avgGain /= period; avgLoss /= period;
  for (let i = period; i < deltas.length; i++) {
    const g = deltas[i] > 0 ? deltas[i] : 0;
    const l = deltas[i] < 0 ? Math.abs(deltas[i]) : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export function computeVolumeSurge(bars: OHLCVBar[]): number {
  if (bars.length < 10) return 1;
  const avg = bars.slice(-10, -1).reduce((s, b) => s + b.volume, 0) / 9;
  const cur = bars[bars.length - 1].volume;
  return avg > 0 ? cur / avg : 1;
}

function computeATRPct(bars: OHLCVBar[], period = 10): number {
  if (bars.length < 2) return 1;
  const trs = bars.slice(-period).map((b, i, arr) => {
    if (i === 0) return b.high - b.low;
    const prev = arr[i - 1];
    return Math.max(b.high - b.low, Math.abs(b.high - prev.close), Math.abs(b.low - prev.close));
  });
  const atr = trs.reduce((s, t) => s + t, 0) / trs.length;
  const price = bars[bars.length - 1].close;
  return (atr / price) * 100;
}

function scoreStockSignal(bars: OHLCVBar[], symbol: string): IntradaySignal | null {
  if (bars.length < 20) return null;

  const price      = bars[bars.length - 1].close;
  const vwap       = computeVWAP(bars);
  const closes     = bars.map(b => b.close);
  const rsi5       = computeRSI(closes.slice(-20), 7);
  const volSurge   = computeVolumeSurge(bars);
  const atrPct     = computeATRPct(bars);
  const recentHigh = Math.max(...bars.slice(-20, -1).map(b => b.high));
  const recentLow  = Math.min(...bars.slice(-20, -1).map(b => b.low));
  const last3Change = (price - bars[bars.length - 4].close) / bars[bars.length - 4].close * 100;

  let score = 0;
  let direction: 'LONG' | 'SHORT' = 'LONG';
  let trigger: IntradaySignal['triggerType'] = 'RSI_MOMENTUM';
  let reasoning = '';

  const prevPrice = bars[bars.length - 2].close;
  if (prevPrice < vwap && price > vwap && volSurge >= 1.5) {
    score = 72 + Math.min(18, volSurge * 5);
    direction = 'LONG'; trigger = 'VWAP_RECLAIM';
    reasoning = `VWAP reclaim at $${vwap.toFixed(2)} with ${volSurge.toFixed(1)}× volume surge`;
  } else if (prevPrice > vwap && price < vwap && volSurge >= 1.5) {
    score = 68 + Math.min(15, volSurge * 4);
    direction = 'SHORT'; trigger = 'VWAP_RECLAIM';
    reasoning = `VWAP breakdown below $${vwap.toFixed(2)} with ${volSurge.toFixed(1)}× volume`;
  } else if (volSurge >= 2.5 && price > recentHigh * 1.002) {
    score = 75 + Math.min(15, (volSurge - 2.5) * 8);
    direction = 'LONG'; trigger = 'VOLUME_SURGE_BREAKOUT';
    reasoning = `Volume surge ${volSurge.toFixed(1)}× breaking above ${recentHigh.toFixed(2)} resistance`;
  } else if (volSurge >= 2.5 && price < recentLow * 0.998) {
    score = 70 + Math.min(15, (volSurge - 2.5) * 6);
    direction = 'SHORT'; trigger = 'VOLUME_SURGE_BREAKOUT';
    reasoning = `Volume surge ${volSurge.toFixed(1)}× breaking below ${recentLow.toFixed(2)} support`;
  } else if (rsi5 !== null && rsi5 >= 65 && last3Change > 0.3 && volSurge >= 1.3) {
    score = 60 + Math.min(20, rsi5 - 60);
    direction = 'LONG'; trigger = 'RSI_MOMENTUM';
    reasoning = `RSI momentum ${rsi5.toFixed(0)} with ${last3Change.toFixed(2)}% 3-bar move`;
  } else if (rsi5 !== null && rsi5 <= 35 && last3Change < -0.3 && volSurge >= 1.3) {
    score = 60 + Math.min(20, 35 - rsi5);
    direction = 'SHORT'; trigger = 'RSI_MOMENTUM';
    reasoning = `RSI breakdown ${rsi5.toFixed(0)} with ${Math.abs(last3Change).toFixed(2)}% 3-bar decline`;
  } else if (price > recentHigh * 1.005 && volSurge >= 1.2) {
    score = 62; direction = 'LONG'; trigger = 'PRICE_BREAKOUT';
    reasoning = `Price breakout above ${recentHigh.toFixed(2)} resistance`;
  }

  if (score < 60) return null;

  const stopPct   = Math.max(0.5, Math.min(2.0, atrPct * 1.5));
  const targetPct = Math.max(stopPct * 2, Math.min(4.0, stopPct * 2.5));
  const stop      = direction === 'LONG' ? price * (1 - stopPct / 100) : price * (1 + stopPct / 100);
  const target    = direction === 'LONG' ? price * (1 + targetPct / 100) : price * (1 - targetPct / 100);

  return {
    symbol, assetClass: 'stock', exchange: 'PAPER',
    currentPrice: price, momentumScore: Math.round(score), direction, triggerType: trigger,
    suggestedEntry: price, suggestedStop: stop, suggestedTarget: target,
    riskRewardRatio: Math.round((targetPct / stopPct) * 10) / 10,
    reasoning, detectedAt: new Date(), barsAnalyzed: bars.length,
  };
}

function scoreCryptoSignal(symbol: string, currentPrice: number, recentPrices: number[]): IntradaySignal | null {
  if (recentPrices.length < 10) return null;

  const rsi         = computeRSI(recentPrices, 7);
  const priceChange = (currentPrice - recentPrices[0]) / recentPrices[0] * 100;
  const shortChange = (currentPrice - recentPrices[recentPrices.length - 3]) / recentPrices[recentPrices.length - 3] * 100;

  let score = 0, direction: 'LONG' | 'SHORT' = 'LONG', reasoning = '';

  if (priceChange > 1.5 && shortChange > 0.5 && rsi !== null && rsi > 55) {
    score = 65 + Math.min(20, priceChange * 5); direction = 'LONG';
    reasoning = `Crypto surge: +${priceChange.toFixed(2)}% with RSI ${rsi.toFixed(0)}`;
  } else if (priceChange < -1.5 && shortChange < -0.5 && rsi !== null && rsi < 45) {
    score = 65 + Math.min(20, Math.abs(priceChange) * 5); direction = 'SHORT';
    reasoning = `Crypto decline: ${priceChange.toFixed(2)}% with RSI ${rsi.toFixed(0)}`;
  }

  if (score < 62) return null;

  const stop   = direction === 'LONG' ? currentPrice * 0.99  : currentPrice * 1.01;
  const target = direction === 'LONG' ? currentPrice * 1.025 : currentPrice * 0.975;

  return {
    symbol, assetClass: 'crypto', exchange: 'HYPERLIQUID',
    currentPrice, momentumScore: Math.round(score), direction, triggerType: 'CRYPTO_SURGE',
    suggestedEntry: currentPrice, suggestedStop: stop, suggestedTarget: target,
    riskRewardRatio: 2.5,
    reasoning, detectedAt: new Date(), barsAnalyzed: recentPrices.length,
  };
}

const _barCache = new Map<string, { bars: OHLCVBar[]; ts: number }>();
const BAR_CACHE_TTL = 4 * 60_000;

export async function scanIntradaySignals(
  enabledExchanges: { stocks: boolean; crypto: boolean } = { stocks: true, crypto: true },
): Promise<IntradaySignal[]> {
  const signals: IntradaySignal[] = [];

  if (enabledExchanges.stocks) {
    for (const symbol of INTRADAY_STOCK_WATCHLIST) {
      try {
        const cached = _barCache.get(symbol);
        let bars: OHLCVBar[];
        if (cached && Date.now() - cached.ts < BAR_CACHE_TTL) {
          bars = cached.bars;
        } else {
          bars = await marketService.history(symbol, '1D', 'stock');
          _barCache.set(symbol, { bars, ts: Date.now() });
        }
        const livePrice = livePriceManager.getLastPrice(symbol);
        if (livePrice && bars.length > 0) {
          bars = [...bars.slice(0, -1), { ...bars[bars.length - 1], close: livePrice }];
        }
        const signal = scoreStockSignal(bars, symbol);
        if (signal) { livePriceManager.subscribe(symbol, () => {}); signals.push(signal); }
      } catch { /* skip */ }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  if (enabledExchanges.crypto) {
    try {
      const mids = await getAllMids();
      for (const symbol of INTRADAY_CRYPTO_WATCHLIST) {
        const currentPrice = mids[symbol] ? parseFloat(mids[symbol]) : null;
        if (!currentPrice) continue;
        const cached = _barCache.get(`crypto:${symbol}`);
        let priceHistory: number[] = [];
        if (cached && Date.now() - cached.ts < BAR_CACHE_TTL) {
          priceHistory = cached.bars.map(b => b.close);
        } else {
          const bars = await marketService.history(symbol, '1D', 'crypto').catch(() => [] as OHLCVBar[]);
          _barCache.set(`crypto:${symbol}`, { bars, ts: Date.now() });
          priceHistory = bars.map(b => b.close);
        }
        priceHistory.push(currentPrice);
        const signal = scoreCryptoSignal(symbol, currentPrice, priceHistory);
        if (signal) signals.push(signal);
      }
    } catch { /* HL not connected */ }
  }

  return signals.sort((a, b) => b.momentumScore - a.momentumScore);
}

// ─── Subscribe all watchlist symbols to tick aggregator ───────────────────────

export function subscribeWatchlistToTicks(): void {
  for (const symbol of INTRADAY_STOCK_WATCHLIST) {
    tickBarAggregator.subscribe(symbol);
    livePriceManager.subscribe(symbol, () => {});
  }
  console.info('[IntradayEngine] Subscribed to tick data for', INTRADAY_STOCK_WATCHLIST.length, 'symbols');
}

// ─── Fast scan using 1-min bars ───────────────────────────────────────────────

export async function scanFastSignals(timeframe: ScanTimeframe = '1min'): Promise<IntradaySignal[]> {
  const signals: IntradaySignal[] = [];

  // Crypto: 1-minute candles from Hyperliquid
  for (const symbol of INTRADAY_CRYPTO_WATCHLIST) {
    try {
      const rawCandles = await get1MinCandles(symbol, timeframe === '1min' ? 30 : 20);
      if (rawCandles.length < 10) continue;

      const bars         = rawCandles.map(candleSnapToOHLCV);
      const currentPrice = bars[bars.length - 1].close;
      const closes       = bars.map(b => b.close);
      const rsi          = computeRSI(closes, 7);
      const vwap         = computeVWAP(bars);
      const volSurge     = computeVolumeSurge(bars);
      const shortChange  = bars.length >= 4
        ? (currentPrice - bars[bars.length - 4].close) / bars[bars.length - 4].close * 100
        : 0;

      let score = 0, direction: 'LONG' | 'SHORT' = 'LONG';
      let trigger: IntradaySignal['triggerType'] = 'CRYPTO_SURGE', reasoning = '';

      if (rsi !== null && rsi > 68 && shortChange > 0.8 && volSurge >= 1.4) {
        score = 70 + Math.min(20, rsi - 65); direction = 'LONG';
        reasoning = `1-min scalp: RSI ${rsi.toFixed(0)}, +${shortChange.toFixed(2)}% in 3 bars, ${volSurge.toFixed(1)}× vol`;
      } else if (rsi !== null && rsi < 32 && shortChange < -0.8 && volSurge >= 1.4) {
        score = 70 + Math.min(20, 32 - rsi); direction = 'SHORT';
        reasoning = `1-min scalp short: RSI ${rsi.toFixed(0)}, ${shortChange.toFixed(2)}% drop in 3 bars`;
      } else if (currentPrice > vwap * 1.003 && bars[bars.length - 2].close < vwap && volSurge >= 1.5) {
        score = 68; direction = 'LONG'; trigger = 'VWAP_RECLAIM';
        reasoning = `1-min VWAP reclaim at $${vwap.toFixed(2)}`;
      }

      if (score < 65) continue;

      const stopPct = 0.4, targetPct = 1.0;
      const stop   = direction === 'LONG' ? currentPrice * (1 - stopPct / 100) : currentPrice * (1 + stopPct / 100);
      const target = direction === 'LONG' ? currentPrice * (1 + targetPct / 100) : currentPrice * (1 - targetPct / 100);

      signals.push({
        symbol, assetClass: 'crypto', exchange: 'HYPERLIQUID',
        currentPrice, momentumScore: Math.round(score), direction, triggerType: trigger,
        suggestedEntry: currentPrice, suggestedStop: stop, suggestedTarget: target,
        riskRewardRatio: targetPct / stopPct,
        reasoning: `[${timeframe}] ${reasoning}`,
        detectedAt: new Date(), barsAnalyzed: bars.length,
      });
    } catch { /* skip */ }
    await new Promise(r => setTimeout(r, 100));
  }

  // Stocks: tick-aggregated 1-min bars
  for (const symbol of INTRADAY_STOCK_WATCHLIST) {
    try {
      if (!tickBarAggregator.hasEnoughBars(symbol, 10)) continue;
      const bars         = tickBarAggregator.getBars(symbol, true);
      if (bars.length < 10) continue;
      const currentPrice = tickBarAggregator.getLastPrice(symbol) ?? bars[bars.length - 1].close;
      const closes       = bars.map(b => b.close);
      const vwap         = computeVWAP(bars);
      const rsi          = computeRSI(closes, 7);
      const volSurge     = computeVolumeSurge(bars);
      const shortChange  = bars.length >= 4
        ? (currentPrice - bars[bars.length - 4].close) / bars[bars.length - 4].close * 100
        : 0;

      let score = 0, direction: 'LONG' | 'SHORT' = 'LONG';
      let trigger: IntradaySignal['triggerType'] = 'RSI_MOMENTUM', reasoning = '';

      if (rsi !== null && rsi > 70 && shortChange > 0.3 && volSurge >= 1.8) {
        score = 68 + Math.min(17, rsi - 68); direction = 'LONG';
        reasoning = `1-min tick: RSI ${rsi.toFixed(0)}, +${shortChange.toFixed(2)}% move, ${volSurge.toFixed(1)}× ticks`;
      } else if (rsi !== null && rsi < 30 && shortChange < -0.3 && volSurge >= 1.8) {
        score = 68 + Math.min(17, 30 - rsi); direction = 'SHORT';
        reasoning = `1-min tick short: RSI ${rsi.toFixed(0)}, ${shortChange.toFixed(2)}% drop`;
      } else if (currentPrice > vwap * 1.002 && bars[bars.length - 2].close < vwap && volSurge >= 2.0) {
        score = 72; direction = 'LONG'; trigger = 'VWAP_RECLAIM';
        reasoning = `1-min VWAP reclaim (tick bars) at $${vwap.toFixed(2)}`;
      }

      if (score < 65) continue;

      const stopPct = 0.25, targetPct = 0.60;
      const stop   = direction === 'LONG' ? currentPrice * (1 - stopPct / 100) : currentPrice * (1 + stopPct / 100);
      const target = direction === 'LONG' ? currentPrice * (1 + targetPct / 100) : currentPrice * (1 - targetPct / 100);

      signals.push({
        symbol, assetClass: 'stock', exchange: 'PAPER',
        currentPrice, momentumScore: Math.round(score), direction, triggerType: trigger,
        suggestedEntry: currentPrice, suggestedStop: stop, suggestedTarget: target,
        riskRewardRatio: Math.round(targetPct / stopPct * 10) / 10,
        reasoning: `[${timeframe}] ${reasoning}`,
        detectedAt: new Date(), barsAnalyzed: bars.length,
      });
    } catch { /* skip */ }
  }

  return signals.sort((a, b) => b.momentumScore - a.momentumScore);
}
