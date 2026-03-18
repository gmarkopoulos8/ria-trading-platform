import { AlertTriangle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-4', className)}>
      <div className="p-4 rounded-full bg-accent-red/10 border border-accent-red/20">
        <AlertTriangle className="h-8 w-8 text-accent-red" />
      </div>
      <div className="text-center">
        <p className="text-white font-medium mb-1">Error</p>
        <p className="text-slate-500 text-sm max-w-sm">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-4 py-2 bg-surface-3 hover:bg-surface-4 border border-surface-border rounded-lg text-sm text-slate-300 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
