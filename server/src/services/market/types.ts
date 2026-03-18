export type AssetClass = 'stock' | 'crypto' | 'etf';

export type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';

export interface SearchResult {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  currency: string;
  description?: string;
}

export interface NormalizedQuote {
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  currency: string;
  assetClass: AssetClass;
  exchange?: string;
  timestamp: Date;
  isMock?: boolean;
}

export interface OHLCVBar {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface HistoryResult {
  symbol: string;
  timeframe: Timeframe;
  bars: OHLCVBar[];
  isMock?: boolean;
}

export interface IStocksProvider {
  search(query: string): Promise<SearchResult[]>;
  quote(symbol: string): Promise<NormalizedQuote>;
  history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]>;
}

export interface ICryptoProvider {
  search(query: string): Promise<SearchResult[]>;
  quote(symbol: string): Promise<NormalizedQuote>;
  history(symbol: string, timeframe: Timeframe): Promise<OHLCVBar[]>;
}

export const TIMEFRAME_DAYS: Record<Timeframe, number> = {
  '1D': 1,
  '1W': 7,
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  '5Y': 1825,
};
