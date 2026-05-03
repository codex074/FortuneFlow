import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import { get, set } from 'idb-keyval'

const DB_KEY = 'fortuneflow-db'
const LEGACY_DB_KEY = 'wealth-tracker-db'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','crypto','fund','gold','bond','savings')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  action TEXT NOT NULL CHECK(action IN ('buy','sell')),
  units REAL NOT NULL,
  price_per_unit REAL NOT NULL,
  total_cost REAL NOT NULL,
  fees REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('stock','crypto','fund','gold','bond','savings')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  current_price REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('exchange_rate_thb_usd', '35.0');
`

let persistTimeout: ReturnType<typeof setTimeout> | null = null

export async function initDatabase(): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: (file: string) => new URL(`/${file}`, window.location.href).href,
  })

  const saved = await get<Uint8Array>(DB_KEY) ?? await get<Uint8Array>(LEGACY_DB_KEY)
  const db = saved ? new SQL.Database(saved) : new SQL.Database()

  if (!saved) {
    db.run(SCHEMA)
    await persistDatabase(db)
  }

  return db
}

export async function persistDatabase(db: Database): Promise<void> {
  const data = db.export()
  await set(DB_KEY, data)
}

export function persistDatabaseDebounced(db: Database): void {
  if (persistTimeout) clearTimeout(persistTimeout)
  persistTimeout = setTimeout(() => {
    persistDatabase(db)
  }, 300)
}

export function exportDatabase(db: Database): void {
  const data = db.export()
  const blob = new Blob([data], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fortuneflow-backup-${new Date().toISOString().slice(0, 10)}.db`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importDatabase(
  file: File,
  SQL: SqlJsStatic
): Promise<Database> {
  const buffer = await file.arrayBuffer()
  const db = new SQL.Database(new Uint8Array(buffer))

  const tables = db
    .exec("SELECT name FROM sqlite_master WHERE type='table'")[0]
    ?.values.map((r: unknown[]) => r[0] as string) ?? []

  if (!tables.includes('transactions') || !tables.includes('settings')) {
    db.close()
    throw new Error('Invalid database file: missing required tables')
  }

  await persistDatabase(db)
  return db
}

export async function getSqlJs() {
  return initSqlJs({
    locateFile: (file: string) => new URL(`/${file}`, window.location.href).href,
  })
}
