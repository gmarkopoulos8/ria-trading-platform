import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, TrendingUp, TrendingDown, ShieldAlert, AlertTriangle,
  Settings2, RefreshCw, CheckCircle2, XCircle, Minus, ChevronDown,
  ChevronUp, Clock, DollarSign, Lock, BarChart3, Zap, Power, PowerOff,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

interface UserState {
  marginSummary: { accountValue: string; totalNtlPos: string; totalRawUsd: string; totalMarginUsed: string };
  withdrawable: string;
  assetPositions: Array<{ position: Position; type: string }>;
}
interface Position {
  coin: string; szi: string; entryPx: string | null; positionValue: string;
  unrealizedPnl: string; returnOnEquity: string; liquidationPx: string | null;
  leverage: { type: string; value: number }; marginUsed: string;
}
interface OpenOrder {
  coin: string; side: string; limitPx: string; sz: string; oid: number; timestamp: number; orderType: string;
}
interface Market { idx: number; name: string; maxLeverage: number; mid: number | null }
interface StatusData {
  walletAddress: string | null; signerAddress: string | null;
  hasCredentials: boolean; hasSigningKey: boolean;
  dryRun: boolean; isMainnet: boolean; drawdownPct: number; maxDrawdownPct: number;
  killswitch: { active: boolean; reason: string | null; activatedAt: string | null; trigger: string; maxDrawdownPct: number; dryRun: boolean; monitorRunning: boolean };
  userState: UserState | null; openOrders: OpenOrder[];
}
interface OrderLog { id: string; asset: string; side: string; orderType: string; price: string | null; size: string; leverage: number; isDryRun: boolean; status: string; exchangeOid: string | null; errorMessage: string | null; submittedAt: string }

