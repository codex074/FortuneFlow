import { useEffect, useState, useCallback } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useAuth } from '../hooks/useAuth'
import { useDatabase } from '../hooks/useDatabase'
import { RefreshCw, Database, User, LogOut, Plus, Trash2, Edit3, TrendingUp, X, KeyRound } from 'lucide-react'
import * as api from '../lib/api'
import { MonthlyPriceModal } from '../components/MonthlyPriceModal'
import type { Currency, PriceHistory, AssetType } from '../types'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS } from '../types'
import type { TargetAllocation } from '../lib/calc'

interface Benchmark {
  name: string
  currency: Currency
}

const ALL_ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'fund', 'gold', 'bond', 'savings', 'cash']

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

function parseTargetAllocation(raw: string | undefined): TargetAllocation {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null) return {}
    const out: TargetAllocation = {}
    for (const key of ALL_ASSET_TYPES) {
      const v = (parsed as Record<string, unknown>)[key]
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[key] = v
    }
    return out
  } catch {
    return {}
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
  const { user, logout, updateUser } = useAuth()
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

  const [targetInputs, setTargetInputs] = useState<Record<AssetType, string>>(
    () => Object.fromEntries(ALL_ASSET_TYPES.map((t) => [t, ''])) as Record<AssetType, string>
  )
  const [targetSaveMsg, setTargetSaveMsg] = useState<string | null>(null)

  const [profileOpen, setProfileOpen] = useState(false)
  const [displayNameInput, setDisplayNameInput] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null)

  const openProfile = useCallback(() => {
    setDisplayNameInput(user?.displayName ?? '')
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setProfileError(null)
    setProfileSuccess(null)
    setProfileOpen(true)
  }, [user])

  const closeProfile = useCallback(() => {
    setProfileOpen(false)
  }, [])

  const saveProfile = useCallback(async () => {
    setProfileError(null)
    setProfileSuccess(null)
    const nextName = displayNameInput.trim()
    if (!nextName) {
      setProfileError('Display name cannot be empty')
      return
    }
    const wantsPasswordChange = currentPassword.length > 0 || newPassword.length > 0 || confirmPassword.length > 0
    if (wantsPasswordChange) {
      if (newPassword.length < 6) {
        setProfileError('New password must be at least 6 characters')
        return
      }
      if (newPassword !== confirmPassword) {
        setProfileError('New password and confirmation do not match')
        return
      }
      if (!currentPassword) {
        setProfileError('Enter your current password to change it')
        return
      }
    }

    setProfileSaving(true)
    try {
      const nameChanged = nextName !== (user?.displayName ?? '')
      if (nameChanged) {
        const updated = await api.updateProfile(nextName)
        updateUser(updated)
      }
      if (wantsPasswordChange) {
        await api.changePassword(currentPassword, newPassword)
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
      const msg = nameChanged && wantsPasswordChange
        ? 'Profile and password updated'
        : wantsPasswordChange
          ? 'Password updated'
          : nameChanged
            ? 'Display name updated'
            : 'Nothing to update'
      setProfileSuccess(msg)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setProfileSaving(false)
    }
  }, [displayNameInput, currentPassword, newPassword, confirmPassword, user, updateUser])

  useEffect(() => {
    setRateInput(String(exchangeRate))
  }, [exchangeRate])

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAllPriceHistory()])
      .then(([settings, prices]) => {
        setBenchmarks(parseBenchmarks(settings.benchmarks))
        setAllPriceHistory(prices)
        const target = parseTargetAllocation(settings.target_allocation)
        setTargetInputs(
          Object.fromEntries(ALL_ASSET_TYPES.map((t) => [t, target[t] !== undefined ? String(target[t]) : ''])) as Record<AssetType, string>
        )
      })
      .catch(console.error)
  }, [version])

  const targetTotal = ALL_ASSET_TYPES.reduce((sum, t) => {
    const v = parseFloat(targetInputs[t])
    return sum + (Number.isFinite(v) && v > 0 ? v : 0)
  }, 0)

  const saveTargetAllocation = useCallback(async () => {
    const next: TargetAllocation = {}
    for (const t of ALL_ASSET_TYPES) {
      const v = parseFloat(targetInputs[t])
      if (Number.isFinite(v) && v > 0) next[t] = v
    }
    await api.setSetting('target_allocation', JSON.stringify(next))
    bump()
    setTargetSaveMsg('Saved')
    setTimeout(() => setTargetSaveMsg(null), 2000)
  }, [targetInputs, bump])

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
          <div className="account-actions">
            <button className="btn btn-primary" onClick={openProfile}>
              <Edit3 size={16} /> Edit Profile
            </button>
            <button className="btn btn-secondary" onClick={logout}>
              <LogOut size={16} /> Sign Out
            </button>
          </div>
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
          <h2 className="card-title">Target Allocation</h2>
          <p className="card-desc">
            Set your goal percentage per asset type. The dashboard will show how far each type drifts and how much to rebalance.
          </p>
          <div className="target-allocation-grid">
            {ALL_ASSET_TYPES.map((t) => (
              <label key={t} className="target-allocation-row">
                <span className="target-type-label">
                  <span className="legend-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[t] }} />
                  {ASSET_TYPE_LABELS[t]}
                </span>
                <div className="target-input-wrap">
                  <input
                    className="input input-sm"
                    type="number"
                    step="any"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={targetInputs[t]}
                    onChange={(e) => setTargetInputs((prev) => ({ ...prev, [t]: e.target.value }))}
                  />
                  <span className="target-input-suffix">%</span>
                </div>
              </label>
            ))}
          </div>
          <div className="target-allocation-footer">
            <span className={`target-total ${Math.abs(targetTotal - 100) < 0.01 ? 'text-success' : targetTotal > 100 ? 'text-error' : 'text-muted'}`}>
              Total: {targetTotal.toFixed(1)}%
              {Math.abs(targetTotal - 100) >= 0.01 && targetTotal > 0 && (
                <span> (should be 100%)</span>
              )}
            </span>
            <div className="target-actions">
              {targetSaveMsg && <span className="text-success">{targetSaveMsg}</span>}
              <button type="button" className="btn btn-primary" onClick={saveTargetAllocation}>Save</button>
            </div>
          </div>
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

      {profileOpen && (
        <div className="modal-backdrop" onClick={closeProfile}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Edit Profile</h2>
              <button className="btn-icon" onClick={closeProfile}><X size={20} /></button>
            </div>
            <form
              className="modal-body"
              onSubmit={(e) => { e.preventDefault(); saveProfile() }}
            >
              <div className="profile-section">
                <h3 className="profile-section-title"><User size={14} /> Display Name</h3>
                <input
                  className="input"
                  type="text"
                  value={displayNameInput}
                  onChange={(e) => setDisplayNameInput(e.target.value)}
                  placeholder="Your name"
                  maxLength={80}
                  required
                />
                <p className="profile-section-hint">Email: <strong>{user?.email}</strong> (cannot be changed)</p>
              </div>

              <div className="profile-section">
                <h3 className="profile-section-title"><KeyRound size={14} /> Change Password</h3>
                <p className="profile-section-hint">Leave blank to keep your current password.</p>
                <input
                  className="input"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  autoComplete="current-password"
                />
                <input
                  className="input"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 6 chars)"
                  autoComplete="new-password"
                />
                <input
                  className="input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  autoComplete="new-password"
                />
              </div>

              {profileError && <p className="text-error settings-message">{profileError}</p>}
              {profileSuccess && <p className="text-success settings-message">{profileSuccess}</p>}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeProfile} disabled={profileSaving}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={profileSaving}>
                  {profileSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
