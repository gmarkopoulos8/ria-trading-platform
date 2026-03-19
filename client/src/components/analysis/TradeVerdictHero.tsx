import { cn } from '../../lib/utils';
import { Clock, Shield, Target, TrendingUp, TrendingDown, Minus, CheckCircle, AlertTriangle } from 'lucide-react';

export type VerdictAction =
  | 'STRONG_BUY' | 'BUY' | 'WATCH' | 'AVOID' | 'SHORT' | 'STRONG_SHORT'
  | 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';

interface ActionConfig {
  display: string;
  color: string;
  textColor: string;
  borderColor: string;
  glowColor: string;
  ringColor: string;
}

function getActionConfig(action: VerdictAction): ActionConfig {
  switch (action) {
    case 'STRONG_BUY':
    case 'high conviction':
      return {
        display: 'STRONG BUY',
        color: 'bg-emerald-500/20',
        textColor: 'text-emerald-300',
        borderColor: 'border-emerald-500/50',
        glowColor: 'shadow-emerald-500/20',
        ringColor: '#10b981',
      };
    case 'BUY':
    case 'tradable':
      return {
        display: 'BUY',
        color: 'bg-emerald-400/15',
        textColor: 'text-emerald-400',
        borderColor: 'border-emerald-400/40',
        glowColor: 'shadow-emerald-400/15',
        ringColor: '#34d399',
      };
    case 'WATCH':
    case 'developing':
      return {
        display: 'WATCH',
        color: 'bg-amber-400/15',
        textColor: 'text-amber-400',
        borderColor: 'border-amber-400/40',
        glowColor: 'shadow-amber-400/15',
        ringColor: '#fbbf24',
      };
    case 'weak':
      return {
        display: 'WATCH',
        color: 'bg-orange-400/15',
        textColor: 'text-orange-400',
        borderColor: 'border-orange-400/40',
        glowColor: 'shadow-orange-400/15',
        ringColor: '#fb923c',
      };
    case 'SHORT':
      return {
        display: 'SHORT',
        color: 'bg-red-400/15',
        textColor: 'text-red-400',
        borderColor: 'border-red-400/40',
        glowColor: 'shadow-red-400/15',
        ringColor: '#f87171',
      };
    case 'STRONG_SHORT':
      return {
        display: 'STRONG SHORT',
        color: 'bg-red-500/20',
        textColor: 'text-red-300',
        borderColor: 'border-red-500/50',
        glowColor: 'shadow-red-500/20',
        ringColor: '#ef4444',
      };
    case 'AVOID':
    case 'avoid':
    default:
      return {
        display: 'AVOID',
        color: 'bg-slate-700/50',
        textColor: 'text-slate-300',
        borderColor: 'border-slate-600/40',
        glowColor: 'shadow-slate-500/10',
        ringColor: '#64748b',
      };
  }
}

function getScoreTier(score: number): { label: string; color: string } {
  if (score >= 85) return { label: 'Elite Setup', color: 'text-emerald-400' };
  if (score >= 70) return { label: 'Strong Setup', color: 'text-green-400' };
  if (score >= 55) return { label: 'Moderate Setup', color: 'text-yellow-400' };
  if (score >= 40) return { label: 'Weak Setup', color: 'text-orange-400' };
  return { label: 'Poor Setup', color: 'text-red-400' };
}

function getScoreRingColor(score: number): string {
  if (score >= 85) return '#10b981';
  if (score >= 70) return '#22c55e';
  if (score >= 55) return '#eab308';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

export function ScoreBadge({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const circumference = 2 * Math.PI * (size === 'lg' ? 44 : 28);
  const progress = (score / 100) * circumference;
  const color = getScoreRingColor(score);
  const tier = getScoreTier(score);
  const r = size === 'lg' ? 44 : 28;
  const dim = size === 'lg' ? 104 : 68;
  const viewBox = size === 'lg' ? '0 0 104 104' : '0 0 68 68';
  const cx = size === 'lg' ? 52 : 34;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn('relative', size === 'lg' ? 'w-[104px] h-[104px]' : 'w-[68px] h-[68px]')}>
        <svg className="w-full h-full -rotate-90" viewBox={viewBox}>
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={size === 'lg' ? 7 : 5} />
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={color}
            strokeWidth={size === 'lg' ? 7 : 5}
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={cn('font-black font-mono', size === 'lg' ? 'text-3xl' : 'text-xl')}
            style={{ color }}>{score}</span>
          <span className={cn('font-mono text-slate-500', size === 'lg' ? 'text-[10px]' : 'text-[9px]')}>/100</span>
        </div>
      </div>
      <p className={cn('font-bold text-center', tier.color, size === 'lg' ? 'text-xs' : 'text-[10px]')}>{tier.label}</p>
    </div>
  );
}