function fmt(n: number, dec = 2) { return isNaN(n) ? '—' : n.toFixed(dec); }
function fmtDollars(s: string | null | undefined) {
  const n = parseFloat(s ?? '0');
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '' : '-'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function relTime(s: string) {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function DrawdownBar({ pct, max }: { pct: number; max: number }) {
  const ratio = Math.min(1, pct / max);
  const color = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-orange-500' : ratio >= 0.5 ? 'bg-yellow-500' : 'bg-accent-green';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Drawdown</span>
        <span className={cn('font-mono font-bold', ratio >= 0.9 ? 'text-red-400' : 'text-white')}>{fmt(pct)}% / {max}%</span>
      </div>
      <div className="h-2 bg-surface-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

function PositionRow({ pos, onClose }: { pos: { position: Position; type: string }; onClose: (p: Position) => void }) {
  const p = pos.position;
  const size = parseFloat(p.szi);
  const isLong = size > 0;
  const pnl = parseFloat(p.unrealizedPnl ?? '0');
  const roe = parseFloat(p.returnOnEquity ?? '0') * 100;

  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded', isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <span className="font-bold text-white text-sm">{p.coin}</span>
          <span className="text-[10px] text-slate-500">{p.leverage.type} x{p.leverage.value}</span>
        </div>
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{Math.abs(size).toFixed(4)}</td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{p.entryPx ? `$${parseFloat(p.entryPx).toFixed(2)}` : '—'}</td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{fmtDollars(p.positionValue)}</td>
      <td className={cn('px-3 py-3 text-right text-xs font-mono font-bold', pnl >= 0 ? 'text-accent-green' : 'text-red-400')}>
        {pnl >= 0 ? '+' : ''}{fmtDollars(p.unrealizedPnl)} <span className="text-[10px] opacity-60">({roe >= 0 ? '+' : ''}{fmt(roe)}%)</span>
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono text-orange-400">{p.liquidationPx ? `$${parseFloat(p.liquidationPx).toFixed(2)}` : '—'}</td>
      <td className="px-3 py-3 text-center">
        <button onClick={() => onClose(p)} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors border border-surface-border hover:border-red-500/30 px-2 py-1 rounded">
          Close
        </button>
      </td>
    </tr>
  );
}

function OrderRow({ order, onCancel }: { order: OpenOrder; onCancel: (o: OpenOrder) => void }) {
  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-2.5 font-bold text-white text-xs">{order.coin}</td>
      <td className="px-3 py-2.5 text-center">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', order.side === 'B' ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
          {order.side === 'B' ? 'BUY' : 'SELL'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-right text-xs font-mono text-white">${parseFloat(order.limitPx).toFixed(2)}</td>
      <td className="px-3 py-2.5 text-right text-xs font-mono text-white">{parseFloat(order.sz).toFixed(4)}</td>
      <td className="px-3 py-2.5 text-right text-xs text-slate-500">{new Date(order.timestamp).toLocaleTimeString()}</td>
      <td className="px-3 py-2.5 text-center">
        <button onClick={() => onCancel(order)} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">Cancel</button>
      </td>
    </tr>
  );
}

function PlaceOrderPanel({ markets, onSuccess }: { markets: Market[]; onSuccess: () => void }) {
  const [asset, setAsset] = useState('BTC');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [type, setType] = useState<'market' | 'limit'>('market');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [leverage, setLeverage] = useState('3');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const mutation = useMutation({
    mutationFn: (body: object) => api.hyperliquid.placeOrder(body),
    onSuccess: (data: any) => {
      const isDry = data?.data?.isDryRun;
      toast.success(isDry ? '[DRY-RUN] Order simulated' : 'Order submitted successfully');
      setSize(''); setPrice('');
      onSuccess();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Order failed'),
  });

  const handleSubmit = () => {
    if (!size || parseFloat(size) <= 0) { toast.error('Enter a valid size'); return; }
    mutation.mutate({
      asset: asset.toUpperCase(),
      isBuy: side === 'buy',
      price: type === 'limit' && price ? parseFloat(price) : null,
      size: parseFloat(size),
      orderType: type,
      leverage: parseInt(leverage) || 3,
      reduceOnly,
    });
  };

  const top10 = markets.slice(0, 20).filter((m) => m.mid != null);

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-surface-border">
        <button onClick={() => setExpanded((v) => !v)} className="w-full flex items-center justify-between">
          <CardHeader title="Place Order" icon={<Zap className="h-4 w-4" />} className="mb-0" />
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>
      </div>

      {expanded && (
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-1.5">Asset</p>
            <select value={asset} onChange={(e) => setAsset(e.target.value)}
              className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
              {top10.map((m) => (
                <option key={m.name} value={m.name}>{m.name} — ${m.mid?.toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['buy', 'sell'] as const).map((s) => (
              <button key={s} onClick={() => setSide(s)}
                className={cn('py-2.5 rounded-xl border text-sm font-bold transition-all',
                  side === s
                    ? s === 'buy' ? 'bg-accent-green/20 border-accent-green/50 text-accent-green' : 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                {s.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['market', 'limit'] as const).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={cn('py-1.5 rounded-lg border text-xs font-semibold transition-all',
                  type === t ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-500 mb-1">Size (contracts)</p>
              <input value={size} onChange={(e) => setSize(e.target.value)} type="number" step="0.001" placeholder="0.01"
                className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
            </div>
            {type === 'limit' && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Limit Price</p>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" placeholder="e.g. 95000"
                  className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
              </div>
            )}
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1">Leverage</p>
            <div className="flex gap-1">
              {[1, 2, 3, 5, 10, 20].map((lv) => (
                <button key={lv} onClick={() => setLeverage(lv.toString())}
                  className={cn('flex-1 py-1 rounded text-xs font-mono border transition-colors',
                    leverage === lv.toString() ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                  {lv}x
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input type="checkbox" checked={reduceOnly} onChange={(e) => setReduceOnly(e.target.checked)}
              className="w-3 h-3 rounded border-surface-border bg-surface-2" />
            Reduce Only
          </label>

          <button onClick={handleSubmit} disabled={mutation.isPending}
            className={cn('w-full py-2.5 rounded-xl text-sm font-bold transition-all',
              side === 'buy'
                ? 'bg-accent-green text-black hover:bg-accent-green/80'
                : 'bg-red-500 text-white hover:bg-red-500/80',
              mutation.isPending && 'opacity-50 cursor-not-allowed')}>
            {mutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
              : `${side === 'buy' ? 'Long' : 'Short'} ${asset}`}
          </button>
        </div>
      )}
    </Card>
  );
}

export default function HyperliquidDashboard() {
  const qc = useQueryClient();
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [killReason, setKillReason] = useState('');

  const { data: statusData, isLoading: sLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['hl-status'],
    queryFn: () => api.hyperliquid.status(),
    staleTime: 10_000,
    refetchInterval: 30_000,
  });

  const { data: marketsData } = useQuery({
    queryKey: ['hl-markets'],
    queryFn: () => api.hyperliquid.markets(),
    staleTime: 60_000,
  });

  const { data: historyData } = useQuery({
    queryKey: ['hl-order-history'],
    queryFn: () => api.hyperliquid.orderHistory(),
    staleTime: 30_000,
  });

  const killMutation = useMutation({
    mutationFn: (reason: string) => api.hyperliquid.killswitch(reason),
    onSuccess: () => { toast.warning('KILLSWITCH ACTIVATED'); setShowKillConfirm(false); qc.invalidateQueries({ queryKey: ['hl-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Killswitch failed'),
  });

  const resetKillMutation = useMutation({
    mutationFn: () => api.hyperliquid.resetKillswitch(),
    onSuccess: () => { toast.success('Killswitch deactivated'); qc.invalidateQueries({ queryKey: ['hl-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: ({ asset, oid }: { asset: string; oid: number }) => api.hyperliquid.cancelOrder(asset, oid),
    onSuccess: () => { toast.success('Order cancelled'); qc.invalidateQueries({ queryKey: ['hl-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Cancel failed'),
  });

  const closePositionMutation = useMutation({
    mutationFn: ({ asset, size, isBuy }: { asset: string; size: string; isBuy: boolean }) =>
      api.hyperliquid.closePosition(asset, size, isBuy),
    onSuccess: (data: any) => {
      const isDry = data?.data?.isDryRun;
      toast.success(isDry ? '[DRY-RUN] Close simulated' : 'Position close submitted');
      qc.invalidateQueries({ queryKey: ['hl-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Close failed'),
  });

  const status: StatusData | null = (statusData as any)?.data ?? null;
  const markets: Market[] = (marketsData as any)?.data?.markets ?? [];
  const orderHistory: OrderLog[] = (historyData as any)?.data?.history ?? [];

  const positions = status?.userState?.assetPositions?.filter((ap) => parseFloat(ap.position.szi) !== 0) ?? [];
  const openOrders = status?.openOrders ?? [];
  const accountValue = parseFloat(status?.userState?.marginSummary?.accountValue ?? '0');
  const totalPnl = positions.reduce((s, ap) => s + parseFloat(ap.position.unrealizedPnl ?? '0'), 0);
  const ksActive = status?.killswitch?.active ?? false;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
              <Activity className="h-4 w-4 text-accent-blue" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Hyperliquid</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">Perpetual DEX · live trading interface</p>
                {status?.dryRun && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">DRY-RUN</span>
                )}
                {status && !status.dryRun && (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">LIVE TRADING</span>
                )}
                {status?.isMainnet === false && (
                  <span className="text-[10px] text-accent-purple bg-accent-purple/10 border border-accent-purple/20 px-2 py-0.5 rounded">TESTNET</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => refetchStatus()} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
              <RefreshCw className="h-4 w-4" />
            </button>
            {ksActive ? (
              <button onClick={() => resetKillMutation.mutate()}
                className="flex items-center gap-2 px-4 py-2 bg-accent-green text-black text-xs font-black rounded-xl hover:bg-accent-green/80 transition-colors">
                <Power className="h-3.5 w-3.5" /> Resume Trading
              </button>
            ) : (
              <button onClick={() => setShowKillConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-black rounded-xl hover:bg-red-500/30 transition-colors">
                <PowerOff className="h-3.5 w-3.5" /> KILLSWITCH
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {ksActive && (
          <div className="mx-6 mt-4 p-4 bg-red-500/10 border border-red-500/40 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <PowerOff className="h-4 w-4 text-red-400" />
              <p className="text-sm font-black text-red-400">KILLSWITCH ACTIVE — ALL TRADING HALTED</p>
            </div>
            <p className="text-xs text-red-400/70">Reason: {status?.killswitch?.reason ?? 'Unknown'}</p>
            <p className="text-xs text-red-400/50 mt-0.5">Triggered: {status?.killswitch?.trigger?.toUpperCase()} · {status?.killswitch?.activatedAt ? new Date(status.killswitch.activatedAt).toLocaleString() : '—'}</p>
          </div>
        )}

        {!status?.hasCredentials && !sLoading && (
          <div className="mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-bold text-amber-400">Wallet not configured</p>
            </div>
            <p className="text-xs text-amber-400/70 mb-2">Set these Replit Secrets to enable full account features:</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {['HL_WALLET_ADDRESS', 'HL_PRIVATE_KEY', 'HL_AGENT_PRIVATE_KEY (optional)'].map((k) => (
                <code key={k} className="text-[10px] bg-surface-2 border border-surface-border px-2 py-1 rounded text-amber-300 font-mono">{k}</code>
              ))}
            </div>
            <p className="text-[10px] text-amber-400/50 mt-2">Set HL_DRY_RUN=false to enable live order execution. Default is dry-run (simulated).</p>
          </div>
        )}

        <div className="p-6 space-y-6">
          {sLoading ? (
            <LoadingState message="Connecting to Hyperliquid…" />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Account Value" value={fmtDollars(status?.userState?.marginSummary?.accountValue)} color="blue" icon={<DollarSign className="h-4 w-4" />} />
                <StatCard label="Unrealized P&L" value={`${totalPnl >= 0 ? '+' : ''}${fmtDollars(totalPnl.toString())}`} color={totalPnl >= 0 ? 'green' : 'red'} icon={<BarChart3 className="h-4 w-4" />} />
                <StatCard label="Open Positions" value={positions.length} color="purple" icon={<Activity className="h-4 w-4" />} />
                <StatCard label="Open Orders" value={openOrders.length} color="amber" icon={<Clock className="h-4 w-4" />} />
              </div>

              {status?.userState && (
                <DrawdownBar pct={status.drawdownPct ?? 0} max={status.maxDrawdownPct} />
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Open Positions" icon={<TrendingUp className="h-4 w-4" />}
                        subtitle={`${positions.length} active · margin used: ${fmtDollars(status?.userState?.marginSummary?.totalMarginUsed)}`} />
                    </div>
                    {positions.length === 0 ? (
                      <div className="flex items-center justify-center py-12 text-slate-600 text-sm gap-2">
                        <Minus className="h-4 w-4" /> No open positions
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-surface-border">
                              {['Position', 'Size', 'Entry', 'Value', 'P&L (ROE)', 'Liq. Px', ''].map((h) => (
                                <th key={h} className={cn('px-3 py-2 text-[10px] text-slate-500 uppercase font-mono', h === 'Position' ? 'text-left px-4' : 'text-right', h === '' && 'text-center')}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map((ap, i) => (
                              <PositionRow key={i} pos={ap} onClose={(p) => {
                                const size = parseFloat(p.szi);
                                closePositionMutation.mutate({ asset: p.coin, size: Math.abs(size).toString(), isBuy: size < 0 });
                              }} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Open Orders" icon={<Clock className="h-4 w-4" />} />
                    </div>
                    {openOrders.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-slate-600 text-sm gap-2">
                        <Minus className="h-4 w-4" /> No open orders
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-surface-border">
                              {['Asset', 'Side', 'Price', 'Size', 'Time', ''].map((h) => (
                                <th key={h} className={cn('px-3 py-2 text-[10px] text-slate-500 uppercase font-mono', h === 'Asset' ? 'text-left px-4' : 'text-right', h === '' && 'text-center')}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {openOrders.map((o, i) => (
                              <OrderRow key={i} order={o} onCancel={(ord) => cancelOrderMutation.mutate({ asset: ord.coin, oid: ord.oid })} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Order Log" icon={<CheckCircle2 className="h-4 w-4" />} subtitle="All submitted orders — this session" />
                    </div>
                    <div className="overflow-x-auto">
                      {orderHistory.length === 0 ? (
                        <div className="py-8 text-center text-slate-600 text-sm">No orders placed yet</div>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-surface-border">
                              {['Time', 'Asset', 'Side', 'Type', 'Price', 'Size', 'Lvg', 'Status'].map((h) => (
                                <th key={h} className="px-3 py-2 text-[10px] text-slate-500 uppercase font-mono text-left">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {orderHistory.map((o) => {
                              const statusColor = o.status === 'submitted' ? 'text-accent-green' : o.status === 'dry_run' ? 'text-amber-400' : o.status === 'failed' ? 'text-red-400' : 'text-slate-400';
                              return (
                                <tr key={o.id} className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
                                  <td className="px-3 py-2 text-slate-500">{relTime(o.submittedAt)}</td>
                                  <td className="px-3 py-2 font-bold text-white">{o.asset}</td>
                                  <td className="px-3 py-2">
                                    <span className={cn('font-bold text-[10px]', o.side === 'long' ? 'text-accent-green' : 'text-red-400')}>{o.side.toUpperCase()}</span>
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">{o.orderType}</td>
                                  <td className="px-3 py-2 font-mono text-white">{o.price ? `$${parseFloat(o.price).toFixed(2)}` : '—'}</td>
                                  <td className="px-3 py-2 font-mono text-white">{o.size}</td>
                                  <td className="px-3 py-2 text-slate-400">{o.leverage}x</td>
                                  <td className={cn('px-3 py-2 font-semibold text-[10px]', statusColor)}>
                                    {o.status.toUpperCase()}
                                    {o.isDryRun && <span className="text-amber-400/60 ml-1">(DRY)</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </Card>
                </div>

                <div className="space-y-4">
                  <PlaceOrderPanel markets={markets} onSuccess={() => { qc.invalidateQueries({ queryKey: ['hl-status'] }); qc.invalidateQueries({ queryKey: ['hl-order-history'] }); }} />

                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="System Status" icon={<Settings2 className="h-4 w-4" />} />
                    </div>
                    <div className="p-4 space-y-2.5 text-xs">
                      {[
                        { label: 'Mode', value: status?.dryRun ? 'DRY-RUN (simulated)' : 'LIVE TRADING', color: status?.dryRun ? 'text-amber-400' : 'text-red-400' },
                        { label: 'Network', value: status?.isMainnet === false ? 'Testnet' : 'Mainnet', color: status?.isMainnet ? 'text-accent-green' : 'text-accent-purple' },
                        { label: 'Wallet', value: status?.walletAddress ? `${status.walletAddress.slice(0, 10)}…` : 'Not set', color: status?.hasCredentials ? 'text-white' : 'text-slate-500' },
                        { label: 'Signer', value: status?.hasSigningKey ? `${status.signerAddress?.slice(0, 10)}…` : 'Not set', color: status?.hasSigningKey ? 'text-white' : 'text-slate-500' },
                        { label: 'Killswitch', value: ksActive ? 'ACTIVE' : 'Armed', color: ksActive ? 'text-red-400' : 'text-accent-green' },
                        { label: 'Max Drawdown', value: `${status?.maxDrawdownPct ?? 5}%`, color: 'text-white' },
                        { label: 'Current Drawdown', value: `${fmt(status?.drawdownPct ?? 0)}%`, color: (status?.drawdownPct ?? 0) > 3 ? 'text-orange-400' : 'text-accent-green' },
                        { label: 'Risk Monitor', value: status?.killswitch?.monitorRunning ? 'Running' : 'Stopped', color: status?.killswitch?.monitorRunning ? 'text-accent-green' : 'text-slate-500' },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="flex justify-between">
                          <span className="text-slate-500">{label}</span>
                          <span className={cn('font-mono font-semibold', color)}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Live Prices" icon={<BarChart3 className="h-4 w-4" />} subtitle="Top markets · Hyperliquid perps" />
                    </div>
                    <div className="p-2">
                      {markets.slice(0, 15).map((m) => (
                        <div key={m.name} className="flex items-center justify-between px-2 py-1.5 hover:bg-surface-2 rounded-lg transition-colors">
                          <span className="text-xs font-bold text-white">{m.name}</span>
                          <div className="text-right">
                            <span className="text-xs font-mono text-slate-300">{m.mid != null ? `$${m.mid.toFixed(m.mid > 100 ? 2 : 4)}` : '—'}</span>
                            <span className="text-[10px] text-slate-600 ml-2">x{m.maxLeverage}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showKillConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-card w-full max-w-md rounded-2xl p-6 border border-red-500/40 bg-red-500/5">
            <div className="flex items-center gap-3 mb-4">
              <PowerOff className="h-6 w-6 text-red-400" />
              <h3 className="text-lg font-black text-red-400">Activate Killswitch?</h3>
            </div>
            <p className="text-sm text-slate-300 mb-4">This will immediately cancel all open orders and close all open positions at market price. This action cannot be undone automatically.</p>
            <div className="mb-4">
              <p className="text-xs text-slate-500 mb-1.5">Reason (optional)</p>
              <input value={killReason} onChange={(e) => setKillReason(e.target.value)} placeholder="Emergency stop, manual override…"
                className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none placeholder-slate-600" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowKillConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 text-sm hover:text-white transition-colors">Cancel</button>
              <button onClick={() => killMutation.mutate(killReason || 'Manual API trigger')} disabled={killMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-black hover:bg-red-600 transition-colors disabled:opacity-50">
                {killMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : '⚡ EXECUTE KILLSWITCH'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
