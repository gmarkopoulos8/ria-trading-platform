import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Bell, BellOff, CheckCheck, Trash2, RefreshCw, Filter, X,
  AlertTriangle, AlertCircle, Info, Zap, ChevronDown, ChevronUp,
  TrendingUp, TrendingDown, Target, Shield, Clock, Activity,
  ArrowRight, Eye, BarChart2,
} from 'lucide-react';
import { api } from '../api/client';
import { cn } from '../lib/utils';
import { Card, CardHeader } from '../components/ui/Card';

type Severity = 'INFO' | 'CAUTION' | 'WARNING' | 'CRITICAL';
type AlertType =
  | 'ENTRY_ZONE_REACHED' | 'BREAKOUT_CONFIRMED' | 'SUPPORT_LOST'
  | 'MOMENTUM_ACCELERATING' | 'MOMENTUM_FADING' | 'MAJOR_NEWS_DETECTED'
  | 'EVENT_RISK_ELEVATED' | 'INVALIDATION_THREATENED' | 'TARGET_APPROACHED'
  | 'HOLD_WINDOW_NEARLY_EXHAUSTED' | 'SETUP_INVALIDATED'
  | 'THESIS_HEALTH_IMPROVED' | 'THESIS_HEALTH_DETERIORATED';

interface MonitoringAlert {
  id: string;
  userId: string;
  positionId: string | null;
  symbol: string;
  severity: Severity;
  alertType: AlertType;
  title: string;
  message: string;
  isRead: boolean;
  metadata: Record<string, unknown> | null;
  triggeredAt: string;
}

