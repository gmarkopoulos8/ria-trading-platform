import axios from 'axios';
import {
  ICryptoProvider, SearchResult, NormalizedQuote, OHLCVBar, Timeframe,
  TIMEFRAME_DAYS,
} from '../types';
import { roundTo as round } from '../utils';

const BASE = 'https://api.coingecko.com/api/v3';

const SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', BNB: 'binancecoin', SOL: 'solana',
  XRP: 'ripple', ADA: 'cardano', AVAX: 'avalanche-2', DOGE: 'dogecoin',
  DOT: 'polkadot', LINK: 'chainlink', MATIC: 'matic-network', NEAR: 'near',
  ARB: 'arbitrum', OP: 'optimism', PEPE: 'pepe', WIF: 'dogwifcoin',
  BONK: 'bonk', SUI: 'sui', APT: 'aptos', LTC: 'litecoin',
  ATOM: 'cosmos', FIL: 'filecoin', ICP: 'internet-computer', VET: 'vechain',
  XLM: 'stellar', ALGO: 'algorand', SHIB: 'shiba-inu', UNI: 'uniswap',
};

export class CoinGeckoProvider implements ICryptoProvider {
  private apiKey: string | undefined;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private get headers() {
    return this.apiKey ? { 'x-cg-pro-api-key': this.apiKey } : {};
  }

  private coinIdForSymbol(symbol: string): string {
    return SYMBOL_TO_ID[symbol.toUpperCase()] ?? symbol.toLowerCase();
  }

  async search(query: string): Promise<SearchResult[]> {
    const { data } = await axios.get<{
      coins: Array<{ id: string; symbol: string; name: string }>;
    }>(`${BASE}/search`, {
      params: { query },
      headers: this.headers,
      timeout: 8000,
    });

    return (data.coins ?? [])
      .slice(0, 10)
      .map((c) => ({
        symbol: c.symbol.toUpperCase(),
        name: c.name,
        assetClass: 'crypto' as const,
        currency: 'USD',
        description: c.id,
      }));
  }

  async quote(symbol: string): Promise<NormalizedQuote> {
    const id = this.coinIdForSymbol(symbol);
    const { data } = await axios.get<
      Array<{
        id: string;
        symbol: string;
        name: string;
        current_price: number;
        market_cap: number;
        total_volume: number;
        high_24h: number;
        low_24h: number;
        price_change_24h: number;
        price_change_percentage_24h: number;
        ath: number;
        atl: number;
      }>
    >(`${BASE}/coins/markets`, {
      params: { vs_currency: 'usd', ids: id, price_change_percentage: '24h' },
      headers: this.headers,
      timeout: 8000,
    });

    const coin = data[0];
    if (!coin) throw new Error(`No CoinGecko data for ${symbol}`);

    const price = coin.current_price;
    const decimals = price < 0.001 ? 8 : price < 1 ? 6 : 2;

    return {
      symbol: symbol.toUpperCase(),
      name: coin.name,
      price: round(price, decimals),
      open: round(price - coin.price_change_24h, decimals),
      high: round(coin.high_24h, decimals),
      low: round(coin.low_24h, decimals),
      previousClose: round(price - coin.price_change_24h, decimals),
      change: round(coin.price_change_24h, decimals),
      changePercent: round(coin.price_change_percentage_24h, 4),
      volume: Math.round(coin.total_volume),
      marketCap: Math.round(coin.market_cap),
      high52Week: round(coin.ath, decimals),
      low52Week: round(coin.atl, decimals),
      currency: 'USD',
      assetClass: 'crypto',
      timestamp: new Date(),
    };
  }

  async history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]> {
    const id = this.coinIdForSymbol(symbol);
    const days = TIMEFRAME_DAYS[timeframe];
    const normalizedDays = days <= 1 ? 1 : days <= 7 ? 7 : days <= 14 ? 14 : days <= 30 ? 30 : days <= 90 ? 90 : days <= 180 ? 180 : 365;

    const { data } = await axios.get<[number, number, number, number, number][]>(
      `${BASE}/coins/${id}/ohlc`,
      {
        params: { vs_currency: 'usd', days: normalizedDays },
        headers: this.headers,
        timeout: 10000,
      }
    );

    const raw = Array.isArray(data) ? data : [];
    return raw.map(([ts, o, h, l, c]) => ({
      timestamp: new Date(ts),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: 0,
    }));
  }
}
