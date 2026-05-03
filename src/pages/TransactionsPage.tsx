import { useState, useCallback } from 'react'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate, todayISO } from '../lib/format'
import { ASSET_TYPE_LABELS, type AssetType, type Currency, type Action, type Transaction } from '../types'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

const ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'fund', 'gold', 'bond', 'savings']
const CURRENCIES: Currency[] = ['THB', 'USD']

interface FormData {
  date: string
  asset_name: string
  asset_type: AssetType
  currency: Currency
  action: Action
  units: string
  price_per_unit: string
  fees: string
  notes: string
}

const emptyForm: FormData = {
  date: todayISO(),
  asset_name: '',
  asset_type: 'stock',
  currency: 'THB',
  action: 'buy',
  units: '',
  price_per_unit: '',
  fees: '0',
  notes: '',
}

export function TransactionsPage() {
  const [filterType, setFilterType] = useState<AssetType | ''>('')
  const [filterCurrency, setFilterCurrency] = useState<Currency | ''>('')
  const [search, setSearch] = useState('')

  const { transactions, add, update, remove } = useTransactions({
    asset_type: filterType || undefined,
    currency: filterCurrency || undefined,
    search: search || undefined,
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  const openAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setForm({
      date: tx.date,
      asset_name: tx.asset_name,
      asset_type: tx.asset_type,
      currency: tx.currency,
      action: tx.action,
      units: String(tx.units),
      price_per_unit: String(tx.price_per_unit),
      fees: String(tx.fees),
      notes: tx.notes ?? '',
    })
    setEditingId(tx.id)
    setModalOpen(true)
  }

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const data = {
        date: form.date,
        asset_name: form.asset_name.trim(),
        asset_type: form.asset_type,
        currency: form.currency,
        action: form.action,
        units: parseFloat(form.units),
        price_per_unit: parseFloat(form.price_per_unit),
        fees: parseFloat(form.fees) || 0,
        notes: form.notes,
      }
      if (!data.asset_name || isNaN(data.units) || isNaN(data.price_per_unit)) return

      if (editingId !== null) {
        update(editingId, data)
      } else {
        add(data)
      }
      setModalOpen(false)
    },
    [form, editingId, add, update]
  )

  const handleDelete = (id: number) => {
    remove(id)
    setDeleteConfirm(null)
  }

  const setField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const totalCost = (parseFloat(form.units) || 0) * (parseFloat(form.price_per_unit) || 0) + (parseFloat(form.fees) || 0)

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      <div className="filter-row">
        <input
          className="input"
          type="text"
          placeholder="Search asset name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input select" value={filterType} onChange={(e) => setFilterType(e.target.value as AssetType | '')}>
          <option value="">All Types</option>
          {ASSET_TYPES.map((t) => (
            <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <select className="input select" value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value as Currency | '')}>
          <option value="">All Currencies</option>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {transactions.length > 0 ? (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Asset</th>
                <th>Type</th>
                <th>Action</th>
                <th>Units</th>
                <th>Price/Unit</th>
                <th>Total</th>
                <th>Currency</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td className="font-medium">{tx.asset_name}</td>
                  <td><span className="badge-tag">{ASSET_TYPE_LABELS[tx.asset_type]}</span></td>
                  <td><span className={`tx-action-badge ${tx.action}`}>{tx.action.toUpperCase()}</span></td>
                  <td>{tx.units}</td>
                  <td>{formatCurrency(tx.price_per_unit, tx.currency)}</td>
                  <td className="font-medium">{formatCurrency(tx.total_cost, tx.currency)}</td>
                  <td>{tx.currency}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-icon" onClick={() => openEdit(tx)} title="Edit"><Pencil size={16} /></button>
                      {deleteConfirm === tx.id ? (
                        <>
                          <button className="btn-icon danger" onClick={() => handleDelete(tx.id)} title="Confirm">Yes</button>
                          <button className="btn-icon" onClick={() => setDeleteConfirm(null)} title="Cancel">No</button>
                        </>
                      ) : (
                        <button className="btn-icon danger" onClick={() => setDeleteConfirm(tx.id)} title="Delete"><Trash2 size={16} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state card">
          <p>No transactions found. Click "Add Transaction" to get started.</p>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingId !== null ? 'Edit' : 'Add'} Transaction</h2>
              <button className="btn-icon" onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="modal-body">
              <div className="form-grid">
                <label className="form-field">
                  <span className="form-label">Date</span>
                  <input className="input" type="date" value={form.date} onChange={(e) => setField('date', e.target.value)} required />
                </label>
                <label className="form-field">
                  <span className="form-label">Asset Name</span>
                  <input className="input" type="text" placeholder="e.g. AAPL, BTC, LTF..." value={form.asset_name} onChange={(e) => setField('asset_name', e.target.value)} required />
                </label>
                <label className="form-field">
                  <span className="form-label">Asset Type</span>
                  <select className="input select" value={form.asset_type} onChange={(e) => setField('asset_type', e.target.value)}>
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Currency</span>
                  <select className="input select" value={form.currency} onChange={(e) => setField('currency', e.target.value)}>
                    {CURRENCIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <div className="form-field">
                  <span className="form-label">Action</span>
                  <div className="toggle-group">
                    <button type="button" className={`toggle-btn ${form.action === 'buy' ? 'active buy' : ''}`} onClick={() => setField('action', 'buy')}>Buy</button>
                    <button type="button" className={`toggle-btn ${form.action === 'sell' ? 'active sell' : ''}`} onClick={() => setField('action', 'sell')}>Sell</button>
                  </div>
                </div>
                <label className="form-field">
                  <span className="form-label">Units</span>
                  <input className="input" type="number" step="any" min="0" placeholder="0" value={form.units} onChange={(e) => setField('units', e.target.value)} required />
                </label>
                <label className="form-field">
                  <span className="form-label">Price per Unit</span>
                  <input className="input" type="number" step="any" min="0" placeholder="0" value={form.price_per_unit} onChange={(e) => setField('price_per_unit', e.target.value)} required />
                </label>
                <label className="form-field">
                  <span className="form-label">Fees</span>
                  <input className="input" type="number" step="any" min="0" placeholder="0" value={form.fees} onChange={(e) => setField('fees', e.target.value)} />
                </label>
              </div>
              <div className="total-preview">
                Total Cost: <strong>{formatCurrency(totalCost, form.currency)}</strong>
              </div>
              <label className="form-field">
                <span className="form-label">Notes</span>
                <textarea className="input textarea" rows={2} placeholder="Optional notes..." value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editingId !== null ? 'Update' : 'Add'} Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
