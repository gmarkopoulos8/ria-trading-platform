import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Layers, TrendingUp, TrendingDown, Minus, DollarSign, Droplets,
  Bell, CheckCircle2, XCircle, AlertTriangle, Clock, Zap,
  RefreshCw, ChevronRight, BarChart3, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';
import { ThesisCard } from '../../components/polymarket/ThesisCard';

type PolyBias = 'yes' | 'no' | 'neutral';
type ActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';

interface Market { id: string; question: string; yesPrice: number; noPrice: number; volume: number; liquidity: number; endDate: string | null; category: string; }
interface OpenPosition { id: string; marketId: string; question: string; selectedSide: string; entryProbability: number; currentMark: number; unrealizedPnl: number; capitalAllocated: number; quantity: number; openedAt: string; }
interface ClosedPosition { id: string; question: string; selectedSide: string; realizedPnl: number; pnlPercent: number; closedAt: string; }
interface PolyAlert { id: string; marketId: string; alertType: string; severity: string; title: string; message: string; isRead: boolean; createdAt: string; }

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-500/30 bg-red-500/5',
  warning:  'border-orange-500/30 bg-orange-500/5',
  caution:  'border-yellow-500/30 bg-yellow-500/5',
  info:     'border-accent-blue/30 bg-accent-blue/5',
};
const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning:  'bg-orange-500',
  caution:  'bg-yellow-500',
  info:     'bg-accent-blue',
};

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
function pct(p: number) { return `${(p * 100).toFixed(1)}¢`; }
function relTime(s: string) {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function MarketMiniCard({ market, rank }: { market: Market; rank?: number }) {
  const navigate = useNavigate();
  const bias = market.yesPrice >= 0.6 ? 'yes' : market.yesPrice <= 0.4 ? 'no' : 'neutral';
  return (
    <div onClick={() => navigate(`/polymarket/market/${market.id}`)}
      className="flex items-center gap-3 p-3 hover:bg-surface-2 rounded-xl cursor-pointer transition-colors group border border-transparent hover:border-surface-border">
      {rank != null && <span className="text-[10px] font-mono text-slate-600 w-4 flex-shrink-0">{rank}</span>}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white leading-snug line-clamp-1 group-hover:text-accent-purple transition-colors">{market.question}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">{fmt(market.volume)} vol · {fmt(market.liquidity)} liq</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className={cn('text-xs font-mono font-bold', bias === 'yes' ? 'text-accent-green' : bias === 'no' ? 'text-red-400' : 'text-slate-400')}>
          {pct(market.yesPrice)}
        </p>
        <p className="text-[10px] text-slate-600 font-mono">YES</p>
      </div>
    </div>
  );
}

function PositionRow({ pos, onClose }: { pos: OpenPosition; onClose: (id: string) => void }) {
  const navigate = useNavigate();
  const delta = pos.currentMark - pos.entryProbability;
  const isWinning = pos.selectedSide === 'YES' ? delta > 0 : delta < 0;
  const [closing, setClosing] = useState(false);

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-surface-border hover:bg-surface-2 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', pos.selectedSide === 'YES' ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
            {pos.selectedSide}
          </span>
          <p className="text-xs text-white line-clamp-1 flex-1">{pos.question}</p>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono">
          <span>Entry: {pct(pos.entryProbability)}</span>
          <span>Mark: {pct(pos.currentMark ?? pos.entryProbability)}</span>
          <span>Qty: {pos.quantity}</span>
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={cn('text-sm font-bold font-mono', (pos.unrealizedPnl ?? 0) >= 0 ? 'text-accent-green' : 'text-red-400')}>
          {(pos.unrealizedPnl ?? 0) >= 0 ? '+' : ''}${(pos.unrealizedPnl ?? 0).toFixed(2)}
        </p>
        <button onClick={() => onClose(pos.id)} disabled={closing}
          className="text-[10px] text-slate-600 hover:text-red-400 transition-colors mt-0.5">
          Close
        </button>
      </div>
    </div>
  );
}

function AlertItem({ alert, onRead }: { alert: PolyAlert; onRead: (id: string) => void }) {
  const style = SEVERITY_STYLE[alert.severity] ?? SEVERITY_STYLE.info;
  const dot   = SEVERITY_DOT[alert.severity] ?? SEVERITY_DOT.info;
  return (
    <div className={cn('flex items-start gap-3 p-3 rounded-xl border', style)}>
      <div className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-0.5', dot)} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white mb-0.5">{alert.title}</p>
        <p className="text-[10px] text-slate-400">{alert.message}</p>
        <p className="text-[10px] text-slate-600 mt-1">{relTime(alert.createdAt)}</p>
      </div>
      {!alert.isRead && (
        <button onClick={() => onRead(alert.id)} className="text-[10px] text-slate-600 hover:text-white transition-colors flex-shrink-0">✓</button>
      )}
    </div>
  );
}

