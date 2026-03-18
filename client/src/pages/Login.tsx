import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Terminal, Activity } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    setLoading(false);
    navigate('/dashboard');
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

          <h1 className="text-2xl font-bold text-white mb-2">
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            {mode === 'login'
              ? 'Enter your credentials to access your trading terminal'
              : 'Set up your paper trading account'
            }
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="trader@example.com"
                className="w-full px-3 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm"
                required
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm"
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </>
              ) : (
                mode === 'login' ? 'Sign In' : 'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-accent-blue hover:text-accent-blue/80 font-medium transition-colors"
              >
                {mode === 'login' ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>

          <div className="mt-8 p-3 rounded-lg bg-surface-2 border border-surface-border">
            <p className="text-xs text-slate-600 font-mono text-center">
              ⚠ Paper trading only · No real money involved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
