import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  TrendingUp, TrendingDown, RefreshCw, Clock, DollarSign, Lock,
  BarChart3, Power, PowerOff, ChevronDown, ChevronUp, Minus,
  ShieldAlert, Zap, Activity, X, Settings2, Eye, EyeOff, ExternalLink,
  CheckCircle2, AlertTriangle, FlaskConical,
  PauseCircle, StopCircle, AlertOctagon, ChevronRight,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

// ─── Types ────────────────────────────────────────────────────────

interface SchwabAccountSummary {
  accountNumber: string;
  accountNumberMasked: string;
  type: string;
  isPaper: boolean;
  label: string;
  equity: number;
  buyingPower: number;
  dayTradingBuyingPower: number;
  positionCount: number;
}

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

// ─── TOS Autonomous Config Panel ─────────────────────────────────

const SECTORS = ['Technology','Healthcare','Financials','Energy','Consumer Discretionary','Consumer Staples','Industrials','Materials','Real Estate','Utilities','Communication Services'];

function SectorTagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  const suggestions = SECTORS.filter((s) => s.toLowerCase().includes(input.toLowerCase()) && !tags.includes(s));
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">Blocked Sectors</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 bg-surface-3 border border-surface-border text-xs rounded px-2 py-0.5 text-slate-300">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-400 transition-colors"><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type to search sectors…"
          className="w-full bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent-green/60 placeholder-slate-600" />
        {input && suggestions.length > 0 && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-surface-2 border border-surface-border rounded-lg overflow-hidden shadow-lg">
            {suggestions.slice(0, 5).map((s) => (
              <button key={s} onClick={() => { onChange([...tags, s]); setInput(''); }}
                className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-surface-3 transition-colors">{s}</button>
            ))}
          </div>
        )}
      </div>
      <p className="text-[10px] text-slate-600 mt-1">Blocked sectors apply regardless of conviction score.</p>
    </div>
  );
}

function TOSTagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => { const v = input.trim().toUpperCase(); if (v && !tags.includes(v)) onChange([...tags, v]); setInput(''); };
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 bg-surface-3 border border-surface-border text-xs rounded px-2 py-0.5 text-slate-300">
            {t}<button onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-400 transition-colors"><X className="h-2.5 w-2.5" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Type and press Enter…"
          className="flex-1 bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none placeholder-slate-600" />
        <button onClick={add} className="px-3 py-1.5 bg-surface-2 border border-surface-border text-xs text-slate-400 hover:text-white rounded-lg transition-colors">Add</button>
      </div>
    </div>
  );
}

