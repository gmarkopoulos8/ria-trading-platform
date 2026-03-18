import { useState } from 'react';
import { Briefcase, Plus, TrendingUp, TrendingDown, DollarSign, Target } from 'lucide-react';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { Badge, RiskBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

export default function PaperPortfolio() {
  const [showOpenForm, setShowOpenForm] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Paper Portfolio</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">Simulated trading · Zero risk · Real analytics</p>
        </div>
        <button
          onClick={() => setShowOpenForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          Open Position
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Portfolio Value" value="$100,000" icon={<DollarSign className="h-4 w-4" />} color="blue" />
        <StatCard label="Cash Available" value="$100,000" icon={<DollarSign className="h-4 w-4" />} color="green" />
        <StatCard label="Open Positions" value="0" icon={<Target className="h-4 w-4" />} color="amber" />
        <StatCard label="Total P&L" value="$0.00" change={0} icon={<TrendingUp className="h-4 w-4" />} color="cyan" />
      </div>

      <Card>
        <CardHeader
          title="Open Positions"
          subtitle="Active paper trades"
          icon={<Briefcase className="h-4 w-4" />}
          action={
            <div className="flex gap-2">
              <Badge variant="success" dot>0 Long</Badge>
              <Badge variant="danger" dot>0 Short</Badge>
            </div>
          }
        />

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
            <span className="col-span-3">Symbol</span>
            <span className="col-span-1">Side</span>
            <span className="col-span-2">Entry</span>
            <span className="col-span-2">Current</span>
            <span className="col-span-2">P&L</span>
            <span className="col-span-2">Actions</span>
          </div>

          <EmptyState
            icon={<Briefcase className="h-8 w-8" />}
            title="No open positions"
            description="Open your first paper trade to start tracking performance"
            action={
              <button
                onClick={() => setShowOpenForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-accent-blue/10 hover:bg-accent-blue/20 border border-accent-blue/30 rounded-lg text-sm text-accent-blue transition-colors"
              >
                <Plus className="h-4 w-4" />
                Open First Position
              </button>
            }
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Closed Positions" subtitle="Trade history" icon={<TrendingDown className="h-4 w-4" />} />
        <EmptyState
          icon={<TrendingDown className="h-8 w-8" />}
          title="No trade history"
          description="Closed positions and their performance metrics will appear here"
        />
      </Card>
    </div>
  );
}
