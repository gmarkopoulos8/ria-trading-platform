import { livePriceManager } from './LivePriceManager';
import type { OHLCVBar } from '../technical/types';

interface TickBar {
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
  ts:     number;
}

class TickBarAggregator {
  private _bars    = new Map<string, TickBar[]>();
  private _current = new Map<string, TickBar>();
  private _unsubs  = new Map<string, () => void>();
  private readonly MAX_BARS = 60;

  subscribe(symbol: string): void {
    if (this._unsubs.has(symbol)) return;
    const unsub = livePriceManager.subscribe(symbol, (price: number) => {
      this._onTick(symbol, price);
    });
    this._unsubs.set(symbol, unsub);
  }

  unsubscribe(symbol: string): void {
    const unsub = this._unsubs.get(symbol);
    if (unsub) { unsub(); this._unsubs.delete(symbol); }
  }

  private _onTick(symbol: string, price: number): void {
    const now    = Date.now();
    const minute = Math.floor(now / 60_000) * 60_000;
    const current = this._current.get(symbol);

    if (!current || current.ts !== minute) {
      if (current) {
        const bars = this._bars.get(symbol) ?? [];
        bars.push(current);
        if (bars.length > this.MAX_BARS) bars.shift();
        this._bars.set(symbol, bars);
      }
      this._current.set(symbol, { open: price, high: price, low: price, close: price, volume: 1, ts: minute });
    } else {
      current.high    = Math.max(current.high, price);
      current.low     = Math.min(current.low,  price);
      current.close   = price;
      current.volume += 1;
    }
  }

  getBars(symbol: string, includeCurrentPartial = true): OHLCVBar[] {
    const completed = (this._bars.get(symbol) ?? []).map(b => this._toOHLCV(b));
    if (!includeCurrentPartial) return completed;
    const current = this._current.get(symbol);
    if (current) completed.push(this._toOHLCV(current));
    return completed;
  }

  hasEnoughBars(symbol: string, minBars = 10): boolean {
    return (this._bars.get(symbol)?.length ?? 0) >= minBars;
  }

  getLastPrice(symbol: string): number | null {
    return this._current.get(symbol)?.close ?? null;
  }

  ingestBar(symbol: string, bar: OHLCVBar): void {
    const bars = this._bars.get(symbol) ?? [];
    bars.push({
      open:   bar.open,
      high:   bar.high,
      low:    bar.low,
      close:  bar.close,
      volume: bar.volume,
      ts:     bar.timestamp.getTime(),
    });
    if (bars.length > this.MAX_BARS) bars.shift();
    this._bars.set(symbol, bars);
    const current = this._current.get(symbol) ?? { open: bar.close, high: bar.close, low: bar.close, close: bar.close, volume: 0, ts: bar.timestamp.getTime() };
    current.close = bar.close;
    this._current.set(symbol, current);
  }

  private _toOHLCV(bar: TickBar): OHLCVBar {
    return {
      timestamp: new Date(bar.ts),
      open:      bar.open,
      high:      bar.high,
      low:       bar.low,
      close:     bar.close,
      volume:    bar.volume,
    };
  }
}

export const tickBarAggregator = new TickBarAggregator();
