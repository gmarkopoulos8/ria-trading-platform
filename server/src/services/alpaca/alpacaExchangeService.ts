import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import {
  ALPACA_PAPER_URL,
  getAlpacaCredentials,
  assertSafe,
} from './alpacaConfig';
import { prisma } from '../../lib/prisma';

export interface AlpacaOrderRequest {
  symbol: string;
  qty?: number;
  notional?: number;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop';
  timeInForce?: 'day' | 'gtc' | 'ioc' | 'fok';
  limitPrice?: number;
  stopPrice?: number;
  orderClass?: 'bracket' | 'oco' | 'oto' | '';
  takeProfitPrice?: number;
  stopLossPrice?: number;
  extendedHours?: boolean;
  userId?: string;
  scanRunId?: string;
  submittedPrice?: number;
}

export interface AlpacaOrderResult {
  success: boolean;
  isDryRun: boolean;
  orderId?: string;
  clientOrderId?: string;
  submittedAt?: Date;
  error?: string;
}

function authHeaders(): Record<string, string> {
  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');
  return {
    'APCA-API-KEY-ID': creds.apiKeyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
  };
}

export async function placeOrder(req: AlpacaOrderRequest): Promise<AlpacaOrderResult> {
  assertSafe('order');

  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');

  const clientOrderId = `riabot-${uuidv4().slice(0, 8)}`;
  const submittedAt = new Date();

  const body: Record<string, unknown> = {
    symbol: req.symbol,
    side: req.side,
    type: req.type,
    time_in_force: req.timeInForce ?? 'day',
    client_order_id: clientOrderId,
    extended_hours: req.extendedHours ?? false,
  };

  if (req.qty != null)      body.qty = String(req.qty);
  if (req.notional != null) body.notional = String(req.notional);
  if (req.limitPrice != null) body.limit_price = String(req.limitPrice);
  if (req.stopPrice != null)  body.stop_price  = String(req.stopPrice);

  if (req.orderClass === 'bracket') {
    body.order_class = 'bracket';
    if (req.takeProfitPrice != null) body.take_profit = { limit_price: String(req.takeProfitPrice) };
    if (req.stopLossPrice   != null) body.stop_loss   = { stop_price:  String(req.stopLossPrice) };
  }

  if (creds.dryRun) {
    await prisma.alpacaOrderLog.create({
      data: {
        userId:       req.userId ?? 'system',
        symbol:       req.symbol,
        side:         req.side,
        orderType:    req.type,
        qty:          req.qty != null ? String(req.qty) : null,
        notional:     req.notional != null ? String(req.notional) : null,
        limitPrice:   req.limitPrice != null ? String(req.limitPrice) : null,
        stopPrice:    req.stopPrice != null ? String(req.stopPrice) : null,
        timeInForce:  req.timeInForce ?? 'day',
        orderClass:   req.orderClass ?? null,
        clientOrderId,
        status:       'dry_run',
        isDryRun:     true,
        submittedAt,
        submittedPrice: req.submittedPrice ?? null,
        scanRunId:    req.scanRunId ?? null,
      },
    });
    return { success: true, isDryRun: true, clientOrderId, submittedAt };
  }

  try {
    const { data } = await axios.post(`${ALPACA_PAPER_URL}/v2/orders`, body, {
      headers: authHeaders(),
      timeout: 10_000,
    });

    await prisma.alpacaOrderLog.create({
      data: {
        userId:        req.userId ?? 'system',
        symbol:        req.symbol,
        side:          req.side,
        orderType:     req.type,
        qty:           req.qty != null ? String(req.qty) : null,
        notional:      req.notional != null ? String(req.notional) : null,
        limitPrice:    req.limitPrice != null ? String(req.limitPrice) : null,
        stopPrice:     req.stopPrice != null ? String(req.stopPrice) : null,
        timeInForce:   req.timeInForce ?? 'day',
        orderClass:    req.orderClass ?? null,
        alpacaOrderId: data.id,
        clientOrderId: data.client_order_id ?? clientOrderId,
        status:        'submitted',
        isDryRun:      false,
        submittedAt,
        submittedPrice: req.submittedPrice ?? null,
        scanRunId:     req.scanRunId ?? null,
      },
    });

    return {
      success: true,
      isDryRun: false,
      orderId: data.id,
      clientOrderId: data.client_order_id ?? clientOrderId,
      submittedAt,
    };
  } catch (err: any) {
    const errorMessage = err?.response?.data?.message ?? err?.message ?? 'Unknown error';
    await prisma.alpacaOrderLog.create({
      data: {
        userId:       req.userId ?? 'system',
        symbol:       req.symbol,
        side:         req.side,
        orderType:    req.type,
        qty:          req.qty != null ? String(req.qty) : null,
        notional:     req.notional != null ? String(req.notional) : null,
        clientOrderId,
        status:       'error',
        isDryRun:     false,
        errorMessage,
        submittedAt,
      },
    }).catch(() => {});
    return { success: false, isDryRun: false, error: errorMessage };
  }
}

export async function cancelOrder(orderId: string, userId?: string): Promise<boolean> {
  try {
    await axios.delete(`${ALPACA_PAPER_URL}/v2/orders/${orderId}`, {
      headers: authHeaders(),
      timeout: 10_000,
    });
    await prisma.alpacaOrderLog.updateMany({
      where: { alpacaOrderId: orderId },
      data: { status: 'canceled' },
    });
    return true;
  } catch {
    return false;
  }
}

