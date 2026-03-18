# RIA BOT — Project Architecture

## Overview
Full-stack AI paper trading research simulator. Premium dark-mode terminal UI for market intelligence, opportunity discovery, and paper portfolio management.

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

## Key Files
- `client/vite.config.ts` — Vite config with /api proxy to Express port 3001
- `client/tailwind.config.ts` — Custom dark theme (surface-0/1/2/3/4, accent colors)
- `server/src/index.ts` — Express entry point with all routes mounted
- `server/prisma/schema.prisma` — Full PostgreSQL schema (users, portfolios, positions, alerts)
- `shared/src/schemas/index.ts` — All Zod validation schemas
- `shared/src/types/index.ts` — All TypeScript type exports

## API Routes
- `/api/health` — Health check
- `/api/auth/*` — Authentication (login, register, logout, me)
- `/api/symbols/*` — Symbol search and intelligence
- `/api/market/*` — Market overview, opportunities, movers
- `/api/paper-positions/*` — Paper portfolio CRUD
- `/api/alerts/*` — Alert management
- `/api/news/*` — News feed and catalyst analysis
- `/api/performance/*` — Analytics and reporting
- `/api/settings/*` — User settings

## Auth System
- **Backend**: bcryptjs (12 rounds), connect-pg-simple PostgreSQL session store, requireAuth middleware
- **Routes**: POST /api/auth/register, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
- **Session cookie**: `ria.sid` in `user_sessions_store` table
- **Frontend**: AuthContext (React Query), ProtectedRoute, Login page, Register page
- **Test user**: dev@riabot.local / password123 (devtrader username)

## Pages
- Dashboard, OpportunityScanner, SymbolIntelligence, PaperPortfolio
- CatalystIntelligence, RiskConsole, PerformanceLab, Login, Register
- TopNav includes: live/offline status, PAPER badge, notifications, UserMenu (logout/settings/profile)

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
- **SymbolIntelligence**: Real search + live dropdown, quote display, recharts AreaChart with 7 timeframes
- **OpportunityScanner**: Live from `/api/market/opportunities`, filtering + sorting, refresh button
- **TopNav CommandBar**: Smart search with real-time suggestions → navigates to `/symbol/:symbol`

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `STOCKS_API_KEY` — Alpha Vantage API key (optional, enables real stock quotes)
- `CRYPTO_API_KEY` — CoinGecko Pro API key (optional, free tier works without it)
- `PORT` — Express server port (default: 3001)

## Workflow
- Single workflow: "Start application" runs `npm run dev` (concurrently runs client + server)
- Vite dev server on port 5000 (webview) proxies /api to Express on 3001
