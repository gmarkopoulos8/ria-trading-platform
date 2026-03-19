import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, TrendingUp, TrendingDown, ShieldAlert, AlertTriangle,
  Settings2, RefreshCw, CheckCircle2, XCircle, Minus, ChevronDown,
  ChevronUp, Clock, DollarSign, Lock, BarChart3, Zap, Power, PowerOff, X,
  Eye, EyeOff, PauseCircle, StopCircle, AlertOctagon, ChevronRight,
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

// ─── Shared Tag Input ─────────────────────────────────────────────

function TagInput({ label, tags, onChange }: { label: string; tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = () => {
    const v = input.trim().toUpperCase();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setInput('');
  };
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {tags.map((t) => (
          <span key={t} className="flex items-center gap-1 bg-surface-3 border border-surface-border text-xs rounded px-2 py-0.5 text-slate-300">
            {t}
            <button onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-red-400 transition-colors">
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Type and press Enter…" className="flex-1 bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-accent-blue/60 placeholder-slate-600" />
        <button onClick={add} className="px-3 py-1.5 bg-surface-2 border border-surface-border text-xs text-slate-400 hover:text-white rounded-lg transition-colors">Add</button>
      </div>
    </div>
  );
}

// ─── HL Autonomous Config Panel ───────────────────────────────────

function HLAutoConfigPanel() {
  const qc = useQueryClient();
  const [showParams, setShowParams] = useState(false);
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [unsaved, setUnsaved] = useState(false);
  const [valErrors, setValErrors] = useState<string[]>([]);
  const [valWarnings, setValWarnings] = useState<string[]>([]);

  const { data: configData } = useQuery({
    queryKey: ['hl-auto-config'],
    queryFn: () => api.autotrader.exchangeConfig.get('hyperliquid'),
  });
  const { data: sessionData, refetch: refetchSession } = useQuery({
    queryKey: ['hl-session-status'],
    queryFn: () => api.autotrader.exchangeConfig.sessionStatus('hyperliquid'),
    refetchInterval: 30_000,
  });

  const config: any = (configData as any)?.data ?? null;
  const sessionStatus: any = (sessionData as any)?.data ?? null;

  useEffect(() => { if (config && !form) setForm({ ...config }); }, [config]);

  const upd = (k: string, v: unknown) => {
    setForm((f) => f ? { ...f, [k]: v } : { [k]: v });
    setUnsaved(true);
  };

  const toggleSession = useMutation({
    mutationFn: (enable: boolean) => enable
      ? api.autotrader.exchangeConfig.startSession('hyperliquid')
      : api.autotrader.exchangeConfig.pauseSession('hyperliquid', 'Manually disabled'),
    onSuccess: () => { refetchSession(); qc.invalidateQueries({ queryKey: ['hl-auto-config'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const saveMutation = useMutation({
    mutationFn: async (data: unknown) => {
      const vRes: any = await api.autotrader.exchangeConfig.validate('hyperliquid', data);
      const v = vRes?.data;
      setValErrors(v?.errors ?? []);
      setValWarnings(v?.warnings ?? []);
      if (!v?.valid) throw new Error(v?.errors?.[0] ?? 'Validation failed');
      return api.autotrader.exchangeConfig.save('hyperliquid', data);
    },
    onSuccess: () => { toast.success('Hyperliquid parameters saved'); setUnsaved(false); qc.invalidateQueries({ queryKey: ['hl-auto-config'] }); },
    onError: (err: any) => toast.error(err?.message ?? 'Save failed'),
  });

  if (!config || !form) return null;

  const f = form as any;
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const summaryLine = `Session: ${f.enabled ? 'ON' : 'OFF'} · Capital: $${(f.capitalTargetUsd ?? 0).toLocaleString()} / $${(f.capitalHardLimitUsd ?? 0).toLocaleString()} · Conviction ≥ ${f.minConvictionScore ?? 78} · ${f.defaultLeverage ?? 2}x leverage`;

  const inputCls = 'w-full bg-surface-2 border border-surface-border text-white text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-accent-blue/60';
  const toggleBtn = (on: boolean, color = 'bg-accent-green') =>
    <span className={cn('relative inline-flex w-9 h-5 rounded-full transition-colors flex-shrink-0', on ? color : 'bg-surface-border')}>
      <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', on ? 'left-4' : 'left-0.5')} />
    </span>;

  return (
    <div className="border border-surface-border rounded-xl overflow-hidden">
      <button onClick={() => setShowParams((v) => !v)} className="w-full flex items-center justify-between px-5 py-3.5 bg-surface-2 hover:bg-surface-3 transition-colors">
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-accent-purple" />
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
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-white">Enable Autonomous Trading on Hyperliquid</p>
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
                  <p className="text-[10px] text-slate-600 mt-1">Session auto-pauses after this many hours</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Daily cutoff time (ET)</p>
                  <input type="time" value={f.dailyCutoffTime ?? ''} onChange={(e) => upd('dailyCutoffTime', e.target.value || null)} className={inputCls} />
                </div>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-2">Active Trading Days</p>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map((d, i) => {
                    const active = (f.activeDays ?? [1,2,3,4,5]).includes(i);
                    return (
                      <button key={d} onClick={() => { const cur: number[] = f.activeDays ?? [1,2,3,4,5]; upd('activeDays', active ? cur.filter((x: number) => x !== i) : [...cur, i].sort()); }}
                        className={cn('px-2.5 py-1 rounded text-xs font-medium border transition-colors', active ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-surface-2 border-surface-border text-slate-500')}>
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
                <p className="text-[10px] text-red-400/70 mt-1">Absolute maximum — orders blocked if reached</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Target Deployment ($)</p>
                <input type="number" value={f.capitalTargetUsd ?? 2000} onChange={(e) => upd('capitalTargetUsd', parseFloat(e.target.value))} className={inputCls} />
                <p className="text-[10px] text-slate-600 mt-1">How much to actively keep deployed</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Max Single Position ($)</p>
                <input type="number" value={f.maxPositionSizeUsd ?? 500} onChange={(e) => upd('maxPositionSizeUsd', parseFloat(e.target.value))} className={inputCls} />
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Min Position Size ($)</p>
                <input type="number" value={f.minPositionSizeUsd ?? 50} onChange={(e) => upd('minPositionSizeUsd', parseFloat(e.target.value))} className={inputCls} />
                <p className="text-[10px] text-slate-600 mt-1">Positions smaller than this are skipped</p>
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
                      className={cn('flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors', f.riskMode === m ? 'bg-accent-blue/20 border-accent-blue/40 text-accent-blue' : 'bg-surface-2 border-surface-border text-slate-500 hover:text-white')}>
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
              <div><div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Min Conviction Score</p><span className="text-xs font-bold text-accent-blue">{f.minConvictionScore ?? 78}</span></div><input type="range" min="50" max="99" value={f.minConvictionScore ?? 78} onChange={(e) => upd('minConvictionScore', parseInt(e.target.value))} className="w-full accent-blue-400" /></div>
              <div><div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Min Confidence Score</p><span className="text-xs font-bold text-accent-blue">{f.minConfidenceScore ?? 60}</span></div><input type="range" min="40" max="99" value={f.minConfidenceScore ?? 60} onChange={(e) => upd('minConfidenceScore', parseInt(e.target.value))} className="w-full accent-blue-400" /></div>
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

          {/* Group 6 — Hyperliquid-Specific */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Hyperliquid Settings</h3>
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1"><p className="text-xs text-slate-500">Default Leverage</p><span className={cn('text-xs font-bold', (f.defaultLeverage ?? 2) > 5 ? 'text-orange-400' : 'text-white')}>{f.defaultLeverage ?? 2}x</span></div>
                <input type="range" min="1" max="10" value={f.defaultLeverage ?? 2} onChange={(e) => upd('defaultLeverage', parseInt(e.target.value))} className="w-full" />
                {(f.defaultLeverage ?? 2) > 5 && <p className="text-[10px] text-orange-400 mt-1">⚠ High leverage significantly increases liquidation risk</p>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-slate-500 mb-1">Maximum Leverage Cap</p><input type="number" min="1" max="20" value={f.maxLeverage ?? 5} onChange={(e) => upd('maxLeverage', parseInt(e.target.value))} className={inputCls} /></div>
                <div className="flex flex-col gap-2 justify-center pt-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Cross Margin</span>
                    <button onClick={() => upd('useCrossMargin', !f.useCrossMargin)}>{toggleBtn(f.useCrossMargin, 'bg-accent-blue')}</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">Allow Short Positions</span>
                    <button onClick={() => upd('allowShorts', !f.allowShorts)}>{toggleBtn(f.allowShorts)}</button>
                  </div>
                </div>
              </div>
              <TagInput label="Allowed Assets (blank = all)" tags={f.allowedAssets ?? []} onChange={(t) => upd('allowedAssets', t)} />
              <TagInput label="Blocked Assets" tags={f.blockedAssets ?? []} onChange={(t) => upd('blockedAssets', t)} />
            </div>
          </div>

          {/* Save / Reset */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-surface-border">
            <button onClick={() => { setForm({ ...config }); setUnsaved(false); setValErrors([]); setValWarnings([]); }} className="px-4 py-2 text-xs text-slate-400 hover:text-white border border-surface-border rounded-lg transition-colors">Reset</button>
            <button onClick={() => form && saveMutation.mutate(form)} disabled={saveMutation.isPending} className={cn('px-5 py-2 bg-accent-blue text-white text-xs font-bold rounded-lg transition-colors', saveMutation.isPending ? 'opacity-50 cursor-not-allowed' : 'hover:bg-accent-blue/80')}>
              {saveMutation.isPending ? 'Saving…' : 'Save Parameters'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Connect Card ─────────────────────────────────────────────────

function HyperliquidConnectCard({ onConnected }: { onConnected: () => void }) {
  const [walletAddress, setWalletAddress] = useState('');
  const [agentKey, setAgentKey] = useState('');
  const [isMainnet, setIsMainnet] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');

  const handleConnect = async () => {
    setError('');
    setIsConnecting(true);
    try {
      await (api.credentials as any).hlConnect({ walletAddress, agentPrivateKey: agentKey, isMainnet });
      toast.success('Hyperliquid connected successfully!');
      onConnected();
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Connection failed. Check your credentials.');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-full max-w-md p-6 bg-surface-2 border border-surface-border rounded-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center">
            <Activity className="h-5 w-5 text-accent-blue" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Connect Hyperliquid</h2>
            <p className="text-xs text-slate-500">Mainnet perpetuals trading</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg bg-surface-3 border border-surface-border">
            <span className="text-sm text-slate-300">Network</span>
            <div className="flex gap-2">
              <button onClick={() => setIsMainnet(true)}
                className={cn('px-3 py-1 rounded text-xs font-mono', isMainnet ? 'bg-accent-green text-black font-bold' : 'text-slate-500 hover:text-white')}>
                Mainnet
              </button>
              <button onClick={() => setIsMainnet(false)}
                className={cn('px-3 py-1 rounded text-xs font-mono', !isMainnet ? 'bg-amber-500 text-black font-bold' : 'text-slate-500 hover:text-white')}>
                Testnet
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">Main Wallet Address</label>
            <input type="text" value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="0x..."
              className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-blue" />
            <p className="text-xs text-slate-600 mt-1">Your main wallet address (public — not sensitive)</p>
          </div>

          <div>
            <label className="text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5 block">Agent Wallet Private Key</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={agentKey} onChange={(e) => setAgentKey(e.target.value)}
                placeholder="0x..."
                className="w-full bg-surface-3 border border-surface-border rounded-lg px-3 py-2.5 pr-10 text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-accent-blue" />
              <button type="button" onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              Agent key only — your main wallet key is never needed.{' '}
              <a href="https://app.hyperliquid.xyz/settings" target="_blank" rel="noopener noreferrer" className="text-accent-blue hover:underline">
                Create agent wallet →
              </a>
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 rounded-lg bg-accent-blue/5 border border-accent-blue/20">
            <Lock className="h-4 w-4 text-accent-blue flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">
              Your agent key is encrypted with AES-256 before storage. It is never logged or transmitted in plaintext.
            </p>
          </div>

          <button onClick={handleConnect} disabled={!walletAddress || !agentKey || isConnecting}
            className="w-full py-2.5 rounded-lg bg-accent-blue text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent-blue/90 transition-colors flex items-center justify-center gap-2">
            {isConnecting
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Verifying connection...</>
              : <><CheckCircle2 className="h-4 w-4" /> Connect & Verify</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────

export default function HyperliquidDashboard() {
  const qc = useQueryClient();
  const [showHardStopConfirm, setShowHardStopConfirm] = useState(false);
  const [showEmergencyConfirm, setShowEmergencyConfirm] = useState(false);
  const [emergencyConfirmText, setEmergencyConfirmText] = useState('');
  const [controlReason, setControlReason] = useState('');

  const { data: credStatus, refetch: refetchCredStatus } = useQuery({
    queryKey: ['credential-status'],
    queryFn: () => (api.credentials as any).status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const hlConnected = (credStatus as any)?.data?.hyperliquid?.isConnected ?? false;

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

  const pauseMutation = useMutation({
    mutationFn: (reason: string) => (api.hyperliquid as any).pause(reason),
    onSuccess: () => { toast.info('Trading paused'); qc.invalidateQueries({ queryKey: ['hl-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Pause failed'),
  });

  const hardStopMutation = useMutation({
    mutationFn: (reason: string) => (api.hyperliquid as any).hardStop(reason),
    onSuccess: (data: any) => {
      toast.warning(`Hard stop activated — ${data?.data?.ordersCancelled ?? 0} orders cancelled`);
      setShowHardStopConfirm(false);
      qc.invalidateQueries({ queryKey: ['hl-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Hard stop failed'),
  });

  const emergencyExitMutation = useMutation({
    mutationFn: ({ reason, confirmText }: { reason: string; confirmText: string }) =>
      (api.hyperliquid as any).emergencyExit(reason, confirmText),
    onSuccess: (data: any) => {
      toast.error(`EMERGENCY EXIT — ${data?.data?.positionsClosed ?? 0} positions closed`);
      setShowEmergencyConfirm(false);
      setEmergencyConfirmText('');
      qc.invalidateQueries({ queryKey: ['hl-status'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Emergency exit failed'),
  });

  const resumeMutation = useMutation({
    mutationFn: () => (api.hyperliquid as any).resume(),
    onSuccess: () => { toast.success('Trading resumed'); qc.invalidateQueries({ queryKey: ['hl-status'] }); },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Resume failed'),
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
  const controlLevel: 'ACTIVE' | 'PAUSE' | 'HARD_STOP' = (status?.killswitch as any)?.controlLevel ?? 'ACTIVE';
  const isPaused = controlLevel === 'PAUSE';
  const isStopped = controlLevel === 'HARD_STOP';
  const isAnyControlActive = isPaused || isStopped;

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
            {hlConnected && (
              <button
                onClick={() => {
                  if (confirm('Disconnect Hyperliquid? This will stop all autonomous trading on this exchange.')) {
                    (api.credentials as any).hlDisconnect().then(() => {
                      refetchCredStatus();
                      qc.invalidateQueries({ queryKey: ['hl-status'] });
                      toast.success('Hyperliquid disconnected');
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
        {!hlConnected && !sLoading && (
          <HyperliquidConnectCard onConnected={() => { refetchCredStatus(); refetchStatus(); }} />
        )}
        {hlConnected && (
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

              <HLAutoConfigPanel />

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
                        { label: 'Controls', value: controlLevel === 'HARD_STOP' ? 'HARD STOP' : controlLevel === 'PAUSE' ? 'PAUSED' : 'Active', color: isStopped ? 'text-red-400' : isPaused ? 'text-amber-400' : 'text-accent-green' },
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
