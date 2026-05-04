import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import { get, set } from 'idb-keyval'

const DB_KEY_PREFIX = 'fortuneflow-db'
const LEGACY_DB_KEY = 'wealth-tracker-db'
export const CURRENT_DB_VERSION = 3

function getDbKey(userId?: string): string {
  return userId ? `${DB_KEY_PREFIX}-${userId}` : DB_KEY_PREFIX
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','crypto','fund','gold','bond','savings','cash')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','deposit','withdraw')),
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
  type TEXT NOT NULL CHECK(type IN ('stock','crypto','fund','gold','bond','savings','cash')),
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  current_price REAL,
  last_updated TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  price_date TEXT NOT NULL,
  price REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(asset_name, currency, price_date)
);

INSERT OR IGNORE INTO settings (key, value) VALUES ('exchange_rate_thb_usd', '35.0');
INSERT OR IGNORE INTO settings (key, value) VALUES ('db_version', '${CURRENT_DB_VERSION}');
`

let persistTimeout: ReturnType<typeof setTimeout> | null = null

function locateSqlWasm(file: string): string {
  return new URL(file, window.location.href).href
}

export async function initDatabase(userId?: string): Promise<Database> {
  const SQL = await initSqlJs({
    locateFile: locateSqlWasm,
  })

  const dbKey = getDbKey(userId)
  const saved = await get<Uint8Array>(dbKey) ?? (userId ? null : await get<Uint8Array>(LEGACY_DB_KEY))
  const db = saved ? new SQL.Database(saved) : new SQL.Database()

  if (!saved) {
    db.run(SCHEMA)
  } else {
    runMigrations(db)
  }

  await persistDatabase(db, userId)
  return db
}

function runMigrations(db: Database): void {
  // Migration 001: allow 'dividend' in action column
  try {
    const version = (() => {
      const stmt = db.prepare("SELECT value FROM settings WHERE key='db_version'")
      const v = stmt.step() ? parseInt((stmt.getAsObject() as { value: string }).value) : 0
      stmt.free()
      return v
    })()

    if (version < 1) {
      db.run(`
        CREATE TABLE transactions_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          asset_type TEXT NOT NULL,
          currency TEXT NOT NULL,
          action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend')),
          units REAL NOT NULL,
          price_per_unit REAL NOT NULL,
          total_cost REAL NOT NULL,
          fees REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`INSERT INTO transactions_v2 SELECT * FROM transactions`)
      db.run(`DROP TABLE transactions`)
      db.run(`ALTER TABLE transactions_v2 RENAME TO transactions`)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','1')`)
    }

    if (version < 2) {
      db.run(`
        CREATE TABLE transactions_v3 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','crypto','fund','gold','bond','savings','cash')),
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','deposit','withdraw')),
          units REAL NOT NULL,
          price_per_unit REAL NOT NULL,
          total_cost REAL NOT NULL,
          fees REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`INSERT INTO transactions_v3 SELECT * FROM transactions`)
      db.run(`DROP TABLE transactions`)
      db.run(`ALTER TABLE transactions_v3 RENAME TO transactions`)

      db.run(`
        CREATE TABLE assets_v2 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL CHECK(type IN ('stock','crypto','fund','gold','bond','savings','cash')),
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          current_price REAL,
          last_updated TEXT
        )
      `)
      db.run(`INSERT INTO assets_v2 SELECT * FROM assets`)
      db.run(`DROP TABLE assets`)
      db.run(`ALTER TABLE assets_v2 RENAME TO assets`)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','${CURRENT_DB_VERSION}')`)
    }

    if (version < 3) {
      db.run(`
        CREATE TABLE IF NOT EXISTS price_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          asset_name TEXT NOT NULL,
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          price_date TEXT NOT NULL,
          price REAL NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(asset_name, currency, price_date)
        )
      `)
      db.run(`
        INSERT OR IGNORE INTO price_history (asset_name, currency, price_date, price, notes)
        SELECT
          name,
          currency,
          COALESCE(substr(last_updated, 1, 10), date('now')),
          current_price,
          'Imported from current price'
        FROM assets
        WHERE current_price IS NOT NULL
      `)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','${CURRENT_DB_VERSION}')`)
    }
  } catch {
    // Migration already applied or table doesn't exist yet
  }
}

let _currentUserId: string | undefined

export function setCurrentUserId(userId?: string) {
  _currentUserId = userId
}

export async function persistDatabase(db: Database, userId?: string): Promise<void> {
  const data = db.export()
  await set(getDbKey(userId ?? _currentUserId), data)
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

  runMigrations(db)
  await persistDatabase(db)
  return db
}

export async function getSqlJs() {
  return initSqlJs({
    locateFile: locateSqlWasm,
  })
}
