import { useState } from 'react';
import { Search, Bell, Settings, Terminal, Wifi, WifiOff, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { cn } from '../../lib/utils';

interface TopNavProps {
  onToggleSidebar?: () => void;
}

export default function TopNav({ onToggleSidebar }: TopNavProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30000,
    retry: 1,
  });

  const isConnected = !!health?.success && !isError;
  const now = new Date();

  return (
    <header className="flex items-center gap-4 h-14 px-4 bg-surface-1 border-b border-surface-border flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2 text-slate-600">
        <Terminal className="h-3.5 w-3.5" />
        <span className="text-xs font-mono text-slate-600">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' '}
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex-1 max-w-md">
        <div className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-150',
          searchFocused
            ? 'bg-surface-2 border-accent-blue/40'
            : 'bg-surface-2 border-surface-border'
        )}>
          <Search className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search symbol, news, or command..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none font-mono"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-4 border border-surface-border text-xs text-slate-600 font-mono">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
        <div className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono',
          isConnected ? 'text-accent-green' : 'text-accent-red'
        )}>
          {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          <span className="hidden sm:inline">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-accent-amber/10 border border-accent-amber/20">
          <span className="text-xs font-mono text-accent-amber">PAPER</span>
        </div>

        <button className="relative p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-accent-red rounded-full" />
        </button>

        <button className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
