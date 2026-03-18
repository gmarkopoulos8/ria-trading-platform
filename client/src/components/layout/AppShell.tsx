import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopNav from './TopNav';

export default function AppShell() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-surface-0">
      <div className="hidden lg:flex">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopNav onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="max-w-screen-2xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
