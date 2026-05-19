# AGENTS.md — Notes for AI Agents Working on FortuneFlow

This file is meta-documentation for AI agents (Claude Code, Codex, Copilot, etc.) picking up work on this repo. It captures architecture decisions, conventions, and gotchas that aren't obvious from a fresh read of the code.

If you are an agent reading this: **start here**, then check `README.md` for the user-facing project description.

---

## 1. What this project is

FortuneFlow is a single-user-per-account **wealth tracking web app** with an optional Electron desktop build.

- **Frontend**: React 19 + TypeScript + Vite. UI is custom (no shadcn/MUI). Charts use Recharts.
- **Backend**: Express 5 + TypeScript. Hosted on Vercel as a serverless function (`api/index.ts` re-exports the Express app).
- **Database**: Neon PostgreSQL (serverless driver). Schema lives in two places — `server/schema.sql` (canonical reference) and `server/db.ts#initSchema` (executed on first request).
- **Auth**: email + password with JWT (30-day expiry). Email verification + password reset via Resend.

The codebase used to be offline-only with `sql.js` + IndexedDB. Some old files survive in `src/lib/` (`db.ts`, `queries.ts`, `analytics.ts`, etc.) — they are **not used in the current runtime** but were not deleted. Treat them as historical until a migration commit removes them. New work should hit the server via `src/lib/api.ts`.

---

## 2. Architecture map

```
client (src/) ── lib/api.ts ──HTTP──> server/app.ts ──> server/routes/* ──> server/db.ts ──> Neon PG
```

### Key files

| File | Role |
|---|---|
| `src/App.tsx` | Router + auth guard. |
| `src/lib/api.ts` | **The only place** to add new client→server calls. |
| `src/lib/calc.ts` | Pure functions: holdings, totals, allocation, XIRR, risk, drift, benchmark series. No I/O. |
| `src/lib/format.ts` | Currency, date, percentage formatters. |
| `src/hooks/useAuth.tsx` | Auth context — `user`, `login`, `register`, `logout`, `updateUser`. |
| `src/hooks/useDatabase.tsx` | `version` + `bump()` — a global revision number that pages watch in `useEffect` to know when to refetch after writes. |
| `src/components/MonthlyPriceModal.tsx` | Shared modal used by Dashboard (holdings) and Settings (benchmarks). |
| `server/app.ts` | Express setup + route mounting. `initSchema` runs once on first request. |
| `server/auth.ts` | `authMiddleware` (JWT bearer) + `signToken`. |
| `server/db.ts` | Neon SQL tag + idempotent schema migration with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. |
| `server/routes/*` | One file per resource. Every route except `auth.ts` mounts `authMiddleware` at the top. |
| `api/index.ts` | Vercel entry point — just re-exports `server/app.ts`. |
| `vercel.json` | Rewrites `/api/*` to the serverless function. |

---

## 3. Conventions you must follow

### Data model

