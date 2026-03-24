import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';

const fmt$ = (n: number) => {
  const abs = Math.abs(n);
  const s = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  return n < 0 ? `-${s}` : `${n >= 0 ? '+' : ''}${s}`;
};

export default function Performance() {
  const [days, setDays] = useState(30);

  const { data: summaryRaw } = useQuery({
    queryKey:  ['trade-summary', days],
    queryFn:   () => (api as any).trades.summary(days).then((r: any) => r.data),
    staleTime: 60_000,
  });
  const { data: tradesRaw } = useQuery({
    queryKey:  ['trades', days],
    queryFn:   () => (api as any).trades.list({ days, limit: 50 }).then((r: any) => r.data),
    staleTime: 30_000,
  });

  const s      = summaryRaw as any;
  const trades: any[] = tradesRaw?.trades ?? [];

  return (
    <div className="p-6 max-w-[1100px] mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Performance</h1>
          <p className="text-sm text-slate-500">All exchanges · Stocks, crypto, options</p>
        </div>
        <div className="flex items-center gap-1">
          {[7, 30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                days === d
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-slate-500 hover:text-white',
              )}
            >{d}d</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total P&L',    value: s ? fmt$(s.totalPnl)        : '—', color: !s ? 'text-white' : s.totalPnl    >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Realized P&L', value: s ? fmt$(s.realizedPnl)     : '—', color: !s ? 'text-white' : s.realizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
          { label: 'Win Rate',     value: s ? `${s.winRate.toFixed(1)}%` : '—', color: !s ? 'text-white' : s.winRate >= 50 ? 'text-emerald-400' : 'text-amber-400' },
          { label: 'Total Trades', value: s?.totalTrades ?? '—', color: 'text-white' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-surface-2 border border-surface-border rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={cn('text-2xl font-bold font-mono', color)}>{value}</p>
          </div>
        ))}
      </div>

      {s?.byExchange && s.byExchange.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {s.byExchange.map((ex: any) => (
            <div key={ex.exchange} className="bg-surface-2 border border-surface-border rounded-xl p-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-300">{ex.exchange}</span>
                <span className={cn('font-mono font-bold text-sm',
                  (ex._sum.realizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {fmt$(ex._sum.realizedPnl ?? 0)}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">{ex._count.id} trades</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-surface-2 border border-surface-border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-surface-border">
          <h3 className="text-sm font-bold text-white">Trade Log</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-surface-border">
                {['Time', 'Symbol', 'Exchange', 'Strategy', 'Status', 'Entry', 'Exit', 'P&L', 'Claude'].map(h => (
                  <th key={h} className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {trades.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-slate-600 text-xs">
                    <p className="text-2xl mb-2">📊</p>
                    <p>No trades in this period</p>
                    <p className="mt-1 text-[10px]">Start RIA from Mission Control to begin trading</p>
                  </td>
                </tr>
              ) : trades.map((t: any) => (
                <tr key={t.id} className="border-b border-surface-border/50 hover:bg-surface-3 transition-colors">
                  <td className="px-4 py-2 text-slate-500 font-mono">
                    {new Date(t.entryTime).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-4 py-2 font-mono font-bold text-white">{t.symbol}</td>
                  <td className="px-4 py-2 text-slate-400">{t.exchange}</td>
                  <td className="px-4 py-2">
                    <span className="px-1.5 py-0.5 bg-surface-3 rounded text-slate-300 text-[10px]">{t.strategy}</span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold',
                      t.status === 'OPEN'        ? 'bg-violet-500/20 text-violet-300' :
                      (t.realizedPnl ?? 0) >= 0  ? 'bg-emerald-500/20 text-emerald-400' :
                                                   'bg-red-500/20 text-red-400')}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-slate-300">{t.entryPrice ? `$${t.entryPrice.toFixed(2)}` : '—'}</td>
                  <td className="px-4 py-2 font-mono text-slate-300">{t.exitPrice  ? `$${t.exitPrice.toFixed(2)}`  : '—'}</td>
                  <td className={cn('px-4 py-2 font-mono font-bold',
                    t.realizedPnl == null ? 'text-slate-500' :
                    t.realizedPnl >= 0    ? 'text-emerald-400' : 'text-red-400')}>
                    {t.realizedPnl != null ? fmt$(t.realizedPnl) : '—'}
                  </td>
                  <td className="px-4 py-2 text-slate-500 max-w-[160px] truncate text-[10px]" title={t.claudeReasoning}>
                    {t.claudeReasoning ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
