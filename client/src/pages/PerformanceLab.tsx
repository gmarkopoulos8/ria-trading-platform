import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FlaskConical, TrendingUp, TrendingDown, Target, Activity, Award,
  BarChart2, Layers, Zap, Brain, ChevronLeft, ChevronRight,
  ArrowUp, ArrowDown,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { cn } from '../lib/utils';

type Tab = 'overview' | 'patterns' | 'sectors' | 'catalysts' | 'thesis' | 'tradelog';

const OUTCOME_COLORS: Record<string, string> = {
  TARGET_HIT: '#34d399',
  PARTIAL_WIN: '#60a5fa',
  BREAKEVEN: '#94a3b8',
  STOPPED_OUT: '#fb923c',
  INVALIDATED: '#f87171',
  UNKNOWN: '#64748b',
};

const REASON_LABELS: Record<string, string> = {
  HIT_TARGET: 'Hit Target',
  HIT_STOP: 'Hit Stop',
  MANUAL: 'Manual',
  THESIS_INVALIDATED: 'Invalidated',
  TIME_EXIT: 'Time Exit',
};

const ASSET_COLORS: Record<string, string> = {
  STOCK: '#60a5fa',
  CRYPTO: '#c084fc',
  ETF: '#34d399',
  stock: '#60a5fa',
  crypto: '#c084fc',
  etf: '#34d399',
};

function fmtPct(v: number, dec = 1): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(dec)}%`;
}

function fmtUsd(v: number): string {
  const abs = Math.abs(v);
  const prefix = v < 0 ? '-' : v > 0 ? '+' : '';
  if (abs >= 1000) return `${prefix}$${(abs / 1000).toFixed(1)}k`;
  return `${prefix}$${abs.toFixed(0)}`;
}

function WinRateGauge({ value }: { value: number }) {
  const color = value >= 60 ? '#34d399' : value >= 45 ? '#fbbf24' : '#f87171';
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
          <circle cx="50" cy="50" r="38" fill="none" stroke="#1e293b" strokeWidth="10" />
          <circle cx="50" cy="50" r="38" fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${2 * Math.PI * 38 * (value / 100)} ${2 * Math.PI * 38}`}
            strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-white font-mono">{value.toFixed(0)}%</span>
        </div>
      </div>
      <span className="text-xs text-slate-500 font-mono mt-1">Win Rate</span>
    </div>
  );
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 11 },
  labelStyle: { color: '#94a3b8' },
  itemStyle: { color: '#e2e8f0' },
};

interface Filters {
  startDate: string;
  endDate: string;
  assetClass: string;
  side: string;
  outcome: string;
}

function FilterBar({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-600 font-mono">FROM</label>
        <input type="date" value={filters.startDate}
          onChange={(e) => onChange({ ...filters, startDate: e.target.value })}
          className="px-2 py-1 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50"
        />
      </div>
      <div className="flex items-center gap-1">
        <label className="text-[10px] text-slate-600 font-mono">TO</label>
        <input type="date" value={filters.endDate}
          onChange={(e) => onChange({ ...filters, endDate: e.target.value })}
          className="px-2 py-1 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50"
        />
      </div>
      <select value={filters.assetClass} onChange={(e) => onChange({ ...filters, assetClass: e.target.value })}
        className="px-2 py-1 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50">
        <option value="all">All Assets</option>
        <option value="stock">Stocks</option>
        <option value="crypto">Crypto</option>
        <option value="etf">ETF</option>
      </select>
      <select value={filters.side} onChange={(e) => onChange({ ...filters, side: e.target.value })}
        className="px-2 py-1 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50">
        <option value="all">Long + Short</option>
        <option value="LONG">Long Only</option>
        <option value="SHORT">Short Only</option>
      </select>
      <select value={filters.outcome} onChange={(e) => onChange({ ...filters, outcome: e.target.value })}
        className="px-2 py-1 rounded-lg bg-surface-3 border border-surface-border text-xs text-white outline-none focus:border-accent-blue/50">
        <option value="all">All Outcomes</option>
        <option value="TARGET_HIT">Target Hit</option>
        <option value="PARTIAL_WIN">Partial Win</option>
        <option value="BREAKEVEN">Breakeven</option>
        <option value="STOPPED_OUT">Stopped Out</option>
        <option value="INVALIDATED">Invalidated</option>
      </select>
      {(filters.startDate || filters.endDate || filters.assetClass !== 'all' || filters.side !== 'all' || filters.outcome !== 'all') && (
        <button
          onClick={() => onChange({ startDate: '', endDate: '', assetClass: 'all', side: 'all', outcome: 'all' })}
          className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2 py-1"
        >Clear</button>
      )}
    </div>
  );
}

