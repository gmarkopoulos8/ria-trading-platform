import { useState } from 'react';
import { ScanSearch, Filter, Zap, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge, RiskBadge, ScoreBadge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

const PLACEHOLDER_OPPORTUNITIES = [
  { symbol: 'NVDA', name: 'NVIDIA Corp', assetClass: 'stock', thesisScore: 88, momentum: 76, riskLevel: 'medium', trend: 'up', catalysts: ['Earnings beat', 'AI demand surge'] },
  { symbol: 'BTC', name: 'Bitcoin', assetClass: 'crypto', thesisScore: 74, momentum: 68, riskLevel: 'high', trend: 'up', catalysts: ['ETF inflows', 'Halving cycle'] },
  { symbol: 'AMD', name: 'Advanced Micro Devices', assetClass: 'stock', thesisScore: 71, momentum: 62, riskLevel: 'medium', trend: 'up', catalysts: ['GPU cycle recovery'] },
  { symbol: 'SOFI', name: 'SoFi Technologies', assetClass: 'stock', thesisScore: 58, momentum: 45, riskLevel: 'high', trend: 'down', catalysts: ['Rate sensitivity'] },
];

export default function OpportunityScanner() {
  const [filter, setFilter] = useState<'all' | 'stock' | 'crypto'>('all');
  const [sortBy, setSortBy] = useState<'score' | 'momentum'>('score');

  const filtered = PLACEHOLDER_OPPORTUNITIES
    .filter(o => filter === 'all' || o.assetClass === filter)
    .sort((a, b) => sortBy === 'score' ? b.thesisScore - a.thesisScore : b.momentum - a.momentum);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Opportunity Scanner</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">AI-scored market opportunities · Real-time discovery</p>
        </div>
        <Badge variant="info" dot>Scanner Active</Badge>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Opportunities Found', value: '0', sublabel: 'pending data', color: 'text-accent-blue' },
          { label: 'Avg Thesis Score', value: '—', sublabel: 'no data', color: 'text-accent-amber' },
          { label: 'High Conviction', value: '0', sublabel: 'score ≥ 80', color: 'text-accent-green' },
        ].map((stat) => (
          <Card key={stat.label}>
            <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-slate-600 mt-0.5 font-mono">{stat.sublabel}</p>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-accent-blue" />
            <span className="text-sm font-semibold">Live Opportunities</span>
          </div>
          <div className="flex items-center gap-2">
            {(['all', 'stock', 'crypto'] as const).map(f => (
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
              onChange={(e) => setSortBy(e.target.value as 'score' | 'momentum')}
              className="bg-surface-3 border border-surface-border rounded text-xs text-slate-300 px-2 py-1 outline-none font-mono"
            >
              <option value="score">By Score</option>
              <option value="momentum">By Momentum</option>
            </select>
          </div>
        </div>

        <div className="space-y-2">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ScanSearch className="h-8 w-8" />}
              title="No opportunities found"
              description="Connect market data APIs to enable real-time opportunity discovery"
            />
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3 px-3 py-2 text-xs text-slate-600 font-mono uppercase tracking-wider border-b border-surface-border">
                <span className="col-span-3">Symbol</span>
                <span className="col-span-2">Score</span>
                <span className="col-span-2">Momentum</span>
                <span className="col-span-2">Risk</span>
                <span className="col-span-2">Catalysts</span>
                <span className="col-span-1"></span>
              </div>
              {filtered.map((opp) => (
                <div key={opp.symbol} className="grid grid-cols-12 gap-3 px-3 py-3 rounded-lg hover:bg-surface-3 cursor-pointer transition-colors items-center border border-transparent hover:border-surface-border group">
                  <div className="col-span-3">
                    <div className="flex items-center gap-2">
                      {opp.trend === 'up' ? (
                        <TrendingUp className="h-4 w-4 text-accent-green flex-shrink-0" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-accent-red flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-sm font-bold text-white font-mono">{opp.symbol}</p>
                        <p className="text-xs text-slate-600 truncate">{opp.name}</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <ScoreBadge score={opp.thesisScore} />
                  </div>
                  <div className="col-span-2">
                    <div className="flex items-center gap-1.5">
                      <div className="flex-1 h-1.5 bg-surface-4 rounded-full max-w-16">
                        <div className="h-full bg-accent-blue rounded-full" style={{ width: `${opp.momentum}%` }} />
                      </div>
                      <span className="text-xs text-slate-500 font-mono">{opp.momentum}</span>
                    </div>
                  </div>
                  <div className="col-span-2">
                    <RiskBadge level={opp.riskLevel as 'low' | 'medium' | 'high'} />
                  </div>
                  <div className="col-span-2 flex flex-wrap gap-1">
                    {opp.catalysts.slice(0, 1).map(c => (
                      <Badge key={c} variant="info" className="text-xs truncate max-w-full">{c}</Badge>
                    ))}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-slate-600 group-hover:text-accent-blue transition-colors" />
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
