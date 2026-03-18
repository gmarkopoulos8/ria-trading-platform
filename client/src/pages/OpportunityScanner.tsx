import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  ScanSearch, Filter, Zap, TrendingUp, TrendingDown, ChevronRight,
  RefreshCw, AlertCircle,
} from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge, RiskBadge, ScoreBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../api/client';

interface Opportunity {
  id: string;
  symbol: string;
  name: string;
  assetClass: string;
  price: number;
  change: number;
  changePercent: number;
  thesisScore: number;
  momentum: number;
  volumeAnomaly: number;
  trend: 'up' | 'down';
  riskLevel: 'low' | 'medium' | 'high';
  catalysts: string[];
  isMock: boolean;
}

interface OpportunitiesResponse {
  success: boolean;
  data?: {
    opportunities: Opportunity[];
    meta: {
      total: number;
      highConviction: number;
      avgScore: number;
    };
  };
}

function formatPrice(price: number): string {
  if (price < 0.001) return `$${price.toFixed(8)}`;
  if (price < 1) return `$${price.toFixed(4)}`;
  if (price >= 1000) return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${price.toFixed(2)}`;
}

export default function OpportunityScanner() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'momentum' | 'change'>('score');

  const {
    data: response,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<OpportunitiesResponse>({
    queryKey: ['opportunities', filter],
    queryFn: () =>
      api.market.opportunities({
        assetClass: filter === 'all' ? undefined : filter,
        limit: 20,
      }) as Promise<OpportunitiesResponse>,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const opportunities = response?.data?.opportunities ?? [];
  const meta = response?.data?.meta;
  const hasMockData = opportunities.some((o) => o.isMock);

  const sorted = [...opportunities].sort((a, b) => {
    if (sortBy === 'score') return b.thesisScore - a.thesisScore;
    if (sortBy === 'momentum') return b.momentum - a.momentum;
    return Math.abs(b.changePercent) - Math.abs(a.changePercent);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Opportunity Scanner</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">AI-scored market opportunities · Real-time discovery</p>
        </div>
        <div className="flex items-center gap-2">
          {hasMockData && <Badge variant="warning">SIMULATED</Badge>}
          <Badge variant="info" dot>Scanner Active</Badge>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">Opportunities Found</p>
          <p className="text-2xl font-bold mt-1 text-accent-blue">
            {isLoading ? '—' : meta?.total ?? 0}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 font-mono">
            {filter === 'all' ? 'stocks + crypto' : filter}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">Avg Thesis Score</p>
          <p className="text-2xl font-bold mt-1 text-accent-amber">
            {isLoading ? '—' : meta?.avgScore ?? '—'}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 font-mono">out of 100</p>
        </Card>
        <Card>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">High Conviction</p>
          <p className="text-2xl font-bold mt-1 text-accent-green">
            {isLoading ? '—' : meta?.highConviction ?? 0}
          </p>
          <p className="text-xs text-slate-600 mt-0.5 font-mono">score ≥ 80</p>
        </Card>
      </div>

      {hasMockData && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-400/80">
            Showing simulated prices for stocks. Crypto prices are real (CoinGecko).
            Add <span className="font-mono">STOCKS_API_KEY</span> to enable real stock prices.
          </p>
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-accent-blue" />
            <span className="text-sm font-semibold">Live Opportunities</span>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'stock', 'crypto'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  filter === f
                    ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                    : 'text-slate-500 hover:text-white hover:bg-surface-3'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
            <div className="w-px h-4 bg-surface-border" />
            <Filter className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-surface-3 border border-surface-border rounded text-xs text-slate-300 px-2 py-1 outline-none font-mono"
            >
              <option value="score">By Score</option>
              <option value="momentum">By Momentum</option>
              <option value="change">By Change %</option>
            </select>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Scanning market..." />
        ) : isError ? (
          <ErrorState message="Failed to load opportunities" onRetry={refetch} />
        ) : sorted.length === 0 ? (
          <EmptyState
            icon={<ScanSearch className="h-8 w-8" />}
            title="No opportunities found"
            description="Connect market data APIs to enable real-time opportunity discovery"
          />
        ) : (
          <>
            <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
              <span className="col-span-3">Symbol</span>
              <span className="col-span-2">Price</span>
              <span className="col-span-1">Change</span>
              <span className="col-span-2">Score</span>
              <span className="col-span-2">Momentum</span>
              <span className="col-span-1">Risk</span>
              <span className="col-span-1"></span>
            </div>
            {sorted.map((opp) => (
              <div
                key={opp.id}
                onClick={() => navigate(`/symbol/${opp.symbol}`)}
                className="grid grid-cols-12 gap-3 px-3 py-3 rounded-lg hover:bg-surface-3 cursor-pointer transition-colors items-center border border-transparent hover:border-surface-border group"
              >
                <div className="col-span-3">
                  <div className="flex items-center gap-2">
                    {opp.trend === 'up' ? (
                      <TrendingUp className="h-4 w-4 text-accent-green flex-shrink-0" />
                    ) : (
                      <TrendingDown className="h-4 w-4 text-accent-red flex-shrink-0" />
                    )}
                    <div>
                      <p className="text-sm font-bold text-white font-mono">{opp.symbol}</p>
                      <p className="text-xs text-slate-600 truncate max-w-24">{opp.name}</p>
                    </div>
                  </div>
                </div>
                <div className="col-span-2">
                  <p className="text-sm font-mono text-white">{formatPrice(opp.price)}</p>
                </div>
                <div className="col-span-1">
                  <span
                    className={`text-xs font-mono font-semibold ${
                      opp.changePercent >= 0 ? 'text-accent-green' : 'text-accent-red'
                    }`}
                  >
                    {opp.changePercent >= 0 ? '+' : ''}{opp.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="col-span-2">
                  <ScoreBadge score={opp.thesisScore} />
                </div>
                <div className="col-span-2">
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 h-1.5 bg-surface-4 rounded-full max-w-16">
                      <div
                        className="h-full bg-accent-blue rounded-full"
                        style={{ width: `${opp.momentum}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 font-mono">{opp.momentum}</span>
                  </div>
                </div>
                <div className="col-span-1">
                  <RiskBadge level={opp.riskLevel} />
                </div>
                <div className="col-span-1 flex justify-end">
                  <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-accent-blue transition-colors" />
                </div>
              </div>
            ))}
          </>
        )}
      </Card>
    </div>
  );
}
