import { NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  ScanSearch,
  LineChart,
  Briefcase,
  Zap,
  ShieldAlert,
  FlaskConical,
  ChevronRight,
  Bell,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, description: 'Market overview' },
  { path: '/scanner', label: 'Opportunity Scanner', icon: ScanSearch, description: 'AI-scored picks' },
  { path: '/symbol', label: 'Symbol Intelligence', icon: LineChart, description: 'Deep dive' },
  { path: '/portfolio', label: 'Paper Portfolio', icon: Briefcase, description: 'Active positions' },
  { path: '/alerts', label: 'Alert Center', icon: Bell, description: 'Position monitoring', badge: true },
  { path: '/catalysts', label: 'Catalyst Intelligence', icon: Zap, description: 'News & events' },
  { path: '/risk', label: 'Risk Console', icon: ShieldAlert, description: 'Exposure & limits' },
  { path: '/performance', label: 'Performance Lab', icon: FlaskConical, description: 'Analytics & stats' },
];

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ collapsed, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();

  const { data: unreadData } = useQuery({
    queryKey: ['alert-unread-count'],
    queryFn: () => api.alerts.unreadCount(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const unreadCount = (unreadData as any)?.data?.count ?? 0;

  const initials = user?.displayName
    ?.split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? 'U';

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-surface-1 border-r border-surface-border transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className={cn('flex items-center gap-3 p-4 border-b border-surface-border', collapsed && 'justify-center')}>
        <div className="relative flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center">
            <span className="text-accent-blue text-xs font-bold font-mono">R</span>
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-accent-green rounded-full border border-surface-1" />
        </div>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white tracking-wide">RIA BOT</p>
            <p className="text-xs text-slate-500 font-mono">v1.0.0</p>
          </div>
        )}
        {!collapsed && onClose && (
          <button onClick={onClose} className="p-1 text-slate-600 hover:text-white transition-colors lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 py-2">
          <p className="text-xs text-slate-600 uppercase tracking-widest font-mono px-2 mb-1">Terminal</p>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname.startsWith(item.path);
          const showBadge = item.badge && unreadCount > 0;

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn('nav-item group', isActive ? 'nav-item-active' : 'nav-item-inactive')}
            >
              <div className="relative flex-shrink-0">
                <Icon className="h-4 w-4" />
                {showBadge && collapsed && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
                )}
              </div>
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{item.label}</p>
                    <p className="text-xs text-slate-600 truncate">{item.description}</p>
                  </div>
                  {showBadge && (
                    <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                  {!showBadge && isActive && <ChevronRight className="h-3 w-3 opacity-50 flex-shrink-0" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={cn('p-3 border-t border-surface-border', collapsed && 'flex justify-center')}>
        {collapsed ? (
          <div className="w-7 h-7 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center">
            <span className="text-accent-purple text-xs font-bold">{initials}</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg">
            <div className="w-7 h-7 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center flex-shrink-0">
              <span className="text-accent-purple text-xs font-bold">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-300 truncate">{user?.displayName ?? user?.username ?? 'Trader'}</p>
              <p className="text-xs text-slate-600 truncate font-mono">paper mode</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
