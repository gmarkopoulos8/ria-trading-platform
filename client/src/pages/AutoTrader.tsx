import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bot, Power, PowerOff, ShieldCheck, ShieldAlert, ShieldX, Zap, RefreshCw,
  PlayCircle, Settings2, TrendingUp, DollarSign, Activity, AlertTriangle,
  CheckCircle2, XCircle, Clock, ChevronDown, ChevronUp, Info, ExternalLink,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';

function fmt(n: number, dec = 2): string {
  return isNaN(n) ? '—' : n.toFixed(dec);
}
function fmtDollar(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function relTime(s: string): string {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

interface CheckResult { name: string; passed: boolean; detail?: string }
interface CircuitBreakerState { allowed: boolean; reason?: string; checks: CheckResult[] }

interface AutoTradeConfig {
  exchange: 'TOS' | 'HYPERLIQUID' | 'PAPER';
  maxPositionPct: number;
  dailyLossLimit: number;
  maxDrawdownPct: number;
  maxOpenPositions: number;
  minConvictionScore: number;
  minConfidenceScore: number;
  allowedBiases: string[];
  stopLossPct: number;
  takeProfitPct: number;
  dryRun: boolean;
}

interface ExchangeBalance { exchange: string; equity: number; cash: number; unrealizedPnl: number; available: boolean }
interface PortfolioState { totalEquity: number; balances: ExchangeBalance[]; openPositionCount: number; dailyPnl: number; fetchedAt: string }

interface StatusData {
  enabled: boolean;
  config: AutoTradeConfig;
  portfolioState: PortfolioState;
  todayTradeCount: number;
  todayPnl: number;
  activePositionCount: number;
  circuitBreaker: CircuitBreakerState;
}

interface AutoTradeSignal {
  symbol: string;
  assetClass: string;
  bias: string;
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  setupType?: string;
  reason?: string;
}

interface AutoTradeLogEntry {
  id: string;
  phase: string;
  exchange: string;
  symbol: string;
  action: string;
  status: string;
  dryRun: boolean;
  quantity?: number;
  entryPrice?: number;
  exitPrice?: number;
  pnl?: number;
  reason?: string;
  positionSizePct?: number;
  convictionScore?: number;
  circuitBreakerTripped: boolean;
  circuitBreakerReason?: string;
  executedAt: string;
}

function CircuitBreakerPanel({ cb }: { cb: CircuitBreakerState }) {
  const [expanded, setExpanded] = useState(false);
  const allGood = cb.allowed;

  return (
    <div className={cn(
      'rounded-xl border p-4 transition-all',
      allGood ? 'border-accent-green/30 bg-accent-green/5' : 'border-red-500/30 bg-red-500/5',
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allGood ? (
            <ShieldCheck className="h-5 w-5 text-accent-green" />
          ) : (
            <ShieldX className="h-5 w-5 text-red-400" />
          )}
          <div>
            <p className="text-sm font-semibold text-white">
              {allGood ? 'All Circuit Breakers Clear' : 'Circuit Breaker Tripped'}
            </p>
            {!allGood && cb.reason && (
              <p className="text-xs text-red-400 mt-0.5">{cb.reason}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-slate-500 hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {cb.checks.map((check) => (
            <div key={check.name} className="flex items-center gap-2 text-xs">
              {check.passed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-accent-green flex-shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />
              )}
              <span className={check.passed ? 'text-slate-400' : 'text-red-300'}>{check.name}</span>
              {!check.passed && check.detail && (
                <span className="text-red-500 ml-1">— {check.detail}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal }: { signal: AutoTradeSignal }) {
  const biasColor = signal.bias === 'BULLISH' ? 'text-accent-green' : signal.bias === 'BEARISH' ? 'text-red-400' : 'text-slate-400';
  const conviction = signal.convictionScore;
  const barColor = conviction >= 80 ? 'bg-accent-green' : conviction >= 65 ? 'bg-accent-blue' : 'bg-accent-amber';

  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-bold text-white font-mono">{signal.symbol}</p>
          <p className="text-xs text-slate-500">{signal.assetClass}</p>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={cn('text-xs font-semibold uppercase tracking-wide', biasColor)}>{signal.bias}</span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-surface-border rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full', barColor)} style={{ width: `${conviction}%` }} />
          </div>
          <span className="text-xs font-mono text-white">{fmt(conviction, 0)}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-slate-300">{fmt(signal.confidenceScore, 0)}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs text-slate-400">{signal.setupType ?? '—'}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-mono text-slate-400">
          {signal.entryPrice ? `$${signal.entryPrice.toFixed(2)}` : '—'}
        </span>
      </td>
    </tr>
  );
}

function LogRow({ log }: { log: AutoTradeLogEntry }) {
  const statusColor: Record<string, string> = {
    FILLED: 'text-accent-green bg-accent-green/10',
    DRY_RUN: 'text-accent-blue bg-accent-blue/10',
    PENDING: 'text-accent-amber bg-accent-amber/10',
    BLOCKED: 'text-red-400 bg-red-500/10',
    REJECTED: 'text-slate-400 bg-surface-3',
    ERROR: 'text-red-400 bg-red-500/10',
    CLOSED: 'text-slate-400 bg-surface-3',
  };

  const pnl = log.pnl;
  const pnlColor = pnl === undefined ? '' : pnl >= 0 ? 'text-accent-green' : 'text-red-400';

  return (
    <tr className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors text-xs">
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-bold text-white">{log.symbol}</span>
          {log.dryRun && (
            <span className="text-[10px] bg-slate-700 text-slate-400 px-1 rounded">DRY</span>
          )}
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className={cn('px-2 py-0.5 rounded-full font-mono text-[10px] font-semibold uppercase', statusColor[log.status] ?? 'text-slate-400')}>
          {log.status}
        </span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-slate-400 capitalize">{log.phase.toLowerCase()}</span>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-slate-400">{log.exchange}</span>
      </td>
      <td className="px-4 py-2.5 font-mono">
        {log.entryPrice ? `$${log.entryPrice.toFixed(2)}` : '—'}
      </td>
      <td className="px-4 py-2.5 font-mono">
        {log.quantity ? log.quantity.toFixed(4) : '—'}
      </td>
      <td className={cn('px-4 py-2.5 font-mono font-semibold', pnlColor)}>
        {pnl !== undefined ? fmtDollar(pnl) : '—'}
      </td>
      <td className="px-4 py-2.5 text-slate-500 max-w-[200px] truncate">
        {log.reason ?? log.circuitBreakerReason ?? '—'}
      </td>
      <td className="px-4 py-2.5 text-slate-600">{relTime(log.executedAt)}</td>
    </tr>
  );
}

function ConfigEditor({ config, onSave, saving }: {
  config: AutoTradeConfig;
  onSave: (c: AutoTradeConfig) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<AutoTradeConfig>({ ...config });

  function field<K extends keyof AutoTradeConfig>(key: K, val: AutoTradeConfig[K]) {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Exchange</label>
          <select
            value={local.exchange}
            onChange={(e) => field('exchange', e.target.value as AutoTradeConfig['exchange'])}
            className="mt-1 w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="PAPER">Paper (Simulated)</option>
            <option value="TOS">Thinkorswim (Schwab)</option>
            <option value="HYPERLIQUID">Hyperliquid</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Dry Run</label>
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => field('dryRun', true)}
              className={cn('px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                local.dryRun ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/40' : 'bg-surface-2 text-slate-400 border border-surface-border')}
            >
              Simulation
            </button>
            <button
              onClick={() => field('dryRun', false)}
              className={cn('px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                !local.dryRun ? 'bg-red-500/20 text-red-400 border border-red-500/40' : 'bg-surface-2 text-slate-400 border border-surface-border')}
            >
              Live Orders
            </button>
          </div>
          {!local.dryRun && (
            <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Real orders will be placed
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Max Position Size</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range" min="0.5" max="10" step="0.5"
              value={local.maxPositionPct}
              onChange={(e) => field('maxPositionPct', parseFloat(e.target.value))}
              className="flex-1 accent-accent-blue"
            />
            <span className="text-sm font-mono text-white w-12 text-right">{local.maxPositionPct}%</span>
          </div>
          <p className="text-xs text-slate-600 mt-0.5">Max 10% of equity per trade</p>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Max Open Positions</label>
          <input
            type="number" min="1" max="20"
            value={local.maxOpenPositions}
            onChange={(e) => field('maxOpenPositions', parseInt(e.target.value, 10))}
            className="mt-1 w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Min Conviction Score</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range" min="50" max="95" step="5"
              value={local.minConvictionScore}
              onChange={(e) => field('minConvictionScore', parseFloat(e.target.value))}
              className="flex-1 accent-accent-blue"
            />
            <span className="text-sm font-mono text-white w-8 text-right">{local.minConvictionScore}</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Min Confidence Score</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range" min="50" max="95" step="5"
              value={local.minConfidenceScore}
              onChange={(e) => field('minConfidenceScore', parseFloat(e.target.value))}
              className="flex-1 accent-accent-blue"
            />
            <span className="text-sm font-mono text-white w-8 text-right">{local.minConfidenceScore}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Stop Loss %</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range" min="1" max="10" step="0.5"
              value={local.stopLossPct}
              onChange={(e) => field('stopLossPct', parseFloat(e.target.value))}
              className="flex-1 accent-red-500"
            />
            <span className="text-sm font-mono text-white w-12 text-right">{local.stopLossPct}%</span>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Take Profit %</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range" min="2" max="20" step="0.5"
              value={local.takeProfitPct}
              onChange={(e) => field('takeProfitPct', parseFloat(e.target.value))}
              className="flex-1 accent-accent-green"
            />
            <span className="text-sm font-mono text-white w-12 text-right">{local.takeProfitPct}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Daily Loss Limit ($)</label>
          <input
            type="number" min="100" step="100"
            value={local.dailyLossLimit}
            onChange={(e) => field('dailyLossLimit', parseFloat(e.target.value))}
            className="mt-1 w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
        <div>
          <label className="text-xs text-slate-500 uppercase tracking-wider">Max Drawdown %</label>
          <input
            type="number" min="1" max="30" step="1"
            value={local.maxDrawdownPct}
            onChange={(e) => field('maxDrawdownPct', parseFloat(e.target.value))}
            className="mt-1 w-full bg-surface-2 border border-surface-border rounded-lg px-3 py-2 text-sm text-white"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-slate-500 uppercase tracking-wider mb-2 block">Allowed Biases</label>
        <div className="flex gap-2">
          {['BULLISH', 'BEARISH', 'NEUTRAL'].map((bias) => {
            const active = local.allowedBiases.includes(bias);
            const color = bias === 'BULLISH' ? 'accent-green' : bias === 'BEARISH' ? 'red-400' : 'slate-400';
            return (
              <button
                key={bias}
                onClick={() => {
                  const next = active
                    ? local.allowedBiases.filter((b) => b !== bias)
                    : [...local.allowedBiases, bias];
                  field('allowedBiases', next);
                }}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wide border transition-colors',
                  active
                    ? `border-${color}/50 bg-${color}/10 text-${color}`
                    : 'border-surface-border bg-surface-2 text-slate-500',
                )}
              >
                {bias}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={() => onSave(local)}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-accent-blue/20 border border-accent-blue/40 text-accent-blue rounded-lg text-sm font-semibold hover:bg-accent-blue/30 transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Settings2 className="h-4 w-4" />}
          Save Configuration
        </button>
      </div>
    </div>
  );
}

// ─── Exchange Status Section ──────────────────────────────────────

function ExchangeStatusCard({ exchange, label, configPath }: { exchange: 'hyperliquid' | 'tos'; label: string; configPath: string }) {
  const qc = useQueryClient();

  const { data: configData } = useQuery({
    queryKey: [`${exchange}-auto-config-card`],
    queryFn: () => api.autotrader.exchangeConfig.get(exchange),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const { data: sessionData } = useQuery({
    queryKey: [`${exchange}-session-status-card`],
    queryFn: () => api.autotrader.exchangeConfig.sessionStatus(exchange),
    refetchInterval: 30_000,
  });

  const toggleMut = useMutation({
    mutationFn: (enable: boolean) => enable
      ? api.autotrader.exchangeConfig.startSession(exchange)
      : api.autotrader.exchangeConfig.pauseSession(exchange, 'Disabled from AutoTrader page'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${exchange}-auto-config-card`] });
      qc.invalidateQueries({ queryKey: [`${exchange}-session-status-card`] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Failed'),
  });

  const cfg: any = (configData as any)?.data ?? null;
  const session: any = (sessionData as any)?.data ?? null;

  const isActive = session?.active && cfg?.enabled;
  const isPaused = cfg?.enabled && !session?.active;
  const dotColor = isActive ? 'bg-accent-green animate-pulse' : isPaused ? 'bg-amber-500' : 'bg-slate-600';
  const statusText = isActive ? 'Active' : isPaused ? `Paused · ${session?.reason?.split(':')[0] ?? ''}` : 'Disabled';
  const isHL = exchange === 'hyperliquid';
  const accentColor = isHL ? 'text-accent-blue' : 'text-accent-green';
  const borderColor = isHL ? 'border-accent-blue/20' : 'border-accent-green/20';

  const todayTrades = 0;
  const maxTrades = cfg?.maxTradesPerDay ?? 5;
  const deployed = 0;
  const hardLimit = cfg?.capitalHardLimitUsd ?? 5000;
  const deployedPct = hardLimit > 0 ? Math.min(100, (deployed / hardLimit) * 100) : 0;

  return (
    <Card className={cn('border', borderColor)}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={cn('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
          <div>
            <p className="text-sm font-bold text-white">{label}</p>
            <p className="text-xs text-slate-500">{statusText}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a href={configPath} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-white border border-surface-border px-2 py-1 rounded transition-colors">
            Configure <ExternalLink className="h-2.5 w-2.5" />
          </a>
          {cfg && (
            <button
              onClick={() => toggleMut.mutate(!cfg.enabled)}
              disabled={toggleMut.isPending}
              className={cn('relative w-9 h-5 rounded-full transition-colors flex-shrink-0', cfg.enabled ? (isHL ? 'bg-accent-blue' : 'bg-accent-green') : 'bg-surface-border')}
            >
              <span className={cn('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', cfg.enabled ? 'left-4' : 'left-0.5')} />
            </button>
          )}
        </div>
      </div>

      {cfg ? (
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-500">Capital deployed</span>
              <span className="font-mono text-white">${deployed.toLocaleString()} / ${hardLimit.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-surface-border rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full transition-all', isHL ? 'bg-accent-blue' : 'bg-accent-green')} style={{ width: `${deployedPct}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-slate-500">Today's trades</p>
              <p className="font-mono text-white">{todayTrades} / {maxTrades}</p>
            </div>
            <div>
              <p className="text-slate-500">Conviction min</p>
              <p className={cn('font-mono font-bold', accentColor)}>{cfg.minConvictionScore}</p>
            </div>
            {isHL && (
              <div>
                <p className="text-slate-500">Default leverage</p>
                <p className="font-mono text-white">{cfg.defaultLeverage}x</p>
              </div>
            )}
            {!isHL && (
              <div>
                <p className="text-slate-500">Order session</p>
                <p className="font-mono text-white">{cfg.orderSession}</p>
              </div>
            )}
            <div>
              <p className="text-slate-500">Max daily loss</p>
              <p className="font-mono text-red-400">${cfg.maxDailyLossUsd?.toLocaleString()}</p>
            </div>
          </div>
          {cfg.sessionStartedAt && (
            <p className="text-[10px] text-slate-600">Session started: {new Date(cfg.sessionStartedAt).toLocaleString()}</p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4 text-xs text-slate-600">Loading config…</div>
      )}
    </Card>
  );
}

function ExchangeStatusSection() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-bold text-slate-300">Exchange Status</h3>
        <span className="text-xs text-slate-600">Per-exchange autonomous trading sessions</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ExchangeStatusCard exchange="hyperliquid" label="Hyperliquid" configPath="/hyperliquid" />
        <ExchangeStatusCard exchange="tos" label="ThinkorSwim" configPath="/tos" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export default function AutoTrader() {
  const qc = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [cycleResults, setCycleResults] = useState<unknown[] | null>(null);

  const { data: statusRaw, isLoading } = useQuery({
    queryKey: ['autotrader-status'],
    queryFn: () => api.autotrader.status(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const status = (statusRaw as { success: boolean; data: StatusData })?.data;

  const { data: signalsRaw, isLoading: signalsLoading } = useQuery({
    queryKey: ['autotrader-signals'],
    queryFn: () => api.autotrader.signalsPreview(),
    staleTime: 60_000,
  });
  const signals: AutoTradeSignal[] = (signalsRaw as { success: boolean; data: { signals: AutoTradeSignal[] } })?.data?.signals ?? [];

  const { data: logsRaw, isLoading: logsLoading } = useQuery({
    queryKey: ['autotrader-logs'],
    queryFn: () => api.autotrader.logs({ limit: 50 }),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
  const logs: AutoTradeLogEntry[] = (logsRaw as { success: boolean; data: { logs: AutoTradeLogEntry[] } })?.data?.logs ?? [];

  const enableMut = useMutation({
    mutationFn: () => api.autotrader.enable(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['autotrader-status'] }); toast.success('Auto-trading enabled'); },
    onError: () => toast.error('Failed to enable auto-trading'),
  });

  const disableMut = useMutation({
    mutationFn: () => api.autotrader.disable(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['autotrader-status'] }); toast.success('Auto-trading disabled'); },
    onError: () => toast.error('Failed to disable auto-trading'),
  });

  const configMut = useMutation({
    mutationFn: (cfg: AutoTradeConfig) => api.autotrader.updateConfig(cfg),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['autotrader-status'] }); toast.success('Configuration saved'); },
    onError: () => toast.error('Failed to save configuration'),
  });

  const cycleMut = useMutation({
    mutationFn: () => api.autotrader.runCycle(),
    onSuccess: (data) => {
      const d = (data as { success: boolean; data: { results: unknown[]; summary: { filled: number; blocked: number; errors: number; dryRun: boolean } } }).data;
      setCycleResults(d.results);
      qc.invalidateQueries({ queryKey: ['autotrader-logs'] });
      qc.invalidateQueries({ queryKey: ['autotrader-status'] });
      const mode = d.summary.dryRun ? ' [DRY RUN]' : '';
      toast.success(`Cycle complete${mode}: ${d.summary.filled} filled, ${d.summary.blocked} blocked`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return <LoadingState message="Loading Auto Trader..." />;

  const enabled = status?.enabled ?? false;
  const config = status?.config;
  const cb = status?.circuitBreaker;
  const portfolio = status?.portfolioState;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            enabled ? 'bg-accent-green/20 border border-accent-green/30' : 'bg-surface-3 border border-surface-border',
          )}>
            <Bot className={cn('h-5 w-5', enabled ? 'text-accent-green' : 'text-slate-500')} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Autonomous Trading Platform</h1>
            <p className="text-xs text-slate-500">AI-driven order execution · circuit-protected · paper-safe</p>
          </div>
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
            enabled ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' : 'bg-surface-3 text-slate-500 border border-surface-border',
          )}>
            <div className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
            {enabled ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 border border-surface-border rounded-lg hover:text-white hover:border-surface-3 transition-colors"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure
          </button>
          {enabled ? (
            <button
              onClick={() => disableMut.mutate()}
              disabled={disableMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              {disableMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />}
              Disable
            </button>
          ) : (
            <button
              onClick={() => enableMut.mutate()}
              disabled={enableMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg text-sm font-semibold hover:bg-accent-green/20 transition-colors disabled:opacity-50"
            >
              {enableMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
              Enable
            </button>
          )}
        </div>
      </div>

      {config && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-2 border border-surface-border text-xs text-slate-400">
          <span className="font-mono font-semibold text-white">{config.exchange}</span>
          <span className="text-surface-border">|</span>
          <span>Max position: <span className="text-white font-mono">{config.maxPositionPct}%</span></span>
          <span className="text-surface-border">|</span>
          <span>Stop: <span className="text-red-400 font-mono">{config.stopLossPct}%</span></span>
          <span className="text-surface-border">|</span>
          <span>TP: <span className="text-accent-green font-mono">{config.takeProfitPct}%</span></span>
          <span className="text-surface-border">|</span>
          <span>Min conviction: <span className="text-white font-mono">{config.minConvictionScore}</span></span>
          <span className="text-surface-border">|</span>
          {config.dryRun ? (
            <span className="text-accent-blue font-semibold">SIMULATION MODE</span>
          ) : (
            <span className="text-red-400 font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> LIVE ORDERS
            </span>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Portfolio Equity"
          value={portfolio ? fmtDollar(portfolio.totalEquity) : '—'}
          icon={<DollarSign className="h-4 w-4" />}
          color="cyan"
        />
        <StatCard
          label="Today's Trades"
          value={status?.todayTradeCount ?? 0}
          icon={<Activity className="h-4 w-4" />}
          color="blue"
        />
        <StatCard
          label="Active Positions"
          value={status?.activePositionCount ?? 0}
          icon={<TrendingUp className="h-4 w-4" />}
          color="purple"
        />
        <StatCard
          label="Today's PnL"
          value={status ? fmtDollar(status.todayPnl) : '—'}
          icon={<Zap className="h-4 w-4" />}
          color={status && status.todayPnl >= 0 ? 'green' : 'red'}
        />
      </div>

      {cb && <CircuitBreakerPanel cb={cb} />}

      <ExchangeStatusSection />

      {showConfig && config && (
        <Card>
          <CardHeader
            title="Trading Configuration"
            subtitle="Adjust risk parameters and execution settings"
            icon={<Settings2 className="h-4 w-4" />}
            action={
              <button onClick={() => setShowConfig(false)} className="text-slate-500 hover:text-white text-xs">
                Close
              </button>
            }
          />
          <ConfigEditor config={config} onSave={(c) => configMut.mutate(c)} saving={configMut.isPending} />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="Qualifying Signals"
            subtitle={`From latest scan · ${signals.length} matching your filters`}
            icon={<Zap className="h-4 w-4" />}
            action={
              <button
                onClick={() => cycleMut.mutate()}
                disabled={cycleMut.isPending || !enabled}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  enabled
                    ? 'bg-accent-blue/20 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/30'
                    : 'bg-surface-3 border border-surface-border text-slate-500 cursor-not-allowed',
                )}
                title={!enabled ? 'Enable auto-trading first' : undefined}
              >
                {cycleMut.isPending ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" />
                )}
                Run Cycle
              </button>
            }
          />

          {signalsLoading ? (
            <div className="text-center py-8 text-slate-500 text-sm">Loading signals...</div>
          ) : signals.length === 0 ? (
            <div className="text-center py-8">
              <Info className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No qualifying signals</p>
              <p className="text-xs text-slate-600 mt-1">Run a Daily Scan to populate signals</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-surface-border">
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Symbol</th>
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Bias</th>
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Conviction</th>
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Confidence</th>
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Setup</th>
                    <th className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">Entry</th>
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s) => <SignalRow key={s.symbol} signal={s} />)}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Portfolio Balances"
            subtitle="Live exchange balances"
            icon={<DollarSign className="h-4 w-4" />}
          />
          <div className="space-y-3">
            {portfolio?.balances.map((b) => (
              <div key={b.exchange} className={cn(
                'flex items-center justify-between p-3 rounded-xl border',
                b.available ? 'border-surface-border bg-surface-2' : 'border-surface-border/50 bg-surface-1 opacity-50',
              )}>
                <div className="flex items-center gap-2">
                  <div className={cn('w-2 h-2 rounded-full', b.available ? 'bg-accent-green' : 'bg-slate-600')} />
                  <span className="text-sm font-semibold text-white">{b.exchange}</span>
                  {!b.available && <span className="text-xs text-slate-500">(not configured)</span>}
                </div>
                {b.available ? (
                  <div className="text-right">
                    <p className="text-sm font-mono font-bold text-white">{fmtDollar(b.equity)}</p>
                    <p className="text-xs text-slate-500 font-mono">
                      Cash: {fmtDollar(b.cash)}
                      {b.unrealizedPnl !== 0 && (
                        <span className={cn('ml-2', b.unrealizedPnl >= 0 ? 'text-accent-green' : 'text-red-400')}>
                          {b.unrealizedPnl >= 0 ? '+' : ''}{fmtDollar(b.unrealizedPnl)}
                        </span>
                      )}
                    </p>
                  </div>
                ) : (
                  <span className="text-xs text-slate-600">—</span>
                )}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {cycleResults && cycleResults.length > 0 && (
        <Card>
          <CardHeader
            title="Last Cycle Results"
            icon={<PlayCircle className="h-4 w-4" />}
            action={
              <button onClick={() => setCycleResults(null)} className="text-xs text-slate-500 hover:text-white">
                Dismiss
              </button>
            }
          />
          <div className="space-y-2">
            {(cycleResults as Array<{ symbol: string; status: string; exchange: string; reason?: string; quantity?: number; entryPrice?: number; dollarAmount?: number }>).map((r, i) => {
              const statusColor: Record<string, string> = {
                FILLED: 'text-accent-green', DRY_RUN: 'text-accent-blue',
                BLOCKED: 'text-red-400', REJECTED: 'text-slate-400', ERROR: 'text-red-400',
              };
              return (
                <div key={i} className="flex items-center justify-between text-sm px-3 py-2 rounded-lg bg-surface-2">
                  <span className="font-mono font-bold text-white">{r.symbol}</span>
                  <span className={cn('font-semibold uppercase text-xs', statusColor[r.status] ?? 'text-slate-400')}>{r.status}</span>
                  <span className="text-slate-400 text-xs">{r.exchange}</span>
                  {r.dollarAmount && <span className="font-mono text-xs text-white">{fmtDollar(r.dollarAmount)}</span>}
                  {r.reason && <span className="text-slate-500 text-xs max-w-[200px] truncate">{r.reason}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Trade Log"
          subtitle="All automated trade activity"
          icon={<Clock className="h-4 w-4" />}
          action={
            <button
              onClick={() => qc.invalidateQueries({ queryKey: ['autotrader-logs'] })}
              className="text-slate-500 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          }
        />
        {logsLoading ? (
          <div className="text-center py-8 text-slate-500 text-sm">Loading logs...</div>
        ) : logs.length === 0 ? (
          <div className="text-center py-8">
            <Activity className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No trade activity yet</p>
            <p className="text-xs text-slate-600 mt-1">Enable auto-trading and run a cycle to see logs</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Symbol', 'Status', 'Phase', 'Exchange', 'Entry', 'Qty', 'PnL', 'Reason', 'Time'].map((h) => (
                    <th key={h} className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => <LogRow key={log.id} log={log} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
