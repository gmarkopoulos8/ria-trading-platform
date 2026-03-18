import { cn } from '../../lib/utils';
import { TrendingUp, TrendingDown, Minus, ShieldCheck, AlertTriangle, Clock } from 'lucide-react';

export type PolyActionLabel = 'high conviction' | 'tradable' | 'developing' | 'weak' | 'avoid';
export type PolyBias = 'yes' | 'no' | 'neutral';

export interface PolyThesisData {
  marketId: string;
  question: string;
  yesPrice: number;
  noPrice: number;
  healthScore: number;
  bias: PolyBias;
  confidenceScore: number;
  liquidityScore: number;
  momentumScore: number;
  riskScore: number;
  actionLabel: PolyActionLabel;
  thesisSummary: string;
  supportingReasons: string[];
  mainRisk: string;
  suggestedHold: string;
  priceSnapshot?: { yesPrice: number; noPrice: number; volume: number; liquidity: number };
  analyzedAt: string;
}

const ACTION_META: Record<PolyActionLabel, { color: string; bg: string }> = {
  'high conviction': { color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  'tradable':        { color: 'text-accent-blue', bg: 'bg-accent-blue/15 border-accent-blue/30' },
  'developing':      { color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30' },
  'weak':            { color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30' },
  'avoid':           { color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
};

function healthColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 65) return 'text-accent-green';
  if (score >= 50) return 'text-yellow-400';
  if (score >= 35) return 'text-orange-400';
  return 'text-red-400';
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size / 2) - 5;
  const circ = 2 * Math.PI * r;
  const prog = (score / 100) * circ;
  const strokeColor =
    score >= 80 ? '#10b981' : score >= 65 ? '#22c55e' : score >= 50 ? '#eab308' : score >= 35 ? '#f97316' : '#ef4444';

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={strokeColor} strokeWidth="4.5"
          strokeLinecap="round" strokeDasharray={`${prog} ${circ}`} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn('font-black font-mono text-xs', healthColor(score))}>{Math.round(score)}</span>
      </div>
    </div>
  );
}

function MiniBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-500">{label}</span>
        <span className={cn('font-mono font-bold', color)}>{Math.round(value)}</span>
      </div>
      <div className="h-1 bg-surface-border rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color.replace('text-', 'bg-'))} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

interface ThesisCardProps {
  thesis: PolyThesisData;
  compact?: boolean;
  onClick?: () => void;
}

export function ThesisCard({ thesis, compact = false, onClick }: ThesisCardProps) {
  const action = ACTION_META[thesis.actionLabel] ?? ACTION_META.developing;
  const biasIcon = thesis.bias === 'yes'
    ? <TrendingUp className="h-3.5 w-3.5" />
    : thesis.bias === 'no' ? <TrendingDown className="h-3.5 w-3.5" />
    : <Minus className="h-3.5 w-3.5" />;

  const biasColor = thesis.bias === 'yes' ? 'text-accent-green' : thesis.bias === 'no' ? 'text-red-400' : 'text-slate-400';

  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card p-4 border border-surface-border rounded-xl',
        onClick && 'cursor-pointer hover:border-accent-blue/30 hover:bg-surface-3 transition-all',
      )}
    >
      <div className="flex items-start gap-3 mb-3">
        <ScoreRing score={thesis.healthScore} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-white font-medium leading-snug line-clamp-2 mb-1">{thesis.question}</p>
          <div className="flex flex-wrap gap-1.5">
            <span className={cn('text-[10px] font-black px-2 py-0.5 rounded border', action.bg, action.color)}>
              {thesis.actionLabel.toUpperCase()}
            </span>
            <span className={cn('flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border border-surface-border', biasColor)}>
              {biasIcon} {thesis.bias.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mb-3 text-xs">
        <div className="bg-surface-2 rounded p-2 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">YES</p>
          <p className="font-mono font-bold text-accent-green">{(thesis.yesPrice * 100).toFixed(1)}¢</p>
        </div>
        <div className="bg-surface-2 rounded p-2 text-center">
          <p className="text-[10px] text-slate-500 mb-0.5">NO</p>
          <p className="font-mono font-bold text-red-400">{(thesis.noPrice * 100).toFixed(1)}¢</p>
        </div>
      </div>

      {!compact && (
        <>
          <div className="space-y-1.5 mb-3">
            <MiniBar label="Liquidity" value={thesis.liquidityScore} color="text-accent-blue" />
            <MiniBar label="Momentum" value={thesis.momentumScore} color="text-accent-purple" />
            <MiniBar label="Risk" value={thesis.riskScore} color="text-accent-green" />
            <MiniBar label="Confidence" value={thesis.confidenceScore} color="text-yellow-400" />
          </div>

          <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-3">{thesis.thesisSummary}</p>

          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {thesis.suggestedHold}</span>
            <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-orange-400" /> {thesis.mainRisk.substring(0, 40)}…</span>
          </div>
        </>
      )}
    </div>
  );
}