interface PositionData {
  id: string;
  symbol: string;
  name: string;
  side: 'LONG' | 'SHORT';
  quantity: number;
  entryPrice: number;
  currentPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  thesisHealth: number | null;
  recommendedAction: string | null;
  lastMonitoredAt: string | null;
  unrealizedPnl?: number;
  unrealizedPct?: number;
}

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; border: string; icon: React.ElementType; label: string }> = {
  INFO:     { color: 'text-accent-blue', bg: 'bg-accent-blue/10', border: 'border-accent-blue/20', icon: Info, label: 'Info' },
  CAUTION:  { color: 'text-amber-400', bg: 'bg-amber-400/10', border: 'border-amber-400/20', icon: AlertTriangle, label: 'Caution' },
  WARNING:  { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/20', icon: AlertCircle, label: 'Warning' },
  CRITICAL: { color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/20', icon: AlertCircle, label: 'Critical' },
};

const ALERT_TYPE_ICONS: Record<AlertType, React.ElementType> = {
  ENTRY_ZONE_REACHED: Target,
  BREAKOUT_CONFIRMED: TrendingUp,
  SUPPORT_LOST: TrendingDown,
  MOMENTUM_ACCELERATING: Zap,
  MOMENTUM_FADING: Activity,
  MAJOR_NEWS_DETECTED: Bell,
  EVENT_RISK_ELEVATED: Shield,
  INVALIDATION_THREATENED: AlertTriangle,
  TARGET_APPROACHED: Target,
  HOLD_WINDOW_NEARLY_EXHAUSTED: Clock,
  SETUP_INVALIDATED: X,
  THESIS_HEALTH_IMPROVED: TrendingUp,
  THESIS_HEALTH_DETERIORATED: TrendingDown,
};

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  ENTRY_ZONE_REACHED: 'Entry Zone',
  BREAKOUT_CONFIRMED: 'Breakout',
  SUPPORT_LOST: 'Support Lost',
  MOMENTUM_ACCELERATING: 'Momentum ↑',
  MOMENTUM_FADING: 'Momentum ↓',
  MAJOR_NEWS_DETECTED: 'Major News',
  EVENT_RISK_ELEVATED: 'Event Risk',
  INVALIDATION_THREATENED: 'Invalidation',
  TARGET_APPROACHED: 'Target',
  HOLD_WINDOW_NEARLY_EXHAUSTED: 'Hold Window',
  SETUP_INVALIDATED: 'Invalidated',
  THESIS_HEALTH_IMPROVED: 'Health ↑',
  THESIS_HEALTH_DETERIORATED: 'Health ↓',
};

const ACTION_CONFIG: Record<string, { color: string; label: string }> = {
  HOLD:                 { color: 'text-emerald-400', label: 'Hold' },
  HOLD_WITH_CAUTION:    { color: 'text-amber-400',   label: 'Hold w/ Caution' },
  TRIM_INTO_STRENGTH:   { color: 'text-sky-400',     label: 'Trim Strength' },
  TIGHTEN_INVALIDATION: { color: 'text-orange-400',  label: 'Tighten Stop' },
  TAKE_PARTIAL_PROFITS: { color: 'text-emerald-300', label: 'Take Profits' },
  CLOSE_POSITION:       { color: 'text-red-400',     label: 'Close Position' },
  SETUP_INVALIDATED:    { color: 'text-red-500',     label: 'Setup Invalidated' },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (days > 0) return `${days}d ago`;
  if (hrs > 0) return `${hrs}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

function formatPrice(p: number): string {
  return p >= 1000
    ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function AlertCard({ alert, onMarkRead, onDelete, onNavigate }: {
  alert: MonitoringAlert;
  onMarkRead: (id: string) => void;
  onDelete: (id: string) => void;
  onNavigate: (symbol: string, positionId?: string | null) => void;
}) {
  const sev = SEVERITY_CONFIG[alert.severity];
  const SevIcon = sev.icon;
  const TypeIcon = ALERT_TYPE_ICONS[alert.alertType] ?? Activity;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border transition-all group',
        sev.bg, sev.border,
        !alert.isRead && 'ring-1 ring-inset ring-white/5',
      )}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', sev.bg, 'border', sev.border)}>
        <SevIcon className={cn('h-4 w-4', sev.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {!alert.isRead && <span className="w-1.5 h-1.5 rounded-full bg-accent-blue flex-shrink-0" />}
          <span className={cn('text-xs font-semibold', sev.color)}>{alert.title}</span>
          <span className="text-[10px] font-mono text-slate-500 border border-surface-border px-1.5 py-0.5 rounded">
            {alert.symbol}
          </span>
          <span className="text-[10px] font-mono text-slate-600 border border-surface-border/50 px-1.5 py-0.5 rounded flex items-center gap-1">
            <TypeIcon className="h-2.5 w-2.5" />
            {ALERT_TYPE_LABELS[alert.alertType]}
          </span>
          <span className="text-[10px] text-slate-600 ml-auto">{timeAgo(alert.triggeredAt)}</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">{alert.message}</p>

        <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {!alert.isRead && (
            <button
              onClick={() => onMarkRead(alert.id)}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-white transition-colors"
            >
              <Eye className="h-3 w-3" />Mark read
            </button>
          )}
          <button
            onClick={() => onNavigate(alert.symbol, alert.positionId)}
            className="flex items-center gap-1 text-[10px] text-accent-blue hover:text-accent-blue/80 transition-colors"
          >
            <ArrowRight className="h-3 w-3" />View symbol
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="flex items-center gap-1 text-[10px] text-slate-600 hover:text-red-400 transition-colors ml-auto"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PositionMonitorCard({ position }: { position: PositionData }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const refreshMutation = useMutation({
    mutationFn: () => api.positions.refresh(position.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-unread-count'] });
    },
  });

  const snapshotsQuery = useQuery({
    queryKey: ['snapshots', position.id],
    queryFn: () => api.positions.snapshots(position.id, 20) as Promise<{
      success: boolean;
      data: { snapshots: Array<{ snapshotAt: string; thesisHealth: number; unrealizedPnlPct: number }> };
    }>,
    enabled: expanded,
    staleTime: 60_000,
  });

  const health = position.thesisHealth ?? 0;
  const action = position.recommendedAction ?? 'HOLD';
  const actionConfig = ACTION_CONFIG[action] ?? ACTION_CONFIG['HOLD'];
  const pnl = position.unrealizedPnl ?? 0;
  const pnlPct = position.unrealizedPct ?? 0;
  const isLong = position.side === 'LONG';
  const snapshots = snapshotsQuery.data?.data?.snapshots ?? [];

  const healthColor = health >= 65 ? 'text-emerald-400' : health >= 40 ? 'text-amber-400' : 'text-red-400';
  const healthBg = health >= 65 ? 'bg-emerald-400' : health >= 40 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="rounded-xl border border-surface-border bg-surface-2 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold font-mono border',
          isLong ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' : 'bg-red-500/15 border-red-500/25 text-red-400',
        )}>
          {position.symbol.slice(0, 2)}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white font-mono">{position.symbol}</span>
            <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded border',
              isLong ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400',
            )}>{position.side}</span>
            <span className={cn('text-xs font-mono font-semibold', actionConfig.color)}>{actionConfig.label}</span>
            <span className={cn('text-xs font-mono font-semibold ml-auto', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {pnl >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1 rounded-full bg-surface-3 overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', healthBg)} style={{ width: `${Math.max(health, 2)}%` }} />
            </div>
            <span className={cn('text-[10px] font-mono', healthColor)}>{health.toFixed(0)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50"
            title="Refresh position"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshMutation.isPending && 'animate-spin')} />
          </button>
          <button
            onClick={() => navigate(`/symbol/${position.symbol}`)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-accent-blue hover:bg-surface-3 transition-colors"
          >
            <BarChart2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-border p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
            <div className="p-2 rounded bg-surface-3 border border-surface-border">
              <p className="text-slate-600 mb-0.5">Entry</p>
              <p className="text-white font-semibold">{formatPrice(position.entryPrice)}</p>
            </div>
            <div className="p-2 rounded bg-surface-3 border border-surface-border">
              <p className="text-slate-600 mb-0.5">Current</p>
              <p className="text-white font-semibold">{position.currentPrice ? formatPrice(position.currentPrice) : '—'}</p>
            </div>
            <div className="p-2 rounded bg-surface-3 border border-surface-border">
              <p className="text-slate-600 mb-0.5">Qty</p>
              <p className="text-white font-semibold">{position.quantity}</p>
            </div>
            {position.targetPrice && (
              <div className="p-2 rounded bg-emerald-400/5 border border-emerald-400/10">
                <p className="text-slate-600 mb-0.5">Target</p>
                <p className="text-emerald-400 font-semibold">{formatPrice(position.targetPrice)}</p>
              </div>
            )}
            {position.stopLoss && (
              <div className="p-2 rounded bg-red-400/5 border border-red-400/10">
                <p className="text-slate-600 mb-0.5">Stop</p>
                <p className="text-red-400 font-semibold">{formatPrice(position.stopLoss)}</p>
              </div>
            )}
            {position.lastMonitoredAt && (
              <div className="p-2 rounded bg-surface-3 border border-surface-border">
                <p className="text-slate-600 mb-0.5">Monitored</p>
                <p className="text-slate-400 font-semibold">{timeAgo(position.lastMonitoredAt)}</p>
              </div>
            )}
          </div>

          {snapshots.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2">Thesis Health Over Time</p>
              <div className="flex items-end gap-0.5 h-12">
                {snapshots.slice(-30).map((s, i) => {
                  const h = s.thesisHealth;
                  const barColor = h >= 65 ? 'bg-emerald-400' : h >= 40 ? 'bg-amber-400' : 'bg-red-400';
                  return (
                    <div
                      key={i}
                      className="relative group flex-1 flex items-end"
                      title={`${new Date(s.snapshotAt).toLocaleString()}: ${h.toFixed(0)}`}
                    >
                      <div
                        className={cn('w-full rounded-sm transition-all', barColor)}
                        style={{ height: `${Math.max(h, 4)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {snapshots.length === 0 && !snapshotsQuery.isLoading && (
            <p className="text-[10px] text-slate-600 font-mono">No monitoring history yet. Refresh to generate a snapshot.</p>
          )}
          {snapshotsQuery.isLoading && (
            <p className="text-[10px] text-slate-600 font-mono animate-pulse">Loading history...</p>
          )}
        </div>
      )}
    </div>
  );
}

