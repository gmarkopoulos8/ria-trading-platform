# RIA BOT — Project Architecture

## Overview
Full-stack AI paper trading research simulator. Premium dark-mode terminal UI for market intelligence, opportunity discovery, paper portfolio management, and exchange credential management.

## Major Features (Recently Added)

### Alpaca Paper Trading Tab
- `server/src/services/alpaca/alpacaConfig.ts` — runtime credential store, pause/killswitch state machine, `assertSafe()` guard, `getControlLevel()`. HARDCODED PAPER URL (`https://paper-api.alpaca.markets`).
- `server/src/services/alpaca/alpacaInfoService.ts` — account, positions, orders, portfolio history, market clock, drawdown computation
- `server/src/services/alpaca/alpacaExchangeService.ts` — placeOrder (with dry-run mode + AlpacaOrderLog), cancelOrder, cancelAllOrders, closePosition, closeAllPositions
- `server/src/services/alpaca/alpacaKillswitchService.ts` — pauseTrading, hardStop, emergencyExit, resumeTrading, drawdown monitor (60s polling)
- `server/src/services/alpaca/AlpacaTestSuite.ts` — 10-test automated suite (market buy/sell, limit, bracket, fractional, balance check, latency)
- `server/src/services/alpaca/StrategyReplayService.ts` — replay completed scan runs on Alpaca paper account
- `server/src/services/alpaca/LatencyMonitor.ts` — 5s polling for fill latency, slippage, p95 stats tracking via `AlpacaOrderLog`
- `server/src/routes/alpaca.ts` — 17 REST endpoints (status, account, positions, orders, portfolio history, order log, clock, controls, test suite, replay, latency)
- `CredentialService.ts` — `getAlpacaCredentials`, `saveAlpacaCredentials`, `deleteAlpacaCredentials`, `getAlpacaConnectionStatus` (AES-256-GCM encrypted secrets)
- `CredentialLoader.ts` — loads Alpaca credentials at startup
- `routes/credentials.ts` — `/alpaca/connect`, `/alpaca/disconnect`, `/alpaca/status`
- `client/src/pages/alpaca/AlpacaDashboard.tsx` — full dashboard with connect panel, stats, equity curve, position/order tables, tab navigation, 3-level control panel, test suite, fill simulator, strategy replay, latency monitor, paper vs live comparison card
- `client/src/api/client.ts` — `api.alpaca.*` (18 methods) + `credentials.alpacaConnect/Disconnect/Status`
- `App.tsx` — `/alpaca` route, `Sidebar.tsx` — Alpaca Paper nav item
- `Settings.tsx` — Connections section with Alpaca connect/disconnect form
- `Dashboard.tsx` — Alpaca Paper status card in exchange grid
- **Prisma**: `AlpacaOrderLog` + `AlpacaKillEvent` models, `ExchangeCredential` extended with 4 Alpaca fields
- **Safety**: `dryRun: true` default (orders logged but NOT sent to API); `client_order_id` always prefixed `riabot-`; live URL never used

### Full Market Universe Scanner
- `FinnhubProvider` + `FullUniverseScanner` — two-phase NYSE/NASDAQ scanning (5000+ tickers)
- `scanProgressStore` — in-memory SSE progress tracking
- `GET /api/daily-scans/progress` SSE endpoint
- `DailyScan.tsx` — Quick/Full mode toggle + live progress panel
- `OpportunityScanner.tsx` — universe stats banner, watchlist integration

### Exchange Credential Management
- `server/src/lib/encryption.ts` — AES-256-GCM encrypt/decrypt helpers
- `server/src/services/credentials/CredentialService.ts` — DB-first with env-var fallback
- `server/src/services/credentials/CredentialLoader.ts` — startup credential injection
- `server/src/routes/credentials.ts` — 9 REST endpoints (HL connect/disconnect/settings, TOS auth-url/connect/disconnect/settings, status)
- `HyperliquidConnectCard` in `HyperliquidDashboard.tsx` — inline connect wizard
- `TOSConnectCard` in `TosDashboard.tsx` — 3-step OAuth wizard (credentials → authorize → connect)
- `Dashboard.tsx` — exchange connection status cards + encryption warning banner
- **ENCRYPTION_KEY** secret (64 hex chars) required for encrypted storage. Without it, credential storage is disabled (graceful fallback to env vars).

