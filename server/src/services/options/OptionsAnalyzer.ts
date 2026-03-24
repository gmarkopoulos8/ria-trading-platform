import { getOptionsChain, computeIVRank, filterByDTE, filterByDelta, filterByLiquidity, getBidAskSpreadPct, getDTE } from './OptionsDataService';
import { detectRegime } from '../market/RegimeDetector';
import type { OptionContract, OptionsRecommendation, OptionsLeg, OptionsStrategy } from './types';
import type { FullThesisResult } from '../thesis/types';

function parseHoldWindowDays(w: string): number {
  if (w.includes('INTRADAY')) return 1;
  if (w.includes('1-3 DAYS')) return 2;
  if (w.includes('1-2 WEEKS')) return 10;
  if (w.includes('2-4 WEEKS')) return 21;
  if (w.includes('1-3 MONTHS')) return 60;
  if (w.includes('3-6 MONTHS')) return 120;
  return 21;
}

function isLiquid(contract: OptionContract): boolean {
  return (
    contract.volume >= 100 &&
    contract.openInterest >= 500 &&
    getBidAskSpreadPct(contract) <= 15
  );
}

async function selectStrategy(
  bias: string,
  conviction: number,
  ivRank: number,
  holdWindow: string,
  forPremiumSelling = false,
): Promise<OptionsStrategy> {
  const holdDays = parseHoldWindowDays(holdWindow);

  try {
    const regime = await detectRegime();

    // BEAR_CRISIS: VIX 30+ = maximum premium. Sell Iron Condors aggressively.
    // This is the BEST time to sell options, not a time to avoid.
    if (regime.regime === 'BEAR_CRISIS') {
      if (ivRank > 40) return 'IRON_CONDOR';
      if (ivRank > 20) return 'CASH_SECURED_PUT';
      return 'IRON_CONDOR'; // still better than not trading
    }

    if (regime.regime === 'ELEVATED_VOLATILITY') {
      // High IV = sell premium. Always find something to sell.
      if (bias === 'NEUTRAL' || forPremiumSelling) return 'IRON_CONDOR';
      if (bias === 'BULLISH') return ivRank > 65 ? 'COVERED_CALL' : 'CASH_SECURED_PUT';
      if (bias === 'BEARISH') return ivRank > 65 ? 'IRON_CONDOR' : 'BEAR_PUT_SPREAD';
      return 'IRON_CONDOR'; // fallback — always sell premium in elevated vol
    }

    if (regime.regime === 'CHOPPY') {
      if (ivRank > 50) {
        if (bias === 'NEUTRAL' || forPremiumSelling) return 'IRON_CONDOR';
        if (bias === 'BULLISH') return 'CASH_SECURED_PUT';
      }
      if (conviction < 72 && !forPremiumSelling) {
        return ivRank > 45 ? 'IRON_CONDOR' : 'NONE';
      }
    }
  } catch {
    // non-fatal — fall through to default logic
  }

  // BULL_TREND or unknown regime
  if (bias === 'NEUTRAL' || forPremiumSelling) {
    if (ivRank > 50) return 'IRON_CONDOR';
    if (ivRank > 35) return 'CASH_SECURED_PUT';
    return 'NONE';
  }

  if (conviction < 68 && !forPremiumSelling) {
    if (ivRank > 55) return 'IRON_CONDOR';
    return 'NONE';
  }

  if (bias === 'BULLISH') {
    if (holdDays <= 3) return 'LONG_CALL';
    if (ivRank > 65 && conviction >= 72) return 'COVERED_CALL';
    if (ivRank > 50 && conviction >= 72) return 'CASH_SECURED_PUT';
    if (conviction >= 75) return 'BULL_CALL_SPREAD';
    return 'LONG_CALL';
  }

  if (bias === 'BEARISH') {
    if (ivRank > 55 && conviction >= 70) return 'IRON_CONDOR';
    if (conviction >= 72) return 'BEAR_PUT_SPREAD';
    if (ivRank > 45) return 'IRON_CONDOR';
    return 'BEAR_PUT_SPREAD';
  }

  return 'NONE';
}

