export interface OptionContract {
  contractSymbol: string;
  type: 'call' | 'put';
  strike: number;
  expiration: string;
  dte: number;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  inTheMoney: boolean;
}

export interface OptionsChain {
  ticker: string;
  expirations: string[];
  calls: OptionContract[];
  puts: OptionContract[];
  fetchedAt: Date;
}

export interface IVRank {
  current: number;
  rank: number;
  percentile: number;
  isHigh: boolean;
  isLow: boolean;
}

export type OptionsStrategy =
  | 'LONG_CALL'
  | 'LONG_PUT'
  | 'BULL_CALL_SPREAD'
  | 'BEAR_PUT_SPREAD'
  | 'CASH_SECURED_PUT'
  | 'COVERED_CALL'
  | 'IRON_CONDOR'
  | 'NONE';

export interface OptionsLeg {
  action: 'BUY' | 'SELL';
  contract: OptionContract;
  contracts: number;
}

export interface OptionsRecommendation {
  strategy: OptionsStrategy;
  ticker: string;
  legs: OptionsLeg[];
  maxRisk: number;
  maxProfit: number;
  breakeven: number;
  probabilityOfProfit: number;
  ivRank: number;
  netDebit: number;
  rewardRiskRatio: number;
  reasoning: string[];
  warnings: string[];
  fetchedAt: Date;
}

export interface OptionsPosition {
  contractSymbol: string;
  ticker: string;
  strategy: OptionsStrategy;
  legs: OptionsLeg[];
  openedAt: Date;
  entryDebit: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  dteAtEntry: number;
  currentDTE: number;
  deltaAtEntry: number;
  currentDelta: number | null;
  warnings: string[];
}
