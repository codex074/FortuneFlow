import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import type { Database } from 'sql.js'
import { initDatabase, persistDatabaseDebounced, exportDatabase, importDatabase, getSqlJs } from '../lib/db'

interface DatabaseCtx {
  db: Database
  version: number
  persist: () => void
  bump: () => void
  doExport: () => void
  doImport: (file: File) => Promise<void>
}

const DatabaseContext = createContext<DatabaseCtx | null>(null)

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    initDatabase()
      .then(setDb)
      .catch((e) => setError(String(e)))
  }, [])

  const bump = useCallback(() => setVersion((v) => v + 1), [])

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
