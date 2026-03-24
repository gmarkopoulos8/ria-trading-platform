import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bot, RefreshCw, TrendingUp, TrendingDown, DollarSign, Activity,
  Play, StopCircle, CheckCircle2, XCircle, Clock, Brain,
  BarChart3, Globe, Zap, ChevronDown, ChevronUp, Shield,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';

const fmtDollar = (n: number) => {
  const abs = Math.abs(n);
  const s   = abs >= 1000 ? `$${(abs / 1000).toFixed(1)}k` : `$${abs.toFixed(2)}`;
  return n < 0 ? `-${s}` : s;
};

const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const REGIME_COLORS: Record<string, string> = {
  BULL_TREND:          'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  CHOPPY:              'text-amber-400 bg-amber-500/15 border-amber-500/30',
  ELEVATED_VOLATILITY: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  BEAR_CRISIS:         'text-red-400 bg-red-500/15 border-red-500/30',
};

const ASSET_COLORS: Record<string, string> = {
  stock:  'bg-blue-500/20 text-blue-300',
  crypto: 'bg-violet-500/20 text-violet-300',
  etf:    'bg-cyan-500/20 text-cyan-300',
};

const STATUS_COLORS: Record<string, string> = {
  EXECUTED:  'text-emerald-400',
  REJECTED:  'text-red-400',
  SKIPPED:   'text-slate-500',
  CLOSED:    'text-blue-400',
  PENDING:   'text-amber-400',
};

