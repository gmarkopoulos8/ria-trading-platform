import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  History, CheckCircle2, XCircle, Clock, Loader2,
  ArrowUpRight, Play, ToggleLeft, ToggleRight, ChevronRight, Calendar
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card, CardHeader } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

type StatusFilter = 'ALL' | 'COMPLETED' | 'FAILED' | 'RUNNING';

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
  createdAt: string;
  report?: { reportDate: string; marketRegimeSummary: string | null } | null;
}

interface SchedulerStatus {
  enabled: boolean;
  timezone: string;
  marketOpenHour: number;
  marketOpenMinute: number;
  premarketEnabled: boolean;
  running: boolean;
}

function statusIcon(status: string) {
  if (status === 'COMPLETED') return <CheckCircle2 className="h-4 w-4 text-accent-green" />;
  if (status === 'FAILED') return <XCircle className="h-4 w-4 text-red-400" />;
  if (status === 'RUNNING') return <Loader2 className="h-4 w-4 text-accent-blue animate-spin" />;
  return <Clock className="h-4 w-4 text-slate-500" />;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: 'text-accent-green bg-accent-green/10 border-accent-green/20',
    FAILED: 'text-red-400 bg-red-500/10 border-red-500/20',
    RUNNING: 'text-accent-blue bg-accent-blue/10 border-accent-blue/20',
    PENDING: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
  };
  return (
    <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border uppercase', map[status] ?? map.PENDING)}>
      {status}
    </span>
  );
}

function RunRow({ run }: { run: ScanRun }) {
  const duration = run.startedAt && run.completedAt
    ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
    : null;

  return (
    <div className="flex items-center gap-4 px-4 py-3.5 border-b border-surface-border last:border-0 hover:bg-surface-2/40 transition-colors group">
      {statusIcon(run.status)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-white font-mono">{run.runType}</span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-xs text-slate-400">{run.marketSession.replace('_', ' ')}</span>
          {statusBadge(run.status)}
        </div>
        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 flex-wrap">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {new Date(run.createdAt).toLocaleDateString()} {new Date(run.createdAt).toLocaleTimeString()}
          </span>
          {duration != null && <span>{duration}s</span>}
          {run.totalRankedCount > 0 && <span>{run.totalRankedCount} ranked / {run.totalUniverseCount} universe</span>}
          {run.topSymbol && <span>Top: <span className="text-accent-green">{run.topSymbol}</span></span>}
        </div>
        {run.summary && <p className="text-[11px] text-slate-600 mt-1 line-clamp-1">{run.summary}</p>}
      </div>
      {run.status === 'COMPLETED' && (
        <Link to={`/scan-report/${run.id}`}
          className="flex items-center gap-1 text-xs text-accent-blue opacity-0 group-hover:opacity-100 transition-opacity hover:underline flex-shrink-0">
          View Report <ArrowUpRight className="h-3 w-3" />
        </Link>
      )}
      <Link to="/daily-scan" className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <ChevronRight className="h-4 w-4 text-slate-500" />
      </Link>
    </div>
  );
}

export default function ScanHistory() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [page, setPage] = useState(1);

  const { data: historyData, isLoading, isError } = useQuery({
    queryKey: ['daily-scan-runs', statusFilter, page],
    queryFn: () => api.scans.runs({ page, limit: 20, status: statusFilter !== 'ALL' ? statusFilter : undefined }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const { data: schedulerData } = useQuery({
    queryKey: ['scan-scheduler-status'],
    queryFn: () => api.scans.schedulerStatus(),
    staleTime: 10_000,
  });

  const scheduler: SchedulerStatus | null = (schedulerData as any)?.data?.scheduler ?? null;
  const runs: ScanRun[] = (historyData as any)?.data?.runs ?? [];
  const total: number = (historyData as any)?.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const triggerMutation = useMutation({
    mutationFn: () => api.scans.trigger({ runType: 'MANUAL', force: true }),
    onSuccess: () => {
      toast.success('Scan triggered');
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['daily-scan-runs'] });
        qc.invalidateQueries({ queryKey: ['daily-scan-latest'] });
      }, 2000);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error ?? 'Trigger failed');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => api.scans.schedulerToggle(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scan-scheduler-status'] });
      toast.success('Scheduler updated');
    },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 border-b border-surface-border bg-surface-1 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-surface-2 border border-surface-border flex items-center justify-center">
              <History className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white">Scan History</h1>
              <p className="text-xs text-slate-500">{total} total runs</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/daily-scan" className="px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-surface-border rounded-lg hover:bg-surface-2 transition-colors">
              ← Back to Scanner
            </Link>
            <button onClick={() => triggerMutation.mutate()} disabled={triggerMutation.isPending}
              className="flex items-center gap-2 px-3 py-1.5 bg-accent-blue text-white rounded-lg text-xs font-semibold hover:bg-blue-500 transition-colors">
              <Play className="h-3 w-3" />{triggerMutation.isPending ? 'Running…' : 'Run Now'}
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {scheduler && (
          <Card>
            <CardHeader
              title="Scheduler Status"
              icon={<Clock className="h-4 w-4 text-accent-blue" />}
              action={
                <button onClick={() => toggleMutation.mutate(!scheduler.enabled)} disabled={toggleMutation.isPending}
                  className="flex items-center gap-2 text-xs">
                  {scheduler.enabled
                    ? <><ToggleRight className="h-5 w-5 text-accent-green" /><span className="text-accent-green">Enabled</span></>
                    : <><ToggleLeft className="h-5 w-5 text-slate-500" /><span className="text-slate-400">Disabled</span></>}
                </button>
              }
            />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-slate-500 mb-0.5">Timezone</p>
                <p className="text-white font-mono">{scheduler.timezone}</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Market Open</p>
                <p className="text-white font-mono">{scheduler.marketOpenHour}:{String(scheduler.marketOpenMinute).padStart(2, '0')} ET</p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Premarket Scan</p>
                <p className={scheduler.premarketEnabled ? 'text-accent-green' : 'text-slate-500'}>
                  {scheduler.premarketEnabled ? 'Enabled' : 'Disabled'}
                </p>
              </div>
              <div>
                <p className="text-slate-500 mb-0.5">Running</p>
                <p className={scheduler.running ? 'text-accent-green' : 'text-red-400'}>{scheduler.running ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </Card>
        )}

        <div>
          <div className="flex items-center gap-2 mb-3">
            {(['ALL', 'COMPLETED', 'FAILED', 'RUNNING'] as StatusFilter[]).map((s) => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn('px-3 py-1 rounded text-xs font-semibold transition-colors', statusFilter === s ? 'bg-surface-border text-white' : 'text-slate-500 hover:text-white')}>
                {s}
              </button>
            ))}
          </div>

          <Card className="p-0 overflow-hidden">
            {isLoading ? (
              <LoadingState message="Loading scan history…" />
            ) : isError ? (
              <ErrorState message="Could not fetch scan history." />
            ) : runs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <History className="h-8 w-8 text-slate-600" />
                <p className="text-slate-400 text-sm">No scan runs found</p>
              </div>
            ) : (
              runs.map((r) => <RunRow key={r.id} run={r} />)
            )}
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 text-xs text-slate-400 border border-surface-border rounded hover:bg-surface-2 disabled:opacity-40">
                Prev
              </button>
              <span className="text-xs text-slate-500 font-mono">{page} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 text-xs text-slate-400 border border-surface-border rounded hover:bg-surface-2 disabled:opacity-40">
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
