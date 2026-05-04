import type { Database } from 'sql.js'
import type { Transaction, Asset, PriceHistory, AssetType, Currency, Action, TradingTransaction, TradingAction, TfexTrade, ForexTrade, TradeDirection } from '../types'

interface TransactionInput {
  date: string
  asset_name: string
  asset_type: AssetType
  currency: Currency
  action: Action
  units: number
  price_per_unit: number
  fees: number
  notes: string
  total_cost_override?: number
}

export function getAllTransactions(
  db: Database,
  filters?: { asset_type?: AssetType; currency?: Currency; search?: string }
): Transaction[] {
  let sql = 'SELECT * FROM transactions WHERE 1=1'
  const params: (string | number)[] = []

  if (filters?.asset_type) {
    sql += ' AND asset_type = ?'
    params.push(filters.asset_type)
  }
  if (filters?.currency) {
    sql += ' AND currency = ?'
    params.push(filters.currency)
  }
  if (filters?.search) {
    sql += ' AND asset_name LIKE ?'
    params.push(`%${filters.search}%`)
  }

  sql += ' ORDER BY date DESC, created_at DESC'

  const stmt = db.prepare(sql)
  stmt.bind(params)

  const results: Transaction[] = []
  while (stmt.step()) {
    const row = stmt.getAsObject() as unknown as Transaction
    results.push(row)
  }
  stmt.free()
  return results
}

export function getRecentTransactions(db: Database, limit: number = 10): Transaction[] {
  const stmt = db.prepare('SELECT * FROM transactions ORDER BY date DESC, created_at DESC LIMIT ?')
  stmt.bind([limit])

  const results: Transaction[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as Transaction)
  }
  stmt.free()
  return results
}

