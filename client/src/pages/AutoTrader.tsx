import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bot, Activity, TrendingUp, DollarSign, Zap,
  Power, PowerOff, RefreshCw, Settings2, AlertOctagon, Brain,
  PlayCircle, StopCircle, PauseCircle, CheckCircle2, XCircle,
  BarChart3, Globe, Shield, Eye,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card, CardHeader, StatCard } from '../components/ui/Card';
import { LoadingState } from '../components/ui/LoadingState';

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDollar = (n: number) => {
  const abs = Math.abs(n);
  const str = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  return n < 0 ? `-${str}` : str;
};
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

// ── Exchange color/icon map ───────────────────────────────────────────────────

const EXCHANGE_META: Record<string, { color: string; dot: string; label: string }> = {
  PAPER:       { color: 'text-violet-400', dot: 'bg-violet-400', label: 'Alpaca Paper' },
  HYPERLIQUID: { color: 'text-cyan-400',   dot: 'bg-cyan-400',   label: 'Hyperliquid'  },
  TOS:         { color: 'text-blue-400',   dot: 'bg-blue-400',   label: 'ThinkorSwim'  },
};

// ── Live Positions Panel ──────────────────────────────────────────────────────

function LivePositionsPanel() {
  const { data: raw, isLoading, refetch } = useQuery({
    queryKey:        ['live-positions-all'],
    queryFn:         () => api.autotrader.livePositions().then((r: any) => r.data),
    refetchInterval: 10_000,
  });

  const positions: any[] = raw?.positions ?? [];
  const totalPnl   = positions.reduce((s, p) => s + (p.unrealizedPnl ?? 0), 0);
  const totalValue = positions.reduce((s, p) => s + (p.marketValue   ?? 0), 0);

  const byExchange = positions.reduce((acc: Record<string, any[]>, p) => {
    (acc[p.exchange] = acc[p.exchange] ?? []).push(p);
    return acc;
  }, {});

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-4 w-4 text-emerald-400" />
        <h3 className="text-sm font-bold text-white">Live Positions — All Exchanges</h3>
        <div className="ml-auto flex items-center gap-3">
          {positions.length > 0 && (
            <>
              <span className="text-xs text-slate-500">
                Value: <span className="text-white font-mono">{fmtDollar(totalValue)}</span>
              </span>
              <span className={cn('text-xs font-bold font-mono', totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                {fmtDollar(totalPnl)} P&L
              </span>
            </>
          )}
          <button onClick={() => refetch()} className="p-1 text-slate-500 hover:text-slate-300">
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {isLoading && <div className="text-xs text-slate-500 text-center py-4">Loading positions…</div>}

      {!isLoading && positions.length === 0 && (
        <div className="text-xs text-slate-500 text-center py-6 flex flex-col items-center gap-2">
          <Activity className="h-6 w-6 text-slate-700" />
          <span>No open positions across any exchange</span>
          <span className="text-slate-600">Start Trading to open positions</span>
        </div>
      )}

      {!isLoading && positions.length > 0 && (
        <div className="space-y-4">
          {Object.entries(byExchange).map(([exchange, pos]) => {
            const meta  = EXCHANGE_META[exchange] ?? { color: 'text-slate-400', dot: 'bg-slate-400', label: exchange };
            const exPnl = pos.reduce((s: number, p: any) => s + (p.unrealizedPnl ?? 0), 0);
            return (
              <div key={exchange}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn('w-2 h-2 rounded-full', meta.dot)} />
                  <span className={cn('text-xs font-bold', meta.color)}>{meta.label}</span>
                  <span className="text-xs text-slate-500">{pos.length} position{pos.length !== 1 ? 's' : ''}</span>
                  <span className={cn('text-xs font-mono ml-auto', exPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {fmtDollar(exPnl)}
                  </span>
                </div>
                <div className="space-y-1">
                  {pos.map((p: any) => (
                    <div key={p.symbol + exchange} className={cn(
                      'flex items-center gap-2 text-xs rounded-lg px-3 py-2 border',
                      p.unrealizedPnl >= 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15',
                    )}>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                        p.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                        {p.side?.toUpperCase()}
                      </span>
                      <span className="font-mono font-bold text-white w-16">{p.symbol}</span>
                      <span className="text-slate-400">{p.size.toFixed(p.size < 1 ? 4 : 2)} units</span>
                      <span className="text-slate-500">@ {fmtDollar(p.entryPrice)}</span>
                      <span className="text-slate-400">→ {fmtDollar(p.currentPrice)}</span>
                      <span className="text-slate-500 flex-1">{fmtDollar(p.marketValue)}</span>
                      <span className={cn('font-mono font-bold flex-shrink-0', p.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {fmtPct(p.unrealizedPnlPct)}
                      </span>
                      <span className={cn('font-mono text-[10px] flex-shrink-0 w-16 text-right', p.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {p.unrealizedPnl >= 0 ? '+' : ''}{fmtDollar(p.unrealizedPnl)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[10px] text-slate-600 mt-2">Auto-refreshes every 10s · Shows all connected exchanges</p>
    </Card>
  );
}

// ── Alpaca Command Panel ──────────────────────────────────────────────────────

function AlpacaCommandPanel() {
  const qc = useQueryClient();

  const { data: statusRaw } = useQuery({
    queryKey: ['alpaca-status'],
    queryFn:  () => api.alpaca.status().then((r: any) => r.data),
    refetchInterval: 15_000,
  });
  const { data: credStatusRaw } = useQuery({
    queryKey: ['alpaca-cred-status'],
    queryFn:  () => api.credentials.alpacaStatus().then((r: any) => r.data),
    refetchInterval: 30_000,
  });
  const { data: accountRaw }   = useQuery({ queryKey: ['alpaca-account'],         queryFn: () => api.alpaca.account().then((r: any) => r.data),         refetchInterval: 30_000 });
  const { data: positionsRaw } = useQuery({ queryKey: ['alpaca-positions-cmd'],   queryFn: () => api.alpaca.positions().then((r: any) => r.data ?? []),  refetchInterval: 10_000 });
  const { data: autoStatusRaw} = useQuery({ queryKey: ['alpaca-auto-status-cmd'], queryFn: () => api.alpaca.autoStatus().then((r: any) => r.data),       refetchInterval: 30_000 });
  const { data: clockRaw }     = useQuery({ queryKey: ['alpaca-clock'],           queryFn: () => api.alpaca.clock().then((r: any) => r.data),            refetchInterval: 60_000 });

  const status     = statusRaw    as any;
  const account    = accountRaw   as any;
  const positions  = (positionsRaw as any[]) ?? [];
  const autoStatus = autoStatusRaw as any;
  const clock      = clockRaw     as any;

  const equity       = parseFloat(account?.equity      ?? '0');
  const buyingPower  = parseFloat(account?.buying_power ?? '0');
  const dayPnl       = parseFloat(account?.equity ?? '0') - parseFloat(account?.last_equity ?? account?.equity ?? '0');
  const totalPnl     = positions.reduce((s: number, p: any) => s + parseFloat(p.unrealized_pl ?? '0'), 0);
  const isMarketOpen = clock?.is_open ?? false;
  const controlLevel = status?.killswitch?.controlLevel ?? 'ACTIVE';
  const isConnected = !!(
    (statusRaw as any)?.hasCredentials  === true ||
    (statusRaw as any)?.connected        === true ||
    (credStatusRaw as any)?.isConnected  === true ||
    (credStatusRaw as any)?.runtimeLoaded === true
  );

  const pauseMut    = useMutation({ mutationFn: () => api.alpaca.pause('Manual pause'),                                    onSuccess: () => { toast.info('Alpaca paused');                        qc.invalidateQueries({ queryKey: ['alpaca-status'] }); } });
  const hardStopMut = useMutation({ mutationFn: () => api.alpaca.hardStop('Manual hard stop'),                             onSuccess: () => { toast.warning('Alpaca hard stopped');               qc.invalidateQueries({ queryKey: ['alpaca-status'] }); } });
  const resumeMut   = useMutation({ mutationFn: () => api.alpaca.resume(),                                                 onSuccess: () => { toast.success('Alpaca resumed');                    qc.invalidateQueries({ queryKey: ['alpaca-status'] }); } });
  const exitMut     = useMutation({ mutationFn: () => api.alpaca.emergencyExit('Emergency exit from command center', 'CONFIRM'), onSuccess: () => { toast.error('Emergency exit — all positions closed'); qc.invalidateQueries({ queryKey: ['alpaca-positions-cmd', 'alpaca-status'] }); } });

  const isStopped = controlLevel === 'HARD_STOP';
  const isPaused  = controlLevel === 'PAUSE';

  return (
    <Card className={cn('p-4 border', isConnected ? 'border-violet-500/20' : 'border-surface-border')}>
      <div className="flex items-center gap-3 mb-4">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center border',
          isConnected ? 'bg-violet-500/20 border-violet-500/30' : 'bg-surface-3 border-surface-border')}>
          <BarChart3 className={cn('h-5 w-5', isConnected ? 'text-violet-400' : 'text-slate-500')} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white">Alpaca Paper</h3>
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
              !isConnected ? 'bg-slate-700 text-slate-400' :
              isStopped   ? 'bg-red-500/20 text-red-400 animate-pulse' :
              isPaused    ? 'bg-amber-500/20 text-amber-400' :
                            'bg-violet-500/20 text-violet-400')}>
              {!isConnected ? 'NOT CONNECTED' : isStopped ? '⛔ HARD STOP' : isPaused ? '⏸ PAUSED' : '● ACTIVE'}
            </span>
            {isConnected && (
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full ml-auto',
                isMarketOpen ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-500')}>
                {isMarketOpen ? 'Market Open' : 'Market Closed'}
              </span>
            )}
          </div>
          {!isConnected && <p className="text-xs text-slate-500 mt-0.5">Connect Alpaca in Settings → Credentials</p>}
        </div>
      </div>

      {isConnected && (
        <>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Equity',       value: fmtDollar(equity),      color: 'text-white' },
              { label: 'Buying Power', value: fmtDollar(buyingPower), color: 'text-cyan-400' },
              { label: 'Day P&L',      value: fmtDollar(dayPnl),      color: dayPnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-surface-2 rounded-lg p-2 text-center">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</p>
                <p className={cn('text-sm font-bold font-mono', color)}>{value}</p>
              </div>
            ))}
          </div>

          {autoStatus?.adaptiveParams && (
            <div className="mb-3 p-2.5 bg-violet-950/30 border border-violet-500/20 rounded-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Brain className="h-3 w-3 text-violet-400" />
                <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider">AI Parameters</span>
                <span className="text-[10px] text-slate-500 ml-auto">{autoStatus.adaptiveParams.regime}</span>
              </div>
              <div className="flex gap-3 text-[11px] text-slate-400">
                <span>Stop <span className="text-white font-mono">-{autoStatus.adaptiveParams.stopLossPct}%</span></span>
                <span>Target <span className="text-white font-mono">+{autoStatus.adaptiveParams.takeProfitPct}%</span></span>
                <span>Conviction <span className="text-white font-mono">{autoStatus.adaptiveParams.minConvictionScore}</span></span>
                <span className={cn('ml-auto font-mono', autoStatus.adaptiveParams.positionSizeMultiplier >= 1 ? 'text-emerald-400' : 'text-amber-400')}>
                  {autoStatus.adaptiveParams.positionSizeMultiplier}× size
                </span>
              </div>
            </div>
          )}

          {positions.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-slate-300">{positions.length} Open Position{positions.length !== 1 ? 's' : ''}</p>
                <span className={cn('text-xs font-mono font-bold', totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {totalPnl >= 0 ? '+' : ''}{fmtDollar(totalPnl)} total
                </span>
              </div>
              <div className="space-y-1">
                {positions.map((p: any) => {
                  const pnlPct = parseFloat(p.unrealized_plpc ?? '0') * 100;
                  const pnl    = parseFloat(p.unrealized_pl  ?? '0');
                  return (
                    <div key={p.symbol} className={cn(
                      'flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 border',
                      pnl >= 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15',
                    )}>
                      <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                        p.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                        {(p.side ?? 'long').toUpperCase()}
                      </span>
                      <span className="font-mono font-bold text-white w-14">{p.symbol}</span>
                      <span className="text-slate-400 flex-1">{fmtDollar(parseFloat(p.avg_entry_price ?? '0'))} → {fmtDollar(parseFloat(p.current_price ?? '0'))}</span>
                      <span className={cn('font-mono font-bold', pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400')}>{fmtPct(pnlPct)}</span>
                      <span className={cn('font-mono text-[10px] w-14 text-right', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                        {pnl >= 0 ? '+' : ''}{fmtDollar(pnl)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {positions.length === 0 && <div className="text-xs text-slate-600 text-center py-3 mb-3">No open positions</div>}

          <div className="flex gap-2">
            {(isStopped || isPaused) ? (
              <button onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}
                className="flex-1 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
                <Power className="h-3 w-3" />
                {resumeMut.isPending ? 'Resuming…' : 'Resume'}
              </button>
            ) : (
              <>
                <button onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}
                  className="flex-1 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1.5">
                  <PauseCircle className="h-3 w-3" /> Pause
                </button>
                <button onClick={() => hardStopMut.mutate()} disabled={hardStopMut.isPending}
                  className="flex-1 py-2 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-colors flex items-center justify-center gap-1.5">
                  <StopCircle className="h-3 w-3" /> Hard Stop
                </button>
                <button onClick={() => exitMut.mutate()} disabled={exitMut.isPending}
                  className="py-2 px-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-1.5">
                  <XCircle className="h-3 w-3" /> Exit All
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

// ── Claude AI Decision Panel ──────────────────────────────────────────────────

function AIDecisionPanel({ signals, regime, portfolioState }: { signals: any[]; regime: any; portfolioState: any }) {
  const [decisions, setDecisions] = useState<any[] | null>(null);
  const [modelUsed, setModelUsed] = useState<string | null>(null);

  const reviewMut = useMutation({
    mutationFn: () => api.autotrader.aiDecision({ signals: signals.slice(0, 6), regime, portfolioState, exchange: 'PAPER' }),
    onSuccess: (r: any) => {
      setDecisions(r.data?.decisions ?? []);
      setModelUsed(r.data?.modelUsed ?? null);
      toast.success(`AI reviewed ${r.data?.decisions?.length ?? 0} signals`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'AI review failed'),
  });

  if (signals.length === 0) return null;

  return (
    <Card className="p-4 border border-violet-500/20 bg-violet-950/10">
      <div className="flex items-center gap-2 mb-3">
        <Brain className="h-4 w-4 text-violet-400" />
        <h3 className="text-sm font-bold text-white">Claude AI Trade Review</h3>
        {modelUsed && <span className="text-[10px] text-slate-500 ml-auto">{modelUsed}</span>}
        <button
          onClick={() => reviewMut.mutate()}
          disabled={reviewMut.isPending}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-violet-600/20 border border-violet-500/30 text-violet-300 text-xs rounded-lg hover:bg-violet-600/30 disabled:opacity-40 transition-colors ml-auto"
        >
          {reviewMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Brain className="h-3 w-3" />}
          {reviewMut.isPending ? 'Reviewing…' : 'Ask Claude'}
        </button>
      </div>

      {!decisions && !reviewMut.isPending && (
        <p className="text-xs text-slate-500 py-2">
          Click <strong className="text-violet-400">Ask Claude</strong> — Claude will review each signal for regime fit, earnings risk, correlated positions, and return a go/no-go decision with reasoning.
        </p>
      )}

      {reviewMut.isPending && (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-violet-400" />
          Claude is reviewing {signals.length} signal{signals.length !== 1 ? 's' : ''}…
        </div>
      )}

      {decisions && (
        <div className="space-y-1.5">
          {decisions.map((d: any) => (
            <div key={d.symbol} className={cn(
              'rounded-lg px-3 py-2 border text-xs',
              d.approved ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-surface-2 border-surface-border opacity-60',
            )}>
              <div className="flex items-center gap-2 mb-1">
                {d.approved
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
                }
                <span className="font-mono font-bold text-white w-14">{d.symbol}</span>
                <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                  d.approved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400')}>
                  {d.approved ? 'APPROVED' : 'REJECTED'}
                </span>
                <span className="text-slate-500 ml-auto">Conviction: <span className="text-white">{d.conviction}</span></span>
                {d.holdDays && <span className="text-slate-500">Hold: <span className="text-white">{d.holdDays}d</span></span>}
              </div>
              <p className="text-slate-400 pl-5 leading-relaxed">{d.reasoning}</p>
              {d.riskWarning && <p className="text-amber-400 pl-5 text-[10px] mt-0.5">⚠ {d.riskWarning}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── Exchange Control Card ─────────────────────────────────────────────────────

function ExchangeControlCard({
  exchange, label, ctrlLevel, pauseMut, hardStopMut, resumeMut,
}: {
  exchange: string; label: string; ctrlLevel: string;
  pauseMut: any; hardStopMut: any; resumeMut: any;
}) {
  const meta      = EXCHANGE_META[exchange.toUpperCase()] ?? { color: 'text-slate-400', dot: 'bg-slate-400', label };
  const isStopped = ctrlLevel === 'HARD_STOP';
  const isPaused  = ctrlLevel === 'PAUSE';

  return (
    <div className="p-3 rounded-xl bg-surface-2 border border-surface-border space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', meta.dot)} />
          <p className="text-sm font-semibold text-white">{label}</p>
        </div>
        <span className={cn('text-xs font-bold px-2 py-0.5 rounded font-mono',
          isStopped ? 'bg-red-500/20 text-red-400 animate-pulse' :
          isPaused  ? 'bg-amber-500/20 text-amber-400' :
                      'bg-accent-green/20 text-accent-green')}>
          {isStopped ? '⛔ HARD STOP' : isPaused ? '⏸ PAUSED' : '● ACTIVE'}
        </span>
      </div>
      {(isPaused || isStopped) ? (
        <button onClick={() => resumeMut.mutate()} disabled={resumeMut.isPending}
          className="w-full py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-colors flex items-center justify-center gap-1.5">
          <Power className="h-3 w-3" /> {resumeMut.isPending ? 'Resuming…' : 'Resume'}
        </button>
      ) : (
        <div className="flex gap-1.5">
          <button onClick={() => pauseMut.mutate()} disabled={pauseMut.isPending}
            className="flex-1 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold hover:bg-amber-500/20 transition-colors flex items-center justify-center gap-1">
            <PauseCircle className="h-3 w-3" /> Pause
          </button>
          <button onClick={() => hardStopMut.mutate()} disabled={hardStopMut.isPending}
            className="flex-1 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-400 text-xs font-semibold hover:bg-orange-500/20 transition-colors flex items-center justify-center gap-1">
            <StopCircle className="h-3 w-3" /> Hard Stop
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AutoTrader() {
  const qc = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [cycleResults, setCycleResults] = useState<unknown[] | null>(null);

  const { data: statusRaw, isLoading } = useQuery({
    queryKey:        ['autotrader-status'],
    queryFn:         () => api.autotrader.status(),
    refetchInterval: 30_000,
    staleTime:       15_000,
  });
  const status = (statusRaw as any)?.data;

  const { data: signalsRaw } = useQuery({
    queryKey:  ['autotrader-signals'],
    queryFn:   () => api.autotrader.signalsPreview(),
    staleTime: 60_000,
  });
  const signals: any[] = (signalsRaw as any)?.data?.signals ?? [];

  const { data: logsRaw } = useQuery({
    queryKey:        ['autotrader-logs'],
    queryFn:         () => api.autotrader.logs({ limit: 30 }),
    refetchInterval: 15_000,
    staleTime:       10_000,
  });
  const logs: any[] = (logsRaw as any)?.data?.logs ?? [];

  const { data: hlStatusRaw }  = useQuery({ queryKey: ['hl-status'],  queryFn: () => api.hyperliquid.status(), refetchInterval: 30_000 });
  const { data: tosStatusRaw } = useQuery({ queryKey: ['tos-status'], queryFn: () => api.tos.status(),         refetchInterval: 30_000 });
  const hlCtrlLevel  = (hlStatusRaw  as any)?.data?.killswitch?.controlLevel ?? 'ACTIVE';
  const tosCtrlLevel = (tosStatusRaw as any)?.data?.killswitch?.controlLevel ?? 'ACTIVE';

  const hlPauseMut     = useMutation({ mutationFn: () => (api.hyperliquid as any).pause('Manual pause'),  onSuccess: () => { toast.info('HL paused');      qc.invalidateQueries({ queryKey: ['hl-status'] }); } });
  const hlHardStopMut  = useMutation({ mutationFn: () => (api.hyperliquid as any).hardStop('Hard stop'),  onSuccess: () => { toast.warning('HL stopped');   qc.invalidateQueries({ queryKey: ['hl-status'] }); } });
  const hlResumeMut    = useMutation({ mutationFn: () => (api.hyperliquid as any).resume(),               onSuccess: () => { toast.success('HL resumed');   qc.invalidateQueries({ queryKey: ['hl-status'] }); } });
  const tosPauseMut    = useMutation({ mutationFn: () => (api.tos as any).pause('Manual pause'),          onSuccess: () => { toast.info('TOS paused');     qc.invalidateQueries({ queryKey: ['tos-status'] }); } });
  const tosHardStopMut = useMutation({ mutationFn: () => (api.tos as any).hardStop('Hard stop'),          onSuccess: () => { toast.warning('TOS stopped'); qc.invalidateQueries({ queryKey: ['tos-status'] }); } });
  const tosResumeMut   = useMutation({ mutationFn: () => (api.tos as any).resume(),                      onSuccess: () => { toast.success('TOS resumed'); qc.invalidateQueries({ queryKey: ['tos-status'] }); } });

  const enableMut  = useMutation({ mutationFn: () => api.autotrader.enable(),  onSuccess: () => { qc.invalidateQueries({ queryKey: ['autotrader-status'] }); toast.success('Auto-trading enabled'); } });
  const disableMut = useMutation({ mutationFn: () => api.autotrader.disable(), onSuccess: () => { qc.invalidateQueries({ queryKey: ['autotrader-status'] }); toast.success('Auto-trading disabled'); } });

  const cycleMut = useMutation({
    mutationFn: () => api.autotrader.runCycle(),
    onSuccess: (data: any) => {
      const d = data?.data;
      setCycleResults(d?.results ?? []);
      const filled = d?.summary?.filled ?? 0;
      toast.success(`Cycle: ${filled} filled${d?.summary?.dryRun ? ' [DRY RUN]' : ''}`);
      qc.invalidateQueries({ queryKey: ['autotrader-logs', 'live-positions-all', 'alpaca-positions-cmd'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Cycle failed'),
  });

  if (isLoading) return <LoadingState message="Loading command center…" />;

  const enabled   = status?.enabled ?? false;
  const config    = status?.config;
  const portfolio = status?.portfolioState;

  void cycleResults;
  void showConfig;

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center',
            enabled ? 'bg-accent-green/20 border border-accent-green/30' : 'bg-surface-3 border border-surface-border')}>
            <Bot className={cn('h-5 w-5', enabled ? 'text-accent-green' : 'text-slate-500')} />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">Autonomous Trading Command Center</h1>
            <p className="text-xs text-slate-500">All exchanges · AI-driven · Real-time positions · Claude approval</p>
          </div>
          <div className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide',
            enabled ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' : 'bg-surface-3 text-slate-500 border border-surface-border')}>
            <div className={cn('w-1.5 h-1.5 rounded-full', enabled ? 'bg-accent-green animate-pulse' : 'bg-slate-600')} />
            {enabled ? 'Active' : 'Inactive'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 border border-surface-border rounded-lg hover:text-white transition-colors">
            <Settings2 className="h-3.5 w-3.5" /> Configure
          </button>
          {enabled ? (
            <button onClick={() => disableMut.mutate()} disabled={disableMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg text-sm font-semibold hover:bg-red-500/20 transition-colors disabled:opacity-50">
              {disableMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <PowerOff className="h-4 w-4" />} Disable
            </button>
          ) : (
            <button onClick={() => enableMut.mutate()} disabled={enableMut.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-accent-green/10 border border-accent-green/30 text-accent-green rounded-lg text-sm font-semibold hover:bg-accent-green/20 transition-colors disabled:opacity-50">
              {enableMut.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />} Enable
            </button>
          )}
        </div>
      </div>

      {/* ── Config bar ── */}
      {config && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-surface-2 border border-surface-border text-xs text-slate-400 flex-wrap">
          <span className="font-mono font-semibold text-white">{config.exchange}</span>
          <span className="text-surface-border">|</span>
          <span>Stop <span className="text-red-400 font-mono">-{config.stopLossPct}%</span></span>
          <span className="text-surface-border">|</span>
          <span>Target <span className="text-accent-green font-mono">+{config.takeProfitPct}%</span></span>
          <span className="text-surface-border">|</span>
          <span>Conviction <span className="text-white font-mono">{config.minConvictionScore}</span></span>
          <span className="text-surface-border">|</span>
          {config.dryRun
            ? <span className="text-accent-blue font-semibold">SIMULATION MODE</span>
            : <span className="text-red-400 font-semibold flex items-center gap-1"><AlertOctagon className="h-3 w-3" /> LIVE ORDERS</span>
          }
        </div>
      )}

      {/* ── Portfolio stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Portfolio Equity"  value={portfolio ? fmtDollar(portfolio.totalEquity) : '—'} icon={<DollarSign className="h-4 w-4" />} color="cyan"   />
        <StatCard label="Today's Trades"    value={status?.todayTradeCount ?? 0}                        icon={<Activity   className="h-4 w-4" />} color="blue"   />
        <StatCard label="Active Positions"  value={status?.activePositionCount ?? 0}                    icon={<TrendingUp className="h-4 w-4" />} color="purple" />
        <StatCard label="Today's P&L"       value={status ? fmtDollar(status.todayPnl) : '—'}          icon={<Zap        className="h-4 w-4" />} color={status?.todayPnl >= 0 ? 'green' : 'red'} />
      </div>

      {/* ── Main grid: Live positions + Alpaca panel ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2">
          <LivePositionsPanel />
        </div>
        <div>
          <AlpacaCommandPanel />
        </div>
      </div>

      {/* ── Exchange controls (HL + TOS) ── */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-300">Exchange Controls</h3>
          <span className="text-xs text-slate-600">Per-exchange pause / hard stop</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ExchangeControlCard exchange="HYPERLIQUID" label="Hyperliquid"  ctrlLevel={hlCtrlLevel}
            pauseMut={hlPauseMut}  hardStopMut={hlHardStopMut}  resumeMut={hlResumeMut} />
          <ExchangeControlCard exchange="TOS"         label="ThinkorSwim" ctrlLevel={tosCtrlLevel}
            pauseMut={tosPauseMut} hardStopMut={tosHardStopMut} resumeMut={tosResumeMut} />
        </div>
      </Card>

      {/* ── Claude AI Review + Signals ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Signals */}
        <Card>
          <CardHeader
            title="Qualifying Signals"
            subtitle={`${signals.length} from latest scan`}
            icon={<Zap className="h-4 w-4" />}
            action={
              <button onClick={() => cycleMut.mutate()} disabled={cycleMut.isPending || !enabled}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  enabled
                    ? 'bg-accent-blue/20 border border-accent-blue/30 text-accent-blue hover:bg-accent-blue/30'
                    : 'bg-surface-3 border border-surface-border text-slate-500 cursor-not-allowed')}>
                {cycleMut.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
                Run Cycle
              </button>
            }
          />
          {signals.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-sm">
              <Globe className="h-8 w-8 text-slate-700 mx-auto mb-2" />
              No qualifying signals — run a Daily Scan first
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-surface-border">
                    {['Symbol', 'Bias', 'Conviction', 'Confidence', 'Setup', 'Entry'].map(h => (
                      <th key={h} className="text-left px-4 py-2 text-[10px] text-slate-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {signals.map((s: any) => {
                    const cv  = s.convictionScore;
                    const bar = cv >= 80 ? 'bg-accent-green' : cv >= 65 ? 'bg-accent-blue' : 'bg-accent-amber';
                    return (
                      <tr key={s.symbol} className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-bold text-white">{s.symbol}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold',
                            s.bias === 'BULLISH' ? 'text-accent-green bg-accent-green/10' :
                            s.bias === 'BEARISH' ? 'text-red-400 bg-red-400/10' : 'text-slate-400 bg-surface-3')}>
                            {s.bias}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 w-20">
                            <div className="flex-1 h-1.5 bg-surface-3 rounded-full">
                              <div className={cn('h-full rounded-full', bar)} style={{ width: `${cv}%` }} />
                            </div>
                            <span className="font-mono text-white text-[10px]">{cv}</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{s.confidenceScore ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-400">{s.setupType ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{s.entryPrice ? `$${s.entryPrice.toFixed(2)}` : 'market'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Claude AI Decision */}
        <AIDecisionPanel signals={signals} regime={(statusRaw as any)?.data?.regime} portfolioState={portfolio} />
      </div>

      {/* ── Recent trade log ── */}
      <Card className="p-4">
        <CardHeader title="Recent Trade Log" subtitle="Last 30 executions" icon={<Activity className="h-4 w-4" />} />
        {logs.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-6">No trades logged yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-surface-border">
                  {['Time', 'Symbol', 'Exchange', 'Action', 'Status', 'Price', 'Amount', 'Reason'].map(h => (
                    <th key={h} className="text-left px-3 py-2 text-[10px] text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l: any) => {
                  const meta = EXCHANGE_META[l.exchange] ?? { color: 'text-slate-400', label: l.exchange };
                  return (
                    <tr key={l.id} className="border-b border-surface-border/50 hover:bg-surface-2 transition-colors">
                      <td className="px-3 py-2 text-slate-500 font-mono whitespace-nowrap">
                        {l.executedAt ? new Date(l.executedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-white">{l.symbol}</td>
                      <td className={cn('px-3 py-2 font-mono text-[10px] font-semibold', meta.color)}>{meta.label}</td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-semibold',
                          l.action === 'BUY' ? 'text-accent-green bg-accent-green/10' : 'text-red-400 bg-red-400/10')}>
                          {l.action}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded',
                          l.status === 'FILLED'  ? 'text-emerald-400 bg-emerald-400/10' :
                          l.status === 'DRY_RUN' ? 'text-violet-400 bg-violet-400/10' :
                          l.status === 'BLOCKED' ? 'text-amber-400 bg-amber-400/10' :
                                                   'text-red-400 bg-red-400/10')}>
                          {l.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-300">{l.entryPrice ? `$${l.entryPrice.toFixed(2)}` : '—'}</td>
                      <td className="px-3 py-2 font-mono text-slate-300">{l.dollarAmount ? `$${l.dollarAmount.toFixed(0)}` : '—'}</td>
                      <td className="px-3 py-2 text-slate-500 max-w-[200px] truncate" title={l.reason}>{l.reason ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

    </div>
  );
}
