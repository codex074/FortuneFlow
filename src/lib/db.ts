import initSqlJs from 'sql.js'
import type { Database, SqlJsStatic } from 'sql.js'
import { get, set } from 'idb-keyval'

const DB_KEY_PREFIX = 'fortuneflow-db'
const LEGACY_DB_KEY = 'wealth-tracker-db'
const ENCRYPTED_DB_MAGIC = 'FFDB1'
const ENCRYPTION_ITERATIONS = 210_000
const DB_PASSWORD_HASH_KEY = 'database_password_hash'
const DB_PASSWORD_HINT_KEY = 'database_password_hint'
export const CURRENT_DB_VERSION = 6

interface EncryptedBackupHeader {
  salt: string
  iv: string
  hint: string
  iterations: number
}

export interface DatabaseExportCredentials {
  password: string
  hint: string
}

export interface DatabaseBackupInfo {
  encrypted: boolean
  hint?: string
}

interface DatabasePasswordHash {
  salt: string
  hash: string
  iterations: number
}

export interface DatabasePasswordInfo {
  protected: boolean
  hint?: string
}

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
  action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','interest','deposit','withdraw')),
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

CREATE TABLE IF NOT EXISTS trading_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  asset_name TEXT NOT NULL,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  action TEXT NOT NULL CHECK(action IN ('buy','sell')),
  units REAL NOT NULL,
  price_per_unit REAL NOT NULL,
  total_cost REAL NOT NULL,
  fees REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tfex_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  contract TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  contracts INTEGER NOT NULL,
  multiplier REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_date TEXT,
  exit_price REAL,
  commission REAL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS forex_trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK(direction IN ('long','short')),
  lots REAL NOT NULL,
  lot_size REAL NOT NULL,
  entry_price REAL NOT NULL,
  exit_date TEXT,
  exit_price REAL,
  commission REAL DEFAULT 0,
  currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
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

  // Always ensure latest tables exist — safe because all use IF NOT EXISTS
  ensureLatestTables(db)

  await persistDatabase(db, userId)
  return db
}

function ensureLatestTables(db: Database): void {
  try {
    db.run(`CREATE TABLE IF NOT EXISTS trading_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL, asset_name TEXT NOT NULL, currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
      action TEXT NOT NULL CHECK(action IN ('buy','sell')), units REAL NOT NULL,
      price_per_unit REAL NOT NULL, total_cost REAL NOT NULL, fees REAL DEFAULT 0,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS tfex_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL, contract TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('long','short')),
      contracts INTEGER NOT NULL, multiplier REAL NOT NULL, entry_price REAL NOT NULL,
      exit_date TEXT, exit_price REAL, commission REAL DEFAULT 0,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
    db.run(`CREATE TABLE IF NOT EXISTS forex_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL, pair TEXT NOT NULL,
      direction TEXT NOT NULL CHECK(direction IN ('long','short')),
      lots REAL NOT NULL, lot_size REAL NOT NULL, entry_price REAL NOT NULL,
      exit_date TEXT, exit_price REAL, commission REAL DEFAULT 0,
      currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`)
    db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','${CURRENT_DB_VERSION}')`)
  } catch {
    // Should never fail — CREATE TABLE IF NOT EXISTS is always safe
  }
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
          action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','interest','deposit','withdraw')),
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

    if (version < 4) {
      db.run(`
        CREATE TABLE IF NOT EXISTS trading_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          action TEXT NOT NULL CHECK(action IN ('buy','sell')),
          units REAL NOT NULL,
          price_per_unit REAL NOT NULL,
          total_cost REAL NOT NULL,
          fees REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','4')`)
    }

    if (version < 5) {
      db.run(`
        CREATE TABLE IF NOT EXISTS tfex_trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_date TEXT NOT NULL,
          contract TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('long','short')),
          contracts INTEGER NOT NULL,
          multiplier REAL NOT NULL,
          entry_price REAL NOT NULL,
          exit_date TEXT,
          exit_price REAL,
          commission REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`
        CREATE TABLE IF NOT EXISTS forex_trades (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entry_date TEXT NOT NULL,
          pair TEXT NOT NULL,
          direction TEXT NOT NULL CHECK(direction IN ('long','short')),
          lots REAL NOT NULL,
          lot_size REAL NOT NULL,
          entry_price REAL NOT NULL,
          exit_date TEXT,
          exit_price REAL,
          commission REAL DEFAULT 0,
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','5')`)
    }

    if (version < 6) {
      db.run(`
        CREATE TABLE transactions_v6 (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          asset_name TEXT NOT NULL,
          asset_type TEXT NOT NULL CHECK(asset_type IN ('stock','crypto','fund','gold','bond','savings','cash')),
          currency TEXT NOT NULL CHECK(currency IN ('THB','USD')),
          action TEXT NOT NULL CHECK(action IN ('buy','sell','dividend','interest','deposit','withdraw')),
          units REAL NOT NULL,
          price_per_unit REAL NOT NULL,
          total_cost REAL NOT NULL,
          fees REAL DEFAULT 0,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `)
      db.run(`INSERT INTO transactions_v6 SELECT * FROM transactions`)
      db.run(`DROP TABLE transactions`)
      db.run(`ALTER TABLE transactions_v6 RENAME TO transactions`)
      db.run(`INSERT OR REPLACE INTO settings (key,value) VALUES ('db_version','6')`)
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

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false

  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i]! ^ b[i]!
  }
  return diff === 0
}

async function deriveEncryptionKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password)
  const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveKey'])

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

