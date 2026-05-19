# FortuneFlow

> A personal wealth tracker with portfolio analytics, allocation drift alerts, risk metrics, and benchmark comparison — across multiple currencies and asset types.

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Express](https://img.shields.io/badge/Express-5-000000?style=flat-square&logo=express&logoColor=white)
![Neon](https://img.shields.io/badge/Neon-PostgreSQL-00E599?style=flat-square&logo=postgresql&logoColor=white)
![Vercel](https://img.shields.io/badge/Deploy-Vercel-000000?style=flat-square&logo=vercel&logoColor=white)
![Version](https://img.shields.io/badge/Version-1.1.0-success?style=flat-square)

---

## Overview

FortuneFlow is a multi-user web app for tracking investments across stocks, crypto, funds, gold, bonds, savings, and cash positions in both THB and USD. It computes time-weighted returns (XIRR), risk metrics (max drawdown, volatility), allocation drift against user-defined targets, and overlays benchmark indices on portfolio growth charts.

Auth, data, and uploads run through a small Express API backed by **Neon PostgreSQL**. The app deploys to **Vercel** as a serverless function plus a static React bundle. An optional **Electron** wrapper produces native desktop installers for macOS and Windows that point at the same hosted API.

---

## Features

### Portfolio tracking
- Seven asset types: `stock`, `crypto`, `fund`, `gold`, `bond`, `savings`, `cash`
- Two currencies: `THB`, `USD` (with configurable cross rate)
- Transaction ledger with `buy`, `sell`, `dividend`, `interest`, `deposit`, `withdraw`
- Auto-creation of asset rows from transactions
- FIFO-aware avg cost; realized P&L includes dividends and interest
- Cash ledger derived from deposits/withdrawals when used

### Analytics
- **Total Invested / Current Value / Unrealized & Realized P&L** in both currencies
- **YTD Net Investment** with month-by-month trend
- **Quarterly Portfolio Growth** with benchmark overlays
- **XIRR** per holding and at portfolio level (Newton-Raphson solver)
- **Allocation Drift** card — current vs target per asset type, with rebalance amount in THB
- **Max Drawdown + Volatility** — annualized risk metrics from monthly price history (per holding) and quarterly portfolio values (overall)

### Price data
- Manual monthly price entry per holding via a shared modal — fill any month back to first purchase
- **Yahoo Finance auto-fetch** to fill empty months (works for tickers like `AAPL`, `BTC-USD`, `^GSPC`, `GC=F`)
- Server-side dedupe keeps one price per asset per month (closest to month-end)

### Benchmarks
- Add any index by name + currency in Settings (e.g. `SET` / THB, `S&P500` / USD)
- Edit prices through the same monthly modal
- Renders as a dashed overlay on the Quarterly Portfolio Growth chart, normalized to the portfolio value at the benchmark's first available quarter

### Trading log
- Separate ledger for short-term trades (Trading Records page) with FIFO matching
- TFEX futures with contracts × multiplier
- Forex with lots × lot size

### Auth & account
- Email + password registration with verification email
- Forgot-password flow with timed reset link
- Edit profile: change display name, change password
- JWT-bearer auth with 30-day expiry

---

## Tech stack

| Layer | Choice |
|---|---|
| UI framework | React 19 |
| Language | TypeScript 5.7 |
| Build tool | Vite 6 |
| Routing | React Router 7 |
| Charts | Recharts 2 |
| Icons | Lucide React |
| API server | Express 5 (TypeScript via `tsx`) |
| Database | Neon PostgreSQL (`@neondatabase/serverless`) |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Email | Resend |
| Hosting | Vercel (serverless function for `/api`, static for client) |
| Desktop shell | Electron 35 (optional) |

---

## Project structure

```
wealth/
├── api/
│   └── index.ts             # Vercel serverless entry — re-exports server/app.ts
├── server/
│   ├── app.ts               # Express app + route mounting
│   ├── auth.ts              # JWT middleware + signToken
│   ├── db.ts                # Neon client + idempotent initSchema
│   ├── email.ts             # Resend wrappers (verify + reset)
│   ├── index.ts             # Local dev entry (listens on PORT)
│   ├── schema.sql           # Canonical schema reference
│   └── routes/
│       ├── auth.ts          # register, login, verify, reset, /me, change-password
│       ├── transactions.ts  # CRUD + auto-asset creation
│       ├── assets.ts        # list + legacy price update
│       ├── priceHistory.ts  # upsert/delete + monthly cleanup
│       ├── trading.ts       # spot trading log + TFEX + forex
│       ├── settings.ts      # generic key/value store
│       └── market.ts        # Yahoo Finance proxy
├── src/
│   ├── App.tsx              # Router + auth guard
│   ├── main.tsx
│   ├── index.css            # Global tokens + every component style
│   ├── components/
│   │   ├── MonthlyPriceModal.tsx  # Shared monthly-price editor
│   │   ├── brand/
│   │   └── layout/
│   ├── hooks/
│   │   ├── useAuth.tsx      # user, login, register, logout, updateUser
│   │   ├── useDatabase.tsx  # version + bump() for cross-page refetch
│   │   ├── useSettings.ts   # exchange rate auto-refresh
│   │   └── …                # legacy hooks kept for ref
│   ├── lib/
│   │   ├── api.ts           # All client → server fetch helpers
│   │   ├── calc.ts          # Pure analytics: holdings, totals, XIRR, drift, risk, benchmarks
│   │   ├── format.ts        # Currency, date, percent formatters
│   │   └── …                # Older sql.js-era files (unused; pending cleanup)
│   ├── pages/
│   │   ├── DashboardPage.tsx       # Metric cards, YTD + Quarterly charts, allocation pie, drift, per-holding stats
│   │   ├── TransactionsPage.tsx
│   │   ├── TradingRecordPage.tsx
│   │   ├── AnalyticsPage.tsx
│   │   ├── SettingsPage.tsx        # Account, Exchange Rate, Target Allocation, Benchmarks
│   │   ├── LoginPage.tsx
│   │   ├── VerifyEmailPage.tsx
│   │   └── ResetPasswordPage.tsx
│   └── types/
│       └── index.ts
├── electron/
│   ├── main.cjs
│   └── preload.cjs
├── public/
├── scripts/
├── .env.example
├── vercel.json              # Rewrites /api/* to the serverless function
├── vite.config.ts           # Defines __FORTUNEFLOW_DESKTOP_API_BASE__ for packaged builds
└── AGENTS.md                # Notes for AI agents picking up the codebase
```

---

## Setup

### Prerequisites
- Node.js ≥ 18 (uses native `fetch` in `server/routes/market.ts`)
- A Neon PostgreSQL connection string
- A Resend API key (for verification + reset emails; optional in dev — verification will simply fail to send)

### 1. Install
```bash
git clone <repo-url>
cd wealth
npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string (requires `?sslmode=require`) |
| `JWT_SECRET` | Random secret — change for production |
| `PORT` | Server port (default `3002`) |
| `RESEND_API_KEY` | For email verification + password reset |
| `APP_URL` | Public URL of the deployed app — used in email links (e.g. `http://localhost:5173` in dev) |
| `VITE_API_BASE_URL` | *Optional.* Absolute API origin for packaged desktop builds. If omitted, `APP_URL + /api` is used. |

### 3. Run in dev
Runs the Vite dev server and the Express API together:
```bash
npm run dev
```
- Web: `http://localhost:5173` (Vite proxies `/api/*` to `http://localhost:3002`)
- API alone: `npm run dev:server`
- Web alone: `npm run dev:web`

The schema initializes lazily on the first request — no manual migration step.

### 4. Build for production (web)
```bash
npm run build
```
Output goes to `dist/`. Vercel uses this with `vercel.json` rewrites to serve `/api/*` from `api/index.ts`.

### 5. Optional: Electron desktop
```bash
npm run electron:dev          # Vite + Electron together
npm run electron:dist:mac     # DMG + ZIP into release/
npm run electron:dist:win     # NSIS installer + ZIP into release/
npm run electron:dist         # Both platforms
```
Packaged builds need `VITE_API_BASE_URL` (or `APP_URL`) set at build time so the renderer can reach the hosted API while running on `file://`.

---

## API surface

All routes are mounted under `/api/*`. Every route except `/api/auth/*` (the unauthenticated ones) requires `Authorization: Bearer <jwt>`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/auth/register` | Create account, send verification email |
| `GET`  | `/api/auth/verify-email/:token` | Confirm email |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/login` | Returns JWT + user |
| `POST` | `/api/auth/forgot-password` | Sends reset link if email exists |
| `POST` | `/api/auth/reset-password` | Sets new password via reset token |
| `GET`  | `/api/auth/me` | Current user |
| `PATCH`| `/api/auth/me` | Update display name |
| `POST` | `/api/auth/change-password` | Change password (requires current) |
| `GET` `POST` `PUT` `DELETE` | `/api/transactions(/...)` | Long-term ledger |
| `GET` | `/api/transactions/recent?limit=N` | Recent N transactions |
| `GET` `PUT` | `/api/assets(/...)` | Holdings + legacy current price |
| `GET` `POST` `DELETE` | `/api/price-history(/...)` | Monthly price history |
| `GET` `POST` `PUT` `DELETE` | `/api/trading/...` | Short-term spot trading log, TFEX, forex |
| `GET` `PUT` | `/api/settings(/...)` | Per-user key/value (JSON blobs like `benchmarks`, `target_allocation`) |
| `GET` | `/api/market/yahoo/monthly?symbol=X&start=YYYY-MM` | Yahoo Finance proxy returning monthly closes |
| `GET` | `/api/health` | Liveness check |

---

## Supported asset types

| Type | Description |
|---|---|
| `stock` | Equities (US tickers, Thai SET with `.BK`, etc.) |
| `crypto` | Cryptocurrencies (`BTC-USD`, `ETH-USD`, …) |
| `fund` | Mutual funds and ETFs |
| `gold` | Physical gold or gold instruments (`GC=F` for futures) |
| `bond` | Fixed income |
| `savings` | High-yield savings accounts |
| `cash` | Cash balances (THB or USD) |

---

## Settings keys

Some settings are stored as JSON strings in the `settings` table:

| Key | Shape |
|---|---|
| `exchange_rate_thb_usd` | `"35.0"` (string number) |
| `benchmarks` | `[{ "name": "SET", "currency": "THB" }, …]` |
| `target_allocation` | `{ "stock": 60, "bond": 30, … }` percentages |

---

## Privacy

Data lives in Neon PostgreSQL with row-level scoping by `user_id`. Passwords are bcrypt hashes (cost 12). JWTs are signed with `JWT_SECRET` and expire in 30 days. There is no analytics or telemetry in the client.

---

## Contributing

If you're an **AI agent** continuing work on this codebase, read **`AGENTS.md`** first — it covers architecture decisions, conventions, and gotchas that aren't obvious from the code alone.

If you're a human, run `npm run dev`, exercise the feature you're touching, and `npx tsc -b --force` before committing. The project has no automated test suite yet — manual verification is the bar.
