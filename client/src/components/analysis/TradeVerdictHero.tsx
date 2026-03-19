import { cn } from '../../lib/utils';
import { Clock, Shield, Target, TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle, Sparkles } from 'lucide-react';

export type VerdictAction =
  | 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT' | 'STRONG_SHORT'
  | 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';

interface ActionConfig {
  display: string;
  sub: string;
  textColor: string;
  dimColor: string;
  badgeBg: string;
  badgeBorder: string;
  glow: string;
  ringHex: string;
  cardBorder: string;
  cardAccent: string;
}

function getActionConfig(action: VerdictAction): ActionConfig {
  switch (action) {
    case 'STRONG_BUY':
    case 'high conviction':
      return {
        display: 'STRONG BUY',
        sub: 'High conviction long setup',
        textColor: 'text-emerald-300',
        dimColor: 'text-emerald-400/50',
        badgeBg: 'bg-emerald-500/10',
        badgeBorder: 'border-emerald-500/30',
        glow: '0 0 40px rgba(16,185,129,0.18)',
        ringHex: '#10b981',
        cardBorder: 'border-emerald-500/20',
        cardAccent: 'from-emerald-500/5 to-transparent',
      };
    case 'BUY':
    case 'tradable':
      return {
        display: 'BUY',
        sub: 'Favorable long opportunity',
        textColor: 'text-emerald-400',
        dimColor: 'text-emerald-400/40',
        badgeBg: 'bg-emerald-400/8',
        badgeBorder: 'border-emerald-400/25',
        glow: '0 0 40px rgba(52,211,153,0.12)',
        ringHex: '#34d399',
        cardBorder: 'border-emerald-400/15',
        cardAccent: 'from-emerald-400/4 to-transparent',
      };
    case 'WATCH':
    case 'developing':
      return {
        display: 'WATCH',
        sub: 'Monitor for clearer signal',
        textColor: 'text-amber-400',
        dimColor: 'text-amber-400/40',
        badgeBg: 'bg-amber-400/8',
        badgeBorder: 'border-amber-400/25',
        glow: '0 0 40px rgba(251,191,36,0.12)',
        ringHex: '#f59e0b',
        cardBorder: 'border-amber-400/15',
        cardAccent: 'from-amber-400/4 to-transparent',
      };
    case 'weak':
      return {
        display: 'WEAK',
        sub: 'Setup lacks conviction',
        textColor: 'text-orange-400',
        dimColor: 'text-orange-400/40',
        badgeBg: 'bg-orange-400/8',
        badgeBorder: 'border-orange-400/25',
        glow: '0 0 40px rgba(251,146,60,0.12)',
        ringHex: '#fb923c',
        cardBorder: 'border-orange-400/15',
        cardAccent: 'from-orange-400/4 to-transparent',
      };
    case 'SHORT':
      return {
        display: 'SHORT',
        sub: 'Bearish opportunity identified',
        textColor: 'text-red-400',
        dimColor: 'text-red-400/40',
        badgeBg: 'bg-red-400/8',
        badgeBorder: 'border-red-400/25',
        glow: '0 0 40px rgba(248,113,113,0.12)',
        ringHex: '#f87171',
        cardBorder: 'border-red-400/15',
        cardAccent: 'from-red-400/4 to-transparent',
      };
    case 'STRONG_SHORT':
      return {
        display: 'STRONG SHORT',
        sub: 'High conviction bearish setup',
        textColor: 'text-red-300',
        dimColor: 'text-red-400/40',
        badgeBg: 'bg-red-500/10',
        badgeBorder: 'border-red-500/30',
        glow: '0 0 40px rgba(239,68,68,0.18)',
        ringHex: '#ef4444',
        cardBorder: 'border-red-500/20',
        cardAccent: 'from-red-500/5 to-transparent',
      };
    case 'AVOID':
    case 'avoid':
    default:
      return {
        display: 'AVOID',
        sub: 'Insufficient setup quality',
        textColor: 'text-slate-400',
        dimColor: 'text-slate-500/40',
        badgeBg: 'bg-slate-700/30',
        badgeBorder: 'border-slate-600/30',
        glow: '0 0 40px rgba(100,116,139,0.08)',
        ringHex: '#64748b',
        cardBorder: 'border-slate-700/30',
        cardAccent: 'from-slate-700/10 to-transparent',
      };
  }
}