export default function PolymarketDashboard() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: marketsData, isLoading: mLoading } = useQuery({
    queryKey: ['poly-markets-dash'],
    queryFn: () => api.polymarket.markets({ limit: 30, status: 'active', sortBy: 'volume' }),
    staleTime: 120_000,
  });

  const { data: positionsData, isLoading: pLoading } = useQuery({
    queryKey: ['poly-positions'],
    queryFn: () => api.polymarket.positions(),
    staleTime: 30_000,
  });

  const { data: alertsData } = useQuery({
    queryKey: ['poly-alerts'],
    queryFn: () => api.polymarket.alerts(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const readAlertMutation = useMutation({
    mutationFn: (id: string) => api.polymarket.readAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['poly-alerts'] }),
  });

  const closePositionMutation = useMutation({
    mutationFn: async (positionId: string) => {
      const pos = openPositions.find((p) => p.id === positionId);
      if (!pos) throw new Error('Position not found');
      return api.polymarket.closePosition(positionId, { exitProbability: pos.currentMark ?? pos.entryProbability });
    },
    onSuccess: () => {
      toast.success('Position closed');
      qc.invalidateQueries({ queryKey: ['poly-positions'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed to close position'),
  });

  const markets: Market[]        = (marketsData as any)?.data?.markets ?? [];
  const openPositions: OpenPosition[] = (positionsData as any)?.data?.open ?? [];
  const closedPositions: ClosedPosition[] = (positionsData as any)?.data?.closed ?? [];
  const summary = (positionsData as any)?.data?.summary ?? {};
  const alerts: PolyAlert[]      = (alertsData as any)?.data?.alerts ?? [];
  const unreadCount: number      = (alertsData as any)?.data?.unreadCount ?? 0;

  const topByVolume    = [...markets].sort((a, b) => b.volume - a.volume).slice(0, 5);
  const topByLiquidity = [...markets].sort((a, b) => b.liquidity - a.liquidity).slice(0, 5);
  const topByUrgency   = [...markets].filter((m) => m.endDate).sort((a, b) => new Date(a.endDate!).getTime() - new Date(b.endDate!).getTime()).slice(0, 5);

  const totalRealPnl   = summary.totalRealizedPnl ?? 0;
  const totalOpenPnl   = summary.totalUnrealizedPnl ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center">
              <Layers className="h-4 w-4 text-accent-purple" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Polymarket Dashboard</h1>
              <p className="text-xs text-slate-500">Prediction markets · paper trading simulator</p>
            </div>
          </div>
          <button onClick={() => navigate('/polymarket/explorer')}
            className="flex items-center gap-2 px-4 py-2 bg-accent-purple text-white text-xs font-bold rounded-xl hover:bg-accent-purple/80 transition-colors">
            <Layers className="h-3.5 w-3.5" /> Explore Markets
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Open Positions"   value={openPositions.length}                                   color="blue"   icon={<Activity className="h-4 w-4" />} />
          <StatCard label="Unrealized P&L"   value={`${totalOpenPnl >= 0 ? '+' : ''}$${totalOpenPnl.toFixed(2)}`}   color={totalOpenPnl >= 0 ? 'green' : 'red'} icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Realized P&L"     value={`${totalRealPnl >= 0 ? '+' : ''}$${totalRealPnl.toFixed(2)}`}   color={totalRealPnl >= 0 ? 'green' : 'red'} icon={<CheckCircle2 className="h-4 w-4" />} />
          <StatCard label="Active Alerts"    value={unreadCount}                                             color="amber"  icon={<Bell className="h-4 w-4" />} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Top Volume Markets" icon={<BarChart3 className="h-4 w-4" />}
                action={<button onClick={() => navigate('/polymarket/explorer')} className="text-[10px] text-accent-purple hover:underline">View all</button>} />
            </div>
            {mLoading ? <LoadingState message="Loading…" /> : <div className="p-2">{topByVolume.map((m, i) => <MarketMiniCard key={m.id} market={m} rank={i + 1} />)}</div>}
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Top Liquidity Markets" icon={<Droplets className="h-4 w-4" />}
                action={<button onClick={() => navigate('/polymarket/explorer')} className="text-[10px] text-accent-purple hover:underline">View all</button>} />
            </div>
            {mLoading ? <LoadingState message="Loading…" /> : <div className="p-2">{topByLiquidity.map((m, i) => <MarketMiniCard key={m.id} market={m} rank={i + 1} />)}</div>}
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Resolving Soon" icon={<Clock className="h-4 w-4" />}
                action={<button onClick={() => navigate('/polymarket/explorer')} className="text-[10px] text-accent-purple hover:underline">View all</button>} />
            </div>
            {mLoading ? <LoadingState message="Loading…" /> : topByUrgency.length > 0 ? (
              <div className="p-2">{topByUrgency.map((m, i) => <MarketMiniCard key={m.id} market={m} rank={i + 1} />)}</div>
            ) : (
              <div className="p-8 text-center"><p className="text-slate-600 text-xs">No markets with near-term resolution</p></div>
            )}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Open Paper Positions" icon={<Activity className="h-4 w-4" />}
                action={<button onClick={() => navigate('/polymarket/portfolio')} className="text-[10px] text-accent-purple hover:underline flex items-center gap-1">Portfolio <ChevronRight className="h-3 w-3" /></button>} />
            </div>
            <div className="p-4">
              {pLoading ? <LoadingState message="Loading positions…" /> : openPositions.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Activity className="h-6 w-6 text-slate-600" />
                  <p className="text-slate-500 text-sm">No open positions</p>
                  <button onClick={() => navigate('/polymarket/explorer')} className="text-xs text-accent-purple hover:underline">Browse markets →</button>
                </div>
              ) : (
                <div className="space-y-2">
                  {openPositions.slice(0, 5).map((p) => (
                    <PositionRow key={p.id} pos={p} onClose={(id) => closePositionMutation.mutate(id)} />
                  ))}
                  {openPositions.length > 5 && (
                    <button onClick={() => navigate('/polymarket/portfolio')} className="w-full text-xs text-slate-500 hover:text-white py-2 transition-colors">
                      +{openPositions.length - 5} more →
                    </button>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Alerts" icon={<Bell className="h-4 w-4" />}
                action={unreadCount > 0 && <span className="text-[10px] text-white bg-red-500 rounded-full px-2 py-0.5 font-bold">{unreadCount}</span>} />
            </div>
            <div className="p-4">
              {alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <Bell className="h-6 w-6 text-slate-600" />
                  <p className="text-slate-500 text-sm">No active alerts</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alerts.slice(0, 6).map((a) => (
                    <AlertItem key={a.id} alert={a} onRead={(id) => readAlertMutation.mutate(id)} />
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>

        {closedPositions.length > 0 && (
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-surface-border">
              <CardHeader title="Recently Closed Positions" icon={<CheckCircle2 className="h-4 w-4" />} />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="px-4 py-2 text-[10px] text-slate-500 uppercase font-mono text-left">Market</th>
                    <th className="px-3 py-2 text-[10px] text-slate-500 uppercase font-mono text-center">Side</th>
                    <th className="px-3 py-2 text-[10px] text-slate-500 uppercase font-mono text-right">P&L</th>
                    <th className="px-3 py-2 text-[10px] text-slate-500 uppercase font-mono text-right">Return %</th>
                    <th className="px-3 py-2 text-[10px] text-slate-500 uppercase font-mono text-right">Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {closedPositions.slice(0, 10).map((c) => (
                    <tr key={c.id} className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
                      <td className="px-4 py-2.5 max-w-xs"><p className="text-xs text-white line-clamp-1">{c.question}</p></td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', c.selectedSide === 'YES' ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>{c.selectedSide}</span>
                      </td>
                      <td className={cn('px-3 py-2.5 text-right text-xs font-mono font-bold', c.realizedPnl >= 0 ? 'text-accent-green' : 'text-red-400')}>
                        {c.realizedPnl >= 0 ? '+' : ''}${c.realizedPnl.toFixed(2)}
                      </td>
                      <td className={cn('px-3 py-2.5 text-right text-xs font-mono', c.pnlPercent >= 0 ? 'text-accent-green' : 'text-red-400')}>
                        {c.pnlPercent >= 0 ? '+' : ''}{c.pnlPercent.toFixed(1)}%
                      </td>
                      <td className="px-3 py-2.5 text-right text-[10px] text-slate-500">{relTime(c.closedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
