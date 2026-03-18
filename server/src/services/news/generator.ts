import { NormalizedNewsItem, EventType, NewsSource } from './types';
import { analyzeSentiment, scoreRecency, scoreSourceQuality } from './sentiment';
import { classifyEventType, scoreImportance, classifyUrgency, classifyCategory, computeCatalystScore } from './classifier';
import { generateExplanation, generateKeyPoints } from './explainer';

const SOURCES: NewsSource[] = [
  { name: 'Bloomberg', domain: 'bloomberg.com', qualityScore: 95 },
  { name: 'Reuters', domain: 'reuters.com', qualityScore: 95 },
  { name: 'CNBC', domain: 'cnbc.com', qualityScore: 88 },
  { name: 'Wall Street Journal', domain: 'wsj.com', qualityScore: 92 },
  { name: 'MarketWatch', domain: 'marketwatch.com', qualityScore: 78 },
  { name: 'CoinDesk', domain: 'coindesk.com', qualityScore: 80 },
  { name: 'The Block', domain: 'theblock.co', qualityScore: 78 },
  { name: 'Decrypt', domain: 'decrypt.co', qualityScore: 65 },
  { name: 'Barron\'s', domain: 'barrons.com', qualityScore: 82 },
  { name: 'Yahoo Finance', domain: 'finance.yahoo.com', qualityScore: 65 },
  { name: 'Seeking Alpha', domain: 'seekingalpha.com', qualityScore: 62 },
  { name: 'Benzinga', domain: 'benzinga.com', qualityScore: 60 },
  { name: 'Financial Times', domain: 'ft.com', qualityScore: 93 },
  { name: 'Cointelegraph', domain: 'cointelegraph.com', qualityScore: 72 },
];

const STOCK_HEADLINES: Array<{ headline: string; summary: string; type: EventType }> = [
  {
    type: 'EARNINGS',
    headline: '{T} Q3 Earnings Beat: EPS of ${eps} vs ${est} Expected',
    summary: '{T} reported quarterly earnings per share of ${eps}, surpassing analyst consensus of ${est}. Revenue came in at ${rev}B, up {revPct}% year-over-year.',
  },
  {
    type: 'EARNINGS',
    headline: '{T} Misses Q2 Revenue Estimates Amid Softening Demand',
    summary: '{T} posted Q2 revenue below Wall Street estimates as demand headwinds weighed on results. The company cited macroeconomic uncertainty and inventory normalization.',
  },
  {
    type: 'GUIDANCE',
    headline: '{T} Raises Full-Year Guidance on Strong Demand Pipeline',
    summary: '{T} management raised their full-year revenue guidance to ${rev}B–${revH}B, citing accelerating enterprise adoption and an expanded backlog.',
  },
  {
    type: 'GUIDANCE',
    headline: '{T} Cuts Full-Year Outlook Citing Macro Headwinds',
    summary: '{T} lowered its fiscal year guidance, citing foreign exchange headwinds, supply chain constraints, and softening consumer demand.',
  },
  {
    type: 'ANALYST_ACTION',
    headline: '{source} Upgrades {T} to Outperform With ${pt} Price Target',
    summary: '{source} analyst upgraded {T} from Neutral to Outperform, setting a new price target of ${pt}. The analyst cited improving margins and accelerating AI monetization.',
  },
  {
    type: 'ANALYST_ACTION',
    headline: '{source} Downgrades {T} to Underperform on Valuation Concerns',
    summary: '{source} cut its rating on {T} to Underperform, reducing the price target to ${pt}. The analyst flagged stretched valuation multiples and slowing growth.',
  },
  {
    type: 'PARTNERSHIP',
    headline: '{T} Announces Strategic Partnership to Expand Market Reach',
    summary: '{T} signed a multi-year strategic partnership agreement to co-develop and co-market solutions, significantly expanding its total addressable market.',
  },
  {
    type: 'CONTRACT',
    headline: '{T} Wins Major Government Contract Worth ${val}M',
    summary: '{T} was awarded a {dur}-year government contract valued at approximately ${val}M. The contract provides significant revenue visibility through {yr}.',
  },
  {
    type: 'PRODUCT_LAUNCH',
    headline: '{T} Launches Next-Generation Product Suite, Exceeds Market Expectations',
    summary: '{T} unveiled its next-generation product lineup at its annual event. Early reception has been strongly positive with pre-orders exceeding company guidance.',
  },
  {
    type: 'REGULATORY',
    headline: '{T} Faces FTC Investigation Into Competitive Practices',
    summary: 'The Federal Trade Commission has opened an investigation into {T}\'s competitive practices. The company said it intends to cooperate fully with regulators.',
  },
  {
    type: 'EXECUTIVE_CHANGE',
    headline: '{T} Names New CEO Following Surprise Leadership Transition',
    summary: '{T} announced a surprise leadership change, appointing an industry veteran as the new CEO effective immediately. The departure of the prior CEO was attributed to strategic differences.',
  },
  {
    type: 'SECURITY_BREACH',
    headline: '{T} Discloses Data Breach Affecting Millions of Customer Records',
    summary: '{T} disclosed a cybersecurity incident in which unauthorized access to customer data occurred. The company is working with law enforcement and cybersecurity experts.',
  },
  {
    type: 'LAWSUIT',
    headline: '{T} Hit With Class-Action Lawsuit Over Misleading Disclosures',
    summary: 'A class-action lawsuit was filed against {T}, alleging the company made materially misleading statements to investors. The lawsuit seeks unspecified damages.',
  },
  {
    type: 'MACRO',
    headline: 'Fed Holds Rates Steady, Signals Cautious Stance on Future Cuts',
    summary: 'The Federal Reserve held interest rates unchanged at its latest meeting. Fed Chair signaled a data-dependent approach and warned that inflation progress remains uneven.',
  },
  {
    type: 'SECTOR',
    headline: 'AI Chip Demand Remains Robust as Hyperscalers Expand Capex Plans',
    summary: 'Major cloud providers continue to increase capital expenditures on AI infrastructure, maintaining strong demand for advanced semiconductors through 2025.',
  },
  {
    type: 'FILING',
    headline: '{T} Insiders Purchase ${val}M in Shares on Open Market',
    summary: 'Insider filings show that multiple {T} executives purchased shares on the open market totaling ${val}M, signaling confidence in the company\'s near-term outlook.',
  },
];

