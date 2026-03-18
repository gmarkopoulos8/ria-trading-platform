import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase, Plus, TrendingUp, TrendingDown, DollarSign, Target,
  X, RefreshCw, ChevronUp, ChevronDown, Activity, Shield, Brain,
  Clock, CheckCircle, XCircle, AlertTriangle, BarChart2, Zap,
  ChevronRight, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  BookOpen, History, Eye,
} from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../api/client';

type Side = 'LONG' | 'SHORT';
type CloseReason = 'HIT_TARGET' | 'HIT_STOP' | 'MANUAL' | 'THESIS_INVALIDATED' | 'TIME_EXIT';

interface OpenPosition {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  thesis: string;
  thesisHealth?: number | null;
  unrealizedPnl: number;
  unrealizedPct: number;
  marketValue: number;
  costBasis: number;
  invalidationProximity?: number | null;
  targetProximity?: number | null;
  openedAt: string;
  tags: string[];
}

interface ClosedPosition {
  id: string;
  symbol: string;
  name: string;
  side: Side;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  targetPrice?: number | null;
  stopLoss?: number | null;
  pnl: number;
  pnlPercent: number;
  thesis: string;
  thesisOutcome?: string | null;
  closeReason?: string | null;
  notes?: string | null;
  openedAt: string;
  closedAt: string;
  holdingPeriodDays?: number | null;
}

interface PortfolioSummary {
  cashBalance: number;
  portfolioValue: number;
  totalMarketValue: number;
  totalUnrealized: number;
  totalRealizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  openCount: number;
  closedCount: number;
  longCount: number;
  shortCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  wins: number;
  losses: number;
}

function fmt(n: number, decimals = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return n.toFixed(decimals);
}

function fmtPrice(n: number): string {
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${n.toFixed(2)}`;
}

function fmtDollar(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  return `${sign}$${fmt(Math.abs(n))}`;
}

function pnlColor(n: number): string {
  return n >= 0 ? 'text-emerald-400' : 'text-red-400';
}

function pnlBg(n: number): string {
  return n >= 0 ? 'bg-emerald-400/10 border-emerald-400/20' : 'bg-red-400/10 border-red-400/20';
}

function thesisHealthColor(h?: number | null): string {
  if (h == null) return 'text-slate-600';
  if (h >= 70) return 'text-emerald-400';
  if (h >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function outcomeIcon(outcome?: string | null) {
  if (outcome === 'TARGET_HIT' || outcome === 'PARTIAL_WIN') return <CheckCircle className="h-4 w-4 text-emerald-400" />;
  if (outcome === 'INVALIDATED' || outcome === 'STOPPED_OUT') return <XCircle className="h-4 w-4 text-red-400" />;
  if (outcome === 'BREAKEVEN') return <MoreHorizontal className="h-4 w-4 text-slate-400" />;
  return null;
}

function closeReasonLabel(r?: string | null): string {
  const m: Record<string, string> = {
    HIT_TARGET: 'Hit Target', HIT_STOP: 'Hit Stop', MANUAL: 'Manual',
    THESIS_INVALIDATED: 'Invalidated', TIME_EXIT: 'Time Exit',
  };
  return r ? (m[r] ?? r) : '—';
}

function ProximityBar({
  value,
  label,
  danger = false,
}: { value: number | null | undefined; label: string; danger?: boolean }) {
  if (value == null) return null;
  const clamped = Math.min(100, value);
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px] font-mono">
        <span className="text-slate-600">{label}</span>
        <span className={danger && clamped < 10 ? 'text-red-400 font-semibold' : 'text-slate-500'}>
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${danger ? (clamped < 10 ? 'bg-red-400' : 'bg-amber-400') : 'bg-emerald-400'}`}
          style={{ width: `${100 - clamped}%` }}
        />
      </div>
    </div>
  );
}

function ThesisHealthRing({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-xs text-slate-600">—</span>;
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;
  const color = value >= 70 ? '#34d399' : value >= 50 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex items-center gap-1.5">
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
        <circle cx="14" cy="14" r={r} fill="none" stroke="#1e293b" strokeWidth="3" />
        <circle cx="14" cy="14" r={r} fill="none" stroke={color} strokeWidth="3"
          strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
      </svg>
      <span className="text-xs font-mono" style={{ color }}>{value}</span>
    </div>
  );
}