function TOSAutoConfigPanel() {
  const qc = useQueryClient();
  const [showParams, setShowParams] = useState(false);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [valErrors, setValErrors] = useState<string[]>([]);
  const [valWarnings, setValWarnings] = useState<string[]>([]);

  const { data: configData } = useQuery({ queryKey: ['tos-auto-config'], queryFn: () => api.autotrader.exchangeConfig.get('tos') });
  const { data: sessionData, refetch: refetchSession } = useQuery({ queryKey: ['tos-session-status'], queryFn: () => api.autotrader.exchangeConfig.sessionStatus('tos'), refetchInterval: 30_000 });

  const config: any = (configData as any)?.data ?? null;
  const sessionStatus: any = (sessionData as any)?.data ?? null;

  useEffect(() => { if (config && !form) setForm({ ...config }); }, [config]);

  const upd = (k: string, v: unknown) => { setForm((f) => f ? { ...f, [k]: v } : { [k]: v }); setUnsaved(true); };

  const toggleSession = useMutation({
    mutationFn: (enable: boolean) => enable ? api.autotrader.exchangeConfig.startSession('tos') : api.autotrader.exchangeConfig.pauseSession('tos', 'Manually disabled'),
    onSuccess: () => { refetchSession(); qc.invalidateQueries({ queryKey: ['tos-auto-config'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const vRes: any = await api.autotrader.exchangeConfig.validate('tos', data);
      const v = vRes?.data;
      setValErrors(v?.errors ?? []); setValWarnings(v?.warnings ?? []);
      if (!v?.valid) throw new Error(v?.errors?.[0] ?? 'Validation failed');
      return api.autotrader.exchangeConfig.save('tos', data);
    },
    onSuccess: () => { toast.success('TOS parameters saved'); setUnsaved(false); qc.invalidateQueries({ queryKey: ['tos-auto-config'] }); },
    onError: (err: any) => toast.error(err?.message ?? 'Save failed'),
  });

  if (!config || !form) return null;

  const f = form as any;
  const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const summaryLine = `Session: ${f.enabled ? 'ON' : 'OFF'} · Capital: $${(f.capitalTargetUsd ?? 0).toLocaleString()} / $${(f.capitalHardLimitUsd ?? 0).toLocaleString()} · Conviction ≥ ${f.minConvictionScore ?? 78} · ${f.orderDuration ?? 'DAY'}`;
  const inputCls = 'w-full bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-green/60';
  const toggleBtn = (on: boolean, color = 'bg-accent-green') =>
    <span className={cn('relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0', on ? color : 'bg-surface-border')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', on ? 'left-4' : 'left-0.5')} />
    </span>;
  const MARKET_CAPS = [{ label: '$500M', val: 500_000_000 }, { label: '$1B', val: 1_000_000_000 }, { label: '$5B', val: 5_000_000_000 }, { label: '$10B', val: 10_000_000_000 }];

  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button onClick={() => setShowParams((v) => !v)} className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-2 hover:bg-surface-3 transition-colors">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-accent-green" />
          <span className="text-sm font-bold text-white">⚙ Autonomous Trading Parameters</span>
          {f.enabled && <span className="text-[10px] bg-accent-green/15 text-accent-green px-1.5 py-0.5 rounded font-bold">ENABLED</span>}
        </div>
        <div className="flex items-center gap-3">
          {!showParams && <span className="text-xs text-slate-500 font-mono hidden lg:block truncate max-w-xs">{summaryLine}</span>}
          {showParams ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </div>
      </button>

      {showParams && (
        <div className="p-5 space-y-6 bg-surface-1 border-t border-surface-border">
          {unsaved && <div className="flex items-center px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg"><span className="text-xs text-amber-400">⚠ Unsaved changes</span></div>}
          {valErrors.length > 0 && <div className="px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg space-y-1">{valErrors.map((e, i) => <p key={i} className="text-xs text-red-400">✗ {e}</p>)}</div>}
          {valWarnings.length > 0 && <div className="px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg space-y-1">{valWarnings.map((w, i) => <p key={i} className="text-xs text-amber-400">⚠ {w}</p>)}</div>}

          {/* Group 1 — Session Control */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Session Control</h3>
            <p className="text-[10px] text-slate-500 mb-3">TOS trades Mon–Fri market hours only. Weekend days are automatically ignored.</p>
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Enable Autonomous Trading on ThinkorSwim</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {sessionStatus?.active ? `Active since ${config.sessionStartedAt ? new Date(config.sessionStartedAt).toLocaleString() : '—'}` : config.sessionPausedAt ? `Paused · ${config.sessionPauseReason ?? 'manual'}` : 'Not started'}
                  </p>
                </div>
                <button onClick={() => { upd('enabled', !f.enabled); toggleSession.mutate(!f.enabled); }}>{toggleBtn(f.enabled)}</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Auto-pause after (hours)</p>
                  <input type="number" placeholder="Indefinite" value={f.sessionDurationHours ?? ''} onChange={(e) => upd('sessionDurationHours', e.target.value ? parseFloat(e.target.value) : null)} className={inputCls} />
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Daily cutoff time (ET)</p>
                  <input type="time" value={f.dailyCutoffTime ?? ''} onChange={(e) => upd('dailyCutoffTime', e.target.value || null)} className={inputCls} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Active Trading Days</p>
                <div className="flex gap-1.5 flex-wrap">
                  {WEEKDAYS.map((d, i) => {
                    const isWeekend = i === 0 || i === 6;
                    const active = (f.activeDays ?? [1,2,3,4,5]).includes(i);
                    return (
                      <button key={d} disabled={isWeekend} onClick={() => { const cur: number[] = f.activeDays ?? [1,2,3,4,5]; upd('activeDays', active ? cur.filter((x: number) => x !== i) : [...cur, i].sort()); }}
                        className={cn('px-2.5 py-1 rounded text-xs font-medium border transition-colors', isWeekend ? 'opacity-30 cursor-not-allowed bg-surface-2 border-surface-border text-slate-600' : active ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-surface-2 border-surface-border text-slate-500')}>
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Group 2 — Capital Allocation */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Capital Allocation</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Capital Hard Limit ($)</p>
                <input type="number" value={f.capitalHardLimitUsd ?? 5000} onChange={(e) => upd('capitalHardLimitUsd', parseFloat(e.target.value))} className={inputCls} />
                <p className="text-[10px] text-red-400/70 mt-1">Hard cap on buying power. Schwab buying power must exceed this for trades to execute.</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Target Deployment ($)</p>
                <input type="number" value={f.capitalTargetUsd ?? 2000} onChange={(e) => upd('capitalTargetUsd', parseFloat(e.target.value))} className={inputCls} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Max Single Position ($)</p>
                <input type="number" value={f.maxPositionSizeUsd ?? 500} onChange={(e) => upd('maxPositionSizeUsd', parseFloat(e.target.value))} className={inputCls} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Min Position Size ($)</p>
                <input type="number" value={f.minPositionSizeUsd ?? 50} onChange={(e) => upd('minPositionSizeUsd', parseFloat(e.target.value))} className={inputCls} />
              </div>
            </div>
          </div>

          {/* Group 3 — Risk Profile */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Risk Profile</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Risk Mode</p>
                <div className="flex gap-1">
                  {['CONSERVATIVE','MODERATE','AGGRESSIVE','CUSTOM'].map((m) => (
                    <button key={m} onClick={() => upd('riskMode', m)}
                      className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors', f.riskMode === m ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-surface-2 border-surface-border text-slate-500 hover:text-white')}>
                      {m.charAt(0) + m.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
              </div>
              {f.riskMode === 'CUSTOM' && (
                <div><p className="text-xs text-slate-500 mb-1">Risk % per trade</p><input type="number" step="0.1" value={f.customRiskPct ?? ''} onChange={(e) => upd('customRiskPct', parseFloat(e.target.value))} className="w-32 bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-2 focus:outline-none" /></div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-500 mb-1">Max Drawdown (%) — this exchange</p><input type="number" step="0.1" value={f.maxDrawdownPct ?? 5} onChange={(e) => upd('maxDrawdownPct', parseFloat(e.target.value))} className={inputCls} /></div>
                <div><p className="text-xs text-slate-500 mb-1">Max Daily Loss ($)</p><input type="number" value={f.maxDailyLossUsd ?? 200} onChange={(e) => upd('maxDailyLossUsd', parseFloat(e.target.value))} className={inputCls} /></div>
                <div><p className="text-xs text-slate-500 mb-1">Min Reward:Risk Ratio</p><input type="number" step="0.1" min="1" value={f.minRewardRiskRatio ?? 1.5} onChange={(e) => upd('minRewardRiskRatio', parseFloat(e.target.value))} className={inputCls} /></div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Stop Distance Range (%)</p>
                  <div className="flex items-center gap-2">
                    <input type="number" step="0.1" value={f.minStopDistancePct ?? 1} onChange={(e) => upd('minStopDistancePct', parseFloat(e.target.value))} className="w-full bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-2 py-2 focus:outline-none" />
                    <span className="text-slate-500 text-xs">—</span>
                    <input type="number" step="0.1" value={f.maxStopDistancePct ?? 12} onChange={(e) => upd('maxStopDistancePct', parseFloat(e.target.value))} className="w-full bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-2 py-2 focus:outline-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Group 4 — Position Limits */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Position Limits</h3>
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-slate-500 mb-1">Max Concurrent Positions</p><input type="number" min="1" max="10" value={f.maxConcurrentPositions ?? 3} onChange={(e) => upd('maxConcurrentPositions', parseInt(e.target.value))} className={inputCls} /></div>
              <div><p className="text-xs text-slate-500 mb-1">Max new trades per scan cycle</p><input type="number" min="1" max="5" value={f.maxTradesPerScan ?? 2} onChange={(e) => upd('maxTradesPerScan', parseInt(e.target.value))} className={inputCls} /></div>
              <div><p className="text-xs text-slate-500 mb-1">Max trades per day</p><input type="number" min="1" max="20" value={f.maxTradesPerDay ?? 5} onChange={(e) => upd('maxTradesPerDay', parseInt(e.target.value))} className={inputCls} /></div>
              <div><p className="text-xs text-slate-500 mb-1">Cooldown between orders (min)</p><input type="number" min="0" value={f.orderCooldownMinutes ?? 15} onChange={(e) => upd('orderCooldownMinutes', parseInt(e.target.value))} className={inputCls} /></div>
            </div>
          </div>

          {/* Group 5 — Signal Thresholds */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Signal Thresholds</h3>
            <div className="space-y-3">
              <div><div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Min Conviction Score</p><span className="text-xs font-bold text-accent-green">{f.minConvictionScore ?? 78}</span></div><input type="range" min="50" max="99" value={f.minConvictionScore ?? 78} onChange={(e) => upd('minConvictionScore', parseInt(e.target.value))} className="w-full" /></div>
              <div><div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Min Confidence Score</p><span className="text-xs font-bold text-accent-green">{f.minConfidenceScore ?? 60}</span></div><input type="range" min="40" max="99" value={f.minConfidenceScore ?? 60} onChange={(e) => upd('minConfidenceScore', parseInt(e.target.value))} className="w-full" /></div>
              <div><div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Auto-exit if thesis health drops below</p><span className="text-xs font-bold text-amber-400">{f.minHoldThesisHealth ?? 35}</span></div><input type="range" min="10" max="80" value={f.minHoldThesisHealth ?? 35} onChange={(e) => upd('minHoldThesisHealth', parseInt(e.target.value))} className="w-full" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Allowed Bias</p>
                  <div className="flex gap-3">
                    {['BULLISH','BEARISH'].map((b) => { const on = (f.allowedBias ?? ['BULLISH']).includes(b); return (
                      <label key={b} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => { const cur: string[] = f.allowedBias ?? ['BULLISH']; upd('allowedBias', on ? cur.filter((x: string) => x !== b) : [...cur, b]); }} className="w-3 h-3" />
                        <span className={on ? (b === 'BULLISH' ? 'text-accent-green' : 'text-red-400') : 'text-slate-500'}>{b.charAt(0) + b.slice(1).toLowerCase()}</span>
                      </label>
                    ); })}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Allowed Actions</p>
                  <div className="flex flex-col gap-1">
                    {['STRONG_BUY','BUY','WATCH','SHORT','STRONG_SHORT'].map((a) => { const on = (f.allowedActions ?? ['STRONG_BUY','BUY']).includes(a); return (
                      <label key={a} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={on} onChange={() => { const cur: string[] = f.allowedActions ?? ['STRONG_BUY','BUY']; upd('allowedActions', on ? cur.filter((x: string) => x !== a) : [...cur, a]); }} className="w-3 h-3" />
                        <span className={on ? 'text-white' : 'text-slate-500'}>{a.replace('_', ' ')}</span>
                      </label>
                    ); })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Group 6 — TOS-Specific */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">ThinkorSwim Settings</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-slate-500 mb-1.5">Allowed Asset Types</p>
                <div className="flex gap-3">
                  {['EQUITY','ETF','OPTION'].map((t) => { const on = (f.allowedAssetTypes ?? ['EQUITY','ETF']).includes(t); return (
                    <label key={t} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <input type="checkbox" checked={on} onChange={() => { const cur: string[] = f.allowedAssetTypes ?? ['EQUITY','ETF']; upd('allowedAssetTypes', on ? cur.filter((x: string) => x !== t) : [...cur, t]); }} className="w-3 h-3" />
                      <span className={on ? 'text-white' : 'text-slate-500'}>{t}</span>
                    </label>
                  ); })}
                </div>
                {(f.allowedAssetTypes ?? []).includes('OPTION') && <p className="text-[10px] text-amber-400 mt-1">⚠ Options trading requires appropriate account permissions in Schwab</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1.5">Order Session</p>
                  <div className="flex gap-1">
                    {['NORMAL','SEAMLESS'].map((s) => (
                      <button key={s} onClick={() => upd('orderSession', s)}
                        className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors', f.orderSession === s ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-surface-2 border-surface-border text-slate-500 hover:text-white')}>
                        {s === 'NORMAL' ? 'Normal' : 'Seamless (Pre/After)'}
                      </button>
                    ))}
                  </div>
                  {f.orderSession === 'SEAMLESS' && <p className="text-[10px] text-amber-400 mt-1">⚠ After-hours trading has reduced liquidity and wider spreads</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Order Duration</p>
                  <select value={f.orderDuration ?? 'DAY'} onChange={(e) => upd('orderDuration', e.target.value)} className={inputCls + ' bg-surface-2'}>
                    {['DAY','GTC','FOK','IOC'].map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-white font-medium">Attach Bracket Orders (auto TP + SL)</p>
                  {!f.useBracketOrders && <p className="text-[10px] text-slate-500">Orders placed without automatic take-profit or stop-loss legs</p>}
                </div>
                <button onClick={() => upd('useBracketOrders', !f.useBracketOrders)}>{toggleBtn(f.useBracketOrders)}</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Min Avg Daily Volume (shares)</p>
                  <input type="number" value={f.minAvgDailyVolume ?? 500000} onChange={(e) => upd('minAvgDailyVolume', parseInt(e.target.value))} className={inputCls} />
                  <p className="text-[10px] text-slate-600 mt-1">Stocks below this volume are skipped</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Min Market Cap ($)</p>
                  <input type="number" value={f.minMarketCapUsd ?? 1_000_000_000} onChange={(e) => upd('minMarketCapUsd', parseFloat(e.target.value))} className={inputCls} />
                  <div className="flex gap-1 mt-1.5">
                    {MARKET_CAPS.map((mc) => (
                      <button key={mc.label} onClick={() => upd('minMarketCapUsd', mc.val)}
                        className={cn('flex-1 text-[10px] py-0.5 rounded border transition-colors', f.minMarketCapUsd === mc.val ? 'bg-accent-green/20 border-accent-green/40 text-accent-green' : 'bg-surface-2 border-surface-border text-slate-500 hover:text-white')}>
                        {mc.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <SectorTagInput tags={f.blockedSectors ?? []} onChange={(t) => upd('blockedSectors', t)} />
            </div>
          </div>

          {/* Save / Reset */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border">
            <button onClick={() => { setForm({ ...config }); setUnsaved(false); setValErrors([]); setValWarnings([]); }} className="px-4 py-2 text-xs text-slate-400 hover:text-white border border-surface-border rounded-lg transition-colors">Reset</button>
            <button onClick={() => form && saveMutation.mutate(form)} disabled={saveMutation.isPending} className={cn('px-5 py-2 bg-accent-green text-black text-xs font-bold rounded-lg transition-colors', saveMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-green/80')}>
              {saveMutation.isPending ? 'Saving…' : 'Save Parameters'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Account Switcher ─────────────────────────────────────────────

function AccountSwitcher({
  accounts,
  selectedAccountNumber,
  onSelect,
  label,
  showAutoTradeWarning = false,
  refetchAccounts,
}: {
  accounts: SchwabAccountSummary[];
  selectedAccountNumber: string;
  onSelect: (accountNumber: string) => void;
  label: string;
  showAutoTradeWarning?: boolean;
  refetchAccounts?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = accounts.find(a => a.accountNumber === selectedAccountNumber) ?? accounts[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-3 border border-surface-border hover:border-slate-500 transition-colors text-sm"
      >
        <span className={cn(
          'text-xs font-bold px-1.5 py-0.5 rounded font-mono',
          selected?.isPaper ? 'bg-accent-blue/20 text-accent-blue' : 'bg-accent-green/20 text-accent-green'
        )}>
          {selected?.isPaper ? 'PAPER' : 'LIVE'}
        </span>
        <span className="text-white font-mono text-xs">{selected?.label ?? 'Select account'}</span>
        <ChevronDown className={cn('h-3 w-3 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-surface-1 border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-surface-border">
            <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">{label}</p>
          </div>
          {accounts.map((account) => (
            <button
              key={account.accountNumber}
              onClick={() => {
                if (showAutoTradeWarning && !account.isPaper && selected?.isPaper) {
                  if (!confirm(`Switch Auto Trader to a LIVE account (${account.label})?\n\nReal money will be used. Make sure Dry Run is enabled until you're ready.`)) return;
                }
                onSelect(account.accountNumber);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between px-3 py-3 hover:bg-surface-3 transition-colors text-left',
                account.accountNumber === selectedAccountNumber && 'bg-surface-3'
              )}
            >
              <div className="flex items-center gap-2.5">
                <span className={cn(
                  'text-xs font-bold px-1.5 py-0.5 rounded font-mono flex-shrink-0',
                  account.isPaper ? 'bg-accent-blue/20 text-accent-blue' : 'bg-accent-green/20 text-accent-green'
                )}>
                  {account.isPaper ? 'PAPER' : 'LIVE'}
                </span>
                <div>
                  <p className="text-sm text-white font-mono">{account.accountNumberMasked}</p>
                  <p className="text-xs text-slate-500">{account.type}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-white font-mono">${account.equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}</p>
                <p className="text-xs text-slate-500">{account.positionCount} pos</p>
              </div>
            </button>
          ))}
          <div className="px-3 py-2 border-t border-surface-border">
            <button
              onClick={() => {
                if (refetchAccounts) {
                  (api.credentials as any).tosRefreshAccounts().then(() => refetchAccounts());
                }
                setOpen(false);
              }}
              className="text-xs text-slate-500 hover:text-white flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="h-3 w-3" /> Refresh account list
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TOS Connect Wizard ───────────────────────────────────────────

function TOSConnectCard({ onConnected }: { onConnected: () => void }) {
  const [step, setStep] = useState<'credentials' | 'authorize'>('credentials');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [redirectUri, setRedirectUri] = useState('https://127.0.0.1');
  const [authUrl, setAuthUrl] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);

  const handleGenerateUrl = async () => {
    setError('');
    setIsLoading(true);
    try {
      const result = await (api.credentials as any).tosAuthUrl({ clientId, clientSecret, redirectUri });
      setAuthUrl(result?.data?.authUrl ?? result?.data?.data?.authUrl ?? '');
      setStep('authorize');
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to generate authorization URL');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    setError('');
    setIsLoading(true);
    try {
      await (api.credentials as any).tosConnect({ authorizationCode: authCode, accountNumber });
      toast.success('ThinkorSwim connected successfully!');
      onConnected();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Connection failed. Check your authorization code.');
    } finally {
      setIsLoading(false);
    }
  };

  const steps = ['credentials', 'authorize'];

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md p-6 bg-surface-2 border border-surface-border rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-accent-purple" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Connect ThinkorSwim</h2>
            <p className="text-xs text-slate-500">Schwab API · equities & options</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6">
          {['App Credentials', 'Authorize & Connect'].map((label, i) => (
            <div key={i} className="flex items-center gap-2 flex-1">
              <div className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                i <= steps.indexOf(step)
                  ? 'bg-accent-purple text-white'
                  : 'bg-surface-3 text-slate-500 border border-surface-border'
              )}>{i + 1}</div>
              <span className={cn('text-xs flex-1', i <= steps.indexOf(step) ? 'text-slate-300' : 'text-slate-600')}>{label}</span>
              {i < 1 && <div className="h-px w-4 bg-surface-border" />}
            </div>
          ))}
        </div>

        {step === 'credentials' && (
          <div className="space-y-4">
            <div>
              <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">App Key (Client ID)</label>
              <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)}
                placeholder="Your Schwab app key"
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-purple" />
              <p className="text-xs text-slate-600 mt-1">From developer.schwab.com → your app</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">App Secret (Client Secret)</label>
              <div className="relative">
                <input type={showSecret ? 'text' : 'password'} value={clientSecret} onChange={(e) => setClientSecret(e.target.value)}
                  placeholder="Your Schwab app secret"
                  className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-purple" />
                <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">Redirect URI</label>
              <input type="text" value={redirectUri} onChange={(e) => setRedirectUri(e.target.value)}
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-accent-purple" />
              <p className="text-xs text-slate-600 mt-1">Must match exactly what's registered in your Schwab app</p>
            </div>
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex gap-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{error}</div>}
            <button onClick={handleGenerateUrl} disabled={!clientId || !clientSecret || isLoading}
              className="w-full py-2.5 rounded-lg bg-accent-purple text-white text-sm font-semibold disabled:opacity-40 hover:bg-accent-purple/90 transition-colors flex items-center justify-center gap-2">
              {isLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Generating...</> : 'Generate Authorization URL →'}
            </button>
          </div>
        )}

        {step === 'authorize' && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-surface-3 border border-surface-border space-y-3">
              <p className="text-sm text-white font-medium">Click below to open Schwab login</p>
              <p className="text-xs text-slate-400">Log in with your Schwab account, then copy the full redirect URL and paste it below.</p>
              <a href={authUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-accent-purple text-white text-sm font-semibold hover:bg-accent-purple/90 transition-colors">
                <ExternalLink className="h-4 w-4" /> Open Schwab Authorization
              </a>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">Paste the full redirect URL here</label>
              <input type="text" value={authCode}
                onChange={(e) => {
                  const val = e.target.value;
                  const match = val.match(/[?&]code=([^&]+)/);
                  setAuthCode(match ? decodeURIComponent(match[1]) : val);
                }}
                placeholder="https://127.0.0.1/?code=..."
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-purple" />
              <p className="text-xs text-slate-600 mt-1">Paste the entire redirect URL — the code will be extracted automatically</p>
            </div>
            <div>
              <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">Schwab Account Number</label>
              <input type="text" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Your brokerage account number"
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-purple" />
            </div>
            {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex gap-2"><AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />{error}</div>}
            <div className="flex gap-2">
              <button onClick={() => setStep('credentials')} className="flex-1 py-2.5 rounded-lg border border-surface-border text-slate-400 text-sm hover:text-white hover:border-slate-500 transition-colors">
                ← Back
              </button>
              <button onClick={handleConnect} disabled={!authCode || !accountNumber || isLoading}
                className="flex-1 py-2.5 rounded-lg bg-accent-purple text-white text-sm font-semibold disabled:opacity-40 hover:bg-accent-purple/90 transition-colors flex items-center justify-center gap-2">
                {isLoading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Connecting...</> : <><CheckCircle2 className="h-4 w-4" /> Connect & Verify</>}
              </button>
            </div>
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 p-3 rounded-lg bg-surface-3 border border-surface-border">
          <Lock className="h-4 w-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-500">App secret and refresh tokens are encrypted with AES-256 before storage. Never logged or stored in plaintext.</p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────

export default function TosDashboard() {
  const qc = useQueryClient();
  const [showHardStopConfirm, setShowHardStopConfirm] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [controlReason, setControlReason]     = useState('');
  const [emergencyConfirmText, setEmergencyConfirmText] = useState('');

  const { data: credStatus, refetch: refetchCredStatus } = useQuery({
    queryKey: ['credential-status'],
    queryFn: () => (api.credentials as any).status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const tosConnected = (credStatus as any)?.data?.tos?.isConnected ?? false;

  const { data: accountsData, refetch: refetchAccounts } = useQuery({
    queryKey: ['tos-accounts'],
    queryFn: () => (api.credentials as any).tosAccounts(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    enabled: tosConnected,
  });

  const availableAccounts: SchwabAccountSummary[] = (accountsData as any)?.data?.accounts ?? [];
  const viewAccountNumber: string = (accountsData as any)?.data?.viewAccountNumber ?? '';
  const autoTradeAccountNumber: string = (accountsData as any)?.data?.autoTradeAccountNumber ?? '';
  const autoTradeAccount = availableAccounts.find(a => a.accountNumber === autoTradeAccountNumber);

  const { data: statusData, isLoading: sLoading, refetch: refetchStatus } = useQuery({
    queryKey: ['tos-status', viewAccountNumber],
    queryFn:  () => api.tos.status(viewAccountNumber || undefined),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const { data: accountData } = useQuery({
    queryKey: ['tos-account', viewAccountNumber],
    queryFn:  () => api.tos.account(viewAccountNumber || undefined),
    staleTime: 20_000,
    refetchInterval: 60_000,
    enabled: !!(statusData as any)?.data?.hasCredentials || tosConnected,
  });

  const { data: historyData } = useQuery({
    queryKey: ['tos-order-history'],
    queryFn:  () => api.tos.orderHistory(),
    staleTime: 30_000,
  });

  const pauseMutation = useMutation({
    mutationFn: (reason: string) => (api.tos as any).pause(reason),
    onSuccess: () => { toast.info('Trading paused'); qc.invalidateQueries({ queryKey: ['tos-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Pause failed'),
  });

  const hardStopMutation = useMutation({
    mutationFn: (reason: string) => (api.tos as any).hardStop(reason),
    onSuccess: (data: any) => {
      toast.warning(`Hard stop activated — ${data?.data?.ordersCancelled ?? 0} orders cancelled`);
      setShowHardStopConfirm(false);
      qc.invalidateQueries({ queryKey: ['tos-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Hard stop failed'),
  });

  const emergencyExitMutation = useMutation({
    mutationFn: ({ reason, confirmText }: { reason: string; confirmText: string }) =>
      (api.tos as any).emergencyExit(reason, confirmText),
    onSuccess: (data: any) => {
      toast.error(`EMERGENCY EXIT — ${data?.data?.positionsClosed ?? 0} positions closed`);
      setShowEmergencyConfirm(false);
      setEmergencyConfirmText('');
      qc.invalidateQueries({ queryKey: ['tos-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Emergency exit failed'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => (api.tos as any).resume(),
    onSuccess: () => { toast.success('Trading resumed'); qc.invalidateQueries({ queryKey: ['tos-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Resume failed'),
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
  const controlLevel: 'ACTIVE' | 'PAUSE' | 'HARD_STOP' = (status?.killswitch as any)?.controlLevel ?? 'ACTIVE';
  const isPaused = controlLevel === 'PAUSE';
  const isStopped = controlLevel === 'HARD_STOP';
  const isAnyControlActive = isPaused || isStopped;
  const totalPnl = positions.reduce((s, p) => s + (p.currentDayProfitLoss ?? 0), 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
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

          {tosConnected && availableAccounts.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 font-mono uppercase tracking-wider px-1">Viewing</span>
                <AccountSwitcher
                  accounts={availableAccounts}
                  selectedAccountNumber={viewAccountNumber}
                  onSelect={(acctNum) => {
                    (api.credentials as any).tosSetViewAccount({ accountNumber: acctNum })
                      .then(() => { refetchAccounts(); qc.invalidateQueries({ queryKey: ['tos-status'] }); });
                  }}
                  label="Select account to view"
                  refetchAccounts={refetchAccounts}
                />
              </div>
              <div className="w-px h-10 bg-surface-border self-center hidden sm:block" />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 font-mono uppercase tracking-wider px-1">Auto Trader</span>
                <AccountSwitcher
                  accounts={availableAccounts}
                  selectedAccountNumber={autoTradeAccountNumber}
                  onSelect={(acctNum) => {
                    (api.credentials as any).tosSetAutoTradeAccount({ accountNumber: acctNum })
                      .then((result: any) => {
                        refetchAccounts();
                        qc.invalidateQueries({ queryKey: ['tos-status'] });
                        if (result?.data?.warning) {
                          toast.warning(result.data.warning);
                        } else {
                          toast.success(result?.data?.message ?? 'Auto Trader account updated');
                        }
                      });
                  }}
                  label="Select auto trader account"
                  showAutoTradeWarning={true}
                  refetchAccounts={refetchAccounts}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            {tosConnected && (
              <button
                onClick={() => {
                  if (confirm('Disconnect ThinkorSwim? This will stop all autonomous trading on this exchange.')) {
                    (api.credentials as any).tosDisconnect().then(() => {
                      refetchCredStatus();
                      qc.invalidateQueries({ queryKey: ['tos-status'] });
                      toast.success('ThinkorSwim disconnected');
                    });
                  }
                }}
                className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
              >
                <PowerOff className="h-3 w-3" /> Disconnect
              </button>
            )}
            <button onClick={() => refetchStatus()} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
              <RefreshCw className="h-4 w-4" />
            </button>
            <span className={cn(
              'text-xs font-bold px-2 py-1 rounded font-mono',
              isStopped ? 'bg-red-500/20 text-red-400 animate-pulse' :
              isPaused  ? 'bg-amber-500/20 text-amber-400' :
                          'bg-accent-green/20 text-accent-green'
            )}>
              {isStopped ? '⛔ HARD STOP' : isPaused ? '⏸ PAUSED' : '● ACTIVE'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {!tosConnected && !status?.hasCredentials && !sLoading && (
          <TOSConnectCard onConnected={() => { refetchCredStatus(); refetchStatus(); }} />
        )}
        {tosConnected && (
          <div className="mx-6 mt-4">
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-mono uppercase tracking-wider text-slate-500">Trading Controls</p>
                <span className={cn(
                  'text-xs font-bold px-2 py-1 rounded font-mono',
                  isStopped ? 'bg-red-500/20 text-red-400 animate-pulse' :
                  isPaused  ? 'bg-amber-500/20 text-amber-400' :
                              'bg-accent-green/20 text-accent-green'
                )}>
                  {isStopped ? '⛔ HARD STOP' : isPaused ? '⏸ PAUSED' : '● ACTIVE'}
                </span>
              </div>

              {isAnyControlActive && (
                <div className={cn(
                  'flex items-center justify-between p-3 rounded-lg mb-3 border',
                  isStopped ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'
                )}>
                  <div>
                    <p className={cn('text-sm font-bold', isStopped ? 'text-red-400' : 'text-amber-400')}>
                      {isStopped ? '⛔ Hard Stop Active — Trading Halted' : '⏸ Trading Paused'}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {status?.killswitch?.reason ?? (status?.killswitch as any)?.pause?.reason ?? 'Manual control active'}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Since {status?.killswitch?.activatedAt
                        ? new Date(status.killswitch.activatedAt).toLocaleTimeString()
                        : (status?.killswitch as any)?.pause?.activatedAt
                        ? new Date((status?.killswitch as any)?.pause?.activatedAt).toLocaleTimeString()
                        : '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => resumeMutation.mutate()}
                    disabled={resumeMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-accent-green/20 border border-accent-green/40 text-accent-green text-xs font-semibold hover:bg-accent-green/30 transition-colors"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {resumeMutation.isPending ? 'Resuming...' : 'Resume Trading'}
                  </button>
                </div>
              )}

              {!isAnyControlActive && (
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={() => pauseMutation.mutate('Manual pause')}
                    disabled={pauseMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
                  >
                    <PauseCircle className="h-3.5 w-3.5" />
                    {pauseMutation.isPending ? '...' : 'Pause'}
                  </button>
                  <button
                    onClick={() => setShowHardStopConfirm(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-colors"
                  >
                    <StopCircle className="h-3.5 w-3.5" />
                    Hard Stop
                  </button>
                </div>
              )}

              <div className="pt-3 border-t border-surface-border">
                <button
                  onClick={() => setShowEmergencyConfirm(true)}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-red-500/5 border border-red-500/20 hover:bg-red-500/10 hover:border-red-500/40 transition-colors group"
                >
                  <div className="flex items-center gap-2">
                    <AlertOctagon className="h-4 w-4 text-red-500/60 group-hover:text-red-400" />
                    <div className="text-left">
                      <p className="text-xs font-semibold text-red-500/70 group-hover:text-red-400">Emergency Exit All Positions</p>
                      <p className="text-[10px] text-slate-600">Closes all open positions at market. Use only in emergencies.</p>
                    </div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-red-500/40 group-hover:text-red-400" />
                </button>
              </div>
            </Card>
          </div>
        )}

        {viewAccountNumber && autoTradeAccountNumber && viewAccountNumber !== autoTradeAccountNumber && (
          <div className="mx-6 mt-4 flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            Viewing a different account than the Auto Trader. Trades execute on{' '}
            <strong className="font-mono">{availableAccounts.find(a => a.accountNumber === autoTradeAccountNumber)?.accountNumberMasked ?? `...${autoTradeAccountNumber.slice(-4)}`}</strong>.
          </div>
        )}

        {autoTradeAccountNumber && tosConnected && (
          <div className={cn(
            'mx-6 mt-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border',
            autoTradeAccount?.isPaper
              ? 'bg-accent-blue/5 border-accent-blue/20 text-accent-blue'
              : 'bg-accent-green/5 border-accent-green/20 text-accent-green'
          )}>
            {autoTradeAccount?.isPaper
              ? <><FlaskConical className="h-3 w-3 flex-shrink-0" /> Auto Trader using paperMoney — no real funds at risk</>
              : <><Zap className="h-3 w-3 flex-shrink-0" /> Auto Trader using LIVE account — real funds</>
            }
            {status?.dryRun && (
              <span className="ml-auto font-mono bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">DRY RUN ON</span>
            )}
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

              <TOSAutoConfigPanel />

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

      {showHardStopConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 border border-surface-border rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center flex-shrink-0">
                <StopCircle className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Activate Hard Stop?</h3>
                <p className="text-xs text-slate-500">New orders blocked · Pending orders cancelled · Positions kept open</p>
              </div>
            </div>
            <textarea
              value={controlReason}
              onChange={(e) => setControlReason(e.target.value)}
              placeholder="Optional reason (e.g. 'Taking manual control')…"
              className="w-full bg-surface-3 border border-surface-border rounded-lg p-2.5 text-sm text-white placeholder-slate-600 resize-none h-20 mb-4 focus:outline-none focus:border-orange-500/50"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowHardStopConfirm(false)} className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 text-sm hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={() => hardStopMutation.mutate(controlReason || 'Manual hard stop')}
                disabled={hardStopMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 text-sm font-bold hover:bg-orange-500/30 transition-colors"
              >
                {hardStopMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" /> : 'Hard Stop'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEmergencyConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface-1 border border-red-500/40 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center flex-shrink-0">
                <AlertOctagon className="h-5 w-5 text-red-400" />
              </div>
              <h3 className="text-sm font-black text-red-400">Emergency Exit</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              This will <strong className="text-white">immediately close ALL open positions at market price</strong> and cancel all pending orders. This cannot be undone.
            </p>
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-4">
              <p className="text-xs text-red-400 font-mono">
                ⚠ Market orders during volatile conditions may fill at significantly worse prices than current market price.
              </p>
            </div>
            <div className="mb-4">
              <label className="text-xs text-slate-500 mb-1.5 block">Type <span className="font-mono font-bold text-white">CONFIRM</span> to proceed</label>
              <input
                type="text"
                value={emergencyConfirmText}
                onChange={(e) => setEmergencyConfirmText(e.target.value.toUpperCase())}
                placeholder="CONFIRM"
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 uppercase"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowEmergencyConfirm(false); setEmergencyConfirmText(''); }}
                className="flex-1 py-2.5 rounded-xl border border-surface-border text-slate-400 text-sm hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => emergencyExitMutation.mutate({
                  reason: 'Emergency exit — manual trigger',
                  confirmText: emergencyConfirmText,
                })}
                disabled={emergencyConfirmText !== 'CONFIRM' || emergencyExitMutation.isPending}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-400 text-sm font-black hover:bg-red-500/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {emergencyExitMutation.isPending
                  ? <RefreshCw className="h-4 w-4 animate-spin mx-auto" />
                  : '🚨 EXIT ALL POSITIONS'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
