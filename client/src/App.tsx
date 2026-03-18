import { Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import OpportunityScanner from './pages/OpportunityScanner';
import SymbolIntelligence from './pages/SymbolIntelligence';
import PaperPortfolio from './pages/PaperPortfolio';
import CatalystIntelligence from './pages/CatalystIntelligence';
import RiskConsole from './pages/RiskConsole';
import PerformanceLab from './pages/PerformanceLab';
import Login from './pages/Login';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="scanner" element={<OpportunityScanner />} />
        <Route path="symbol/:symbol?" element={<SymbolIntelligence />} />
        <Route path="portfolio" element={<PaperPortfolio />} />
        <Route path="catalysts" element={<CatalystIntelligence />} />
        <Route path="risk" element={<RiskConsole />} />
        <Route path="performance" element={<PerformanceLab />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
