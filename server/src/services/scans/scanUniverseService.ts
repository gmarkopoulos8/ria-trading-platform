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
  // Mega-cap Tech
  { ticker: 'AAPL',  name: 'Apple Inc',                    assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'MSFT',  name: 'Microsoft Corp',               assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'NVDA',  name: 'NVIDIA Corp',                  assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'GOOGL', name: 'Alphabet Inc',                 assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'AMZN',  name: 'Amazon.com',                   assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'META',  name: 'Meta Platforms',               assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'TSLA',  name: 'Tesla Inc',                    assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  // Semiconductors
  { ticker: 'AMD',   name: 'Advanced Micro Devices',       assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'INTC',  name: 'Intel Corp',                   assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'QCOM',  name: 'Qualcomm Inc',                 assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'AVGO',  name: 'Broadcom Inc',                 assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'MU',    name: 'Micron Technology',            assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'MRVL',  name: 'Marvell Technology',           assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'ARM',   name: 'ARM Holdings',                 assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'SMCI',  name: 'Super Micro Computer',         assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  // Software / SaaS
  { ticker: 'CRM',   name: 'Salesforce Inc',               assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'ORCL',  name: 'Oracle Corp',                  assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'ADBE',  name: 'Adobe Inc',                    assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'NOW',   name: 'ServiceNow Inc',               assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'SNOW',  name: 'Snowflake Inc',                assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'DDOG',  name: 'Datadog Inc',                  assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'SHOP',  name: 'Shopify Inc',                  assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'PLTR',  name: 'Palantir Technologies',        assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'PANW',  name: 'Palo Alto Networks',           assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'CRWD',  name: 'CrowdStrike Holdings',         assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'ZS',    name: 'Zscaler Inc',                  assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  // AI / Emerging Tech
  { ticker: 'AI',    name: 'C3.ai Inc',                    assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'IONQ',  name: 'IonQ Inc',                     assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'RGTI',  name: 'Rigetti Computing',            assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'SOUN',  name: 'SoundHound AI',                assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  { ticker: 'BBAI',  name: 'BigBear.ai Holdings',          assetClass: 'stock', sector: 'Technology',              isCrypto: false },
  // Internet / Media
  { ticker: 'NFLX',  name: 'Netflix Inc',                  assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'SPOT',  name: 'Spotify Technology',           assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'PINS',  name: 'Pinterest Inc',                assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'SNAP',  name: 'Snap Inc',                     assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'RBLX',  name: 'Roblox Corp',                  assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  // Financials
  { ticker: 'JPM',   name: 'JPMorgan Chase',               assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'GS',    name: 'Goldman Sachs',                assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'V',     name: 'Visa Inc',                     assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'MA',    name: 'Mastercard Inc',               assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'PYPL',  name: 'PayPal Holdings',              assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'SQ',    name: 'Block Inc',                    assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'COIN',  name: 'Coinbase Global',              assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'MSTR',  name: 'MicroStrategy',                assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  { ticker: 'HOOD',  name: 'Robinhood Markets',            assetClass: 'stock', sector: 'Financials',              isCrypto: false },
  // Healthcare / Biotech
  { ticker: 'LLY',   name: 'Eli Lilly and Co',             assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  { ticker: 'ABBV',  name: 'AbbVie Inc',                   assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  { ticker: 'MRNA',  name: 'Moderna Inc',                  assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  { ticker: 'BNTX',  name: 'BioNTech SE',                  assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  { ticker: 'ISRG',  name: 'Intuitive Surgical',           assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  { ticker: 'RXRX',  name: 'Recursion Pharmaceuticals',    assetClass: 'stock', sector: 'Healthcare',              isCrypto: false },
  // Consumer
  { ticker: 'SBUX',  name: 'Starbucks Corp',               assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'NKE',   name: 'Nike Inc',                     assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'LULU',  name: 'Lululemon Athletica',          assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'ABNB',  name: 'Airbnb Inc',                   assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'UBER',  name: 'Uber Technologies',            assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'LYFT',  name: 'Lyft Inc',                     assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'DASH',  name: 'DoorDash Inc',                 assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  // Energy / EV
  { ticker: 'ENPH',  name: 'Enphase Energy',               assetClass: 'stock', sector: 'Energy',                  isCrypto: false },
  { ticker: 'FSLR',  name: 'First Solar Inc',              assetClass: 'stock', sector: 'Energy',                  isCrypto: false },
  { ticker: 'RIVN',  name: 'Rivian Automotive',            assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'LCID',  name: 'Lucid Group',                  assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  // Industrial / Space / Defense
  { ticker: 'RKLB',  name: 'Rocket Lab USA',               assetClass: 'stock', sector: 'Industrials',             isCrypto: false },
  { ticker: 'SPCE',  name: 'Virgin Galactic',              assetClass: 'stock', sector: 'Industrials',             isCrypto: false },
  { ticker: 'BA',    name: 'Boeing Co',                    assetClass: 'stock', sector: 'Industrials',             isCrypto: false },
  { ticker: 'LMT',   name: 'Lockheed Martin',              assetClass: 'stock', sector: 'Industrials',             isCrypto: false },
  { ticker: 'RTX',   name: 'RTX Corp',                     assetClass: 'stock', sector: 'Industrials',             isCrypto: false },
  // High-Beta / Momentum
  { ticker: 'DKNG',  name: 'DraftKings Inc',               assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'PENN',  name: 'PENN Entertainment',           assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'GME',   name: 'GameStop Corp',                assetClass: 'stock', sector: 'Consumer Discretionary',  isCrypto: false },
  { ticker: 'AMC',   name: 'AMC Entertainment',            assetClass: 'stock', sector: 'Communication Services',  isCrypto: false },
  { ticker: 'BYND',  name: 'Beyond Meat Inc',              assetClass: 'stock', sector: 'Consumer Staples',         isCrypto: false },
];

export const CRYPTO_UNIVERSE: CandidateAsset[] = [
  { ticker: 'BTC',   name: 'Bitcoin',        assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ETH',   name: 'Ethereum',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'SOL',   name: 'Solana',         assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'BNB',   name: 'BNB',            assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'XRP',   name: 'XRP',            assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'AVAX',  name: 'Avalanche',      assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'DOGE',  name: 'Dogecoin',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'LINK',  name: 'Chainlink',      assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'DOT',   name: 'Polkadot',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ADA',   name: 'Cardano',        assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'MATIC', name: 'Polygon',        assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ATOM',  name: 'Cosmos',         assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'NEAR',  name: 'NEAR Protocol',  assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'APT',   name: 'Aptos',          assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'ARB',   name: 'Arbitrum',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'OP',    name: 'Optimism',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'INJ',   name: 'Injective',      assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'SUI',   name: 'Sui',            assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'TIA',   name: 'Celestia',       assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
  { ticker: 'JUP',   name: 'Jupiter',        assetClass: 'crypto', sector: 'Crypto', isCrypto: true },
];

export const ETF_UNIVERSE: CandidateAsset[] = [
  { ticker: 'SPY',   name: 'SPDR S&P 500 ETF',              assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'QQQ',   name: 'Invesco QQQ Trust',             assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'IWM',   name: 'iShares Russell 2000 ETF',      assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'XLK',   name: 'Technology Select SPDR ETF',    assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'XLF',   name: 'Financial Select SPDR ETF',     assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'ARKK',  name: 'ARK Innovation ETF',            assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'SOXL',  name: 'Direxion Semis 3x Bull',        assetClass: 'etf', sector: 'ETF', isCrypto: false },
  { ticker: 'TQQQ',  name: 'ProShares UltraPro QQQ 3x',     assetClass: 'etf', sector: 'ETF', isCrypto: false },
];

export function buildUniverse(scope: AssetScope = 'ALL', riskMode: RiskMode = 'ALL'): CandidateAsset[] {
  let universe: CandidateAsset[] = [];

  if (scope === 'ALL' || scope === 'STOCKS_ONLY') {
    universe.push(...STOCK_UNIVERSE);
    universe.push(...ETF_UNIVERSE);
  }
  if (scope === 'ALL' || scope === 'CRYPTO_ONLY') {
    universe.push(...CRYPTO_UNIVERSE);
  }

  if (riskMode === 'CONSERVATIVE') {
    universe = universe.filter(a =>
      ['AAPL','MSFT','AMZN','GOOGL','META','NVDA','V','MA','JPM','SPY','QQQ','BTC','ETH'].includes(a.ticker)
    );
  } else if (riskMode === 'AGGRESSIVE') {
    universe = universe.filter(a => !['SPY','QQQ','XLK','IWM'].includes(a.ticker));
  }

  return universe;
}

export const scanUniverseService = { buildUniverse };
