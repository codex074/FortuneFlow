import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Database } from 'sql.js'
import { initDatabase, persistDatabaseDebounced, exportDatabase, importDatabase, getSqlJs, setCurrentUserId } from '../lib/db'
import { fetchUsdThbRate } from '../lib/exchangeRate'
import * as Q from '../lib/queries'

interface DatabaseCtx {
  db: Database
  version: number
  persist: () => void
  bump: () => void
  doExport: () => void
  doImport: (file: File) => Promise<void>
}

const DatabaseContext = createContext<DatabaseCtx | null>(null)

export function DatabaseProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const [db, setDb] = useState<Database | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const bump = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    setCurrentUserId(userId)
    initDatabase(userId)
      .then(setDb)
      .catch((e) => setError(String(e)))
  }, [userId])

  useEffect(() => {
    if (!db || !navigator.onLine) return

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
  }, [db, bump])

  const persist = useCallback(() => {
    if (db) {
      persistDatabaseDebounced(db)
      bump()
    }
  }, [db, bump])

  const doExport = useCallback(() => {
    if (db) exportDatabase(db)
  }, [db])

  const doImport = useCallback(
    async (file: File) => {
      const SQL = await getSqlJs()
      const newDb = await importDatabase(file, SQL)
      setDb(newDb)
    },
    []
  )

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
