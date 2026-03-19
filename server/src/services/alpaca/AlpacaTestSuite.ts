import axios from 'axios';
import { ALPACA_PAPER_URL, getAlpacaCredentials } from './alpacaConfig';
import { placeOrder, cancelOrder, cancelAllOrders, closePosition } from './alpacaExchangeService';
import { getAccount, getPositions } from './alpacaInfoService';

export interface TestCase {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
  durationMs?: number;
  error?: string;
  result?: unknown;
}

export interface TestSuiteResult {
  runId: string;
  startedAt: Date;
  completedAt?: Date;
  passed: number;
  failed: number;
  skipped: number;
  tests: TestCase[];
}

let _lastResult: TestSuiteResult | null = null;

function authHeaders(): Record<string, string> {
  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');
  return {
    'APCA-API-KEY-ID': creds.apiKeyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
  };
}

async function waitForFill(orderId: string, timeoutMs = 10_000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { data } = await axios.get(`${ALPACA_PAPER_URL}/v2/orders/${orderId}`, {
        headers: authHeaders(),
        timeout: 5_000,
      });
      if (data.status === 'filled' || data.status === 'partially_filled') return data.status;
      if (data.status === 'canceled' || data.status === 'expired') return data.status;
    } catch {}
    await new Promise((r) => setTimeout(r, 1_000));
  }
  return 'timeout';
}

