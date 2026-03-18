import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, TrendingUp, TrendingDown, Activity, Zap, BarChart2,
  RefreshCw, AlertCircle, ChevronUp, ChevronDown, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
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
  symbol: string;
  name: string;
  price: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high52Week?: number;
  low52Week?: number;
  currency: string;
  assetClass: string;
  exchange?: string;
  isMock?: boolean;
}

interface OHLCVBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function formatPrice(price: number, currency = 'USD'): string {
  if (price < 0.001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(2)}M`;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
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
  if (timeframe === '1W') return d.toLocaleDateString('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  if (timeframe === '5Y') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SearchSuggestions({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (symbol: string) => void;
}) {
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
        <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
        Searching...
      </div>
    </div>
  );
  if (!data?.length) return null;

  return (
    <div className="absolute top-full mt-1 left-0 right-0 bg-surface-2 border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden">
      {data.map((r) => (
        <button
          key={`${r.symbol}-${r.assetClass}`}
          onClick={() => onSelect(r.symbol)}
          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-surface-3 border border-surface-border flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-accent-blue font-mono">
              {r.symbol.slice(0, 2)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white font-mono">{r.symbol}</p>
            <p className="text-xs text-slate-500 truncate">{r.name}</p>
          </div>
          <Badge variant={r.assetClass === 'crypto' ? 'purple' : 'info'}>
            {r.assetClass.toUpperCase()}
          </Badge>
        </button>
      ))}
    </div>
  );
}

function PriceChart({ symbol, timeframe }: { symbol: string; timeframe: Timeframe }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['history', symbol, timeframe],
    queryFn: async () => {
      const r = await api.symbols.history(symbol, timeframe) as {
        success: boolean;
        data?: { bars: OHLCVBar[] };
      };
      return r.data?.bars ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <LoadingState message="Loading chart..." className="h-64" />;
  if (isError) return <ErrorState message="Failed to load chart data" onRetry={refetch} className="h-64" />;
  if (!data?.length) return (
    <EmptyState icon={<BarChart2 className="h-8 w-8" />} title="No chart data" description="No price history available" className="h-64" />
  );

  const chartData = data.map((bar) => ({
    ts: bar.timestamp,
    label: formatChartDate(bar.timestamp, timeframe),
    close: bar.close,
    open: bar.open,
    volume: bar.volume,
  }));

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
        <XAxis
          dataKey="ts"
          tickFormatter={(ts) => formatChartDate(ts, timeframe)}
          ticks={tickLabels}
          tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[minPrice * 0.995, maxPrice * 1.005]}
          tickFormatter={(v) => {
            if (v >= 1000) return `$${(v / 1000).toFixed(1)}k`;
            if (v < 1) return `$${v.toFixed(4)}`;
            return `$${v.toFixed(2)}`;
          }}
          tick={{ fontSize: 10, fill: '#475569', fontFamily: 'monospace' }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip
          contentStyle={{
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '8px',
            fontSize: '12px',
            fontFamily: 'monospace',
          }}
          labelStyle={{ color: '#94a3b8' }}
          formatter={(val) => [formatPrice(Number(val ?? 0)), 'Close']}
          labelFormatter={(ts) => formatChartDate(String(ts), timeframe)}
        />
        <Area
          type="monotone"
          dataKey="close"
          stroke={strokeColor}
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={{ r: 3, fill: strokeColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default function SymbolIntelligence() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(symbol ?? '');
  const [searchFocused, setSearchFocused] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('1M');

  const {
    data: quoteData,
    isLoading: quoteLoading,
    isError: quoteError,
    refetch: refetchQuote,
  } = useQuery({
    queryKey: ['quote', symbol],
    queryFn: async () => {
      const r = await api.symbols.quote(symbol!) as {
        success: boolean;
        data?: { quote: Quote };
      };
      return r.data?.quote ?? null;
    },
    enabled: !!symbol,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const quote = quoteData;

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const sym = input.trim().toUpperCase();
      if (sym) navigate(`/symbol/${sym}`);
    },
    [input, navigate]
  );

  const handleSelect = useCallback(
    (sym: string) => {
      setInput(sym);
      setSearchFocused(false);
      navigate(`/symbol/${sym}`);
    },
    [navigate]
  );

  useEffect(() => {
    if (symbol) setInput(symbol);
  }, [symbol]);

  const isUp = (quote?.changePercent ?? 0) >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Symbol Intelligence</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Deep-dive market analysis · Thesis scoring</p>
        </div>
        {quote?.isMock && (
          <Badge variant="warning">SIMULATED DATA</Badge>
        )}
      </div>

      <form onSubmit={handleSearch} className="relative">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 z-10" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Enter ticker symbol (e.g. NVDA, BTC, TSLA)"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 font-mono text-sm transition-colors"
            />
            {searchFocused && input.length >= 1 && (
              <SearchSuggestions query={input} onSelect={handleSelect} />
            )}
          </div>
          <button
            type="submit"
            className="px-6 py-2.5 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-semibold transition-colors"
          >
            Analyze
          </button>
        </div>
      </form>

      {symbol ? (
        <div className="space-y-4">
          {quoteLoading ? (
            <LoadingState message={`Loading ${symbol}...`} />
          ) : quoteError ? (
            <ErrorState message={`Failed to load data for ${symbol}`} onRetry={refetchQuote} />
          ) : quote ? (
            <>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-2xl font-bold text-white font-mono">{quote.symbol}</h2>
                    <span className="text-slate-500 text-sm">{quote.name}</span>
                  </div>
                  <div className="flex items-baseline gap-3 mt-1">
                    <span className="text-3xl font-bold font-mono text-white">
                      {formatPrice(quote.price, quote.currency)}
                    </span>
                    <div className={`flex items-center gap-1 ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                      {isUp ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="text-sm font-mono font-semibold">
                        {isUp ? '+' : ''}{formatPrice(quote.change)} ({isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                  {quote.exchange && (
                    <p className="text-xs text-slate-600 font-mono mt-0.5">{quote.exchange}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={quote.assetClass === 'crypto' ? 'purple' : 'info'}>
                    {quote.assetClass.toUpperCase()}
                  </Badge>
                  <button
                    onClick={() => refetchQuote()}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors"
                    title="Refresh"
                  >
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <CardHeader
                      title="Price Chart"
                      subtitle={`OHLCV · ${quote.isMock ? 'Simulated' : 'Live'}`}
                      icon={<BarChart2 className="h-4 w-4" />}
                    />
                    <div className="flex gap-1">
                      {TIMEFRAMES.map((tf) => (
                        <button
                          key={tf}
                          onClick={() => setTimeframe(tf)}
                          className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
                            timeframe === tf
                              ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                              : 'text-slate-500 hover:text-white hover:bg-surface-3'
                          }`}
                        >
                          {tf}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PriceChart symbol={symbol} timeframe={timeframe} />
                </Card>

                <div className="space-y-4">
                  <Card>
                    <CardHeader title="Momentum" icon={<Activity className="h-4 w-4" />} />
                    <div className="space-y-3 mt-3">
                      <div>
                        <div className="flex justify-between text-xs text-slate-500 font-mono mb-1">
                          <span>24h Change</span>
                          <span className={isUp ? 'text-accent-green' : 'text-accent-red'}>
                            {isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-2 bg-surface-4 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${isUp ? 'bg-accent-green' : 'bg-accent-red'}`}
                            style={{ width: `${Math.min(100, Math.abs(quote.changePercent) * 10)}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-3 border border-surface-border">
                        {isUp
                          ? <TrendingUp className="h-4 w-4 text-accent-green" />
                          : <TrendingDown className="h-4 w-4 text-accent-red" />}
                        <span className={`text-xs font-semibold ${isUp ? 'text-accent-green' : 'text-accent-red'}`}>
                          {isUp ? 'Bullish momentum' : 'Bearish momentum'}
                        </span>
                      </div>
                    </div>
                  </Card>

                  <Card>
                    <CardHeader title="AI Thesis Score" icon={<Zap className="h-4 w-4" />} />
                    <div className="flex items-center justify-center h-20 border border-dashed border-surface-border rounded-lg mt-3">
                      <span className="text-slate-600 text-xs font-mono">AI scoring — coming soon</span>
                    </div>
                  </Card>

                  {quote.isMock && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-400/80">
                        Showing simulated data. Add <span className="font-mono">STOCKS_API_KEY</span> to enable real prices.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon={<Search className="h-10 w-10" />}
          title="Enter a symbol to begin"
          description="Search for any stock or crypto ticker to see price charts, quote data, and AI-powered analysis"
        />
      )}
    </div>
  );
}