function findClosestDelta(contracts: OptionContract[], targetDelta: number): OptionContract | null {
  if (contracts.length === 0) return null;
  return contracts.reduce((best, c) => {
    if (c.delta === null) return best;
    if (best === null || best.delta === null) return c;
    return Math.abs(Math.abs(c.delta) - targetDelta) < Math.abs(Math.abs(best.delta) - targetDelta) ? c : best;
  }, null as OptionContract | null);
}

function buildLongCall(
  ticker: string,
  calls: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dteCalls = filterByDTE(calls, 25, 50);
  const liquidCalls = dteCalls.filter(isLiquid);
  const contract = findClosestDelta(liquidCalls, 0.60);
  if (!contract) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (contract.mid * 100)));
  const maxRisk = numContracts * contract.mid * 100;
  const breakeven = contract.strike + contract.mid;
  const pop = Math.max(5, Math.round(((contract.delta ?? 0.5) - 0.10) * 100));

  return {
    strategy: 'LONG_CALL',
    ticker,
    legs: [{ action: 'BUY', contract, contracts: numContracts }],
    maxRisk,
    maxProfit: Infinity,
    breakeven,
    probabilityOfProfit: pop,
    ivRank,
    netDebit: contract.mid,
    rewardRiskRatio: Infinity,
    reasoning: [
      `Bullish directional play — ${contract.dte} DTE, strike $${contract.strike}`,
      `Delta ${contract.delta?.toFixed(2) ?? 'N/A'} — slightly ITM for strong directional exposure`,
      `IV rank ${ivRank}/100 — buying options when IV relatively low`,
    ],
    warnings: ivRank > 50 ? ['IV elevated — premium is relatively expensive'] : [],
    fetchedAt: new Date(),
  };
}

function buildLongPut(
  ticker: string,
  puts: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dtePuts = filterByDTE(puts, 25, 50);
  const liquidPuts = dtePuts.filter(isLiquid);
  const contract = findClosestDelta(liquidPuts, 0.60);
  if (!contract) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (contract.mid * 100)));
  const maxRisk = numContracts * contract.mid * 100;
  const breakeven = contract.strike - contract.mid;
  const pop = Math.max(5, Math.round(((contract.delta !== null ? Math.abs(contract.delta) : 0.5) - 0.10) * 100));

  return {
    strategy: 'LONG_PUT',
    ticker,
    legs: [{ action: 'BUY', contract, contracts: numContracts }],
    maxRisk,
    maxProfit: contract.strike * numContracts * 100,
    breakeven,
    probabilityOfProfit: pop,
    ivRank,
    netDebit: contract.mid,
    rewardRiskRatio: (contract.strike - contract.mid) / contract.mid,
    reasoning: [
      `Bearish directional play — ${contract.dte} DTE, strike $${contract.strike}`,
      `Delta ~${contract.delta?.toFixed(2) ?? 'N/A'} — meaningful downside exposure`,
    ],
    warnings: ivRank > 50 ? ['IV elevated — premium is expensive for long puts'] : [],
    fetchedAt: new Date(),
  };
}