const CRYPTO_HEADLINES: Array<{ headline: string; summary: string; type: EventType }> = [
  {
    type: 'PROTOCOL_EXPLOIT',
    headline: '{T} Protocol Suffers ${val}M Exploit Via Flash Loan Attack',
    summary: 'A critical vulnerability in {T}\'s smart contracts was exploited, resulting in a loss of approximately ${val}M. The protocol has paused operations and is working on a remediation plan.',
  },
  {
    type: 'TOKEN_UNLOCK',
    headline: '{T} Token Unlock: ${val}M Worth of Tokens Entering Circulation',
    summary: '{T} is scheduled to release a significant tranche of previously vested tokens. The unlock represents approximately {pct}% of current circulating supply.',
  },
  {
    type: 'CHAIN_OUTAGE',
    headline: '{T} Network Experiences {dur}-Hour Outage, Validators Working on Fix',
    summary: 'The {T} blockchain halted block production for approximately {dur} hours due to a consensus issue. Validators coordinated to resume operations.',
  },
  {
    type: 'PARTNERSHIP',
    headline: '{T} Partners With Major Institution to Expand DeFi Ecosystem',
    summary: '{T} announced a partnership with a leading financial institution to bring institutional-grade liquidity to its DeFi ecosystem.',
  },
  {
    type: 'ANALYST_ACTION',
    headline: 'Crypto Research Firm Initiates {T} Coverage With Bullish Outlook',
    summary: 'A leading digital asset research firm initiated coverage of {T} with a "Strong Buy" recommendation and a 12-month price target implying significant upside.',
  },
  {
    type: 'REGULATORY',
    headline: 'SEC Issues Warning on {T}-Related Trading Products',
    summary: 'The SEC issued a statement cautioning investors about the risks of trading products linked to {T}, citing market manipulation concerns and lack of regulatory oversight.',
  },
  {
    type: 'PRODUCT_LAUNCH',
    headline: '{T} Launches Layer-2 Solution to Address Scalability and Fees',
    summary: '{T} unveiled its long-awaited Layer-2 scaling solution, targeting dramatically lower transaction fees and higher throughput than the base chain.',
  },
  {
    type: 'CRYPTO_EXCHANGE',
    headline: '{T} Listed on Binance, Trading Volume Surges 800%',
    summary: 'Binance announced the listing of {T} on its spot trading platform. Trading volume surged as retail and institutional investors gained access to the asset.',
  },
  {
    type: 'MACRO',
    headline: 'Crypto Markets React to Fed Minutes as Risk Appetite Shifts',
    summary: 'Digital asset markets experienced volatility following the release of Federal Reserve meeting minutes, which indicated a more hawkish-than-expected stance.',
  },
  {
    type: 'SECURITY_BREACH',
    headline: '{T} Bridge Exploit: Hackers Drain ${val}M in Cross-Chain Assets',
    summary: 'Attackers exploited a vulnerability in {T}\'s cross-chain bridge, draining approximately ${val}M in assets. The team has halted bridge operations pending an audit.',
  },
  {
    type: 'EXECUTIVE_CHANGE',
    headline: '{T} Foundation Names New Executive Director Amid Strategic Pivot',
    summary: '{T} Foundation announced the appointment of a new Executive Director with deep institutional finance experience, signaling a shift toward mainstream adoption.',
  },
  {
    type: 'SECTOR',
    headline: 'DeFi TVL Surges to New High as Institutional Capital Flows In',
    summary: 'Total Value Locked in decentralized finance protocols reached a new all-time high, driven by institutional capital inflows and innovative yield strategies.',
  },
];

