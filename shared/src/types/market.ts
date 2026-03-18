export type AssetClass = 'stock' | 'crypto' | 'etf';
export type MarketStatus = 'open' | 'closed' | 'pre-market' | 'after-hours';
export type TrendDirection = 'up' | 'down' | 'neutral';

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  assetClass: AssetClass;
  timestamp: Date;
}

export interface OHLCV {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketOverview {
  status: MarketStatus;
  indices: Quote[];
  topGainers: Quote[];
  topLosers: Quote[];
  mostActive: Quote[];
  timestamp: Date;
}

export interface Opportunity {
  id: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  thesisScore: number;
  momentum: number;
  volumeAnomaly: number;
  catalysts: string[];
  trend: TrendDirection;
  riskLevel: 'low' | 'medium' | 'high';
  discoveredAt: Date;
}