function buildBullCallSpread(
  ticker: string,
  calls: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dteCalls = filterByDTE(calls, 25, 50);
  const liquidCalls = dteCalls.filter(isLiquid);

  const longContract = findClosestDelta(liquidCalls, 0.60);
  if (!longContract) return null;

  const shortStrikeTarget = currentPrice * 1.05;
  const shortContract = liquidCalls
    .filter((c) => c.strike > longContract.strike && c.expiration === longContract.expiration)
    .sort((a, b) => Math.abs(a.strike - shortStrikeTarget) - Math.abs(b.strike - shortStrikeTarget))[0] ?? null;

  if (!shortContract) return null;

  const netDebit = longContract.mid - shortContract.mid;
  if (netDebit <= 0) return null;

  const maxProfit = (shortContract.strike - longContract.strike - netDebit);
  const rr = maxProfit / netDebit;
  if (rr < 1.5) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (netDebit * 100)));
  const breakeven = longContract.strike + netDebit;

  return {
    strategy: 'BULL_CALL_SPREAD',
    ticker,
    legs: [
      { action: 'BUY', contract: longContract, contracts: numContracts },
      { action: 'SELL', contract: shortContract, contracts: numContracts },
    ],
    maxRisk: netDebit * numContracts * 100,
    maxProfit: maxProfit * numContracts * 100,
    breakeven,
    probabilityOfProfit: Math.round((longContract.delta ?? 0.5) * 100),
    ivRank,
    netDebit,
    rewardRiskRatio: rr,
    reasoning: [
      `Defined-risk bullish spread: buy $${longContract.strike}C / sell $${shortContract.strike}C`,
      `Net debit $${netDebit.toFixed(2)} per share, max profit $${maxProfit.toFixed(2)} per share`,
      `Reward:Risk ratio ${rr.toFixed(2)}:1`,
    ],
    warnings: [],
    fetchedAt: new Date(),
  };
}

function buildBearPutSpread(
  ticker: string,
  puts: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dtePuts = filterByDTE(puts, 25, 50);
  const liquidPuts = dtePuts.filter(isLiquid);

  const longContract = findClosestDelta(liquidPuts, 0.60);
  if (!longContract) return null;

  const shortStrikeTarget = currentPrice * 0.95;
  const shortContract = liquidPuts
    .filter((c) => c.strike < longContract.strike && c.expiration === longContract.expiration)
    .sort((a, b) => Math.abs(a.strike - shortStrikeTarget) - Math.abs(b.strike - shortStrikeTarget))[0] ?? null;

  if (!shortContract) return null;

  const netDebit = longContract.mid - shortContract.mid;
  if (netDebit <= 0) return null;

  const maxProfit = longContract.strike - shortContract.strike - netDebit;
  const rr = maxProfit / netDebit;
  if (rr < 1.5) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (netDebit * 100)));
  const breakeven = longContract.strike - netDebit;

  return {
    strategy: 'BEAR_PUT_SPREAD',
    ticker,
    legs: [
      { action: 'BUY', contract: longContract, contracts: numContracts },
      { action: 'SELL', contract: shortContract, contracts: numContracts },
    ],
    maxRisk: netDebit * numContracts * 100,
    maxProfit: maxProfit * numContracts * 100,
    breakeven,
    probabilityOfProfit: Math.round((longContract.delta !== null ? Math.abs(longContract.delta) : 0.5) * 100),
    ivRank,
    netDebit,
    rewardRiskRatio: rr,
    reasoning: [
      `Defined-risk bearish spread: buy $${longContract.strike}P / sell $${shortContract.strike}P`,
      `Net debit $${netDebit.toFixed(2)}, max profit $${maxProfit.toFixed(2)} per share`,
      `Reward:Risk ${rr.toFixed(2)}:1`,
    ],
    warnings: [],
    fetchedAt: new Date(),
  };
}

