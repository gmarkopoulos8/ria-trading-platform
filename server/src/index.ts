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
import polymarketRouter from './routes/polymarket';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { monitorAllOpenPositions } from './services/monitoring/PositionMonitor';
import { startDailyScanScheduler } from './services/scans/dailyScanScheduler';

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
app.use('/api/polymarket', polymarketRouter);

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

app.listen(PORT, () => {
  console.log(`✅ RIA BOT API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Database    : ${process.env.DATABASE_URL ? 'connected' : 'not configured'}`);
  console.log(`   Sessions    : PostgreSQL (ria.sid)`);
  console.log(`   Monitor     : ${MONITOR_INTERVAL_MS / 1000}s interval (first run in 15s)`);

  setTimeout(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Initial cycle error:', err?.message);
    });
  }, 15_000);

  startDailyScanScheduler();

  setInterval(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Cycle error:', err?.message);
    });
  }, MONITOR_INTERVAL_MS);
});

export default app;
