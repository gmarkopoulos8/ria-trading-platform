import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity, TrendingUp, TrendingDown, ShieldAlert, AlertTriangle,
  RefreshCw, CheckCircle2, XCircle, Clock, DollarSign, BarChart3,
  Zap, Power, PowerOff, FlaskConical, Play, PauseCircle, StopCircle,
  AlertOctagon, Eye, EyeOff, ChevronDown, ChevronUp, Layers, Timer,
  Target, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid,
} from 'recharts';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

function fmt(n: number, dec = 2) { return isNaN(n) ? '—' : n.toFixed(dec); }
function fmtD(n: number) {
  if (isNaN(n)) return '—';
  return `${n >= 0 ? '' : '-'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDStr(s: string | null | undefined) { return fmtD(parseFloat(s ?? '0')); }
function relTime(s: string) {
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return 'just now';
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  return `${Math.round(ms / 3_600_000)}h ago`;
}

const CONTROL_LEVEL_COLOR: Record<string, string> = {
  ACTIVE: 'text-emerald-400', PAUSE: 'text-yellow-400', HARD_STOP: 'text-red-400',
};

// ─── Error Boundary ──────────────────────────────────────────────────────────

class AlpacaErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  componentDidCatch(error: Error) {
    console.error('[AlpacaDashboard] Error boundary caught:', error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-6">
          <FlaskConical className="w-10 h-10 text-zinc-600" />
          <div className="text-center">
            <p className="text-white font-semibold mb-1">Alpaca Dashboard Error</p>
            <p className="text-sm text-zinc-400 max-w-sm">{this.state.error || 'Something went wrong loading the Alpaca dashboard.'}</p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: '' })}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm rounded-lg"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Connect Form ────────────────────────────────────────────────────────────

function ConnectPanel({ onConnected }: { onConnected: () => void }) {
  const [apiKeyId, setApiKeyId] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [dryRun, setDryRun] = useState(true);
  const [maxDrawdown, setMaxDrawdown] = useState(8);
  const [showSecret, setShowSecret] = useState(false);
  const qc = useQueryClient();

  const connect = useMutation({
    mutationFn: () => api.credentials.alpacaConnect({ apiKeyId, secretKey, dryRun, maxDrawdownPct: maxDrawdown }),
    onSuccess: () => {
      toast.success('Connected to Alpaca paper trading');
      qc.invalidateQueries({ queryKey: ['alpaca-status'] });
      onConnected();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? e?.message ?? 'Connect failed'),
  });

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card className="p-8">
        <div className="flex items-center gap-3 mb-6">
          <FlaskConical className="w-7 h-7 text-violet-400" />
          <div>
            <h2 className="text-xl font-bold text-white">Alpaca Paper Trading</h2>
            <p className="text-sm text-zinc-400">Connect your Alpaca paper account to begin</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">API Key ID</label>
            <input
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
              placeholder="PK..."
              value={apiKeyId}
              onChange={e => setApiKeyId(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1">Secret Key</label>
            <div className="relative">
              <input
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 pr-10"
                type={showSecret ? 'text' : 'password'}
                placeholder="Secret..."
                value={secretKey}
                onChange={e => setSecretKey(e.target.value)}
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
                onClick={() => setShowSecret(s => !s)}
                type="button"
              >
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-zinc-400 mb-1">Max Drawdown %</label>
              <input
                type="number" min={1} max={50}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500"
                value={maxDrawdown}
                onChange={e => setMaxDrawdown(Number(e.target.value))}
              />
            </div>
            <div className="flex-1 flex flex-col justify-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="accent-violet-500" />
                <span className="text-sm text-zinc-300">Dry Run Mode</span>
              </label>
            </div>
          </div>
          {dryRun && (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-lg p-3 text-xs text-violet-300">
              Dry run: orders logged to DB but NOT sent to Alpaca paper API. Safe for testing.
            </div>
          )}
          <button
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            onClick={() => connect.mutate()}
            disabled={!apiKeyId || !secretKey || connect.isPending}
          >
            {connect.isPending ? 'Connecting…' : 'Connect to Alpaca Paper'}
          </button>
        </div>
      </Card>
    </div>
  );
}

// ─── Control Panel ───────────────────────────────────────────────────────────

function ControlPanel({ controlLevel }: { controlLevel: string }) {
  const qc = useQueryClient();
  const [confirmExit, setConfirmExit] = useState(false);

  const pause = useMutation({
    mutationFn: () => api.alpaca.pause('Manual pause'),
    onSuccess: () => { toast.success('Trading paused'); qc.invalidateQueries({ queryKey: ['alpaca-status'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Pause failed'),
  });
  const hardStop = useMutation({
    mutationFn: () => api.alpaca.hardStop('Manual hard stop'),
    onSuccess: () => { toast.warning('Hard stop activated — all orders cancelled'); qc.invalidateQueries({ queryKey: ['alpaca-status'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Hard stop failed'),
  });
  const emergency = useMutation({
    mutationFn: () => api.alpaca.emergencyExit('Emergency exit', 'CONFIRM'),
    onSuccess: () => { toast.error('Emergency exit: all positions closed'); qc.invalidateQueries({ queryKey: ['alpaca-status'] }); setConfirmExit(false); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Emergency exit failed'),
  });
  const resume = useMutation({
    mutationFn: () => api.alpaca.resume(),
    onSuccess: () => { toast.success('Trading resumed'); qc.invalidateQueries({ queryKey: ['alpaca-status'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Resume failed'),
  });

  const isActive = controlLevel === 'ACTIVE';

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldAlert className="w-4 h-4 text-zinc-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Trading Controls</h3>
        <span className={cn('ml-auto text-xs font-bold', CONTROL_LEVEL_COLOR[controlLevel] ?? 'text-zinc-400')}>
          {controlLevel}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => pause.mutate()}
          disabled={!isActive || pause.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-600/40 text-yellow-300 text-xs rounded-lg disabled:opacity-40 transition-colors"
        >
          <PauseCircle className="w-3.5 h-3.5" /> Pause
        </button>
        <button
          onClick={() => hardStop.mutate()}
          disabled={controlLevel === 'HARD_STOP' || hardStop.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-600/20 hover:bg-orange-600/30 border border-orange-600/40 text-orange-300 text-xs rounded-lg disabled:opacity-40 transition-colors"
        >
          <StopCircle className="w-3.5 h-3.5" /> Hard Stop
        </button>
        <button
          onClick={() => setConfirmExit(true)}
          disabled={controlLevel === 'HARD_STOP' || emergency.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 text-red-300 text-xs rounded-lg disabled:opacity-40 transition-colors"
        >
          <AlertOctagon className="w-3.5 h-3.5" /> Emergency Exit
        </button>
        {!isActive && (
          <button
            onClick={() => resume.mutate()}
            disabled={resume.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 text-emerald-300 text-xs rounded-lg disabled:opacity-40 transition-colors"
          >
            <Play className="w-3.5 h-3.5" /> Resume
          </button>
        )}
      </div>

      {confirmExit && (
        <div className="mt-3 p-3 bg-red-900/30 border border-red-600/50 rounded-lg">
          <p className="text-xs text-red-300 mb-2">This will close ALL positions immediately. Confirm?</p>
          <div className="flex gap-2">
            <button
              onClick={() => emergency.mutate()}
              disabled={emergency.isPending}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg"
            >
              {emergency.isPending ? 'Executing…' : 'Confirm Emergency Exit'}
            </button>
            <button onClick={() => setConfirmExit(false)} className="px-3 py-1.5 bg-zinc-700 text-zinc-300 text-xs rounded-lg">
              Cancel
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Test Suite Card ──────────────────────────────────────────────────────────

function TestSuiteCard() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);

  const { data: lastResult } = useQuery({
    queryKey: ['alpaca-test-last'],
    queryFn: () => api.alpaca.lastTestResult().then((r: any) => r.data),
    refetchInterval: 0,
  });

  const run = useMutation({
    mutationFn: () => api.alpaca.runTestSuite(),
    onSuccess: () => { toast.success('Test suite complete'); qc.invalidateQueries({ queryKey: ['alpaca-test-last'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Test suite failed'),
  });

  const result = (run.data as any)?.data ?? lastResult;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <FlaskConical className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Test Suite</h3>
        {result && (
          <div className="ml-auto flex gap-3 text-xs">
            <span className="text-emerald-400">{result.passed} passed</span>
            {result.failed > 0 && <span className="text-red-400">{result.failed} failed</span>}
            {result.skipped > 0 && <span className="text-zinc-500">{result.skipped} skipped</span>}
          </div>
        )}
        <button
          onClick={() => run.mutate()}
          disabled={run.isPending}
          className="ml-2 flex items-center gap-1 px-2.5 py-1 bg-violet-600 hover:bg-violet-700 text-white text-xs rounded-lg disabled:opacity-50"
        >
          {run.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {run.isPending ? 'Running…' : 'Run'}
        </button>
        {result && (
          <button onClick={() => setExpanded(e => !e)} className="text-zinc-500 hover:text-zinc-300">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {result && expanded && (
        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {result.tests.map((t: any, i: number) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-zinc-800/50 rounded-lg">
              {t.status === 'passed'  && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" />}
              {t.status === 'failed'  && <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
              {t.status === 'skipped' && <Minus className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />}
              {t.status === 'running' && <RefreshCw className="w-3.5 h-3.5 text-yellow-400 animate-spin mt-0.5 shrink-0" />}
              {t.status === 'pending' && <Clock className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />}
              <div className="min-w-0">
                <div className="text-xs font-medium text-zinc-200">{t.name}</div>
                {t.error && <div className="text-xs text-red-400 truncate">{t.error}</div>}
                {t.durationMs != null && <div className="text-xs text-zinc-500">{t.durationMs}ms</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Phase 11: Options Recommendations Panel ────────────────────────────────

const OPTIONS_DEMO_SYMBOLS = ['AAPL', 'MSFT', 'SPY', 'QQQ', 'NVDA'];

function OptionsRecommendationsPanel() {
  const [sym, setSym] = useState('AAPL');

  const { data: recData, isLoading: recLoading, refetch: refetchRec } = useQuery({
    queryKey: ['alpaca-options-rec', sym],
    queryFn: async () => {
      const r = await (api as any).options.recommendation(sym) as { success: boolean; data?: any };
      return r.data ?? null;
    },
    staleTime: 15 * 60_000,
    enabled: !!sym,
  });
  const { data: ivData, isLoading: ivLoading } = useQuery({
    queryKey: ['alpaca-options-iv', sym],
    queryFn: async () => {
      const r = await (api as any).options.ivRank(sym) as { success: boolean; data?: any };
      return r.data ?? null;
    },
    staleTime: 15 * 60_000,
    enabled: !!sym,
  });

  const rec = recData;
  const iv = ivData;
  const loading = recLoading || ivLoading;

  const strategyColor = (s: string) => {
    if (s === 'LONG_CALL') return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30';
    if (s === 'LONG_PUT') return 'text-red-400 bg-red-400/10 border-red-400/30';
    if (s === 'BULL_CALL_SPREAD') return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
    if (s === 'BEAR_PUT_SPREAD') return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
    if (s === 'CASH_SECURED_PUT') return 'text-violet-400 bg-violet-400/10 border-violet-400/30';
    if (s === 'COVERED_CALL') return 'text-zinc-300 bg-zinc-400/10 border-zinc-400/30';
    return 'text-zinc-500 bg-zinc-700/30 border-zinc-600/30';
  };

  return (
    <Card className="p-4">
      <CardHeader
        title="Options Recommendations"
        subtitle="Phase 11 — paper options testing"
        icon={<Zap className="w-4 h-4 text-blue-400" />}
        action={
          <button onClick={() => refetchRec()}
            className="flex items-center gap-1 px-2 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-xs rounded-lg">
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        }
      />
      <div className="flex gap-2 mt-3 mb-4 flex-wrap">
        {OPTIONS_DEMO_SYMBOLS.map((s) => (
          <button key={s}
            onClick={() => setSym(s)}
            className={cn('px-2.5 py-1 rounded-lg text-xs font-mono border transition-colors',
              sym === s ? 'bg-blue-600/20 border-blue-500/40 text-blue-300' : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200')}>
            {s}
          </button>
        ))}
      </div>

      {loading && <div className="h-4 w-32 bg-zinc-700 animate-pulse rounded" />}

      {!loading && iv && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="rounded-lg bg-zinc-800 p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">IV Rank</p>
            <p className={cn('text-lg font-bold font-mono mt-0.5',
              (iv.ivRank ?? 0) > 60 ? 'text-amber-400' : (iv.ivRank ?? 0) < 30 ? 'text-emerald-400' : 'text-white')}>
              {iv.ivRank != null ? `${iv.ivRank.toFixed(0)}%` : '—'}
            </p>
            <p className="text-[10px] text-zinc-600 mt-0.5">
              {(iv.ivRank ?? 0) > 60 ? 'High — favor selling' : (iv.ivRank ?? 0) < 30 ? 'Low — favor buying' : 'Moderate'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-800 p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Implied Vol</p>
            <p className="text-lg font-bold font-mono text-white mt-0.5">
              {iv.impliedVolatility != null ? `${(iv.impliedVolatility * 100).toFixed(1)}%` : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-zinc-800 p-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Percentile</p>
            <p className="text-lg font-bold font-mono text-white mt-0.5">
              {iv.ivPercentile != null ? `${iv.ivPercentile.toFixed(0)}th` : '—'}
            </p>
          </div>
        </div>
      )}

      {!loading && rec && rec.strategy && rec.strategy !== 'NONE' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className={cn('text-xs font-bold px-2.5 py-1 rounded-lg border font-mono', strategyColor(rec.strategy))}>
              {rec.strategy.replace(/_/g, ' ')}
            </span>
            <span className="text-xs text-zinc-500">for {sym}</span>
          </div>
          {rec.legs && rec.legs.length > 0 && (
            <div className="space-y-1.5">
              {rec.legs.map((leg: any, i: number) => (
                <div key={i} className="flex items-center gap-3 text-xs bg-zinc-800/60 rounded px-3 py-2">
                  <span className={cn('w-10 font-bold font-mono', leg.action === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>{leg.action}</span>
                  <span className="text-zinc-400">{leg.contractType}</span>
                  <span className="font-mono text-zinc-300">{leg.expiration}</span>
                  <span className="font-mono text-white">strike ${leg.strike?.toFixed(2)}</span>
                  {leg.estimatedPremium != null && (
                    <span className="text-zinc-500 ml-auto">~${leg.estimatedPremium.toFixed(2)}/contract</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {rec.reasoning && rec.reasoning.length > 0 && (
            <ul className="space-y-1">
              {rec.reasoning.map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                  <span className="text-blue-400 mt-0.5">·</span> {r}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-4 text-xs text-zinc-500">
            {rec.maxRiskUsd != null && <span>Max risk: <span className="font-mono text-white">${rec.maxRiskUsd.toFixed(0)}</span></span>}
            {rec.maxRewardUsd != null && <span>Max reward: <span className="font-mono text-emerald-400">${rec.maxRewardUsd.toFixed(0)}</span></span>}
          </div>
        </div>
      )}

      {!loading && rec && rec.strategy === 'NONE' && (
        <p className="text-sm text-zinc-500 py-4">No actionable options setup for {sym} at this time</p>
      )}

      {!loading && !rec && (
        <p className="text-sm text-zinc-500 py-4">Options data unavailable — requires market hours connectivity or a live data provider</p>
      )}
    </Card>
  );
}

// ─── Strategy Replay Card ─────────────────────────────────────────────────────

function StrategyReplayCard({ scanRuns }: { scanRuns: any[] }) {
  const [selectedRun, setSelectedRun] = useState('');
  const [maxPositions, setMaxPositions] = useState(3);
  const [capitalPerTrade, setCapitalPerTrade] = useState(500);
  const [minConviction, setMinConviction] = useState(75);
  const [lastResult, setLastResult] = useState<any>(null);

  const replay = useMutation({
    mutationFn: () => api.alpaca.runReplay({
      scanRunId: selectedRun,
      maxPositions,
      capitalPerTrade,
      minConviction,
    }),
    onSuccess: (r: any) => {
      toast.success(`Replay complete: ${r.data?.ordersPlaced ?? 0} orders placed`);
      setLastResult(r.data);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Replay failed'),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Layers className="w-4 h-4 text-blue-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Strategy Replay</h3>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs text-zinc-400 mb-1 block">Scan Run</label>
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
            value={selectedRun}
            onChange={e => setSelectedRun(e.target.value)}
          >
            <option value="">Select a scan run…</option>
            {(Array.isArray(scanRuns) ? scanRuns : []).map((r: any) => (
              <option key={r.id} value={r.id}>{r.runType} — {new Date(r.createdAt).toLocaleDateString()}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Max Positions</label>
            <input type="number" min={1} max={10} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={maxPositions} onChange={e => setMaxPositions(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Capital / Trade</label>
            <input type="number" min={10} step={50} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={capitalPerTrade} onChange={e => setCapitalPerTrade(Number(e.target.value))} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Min Conviction</label>
            <input type="number" min={50} max={100} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={minConviction} onChange={e => setMinConviction(Number(e.target.value))} />
          </div>
        </div>
        <button
          onClick={() => replay.mutate()}
          disabled={!selectedRun || replay.isPending}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg disabled:opacity-40 transition-colors"
        >
          {replay.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
          {replay.isPending ? 'Replaying…' : 'Run Replay'}
        </button>
        {lastResult && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-zinc-800/50 rounded p-2">
              <span className="text-zinc-400">Orders Placed</span>
              <div className="text-white font-bold">{lastResult.ordersPlaced}</div>
            </div>
            <div className="bg-zinc-800/50 rounded p-2">
              <span className="text-zinc-400">Skipped</span>
              <div className="text-white font-bold">{lastResult.ordersSkipped}</div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Latency Card ─────────────────────────────────────────────────────────────

function LatencyCard() {
  const { data, isLoading } = useQuery({
    queryKey: ['alpaca-latency'],
    queryFn: () => api.alpaca.latencyStats().then((r: any) => r.data),
    refetchInterval: 15_000,
  });

  if (isLoading) return <Card className="p-4"><LoadingState /></Card>;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Timer className="w-4 h-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Fill Latency Monitor</h3>
        <span className="ml-auto text-xs text-zinc-500">{data?.totalOrdersTracked ?? 0} orders tracked</span>
      </div>
      {data && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            ['Avg Latency',  `${data.avgLatencyMs ?? 0}ms`,     'text-white'],
            ['Min Latency',  `${data.minLatencyMs ?? 0}ms`,     'text-emerald-400'],
            ['Max Latency',  `${data.maxLatencyMs ?? 0}ms`,     'text-red-400'],
            ['p95 Latency',  `${data.p95LatencyMs ?? 0}ms`,     'text-yellow-400'],
            ['Avg Slippage', `${fmt(data.avgSlippagePct ?? 0)}%`, 'text-zinc-300'],
          ].map(([label, value, color]) => (
            <div key={label} className="bg-zinc-800/50 rounded p-2">
              <span className="text-zinc-400">{label}</span>
              <div className={cn('font-bold', color as string)}>{value as string}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Fill Simulator Panel ─────────────────────────────────────────────────────

function FillSimulator() {
  const [symbol, setSymbol] = useState('SPY');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState(1);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [result, setResult] = useState<any>(null);

  const place = useMutation({
    mutationFn: () => api.alpaca.placeOrder({
      symbol, side, qty, type: orderType,
      limitPrice: limitPrice ? parseFloat(limitPrice) : undefined,
    }),
    onSuccess: (r: any) => {
      toast.success(`${r.data?.isDryRun ? '[DryRun] ' : ''}Order submitted`);
      setResult(r.data);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Order failed'),
  });

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="w-4 h-4 text-orange-400" />
        <h3 className="text-sm font-semibold text-zinc-200">Fill Simulator</h3>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Symbol</label>
            <input className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white uppercase" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Type</label>
            <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={orderType} onChange={e => setOrderType(e.target.value as any)}>
              <option value="market">Market</option>
              <option value="limit">Limit</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Side</label>
            <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={side} onChange={e => setSide(e.target.value as any)}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Qty</label>
            <input type="number" min={0.001} step={1} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={qty} onChange={e => setQty(Number(e.target.value))} />
          </div>
          {orderType === 'limit' && (
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Limit $</label>
              <input type="number" step={0.01} className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-white" value={limitPrice} onChange={e => setLimitPrice(e.target.value)} />
            </div>
          )}
        </div>
        <button
          onClick={() => place.mutate()}
          disabled={!symbol || place.isPending}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 text-white text-xs rounded-lg disabled:opacity-40 transition-colors',
            side === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700',
          )}
        >
          {place.isPending ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
          {place.isPending ? 'Placing…' : `Simulate ${side.toUpperCase()}`}
        </button>
        {result && (
          <div className={cn('p-2 rounded text-xs', result.success !== false ? 'bg-emerald-900/30 text-emerald-300' : 'bg-red-900/30 text-red-300')}>
            {result.isDryRun && <span className="bg-violet-700/60 text-violet-200 rounded px-1 mr-2">DRY RUN</span>}
            {result.clientOrderId ?? result.error ?? 'Done'}
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── Positions Table ──────────────────────────────────────────────────────────

function PositionsTable({ positions }: { positions: any[] }) {
  if (positions.length === 0) return (
    <div className="text-xs text-zinc-500 text-center py-6">No open positions</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            {['Symbol', 'Qty', 'Side', 'Avg Entry', 'Current', 'P&L', 'P&L %', 'Value'].map(h => (
              <th key={h} className="px-2 py-2 text-left font-medium text-zinc-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p: any) => {
            const pnl = parseFloat(p.unrealized_pl ?? '0');
            const pnlPct = parseFloat(p.unrealized_plpc ?? '0') * 100;
            return (
              <tr key={p.symbol} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                <td className="px-2 py-2 font-medium text-white">{p.symbol}</td>
                <td className="px-2 py-2 text-zinc-300">{p.qty}</td>
                <td className="px-2 py-2">
                  <span className={cn('px-1.5 py-0.5 rounded text-xs', p.side === 'long' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400')}>
                    {p.side}
                  </span>
                </td>
                <td className="px-2 py-2 text-zinc-300">${parseFloat(p.avg_entry_price ?? '0').toFixed(2)}</td>
                <td className="px-2 py-2 text-zinc-300">${parseFloat(p.current_price ?? '0').toFixed(2)}</td>
                <td className={cn('px-2 py-2 font-medium', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtD(pnl)}</td>
                <td className={cn('px-2 py-2', pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmt(pnlPct)}%</td>
                <td className="px-2 py-2 text-zinc-300">{fmtDStr(p.market_value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Orders Table ─────────────────────────────────────────────────────────────

function OrdersTable({ orders }: { orders: any[] }) {
  if (orders.length === 0) return (
    <div className="text-xs text-zinc-500 text-center py-6">No open orders</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-800">
            {['Symbol', 'Type', 'Side', 'Qty', 'Limit', 'Status', 'Submitted'].map(h => (
              <th key={h} className="px-2 py-2 text-left font-medium text-zinc-500">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => (
            <tr key={o.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
              <td className="px-2 py-2 font-medium text-white">{o.symbol}</td>
              <td className="px-2 py-2 text-zinc-400">{o.type}</td>
              <td className="px-2 py-2">
                <span className={cn('px-1.5 py-0.5 rounded', o.side === 'buy' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400')}>
                  {o.side}
                </span>
              </td>
              <td className="px-2 py-2 text-zinc-300">{o.qty}</td>
              <td className="px-2 py-2 text-zinc-300">{o.limit_price ? `$${o.limit_price}` : '—'}</td>
              <td className="px-2 py-2 text-zinc-400">{o.status}</td>
              <td className="px-2 py-2 text-zinc-500">{relTime(o.submitted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Equity Curve ─────────────────────────────────────────────────────────────

function EquityCurve({ history }: { history: any }) {
  if (!history?.timestamp?.length) return (
    <div className="text-xs text-zinc-500 text-center py-6">No portfolio history available</div>
  );

  const chartData = history.timestamp.map((ts: number, i: number) => ({
    date: new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    equity: history.equity[i],
    pnl: history.profit_loss[i],
  }));

  const baseValue = history.base_value ?? 0;
  const currentEquity = chartData[chartData.length - 1]?.equity ?? baseValue;
  const totalPnl = currentEquity - baseValue;
  const totalPnlPct = baseValue > 0 ? (totalPnl / baseValue) * 100 : 0;
  const isPositive = totalPnl >= 0;

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div>
          <div className="text-xs text-zinc-400">Portfolio Value</div>
          <div className="text-xl font-bold text-white">{fmtD(currentEquity)}</div>
        </div>
        <div className={cn('flex items-center gap-1', isPositive ? 'text-emerald-400' : 'text-red-400')}>
          {isPositive ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
          <span className="font-medium">{fmtD(totalPnl)}</span>
          <span className="text-sm">({fmt(totalPnlPct)}%)</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: '#71717a' }} tickLine={false} axisLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, fontSize: 12 }}
            formatter={(v: any) => [fmtD(Number(v)), 'Equity']}
          />
          <ReferenceLine y={baseValue} stroke="#3f3f46" strokeDasharray="4 4" />
          <Line dataKey="equity" stroke={isPositive ? '#34d399' : '#f87171'} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Disconnect Button ────────────────────────────────────────────────────────

function DisconnectButton({ onDisconnected }: { onDisconnected: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  const disconnect = useMutation({
    mutationFn: () => api.credentials.alpacaDisconnect(),
    onSuccess: () => { toast.success('Alpaca disconnected'); qc.invalidateQueries({ queryKey: ['alpaca-status'] }); onDisconnected(); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Disconnect failed'),
  });

  if (!confirm) {
    return (
      <button
        onClick={() => setConfirm(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-xs rounded-lg transition-colors"
      >
        <PowerOff className="w-3.5 h-3.5" /> Disconnect
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => disconnect.mutate()} disabled={disconnect.isPending} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs rounded-lg">
        {disconnect.isPending ? 'Disconnecting…' : 'Confirm Disconnect'}
      </button>
      <button onClick={() => setConfirm(false)} className="px-3 py-1.5 bg-zinc-700 text-zinc-300 text-xs rounded-lg">Cancel</button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

function AlpacaDashboardInner() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'log'>('overview');

  const toggleDryRun = useMutation({
    mutationFn: (newDryRun: boolean) =>
      api.credentials.alpacaUpdateSettings({ dryRun: newDryRun }),
    onSuccess: (_: any, newDryRun: boolean) => {
      toast.success(newDryRun ? 'Dry Run enabled — orders will be simulated' : 'Dry Run disabled — orders will go to Alpaca paper');
      qc.invalidateQueries({ queryKey: ['alpaca-status'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed to update setting'),
  });

  const { data: statusRaw, isLoading } = useQuery({
    queryKey: ['alpaca-status'],
    queryFn: () => api.alpaca.status().then((r: any) => r.data),
    refetchInterval: 15_000,
  });

  const status = statusRaw ?? { hasCredentials: false };

  const { data: posData } = useQuery({
    queryKey: ['alpaca-positions'],
    queryFn: () => api.alpaca.positions().then((r: any) => r.data ?? []),
    enabled: !!status.hasCredentials,
    refetchInterval: 15_000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['alpaca-orders'],
    queryFn: () => api.alpaca.orders().then((r: any) => r.data ?? []),
    enabled: !!status.hasCredentials,
    refetchInterval: 10_000,
  });

  const { data: histData } = useQuery({
    queryKey: ['alpaca-portfolio-history'],
    queryFn: () => api.alpaca.portfolioHistory('1M', '1D').then((r: any) => r.data ?? null),
    enabled: !!status.hasCredentials,
    refetchInterval: 60_000,
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: orderLog } = useQuery({
    queryKey: ['alpaca-order-log'],
    queryFn: async () => {
      try {
        const r: any = await api.alpaca.orderLog();
        return Array.isArray(r?.data) ? r.data : [];
      } catch {
        return [];
      }
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: false,
  });

  const { data: scanRuns } = useQuery({
    queryKey: ['alpaca-scan-runs'],
    queryFn: async () => {
      try {
        const r: any = await api.scans.runs({ limit: 20, status: 'COMPLETED' });
        const data = r?.data;
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.runs)) return data.runs;
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!status.hasCredentials,
    retry: false,
  });

  if (isLoading) return <LoadingState message="Loading Alpaca dashboard…" />;

  if (!status.hasCredentials) {
    return <ConnectPanel onConnected={() => qc.invalidateQueries({ queryKey: ['alpaca-status'] })} />;
  }

  const account = status.account ?? {};
  const controlLevel: string = status.killswitch?.controlLevel ?? 'ACTIVE';
  const positions: any[] = posData ?? [];
  const orders: any[] = ordersData ?? [];
  const log: any[] = orderLog ?? [];
  const equity = parseFloat(account.equity ?? '0');
  const bp     = parseFloat(account.buying_power ?? '0');
  const drawdownPct: number = status.drawdownPct ?? 0;
  const isDryRun: boolean = status.dryRun ?? true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical className="w-7 h-7 text-violet-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Alpaca Paper Trading</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <button
                onClick={() => toggleDryRun.mutate(!isDryRun)}
                disabled={toggleDryRun.isPending}
                title={isDryRun ? 'Click to enable live paper orders' : 'Click to enable dry run (simulate only)'}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all',
                  isDryRun
                    ? 'bg-violet-900/50 border-violet-500/40 text-violet-300 hover:bg-violet-900/70'
                    : 'bg-emerald-900/50 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/70',
                  toggleDryRun.isPending && 'opacity-50 cursor-not-allowed',
                )}
              >
                {toggleDryRun.isPending
                  ? <RefreshCw className="w-3 h-3 animate-spin" />
                  : <Activity className="w-3 h-3" />
                }
                {isDryRun ? 'Dry Run' : 'Live Paper'}
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  isDryRun ? 'bg-violet-400' : 'bg-emerald-400 animate-pulse',
                )} />
              </button>
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border', {
                'border-emerald-500/40 bg-emerald-900/30 text-emerald-400': controlLevel === 'ACTIVE',
                'border-yellow-500/40 bg-yellow-900/30 text-yellow-400':  controlLevel === 'PAUSE',
                'border-red-500/40 bg-red-900/30 text-red-400':           controlLevel === 'HARD_STOP',
              })}>
                {controlLevel}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ['alpaca-status', 'alpaca-positions', 'alpaca-orders'] })}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <DisconnectButton onDisconnected={() => qc.invalidateQueries({ queryKey: ['alpaca-status'] })} />
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Portfolio Value" value={fmtD(equity)} icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Buying Power" value={fmtD(bp)} icon={<BarChart3 className="h-4 w-4" />} color="blue" />
        <StatCard
          label="Drawdown"
          value={`${fmt(drawdownPct)}%`}
          icon={drawdownPct > 5 ? <AlertTriangle className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          color={drawdownPct > 5 ? 'red' : drawdownPct > 2 ? 'amber' : 'blue'}
        />
        <StatCard label="Open Positions" value={String(positions.length)} icon={<Activity className="h-4 w-4" />} color="blue" />
      </div>

      {/* Equity Curve */}
      <Card className="p-4">
        <CardHeader title="Equity Curve" icon={<TrendingUp className="h-4 w-4" />} />
        <EquityCurve history={histData} />
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {(['overview', 'orders', 'log'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 text-sm capitalize transition-colors', activeTab === tab ? 'text-white border-b-2 border-violet-500' : 'text-zinc-500 hover:text-zinc-300')}
          >
            {tab === 'log' ? 'Order Log' : tab === 'orders' ? `Orders (${orders.length})` : `Positions (${positions.length})`}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <Card className="p-4">
          <CardHeader title="Open Positions" icon={<BarChart3 className="h-4 w-4" />} />
          <PositionsTable positions={positions} />
        </Card>
      )}
      {activeTab === 'orders' && (
        <Card className="p-4">
          <CardHeader title="Open Orders" icon={<Clock className="h-4 w-4" />} />
          <OrdersTable orders={orders} />
        </Card>
      )}
      {activeTab === 'log' && (
        <Card className="p-4">
          <CardHeader title="Order Log" icon={<Activity className="h-4 w-4" />} />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-800">
                  {['Symbol', 'Side', 'Type', 'Qty', 'Status', 'Dry Run', 'Submitted'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium text-zinc-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {log.map((l: any) => (
                  <tr key={l.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="px-2 py-2 font-medium text-white">{l.symbol}</td>
                    <td className="px-2 py-2">
                      <span className={cn('px-1.5 py-0.5 rounded', l.side === 'buy' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400')}>{l.side}</span>
                    </td>
                    <td className="px-2 py-2 text-zinc-400">{l.orderType}</td>
                    <td className="px-2 py-2 text-zinc-300">{l.qty ?? l.notional + ' (notional)'}</td>
                    <td className="px-2 py-2 text-zinc-400">{l.status}</td>
                    <td className="px-2 py-2">{l.isDryRun ? <span className="text-violet-400">Yes</span> : <span className="text-zinc-500">No</span>}</td>
                    <td className="px-2 py-2 text-zinc-500">{relTime(l.submittedAt)}</td>
                  </tr>
                ))}
                {log.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-zinc-600 py-6">No order logs</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Controls + Tools Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ControlPanel controlLevel={controlLevel} />
        <LatencyCard />
      </div>

      {/* Test Suite + Fill Simulator Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TestSuiteCard />
        <FillSimulator />
      </div>

      {/* Strategy Replay */}
      <StrategyReplayCard scanRuns={scanRuns ?? []} />

      {/* Phase 11: Options Recommendations */}
      <OptionsRecommendationsPanel />

      {/* Paper vs Live Comparison Note */}
      <Card className="p-4 border-zinc-700/50">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-zinc-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-1">Paper vs Live Comparison</h3>
            <p className="text-xs text-zinc-500 leading-relaxed">
              All orders are routed to <span className="text-zinc-300 font-mono">paper-api.alpaca.markets</span> — the live Alpaca URL is never used.
              In Dry Run mode, orders are simulated locally and logged to the order log without touching the Alpaca API.
              Use the test suite and fill simulator to validate strategy logic before enabling live paper mode.
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="flex items-center gap-1 text-violet-300"><CheckCircle2 className="w-3 h-3" /> Dry Run: no API calls, DB-only</span>
              <span className="flex items-center gap-1 text-blue-300"><CheckCircle2 className="w-3 h-3" /> Paper: Alpaca paper endpoint only</span>
              <span className="flex items-center gap-1 text-zinc-500"><XCircle className="w-3 h-3" /> Live URL: never used</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Minus({ className }: { className?: string }) {
  return <span className={cn('inline-block w-3.5 h-3.5 text-center leading-none', className)}>—</span>;
}

export default function AlpacaDashboard() {
  return (
    <AlpacaErrorBoundary>
      <AlpacaDashboardInner />
    </AlpacaErrorBoundary>
  );
}
