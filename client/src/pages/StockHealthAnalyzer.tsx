import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  HeartPulse, Search, X, Clock, TrendingUp, TrendingDown,
  Minus, ShieldCheck, AlertTriangle, Zap, BarChart3, Activity,
  Target, ChevronDown, ChevronUp, RefreshCw, Trash2, ExternalLink
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card, CardHeader } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { TradeVerdictHeroCard, AnalysisSummaryGrid, BiasChip } from '../components/analysis/TradeVerdictHero';

type ActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';

interface HealthResult {
  ticker: string;
  companyName: string;
  exchange: string;
  currentPrice: number;
  changePercent: number;
  healthScore: number;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidenceScore: number;
  riskScore: number;
  trendState: string;
  supportZone: { min: number; max: number };
  resistanceZone: { min: number; max: number };
  volatilityState: string;
  patternsDetected: string[];
  catalystSummary: string;
  sentimentSummary: string;
  topStrengths: string[];
  topWeaknesses: string[];
  invalidationLevel: number;
  suggestedHoldWindow: string;
  actionLabel: ActionLabel;
  explanation: string;
  technicalBreakdown: Record<string, number>;
  catalystBreakdown: Record<string, number>;
  scoreWeights: Record<string, number>;
  analyzedAt: string;
  isMock: boolean;
}

interface SearchHistoryItem {
  id: string;
  ticker: string;
  lastHealthScore: number | null;
  lastActionLabel: string | null;
  searchCount: number;
  lastSearchedAt: string;
}

const ACTION_META: Record<ActionLabel, { color: string; bg: string; label: string }> = {
  'high conviction': { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', label: 'HIGH CONVICTION' },
  'tradable':        { color: 'text-accent-blue', bg: 'bg-accent-blue/15 border-accent-blue/30', label: 'TRADABLE' },
  'developing':      { color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30',  label: 'DEVELOPING' },
  'weak':            { color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30',  label: 'WEAK' },
  'avoid':           { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',       label: 'AVOID' },
};

const HEALTH_INTERPRETATION: Record<string, { label: string; color: string }> = {
  elite:  { label: 'Elite Setup',      color: 'text-emerald-400' },
  strong: { label: 'Strong Setup',     color: 'text-accent-green' },
  mixed:  { label: 'Mixed / Viable',   color: 'text-yellow-400' },
  weak:   { label: 'Weak / Caution',   color: 'text-orange-400' },
  poor:   { label: 'Unhealthy Setup',  color: 'text-red-400' },
};

function getHealthTier(score: number) {
  if (score >= 85) return HEALTH_INTERPRETATION.elite;
  if (score >= 70) return HEALTH_INTERPRETATION.strong;
  if (score >= 55) return HEALTH_INTERPRETATION.mixed;
  if (score >= 40) return HEALTH_INTERPRETATION.weak;
  return HEALTH_INTERPRETATION.poor;
}

function healthScoreColor(score: number) {
  if (score >= 85) return 'text-emerald-400';
  if (score >= 70) return 'text-accent-green';
  if (score >= 55) return 'text-yellow-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function healthRingColor(score: number) {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#22c55e';
  if (score >= 55) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function biasColor(bias: string) {
  if (bias === 'bullish') return 'text-accent-green';
  if (bias === 'bearish') return 'text-red-400';
  return 'text-slate-400';
}

function biasIcon(bias: string) {
  if (bias === 'bullish') return <TrendingUp className="h-4 w-4" />;
  if (bias === 'bearish') return <TrendingDown className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
}

function fmt(n?: number, prefix = '$') {
  if (n == null) return '—';
  if (Math.abs(n) >= 1000) return `${prefix}${(n / 1000).toFixed(2)}k`;
  return `${prefix}${n.toFixed(2)}`;
}

function ScoreGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 48;
  const progress = (score / 100) * circumference;
  const color = healthRingColor(score);
  const tier = getHealthTier(score);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 -rotate-90" viewBox="0 0 112 112">
          <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle
            cx="56" cy="56" r="48"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('text-3xl font-black font-mono', healthScoreColor(score))}>{score}</span>
          <span className="text-[10px] text-slate-500 font-mono">/100</span>
        </div>
      </div>
      <p className={cn('text-xs font-bold mt-1', tier.color)}>{tier.label}</p>
    </div>
  );
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-slate-400 font-light">{label}</span>
        <span className={cn('text-[11px] font-mono font-bold tabular-nums', color)}>{Math.round(value)}<span className="text-slate-600 font-normal">/100</span></span>
      </div>
      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700 ease-out', color.replace('text-', 'bg-'))}
          style={{ width: `${Math.min(100, value)}%`, opacity: 0.8 }}
        />
      </div>
    </div>
  );
}

function TradingViewChart({ ticker }: { ticker: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    const container = document.createElement('div');
    container.id = `tv-chart-${ticker}-${Date.now()}`;
    containerRef.current.appendChild(container);

    const script = document.createElement('script');
    script.type = 'text/javascript';
    script.async = true;
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: ticker,
      interval: 'D',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      backgroundColor: 'rgba(17, 24, 39, 1)',
      gridColor: 'rgba(255, 255, 255, 0.03)',
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      studies: [
        'STD;RSI',
        'STD;MACD',
        'STD;Bollinger_Bands',
        'STD;Volume',
      ],
      show_popup_button: false,
    });

    const wrapper = document.createElement('div');
    wrapper.className = 'tradingview-widget-container';
    wrapper.style.height = '100%';
    wrapper.style.width = '100%';

    const innerDiv = document.createElement('div');
    innerDiv.className = 'tradingview-widget-container__widget';
    innerDiv.style.height = '100%';
    innerDiv.style.width = '100%';

    wrapper.appendChild(innerDiv);
    wrapper.appendChild(script);
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(wrapper);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [ticker]);

  return (
    <div ref={containerRef} className="w-full h-full" />
  );
}

