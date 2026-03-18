import { ShieldAlert, AlertTriangle, TrendingDown, Activity, Lock } from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

export default function RiskConsole() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Risk Console</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Portfolio exposure · Risk limits · Drawdown monitoring</p>
        </div>
        <Badge variant="success" dot>Risk: Normal</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Max Drawdown" value="0%" icon={<TrendingDown className="h-4 w-4" />} color="red" />
        <StatCard label="Portfolio Beta" value="—" icon={<Activity className="h-4 w-4" />} color="amber" />
        <StatCard label="Concentration" value="0%" icon={<ShieldAlert className="h-4 w-4" />} color="blue" />
        <StatCard label="Active Alerts" value="0" icon={<AlertTriangle className="h-4 w-4" />} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Exposure by Asset Class" icon={<ShieldAlert className="h-4 w-4" />} />
          <EmptyState
            icon={<ShieldAlert className="h-8 w-8" />}
            title="No exposure data"
            description="Open positions to see asset class exposure breakdown"
          />
        </Card>

        <Card>
          <CardHeader title="Position Concentration" icon={<Lock className="h-4 w-4" />} />
          <EmptyState
            icon={<Lock className="h-8 w-8" />}
            title="No positions to analyze"
            description="Position concentration heatmap will appear when you have open trades"
          />
        </Card>
      </div>

      <Card>
        <CardHeader title="Risk Alerts & Limits" subtitle="Active monitoring rules" icon={<AlertTriangle className="h-4 w-4" />} />
        <div className="space-y-3">
          {[
            { label: 'Max Single Position', limit: '10%', current: '0%', status: 'ok' },
            { label: 'Max Sector Exposure', limit: '30%', current: '0%', status: 'ok' },
            { label: 'Daily Loss Limit', limit: '$5,000', current: '$0', status: 'ok' },
            { label: 'Max Drawdown Limit', limit: '20%', current: '0%', status: 'ok' },
          ].map((rule) => (
            <div key={rule.label} className="flex items-center justify-between px-3 py-3 rounded-lg bg-surface-3 border border-surface-border">
              <div>
                <p className="text-sm text-white font-medium">{rule.label}</p>
                <p className="text-xs text-slate-500 font-mono">Current: {rule.current} · Limit: {rule.limit}</p>
              </div>
              <Badge variant="success" dot>SAFE</Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
