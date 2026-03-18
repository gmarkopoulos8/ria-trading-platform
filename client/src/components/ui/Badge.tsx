import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'purple' | 'outline';

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-surface-4 text-slate-300 border-surface-border',
  success: 'bg-accent-green/10 text-accent-green border-accent-green/20',
  danger: 'bg-accent-red/10 text-accent-red border-accent-red/20',
  warning: 'bg-accent-amber/10 text-accent-amber border-accent-amber/20',
  info: 'bg-accent-blue/10 text-accent-blue border-accent-blue/20',
  purple: 'bg-accent-purple/10 text-accent-purple border-accent-purple/20',
  outline: 'bg-transparent text-slate-400 border-surface-border',
};

const dotStyles: Record<BadgeVariant, string> = {
  default: 'bg-slate-400',
  success: 'bg-accent-green',
  danger: 'bg-accent-red',
  warning: 'bg-accent-amber',
  info: 'bg-accent-blue',
  purple: 'bg-accent-purple',
  outline: 'bg-slate-400',
};

export function Badge({ children, variant = 'default', className, dot }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-mono font-medium',
        variantStyles[variant],
        className
      )}
    >
      {dot && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dotStyles[variant])} />}
      {children}
    </span>
  );
}

interface RiskBadgeProps {
  level: 'low' | 'medium' | 'high';
  className?: string;
}

export function RiskBadge({ level, className }: RiskBadgeProps) {
  const map: Record<string, BadgeVariant> = {
    low: 'success',
    medium: 'warning',
    high: 'danger',
  };
  return <Badge variant={map[level]} dot className={className}>{level.toUpperCase()}</Badge>;
}

interface ScoreBadgeProps {
  score: number;
  className?: string;
}

export function ScoreBadge({ score, className }: ScoreBadgeProps) {
  const variant = score >= 80 ? 'success' : score >= 60 ? 'warning' : score >= 40 ? 'info' : 'danger';
  return <Badge variant={variant} className={className}>{score}</Badge>;
}
