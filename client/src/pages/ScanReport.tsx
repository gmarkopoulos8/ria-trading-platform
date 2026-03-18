import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, FileBarChart2, TrendingUp, TrendingDown, Shield,
  Zap, Target, AlertTriangle, BarChart3, Clock, Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card, CardHeader } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

interface ReportEntry {
  symbol: string;
  name?: string;
  rank?: number;
  conviction?: number;
  technical?: number;
  action?: string;
  bias?: string;
  risk?: number;
  catalyst?: string;
  score?: number;
  rewardRisk?: number;
}

interface SectorStat {
  sector: string;
  count: number;
  avgConviction: number;
  avgTechnical: number;
  bullishCount: number;
}

interface DailyReport {
  marketRegimeSummary: string | null;
  strongestSectorsJson: SectorStat[];
  weakestSectorsJson: SectorStat[];
  strongestMomentumJson: ReportEntry[];
  highestRiskNamesJson: ReportEntry[];
  topConservativeCandidatesJson: ReportEntry[];
  topAggressiveCandidatesJson: ReportEntry[];
  topCatalystsJson: ReportEntry[];
  topConvictionSetupsJson: ReportEntry[];
  topRiskRewardSetupsJson: ReportEntry[];
  reportSummary: string | null;
  countsByAssetClass: Record<string, number>;
  countsByBias: Record<string, number>;
  countsByAction: Record<string, number>;
}

interface ScanRun {
  id: string;
  status: string;
  runType: string;
  marketSession: string;
  totalUniverseCount: number;
  totalRankedCount: number;
  topSymbol: string | null;
  summary: string | null;
  startedAt: string | null;
  completedAt: string | null;
  report: DailyReport | null;
}

function MiniList({ items, renderItem }: { items: ReportEntry[]; renderItem: (r: ReportEntry, i: number) => React.ReactNode }) {
  if (!items || items.length === 0) return <p className="text-xs text-slate-500 italic">No data</p>;
  return <div className="space-y-1.5">{items.slice(0, 8).map((item, i) => renderItem(item, i))}</div>;
}

