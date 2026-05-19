import { useEffect, useState, useCallback } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useAuth } from '../hooks/useAuth'
import { useDatabase } from '../hooks/useDatabase'
import { RefreshCw, Database, User, LogOut, Plus, Trash2, Edit3, TrendingUp } from 'lucide-react'
import * as api from '../lib/api'
import { MonthlyPriceModal } from '../components/MonthlyPriceModal'
import type { Currency, PriceHistory } from '../types'

interface Benchmark {
  name: string
  currency: Currency
}

function parseBenchmarks(raw: string | undefined): Benchmark[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((b): b is Benchmark => typeof b === 'object' && b !== null && typeof (b as Benchmark).name === 'string' && ((b as Benchmark).currency === 'THB' || (b as Benchmark).currency === 'USD'))
      .map((b) => ({ name: b.name.trim(), currency: b.currency }))
      .filter((b) => b.name.length > 0)
  } catch {
    return []
  }
}

export function SettingsPage() {
  const {
    exchangeRate,
    exchangeRateSource,
    exchangeRateDate,
    exchangeRateUpdatedAt,
    exchangeRateLastError,
    setExchangeRate,
    refreshExchangeRate,
  } = useSettings()
  const { user, logout } = useAuth()
  const { version, bump } = useDatabase()
  const [rateInput, setRateInput] = useState(String(exchangeRate))
  const [saveMsg, setSaveMsg] = useState(false)
  const [refreshingRate, setRefreshingRate] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([])
  const [allPriceHistory, setAllPriceHistory] = useState<PriceHistory[]>([])
  const [newBenchmarkName, setNewBenchmarkName] = useState('')
  const [newBenchmarkCurrency, setNewBenchmarkCurrency] = useState<Currency>('THB')
  const [editingBenchmark, setEditingBenchmark] = useState<Benchmark | null>(null)

  useEffect(() => {
    setRateInput(String(exchangeRate))
  }, [exchangeRate])

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAllPriceHistory()])
      .then(([settings, prices]) => {
        setBenchmarks(parseBenchmarks(settings.benchmarks))
        setAllPriceHistory(prices)
      })
      .catch(console.error)
  }, [version])

  const persistBenchmarks = useCallback(async (next: Benchmark[]) => {
    setBenchmarks(next)
    await api.setSetting('benchmarks', JSON.stringify(next))
    bump()
  }, [bump])

  const addBenchmark = useCallback(async () => {
    const name = newBenchmarkName.trim()
    if (!name) return
    if (benchmarks.some((b) => b.name === name && b.currency === newBenchmarkCurrency)) {
      setNewBenchmarkName('')
      return
    }
    await persistBenchmarks([...benchmarks, { name, currency: newBenchmarkCurrency }])
    setNewBenchmarkName('')
  }, [benchmarks, newBenchmarkName, newBenchmarkCurrency, persistBenchmarks])

  const removeBenchmark = useCallback(async (name: string, currency: Currency) => {
    await persistBenchmarks(benchmarks.filter((b) => !(b.name === name && b.currency === currency)))
  }, [benchmarks, persistBenchmarks])

  const benchmarkHistory = useCallback((name: string, currency: Currency): PriceHistory[] => {
    return allPriceHistory.filter((p) => p.asset_name === name && p.currency === currency)
  }, [allPriceHistory])

  const benchmarkStartMonth = useCallback((name: string, currency: Currency): string => {
    const series = benchmarkHistory(name, currency)
    if (series.length > 0) {
      const earliest = series.reduce((min, p) => (p.price_date < min ? p.price_date : min), series[0]!.price_date)
      return earliest.slice(0, 7)
    }
    const d = new Date()
    d.setMonth(d.getMonth() - 11)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [benchmarkHistory])

  const handleSaveRate = () => {
    const rate = parseFloat(rateInput)
    if (!isNaN(rate) && rate > 0) {
      setExchangeRate(rate)
      setSaveMsg(true)
      setTimeout(() => setSaveMsg(false), 2000)
    }
  }

  const handleRefreshRate = async () => {
    setRefreshingRate(true)
    setRefreshMsg(null)
    try {
      const result = await refreshExchangeRate()
      setRefreshMsg(`Updated from ${result.source}`)
      setTimeout(() => setRefreshMsg(null), 3000)
    } catch (err) {
      setRefreshMsg(navigator.onLine ? String(err) : 'Offline. Using the last saved rate.')
    } finally {
      setRefreshingRate(false)
    }
  }

  const updatedAtLabel = exchangeRateUpdatedAt
    ? new Date(exchangeRateUpdatedAt).toLocaleString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-sections">
        <div className="card settings-card">
          <h2 className="card-title">Account</h2>
          <p className="card-desc">Your account information and session management.</p>
          <div className="account-info">
            <div className="account-avatar">
              <User size={24} />
            </div>
            <div className="account-details">
              <strong>{user?.displayName ?? 'User'}</strong>
              <span className="text-muted">{user?.email ?? ''}</span>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={logout} style={{ marginTop: 12 }}>
            <LogOut size={16} /> Sign Out
          </button>
        </div>

        <div className="card settings-card">
          <h2 className="card-title">Database</h2>
          <p className="card-desc">Your data is stored securely on Neon PostgreSQL cloud database.</p>
          <div className="database-status ok">
            <Database size={18} />
            <div>
              <strong>Cloud Database</strong>
              <p>All data is synced to Neon PostgreSQL and isolated to your account.</p>
            </div>
          </div>
        </div>

        <div className="card settings-card">
          <h2 className="card-title">Exchange Rate</h2>
          <p className="card-desc">Auto-updates USD/THB when online. If offline, FortuneFlow keeps using the last saved rate.</p>
          <div className="rate-input-row">
            <span>1 USD =</span>
            <input
              className="input"
              type="number"
              step="0.01"
              min="0"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              style={{ width: 120 }}
            />
            <span>THB</span>
            <button className="btn btn-primary" onClick={handleSaveRate}>Save</button>
            <button className="btn btn-secondary" onClick={handleRefreshRate} disabled={refreshingRate}>
              <RefreshCw size={16} className={refreshingRate ? 'spin-icon' : ''} /> Refresh
            </button>
            {saveMsg && <span className="text-success">Saved!</span>}
          </div>
          <div className="rate-meta">
            <span>Source: {exchangeRateSource}</span>
            {exchangeRateDate && <span>Rate date: {exchangeRateDate}</span>}
            {updatedAtLabel && <span>Last loaded: {updatedAtLabel}</span>}
          </div>
          {refreshMsg && (
            <p className={refreshMsg.includes('Updated') ? 'text-success settings-message' : 'text-error settings-message'}>
              {refreshMsg}
            </p>
          )}
          {exchangeRateLastError && (
            <p className="settings-message text-error">Last sync failed. Using saved rate.</p>
          )}
        </div>

        <div className="card settings-card">
          <h2 className="card-title">Benchmarks</h2>
          <p className="card-desc">
            Track indices like SET, S&amp;P 500 or Gold to compare against your portfolio. Add monthly prices via the editor.
          </p>

          <div className="benchmark-add-row">
            <input
              className="input"
              type="text"
              placeholder="Benchmark name (e.g. SET, S&P500)"
              value={newBenchmarkName}
              onChange={(e) => setNewBenchmarkName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addBenchmark()}
            />
            <select
              className="input select"
              value={newBenchmarkCurrency}
              onChange={(e) => setNewBenchmarkCurrency(e.target.value as Currency)}
            >
              <option value="THB">THB</option>
              <option value="USD">USD</option>
            </select>
            <button type="button" className="btn btn-primary" onClick={addBenchmark}>
              <Plus size={16} /> Add
            </button>
          </div>

          {benchmarks.length === 0 ? (
            <div className="benchmark-empty">
              <TrendingUp size={20} />
              <span>No benchmarks yet. Add one to start comparing your portfolio.</span>
            </div>
          ) : (
            <div className="benchmark-list">
              {benchmarks.map((b) => {
                const points = benchmarkHistory(b.name, b.currency).length
                return (
                  <div key={`${b.name}:${b.currency}`} className="benchmark-row">
                    <div className="benchmark-meta">
                      <strong>{b.name}</strong>
                      <span className="text-muted">{b.currency} · {points} price{points === 1 ? '' : 's'}</span>
                    </div>
                    <div className="benchmark-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingBenchmark(b)}>
                        <Edit3 size={14} /> Edit prices
                      </button>
                      <button
                        type="button"
                        className="btn-icon danger"
                        onClick={() => removeBenchmark(b.name, b.currency)}
                        title="Remove benchmark"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {editingBenchmark && (
        <MonthlyPriceModal
          assetName={editingBenchmark.name}
          currency={editingBenchmark.currency}
          startMonth={benchmarkStartMonth(editingBenchmark.name, editingBenchmark.currency)}
          existingHistory={benchmarkHistory(editingBenchmark.name, editingBenchmark.currency)}
          onClose={() => setEditingBenchmark(null)}
          onSaved={bump}
        />
      )}
    </div>
  )
}
