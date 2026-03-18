# RIA BOT — AI Paper Trading Research Simulator

A production-ready full-stack paper trading research simulator with AI-powered opportunity scoring, thesis tracking, alert monitoring, and deep performance analytics.

## Features

- **Opportunity Scanner** — AI-scored market picks across stocks, ETFs, crypto
- **Symbol Intelligence** — Multi-tab deep dive: overview, thesis builder, chart, catalysts, risk
- **Paper Portfolio** — Open/close positions with real P&L computation, audit trail, thesis linking
- **Alert Center** — 13 alert conditions, position health monitoring, severity triage
- **Catalyst Intelligence** — News feed with sentiment scoring per symbol
- **Risk Console** — Portfolio exposure, sector concentration, open risk metrics
- **Performance Lab** — 6-tab analytics: overview, patterns, sectors, catalysts, thesis quality, trade log
- **Settings** — Profile management, password change, notification preferences

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript |
| Styling | Tailwind CSS (dark theme) |
| State | React Query + Zod |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL + Prisma ORM |
| Auth | express-session (PostgreSQL store) |
| Charts | Recharts |
| Toasts | Sonner |

## Project Structure

```
/
├── client/          # React + Vite frontend (port 5000)
├── server/          # Express + TypeScript backend (port 3001)
│   ├── src/
│   │   ├── routes/  # API route handlers
│   │   ├── services/ # Business logic (analytics, alerts, market data)
│   │   ├── lib/     # Auth, Prisma client
│   │   └── middleware/
│   └── prisma/      # Schema + migrations + seed
└── shared/          # Shared types and Zod schemas
```

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL database

### Environment Variables

```env
DATABASE_URL=postgresql://user:pass@host:5432/dbname
SESSION_SECRET=your-secret-min-32-chars   # required in production
CLIENT_URL=https://yourapp.replit.app     # optional, for CORS override
```

### Development

```bash
npm install
npm run db:push        # apply schema to database
npm run db:seed        # create dev test user + demo trades
npm run dev            # start both client (5000) and server (3001)
```

### Dev Test Account

After seeding:
- Email: `dev@riabot.local`
- Password: `password123`

### Production Deployment

The app is configured for Replit deployments. Set the following secrets:

1. `DATABASE_URL` — PostgreSQL connection string
2. `SESSION_SECRET` — Random string (min 32 chars). The server **exits** if this is missing in production.

The app will automatically:
- Use `sameSite: none` + `secure: true` cookies for cross-origin auth
- Accept requests from all `*.replit.dev`, `*.replit.app`, and `*.repl.co` domains
- Store sessions in PostgreSQL (not memory)

### Database Commands

```bash
npm run db:push        # apply schema changes
npm run db:migrate     # create + apply migration
npm run db:seed        # seed test data
npm run db:studio      # open Prisma Studio
```

## API Routes

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| PUT | `/api/auth/profile` | Update display name |
| PUT | `/api/auth/password` | Change password |
| GET | `/api/market/overview` | Market status |
| GET | `/api/market/opportunities` | AI-scored picks |
| GET | `/api/market/movers` | Top movers |
| GET | `/api/symbols/:symbol` | Symbol data |
| GET | `/api/paper-positions` | Portfolio + positions |
| POST | `/api/paper-positions/open` | Open position |
| POST | `/api/paper-positions/close` | Close position |
| GET | `/api/alerts` | Alert list |
| GET | `/api/alerts/unread-count` | Unread badge count |
| GET | `/api/performance/overview` | Portfolio KPIs |
| GET | `/api/performance/patterns` | Trading patterns |
| GET | `/api/performance/sectors` | Sector breakdown |
| GET | `/api/performance/catalysts` | Catalyst analysis |
| GET | `/api/performance/thesis-quality` | Thesis quality |
| GET | `/api/performance/trade-log` | Paginated trade log |

## License

Research and educational use only. Not financial advice.
