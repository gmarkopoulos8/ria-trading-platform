import { cn } from '../../lib/utils';
import { ReactNode } from 'react';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-4', className)}>
      {icon && (
        <div className="p-4 rounded-full bg-surface-3 border border-surface-border text-slate-600">
          {icon}
        </div>
      )}
      <div className="text-center">
        <p className="text-white font-medium mb-1">{title}</p>
        {description && (
          <p className="text-slate-500 text-sm max-w-sm">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
