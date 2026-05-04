import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { type UserRecord, getSession, saveSession, clearSession, login, register } from '../lib/auth'

interface AuthCtx {
  user: UserRecord | null
  loading: boolean
  doLogin: (username: string, password: string) => Promise<void>
  doRegister: (username: string, password: string) => Promise<void>
  doLogout: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRecord | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSession()
      .then(setUser)
      .finally(() => setLoading(false))
  }, [])

  const doLogin = useCallback(async (username: string, password: string) => {
    const u = await login(username, password)
    await saveSession(u.id)
    setUser(u)
  }, [])

  const doRegister = useCallback(async (username: string, password: string) => {
    const u = await register(username, password)
    await saveSession(u.id)
    setUser(u)
  }, [])

  const doLogout = useCallback(async () => {
    await clearSession()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, doLogin, doRegister, doLogout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
