import { createContext, useContext, useEffect, useState, useCallback, type FormEvent, type ReactNode } from 'react'
import type { Database } from 'sql.js'
import {
  initDatabase,
  persistDatabaseDebounced,
  exportDatabase,
  importDatabase,
  getSqlJs,
  getDatabasePasswordInfo,
  verifyDatabasePassword,
  setCurrentUserId,
  type DatabaseExportCredentials,
  type DatabasePasswordInfo,
} from '../lib/db'
import { fetchUsdThbRate } from '../lib/exchangeRate'
import * as Q from '../lib/queries'

interface DatabaseCtx {
  db: Database
  version: number
  persist: () => void
  bump: () => void
  doExport: (credentials: DatabaseExportCredentials) => Promise<void>
  doImport: (file: File, password?: string) => Promise<void>
}

const DatabaseContext = createContext<DatabaseCtx | null>(null)

export function DatabaseProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const [db, setDb] = useState<Database | null>(null)
  const [passwordInfo, setPasswordInfo] = useState<DatabasePasswordInfo | null>(null)
  const [unlockPassword, setUnlockPassword] = useState('')
  const [unlockError, setUnlockError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    setCurrentUserId(userId)
    initDatabase(userId)
      .then((loadedDb) => {
        const info = getDatabasePasswordInfo(loadedDb)
        setPasswordInfo(info.protected ? info : null)
        setDb(loadedDb)
      })
      .catch((e) => setError(String(e)))
  }, [userId])

  useEffect(() => {
    if (!db || passwordInfo || !navigator.onLine) return

    let cancelled = false

    fetchUsdThbRate()
      .then((result) => {
        if (cancelled) return
        Q.setSetting(db, 'exchange_rate_thb_usd', String(result.rate))
        Q.setSetting(db, 'exchange_rate_source', result.source)
        Q.setSetting(db, 'exchange_rate_date', result.date)
        Q.setSetting(db, 'exchange_rate_updated_at', result.fetchedAt)
        Q.setSetting(db, 'exchange_rate_last_error', '')
        persistDatabaseDebounced(db)
        bump()
      })
      .catch((err) => {
        if (cancelled) return
        Q.setSetting(db, 'exchange_rate_last_error', String(err))
        persistDatabaseDebounced(db)
      })

    return () => {
      cancelled = true
    }
  }, [db, passwordInfo, bump])

  const persist = useCallback(() => {
    if (db) {
      persistDatabaseDebounced(db)
      bump()
    }
  }, [db, bump])

  const doExport = useCallback(async (credentials: DatabaseExportCredentials) => {
    if (!db) return
    await exportDatabase(db, credentials)
    bump()
  }, [db, bump])

  const doImport = useCallback(
    async (file: File, password?: string) => {
      const SQL = await getSqlJs()
      const newDb = await importDatabase(file, SQL, password)
      setPasswordInfo(null)
      setUnlockPassword('')
      setUnlockError(null)
      setDb(newDb)
      bump()
    },
    [bump]
  )

  const unlockDatabase = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!db) return

    const valid = await verifyDatabasePassword(db, unlockPassword)
    if (!valid) {
      setUnlockError('Invalid database password.')
      return
    }

    setPasswordInfo(null)
    setUnlockPassword('')
    setUnlockError(null)
  }, [db, unlockPassword])

  if (error) {
    return (
      <div className="loading-screen">
        <p className="error-text">Failed to load database: {error}</p>
      </div>
    )
  }

  if (!db) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading database...</p>
      </div>
    )
  }

  if (passwordInfo) {
    return (
      <div className="loading-screen">
        <form className="database-unlock-card" onSubmit={unlockDatabase}>
          <h1>Unlock Database</h1>
          <p>Enter the database password before viewing or editing this data.</p>
          {passwordInfo.hint && <div className="database-unlock-hint">Hint: {passwordInfo.hint}</div>}
          <input
            className="input"
            type="password"
            value={unlockPassword}
            onChange={(e) => setUnlockPassword(e.target.value)}
            placeholder="Database password"
            autoFocus
          />
          {unlockError && <p className="text-error">{unlockError}</p>}
          <button className="btn btn-primary" type="submit">Unlock</button>
        </form>
      </div>
    )
  }

  return (
    <DatabaseContext.Provider value={{ db, version, persist, bump, doExport, doImport }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be inside DatabaseProvider')
  return ctx
}