## Architecture

### Monorepo Structure
- `/client` — React 18 + Vite + TypeScript frontend on port 5000
- `/server` — Express + TypeScript API on port 3001
- `/shared` — Shared Zod schemas and TypeScript types (workspace package)
- Root `package.json` uses npm workspaces

### Frontend (client/)
- **Framework**: React 18 + Vite 5
- **Routing**: React Router DOM v6
- **Styling**: Tailwind CSS (dark-mode-first, custom surface/accent color system)
- **Data fetching**: TanStack React Query v5
- **API client**: Axios (proxied through Vite to Express)
- **Icons**: Lucide React
- **Utilities**: clsx + tailwind-merge

### Backend (server/)
- **Framework**: Express 4 + TypeScript (via tsx)
- **ORM**: Prisma 5 (PostgreSQL)
- **Validation**: Zod (shared schemas from @ria-bot/shared)
- **Session**: express-session
- **Security**: helmet, cors

### Shared (shared/)
- Zod schemas for all API inputs
- TypeScript interfaces for all domain entities
- Exported as `@ria-bot/shared` workspace package

## Feature Status

### Completed Features
1. **Auth** — bcryptjs sessions, PostgreSQL session store, login/register pages
2. **Market Data** — CoinGecko crypto (real), Alpha Vantage stocks (mock fallback), 6 endpoints
3. **Technical Analysis Engine** — 9 indicators (SMA, EMA, RSI, MACD, ATR, Volume, Levels, Trend, RelativeStrength), 15 chart patterns, orchestrator, 2 endpoints
4. **Symbol Intelligence** — Full RSI gauge, MACD histogram, trend card, ATR/volatility, S/R levels, volume/RS gauges, pattern grid, catalyst panel
5. **Catalyst Intelligence Engine** — News service (generator, sentiment, classifier, explainer), market-wide feed, symbol catalyst analysis, sentiment scoring, event classification (17 types), urgency levels, DB persistence, 4 API endpoints
6. **Multi-Agent Thesis Engine** — MarketStructure + Catalyst + Risk + Thesis agents, conviction/confidence/health scoring, entry/exit/invalidation zones, recommended actions, 3 API endpoints
7. **Paper Trading System** — Full portfolio management: open/close positions, P&L computation (realized + unrealized), cash balance tracking, win rate, profit factor, audit logs, thesis-linked trades, "Paper Trade" button from ThesisPanel
8. **Monitoring Engine** — Continuous position monitoring job (5-min intervals): re-runs full thesis analysis per position, evaluates 13 alert conditions, deduplicates within 30min windows, stores PositionSnapshot history, updates thesisHealth + recommendedAction on position; Alert Center page with severity feed, symbol/type/unread filters, mark-read, position monitor cards with health sparklines
9. **Performance Analytics Layer** — 5 API endpoints (`/api/performance/overview`, `/patterns`, `/sectors`, `/catalysts`, `/thesis-quality`) backed by `PerformanceService.ts`; `PerformanceLab.tsx` fully rebuilt with 6 tabs (Overview, Patterns, Sectors, Catalysts, Thesis Quality, Trade Log), recharts equity curve / monthly P&L / outcome pie / hold-duration bar / asset-class bar charts, KPI stat cards, win-rate gauge, filter bar (date range / asset class / side / outcome), paginated trade log with full details
10. **Deployment Hardening** — Fixed `ria.sid` cookie logout, SESSION_SECRET production kill-switch, CORS regex for all Replit domains, 1mb body limit, sameSite `none`+secure in prod, sonner Toaster in main.tsx
11. **Live Dashboard** — All portfolio KPIs from API (value, P&L, positions, win rate, alerts, opportunities), live movers, open positions list, recent closed trades
12. **Settings Page** — Profile update, password change, notification preferences, appearance, about; backed by `PUT /api/auth/profile` and `PUT /api/auth/password` endpoints
13. **Mobile Sidebar Drawer** — AppShell handles mobile (hamburger → drawer + overlay) and desktop (collapse toggle) sidebar states
14. **Daily Scan Engine** — 4 Prisma models (DailyScanRun, DailyScanResult, RankedOpportunitySnapshot, DailyMarketReport); 6 backend services; 8 API endpoints at `/api/daily-scans`; scheduler at 9:30 ET weekdays; 3 frontend pages (DailyScan, ScanReport, ScanHistory)
15. **Stock Health Analyzer** — StockSearchHistory model; StockHealthService (6-factor weighted score: technical 30%, catalyst 20%, momentum 15%, risk 15%, volatility 10%, liquidity 10%); TradingView chart widget integration; search history panel
17. **Hyperliquid Module** — 2 Prisma models (HyperliquidOrderLog, HyperliquidKillEvent); 5 TypeScript services (config/killswitch state, info API, EIP-712 signing, exchange/order execution, killswitch+drawdown monitor); 12 API endpoints at `/api/hyperliquid`; HyperliquidDashboard frontend with live price table, positions, orders, order placement panel, and KILLSWITCH button; DRY_RUN on by default; auto drawdown monitor at configurable threshold; credentials via HL_WALLET_ADDRESS / HL_PRIVATE_KEY / HL_AGENT_PRIVATE_KEY Secrets
18. **Thinkorswim / Schwab Module** — 2 Prisma models (TosOrderLog, TosKillEvent); 5 TypeScript services (tosConfig/killswitch state, tosAuthService OAuth2 with auto-refresh, tosInfoService account/positions/orders/quotes, tosExchangeService market/limit/stop/stop_limit/bracket orders for equities+options+futures, tosKillswitchService drawdown monitor+strategy scheduler); 18 API endpoints at `/api/tos`; TosDashboard frontend with positions, open orders, order log, place-order panel (all 5 order types), system status panel, KILLSWITCH button; DRY_RUN on by default; scheduler fires strategies at market open/close or on configurable minute intervals; credentials via SCHWAB_CLIENT_ID / SCHWAB_CLIENT_SECRET / SCHWAB_REDIRECT_URI / SCHWAB_REFRESH_TOKEN / SCHWAB_ACCOUNT_NUMBER Secrets
19. **Autonomous Trading Platform** — Full AI-driven order execution engine. Schema: `AutoTradeLog` + `autoTradeEnabled`/`autoTradeConfig` on `UserSettings`. Backend services: `PortfolioStateService` (multi-exchange equity aggregation: TOS + HL + Paper), `PositionSizer` (conviction-weighted, max 10% per position, stop/TP compute), `CircuitBreaker` (killswitch checks, market hours, daily loss limit, max drawdown, open position count), `AutoTradeExecutor` (signal filtering → circuit check → size → log BEFORE order → execute TOS/HL/Paper), `IntradayMonitorLoop` (5-min loop: price check vs stop/TP → auto-exit logging), `dynamicUniverseService` (pull high-conviction signals from latest daily scan). 7 API routes at `/api/autotrader`. Frontend `AutoTrader.tsx` page with: enable/disable toggle with animated status dot, config bar (exchange/mode/SL%/TP%/conviction), 4 stat cards (equity/trades/positions/PnL), circuit breaker panel (collapsible checks), signal preview table from latest scan, portfolio balances panel, run-cycle button, trade log table. Sidebar nav: Bot icon at `/autotrader`. DRY_RUN on by default; dryRun=false only places real orders when explicitly configured.
14. **Toast Notifications** — All PaperPortfolio mutations (open/close) use sonner toasts with WIN/LOSS coloring; performance queries invalidated on position close
15. **Seed Enhancement** — Seed script generates 15 demo closed trades with realistic P&L, thesis text, tags, hold periods, outcomes for Performance Lab showcase