async function hashDatabasePassword(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const passwordBytes = new TextEncoder().encode(password)
  const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    256
  )
  return new Uint8Array(bits)
}

function getSettingValue(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  try {
    stmt.bind([key])
    return stmt.step() ? String((stmt.getAsObject() as { value: string }).value) : null
  } finally {
    stmt.free()
  }
}

export function getDatabasePasswordInfo(db: Database): DatabasePasswordInfo {
  const passwordHash = getSettingValue(db, DB_PASSWORD_HASH_KEY)
  if (!passwordHash) return { protected: false }

  return {
    protected: true,
    hint: getSettingValue(db, DB_PASSWORD_HINT_KEY) ?? '',
  }
}

export async function setDatabasePassword(
  db: Database,
  credentials: DatabaseExportCredentials
): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await hashDatabasePassword(credentials.password, salt, ENCRYPTION_ITERATIONS)
  const payload: DatabasePasswordHash = {
    salt: encodeBase64(salt),
    hash: encodeBase64(hash),
    iterations: ENCRYPTION_ITERATIONS,
  }

  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    DB_PASSWORD_HASH_KEY,
    JSON.stringify(payload),
  ])
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
    DB_PASSWORD_HINT_KEY,
    credentials.hint.trim(),
  ])
}

export async function verifyDatabasePassword(db: Database, password: string): Promise<boolean> {
  const rawHash = getSettingValue(db, DB_PASSWORD_HASH_KEY)
  if (!rawHash) return true

  try {
    const stored = JSON.parse(rawHash) as DatabasePasswordHash
    const salt = decodeBase64(stored.salt)
    const expected = decodeBase64(stored.hash)
    const actual = await hashDatabasePassword(password, salt, stored.iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function findByte(bytes: Uint8Array, value: number, fromIndex = 0): number {
  for (let i = fromIndex; i < bytes.length; i += 1) {
    if (bytes[i] === value) return i
  }
  return -1
}

function parseEncryptedBackup(bytes: Uint8Array): { header: EncryptedBackupHeader; payload: Uint8Array } | null {
  const decoder = new TextDecoder()
  const firstLineEnd = findByte(bytes, 10)
  if (firstLineEnd === -1) return null

  const magic = decoder.decode(bytes.slice(0, firstLineEnd))
  if (magic !== ENCRYPTED_DB_MAGIC) return null

  const headerLineEnd = findByte(bytes, 10, firstLineEnd + 1)
  if (headerLineEnd === -1) {
    throw new Error('Invalid encrypted database file: missing metadata')
  }

  const headerText = decoder.decode(bytes.slice(firstLineEnd + 1, headerLineEnd))
  const header = JSON.parse(headerText) as EncryptedBackupHeader

  if (!header.salt || !header.iv || !header.iterations) {
    throw new Error('Invalid encrypted database file: incomplete metadata')
  }

  return {
    header,
    payload: bytes.slice(headerLineEnd + 1),
  }
}

async function encryptDatabaseBytes(data: Uint8Array, credentials: DatabaseExportCredentials): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveEncryptionKey(credentials.password, salt, ENCRYPTION_ITERATIONS)
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data)
  const header: EncryptedBackupHeader = {
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    hint: credentials.hint.trim(),
    iterations: ENCRYPTION_ITERATIONS,
  }
  const prefix = new TextEncoder().encode(`${ENCRYPTED_DB_MAGIC}\n${JSON.stringify(header)}\n`)

  return new Blob([prefix, new Uint8Array(encrypted)], { type: 'application/octet-stream' })
}

async function decryptDatabaseBytes(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const parsed = parseEncryptedBackup(bytes)
  if (!parsed) return bytes

  try {
    const salt = decodeBase64(parsed.header.salt)
    const iv = decodeBase64(parsed.header.iv)
    const key = await deriveEncryptionKey(password, salt, parsed.header.iterations)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, parsed.payload)
    return new Uint8Array(decrypted)
  } catch {
    throw new Error('Invalid password. Please check the password and try again.')
  }
}

export async function getDatabaseBackupInfo(file: File): Promise<DatabaseBackupInfo> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const parsed = parseEncryptedBackup(bytes)
  return parsed ? { encrypted: true, hint: parsed.header.hint } : { encrypted: false }
}

export async function exportDatabase(db: Database, credentials?: DatabaseExportCredentials): Promise<void> {
  if (credentials) {
    await setDatabasePassword(db, credentials)
    await persistDatabase(db)
  }

  const data = db.export()
  const blob = credentials
    ? await encryptDatabaseBytes(data, credentials)
    : new Blob([data], { type: 'application/x-sqlite3' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `fortuneflow-backup-${new Date().toISOString().slice(0, 10)}.db`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importDatabase(
  file: File,
  SQL: SqlJsStatic,
  password?: string
): Promise<Database> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const parsed = parseEncryptedBackup(bytes)

  if (parsed && !password) {
    throw new Error('This database backup is password protected.')
  }

  const databaseBytes = parsed ? await decryptDatabaseBytes(bytes, password ?? '') : bytes
  const db = new SQL.Database(databaseBytes)

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
