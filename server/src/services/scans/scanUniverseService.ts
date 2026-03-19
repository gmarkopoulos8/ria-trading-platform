import { isCryptoSymbol } from '../market/utils';

export interface CandidateAsset {
  ticker: string;
  name: string;
  assetClass: 'stock' | 'crypto' | 'etf';
  sector?: string;
  isCrypto: boolean;
}

export type AssetScope = 'ALL' | 'STOCKS_ONLY' | 'CRYPTO_ONLY';
export type RiskMode = 'ALL' | 'CONSERVATIVE' | 'AGGRESSIVE';

const STOCK_UNIVERSE: CandidateAsset[] = [
  { ticker: 'NVDA', name: 'NVIDIA Corp', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'TSLA', name: 'Tesla Inc', assetClass: 'stock', sector: 'Consumer Discretionary', isCrypto: false },
  { ticker: 'AAPL', name: 'Apple Inc', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'AMZN', name: 'Amazon.com', assetClass: 'stock', sector: 'Consumer Discretionary', isCrypto: false },
  { ticker: 'META', name: 'Meta Platforms', assetClass: 'stock', sector: 'Communication Services', isCrypto: false },
  { ticker: 'MSFT', name: 'Microsoft Corp', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'GOOGL', name: 'Alphabet Inc', assetClass: 'stock', sector: 'Communication Services', isCrypto: false },
  { ticker: 'AMD', name: 'Advanced Micro Devices', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'NFLX', name: 'Netflix Inc', assetClass: 'stock', sector: 'Communication Services', isCrypto: false },
  { ticker: 'CRM', name: 'Salesforce Inc', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'ORCL', name: 'Oracle Corp', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'SHOP', name: 'Shopify Inc', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'COIN', name: 'Coinbase Global', assetClass: 'stock', sector: 'Financials', isCrypto: false },
  { ticker: 'MSTR', name: 'MicroStrategy', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'PLTR', name: 'Palantir Technologies', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'SMCI', name: 'Super Micro Computer', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'ARM', name: 'ARM Holdings', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'IONQ', name: 'IonQ Inc', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'RKLB', name: 'Rocket Lab USA', assetClass: 'stock', sector: 'Industrials', isCrypto: false },
  { ticker: 'MRVL', name: 'Marvell Technology', assetClass: 'stock', sector: 'Technology', isCrypto: false },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'XLK', name: 'Technology Select SPDR ETF', assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'ARKK', name: 'ARK Innovation ETF', assetClass: 'etf', sector: 'ETF', isCrypto: false },
];

export const CRYPTO_UNIVERSE: CandidateAsset[] = [
  { ticker: 'BTC', name: 'Bitcoin', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ETH', name: 'Ethereum', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'SOL', name: 'Solana', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'BNB', name: 'BNB', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'XRP', name: 'XRP', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'AVAX', name: 'Avalanche', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'DOGE', name: 'Dogecoin', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'LINK', name: 'Chainlink', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'DOT', name: 'Polkadot', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ADA', name: 'Cardano', assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
];

export function buildUniverse(scope: AssetScope = 'ALL', riskMode: RiskMode = 'ALL'): CandidateAsset[] {
  let universe: CandidateAsset[] = [];

  if (scope === 'ALL' || scope === 'STOCKS_ONLY') {
    universe.push(...STOCK_UNIVERSE);
  }
  if (scope === 'ALL' || scope === 'CRYPTO_ONLY') {
    universe.push(...CRYPTO_UNIVERSE);
  }

  if (riskMode === 'CONSERVATIVE') {
    universe = universe.filter((a) =>
      ['AAPL', 'MSFT', 'AMZN', 'GOOGL', 'META', 'SPY', 'QQQ', 'BTC', 'ETH'].includes(a.ticker)
    );
  } else if (riskMode === 'AGGRESSIVE') {
    universe = universe.filter((a) =>
      !['SPY', 'QQQ', 'XLK'].includes(a.ticker)
    );
  }

  return universe;
}

export const scanUniverseService = { buildUniverse };
