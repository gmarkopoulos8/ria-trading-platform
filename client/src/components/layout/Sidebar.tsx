import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Bot,
  TrendingUp,
  Settings2,
  FlaskConical,
  Activity,
  BarChart2,
  Radar,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../contexts/AuthContext';

const mainNav = [
  { path: '/trade',       label: 'Mission Control', icon: Bot,       description: 'Autonomous trading' },
  { path: '/performance', label: 'Performance',     icon: TrendingUp, description: 'P&L · trade log' },
  { path: '/settings',   label: 'Settings',         icon: Settings2,  description: 'Connections · risk' },
];

const advancedNav = [
  { path: '/hyperliquid', label: 'Hyperliquid', icon: Activity,     description: 'Perp DEX · live crypto' },
  { path: '/tos',         label: 'Thinkorswim', icon: BarChart2,    description: 'Schwab API · options' },
  { path: '/alpaca',      label: 'Alpaca',      icon: FlaskConical, description: 'Paper trading dashboard' },
  { path: '/daily-scan',  label: 'Daily Scan',  icon: Radar,        description: 'Universe scan results' },
];

interface SidebarProps {
  collapsed?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ collapsed, onClose }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const initials = user?.displayName
    ?.split(' ')
    .map((w: string) => w[0])
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
            <p className="text-xs text-slate-500 font-mono">v2.0</p>
          </div>
        )}
        {!collapsed && onClose && (
          <button onClick={onClose} className="p-1 text-slate-600 hover:text-white transition-colors lg:hidden">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {mainNav.map((item) => {
          const Icon     = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn('nav-item group', isActive ? 'nav-item-active' : 'nav-item-inactive')}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{item.label}</p>
                    <p className="text-xs text-slate-600 truncate">{item.description}</p>
                  </div>
                  {isActive && <ChevronRight className="h-3 w-3 opacity-50 flex-shrink-0" />}
                </>
              )}
            </NavLink>
          );
        })}

        {!collapsed && (
          <div className="pt-3">
            <button
              onClick={() => setAdvancedOpen(!advancedOpen)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-[10px] text-slate-600 hover:text-slate-400 uppercase tracking-widest font-mono transition-colors"
            >
              {advancedOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              Advanced
            </button>
            {advancedOpen && advancedNav.map((item) => {
              const Icon     = item.icon;
              const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={onClose}
                  className={cn('nav-item group', isActive ? 'nav-item-active' : 'nav-item-inactive')}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold truncate">{item.label}</p>
                    <p className="text-xs text-slate-600 truncate">{item.description}</p>
                  </div>
                  {isActive && <ChevronRight className="h-3 w-3 opacity-50 flex-shrink-0" />}
                </NavLink>
              );
            })}
          </div>
        )}

        {collapsed && advancedNav.map((item) => {
          const Icon     = item.icon;
          const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={cn('nav-item group', isActive ? 'nav-item-active' : 'nav-item-inactive')}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
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
              <p className="text-xs text-slate-600 truncate font-mono">autonomous</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