function OverviewTab({ filters }: { filters: Filters }) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'));
  const { data: d, isLoading: isLoadingFull } = useQuery({
    queryKey: ['perf-overview-full', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/overview', { params });
      return r.data?.data;
    },
    staleTime: 60_000,
  });

  if (isLoadingFull) {
    return <div className="space-y-4"><div className="h-48 bg-surface-2 rounded-xl animate-pulse" /><div className="grid grid-cols-4 gap-3">{Array.from({length:8}).map((_,i)=><div key={i} className="h-20 bg-surface-2 rounded-xl animate-pulse" />)}</div></div>;
  }

  if (!d || d.totalTrades === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <FlaskConical className="h-16 w-16 text-slate-700 mb-4" />
        <p className="text-lg font-semibold text-slate-500">No closed trades yet</p>
        <p className="text-sm text-slate-600 mt-1">Open paper positions and close them to see performance analytics.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        <div className="col-span-2 md:col-span-1 flex justify-center items-center">
          <WinRateGauge value={d.winRate} />
        </div>
        <StatCard label="Total P&L" value={fmtUsd(d.totalPnl)} icon={<TrendingUp className="h-4 w-4" />}
          color={d.totalPnl >= 0 ? 'green' : 'red'} className="col-span-1" />
        <StatCard label="Profit Factor" value={d.profitFactor >= 99 ? '∞' : d.profitFactor.toFixed(2)}
          icon={<Award className="h-4 w-4" />} color="amber" className="col-span-1" />
        <StatCard label="Avg Return" value={fmtPct(d.avgReturn)} icon={<Activity className="h-4 w-4" />}
          color={d.avgReturn >= 0 ? 'green' : 'red'} className="col-span-1" />
        <StatCard label="Median Hold" value={`${d.medianHoldDays.toFixed(0)}d`}
          icon={<BarChart2 className="h-4 w-4" />} color="blue" className="col-span-1" />
        <StatCard label="Total Trades" value={d.totalTrades} icon={<Layers className="h-4 w-4" />}
          color="purple" className="col-span-1" />
        <StatCard label="Best Trade" value={fmtPct(d.bestTrade?.pnlPct ?? 0)}
          icon={<ArrowUp className="h-4 w-4" />} color="green" className="col-span-1" />
        <StatCard label="Worst Trade" value={fmtPct(d.worstTrade?.pnlPct ?? 0)}
          icon={<ArrowDown className="h-4 w-4" />} color="red" className="col-span-1" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader title="Equity Curve" subtitle="Running portfolio value" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d.equityCurve} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} width={50} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString('en-US', {maximumFractionDigits: 0})}`, 'Portfolio']} />
                <Area type="monotone" dataKey="value" stroke="#60a5fa" fill="url(#eqGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Trade Stats" icon={<Activity className="h-4 w-4" />} />
          <div className="space-y-2">
            {[
              ['Total Trades', `${d.totalTrades}`, ''],
              ['Wins / Losses', `${d.winningTrades} / ${d.losingTrades}`, ''],
              ['Avg Win', fmtPct(d.avgWin), d.avgWin >= 0 ? 'text-emerald-400' : 'text-red-400'],
              ['Avg Loss', fmtPct(d.avgLoss), 'text-red-400'],
              ['Median Return', fmtPct(d.medianReturn), d.medianReturn >= 0 ? 'text-emerald-400' : 'text-red-400'],
              ['Avg Hold', `${d.avgHoldDays.toFixed(1)}d`, ''],
              ['Best Win Streak', `${d.streaks.bestWin} trades`, 'text-emerald-400'],
              ['Worst Loss Streak', `${d.streaks.worstLoss} trades`, 'text-red-400'],
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between items-center py-1 border-b border-surface-border/50 last:border-0">
                <span className="text-xs text-slate-500">{label}</span>
                <span className={cn('text-xs font-mono font-semibold text-white', cls)}>{val}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Monthly P&L" icon={<BarChart2 className="h-4 w-4" />} />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.pnlByMonth} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `$${v >= 0 ? '' : '-'}${Math.abs(v/1000).toFixed(1)}k`} width={50} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => [fmtUsd(v), 'P&L']} />
                <Bar dataKey="pnl" radius={[3, 3, 0, 0]}>
                  {d.pnlByMonth.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.pnl >= 0 ? '#34d399' : '#f87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="By Asset Class" icon={<Layers className="h-4 w-4" />} />
          {d.pnlByAssetClass.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">No data</p>
          ) : (
            <div className="space-y-3">
              {d.pnlByAssetClass.map((g: any) => (
                <div key={g.assetClass} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: ASSET_COLORS[g.assetClass] ?? '#64748b' }} />
                      <span className="font-mono text-slate-300 uppercase">{g.assetClass}</span>
                      <span className="text-slate-600">{g.trades} trades</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500">{g.winRate.toFixed(0)}% WR</span>
                      <span className={cn('font-mono font-semibold', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${g.winRate}%`, backgroundColor: ASSET_COLORS[g.assetClass] ?? '#64748b' }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function PatternsTab({ filters }: { filters: Filters }) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'));
  const { data: d, isLoading } = useQuery({
    queryKey: ['perf-patterns', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/patterns', { params });
      return r.data?.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />;
  if (!d) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Trade Outcome Distribution" icon={<Target className="h-4 w-4" />} />
          {d.byOutcome.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">No data</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={d.byOutcome} dataKey="trades" nameKey="outcome" cx="50%" cy="50%" outerRadius={70} innerRadius={35}>
                      {d.byOutcome.map((entry: any, i: number) => (
                        <Cell key={i} fill={OUTCOME_COLORS[entry.outcome] ?? '#64748b'} />
                      ))}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [v, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {d.byOutcome.map((g: any) => (
                  <div key={g.outcome} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[g.outcome] ?? '#64748b' }} />
                      <span className="text-slate-400">{g.outcome.replace(/_/g, ' ')}</span>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-slate-500">{g.trades} trades</span>
                      <span className={cn('font-mono font-semibold w-16 text-right', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Hold Duration Analysis" icon={<BarChart2 className="h-4 w-4" />}
            subtitle="Performance by holding period" />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.byHoldDuration.filter((g: any) => g.trades > 0)}
                margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`} width={36} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [`${v.toFixed(1)}%`, name === 'winRate' ? 'Win Rate' : 'Avg Return']} />
                <Bar dataKey="winRate" name="winRate" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                <Bar dataKey="avgReturn" name="avgReturn" fill="#34d399" radius={[3, 3, 0, 0]}>
                  {d.byHoldDuration.filter((g: any) => g.trades > 0).map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.avgReturn >= 0 ? '#34d399' : '#f87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Return Distribution" icon={<Activity className="h-4 w-4" />} />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.byReturnBucket} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(0)}%`, 'Share']} />
                <Bar dataKey="count" name="Trades" fill="#60a5fa" radius={[3, 3, 0, 0]}>
                  {d.byReturnBucket.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.label.includes('Win') ? '#34d399' : entry.label.includes('Loss') ? '#f87171' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Setup Matrix" subtitle="Avg return by asset class & direction" icon={<Layers className="h-4 w-4" />} />
          {d.setupMatrix.length === 0 ? (
            <p className="text-xs text-slate-600 text-center py-8">Filter by a single asset class to see setup breakdown</p>
          ) : (
            <div className="space-y-2">
              {d.setupMatrix.map((g: any) => (
                <div key={`${g.assetClass}-${g.side}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-3 border border-surface-border">
                  <div className="flex items-center gap-2 w-32">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ASSET_COLORS[g.assetClass] ?? '#64748b' }} />
                    <span className="text-xs font-mono text-slate-400 uppercase">{g.assetClass}</span>
                    <span className={cn('text-[10px] font-mono px-1 rounded border', g.side === 'LONG' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-red-400 border-red-400/20 bg-red-400/5')}>{g.side}</span>
                  </div>
                  <div className="flex-1 flex items-center gap-4 text-xs font-mono">
                    <span className="text-slate-600">{g.trades}T</span>
                    <span className="text-slate-500">{g.winRate.toFixed(0)}%WR</span>
                    <span className={cn('font-semibold ml-auto', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {d.byTag?.length > 0 && (
        <Card>
          <CardHeader title="Performance by Tag" icon={<FlaskConical className="h-4 w-4" />} subtitle="User-defined position tags" />
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 font-mono border-b border-surface-border">
                  <th className="py-2 text-left">Tag</th>
                  <th className="py-2 text-right">Trades</th>
                  <th className="py-2 text-right">Win Rate</th>
                  <th className="py-2 text-right">Total P&L</th>
                </tr>
              </thead>
              <tbody>
                {d.byTag.map((t: any) => (
                  <tr key={t.tag} className="border-b border-surface-border/30 hover:bg-surface-3/30">
                    <td className="py-1.5 font-mono text-slate-300">{t.tag}</td>
                    <td className="py-1.5 text-right text-slate-500">{t.total}</td>
                    <td className={cn('py-1.5 text-right font-mono font-semibold', t.winRate >= 50 ? 'text-emerald-400' : 'text-red-400')}>{t.winRate.toFixed(0)}%</td>
                    <td className={cn('py-1.5 text-right font-mono', t.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtUsd(t.totalPnl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SectorsTab({ filters }: { filters: Filters }) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'));
  const { data: d, isLoading } = useQuery({
    queryKey: ['perf-sectors', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/sectors', { params });
      return r.data?.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />;
  if (!d) return null;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Performance by Asset Class" icon={<Layers className="h-4 w-4" />} />
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={d.byAssetClass} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="assetClass" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v.toFixed(0)}%`} width={36} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => `${v}`} width={28} />
              <Tooltip {...CHART_TOOLTIP_STYLE} />
              <Bar yAxisId="left" dataKey="winRate" name="Win Rate %" radius={[3, 3, 0, 0]}>
                {d.byAssetClass.map((e: any, i: number) => <Cell key={i} fill={ASSET_COLORS[e.assetClass] ?? '#60a5fa'} />)}
              </Bar>
              <Bar yAxisId="right" dataKey="trades" name="Trades" fill="#334155" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title="Symbol Leaderboard" icon={<Award className="h-4 w-4" />} subtitle="Performance by traded symbol" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 font-mono border-b border-surface-border">
                <th className="py-2 text-left">Symbol</th>
                <th className="py-2 text-right">Trades</th>
                <th className="py-2 text-right">Win Rate</th>
                <th className="py-2 text-right">Avg Return</th>
                <th className="py-2 text-right">Best</th>
                <th className="py-2 text-right">Worst</th>
                <th className="py-2 text-right">Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {d.symbolLeaderboard.map((s: any) => (
                <tr key={s.symbol} className="border-b border-surface-border/30 hover:bg-surface-3/30">
                  <td className="py-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-white">{s.symbol}</span>
                      <span className="text-slate-600 truncate max-w-24">{s.name}</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right text-slate-500">{s.trades}</td>
                  <td className={cn('py-1.5 text-right font-mono font-semibold', s.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400')}>{s.winRate.toFixed(0)}%</td>
                  <td className={cn('py-1.5 text-right font-mono', s.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(s.avgReturn)}</td>
                  <td className="py-1.5 text-right font-mono text-emerald-400">{fmtPct(s.bestReturn)}</td>
                  <td className="py-1.5 text-right font-mono text-red-400">{fmtPct(s.worstReturn)}</td>
                  <td className={cn('py-1.5 text-right font-mono font-semibold', s.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtUsd(s.totalPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function CatalystsTab({ filters }: { filters: Filters }) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'));
  const { data: d, isLoading } = useQuery({
    queryKey: ['perf-catalysts', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/catalysts', { params });
      return r.data?.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />;
  if (!d) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard label="False Positive Rate" value={`${d.falsePositiveRate.toFixed(0)}%`}
          icon={<Activity className="h-4 w-4" />}
          color={d.falsePositiveRate <= 30 ? 'green' : d.falsePositiveRate <= 50 ? 'amber' : 'red'} />
        <StatCard label="Stop Effectiveness" value={`${d.stopSuccessRate.toFixed(0)}%`}
          icon={<Target className="h-4 w-4" />} color="blue" />
        <StatCard label="Manual Exits" value={`${d.closeReasonQuality.find((r: any) => r.reason === 'MANUAL')?.pct?.toFixed(0) ?? 0}%`}
          icon={<Award className="h-4 w-4" />} color="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Outcome Distribution" icon={<Target className="h-4 w-4" />} />
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.outcomeDistribution} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="outcome" tick={{ fill: '#94a3b8', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v.replace(/_/g, ' ')} width={90} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number, name: string) => [name === 'count' ? `${v} trades` : fmtPct(v), name === 'count' ? 'Trades' : 'Avg Return']} />
                <Bar dataKey="count" name="count" radius={[0, 3, 3, 0]}>
                  {d.outcomeDistribution.map((e: any, i: number) => <Cell key={i} fill={OUTCOME_COLORS[e.outcome] ?? '#64748b'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Exit Reason Quality" icon={<Zap className="h-4 w-4" />} />
          <div className="space-y-3">
            {d.closeReasonQuality.map((g: any) => (
              <div key={g.reason} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">{REASON_LABELS[g.reason] ?? g.reason}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-slate-600">{g.count} trades ({g.pct.toFixed(0)}%)</span>
                    <span className={cn('font-mono font-semibold w-12 text-right', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</span>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                  <div className="h-full rounded-full bg-accent-blue" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {d.returnDistribution && (
        <Card>
          <CardHeader title="Return Frequency Distribution" icon={<BarChart2 className="h-4 w-4" />} />
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.returnDistribution.filter((b: any) => b.count > 0)} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="bin" tick={{ fill: '#64748b', fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Bar dataKey="count" name="Trades" fill="#60a5fa" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}

function ThesisQualityTab({ filters }: { filters: Filters }) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all'));
  const { data: d, isLoading } = useQuery({
    queryKey: ['perf-thesis', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/thesis-quality', { params });
      return r.data?.data;
    },
    staleTime: 60_000,
  });

  if (isLoading) return <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />;
  if (!d) return null;

  const qualityColor = d.overallQuality >= 60 ? 'text-emerald-400' : d.overallQuality >= 40 ? 'text-amber-400' : 'text-red-400';
  const qualityBg = d.overallQuality >= 60 ? 'bg-emerald-400' : d.overallQuality >= 40 ? 'bg-amber-400' : 'bg-red-400';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="md:col-span-1 flex flex-col items-center justify-center p-4 rounded-xl bg-surface-2 border border-surface-border gap-2">
          <p className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">Overall Quality</p>
          <p className={cn('text-4xl font-bold font-mono', qualityColor)}>{d.overallQuality.toFixed(0)}</p>
          <div className="w-full h-2 rounded-full bg-surface-3 overflow-hidden">
            <div className={cn('h-full rounded-full', qualityBg)} style={{ width: `${d.overallQuality}%` }} />
          </div>
          <p className="text-[10px] text-slate-600">out of 100</p>
        </div>
        <StatCard label="Target Hit Rate" value={`${d.targetHitRate.toFixed(0)}%`}
          icon={<Target className="h-4 w-4" />} color={d.targetHitRate >= 50 ? 'green' : d.targetHitRate >= 35 ? 'amber' : 'red'} />
        <StatCard label="Invalidation Rate" value={`${d.invalidationRate.toFixed(0)}%`}
          icon={<Activity className="h-4 w-4" />} color={d.invalidationRate <= 30 ? 'green' : d.invalidationRate <= 50 ? 'amber' : 'red'} />
        <StatCard label="Manual Exit Rate" value={`${d.manualExitRate.toFixed(0)}%`}
          icon={<BarChart2 className="h-4 w-4" />} color="amber" />
      </div>

      {d.topInsights.length > 0 && (
        <Card>
          <CardHeader title="AI Insights" icon={<Brain className="h-4 w-4" />} subtitle="Actionable findings from your trade history" />
          <div className="space-y-2">
            {d.topInsights.map((insight: string, i: number) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-accent-blue/5 border border-accent-blue/10">
                <span className="w-5 h-5 rounded-full bg-accent-blue/20 text-accent-blue text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{i + 1}</span>
                <p className="text-xs text-slate-300 leading-relaxed">{insight}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="Avg Return by Thesis Outcome" icon={<TrendingUp className="h-4 w-4" />} />
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.avgReturnByOutcome} layout="vertical" margin={{ top: 4, right: 40, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${v.toFixed(0)}%`} />
                <YAxis type="category" dataKey="outcome" tick={{ fill: '#94a3b8', fontSize: 9 }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v.replace(/_/g, ' ')} width={90} />
                <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Avg Return']} />
                <Bar dataKey="avgReturn" radius={[0, 3, 3, 0]}>
                  {d.avgReturnByOutcome.map((e: any, i: number) => (
                    <Cell key={i} fill={e.avgReturn >= 0 ? '#34d399' : '#f87171'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Quality by Asset Class" icon={<Layers className="h-4 w-4" />} />
          <div className="space-y-2">
            {d.assetClassQuality.map((g: any) => (
              <div key={g.assetClass} className="p-2.5 rounded-lg bg-surface-3 border border-surface-border">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-slate-300 uppercase font-semibold">{g.assetClass}</span>
                  <span className="text-xs text-slate-600">{g.trades} trades</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <div>
                    <p className="text-slate-600">Target Hit</p>
                    <p className={cn('font-semibold', g.targetHitRate >= 50 ? 'text-emerald-400' : 'text-amber-400')}>{g.targetHitRate.toFixed(0)}%</p>
                  </div>
                  <div>
                    <p className="text-slate-600">Avg Return</p>
                    <p className={cn('font-semibold', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</p>
                  </div>
                  <div>
                    <p className="text-slate-600">False Pos.</p>
                    <p className={cn('font-semibold', g.falsePositiveRate <= 30 ? 'text-emerald-400' : 'text-red-400')}>{g.falsePositiveRate.toFixed(0)}%</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Hold Duration Quality" subtitle="Win rate and avg return by holding period" icon={<BarChart2 className="h-4 w-4" />} />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 font-mono border-b border-surface-border">
                <th className="py-2 text-left">Hold Period</th>
                <th className="py-2 text-right">Trades</th>
                <th className="py-2 text-right">Win Rate</th>
                <th className="py-2 text-right">Avg Return</th>
                <th className="py-2 text-right">Total P&L</th>
              </tr>
            </thead>
            <tbody>
              {d.holdQualityMatrix.filter((g: any) => g.trades > 0).map((g: any) => (
                <tr key={g.label} className="border-b border-surface-border/30 hover:bg-surface-3/30">
                  <td className="py-1.5 font-mono text-slate-300">{g.label}</td>
                  <td className="py-1.5 text-right text-slate-500">{g.trades}</td>
                  <td className={cn('py-1.5 text-right font-mono font-semibold', g.winRate >= 50 ? 'text-emerald-400' : 'text-red-400')}>{g.winRate.toFixed(0)}%</td>
                  <td className={cn('py-1.5 text-right font-mono', g.avgReturn >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(g.avgReturn)}</td>
                  <td className={cn('py-1.5 text-right font-mono', g.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtUsd(g.totalPnl)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function TradeLogTab({ filters }: { filters: Filters }) {
  const [page, setPage] = useState(1);
  const params = {
    page,
    pageSize: 20,
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v && v !== 'all')),
  };

  const { data: d, isLoading } = useQuery({
    queryKey: ['perf-tradelog', params],
    queryFn: async () => {
      const { apiClient } = await import('../api/client');
      const r = await apiClient.get('/performance/trade-log', { params });
      return r.data?.data;
    },
    staleTime: 30_000,
  });

  if (isLoading) return <div className="h-64 bg-surface-2 rounded-xl animate-pulse" />;
  if (!d) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-mono">{d.total} total trades</p>
        <div className="flex items-center gap-2">
          <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}
            className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono text-slate-400">Page {page} of {d.pages || 1}</span>
          <button disabled={page >= d.pages} onClick={() => setPage((p) => p + 1)}
            className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {d.trades.length === 0 ? (
        <div className="text-center py-16 text-slate-600 font-mono text-sm">No trades match the current filters</div>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-600 font-mono border-b border-surface-border bg-surface-3">
                  <th className="px-4 py-2.5 text-left">Symbol</th>
                  <th className="px-3 py-2.5 text-center">Side</th>
                  <th className="px-3 py-2.5 text-right">Entry</th>
                  <th className="px-3 py-2.5 text-right">Exit</th>
                  <th className="px-3 py-2.5 text-right">Return</th>
                  <th className="px-3 py-2.5 text-right">P&L</th>
                  <th className="px-3 py-2.5 text-center">Hold</th>
                  <th className="px-3 py-2.5 text-center">Outcome</th>
                  <th className="px-3 py-2.5 text-center">Reason</th>
                  <th className="px-3 py-2.5 text-right">Closed</th>
                </tr>
              </thead>
              <tbody>
                {d.trades.map((t: any) => {
                  const oc = OUTCOME_COLORS[t.thesisOutcome] ?? '#64748b';
                  return (
                    <tr key={t.id} className="border-b border-surface-border/30 hover:bg-surface-3/30 transition-colors">
                      <td className="px-4 py-2">
                        <div>
                          <p className="font-mono font-semibold text-white">{t.symbol}</p>
                          <p className="text-slate-600 truncate max-w-20">{t.name}</p>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={cn('text-[10px] font-mono px-1.5 py-0.5 rounded border',
                          t.side === 'LONG' ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5' : 'text-red-400 border-red-400/20 bg-red-400/5',
                        )}>{t.side}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">${t.entryPrice.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-slate-400">${t.exitPrice.toFixed(2)}</td>
                      <td className={cn('px-3 py-2 text-right font-mono font-semibold', t.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtPct(t.pnlPercent)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-mono', t.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtUsd(t.pnl)}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-500">{t.holdingPeriodDays ?? '—'}d</td>
                      <td className="px-3 py-2 text-center">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border" style={{ color: oc, borderColor: `${oc}33`, backgroundColor: `${oc}11` }}>
                          {t.thesisOutcome?.replace(/_/g, ' ') ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{REASON_LABELS[t.closeReason] ?? t.closeReason ?? '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-500 font-mono">{new Date(t.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: BarChart2 },
  { id: 'patterns', label: 'Patterns', icon: FlaskConical },
  { id: 'sectors', label: 'Sectors', icon: Layers },
  { id: 'catalysts', label: 'Catalysts', icon: Zap },
  { id: 'thesis', label: 'Thesis Quality', icon: Brain },
  { id: 'tradelog', label: 'Trade Log', icon: Activity },
];

export default function PerformanceLab() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [filters, setFilters] = useState<Filters>({
    startDate: '',
    endDate: '',
    assetClass: 'all',
    side: 'all',
    outcome: 'all',
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-6 pt-6 border-b border-surface-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent-purple/15 border border-accent-purple/25 flex items-center justify-center">
              <FlaskConical className="h-4.5 w-4.5 text-accent-purple" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">Performance Lab</h1>
              <p className="text-xs text-slate-500 font-mono">Trade analytics · Thesis quality · Improvement insights</p>
            </div>
          </div>
        </div>

        <FilterBar filters={filters} onChange={setFilters} />

        <div className="flex gap-1 mt-3 overflow-x-auto">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-all whitespace-nowrap',
                activeTab === id
                  ? 'text-white border-accent-blue bg-surface-2'
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-surface-2/50',
              )}>
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'overview' && <OverviewTab filters={filters} />}
        {activeTab === 'patterns' && <PatternsTab filters={filters} />}
        {activeTab === 'sectors' && <SectorsTab filters={filters} />}
        {activeTab === 'catalysts' && <CatalystsTab filters={filters} />}
        {activeTab === 'thesis' && <ThesisQualityTab filters={filters} />}
        {activeTab === 'tradelog' && <TradeLogTab filters={filters} />}
      </div>
    </div>
  );
}