export function insertTransaction(db: Database, data: TransactionInput): void {
  const totalCost = data.total_cost_override ?? (data.units * data.price_per_unit + data.fees)

  db.run(
    `INSERT INTO transactions (date, asset_name, asset_type, currency, action, units, price_per_unit, total_cost, fees, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.date,
      data.asset_name,
      data.asset_type,
      data.currency,
      data.action,
      data.units,
      data.price_per_unit,
      totalCost,
      data.fees,
      data.notes || null,
    ]
  )

  db.run(
    `INSERT OR IGNORE INTO assets (name, type, currency) VALUES (?, ?, ?)`,
    [data.asset_name, data.asset_type, data.currency]
  )
}

export function updateTransaction(db: Database, id: number, data: TransactionInput): void {
  const totalCost = data.total_cost_override ?? (data.units * data.price_per_unit + data.fees)

  db.run(
    `UPDATE transactions SET date=?, asset_name=?, asset_type=?, currency=?, action=?, units=?, price_per_unit=?, total_cost=?, fees=?, notes=?
     WHERE id=?`,
    [
      data.date,
      data.asset_name,
      data.asset_type,
      data.currency,
      data.action,
      data.units,
      data.price_per_unit,
      totalCost,
      data.fees,
      data.notes || null,
      id,
    ]
  )

  db.run(
    `INSERT OR IGNORE INTO assets (name, type, currency) VALUES (?, ?, ?)`,
    [data.asset_name, data.asset_type, data.currency]
  )
}

export function deleteTransaction(db: Database, id: number): void {
  db.run('DELETE FROM transactions WHERE id = ?', [id])
}

export function getAllAssets(db: Database): Asset[] {
  const stmt = db.prepare('SELECT * FROM assets ORDER BY type, name')
  const results: Asset[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as Asset)
  }
  stmt.free()
  return results
}

export function updateAssetPrice(db: Database, name: string, price: number): void {
  db.run(
    `UPDATE assets SET current_price = ?, last_updated = datetime('now') WHERE name = ?`,
    [price, name]
  )
}

export function getPriceHistory(
  db: Database,
  assetName: string,
  currency: Currency,
  limit: number = 5
): PriceHistory[] {
  const stmt = db.prepare(
    `SELECT * FROM price_history
     WHERE asset_name = ? AND currency = ?
     ORDER BY price_date DESC, created_at DESC
     LIMIT ?`
  )
  stmt.bind([assetName, currency, limit])

  const results: PriceHistory[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as PriceHistory)
  }
  stmt.free()
  return results
}

export function getAllPriceHistory(db: Database): PriceHistory[] {
  const stmt = db.prepare('SELECT * FROM price_history ORDER BY asset_name, currency, price_date')
  const results: PriceHistory[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as PriceHistory)
  }
  stmt.free()
  return results
}

export function upsertPriceHistory(
  db: Database,
  assetName: string,
  currency: Currency,
  priceDate: string,
  price: number,
  notes: string
): void {
  db.run(
    `INSERT INTO price_history (asset_name, currency, price_date, price, notes)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(asset_name, currency, price_date)
     DO UPDATE SET price=excluded.price, notes=excluded.notes`,
    [assetName, currency, priceDate, price, notes || null]
  )
  db.run(
    `UPDATE assets
     SET current_price = ?, last_updated = ?
     WHERE name = ? AND currency = ?
       AND (last_updated IS NULL OR date(last_updated) <= date(?))`,
    [price, priceDate, assetName, currency, priceDate]
  )
}

export function deletePriceHistory(db: Database, id: number): void {
  const targetStmt = db.prepare('SELECT asset_name, currency FROM price_history WHERE id = ?')
  targetStmt.bind([id])
  const target = targetStmt.step()
    ? targetStmt.getAsObject() as { asset_name: string; currency: Currency }
    : null
  targetStmt.free()

  db.run('DELETE FROM price_history WHERE id = ?', [id])
  if (!target) return

  const latestStmt = db.prepare(
    `SELECT price, price_date FROM price_history
     WHERE asset_name = ? AND currency = ?
     ORDER BY price_date DESC, created_at DESC
     LIMIT 1`
  )
  latestStmt.bind([target.asset_name, target.currency])
  if (latestStmt.step()) {
    const latest = latestStmt.getAsObject() as { price: number; price_date: string }
    db.run(
      `UPDATE assets SET current_price = ?, last_updated = ? WHERE name = ? AND currency = ?`,
      [latest.price, latest.price_date, target.asset_name, target.currency]
    )
  } else {
    db.run(
      `UPDATE assets SET current_price = NULL, last_updated = NULL WHERE name = ? AND currency = ?`,
      [target.asset_name, target.currency]
    )
  }
  latestStmt.free()
}

// ── Trading Record ──────────────────────────────────────────────────

interface TradingTransactionInput {
  date: string
  asset_name: string
  currency: Currency
  action: TradingAction
  units: number
  price_per_unit: number
  fees: number
  notes: string
}

export function getAllTradingTransactions(db: Database): TradingTransaction[] {
  const stmt = db.prepare('SELECT * FROM trading_transactions ORDER BY date DESC, created_at DESC')
  const results: TradingTransaction[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject() as unknown as TradingTransaction)
  }
  stmt.free()
  return results
}

export function insertTradingTransaction(db: Database, data: TradingTransactionInput): void {
  const totalCost = data.units * data.price_per_unit + data.fees
  db.run(
    `INSERT INTO trading_transactions (date, asset_name, currency, action, units, price_per_unit, total_cost, fees, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.date, data.asset_name, data.currency, data.action, data.units, data.price_per_unit, totalCost, data.fees, data.notes || null]
  )
}

export function updateTradingTransaction(db: Database, id: number, data: TradingTransactionInput): void {
  const totalCost = data.units * data.price_per_unit + data.fees
  db.run(
    `UPDATE trading_transactions SET date=?, asset_name=?, currency=?, action=?, units=?, price_per_unit=?, total_cost=?, fees=?, notes=?
     WHERE id=?`,
    [data.date, data.asset_name, data.currency, data.action, data.units, data.price_per_unit, totalCost, data.fees, data.notes || null, id]
  )
}