function getScoreTier(score: number): { label: string; color: string; hex: string } {
  if (score >= 85) return { label: 'Elite Setup',    color: 'text-emerald-400', hex: '#10b981' };
  if (score >= 70) return { label: 'Strong Setup',   color: 'text-green-400',   hex: '#22c55e' };
  if (score >= 55) return { label: 'Moderate Setup', color: 'text-yellow-400',  hex: '#eab308' };
  if (score >= 40) return { label: 'Weak Setup',     color: 'text-orange-400',  hex: '#f97316' };
  return              { label: 'Poor Setup',     color: 'text-red-400',     hex: '#ef4444' };
}

export function ScoreBadge({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const tier = getScoreTier(score);
  const r = size === 'lg' ? 46 : 28;
  const cx = size === 'lg' ? 54 : 34;
  const sw = size === 'lg' ? 6 : 4;
  const circumference = 2 * Math.PI * r;
  const progress = (score / 100) * circumference;
  const viewBox = size === 'lg' ? '0 0 108 108' : '0 0 68 68';
  const dim = size === 'lg' ? 108 : 68;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={cn('relative', size === 'lg' ? 'w-[108px] h-[108px]' : 'w-[68px] h-[68px]')}
        style={{ filter: `drop-shadow(0 0 12px ${tier.hex}40)` }}
      >
        <svg className="w-full h-full -rotate-90" viewBox={viewBox}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={sw} />
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={tier.hex}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={cn('font-black font-mono leading-none', size === 'lg' ? 'text-[2rem]' : 'text-xl')}
            style={{ color: tier.hex }}
          >{score}</span>
          <span className="text-[9px] text-slate-600 font-mono tracking-wider mt-0.5">/100</span>
        </div>
      </div>
      <p className={cn('font-semibold text-center tracking-wide', tier.color, size === 'lg' ? 'text-[11px]' : 'text-[10px]')}>
        {tier.label}
      </p>
    </div>
  );
}

export function HoldDurationBadge({ duration }: { duration: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
        <Clock className="h-3 w-3" /> Suggested Hold
      </p>
      <div className="px-4 py-2.5 rounded-xl bg-white/4 border border-white/8 backdrop-blur-sm">
        <p className="text-sm font-bold text-white font-mono tracking-wide">{duration}</p>
      </div>
    </div>
  );
}