const SEVERITY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Severities' },
  { value: 'INFO', label: 'Info' },
  { value: 'CAUTION', label: 'Caution' },
  { value: 'WARNING', label: 'Warning' },
  { value: 'CRITICAL', label: 'Critical' },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'SETUP_INVALIDATED', label: 'Setup Invalidated' },
  { value: 'INVALIDATION_THREATENED', label: 'Invalidation Threatened' },
  { value: 'TARGET_APPROACHED', label: 'Target Approached' },
  { value: 'MOMENTUM_ACCELERATING', label: 'Momentum Accelerating' },
  { value: 'MOMENTUM_FADING', label: 'Momentum Fading' },
  { value: 'MAJOR_NEWS_DETECTED', label: 'Major News' },
  { value: 'EVENT_RISK_ELEVATED', label: 'Event Risk' },
  { value: 'HOLD_WINDOW_NEARLY_EXHAUSTED', label: 'Hold Window' },
  { value: 'THESIS_HEALTH_DETERIORATED', label: 'Health Deteriorated' },
  { value: 'THESIS_HEALTH_IMPROVED', label: 'Health Improved' },
  { value: 'ENTRY_ZONE_REACHED', label: 'Entry Zone' },
];

export default function AlertCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [filterSymbol, setFilterSymbol] = useState('');
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const params: Record<string, unknown> = {};
  if (filterSymbol.trim()) params.symbol = filterSymbol.trim().toUpperCase();
  if (filterSeverity) params.severity = filterSeverity;
  if (filterType) params.alertType = filterType;
  if (filterUnread) params.unread = 'true';

  const alertsQuery = useQuery({
    queryKey: ['alerts', params],
    queryFn: () => api.alerts.list(params) as Promise<{
      success: boolean;
      data: { alerts: MonitoringAlert[]; total: number; unreadCount: number };
    }>,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const portfolioQuery = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.positions.list() as Promise<{
      success: boolean;
      data: { positions: PositionData[]; summary: { unrealizedPnl: number; unrealizedPct: number } };
    }>,
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.alerts.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-unread-count'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.alerts.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['alerts'] });
      qc.invalidateQueries({ queryKey: ['alert-unread-count'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.alerts.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const alerts = alertsQuery.data?.data?.alerts ?? [];
  const unreadCount = alertsQuery.data?.data?.unreadCount ?? 0;
  const positions = portfolioQuery.data?.data?.positions ?? [];

  const hasFilters = !!(filterSymbol || filterSeverity || filterType || filterUnread);

  const handleNavigate = (symbol: string, _positionId?: string | null) => {
    navigate(`/symbol/${symbol}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-6 pb-4 border-b border-surface-border">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-accent-blue/15 border border-accent-blue/25 flex items-center justify-center flex-shrink-0">
            <Bell className="h-4.5 w-4.5 text-accent-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">Alert Center</h1>
            <p className="text-xs text-slate-500">
              {unreadCount > 0 ? `${unreadCount} unread alert${unreadCount !== 1 ? 's' : ''}` : 'No unread alerts'}
              {' · Monitoring refreshes every 5 minutes'}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white bg-surface-3 border border-surface-border hover:border-slate-600 transition-all disabled:opacity-50"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              onClick={() => { setShowFilters((v) => !v); }}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border transition-all',
                hasFilters
                  ? 'text-accent-blue border-accent-blue/30 bg-accent-blue/10'
                  : 'text-slate-400 hover:text-white bg-surface-3 border-surface-border hover:border-slate-600',
              )}
            >
              <Filter className="h-3.5 w-3.5" />
              Filters{hasFilters ? ` (${[filterSymbol, filterSeverity, filterType, filterUnread].filter(Boolean).length})` : ''}
            </button>
            <button
              onClick={() => alertsQuery.refetch()}
              disabled={alertsQuery.isFetching}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 border border-surface-border transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', alertsQuery.isFetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-surface-border">
            <input
              type="text"
              placeholder="Symbol..."
              value={filterSymbol}
              onChange={(e) => setFilterSymbol(e.target.value.toUpperCase())}
              className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-surface-border text-xs text-white font-mono placeholder-slate-600 outline-none focus:border-accent-blue/50 w-24"
            />
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50"
            >
              {SEVERITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50"
            >
              {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={filterUnread}
                onChange={(e) => setFilterUnread(e.target.checked)}
                className="rounded"
              />
              Unread only
            </label>
            {hasFilters && (
              <button
                onClick={() => { setFilterSymbol(''); setFilterSeverity(''); setFilterType(''); setFilterUnread(false); }}
                className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-400 transition-colors"
              >
                <X className="h-3.5 w-3.5" />Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-0 h-full divide-x divide-surface-border">
          <div className="xl:col-span-2 overflow-y-auto p-6 space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Bell className="h-4 w-4 text-slate-500" />
                <h2 className="text-sm font-semibold text-slate-300">
                  {hasFilters ? 'Filtered Alerts' : 'All Alerts'}
                </h2>
                <span className="text-xs text-slate-600 font-mono ml-auto">{alerts.length} shown</span>
              </div>

              {alertsQuery.isLoading && (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-20 rounded-xl bg-surface-2 border border-surface-border animate-pulse" />
                  ))}
                </div>
              )}

              {!alertsQuery.isLoading && alerts.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <BellOff className="h-12 w-12 text-slate-700 mb-4" />
                  <p className="text-sm font-semibold text-slate-500">No alerts</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {hasFilters
                      ? 'No alerts match your current filters.'
                      : 'Open paper positions and the monitoring engine will generate alerts as conditions trigger.'}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                {alerts.map((alert) => (
                  <AlertCard
                    key={alert.id}
                    alert={alert}
                    onMarkRead={(id) => markReadMutation.mutate(id)}
                    onDelete={(id) => deleteMutation.mutate(id)}
                    onNavigate={handleNavigate}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-y-auto p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-300">Position Monitor</h2>
              <span className="text-xs text-slate-600 font-mono ml-auto">{positions.length} open</span>
            </div>

            {portfolioQuery.isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-16 rounded-xl bg-surface-2 border border-surface-border animate-pulse" />
                ))}
              </div>
            )}

            {!portfolioQuery.isLoading && positions.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Activity className="h-10 w-10 text-slate-700 mb-3" />
                <p className="text-sm font-semibold text-slate-500">No open positions</p>
                <p className="text-xs text-slate-600 mt-1">Open a paper trade to begin monitoring.</p>
                <button
                  onClick={() => navigate('/portfolio')}
                  className="mt-3 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors"
                >
                  Go to Portfolio →
                </button>
              </div>
            )}

            <div className="space-y-2">
              {positions.map((pos) => (
                <PositionMonitorCard key={pos.id} position={pos} />
              ))}
            </div>

            {positions.length > 0 && (
              <div className="pt-3 border-t border-surface-border">
                <p className="text-[10px] text-slate-600 font-mono leading-relaxed">
                  Positions are automatically refreshed every 5 minutes. Click the refresh icon to manually update any position.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
