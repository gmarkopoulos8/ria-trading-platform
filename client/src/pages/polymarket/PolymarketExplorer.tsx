import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, TrendingUp, TrendingDown, Minus,
  DollarSign, Droplets, Clock, ChevronDown, ChevronUp,
  ArrowUpDown, X, RefreshCw, Layers,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { Card, CardHeader } from '../../components/ui/Card';
import { LoadingState } from '../../components/ui/LoadingState';

interface Market {
  id: string;
  slug: string;
  question: string;
  description: string;
  category: string;
  conditionId: string;
  outcomes: string[];
  outcomePrices: number[];
  yesPrice: number;
  noPrice: number;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  archived: boolean;
  endDate: string | null;
  imageUrl: string;
  eventId: string | null;
  eventTitle: string | null;
  eventCategory: string | null;
}

const CATEGORIES = ['All', 'Politics', 'Sports', 'Crypto', 'Business', 'Science', 'Technology', 'Pop Culture', 'Entertainment', 'World'];
const SORT_OPTIONS = [
  { value: 'volume',    label: 'Volume' },
  { value: 'liquidity', label: 'Liquidity' },
  { value: 'endDate',   label: 'End Date' },
];

function pct(p: number) { return `${(p * 100).toFixed(1)}¢`; }
function fmt(n: number)  {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
function daysUntil(d: string | null) {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  const days = ms / 86_400_000;
  if (days < 0)  return 'Ended';
  if (days < 1)  return 'Today';
  if (days < 7)  return `${Math.round(days)}d`;
  if (days < 30) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

function BiasChip({ yesPrice }: { yesPrice: number }) {
  if (yesPrice >= 0.6) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-accent-green"><TrendingUp className="h-3 w-3" /> YES</span>;
  if (yesPrice <= 0.4) return <span className="flex items-center gap-0.5 text-[10px] font-bold text-red-400"><TrendingDown className="h-3 w-3" /> NO</span>;
  return <span className="flex items-center gap-0.5 text-[10px] font-bold text-slate-400"><Minus className="h-3 w-3" /> EVEN</span>;
}

function MarketRow({ market, onOpen }: { market: Market; onOpen: (m: Market) => void }) {
  const until = daysUntil(market.endDate);
  const urgent = until === 'Today' || until?.endsWith('d') && parseInt(until) <= 3;

  return (
    <tr
      onClick={() => onOpen(market)}
      className="border-b border-surface-border/50 hover:bg-surface-2 cursor-pointer transition-colors group"
    >
      <td className="px-4 py-3 max-w-xs">
        <p className="text-sm text-white leading-snug line-clamp-2 group-hover:text-accent-blue transition-colors">{market.question}</p>
        {market.eventTitle && (
          <p className="text-[10px] text-slate-600 mt-0.5 truncate">{market.eventTitle}</p>
        )}
      </td>
      <td className="px-3 py-3 text-center">
        <BiasChip yesPrice={market.yesPrice} />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-red-500/20 rounded-full overflow-hidden">
            <div className="h-full bg-accent-green/80 rounded-full transition-all"
              style={{ width: `${market.yesPrice * 100}%` }} />
          </div>
          <span className="text-[10px] font-mono text-accent-green w-7 text-right">{pct(market.yesPrice)}</span>
        </div>
        <div className="text-[10px] text-slate-600 mt-0.5 font-mono">NO {pct(market.noPrice)}</div>
      </td>
      <td className="px-3 py-3 text-right text-xs font-mono text-slate-300">{fmt(market.volume)}</td>
      <td className="px-3 py-3 text-right text-xs font-mono text-slate-300">{fmt(market.liquidity)}</td>
      <td className="px-3 py-3 text-center">
        {until ? (
          <span className={cn('text-xs font-mono', urgent ? 'text-orange-400 font-bold' : 'text-slate-500')}>{until}</span>
        ) : <span className="text-slate-600">—</span>}
      </td>
      <td className="px-3 py-3 text-center">
        <span className="text-[10px] text-slate-500 bg-surface-2 border border-surface-border px-2 py-0.5 rounded">
          {market.category || 'General'}
        </span>
      </td>
    </tr>
  );
}

export default function PolymarketExplorer() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [keyword, setKeyword]         = useState('');
  const [activeKeyword, setActiveKeyword] = useState('');
  const [category, setCategory]       = useState('All');
  const [status, setStatus]           = useState<'active' | 'closed' | 'all'>('active');
  const [sortBy, setSortBy]           = useState<'volume' | 'liquidity' | 'endDate'>('volume');
  const [minLiquidity, setMinLiquidity] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['poly-markets', activeKeyword, category, status, sortBy, minLiquidity],
    queryFn: () => api.polymarket.markets({
      keyword: activeKeyword || undefined,
      category: category !== 'All' ? category : undefined,
      status,
      sortBy,
      limit: 100,
      minLiquidity: minLiquidity ? parseInt(minLiquidity) : undefined,
    }),
    staleTime: 60_000,
  });

  const markets: Market[] = (data as any)?.data?.markets ?? [];

  const handleSearch = useCallback(() => {
    setActiveKeyword(keyword.trim());
  }, [keyword]);

  const openDetail = useCallback((market: Market) => {
    navigate(`/polymarket/market/${market.id}`);
  }, [navigate]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center">
            <Layers className="h-4 w-4 text-accent-purple" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Market Explorer</h1>
            <p className="text-xs text-slate-500">Browse active Polymarket prediction markets</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => refetch()} className="p-2 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
              <RefreshCw className={cn('h-4 w-4', isRefetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search markets…"
              className="w-full pl-9 pr-4 py-2 bg-surface-2 border border-surface-border rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-accent-purple/60 transition-all"
            />
          </div>
          <button onClick={handleSearch}
            className="px-4 py-2 bg-accent-purple text-white text-xs font-bold rounded-lg hover:bg-accent-purple/80 transition-colors">
            Search
          </button>
          <button onClick={() => setShowFilters((v) => !v)}
            className={cn('flex items-center gap-2 px-3 py-2 text-xs rounded-lg border transition-colors',
              showFilters ? 'bg-surface-3 border-accent-purple/40 text-white' : 'bg-surface-2 border-surface-border text-slate-400 hover:text-white')}>
            <Filter className="h-3.5 w-3.5" /> Filters {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-3 p-3 bg-surface-2 rounded-xl border border-surface-border">
            <div>
              <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Category</p>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button key={c} onClick={() => setCategory(c)}
                    className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                      category === c ? 'bg-accent-purple/20 border-accent-purple/40 text-accent-purple' : 'bg-surface-3 border-surface-border text-slate-400 hover:text-white')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3 items-end">
              <div>
                <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Status</p>
                <select value={status} onChange={(e) => setStatus(e.target.value as any)}
                  className="bg-surface-3 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none">
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Sort By</p>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-surface-3 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none">
                  {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] text-slate-500 mb-1.5 uppercase tracking-wider">Min Liquidity</p>
                <input value={minLiquidity} onChange={(e) => setMinLiquidity(e.target.value)}
                  placeholder="e.g. 10000"
                  className="bg-surface-3 border border-surface-border text-white text-xs rounded-lg px-3 py-1.5 w-28 focus:outline-none placeholder-slate-600" />
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {CATEGORIES.filter((c) => c !== 'All').slice(0, 8).map((c) => (
            <button key={c} onClick={() => setCategory(c === category ? 'All' : c)}
              className={cn('text-xs px-2 py-0.5 rounded border transition-colors',
                category === c ? 'bg-accent-purple/15 border-accent-purple/30 text-accent-purple' : 'border-surface-border text-slate-500 hover:text-white hover:border-slate-500')}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <LoadingState message="Fetching markets from Polymarket…" />
        ) : markets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-8">
            <Layers className="h-10 w-10 text-slate-600" />
            <p className="text-slate-400">No markets found matching your filters</p>
            <button onClick={() => { setCategory('All'); setActiveKeyword(''); setKeyword(''); setMinLiquidity(''); }}
              className="text-xs text-accent-purple hover:underline">Clear filters</button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-surface-1 sticky top-0">
                <th className="px-4 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono">Market</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono text-center">Bias</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono">Probability</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono text-right">Volume</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono text-right">Liquidity</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono text-center">Ends</th>
                <th className="px-3 py-2.5 text-[10px] text-slate-500 uppercase tracking-wider font-mono text-center">Category</th>
              </tr>
            </thead>
            <tbody>
              {markets.map((m) => <MarketRow key={m.id} market={m} onOpen={openDetail} />)}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex-shrink-0 px-6 py-2 border-t border-surface-border bg-surface-1 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-mono">{markets.length} markets · Polymarket public API</span>
        <span className="text-[10px] text-slate-600">Click any row to open market detail →</span>
      </div>
    </div>
  );
}
