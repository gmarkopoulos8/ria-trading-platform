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

function TelegramSetupFlow({ notif, onConnect, connectUrl, isPending, onClearUrl }: {
  notif: any;
  onConnect: (token: string, username: string) => void;
  connectUrl: string | null;
  isPending: boolean;
  onClearUrl: () => void;
}) {
  const [step, setStep]               = useState<'intro' | 'form' | 'link'>('intro');
  const [botToken, setBotToken]       = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [showToken, setShowToken]     = useState(false);
  const [verifying, setVerifying]     = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [copied, setCopied]           = useState(false);

  if (connectUrl && step !== 'link') setStep('link');

  const handleVerifyAndConnect = async () => {
    if (!botToken.trim() || !botUsername.trim()) return;
    setVerifyError(null);
    setVerifying(true);
    try {
      if (!botToken.includes(':')) {
        setVerifyError('Bot token format looks wrong — it should contain a colon (:)');
        setVerifying(false);
        return;
      }
      const cleanUsername = botUsername.replace('@', '').trim();
      onConnect(botToken.trim(), cleanUsername);
    } catch {
      setVerifyError('Something went wrong');
    }
    setVerifying(false);
  };

  const copyLink = () => {
    if (!connectUrl) return;
    navigator.clipboard.writeText(connectUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (step === 'intro') {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          {[
            { n: '1', text: 'Create your personal bot on Telegram (takes 60 seconds)' },
            { n: '2', text: 'Paste your bot token here' },
            { n: '3', text: 'Click a link to connect your chat' },
          ].map(({ n, text }) => (
            <div key={n} className="flex items-start gap-3 text-xs">
              <span className="w-5 h-5 rounded-full bg-violet-500/30 text-violet-300 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">{n}</span>
              <span className="text-slate-400">{text}</span>
            </div>
          ))}
        </div>

        <div className="bg-surface-3 border border-surface-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-white">Step 1 — Create your bot</p>
          <ol className="space-y-2 text-xs text-slate-400 list-decimal list-inside">
            <li>Open Telegram and search <span className="text-violet-400 font-semibold">@BotFather</span></li>
            <li>Send <span className="font-mono bg-black/30 px-1.5 py-0.5 rounded text-violet-300">/newbot</span></li>
            <li>Choose any name (e.g. <span className="font-mono text-slate-300">My RIA Alerts</span>)</li>
            <li>Choose a username ending in <span className="font-mono text-slate-300">bot</span></li>
            <li>BotFather sends you a <span className="text-emerald-400 font-semibold">bot token</span> — copy it</li>
          </ol>
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.94z"/>
            </svg>
            Open @BotFather on Telegram
          </a>
        </div>

        <button
          onClick={() => setStep('form')}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition-colors"
        >
          I have my bot token →
        </button>
      </div>
    );
  }

  if (step === 'form') {
    return (
      <div className="space-y-4">
        <button onClick={() => setStep('intro')} className="text-xs text-slate-500 hover:text-slate-300">← Back</button>

        <div className="bg-surface-3 border border-surface-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-white">Step 2 — Enter your bot details</p>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Bot Token</label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={e => setBotToken(e.target.value)}
                placeholder="1234567890:ABCdef..."
                className="input-field w-full text-sm font-mono pr-16"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500 hover:text-white"
              >
                {showToken ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1">Looks like: 1234567890:ABCdefGHIjkl...</p>
          </div>

          <div>
            <label className="block text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Bot Username</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
              <input
                type="text"
                value={botUsername}
                onChange={e => setBotUsername(e.target.value.replace('@', ''))}
                placeholder="myria_alerts_bot"
                className="input-field w-full text-sm pl-7"
              />
            </div>
            <p className="text-[10px] text-slate-600 mt-1">The username you chose in BotFather</p>
          </div>

          {verifyError && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              ❌ {verifyError}
            </p>
          )}
        </div>

        <button
          onClick={handleVerifyAndConnect}
          disabled={verifying || isPending || !botToken.trim() || !botUsername.trim()}
          className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-colors"
        >
          {verifying || isPending ? 'Verifying bot token…' : 'Save & continue →'}
        </button>
      </div>
    );
  }

  if (step === 'link') {
    return (
      <div className="space-y-4">
        <div className="bg-surface-3 border border-surface-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-white">Step 3 — Connect your chat</p>
          <ol className="space-y-1.5 text-xs text-slate-400 list-decimal list-inside">
            <li>Click the button below to open your bot in Telegram</li>
            <li>Press <strong className="text-white">Start</strong></li>
            <li>Come back — this page updates automatically</li>
          </ol>
          <a
            href={connectUrl!}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 bg-[#2AABEE] hover:bg-[#229ED9] text-white text-xs font-bold rounded-xl transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12l-6.871 4.326-2.962-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.833.94z"/>
            </svg>
            Open your bot in Telegram
          </a>
          <button onClick={copyLink} className="w-full py-1.5 text-[10px] text-slate-500 hover:text-slate-300 border border-surface-border rounded-lg transition-colors">
            {copied ? '✓ Copied!' : "Copy link (if Telegram doesn't open)"}
          </button>
          <p className="text-[10px] text-slate-600 text-center">Link expires in 10 minutes</p>
        </div>
        <button onClick={onClearUrl} className="w-full text-xs text-slate-600 hover:text-slate-400">← Start over</button>
      </div>
    );
  }

  return null;
}

export default function Settings() {
  const qc = useQueryClient();
  const { user } = useAuth() as any;

  const { data: alpacaRaw } = useQuery({
    queryKey:  ['alpaca-cred-status'],
    queryFn:   () => api.credentials.alpacaStatus().then((r: any) => r.data),
    staleTime: 30_000,
  });
  const { data: notifRaw, refetch: refetchNotif } = useQuery({
    queryKey:        ['notif-settings'],
    queryFn:         () => (api.auth as any).notificationSettings().then((r: any) => r.data),
    staleTime:       15_000,
    refetchInterval: 8_000,
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
    mutationFn: (params: { botToken: string; botUsername: string }) =>
      (api.auth as any).telegramConnect(params),
    onSuccess: (r: any) => {
      setConnectUrl(r.data?.connectUrl ?? null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Failed'),
  });

  const telegramDisconnect = useMutation({
    mutationFn: () => (api.auth as any).telegramDisconnect(),
    onSuccess: () => {
      toast.info('Telegram disconnected');
      setConnectUrl(null);
      qc.invalidateQueries({ queryKey: ['notif-settings'] });
    },
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
          Each account has its own private Telegram bot. Your trades and P&L go to your bot only — completely isolated from other users.
        </div>

        {notif?.telegramLinked ? (
          <div className="space-y-3">
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-400">
              <p className="font-semibold mb-1">✓ Your personal bot is connected</p>
              {notif.telegramBotUsername && (
                <p className="text-emerald-400/70">Bot: @{notif.telegramBotUsername}</p>
              )}
            </div>
            <div className="text-[10px] text-slate-500 space-y-1">
              <p><span className="font-mono text-slate-400">/stop</span> — pause alerts</p>
              <p><span className="font-mono text-slate-400">/status</span> — check connection</p>
            </div>
            <button
              onClick={() => telegramDisconnect.mutate()}
              className="w-full py-2 text-xs text-red-400 border border-red-400/20 rounded-xl hover:bg-red-400/5 transition-colors"
            >
              Disconnect Telegram
            </button>
          </div>
        ) : (
          <TelegramSetupFlow
            notif={notif}
            onConnect={(token, username) => telegramConnect.mutate({ botToken: token, botUsername: username })}
            connectUrl={connectUrl}
            isPending={telegramConnect.isPending}
            onClearUrl={() => setConnectUrl(null)}
          />
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
