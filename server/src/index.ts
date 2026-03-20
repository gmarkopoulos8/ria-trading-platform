import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import authRouter from './routes/auth';
import symbolsRouter from './routes/symbols';
import marketRouter from './routes/market';
import paperPositionsRouter from './routes/paper-positions';
import alertsRouter from './routes/alerts';
import newsRouter from './routes/news';
import performanceRouter from './routes/performance';
import settingsRouter from './routes/settings';
import dailyScansRouter from './routes/daily-scans';
import stocksRouter from './routes/stocks';
import hyperliquidRouter from './routes/hyperliquid';
import tosRouter from './routes/tos';
import autotraderRouter from './routes/autotrader';
import credentialRouter from './routes/credentials';
import alpacaRouter from './routes/alpaca';
import optionsRouter from './routes/options';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { monitorAllOpenPositions } from './services/monitoring/PositionMonitor';
import { startDailyScanScheduler } from './services/scans/dailyScanScheduler';
import { startIntradayMonitor } from './services/autotrader/IntradayMonitorLoop';
import { isEncryptionConfigured } from './lib/encryption';
import { loadDefaultCredentials } from './services/credentials/CredentialLoader';
import { startLatencyMonitor } from './services/alpaca/LatencyMonitor';
import { startDrawdownMonitor } from './services/alpaca/alpacaKillswitchService';
import { startAdaptiveLoop } from './services/alpaca/AdaptiveParameterEngine';
import { startUniversalAdaptiveLoop } from './services/autotrader/UniversalAdaptiveEngine';
import { livePriceManager } from './services/market/LivePriceManager';
import { subscribeWatchlistToTicks } from './services/autotrader/IntradaySignalEngine';
import { getPositions } from './services/alpaca/alpacaInfoService';
import { closePosition } from './services/alpaca/alpacaExchangeService';
import { hasAlpacaCredentials, isPauseActive, isKillswitchActive } from './services/alpaca/alpacaConfig';
import { prisma } from './lib/prisma';

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProd = process.env.NODE_ENV === 'production';

const SESSION_SECRET = process.env.SESSION_SECRET ?? '';
if (!SESSION_SECRET || SESSION_SECRET === 'ria-bot-dev-secret-change-in-production') {
  if (isProd) {
    console.error('❌ FATAL: SESSION_SECRET env var is not set or is using the default value. Set a strong secret before deploying.');
    process.exit(1);
  } else {
    console.warn('⚠️  SESSION_SECRET not set — using insecure default. Set SESSION_SECRET before deploying.');
  }
}

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));

const allowedOrigins: (string | RegExp)[] = [
  'http://localhost:5000',
  'http://localhost:3000',
  /\.replit\.dev$/,
  /\.replit\.app$/,
  /\.repl\.co$/,
  /\.kirk\.replit\.dev$/,
];
if (process.env.CLIENT_URL) allowedOrigins.push(process.env.CLIENT_URL);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some((o) =>
      typeof o === 'string' ? o === origin : o.test(origin),
    );
    callback(allowed ? null : new Error(`CORS: origin ${origin} not allowed`), allowed);
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions_store',
    createTableIfMissing: true,
    ttl: 24 * 60 * 60,
  }),
  secret: SESSION_SECRET || 'ria-bot-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'ria.sid',
  cookie: {
    secure: isProd,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: isProd ? 'none' : 'lax',
  },
}));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'RIA BOT API',
    version: '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
    authenticated: !!req.session?.userId,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/symbols', symbolsRouter);
