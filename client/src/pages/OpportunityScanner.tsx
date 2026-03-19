import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ScanSearch, Filter, Zap, TrendingUp, TrendingDown, ChevronRight,
  RefreshCw, AlertCircle, Target, Shield, Brain, Activity,
  CheckCircle, XCircle, MinusCircle, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge, RiskBadge, ScoreBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../api/client';
import { MiniVerdictBadge, RiskRewardPanel } from '../components/analysis/TradeVerdictHero';

type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type RecommendedAction = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT' | 'STRONG_SHORT';

interface ThesisSummary {
  ticker: string;
  name: string;
  price: number;
  changePercent: number;
  assetClass: string;
  bias: Bias;
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  recommendedAction: RecommendedAction;
  thesisSummary: string;
  entryLow: number;
  entryHigh: number;
  invalidation: number;
  takeProfit1: number;
  isMock: boolean;
}

interface ScanMeta {
  total: number;
  bullish: number;
  bearish: number;
  neutral: number;
  highConviction: number;
  avgConviction: number;
}

function formatPrice(price: number): string {
  if (price < 0.001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

function biasColor(bias: Bias): string {
  if (bias === 'BULLISH') return 'text-emerald-400';
  if (bias === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}

function biasBg(bias: Bias): string {
  if (bias === 'BULLISH') return 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400';
  if (bias === 'BEARISH') return 'bg-red-400/10 border-red-400/20 text-red-400';
  return 'bg-slate-700/30 border-slate-600/20 text-slate-400';
}

function actionStyle(action: RecommendedAction): string {
  const map: Record<RecommendedAction, string> = {
    STRONG_BUY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    BUY: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    WATCH: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    AVOID: 'bg-slate-700/40 text-slate-500 border-slate-600/20',
    SHORT: 'bg-red-400/10 text-red-400 border-red-400/20',
    STRONG_SHORT: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  return map[action] ?? map.WATCH;
}

function actionLabel(action: RecommendedAction): string {
  return action.replace(/_/g, ' ');
}

function BiasIcon({ bias }: { bias: Bias }) {
  if (bias === 'BULLISH') return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  if (bias === 'BEARISH') return <TrendingDown className="h-4 w-4 text-red-400" />;
  return <MinusCircle className="h-4 w-4 text-slate-400" />;
}

function ConvictionBar({ value, color = 'bg-accent-blue' }: { value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-surface-4 rounded-full overflow-hidden max-w-20">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-400 w-6 text-right">{value}</span>
    </div>
  );
}

function ScanCard({
  summary,
  expanded,
  onToggle,
  onClick,
}: {
  summary: ThesisSummary;
  expanded: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  return (
    <div className={`rounded-lg border transition-all ${
      expanded ? 'border-accent-blue/30 bg-surface-2' : 'border-surface-border bg-surface-2 hover:border-surface-border/60 hover:bg-surface-3'
    }`}>
      <div
        className="grid grid-cols-12 gap-3 px-4 py-3 cursor-pointer items-center"
        onClick={onClick}
      >
        <div className="col-span-3">
          <div className="flex items-center gap-2">
            <BiasIcon bias={summary.bias} />
            <div>
              <p className="text-sm font-bold text-white font-mono">{summary.ticker}</p>
              <p className="text-xs text-slate-600 truncate max-w-24">{summary.name}</p>
            </div>
          </div>
        </div>

        <div className="col-span-2">
          <p className="text-sm font-mono text-white">{formatPrice(summary.price)}</p>
          <span className={`text-xs font-mono font-semibold ${
            summary.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {summary.changePercent >= 0 ? '+' : ''}{summary.changePercent.toFixed(2)}%
          </span>
        </div>

        <div className="col-span-2">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border font-mono ${biasBg(summary.bias)}`}>
            {summary.bias}
          </span>
        </div>

        <div className="col-span-2">
          <ConvictionBar
            value={summary.convictionScore}
            color={summary.convictionScore >= 70 ? 'bg-emerald-400' : summary.convictionScore >= 50 ? 'bg-accent-blue' : 'bg-amber-400'}
          />
        </div>

        <div className="col-span-2">
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border font-mono ${actionStyle(summary.recommendedAction)}`}>
            {actionLabel(summary.recommendedAction)}
          </span>
        </div>

        <div className="col-span-1 flex items-center justify-end gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-1 rounded text-slate-600 hover:text-slate-400 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-accent-blue transition-colors" />
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-border pt-4 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <MiniVerdictBadge action={summary.recommendedAction} score={summary.convictionScore} />
            <div className="flex gap-3 text-xs font-mono">
              <span className="text-slate-600">Confidence: <span className="text-slate-300">{summary.confidenceScore}/100</span></span>
              <span className="text-slate-600">Risk: <span className={summary.riskScore <= 35 ? 'text-emerald-400' : summary.riskScore <= 60 ? 'text-amber-400' : 'text-red-400'}>{summary.riskScore}/100</span></span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">{summary.thesisSummary}</p>

          <RiskRewardPanel
            stopLoss={summary.invalidation}
            takeProfit1={summary.takeProfit1}
            takeProfit2={null}
            currentPrice={summary.price}
          />

          <div className="flex items-center justify-between">
            <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
              <p className="text-[10px] text-slate-600 font-mono uppercase mb-1">Entry Zone</p>
              <p className="text-xs font-mono text-white font-semibold">
                {formatPrice(summary.entryLow)} – {formatPrice(summary.entryHigh)}
              </p>
            </div>
            <button
              onClick={onClick}
              className="flex items-center gap-1.5 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-xs font-semibold transition-colors"
            >
              <Brain className="h-3.5 w-3.5" /> Full Analysis
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function OpportunityScanner() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');
  const [sortBy, setSortBy] = useState<'conviction' | 'risk' | 'change'>('conviction');
  const [expandedTickers, setExpandedTickers] = useState<Set<string>>(new Set());

  const {
    data: scanResponse,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['thesis-scan', filter],
    queryFn: async () => {
      const r = await api.thesis.scan({
        assetClass: filter === 'all' ? undefined : filter,
        limit: 10,
      }) as { success: boolean; data?: { summaries: ThesisSummary[]; meta: ScanMeta } };
      return r.data ?? null;
    },
    staleTime: 10 * 60 * 1000,
  });

  const summaries = scanResponse?.summaries ?? [];
  const meta = scanResponse?.meta;

  const sorted = [...summaries].sort((a, b) => {
    if (sortBy === 'conviction') return b.convictionScore - a.convictionScore;
    if (sortBy === 'risk') return a.riskScore - b.riskScore;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });

  const toggleExpanded = (ticker: string) => {
    setExpandedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker); else next.add(ticker);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Opportunity Scanner</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Multi-agent thesis engine · Conviction-ranked opportunities</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info" dot>AI Active</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Scanned', value: meta?.total ?? '—', color: 'text-white', icon: <ScanSearch className="h-4 w-4" /> },
          { label: 'Bullish Setups', value: meta?.bullish ?? '—', color: 'text-emerald-400', icon: <TrendingUp className="h-4 w-4" /> },
          { label: 'High Conviction', value: meta?.highConviction ?? '—', color: 'text-accent-blue', icon: <Brain className="h-4 w-4" /> },
          { label: 'Avg Conviction', value: meta ? `${meta.avgConviction}/100` : '—', color: 'text-accent-amber', icon: <Zap className="h-4 w-4" /> },
        ].map((stat) => (
          <Card key={stat.label} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={stat.color}>{stat.icon}</span>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">{stat.label}</p>
            </div>
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{isLoading ? '—' : stat.value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-accent-blue" />
            <span className="text-sm font-semibold">AI Thesis Scan</span>
            <span className="text-xs text-slate-600 font-mono">· Market structure + catalysts + risk</span>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'stock', 'crypto'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  filter === f
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'text-slate-500 hover:text-white hover:bg-surface-3'
                }`}>
                {f.toUpperCase()}
              </button>
            ))}
            <div className="w-px h-4 bg-surface-border" />
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-surface-3 border border-surface-border rounded text-xs text-slate-300 px-2 py-1 outline-none font-mono">
              <option value="conviction">By Conviction</option>
              <option value="risk">By Risk (Low→High)</option>
              <option value="change">By Change %</option>
            </select>
            <button onClick={() => refetch()} disabled={isFetching}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Running multi-agent thesis scan..." />
        ) : isError ? (
          <ErrorState message="Failed to run thesis scan" onRetry={refetch} />
        ) : sorted.length === 0 ? (
          <EmptyState icon={<ScanSearch className="h-8 w-8" />} title="No results" description="Try switching asset class filter" />
        ) : (
          <div className="space-y-1">
            <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
              <span className="col-span-3">Symbol</span>
              <span className="col-span-2">Price</span>
              <span className="col-span-2">Bias</span>
              <span className="col-span-2">Conviction</span>
              <span className="col-span-2">Action</span>
              <span className="col-span-1"></span>
            </div>
            {sorted.map((summary) => (
              <ScanCard
                key={summary.ticker}
                summary={summary}
                expanded={expandedTickers.has(summary.ticker)}
                onToggle={() => toggleExpanded(summary.ticker)}
                onClick={() => navigate(`/symbol/${summary.ticker}`)}
              />
            ))}
          </div>
        )}
      </Card>

      {meta && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Bullish', count: meta.bullish, color: 'emerald', icon: <CheckCircle className="h-4 w-4" /> },
            { label: 'Neutral', count: meta.neutral, color: 'slate', icon: <MinusCircle className="h-4 w-4" /> },
            { label: 'Bearish', count: meta.bearish, color: 'red', icon: <XCircle className="h-4 w-4" /> },
          ].map((s) => (
            <Card key={s.label} className="p-3">
              <div className={`flex items-center gap-2 text-${s.color}-400 mb-1`}>
                {s.icon}
                <span className="text-xs font-mono uppercase text-slate-500">{s.label}</span>
              </div>
              <p className={`text-2xl font-bold font-mono text-${s.color}-400`}>{s.count}</p>
              <p className="text-xs text-slate-600 font-mono">of {meta.total} scanned</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