export function RiskRewardPanel({
  stopLoss,
  takeProfit1,
  takeProfit2,
  currentPrice,
}: {
  stopLoss?: number | null;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  currentPrice?: number | null;
}) {
  function fmt(n?: number | null): string {
    if (n == null) return '—';
    if (n >= 10_000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    if (n >= 1_000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${n.toFixed(2)}`;
  }

  function pct(target?: number | null): string | null {
    if (!target || !currentPrice || currentPrice === 0) return null;
    const diff = ((target - currentPrice) / currentPrice) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }

  const metrics = [
    {
      label: 'Stop Loss',
      value: stopLoss,
      icon: <Shield className="h-3 w-3" />,
      textColor: 'text-red-400',
      labelColor: 'text-red-400/60',
      borderLeft: 'border-l-red-500/50',
      bg: 'bg-red-500/5',
    },
    {
      label: 'Take Profit 1',
      value: takeProfit1,
      icon: <Target className="h-3 w-3" />,
      textColor: 'text-emerald-400',
      labelColor: 'text-emerald-400/60',
      borderLeft: 'border-l-emerald-500/50',
      bg: 'bg-emerald-500/5',
    },
    {
      label: 'Take Profit 2',
      value: takeProfit2,
      icon: <TrendingUp className="h-3 w-3" />,
      textColor: 'text-cyan-400',
      labelColor: 'text-cyan-400/60',
      borderLeft: 'border-l-cyan-500/50',
      bg: 'bg-cyan-500/5',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2.5">
      {metrics.map((m) => (
        <div
          key={m.label}
          className={cn(
            'rounded-xl border border-white/6 border-l-2 px-3.5 py-3 transition-colors',
            m.bg, m.borderLeft,
            'hover:bg-white/5',
          )}
        >
          <div className={cn('flex items-center gap-1.5 mb-2', m.labelColor)}>
            {m.icon}
            <span className="text-[10px] font-mono uppercase tracking-widest">{m.label}</span>
          </div>
          <p className={cn('text-lg font-bold font-mono leading-none', m.textColor)}>{fmt(m.value)}</p>
          {pct(m.value) && (
            <p className={cn('text-[10px] font-mono mt-1 opacity-60', m.textColor)}>{pct(m.value)} from entry</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function VerdictReasonList({ reasons }: { reasons: string[] }) {
  if (!reasons?.length) return null;
  return (
    <ul className="space-y-0 divide-y divide-white/4">
      {reasons.slice(0, 5).map((reason, i) => (
        <li key={i} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
          <span className="flex-shrink-0 mt-0.5 w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <CheckCircle className="h-2.5 w-2.5 text-emerald-400" />
          </span>
          <span className="text-[13px] text-slate-300 leading-relaxed">{reason}</span>
        </li>
      ))}
    </ul>
  );
}

export function AnalysisSummaryGrid({
  trend,
  momentum,
  catalystTone,
  volatility,
  pattern,
  supportRange,
  resistanceRange,
}: {
  trend?: string;
  momentum?: string;
  catalystTone?: string;
  volatility?: string;
  pattern?: string;
  supportRange?: string;
  resistanceRange?: string;
}) {
  const items = [
    { label: 'Trend',       value: trend,           icon: '↗' },
    { label: 'Momentum',    value: momentum,         icon: '⚡' },
    { label: 'Catalyst',    value: catalystTone,     icon: '⚡' },
    { label: 'Volatility',  value: volatility,       icon: '〜' },
    { label: 'Pattern',     value: pattern,          icon: '◈' },
    { label: 'Support',     value: supportRange,     icon: '▲' },
    { label: 'Resistance',  value: resistanceRange,  icon: '▼' },
  ].filter((i) => i.value);

  if (!items.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="px-3.5 py-2.5 rounded-xl bg-white/3 border border-white/6 hover:bg-white/5 transition-colors"
        >
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-1.5">{item.label}</p>
          <p className="text-xs font-semibold text-slate-200 leading-snug truncate">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export interface TradeVerdictHeroProps {
  action: VerdictAction;
  score: number;
  holdDuration?: string;
  stopLoss?: number | null;
  takeProfit1?: number | null;
  takeProfit2?: number | null;
  currentPrice?: number | null;
  thesis?: string;
  reasons?: string[];
  isMock?: boolean;
}

export function TradeVerdictHeroCard({
  action,
  score,
  holdDuration,
  stopLoss,
  takeProfit1,
  takeProfit2,
  currentPrice,
  thesis,
  reasons,
  isMock,
}: TradeVerdictHeroProps) {
  const cfg = getActionConfig(action);
  const hasRiskReward = stopLoss != null || takeProfit1 != null || takeProfit2 != null;
  const isLongLabel = cfg.display.includes(' ');

  return (
    <div
      className={cn(
        'relative rounded-2xl border overflow-hidden',
        cfg.cardBorder,
      )}
      style={{ boxShadow: cfg.glow }}
    >
      {/* Subtle top-edge gradient accent */}
      <div className={cn('absolute inset-x-0 top-0 h-px bg-gradient-to-r', cfg.cardAccent, 'via-current to-transparent opacity-60')} />

      <div className="relative p-5 md:p-7 space-y-6">
        {isMock && (
          <div className="inline-flex items-center gap-1.5 text-[10px] text-amber-500/80 bg-amber-500/8 border border-amber-500/15 px-2.5 py-1 rounded-full font-mono uppercase tracking-widest">
            <AlertTriangle className="h-2.5 w-2.5" /> Simulated Data
          </div>
        )}

        {/* ── Section 1: Verdict + Score + Hold ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-8">
          {/* Verdict badge */}
          <div
            className={cn(
              'flex flex-col rounded-2xl border px-5 py-4 flex-shrink-0',
              cfg.badgeBg, cfg.badgeBorder,
            )}
            style={{ boxShadow: `inset 0 0 30px ${cfg.ringHex}10` }}
          >
            <p className={cn('text-[9px] font-mono uppercase tracking-[0.2em] mb-2', cfg.dimColor)}>
              Trade Verdict
            </p>
            <p className={cn(
              'font-black leading-none tracking-tight',
              cfg.textColor,
              isLongLabel ? 'text-3xl sm:text-4xl' : 'text-5xl sm:text-6xl',
            )}>
              {cfg.display}
            </p>
            <p className={cn('text-[10px] font-mono mt-2 leading-snug', cfg.dimColor)}>
              {cfg.sub}
            </p>
          </div>

          {/* Score ring */}
          <div className="flex-shrink-0">
            <ScoreBadge score={score} size="lg" />
          </div>

          {/* Hold duration */}
          {holdDuration && (
            <div className="flex-1 min-w-0">
              <HoldDurationBadge duration={holdDuration} />
            </div>
          )}
        </div>

        {/* ── Section 2: Risk / Reward ── */}
        {hasRiskReward && (
          <div>
            <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-2.5">
              Risk · Reward
            </p>
            <RiskRewardPanel
              stopLoss={stopLoss}
              takeProfit1={takeProfit1}
              takeProfit2={takeProfit2}
              currentPrice={currentPrice}
            />
          </div>
        )}

        {/* ── Section 3: Thesis ── */}
        {thesis && (
          <div className="rounded-xl bg-white/3 border border-white/5 px-4 py-3.5">
            <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-2">Thesis</p>
            <p className="text-sm text-slate-300 leading-relaxed font-light">{thesis}</p>
          </div>
        )}

        {/* ── Section 4: Reasons ── */}
        {reasons && reasons.length > 0 && (
          <div>
            <p className="text-[9px] font-mono text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-slate-600" /> Why this verdict
            </p>
            <VerdictReasonList reasons={reasons} />
          </div>
        )}
      </div>
    </div>
  );
}

export function MiniVerdictBadge({ action, score }: { action: VerdictAction; score: number }) {
  const cfg = getActionConfig(action);
  const tier = getScoreTier(score);
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2.5 px-3 py-2 rounded-xl border transition-all',
        cfg.badgeBg, cfg.badgeBorder,
        'hover:brightness-110',
      )}
    >
      <span className={cn('text-sm font-black font-mono tracking-wide', cfg.textColor)}>{cfg.display}</span>
      <div className="w-px h-3.5 bg-white/10" />
      <div className="flex items-baseline gap-0.5">
        <span className={cn('text-sm font-bold font-mono', tier.color)}>{score}</span>
        <span className="text-[9px] text-slate-600 font-mono">/100</span>
      </div>
    </div>
  );
}

export function BiasChip({ bias }: { bias: string }) {
  const upper = bias.toUpperCase();
  if (upper === 'BULLISH') return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 bg-emerald-500/8 border border-emerald-500/20 px-2.5 py-1 rounded-lg tracking-wide">
      <TrendingUp className="h-3 w-3" /> BULLISH
    </span>
  );
  if (upper === 'BEARISH') return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-400 bg-red-500/8 border border-red-500/20 px-2.5 py-1 rounded-lg tracking-wide">
      <TrendingDown className="h-3 w-3" /> BEARISH
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 bg-white/4 border border-white/8 px-2.5 py-1 rounded-lg tracking-wide">
      <Minus className="h-3 w-3" /> NEUTRAL
    </span>
  );
}