function buildCashSecuredPut(
  ticker: string,
  puts: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dtePuts = filterByDTE(puts, 25, 35);
  const liquidPuts = dtePuts.filter(isLiquid);
  const deltaFiltered = filterByDelta(liquidPuts, 0.30, 0.40);

  const invalidationLevel = thesis.thesis.invalidationZone.level;
  const targetStrikeMax = invalidationLevel > 0 ? invalidationLevel : currentPrice * 0.95;

  const eligible = deltaFiltered.filter((c) => {
    const pct = (currentPrice - c.strike) / currentPrice;
    return pct >= 0.05 && c.strike <= targetStrikeMax;
  });

  if (eligible.length === 0) return null;
  const contract = eligible[0];

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (contract.strike * 100)));
  const netCredit = contract.mid;
  const breakeven = contract.strike - contract.mid;

  return {
    strategy: 'CASH_SECURED_PUT',
    ticker,
    legs: [{ action: 'SELL', contract, contracts: numContracts }],
    maxRisk: (contract.strike - contract.mid) * numContracts * 100,
    maxProfit: netCredit * numContracts * 100,
    breakeven,
    probabilityOfProfit: Math.round((1 - (contract.delta !== null ? Math.abs(contract.delta) : 0.35)) * 100),
    ivRank,
    netDebit: -netCredit,
    rewardRiskRatio: netCredit / (contract.strike - netCredit),
    reasoning: [
      `Sell put at $${contract.strike} — collect $${netCredit.toFixed(2)} credit per share`,
      `High IV rank ${ivRank}/100 — favorable time to sell premium`,
      `Strike ${((1 - contract.strike / currentPrice) * 100).toFixed(1)}% below current price`,
    ],
    warnings: [
      `Cash required: $${(contract.strike * 100 * numContracts).toLocaleString()}`,
      'Max loss if stock goes to zero (unlikely but must have capital to buy shares)',
    ],
    fetchedAt: new Date(),
  };
}

function buildIronCondor(
  ticker: string,
  calls: OptionContract[],
  puts: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dte30Calls = filterByDTE(calls, 25, 45).filter(isLiquid);
  const dte30Puts  = filterByDTE(puts,  25, 45).filter(isLiquid);

  const shortCall = findClosestDelta(dte30Calls, 0.20);
  const shortPut  = findClosestDelta(dte30Puts,  0.20);
  if (!shortCall || !shortPut) return null;

  const longCallEligible = dte30Calls.filter(c => c.strike > shortCall.strike + 2);
  const longPutEligible  = dte30Puts.filter(c  => c.strike < shortPut.strike  - 2);
  if (longCallEligible.length === 0 || longPutEligible.length === 0) return null;

  const longCall = longCallEligible.sort((a, b) => a.strike - b.strike)[0];
  const longPut  = longPutEligible.sort((a, b) => b.strike - a.strike)[0];

  const callSpreadWidth = longCall.strike - shortCall.strike;
  const putSpreadWidth  = shortPut.strike - longPut.strike;
  const maxRiskPerSide  = Math.max(callSpreadWidth, putSpreadWidth) * 100;
  const netCredit       = (shortCall.mid + shortPut.mid - longCall.mid - longPut.mid);
  if (netCredit <= 0) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / maxRiskPerSide));
  const maxRisk      = (maxRiskPerSide - netCredit * 100) * numContracts;
  const maxProfit    = netCredit * 100 * numContracts;

  return {
    strategy: 'IRON_CONDOR',
    ticker,
    legs: [
      { action: 'SELL', contract: shortCall, contracts: numContracts },
      { action: 'BUY',  contract: longCall,  contracts: numContracts },
      { action: 'SELL', contract: shortPut,  contracts: numContracts },
      { action: 'BUY',  contract: longPut,   contracts: numContracts },
    ],
    maxRisk,
    maxProfit,
    breakeven: shortCall.strike,
    probabilityOfProfit: Math.round((1 - Math.abs(shortCall.delta ?? 0.20) - Math.abs(shortPut.delta ?? 0.20)) * 100),
    ivRank,
    netDebit: -netCredit,
    rewardRiskRatio: maxProfit / maxRisk,
    reasoning: [
      `Iron condor: sell $${shortCall.strike}C / $${shortPut.strike}P, buy $${longCall.strike}C / $${longPut.strike}P`,
      `Collect $${(netCredit * numContracts * 100).toFixed(0)} credit — profitable if ${ticker} stays between $${shortPut.strike}–$${shortCall.strike}`,
      `IV Rank ${ivRank}/100 — high IV favors premium selling`,
    ],
    warnings: [
      `Loss if ${ticker} moves sharply beyond $${shortCall.strike} or below $${shortPut.strike}`,
      'Best for range-bound markets or when expecting mean reversion',
    ],
    fetchedAt: new Date(),
  };
}

