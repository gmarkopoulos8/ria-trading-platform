import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Brain, TrendingUp, TrendingDown, Minus, Target, Shield, Zap,
  Activity, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  RefreshCw, Info,
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { api } from '../../api/client';

type Bias = 'BULLISH' | 'BEARISH' | 'NEUTRAL';
type RecommendedAction = 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT' | 'STRONG_SHORT';

interface PriceZone { low: number; high: number; description: string; }
interface PriceLevel { level: number; description: string; }

interface ThesisOutput {
  symbol: string;
  bias: Bias;
  convictionScore: number;
  confidenceScore: number;
  riskScore: number;
  volatilityScore: number;
  bullishScore: number;
  bearishScore: number;
  thesisHealthScore: number;
  monitoringFrequency: string;
  entryZone: PriceZone;
  invalidationZone: PriceLevel;
  takeProfit1: PriceLevel;
  takeProfit2: PriceLevel;
  suggestedHoldWindow: string;
  thesisSummary: string;
  supportingReasons: string[];
  mainRiskToThesis: string;
  monitoringPriorities: string[];
  recommendedAction: RecommendedAction;
  explanation: string;
  marketStructureScore: number;
  catalystScore: number;
  generatedAt: string;
}

function formatPrice(p: number): string {
  if (p < 1) return `$${p.toFixed(4)}`;
  if (p >= 10000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  if (p >= 1000) return `$${p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${p.toFixed(2)}`;
}

function biasStyle(bias: Bias) {
  if (bias === 'BULLISH') return { text: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' };
  if (bias === 'BEARISH') return { text: 'text-red-400', bg: 'bg-red-400/10 border-red-400/20' };
  return { text: 'text-slate-400', bg: 'bg-slate-700/30 border-slate-600/20' };
}

function actionStyle(action: RecommendedAction): string {
  const m: Record<RecommendedAction, string> = {
    STRONG_BUY: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    BUY: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
    WATCH: 'bg-amber-400/10 text-amber-400 border-amber-400/20',
    AVOID: 'bg-slate-700/40 text-slate-500 border-slate-600/20',
    SHORT: 'bg-red-400/10 text-red-400 border-red-400/20',
    STRONG_SHORT: 'bg-red-500/20 text-red-300 border-red-500/30',
  };
  return m[action] ?? m.WATCH;
}

function ScoreRing({ value, label, color }: { value: number; label: string; color: string }) {
  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (value / 100) * circumference;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg className="w-14 h-14 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="4" className="text-surface-4" />
          <circle cx="24" cy="24" r="20" fill="none" strokeWidth="4"
            className={color} strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold font-mono text-white">{value}</span>
        </div>
      </div>
      <p className="text-[10px] text-slate-600 font-mono text-center leading-tight">{label}</p>
    </div>
  );
}

function ScoreBar({ value, label, colorClass }: { value: number; label: string; colorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-400">{value}/100</span>
      </div>
      <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ThesisPanel({ symbol, assetClass }: { symbol: string; assetClass?: string }) {
  const [showDetail, setShowDetail] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['thesis', symbol],
    queryFn: async () => {
      const r = await api.symbols.thesis(symbol, assetClass) as {
        success: boolean;
        data?: { thesis: ThesisOutput };
      };
      return r.data?.thesis ?? null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,
  });

  const thesis = data;
  const bs = thesis ? biasStyle(thesis.bias) : null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="AI Trade Thesis" icon={<Brain className="h-4 w-4" />} />
        <div className="mt-4 flex items-center gap-3 text-sm text-slate-500">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Running multi-agent analysis...
        </div>
      </Card>
    );
  }

  if (isError || !thesis) {
    return (
      <Card>
        <CardHeader title="AI Trade Thesis" icon={<Brain className="h-4 w-4" />} />
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Info className="h-4 w-4 text-amber-400" />
          Analysis unavailable for this symbol.
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent-blue" />
          <div>
            <h3 className="text-sm font-semibold text-white">AI Trade Thesis</h3>
            <p className="text-[10px] text-slate-600 font-mono">
              {new Date(thesis.generatedAt).toLocaleTimeString()} · {thesis.monitoringFrequency} monitoring
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border font-mono ${bs?.bg}`}>
            {thesis.bias}
          </span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border font-mono ${actionStyle(thesis.recommendedAction)}`}>
            {thesis.recommendedAction.replace(/_/g, ' ')}
          </span>
          <button onClick={() => refetch()} disabled={isFetching}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex justify-center gap-4 mb-4">
        <ScoreRing value={thesis.convictionScore} label="Conviction" color="stroke-accent-blue" />
        <ScoreRing value={thesis.confidenceScore} label="Confidence" color="stroke-violet-400" />
        <ScoreRing value={thesis.thesisHealthScore} label="Thesis Health" color="stroke-emerald-400" />
        <ScoreRing value={100 - thesis.riskScore} label="Safety" color="stroke-amber-400" />
        <ScoreRing
          value={thesis.bias === 'BULLISH' ? thesis.bullishScore : thesis.bearishScore}
          label={thesis.bias === 'BULLISH' ? 'Bull Score' : 'Bear Score'}
          color={thesis.bias === 'BULLISH' ? 'stroke-emerald-400' : 'stroke-red-400'}
        />
      </div>

      <p className="text-xs text-slate-400 leading-relaxed mb-4">{thesis.thesisSummary}</p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
          <div className="flex items-center gap-1 mb-1">
            <Target className="h-3 w-3 text-accent-blue" />
            <p className="text-[10px] text-slate-600 font-mono uppercase">Entry Zone</p>
          </div>
          <p className="text-xs font-mono font-semibold text-white">
            {formatPrice(thesis.entryZone.low)}–{formatPrice(thesis.entryZone.high)}
          </p>
          <p className="text-[10px] text-slate-600 leading-tight mt-0.5">{thesis.entryZone.description.slice(0, 40)}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-red-400/5 border border-red-400/10">
          <div className="flex items-center gap-1 mb-1">
            <Shield className="h-3 w-3 text-red-400" />
            <p className="text-[10px] text-slate-600 font-mono uppercase">Invalidation</p>
          </div>
          <p className="text-xs font-mono font-semibold text-red-400">{formatPrice(thesis.invalidationZone.level)}</p>
          <p className="text-[10px] text-slate-600 leading-tight mt-0.5">{thesis.invalidationZone.description.slice(0, 40)}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-emerald-400" />
            <p className="text-[10px] text-slate-600 font-mono uppercase">Take Profit 1</p>
          </div>
          <p className="text-xs font-mono font-semibold text-emerald-400">{formatPrice(thesis.takeProfit1.level)}</p>
        </div>

        <div className="p-2.5 rounded-lg bg-emerald-400/5 border border-emerald-400/10">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="h-3 w-3 text-emerald-400/70" />
            <p className="text-[10px] text-slate-600 font-mono uppercase">Take Profit 2</p>
          </div>
          <p className="text-xs font-mono font-semibold text-emerald-400/80">{formatPrice(thesis.takeProfit2.level)}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 p-2.5 rounded-lg bg-surface-3 border border-surface-border">
        <Clock className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
        <div className="flex-1 text-xs font-mono">
          <span className="text-slate-600">Hold window: </span>
          <span className="text-white font-semibold">{thesis.suggestedHoldWindow}</span>
          <span className="mx-2 text-slate-700">·</span>
          <span className="text-slate-600">Monitor: </span>
          <span className="text-white">{thesis.monitoringFrequency.toLowerCase()}</span>
        </div>
      </div>

      <button
        onClick={() => setShowDetail((v) => !v)}
        className="flex items-center gap-2 text-xs text-accent-blue hover:text-accent-blue/80 transition-colors mb-3"
      >
        {showDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {showDetail ? 'Hide' : 'Show'} detailed analysis
      </button>

      {showDetail && (
        <div className="space-y-4 border-t border-surface-border pt-4">
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <ScoreBar value={thesis.marketStructureScore} label="Market Structure" colorClass={thesis.marketStructureScore >= 60 ? 'bg-emerald-400' : thesis.marketStructureScore <= 40 ? 'bg-red-400' : 'bg-amber-400'} />
              <ScoreBar value={thesis.catalystScore} label="Catalyst" colorClass={thesis.catalystScore >= 60 ? 'bg-emerald-400' : thesis.catalystScore <= 40 ? 'bg-red-400' : 'bg-amber-400'} />
              <ScoreBar value={thesis.bullishScore} label="Bullish Score" colorClass="bg-emerald-400" />
              <ScoreBar value={thesis.bearishScore} label="Bearish Score" colorClass="bg-red-400" />
              <ScoreBar value={thesis.volatilityScore} label="Volatility" colorClass={thesis.volatilityScore >= 70 ? 'bg-red-400' : thesis.volatilityScore >= 40 ? 'bg-amber-400' : 'bg-emerald-400'} />
              <ScoreBar value={thesis.riskScore} label="Risk Score" colorClass={thesis.riskScore >= 70 ? 'bg-red-400' : thesis.riskScore >= 40 ? 'bg-amber-400' : 'bg-emerald-400'} />
            </div>
          </div>

          {thesis.supportingReasons.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2">Supporting Reasons</p>
              <ul className="space-y-1.5">
                {thesis.supportingReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="h-3 w-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-slate-400">{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-amber-400 font-mono font-semibold uppercase mb-0.5">Main Risk to Thesis</p>
                <p className="text-xs text-slate-400">{thesis.mainRiskToThesis}</p>
              </div>
            </div>
          </div>

          {thesis.monitoringPriorities.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2">Monitoring Priorities</p>
              <ul className="space-y-1">
                {thesis.monitoringPriorities.map((priority, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Activity className="h-3 w-3 text-accent-blue mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-slate-400">{priority}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="p-3 rounded-lg bg-surface-3 border border-surface-border">
            <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-1.5">Explanation</p>
            <p className="text-xs text-slate-400 leading-relaxed">{thesis.explanation}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
