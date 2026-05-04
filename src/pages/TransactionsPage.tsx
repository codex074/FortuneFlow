import { useState, useCallback, useMemo, useEffect } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate, todayISO } from '../lib/format'
import { computeAssetUnits, computeCashBalances, computeCashLedger, getCashAccountName } from '../lib/calc'
import * as Q from '../lib/queries'
import { searchAssetCatalog, type AssetCatalogItem } from '../lib/assetCatalog'
import { ASSET_TYPE_LABELS, type AssetType, type Currency, type Action, type Transaction } from '../types'
import { Plus, Pencil, Trash2, X, ArrowUpCircle, Wallet, Landmark, ArrowRightLeft, Search } from 'lucide-react'

const ASSET_TYPES: AssetType[] = ['stock', 'crypto', 'fund', 'gold', 'bond', 'savings']
const CURRENCIES: Currency[] = ['THB', 'USD']
const PAGE_SIZE = 10

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
  total_amount: string
}

interface CashFormData {
  date: string
  currency: Currency
  action: 'deposit' | 'withdraw'
  amount: string
  notes: string
}

interface ExchangeFormData {
  date: string
  fromCurrency: Currency
  fromAmount: string
  toCurrency: Currency
  toAmount: string
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
  total_amount: '',
}

const emptyCashForm: CashFormData = {
  date: todayISO(),
  currency: 'THB',
  action: 'deposit',
  amount: '',
  notes: '',
}

const emptyExchangeForm: ExchangeFormData = {
  date: todayISO(),
  fromCurrency: 'THB',
  fromAmount: '',
  toCurrency: 'USD',
  toAmount: '',
  notes: '',
}

function isFxEntry(notes: string | null): boolean {
  return !!notes?.startsWith('[FX]')
}

function isCashEditable(tx: Transaction): boolean {
  return tx.asset_type === 'cash' && (tx.action === 'deposit' || tx.action === 'withdraw')
}

function cashActionLabel(action: Action, assetName: string): string {
  if (action === 'deposit') return 'Deposit'
  if (action === 'withdraw') return 'Withdraw'
  if (action === 'buy') return `Buy ${assetName}`
  if (action === 'sell') return `Sell ${assetName}`
  if (action === 'dividend') return `Dividend ${assetName}`
  return assetName
}

