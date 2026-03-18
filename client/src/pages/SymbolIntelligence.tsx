import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, TrendingUp, TrendingDown, Activity, Zap, BarChart2,
  RefreshCw, AlertCircle, ChevronUp, ChevronDown, Target,
  TriangleIcon, Layers, Flame, Newspaper, Clock, ExternalLink,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { api } from '../api/client';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

type Timeframe = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y';
const TIMEFRAMES: Timeframe[] = ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'];

interface Quote {
  symbol: string; name: string; price: number; open: number; high: number; low: number;
  previousClose: number; change: number; changePercent: number; volume: number;
  marketCap?: number; high52Week?: number; low52Week?: number;
  currency: string; assetClass: string; exchange?: string; isMock?: boolean;
}

interface OHLCVBar { timestamp: string; open: number; high: number; low: number; close: number; volume: number; }

interface TechnicalAnalysis {
  ticker: string; timeframe: string; currentPrice: number; analyzedAt: string;
  sma: { sma20: number | null; sma50: number | null; sma200: number | null; signal: string; explanation: string };
  ema: { ema9: number | null; ema21: number | null; ema50: number | null; signal: string; explanation: string };
  rsi: { value: number | null; signal: string; zone: string; explanation: string };
  macd: { macdLine: number | null; signalLine: number | null; histogram: number | null; signal: string; explanation: string };
  atr: { value: number | null; valuePercent: number | null; volatility: string; explanation: string };
  volume: { currentVolume: number; avgVolume: number; ratio: number; trend: string; signal: string; explanation: string };
  supportResistance: { supports: number[]; resistances: number[]; nearestSupport: number | null; nearestResistance: number | null; explanation: string };
  trend: { direction: string; strength: string; priceVsSma20: string; priceVsSma50: string; priceVsSma200: string; slopeAngle: number; explanation: string };
  relativeStrength: { value: number; percentile: number; signal: string; explanation: string };
  technicalScore: number;
  scoreExplanation: string;
  overallSignal: string;
  summary: string;
}

interface PatternResult {
  type: string; direction: string; confidence: number; priceTarget: number | null;
  stopLoss: number | null; description: string; explanation: string;
  startDate: string | null; endDate: string | null;
}

interface PatternAnalysis { ticker: string; timeframe: string; patterns: PatternResult[]; dominantPattern: PatternResult | null; analyzedAt: string; }

