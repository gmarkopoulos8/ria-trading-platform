import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, DollarSign, Lock,
  BarChart3, Power, PowerOff, ChevronDown, ChevronUp, Minus,
  ShieldAlert, Zap, Activity,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

// ─── Types ────────────────────────────────────────────────────────

interface Balances {
  equity: number;
  liquidationValue: number;
  buyingPower: number;
  cashBalance: number;
  availableFunds: number;
  maintenanceRequirement: number;
}

interface Position {
  longQuantity: number;
  shortQuantity: number;
  averagePrice: number;
  currentDayProfitLoss: number;
  currentDayProfitLossPercentage: number;
  marketValue: number;
  instrument: { symbol: string; assetType: string; description?: string };
}

interface Order {
  orderId: number;
  orderType: string;
  status: string;
  duration: string;
  quantity: number;
  filledQuantity: number;
  price?: number;
  stopPrice?: number;
  enteredTime: string;
  orderLegCollection: Array<{ instruction: string; quantity: number; instrument: { symbol: string } }>;
}

interface StatusData {
  hasCredentials: boolean;
  hasAccountNumber: boolean;
  dryRun: boolean;
  accountNumber: string | null;
  killswitch: { active: boolean; reason: string | null; activatedAt: string | null; trigger: string; monitorRunning: boolean; schedulerRunning: boolean };
  tokenInfo: { hasToken: boolean; expiresIn?: number; scope?: string };
  drawdownPct: number;
  maxDrawdownPct: number;
  unrealizedPnl: number;
  balances: Balances | null;
  positionCount: number;
  openOrderCount: number;
}

