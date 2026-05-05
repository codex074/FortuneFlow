import { useEffect, useState, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useDatabase } from '../hooks/useDatabase'
import * as Q from '../lib/queries'
import { CURRENT_DB_VERSION, getDatabaseBackupInfo, type DatabaseBackupInfo } from '../lib/db'
import { Download, Upload, AlertTriangle, RefreshCw, Bell, Database, LockKeyhole } from 'lucide-react'

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
  const { db, version, doExport, doImport } = useDatabase()
  const [rateInput, setRateInput] = useState(String(exchangeRate))
  const [importConfirm, setImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInfo, setImportInfo] = useState<DatabaseBackupInfo | null>(null)
  const [importPassword, setImportPassword] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [exportPassword, setExportPassword] = useState('')
  const [exportConfirmPassword, setExportConfirmPassword] = useState('')
  const [exportHint, setExportHint] = useState('')
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImportFile(file)
      setImportConfirm(true)
      setImportInfo(null)
      setImportPassword('')
      setImportError(null)
      try {
        setImportInfo(await getDatabaseBackupInfo(file))
      } catch (err) {
        setImportError(String(err))
      } finally {
        e.target.value = ''
      }
    }
  }

  const handleImport = async () => {
    if (!importFile) return
    if (importInfo?.encrypted && !importPassword) {
      setImportError('Please enter the database password.')
      return
    }
    try {
      await doImport(importFile, importInfo?.encrypted ? importPassword : undefined)
      setImportConfirm(false)
      setImportFile(null)
      setImportInfo(null)
      setImportPassword('')
    } catch (err) {
      setImportError(String(err))
    }
  }

  const handleExport = async () => {
    setExportError(null)

    if (exportPassword.length < 4) {
      setExportError('Password must be at least 4 characters.')
      return
    }

    if (exportPassword !== exportConfirmPassword) {
      setExportError('Password confirmation does not match.')
      return
    }

    if (!exportHint.trim()) {
      setExportError('Please enter a password hint.')
      return
    }

    try {
      setExporting(true)
      await doExport({ password: exportPassword, hint: exportHint })
      const now = new Date().toISOString()
      localStorage.setItem(LAST_BACKUP_KEY, now)
      setLastBackupAt(now)
      setExportPassword('')
      setExportConfirmPassword('')
      setExportHint('')
    } catch (err) {
      setExportError(String(err))
    } finally {
      setExporting(false)
    }
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
  const dbVersionValue = Q.getSetting(db, 'db_version')
  const parsedDatabaseVersion = dbVersionValue ? parseInt(dbVersionValue, 10) : NaN
  const databaseVersion = Number.isFinite(parsedDatabaseVersion) ? parsedDatabaseVersion : null
  const databaseStatus = databaseVersion === null
    ? 'Unknown version'
    : databaseVersion === CURRENT_DB_VERSION
    ? 'Up to date'
    : databaseVersion < CURRENT_DB_VERSION
      ? 'Migration needed'
      : 'Newer than app'
  const databaseStatusClass = databaseVersion === CURRENT_DB_VERSION ? 'ok' : 'warning'
  const databaseStatusDetail = databaseVersion === null
    ? 'The app could not read db_version from settings. Export a backup before troubleshooting.'
    : databaseVersion === CURRENT_DB_VERSION
    ? 'Your local database schema matches this version of FortuneFlow.'
    : databaseVersion < CURRENT_DB_VERSION
      ? 'Restart the app or reload after backup to let pending migrations run.'
      : 'This database was created by a newer app version. Back up before making changes.'

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-sections">
        <div className="card settings-card">
          <h2 className="card-title">Database Status</h2>
          <p className="card-desc">Schema version and migration state for the local FortuneFlow database.</p>
          <div className={`database-status ${databaseStatusClass}`}>
            <Database size={18} />
            <div>
              <strong>{databaseStatus}</strong>
              <p>{databaseStatusDetail}</p>
            </div>
          </div>
          <div className="database-version-grid">
            <div className="database-version-item">
              <span>Database Version</span>
              <strong>{databaseVersion ?? 'Unknown'}</strong>
            </div>
            <div className="database-version-item">
              <span>App Schema Version</span>
              <strong>{CURRENT_DB_VERSION}</strong>
            </div>
            <div className="database-version-item">
              <span>Last Refresh</span>
              <strong>#{version}</strong>
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
              <p className="card-desc">Download an encrypted backup of all your data.</p>
              <div className="database-password-form">
                <label className="form-label">
                  Password
                  <input
                    className="input"
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="Set backup password"
                  />
                </label>
                <label className="form-label">
                  Confirm Password
                  <input
                    className="input"
                    type="password"
                    value={exportConfirmPassword}
                    onChange={(e) => setExportConfirmPassword(e.target.value)}
                    placeholder="Re-enter backup password"
                  />
                </label>
                <label className="form-label">
                  Password Hint
                  <input
                    className="input"
                    value={exportHint}
                    onChange={(e) => setExportHint(e.target.value)}
                    placeholder="A hint only you understand"
                  />
                </label>
              </div>
              {exportError && <p className="text-error settings-message">{exportError}</p>}
              <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
                <Download size={16} /> {exporting ? 'Encrypting...' : 'Export .db File'}
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
              {importInfo?.encrypted && (
                <div className="database-password-panel">
                  <LockKeyhole size={18} />
                  <div>
                    <strong>Password protected database</strong>
                    {importInfo.hint && <p>Hint: {importInfo.hint}</p>}
                    <input
                      className="input"
                      type="password"
                      value={importPassword}
                      onChange={(e) => setImportPassword(e.target.value)}
                      placeholder="Enter database password"
                    />
                  </div>
                </div>
              )}
              {importInfo && !importInfo.encrypted && (
                <p className="settings-message">This database does not have a password, so it can be imported directly.</p>
              )}
              {importError && <p className="text-error">{importError}</p>}
              <div className="modal-actions">
                <button className="btn btn-secondary" onClick={() => { setImportConfirm(false); setImportFile(null); setImportInfo(null); setImportPassword('') }}>Cancel</button>
                <button className="btn btn-danger" onClick={handleImport} disabled={!importInfo && !importError}>Confirm Import</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