export function deleteTradingTransaction(db: Database, id: number): void {
  db.run('DELETE FROM trading_transactions WHERE id = ?', [id])
}

// ── TFEX Trades ─────────────────────────────────────────────────────

interface TfexTradeInput {
  entry_date: string
  contract: string
  direction: TradeDirection
  contracts: number
  multiplier: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  notes: string
}

export function getAllTfexTrades(db: Database): TfexTrade[] {
  const stmt = db.prepare('SELECT * FROM tfex_trades ORDER BY entry_date DESC, created_at DESC')
  const results: TfexTrade[] = []
  while (stmt.step()) results.push(stmt.getAsObject() as unknown as TfexTrade)
  stmt.free()
  return results
}

export function insertTfexTrade(db: Database, d: TfexTradeInput): void {
  db.run(
    `INSERT INTO tfex_trades (entry_date, contract, direction, contracts, multiplier, entry_price, exit_date, exit_price, commission, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.entry_date, d.contract, d.direction, d.contracts, d.multiplier, d.entry_price,
     d.exit_date || null, d.exit_price !== '' ? parseFloat(d.exit_price) : null, d.commission, d.notes || null]
  )
}

export function updateTfexTrade(db: Database, id: number, d: TfexTradeInput): void {
  db.run(
    `UPDATE tfex_trades SET entry_date=?, contract=?, direction=?, contracts=?, multiplier=?, entry_price=?,
     exit_date=?, exit_price=?, commission=?, notes=? WHERE id=?`,
    [d.entry_date, d.contract, d.direction, d.contracts, d.multiplier, d.entry_price,
     d.exit_date || null, d.exit_price !== '' ? parseFloat(d.exit_price) : null, d.commission, d.notes || null, id]
  )
}

export function deleteTfexTrade(db: Database, id: number): void {
  db.run('DELETE FROM tfex_trades WHERE id = ?', [id])
}

// ── FOREX Trades ─────────────────────────────────────────────────────

interface ForexTradeInput {
  entry_date: string
  pair: string
  direction: TradeDirection
  lots: number
  lot_size: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  currency: Currency
  notes: string
}

export function getAllForexTrades(db: Database): ForexTrade[] {
  const stmt = db.prepare('SELECT * FROM forex_trades ORDER BY entry_date DESC, created_at DESC')
  const results: ForexTrade[] = []
  while (stmt.step()) results.push(stmt.getAsObject() as unknown as ForexTrade)
  stmt.free()
  return results
}

export function insertForexTrade(db: Database, d: ForexTradeInput): void {
  db.run(
    `INSERT INTO forex_trades (entry_date, pair, direction, lots, lot_size, entry_price, exit_date, exit_price, commission, currency, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.entry_date, d.pair, d.direction, d.lots, d.lot_size, d.entry_price,
     d.exit_date || null, d.exit_price !== '' ? parseFloat(d.exit_price) : null, d.commission, d.currency, d.notes || null]
  )
}

export function updateForexTrade(db: Database, id: number, d: ForexTradeInput): void {
  db.run(
    `UPDATE forex_trades SET entry_date=?, pair=?, direction=?, lots=?, lot_size=?, entry_price=?,
     exit_date=?, exit_price=?, commission=?, currency=?, notes=? WHERE id=?`,
    [d.entry_date, d.pair, d.direction, d.lots, d.lot_size, d.entry_price,
     d.exit_date || null, d.exit_price !== '' ? parseFloat(d.exit_price) : null, d.commission, d.currency, d.notes || null, id]
  )
}

export function deleteForexTrade(db: Database, id: number): void {
  db.run('DELETE FROM forex_trades WHERE id = ?', [id])
}

export function getSetting(db: Database, key: string): string | null {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  stmt.bind([key])
  const result = stmt.step() ? (stmt.getAsObject() as { value: string }).value : null
  stmt.free()
  return result
}

export function setSetting(db: Database, key: string, value: string): void {
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value])
}