interface OrderLog {
  id: string; symbol: string; instruction: string; orderType: string;
  price: string | null; stopPrice: string | null; quantity: string;
  duration: string; isDryRun: boolean; status: string;
  exchangeOid: string | null; errorMessage: string | null; submittedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────

function fmtUsd(n: number | null | undefined, def = '—') {
  if (n == null || isNaN(n)) return def;
  return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function relTime(s: string) {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

function statusColor(s: string) {
  if (['FILLED', 'REPLACED'].includes(s)) return 'text-accent-green';
  if (['CANCELED', 'REJECTED', 'EXPIRED'].includes(s)) return 'text-red-400';
  if (['WORKING', 'PENDING_ACTIVATION', 'QUEUED'].includes(s)) return 'text-amber-400';
  return 'text-slate-400';
}

// ─── Drawdown bar ─────────────────────────────────────────────────

function DrawdownBar({ pct, max }: { pct: number; max: number }) {
  const ratio = Math.min(1, pct / max);
  const color = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-orange-500' : ratio >= 0.5 ? 'bg-yellow-500' : 'bg-accent-green';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-500">Account Drawdown</span>
        <span className={cn('font-mono font-bold', ratio >= 0.9 ? 'text-red-400' : 'text-white')}>
          {pct.toFixed(2)}% / {max}%
        </span>
      </div>
      <div className="h-2 bg-surface-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

// ─── Position row ─────────────────────────────────────────────────

function PositionRow({ pos, onClose }: { pos: Position; onClose: (p: Position) => void }) {
  const qty      = pos.longQuantity > 0 ? pos.longQuantity : pos.shortQuantity;
  const isLong   = pos.longQuantity > 0;
  const pnlColor = pos.currentDayProfitLoss >= 0 ? 'text-accent-green' : 'text-red-400';

  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded', isLong ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
            {isLong ? 'LONG' : 'SHORT'}
          </span>
          <span className="font-bold text-white text-sm">{pos.instrument.symbol}</span>
          <span className="text-[10px] text-slate-500">{pos.instrument.assetType}</span>
        </div>
        {pos.instrument.description && (
          <p className="text-[10px] text-slate-600 mt-0.5 truncate max-w-[160px]">{pos.instrument.description}</p>
        )}
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{qty}</td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{fmtUsd(pos.averagePrice)}</td>
      <td className="px-3 py-3 text-right text-xs font-mono text-white">{fmtUsd(pos.marketValue)}</td>
      <td className={cn('px-3 py-3 text-right text-xs font-mono font-bold', pnlColor)}>
        {pos.currentDayProfitLoss >= 0 ? '+' : ''}{fmtUsd(pos.currentDayProfitLoss)}
        <span className="text-[10px] opacity-60 ml-1">({pos.currentDayProfitLossPercentage?.toFixed(2) ?? '—'}%)</span>
      </td>
      <td className="px-3 py-3 text-center">
        <button onClick={() => onClose(pos)} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors border border-surface-border hover:border-red-500/30 px-2 py-1 rounded">
          Close
        </button>
      </td>
    </tr>
  );
}

// ─── Order row ────────────────────────────────────────────────────

function OrderRow({ order, onCancel }: { order: Order; onCancel: (o: Order) => void }) {
  const leg = order.orderLegCollection[0];
  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-2.5 font-bold text-white text-xs">{leg?.instrument?.symbol ?? '—'}</td>
      <td className="px-3 py-2.5 text-center">
        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
          leg?.instruction?.startsWith('BUY') ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
          {leg?.instruction ?? '—'}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center text-[10px] text-slate-400 font-mono">{order.orderType}</td>
      <td className="px-3 py-2.5 text-right text-xs font-mono text-white">{order.price ? fmtUsd(order.price) : '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs font-mono text-white">{leg?.quantity ?? order.quantity}</td>
      <td className={cn('px-3 py-2.5 text-right text-xs font-mono', statusColor(order.status))}>{order.status}</td>
      <td className="px-3 py-2.5 text-right text-xs text-slate-500">{new Date(order.enteredTime).toLocaleTimeString()}</td>
      <td className="px-3 py-2.5 text-center">
        {order.status === 'WORKING' && (
          <button onClick={() => onCancel(order)} className="text-[10px] text-slate-500 hover:text-red-400 transition-colors">Cancel</button>
        )}
      </td>
    </tr>
  );
}

// ─── Place Order Panel ────────────────────────────────────────────

const ORDER_TYPES  = ['MARKET', 'LIMIT', 'STOP', 'STOP_LIMIT', 'BRACKET'] as const;
const ASSET_TYPES  = ['EQUITY', 'OPTION', 'FUTURE'] as const;
const DURATIONS    = ['DAY', 'GOOD_TILL_CANCEL', 'FILL_OR_KILL', 'IMMEDIATE_OR_CANCEL'] as const;

function PlaceOrderPanel({ onSuccess }: { onSuccess: () => void }) {
  const [expanded, setExpanded]         = useState(true);
  const [symbol, setSymbol]             = useState('');
  const [instruction, setInstruction]   = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType]       = useState<typeof ORDER_TYPES[number]>('MARKET');
  const [quantity, setQuantity]         = useState('');
  const [price, setPrice]               = useState('');
  const [stopPrice, setStopPrice]       = useState('');
  const [takeProfitPct, setTpPct]       = useState('5');
  const [stopLossPct, setSlPct]         = useState('3');
  const [duration, setDuration]         = useState<typeof DURATIONS[number]>('DAY');
  const [assetType, setAssetType]       = useState<typeof ASSET_TYPES[number]>('EQUITY');

  const needsPrice    = ['LIMIT', 'STOP_LIMIT', 'BRACKET'].includes(orderType);
  const needsStop     = ['STOP', 'STOP_LIMIT'].includes(orderType);
  const isBracket     = orderType === 'BRACKET';

  const mutation = useMutation({
    mutationFn: (body: object) => api.tos.placeOrder(body),
    onSuccess: (data: any) => {
      toast.success(data?.data?.isDryRun ? '[DRY-RUN] Order simulated' : 'Order submitted!');
      setSymbol(''); setQuantity(''); setPrice(''); setStopPrice('');
      onSuccess();
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Order failed'),
  });

  const handleSubmit = () => {
    if (!symbol.trim()) { toast.error('Enter a symbol'); return; }
    if (!quantity || parseFloat(quantity) <= 0) { toast.error('Enter a valid quantity'); return; }
    mutation.mutate({
      symbol: symbol.trim().toUpperCase(),
      instruction,
      quantity: parseFloat(quantity),
      orderType,
      price:         (needsPrice && price) ? parseFloat(price) : undefined,
      stopPrice:     (needsStop && stopPrice) ? parseFloat(stopPrice) : undefined,
      takeProfitPct: isBracket ? parseFloat(takeProfitPct) : undefined,
      stopLossPct:   isBracket ? parseFloat(stopLossPct)   : undefined,
      duration,
      assetType,
    });
  };

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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-500 mb-1">Symbol</p>
              <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL"
                className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600 uppercase" />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Asset Type</p>
              <select value={assetType} onChange={(e) => setAssetType(e.target.value as any)}
                className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
                {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(['BUY', 'SELL'] as const).map((s) => (
              <button key={s} onClick={() => setInstruction(s)}
                className={cn('py-2.5 rounded-xl border text-sm font-bold transition-all',
                  instruction === s
                    ? s === 'BUY' ? 'bg-accent-green/20 border-accent-green/50 text-accent-green' : 'bg-red-500/20 border-red-500/50 text-red-400'
                    : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                {s}
              </button>
            ))}
          </div>

          <div>
            <p className="text-xs text-slate-500 mb-1.5">Order Type</p>
            <div className="grid grid-cols-5 gap-1">
              {ORDER_TYPES.map((t) => (
                <button key={t} onClick={() => setOrderType(t)}
                  className={cn('py-1 rounded text-[9px] font-semibold border transition-colors text-center leading-tight px-0.5',
                    orderType === t ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
                  {t === 'STOP_LIMIT' ? 'STP-LMT' : t === 'GOOD_TILL_CANCEL' ? 'GTC' : t}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-slate-500 mb-1">Quantity</p>
              <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="1" step="1" placeholder="1"
                className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
            </div>
            {needsPrice && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Limit Price</p>
                <input value={price} onChange={(e) => setPrice(e.target.value)} type="number" step="0.01" placeholder="e.g. 185.00"
                  className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
              </div>
            )}
            {needsStop && (
              <div>
                <p className="text-xs text-slate-500 mb-1">Stop Price</p>
                <input value={stopPrice} onChange={(e) => setStopPrice(e.target.value)} type="number" step="0.01" placeholder="e.g. 180.00"
                  className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
              </div>
            )}
          </div>

          {isBracket && (
            <div className="grid grid-cols-2 gap-2 p-3 bg-surface-2 rounded-lg border border-surface-border">
              <div>
                <p className="text-xs text-slate-500 mb-1">Take Profit %</p>
                <input value={takeProfitPct} onChange={(e) => setTpPct(e.target.value)} type="number" step="0.5" placeholder="5"
                  className="w-full bg-surface-1 border border-surface-border text-accent-green text-sm rounded px-2 py-1.5 focus:outline-none" />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Stop Loss %</p>
                <input value={stopLossPct} onChange={(e) => setSlPct(e.target.value)} type="number" step="0.5" placeholder="3"
                  className="w-full bg-surface-1 border border-surface-border text-red-400 text-sm rounded px-2 py-1.5 focus:outline-none" />
              </div>
            </div>
          )}

          <div>
            <p className="text-xs text-slate-500 mb-1">Duration</p>
            <select value={duration} onChange={(e) => setDuration(e.target.value as any)}
              className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 focus:outline-none">
              {DURATIONS.map((d) => <option key={d} value={d}>{d.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <button onClick={handleSubmit} disabled={mutation.isPending}
            className={cn('w-full py-2.5 rounded-xl text-sm font-bold transition-all',
              instruction === 'BUY' ? 'bg-accent-green text-black hover:bg-accent-green/80' : 'bg-red-500 text-white hover:bg-red-500/80',
              mutation.isPending && 'opacity-50 cursor-not-allowed')}>
            {mutation.isPending
              ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
              : `${instruction} ${symbol || 'Order'}`}
          </button>
        </div>
      )}
    </Card>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────

export default function TosDashboard() {
  const qc = useQueryClient();
  const [showKillConfirm, setShowKillConfirm] = useState(false);
  const [killReason, setKillReason]           = useState('');

  const { data: statusData, isLoading: sLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['tos-status'],
    queryFn:  () => api.tos.status(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: accountData } = useQuery({
    queryKey: ['tos-account'],
    queryFn:  () => api.tos.account(),
    staleTime: 20_000,
    refetchInterval: 60_000,
    enabled: !!(statusData as any)?.data?.hasCredentials,
  });

  const { data: historyData } = useQuery({
    queryKey: ['tos-order-history'],
    queryFn:  () => api.tos.orderHistory(),
    staleTime: 30_000,
  });

  const killMutation = useMutation({
    mutationFn: (reason: string) => api.tos.killswitch(reason),
    onSuccess: () => { toast.warning('KILLSWITCH ACTIVATED'); setShowKillConfirm(false); qc.invalidateQueries({ queryKey: ['tos-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Killswitch failed'),
  });

  const resetKillMutation = useMutation({
    mutationFn: () => api.tos.resetKillswitch(),
    onSuccess: () => { toast.success('Killswitch deactivated'); qc.invalidateQueries({ queryKey: ['tos-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string | number) => api.tos.cancelOrder(orderId),
    onSuccess: () => { toast.success('Order cancelled'); qc.invalidateQueries({ queryKey: ['tos-account', 'tos-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Cancel failed'),
  });

  const closePosMutation = useMutation({
    mutationFn: ({ symbol, pos }: { symbol: string; pos: Position }) =>
      api.tos.closePosition(symbol, pos.longQuantity, pos.shortQuantity, pos.instrument.assetType),
    onSuccess: (data: any) => {
      toast.success(data?.data?.isDryRun ? '[DRY-RUN] Close simulated' : 'Close order submitted');
      qc.invalidateQueries({ queryKey: ['tos-account', 'tos-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Close failed'),
  });

  const status: StatusData | null = (statusData as any)?.data ?? null;
  const account = (accountData as any)?.data?.account ?? null;
  const openOrders: Order[]   = (accountData as any)?.data?.openOrders ?? [];
  const positions: Position[] = account?.securitiesAccount?.positions?.filter(
    (p: Position) => p.longQuantity > 0 || p.shortQuantity > 0,
  ) ?? [];
  const orderHistory: OrderLog[] = (historyData as any)?.data?.history ?? [];
  const ksActive = status?.killswitch?.active ?? false;
  const totalPnl = positions.reduce((s, p) => s + (p.currentDayProfitLoss ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-green/10 border border-accent-green/20 flex items-center justify-center">
              <Activity className="h-4 w-4 text-accent-green" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Thinkorswim</h1>
              <div className="flex items-center gap-2">
                <p className="text-xs text-slate-500">Schwab API · equities · options · futures</p>
                {status?.dryRun && (
                  <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded">DRY-RUN</span>
                )}
                {status && !status.dryRun && (
                  <span className="text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded">LIVE TRADING</span>
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
            <p className="text-xs text-red-400/50 mt-0.5">Trigger: {status?.killswitch?.trigger?.toUpperCase()} · {status?.killswitch?.activatedAt ? new Date(status.killswitch.activatedAt).toLocaleString() : '—'}</p>
          </div>
        )}

        {!status?.hasCredentials && !sLoading && (
          <div className="mx-6 mt-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-bold text-amber-400">Schwab API not configured</p>
            </div>
            <p className="text-xs text-amber-400/70 mb-3">Set these Replit Secrets, then complete the one-time OAuth flow:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mb-3">
              {['SCHWAB_CLIENT_ID', 'SCHWAB_CLIENT_SECRET', 'SCHWAB_REDIRECT_URI', 'SCHWAB_REFRESH_TOKEN', 'SCHWAB_ACCOUNT_NUMBER'].map((k) => (
                <code key={k} className="text-[10px] bg-surface-2 border border-surface-border px-2 py-1 rounded text-amber-300 font-mono">{k}</code>
              ))}
            </div>
            <p className="text-[10px] text-amber-400/50">Visit GET /api/tos/auth/url to start the OAuth flow. Set SCHWAB_DRY_RUN=false for live orders. SCHWAB_MAX_DRAWDOWN_PCT default is 5.</p>
          </div>
        )}

        <div className="p-6 space-y-6">
          {sLoading ? (
            <LoadingState message="Connecting to Schwab API…" />
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Account Equity" value={fmtUsd(status?.balances?.equity)} color="blue" icon={<DollarSign className="h-4 w-4" />} />
                <StatCard label="Day P&L" value={`${totalPnl >= 0 ? '+' : ''}${fmtUsd(totalPnl)}`} color={totalPnl >= 0 ? 'green' : 'red'} icon={<BarChart3 className="h-4 w-4" />} />
                <StatCard label="Buying Power" value={fmtUsd(status?.balances?.buyingPower)} color="purple" icon={<TrendingUp className="h-4 w-4" />} />
                <StatCard label="Open Orders" value={status?.openOrderCount ?? 0} color="amber" icon={<Clock className="h-4 w-4" />} />
              </div>

              {status && (
                <DrawdownBar pct={status.drawdownPct ?? 0} max={status.maxDrawdownPct} />
              )}

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-2 space-y-6">
                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Open Positions" icon={<TrendingUp className="h-4 w-4" />}
                        subtitle={`${positions.length} active position${positions.length !== 1 ? 's' : ''}`} />
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
                              {['Position', 'Qty', 'Avg Price', 'Mkt Value', 'Day P&L', ''].map((h) => (
                                <th key={h} className={cn('px-3 py-2 text-[10px] text-slate-500 uppercase font-mono', h === 'Position' ? 'text-left px-4' : 'text-right', h === '' && 'text-center')}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map((pos, i) => (
                              <PositionRow key={i} pos={pos} onClose={(p) => closePosMutation.mutate({ symbol: p.instrument.symbol, pos: p })} />
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
                              {['Symbol', 'Side', 'Type', 'Price', 'Qty', 'Status', 'Time', ''].map((h) => (
                                <th key={h} className={cn('px-3 py-2 text-[10px] text-slate-500 uppercase font-mono', h === 'Symbol' ? 'text-left px-4' : 'text-right', h === '' && 'text-center')}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {openOrders.map((o, i) => (
                              <OrderRow key={i} order={o} onCancel={(ord) => cancelOrderMutation.mutate(ord.orderId)} />
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Card>

                  <Card className="p-0 overflow-hidden">
                    <div className="p-4 border-b border-surface-border">
                      <CardHeader title="Order Log" icon={<BarChart3 className="h-4 w-4" />} subtitle="Last 50 submitted orders" />
                    </div>
                    {orderHistory.length === 0 ? (
                      <div className="flex items-center justify-center py-8 text-slate-600 text-sm gap-2">
                        <Minus className="h-4 w-4" /> No orders submitted yet
                      </div>
                    ) : (
                      <div className="divide-y divide-surface-border">
                        {orderHistory.slice(0, 20).map((log) => (
                          <div key={log.id} className="px-4 py-3 flex items-center justify-between hover:bg-surface-2 transition-colors">
                            <div className="flex items-center gap-3">
                              <span className={cn('text-[10px] font-black px-1.5 py-0.5 rounded',
                                log.instruction.startsWith('BUY') ? 'bg-accent-green/15 text-accent-green' : 'bg-red-500/15 text-red-400')}>
                                {log.instruction}
                              </span>
                              <div>
                                <p className="text-sm font-bold text-white">{log.symbol}</p>
                                <p className="text-[10px] text-slate-500">{log.orderType} · {log.quantity} units · {log.duration}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="flex items-center gap-2">
                                {log.isDryRun && <span className="text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">DRY</span>}
                                <span className={cn('text-[10px] font-bold', {
                                  'text-accent-green': log.status === 'submitted',
                                  'text-amber-400':    log.status === 'dry_run',
                                  'text-red-400':      log.status === 'failed',
                                  'text-slate-400':    log.status === 'pending',
                                })}>{log.status.toUpperCase()}</span>
                              </div>
                              <p className="text-[10px] text-slate-500 mt-0.5">{relTime(log.submittedAt)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                </div>

                <div className="space-y-4">
                  <PlaceOrderPanel onSuccess={() => { qc.invalidateQueries({ queryKey: ['tos-account', 'tos-status', 'tos-order-history'] }); }} />

                  <Card className="p-4 space-y-3">
                    <CardHeader title="System Status" icon={<ShieldAlert className="h-4 w-4" />} />
                    <div className="space-y-2 text-xs">
                      {[
                        ['Credentials',   status?.hasCredentials ? '✓ Set' : '✗ Missing',         status?.hasCredentials ? 'text-accent-green' : 'text-red-400'],
                        ['Account #',     status?.hasAccountNumber ? '✓ Set' : '✗ Missing',        status?.hasAccountNumber ? 'text-accent-green' : 'text-red-400'],
                        ['Token',         status?.tokenInfo?.hasToken ? `✓ ~${status.tokenInfo.expiresIn}s left` : '✗ No token', status?.tokenInfo?.hasToken ? 'text-accent-green' : 'text-red-400'],
                        ['Mode',          status?.dryRun ? 'DRY-RUN (safe)' : 'LIVE TRADING',     status?.dryRun ? 'text-amber-400' : 'text-red-400'],
                        ['Drawdown Mon.', status?.killswitch?.monitorRunning ? '✓ Running' : '— Idle', status?.killswitch?.monitorRunning ? 'text-accent-green' : 'text-slate-500'],
                        ['Scheduler',     status?.killswitch?.schedulerRunning ? '✓ Running' : '— Idle', status?.killswitch?.schedulerRunning ? 'text-accent-green' : 'text-slate-500'],
                        ['Max Drawdown',  `${status?.maxDrawdownPct ?? 5}%`, 'text-white'],
                      ].map(([label, value, cls]) => (
                        <div key={label} className="flex justify-between items-center">
                          <span className="text-slate-500">{label}</span>
                          <span className={cn('font-mono font-semibold', cls)}>{value}</span>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-1 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <PowerOff className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-red-400">Activate Killswitch?</h3>
                <p className="text-xs text-slate-500">Cancels all orders · closes all positions</p>
              </div>
            </div>
            <textarea value={killReason} onChange={(e) => setKillReason(e.target.value)} placeholder="Optional reason…"
              className="w-full bg-surface-2 border border-surface-border text-white text-sm rounded-lg px-3 py-2 resize-none h-16 focus:outline-none placeholder-slate-600" />
            <div className="flex gap-2">
              <button onClick={() => setShowKillConfirm(false)} className="flex-1 py-2 border border-surface-border text-slate-400 text-sm rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => killMutation.mutate(killReason || 'Manual killswitch')} disabled={killMutation.isPending}
                className="flex-1 py-2 bg-red-500 text-white text-sm font-black rounded-xl hover:bg-red-500/80 transition-colors disabled:opacity-50">
                {killMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'KILL'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
