import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap, Newspaper, Rss, Clock, TrendingUp, TrendingDown,
  Minus, AlertTriangle, ChevronDown, ChevronUp, RefreshCw,
  Search, Filter, ExternalLink, Info,
} from 'lucide-react';
import { api } from '../api/client';
import { Card, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';

type Sentiment = 'ALL' | 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
type EventFilter = 'ALL' | 'EARNINGS' | 'GUIDANCE' | 'ANALYST_ACTION' | 'REGULATORY' | 'EXECUTIVE_CHANGE' |
  'LAWSUIT' | 'PARTNERSHIP' | 'CONTRACT' | 'PRODUCT_LAUNCH' | 'SECURITY_BREACH' | 'ANALYST_ACTION' |
  'MACRO' | 'SECTOR' | 'CRYPTO_EXCHANGE' | 'TOKEN_UNLOCK' | 'CHAIN_OUTAGE' | 'PROTOCOL_EXPLOIT' | 'GENERAL' | 'FILING';

interface NewsSource { name: string; domain: string; qualityScore: number; }

interface NewsItem {
  id: string;
  ticker: string | null;
  headline: string;
  summary: string;
  url: string;
  source: NewsSource;
  publishedAt: string;
  eventType: string;
  sentiment: string;
  category: string;
  urgency: string;
  scores: {
    sentiment: number;
    sentimentTrend: number;
    importance: number;
    recency: number;
    sourceQuality: number;
    catalyst: number;
  };
  explanation: string;
  keyPoints: string[];
  isMock?: boolean;
}

interface SentimentSummary {
  ticker: string;
  overallSentiment: string;
  sentimentScore: number;
  sentimentTrend: string;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  urgentCount: number;
  dominantEventType: string | null;
  summary: string;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  EARNINGS: 'Earnings', GUIDANCE: 'Guidance', FILING: 'Filing',
  PARTNERSHIP: 'Partnership', CONTRACT: 'Contract', PRODUCT_LAUNCH: 'Product Launch',
  LAWSUIT: 'Lawsuit', REGULATORY: 'Regulatory', EXECUTIVE_CHANGE: 'Exec Change',
  SECURITY_BREACH: 'Security', ANALYST_ACTION: 'Analyst', MACRO: 'Macro',
  SECTOR: 'Sector', CRYPTO_EXCHANGE: 'Exchange', TOKEN_UNLOCK: 'Token Unlock',
  CHAIN_OUTAGE: 'Outage', PROTOCOL_EXPLOIT: 'Exploit', GENERAL: 'General',
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS);

function formatAge(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function sentimentColor(s: string): string {
  if (s === 'POSITIVE') return 'text-emerald-400';
  if (s === 'NEGATIVE') return 'text-red-400';
  return 'text-slate-400';
}

function urgencyBadge(urgency: string) {
  const styles: Record<string, string> = {
    CRITICAL: 'bg-red-500/20 text-red-400 border-red-500/30',
    HIGH: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    MEDIUM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    LOW: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  };
  return styles[urgency] ?? styles.LOW;
}

function sentimentBadgeStyle(s: string): string {
  if (s === 'POSITIVE') return 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20';
  if (s === 'NEGATIVE') return 'bg-red-400/10 text-red-400 border-red-400/20';
  return 'bg-slate-700/40 text-slate-400 border-slate-600/30';
}

function categoryBg(category: string): string {
  if (category === 'POSITIVE_CATALYST') return 'border-l-emerald-400/60';
  if (category === 'NEGATIVE_CATALYST') return 'border-l-red-400/60';
  if (category === 'URGENT_FLAG') return 'border-l-amber-400/60';
  return 'border-l-slate-600/40';
}

function SentimentBar({ positive, negative, neutral }: { positive: number; negative: number; neutral: number }) {
  const total = positive + negative + neutral || 1;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
      <div className="bg-emerald-400 rounded-l-full transition-all" style={{ width: `${(positive / total) * 100}%` }} />
      <div className="bg-slate-600" style={{ width: `${(neutral / total) * 100}%` }} />
      <div className="bg-red-400 rounded-r-full transition-all" style={{ width: `${(negative / total) * 100}%` }} />
    </div>
  );
}

function NewsCard({ item, expanded, onToggle }: { item: NewsItem; expanded: boolean; onToggle: () => void }) {
  return (
    <div className={`border-l-2 ${categoryBg(item.category)} bg-surface-2 border border-surface-border rounded-lg p-4 space-y-3 transition-all`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              {item.urgency === 'CRITICAL' && (
                <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-red-500/20 text-red-400 border-red-500/30 uppercase tracking-wider animate-pulse">
                  <AlertTriangle className="h-2.5 w-2.5" /> Critical
                </span>
              )}
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${urgencyBadge(item.urgency)}`}>
                {item.urgency === 'CRITICAL' ? '' : item.urgency}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-3 border border-surface-border text-slate-500 font-mono">
                {EVENT_TYPE_LABELS[item.eventType] ?? item.eventType}
              </span>
              {item.ticker && (
                <span className="text-[10px] font-bold text-accent-blue font-mono">${item.ticker}</span>
              )}
            </div>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0 ${sentimentBadgeStyle(item.sentiment)}`}>
              {item.sentiment}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-white leading-snug">{item.headline}</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.summary}</p>
        </div>
      </div>

      <div className="flex items-center justify-between text-[10px] font-mono text-slate-600">
        <div className="flex items-center gap-3">
          <span className="font-medium text-slate-500">{item.source.name}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />{formatAge(item.publishedAt)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span>Impact: <span className="text-slate-400">{item.scores.catalyst}/100</span></span>
          <span>Quality: <span className="text-slate-400">{item.scores.sourceQuality}%</span></span>
          <button onClick={onToggle} className="flex items-center gap-1 text-accent-blue hover:text-accent-blue/80 transition-colors">
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Less' : 'Analysis'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-surface-border pt-3 space-y-3">
          <div className="p-3 rounded-lg bg-surface-3 border border-surface-border">
            <p className="text-xs text-slate-400 leading-relaxed">{item.explanation}</p>
          </div>

          {item.keyPoints.length > 0 && (
            <div>
              <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider mb-2">Key Points</p>
              <ul className="space-y-1">
                {item.keyPoints.map((pt, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-400">
                    <span className="text-accent-blue mt-0.5 flex-shrink-0">→</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Importance', value: item.scores.importance },
              { label: 'Recency', value: item.scores.recency },
              { label: 'Source Quality', value: item.scores.sourceQuality },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-2 rounded bg-surface-4">
                <p className="text-xs font-bold text-white">{value}</p>
                <p className="text-[10px] text-slate-600 font-mono">{label}</p>
              </div>
            ))}
          </div>

          <a href={item.url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-accent-blue hover:underline">
            <ExternalLink className="h-3 w-3" />Read on {item.source.name}
          </a>
        </div>
      )}
    </div>
  );
}

function SentimentPanel({ summary }: { summary: SentimentSummary }) {
  const total = summary.positiveCount + summary.negativeCount + summary.neutralCount;

  return (
    <Card>
      <CardHeader title="Sentiment Summary" icon={<TrendingUp className="h-4 w-4" />} />
      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-xl font-bold font-mono ${sentimentColor(summary.overallSentiment)}`}>
              {summary.overallSentiment}
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5 font-mono">
              {summary.sentimentTrend === 'IMPROVING' ? <TrendingUp className="h-3 w-3 text-emerald-400" /> :
               summary.sentimentTrend === 'DETERIORATING' ? <TrendingDown className="h-3 w-3 text-red-400" /> :
               <Minus className="h-3 w-3" />}
              {summary.sentimentTrend}
            </div>
          </div>
          <div className="text-right">
            <div className={`text-2xl font-bold font-mono ${summary.sentimentScore > 0 ? 'text-emerald-400' : summary.sentimentScore < 0 ? 'text-red-400' : 'text-slate-400'}`}>
              {summary.sentimentScore > 0 ? '+' : ''}{summary.sentimentScore.toFixed(2)}
            </div>
            <div className="text-xs text-slate-600 font-mono">avg score</div>
          </div>
        </div>

        <SentimentBar
          positive={summary.positiveCount}
          negative={summary.negativeCount}
          neutral={summary.neutralCount}
        />

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-emerald-400/5 border border-emerald-400/10">
            <p className="text-emerald-400 text-lg font-bold">{summary.positiveCount}</p>
            <p className="text-[10px] text-slate-600 font-mono">Positive</p>
          </div>
          <div className="p-2 rounded bg-slate-700/30 border border-slate-600/20">
            <p className="text-slate-400 text-lg font-bold">{summary.neutralCount}</p>
            <p className="text-[10px] text-slate-600 font-mono">Neutral</p>
          </div>
          <div className="p-2 rounded bg-red-400/5 border border-red-400/10">
            <p className="text-red-400 text-lg font-bold">{summary.negativeCount}</p>
            <p className="text-[10px] text-slate-600 font-mono">Negative</p>
          </div>
        </div>

        {summary.urgentCount > 0 && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-400">{summary.urgentCount} high-impact item{summary.urgentCount !== 1 ? 's' : ''} require attention</p>
          </div>
        )}

        <p className="text-xs text-slate-500 leading-relaxed">{summary.summary}</p>

        {summary.dominantEventType && (
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-slate-600">Top event type:</span>
            <span className="px-1.5 py-0.5 rounded bg-surface-3 border border-surface-border text-slate-300">
              {EVENT_TYPE_LABELS[summary.dominantEventType] ?? summary.dominantEventType}
            </span>
          </div>
        )}
      </div>
    </Card>
  );
}

function EventTypeFilter({ selected, onSelect }: { selected: string; onSelect: (v: string) => void }) {
  const types = ['ALL', ...ALL_EVENT_TYPES];
  return (
    <div className="flex flex-wrap gap-1.5">
      {types.map((t) => (
        <button key={t} onClick={() => onSelect(t)}
          className={`px-2 py-1 rounded text-[10px] font-mono font-semibold transition-colors border ${
            selected === t
              ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
              : 'text-slate-500 hover:text-white hover:bg-surface-3 border-surface-border'
          }`}>
          {t === 'ALL' ? 'All Types' : (EVENT_TYPE_LABELS[t] ?? t)}
        </button>
      ))}
    </div>
  );
}

export default function CatalystIntelligence() {
  const [symbolInput, setSymbolInput] = useState('');
  const [activeSymbol, setActiveSymbol] = useState<string | undefined>(undefined);
  const [sentimentFilter, setSentimentFilter] = useState<Sentiment>('ALL');
  const [eventTypeFilter, setEventTypeFilter] = useState('ALL');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const marketFeedQuery = useQuery({
    queryKey: ['news-market', eventTypeFilter],
    queryFn: async () => {
      const r = await api.news.feed({
        limit: 20,
        eventType: eventTypeFilter !== 'ALL' ? eventTypeFilter : undefined,
      }) as { success: boolean; data?: { articles: NewsItem[]; total: number } };
      return r.data ?? { articles: [], total: 0 };
    },
    staleTime: 15 * 60 * 1000,
  });

  const symbolCatalystsQuery = useQuery({
    queryKey: ['news-catalysts', activeSymbol, sentimentFilter, eventTypeFilter],
    queryFn: async () => {
      const r = await api.symbols.catalysts(activeSymbol!, {
        limit: 15,
        sentiment: sentimentFilter !== 'ALL' ? sentimentFilter : undefined,
        eventType: eventTypeFilter !== 'ALL' ? eventTypeFilter : undefined,
      }) as { success: boolean; data?: { catalysts: NewsItem[]; sentimentSummary: SentimentSummary } };
      return r.data ?? null;
    },
    enabled: !!activeSymbol,
    staleTime: 15 * 60 * 1000,
  });

  const handleSymbolSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = symbolInput.trim().toUpperCase();
    if (sym) setActiveSymbol(sym);
  };

  const articles = activeSymbol
    ? (symbolCatalystsQuery.data?.catalysts ?? [])
    : (marketFeedQuery.data?.articles ?? []);

  const isLoading = activeSymbol ? symbolCatalystsQuery.isLoading : marketFeedQuery.isLoading;
  const isError = activeSymbol ? symbolCatalystsQuery.isError : marketFeedQuery.isError;

  const urgentCount = articles.filter((a) => a.urgency === 'CRITICAL' || a.urgency === 'HIGH').length;
  const positiveCount = articles.filter((a) => a.sentiment === 'POSITIVE').length;
  const negativeCount = articles.filter((a) => a.sentiment === 'NEGATIVE').length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Catalyst Intelligence</h1>
          <p className="text-sm text-slate-500 font-mono mt-0.5">News, events & market-moving catalysts · Sentiment scoring</p>
        </div>
        <Badge variant="info" dot>Live Feed</Badge>
      </div>

      <form onSubmit={handleSymbolSearch} className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            placeholder="Filter by symbol (e.g. BTC, NVDA) — leave empty for market-wide feed"
            className="w-full pl-10 pr-4 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 font-mono text-sm transition-colors"
          />
        </div>
        <button type="submit" className="px-5 py-2.5 bg-accent-blue hover:bg-accent-blue/80 rounded-lg text-sm font-semibold transition-colors">
          Filter
        </button>
        {activeSymbol && (
          <button type="button" onClick={() => { setActiveSymbol(undefined); setSymbolInput(''); }}
            className="px-4 py-2.5 bg-surface-3 hover:bg-surface-4 rounded-lg text-sm text-slate-400 transition-colors">
            Clear
          </button>
        )}
      </form>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Items', value: articles.length.toString(), color: 'text-white', icon: <Newspaper className="h-4 w-4" /> },
          { label: 'High Impact', value: urgentCount.toString(), color: 'text-amber-400', icon: <Zap className="h-4 w-4" /> },
          { label: 'Positive', value: positiveCount.toString(), color: 'text-emerald-400', icon: <TrendingUp className="h-4 w-4" /> },
          { label: 'Negative', value: negativeCount.toString(), color: 'text-red-400', icon: <TrendingDown className="h-4 w-4" /> },
        ].map((stat) => (
          <Card key={stat.label} className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className={stat.color}>{stat.icon}</span>
              <p className="text-xs text-slate-500 font-mono uppercase tracking-wide">{stat.label}</p>
            </div>
            <p className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardHeader
                title={activeSymbol ? `${activeSymbol} Catalysts` : 'Market News Feed'}
                subtitle={`${articles.length} item${articles.length !== 1 ? 's' : ''} · Scored by catalyst impact`}
                icon={<Rss className="h-4 w-4" />}
              />
              <button
                onClick={() => { marketFeedQuery.refetch(); symbolCatalystsQuery.refetch(); }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                <div className="flex gap-1.5">
                  {(['ALL', 'POSITIVE', 'NEGATIVE', 'NEUTRAL'] as Sentiment[]).map((s) => (
                    <button key={s} onClick={() => setSentimentFilter(s)}
                      className={`px-2.5 py-1 rounded text-xs font-mono font-semibold transition-colors border ${
                        sentimentFilter === s
                          ? s === 'POSITIVE' ? 'bg-emerald-400/20 text-emerald-400 border-emerald-400/30'
                          : s === 'NEGATIVE' ? 'bg-red-400/20 text-red-400 border-red-400/30'
                          : 'bg-accent-blue/20 text-accent-blue border-accent-blue/30'
                          : 'text-slate-500 hover:text-white hover:bg-surface-3 border-surface-border'
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <EventTypeFilter selected={eventTypeFilter} onSelect={setEventTypeFilter} />
            </div>

            {isLoading ? (
              <LoadingState message="Fetching catalyst intelligence..." />
            ) : isError ? (
              <ErrorState message="Failed to load news feed" onRetry={() => { marketFeedQuery.refetch(); symbolCatalystsQuery.refetch(); }} />
            ) : articles.length === 0 ? (
              <EmptyState icon={<Newspaper className="h-8 w-8" />} title="No items match current filters" description="Try clearing filters or searching a different symbol" />
            ) : (
              <div className="space-y-3">
                {articles.map((item) => (
                  <NewsCard
                    key={item.id}
                    item={item}
                    expanded={expandedIds.has(item.id)}
                    onToggle={() => toggleExpanded(item.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          {activeSymbol && symbolCatalystsQuery.data?.sentimentSummary ? (
            <SentimentPanel summary={symbolCatalystsQuery.data.sentimentSummary} />
          ) : (
            <Card>
              <CardHeader title="Sentiment Analysis" icon={<TrendingUp className="h-4 w-4" />} />
              <div className="mt-4 space-y-3">
                <p className="text-xs text-slate-500">Enter a symbol above to see dedicated sentiment scoring, trend analysis, and catalyst breakdown.</p>
                <div className="p-3 rounded-lg bg-surface-3 border border-surface-border">
                  <div className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-accent-blue flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-400">The market-wide feed below shows catalysts across NVDA, BTC, ETH, TSLA, AAPL, and SPY.</p>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Event Type Breakdown" icon={<Zap className="h-4 w-4" />} />
            <div className="mt-3 space-y-1.5">
              {ALL_EVENT_TYPES.filter((t) => t !== 'GENERAL').map((type) => {
                const count = articles.filter((a) => a.eventType === type).length;
                if (count === 0) return null;
                return (
                  <button key={type} onClick={() => setEventTypeFilter(eventTypeFilter === type ? 'ALL' : type)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                      eventTypeFilter === type ? 'bg-accent-blue/10 border border-accent-blue/20' : 'hover:bg-surface-3'
                    }`}>
                    <span className="text-slate-400 font-mono">{EVENT_TYPE_LABELS[type]}</span>
                    <span className={`font-bold font-mono ${eventTypeFilter === type ? 'text-accent-blue' : 'text-slate-500'}`}>{count}</span>
                  </button>
                );
              })}
              {articles.every((a) => ALL_EVENT_TYPES.every((t) => a.eventType !== t || articles.filter((x) => x.eventType === t).length === 0)) && (
                <p className="text-xs text-slate-600 text-center py-4">No items loaded</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Source Quality" icon={<Newspaper className="h-4 w-4" />} />
            <div className="mt-3 space-y-2">
              {Array.from(new Set(articles.map((a) => a.source.name)))
                .slice(0, 6)
                .map((sourceName) => {
                  const sourceItems = articles.filter((a) => a.source.name === sourceName);
                  const quality = sourceItems[0]?.scores.sourceQuality ?? 50;
                  return (
                    <div key={sourceName} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between text-xs font-mono mb-0.5">
                          <span className="text-slate-400 truncate">{sourceName}</span>
                          <span className="text-slate-600 flex-shrink-0 ml-2">{quality}%</span>
                        </div>
                        <div className="h-1 bg-surface-4 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${quality >= 85 ? 'bg-emerald-400' : quality >= 70 ? 'bg-accent-blue' : 'bg-amber-400'}`}
                            style={{ width: `${quality}%` }} />
                        </div>
                      </div>
                      <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">{sourceItems.length}x</span>
                    </div>
                  );
                })}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
