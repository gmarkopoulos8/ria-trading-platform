import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import MissionControl from './pages/v2/MissionControl';
import Performance from './pages/v2/Performance';
import Settings from './pages/v2/Settings';
import DailyScan from './pages/DailyScan';
import HyperliquidDashboard from './pages/hyperliquid/HyperliquidDashboard';
import TosDashboard from './pages/tos/TosDashboard';
import AlpacaDashboard from './pages/alpaca/AlpacaDashboard';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index             element={<Navigate to="/trade" replace />} />
          <Route path="trade"      element={<MissionControl />} />
          <Route path="performance" element={<Performance />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="daily-scan" element={<DailyScan />} />
          <Route path="hyperliquid" element={<HyperliquidDashboard />} />
          <Route path="tos"        element={<TosDashboard />} />
          <Route path="alpaca"     element={<AlpacaDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/trade" replace />} />
      </Routes>
    </AuthProvider>
  );
}
