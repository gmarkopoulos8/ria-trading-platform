export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  sharpeRatio: number;
  maxDrawdown: number;
  totalReturn: number;
  totalReturnPercent: number;
  bestTrade: number;
  worstTrade: number;
}

export interface EquityCurvePoint {
  date: Date;
  portfolioValue: number;
  return: number;
  returnPercent: number;
}

export interface PerformanceReport {
  period: 'day' | 'week' | 'month' | 'quarter' | 'year' | 'all';
  metrics: PerformanceMetrics;
  equityCurve: EquityCurvePoint[];
  byAssetClass: Record<string, PerformanceMetrics>;
  byTag: Record<string, PerformanceMetrics>;
}
