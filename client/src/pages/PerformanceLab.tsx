import { FlaskConical, TrendingUp, Activity, Target, BarChart2, Award } from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

const PERIOD_OPTIONS = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];

export default function PerformanceLab() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Performance Lab</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Trade analytics · Stats · Improvement insights</p>
        </div>
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p}
              className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                p === 'ALL'
                  ? 'bg-accent-blue/20 text-accent-blue border border-accent-blue/30'
                  : 'text-slate-500 hover:text-white hover:bg-surface-3'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Return" value="$0.00" change={0} icon={<TrendingUp className="h-4 w-4" />} color="green" />
        <StatCard label="Win Rate" value="—" icon={<Target className="h-4 w-4" />} color="blue" />
        <StatCard label="Profit Factor" value="—" icon={<Activity className="h-4 w-4" />} color="amber" />
        <StatCard label="Sharpe Ratio" value="—" icon={<Award className="h-4 w-4" />} color="purple" />
      </div>

      <Card>
        <CardHeader
          title="Equity Curve"
          subtitle="Portfolio value over time"
          icon={<BarChart2 className="h-4 w-4" />}
        />
        <div className="h-64 flex items-center justify-center border border-dashed border-surface-border rounded-lg">
          <EmptyState
            icon={<BarChart2 className="h-8 w-8" />}
            title="No performance data"
            description="Start paper trading to see your equity curve and performance analytics"
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Trade Statistics" icon={<Activity className="h-4 w-4" />} />
          <div className="space-y-2">
            {[
              ['Total Trades', '0'],
              ['Winning Trades', '0'],
              ['Losing Trades', '0'],
              ['Avg Win', '—'],
              ['Avg Loss', '—'],
              ['Best Trade', '—'],
              ['Worst Trade', '—'],
              ['Max Drawdown', '0%'],
            ].map(([label, val]) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-surface-border last:border-0">
                <span className="text-sm text-slate-500">{label}</span>
                <span className="text-sm font-mono text-white">{val}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title="Performance by Tag" icon={<FlaskConical className="h-4 w-4" />} />
          <EmptyState
            icon={<FlaskConical className="h-8 w-8" />}
            title="No tag data"
            description="Tag your positions to see performance broken down by strategy, sector, or thesis type"
          />
        </Card>
      </div>
    </div>
  );
}