app.use('/api/market', marketRouter);
app.use('/api/paper-positions', paperPositionsRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/news', newsRouter);
app.use('/api/performance', performanceRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/daily-scans', dailyScansRouter);
app.use('/api/stocks', stocksRouter);
app.use('/api/hyperliquid', hyperliquidRouter);
app.use('/api/tos', tosRouter);
app.use('/api/autotrader', autotraderRouter);
app.use('/api/credentials', credentialRouter);
app.use('/api/alpaca', alpacaRouter);
app.use('/api/options', optionsRouter);

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

if (!isEncryptionConfigured()) {
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.error('SETUP REQUIRED: ENCRYPTION_KEY is not set.');
  console.error("Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  console.error('Add it to Replit Secrets, then restart the server.');
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

app.listen(PORT, async () => {
  console.log(`✅ RIA BOT API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Database    : ${process.env.DATABASE_URL ? 'connected' : 'not configured'}`);
  console.log(`   Sessions    : PostgreSQL (ria.sid)`);
  console.log(`   Monitor     : ${MONITOR_INTERVAL_MS / 1000}s interval (first run in 15s)`);

  await loadDefaultCredentials();

  // Reset any scans left in RUNNING state from a previous server instance
  try {
    const result = await prisma.dailyScanRun.updateMany({
      where: { status: 'RUNNING' },
      data:  { status: 'FAILED', errorMessage: 'Reset on server startup — was stuck in RUNNING state' },
    });
    if (result.count > 0) {
      console.log(`[Startup] Reset ${result.count} stuck RUNNING scan(s) to FAILED`);
    }
  } catch (err: any) {
    console.warn('[Startup] Could not reset stuck scans:', err?.message);
  }

  setTimeout(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Initial cycle error:', err?.message);
    });
  }, 15_000);

  livePriceManager.connect();
  subscribeWatchlistToTicks();
  startDailyScanScheduler();
  startIntradayMonitor();
  startLatencyMonitor(5_000);
  startDrawdownMonitor(60_000);
  startAdaptiveLoop();
  startUniversalAdaptiveLoop();
  startAlpacaAutoMonitor();

  setInterval(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Cycle error:', err?.message);
    });
  }, MONITOR_INTERVAL_MS);
});

// ── Alpaca auto-monitor: close stops/targets every 5 min during market hours ──
function startAlpacaAutoMonitor() {
  setInterval(async () => {
    try {
      if (!hasAlpacaCredentials() || isPauseActive() || isKillswitchActive()) return;

      const nyHour = parseInt(
        new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }), 10
      );
      if (nyHour < 9 || nyHour >= 16) return;

      const positions = await getPositions();
      if (!positions || positions.length === 0) return;

      const defaultStop   = 4.0;
      const defaultTarget = 8.0;

      for (const pos of positions) {
        const entry   = parseFloat((pos as any).avg_entry_price ?? '0');
        const current = parseFloat((pos as any).current_price   ?? '0');
        if (entry <= 0 || current <= 0) continue;

        const pnlPct = ((current - entry) / entry) * 100;

        if (pnlPct <= -defaultStop || pnlPct >= defaultTarget) {
          const reason = pnlPct <= -defaultStop
            ? `Auto stop-loss: ${pnlPct.toFixed(2)}%`
            : `Auto take-profit: +${pnlPct.toFixed(2)}%`;

          console.info(`[AutoMonitor] Closing ${(pos as any).symbol} — ${reason}`);

          await closePosition((pos as any).symbol).catch((e: any) =>
            console.warn(`[AutoMonitor] Close failed for ${(pos as any).symbol}:`, e?.message)
          );

          try {
            const exitPrice   = current;
            const marketValue = parseFloat((pos as any).market_value ?? '0');
            const dollarPnl   = pnlPct / 100 * Math.abs(marketValue);
            await prisma.autoTradeLog.updateMany({
              where: { symbol: (pos as any).symbol, exchange: 'PAPER', status: 'FILLED', exitPrice: null },
              data:  { exitPrice, pnl: dollarPnl, status: 'CLOSED' },
            });
          } catch { /* ignore writeback errors */ }
        }
      }
    } catch {
      // swallow all errors — background loop
    }
  }, 5 * 60_000);
  console.info('[AutoMonitor] Alpaca position monitor started (5-min interval)');
}

export default app;
