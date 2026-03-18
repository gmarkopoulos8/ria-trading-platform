import axios from 'axios';

const CLOB = process.env.POLY_CLOB_BASE_URL ?? 'https://clob.polymarket.com';
const clob = axios.create({ baseURL: CLOB, timeout: 10_000 });

export interface PricePoint { t: number; p: number }

export interface OrderbookEntry { price: number; size: number }

export interface MarketPrices {
  midpoint: number | null;
  spread: number | null;
  bestBid: number | null;
  bestAsk: number | null;
}

export interface Orderbook {
  bids: OrderbookEntry[];
  asks: OrderbookEntry[];
  midpoint: number | null;
  spread: number | null;
}

export async function fetchMidpoint(tokenId: string): Promise<number | null> {
  try {
    const { data } = await clob.get('/midpoint', { params: { token_id: tokenId } });
    return typeof data?.mid === 'number' ? data.mid : null;
  } catch {
    return null;
  }
}

export async function fetchSpread(tokenId: string): Promise<number | null> {
  try {
    const { data } = await clob.get('/spread', { params: { token_id: tokenId } });
    return typeof data?.spread === 'number' ? data.spread : null;
  } catch {
    return null;
  }
}

export async function fetchMarketPrices(conditionId: string): Promise<MarketPrices> {
  try {
    const { data } = await clob.get('/prices', { params: { token_id: conditionId } });
    const prices = data?.prices ?? {};
    const vals: number[] = Object.values(prices).map((v) => parseFloat(String(v)));
    const [bestBid, bestAsk] = vals.length >= 2 ? vals : [null, null];
    const midpoint = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
    const spread   = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
    return { midpoint, spread, bestBid: bestBid ?? null, bestAsk: bestAsk ?? null };
  } catch {
    return { midpoint: null, spread: null, bestBid: null, bestAsk: null };
  }
}

export async function fetchOrderbook(conditionId: string): Promise<Orderbook> {
  try {
    const { data } = await clob.get('/book', { params: { token_id: conditionId } });
    const bids: OrderbookEntry[] = (data?.bids ?? []).slice(0, 10).map((b: any) => ({
      price: parseFloat(b.price),
      size: parseFloat(b.size),
    }));
    const asks: OrderbookEntry[] = (data?.asks ?? []).slice(0, 10).map((a: any) => ({
      price: parseFloat(a.price),
      size: parseFloat(a.size),
    }));
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    const midpoint = bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : null;
    const spread   = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;
    return { bids, asks, midpoint, spread };
  } catch {
    return { bids: [], asks: [], midpoint: null, spread: null };
  }
}

export async function fetchPriceHistory(conditionId: string, interval = '1d'): Promise<PricePoint[]> {
  const intervalMap: Record<string, string> = {
    '1h': '1m', '6h': '5m', '1d': '15m', '7d': '1h', '30d': '4h', 'max': '1d',
  };
  try {
    const { data } = await clob.get('/prices-history', {
      params: { market: conditionId, interval: intervalMap[interval] ?? '15m', fidelity: 60 },
    });
    const history = data?.history ?? [];
    return history.map((pt: any) => ({ t: pt.t, p: parseFloat(pt.p) }));
  } catch {
    return generateMockHistory(interval);
  }
}

function generateMockHistory(interval: string): PricePoint[] {
  const points = interval === '1h' ? 12 : interval === '1d' ? 24 : 30;
  const now = Date.now() / 1000;
  let price = 0.4 + Math.random() * 0.3;
  const step = interval === '1h' ? 300 : interval === '1d' ? 3600 : 86400;

  return Array.from({ length: points }, (_, i) => {
    price = Math.max(0.01, Math.min(0.99, price + (Math.random() - 0.49) * 0.03));
    return { t: Math.floor(now - (points - i) * step), p: parseFloat(price.toFixed(4)) };
  });
}
