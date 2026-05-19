const DESKTOP_API_BASE = __FORTUNEFLOW_DESKTOP_API_BASE__

function getApiBase(): string {
  if (window.location.protocol === 'file:') {
    return DESKTOP_API_BASE
  }

  return '/api'
}

function getToken(): string | null {
  return localStorage.getItem('ff-token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> ?? {}),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const apiBase = getApiBase()
  if (!apiBase) {
    throw new Error('Desktop API URL is not configured. Set APP_URL or VITE_API_BASE_URL before building the Windows app.')
  }

  const res = await fetch(`${apiBase}${path}`, { ...options, headers })

  if (res.status === 401) {
    localStorage.removeItem('ff-token')
    localStorage.removeItem('ff-user')
    window.location.reload()
    throw new Error('Unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  return res.json()
}

// ── Auth ──

export interface AuthUser {
  id: number
  email: string
  displayName: string
}

interface AuthResponse {
  token: string
  user: AuthUser
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, password: string, displayName: string): Promise<{ message: string; pendingVerification: boolean }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, displayName }),
  })
}

export async function verifyEmail(token: string): Promise<{ message: string }> {
  return request(`/auth/verify-email/${token}`)
}

export async function resendVerification(email: string): Promise<{ message: string }> {
  return request('/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return request('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  })
}

export async function resetPassword(token: string, password: string): Promise<{ message: string }> {
  return request('/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  })
}

export async function getMe(): Promise<AuthUser> {
  return request('/auth/me')
}

export async function updateProfile(displayName: string): Promise<AuthUser> {
  return request('/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ displayName }),
  })
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return request('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  })
}

// ── Transactions ──

import type { Transaction, Asset, PriceHistory, TradingTransaction, TfexTrade, ForexTrade, AssetType, Currency } from '../types'

interface TransactionFilters {
  asset_type?: AssetType
  currency?: Currency
  search?: string
}

export async function getTransactions(filters?: TransactionFilters): Promise<Transaction[]> {
  const params = new URLSearchParams()
  if (filters?.asset_type) params.set('asset_type', filters.asset_type)
  if (filters?.currency) params.set('currency', filters.currency)
  if (filters?.search) params.set('search', filters.search)
  const qs = params.toString()
  return request(`/transactions${qs ? `?${qs}` : ''}`)
}

export async function getRecentTransactions(limit = 10): Promise<Transaction[]> {
  return request(`/transactions/recent?limit=${limit}`)
}

interface TransactionInput {
  date: string
  asset_name: string
  asset_type: AssetType
  currency: Currency
  action: string
  units: number
  price_per_unit: number
  fees: number
  notes: string
  total_cost_override?: number
}

export async function createTransaction(data: TransactionInput): Promise<void> {
  await request('/transactions', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTransaction(id: number, data: TransactionInput): Promise<void> {
  await request(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTransaction(id: number): Promise<void> {
  await request(`/transactions/${id}`, { method: 'DELETE' })
}

// ── Assets ──

export async function getAssets(): Promise<Asset[]> {
  return request('/assets')
}

export async function updateAssetPrice(name: string, price: number): Promise<void> {
  await request(`/assets/${encodeURIComponent(name)}/price`, {
    method: 'PUT',
    body: JSON.stringify({ price }),
  })
}

// ── Price History ──

export async function getPriceHistory(assetName: string, currency: Currency, limit = 5): Promise<PriceHistory[]> {
  return request(`/price-history?asset_name=${encodeURIComponent(assetName)}&currency=${currency}&limit=${limit}`)
}

export async function getAllPriceHistory(): Promise<PriceHistory[]> {
  return request('/price-history')
}

export async function upsertPriceHistory(data: {
  asset_name: string
  currency: Currency
  price_date: string
  price: number
  notes: string
}): Promise<void> {
  await request('/price-history', { method: 'POST', body: JSON.stringify(data) })
}

export async function deletePriceHistory(id: number): Promise<void> {
  await request(`/price-history/${id}`, { method: 'DELETE' })
}

// ── Market data ──

export interface MarketPricePoint {
  date: string
  close: number
}

export async function fetchYahooMonthly(symbol: string, startMonth?: string): Promise<{ symbol: string; source: string; points: MarketPricePoint[] }> {
  const params = new URLSearchParams({ symbol })
  if (startMonth) params.set('start', startMonth)
  return request(`/market/yahoo/monthly?${params.toString()}`)
}

// ── Trading Transactions ──

export async function getTradingTransactions(): Promise<TradingTransaction[]> {
  return request('/trading/transactions')
}

export async function createTradingTransaction(data: {
  date: string
  asset_name: string
  currency: Currency
  action: string
  units: number
  price_per_unit: number
  fees: number
  notes: string
}): Promise<void> {
  await request('/trading/transactions', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTradingTransaction(id: number, data: {
  date: string
  asset_name: string
  currency: Currency
  action: string
  units: number
  price_per_unit: number
  fees: number
  notes: string
}): Promise<void> {
  await request(`/trading/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTradingTransaction(id: number): Promise<void> {
  await request(`/trading/transactions/${id}`, { method: 'DELETE' })
}

// ── TFEX Trades ──

export async function getTfexTrades(): Promise<TfexTrade[]> {
  return request('/trading/tfex')
}

export async function createTfexTrade(data: {
  entry_date: string
  contract: string
  direction: string
  contracts: number
  multiplier: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  notes: string
}): Promise<void> {
  await request('/trading/tfex', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateTfexTrade(id: number, data: {
  entry_date: string
  contract: string
  direction: string
  contracts: number
  multiplier: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  notes: string
}): Promise<void> {
  await request(`/trading/tfex/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteTfexTrade(id: number): Promise<void> {
  await request(`/trading/tfex/${id}`, { method: 'DELETE' })
}

// ── Forex Trades ──

export async function getForexTrades(): Promise<ForexTrade[]> {
  return request('/trading/forex')
}

export async function createForexTrade(data: {
  entry_date: string
  pair: string
  direction: string
  lots: number
  lot_size: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  currency: Currency
  notes: string
}): Promise<void> {
  await request('/trading/forex', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateForexTrade(id: number, data: {
  entry_date: string
  pair: string
  direction: string
  lots: number
  lot_size: number
  entry_price: number
  exit_date: string
  exit_price: string
  commission: number
  currency: Currency
  notes: string
}): Promise<void> {
  await request(`/trading/forex/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteForexTrade(id: number): Promise<void> {
  await request(`/trading/forex/${id}`, { method: 'DELETE' })
}

// ── Settings ──

export async function getSettings(): Promise<Record<string, string>> {
  return request('/settings')
}

export async function setSetting(key: string, value: string): Promise<void> {
  await request(`/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export async function setSettingsBulk(entries: Record<string, string>): Promise<void> {
  await request('/settings', { method: 'PUT', body: JSON.stringify(entries) })
}
