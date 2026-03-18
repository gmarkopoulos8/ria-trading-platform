import { Zap, Calendar, Newspaper, Rss, Clock } from 'lucide-react';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';

const CATALYST_TYPES = ['Earnings', 'FDA Events', 'FOMC', 'Economic Data', 'Insider Activity', 'Analyst Ratings'];

export default function CatalystIntelligence() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Catalyst Intelligence</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">News, events & market-moving catalysts</p>
        </div>
        <Badge variant="info" dot>Live Feed</Badge>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Upcoming Events', value: '0', icon: <Calendar className="h-4 w-4" />, color: 'text-accent-blue' },
          { label: 'Breaking News', value: '0', icon: <Newspaper className="h-4 w-4" />, color: 'text-accent-amber' },
          { label: 'High Impact', value: '0', icon: <Zap className="h-4 w-4" />, color: 'text-accent-red' },
        ].map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-2 mb-1">
              <span className={stat.color}>{stat.icon}</span>
              <p className="text-xs text-slate-500 font-mono uppercase">{stat.label}</p>
            </div>
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader title="News Feed" subtitle="Real-time market news" icon={<Rss className="h-4 w-4" />} />
            <EmptyState
              icon={<Newspaper className="h-8 w-8" />}
              title="News feed not connected"
              description="Add a news API key in settings to enable real-time catalyst monitoring"
            />
          </Card>

          <Card>
            <CardHeader title="Catalyst Analysis" subtitle="AI-interpreted events" icon={<Zap className="h-4 w-4" />} />
            <EmptyState
              icon={<Zap className="h-8 w-8" />}
              title="No catalysts analyzed"
              description="AI will automatically score the impact of market events when data is available"
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Upcoming Events" icon={<Calendar className="h-4 w-4" />} />
            <EmptyState
              icon={<Clock className="h-8 w-8" />}
              title="No events scheduled"
              description="Economic calendar integration required"
            />
          </Card>

          <Card>
            <CardHeader title="Catalyst Types" />
            <div className="space-y-1.5">
              {CATALYST_TYPES.map((type) => (
                <div key={type} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-surface-3 cursor-pointer">
                  <span className="text-sm text-slate-400">{type}</span>
                  <Badge variant="outline">0</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
