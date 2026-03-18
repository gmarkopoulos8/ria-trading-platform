import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, Bell, Terminal, Wifi, WifiOff,
  Menu, LogOut, User, ChevronDown,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { cn } from '../../lib/utils';

interface TopNavProps {
  onToggleSidebar?: () => void;
}

function useSearchResults(query: string) {
  return useQuery({
    queryKey: ['nav-search', query],
    queryFn: async () => {
      const r = await api.symbols.search(query) as {
        success: boolean;
        data?: {
          results: Array<{ symbol: string; name: string; assetClass: string }>;
        };
      };
      return r.data?.results ?? [];
    },
    enabled: query.trim().length >= 1,
    staleTime: 30_000,
    placeholderData: [],
  });
}

function CommandBar() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: results, isLoading } = useSearchResults(query);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSelect = useCallback(
    (symbol: string) => {
      setQuery('');
      setOpen(false);
      navigate(`/symbol/${symbol}`);
    },
    [navigate]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const sym = query.trim().toUpperCase();
    if (sym) handleSelect(sym);
  };

  const showDropdown = open && query.trim().length >= 1;

  return (
    <div className="relative flex-1 max-w-md" ref={ref}>
      <form onSubmit={handleSubmit}>
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-150',
            open
              ? 'bg-surface-2 border-accent-blue/40'
              : 'bg-surface-2 border-surface-border'
          )}
        >
          <Search className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search symbol... (⌘K)"
            value={query}
            onChange={(e) => setQuery(e.target.value.toUpperCase())}
            onFocus={() => setOpen(true)}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none font-mono min-w-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setOpen(false); }}
              className="text-slate-600 hover:text-white text-xs font-mono"
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {showDropdown && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-surface-2 border border-surface-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-500 font-mono">
              <div className="w-3 h-3 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          ) : results && results.length > 0 ? (
            results.map((r) => (
              <button
                key={`${r.symbol}-${r.assetClass}`}
                onMouseDown={() => handleSelect(r.symbol)}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-surface-3 transition-colors text-left"
              >
                <div className="w-8 h-8 rounded-lg bg-surface-3 border border-surface-border flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-accent-blue font-mono">
                    {r.symbol.slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white font-mono">{r.symbol}</p>
                  <p className="text-xs text-slate-500 truncate">{r.name}</p>
                </div>
                <span
                  className={cn(
                    'text-xs font-mono px-1.5 py-0.5 rounded border',
                    r.assetClass === 'crypto'
                      ? 'text-purple-400 border-purple-400/30 bg-purple-400/10'
                      : 'text-blue-400 border-blue-400/30 bg-blue-400/10'
                  )}
                >
                  {r.assetClass.toUpperCase()}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-slate-500 font-mono">
              No results for "{query}"
            </div>
          )}
          <div className="px-4 py-2 border-t border-surface-border">
            <p className="text-xs text-slate-600 font-mono">↵ to analyze · Esc to close</p>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  const handleLogout = async () => {
    setOpen(false);
    await logout();
  };

  const initials = user?.displayName
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'U';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border transition-all duration-150',
          open
            ? 'bg-surface-3 border-accent-blue/30'
            : 'bg-surface-2 border-surface-border hover:border-slate-600'
        )}
      >
        <div className="w-6 h-6 rounded-md bg-accent-blue/20 border border-accent-blue/30 flex items-center justify-center flex-shrink-0">
          <span className="text-accent-blue text-xs font-bold font-mono">{initials}</span>
        </div>
        <span className="text-xs text-slate-300 font-medium max-w-20 truncate hidden sm:block">
          {user?.displayName ?? user?.username ?? 'User'}
        </span>
        <ChevronDown className={cn('h-3 w-3 text-slate-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface-2 border border-surface-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-3 border-b border-surface-border">
            <p className="text-xs font-semibold text-white truncate">{user?.displayName}</p>
            <p className="text-xs text-slate-500 font-mono truncate">@{user?.username}</p>
            <p className="text-xs text-slate-600 font-mono truncate">{user?.email}</p>
          </div>
          <div className="p-1">
            <button
              onClick={() => { setOpen(false); navigate('/settings'); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-surface-3 transition-colors text-left"
            >
              <User className="h-3.5 w-3.5" />
              Profile & Settings
            </button>
          </div>
          <div className="p-1 border-t border-surface-border">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-accent-red hover:bg-accent-red/10 transition-colors text-left"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TopNav({ onToggleSidebar }: TopNavProps) {
  const { data: health, isError } = useQuery({
    queryKey: ['health'],
    queryFn: api.health,
    refetchInterval: 30000,
    retry: 1,
  });

  const isConnected = !!health?.success && !isError;
  const now = new Date();

  return (
    <header className="flex items-center gap-3 h-14 px-4 bg-surface-1 border-b border-surface-border flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden sm:flex items-center gap-2 text-slate-600 flex-shrink-0">
        <Terminal className="h-3.5 w-3.5" />
        <span className="text-xs font-mono">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' '}
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <CommandBar />

      <div className="flex items-center gap-2 ml-auto flex-shrink-0">
        <div
          className={cn(
            'hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono',
            isConnected ? 'text-accent-green' : 'text-accent-red'
          )}
        >
          {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          <span>{isConnected ? 'LIVE' : 'OFFLINE'}</span>
        </div>

        <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-accent-amber/10 border border-accent-amber/20">
          <span className="text-xs font-mono text-accent-amber">PAPER</span>
        </div>

        <button className="relative p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-accent-red rounded-full" />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}
