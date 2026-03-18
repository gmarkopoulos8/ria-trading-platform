import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

interface CardProps {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({ className, children, onClick, hoverable }: CardProps) {
  return (
    <div
      className={cn(
        'glass-card p-4',
        hoverable && 'cursor-pointer hover:border-accent-blue/30 hover:bg-surface-3 transition-all duration-150',
        className
      )}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, action, icon, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between mb-4', className)}>
      <div className="flex items-center gap-2">
        {icon && <span className="text-accent-blue">{icon}</span>}
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  icon?: ReactNode;
  color?: 'blue' | 'green' | 'red' | 'amber' | 'purple' | 'cyan';
  className?: string;
}

export function StatCard({ label, value, change, changeLabel, icon, color = 'blue', className }: StatCardProps) {
  const colorMap = {
    blue: 'text-accent-blue',
    green: 'text-accent-green',
    red: 'text-accent-red',
    amber: 'text-accent-amber',
    purple: 'text-accent-purple',
    cyan: 'text-accent-cyan',
  };

  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wider font-mono">{label}</p>
          <p className={cn('text-2xl font-bold mt-1', colorMap[color])}>{value}</p>
          {change !== undefined && (
            <p className={cn('text-xs mt-1 font-mono', change >= 0 ? 'text-accent-green' : 'text-accent-red')}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)}%
              {changeLabel && <span className="text-slate-500 ml-1">{changeLabel}</span>}
            </p>
          )}
        </div>
        {icon && (
          <div className={cn('p-2 rounded-lg bg-surface-3', colorMap[color])}>
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
