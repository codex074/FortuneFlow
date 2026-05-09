import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface DatabaseCtx {
  version: number
  bump: () => void
}

const DatabaseContext = createContext<DatabaseCtx | null>(null)

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion((v) => v + 1), [])

  return (
    <DatabaseContext.Provider value={{ version, bump }}>
      {children}
    </DatabaseContext.Provider>
  )
}

export function useDatabase() {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be inside DatabaseProvider')
  return ctx
}
