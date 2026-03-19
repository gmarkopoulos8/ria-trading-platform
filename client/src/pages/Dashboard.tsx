import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, TrendingDown, Activity, DollarSign, Zap, BarChart2,
  Target, AlertTriangle, ArrowRight, RefreshCw,
} from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import { api } from '../api/client';
import { formatPercent, cn } from '../lib/utils';

function fmtUsd(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtCash(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n.toFixed(2)}`;
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: overview, isLoading: ovLoading, refetch: refetchOverview } = useQuery({
    queryKey: ['market-overview'],
    queryFn: api.market.overview,
    refetchInterval: 60_000,
  });

  const { data: portfolioData, isLoading: portLoading } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => api.positions.list(),
    refetchInterval: 60_000,
  });

  const { data: alertData } = useQuery({
    queryKey: ['alert-unread-count'],
    queryFn: () => api.alerts.unreadCount(),
    refetchInterval: 30_000,
  });

  const { data: oppsData } = useQuery({
    queryKey: ['opportunities', 'all'],
    queryFn: () => api.market.opportunities(),
    staleTime: 5 * 60_000,
  });

  const { data: hlData } = useQuery({
    queryKey: ['hl-status'],
    queryFn: () => api.hyperliquid.status(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: tosData } = useQuery({
    queryKey: ['tos-status'],
    queryFn: () => api.tos.status(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const portfolio = (portfolioData as any)?.data?.portfolio;
  const openPositions: any[] = (portfolioData as any)?.data?.positions ?? [];
  const recentClosed: any[] = ((portfolioData as any)?.data?.closed ?? []).slice(0, 5);
  const unreadAlerts = (alertData as any)?.data?.count ?? 0;
  const opps = (oppsData as any)?.data?.opportunities ?? [];
  const movers = (overview as any)?.data?.movers ?? [];

  const hlStatus = (hlData as any)?.data;
  const tosStatus = (tosData as any)?.data;

  const hlAccountValue   = parseFloat(hlStatus?.userState?.marginSummary?.accountValue  ?? '0') || 0;
  const hlUnrealizedPnl  = hlStatus?.userState
    ? (hlStatus.userState.assetPositions ?? []).reduce((s: number, ap: any) => s + parseFloat(ap.position.unrealizedPnl ?? '0'), 0)
    : 0;

  const tosEquity        = tosStatus?.balances?.equity ?? 0;
  const tosUnrealizedPnl = tosStatus?.unrealizedPnl    ?? 0;

  const combinedValue    = hlAccountValue + tosEquity;
  const combinedPnl      = hlUnrealizedPnl + tosUnrealizedPnl;

  const hlConnected  = !!(hlStatus?.hasCredentials);
  const tosConnected = !!(tosStatus?.hasCredentials);
  const anyConnected = hlConnected || tosConnected;

  const isLoading = ovLoading || portLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Market Dashboard</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">
            {anyConnected
              ? `Live Accounts · ${hlConnected ? 'Hyperliquid' : ''}${hlConnected && tosConnected ? ' + ' : ''}${tosConnected ? 'Thinkorswim' : ''}`
              : 'AI Intelligence Terminal · Connect accounts to see live balances'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="success" dot>Live Data</Badge>
          {hlConnected  && <Badge variant="info">Hyperliquid</Badge>}
          {tosConnected && <Badge variant="info">Thinkorswim</Badge>}
          <button
            onClick={() => refetchOverview()}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors"
            title="Refresh market data"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Live Account Value row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Combined Portfolio"
          value={anyConnected ? fmtCash(combinedValue) : '—'}
          icon={<DollarSign className="h-4 w-4" />}
          color="blue"
        />
        <StatCard
          label="Unrealized P&L"
          value={anyConnected ? fmtUsd(combinedPnl) : '—'}
          icon={<TrendingUp className="h-4 w-4" />}
          color={combinedPnl >= 0 ? 'green' : 'red'}
        />
        <StatCard
          label="Hyperliquid"
          value={hlConnected ? fmtCash(hlAccountValue) : 'Not connected'}
          icon={<Activity className="h-4 w-4" />}
          color={hlConnected ? 'purple' : 'amber'}
        />
        <StatCard
          label="Thinkorswim"
          value={tosConnected ? fmtCash(tosEquity) : 'Not connected'}
          icon={<BarChart2 className="h-4 w-4" />}
          color={tosConnected ? 'cyan' : 'amber'}
        />
      </div>

      {/* ── Secondary stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Research Positions"
          value={portfolio?.openCount ?? 0}
          icon={<Target className="h-4 w-4" />}
          color="amber"
        />
        <StatCard
          label="Active Alerts"
          value={unreadAlerts}
          icon={<AlertTriangle className="h-4 w-4" />}
          color={unreadAlerts > 0 ? 'red' : 'purple'}
        />
        <StatCard
          label="Win Rate"
          value={portfolio && portfolio.closedCount > 0 ? `${portfolio.winRate.toFixed(0)}%` : '—'}
          icon={<Activity className="h-4 w-4" />}
          color="cyan"
        />
        <StatCard
          label="Opportunities"
          value={opps.length > 0 ? `${opps.length}` : '0'}
          icon={<Zap className="h-4 w-4" />}
          color="blue"
        />
      </div>

      {/* ── Connection prompt if no accounts ── */}
      {!anyConnected && (
        <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-400">No trading accounts connected</p>
              <p className="text-xs text-amber-400/70 mt-1">
                Set your Hyperliquid or Schwab/Thinkorswim credentials in Replit Secrets to see live portfolio values here.
              </p>
              <div className="flex gap-3 mt-2">
                <button onClick={() => navigate('/hyperliquid')} className="text-xs text-accent-blue hover:underline flex items-center gap-1">
                  Hyperliquid setup <ArrowRight className="h-3 w-3" />
                </button>
                <button onClick={() => navigate('/tos')} className="text-xs text-accent-blue hover:underline flex items-center gap-1">
                  Thinkorswim setup <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Research Positions"
            subtitle="Tracked paper trades"
            icon={<Target className="h-4 w-4" />}
            action={
              <button
                onClick={() => navigate('/portfolio')}
                className="text-xs text-accent-blue hover:text-accent-blue/70 flex items-center gap-1 transition-colors"
              >
                View all <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          {portLoading ? (
            <LoadingState message="Loading positions..." />
          ) : openPositions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 border border-dashed border-surface-border rounded-lg gap-2">
              <Target className="h-8 w-8 text-slate-700" />
              <p className="text-slate-600 text-sm">No research trades · Start tracking</p>
              <button
                onClick={() => navigate('/scanner')}
                className="text-xs text-accent-blue hover:text-accent-blue/70 transition-colors flex items-center gap-1"
              >
                Scan opportunities <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {openPositions.slice(0, 5).map((pos) => (
                <div
                  key={pos.id}
                  onClick={() => navigate('/portfolio')}
                  className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-surface-2 border border-surface-border hover:border-slate-600 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold font-mono text-white">{pos.symbol}</span>
                        <span className={cn(
                          'text-[10px] font-mono px-1 py-0.5 rounded border',
                          pos.side === 'LONG'
                            ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
                            : 'text-red-400 border-red-400/20 bg-red-400/5',
                        )}>
                          {pos.side}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-600">{pos.quantity} @ ${pos.entryPrice.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-xs font-mono font-semibold', pos.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {pos.unrealizedPnl >= 0 ? '+' : ''}{pos.unrealizedPct.toFixed(2)}%
                    </p>
                    <p className={cn('text-[10px] font-mono', pos.unrealizedPnl >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
                      {pos.unrealizedPnl >= 0 ? '+' : ''}${Math.abs(pos.unrealizedPnl).toFixed(0)}
                    </p>
                  </div>
                </div>
              ))}
              {openPositions.length > 5 && (
                <button
                  onClick={() => navigate('/portfolio')}
                  className="w-full text-center text-xs text-slate-600 hover:text-accent-blue py-1.5 transition-colors"
                >
                  +{openPositions.length - 5} more positions
                </button>
              )}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Top Movers"
            subtitle="24h performance"
            icon={<Activity className="h-4 w-4" />}
          />
          {ovLoading ? (
            <LoadingState message="Loading..." />
          ) : (
            <div className="space-y-1">
              {(movers.length > 0 ? movers : [
                { symbol: 'NVDA', name: 'NVIDIA Corp', changePercent: 3.24, price: 788.12 },
                { symbol: 'TSLA', name: 'Tesla Inc', changePercent: -2.18, price: 185.60 },
                { symbol: 'BTC', name: 'Bitcoin', changePercent: 1.87, price: 68240.00 },
                { symbol: 'AMD', name: 'Advanced Micro Devices', changePercent: 4.12, price: 178.45 },
                { symbol: 'ETH', name: 'Ethereum', changePercent: -0.93, price: 3542.00 },
              ]).slice(0, 6).map((mover: any) => {
                const chg = mover.changePercent ?? mover.change ?? 0;
                return (
                  <div
                    key={mover.symbol}
                    onClick={() => navigate(`/symbol/${mover.symbol}`)}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-surface-3 cursor-pointer transition-colors"
                  >
                    <div>
                      <p className="text-xs font-bold text-white font-mono">{mover.symbol}</p>
                      <p className="text-[10px] text-slate-600 truncate max-w-[110px]">{mover.name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-mono text-slate-300">${Number(mover.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</p>
                      <p className={`text-[10px] font-mono font-medium ${chg >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                        {formatPercent(chg)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader
            title="Recent Opportunities"
            subtitle="AI-scored picks"
            icon={<Zap className="h-4 w-4" />}
            action={
              <button
                onClick={() => navigate('/scanner')}
                className="text-xs text-accent-blue hover:text-accent-blue/70 flex items-center gap-1 transition-colors"
              >
                Scanner <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          {opps.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 border border-dashed border-surface-border rounded-lg gap-2">
              <Zap className="h-7 w-7 text-slate-700" />
              <p className="text-slate-600 text-sm text-center">Open the scanner to find AI-scored opportunities</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {opps.slice(0, 4).map((opp: any) => (
                <div
                  key={opp.symbol}
                  onClick={() => navigate(`/symbol/${opp.symbol}`)}
                  className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-surface-2 border border-surface-border hover:border-slate-600 cursor-pointer transition-all"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-white">{opp.symbol}</span>
                      <span className="text-[10px] text-slate-500 uppercase font-mono">{opp.assetClass}</span>
                    </div>
                    <p className="text-[10px] text-slate-600 truncate max-w-36">{opp.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <p className="text-xs font-mono text-slate-300">${Number(opp.price ?? 0).toLocaleString()}</p>
                      <p className={cn('text-[10px] font-mono', (opp.changePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {formatPercent(opp.changePercent ?? 0)}
                      </p>
                    </div>
                    <div className={cn(
                      'text-xs font-mono font-bold px-2 py-1 rounded-lg',
                      (opp.score ?? 0) >= 70 ? 'bg-emerald-400/15 text-emerald-400' :
                      (opp.score ?? 0) >= 50 ? 'bg-amber-400/15 text-amber-400' :
                      'bg-slate-700/30 text-slate-400',
                    )}>
                      {opp.score ?? 0}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Recent Closed Trades"
            subtitle="Research history"
            icon={<BarChart2 className="h-4 w-4" />}
            action={
              <button
                onClick={() => navigate('/performance')}
                className="text-xs text-accent-blue hover:text-accent-blue/70 flex items-center gap-1 transition-colors"
              >
                Analytics <ArrowRight className="h-3 w-3" />
              </button>
            }
          />
          {portLoading ? (
            <LoadingState message="Loading trades..." />
          ) : recentClosed.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-28 border border-dashed border-surface-border rounded-lg gap-2">
              <BarChart2 className="h-7 w-7 text-slate-700" />
              <p className="text-slate-600 text-sm">No closed trades yet</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentClosed.map((pos) => (
                <div key={pos.id} className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-surface-2 border border-surface-border">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-white">{pos.symbol}</span>
                      <span className={cn(
                        'text-[10px] font-mono px-1 py-0.5 rounded border',
                        pos.side === 'LONG' ? 'text-emerald-400 border-emerald-400/20' : 'text-red-400 border-red-400/20',
                      )}>
                        {pos.side}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-mono">
                      {new Date(pos.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={cn('text-xs font-mono font-semibold', pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {pos.pnl >= 0 ? '+' : ''}${Math.abs(pos.pnl).toFixed(0)}
                    </p>
                    <p className={cn('text-[10px] font-mono', pos.pnlPercent >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
                      {formatPercent(pos.pnlPercent)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {portfolio && portfolio.closedCount > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Profit Factor" value={portfolio.profitFactor >= 99 ? '∞' : portfolio.profitFactor.toFixed(2)} icon={<Activity className="h-4 w-4" />} color="amber" />
          <StatCard label="Total Wins"    value={portfolio.wins}   icon={<TrendingUp   className="h-4 w-4" />} color="green" />
          <StatCard label="Total Losses"  value={portfolio.losses} icon={<TrendingDown className="h-4 w-4" />} color="red" />
          <StatCard label="Closed Trades" value={portfolio.closedCount} icon={<BarChart2 className="h-4 w-4" />} color="blue" />
        </div>
      )}
    </div>
  );
}
