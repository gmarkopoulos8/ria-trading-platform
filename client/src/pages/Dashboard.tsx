import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Activity, DollarSign, Zap, BarChart2, Target, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LoadingState, SkeletonCard } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { api } from '../api/client';
import { formatPercent } from '../lib/utils';

const PLACEHOLDER_STATS = [
  { label: 'Portfolio Value', value: '$100,000.00', change: 0, color: 'blue' as const, icon: <DollarSign className="h-4 w-4" /> },
  { label: 'Total P&L', value: '$0.00', change: 0, color: 'green' as const, icon: <TrendingUp className="h-4 w-4" /> },
  { label: 'Open Positions', value: '0', color: 'amber' as const, icon: <Target className="h-4 w-4" /> },
  { label: 'Active Alerts', value: '0', color: 'purple' as const, icon: <AlertTriangle className="h-4 w-4" /> },
  { label: 'Win Rate', value: '—', color: 'cyan' as const, icon: <Activity className="h-4 w-4" /> },
  { label: 'Opportunities', value: '0', color: 'blue' as const, icon: <Zap className="h-4 w-4" /> },
];

const PLACEHOLDER_MOVERS = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', change: 3.24, price: 788.12 },
  { symbol: 'TSLA', name: 'Tesla Inc', change: -2.18, price: 185.60 },
  { symbol: 'BTC', name: 'Bitcoin', change: 1.87, price: 68240.00 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', change: 4.12, price: 178.45 },
  { symbol: 'ETH', name: 'Ethereum', change: -0.93, price: 3542.00 },
];

export default function Dashboard() {
  const { data: overview, isLoading, error, refetch } = useQuery({
    queryKey: ['market-overview'],
    queryFn: api.market.overview,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Market Dashboard</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">AI Intelligence Terminal · Paper Trading Mode</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="success" dot>Markets Open</Badge>
          <Badge variant="warning">Paper Mode</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {PLACEHOLDER_STATS.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            change={stat.change}
            icon={stat.icon}
            color={stat.color}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Portfolio Overview"
            subtitle="Paper equity curve"
            icon={<BarChart2 className="h-4 w-4" />}
            action={<span className="text-xs text-slate-600 font-mono">1D · 1W · 1M · ALL</span>}
          />
          <div className="flex items-center justify-center h-48 border border-dashed border-surface-border rounded-lg">
            <div className="text-center">
              <BarChart2 className="h-10 w-10 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-600 text-sm">Equity curve will appear here</p>
              <p className="text-slate-700 text-xs font-mono mt-1">No trade history yet</p>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Top Movers"
            subtitle="24h performance"
            icon={<Activity className="h-4 w-4" />}
          />
          <div className="space-y-2">
            {PLACEHOLDER_MOVERS.map((mover) => (
              <div key={mover.symbol} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                <div>
                  <p className="text-xs font-bold text-white font-mono">{mover.symbol}</p>
                  <p className="text-xs text-slate-600 truncate max-w-[120px]">{mover.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-mono text-slate-300">${mover.price.toLocaleString()}</p>
                  <p className={`text-xs font-mono font-medium ${mover.change >= 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                    {formatPercent(mover.change)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Recent Opportunities" icon={<Zap className="h-4 w-4" />} subtitle="AI-scored picks" />
          <div className="flex items-center justify-center h-32 border border-dashed border-surface-border rounded-lg">
            <p className="text-slate-600 text-sm">Connect market data to enable scanner</p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Open Positions" icon={<Target className="h-4 w-4" />} subtitle="Active paper trades" />
          <div className="flex items-center justify-center h-32 border border-dashed border-surface-border rounded-lg">
            <p className="text-slate-600 text-sm">No open positions · Start paper trading</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
