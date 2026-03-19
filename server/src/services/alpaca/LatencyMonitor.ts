import axios from 'axios';
import { ALPACA_PAPER_URL, getAlpacaCredentials, hasAlpacaCredentials } from './alpacaConfig';
import { prisma } from '../../lib/prisma';

export interface LatencyRecord {
  orderId: string;
  symbol: string;
  submittedAt: Date;
  filledAt: Date | null;
  latencyMs: number | null;
  status: string;
}

export interface LatencyStats {
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  p95LatencyMs: number;
  totalOrdersTracked: number;
  avgSlippagePct: number;
  lastUpdated: Date;
}

let _monitorInterval: ReturnType<typeof setInterval> | null = null;

function authHeaders(): Record<string, string> {
  const creds = getAlpacaCredentials();
  if (!creds) return {};
  return {
    'APCA-API-KEY-ID': creds.apiKeyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
  };
}

export function startLatencyMonitor(intervalMs = 5_000): void {
  if (_monitorInterval) return;
  _monitorInterval = setInterval(async () => {
    if (!hasAlpacaCredentials()) return;
    try {
      const cutoff = new Date(Date.now() - 5 * 60_000);
      const pending = await prisma.alpacaOrderLog.findMany({
        where: {
          status: 'submitted',
          filledAt: null,
          alpacaOrderId: { not: null },
          submittedAt: { gte: cutoff },
        },
        take: 20,
      });

      for (const log of pending) {
        try {
          const { data } = await axios.get(
            `${ALPACA_PAPER_URL}/v2/orders/${log.alpacaOrderId}`,
            { headers: authHeaders(), timeout: 5_000 },
          );

          if (data.status === 'filled' && data.filled_at) {
            const filledAt = new Date(data.filled_at);
            const latencyMs = filledAt.getTime() - log.submittedAt.getTime();
            const filledPrice = parseFloat(data.filled_avg_price ?? '0') || null;
            let slippagePct: number | null = null;
            if (filledPrice && log.submittedPrice && log.submittedPrice !== 0) {
              slippagePct = ((filledPrice - log.submittedPrice) / log.submittedPrice) * 100;
            }

            await prisma.alpacaOrderLog.update({
              where: { id: log.id },
              data: {
                status: 'filled',
                filledAt,
                latencyMs,
                filledPrice,
                filledAvgPrice: data.filled_avg_price ?? null,
                filledQty: data.filled_qty ?? null,
                slippagePct,
              },
            });
          } else if (['canceled', 'expired', 'rejected'].includes(data.status)) {
            await prisma.alpacaOrderLog.update({
              where: { id: log.id },
              data: { status: data.status },
            });
          }
        } catch {}
      }
    } catch {}
  }, intervalMs);
}

export function stopLatencyMonitor(): void {
  if (_monitorInterval) {
    clearInterval(_monitorInterval);
    _monitorInterval = null;
  }
}

export async function getLatencyStats(userId: string): Promise<LatencyStats> {
  const rows = await prisma.alpacaOrderLog.findMany({
    where: {
      userId,
      latencyMs: { not: null },
    },
    orderBy: { submittedAt: 'desc' },
    take: 200,
    select: { latencyMs: true, slippagePct: true, submittedAt: true },
  });

  if (rows.length === 0) {
    return {
      avgLatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      p95LatencyMs: 0,
      totalOrdersTracked: 0,
      avgSlippagePct: 0,
      lastUpdated: new Date(),
    };
  }

  const latencies = rows.map((r) => r.latencyMs!).sort((a, b) => a - b);
  const slippages = rows.filter((r) => r.slippagePct != null).map((r) => r.slippagePct!);

  const avg = latencies.reduce((s, v) => s + v, 0) / latencies.length;
  const p95Idx = Math.floor(latencies.length * 0.95);

  return {
    avgLatencyMs: Math.round(avg),
    minLatencyMs: latencies[0],
    maxLatencyMs: latencies[latencies.length - 1],
    p95LatencyMs: latencies[Math.min(p95Idx, latencies.length - 1)],
    totalOrdersTracked: latencies.length,
    avgSlippagePct: slippages.length
      ? slippages.reduce((s, v) => s + v, 0) / slippages.length
      : 0,
    lastUpdated: new Date(),
  };
}