export async function cancelAllOrders(userId?: string): Promise<number> {
  try {
    const { data } = await axios.delete<Array<{ id: string }>>(`${ALPACA_PAPER_URL}/v2/orders`, {
      headers: authHeaders(),
      timeout: 10_000,
    });
    const ids = Array.isArray(data) ? data.map((o) => o.id) : [];
    if (ids.length > 0) {
      await prisma.alpacaOrderLog.updateMany({
        where: { alpacaOrderId: { in: ids } },
        data: { status: 'canceled' },
      });
    }
    return ids.length;
  } catch {
    return 0;
  }
}

export async function closePosition(
  symbol: string,
  userId?: string,
): Promise<AlpacaOrderResult> {
  try {
    const { data } = await axios.delete(
      `${ALPACA_PAPER_URL}/v2/positions/${encodeURIComponent(symbol)}`,
      { headers: authHeaders(), timeout: 10_000 },
    );
    return {
      success: true,
      isDryRun: false,
      orderId: data?.id,
      clientOrderId: data?.client_order_id,
      submittedAt: new Date(),
    };
  } catch (err: any) {
    return {
      success: false,
      isDryRun: false,
      error: err?.response?.data?.message ?? err?.message ?? 'Close position failed',
    };
  }
}

export async function closeAllPositions(
  userId?: string,
): Promise<{ closed: number; errors: string[] }> {
  const errors: string[] = [];
  try {
    await axios.delete(`${ALPACA_PAPER_URL}/v2/positions`, {
      headers: authHeaders(),
      params: { cancel_orders: true },
      timeout: 15_000,
    });
    const positions = await import('./alpacaInfoService').then((m) => m.getPositions()).catch(() => []);
    return { closed: positions.length, errors };
  } catch (err: any) {
    errors.push(err?.response?.data?.message ?? err?.message ?? 'Failed');
    return { closed: 0, errors };
  }
}

export interface AlpacaOptionsOrderResult {
  success: boolean;
  isDryRun: boolean;
  orders: Array<{
    leg: 'BUY' | 'SELL';
    contractSymbol: string;
    orderId?: string;
    clientOrderId?: string;
    error?: string;
  }>;
  strategyName: string;
  ticker: string;
  totalCost: number;
  error?: string;
}

export async function placeOptionsOrder(
  ticker: string,
  strategyName: string,
  legs: Array<{
    action: 'BUY' | 'SELL';
    contractSymbol: string;
    contracts: number;
    limitPrice: number;
  }>,
  userId: string,
  totalCost: number,
): Promise<AlpacaOptionsOrderResult> {
  assertSafe('options order');

  const creds = getAlpacaCredentials();
  if (!creds) throw new Error('Alpaca credentials not configured');

  const orderResults: AlpacaOptionsOrderResult['orders'] = [];

  if (creds.dryRun) {
    for (const leg of legs) {
      const clientOrderId = `riabot-opt-${uuidv4().slice(0, 8)}`;
      await prisma.alpacaOrderLog.create({
        data: {
          userId,
          symbol:       leg.contractSymbol,
          side:         leg.action.toLowerCase(),
          orderType:    'limit',
          qty:          String(leg.contracts),
          limitPrice:   String(leg.limitPrice),
          timeInForce:  'day',
          clientOrderId,
          status:       'dry_run',
          isDryRun:     true,
          submittedAt:  new Date(),
        },
      });
      orderResults.push({ leg: leg.action, contractSymbol: leg.contractSymbol, clientOrderId });
    }
    return { success: true, isDryRun: true, orders: orderResults, strategyName, ticker, totalCost };
  }

  for (const leg of legs) {
    const clientOrderId = `riabot-opt-${uuidv4().slice(0, 8)}`;
    try {
      const body = {
        symbol:          leg.contractSymbol,
        qty:             String(leg.contracts),
        side:            leg.action === 'BUY' ? 'buy' : 'sell',
        type:            'limit',
        limit_price:     leg.limitPrice.toFixed(2),
        time_in_force:   'day',
        client_order_id: clientOrderId,
      };

      const { data } = await axios.post(`${ALPACA_PAPER_URL}/v2/orders`, body, {
        headers: authHeaders(),
        timeout: 10_000,
      });

      await prisma.alpacaOrderLog.create({
        data: {
          userId,
          symbol:        leg.contractSymbol,
          side:          leg.action.toLowerCase(),
          orderType:     'limit',
          qty:           String(leg.contracts),
          limitPrice:    String(leg.limitPrice),
          timeInForce:   'day',
          alpacaOrderId: data.id,
          clientOrderId: data.client_order_id ?? clientOrderId,
          status:        'submitted',
          isDryRun:      false,
          submittedAt:   new Date(),
        },
      });

      orderResults.push({ leg: leg.action, contractSymbol: leg.contractSymbol, orderId: data.id, clientOrderId });
    } catch (err: any) {
      const errMsg = err?.response?.data?.message ?? err?.message ?? 'Order failed';
      orderResults.push({ leg: leg.action, contractSymbol: leg.contractSymbol, error: errMsg });
    }
  }

  const allSucceeded = orderResults.every(o => !o.error);
  return {
    success:     allSucceeded,
    isDryRun:    false,
    orders:      orderResults,
    strategyName,
    ticker,
    totalCost,
    error:       allSucceeded ? undefined : orderResults.find(o => o.error)?.error,
  };
}
