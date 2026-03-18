import { EventType, SentimentLabel, CatalystCategory, UrgencyLevel } from './types';

const EVENT_LABELS: Record<EventType, string> = {
  EARNINGS: 'Earnings Report',
  GUIDANCE: 'Forward Guidance',
  FILING: 'SEC Filing',
  PARTNERSHIP: 'Partnership',
  CONTRACT: 'Contract/Deal',
  PRODUCT_LAUNCH: 'Product Launch',
  LAWSUIT: 'Litigation',
  REGULATORY: 'Regulatory Action',
  EXECUTIVE_CHANGE: 'Executive Change',
  SECURITY_BREACH: 'Security Breach',
  ANALYST_ACTION: 'Analyst Action',
  MACRO: 'Macro Development',
  SECTOR: 'Sector Development',
  CRYPTO_EXCHANGE: 'Exchange Activity',
  TOKEN_UNLOCK: 'Token Unlock',
  CHAIN_OUTAGE: 'Network Outage',
  PROTOCOL_EXPLOIT: 'Protocol Exploit',
  GENERAL: 'Market News',
};

const SENTIMENT_INTROS: Record<SentimentLabel, string[]> = {
  POSITIVE: [
    'This is a bullish development for',
    'Positive signal for',
    'Constructive development for',
    'Strong positive catalyst for',
  ],
  NEGATIVE: [
    'This is a bearish development for',
    'Negative headwind for',
    'Concerning development for',
    'Potential downside risk for',
  ],
  NEUTRAL: [
    'Mixed implications for',
    'Watch how the market interprets this for',
    'Informational development for',
    'Near-term neutral for',
  ],
};

function pickFrom<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const IMPORTANCE_CONTEXT: Record<string, string> = {
  EARNINGS: 'Earnings results are the single most important recurring catalyst — they directly update the market\'s valuation model.',
  GUIDANCE: 'Management guidance sets the forward narrative and influences analyst price targets and institutional positioning.',
  ANALYST_ACTION: 'Analyst ratings changes can move institutional order flow and trigger algorithmic rebalancing.',
  REGULATORY: 'Regulatory actions can create binary risk events with outsized impact on valuation multiples.',
  EXECUTIVE_CHANGE: 'Leadership transitions introduce uncertainty about strategy, culture, and near-term execution.',
  LAWSUIT: 'Litigation introduces binary risk and can weigh on multiples until resolved.',
  PROTOCOL_EXPLOIT: 'Smart contract exploits destroy confidence and trigger immediate token sell-offs with long recovery windows.',
  SECURITY_BREACH: 'Data breaches create reputational risk, regulatory exposure, and measurable customer churn.',
  TOKEN_UNLOCK: 'Token unlocks mechanically increase circulating supply, creating near-term selling pressure.',
  CHAIN_OUTAGE: 'Network outages undermine the value proposition of a blockchain and erode developer trust.',
  PARTNERSHIP: 'Partnerships expand addressable market and signal product-market fit validation.',
  CONTRACT: 'New contracts provide revenue visibility and validate the commercial appeal of the product.',
  PRODUCT_LAUNCH: 'Product launches expand the revenue opportunity and differentiate the offering.',
  MACRO: 'Macro developments affect discount rates, risk appetite, and sector rotation flows.',
  CRYPTO_EXCHANGE: 'Exchange listings and delistings directly affect liquidity and retail accessibility.',
  SECTOR: 'Sector tailwinds and headwinds affect the entire competitive landscape simultaneously.',
  FILING: 'Regulatory filings provide transparency into operations, financials, and insider sentiment.',
  GENERAL: 'Monitor for follow-through confirmation before adjusting thesis.',
};

const URGENCY_GUIDANCE: Record<UrgencyLevel, string> = {
  CRITICAL: 'Immediate attention required — this may necessitate position review within hours.',
  HIGH: 'Material development — reassess position sizing and risk exposure.',
  MEDIUM: 'Notable catalyst — incorporate into ongoing thesis review.',
  LOW: 'Background information — relevant context for longer-term thesis.',
};

export function generateExplanation(params: {
  ticker: string | null;
  headline: string;
  eventType: EventType;
  sentiment: SentimentLabel;
  category: CatalystCategory;
  urgency: UrgencyLevel;
  importanceScore: number;
  sentimentScore: number;
  seed: number;
}): string {
  const { ticker, eventType, sentiment, urgency, importanceScore, sentimentScore, seed } = params;
  const label = EVENT_LABELS[eventType];
  const intros = SENTIMENT_INTROS[sentiment];
  const intro = pickFrom(intros, seed);
  const subject = ticker ? `$${ticker}` : 'this asset';

  const importanceCtx = IMPORTANCE_CONTEXT[eventType] ?? IMPORTANCE_CONTEXT['GENERAL'];
  const urgencyGuidance = URGENCY_GUIDANCE[urgency];

  const impactStr =
    Math.abs(sentimentScore) > 0.6
      ? 'strong'
      : Math.abs(sentimentScore) > 0.3
      ? 'moderate'
      : 'mild';

  return `${intro} ${subject}. [${label} | Importance: ${importanceScore}/100] ${importanceCtx} ${
    sentiment !== 'NEUTRAL'
      ? `The ${impactStr} ${sentiment.toLowerCase()} signal indicates ${sentimentScore > 0 ? 'buying pressure may build.' : 'selling pressure may emerge.'}`
      : 'Market reaction will depend on context and accompanying guidance.'
  } ${urgencyGuidance}`;
}

