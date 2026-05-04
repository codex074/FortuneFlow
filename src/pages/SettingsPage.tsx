import { useEffect, useState, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useDatabase } from '../hooks/useDatabase'
import { Download, Upload, AlertTriangle, RefreshCw, Bell } from 'lucide-react'

const LAST_BACKUP_KEY = 'fortuneflow-last-backup-at'
const BACKUP_REMINDER_DAYS = 7

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
  const { doExport, doImport } = useDatabase()
  const [rateInput, setRateInput] = useState(String(exchangeRate))
  const [importConfirm, setImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState(false)
  const [refreshingRate, setRefreshingRate] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(LAST_BACKUP_KEY))
  const fileRef = useRef<HTMLInputElement>(null)

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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportConfirm(true)
      setImportError(null)
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    try {
      await doImport(importFile)
      setImportConfirm(false)
      setImportFile(null)
      window.location.reload()
    } catch (err) {
      setImportError(String(err))
    }
  }

  const handleExport = () => {
    doExport()
    const now = new Date().toISOString()
    localStorage.setItem(LAST_BACKUP_KEY, now)
    setLastBackupAt(now)
  }

  const daysSinceBackup = lastBackupAt
    ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / (24 * 60 * 60 * 1000))
    : null
  const shouldRemindBackup = daysSinceBackup === null || daysSinceBackup >= BACKUP_REMINDER_DAYS
  const lastBackupLabel = lastBackupAt
    ? new Date(lastBackupAt).toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-sections">
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
          <h2 className="card-title">Backup & Restore</h2>
          <p className="card-desc">Export your database to a file for backup, or import a previously exported file.</p>

          <div className={`backup-reminder ${shouldRemindBackup ? 'warning' : 'ok'}`}>
            <Bell size={18} />
            <div>
              <strong>{shouldRemindBackup ? 'Backup reminder' : 'Backup is up to date'}</strong>
              <p>
                {lastBackupLabel
                  ? `Last backup: ${lastBackupLabel}${daysSinceBackup !== null ? ` (${daysSinceBackup} days ago)` : ''}.`
                  : 'No backup has been recorded on this device yet.'}
              </p>
            </div>
          </div>

          <div className="backup-actions">
            <div className="backup-section">
              <h3>Export Database</h3>
              <p className="card-desc">Download a backup of all your data.</p>
              <button className="btn btn-secondary" onClick={handleExport}>
                <Download size={16} /> Export .db File
              </button>
            </div>

            <div className="backup-section">
              <h3>Import Database</h3>
              <p className="card-desc">Restore from a previously exported backup file. This will replace all current data.</p>
              <input ref={fileRef} type="file" accept=".db,.sqlite,.sqlite3" onChange={handleFileSelect} hidden />
              <button className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
                <Upload size={16} /> Import .db File
              </button>
            </div>
          </div>

          {importConfirm && (
            <div className="import-confirm">
              <div className="import-warning">
                <AlertTriangle size={20} />
                <div>
                  <strong>Warning:</strong> Importing will replace ALL current data with the backup file "{importFile?.name}". This cannot be undone.
                </div>
              </div>
              {importError && <p className="text-error">{importError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => { setImportConfirm(false); setImportFile(null) }}>Cancel</button>
                <button className="btn btn-danger" onClick={handleImport}>Confirm Import</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
