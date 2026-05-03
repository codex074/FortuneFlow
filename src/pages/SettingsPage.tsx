import { useState, useRef } from 'react'
import { useSettings } from '../hooks/useSettings'
import { useDatabase } from '../hooks/useDatabase'
import { Download, Upload, AlertTriangle } from 'lucide-react'

export function SettingsPage() {
  const { exchangeRate, setExchangeRate } = useSettings()
  const { doExport, doImport } = useDatabase()
  const [rateInput, setRateInput] = useState(String(exchangeRate))
  const [importConfirm, setImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [saveMsg, setSaveMsg] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleSaveRate = () => {
    const rate = parseFloat(rateInput)
    if (!isNaN(rate) && rate > 0) {
      setExchangeRate(rate)
      setSaveMsg(true)
      setTimeout(() => setSaveMsg(false), 2000)
    }
  }

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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Settings</h1>
      </div>

      <div className="settings-sections">
        <div className="card settings-card">
          <h2 className="card-title">Exchange Rate</h2>
          <p className="card-desc">Set the THB/USD exchange rate for portfolio calculations.</p>
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
            {saveMsg && <span className="text-success">Saved!</span>}
          </div>
        </div>

        <div className="card settings-card">
          <h2 className="card-title">Backup & Restore</h2>
          <p className="card-desc">Export your database to a file for backup, or import a previously exported file.</p>

          <div className="backup-actions">
            <div className="backup-section">
              <h3>Export Database</h3>
              <p className="card-desc">Download a backup of all your data.</p>
              <button className="btn btn-secondary" onClick={doExport}>
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