### API Endpoints
- `GET /api/news` — Market news feed or symbol-filtered feed
- `GET /api/news/catalysts?symbol=X` — Symbol catalyst analysis
- `GET /api/news/sentiment?symbol=X` — Symbol sentiment summary
- `GET /api/symbols/:symbol/catalysts` — Catalysts via symbols route
- `GET /api/symbols/:symbol/technical` — Full technical analysis
- `GET /api/symbols/:symbol/patterns` — Pattern detection
- `GET /api/symbols/:symbol/analyze` — Full 4-agent thesis analysis
- `GET /api/symbols/:symbol/thesis` — Thesis output only
- `GET /api/market/scan` — Conviction-ranked opportunity scan
- `GET /api/paper-positions` — Portfolio + open positions + recent closed
- `POST /api/paper-positions/open` — Open paper position (deducts cash)
- `POST /api/paper-positions/close` — Close position (realize P&L, add cash)
- `GET /api/paper-positions/closed` — Paginated closed trade history
- `GET /api/paper-positions/:id` — Single position with live price
- `PUT /api/paper-positions/:id` — Update stop/target/thesis
- `DELETE /api/paper-positions/:id` — Delete position (refunds cash if open)

### Schema Changes (latest)
- `PaperPosition` — Added: `assetClass`, `thesisHealth`
- `ClosedPosition` — Added: `assetClass`, `thesisOutcome`, `closeReason`, `targetPrice`, `stopLoss`

