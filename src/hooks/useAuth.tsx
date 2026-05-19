import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import * as api from '../lib/api'

interface AuthCtx {
  user: api.AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
  updateUser: (user: api.AuthUser) => void
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<api.AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ff-token')
    const savedUser = localStorage.getItem('ff-user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
      } catch {
        localStorage.removeItem('ff-token')
        localStorage.removeItem('ff-user')
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password)
    localStorage.setItem('ff-token', res.token)
    localStorage.setItem('ff-user', JSON.stringify(res.user))
    setUser(res.user)
  }, [])

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    await api.register(email, password, displayName)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('ff-token')
    localStorage.removeItem('ff-user')
    setUser(null)
  }, [])

  const updateUser = useCallback((next: api.AuthUser) => {
    localStorage.setItem('ff-user', JSON.stringify(next))
    setUser(next)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}
