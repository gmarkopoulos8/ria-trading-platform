import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, TrendingUp, TrendingDown, Minus, Target, Shield, Zap,
  Activity, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp,
  RefreshCw, Info, Plus, X, Briefcase,
} from 'lucide-react';
import { Card, CardHeader } from '../ui/Card';
import { api } from '../../api/client';
import { TradeVerdictHeroCard } from '../analysis/TradeVerdictHero';

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
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-400 font-light">{label}</span>
        <span className="text-[11px] font-mono font-bold text-slate-300 tabular-nums">{value}<span className="text-slate-600 font-normal">/100</span></span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ease-out opacity-80 ${colorClass}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ThesisPanel({ symbol, assetClass }: { symbol: string; assetClass?: string }) {
  const [showDetail, setShowDetail] = useState(false);
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [tradeQty, setTradeQty] = useState('');
  const [tradeEntry, setTradeEntry] = useState('');
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [tradeSuccess, setTradeSuccess] = useState(false);
  const qc = useQueryClient();

  const tradeMutation = useMutation({
    mutationFn: (body: unknown) => api.positions.open(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portfolio'] });
      setTradeSuccess(true);
      setShowTradeForm(false);
      setTradeQty('');
      setTimeout(() => setTradeSuccess(false), 3000);
    },
    onError: (err: any) => {
      setTradeError(err?.response?.data?.error ?? 'Failed to open position');
    },
  });

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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-accent-blue" />
          <div>
            <h3 className="text-sm font-semibold text-white">AI Trade Thesis</h3>
            <p className="text-[10px] text-slate-600 font-mono">
              {new Date(thesis.generatedAt).toLocaleTimeString()} · {thesis.monitoringFrequency} monitoring
            </p>
          </div>
        </div>
        <button onClick={() => refetch()} disabled={isFetching}
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <TradeVerdictHeroCard
        action={thesis.recommendedAction}
        score={thesis.convictionScore}
        holdDuration={thesis.suggestedHoldWindow}
        stopLoss={thesis.invalidationZone.level}
        takeProfit1={thesis.takeProfit1.level}
        takeProfit2={thesis.takeProfit2.level}
        thesis={thesis.thesisSummary}
        reasons={thesis.supportingReasons}
      />

      <div className="mt-4 rounded-xl bg-white/3 border border-white/6 px-4 py-3.5">
        <div className="flex items-center gap-1.5 mb-2">
          <Target className="h-3 w-3 text-blue-400" />
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest">Entry Zone</p>
        </div>
        <p className="text-base font-bold font-mono text-white tracking-tight">
          {formatPrice(thesis.entryZone.low)} – {formatPrice(thesis.entryZone.high)}
        </p>
        {thesis.entryZone.description && (
          <p className="text-[11px] text-slate-500 leading-relaxed mt-1.5">{thesis.entryZone.description.slice(0, 80)}</p>
        )}
      </div>

      <div className="flex items-center gap-2 mt-3 mb-3">
        <button
          onClick={() => {
            setTradeEntry(String(((thesis.entryZone.low + thesis.entryZone.high) / 2).toFixed(2)));
            setTradeError(null);
            setShowTradeForm((v) => !v);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            thesis.bias === 'BEARISH'
              ? 'bg-red-500/15 border-red-500/25 text-red-400 hover:bg-red-500/25'
              : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/25'
          }`}
        >
          <Briefcase className="h-3.5 w-3.5" />
          {showTradeForm ? 'Cancel' : 'Paper Trade'}
        </button>
        {tradeSuccess && (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <CheckCircle className="h-3.5 w-3.5" />Position opened
          </span>
        )}
        <button
          onClick={() => setShowDetail((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors ml-auto"
        >
          {showDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          {showDetail ? 'Hide' : 'Show'} analysis
        </button>
      </div>

      {showTradeForm && (
        <div className="mb-4 p-4 rounded-lg bg-surface-3 border border-accent-blue/20 space-y-3">
          <p className="text-xs font-semibold text-slate-400 font-mono uppercase tracking-wider">
            Quick Paper Trade · {thesis.bias === 'BEARISH' ? 'SHORT' : 'LONG'} {symbol}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] text-slate-600 font-mono mb-1">ENTRY PRICE</label>
              <input type="number" step="any" min="0"
                value={tradeEntry} onChange={(e) => setTradeEntry(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-xs outline-none focus:border-accent-blue/50"
              />
              <p className="text-[10px] text-slate-600 mt-0.5">Midpoint of entry zone</p>
            </div>
            <div>
              <label className="block text-[10px] text-slate-600 font-mono mb-1">QUANTITY</label>
              <input type="number" step="any" min="0"
                value={tradeQty} onChange={(e) => setTradeQty(e.target.value)}
                placeholder="e.g. 10"
                className="w-full px-2.5 py-1.5 bg-surface-2 border border-surface-border rounded-lg text-white font-mono text-xs outline-none focus:border-accent-blue/50"
              />
              {tradeEntry && tradeQty && !isNaN(parseFloat(tradeEntry)) && !isNaN(parseFloat(tradeQty)) && (
                <p className="text-[10px] text-slate-600 mt-0.5">
                  Cost: ${(parseFloat(tradeEntry) * parseFloat(tradeQty)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <div className="px-2.5 py-1.5 rounded bg-emerald-400/5 border border-emerald-400/10">
              <span className="text-slate-600">TP1: </span>
              <span className="text-emerald-400 font-semibold">{formatPrice(thesis.takeProfit1.level)}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded bg-red-400/5 border border-red-400/10">
              <span className="text-slate-600">Stop: </span>
              <span className="text-red-400 font-semibold">{formatPrice(thesis.invalidationZone.level)}</span>
            </div>
          </div>

          {tradeError && (
            <p className="text-xs text-red-400 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />{tradeError}
            </p>
          )}

          <button
            disabled={tradeMutation.isPending}
            onClick={() => {
              setTradeError(null);
              const ep = parseFloat(tradeEntry);
              const qty = parseFloat(tradeQty);
              if (isNaN(ep) || ep <= 0) { setTradeError('Valid entry price required'); return; }
              if (isNaN(qty) || qty <= 0) { setTradeError('Valid quantity required'); return; }
              tradeMutation.mutate({
                symbol,
                assetClass: assetClass ?? 'stock',
                side: thesis.bias === 'BEARISH' ? 'short' : 'long',
                quantity: qty,
                entryPrice: ep,
                targetPrice: thesis.takeProfit1.level,
                stopLoss: thesis.invalidationZone.level,
                thesis: thesis.thesisSummary,
                thesisHealth: thesis.thesisHealthScore,
              });
            }}
            className={`w-full py-2 text-xs font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 ${
              thesis.bias === 'BEARISH'
                ? 'bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30'
                : 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/30'
            }`}
          >
            {tradeMutation.isPending
              ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" />Opening...</>
              : <><Plus className="h-3.5 w-3.5" />Open {thesis.bias === 'BEARISH' ? 'SHORT' : 'LONG'} Position</>
            }
          </button>
        </div>
      )}

      {showDetail && (
        <div className="space-y-5 border-t border-white/6 pt-5">
          <div>
            <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-3">Score Breakdown</p>
            <div className="space-y-3">
              <ScoreBar value={thesis.marketStructureScore} label="Market Structure" colorClass={thesis.marketStructureScore >= 60 ? 'bg-emerald-400' : thesis.marketStructureScore <= 40 ? 'bg-red-400' : 'bg-amber-400'} />
              <ScoreBar value={thesis.catalystScore} label="Catalyst" colorClass={thesis.catalystScore >= 60 ? 'bg-emerald-400' : thesis.catalystScore <= 40 ? 'bg-red-400' : 'bg-amber-400'} />
              <ScoreBar value={thesis.bullishScore} label="Bullish Score" colorClass="bg-emerald-400" />
              <ScoreBar value={thesis.bearishScore} label="Bearish Score" colorClass="bg-red-400" />
              <ScoreBar value={thesis.volatilityScore} label="Volatility" colorClass={thesis.volatilityScore >= 70 ? 'bg-red-400' : thesis.volatilityScore >= 40 ? 'bg-amber-400' : 'bg-emerald-400'} />
              <ScoreBar value={thesis.riskScore} label="Risk Score" colorClass={thesis.riskScore >= 70 ? 'bg-red-400' : thesis.riskScore >= 40 ? 'bg-amber-400' : 'bg-emerald-400'} />
            </div>
          </div>

          <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 px-4 py-3.5">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[9px] font-mono text-amber-400 uppercase tracking-widest mb-1.5">Main Risk to Thesis</p>
                <p className="text-[12px] text-slate-300 leading-relaxed">{thesis.mainRiskToThesis}</p>
              </div>
            </div>
          </div>

          {thesis.monitoringPriorities.length > 0 && (
            <div>
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-3">Monitoring Priorities</p>
              <ul className="space-y-0 divide-y divide-white/4">
                {thesis.monitoringPriorities.map((priority, i) => (
                  <li key={i} className="flex items-start gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <Activity className="h-3 w-3 text-blue-400 mt-0.5 flex-shrink-0" />
                    <span className="text-[12px] text-slate-300 leading-relaxed">{priority}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="rounded-xl bg-white/3 border border-white/6 px-4 py-3.5">
            <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-2">Explanation</p>
            <p className="text-[12px] text-slate-400 leading-relaxed">{thesis.explanation}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