export function HoldDurationBadge({ duration }: { duration: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-mono uppercase tracking-wider">
        <Clock className="h-3 w-3" /> Suggested Hold
      </div>
      <div className="px-4 py-2 rounded-xl bg-surface-2 border border-surface-border text-center">
        <p className="text-sm font-bold text-white font-mono">{duration}</p>
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
    if (Math.abs(n) >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${n.toFixed(2)}`;
  }

  function pct(target?: number | null): string | null {
    if (!target || !currentPrice || currentPrice === 0) return null;
    const diff = ((target - currentPrice) / currentPrice) * 100;
    return `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`;
  }

  const items = [
    {
      label: 'Stop Loss',
      value: stopLoss,
      icon: <Shield className="h-3.5 w-3.5" />,
      color: 'text-red-400',
      bg: 'bg-red-500/8 border-red-500/20',
    },
    {
      label: 'Take Profit 1',
      value: takeProfit1,
      icon: <Target className="h-3.5 w-3.5" />,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/8 border-emerald-500/20',
    },
    {
      label: 'Take Profit 2',
      value: takeProfit2,
      icon: <TrendingUp className="h-3.5 w-3.5" />,
      color: 'text-accent-cyan',
      bg: 'bg-accent-cyan/8 border-accent-cyan/20',
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => (
        <div key={item.label} className={cn('rounded-xl border p-3 text-center', item.bg)}>
          <div className={cn('flex items-center justify-center gap-1 mb-1.5', item.color)}>
            {item.icon}
            <span className="text-[10px] font-mono uppercase tracking-wider">{item.label}</span>
          </div>
          <p className={cn('text-base font-bold font-mono', item.color)}>{fmt(item.value)}</p>
          {pct(item.value) && (
            <p className={cn('text-[10px] font-mono mt-0.5 opacity-70', item.color)}>{pct(item.value)}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function VerdictReasonList({ reasons, isStrengths = true }: { reasons: string[]; isStrengths?: boolean }) {
  if (!reasons?.length) return null;
  return (
    <ul className="space-y-2">
      {reasons.slice(0, 5).map((reason, i) => (
        <li key={i} className="flex items-start gap-2.5">
          <span className={cn('flex-shrink-0 mt-0.5', isStrengths ? 'text-emerald-400' : 'text-red-400')}>
            {isStrengths
              ? <CheckCircle className="h-3.5 w-3.5" />
              : <AlertTriangle className="h-3.5 w-3.5" />
            }
          </span>
          <span className="text-sm text-slate-300 leading-snug">{reason}</span>
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
    { label: 'Trend', value: trend },
    { label: 'Momentum', value: momentum },
    { label: 'Catalyst', value: catalystTone },
    { label: 'Volatility', value: volatility },
    { label: 'Pattern', value: pattern },
    { label: 'Support', value: supportRange },
    { label: 'Resistance', value: resistanceRange },
  ].filter((i) => i.value);

  if (!items.length) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {items.map((item) => (
        <div key={item.label} className="px-3 py-2 rounded-lg bg-surface-2 border border-surface-border">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1">{item.label}</p>
          <p className="text-xs font-semibold text-white truncate">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export interface TradeVerdictHeroProps {
  action: VerdictAction;
  score: number;
  scoreLabel?: string;
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

  return (
    <div className={cn(
      'rounded-2xl border p-5 md:p-6 shadow-2xl',
      cfg.color, cfg.borderColor, cfg.glowColor, 'shadow-lg',
    )}>
      {isMock && (
        <div className="mb-3 inline-flex items-center gap-1.5 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded font-mono uppercase tracking-wider">
          <AlertTriangle className="h-3 w-3" /> Simulated Data
        </div>
      )}

      {/* ── Row 1: Action + Score + Hold ── */}
      <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-8 mb-5">
        {/* Action verdict */}
        <div className={cn(
          'flex flex-col items-center justify-center rounded-2xl border px-6 py-4 min-w-[140px] sm:min-w-[160px] shadow-lg flex-shrink-0',
          cfg.color, cfg.borderColor,
        )}>
          <p className={cn('text-[10px] font-mono uppercase tracking-widest mb-1 opacity-60', cfg.textColor)}>
            Trade Verdict
          </p>
          <p className={cn('font-black tracking-wide leading-none', cfg.textColor,
            cfg.display.length > 5 ? 'text-3xl md:text-4xl' : 'text-4xl md:text-5xl'
          )}>
            {cfg.display}
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

      {/* ── Row 2: Risk / Reward ── */}
      {hasRiskReward && (
        <div className="mb-5">
          <RiskRewardPanel
            stopLoss={stopLoss}
            takeProfit1={takeProfit1}
            takeProfit2={takeProfit2}
            currentPrice={currentPrice}
          />
        </div>
      )}

      {/* ── Row 3: Thesis summary ── */}
      {thesis && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-black/20 border border-white/5">
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">Thesis</p>
          <p className="text-sm text-slate-200 leading-relaxed">{thesis}</p>
        </div>
      )}

      {/* ── Row 4: Key reasons ── */}
      {reasons && reasons.length > 0 && (
        <div>
          <p className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <CheckCircle className="h-3 w-3" /> Why this verdict
          </p>
          <VerdictReasonList reasons={reasons} />
        </div>
      )}
    </div>
  );
}

export function MiniVerdictBadge({ action, score }: { action: VerdictAction; score: number }) {
  const cfg = getActionConfig(action);
  const tier = getScoreTier(score);
  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border', cfg.color, cfg.borderColor)}>
      <span className={cn('text-base font-black font-mono', cfg.textColor)}>{cfg.display}</span>
      <div className="w-px h-4 bg-white/10" />
      <div className="flex flex-col">
        <span className={cn('text-sm font-bold font-mono leading-none', tier.color)}>{score}</span>
        <span className="text-[9px] text-slate-600 font-mono">/100</span>
      </div>
    </div>
  );
}

export function BiasChip({ bias }: { bias: string }) {
  const upper = bias.toUpperCase();
  if (upper === 'BULLISH') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2.5 py-1 rounded-lg">
      <TrendingUp className="h-3 w-3" /> BULLISH
    </span>
  );
  if (upper === 'BEARISH') return (
    <span className="flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-400/10 border border-red-400/20 px-2.5 py-1 rounded-lg">
      <TrendingDown className="h-3 w-3" /> BEARISH
    </span>
  );
  return (
    <span className="flex items-center gap-1 text-xs font-semibold text-slate-400 bg-surface-border/40 border border-surface-border px-2.5 py-1 rounded-lg">
      <Minus className="h-3 w-3" /> NEUTRAL
    </span>
  );
}