function SectorList({ items }: { items: SectorStat[] }) {
  if (!items || items.length === 0) return <p className="text-xs text-slate-500 italic">No data</p>;
  return (
    <div className="space-y-1.5">
      {items.slice(0, 6).map((s, i) => (
        <div key={i} className="flex items-center justify-between">
          <span className="text-xs text-slate-300">{s.sector}</span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 font-mono">{s.bullishCount}/{s.count} bull</span>
            <span className={cn('text-xs font-mono font-bold', s.avgConviction >= 65 ? 'text-accent-green' : s.avgConviction >= 50 ? 'text-yellow-400' : 'text-red-400')}>
              {s.avgConviction}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center bg-surface-2 border border-surface-border rounded-lg px-4 py-3 text-center min-w-[80px]">
      <span className={cn('text-lg font-bold font-mono', color ?? 'text-white')}>{value}</span>
      <span className="text-[10px] text-slate-500 mt-0.5">{label}</span>
    </div>
  );
}

function convColor(n: number) {
  return n >= 75 ? 'text-accent-green' : n >= 55 ? 'text-yellow-400' : 'text-red-400';
}

export default function ScanReport() {
  const { id } = useParams<{ id: string }>();

  const { data: runData, isLoading, isError } = useQuery({
    queryKey: ['scan-run', id],
    queryFn: () => api.scans.run(id!),
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const run: ScanRun | null = (runData as any)?.data?.run ?? null;
  const report = run?.report ?? null;

  if (isLoading) return <div className="flex-1 overflow-auto"><LoadingState message="Loading scan report…" /></div>;
  if (isError || !run) return <div className="flex-1 overflow-auto"><ErrorState message="This scan run could not be loaded." /></div>;

  const bullishCount = report?.countsByBias?.BULLISH ?? 0;
  const bearishCount = report?.countsByBias?.BEARISH ?? 0;
  const neutralCount = report?.countsByBias?.NEUTRAL ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/daily-scan" className="p-1.5 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="w-8 h-8 rounded-lg bg-accent-purple/10 border border-accent-purple/20 flex items-center justify-center">
            <FileBarChart2 className="h-4 w-4 text-accent-purple" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white">Scan Report</h1>
            <p className="text-xs text-slate-500">
              {run.completedAt ? new Date(run.completedAt).toLocaleString() : '—'} · {run.runType} · {run.marketSession}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {report?.reportSummary && (
          <div className="bg-surface-2 border border-surface-border rounded-xl p-4">
            <p className="text-sm text-slate-300">{report.reportSummary}</p>
          </div>
        )}

        {report?.marketRegimeSummary && (
          <Card>
            <CardHeader title="Market Regime" icon={<Activity className="h-4 w-4 text-accent-blue" />} />
            <p className="text-sm text-slate-300">{report.marketRegimeSummary}</p>
          </Card>
        )}

        <div className="flex flex-wrap gap-3">
          <StatPill label="Total Ranked" value={run.totalRankedCount} />
          <StatPill label="Universe" value={run.totalUniverseCount} />
          <StatPill label="Bullish" value={bullishCount} color="text-accent-green" />
          <StatPill label="Bearish" value={bearishCount} color="text-red-400" />
          <StatPill label="Neutral" value={neutralCount} color="text-slate-400" />
          {run.topSymbol && <StatPill label="Top Pick" value={run.topSymbol} color="text-accent-blue" />}
        </div>

        {report && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Strongest Sectors" icon={<TrendingUp className="h-4 w-4 text-accent-green" />} />
                <SectorList items={report.strongestSectorsJson ?? []} />
              </Card>
              <Card>
                <CardHeader title="Weakest Sectors" icon={<TrendingDown className="h-4 w-4 text-red-400" />} />
                <SectorList items={report.weakestSectorsJson ?? []} />
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Top Conviction Setups" icon={<Target className="h-4 w-4 text-accent-blue" />} />
                <MiniList
                  items={report.topConvictionSetupsJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 font-mono w-4">{r.rank ?? i + 1}</span>
                        <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                        {r.action && <span className="text-[10px] text-slate-500">{r.action}</span>}
                      </div>
                      <span className={cn('text-xs font-mono font-bold', convColor(r.conviction ?? 0))}>{r.conviction}</span>
                    </div>
                  )}
                />
              </Card>
              <Card>
                <CardHeader title="Best Reward / Risk" icon={<BarChart3 className="h-4 w-4 text-teal-400" />} />
                <MiniList
                  items={report.topRiskRewardSetupsJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-600 font-mono w-4">{r.rank ?? i + 1}</span>
                        <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      </div>
                      <span className="text-xs font-mono text-teal-400">{r.rewardRisk ?? '—'}/100</span>
                    </div>
                  )}
                />
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Conservative Candidates" icon={<Shield className="h-4 w-4 text-accent-purple" />} />
                <MiniList
                  items={report.topConservativeCandidatesJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      <div className="flex items-center gap-3 text-xs font-mono">
                        <span className={convColor(r.conviction ?? 0)}>{r.conviction}</span>
                        <span className="text-slate-500">risk {r.risk}</span>
                      </div>
                    </div>
                  )}
                />
              </Card>
              <Card>
                <CardHeader title="Aggressive Candidates" icon={<Zap className="h-4 w-4 text-yellow-400" />} />
                <MiniList
                  items={report.topAggressiveCandidatesJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      <span className={cn('text-xs font-mono font-bold', convColor(r.conviction ?? 0))}>{r.conviction}</span>
                    </div>
                  )}
                />
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader title="Strongest Momentum" icon={<TrendingUp className="h-4 w-4 text-accent-green" />} />
                <MiniList
                  items={report.strongestMomentumJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      <div className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-slate-500">tech {r.technical}</span>
                        <span className={convColor(r.conviction ?? 0)}>{r.conviction}</span>
                      </div>
                    </div>
                  )}
                />
              </Card>
              <Card>
                <CardHeader title="Highest Risk Names" icon={<AlertTriangle className="h-4 w-4 text-red-400" />} />
                <MiniList
                  items={report.highestRiskNamesJson ?? []}
                  renderItem={(r, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      <span className="text-xs font-mono text-red-400">{r.risk}/100</span>
                    </div>
                  )}
                />
              </Card>
            </div>

            <Card>
              <CardHeader title="Top Catalyst Plays" icon={<Zap className="h-4 w-4 text-accent-purple" />} />
              <MiniList
                items={report.topCatalystsJson ?? []}
                renderItem={(r, i) => (
                  <div key={i} className="flex items-start justify-between gap-4">
                    <div>
                      <Link to={`/symbol/${r.symbol}`} className="text-xs font-bold text-white hover:text-accent-blue">{r.symbol}</Link>
                      {r.catalyst && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{r.catalyst}</p>}
                    </div>
                    <span className="text-xs font-mono text-accent-purple flex-shrink-0">{r.score}</span>
                  </div>
                )}
              />
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader title="By Asset Class" />
                <div className="space-y-1.5">
                  {Object.entries(report.countsByAssetClass ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-slate-400">{k}</span>
                      <span className="font-mono text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="By Bias" />
                <div className="space-y-1.5">
                  {Object.entries(report.countsByBias ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className={cn('font-semibold', k === 'BULLISH' ? 'text-accent-green' : k === 'BEARISH' ? 'text-red-400' : 'text-slate-400')}>{k}</span>
                      <span className="font-mono text-white">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
              <Card>
                <CardHeader title="By Action" />
                <div className="space-y-1.5">
                  {Object.entries(report.countsByAction ?? {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-slate-400 truncate">{k}</span>
                      <span className="font-mono text-white ml-2">{v}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-surface-border">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Clock className="h-3 w-3" /><span>Run ID: {run.id}</span>
          </div>
          <Link to="/daily-scan" className="text-xs text-accent-blue hover:underline">← Back to Scanner</Link>
        </div>
      </div>
    </div>
  );
}