- **Asset identity** is the triple `(asset_name, asset_type, currency)` — same name in different currencies is a different holding. Use `holdingKey()` from `calc.ts` whenever you need a Map key for a holding.
- `total_cost` on `buy` already includes fees (caller's responsibility). On `sell`, proceeds are computed as `price_per_unit * units - fees`.
- `price_history` is per `(user_id, asset_name, currency, price_date)` — note: **no `asset_type` in the key**. A benchmark named "SET" and a real fund named "SET" would conflict. Don't name benchmarks the same as real holdings.
- Server-side `cleanupMonthlyPrices` keeps one price point per month (closest to month-end). When you insert a new price for a month that already has one, the older one gets deleted automatically.

### Calculations

- **Currency conversion**: Settings stores `exchange_rate_thb_usd` (a single current rate). We do **not** track historical FX rates. All cross-currency aggregations use the current rate as an approximation — this is good enough for trend visualization but technically wrong for historical performance. Don't pretend it's accurate.
- **XIRR**: uses Newton-Raphson in `calc.ts`. Returns `null` if the series doesn't converge or has only positive/only negative cashflows. Always handle `null`.
- **Risk metrics**: `volatilityPct` is annualized via `√(periods/year)` — 12 for monthly, 4 for quarterly. Pass the right `periodsPerYear`.
- **Drift card**: only renders when at least one `target_allocation` value > 0. Don't show empty drift UI for users who haven't set targets.

### Settings as JSON

A few "settings" are actually JSON blobs in the `settings` table:

| Key | Shape |
|---|---|
| `exchange_rate_thb_usd` | string number (e.g. `"35.0"`) |
| `benchmarks` | `[{ name: string, currency: 'THB' \| 'USD' }]` |
| `target_allocation` | `{ stock?: number, crypto?: number, ... }` percentages 0–100 |

Always JSON.parse with a try/catch and validate shape. Pages already do this — copy the pattern.

### UI patterns

- Pages live in `src/pages/`. There is **no shared form library** — forms are hand-rolled with `useState` per field.
- Modals use the `.modal-backdrop` + `.modal` classes from `src/index.css`. Use `.modal-wide` for tables.
- Inputs: `.input` (full-size), `.input.input-sm` (compact), `.input.select` (with chevron).
- Buttons: `.btn` (primary by default), `.btn.btn-secondary`, `.btn.btn-primary` (explicit), `.btn-icon` (square icon button), `.btn-icon.danger` (red).
- Status text: `.text-success` / `.text-error` / `.text-muted`. Use these instead of inline colors.
- Cards: `.card` with `.card-title` and `.card-desc`.
- Page wrapper: `<div className="page">` with `<div className="page-header">` containing `<h1 className="page-title">`.

### State refresh

After any write (POST/PUT/PATCH/DELETE), call `bump()` from `useDatabase()` so other mounted components refetch. Don't manually update local state to "save a request" — versioning keeps everything in sync.

### Comments and emojis

The project's instruction is **no emojis in code or commit messages** unless explicitly requested. The existing README has emojis from before this rule. Don't add new ones. Comments should explain *why* something is done a certain way, never *what* — code already shows what.

---

## 4. Gotchas that have already burned us

### a. Edit tool inserts null bytes for some whitespace

There's an intermittent bug where the `Edit` tool's `new_string` parameter, when containing certain template literal whitespace, lands in the file as **NUL (0x00) bytes** instead of spaces. Symptoms:
- `grep` reports "Binary file matches" instead of showing matches
- Map lookups silently fail because the key string contains nulls

**Mitigation**: after writing a TypeScript file that uses template literal separators (e.g. building a key string), run:

```bash
node -e "const fs=require('fs');const s=fs.readFileSync('PATH','utf8');console.log('null bytes:',(s.match(/\\x00/g)||[]).length)"
```

If non-zero, rewrite via a Node script using `String.fromCharCode(32)` for explicit spaces, or replace the separator with a plain ASCII character (we use `|` in `holdingKey`).

### b. Pre-existing WIP changes in the working tree

When you start a session, `git status` may show **already-modified files** that aren't part of your task:
- `.env.example` — `VITE_API_BASE_URL` line
- `src/lib/api.ts` — `getApiBase()` for desktop builds
- `src/vite-env.d.ts` — `__FORTUNEFLOW_DESKTOP_API_BASE__` typing
- `vite.config.ts` — vite `define` for the constant

These belong to the desktop-build feature and were committed in `c86bb57`. If you see them uncommitted again, ask the owner before bundling them into an unrelated commit.

### c. Schema lives in two places

`server/schema.sql` and `server/db.ts#initSchema` must stay in sync. `initSchema` is what actually runs in production; `schema.sql` is the manual reference. If you add a column, update both, and add a matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line in `initSchema` so existing deployments migrate.

### d. `assets` table is auto-created from transactions

When a user adds a transaction with a new `asset_name`, `server/routes/transactions.ts` upserts the asset row. **Benchmarks bypass this** — they live only in `price_history` with no `assets` row, which means `updateAssetPrice` (legacy `PUT /api/assets/:name/price`) is a no-op for benchmarks. That's intentional.

### e. Tests don't exist

There is no test suite. Validate work with `npx tsc -b --force` (typecheck) and by running `npm run dev` to manually exercise the feature. Mention "no automated tests" honestly when reporting.

### f. The "merge freeze" of legacy lib files

Don't refactor or "clean up" `src/lib/db.ts`, `src/lib/queries.ts`, `src/lib/analytics.ts`, `src/lib/assetCatalog.ts`, `src/lib/xirr.ts`, or `src/lib/exchangeRate.ts` without an explicit ask. They are pre-Neon-migration leftovers. Most are imported by no one, but a few are still referenced. Leave them alone unless removal is the task.

---

## 5. Workflow expectations

### Per task

1. Read the relevant files first — don't rely on this document for current state of code, it goes stale.
2. Use `TaskCreate` for any task with ≥3 distinct steps.
3. Run `npx tsc -b --force` before claiming done. No errors allowed.
4. Verify no null bytes in any file you edited (see §4a).
5. Only commit when the user asks. Don't auto-push.

### Commits

- One feature per commit. Don't bundle unrelated changes.
- Imperative subject (max ~70 chars), then a blank line, then a paragraph explaining the *why*.
- End with the `Co-Authored-By:` trailer if you authored substantive code.
- **Stage selectively** with explicit file paths. Never `git add -A` or `git add .`.
- If there are pre-existing modifications in unrelated files (see §4b), use `git apply --cached` with a hand-crafted patch to stage only your hunks.

### Branching

The repo uses a single `main` branch. PRs are not the standard flow — commits go directly to `main`. If you want a safer pattern for a risky change, ask the user before creating a branch.

---

## 6. Roadmap awareness

These features have already shipped (with commit hashes for reference):

| Feature | Commit |
|---|---|
| Monthly price entry modal | `163debc` area + extracted to component in `b1aad4b` |
| Per-holding XIRR + portfolio XIRR | `2a314c8` |
| Benchmark line overlay on quarterly chart | `b1aad4b` |
| Target allocation editor + drift card | `11efe02` |
| Max drawdown + volatility | `89001cf` |
| Yahoo Finance auto-fetch in price modal | `7f2bd4a` |
| Desktop API base wiring | `c86bb57` |
| Profile edit (display name + password) | `1768bf5` |

Known **not yet built** but discussed:
- SET / Thai mutual fund price source (Yahoo doesn't cover Thai funds; would need `/api/market/set/*` or `/api/market/efinance/*`).
- Historical FX rate tracking (currently single current rate only).
- Test suite.

When the user asks for "the next thing", check `git log --oneline -20` for the latest direction.

---

## 7. When in doubt

- **Ask before deleting or refactoring widely.** The user has been iterating and may have context you don't.
- **Don't promise feature parity with old `src/lib/*` files** — those reference an architecture (sql.js + IDB) that no longer runs.
- **Mirror the user's language.** The owner writes in Thai for product direction and English for technical commit messages; match accordingly.
