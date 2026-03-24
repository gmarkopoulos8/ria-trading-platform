import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

function ConnectionCard({ title, icon, connected, children }: {
  title: string; icon: string; connected: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn('bg-surface-2 border rounded-2xl p-5', connected ? 'border-emerald-500/25' : 'border-surface-border')}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{icon}</span>
        <div className="flex-1">
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        <span className={cn('text-xs font-bold px-2 py-1 rounded-full border',
          connected
            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
            : 'bg-surface-3 text-slate-500 border-surface-border')}>
          {connected ? '● CONNECTED' : '○ NOT CONNECTED'}
        </span>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const { user } = useAuth() as any;

  const { data: alpacaRaw } = useQuery({
    queryKey:  ['alpaca-cred-status'],
    queryFn:   () => api.credentials.alpacaStatus().then((r: any) => r.data),
    staleTime: 30_000,
  });
  const { data: notifRaw } = useQuery({
    queryKey:  ['notif-settings'],
    queryFn:   () => (api.auth as any).notificationSettings().then((r: any) => r.data),
    staleTime: 30_000,
  });

  const alpaca = alpacaRaw as any;
  const notif  = notifRaw  as any;

  const [alpacaKey, setAlpacaKey]             = useState('');
  const [alpacaSecret, setAlpacaSecret]       = useState('');
  const [alpacaDryRun, setAlpacaDryRun]       = useState(true);
  const [showAlpacaSecret, setShowAlpacaSecret] = useState(false);
  const [connectUrl, setConnectUrl]           = useState<string | null>(null);

  const alpacaConnect = useMutation({
    mutationFn: () => api.credentials.alpacaConnect({ apiKeyId: alpacaKey, secretKey: alpacaSecret, dryRun: alpacaDryRun }),
    onSuccess: () => {
      toast.success('Alpaca connected');
      setAlpacaKey(''); setAlpacaSecret('');
      qc.invalidateQueries({ queryKey: ['alpaca-cred-status'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Connection failed'),
  });

  const alpacaDisconnect = useMutation({
    mutationFn: () => api.credentials.alpacaDisconnect(),
    onSuccess: () => { toast.info('Alpaca disconnected'); qc.invalidateQueries({ queryKey: ['alpaca-cred-status'] }); },
  });

  const telegramConnect = useMutation({
    mutationFn: () => (api.auth as any).telegramConnect(),
    onSuccess: (r: any) => setConnectUrl(r.data?.connectUrl ?? null),
    onError:   (e: any) => toast.error(e?.response?.data?.error ?? 'Failed'),
  });

  const telegramDisconnect = useMutation({
    mutationFn: () => (api.auth as any).telegramDisconnect(),
    onSuccess: () => { toast.info('Telegram disconnected'); qc.invalidateQueries({ queryKey: ['notif-settings'] }); },
  });

  return (
    <div className="p-6 max-w-[800px] mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-white">Settings</h1>
        <p className="text-sm text-slate-500">Connect your trading accounts and configure notifications</p>
      </div>

      {/* Alpaca */}
      <ConnectionCard title="Alpaca Markets" icon="🦙" connected={!!alpaca?.isConnected}>
        <div className="text-xs text-slate-500 mb-4">
          Primary broker — stocks, ETFs, crypto, options. Paper trading + live trading.
          Get your API keys at{' '}
          <a href="https://app.alpaca.markets" target="_blank" rel="noreferrer" className="text-violet-400 underline">
            app.alpaca.markets
          </a>
        </div>
        {alpaca?.isConnected ? (
          <div className="space-y-3">
            <div className="flex gap-3 text-xs">
              <div className="p-2 bg-surface-3 rounded-lg flex-1">
                <p className="text-slate-500">API Key</p>
                <p className="text-white font-mono">{alpaca.apiKeyId ?? '…'}</p>
              </div>
              <div className="p-2 bg-surface-3 rounded-lg">
                <p className="text-slate-500">Mode</p>
                <p className={cn('font-semibold', alpaca.dryRun ? 'text-violet-300' : 'text-emerald-400')}>
                  {alpaca.dryRun ? 'Paper/Dry Run' : 'Live Paper'}
                </p>
              </div>
            </div>
            <button
              onClick={() => alpacaDisconnect.mutate()}
              disabled={alpacaDisconnect.isPending}
              className="w-full py-2 text-xs text-red-400 border border-red-400/20 rounded-xl hover:bg-red-400/5 transition-colors disabled:opacity-50"
            >
              Disconnect Alpaca
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input
              value={alpacaKey}
              onChange={e => setAlpacaKey(e.target.value)}
              placeholder="API Key ID"
              className="input-field w-full text-sm"
            />
            <div className="relative">
              <input
                type={showAlpacaSecret ? 'text' : 'password'}
                value={alpacaSecret}
                onChange={e => setAlpacaSecret(e.target.value)}
                placeholder="Secret Key"
                className="input-field w-full text-sm pr-16"
              />
              <button
                type="button"
                onClick={() => setShowAlpacaSecret(!showAlpacaSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-white"
              >
                {showAlpacaSecret ? 'Hide' : 'Show'}
              </button>
            </div>
            <div className="flex items-center gap-3 p-3 bg-surface-3 rounded-xl cursor-pointer" onClick={() => setAlpacaDryRun(!alpacaDryRun)}>
              <div className={cn('w-8 h-4 rounded-full relative transition-colors flex-shrink-0', alpacaDryRun ? 'bg-violet-500' : 'bg-surface-border')}>
                <span className={cn('absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all', alpacaDryRun ? 'left-4' : 'left-0.5')} />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">Dry Run Mode</p>
                <p className="text-[10px] text-slate-500">Simulate trades without placing real orders</p>
              </div>
            </div>
            <button
              onClick={() => alpacaConnect.mutate()}
              disabled={alpacaConnect.isPending || !alpacaKey || !alpacaSecret}
              className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
            >
              {alpacaConnect.isPending ? 'Connecting…' : 'Connect Alpaca'}
            </button>
          </div>
        )}
      </ConnectionCard>

      {/* Telegram */}
      <ConnectionCard title="Telegram Alerts" icon="📱" connected={!!(notif?.telegramLinked && notif?.telegramEnabled)}>
        <div className="text-xs text-slate-500 mb-4">
          Receive trade alerts and daily P&L summary in Telegram. Get notified every time a trade executes and at 4 PM ET with the day's results.
        </div>
        {notif?.telegramLinked ? (
          <div className="space-y-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
              Your Telegram is connected. Send /status to your bot anytime.
            </div>
            <button
              onClick={() => telegramDisconnect.mutate()}
              className="w-full py-2 text-xs text-red-400 border border-red-400/20 rounded-xl hover:bg-red-400/5 transition-colors"
            >
              Disconnect Telegram
            </button>
          </div>
        ) : !notif?.botConfigured ? (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
            <p className="font-semibold mb-1">Bot not configured</p>
            <p className="text-amber-400/70">Add TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME to Replit Secrets</p>
          </div>
        ) : connectUrl ? (
          <div className="space-y-3">
            <ol className="text-xs text-slate-400 list-decimal list-inside space-y-1">
              <li>Click the button below to open Telegram</li>
              <li>Press <strong className="text-white">Start</strong></li>
              <li>Come back — this page updates automatically</li>
            </ol>
            <a href={connectUrl} target="_blank" rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] text-white text-sm font-bold rounded-xl transition-colors">
              Open in Telegram
            </a>
            <button onClick={() => setConnectUrl(null)} className="w-full text-xs text-slate-600 hover:text-slate-400">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => telegramConnect.mutate()}
            disabled={telegramConnect.isPending}
            className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
          >
            {telegramConnect.isPending ? 'Generating link…' : 'Connect Telegram'}
          </button>
        )}
      </ConnectionCard>

      {/* Account profile */}
      <div className="bg-surface-2 border border-surface-border rounded-2xl p-5 space-y-3">
        <h3 className="text-sm font-bold text-white">Account</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-surface-3 rounded-xl">
            <p className="text-slate-500 mb-1">Email</p>
            <p className="text-white font-mono">{user?.email}</p>
          </div>
          <div className="p-3 bg-surface-3 rounded-xl">
            <p className="text-slate-500 mb-1">Username</p>
            <p className="text-white font-mono">{user?.username}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
