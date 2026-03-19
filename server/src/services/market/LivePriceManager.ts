import WebSocket from 'ws';

type PriceCallback = (price: number) => void;

class LivePriceManager {
  private ws: WebSocket | null = null;
  private subscribers = new Map<string, Set<PriceCallback>>();
  private lastPrices = new Map<string, number>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30_000;
  private connected = false;
  private subscribedTickers = new Set<string>();

  connect(): void {
    const key = process.env.FINNHUB_API_KEY;
    if (!key) return;

    try {
      this.ws = new WebSocket(`wss://ws.finnhub.io?token=${key}`);

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        for (const ticker of this.subscribedTickers) {
          this.sendSubscribe(ticker);
        }
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'trade' && Array.isArray(msg.data)) {
            for (const trade of msg.data) {
              if (trade.s && trade.p) {
                this.lastPrices.set(trade.s, trade.p);
                const cbs = this.subscribers.get(trade.s);
                if (cbs) cbs.forEach((cb) => { try { cb(trade.p); } catch { } });
              }
            }
          }
        } catch { }
      });

      this.ws.on('close', () => {
        this.connected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', () => {
        this.connected = false;
        this.scheduleReconnect();
      });
    } catch { }
  }

  private sendSubscribe(ticker: string): void {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'subscribe', symbol: ticker }));
      } catch { }
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => this.connect(), delay);
  }

  subscribe(ticker: string, callback: PriceCallback): () => void {
    if (!this.subscribers.has(ticker)) this.subscribers.set(ticker, new Set());
    this.subscribers.get(ticker)!.add(callback);
    this.subscribedTickers.add(ticker);
    if (this.connected) this.sendSubscribe(ticker);
    return () => this.unsubscribe(ticker, callback);
  }

  unsubscribe(ticker: string, callback: PriceCallback): void {
    this.subscribers.get(ticker)?.delete(callback);
  }

  getLastPrice(ticker: string): number | null {
    return this.lastPrices.get(ticker) ?? null;
  }

  getLastPrices(tickers: string[]): Record<string, number | null> {
    return Object.fromEntries(tickers.map((t) => [t, this.lastPrices.get(t) ?? null]));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
  }
}

export const livePriceManager = new LivePriceManager();
