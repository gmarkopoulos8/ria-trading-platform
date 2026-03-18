import { cn } from '../../lib/utils';

interface LoadingStateProps {
  message?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  inline?: boolean;
}

export function LoadingState({ message = 'Loading...', className, size = 'md', inline }: LoadingStateProps) {
  const sizeMap = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12',
  };

  if (inline) {
    return (
      <div className={cn('flex items-center gap-2 text-slate-500', className)}>
        <Spinner className={sizeMap.sm} />
        <span className="text-xs font-mono">{message}</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col items-center justify-center py-16 gap-4', className)}>
      <Spinner className={sizeMap[size]} />
      <p className="text-slate-500 text-sm font-mono">{message}</p>
    </div>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('animate-spin text-accent-blue', className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('glass-card p-4 animate-pulse', className)}>
      <div className="h-3 bg-surface-4 rounded w-24 mb-3" />
      <div className="h-7 bg-surface-4 rounded w-32 mb-2" />
      <div className="h-2 bg-surface-4 rounded w-16" />
    </div>
  );
}

export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 py-3 border-b border-surface-border animate-pulse', className)}>
      <div className="h-8 w-8 bg-surface-4 rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-surface-4 rounded w-24" />
        <div className="h-2 bg-surface-4 rounded w-16" />
      </div>
      <div className="h-4 bg-surface-4 rounded w-16" />
    </div>
  );
}
