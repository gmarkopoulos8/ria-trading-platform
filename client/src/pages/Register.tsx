import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff, Terminal, AlertCircle, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ characters', ok: password.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /\d/.test(password) },
  ];
  const score = checks.filter((c) => c.ok).length;
  const strengthLabel = score === 0 ? '' : score === 1 ? 'Weak' : score === 2 ? 'Fair' : 'Strong';
  const strengthColor = score === 1 ? 'bg-accent-red' : score === 2 ? 'bg-accent-amber' : 'bg-accent-green';

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1 h-1">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`flex-1 rounded-full transition-all ${
              i < score ? strengthColor : 'bg-surface-4'
            }`}
          />
        ))}
        {strengthLabel && (
          <span className={`text-xs font-mono ml-2 ${score === 3 ? 'text-accent-green' : score === 2 ? 'text-accent-amber' : 'text-accent-red'}`}>
            {strengthLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const { register, isAuthenticated, isLoading: authLoading } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (username.length < 3) {
      setError('Username must be at least 3 characters');
      return;
    }

    setLoading(true);
    try {
      await register({ email, username, password, displayName });
      setSuccess(true);
      setTimeout(() => navigate('/dashboard', { replace: true }), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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

        <div className="space-y-6">
          <h2 className="text-3xl font-bold text-white leading-tight">
            Start trading<br />
            <span className="text-accent-blue">smarter</span> today
          </h2>
          <p className="text-slate-400 leading-relaxed">
            Your account comes pre-loaded with $100,000 in paper capital. Build your strategy, track your performance, and refine your thesis — risk free.
          </p>

          <div className="space-y-3">
            {[
              '✓ $100,000 paper portfolio starting balance',
              '✓ AI-powered opportunity discovery',
              '✓ Real-time market intelligence',
              '✓ Full performance analytics & reporting',
              '✓ Watchlists & custom alerts',
            ].map((item) => (
              <p key={item} className="text-sm text-slate-400 font-mono">{item}</p>
            ))}
          </div>
        </div>

        <p className="text-xs text-slate-700 font-mono">© 2026 RIA BOT · Paper Trading Only · Not Financial Advice</p>
      </div>

      <div className="flex-1 lg:max-w-md flex flex-col items-center justify-center p-8 overflow-y-auto">
        <div className="w-full max-w-sm py-8">
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-accent-blue/20 border border-accent-blue/40 flex items-center justify-center">
              <Terminal className="h-4 w-4 text-accent-blue" />
            </div>
            <p className="text-lg font-bold text-white">RIA BOT</p>
          </div>

          <h1 className="text-2xl font-bold text-white mb-2">Create account</h1>
          <p className="text-slate-500 text-sm mb-8">
            Set up your paper trading terminal
          </p>

          {error && (
            <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-accent-red/10 border border-accent-red/20">
              <AlertCircle className="h-4 w-4 text-accent-red flex-shrink-0 mt-0.5" />
              <p className="text-sm text-accent-red">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 mb-4 rounded-lg bg-accent-green/10 border border-accent-green/20">
              <CheckCircle className="h-4 w-4 text-accent-green" />
              <p className="text-sm text-accent-green">Account created! Redirecting...</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your Name"
                className="w-full px-3 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm transition-colors"
                required
                minLength={1}
                maxLength={64}
                autoComplete="name"
              />
            </div>

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
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="tradername"
                className="w-full px-3 py-2.5 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm font-mono transition-colors"
                required
                minLength={3}
                maxLength={32}
                autoComplete="username"
              />
              <p className="text-xs text-slate-600 mt-1 font-mono">Lowercase, numbers, underscores only</p>
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
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2.5 pr-10 bg-surface-2 border border-surface-border rounded-lg text-white placeholder-slate-600 outline-none focus:border-accent-blue/50 text-sm transition-colors"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div>
              <label className="block text-xs text-slate-500 font-mono uppercase tracking-wider mb-1.5">
                Confirm Password
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className={`w-full px-3 py-2.5 bg-surface-2 border rounded-lg text-white placeholder-slate-600 outline-none text-sm transition-colors ${
                  confirmPassword && password !== confirmPassword
                    ? 'border-accent-red/50 focus:border-accent-red'
                    : confirmPassword && password === confirmPassword
                    ? 'border-accent-green/50 focus:border-accent-green'
                    : 'border-surface-border focus:border-accent-blue/50'
                }`}
                required
                autoComplete="new-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading || success}
              className="w-full py-2.5 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-accent-blue hover:text-accent-blue/80 font-medium transition-colors"
              >
                Sign in
              </Link>
            </p>
          </div>

          <div className="mt-6 p-3 rounded-lg bg-surface-2 border border-surface-border">
            <p className="text-xs text-slate-600 font-mono text-center">
              ⚠ Paper trading only · No real money involved
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