### Paper Trading Business Logic
- `getOrCreatePortfolio(userId)` — auto-creates $100k portfolio on first open
- Position cost deducted from cashBalance on open; exit value added on close
- P&L = (exitPrice − entryPrice) × quantity × direction (1 for LONG, −1 for SHORT)
- thesisOutcome: `TARGET_HIT` | `PARTIAL_WIN` | `STOPPED_OUT` | `INVALIDATED` | `BREAKEVEN`
- closeReason: `HIT_TARGET` | `HIT_STOP` | `MANUAL` | `THESIS_INVALIDATED` | `TIME_EXIT`
- Audit log written for every open, close, update, delete event

## Key Files
- `client/vite.config.ts` — Vite config with /api proxy to Express port 3001
- `client/tailwind.config.ts` — Custom dark theme (surface-0/1/2/3/4, accent colors)
- `server/src/index.ts` — Express entry point with all routes mounted
- `server/prisma/schema.prisma` — Full PostgreSQL schema (users, portfolios, positions, alerts)
- `shared/src/schemas/index.ts` — All Zod validation schemas
- `shared/src/types/index.ts` — All TypeScript type exports

## API Routes
- `/api/health` — Health check
- `/api/auth/*` — Authentication (login, register, logout, me, profile update, password change)
- `/api/symbols/*` — Symbol search and intelligence
- `/api/market/*` — Market overview, opportunities, movers
- `/api/paper-positions/*` — Paper portfolio CRUD
- `/api/alerts/*` — Alert management
- `/api/news/*` — News feed and catalyst analysis
- `/api/performance/*` — Analytics and reporting
- `/api/settings/*` — User settings (stub)

## Auth System
- **Backend**: bcryptjs (12 rounds), connect-pg-simple PostgreSQL session store, requireAuth middleware
- **Routes**: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- **Session cookie**: `ria.sid` in `user_sessions_store` table
- **Frontend**: AuthContext (React Query), ProtectedRoute, Login page, Register page
- **Test user**: dev@riabot.local / password123 (devtrader username)

## Pages
- Dashboard, OpportunityScanner, SymbolIntelligence, PaperPortfolio
- CatalystIntelligence, RiskConsole, PerformanceLab, Settings, Login, Register
- TopNav includes: live/offline status, PAPER badge, notifications, UserMenu (logout/settings/profile)
- Sidebar: real user info from AuthContext, animated unread alert badge, collapsible on desktop, drawer on mobile
- AppShell: desktop collapse toggle + mobile hamburger → drawer with overlay

