import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import OpportunityScanner from './pages/OpportunityScanner';
import SymbolIntelligence from './pages/SymbolIntelligence';
import PaperPortfolio from './pages/PaperPortfolio';
import AlertCenter from './pages/AlertCenter';
import CatalystIntelligence from './pages/CatalystIntelligence';
import RiskConsole from './pages/RiskConsole';
import PerformanceLab from './pages/PerformanceLab';
import Settings from './pages/Settings';
import DailyScan from './pages/DailyScan';
import PolymarketDashboard from './pages/polymarket/PolymarketDashboard';
import PolymarketExplorer from './pages/polymarket/PolymarketExplorer';
import PolymarketMarketDetail from './pages/polymarket/PolymarketMarketDetail';
import HyperliquidDashboard from './pages/hyperliquid/HyperliquidDashboard';
import StockHealthAnalyzer from './pages/StockHealthAnalyzer';
import ScanReport from './pages/ScanReport';
import ScanHistory from './pages/ScanHistory';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="scanner" element={<OpportunityScanner />} />
          <Route path="symbol/:symbol?" element={<SymbolIntelligence />} />
          <Route path="portfolio" element={<PaperPortfolio />} />
          <Route path="alerts" element={<AlertCenter />} />
          <Route path="catalysts" element={<CatalystIntelligence />} />
          <Route path="risk" element={<RiskConsole />} />
          <Route path="performance" element={<PerformanceLab />} />
          <Route path="settings" element={<Settings />} />
          <Route path="daily-scan" element={<DailyScan />} />
          <Route path="stock-health" element={<StockHealthAnalyzer />} />
          <Route path="stock-health/:ticker" element={<StockHealthAnalyzer />} />
          <Route path="scan-report/:id" element={<ScanReport />} />
          <Route path="scan-history" element={<ScanHistory />} />
          <Route path="polymarket" element={<PolymarketDashboard />} />
          <Route path="polymarket/explorer" element={<PolymarketExplorer />} />
          <Route path="polymarket/market/:id" element={<PolymarketMarketDetail />} />
          <Route path="hyperliquid" element={<HyperliquidDashboard />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthProvider>
  );
}
