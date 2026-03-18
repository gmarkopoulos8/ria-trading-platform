# RIA BOT — Market Intelligence Terminal

AI-powered paper trading research simulator for short-term stock & crypto opportunity discovery, thesis scoring, and active paper position monitoring.

## Tech Stack

- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL + Prisma ORM
- **State/Data**: React Query + Zod
- **Shared**: `/shared` workspace for types, schemas, and contracts

## Project Structure

```
/
├── client/          # React + Vite frontend (port 5000)
├── server/          # Express backend (port 3001)
├── shared/          # Shared types, schemas, Zod validators
└── package.json     # Root workspace
```

## Running on Replit

The app starts automatically via the configured workflow. The Vite dev server runs on port 5000 and proxies `/api/*` to the Express server on port 3001.

### Manual Start

```bash
npm install
npm run dev
```

## Environment Variables

Copy `.env.example` and configure:

```bash
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-here
STOCKS_API_KEY=your-stocks-api-key
CRYPTO_API_KEY=your-crypto-api-key
```

## API Routes

| Route | Description |
|-------|-------------|
| `GET /api/health` | Health check |
| `POST /api/auth/login` | Login |
| `POST /api/auth/register` | Register |
| `GET /api/market/overview` | Market overview |
| `GET /api/market/opportunities` | AI-scored opportunities |
| `GET /api/symbols/search` | Symbol search |
| `GET /api/symbols/:symbol` | Symbol intelligence |
| `GET /api/paper-positions` | List positions |
| `POST /api/paper-positions/open` | Open position |
| `POST /api/paper-positions/close` | Close position |
| `GET /api/alerts` | List alerts |
| `POST /api/alerts` | Create alert |
| `GET /api/news` | News feed |
| `GET /api/performance` | Performance report |
| `GET /api/settings` | User settings |

## Frontend Pages

- `/dashboard` — Market overview & portfolio summary
- `/scanner` — AI opportunity scanner
- `/symbol/:symbol` — Symbol deep-dive intelligence
- `/portfolio` — Paper positions & P&L
- `/catalysts` — News & catalyst tracking
- `/risk` — Risk console & exposure monitoring
- `/performance` — Analytics & performance lab
- `/login` — Authentication

## Database Setup

```bash
# Generate Prisma client
npx prisma generate --schema=server/prisma/schema.prisma

# Run migrations (requires DATABASE_URL)
npx prisma migrate dev --schema=server/prisma/schema.prisma
```