## Market Data Layer
Service layer at `server/src/services/market/`:
- **types.ts** — Normalized DTOs: `NormalizedQuote`, `OHLCVBar`, `SearchResult`, `Timeframe`, provider interfaces
- **utils.ts** — Transformation helpers, mock OHLCV generator
- **cache.ts** — In-memory cache (TTL 5min quotes, 1h history) + DB Symbol persistence
- **stocks/** — `AlphaVantageProvider` (real, needs STOCKS_API_KEY) + `MockStocksProvider` (fallback)
- **crypto/** — `CoinGeckoProvider` (real, free tier works without key) + `MockCryptoProvider` (fallback)
- **MarketService.ts** — Unified facade, auto-detects stock vs crypto by symbol

### Active Data Sources
- **Stocks**: Mock data (realistic prices, ±noise) when STOCKS_API_KEY not set
- **Crypto**: Real CoinGecko free-tier (no key needed) with mock fallback on 429
- **Cache**: TTL-based in-memory; quotes expire in 5 min, history in 1 hour

### Wired Endpoints
- `GET /api/symbols/search?q=` — Unified stock + crypto search (real CoinGecko results)
- `GET /api/symbols/:symbol/quote?assetClass=` — Live/mock quote
- `GET /api/symbols/:symbol/history?timeframe=` — OHLCV bars (1D/1W/1M/3M/6M/1Y/5Y)
- `GET /api/market/overview` — Market status + index + crypto quotes
- `GET /api/market/opportunities?assetClass=` — Scored scan results (price + thesis scoring)
- `GET /api/market/movers?direction=up|down` — Top gainers/losers

### Frontend Data Integration
- **SymbolIntelligence**: Real search + live dropdown, quote display, recharts AreaChart with 7 timeframes, full technical analysis panel
- **OpportunityScanner**: Live from `/api/market/opportunities`, filtering + sorting, refresh button
- **TopNav CommandBar**: Smart search with real-time suggestions → navigates to `/symbol/:symbol`

## Technical Analysis Engine
Service layer at `server/src/services/technical/`:

### Indicators (`indicators/`)
- **sma.ts** — SMA20/50/200, MA alignment detection
- **ema.ts** — EMA9/21/50, golden/death cross detection
- **rsi.ts** — RSI-14 with overbought/oversold zones
- **macd.ts** — MACD line, signal line, histogram (12/26/9)
- **atr.ts** — ATR-14, volatility classification (HIGH/MEDIUM/LOW)
- **volume.ts** — Volume ratio vs 20-bar avg, spike detection
- **levels.ts** — Pivot-based support/resistance with clustering
- **trend.ts** — Slope angle, MA-based directional bias
- **relativeStrength.ts** — Win-rate-based RS percentile

### Patterns (`patterns/detector.ts`) — 15 patterns
- Ascending/Descending/Symmetrical Triangle, Bull Flag, Bear Flag
- Cup and Handle, Double Top, Double Bottom
- Head and Shoulders, Inverse Head and Shoulders
- Range Breakout, Momentum Continuation, Mean Reversion
- Failed Breakout, Failed Breakdown
- Each: confidence score, price target, stop loss, plain-language explanation

### TechnicalService.ts
- Orchestrates all indicators → composite `technicalScore` (0-100)
- 10-minute TTL in-memory cache
- DB persistence to `TechnicalSignal` and `Pattern` tables
- Returns `TechnicalAnalysisResult` and `PatternAnalysisResult` typed contracts

### Wired Endpoints
- `GET /api/symbols/:symbol/technical?timeframe=&assetClass=` — Full technical analysis
- `GET /api/symbols/:symbol/patterns?timeframe=&assetClass=` — Pattern detection

### Frontend Technical Panel (SymbolIntelligence)
- Technical Score with color-coded bar (0-100)
- RSI gauge with overbought/oversold zones
- MACD histogram bar visualization
- Trend card with MA alignment grid
- ATR & volatility card
- Support/Resistance level stack with distance percentages
- Volume & Relative Strength gauges
- Pattern detection grid with confidence, targets, explanations
- S/R reference lines overlaid on the recharts AreaChart

### Bug Fix
- CoinGecko OHLC API returns a plain array, not `{ohlc: [...]}`. Fixed in `CoinGeckoProvider.ts`.

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `STOCKS_API_KEY` — Alpha Vantage API key (optional, enables real stock quotes)
- `CRYPTO_API_KEY` — CoinGecko Pro API key (optional, free tier works without it)
- `PORT` — Express server port (default: 3001)

## Workflow
- Single workflow: "Start application" runs `npm run dev` (concurrently runs client + server)
- Vite dev server on port 5000 (webview) proxies /api to Express on 3001
