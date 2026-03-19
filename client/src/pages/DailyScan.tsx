import { useState, useCallback, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Radar, RefreshCw, ChevronDown, ChevronUp, Clock, Play,
  TrendingUp, TrendingDown, Minus, Filter, History, Settings2,
  ArrowUpRight, AlertTriangle, ExternalLink, Info, Globe, Zap
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

type AssetScope = 'ALL' | 'STOCKS_ONLY' | 'CRYPTO_ONLY';
type RiskMode = 'ALL' | 'CONSERVATIVE' | 'AGGRESSIVE';
type BiasFilter = 'ALL' | 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type AssetFilter = 'ALL' | 'STOCK' | 'CRYPTO' | 'ETF';
type ScanMode = 'quick' | 'full';

interface ScanProgress {
  phase: string;
  done: number;
  total: number;
  log: string[];
}

interface ScanResult {
  id: string;
  symbol: string;
  assetClass: string;
  rank: number;
  bias: string;
  convictionScore: number;
  confidenceScore: number;
  technicalScore: number;
  catalystScore: number;
  riskScore: number;
  volatilityScore: number;
  liquidityScore: number;
  setupType: string;
  trendState: string;
  suggestedHoldWindow: string;
  thesisHealthScore: number;
  monitoringFrequency: string;
  supportingReasonsJson: string[];
  mainRiskToThesis: string;
  catalystSummary: string;
  patternSummary: string;
  recommendedAction: string;
  entryZoneJson: { low: number; high: number; description: string };
  invalidationZoneJson: { level: number; description: string };
  takeProfit1Json: { level: number; description: string };
  takeProfit2Json: { level: number; description: string };
}

interface ScanRun {
  id: string;
  status: string;
  runType: string;
  marketSession: string;
  totalUniverseCount: number;
  totalRankedCount: number;
  topSymbol: string | null;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  isFullUniverseScan?: boolean;
  report?: { marketRegimeSummary: string | null; reportDate: string } | null;
}

function biasColor(bias: string) {
  if (bias === 'BULLISH') return 'text-accent-green';
  if (bias === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}

function biasIcon(bias: string) {
  if (bias === 'BULLISH') return <TrendingUp className="h-3 w-3" />;
  if (bias === 'BEARISH') return <TrendingDown className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

function convictionColor(score: number) {
  if (score >= 75) return 'text-accent-green';
  if (score >= 55) return 'text-yellow-400';
  return 'text-red-400';
}

function actionBadge(action: string) {
  const map: Record<string, { color: string; label: string }> = {
    'high-priority watch': { color: 'bg-accent-green/20 text-accent-green border-accent-green/30', label: 'High Priority' },
    'paper trade candidate': { color: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30', label: 'Trade Ready' },
    'momentum candidate': { color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: 'Momentum' },
    'watch for confirmation': { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: 'Watch' },
    'risk elevated': { color: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Risk Elevated' },
  };
  const m = map[action] ?? { color: 'bg-slate-500/20 text-slate-400 border-slate-500/30', label: action };
  return <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', m.color)}>{m.label}</span>;
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-400 w-7 text-right">{Math.round(value)}</span>
    </div>
  );
}

function fmt(n?: number) {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(2)}`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`;
}

function phaseLabel(phase: string): string {
  if (phase === 'FILTERING') return 'FILTERING UNIVERSE';
  if (phase === 'ANALYZING') return 'ANALYZING CANDIDATES';
  return phase;
}

function ProgressPanel({ scanRunId, onComplete }: { scanRunId: string; onComplete: () => void }) {
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    const progressUrl = api.scans.progress(scanRunId);
    const es = new EventSource(progressUrl);
    es.onmessage = (e) => {
      try {
        const data: ScanProgress = JSON.parse(e.data);
        setProgress(data);
        if (data.phase === 'ANALYZING' && data.done === data.total && data.total > 0 && !doneRef.current) {
          doneRef.current = true;
          setTimeout(onComplete, 2000);
        }
      } catch {}
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, [scanRunId, onComplete]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const estimatedTotal = progress && progress.done > 0 ? (elapsed / progress.done) * progress.total : 0;
  const remaining = Math.max(0, Math.round(estimatedTotal - elapsed));

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-lg p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
            <Globe className="h-4 w-4 text-accent-blue animate-pulse" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Full Universe Scan in Progress</p>
            <p className="text-xs text-slate-500">NYSE + NASDAQ + All Crypto</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-xs text-slate-400">
            <span className="font-mono uppercase tracking-wider">{progress ? phaseLabel(progress.phase) : 'INITIALIZING'}</span>
            <span className="font-mono">{progress ? `${progress.done} / ${progress.total}` : '—'}</span>
          </div>
          <div className="h-2 bg-surface-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-blue rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {progress?.log && progress.log.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[10px] text-slate-600 uppercase tracking-wider font-mono">Recent activity</p>
            <div className="space-y-1 max-h-28 overflow-y-auto">
              {[...progress.log].reverse().map((line, i) => (
                <p key={i} className={cn('text-xs font-mono', i === 0 ? 'text-slate-300' : 'text-slate-600')}>
                  {i === 0 ? '→ ' : '✓ '}{line}
                </p>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-surface-border">
          <span>Elapsed: {formatElapsed(elapsed)}</span>
          {remaining > 0 && <span>Est. remaining: ~{Math.ceil(remaining / 60)} min</span>}
        </div>
      </Card>
    </div>
  );
}

function ExpandedRow({ result }: { result: ScanResult }) {
  const reasons = Array.isArray(result.supportingReasonsJson) ? result.supportingReasonsJson : [];
  const entry = result.entryZoneJson;
  const inv = result.invalidationZoneJson;
  const tp1 = result.takeProfit1Json;
  const tp2 = result.takeProfit2Json;

  return (
    <div className="bg-surface-2/60 border-t border-surface-border px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Price Levels</p>
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500">Entry Zone</span>
            <span className="font-mono text-accent-green">{entry ? `${fmt(entry.low)} – ${fmt(entry.high)}` : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Invalidation</span>
            <span className="font-mono text-red-400">{inv ? fmt(inv.level) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">TP1</span>
            <span className="font-mono text-accent-blue">{tp1 ? fmt(tp1.level) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">TP2</span>
            <span className="font-mono text-accent-purple">{tp2 ? fmt(tp2.level) : '—'}</span>
          </div>
          <div className="flex justify-between pt-1 border-t border-surface-border">
            <span className="text-slate-500">Hold Window</span>
            <span className="text-white font-mono">{result.suggestedHoldWindow ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Monitor</span>
            <span className="text-white font-mono">{result.monitoringFrequency ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Thesis Health</span>
            <span className={cn('font-mono', convictionColor(result.thesisHealthScore))}>{result.thesisHealthScore}/100</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Score Breakdown</p>
        <div className="space-y-2">
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Technical</p>
            <ScoreBar value={result.technicalScore} color="bg-accent-blue" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Catalyst</p>
            <ScoreBar value={result.catalystScore} color="bg-accent-purple" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Risk (lower = better)</p>
            <ScoreBar value={result.riskScore} color={result.riskScore >= 60 ? 'bg-red-500' : 'bg-accent-green'} />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Liquidity</p>
            <ScoreBar value={result.liquidityScore} color="bg-teal-500" />
          </div>
          <div>
            <p className="text-[10px] text-slate-500 mb-1">Volatility Fit</p>
            <ScoreBar value={result.volatilityScore} color="bg-orange-400" />
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Thesis Notes</p>
        {reasons.length > 0 && (
          <ul className="space-y-1">
            {reasons.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2 text-xs text-slate-300">
                <span className="text-accent-green mt-0.5 flex-shrink-0">✓</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
        {result.mainRiskToThesis && (
          <div className="flex gap-2 text-xs text-red-300 bg-red-500/10 rounded p-2">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span>{result.mainRiskToThesis}</span>
          </div>
        )}
        {result.catalystSummary && (
          <p className="text-xs text-slate-400 italic">{result.catalystSummary}</p>
        )}
        <Link
          to={`/symbol/${result.symbol}`}
          className="inline-flex items-center gap-1 text-xs text-accent-blue hover:text-blue-300 transition-colors"
        >
          Deep dive <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function ResultRow({ result, expanded, onToggle }: { result: ScanResult; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-surface-border last:border-0">
      <button onClick={onToggle} className="w-full text-left hover:bg-surface-2/50 transition-colors px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-slate-600 w-6 flex-shrink-0 text-right">{result.rank}</span>
          <div className="flex items-center gap-2 w-28 flex-shrink-0">
            <span className="font-bold text-sm text-white">{result.symbol}</span>
            <span className="text-[10px] text-slate-500 bg-surface-border px-1.5 py-0.5 rounded">
              {result.assetClass === 'STOCK' ? 'STK' : result.assetClass === 'CRYPTO' ? 'CRY' : 'ETF'}
            </span>
          </div>
          <div className={cn('flex items-center gap-1 w-20 flex-shrink-0', biasColor(result.bias))}>
            {biasIcon(result.bias)}
            <span className="text-xs font-semibold">{result.bias}</span>
          </div>
          <div className="flex items-center gap-1 w-20 flex-shrink-0">
            <span className={cn('text-sm font-bold font-mono', convictionColor(result.convictionScore))}>
              {result.convictionScore}
            </span>
            <span className="text-[10px] text-slate-600">/100</span>
          </div>
          <div className="hidden md:flex items-center gap-3 flex-1">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-8">Tech</span>
                <ScoreBar value={result.technicalScore} color="bg-accent-blue" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500 w-8">Cat</span>
                <ScoreBar value={result.catalystScore} color="bg-accent-purple" />
              </div>
            </div>
          </div>
          <div className="hidden lg:block w-40 flex-shrink-0">{actionBadge(result.recommendedAction)}</div>
          <div className="hidden xl:block w-32 flex-shrink-0">
            <span className="text-xs text-slate-400 truncate block">{result.setupType}</span>
          </div>
          <div className="ml-auto flex-shrink-0">
            {expanded ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
          </div>
        </div>
      </button>
      {expanded && <ExpandedRow result={result} />}
    </div>
  );
}

export default function DailyScan() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [assetScope, setAssetScope] = useState<AssetScope>('ALL');
  const [riskMode, setRiskMode] = useState<RiskMode>('ALL');
  const [biasFilter, setBiasFilter] = useState<BiasFilter>('ALL');
  const [assetFilter, setAssetFilter] = useState<AssetFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<ScanMode>('quick');
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [isFullScanRunning, setIsFullScanRunning] = useState(false);

  const { data: latestData, isLoading: latestLoading, isError: latestError } = useQuery({
    queryKey: ['daily-scan-latest'],
    queryFn: () => api.scans.latest(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60_000,
  });

  const latestRun: ScanRun | null = (latestData as any)?.data?.run ?? null;

  const { data: resultsData, isLoading: resultsLoading } = useQuery({
    queryKey: ['daily-scan-results', latestRun?.id, assetFilter, biasFilter],
    queryFn: () => api.scans.results(latestRun!.id, {
      limit: 100,
      assetClass: assetFilter !== 'ALL' ? assetFilter : undefined,
      bias: biasFilter !== 'ALL' ? biasFilter : undefined,
    }),
    enabled: !!latestRun?.id && !isFullScanRunning,
    staleTime: 60_000,
  });

  const results: ScanResult[] = (resultsData as any)?.data?.results ?? [];

  const handleScanComplete = useCallback(() => {
    setIsFullScanRunning(false);
    setActiveScanId(null);
    qc.invalidateQueries({ queryKey: ['daily-scan-latest'] });
    qc.invalidateQueries({ queryKey: ['daily-scan-results'] });
    qc.invalidateQueries({ queryKey: ['daily-scan-runs'] });
    toast.success('Full universe scan completed');
  }, [qc]);

  const triggerMutation = useMutation({
    mutationFn: () => api.scans.trigger({
      runType: 'MANUAL',
      marketSession: 'MARKET_OPEN',
      assetScope,
      riskMode,
      force: true,
      fullUniverse: scanMode === 'full',
    }),
    onSuccess: (data: any) => {
      const id = data?.data?.scanRunId;
      if (scanMode === 'full') {
        setActiveScanId(id);
        setIsFullScanRunning(true);
        toast.info('Full universe scan started — this takes ~15 minutes', { description: `Run ID: ${id?.slice(0, 8) ?? '?'}` });
      } else {
        toast.success('Scan triggered — analyzing universe…', { description: `Run ID: ${id?.slice(0, 8) ?? '?'}` });
        setTimeout(() => {
          qc.invalidateQueries({ queryKey: ['daily-scan-latest'] });
          qc.invalidateQueries({ queryKey: ['daily-scan-results'] });
          qc.invalidateQueries({ queryKey: ['daily-scan-runs'] });
        }, 2000);
      }
    },
    onError: (err: any) => {
      toast.error('Scan failed', { description: err?.response?.data?.error ?? err?.message ?? 'Unknown error' });
    },
  });

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const isRunning = triggerMutation.isPending || isFullScanRunning;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
              <Radar className="h-4 w-4 text-accent-blue" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Daily Scan</h1>
              <p className="text-xs text-slate-500">Ranked opportunity universe</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/scan-history" className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
              <History className="h-4 w-4" />
            </Link>
            <button onClick={() => navigate('/settings')} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
              <Settings2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => triggerMutation.mutate()}
              disabled={isRunning}
              className={cn(
                'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all',
                isRunning ? 'bg-accent-blue/30 text-accent-blue/50 cursor-not-allowed' : 'bg-accent-blue text-white hover:bg-blue-500'
              )}
            >
              {isRunning ? <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</> : <><Play className="h-4 w-4" /> Run Scan</>}
            </button>
          </div>
        </div>

        <div className="px-6 pb-3 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Mode:</span>
            <button
              onClick={() => setScanMode('quick')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                scanMode === 'quick' ? 'bg-accent-blue text-white' : 'bg-surface-2 text-slate-400 hover:text-white'
              )}
            >
              <Zap className="h-3 w-3" /> Quick Scan
              <span className="text-[10px] opacity-70">~2 min</span>
            </button>
            <button
              onClick={() => setScanMode('full')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold transition-colors',
                scanMode === 'full' ? 'bg-accent-purple text-white' : 'bg-surface-2 text-slate-400 hover:text-white'
              )}
            >
              <Globe className="h-3 w-3" /> Full Universe
              <span className="text-[10px] opacity-70">~15 min</span>
            </button>
          </div>

          <div className="w-px h-4 bg-surface-border" />

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Filter className="h-3.5 w-3.5" /><span>Scope:</span>
          </div>
          {(['ALL', 'STOCKS_ONLY', 'CRYPTO_ONLY'] as AssetScope[]).map((s) => (
            <button key={s} onClick={() => setAssetScope(s)}
              className={cn('px-3 py-1 rounded text-xs font-semibold transition-colors', assetScope === s ? 'bg-accent-blue text-white' : 'bg-surface-2 text-slate-400 hover:text-white')}>
              {s === 'ALL' ? 'All' : s === 'STOCKS_ONLY' ? 'Stocks' : 'Crypto'}
            </button>
          ))}
          <div className="w-px h-4 bg-surface-border" />
          <span className="text-xs text-slate-500">Risk:</span>
          {(['ALL', 'CONSERVATIVE', 'AGGRESSIVE'] as RiskMode[]).map((m) => (
            <button key={m} onClick={() => setRiskMode(m)}
              className={cn('px-3 py-1 rounded text-xs font-semibold transition-colors', riskMode === m ? 'bg-accent-purple text-white' : 'bg-surface-2 text-slate-400 hover:text-white')}>
              {m === 'ALL' ? 'All' : m === 'CONSERVATIVE' ? 'Conservative' : 'Aggressive'}
            </button>
          ))}
        </div>

        {latestRun && (
          <div className="px-6 pb-3 flex items-center gap-4 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3 w-3" />
              {latestRun.completedAt ? `Last scan: ${new Date(latestRun.completedAt).toLocaleString()}` : 'No completed scan yet'}
            </span>
            {latestRun.isFullUniverseScan && (
              <span className="flex items-center gap-1 text-accent-purple">
                <Globe className="h-3 w-3" /> Full Universe
              </span>
            )}
            <span className="text-slate-600">·</span>
            <span>{latestRun.totalRankedCount} ranked / {latestRun.totalUniverseCount} universe</span>
            {latestRun.topSymbol && (<><span className="text-slate-600">·</span><span>Top: <span className="text-accent-green font-mono">{latestRun.topSymbol}</span></span></>)}
            {latestRun.report?.marketRegimeSummary && (
              <><span className="text-slate-600">·</span><span className="hidden xl:inline text-slate-400 italic truncate max-w-sm">{latestRun.report.marketRegimeSummary}</span></>
            )}
            <Link to={`/scan-report/${latestRun.id}`} className="ml-auto flex items-center gap-1 text-accent-blue hover:text-blue-300">
              Full Report <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {isFullScanRunning && activeScanId ? (
        <ProgressPanel scanRunId={activeScanId} onComplete={handleScanComplete} />
      ) : (
        <>
          {latestRun?.id && (
            <div className="flex-shrink-0 px-6 py-2 border-b border-surface-border flex items-center gap-3 flex-wrap">
              <span className="text-xs text-slate-500">Filter:</span>
              {(['ALL', 'BULLISH', 'BEARISH', 'NEUTRAL'] as BiasFilter[]).map((b) => (
                <button key={b} onClick={() => setBiasFilter(b)}
                  className={cn('px-2.5 py-1 rounded text-xs transition-colors', biasFilter === b ? (b === 'BULLISH' ? 'bg-accent-green/20 text-accent-green' : b === 'BEARISH' ? 'bg-red-500/20 text-red-400' : 'bg-accent-blue/20 text-accent-blue') : 'text-slate-500 hover:text-white')}>
                  {b === 'ALL' ? 'All Bias' : b}
                </button>
              ))}
              <div className="w-px h-4 bg-surface-border" />
              {(['ALL', 'STOCK', 'CRYPTO', 'ETF'] as AssetFilter[]).map((a) => (
                <button key={a} onClick={() => setAssetFilter(a)}
                  className={cn('px-2.5 py-1 rounded text-xs transition-colors', assetFilter === a ? 'bg-surface-border text-white' : 'text-slate-500 hover:text-white')}>
                  {a}
                </button>
              ))}
              <span className="ml-auto text-xs text-slate-500 font-mono">{results.length} results</span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {latestLoading ? (
              <LoadingState message="Loading latest scan…" />
            ) : latestError ? (
              <ErrorState message="Could not fetch the latest scan run." />
            ) : !latestRun ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
                <div className="w-16 h-16 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center">
                  <Radar className="h-7 w-7 text-accent-blue/60" />
                </div>
                <div>
                  <p className="text-white font-semibold mb-1">No scan results yet</p>
                  <p className="text-slate-500 text-sm max-w-sm">Run your first daily scan to rank the full market universe by conviction, setup quality, and risk-adjusted opportunity.</p>
                </div>
                <button onClick={() => triggerMutation.mutate()} disabled={isRunning}
                  className="flex items-center gap-2 px-6 py-2.5 bg-accent-blue text-white rounded-lg text-sm font-semibold hover:bg-blue-500 transition-colors">
                  <Play className="h-4 w-4" />{isRunning ? 'Scanning…' : 'Run First Scan'}
                </button>
              </div>
            ) : resultsLoading ? (
              <LoadingState message="Loading ranked results…" />
            ) : results.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3 text-center">
                <Info className="h-8 w-8 text-slate-600" />
                <p className="text-slate-400 text-sm">No results match the current filters</p>
                <button onClick={() => { setBiasFilter('ALL'); setAssetFilter('ALL'); }} className="text-accent-blue text-xs hover:underline">Clear filters</button>
              </div>
            ) : (
              <div>
                <div className="hidden md:flex items-center gap-3 px-4 py-2 bg-surface-2/40 border-b border-surface-border text-[10px] text-slate-600 uppercase tracking-wider font-mono">
                  <span className="w-6 flex-shrink-0 text-right">#</span>
                  <span className="w-28 flex-shrink-0">Symbol</span>
                  <span className="w-20 flex-shrink-0">Bias</span>
                  <span className="w-20 flex-shrink-0">Conviction</span>
                  <span className="flex-1">Score Breakdown</span>
                  <span className="w-40 flex-shrink-0 hidden lg:block">Action</span>
                  <span className="w-32 flex-shrink-0 hidden xl:block">Setup</span>
                  <span className="w-5 flex-shrink-0" />
                </div>
                {results.map((r) => (
                  <ResultRow key={r.id} result={r} expanded={expandedId === r.id} onToggle={() => handleToggle(r.id)} />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
