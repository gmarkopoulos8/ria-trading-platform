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

## Pages
- Dashboard, OpportunityScanner, SymbolIntelligence, PaperPortfolio
- CatalystIntelligence, RiskConsole, PerformanceLab, Login

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Express session secret
- `STOCKS_API_KEY` — Stock market data API key
- `CRYPTO_API_KEY` — Crypto market data API key
- `PORT` — Express server port (default: 3001)

## Workflow
- Single workflow: "Start application" runs `npm run dev` (concurrently runs client + server)
- Vite dev server on port 5000 (webview) proxies /api to Express on 3001
