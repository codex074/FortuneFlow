# FortuneFlow 💸

> **Your personal wealth command center.** Track every investment, measure real returns, and understand exactly where your money is — all offline, all private.

---

![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-35-47848F?style=flat-square&logo=electron&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-WASM-003B57?style=flat-square&logo=sqlite&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-lightgrey?style=flat-square)
![Version](https://img.shields.io/badge/Version-1.0.0-success?style=flat-square)

---

## Overview

FortuneFlow is a **desktop-first wealth tracking app** built with React, TypeScript, and Electron. All data lives locally in a SQLite database stored in your browser's IndexedDB — no server, no cloud sync, no subscription. Just you and your numbers.

It supports **seven asset classes**, **two currencies (THB & USD)**, automatic FIFO cost-basis accounting, annualized-return calculations (XIRR & CAGR), and visual analytics that put your portfolio performance in context against real-world benchmarks.

---

## Key Features

- 📊 **Live Dashboard** — KPI cards for Total Invested (THB & USD), Current Portfolio Value, Unrealized P&L, Realized P&L, and YTD Net Flow; area charts for monthly investment trend and quarterly portfolio growth; interactive donut for asset allocation.
- 📋 **Full Transaction Ledger** — Log `buy`, `sell`, `dividend`, `deposit`, and `withdraw` events with date, price, units, fees, and notes. Full edit and delete support.
- 🗂️ **Asset Catalog Picker** — Search from NASDAQ, NYSE, and AMEX symbol lists when adding a new stock position.
- 💼 **Portfolio Drill-Down** — Click any asset type on the allocation pie chart to see every holding: average cost, current price, invested amount, current value, and unrealized/realized P&L at a glance.
- 📈 **Manual Price History** — Record timestamped price snapshots per asset; view the last five data points inline and delete stale entries.
- 🧮 **FIFO Cost-Basis Engine** — All realized profit calculations use First-In-First-Out lot matching, giving you accurate tax-lot accounting.
- 📐 **XIRR & CAGR Analytics** — Time-weighted annualized return per asset and across the whole portfolio, factoring in every cash-flow event.
- 🏆 **Benchmark Comparison** — Bar chart comparing your portfolio XIRR against S&P 500 (10.3%), SET Index (5.2%), Gold (7.1%), and Cash (3%).
- 💵 **Dividend Income Tracker** — Monthly bar chart and per-asset breakdown with yield-on-invested calculation.
- 🔄 **Auto Exchange Rate** — Fetches live USD/THB rate on startup; falls back to the last saved rate when offline. Manual override available.
- 💾 **Backup & Restore** — One-click SQLite database export/import; backup reminder if it has been more than 7 days since the last export.
- 🔐 **Multi-User Auth** — Local login and registration; each user's data is isolated in a separate IndexedDB key.
- 🖥️ **Native Desktop App** — Packaged with Electron for macOS (DMG + ZIP) and Windows (NSIS installer + ZIP).

---

## Tech Stack

| Layer | Technology |
|---|---|
| UI Framework | React 19 |
| Language | TypeScript 5.7 |
| Build Tool | Vite 6 |
| Desktop Shell | Electron 35 |
| Database | sql.js (SQLite via WebAssembly) |
| Persistence | idb-keyval (IndexedDB) |
| Charting | Recharts 2 |
| Routing | React Router 7 |
| Icons | Lucide React |
| Packaging | electron-builder 25 |

---

## Installation & Setup

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9

### 1. Clone & Install

```bash
git clone <repo-url>
cd wealth
npm install
```

### 2. Run in the Browser (Dev Mode)

```bash
npm run dev
```

Opens at `http://localhost:5173`.

### 3. Run as a Desktop App (Electron Dev Mode)

```bash
npm run electron:dev
```

Starts the Vite dev server and launches the Electron window concurrently.

### 4. Build for Production

```bash
npm run build
```

Output goes to `dist/`.

### 5. Package the Desktop App

```bash
# macOS
npm run electron:dist:mac

# Windows
npm run electron:dist:win

# Both platforms
npm run electron:dist
```

Installers are written to `release/`.

---

## Folder Structure

```
wealth/
├── electron/
│   ├── main.cjs          # Electron main process — window creation, IPC, asset catalog fetching
│   └── preload.cjs       # Context bridge for renderer <-> main communication
│
├── public/
│   ├── sql-wasm.wasm     # SQLite WebAssembly binary (Node/Electron)
│   ├── sql-wasm-browser.wasm  # SQLite WebAssembly binary (browser)
│   ├── icon.png          # App icon (macOS)
│   └── icon.ico          # App icon (Windows)
│
├── scripts/
│   └── electron-dev.mjs  # Dev runner — waits for Vite, then opens Electron
│
├── src/
│   ├── App.tsx           # Root router with auth guards
│   ├── main.tsx          # React entry point
│   ├── index.css         # Global design tokens and component styles
│   │
│   ├── components/
│   │   ├── brand/
│   │   │   └── AppLogo.tsx
│   │   └── layout/
│   │       ├── Layout.tsx    # Shell with sidebar + Outlet
│   │       └── Sidebar.tsx   # Navigation sidebar
│   │
│   ├── hooks/
│   │   ├── useAuth.tsx        # Login / register / session state
│   │   ├── useDatabase.tsx    # Database context — init, persist, export, import
│   │   ├── usePortfolio.ts    # Holdings + totals derived from DB
│   │   ├── useSettings.ts     # Exchange rate with auto-refresh
│   │   └── useTransactions.ts # Transaction CRUD helpers
│   │
│   ├── lib/
│   │   ├── analytics.ts   # XIRR/CAGR, dividend analytics, portfolio metrics
│   │   ├── assetCatalog.ts # Asset search & catalog management
│   │   ├── auth.ts        # Password hashing + user record helpers
│   │   ├── calc.ts        # FIFO engine, holdings, totals, allocation, trend data
│   │   ├── db.ts          # SQLite init, schema, migrations, export/import
│   │   ├── exchangeRate.ts # Live USD/THB rate fetching with fallback
│   │   ├── format.ts      # Currency, number, date, percentage formatters
│   │   ├── queries.ts     # All SQL queries (transactions, assets, price history, settings)
│   │   └── xirr.ts        # Newton-Raphson XIRR solver
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx    # KPI cards, area charts, allocation pie, recent transactions
│   │   ├── TransactionsPage.tsx # Full ledger with add/edit/delete
│   │   ├── PortfolioPage.tsx    # Interactive allocation chart + per-holding drill-down
│   │   ├── AnalyticsPage.tsx    # XIRR/CAGR table, benchmark chart, dividend income
│   │   ├── SettingsPage.tsx     # Exchange rate, backup/restore, DB version status
│   │   ├── LoginPage.tsx
│   │   └── RegisterPage.tsx
│   │
│   └── types/
│       └── index.ts       # Shared TypeScript types (Transaction, Asset, Holding, etc.)
│
├── dist/                  # Production build output
├── release/               # Packaged desktop installers
├── index.html             # Vite HTML entry
├── package.json
├── vite.config.ts
├── tsconfig.json
└── DESIGN-notion.md       # Design system tokens (Notion-inspired)
```

---

## Supported Asset Types

| Type | Description |
|---|---|
| `stock` | Individual equities (US markets + Thai SET) |
| `crypto` | Cryptocurrencies |
| `fund` | Mutual funds and ETFs |
| `gold` | Physical gold or gold-backed instruments |
| `bond` | Fixed income |
| `savings` | High-yield savings accounts |
| `cash` | Cash balances in THB or USD |

---

## Data & Privacy

FortuneFlow stores **all data locally** — nothing leaves your device. The SQLite database is serialized into IndexedDB, keyed by user ID. Use **Settings → Export** to download a portable `.db` backup file at any time.