function OpenPositionModal({
  onClose,
  onSuccess,
  prefill,
}: {
  onClose: () => void;
  onSuccess: () => void;
  prefill?: { symbol?: string; thesis?: string; entryPrice?: number; targetPrice?: number; stopLoss?: number; thesisHealth?: number; assetClass?: string };
}) {
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState(prefill?.symbol ?? '');
  const [assetClass, setAssetClass] = useState(prefill?.assetClass ?? 'stock');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [quantity, setQuantity] = useState('');
  const [entryPrice, setEntryPrice] = useState(prefill?.entryPrice ? String(prefill.entryPrice) : '');
  const [targetPrice, setTargetPrice] = useState(prefill?.targetPrice ? String(prefill.targetPrice) : '');
  const [stopLoss, setStopLoss] = useState(prefill?.stopLoss ? String(prefill.stopLoss) : '');
  const [thesis, setThesis] = useState(prefill?.thesis ?? '');
  const [thesisHealth, setThesisHealth] = useState(prefill?.thesisHealth ? String(prefill.thesisHealth) : '');
  const [error, setError] = useState<string | null>(null);

  const ep = parseFloat(entryPrice);
  const qty = parseFloat(quantity);
  const positionCost = !isNaN(ep) && !isNaN(qty) ? ep * qty : 0;

  const mutation = useMutation({
    mutationFn: (body: unknown) => api.positions.open(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Failed to open position');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!symbol.trim()) { setError('Symbol required'); return; }
    if (!entryPrice || isNaN(parseFloat(entryPrice))) { setError('Valid entry price required'); return; }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) { setError('Valid quantity required'); return; }
    if (!thesis.trim()) { setError('Thesis required'); return; }

    mutation.mutate({
      symbol: symbol.trim().toUpperCase(),
      assetClass,
      side,
      quantity: parseFloat(quantity),
      entryPrice: parseFloat(entryPrice),
      targetPrice: targetPrice ? parseFloat(targetPrice) : undefined,
      stopLoss: stopLoss ? parseFloat(stopLoss) : undefined,
      thesis: thesis.trim(),
      thesisHealth: thesisHealth ? parseFloat(thesisHealth) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-surface-1 border border-surface-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-accent-blue" />
            <h2 className="text-sm font-bold text-white">Open Paper Position</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">SYMBOL</label>
              <input
                value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="NVDA"
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-accent-blue/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">ASSET CLASS</label>
              <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white text-sm outline-none focus:border-accent-blue/50">
                <option value="stock">Stock</option>
                <option value="crypto">Crypto</option>
                <option value="etf">ETF</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">DIRECTION</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSide('long')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-all ${
                  side === 'long'
                    ? 'bg-emerald-400/15 text-emerald-400 border-emerald-400/30'
                    : 'bg-surface-2 text-slate-500 border-surface-border hover:border-slate-600'
                }`}>
                <TrendingUp className="h-4 w-4 inline mr-1.5" />LONG
              </button>
              <button type="button" onClick={() => setSide('short')}
                className={`py-2 rounded-lg text-sm font-semibold border transition-all ${
                  side === 'short'
                    ? 'bg-red-400/15 text-red-400 border-red-400/30'
                    : 'bg-surface-2 text-slate-500 border-surface-border hover:border-slate-600'
                }`}>
                <TrendingDown className="h-4 w-4 inline mr-1.5" />SHORT
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">ENTRY PRICE</label>
              <input type="number" step="any" min="0"
                value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-accent-blue/50"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">QUANTITY</label>
              <input type="number" step="any" min="0"
                value={quantity} onChange={(e) => setQuantity(e.target.value)}
                placeholder="10"
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-accent-blue/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">
                <Target className="h-3 w-3 inline mr-1 text-emerald-400" />TAKE PROFIT (OPT.)
              </label>
              <input type="number" step="any" min="0"
                value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-emerald-400/40"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 font-mono mb-1.5">
                <Shield className="h-3 w-3 inline mr-1 text-red-400" />STOP LOSS (OPT.)
              </label>
              <input type="number" step="any" min="0"
                value={stopLoss} onChange={(e) => setStopLoss(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-red-400/40"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">
              <Brain className="h-3 w-3 inline mr-1 text-accent-blue" />THESIS
            </label>
            <textarea value={thesis} onChange={(e) => setThesis(e.target.value)}
              placeholder="Describe your trade thesis..."
              rows={3}
              className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white text-sm outline-none focus:border-accent-blue/50 resize-none leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">
              THESIS HEALTH SCORE (0–100, OPT.)
            </label>
            <input type="number" min="0" max="100"
              value={thesisHealth} onChange={(e) => setThesisHealth(e.target.value)}
              placeholder="e.g. 75"
              className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-accent-blue/50"
            />
          </div>

          {positionCost > 0 && (
            <div className={`flex items-center justify-between text-xs px-3 py-2 rounded-lg border ${
              positionCost > 100_000 ? 'bg-red-400/5 border-red-400/20' : 'bg-surface-3 border-surface-border'
            }`}>
              <span className="text-slate-500 font-mono">Position cost</span>
              <span className={`font-mono font-bold ${positionCost > 100_000 ? 'text-red-400' : 'text-white'}`}>
                ${fmt(positionCost)}
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-surface-border rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className="flex-1 py-2.5 text-sm font-semibold bg-accent-blue hover:bg-accent-blue/80 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
              {mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {mutation.isPending ? 'Opening...' : 'Open Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ClosePositionModal({
  position,
  onClose,
  onSuccess,
}: {
  position: OpenPosition;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [exitPrice, setExitPrice] = useState(String(position.currentPrice));
  const [notes, setNotes] = useState('');
  const [closeReason, setCloseReason] = useState<CloseReason>('MANUAL');
  const [error, setError] = useState<string | null>(null);

  const ep = parseFloat(exitPrice);
  const dir = position.side === 'LONG' ? 1 : -1;
  const estimatedPnl = !isNaN(ep) ? (ep - position.entryPrice) * position.quantity * dir : null;
  const estimatedPct = !isNaN(ep) ? ((ep - position.entryPrice) / position.entryPrice) * 100 * dir : null;

  const mutation = useMutation({
    mutationFn: (body: unknown) => api.positions.close(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? 'Failed to close position');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!exitPrice || isNaN(parseFloat(exitPrice))) { setError('Valid exit price required'); return; }
    mutation.mutate({
      positionId: position.id,
      exitPrice: parseFloat(exitPrice),
      notes: notes || undefined,
      closeReason,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-surface-1 border border-surface-border rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <X className="h-4 w-4 text-red-400" />
            <h2 className="text-sm font-bold text-white">Close Position</h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-3 bg-surface-2 border-b border-surface-border">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-bold text-white font-mono">{position.symbol}</span>
              <span className={`ml-2 text-xs font-mono font-semibold ${position.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.side}
              </span>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 font-mono">{position.quantity} units @ {fmtPrice(position.entryPrice)}</p>
              <p className={`text-xs font-mono font-semibold ${pnlColor(position.unrealizedPnl)}`}>
                Unrealized: {fmtDollar(position.unrealizedPnl)} ({position.unrealizedPct.toFixed(2)}%)
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">EXIT PRICE</label>
            <input type="number" step="any" min="0"
              value={exitPrice} onChange={(e) => setExitPrice(e.target.value)}
              className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-sm outline-none focus:border-accent-blue/50"
            />
            {estimatedPnl != null && (
              <div className={`mt-1.5 flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs font-mono ${pnlBg(estimatedPnl)}`}>
                <span className="text-slate-500">Estimated P&L</span>
                <span className={`font-bold ${pnlColor(estimatedPnl)}`}>
                  {fmtDollar(estimatedPnl)} ({estimatedPct?.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">CLOSE REASON</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                ['MANUAL', 'Manual'],
                ['HIT_TARGET', 'Hit Target'],
                ['HIT_STOP', 'Hit Stop'],
                ['THESIS_INVALIDATED', 'Invalidated'],
                ['TIME_EXIT', 'Time Exit'],
              ] as [CloseReason, string][]).map(([v, l]) => (
                <button type="button" key={v} onClick={() => setCloseReason(v)}
                  className={`py-1.5 px-2 text-xs rounded-lg border transition-all font-mono ${
                    closeReason === v
                      ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                      : 'bg-surface-2 text-slate-500 border-surface-border hover:border-slate-600'
                  }`}>{l}</button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-500 font-mono mb-1.5">NOTES (OPT.)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="What did you learn? Did the thesis play out?"
              rows={2}
              className="w-full px-3 py-2 bg-surface-2 border border-surface-border rounded-lg text-white text-sm outline-none focus:border-accent-blue/50 resize-none"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertTriangle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm text-slate-400 hover:text-white border border-surface-border rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 ${
                estimatedPnl != null && estimatedPnl >= 0
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
                  : 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30'
              }`}>
              {mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              {mutation.isPending ? 'Closing...' : 'Close Position'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PositionRow({
  position,
  onClose,
  onNavigate,
}: {
  position: OpenPosition;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isLong = position.side === 'LONG';

  return (
    <div className={`rounded-lg border transition-all ${
      expanded ? 'border-accent-blue/25 bg-surface-2' : 'border-surface-border bg-surface-2 hover:bg-surface-3'
    }`}>
      <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer"
        onClick={() => setExpanded((v) => !v)}>
        <div className="col-span-3 flex items-center gap-2">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isLong ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <div>
            <p className="text-sm font-bold text-white font-mono">{position.symbol}</p>
            <p className="text-xs text-slate-600 truncate max-w-20">{position.name}</p>
          </div>
        </div>

        <div className="col-span-1">
          <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${
            isLong ? 'bg-emerald-400/10 text-emerald-400' : 'bg-red-400/10 text-red-400'
          }`}>{position.side}</span>
        </div>

        <div className="col-span-2">
          <p className="text-xs font-mono text-white">{fmtPrice(position.entryPrice)}</p>
          <p className="text-[10px] text-slate-600 font-mono">×{position.quantity}</p>
        </div>

        <div className="col-span-2">
          <p className="text-xs font-mono text-white">{fmtPrice(position.currentPrice)}</p>
          <p className={`text-[10px] font-mono font-semibold ${pnlColor(position.unrealizedPnl)}`}>
            {position.unrealizedPct >= 0 ? '+' : ''}{position.unrealizedPct.toFixed(2)}%
          </p>
        </div>

        <div className="col-span-2">
          <p className={`text-xs font-mono font-semibold ${pnlColor(position.unrealizedPnl)}`}>
            {fmtDollar(position.unrealizedPnl)}
          </p>
          <p className="text-[10px] text-slate-600 font-mono">${fmt(position.marketValue)}</p>
        </div>

        <div className="col-span-2 flex items-center justify-end gap-1.5">
          <ThesisHealthRing value={position.thesisHealth} />
          <button onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="p-1 rounded text-slate-600 hover:text-slate-400">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-3 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Take Profit</p>
              <p className="text-xs font-mono text-emerald-400 font-semibold">
                {position.targetPrice ? fmtPrice(position.targetPrice) : '—'}
              </p>
              {position.targetProximity != null && (
                <p className="text-[10px] text-slate-600">{position.targetProximity.toFixed(1)}% away</p>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-red-400/5 border border-red-400/10">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Stop Loss</p>
              <p className="text-xs font-mono text-red-400 font-semibold">
                {position.stopLoss ? fmtPrice(position.stopLoss) : '—'}
              </p>
              {position.invalidationProximity != null && (
                <p className={`text-[10px] ${position.invalidationProximity < 5 ? 'text-red-400 font-semibold' : 'text-slate-600'}`}>
                  {position.invalidationProximity.toFixed(1)}% away
                </p>
              )}
            </div>
            <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Cost Basis</p>
              <p className="text-xs font-mono text-white font-semibold">${fmt(position.costBasis)}</p>
              <p className="text-[10px] text-slate-600">
                {new Date(position.openedAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {position.stopLoss && position.targetPrice && (
            <div className="space-y-1.5">
              <ProximityBar value={position.targetProximity} label="Distance to take profit" />
              <ProximityBar value={position.invalidationProximity} label="Distance to stop loss" danger />
            </div>
          )}

          <div className="p-3 rounded-lg bg-surface-3 border border-surface-border">
            <p className="text-[10px] text-slate-600 font-mono uppercase mb-1.5">Thesis</p>
            <p className="text-xs text-slate-400 leading-relaxed">{position.thesis}</p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/15 hover:bg-red-500/25 border border-red-500/25 rounded-lg text-xs font-semibold text-red-400 transition-colors">
              <X className="h-3.5 w-3.5" />Close Trade
            </button>
            <button onClick={onNavigate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-3 hover:bg-surface-4 border border-surface-border rounded-lg text-xs text-slate-400 transition-colors">
              <Eye className="h-3.5 w-3.5" />View Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClosedPositionRow({ position }: { position: ClosedPosition }) {
  const [expanded, setExpanded] = useState(false);
  const isWin = position.pnl >= 0;

  return (
    <div className="rounded-lg border border-surface-border bg-surface-2 hover:bg-surface-3 transition-all">
      <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer"
        onClick={() => setExpanded((v) => !v)}>
        <div className="col-span-3 flex items-center gap-2">
          {outcomeIcon(position.thesisOutcome)}
          <div>
            <p className="text-sm font-bold text-white font-mono">{position.symbol}</p>
            <p className="text-xs text-slate-600 font-mono">{position.side}</p>
          </div>
        </div>

        <div className="col-span-2">
          <p className="text-xs font-mono text-slate-400">{fmtPrice(position.entryPrice)}</p>
          <p className="text-xs font-mono text-slate-400">→ {fmtPrice(position.exitPrice)}</p>
        </div>

        <div className="col-span-2">
          <p className={`text-xs font-mono font-bold ${pnlColor(position.pnl)}`}>
            {fmtDollar(position.pnl)}
          </p>
          <p className={`text-[10px] font-mono ${pnlColor(position.pnl)}`}>
            {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
          </p>
        </div>

        <div className="col-span-2">
          <p className="text-xs text-slate-500 font-mono">
            {position.holdingPeriodDays != null ? `${position.holdingPeriodDays}d` : '—'}
          </p>
          <p className="text-[10px] text-slate-600">{new Date(position.closedAt).toLocaleDateString()}</p>
        </div>

        <div className="col-span-2">
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${
            isWin ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : 'bg-red-400/10 text-red-400 border-red-400/20'
          }`}>{closeReasonLabel(position.closeReason)}</span>
        </div>

        <div className="col-span-1 flex justify-end">
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-slate-600" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-600" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-3 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Target was</p>
              <p className="text-xs font-mono text-emerald-400">{position.targetPrice ? fmtPrice(position.targetPrice) : '—'}</p>
              <p className="text-[10px] text-slate-600">Exit: {fmtPrice(position.exitPrice)}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Stop was</p>
              <p className="text-xs font-mono text-red-400">{position.stopLoss ? fmtPrice(position.stopLoss) : '—'}</p>
            </div>
            <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Outcome</p>
              <p className={`text-xs font-mono font-semibold ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                {position.thesisOutcome?.replace(/_/g, ' ') ?? '—'}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-surface-3 border border-surface-border space-y-2">
            <div>
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Original Thesis</p>
              <p className="text-xs text-slate-400 leading-relaxed">{position.thesis}</p>
            </div>
            {position.notes && (
              <div className="border-t border-surface-border pt-2">
                <p className="text-[10px] text-slate-600 font-mono uppercase mb-0.5">Post-trade Notes</p>
                <p className="text-xs text-slate-400">{position.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaperPortfolio() {
  const navigate = useNavigate();
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [closingPosition, setClosingPosition] = useState<OpenPosition | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['portfolio'],
    queryFn: async () => {
      const r = await api.positions.list() as {
        success: boolean;
        data?: { portfolio: PortfolioSummary; positions: OpenPosition[]; closed: ClosedPosition[] };
      };
      return r.data ?? null;
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });

  const portfolio = data?.portfolio;
  const positions = data?.positions ?? [];
  const closed = data?.closed ?? [];

  const longPositions = positions.filter((p) => p.side === 'LONG');
  const shortPositions = positions.filter((p) => p.side === 'SHORT');

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  return (
    <div className="space-y-6">
      {showOpenModal && (
        <OpenPositionModal
          onClose={() => setShowOpenModal(false)}
          onSuccess={() => showSuccess('Position opened successfully')}
        />
      )}
      {closingPosition && (
        <ClosePositionModal
          position={closingPosition}
          onClose={() => setClosingPosition(null)}
          onSuccess={() => showSuccess('Position closed')}
        />
      )}

      {successMsg && (
        <div className="fixed top-4 right-4 z-40 flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg backdrop-blur-sm">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">{successMsg}</span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Paper Portfolio</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Simulated trading · Zero risk · Real analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} disabled={isFetching}
            className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => setShowOpenModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-semibold transition-colors">
            <Plus className="h-4 w-4" />Open Position
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState message="Loading portfolio..." />
      ) : isError ? (
        <ErrorState message="Failed to load portfolio" onRetry={refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-accent-blue" />
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">Portfolio Value</p>
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                ${portfolio ? fmt(portfolio.portfolioValue) : '100,000'}
              </p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Briefcase className="h-4 w-4 text-emerald-400" />
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">Cash Available</p>
              </div>
              <p className="text-2xl font-bold font-mono text-white">
                ${portfolio ? fmt(portfolio.cashBalance) : '100,000'}
              </p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-accent-amber" />
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">Unrealized P&L</p>
              </div>
              <p className={`text-2xl font-bold font-mono ${pnlColor(portfolio?.totalUnrealized ?? 0)}`}>
                {portfolio ? fmtDollar(portfolio.totalUnrealized) : '$0.00'}
              </p>
            </Card>
            <Card className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <BarChart2 className="h-4 w-4 text-violet-400" />
                <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">Realized P&L</p>
              </div>
              <p className={`text-2xl font-bold font-mono ${pnlColor(portfolio?.totalRealizedPnl ?? 0)}`}>
                {portfolio ? fmtDollar(portfolio.totalRealizedPnl) : '$0.00'}
              </p>
            </Card>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Win Rate</p>
              <p className={`text-xl font-bold font-mono ${
                (portfolio?.winRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-red-400'
              }`}>{portfolio ? `${portfolio.winRate.toFixed(0)}%` : '—'}</p>
              <p className="text-xs text-slate-600 font-mono">{portfolio?.wins ?? 0}W / {portfolio?.losses ?? 0}L</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Profit Factor</p>
              <p className={`text-xl font-bold font-mono ${
                (portfolio?.profitFactor ?? 1) >= 1.5 ? 'text-emerald-400' :
                (portfolio?.profitFactor ?? 1) >= 1 ? 'text-amber-400' : 'text-red-400'
              }`}>{portfolio ? portfolio.profitFactor.toFixed(2) : '—'}</p>
              <p className="text-xs text-slate-600 font-mono">Avg W: ${portfolio ? fmt(portfolio.avgWin) : '0'}</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Open Positions</p>
              <p className="text-xl font-bold font-mono text-white">{portfolio?.openCount ?? 0}</p>
              <p className="text-xs text-slate-600 font-mono">{portfolio?.longCount ?? 0}L / {portfolio?.shortCount ?? 0}S</p>
            </Card>
            <Card className="p-3">
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Total Return</p>
              <p className={`text-xl font-bold font-mono ${pnlColor(portfolio?.totalPnl ?? 0)}`}>
                {portfolio ? `${portfolio.totalPnlPct >= 0 ? '+' : ''}${portfolio.totalPnlPct.toFixed(2)}%` : '—'}
              </p>
              <p className="text-xs text-slate-600 font-mono">
                {portfolio ? fmtDollar(portfolio.totalPnl) : '$0.00'}
              </p>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardHeader
                title="Open Positions"
                subtitle={`${positions.length} active trade${positions.length !== 1 ? 's' : ''}`}
                icon={<Briefcase className="h-4 w-4" />}
                action={
                  <div className="flex gap-2">
                    <Badge variant="success" dot>{longPositions.length} Long</Badge>
                    <Badge variant="danger" dot>{shortPositions.length} Short</Badge>
                  </div>
                }
              />
            </div>

            {positions.length === 0 ? (
              <EmptyState
                icon={<Briefcase className="h-8 w-8" />}
                title="No open positions"
                description="Open your first paper trade to start tracking performance"
                action={
                  <button onClick={() => setShowOpenModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 rounded-lg text-sm text-accent-blue transition-colors">
                    <Plus className="h-4 w-4" />Open First Position
                  </button>
                }
              />
            ) : (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
                  <span className="col-span-3">Symbol</span>
                  <span className="col-span-1">Side</span>
                  <span className="col-span-2">Entry / Qty</span>
                  <span className="col-span-2">Current / Chg</span>
                  <span className="col-span-2">Unreal. P&L</span>
                  <span className="col-span-2 text-right">Health</span>
                </div>
                {positions.map((pos) => (
                  <PositionRow
                    key={pos.id}
                    position={pos}
                    onClose={() => setClosingPosition(pos)}
                    onNavigate={() => navigate(`/symbol/${pos.symbol}`)}
                  />
                ))}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Trade History"
              subtitle={`${closed.length} closed trade${closed.length !== 1 ? 's' : ''}`}
              icon={<History className="h-4 w-4" />}
            />

            {closed.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-8 w-8" />}
                title="No trade history"
                description="Closed positions and their performance metrics will appear here"
              />
            ) : (
              <div className="space-y-1.5 mt-4">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
                  <span className="col-span-3">Symbol</span>
                  <span className="col-span-2">Entry → Exit</span>
                  <span className="col-span-2">Realized P&L</span>
                  <span className="col-span-2">Hold</span>
                  <span className="col-span-2">Reason</span>
                  <span className="col-span-1"></span>
                </div>
                {closed.map((pos) => (
                  <ClosedPositionRow key={pos.id} position={pos} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
