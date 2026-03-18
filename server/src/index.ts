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
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { monitorAllOpenPositions } from './services/monitoring/PositionMonitor';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PgSession = connectPgSimple(session);

app.use(session({
  store: new PgSession({
    conString: process.env.DATABASE_URL,
    tableName: 'user_sessions_store',
    createTableIfMissing: true,
    ttl: 24 * 60 * 60,
  }),
  secret: process.env.SESSION_SECRET ?? 'ria-bot-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  name: 'ria.sid',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
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

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

const MONITOR_INTERVAL_MS = 5 * 60 * 1000;

app.listen(PORT, () => {
  console.log(`✅ RIA BOT API running on port ${PORT}`);
  console.log(`   Environment : ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Database    : ${process.env.DATABASE_URL ? 'connected' : 'not configured'}`);
  console.log(`   Sessions    : PostgreSQL`);

  setTimeout(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Initial cycle error:', err?.message);
    });
  }, 15_000);

  setInterval(() => {
    monitorAllOpenPositions().catch((err) => {
      console.warn('[Monitor] Cycle error:', err?.message);
    });
  }, MONITOR_INTERVAL_MS);

  console.log(`   Monitor     : ${MONITOR_INTERVAL_MS / 1000}s interval (first run in 15s)`);
});

export default app;
