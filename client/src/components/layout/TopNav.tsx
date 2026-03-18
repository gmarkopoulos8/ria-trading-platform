import { useState, useRef, useEffect } from 'react';
import {
  Search, Bell, Settings, Terminal, Wifi, WifiOff,
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
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-surface-2 border border-surface-border rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
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
              <Settings className="h-3.5 w-3.5" />
              Settings
            </button>

            <button
              onClick={() => { setOpen(false); navigate('/profile'); }}
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-surface-3 transition-colors text-left"
            >
              <User className="h-3.5 w-3.5" />
              Profile
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
    <header className="flex items-center gap-3 h-14 px-4 bg-surface-1 border-b border-surface-border flex-shrink-0">
      <button
        onClick={onToggleSidebar}
        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-surface-3 transition-colors lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      <div className="hidden sm:flex items-center gap-2 text-slate-600">
        <Terminal className="h-3.5 w-3.5" />
        <span className="text-xs font-mono">
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {' '}
          {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div className="flex-1 max-w-md">
        <div
          className={cn(
            'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-150',
            searchFocused
              ? 'bg-surface-2 border-accent-blue/40'
              : 'bg-surface-2 border-surface-border'
          )}
        >
          <Search className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search symbol, news, or command..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 outline-none font-mono min-w-0"
          />
          <kbd className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded bg-surface-4 border border-surface-border text-xs text-slate-600 font-mono flex-shrink-0">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-2 ml-auto">
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
