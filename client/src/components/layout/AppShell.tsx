import { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';
import { cn } from '../../lib/utils';

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const location = useLocation();
  const closingRef = useRef(false);

  useEffect(() => {
    closingRef.current = true;
    setMobileSidebarOpen(false);
    const t = setTimeout(() => { closingRef.current = false; }, 300);
    return () => clearTimeout(t);
  }, [location.pathname]);

  const handleBackdropClick = () => {
    if (!closingRef.current) {
      setMobileSidebarOpen(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <div className="hidden lg:flex flex-shrink-0">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {mobileSidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={handleBackdropClick}
          />
          <div className={cn(
            'fixed inset-y-0 left-0 z-50 flex lg:hidden',
            'animate-in slide-in-from-left duration-200',
          )}>
            <Sidebar onClose={() => setMobileSidebarOpen(false)} />
          </div>
        </>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav
          onToggleSidebar={() => {
            if (window.innerWidth >= 1024) {
              setSidebarCollapsed(!sidebarCollapsed);
            } else {
              setMobileSidebarOpen(!mobileSidebarOpen);
            }
          }}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-screen-2xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