function buildCoveredCall(
  ticker: string,
  calls: OptionContract[],
  currentPrice: number,
  ivRank: number,
  maxRiskDollars: number,
  thesis: FullThesisResult,
): OptionsRecommendation | null {
  const dteCalls   = filterByDTE(calls, 20, 40).filter(isLiquid);
  const otmCalls   = dteCalls.filter(c => c.strike > currentPrice * 1.03);
  const contract   = findClosestDelta(otmCalls, 0.30);
  if (!contract) return null;

  const numContracts = Math.max(1, Math.floor(maxRiskDollars / (currentPrice * 100)));
  const credit       = contract.mid;
  const maxProfit    = (contract.strike - currentPrice + credit) * numContracts * 100;

  return {
    strategy: 'COVERED_CALL',
    ticker,
    legs: [{ action: 'SELL', contract, contracts: numContracts }],
    maxRisk:  currentPrice * numContracts * 100,
    maxProfit,
    breakeven: currentPrice - credit,
    probabilityOfProfit: Math.round((1 - Math.abs(contract.delta ?? 0.30)) * 100),
    ivRank,
    netDebit: -credit,
    rewardRiskRatio: credit / currentPrice,
    reasoning: [
      `Sell $${contract.strike} covered call — collect $${credit.toFixed(2)}/share premium`,
      `IV Rank ${ivRank}/100 — high IV makes this premium attractive`,
      `Capped upside at $${contract.strike}, breakeven at $${(currentPrice - credit).toFixed(2)}`,
    ],
    warnings: [
      'Requires 100 shares per contract (stock ownership required)',
      `Upside capped at $${contract.strike} — forfeited if stock rallies above that`,
    ],
    fetchedAt: new Date(),
  };
}

export async function getRecommendation(
  thesis: FullThesisResult,
  accountEquity: number,
  maxRiskDollars: number,
  forPremiumSelling = false,
): Promise<OptionsRecommendation | null> {
  const ticker = thesis.ticker;
  const bias = thesis.thesis.bias;
  const conviction = thesis.thesis.convictionScore;
  const holdWindow = thesis.thesis.suggestedHoldWindow;
  const currentPrice = thesis.marketStructure.currentPrice;

  if (ticker.length > 5 || currentPrice < 5) return null;
  if (!process.env.FINNHUB_API_KEY) return null;

  const [chain, ivRank] = await Promise.all([
    getOptionsChain(ticker),
    computeIVRank(ticker),
  ]);

  if (!chain || chain.calls.length === 0) return null;

  const ivR = ivRank?.rank ?? 50;
  const strategy = await selectStrategy(bias, conviction, ivR, holdWindow, forPremiumSelling);
  if (strategy === 'NONE') return null;

  switch (strategy) {
    case 'LONG_CALL':
      return buildLongCall(ticker, chain.calls, currentPrice, ivR, maxRiskDollars, thesis);
    case 'LONG_PUT':
      return buildLongPut(ticker, chain.puts, currentPrice, ivR, maxRiskDollars, thesis);
    case 'BULL_CALL_SPREAD':
      return buildBullCallSpread(ticker, chain.calls, currentPrice, ivR, maxRiskDollars, thesis);
    case 'BEAR_PUT_SPREAD':
      return buildBearPutSpread(ticker, chain.puts, currentPrice, ivR, maxRiskDollars, thesis);
    case 'CASH_SECURED_PUT':
      return buildCashSecuredPut(ticker, chain.puts, currentPrice, ivR, maxRiskDollars, thesis);
    case 'IRON_CONDOR':
      return buildIronCondor(ticker, chain.calls, chain.puts, currentPrice, ivR, maxRiskDollars, thesis);
    case 'COVERED_CALL':
      return buildCoveredCall(ticker, chain.calls, currentPrice, ivR, maxRiskDollars, thesis);
    default:
      return null;
  }
}