export default function MissionControl() {
  const qc = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minConviction, setMinConviction] = useState(75);
  const [maxPositions, setMaxPositions]   = useState(3);
  const [capitalPct, setCapitalPct]       = useState(5.0);

  const { data: raw, isLoading, refetch } = useQuery({
    queryKey:        ['mission-control'],
    queryFn:         () => (api.autotrader as any).missionControl().then((r: any) => r.data),
    refetchInterval: 15_000,
    staleTime:       10_000,
  });
  const d = raw as any;

  useEffect(() => {
    if (d) {
      setMinConviction(d.autonomousMinConviction ?? 75);
      setMaxPositions(d.autonomousMaxPositions  ?? 3);
      setCapitalPct(d.autonomousCapitalPct      ?? 5.0);
    }
  }, [d?.autonomousMinConviction, d?.autonomousMaxPositions, d?.autonomousCapitalPct]);

  const isActive = !!(d?.autonomousMode && d?.autoTradeEnabled);

  const enableMut = useMutation({
    mutationFn: () => (api.autotrader as any).autonomousEnable({ minConviction, maxPositions, capitalPct }),
    onSuccess: () => {
      toast.success('Claude is now in control — autonomous trading started');
      qc.invalidateQueries({ queryKey: ['mission-control'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed to start'),
  });

  const disableMut = useMutation({
    mutationFn: () => (api.autotrader as any).autonomousDisable(),
    onSuccess: () => {
      toast.info('Autonomous trading stopped');
      qc.invalidateQueries({ queryKey: ['mission-control'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed to stop'),
  });

  const runNowMut = useMutation({
    mutationFn: () => (api.autotrader as any).autonomousRun(),
    onSuccess: (r: any) => {
      const placed = r?.data?.tradesPlaced ?? 0;
      toast.success(placed > 0
        ? `${placed} trade${placed !== 1 ? 's' : ''} placed`
        : 'Cycle complete — no trades this run');
      qc.invalidateQueries({ queryKey: ['mission-control'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Cycle failed'),
  });

  const scanMut = useMutation({
    mutationFn: () => api.scans.trigger({ force: true }),
    onSuccess: () => {
      toast.success('Scan started — takes 2–3 minutes');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['mission-control'] }), 180_000);
    },
    onError: () => toast.error('Scan failed to start'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 animate-spin text-violet-400 mx-auto" />
          <p className="text-slate-500 text-sm">Loading Mission Control…</p>
        </div>
      </div>
    );
  }

  const regime    = d?.regime;
  const portfolio = d?.portfolio;
  const signals   = d?.signals ?? [];
  const logs      = d?.recentLogs ?? [];
  const regimeKey = regime?.regime ?? 'UNKNOWN';
  const regimeCls = REGIME_COLORS[regimeKey] ?? 'text-slate-400 bg-surface-2 border-surface-border';

  return (
    <div className="min-h-screen p-6 space-y-6 max-w-[1200px] mx-auto">

      {/* ── Hero header ── */}
      <div className="text-center space-y-2 pt-4 pb-2">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className={cn(
            'w-14 h-14 rounded-2xl flex items-center justify-center border-2 transition-all duration-500',
            isActive
              ? 'bg-violet-500/20 border-violet-500/50 shadow-[0_0_30px_rgba(139,92,246,0.3)]'
              : 'bg-surface-3 border-surface-border',
          )}>
            <Bot className={cn('h-8 w-8 transition-colors', isActive ? 'text-violet-400' : 'text-slate-500')} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">RIA BOT Mission Control</h1>
        <p className="text-sm text-slate-500">
          Claude autonomously selects and trades stocks, crypto &amp; options · Sub-minute execution · Auto stop/target
        </p>
      </div>

      {/* ── Big GO / STOP button ── */}
      <div className="flex flex-col items-center gap-4">
        {!d?.alpacaConnected ? (
          <div className="w-full max-w-sm p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-center">
            <p className="text-red-400 font-semibold text-sm mb-1">Alpaca not connected</p>
            <p className="text-xs text-slate-500">
              Go to <a href="/settings" className="text-violet-400 underline">Settings → Connections</a> to connect your Alpaca paper account first.
            </p>
          </div>
        ) : isActive ? (
          <div className="flex flex-col items-center gap-3 w-full max-w-sm">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-violet-500/20 animate-ping" />
              <div className="absolute inset-2 rounded-full bg-violet-500/10 animate-ping [animation-delay:150ms]" />
              <button
                onClick={() => disableMut.mutate()}
                disabled={disableMut.isPending}
                className="relative w-36 h-36 rounded-full bg-red-500/20 border-2 border-red-500/50 text-red-300 font-bold flex flex-col items-center justify-center gap-1 hover:bg-red-500/30 transition-all disabled:opacity-50 shadow-lg"
              >
                {disableMut.isPending
                  ? <RefreshCw className="h-8 w-8 animate-spin" />
                  : <StopCircle className="h-8 w-8" />}
                <span className="text-sm">STOP</span>
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-violet-400">
              <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="font-semibold">CLAUDE IS TRADING</span>
              {d?.dryRun && <span className="text-slate-500 font-normal">· DRY RUN</span>}
            </div>
            <button
              onClick={() => runNowMut.mutate()}
              disabled={runNowMut.isPending}
              className="flex items-center gap-2 px-4 py-2 text-xs text-slate-400 border border-surface-border rounded-xl hover:text-white hover:border-violet-500/40 transition-colors disabled:opacity-50"
            >
              {runNowMut.isPending
                ? <RefreshCw className="h-3 w-3 animate-spin" />
                : <Play className="h-3 w-3" />}
              {runNowMut.isPending ? 'Running cycle…' : 'Run cycle now'}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 w-full max-w-sm">
            <button
              onClick={() => enableMut.mutate()}
              disabled={enableMut.isPending}
              className="w-36 h-36 rounded-full bg-violet-500/20 border-2 border-violet-500/50 text-violet-300 font-bold flex flex-col items-center justify-center gap-1 hover:bg-violet-500/30 hover:shadow-[0_0_40px_rgba(139,92,246,0.4)] transition-all disabled:opacity-50 shadow-lg"
            >
              {enableMut.isPending
                ? <RefreshCw className="h-8 w-8 animate-spin" />
                : <Bot className="h-8 w-8" />}
              <span className="text-sm">{enableMut.isPending ? 'STARTING…' : 'GO'}</span>
            </button>
            <p className="text-xs text-slate-500 text-center max-w-xs">
              Claude will scan the market, select the best signals, and place trades automatically.
              {d?.dryRun && <span className="text-amber-400"> Running in dry-run mode.</span>}
            </p>
          </div>
        )}
      </div>

      {/* ── Alpaca Account Panel ── */}
      {(() => {
        const alpaca   = (d?.alpacaData as any) ?? null;
        const account  = alpaca?.account ?? null;
        const positions: any[] = alpaca?.positions ?? [];
        const totalUnrealized = positions.reduce((s: number, p: any) => s + (p.unrealizedPl ?? 0), 0);
        const dayPnl = account ? account.equity - account.lastEquity : 0;

        return (
          <Card className={cn('p-4 border', isActive ? 'border-violet-500/20' : 'border-surface-border')}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-bold text-white">Alpaca Paper Account</h3>
              {d?.dryRun && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/20 font-semibold">
                  DRY RUN
                </span>
              )}
            </div>

            {!d?.alpacaConnected ? (
              <p className="text-xs text-slate-500 text-center py-4">
                Connect Alpaca in <a href="/settings" className="text-violet-400 underline">Settings → Connections</a>
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  {[
                    {
                      label: 'Account Equity',
                      value: account ? fmtDollar(account.equity) : '—',
                      sub:   dayPnl !== 0 ? `${dayPnl >= 0 ? '+' : ''}${fmtDollar(dayPnl)} today` : 'vs yesterday',
                      color: 'text-white',
                      subColor: dayPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
                    },
                    {
                      label: 'Buying Power',
                      value: account ? fmtDollar(account.buyingPower) : '—',
                      sub:   'available to deploy',
                      color: 'text-cyan-400',
                      subColor: 'text-slate-500',
                    },
                    {
                      label: 'Open Positions',
                      value: positions.length,
                      sub:   positions.length > 0 ? `${fmtDollar(totalUnrealized)} unrealized` : 'no open trades',
                      color: positions.length > 0 ? 'text-violet-400' : 'text-slate-500',
                      subColor: totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400',
                    },
                    {
                      label: 'Unrealized P&L',
                      value: positions.length > 0 ? fmtDollar(totalUnrealized) : '—',
                      sub:   positions.length > 0
                        ? `${positions.filter((p: any) => p.unrealizedPl >= 0).length} winning · ${positions.filter((p: any) => p.unrealizedPl < 0).length} losing`
                        : 'no positions',
                      color: totalUnrealized >= 0 ? 'text-emerald-400' : 'text-red-400',
                      subColor: 'text-slate-500',
                    },
                  ].map(({ label, value, sub, color, subColor }) => (
                    <div key={label} className="p-3 bg-surface-2 rounded-xl border border-surface-border">
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
                      <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
                      <p className={cn('text-[10px] mt-0.5', subColor)}>{sub}</p>
                    </div>
                  ))}
                </div>

                {positions.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Open Positions</p>
                    {positions.map((p: any) => (
                      <div key={p.symbol} className={cn(
                        'flex items-center gap-3 text-xs px-3 py-2 rounded-lg border',
                        p.unrealizedPl >= 0
                          ? 'bg-emerald-500/5 border-emerald-500/15'
                          : 'bg-red-500/5 border-red-500/15',
                      )}>
                        <span className={cn(
                          'text-[10px] font-bold px-1.5 py-0.5 rounded',
                          p.side === 'long' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400',
                        )}>
                          {p.side?.toUpperCase()}
                        </span>
                        <span className="font-mono font-bold text-white w-16">{p.symbol}</span>
                        <span className="text-slate-400">{p.qty.toFixed(p.qty < 1 ? 4 : 2)} @ {fmtDollar(p.entryPrice)}</span>
                        <span className="text-slate-500">→ {fmtDollar(p.currentPrice)}</span>
                        <span className="text-slate-500 flex-1">{fmtDollar(p.marketValue)}</span>
                        <span className={cn('font-mono font-bold', p.unrealizedPl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {fmtPct(p.unrealizedPlPct)}
                        </span>
                        <span className={cn('font-mono text-[10px] w-16 text-right font-bold',
                          p.unrealizedPl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                          {p.unrealizedPl >= 0 ? '+' : ''}{fmtDollar(p.unrealizedPl)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {positions.length === 0 && isActive && (
                  <p className="text-xs text-slate-600 text-center py-2">
                    No open positions — Claude will deploy capital at next qualifying signal
                  </p>
                )}
              </>
            )}
          </Card>
        );
      })()}

      {/* ── Market stats row ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          {
            label: 'Market Regime',
            value: regimeKey.replace('_', ' '),
            sub:   regime?.vix ? `VIX ${regime.vix.toFixed(1)}` : 'VIX N/A',
            icon:  <Globe className="h-4 w-4" />,
            color: regimeKey === 'BULL_TREND' ? 'text-emerald-400' : regimeKey === 'BEAR_CRISIS' ? 'text-red-400' : 'text-amber-400',
          },
          {
            label: "Today's Trades",
            value: d?.todayTrades ?? 0,
            sub:   d?.todayPnl !== undefined ? `${fmtDollar(d.todayPnl)} realized P&L` : '',
            icon:  <Activity className="h-4 w-4" />,
            color: 'text-blue-400',
          },
          {
            label: 'Signals Ready',
            value: signals.length,
            sub:   d?.latestScan
              ? `Scan ${new Date(d.latestScan.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : 'No scan yet',
            icon:  <Brain className="h-4 w-4" />,
            color: 'text-violet-400',
          },
        ].map(({ label, value, sub, icon, color }) => (
          <Card key={label} className="p-3">
            <div className={cn('flex items-center gap-2 mb-1', color)}>
              {icon}
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
            </div>
            <p className={cn('text-xl font-bold font-mono', color)}>{value}</p>
            {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
          </Card>
        ))}
      </div>

      {/* ── Signals Claude will trade ── */}
      {signals.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-sm font-semibold text-white">Signals Claude is watching</span>
              <span className="text-xs text-slate-500">({signals.length} from latest scan)</span>
            </div>
            <button
              onClick={() => scanMut.mutate()}
              disabled={scanMut.isPending}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-300 transition-colors disabled:opacity-50"
            >
              {scanMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {scanMut.isPending ? 'Scanning…' : 'Rescan'}
            </button>
          </div>
          <div className="space-y-2">
            {signals.map((s: any) => (
              <div key={s.symbol} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-white text-sm w-14">{s.symbol}</span>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', ASSET_COLORS[s.assetClass] ?? 'bg-surface-3 text-slate-400')}>
                    {s.assetClass ?? 'stock'}
                  </span>
                  <span className={cn('text-xs font-medium', s.bias === 'BULLISH' ? 'text-emerald-400' : s.bias === 'BEARISH' ? 'text-red-400' : 'text-slate-400')}>
                    {s.bias === 'BULLISH' ? <TrendingUp className="h-3 w-3 inline mr-0.5" /> : <TrendingDown className="h-3 w-3 inline mr-0.5" />}
                    {s.bias}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {s.sector && <span className="hidden md:block">{s.sector}</span>}
                  <span className={cn('font-semibold', s.convictionScore >= 80 ? 'text-emerald-400' : s.convictionScore >= 70 ? 'text-amber-400' : 'text-slate-400')}>
                    {s.convictionScore}% conviction
                  </span>
                </div>
              </div>
            ))}
          </div>
          {d?.latestScan && (
            <p className="text-xs text-slate-600 mt-3">
              Last scan: {new Date(d.latestScan.completedAt).toLocaleString()} · {d.latestScan.resultCount} results
            </p>
          )}
        </Card>
      )}

      {/* ── No signals state ── */}
      {signals.length === 0 && (
        <Card className="p-6 text-center space-y-3">
          <BarChart3 className="h-8 w-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400">No signals from the latest scan</p>
          <p className="text-xs text-slate-600">Run a scan to generate trading signals</p>
          <button
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs bg-violet-500/20 border border-violet-500/30 text-violet-300 rounded-xl hover:bg-violet-500/30 transition-colors disabled:opacity-50"
          >
            {scanMut.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {scanMut.isPending ? 'Scanning…' : 'Run scan now'}
          </button>
        </Card>
      )}

      {/* ── Advanced settings ── */}
      <Card className="p-4">
        <button
          className="w-full flex items-center justify-between text-sm font-semibold text-white"
          onClick={() => setShowAdvanced(v => !v)}
        >
          <span className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            Advanced Settings
          </span>
          {showAdvanced ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
        </button>

        {showAdvanced && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Min Conviction Score: <span className="text-white font-semibold">{minConviction}</span>
              </label>
              <input
                type="range" min={60} max={95} step={5}
                value={minConviction}
                onChange={e => setMinConviction(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>60 (aggressive)</span><span>95 (conservative)</span></div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Max Simultaneous Positions: <span className="text-white font-semibold">{maxPositions}</span>
              </label>
              <input
                type="range" min={1} max={10} step={1}
                value={maxPositions}
                onChange={e => setMaxPositions(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>1</span><span>10</span></div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Capital Per Trade: <span className="text-white font-semibold">{capitalPct}%</span>
              </label>
              <input
                type="range" min={1} max={20} step={0.5}
                value={capitalPct}
                onChange={e => setCapitalPct(Number(e.target.value))}
                className="w-full accent-violet-500"
              />
              <div className="flex justify-between text-xs text-slate-600 mt-0.5"><span>1%</span><span>20%</span></div>
            </div>
            <p className="col-span-full text-xs text-slate-500">
              Settings take effect on the next GO. If already active, re-click GO to apply.
            </p>
          </div>
        )}
      </Card>

      {/* ── Recent trade log ── */}
      {logs.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-semibold text-white">Recent Executions</span>
          </div>
          <div className="space-y-2">
            {logs.map((log: any, i: number) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0 text-sm">
                <div className="flex items-center gap-3">
                  {log.status === 'EXECUTED' || log.status === 'CLOSED'
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="h-3.5 w-3.5 text-red-400 flex-shrink-0" />}
                  <span className="font-mono font-bold text-white w-14">{log.symbol}</span>
                  <span className={cn('text-xs font-medium', STATUS_COLORS[log.status] ?? 'text-slate-400')}>
                    {log.status}
                  </span>
                  {log.exchange && (
                    <span className="text-xs text-slate-600 hidden md:block">{log.exchange}</span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-400">
                  {log.pnl != null && (
                    <span className={cn('font-semibold', log.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {fmtDollar(log.pnl)}
                    </span>
                  )}
                  {log.convictionScore && (
                    <span className="hidden md:block">{log.convictionScore}%</span>
                  )}
                  <span>{new Date(log.executedAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Daily schedule ── */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-slate-400" />
          <span className="text-sm font-semibold text-white">Daily Schedule (ET)</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {[
            { time: '9:30 AM', label: 'Scan + Trade', color: 'text-violet-400' },
            { time: 'Every 60s', label: 'Monitor stops/targets', color: 'text-blue-400' },
            { time: '3:45 PM', label: 'Close all positions', color: 'text-amber-400' },
            { time: '4:00 PM', label: 'Telegram summary', color: 'text-emerald-400' },
          ].map(item => (
            <div key={item.time} className="p-3 bg-surface-2 rounded-xl border border-surface-border">
              <p className={cn('font-bold', item.color)}>{item.time}</p>
              <p className="text-slate-400 mt-0.5">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Last run info ── */}
      {d?.lastAutonomousRun && (
        <p className="text-center text-xs text-slate-600">
          Last autonomous cycle: {new Date(d.lastAutonomousRun).toLocaleString()}
        </p>
      )}

      {/* ── Refresh button ── */}
      <div className="flex justify-center pb-4">
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-white transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh status
        </button>
      </div>
    </div>
  );
}