function seededRand(seed: number, max: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return Math.floor((x - Math.floor(x)) * max);
}

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function fillTemplate(template: string, ticker: string, seed: number): string {
  const prices = [12, 18, 24, 35, 45, 65, 85, 110, 140, 180, 220, 280];
  const revs = [1.2, 2.4, 3.8, 5.1, 8.3, 12.6, 18.9, 24.3, 35.7];
  const vals = [15, 45, 120, 250, 500, 850, 1200, 2000, 5000];
  const sources = ['Goldman Sachs', 'Morgan Stanley', 'JPMorgan', 'Bank of America', 'Citi', 'Barclays', 'UBS', 'Deutsche Bank'];

  const pt = prices[seededRand(seed, prices.length)];
  const rev = revs[seededRand(seed + 1, revs.length)];
  const val = vals[seededRand(seed + 2, vals.length)];
  const eps = (seededRand(seed + 3, 300) / 100 + 0.5).toFixed(2);
  const est = (parseFloat(eps) - 0.1 + seededRand(seed + 4, 30) / 100).toFixed(2);
  const source = sources[seededRand(seed + 5, sources.length)];

  return template
    .replace(/{T}/g, ticker)
    .replace(/{pt}/g, pt.toString())
    .replace(/{rev}/g, rev.toFixed(1))
    .replace(/{revH}/g, (rev + 0.5).toFixed(1))
    .replace(/{revPct}/g, (seededRand(seed + 6, 40) + 8).toString())
    .replace(/{val}/g, val.toString())
    .replace(/{eps}/g, eps)
    .replace(/{est}/g, est)
    .replace(/{dur}/g, (seededRand(seed + 7, 5) + 1).toString())
    .replace(/{yr}/g, (new Date().getFullYear() + seededRand(seed + 8, 3) + 1).toString())
    .replace(/{pct}/g, (seededRand(seed + 9, 15) + 3).toString())
    .replace(/{source}/g, source);
}

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

export function generateNewsItems(ticker: string, assetClass: 'stock' | 'crypto', count = 12): NormalizedNewsItem[] {
  const baseHash = hashString(ticker);
  const pool = assetClass === 'crypto' ? CRYPTO_HEADLINES : STOCK_HEADLINES;
  const items: NormalizedNewsItem[] = [];

  const ages = [0.5, 2, 5, 11, 18, 26, 36, 48, 60, 72, 96, 120];
  const picks = new Set<number>();

  for (let i = 0; i < Math.min(count, pool.length); i++) {
    let idx = seededRand(baseHash + i * 7, pool.length);
    let attempts = 0;
    while (picks.has(idx) && attempts < pool.length) {
      idx = (idx + 1) % pool.length;
      attempts++;
    }
    picks.add(idx);

    const template = pool[idx];
    const seed = baseHash + i * 13;
    const sourceIdx = seededRand(seed, SOURCES.length);
    const source = SOURCES[sourceIdx];

    const headline = fillTemplate(template.headline, ticker, seed);
    const summary = fillTemplate(template.summary, ticker, seed + 1);
    const publishedAt = hoursAgo(ages[i % ages.length]);

    const sentimentResult = analyzeSentiment(headline + ' ' + summary);
    const eventType = classifyEventType(headline + ' ' + summary) !== 'GENERAL'
      ? classifyEventType(headline + ' ' + summary)
      : template.type;

    const recencyScore = scoreRecency(publishedAt);
    const sourceQualityScore = scoreSourceQuality(source.name);
    const importanceScore = scoreImportance(eventType, sentimentResult.score);
    const urgency = classifyUrgency(eventType, importanceScore, sentimentResult.score);
    const category = classifyCategory(sentimentResult.label, urgency, eventType);
    const catalystScore = computeCatalystScore({
      importance: importanceScore,
      recency: recencyScore,
      sourceQuality: sourceQualityScore,
      sentiment: sentimentResult.score,
    });

    const sentimentTrend = sentimentResult.score + (seededRand(seed + 5, 40) - 20) / 100;
    const explanation = generateExplanation({
      ticker,
      headline,
      eventType,
      sentiment: sentimentResult.label,
      category,
      urgency,
      importanceScore,
      sentimentScore: sentimentResult.score,
      seed,
    });

    const keyPoints = generateKeyPoints({ eventType, sentiment: sentimentResult.label, ticker, seed });

    items.push({
      id: `mock-${ticker}-${i}-${baseHash}`,
      ticker,
      headline,
      summary,
      url: `https://${source.domain}/articles/${ticker.toLowerCase()}-${Date.now() + i}`,
      source,
      publishedAt,
      eventType,
      sentiment: sentimentResult.label,
      category,
      urgency,
      scores: {
        sentiment: sentimentResult.score,
        sentimentTrend: Math.round(sentimentTrend * 100) / 100,
        importance: importanceScore,
        recency: recencyScore,
        sourceQuality: sourceQualityScore,
        catalyst: catalystScore,
      },
      explanation,
      keyPoints,
      isMock: true,
    });
  }

  return items.sort((a, b) => b.scores.catalyst - a.scores.catalyst);
}