export function generateKeyPoints(params: {
  eventType: EventType;
  sentiment: SentimentLabel;
  ticker: string | null;
  seed: number;
}): string[] {
  const { eventType, sentiment, ticker, seed } = params;
  const sym = ticker ?? 'Asset';

  const pools: Record<EventType, string[][]> = {
    EARNINGS: [
      [`${sym} reported ${sentiment === 'POSITIVE' ? 'better-than-expected' : sentiment === 'NEGATIVE' ? 'weaker-than-expected' : 'in-line'} results`],
      ['Focus on revenue growth trajectory and margin expansion or compression'],
      ['Guidance for next quarter will drive post-earnings price action'],
    ],
    GUIDANCE: [
      [`Management ${sentiment === 'POSITIVE' ? 'raised' : sentiment === 'NEGATIVE' ? 'lowered' : 'maintained'} full-year guidance`],
      ['Forward estimates will be revised by sell-side analysts'],
      ['Watch for institutional rebalancing following guidance revision'],
    ],
    ANALYST_ACTION: [
      [`Analyst ${sentiment === 'POSITIVE' ? 'upgrade' : sentiment === 'NEGATIVE' ? 'downgrade' : 'rating maintained'} changes market narrative`],
      ['Price target revision will anchor near-term trading range expectations'],
      ['Multiple analysts revising simultaneously amplifies the signal'],
    ],
    REGULATORY: [
      [`Regulatory development has ${sentiment === 'POSITIVE' ? 'constructive' : 'material'} implications`],
      ['Resolution timeline is a key risk factor for position sizing'],
      ['Similar precedents suggest market may over- or under-react initially'],
    ],
    PROTOCOL_EXPLOIT: [
      ['Smart contract vulnerability exploited — assess total funds at risk'],
      ['Protocol team response time and transparency is a key recovery signal'],
      ['Similar exploits have triggered 30–70% token price drawdowns'],
    ],
    SECURITY_BREACH: [
      ['Data breach scope and response plan are critical to assess'],
      ['Regulatory fines and customer churn can have multi-quarter impact'],
      ['Watch for class-action lawsuit announcements in follow-on days'],
    ],
    PARTNERSHIP: [
      [`Strategic alliance ${sentiment === 'POSITIVE' ? 'validates' : 'may distract from'} core business`],
      ['Revenue contribution timeline and exclusivity terms matter most'],
      ['Integration complexity and execution risk should be monitored'],
    ],
    CONTRACT: [
      [`Contract ${sentiment === 'POSITIVE' ? 'provides multi-quarter revenue visibility' : 'loss signals competitive pressure'}`],
      ['Contract value and margin profile determine EPS impact'],
      ['Renewal risk at contract end is a secondary consideration'],
    ],
    PRODUCT_LAUNCH: [
      [`Product ${sentiment === 'POSITIVE' ? 'launch validates roadmap execution' : 'delay signals development challenges'}`],
      ['Addressable market size and adoption rate are key revenue drivers'],
      ['Competitive response from incumbents will determine market share trajectory'],
    ],
    TOKEN_UNLOCK: [
      ['Vesting schedule unlock increases circulating supply'],
      ['Magnitude of unlock relative to daily volume determines price impact'],
      ['Watch if insiders or VCs sell immediately or hold post-unlock'],
    ],
    CHAIN_OUTAGE: [
      ['Network halt undermines validator confidence and user trust'],
      ['Root cause analysis and time-to-resolution are key monitoring points'],
      ['DeFi protocols built on this chain face cascading risk'],
    ],
    EXECUTIVE_CHANGE: [
      [`Leadership ${sentiment === 'POSITIVE' ? 'addition brings new strategic capability' : 'departure creates execution uncertainty'}`],
      ['Transition period typically lasts 60–90 days before new strategy is clear'],
      ['Incoming leader\'s track record and compensation structure signal priorities'],
    ],
    LAWSUIT: [
      ['Litigation creates binary overhang — dismissal vs. settlement matters'],
      ['Class action scope and plaintiff credibility determine materiality'],
      ['Legal costs reduce near-term free cash flow regardless of outcome'],
    ],
    MACRO: [
      ['Macro data affects sector rotation and risk-on/risk-off positioning'],
      ['Fed policy sensitivity varies by growth vs. value classification'],
      ['Correlation to broader market may increase during macro events'],
    ],
    SECTOR: [
      ['Sector catalyst affects all participants — relative performance matters'],
      ['Differentiated exposure to sector headwinds or tailwinds creates alpha'],
      ['Monitor industry peers for confirmation or divergence signals'],
    ],
    CRYPTO_EXCHANGE: [
      ['Exchange activity directly affects token liquidity and price discovery'],
      ['Listing on tier-1 exchanges historically boosts 30-day price performance'],
      ['Delistings trigger forced selling and liquidity withdrawal'],
    ],
    FILING: [
      ['Regulatory filing provides transparency into capital structure and operations'],
      ['Insider transaction patterns in Form 4 filings are leading indicators'],
      ['Material changes from prior filing should be reviewed for risk flags'],
    ],
    GENERAL: [
      ['Monitor for follow-through confirmation before adjusting thesis'],
      ['Cross-reference with technical setup and volume for signal quality'],
      ['Place in context of broader market sentiment and sector momentum'],
    ],
  };

  const pool = pools[params.eventType] ?? pools['GENERAL'];
  return pool.map((arr) => arr[0]);
}

export { EVENT_LABELS };
