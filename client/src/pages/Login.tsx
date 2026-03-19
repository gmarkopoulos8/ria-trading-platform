import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Eye, EyeOff, Terminal, Activity, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/dashboard';

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-0 flex">
      <div className="hidden lg:flex flex-1 flex-col justify-between p-12 bg-surface-1 border-r border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center">
            <Terminal className="h-5 w-5 text-accent-blue" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">RIA BOT</p>
            <p className="text-xs text-slate-500 font-mono">Market Intelligence Terminal</p>
          </div>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="text-3xl font-bold text-white leading-tight">
              AI-Powered<br />
              <span className="text-accent-blue">Paper Trading</span><br />
              Research Simulator
            </h2>
            <p className="text-slate-400 mt-4 leading-relaxed">
              Discover high-velocity opportunities, score your thesis with AI, and track paper positions with professional-grade analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Opportunity Scanner', desc: 'AI-scored market picks' },
              { label: 'Symbol Intelligence', desc: 'Deep-dive analysis' },
              { label: 'Catalyst Detection', desc: 'News & event tracking' },
              { label: 'Risk Console', desc: 'Portfolio exposure monitoring' },
            ].map((feature) => (
              <div key={feature.label} className="p-4 rounded-xl bg-surface-2 border border-surface-border">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="h-3.5 w-3.5 text-accent-blue" />
                  <p className="text-xs font-semibold text-white">{feature.label}</p>
                </div>
                <p className="text-xs text-slate-500">{feature.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-xl bg-surface-3 border border-surface-border">
            <p className="text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">Dev Test Account</p>
            <p className="text-xs font-mono text-slate-400">Email: <span className="text-accent-cyan">dev@riabot.local</span></p>
            <p className="text-xs font-mono text-slate-400">Password: <span className="text-accent-cyan">password123</span></p>
          </div>
        </div>

        <p className="text-xs text-slate-700 font-mono">© 2026 RIA BOT · Paper Trading Only · Not Financial Advice</p>
      </div>

      <div className="flex-1 lg:max-w-md flex flex-col items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center">
              <Terminal className="h-4 w-4 text-accent-blue" />
            </div>
            <p className="text-lg font-bold text-white">RIA BOT</p>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Sign in</h1>
          <p className="text-slate-500 text-sm mb-8">
            Access your trading terminal
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-accent-red/10 border border-accent-red/20">
              <AlertCircle className="h-4 w-4 text-accent-red flex-shrink-0 mt-0.5" />
              <p className="text-sm text-accent-red">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full px-3 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm transition-colors"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm transition-colors"
                  required
                  minLength={8}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              {"Don't have an account? "}
              <Link
                to="/register"
                className="text-accent-blue hover:text-accent-blue/80 font-medium transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>

          <div className="lg:hidden mt-6 p-4 rounded-xl bg-surface-2 border border-surface-border">
            <p className="text-xs font-mono text-slate-500 uppercase tracking-wider mb-2">Dev Test Account</p>
            <button
              type="button"
              onClick={() => { setEmail('dev@riabot.local'); setPassword('password123'); }}
              className="w-full text-left space-y-1 group"
            >
              <p className="text-xs font-mono text-slate-400">
                Email: <span className="text-accent-cyan">dev@riabot.local</span>
              </p>
              <p className="text-xs font-mono text-slate-400">
                Password: <span className="text-accent-cyan">password123</span>
              </p>
              <p className="text-[10px] text-slate-600 group-hover:text-slate-500 transition-colors mt-1">
                Tap to autofill
              </p>
            </button>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-surface-2 border border-surface-border lg:mt-8">
            <p className="text-xs text-slate-600 font-mono text-center">
              ⚠ Paper trading only · No real money involved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
