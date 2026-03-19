import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../lib/prisma';
import { placeOrder } from './alpacaExchangeService';
import { getAccount, getAsset } from './alpacaInfoService';

export interface ReplayOptions {
  scanRunId: string;
  userId: string;
  maxPositions?: number;
  minConviction?: number;
  capitalPerTrade?: number;
  useCurrentPrices?: boolean;
}

export interface ReplayResult {
  replayId: string;
  scanRunId: string;
  scanDate: Date;
  candidatesEvaluated: number;
  ordersPlaced: number;
  ordersSkipped: number;
  skippedReasons: Array<{ symbol: string; reason: string }>;
  placedOrders: Array<{ symbol: string; orderId?: string; price: number; conviction: number }>;
  startedAt: Date;
}

export async function runStrategyReplay(opts: ReplayOptions): Promise<ReplayResult> {
  const {
    scanRunId,
    userId,
    maxPositions = 3,
    minConviction = 75,
    capitalPerTrade = 500,
  } = opts;

  const replayId = uuidv4();
  const startedAt = new Date();

  const scanRun = await prisma.dailyScanRun.findUnique({
    where: { id: scanRunId },
  });
  if (!scanRun) throw new Error(`Scan run ${scanRunId} not found`);
  if (scanRun.status !== 'COMPLETED') throw new Error(`Scan run ${scanRunId} is not completed (status: ${scanRun.status})`);

  const results = await (prisma as any).dailyScanResult.findMany({
    where: {
      runId: scanRunId,
      convictionScore: { gte: minConviction },
      bias: 'BULLISH',
      recommendedAction: { in: ['STRONG_BUY', 'BUY'] },
    },
    orderBy: { compositeScore: 'desc' },
    take: maxPositions,
  });

  const account = await getAccount();
  const availableBp = parseFloat(account.buying_power ?? '0');

  const skippedReasons: Array<{ symbol: string; reason: string }> = [];
  const placedOrders:   Array<{ symbol: string; orderId?: string; price: number; conviction: number }> = [];
  let ordersPlaced = 0;
  let ordersSkipped = 0;

  for (const candidate of results as any[]) {
    const symbol = candidate.symbol;

    if (availableBp < capitalPerTrade) {
      skippedReasons.push({ symbol, reason: 'Insufficient buying power' });
      ordersSkipped++;
      continue;
    }

    const asset = await getAsset(symbol).catch(() => null);
    if (!asset || !asset.tradable) {
      skippedReasons.push({ symbol, reason: 'Asset not tradable on Alpaca' });
      ordersSkipped++;
      continue;
    }

    const r = await placeOrder({
      symbol,
      notional: capitalPerTrade,
      side: 'buy',
      type: 'market',
      userId,
      scanRunId,
      submittedPrice: parseFloat(candidate.currentPrice ?? '0') || undefined,
    });

    if (r.success) {
      placedOrders.push({
        symbol,
        orderId: r.orderId,
        price:   parseFloat(candidate.currentPrice ?? '0') || 0,
        conviction: candidate.convictionScore ?? 0,
      });
      ordersPlaced++;
    } else {
      skippedReasons.push({ symbol, reason: r.error ?? 'Order failed' });
      ordersSkipped++;
    }
  }

  return {
    replayId,
    scanRunId,
    scanDate: scanRun.createdAt,
    candidatesEvaluated: results.length,
    ordersPlaced,
    ordersSkipped,
    skippedReasons,
    placedOrders,
    startedAt,
  };
}
