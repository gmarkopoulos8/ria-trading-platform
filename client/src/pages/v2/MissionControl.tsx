import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';

const fmt$ = (n: number, compact = false) => {
  const abs = Math.abs(n);
  const s = compact && abs >= 1000
    ? `$${(abs / 1000).toFixed(1)}k`
    : `$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return n < 0 ? `-${s}` : s;
};
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

const REGIME_META: Record<string, { label: string; color: string; bg: string; strategy: string; emoji: string }> = {
  BULL_TREND:          { label: 'Bull Market',     color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/25', strategy: 'Buying high-conviction longs',           emoji: '📈' },
  CHOPPY:              { label: 'Choppy Market',   color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/25',    strategy: 'Mixed: small longs + covered calls',     emoji: '⚖️' },
  ELEVATED_VOLATILITY: { label: 'High Volatility', color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/25', strategy: 'Selling premium — Iron Condors & CSPs', emoji: '💰' },
  BEAR_CRISIS:         { label: 'Bear Market',     color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/25',        strategy: 'Aggressive premium selling (VIX 30+)', emoji: '🔴' },
};

function GoButton({ status, onStart, onStop }: {
  status: any;
  onStart: (mode: string, riskProfile: string) => void;
  onStop: () => void;
}) {
  const [riskProfile, setRiskProfile] = useState(status?.riskProfile ?? 'MODERATE');
  const [showConfig, setShowConfig] = useState(false);
  const isOn     = status?.riaMode !== 'OFF' && !!status?.riaMode;
  const isDryRun = status?.dryRun ?? true;
  const hasAlpaca = status?.connections?.alpaca;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="relative">
        {isOn && (
          <>
            <div className="absolute -inset-4 rounded-full bg-violet-500/10 animate-ping" style={{ animationDuration: '3s' }} />
            <div className="absolute -inset-2 rounded-full bg-violet-500/5 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
          </>
        )}
        <button
          onClick={() => isOn ? onStop() : (hasAlpaca ? onStart('PAPER', riskProfile) : null)}
          disabled={!hasAlpaca && !isOn}
          className={cn(
            'relative w-44 h-44 rounded-full font-bold text-xl flex flex-col items-center justify-center gap-2 transition-all duration-300 border-4 shadow-2xl',
            isOn
              ? 'bg-red-500/15 border-red-500/60 text-red-300 hover:bg-red-500/25 shadow-red-500/20'
              : hasAlpaca
              ? 'bg-violet-500/15 border-violet-500/60 text-violet-300 hover:bg-violet-500/25 hover:shadow-violet-500/30 cursor-pointer'
              : 'bg-surface-3 border-surface-border text-slate-600 cursor-not-allowed',
          )}
        >
          <span className="text-4xl">{isOn ? '⏹' : '▶'}</span>
          <span className="tracking-widest text-sm">{isOn ? 'STOP' : 'START'}</span>
          {isOn && isDryRun && <span className="text-[10px] text-slate-400 font-normal">DRY RUN</span>}
        </button>
      </div>

      <div className="text-center">
        {isOn ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-sm font-semibold text-violet-300">RIA is trading autonomously</span>
          </div>
        ) : hasAlpaca ? (
          <p className="text-sm text-slate-500">Click START to begin autonomous trading</p>
        ) : (
          <p className="text-sm text-red-400">Connect Alpaca in Settings first</p>
        )}
        {isOn && status?.lastRun && (
          <p className="text-xs text-slate-600 mt-1">
            Last cycle: {new Date(status.lastRun).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {!isOn && hasAlpaca && (
        <>
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
          >
            {showConfig ? '▲ Hide settings' : '⚙ Configure risk settings'}
          </button>
          {showConfig && (
            <div className="w-full max-w-xs bg-surface-2 border border-surface-border rounded-2xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Risk Profile</p>
              <div className="grid grid-cols-3 gap-2">
                {['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].map(p => (
                  <button
                    key={p}
                    onClick={() => setRiskProfile(p)}
                    className={cn(
                      'py-2 rounded-lg text-xs font-semibold border transition-colors',
                      riskProfile === p
                        ? 'bg-violet-500/20 border-violet-500/50 text-violet-300'
                        : 'bg-surface-3 border-surface-border text-slate-500 hover:text-slate-300',
                    )}
                  >
                    {p.slice(0, 4)}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-slate-600 space-y-1">
                {riskProfile === 'CONSERVATIVE' && <p>Max 2% per trade · Lower conviction required · Iron Condors only in bad markets</p>}
                {riskProfile === 'MODERATE'     && <p>Max 5% per trade · Balanced approach · All strategies enabled</p>}
                {riskProfile === 'AGGRESSIVE'   && <p>Max 10% per trade · High conviction required · Leveraged positions via HL</p>}
              </div>
              <button
                onClick={() => { onStart('PAPER', riskProfile); setShowConfig(false); }}
                className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Start with {riskProfile.toLowerCase()} risk
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AccountPanel({ status }: { status: any }) {
  const portfolio     = status?.portfolio;
  const alpacaPositions: any[] = status?.openTrades?.filter((t: any) => t.exchange === 'ALPACA') ?? [];
  const totalUnrealized = alpacaPositions.reduce((s: number, p: any) => s + (p.unrealizedPnl ?? 0), 0);

  const paperBalance = portfolio?.balances?.find((b: any) => b.exchange === 'PAPER');
  const equity       = paperBalance?.equity ?? 0;
  const buyingPower  = paperBalance?.cash ?? 0;
  const dayPnl       = status?.today?.pnl ?? 0;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Account Equity', value: equity > 0 ? fmt$(equity) : '—',                   color: 'text-white',          sub: dayPnl !== 0 ? `${dayPnl >= 0 ? '+' : ''}${fmt$(dayPnl)} today` : '' },
          { label: 'Buying Power',   value: buyingPower > 0 ? fmt$(buyingPower, true) : '—',    color: 'text-cyan-400',       sub: 'available' },
          { label: 'Open Positions', value: alpacaPositions.length,                             color: alpacaPositions.length > 0 ? 'text-violet-400' : 'text-slate-500', sub: alpacaPositions.length > 0 ? `${fmt$(totalUnrealized)} unrealized` : 'none open' },
          { label: "Today's Trades", value: status?.today?.trades ?? 0,                         color: 'text-blue-400',       sub: '' },
        ].map(({ label, value, color, sub }) => (
          <div key={label} className="bg-surface-2 rounded-xl p-3 border border-surface-border">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">{label}</p>
            <p className={cn('text-lg font-bold font-mono', color)}>{value}</p>
            {sub && <p className={cn('text-[10px] mt-0.5', label === 'Account Equity' && dayPnl >= 0 ? 'text-emerald-400' : 'text-slate-500')}>{sub}</p>}
          </div>
        ))}
      </div>

      {alpacaPositions.length > 0 && (
        <div className="space-y-1.5">
          {alpacaPositions.slice(0, 6).map((p: any) => {
            const daysHeld   = p.executedAt ? Math.floor((Date.now() - new Date(p.executedAt).getTime()) / 86_400_000) : 0;
            const holdDays   = p.holdWindowDays ?? 1;
            const progress   = Math.min(100, (daysHeld / holdDays) * 100);
            const isOvernight = holdDays > 1;
            return (
              <div key={p.id} className={cn(
                'px-3 py-2.5 rounded-xl border text-xs space-y-1.5',
                (p.unrealizedPnl ?? 0) >= 0 ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/5 border-red-500/15',
              )}>
                <div className="flex items-center gap-2">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0',
                    isOvernight ? 'bg-violet-500/20 text-violet-300' : 'bg-blue-500/20 text-blue-300')}>
                    {isOvernight ? `${holdDays}D` : 'INTRADAY'}
                  </span>
                  <span className="font-mono font-bold text-white">{p.symbol}</span>
                  <span className="text-slate-500 flex-1">{p.entryPrice ? `@${fmt$(p.entryPrice)}` : ''}</span>
                  <span className={cn('font-mono font-bold', (p.unrealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                    {p.unrealizedPnl != null ? fmt$(p.unrealizedPnl) : '—'}
                  </span>
                </div>
                {isOvernight && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-surface-3 rounded-full overflow-hidden">
                      <div className="h-full bg-violet-500/60 rounded-full transition-all" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-500 flex-shrink-0">Day {daysHeld + 1}/{holdDays}</span>
                    {p.stopLoss && (
                      <span className="text-[10px] text-red-400/70 flex-shrink-0">Stop {fmt$(p.stopLoss)}</span>
                    )}
                  </div>
                )}
                {p.exitCondition && (
                  <p className="text-[10px] text-slate-600 truncate">Exit if: {p.exitCondition}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {alpacaPositions.length === 0 && status?.riaMode !== 'OFF' && (
        <p className="text-xs text-slate-600 text-center py-2">
          Claude will deploy capital at the next qualifying signal
        </p>
      )}
    </div>
  );
}

function RegimePanel({ regime }: { regime: any }) {
  if (!regime) return null;
  const meta = REGIME_META[regime.regime] ?? REGIME_META.CHOPPY;
  return (
    <div className={cn('rounded-xl border p-3 flex items-start gap-3', meta.bg)}>
      <span className="text-2xl flex-shrink-0">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className={cn('text-sm font-bold', meta.color)}>{meta.label}</p>
          {regime.vix != null && (
            <span className="text-[10px] text-slate-500 font-mono">VIX {Number(regime.vix).toFixed(1)}</span>
          )}
        </div>
        <p className="text-xs text-slate-400">{meta.strategy}</p>
      </div>
    </div>
  );
}

function SignalsPanel({ signals }: { signals: any[] }) {
  if (!signals?.length) return (
    <div className="text-center py-6 text-slate-600 text-xs">
      No signals yet — RIA scans automatically at 9:30 AM ET
    </div>
  );
  return (
    <div className="space-y-1.5">
      {signals.slice(0, 6).map((s: any) => {
        const cv       = s.convictionScore ?? 0;
        const barColor = cv >= 80 ? 'bg-emerald-500' : cv >= 70 ? 'bg-blue-500' : 'bg-amber-500';
        const biasBadge = s.bias === 'BULLISH'
          ? 'bg-emerald-500/20 text-emerald-400'
          : s.bias === 'BEARISH'
          ? 'bg-red-500/20 text-red-400'
          : 'bg-slate-700 text-slate-400';
        const assetBadge = s.assetClass === 'crypto'
          ? 'bg-violet-500/20 text-violet-300'
          : 'bg-blue-500/20 text-blue-300';
        return (
          <div key={s.symbol} className="flex items-center gap-2 px-3 py-2 bg-surface-2 rounded-xl border border-surface-border hover:border-violet-500/20 transition-colors">
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', assetBadge)}>
              {s.assetClass?.toUpperCase().slice(0, 3)}
            </span>
            <span className="font-mono font-bold text-white w-14 text-sm">{s.symbol}</span>
            <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
              <div className={cn('h-full rounded-full', barColor)} style={{ width: `${cv}%` }} />
            </div>
            <span className="text-xs font-mono text-white w-7 text-right">{cv}</span>
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', biasBadge)}>
              {s.bias?.slice(0, 4)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function MissionControl() {
  const qc = useQueryClient();

  const { data: raw, isLoading } = useQuery({
    queryKey:        ['ria-status'],
    queryFn:         () => (api.autotrader as any).riaStatus().then((r: any) => r.data),
    refetchInterval: 12_000,
    staleTime:       8_000,
  });
  const status = raw as any;

  const modeMut = useMutation({
    mutationFn: (body: any) => (api.autotrader as any).riaMode(body),
    onSuccess: (_: any, vars: any) => {
      const on = vars.mode !== 'OFF';
      toast.success(on ? 'RIA is now trading autonomously' : 'RIA stopped');
      qc.invalidateQueries({ queryKey: ['ria-status'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed'),
  });

  const scanMut = useMutation({
    mutationFn: () => api.scans.trigger({ force: true }),
    onSuccess: () => {
      toast.success('Scan started — takes 2–3 minutes');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['ria-status'] }), 180_000);
    },
  });

  const diagnoseMut = useMutation({
    mutationFn: () => (api.autotrader as any).diagnose(),
    onSuccess: (r: any) => {
      const d = r.data;
      if (d.canTrade) {
        toast.success('All systems go — trades should execute');
      } else {
        d.issues.forEach((issue: string) => toast.error(issue, { duration: 8000 }));
        d.warnings.forEach((w: string) => toast.warning(w, { duration: 5000 }));
      }
    },
    onError: () => toast.error('Diagnostic failed'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 rounded-full bg-violet-500/20 flex items-center justify-center mx-auto animate-pulse">
          <span className="text-3xl">🤖</span>
        </div>
        <p className="text-slate-500 text-sm">Connecting to RIA…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-1">
      <div className="border-b border-surface-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-9 h-9 rounded-xl flex items-center justify-center text-xl',
            status?.riaMode !== 'OFF' ? 'bg-violet-500/20' : 'bg-surface-3',
          )}>
            🤖
          </div>
          <div>
            <h1 className="text-base font-bold text-white">RIA — Autonomous Trading</h1>
            <p className="text-[10px] text-slate-500">Stocks · Crypto · Options · All markets · Always on</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => diagnoseMut.mutate()}
            disabled={diagnoseMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-surface-border rounded-lg hover:text-amber-400 hover:border-amber-500/30 transition-colors disabled:opacity-50"
          >
            {diagnoseMut.isPending ? '⟳ Checking…' : '🔍 Diagnose'}
          </button>
          <button
            onClick={() => scanMut.mutate()}
            disabled={scanMut.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 border border-surface-border rounded-lg hover:text-white hover:border-violet-500/30 transition-colors disabled:opacity-50"
          >
            {scanMut.isPending ? '⟳ Scanning…' : '⟳ Force Scan'}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-[1100px] mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT: Go button + regime + schedule */}
          <div className="flex flex-col items-center gap-6 lg:pt-8">
            <GoButton
              status={status}
              onStart={(mode, riskProfile) => modeMut.mutate({
                mode,
                riskProfile,
                maxPositionPct:      riskProfile === 'CONSERVATIVE' ? 2.0 : riskProfile === 'AGGRESSIVE' ? 10.0 : 5.0,
                maxDailyDrawdownPct: riskProfile === 'CONSERVATIVE' ? 1.5 : riskProfile === 'AGGRESSIVE' ? 5.0  : 3.0,
              })}
              onStop={() => modeMut.mutate({ mode: 'OFF' })}
            />
            <RegimePanel regime={status?.regime} />

            <div className="w-full bg-surface-2 border border-surface-border rounded-xl p-3 text-xs text-slate-500 space-y-1.5">
              <p className="text-white font-semibold text-xs mb-2">Daily Schedule</p>
              {[
                ['9:15 AM ET', 'Pre-market scan'],
                ['9:30 AM ET', 'Full scan → Claude selects → Execute'],
                ['Every 60s',  'Intraday monitor (stops + targets)'],
                ['3:45 PM ET', 'Close all positions'],
                ['4:00 PM ET', 'Telegram daily summary'],
                ['24/7',       'Crypto via Hyperliquid'],
              ].map(([time, label]) => (
                <div key={time} className="flex items-center gap-2">
                  <span className="text-violet-400 font-mono text-[10px] w-20 flex-shrink-0">{time}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CENTER: Account + signals */}
          <div className="space-y-4">
            <div className="bg-surface-2 border border-surface-border rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-white">Alpaca Account</span>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border',
                  status?.connections?.alpaca
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                    : 'bg-red-500/15 text-red-400 border-red-500/25')}>
                  {status?.connections?.alpaca ? 'CONNECTED' : 'NOT CONNECTED'}
                </span>
                {status?.dryRun && (
                  <span className="text-[10px] text-slate-500 ml-auto">DRY RUN</span>
                )}
              </div>
              <AccountPanel status={status} />
            </div>

            <div className="bg-surface-2 border border-surface-border rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold text-white">Claude's Candidates</span>
                <span className="text-[10px] text-slate-500">{status?.signals?.length ?? 0} signals</span>
              </div>
              <SignalsPanel signals={status?.signals ?? []} />
            </div>
          </div>

          {/* RIGHT: Recent trades */}
          <div className="bg-surface-2 border border-surface-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-white">Recent Trades</span>
              <span className="text-[10px] text-slate-500">{status?.today?.trades ?? 0} today</span>
            </div>

            {(!status?.recentTrades || status.recentTrades.length === 0) ? (
              <div className="text-center py-8 text-slate-600 text-xs">
                <p className="text-2xl mb-2">📋</p>
                <p>No trades yet</p>
                <p className="mt-1">Click START to begin</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {status.recentTrades.map((t: any) => {
                  const pnl    = t.realizedPnl ?? t.unrealizedPnl ?? null;
                  const isOpen = t.status === 'OPEN';
                  return (
                    <div key={t.id} className={cn(
                      'px-3 py-2 rounded-xl border text-xs',
                      isOpen                         ? 'bg-violet-500/5 border-violet-500/15' :
                      pnl !== null && pnl >= 0       ? 'bg-emerald-500/5 border-emerald-500/15' :
                      pnl !== null && pnl < 0        ? 'bg-red-500/5 border-red-500/15' :
                                                       'bg-surface-3 border-surface-border',
                    )}>
                      <div className="flex items-center gap-2">
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                          isOpen                   ? 'bg-violet-500/20 text-violet-300' :
                          pnl !== null && pnl >= 0 ? 'bg-emerald-500/20 text-emerald-400' :
                          pnl !== null && pnl < 0  ? 'bg-red-500/20 text-red-400' :
                                                     'bg-slate-700 text-slate-400')}>
                          {isOpen ? 'OPEN' : pnl !== null && pnl >= 0 ? 'WIN' : pnl !== null && pnl < 0 ? 'LOSS' : 'DONE'}
                        </span>
                        <span className="font-mono font-bold text-white">{t.symbol}</span>
                        <span className="text-slate-500 text-[10px]">{t.strategy ?? 'LONG'}</span>
                        {pnl !== null && (
                          <span className={cn('font-mono font-bold ml-auto', pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                            {pnl >= 0 ? '+' : ''}{fmt$(pnl)}
                          </span>
                        )}
                      </div>
                      {t.claudeReasoning && (
                        <p className="text-[10px] text-slate-500 mt-1 truncate">{t.claudeReasoning}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {status?.riaMode === 'OFF' && (
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: '🧠', title: 'Claude decides everything',  body: 'Scans 100+ assets, reads catalysts, checks regime, picks the best risk-adjusted trade available right now.' },
              { emoji: '📈', title: 'Bull market',                body: 'Buys high-conviction stocks and crypto long. Sizes positions based on conviction score and portfolio concentration.' },
              { emoji: '💰', title: 'Bear market',                body: 'Sells options premium — Iron Condors, Cash-Secured Puts. High VIX = high premiums = edge is with the seller.' },
              { emoji: '🛡️', title: 'Always protected',           body: 'Hard stops, circuit breakers, daily loss limits. All positions close at 3:45 PM. You control the risk envelope.' },
            ].map(({ emoji, title, body }) => (
              <div key={title} className="bg-surface-2 border border-surface-border rounded-xl p-4 space-y-2">
                <span className="text-2xl">{emoji}</span>
                <p className="text-sm font-semibold text-white">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
