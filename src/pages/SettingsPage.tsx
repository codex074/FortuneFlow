import { useEffect, useState } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useAuth } from '../hooks/useAuth'
import { RefreshCw, Database, User, LogOut } from 'lucide-react'

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
  const [rateInput, setRateInput] = useState(String(exchangeRate))
  const [saveMsg, setSaveMsg] = useState(false)
  const [refreshingRate, setRefreshingRate] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  useEffect(() => {
    setRateInput(String(exchangeRate))
  }, [exchangeRate])

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
      </div>
    </div>
  )
}
