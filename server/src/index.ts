import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import session from 'express-session';
import authRouter from './routes/auth';
import symbolsRouter from './routes/symbols';
import marketRouter from './routes/market';
import paperPositionsRouter from './routes/paper-positions';
import alertsRouter from './routes/alerts';
import newsRouter from './routes/news';
import performanceRouter from './routes/performance';
import settingsRouter from './routes/settings';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL ?? 'http://localhost:5000',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET ?? 'ria-bot-dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
  },
}));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    service: 'RIA BOT API',
    version: '1.0.0',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString(),
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

app.listen(PORT, () => {
  console.log(`✅ RIA BOT API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV ?? 'development'}`);
  console.log(`   Database: ${process.env.DATABASE_URL ? 'connected' : 'not configured'}`);
});

export default app;
