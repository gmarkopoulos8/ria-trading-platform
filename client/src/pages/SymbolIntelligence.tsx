import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Search, LineChart, TrendingUp, Activity, Zap, BarChart2 } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

export default function SymbolIntelligence() {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(symbol ?? '');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      navigate(`/symbol/${input.trim().toUpperCase()}`);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Symbol Intelligence</h1>
        <p className="text-sm text-slate-500 font-mono mt-0.5">Deep-dive market analysis · Thesis scoring</p>
      </div>

      <form onSubmit={handleSearch}>
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol (e.g. NVDA, BTC, TSLA)"
              className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 font-mono text-sm"
            />
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white font-mono">{symbol}</h2>
              <p className="text-sm text-slate-500">Full analysis · Data integration required</p>
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">STOCK</Badge>
              <Badge variant="warning">DATA PENDING</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['Price', 'Change', 'Volume', 'Market Cap'].map((label) => (
              <Card key={label}>
                <p className="text-xs text-slate-500 font-mono uppercase">{label}</p>
                <p className="text-xl font-bold text-slate-600 mt-1">—</p>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader title="Price Chart" subtitle="OHLCV history" icon={<BarChart2 className="h-4 w-4" />} />
              <div className="h-64 flex items-center justify-center border border-dashed border-surface-border rounded-lg">
                <EmptyState
                  icon={<LineChart className="h-8 w-8" />}
                  title="Chart unavailable"
                  description="Connect a market data provider to enable charts"
                />
              </div>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Thesis Score" icon={<Activity className="h-4 w-4" />} />
                <div className="flex items-center justify-center h-24 border border-dashed border-surface-border rounded-lg">
                  <span className="text-slate-600 text-sm">AI scoring pending</span>
                </div>
              </Card>

              <Card>
                <CardHeader title="Catalysts" icon={<Zap className="h-4 w-4" />} />
                <div className="flex items-center justify-center h-24 border border-dashed border-surface-border rounded-lg">
                  <span className="text-slate-600 text-sm">No catalysts found</span>
                </div>
              </Card>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<LineChart className="h-10 w-10" />}
          title="Enter a symbol to begin"
          description="Search for any stock or crypto ticker to see AI-powered analysis, price charts, and thesis scoring"
        />
      )}
    </div>
  );
}