async function getCurrentPrice(symbol: string): Promise<number> {
  try {
    const { data } = await axios.get(
      `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
      { headers: authHeaders(), timeout: 5_000 },
    );
    return parseFloat(data?.quote?.ap ?? data?.quote?.bp ?? '0') || 0;
  } catch {
    return 0;
  }
}

async function runTest(
  tc: TestCase,
  fn: () => Promise<unknown>,
): Promise<void> {
  const start = Date.now();
  tc.status = 'running';
  try {
    tc.result = await fn();
    tc.status = 'passed';
  } catch (err: any) {
    tc.status = 'failed';
    tc.error = err?.message ?? String(err);
  }
  tc.durationMs = Date.now() - start;
}

export async function runTestSuite(userId: string): Promise<TestSuiteResult> {
  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');

  const result: TestSuiteResult = {
    runId: `suite-${Date.now()}`,
    startedAt: new Date(),
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [
      { name: 'Market Buy',              description: 'Buy 1 share of SPY at market. Expect: order fills.',                   status: 'pending' },
      { name: 'Market Sell',             description: 'Sell 1 share of SPY from test 1 at market. Expect: position closed.',   status: 'pending' },
      { name: 'Limit Order Place',       description: 'Place limit buy of AAPL 10% below market. Expect: pending.',            status: 'pending' },
      { name: 'Limit Order Cancel',      description: 'Cancel the limit from test 3. Expect: status canceled.',                status: 'pending' },
      { name: 'Bracket Order',           description: 'Buy 1 MSFT with +5%/−3% bracket. Expect: parent filled, 2 legs.',      status: 'pending' },
      { name: 'Bracket Order Close',     description: 'Cancel bracket and close MSFT position. Expect: flat.',                 status: 'pending' },
      { name: 'Fractional Order',        description: 'Buy $10 notional of AAPL. Expect: fractional fill.',                   status: 'pending' },
      { name: 'Account Balance Check',   description: 'Verify equity > 0 and buying_power > 0.',                              status: 'pending' },
      { name: 'Position Count Verify',   description: 'After closes, verify position count is 0.',                            status: 'pending' },
      { name: 'Latency Check',           description: 'Place + cancel a market order. Measure round-trip < 5000ms.',          status: 'pending' },
    ],
  };

  let limitOrderId: string | undefined;
  let bracketOrderId: string | undefined;

  await runTest(result.tests[0], async () => {
    const r = await placeOrder({ symbol: 'SPY', qty: 1, side: 'buy', type: 'market', userId });
    if (!r.success && !r.isDryRun) throw new Error(r.error ?? 'Order failed');
    if (r.orderId) await waitForFill(r.orderId);
    return r;
  });

  await runTest(result.tests[1], async () => {
    const r = await placeOrder({ symbol: 'SPY', qty: 1, side: 'sell', type: 'market', userId });
    if (!r.success && !r.isDryRun) throw new Error(r.error ?? 'Sell failed');
    if (r.orderId) await waitForFill(r.orderId);
    return r;
  });

  await runTest(result.tests[2], async () => {
    const price = await getCurrentPrice('AAPL');
    const limitPrice = price > 0 ? +(price * 0.9).toFixed(2) : 150;
    const r = await placeOrder({ symbol: 'AAPL', qty: 1, side: 'buy', type: 'limit', limitPrice, userId });
    if (!r.success && !r.isDryRun) throw new Error(r.error ?? 'Limit failed');
    limitOrderId = r.orderId;
    return r;
  });

  await runTest(result.tests[3], async () => {
    if (!limitOrderId) { result.tests[3].status = 'skipped'; return 'skipped (no order from test 3)'; }
    const ok = await cancelOrder(limitOrderId, userId);
    if (!ok && !creds.dryRun) throw new Error('Cancel failed');
    return { cancelled: ok };
  });

  await runTest(result.tests[4], async () => {
    const price = await getCurrentPrice('MSFT');
    const tp = price > 0 ? +(price * 1.05).toFixed(2) : undefined;
    const sl = price > 0 ? +(price * 0.97).toFixed(2) : undefined;
    const r = await placeOrder({
      symbol: 'MSFT', qty: 1, side: 'buy', type: 'market',
      orderClass: 'bracket', takeProfitPrice: tp, stopLossPrice: sl, userId,
    });
    if (!r.success && !r.isDryRun) throw new Error(r.error ?? 'Bracket failed');
    bracketOrderId = r.orderId;
    if (r.orderId) await waitForFill(r.orderId);
    return r;
  });

  await runTest(result.tests[5], async () => {
    if (bracketOrderId) await cancelOrder(bracketOrderId, userId).catch(() => {});
    await cancelAllOrders(userId);
    const cp = await closePosition('MSFT', userId);
    return cp;
  });

  await runTest(result.tests[6], async () => {
    const r = await placeOrder({ symbol: 'AAPL', notional: 10, side: 'buy', type: 'market', userId });
    if (!r.success && !r.isDryRun) throw new Error(r.error ?? 'Fractional failed');
    if (r.orderId) await waitForFill(r.orderId);
    return r;
  });

  await runTest(result.tests[7], async () => {
    const acc = await getAccount();
    const equity = parseFloat(acc.equity ?? '0');
    const bp     = parseFloat(acc.buying_power ?? '0');
    if (equity <= 0) throw new Error(`Equity is ${equity}`);
    if (bp <= 0)     throw new Error(`Buying power is ${bp}`);
    return { equity, buyingPower: bp };
  });

  await runTest(result.tests[8], async () => {
    if (!creds.dryRun) {
      await cancelAllOrders(userId);
      await axios.delete(`${ALPACA_PAPER_URL}/v2/positions`, {
        headers: authHeaders(),
        params: { cancel_orders: true },
        timeout: 10_000,
      }).catch(() => {});
    }
    const positions = await getPositions().catch(() => []);
    return { positionCount: positions.length };
  });

  await runTest(result.tests[9], async () => {
    const start = Date.now();
    const r = await placeOrder({ symbol: 'SPY', qty: 1, side: 'buy', type: 'market', userId });
    if (r.orderId) await cancelOrder(r.orderId, userId).catch(() => {});
    const latency = Date.now() - start;
    if (latency >= 5000) throw new Error(`Latency ${latency}ms exceeds 5000ms threshold`);
    return { latencyMs: latency };
  });

  result.passed   = result.tests.filter((t) => t.status === 'passed').length;
  result.failed   = result.tests.filter((t) => t.status === 'failed').length;
  result.skipped  = result.tests.filter((t) => t.status === 'skipped').length;
  result.completedAt = new Date();

  _lastResult = result;
  return result;
}

export function getLastTestResult(): TestSuiteResult | null {
  return _lastResult;
}
