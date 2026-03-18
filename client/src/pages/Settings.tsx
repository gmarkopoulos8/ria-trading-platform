import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { User, Lock, Bell, Palette, Info, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';

const sections = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'about', label: 'About', icon: Info },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const [activeSection, setActiveSection] = useState('profile');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const updateProfileMutation = useMutation({
    mutationFn: (body: unknown) => api.auth.updateProfile(body),
    onSuccess: () => toast.success('Profile updated'),
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Update failed'),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (body: unknown) => api.auth.changePassword(body),
    onSuccess: () => {
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error ?? 'Password change failed'),
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate({ displayName });
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    changePasswordMutation.mutate({ currentPassword, newPassword });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-500 font-mono mt-0.5">Account & preferences</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-3">
          <Card className="p-2">
            {sections.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    activeSection === s.id
                      ? 'bg-accent-blue/15 text-accent-blue'
                      : 'text-slate-400 hover:text-white hover:bg-surface-3'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left font-medium">{s.label}</span>
                  <ChevronRight className="h-3 w-3 opacity-40" />
                </button>
              );
            })}
          </Card>
        </div>

        <div className="col-span-12 md:col-span-9">
          {activeSection === 'profile' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Profile Information</h2>
              <div className="flex items-center gap-4 mb-6 pb-5 border-b border-surface-border">
                <div className="w-14 h-14 rounded-full bg-accent-purple/20 border border-accent-purple/30 flex items-center justify-center flex-shrink-0">
                  <span className="text-accent-purple text-xl font-bold">
                    {(user?.displayName ?? user?.username ?? 'U').slice(0, 1).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-base font-semibold text-white">{user?.displayName ?? user?.username}</p>
                  <p className="text-sm text-slate-500 font-mono">{user?.email}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-accent-green font-mono">
                    <span className="w-1.5 h-1.5 bg-accent-green rounded-full" />paper mode active
                  </span>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="input-field w-full"
                    placeholder="Your name"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    disabled
                    className="input-field w-full opacity-50 cursor-not-allowed"
                  />
                  <p className="text-xs text-slate-600 mt-1">Email cannot be changed</p>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    Username
                  </label>
                  <input
                    type="text"
                    value={user?.username ?? ''}
                    disabled
                    className="input-field w-full opacity-50 cursor-not-allowed"
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updateProfileMutation.isPending}
                    className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </Card>
          )}

          {activeSection === 'security' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Change Password</h2>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="input-field w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input-field w-full"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-1.5">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field w-full"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={changePasswordMutation.isPending}
                    className="px-4 py-2 bg-accent-blue hover:bg-accent-blue/80 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                  >
                    {changePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>

              <div className="mt-6 pt-5 border-t border-surface-border">
                <h3 className="text-xs font-semibold text-white mb-3">Session Management</h3>
                <div className="flex items-center justify-between p-3 rounded-lg bg-surface-3">
                  <div>
                    <p className="text-sm text-white font-medium">Current Session</p>
                    <p className="text-xs text-slate-500 font-mono">Active now</p>
                  </div>
                  <button
                    onClick={() => logout()}
                    className="px-3 py-1.5 text-xs font-semibold text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </Card>
          )}

          {activeSection === 'notifications' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Notification Preferences</h2>
              <div className="space-y-3">
                {[
                  { label: 'Stop-loss breach alerts', description: 'When a position hits your stop-loss level', default: true },
                  { label: 'Target price reached', description: 'When current price meets your target', default: true },
                  { label: 'High volatility warnings', description: 'Unusual intraday price swings', default: false },
                  { label: 'Thesis degradation alerts', description: 'When thesis assumptions are invalidated', default: true },
                  { label: 'Weekly performance digest', description: 'Summary of portfolio performance', default: false },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between p-3 rounded-lg bg-surface-3">
                    <div>
                      <p className="text-sm text-white font-medium">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.description}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" defaultChecked={item.default} className="sr-only peer" />
                      <div className="w-9 h-5 bg-surface-border rounded-full peer peer-checked:bg-accent-blue peer-focus:ring-2 peer-focus:ring-accent-blue/30 transition-colors" />
                      <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
                    </label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-600 mt-4 font-mono">Notification preferences are saved locally.</p>
            </Card>
          )}

          {activeSection === 'appearance' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4">Appearance</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-2">Theme</label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Dark (Default)', 'Darker'].map((t) => (
                      <button
                        key={t}
                        className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                          t === 'Dark (Default)'
                            ? 'border-accent-blue/50 bg-accent-blue/10 text-accent-blue'
                            : 'border-surface-border text-slate-500 hover:text-white hover:border-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600 mt-2 font-mono">Additional themes coming soon.</p>
                </div>
                <div className="pt-2 border-t border-surface-border">
                  <label className="block text-xs text-slate-400 font-mono uppercase tracking-wide mb-2">Font Scale</label>
                  <select className="input-field w-full text-sm" defaultValue="md">
                    <option value="sm">Small</option>
                    <option value="md">Medium (Default)</option>
                    <option value="lg">Large</option>
                  </select>
                </div>
              </div>
            </Card>
          )}

          {activeSection === 'about' && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-white mb-4">About RIA BOT</h2>
              <div className="space-y-3">
                {[
                  { label: 'Version', value: '1.0.0' },
                  { label: 'Build', value: 'production' },
                  { label: 'Stack', value: 'React · TypeScript · Node.js · PostgreSQL' },
                  { label: 'Mode', value: 'Paper Trading Simulator' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-2 border-b border-surface-border last:border-0">
                    <span className="text-xs text-slate-500 font-mono uppercase">{item.label}</span>
                    <span className="text-sm text-white font-mono">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 p-3 rounded-lg bg-surface-3 border border-surface-border">
                <p className="text-xs text-slate-400 leading-relaxed">
                  RIA BOT is a research-grade AI paper trading simulator. All trades are simulated with no real financial risk.
                  Use it to develop and test investment theses, track patterns, and improve your trading decisions before committing real capital.
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