export function TransactionsPage() {
  const { db, version, persist } = useDatabase()
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
  const [cashModalOpen, setCashModalOpen] = useState(false)
  const [cashEditingId, setCashEditingId] = useState<number | null>(null)
  const [cashForm, setCashForm] = useState<CashFormData>(emptyCashForm)
  const [cashDeleteConfirm, setCashDeleteConfirm] = useState<number | null>(null)
  const [cashCurrencyFilter, setCashCurrencyFilter] = useState<Currency | ''>('')
  const [exchangeModalOpen, setExchangeModalOpen] = useState(false)
  const [exchangeForm, setExchangeForm] = useState<ExchangeFormData>(emptyExchangeForm)
  const [transactionPage, setTransactionPage] = useState(1)
  const [cashPage, setCashPage] = useState(1)
  const [catalogItems, setCatalogItems] = useState<AssetCatalogItem[]>([])
  const [catalogLoading, setCatalogLoading] = useState(false)

  const allTransactions = useMemo(() => Q.getAllTransactions(db), [db, version])
  const tradableAssets = useMemo(
    () => Q.getAllAssets(db).filter((asset) => asset.type !== 'cash'),
    [db, version]
  )
  const transactionMap = useMemo(
    () => new Map(allTransactions.map((tx) => [tx.id, tx])),
    [allTransactions]
  )
  const modalBaseTransactions = useMemo(
    () => allTransactions.filter((tx) => tx.id !== editingId && tx.id !== cashEditingId),
    [allTransactions, editingId, cashEditingId]
  )
  const availableCash = useMemo(
    () => computeCashBalances(modalBaseTransactions),
    [modalBaseTransactions]
  )
  const visibleTransactions = useMemo(
    () => transactions.filter((tx) => tx.asset_type !== 'cash'),
    [transactions]
  )
  const cashLedger = useMemo(() => {
    const rows = computeCashLedger(allTransactions)
    if (!cashCurrencyFilter) return rows
    return rows.filter((row) => row.currency === cashCurrencyFilter)
  }, [allTransactions, cashCurrencyFilter])
  const transactionPageCount = Math.max(1, Math.ceil(visibleTransactions.length / PAGE_SIZE))
  const cashPageCount = Math.max(1, Math.ceil(cashLedger.length / PAGE_SIZE))
  const pagedTransactions = useMemo(() => {
    const start = (transactionPage - 1) * PAGE_SIZE
    return visibleTransactions.slice(start, start + PAGE_SIZE)
  }, [visibleTransactions, transactionPage])
  const pagedCashLedger = useMemo(() => {
    const start = (cashPage - 1) * PAGE_SIZE
    return cashLedger.slice(start, start + PAGE_SIZE)
  }, [cashLedger, cashPage])

  useEffect(() => {
    setTransactionPage(1)
  }, [filterType, filterCurrency, search])

  useEffect(() => {
    setCashPage(1)
  }, [cashCurrencyFilter])

  useEffect(() => {
    if (transactionPage > transactionPageCount) {
      setTransactionPage(transactionPageCount)
    }
  }, [transactionPage, transactionPageCount])

  useEffect(() => {
    if (cashPage > cashPageCount) {
      setCashPage(cashPageCount)
    }
  }, [cashPage, cashPageCount])

  useEffect(() => {
    if (!modalOpen) return

    let cancelled = false
    setCatalogLoading(true)

    const searchTimer = window.setTimeout(() => {
      searchAssetCatalog({
        query: form.asset_name,
        assetType: form.asset_type === 'crypto' || form.asset_type === 'gold' || form.asset_type === 'bond' || form.asset_type === 'savings'
          ? ''
          : form.asset_type,
        currency: form.asset_type === 'fund' ? 'THB' : '',
        limit: 80,
      })
        .then((items) => {
          if (!cancelled) setCatalogItems(items)
        })
        .catch(() => {
          if (!cancelled) setCatalogItems([])
        })
        .finally(() => {
          if (!cancelled) setCatalogLoading(false)
        })
    }, 250)

    return () => {
      cancelled = true
      window.clearTimeout(searchTimer)
    }
  }, [modalOpen, form.asset_name, form.asset_type, form.currency])

  const openAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setModalOpen(true)
  }

  const openCashAdd = (action: 'deposit' | 'withdraw') => {
    setCashForm({ ...emptyCashForm, action, currency: cashCurrencyFilter || 'THB' })
    setCashEditingId(null)
    setCashDeleteConfirm(null)
    setCashModalOpen(true)
  }

  const openEdit = (tx: Transaction) => {
    setForm({
      date: tx.date,
      asset_name: tx.asset_name,
      asset_type: tx.asset_type,
      currency: tx.currency,
      action: tx.action,
      units: tx.action === 'dividend' ? '' : String(tx.units),
      price_per_unit: tx.action === 'dividend' ? '' : String(tx.price_per_unit),
      fees: tx.action === 'dividend' ? '0' : String(tx.fees),
      notes: tx.notes ?? '',
      total_amount: tx.action === 'dividend' ? String(tx.total_cost) : '',
    })
    setEditingId(tx.id)
    setModalOpen(true)
  }

  const openCashEdit = (tx: Transaction) => {
    setCashForm({
      date: tx.date,
      currency: tx.currency,
      action: tx.action as 'deposit' | 'withdraw',
      amount: String(tx.total_cost),
      notes: tx.notes ?? '',
    })
    setCashEditingId(tx.id)
    setCashDeleteConfirm(null)
    setCashModalOpen(true)
  }

  const isDividend = form.action === 'dividend'
  const requestedUnits = parseFloat(form.units) || 0
  const totalCost = isDividend
    ? parseFloat(form.total_amount) || 0
    : requestedUnits * (parseFloat(form.price_per_unit) || 0) + (parseFloat(form.fees) || 0)
  const cashDelta = isDividend
    ? parseFloat(form.total_amount) || 0
    : form.action === 'sell'
      ? requestedUnits * (parseFloat(form.price_per_unit) || 0) - (parseFloat(form.fees) || 0)
      : -totalCost
  const projectedCash = availableCash[form.currency] + cashDelta
  const availableUnits = computeAssetUnits(
    modalBaseTransactions,
    form.asset_name.trim(),
    form.asset_type,
    form.currency
  )
  const isOverselling = form.action === 'sell' && requestedUnits > availableUnits + 0.0001
  const isCashShort = form.action === 'buy' && projectedCash < -0.0001
  const transactionValidationMessage = isOverselling
    ? `You only have ${availableUnits.toLocaleString('en-US', { maximumFractionDigits: 6 })} units available to sell.`
    : isCashShort
      ? `This buy would make ${form.currency} cash negative by ${formatCurrency(Math.abs(projectedCash), form.currency)}.`
      : null
  const canSaveTransaction = !transactionValidationMessage
  const cashAmount = parseFloat(cashForm.amount) || 0
  const cashProjectedBalance = cashForm.action === 'deposit'
    ? availableCash[cashForm.currency] + cashAmount
    : availableCash[cashForm.currency] - cashAmount
  const cashValidationMessage = cashForm.action === 'withdraw' && cashProjectedBalance < -0.0001
    ? `This withdrawal is ${formatCurrency(Math.abs(cashProjectedBalance), cashForm.currency)} above the available balance.`
    : null
  const canSaveCashEntry = !cashValidationMessage

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSaveTransaction) return

      if (form.action === 'dividend') {
        const amount = parseFloat(form.total_amount)
        if (!form.asset_name.trim() || isNaN(amount) || amount <= 0) return
        const data = {
          date: form.date,
          asset_name: form.asset_name.trim(),
          asset_type: form.asset_type,
          currency: form.currency,
          action: 'dividend' as Action,
          units: 1,
          price_per_unit: amount,
          fees: 0,
          notes: form.notes,
          total_cost_override: amount,
        }
        if (editingId !== null) update(editingId, data)
        else add(data)
      } else {
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
        if (editingId !== null) update(editingId, data)
        else add(data)
      }

      setModalOpen(false)
    },
    [form, editingId, add, update, canSaveTransaction]
  )

  const handleDelete = (id: number) => {
    remove(id)
    setDeleteConfirm(null)
  }

  const handleCashSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSaveCashEntry) return
    const amount = parseFloat(cashForm.amount)
    if (isNaN(amount) || amount <= 0) return

    const payload = {
      date: cashForm.date,
      asset_name: getCashAccountName(cashForm.currency),
      asset_type: 'cash' as const,
      currency: cashForm.currency,
      action: cashForm.action,
      units: amount,
      price_per_unit: 1,
      fees: 0,
      notes: cashForm.notes,
      total_cost_override: amount,
    }

    if (cashEditingId !== null) Q.updateTransaction(db, cashEditingId, payload)
    else Q.insertTransaction(db, payload)

    persist()
    setCashModalOpen(false)
  }

  const handleCashDelete = (id: number) => {
    Q.deleteTransaction(db, id)
    persist()
    setCashDeleteConfirm(null)
  }

  const openExchange = () => {
    setExchangeForm(emptyExchangeForm)
    setExchangeModalOpen(true)
  }

  const handleExchangeSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const fromAmt = parseFloat(exchangeForm.fromAmount)
    const toAmt = parseFloat(exchangeForm.toAmount)
    if (isNaN(fromAmt) || fromAmt <= 0 || isNaN(toAmt) || toAmt <= 0) return
    if (exchangeForm.fromCurrency === exchangeForm.toCurrency) return

    const fxNote = exchangeForm.notes
      ? `[FX] ${exchangeForm.notes}`
      : `[FX] ${exchangeForm.fromCurrency} → ${exchangeForm.toCurrency}`

    Q.insertTransaction(db, {
      date: exchangeForm.date,
      asset_name: getCashAccountName(exchangeForm.fromCurrency),
      asset_type: 'cash',
      currency: exchangeForm.fromCurrency,
      action: 'withdraw',
      units: fromAmt,
      price_per_unit: 1,
      fees: 0,
      notes: fxNote,
      total_cost_override: fromAmt,
    })

    Q.insertTransaction(db, {
      date: exchangeForm.date,
      asset_name: getCashAccountName(exchangeForm.toCurrency),
      asset_type: 'cash',
      currency: exchangeForm.toCurrency,
      action: 'deposit',
      units: toAmt,
      price_per_unit: 1,
      fees: 0,
      notes: fxNote,
      total_cost_override: toAmt,
    })

    persist()
    setExchangeModalOpen(false)
  }

  const exchangeFromBalance = availableCash[exchangeForm.fromCurrency]
  const exchangeFromAmt = parseFloat(exchangeForm.fromAmount) || 0
  const exchangeAfterBalance = exchangeFromBalance - exchangeFromAmt
  const exchangeValidationMessage =
    exchangeForm.fromCurrency === exchangeForm.toCurrency
      ? 'Source and destination currencies must be different.'
      : exchangeAfterBalance < -0.0001
        ? `This exchange is ${formatCurrency(Math.abs(exchangeAfterBalance), exchangeForm.fromCurrency)} above the available balance.`
        : null
  const canSaveExchange = !exchangeValidationMessage

  const setField = (field: keyof FormData, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'asset_name') {
        const matched = tradableAssets.find((asset) => asset.name.toLowerCase() === value.trim().toLowerCase())
        if (matched) {
          next.asset_name = matched.name
          next.asset_type = matched.type
          next.currency = matched.currency
        }
      }
      return next
    })
  }

  const selectedExistingAsset = tradableAssets.find(
    (asset) => asset.name === form.asset_name && asset.currency === form.currency && asset.type === form.asset_type
  )?.name ?? ''

  const handleExistingAssetChange = (assetName: string) => {
    if (!assetName) return
    const asset = tradableAssets.find((item) => item.name === assetName)
    if (!asset) return

    setForm((prev) => ({
      ...prev,
      asset_name: asset.name,
      asset_type: asset.type,
      currency: asset.currency,
    }))
  }

  const handleCatalogAssetSelect = (asset: AssetCatalogItem) => {
    setForm((prev) => ({
      ...prev,
      asset_name: asset.symbol,
      asset_type: asset.type,
      currency: asset.currency,
    }))
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Transactions</h1>
        <button className="btn btn-primary" onClick={openAdd}>
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      <div className="card cash-summary-card">
        <div className="cash-ledger-header">
          <div>
            <h2 className="card-title">Cash</h2>
            <p className="card-desc">Deposits, withdrawals, trades, and dividends that affect real cash balances.</p>
          </div>
          <div className="cash-page-actions">
            <button className="btn btn-secondary" onClick={() => openCashAdd('withdraw')}>
              <ArrowUpCircle size={16} /> Withdraw
            </button>
            <button className="btn btn-secondary" onClick={openExchange}>
              <ArrowRightLeft size={16} /> Exchange
            </button>
            <button className="btn btn-primary" onClick={() => openCashAdd('deposit')}>
              <Plus size={16} /> Deposit Cash
            </button>
          </div>
        </div>

        <div className="metric-grid cash-metric-grid">
          <div className="metric-card">
            <div className="metric-icon-wrap emerald"><Wallet size={18} /></div>
            <div className="metric-body">
              <div className="metric-label">Available Cash (THB)</div>
              <div className={`metric-value ${availableCash.THB < 0 ? 'error' : ''}`}>
                {formatCurrency(availableCash.THB, 'THB')}
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon-wrap sky"><Landmark size={18} /></div>
            <div className="metric-body">
              <div className="metric-label">Available Cash (USD)</div>
              <div className={`metric-value ${availableCash.USD < 0 ? 'error' : ''}`}>
                {formatCurrency(availableCash.USD, 'USD')}
              </div>
            </div>
          </div>
        </div>

        <div className="cash-ledger-header">
          <h3 className="card-title">Cash Ledger</h3>
          <select
            className="input select cash-currency-filter"
            value={cashCurrencyFilter}
            onChange={(e) => setCashCurrencyFilter(e.target.value as Currency | '')}
          >
            <option value="">All Currencies</option>
            {CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>

        {cashLedger.length > 0 ? (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Account</th>
                  <th>Source</th>
                  <th>Change</th>
                  <th>Balance After</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedCashLedger.map((row) => {
                  const sourceTx = transactionMap.get(row.id)
                  const editable = sourceTx ? isCashEditable(sourceTx) : false

                  const isFx = isFxEntry(row.notes)
                  const fxLabel = isFx ? row.notes!.replace('[FX] ', '') : null

                  return (
                    <tr key={`${row.id}-${row.currency}`}>
                      <td>{formatDate(row.date)}</td>
                      <td className="font-medium">{getCashAccountName(row.currency)}</td>
                      <td>
                        <div className="cash-source-cell">
                          {isFx
                            ? <span className="tx-action-badge exchange">EXCHANGE</span>
                            : <span className={`tx-action-badge ${row.action}`}>{row.action.toUpperCase()}</span>
                          }
                          <span>{isFx ? fxLabel : cashActionLabel(row.action, sourceTx?.asset_name ?? row.asset_name)}</span>
                        </div>
                      </td>
                      <td className={row.amount >= 0 ? 'text-success font-medium' : 'text-error font-medium'}>
                        {row.amount >= 0 ? '+' : '-'}{formatCurrency(Math.abs(row.amount), row.currency)}
                      </td>
                      <td className="font-medium">{formatCurrency(row.balance_after, row.currency)}</td>
                      <td>{isFx ? fxLabel : (row.notes ?? '—')}</td>
                      <td>
                        {editable ? (
                          <div className="row-actions">
                            <button className="btn-icon" onClick={() => sourceTx && openCashEdit(sourceTx)} title="Edit"><Pencil size={16} /></button>
                            {cashDeleteConfirm === row.id ? (
                              <>
                                <button className="btn-icon danger" onClick={() => handleCashDelete(row.id)} title="Confirm">Yes</button>
                                <button className="btn-icon" onClick={() => setCashDeleteConfirm(null)} title="Cancel">No</button>
                              </>
                            ) : (
                              <button className="btn-icon danger" onClick={() => setCashDeleteConfirm(row.id)} title="Delete"><Trash2 size={16} /></button>
                            )}
                          </div>
                        ) : (
                          <span className="cash-derived-badge">Auto</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">
            <p>No cash activity yet. Start with a deposit, then your trades will flow through this ledger automatically.</p>
          </div>
        )}

        {cashLedger.length > PAGE_SIZE && (
          <div className="pagination-bar">
            <span className="pagination-meta">Page {cashPage} of {cashPageCount}</span>
            <div className="pagination-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCashPage((page) => Math.max(1, page - 1))}
                disabled={cashPage === 1}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCashPage((page) => Math.min(cashPageCount, page + 1))}
                disabled={cashPage === cashPageCount}
              >
                Next
              </button>
            </div>
          </div>
        )}
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

      {visibleTransactions.length > 0 ? (
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
              {pagedTransactions.map((tx) => (
                <tr key={tx.id}>
                  <td>{formatDate(tx.date)}</td>
                  <td className="font-medium">{tx.asset_name}</td>
                  <td><span className="badge-tag">{ASSET_TYPE_LABELS[tx.asset_type]}</span></td>
                  <td><span className={`tx-action-badge ${tx.action}`}>{tx.action.toUpperCase()}</span></td>
                  <td>{tx.action === 'dividend' ? '—' : tx.units}</td>
                  <td>{tx.action === 'dividend' ? '—' : formatCurrency(tx.price_per_unit, tx.currency)}</td>
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

      {visibleTransactions.length > PAGE_SIZE && (
        <div className="pagination-bar">
          <span className="pagination-meta">Page {transactionPage} of {transactionPageCount}</span>
          <div className="pagination-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTransactionPage((page) => Math.max(1, page - 1))}
              disabled={transactionPage === 1}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setTransactionPage((page) => Math.min(transactionPageCount, page + 1))}
              disabled={transactionPage === transactionPageCount}
            >
              Next
            </button>
          </div>
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
                <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="form-label">Existing Asset</span>
                  <select className="input select" value={selectedExistingAsset} onChange={(e) => handleExistingAssetChange(e.target.value)}>
                    <option value="">Select an existing asset to autofill</option>
                    {tradableAssets.map((asset) => (
                      <option key={asset.name} value={asset.name}>
                        {asset.name} · {asset.currency} · {ASSET_TYPE_LABELS[asset.type]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Asset Name</span>
                  <input
                    className="input"
                    type="text"
                    list="transaction-asset-suggestions"
                    placeholder="e.g. AAPL, BTC, LTF..."
                    value={form.asset_name}
                    onChange={(e) => setField('asset_name', e.target.value)}
                    required
                  />
                  <datalist id="transaction-asset-suggestions">
                    {tradableAssets.map((asset) => (
                      <option key={asset.name} value={asset.name} />
                    ))}
                  </datalist>
                </label>
                <div className="asset-catalog-panel" style={{ gridColumn: '1 / -1' }}>
                  <div className="asset-catalog-header">
                    <div>
                      <span className="form-label">Asset Catalog</span>
                      <p className="asset-catalog-desc">US stocks, Thai stocks, and Thai mutual funds.</p>
                    </div>
                    <div className="asset-catalog-status">
                      <Search size={14} />
                      {catalogLoading ? 'Searching' : `${catalogItems.length} shown`}
                    </div>
                  </div>
                  {catalogItems.length > 0 ? (
                    <div className="asset-catalog-list">
                      {catalogItems.map((asset) => (
                        <button
                          key={`${asset.source}-${asset.symbol}-${asset.type}`}
                          type="button"
                          className="asset-catalog-item"
                          onClick={() => handleCatalogAssetSelect(asset)}
                        >
                          <span className="asset-catalog-symbol">{asset.symbol}</span>
                          <span className="asset-catalog-name">{asset.name}</span>
                          <span className="asset-catalog-meta">
                            {asset.exchange ?? asset.market} · {asset.currency} · {ASSET_TYPE_LABELS[asset.type]}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="asset-catalog-empty">
                      {catalogLoading ? 'Searching catalog...' : 'No catalog matches. You can still type a custom asset name.'}
                    </div>
                  )}
                </div>
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
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="form-label">Action</span>
                  <div className="toggle-group">
                    <button type="button" className={`toggle-btn ${form.action === 'buy' ? 'active buy' : ''}`} onClick={() => setField('action', 'buy')}>Buy</button>
                    <button type="button" className={`toggle-btn ${form.action === 'sell' ? 'active sell' : ''}`} onClick={() => setField('action', 'sell')}>Sell</button>
                    <button type="button" className={`toggle-btn ${form.action === 'dividend' ? 'active dividend' : ''}`} onClick={() => setField('action', 'dividend')}>Dividend</button>
                  </div>
                </div>

                {isDividend ? (
                  <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                    <span className="form-label">Dividend Amount</span>
                    <input className="input" type="number" step="any" min="0" placeholder="0.00" value={form.total_amount} onChange={(e) => setField('total_amount', e.target.value)} required />
                  </label>
                ) : (
                  <>
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
                  </>
                )}
              </div>

              <div className="total-preview">
                {isDividend ? 'Dividend Amount' : 'Total Cost'}: <strong>{formatCurrency(totalCost, form.currency)}</strong>
              </div>
              <div className="cash-balance-preview">
                Available Cash: <strong>{formatCurrency(availableCash[form.currency], form.currency)}</strong>
                {' · '}
                After Transaction: <strong className={projectedCash < 0 ? 'text-error' : ''}>{formatCurrency(projectedCash, form.currency)}</strong>
                {form.action === 'sell' && (
                  <>
                    {' · '}
                    Available Units: <strong className={isOverselling ? 'text-error' : ''}>{availableUnits.toLocaleString('en-US', { maximumFractionDigits: 6 })}</strong>
                  </>
                )}
              </div>
              {transactionValidationMessage && (
                <div className="validation-message">
                  {transactionValidationMessage}
                </div>
              )}

              <label className="form-field">
                <span className="form-label">Notes</span>
                <textarea className="input textarea" rows={2} placeholder="Optional notes..." value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
              </label>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!canSaveTransaction}>{editingId !== null ? 'Update' : 'Add'} Transaction</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cashModalOpen && (
        <div className="modal-backdrop" onClick={() => setCashModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{cashEditingId !== null ? 'Edit' : 'Add'} {cashForm.action === 'deposit' ? 'Deposit' : 'Withdraw'}</h2>
              <button className="btn-icon" onClick={() => setCashModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleCashSubmit} className="modal-body">
              <div className="form-grid">
                <label className="form-field">
                  <span className="form-label">Date</span>
                  <input className="input" type="date" value={cashForm.date} onChange={(e) => setCashForm((prev) => ({ ...prev, date: e.target.value }))} required />
                </label>
                <label className="form-field">
                  <span className="form-label">Currency</span>
                  <select className="input select" value={cashForm.currency} onChange={(e) => setCashForm((prev) => ({ ...prev, currency: e.target.value as Currency }))}>
                    {CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>{currency}</option>
                    ))}
                  </select>
                </label>
                <div className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="form-label">Action</span>
                  <div className="toggle-group">
                    <button type="button" className={`toggle-btn ${cashForm.action === 'deposit' ? 'active deposit' : ''}`} onClick={() => setCashForm((prev) => ({ ...prev, action: 'deposit' }))}>Deposit</button>
                    <button type="button" className={`toggle-btn ${cashForm.action === 'withdraw' ? 'active withdraw' : ''}`} onClick={() => setCashForm((prev) => ({ ...prev, action: 'withdraw' }))}>Withdraw</button>
                  </div>
                </div>
                <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                  <span className="form-label">Amount</span>
                  <input className="input" type="number" step="any" min="0" placeholder="0.00" value={cashForm.amount} onChange={(e) => setCashForm((prev) => ({ ...prev, amount: e.target.value }))} required />
                </label>
              </div>

              <div className="cash-balance-preview">
                Current Balance: <strong>{formatCurrency(availableCash[cashForm.currency], cashForm.currency)}</strong>
                {' · '}
                After Entry: <strong className={cashProjectedBalance < 0 ? 'text-error' : ''}>{formatCurrency(cashProjectedBalance, cashForm.currency)}</strong>
              </div>
              {cashValidationMessage && (
                <div className="validation-message">
                  {cashValidationMessage}
                </div>
              )}

              <label className="form-field">
                <span className="form-label">Notes</span>
                <textarea className="input textarea" rows={2} placeholder="Optional notes..." value={cashForm.notes} onChange={(e) => setCashForm((prev) => ({ ...prev, notes: e.target.value }))} />
              </label>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCashModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!canSaveCashEntry}>{cashEditingId !== null ? 'Update' : 'Save'} Cash Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {exchangeModalOpen && (
        <div className="modal-backdrop" onClick={() => setExchangeModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Currency Exchange</h2>
              <button className="btn-icon" onClick={() => setExchangeModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleExchangeSubmit} className="modal-body">
              <p className="card-desc" style={{ marginBottom: 18 }}>
                Enter the exact amount deducted from the source wallet and the exact amount received in the destination wallet. No rate is calculated automatically.
              </p>

              <div className="exchange-layout">
                <div className="exchange-side">
                  <div className="exchange-side-label">From (Deduct)</div>
                  <div className="form-field">
                    <span className="form-label">Currency</span>
                    <select
                      className="input select"
                      value={exchangeForm.fromCurrency}
                      onChange={(e) => setExchangeForm((prev) => ({ ...prev, fromCurrency: e.target.value as Currency }))}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Amount</span>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="0.00"
                      value={exchangeForm.fromAmount}
                      onChange={(e) => setExchangeForm((prev) => ({ ...prev, fromAmount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="exchange-balance-hint">
                    Available: <strong>{formatCurrency(availableCash[exchangeForm.fromCurrency], exchangeForm.fromCurrency)}</strong>
                  </div>
                </div>

                <div className="exchange-arrow">
                  <ArrowRightLeft size={22} />
                </div>

                <div className="exchange-side">
                  <div className="exchange-side-label">To (Receive)</div>
                  <div className="form-field">
                    <span className="form-label">Currency</span>
                    <select
                      className="input select"
                      value={exchangeForm.toCurrency}
                      onChange={(e) => setExchangeForm((prev) => ({ ...prev, toCurrency: e.target.value as Currency }))}
                    >
                      {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <span className="form-label">Amount</span>
                    <input
                      className="input"
                      type="number"
                      step="any"
                      min="0.01"
                      placeholder="0.00"
                      value={exchangeForm.toAmount}
                      onChange={(e) => setExchangeForm((prev) => ({ ...prev, toAmount: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="exchange-balance-hint">
                    Available: <strong>{formatCurrency(availableCash[exchangeForm.toCurrency], exchangeForm.toCurrency)}</strong>
                  </div>
                </div>
              </div>

              <div className="form-grid" style={{ marginTop: 14 }}>
                <label className="form-field">
                  <span className="form-label">Date</span>
                  <input
                    className="input"
                    type="date"
                    value={exchangeForm.date}
                    onChange={(e) => setExchangeForm((prev) => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </label>
                <label className="form-field">
                  <span className="form-label">Notes (optional)</span>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. Wise transfer"
                    value={exchangeForm.notes}
                    onChange={(e) => setExchangeForm((prev) => ({ ...prev, notes: e.target.value }))}
                  />
                </label>
              </div>

              {exchangeAfterBalance >= -0.0001 && exchangeFromAmt > 0 && (
                <div className="cash-balance-preview" style={{ marginTop: 14 }}>
                  After exchange: <strong className={exchangeAfterBalance < 0 ? 'text-error' : ''}>{formatCurrency(exchangeAfterBalance, exchangeForm.fromCurrency)}</strong>
                  {' → '}
                  <strong>{formatCurrency(availableCash[exchangeForm.toCurrency] + (parseFloat(exchangeForm.toAmount) || 0), exchangeForm.toCurrency)}</strong>
                </div>
              )}

              {exchangeValidationMessage && (
                <div className="validation-message">{exchangeValidationMessage}</div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setExchangeModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={!canSaveExchange}>
                  <ArrowRightLeft size={15} /> Confirm Exchange
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