function HealthResultCard({ result, onRefresh, refreshing }: {
  result: HealthResult;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const action = ACTION_META[result.actionLabel] ?? ACTION_META['developing'];
  const tier = getHealthTier(result.healthScore);

  const techEntries = Object.entries(result.technicalBreakdown ?? {});
  const catEntries = Object.entries(result.catalystBreakdown ?? {});

  const techLabels: Record<string, string> = {
    chartStructure: 'Chart Structure',
    trend: 'Trend Direction',
    momentum: 'Momentum / RSI',
    supportResistance: 'Support / Resistance',
    volatility: 'Volatility Profile',
    patterns: 'Pattern Quality',
    multiTimeframe: 'Multi-Timeframe',
  };
  const catLabels: Record<string, string> = {
    recentDevelopments: 'Recent News',
    eventImportance: 'Event Importance',
    sentiment: 'Sentiment Trend',
    urgency: 'Urgency Signal',
    catalystBalance: 'Catalyst Balance',
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-0 h-full">
      <div className="xl:col-span-2 flex flex-col border-r border-surface-border overflow-y-auto">
        <div className="p-5 border-b border-surface-border space-y-4">
          {/* Symbol header */}
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap mb-1">
                <h2 className="text-3xl font-black text-white font-mono tracking-tight leading-none">{result.ticker}</h2>
                <span className="text-[10px] text-slate-500 bg-white/5 border border-white/8 px-2 py-0.5 rounded-md font-mono tracking-widest uppercase">{result.exchange}</span>
              </div>
              <p className="text-sm text-slate-400 font-light truncate mt-1">{result.companyName}</p>
            </div>
            <button onClick={onRefresh} disabled={refreshing}
              className="p-2 text-slate-500 hover:text-white transition-all duration-150 rounded-lg hover:bg-white/5 flex-shrink-0 ml-2">
              <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
            </button>
          </div>

          {/* Price + bias row */}
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold text-white font-mono leading-none tracking-tight">{fmt(result.currentPrice)}</p>
              <p className={cn('text-sm font-semibold mt-1', result.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {result.changePercent >= 0 ? '+' : ''}{result.changePercent?.toFixed(2)}% today
              </p>
            </div>
            <BiasChip bias={result.bias} />
          </div>

          <TradeVerdictHeroCard
            action={result.actionLabel}
            score={result.healthScore}
            holdDuration={result.suggestedHoldWindow}
            stopLoss={result.invalidationLevel}
            takeProfit1={result.resistanceZone?.min ?? null}
            takeProfit2={result.resistanceZone?.max ?? null}
            currentPrice={result.currentPrice}
            thesis={result.explanation}
            reasons={result.topStrengths}
            isMock={result.isMock}
          />
        </div>

        <div className="p-5 border-b border-surface-border">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3 font-mono">Key Analysis Summary</p>
          <AnalysisSummaryGrid
            trend={result.trendState}
            volatility={result.volatilityState}
            catalystTone={result.catalystSummary?.split('.')[0] ?? undefined}
            pattern={result.patternsDetected?.[0] ?? undefined}
            supportRange={result.supportZone ? `${fmt(result.supportZone.min)} – ${fmt(result.supportZone.max)}` : undefined}
            resistanceRange={result.resistanceZone ? `${fmt(result.resistanceZone.min)} – ${fmt(result.resistanceZone.max)}` : undefined}
          />
        </div>

        <div className="p-5 border-b border-surface-border space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-white/3 border border-white/6 p-3.5">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Confidence</p>
              <p className={cn('text-2xl font-black font-mono leading-none', healthScoreColor(result.confidenceScore))}>{result.confidenceScore}</p>
              <p className="text-[9px] text-slate-600 font-mono mt-1">/ 100</p>
            </div>
            <div className="rounded-xl bg-white/3 border border-white/6 p-3.5">
              <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Risk Score</p>
              <p className={cn('text-2xl font-black font-mono leading-none', result.riskScore >= 60 ? 'text-red-400' : result.riskScore >= 40 ? 'text-yellow-400' : 'text-emerald-400')}>{result.riskScore}</p>
              <p className="text-[9px] text-slate-600 font-mono mt-1">/ 100 · {result.riskScore >= 60 ? 'High' : result.riskScore >= 40 ? 'Medium' : 'Low'}</p>
            </div>
          </div>

          <div className="space-y-0 divide-y divide-white/4 rounded-xl border border-white/6 overflow-hidden">
            {[
              { icon: <Activity className="h-3 w-3" />, label: 'Trend', value: result.trendState, valueColor: 'text-slate-200' },
              { icon: null, label: 'Volatility', value: result.volatilityState, valueColor: 'text-slate-200' },
              { icon: null, label: 'Support Zone', value: `${fmt(result.supportZone?.min)} – ${fmt(result.supportZone?.max)}`, valueColor: 'text-emerald-400' },
              { icon: null, label: 'Resistance Zone', value: `${fmt(result.resistanceZone?.min)} – ${fmt(result.resistanceZone?.max)}`, valueColor: 'text-red-400' },
              { icon: <Target className="h-3 w-3" />, label: 'Invalidation', value: fmt(result.invalidationLevel), valueColor: 'text-orange-400' },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5 hover:bg-white/3 transition-colors">
                <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                  {row.icon}<span>{row.label}</span>
                </span>
                <span className={cn('text-[11px] font-mono font-semibold', row.valueColor)}>{row.value}</span>
              </div>
            ))}
          </div>

          {result.patternsDetected?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {result.patternsDetected.slice(0, 4).map((p, i) => (
                <span key={i} className="text-[10px] text-violet-400 bg-violet-500/8 border border-violet-500/20 px-2.5 py-1 rounded-lg font-mono">{p}</span>
              ))}
            </div>
          )}
        </div>

        <div className="p-5 border-b border-surface-border">
          <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-4">Score Composition</p>
          <div className="space-y-3">
            <ScoreBar label="Technical Structure · 30%" value={result.scoreWeights?.technical ?? 0} color="text-blue-400" />
            <ScoreBar label="Catalyst / News · 20%" value={result.scoreWeights?.catalyst ?? 0} color="text-violet-400" />
            <ScoreBar label="Momentum / Trend · 15%" value={result.scoreWeights?.momentum ?? 0} color="text-teal-400" />
            <ScoreBar label="Risk Profile · 15%" value={result.scoreWeights?.risk ?? 0} color="text-emerald-400" />
            <ScoreBar label="Volatility Fit · 10%" value={result.scoreWeights?.volatility ?? 0} color="text-orange-400" />
            <ScoreBar label="Liquidity · 10%" value={result.scoreWeights?.liquidity ?? 0} color="text-yellow-400" />
          </div>
        </div>

        <div className="p-5 border-b border-surface-border grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Strengths</p>
            </div>
            <ul className="space-y-0 divide-y divide-white/4">
              {result.topStrengths?.map((s, i) => (
                <li key={i} className="flex gap-2.5 items-start py-2 first:pt-0 last:pb-0">
                  <span className="flex-shrink-0 mt-0.5 text-emerald-400 text-[10px]">✓</span>
                  <span className="text-[11px] text-slate-300 leading-relaxed">{s}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
              <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest">Weaknesses</p>
            </div>
            <ul className="space-y-0 divide-y divide-white/4">
              {result.topWeaknesses?.map((w, i) => (
                <li key={i} className="flex gap-2.5 items-start py-2 first:pt-0 last:pb-0">
                  <span className="flex-shrink-0 mt-0.5 text-red-400 text-[10px]">✗</span>
                  <span className="text-[11px] text-slate-300 leading-relaxed">{w}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-1.5 mb-2">
            <Zap className="h-3.5 w-3.5 text-accent-purple" />
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-mono">Catalyst Intelligence</p>
          </div>
          <p className="text-xs text-slate-300 mb-2">{result.catalystSummary}</p>
          <p className="text-xs text-slate-500 italic">{result.sentimentSummary}</p>

          <button onClick={() => setShowBreakdown((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white mt-3 transition-colors">
            {showBreakdown ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {showBreakdown ? 'Hide' : 'Show'} detailed breakdown
          </button>

          {showBreakdown && (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                  <BarChart3 className="h-3 w-3" /> Technical Breakdown
                </p>
                <div className="space-y-1.5">
                  {techEntries.map(([k, v]) => (
                    <ScoreBar key={k} label={techLabels[k] ?? k} value={v} color="text-accent-blue" />
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-mono flex items-center gap-1.5">
                  <Zap className="h-3 w-3" /> Catalyst Breakdown
                </p>
                <div className="space-y-1.5">
                  {catEntries.map(([k, v]) => (
                    <ScoreBar key={k} label={catLabels[k] ?? k} value={v} color="text-accent-purple" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="xl:col-span-3 flex flex-col min-h-[500px] xl:min-h-0">
        <div className="flex items-center justify-between px-4 py-2 border-b border-surface-border bg-surface-2/40 flex-shrink-0">
          <span className="text-xs text-slate-400 font-mono">{result.ticker} · Daily Chart</span>
          <Link to={`https://www.tradingview.com/chart/?symbol=${result.ticker}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-accent-blue transition-colors">
            TradingView <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex-1 overflow-hidden">
          <TradingViewChart ticker={result.ticker} />
        </div>
      </div>
    </div>
  );
}

function SearchHistoryPanel({ onSelect }: { onSelect: (ticker: string) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['stock-search-history'],
    queryFn: () => api.stocks.searchHistory(20),
    staleTime: 30_000,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.stocks.clearHistory(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-search-history'] });
      toast.success('Search history cleared');
    },
  });

  const history: SearchHistoryItem[] = (data as any)?.data?.history ?? [];
  if (history.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 mt-1 bg-surface-1 border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-surface-border">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1.5">
          <Clock className="h-3 w-3" /> Recent searches
        </span>
        <button onClick={() => clearMutation.mutate()} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors flex items-center gap-1">
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto">
        {history.map((item) => {
          const actionMeta = item.lastActionLabel ? ACTION_META[item.lastActionLabel as ActionLabel] : null;
          return (
            <button key={item.id} onClick={() => onSelect(item.ticker)}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-surface-2 transition-colors text-left">
              <div className="flex items-center gap-3">
                <span className="font-bold text-white text-sm font-mono">{item.ticker}</span>
                <span className="text-[10px] text-slate-500">×{item.searchCount}</span>
              </div>
              <div className="flex items-center gap-2">
                {item.lastHealthScore != null && (
                  <span className={cn('text-xs font-mono font-bold', healthScoreColor(item.lastHealthScore))}>
                    {Math.round(item.lastHealthScore)}
                  </span>
                )}
                {actionMeta && (
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', actionMeta.bg, actionMeta.color)}>
                    {actionMeta.label}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const POPULAR_TICKERS = ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'JPM', 'AMD', 'NFLX'];

export default function StockHealthAnalyzer() {
  const qc = useQueryClient();
  const [inputValue, setInputValue] = useState('');
  const [activeTicker, setActiveTicker] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: resultData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['stock-health', activeTicker],
    queryFn: () => api.stocks.health(activeTicker!),
    enabled: !!activeTicker,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const result: HealthResult | null = (resultData as any)?.data ?? null;
  const errorMsg = (error as any)?.response?.data?.error ?? (error as any)?.message ?? 'Analysis failed';

  const handleSearch = useCallback((ticker: string) => {
    const t = ticker.toUpperCase().trim();
    if (!t) return;
    setActiveTicker(t);
    setInputValue(t);
    setShowHistory(false);
    qc.invalidateQueries({ queryKey: ['stock-search-history'] });
  }, [qc]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch(inputValue);
    if (e.key === 'Escape') setShowHistory(false);
  };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <HeartPulse className="h-4 w-4 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Stock Health Analyzer</h1>
            <p className="text-xs text-slate-500">NYSE / NASDAQ — AI research verdict with explainable scoring</p>
          </div>
        </div>

        <div ref={searchRef} className="relative max-w-2xl">
          <div className="relative flex items-center">
            <Search className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              onFocus={() => setShowHistory(true)}
              placeholder="Enter ticker — AAPL, NVDA, MSFT, JPM…"
              className="w-full pl-10 pr-20 py-3 bg-surface-2 border border-surface-border rounded-xl text-white placeholder-slate-600 text-sm font-mono focus:outline-none focus:border-accent-blue/60 focus:bg-surface-3 transition-all"
            />
            {inputValue && (
              <button onClick={() => { setInputValue(''); inputRef.current?.focus(); }}
                className="absolute right-[72px] text-slate-500 hover:text-white transition-colors p-1">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => handleSearch(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              className={cn(
                'absolute right-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all',
                !inputValue.trim() || isLoading ? 'bg-surface-border text-slate-600 cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-500'
              )}
            >
              {isLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : 'Analyze'}
            </button>
          </div>

          {showHistory && (
            <SearchHistoryPanel onSelect={handleSearch} />
          )}
        </div>

        {!activeTicker && (
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px] text-slate-600 uppercase tracking-wider">Popular:</span>
            {POPULAR_TICKERS.map((t) => (
              <button key={t} onClick={() => handleSearch(t)}
                className="text-xs text-slate-400 hover:text-white bg-surface-2 hover:bg-surface-3 border border-surface-border px-2.5 py-1 rounded-lg transition-colors font-mono">
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {!activeTicker ? (
          <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
            <div className="w-20 h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <HeartPulse className="h-9 w-9 text-emerald-400/60" />
            </div>
            <div className="text-center max-w-md">
              <h2 className="text-lg font-bold text-white mb-2">Enter a stock ticker to begin</h2>
              <p className="text-slate-500 text-sm">
                Search any NYSE or NASDAQ-listed stock to receive an instant AI research verdict — Stock Health Score, bias, action label, and full explainability.
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-xl">
              {[
                { score: '85–100', label: 'Elite Setup', color: 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' },
                { score: '70–84',  label: 'Strong Setup', color: 'text-accent-green border-accent-green/20 bg-accent-green/5' },
                { score: '55–69',  label: 'Mixed / Viable', color: 'text-yellow-400 border-yellow-500/20 bg-yellow-500/5' },
                { score: 'below 55', label: 'Weak / Avoid', color: 'text-red-400 border-red-500/20 bg-red-500/5' },
              ].map((tier) => (
                <div key={tier.score} className={cn('border rounded-xl p-3 text-center', tier.color)}>
                  <p className="font-mono font-bold text-sm">{tier.score}</p>
                  <p className="text-xs opacity-70 mt-0.5">{tier.label}</p>
                </div>
              ))}
            </div>
          </div>
        ) : isLoading ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <LoadingState message={`Analyzing ${activeTicker} — running AI agents…`} size="lg" />
            <p className="text-xs text-slate-600">Technical · Catalyst · Risk · Thesis</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
            <AlertTriangle className="h-10 w-10 text-red-400" />
            <div>
              <p className="text-white font-semibold mb-1">Analysis failed for {activeTicker}</p>
              <p className="text-slate-400 text-sm max-w-sm">{errorMsg}</p>
            </div>
            <button onClick={() => { setActiveTicker(null); setInputValue(''); inputRef.current?.focus(); }}
              className="text-xs text-accent-blue hover:underline">
              Try another ticker
            </button>
          </div>
        ) : result ? (
          <HealthResultCard
            result={result}
            onRefresh={() => { qc.invalidateQueries({ queryKey: ['stock-health', activeTicker] }); refetch(); }}
            refreshing={isLoading}
          />
        ) : null}
      </div>
    </div>
  );
}