function formatPrice(price: number, currency = 'USD'): string {
  if (price < 0.001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function formatVolume(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}

function formatChartDate(ts: string, timeframe: Timeframe): string {
  const d = new Date(ts);
  if (timeframe === '1D') return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (timeframe === '1W') return d.toLocaleDateString('en-US', { weekday: 'short' });
  if (timeframe === '5Y') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function signalColor(signal: string): string {
  if (signal === 'BULLISH') return 'text-emerald-400';
  if (signal === 'BEARISH') return 'text-red-400';
  return 'text-slate-400';
}

function signalBg(signal: string): string {
  if (signal === 'BULLISH') return 'bg-emerald-400/10 border-emerald-400/20 text-emerald-400';
  if (signal === 'BEARISH') return 'bg-red-400/10 border-red-400/20 text-red-400';
  return 'bg-slate-700/40 border-slate-600/30 text-slate-400';
}

function scoreColor(score: number): string {
  if (score >= 65) return 'text-emerald-400';
  if (score <= 35) return 'text-red-400';
  return 'text-amber-400';
}

function scoreBarColor(score: number): string {
  if (score >= 65) return 'bg-emerald-400';
  if (score <= 35) return 'bg-red-400';
  return 'bg-amber-400';
}

function patternColor(direction: string) {
  if (direction === 'BULLISH') return 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5';
  if (direction === 'BEARISH') return 'text-red-400 border-red-400/20 bg-red-400/5';
  return 'text-slate-400 border-slate-600/30 bg-slate-700/20';
}

function RSIGauge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-slate-600 text-xs">—</span>;
  const pct = (value / 100) * 100;
  let color = 'bg-amber-400';
  let label = 'Neutral';
  if (value >= 70) { color = 'bg-red-400'; label = 'Overbought'; }
  else if (value <= 30) { color = 'bg-emerald-400'; label = 'Oversold'; }
  else if (value >= 55) { color = 'bg-emerald-400'; label = 'Bullish zone'; }
  else if (value <= 45) { color = 'bg-red-400'; label = 'Bearish zone'; }
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-center">
        <span className="text-xl font-bold font-mono text-white">{value}</span>
        <span className="text-xs text-slate-500 font-mono">{label}</span>
      </div>
      <div className="h-2 bg-surface-4 rounded-full relative overflow-visible">
        <div className="absolute inset-0 flex">
          <div className="flex-1 bg-emerald-400/20 rounded-l-full" />
          <div className="flex-1 bg-amber-400/10" />
          <div className="flex-1 bg-red-400/20 rounded-r-full" />
        </div>
        <div
          className={`absolute top-0 h-2 rounded-full ${color} transition-all`}
          style={{ left: `${pct}%`, width: '3px', transform: 'translateX(-50%)' }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-600 font-mono">
        <span>0</span><span>30 · oversold</span><span>70 · overbought</span><span>100</span>
      </div>
    </div>
  );
}

function MACDBar({ histogram }: { histogram: number | null }) {
  if (histogram === null) return <span className="text-slate-600 text-xs">—</span>;
  const isPos = histogram >= 0;
  const size = Math.min(100, Math.abs(histogram) * 200);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 flex items-center h-5 bg-surface-4 rounded overflow-hidden">
        <div className="flex-1 flex justify-end">
          {!isPos && (
            <div className="h-full bg-red-400/60 rounded-l" style={{ width: `${size}%` }} />
          )}
        </div>
        <div className="w-px bg-slate-600 h-4" />
        <div className="flex-1">
          {isPos && (
            <div className="h-full bg-emerald-400/60 rounded-r" style={{ width: `${size}%` }} />
          )}
        </div>
      </div>
      <span className={`text-xs font-mono ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPos ? '+' : ''}{histogram.toFixed(4)}
      </span>
    </div>
  );
}

function SRLevels({ sr, currentPrice }: { sr: TechnicalAnalysis['supportResistance']; currentPrice: number }) {
  const all = [
    ...sr.resistances.slice(0, 3).map((r) => ({ price: r, type: 'R' })),
    ...sr.supports.slice(0, 3).map((s) => ({ price: s, type: 'S' })),
  ].sort((a, b) => b.price - a.price);

  if (!all.length) return <p className="text-slate-600 text-xs">Insufficient data</p>;

  return (
    <div className="space-y-1">
      {all.map((level, i) => {
        const isCurrent = Math.abs(level.price - currentPrice) / currentPrice < 0.005;
        const isR = level.type === 'R';
        const dist = ((level.price - currentPrice) / currentPrice * 100).toFixed(1);
        return (
          <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded text-xs font-mono ${isCurrent ? 'bg-amber-400/10' : ''}`}>
            <span className={`w-4 text-center font-bold ${isR ? 'text-red-400' : 'text-emerald-400'}`}>{level.type}</span>
            <span className="flex-1 text-white">${level.price.toFixed(2)}</span>
            <span className={`text-[10px] ${Number(dist) > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {Number(dist) > 0 ? '+' : ''}{dist}%
            </span>
          </div>
        );
      })}
      <div className="flex items-center gap-2 px-2 py-1 rounded bg-accent-blue/10 text-xs font-mono">
        <span className="w-4 text-center font-bold text-accent-blue">▶</span>
        <span className="flex-1 text-accent-blue">${currentPrice.toFixed(2)}</span>
        <span className="text-[10px] text-slate-500">now</span>
      </div>
    </div>
  );
}

function MAAlignment({ sma, currentPrice }: { sma: TechnicalAnalysis['sma']; currentPrice: number }) {
  const levels = [
    { label: 'SMA 20', value: sma.sma20 },
    { label: 'SMA 50', value: sma.sma50 },
    { label: 'SMA 200', value: sma.sma200 },
  ];
  return (
    <div className="space-y-2">
      {levels.map(({ label, value }) => {
        if (value === null) return (
          <div key={label} className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-600">{label}</span>
            <span className="text-slate-700">n/a</span>
          </div>
        );
        const above = currentPrice > value;
        const dist = ((currentPrice - value) / value * 100).toFixed(1);
        return (
          <div key={label} className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400">{label}</span>
            <div className="flex items-center gap-2">
              <span className="text-white">${value.toFixed(2)}</span>
              <span className={`text-[10px] ${above ? 'text-emerald-400' : 'text-red-400'}`}>
                {above ? '▲' : '▼'} {Math.abs(Number(dist))}%
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PatternBadge({ pattern }: { pattern: PatternResult }) {
  const confidencePct = Math.round(pattern.confidence * 100);
  return (
    <div className={`p-3 rounded-lg border ${patternColor(pattern.direction)}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-xs font-semibold">{pattern.description}</span>
        <span className="text-[10px] font-mono opacity-70 flex-shrink-0">{confidencePct}% conf</span>
      </div>
      <p className="text-[11px] opacity-60 leading-snug">{pattern.explanation}</p>
      {pattern.priceTarget && (
        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono">
          <span>Target: ${pattern.priceTarget.toFixed(2)}</span>
          {pattern.stopLoss && <span>Stop: ${pattern.stopLoss.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}

function SearchSuggestions({ query, onSelect }: { query: string; onSelect: (symbol: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['symbol-search', query],
    queryFn: async () => {
      const r = await api.symbols.search(query) as { success: boolean; data?: { results: Array<{ symbol: string; name: string; assetClass: string }> } };
      return r.data?.results ?? [];
    },
    enabled: query.length >= 1,
    staleTime: 30_000,
  });
  if (!query || query.length < 1) return null;
  if (isLoading) return (
    <div className="absolute top-full mt-1 left-0 right-0 bg-surface-2 border border-surface-border rounded-xl shadow-2xl z-50 p-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />Searching...
      </div>
    </div>
  );
  if (!data?.length) return null;
  return (
    <div className="absolute top-full mt-1 left-0 right-0 bg-surface-2 border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden">
      {data.map((r) => (
        <button key={`${r.symbol}-${r.assetClass}`} onClick={() => onSelect(r.symbol)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3 transition-colors text-left">
          <div className="w-8 h-8 rounded-lg bg-surface-3 border border-surface-border flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-accent-blue font-mono">{r.symbol.slice(0, 2)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white font-mono">{r.symbol}</p>
            <p className="text-xs text-slate-500 truncate">{r.name}</p>
          </div>
          <Badge variant={r.assetClass === 'crypto' ? 'purple' : 'info'}>{r.assetClass.toUpperCase()}</Badge>
        </button>
      ))}
    </div>
  );
}

function PriceChart({ symbol, timeframe, supports, resistances }: {
  symbol: string; timeframe: Timeframe;
  supports?: number[]; resistances?: number[];
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['history', symbol, timeframe],
    queryFn: async () => {
      const r = await api.symbols.history(symbol, timeframe) as { success: boolean; data?: { bars: OHLCVBar[] } };
      return r.data?.bars ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
  if (isLoading) return <LoadingState message="Loading chart..." className="h-64" />;
  if (isError) return <ErrorState message="Failed to load chart data" onRetry={refetch} className="h-64" />;
  if (!data?.length) return (
    <EmptyState icon={<BarChart2 className="h-8 w-8" />} title="No chart data" description="No price history available" className="h-64" />
  );
  const chartData = data.map((bar) => ({ ts: bar.timestamp, label: formatChartDate(bar.timestamp, timeframe), close: bar.close }));
  const prices = chartData.map((d) => d.close);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = chartData[0]?.close ?? 0;
  const lastPrice = chartData.at(-1)?.close ?? 0;
  const isUp = lastPrice >= firstPrice;
  const strokeColor = isUp ? '#22d3ee' : '#f87171';
  const gradientId = `gradient-${symbol}`;
  const stride = Math.ceil(chartData.length / 6);
  const tickLabels = chartData.filter((_, i) => i % stride === 0 || i === chartData.length - 1).map((d) => d.ts);
  const chartMin = minPrice * 0.994;
  const chartMax = maxPrice * 1.006;
  const visibleSupports = (supports ?? []).filter((s) => s >= chartMin && s <= chartMax).slice(0, 2);
  const visibleResists = (resistances ?? []).filter((r) => r >= chartMin && r <= chartMax).slice(0, 2);

  return (
    <ResponsiveContainer width="100%" height={256}>
      <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
            <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="ts" tickFormatter={(ts) => formatChartDate(ts, timeframe)} ticks={tickLabels}
          tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }} axisLine={false} tickLine={false} />
        <YAxis domain={[chartMin, chartMax]}
          tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : v < 1 ? `$${v.toFixed(4)}` : `$${v.toFixed(2)}`}
          tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }} axisLine={false} tickLine={false} width={72} />
        <Tooltip
          contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '8px', fontSize: '12px', fontFamily: 'monospace' }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(val) => [formatPrice(Number(val ?? 0)), 'Close']}
          labelFormatter={(ts) => formatChartDate(String(ts), timeframe)}
        />
        {visibleSupports.map((s) => (
          <ReferenceLine key={`s-${s}`} y={s} stroke="#34d399" strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
        ))}
        {visibleResists.map((r) => (
          <ReferenceLine key={`r-${r}`} y={r} stroke="#f87171" strokeDasharray="4 3" strokeOpacity={0.5} strokeWidth={1} />
        ))}
        <Area type="monotone" dataKey="close" stroke={strokeColor} strokeWidth={1.5}
          fill={`url(#${gradientId})`} dot={false} activeDot={{ r: 3, fill: strokeColor }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function TechnicalPanel({ symbol, timeframe, assetClass }: { symbol: string; timeframe: Timeframe; assetClass?: string }) {
  const { data: techData, isLoading, isError } = useQuery({
    queryKey: ['technical', symbol, timeframe],
    queryFn: async () => {
      const r = await api.symbols.technical(symbol, timeframe, assetClass) as {
        success: boolean; data?: { analysis: TechnicalAnalysis };
      };
      return r.data?.analysis ?? null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,
  });

  const { data: patternsData, isLoading: pLoading } = useQuery({
    queryKey: ['patterns', symbol, timeframe],
    queryFn: async () => {
      const r = await api.symbols.patterns(symbol, timeframe, assetClass) as {
        success: boolean; data?: { patterns: PatternAnalysis };
      };
      return r.data?.patterns ?? null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,
  });

  if (isLoading) return <LoadingState message="Running technical analysis..." />;
  if (isError || !techData) return (
    <Card>
      <div className="flex items-center gap-2 text-slate-500 text-sm p-2">
        <AlertCircle className="h-4 w-4" /> Technical analysis unavailable
      </div>
    </Card>
  );

  const ta = techData;
  const patterns = patternsData?.patterns ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start justify-between mb-4">
          <CardHeader title="Technical Score" subtitle={ta.summary} icon={<Zap className="h-4 w-4" />} />
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-3xl font-bold font-mono ${scoreColor(ta.technicalScore)}`}>{ta.technicalScore}</span>
            <span className="text-slate-600 text-sm font-mono">/100</span>
          </div>
        </div>
        <div className="h-2 bg-surface-4 rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all ${scoreBarColor(ta.technicalScore)}`}
            style={{ width: `${ta.technicalScore}%` }} />
        </div>
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${signalBg(ta.overallSignal)}`}>
          {ta.overallSignal === 'BULLISH' ? <TrendingUp className="h-3 w-3" /> : ta.overallSignal === 'BEARISH' ? <TrendingDown className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
          {ta.overallSignal}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="RSI (14)" subtitle={ta.rsi.zone} icon={<Activity className="h-4 w-4" />} />
          <div className="mt-3">
            <RSIGauge value={ta.rsi.value} />
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">{ta.rsi.explanation}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="MACD (12/26/9)" subtitle={`Signal: ${ta.macd.signal}`} icon={<BarChart2 className="h-4 w-4" />} />
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">MACD Line</span>
              <span className={signalColor(ta.macd.signal)}>{ta.macd.macdLine?.toFixed(4) ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500">Signal Line</span>
              <span className="text-slate-300">{ta.macd.signalLine?.toFixed(4) ?? '—'}</span>
            </div>
            <div>
              <p className="text-xs text-slate-500 font-mono mb-1">Histogram</p>
              <MACDBar histogram={ta.macd.histogram} />
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{ta.macd.explanation}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Trend" subtitle={`${ta.trend.strength} · ${ta.trend.direction}`} icon={<TrendingUp className="h-4 w-4" />} />
          <div className="mt-3 space-y-2">
            <div className={`flex items-center gap-2 p-2 rounded-lg border ${signalBg(ta.trend.direction)}`}>
              {ta.trend.direction === 'BULLISH' ? <TrendingUp className="h-3.5 w-3.5" /> : ta.trend.direction === 'BEARISH' ? <TrendingDown className="h-3.5 w-3.5" /> : <Activity className="h-3.5 w-3.5" />}
              <span className="text-xs font-semibold">{ta.trend.strength} {ta.trend.direction}</span>
              <span className="ml-auto text-[10px] font-mono opacity-60">{ta.trend.slopeAngle > 0 ? '+' : ''}{ta.trend.slopeAngle}°</span>
            </div>
            <MAAlignment sma={ta.sma} currentPrice={ta.currentPrice} />
            <p className="text-[11px] text-slate-500 leading-snug">{ta.trend.explanation}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="ATR & Volatility" subtitle={ta.atr.volatility} icon={<Flame className="h-4 w-4" />} />
          <div className="mt-3 space-y-2">
            <div className="flex items-end gap-2">
              <span className="text-2xl font-bold font-mono text-white">${ta.atr.value?.toFixed(2) ?? '—'}</span>
              <span className="text-sm text-slate-500 font-mono mb-0.5">{ta.atr.valuePercent}% of price</span>
            </div>
            <div className={`px-2 py-1 rounded text-xs font-semibold inline-block ${
              ta.atr.volatility === 'HIGH' ? 'bg-red-400/10 text-red-400' :
              ta.atr.volatility === 'LOW' ? 'bg-slate-700/40 text-slate-400' :
              'bg-amber-400/10 text-amber-400'
            }`}>{ta.atr.volatility} VOLATILITY</div>
            <p className="text-[11px] text-slate-500 leading-snug">{ta.atr.explanation}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Support / Resistance" subtitle={`${ta.supportResistance.supports.length}S · ${ta.supportResistance.resistances.length}R levels`} icon={<Layers className="h-4 w-4" />} />
          <div className="mt-3">
            <SRLevels sr={ta.supportResistance} currentPrice={ta.currentPrice} />
            <p className="text-[11px] text-slate-500 mt-2 leading-snug">{ta.supportResistance.explanation}</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Volume & Relative Strength" subtitle={ta.volume.trend} icon={<BarChart2 className="h-4 w-4" />} />
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">Volume</span>
                <span className={signalColor(ta.volume.signal)}>{formatVolume(ta.volume.currentVolume)} ({ta.volume.ratio}×)</span>
              </div>
              <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${ta.volume.signal === 'BULLISH' ? 'bg-emerald-400' : ta.volume.signal === 'BEARISH' ? 'bg-red-400' : 'bg-slate-500'}`}
                  style={{ width: `${Math.min(100, ta.volume.ratio * 50)}%` }} />
              </div>
            </div>
            <div className="border-t border-surface-border pt-2">
              <div className="flex justify-between text-xs font-mono mb-1">
                <span className="text-slate-500">Rel. Strength</span>
                <span className={signalColor(ta.relativeStrength.signal)}>{ta.relativeStrength.value}/100</span>
              </div>
              <div className="h-1.5 bg-surface-4 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${scoreBarColor(ta.relativeStrength.value)}`}
                  style={{ width: `${ta.relativeStrength.value}%` }} />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-snug">{ta.volume.explanation}</p>
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-start justify-between mb-4">
          <CardHeader title="Pattern Detection" subtitle={`${patterns.length} pattern${patterns.length !== 1 ? 's' : ''} identified`} icon={<TriangleIcon className="h-4 w-4" />} />
        </div>
        {pLoading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-4">
            <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />Detecting patterns...
          </div>
        ) : patterns.length === 0 ? (
          <div className="text-center py-6 text-slate-600 text-sm">No chart patterns detected in current timeframe</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {patterns.map((p, i) => <PatternBadge key={i} pattern={p} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function SymbolIntelligence() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(symbol ?? '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');
  const [showTechnical, setShowTechnical] = useState(true);
  const [showCatalysts, setShowCatalysts] = useState(true);

  const { data: quoteData, isLoading: quoteLoading, isError: quoteError, refetch: refetchQuote } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: async () => {
      const r = await api.symbols.quote(symbol!) as { success: boolean; data?: { quote: Quote } };
      return r.data?.quote ?? null;
    },
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: srData } = useQuery({
    queryKey: ['technical', symbol, timeframe],
    queryFn: async () => {
      const r = await api.symbols.technical(symbol!, timeframe, quoteData?.assetClass) as {
        success: boolean; data?: { analysis: TechnicalAnalysis };
      };
      return r.data?.analysis ?? null;
    },
    enabled: !!symbol,
    staleTime: 10 * 60 * 1000,
  });

  const { data: catalystData } = useQuery({
    queryKey: ['catalysts', symbol],
    queryFn: async () => {
      const r = await api.symbols.catalysts(symbol!, { limit: 5 }) as {
        success: boolean;
        data?: { catalysts: Array<{
          id: string; headline: string; summary: string; url: string;
          source: { name: string }; publishedAt: string;
          sentiment: string; urgency: string; eventType: string;
          scores: { catalyst: number };
        }>; sentimentSummary: { overallSentiment: string; sentimentScore: number; sentimentTrend: string } };
      };
      return r.data ?? null;
    },
    enabled: !!symbol,
    staleTime: 15 * 60 * 1000,
  });

  const quote = quoteData;
  const isUp = (quote?.changePercent ?? 0) >= 0;

  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const sym = input.trim().toUpperCase();
    if (sym) navigate(`/symbol/${sym}`);
  }, [input, navigate]);

  const handleSelect = useCallback((sym: string) => {
    setInput(sym); setSearchFocused(false); navigate(`/symbol/${sym}`);
  }, [navigate]);

  useEffect(() => { if (symbol) setInput(symbol); }, [symbol]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Symbol Intelligence</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Technical analysis · Pattern detection · Thesis scoring</p>
        </div>
        {quote?.isMock && <Badge variant="warning">SIMULATED DATA</Badge>}
      </div>

      <form onSubmit={handleSearch} className="relative">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10" />
            <input type="text" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())}
              onFocus={() => setSearchFocused(true)} onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Enter ticker (e.g. NVDA, BTC, ETH, TSLA)"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 font-mono text-sm transition-colors" />
            {searchFocused && input.length >= 1 && <SearchSuggestions query={input} onSelect={handleSelect} />}
          </div>
          <button type="submit" className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-semibold transition-colors">
            Analyze
          </button>
        </div>
      </form>

      {symbol ? (
        <div className="space-y-4">
          {quoteLoading ? <LoadingState message={`Loading ${symbol}...`} /> :
           quoteError ? <ErrorState message={`Failed to load data for ${symbol}`} onRetry={refetchQuote} /> :
           quote ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-bold text-white font-mono">{quote.symbol}</h2>
                    <span className="text-slate-500 text-sm">{quote.name}</span>
                  </div>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-3xl font-bold font-mono text-white">{formatPrice(quote.price, quote.currency)}</span>
                    <div className={`flex items-center gap-1 ${isUp ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isUp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="text-sm font-mono font-semibold">
                        {isUp ? '+' : ''}{formatPrice(quote.change)} ({isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  {quote.exchange && <p className="text-xs text-slate-600 font-mono mt-0.5">{quote.exchange}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={quote.assetClass === 'crypto' ? 'purple' : 'info'}>{quote.assetClass.toUpperCase()}</Badge>
                  <button onClick={() => refetchQuote()} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors" title="Refresh">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'Open', value: formatPrice(quote.open) },
                  { label: 'High', value: formatPrice(quote.high) },
                  { label: 'Low', value: formatPrice(quote.low) },
                  { label: 'Prev Close', value: formatPrice(quote.previousClose) },
                  { label: 'Volume', value: formatVolume(quote.volume) },
                  { label: 'Market Cap', value: quote.marketCap ? `$${formatVolume(quote.marketCap)}` : '—' },
                  { label: '52W High', value: quote.high52Week ? formatPrice(quote.high52Week) : '—' },
                  { label: '52W Low', value: quote.low52Week ? formatPrice(quote.low52Week) : '—' },
                ].map(({ label, value }) => (
                  <Card key={label} className="p-3">
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-bold text-white font-mono mt-1">{value}</p>
                  </Card>
                ))}
              </div>

              <Card>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-4">
                    <CardHeader title="Price Chart" subtitle={`${quote.isMock ? 'Simulated' : 'Live'} · S/R overlays`} icon={<BarChart2 className="h-4 w-4" />} />
                  </div>
                  <div className="flex gap-1">
                    {TIMEFRAMES.map((tf) => (
                      <button key={tf} onClick={() => setTimeframe(tf)}
                        className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                          timeframe === tf ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30' : 'text-slate-500 hover:text-white hover:bg-surface-3'
                        }`}>{tf}</button>
                    ))}
                  </div>
                </div>
                <PriceChart symbol={symbol} timeframe={timeframe}
                  supports={srData?.supportResistance.supports}
                  resistances={srData?.supportResistance.resistances} />
              </Card>

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Target className="h-4 w-4 text-accent-blue" /> Technical Analysis
                </h3>
                <button onClick={() => setShowTechnical((v) => !v)}
                  className="text-xs text-slate-500 hover:text-white transition-colors font-mono">
                  {showTechnical ? 'Hide' : 'Show'}
                </button>
              </div>

              {showTechnical && (
                <TechnicalPanel symbol={symbol} timeframe={timeframe} assetClass={quote.assetClass} />
              )}

              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-accent-blue" /> Catalyst Intelligence
                </h3>
                <button onClick={() => setShowCatalysts((v) => !v)}
                  className="text-xs text-slate-500 hover:text-white transition-colors font-mono">
                  {showCatalysts ? 'Hide' : 'Show'}
                </button>
              </div>

              {showCatalysts && catalystData && (
                <div className="space-y-3">
                  {catalystData.sentimentSummary && (
                    <div className="grid grid-cols-3 gap-3">
                      <Card className="p-3">
                        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Overall</p>
                        <p className={`text-sm font-bold font-mono ${
                          catalystData.sentimentSummary.overallSentiment === 'POSITIVE' ? 'text-emerald-400' :
                          catalystData.sentimentSummary.overallSentiment === 'NEGATIVE' ? 'text-red-400' : 'text-slate-400'
                        }`}>{catalystData.sentimentSummary.overallSentiment}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Score</p>
                        <p className={`text-sm font-bold font-mono ${
                          catalystData.sentimentSummary.sentimentScore > 0 ? 'text-emerald-400' :
                          catalystData.sentimentSummary.sentimentScore < 0 ? 'text-red-400' : 'text-slate-400'
                        }`}>{catalystData.sentimentSummary.sentimentScore > 0 ? '+' : ''}{catalystData.sentimentSummary.sentimentScore.toFixed(2)}</p>
                      </Card>
                      <Card className="p-3">
                        <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wide mb-1">Trend</p>
                        <p className="text-sm font-bold font-mono text-white">{catalystData.sentimentSummary.sentimentTrend}</p>
                      </Card>
                    </div>
                  )}
                  <div className="space-y-2">
                    {catalystData.catalysts.slice(0, 5).map((item) => (
                      <div key={item.id} className={`p-3 rounded-lg bg-surface-2 border border-surface-border border-l-2 ${
                        item.sentiment === 'POSITIVE' ? 'border-l-emerald-400/60' :
                        item.sentiment === 'NEGATIVE' ? 'border-l-red-400/60' : 'border-l-slate-600/40'
                      }`}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <h4 className="text-xs font-semibold text-white leading-snug flex-1">{item.headline}</h4>
                          <span className={`text-[10px] font-mono flex-shrink-0 px-1 py-0.5 rounded ${
                            item.sentiment === 'POSITIVE' ? 'text-emerald-400 bg-emerald-400/10' :
                            item.sentiment === 'NEGATIVE' ? 'text-red-400 bg-red-400/10' : 'text-slate-500'
                          }`}>{item.sentiment}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed mb-1.5">{item.summary}</p>
                        <div className="flex items-center gap-3 text-[10px] font-mono text-slate-600">
                          <span className="text-slate-500">{item.source.name}</span>
                          <span className="flex items-center gap-1"><Clock className="h-2.5 w-2.5" />{new Date(item.publishedAt).toLocaleDateString()}</span>
                          <span>Impact: {item.scores.catalyst}/100</span>
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="ml-auto text-accent-blue hover:underline flex items-center gap-1">
                            <ExternalLink className="h-2.5 w-2.5" />Read
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                  <a href={`/catalysts?symbol=${symbol}`}
                    className="block text-center text-xs text-accent-blue hover:underline font-mono py-1">
                    View full catalyst feed →
                  </a>
                </div>
              )}

              {quote.isMock && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-400/80">
                    Showing simulated data. Add <span className="font-mono">STOCKS_API_KEY</span> to enable real prices. Technical indicators are computed from the simulated OHLCV bars.
                  </p>
                </div>
              )}
            </>
          ) : null}
        </div>
      ) : (
        <EmptyState icon={<Search className="h-10 w-10" />} title="Enter a symbol to begin"
          description="Search any stock or crypto ticker for price charts, technical indicators, pattern detection, and AI-powered scoring" />
      )}
    </div>
  );
}
