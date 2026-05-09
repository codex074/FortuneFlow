import { useMemo, useState, useEffect } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as api from '../lib/api'
import { computeFifoTrades, computeTradingPositions } from '../lib/calc'
import { formatCurrency, formatDate, formatNumber, formatPct, todayISO } from '../lib/format'
import type { Currency, TradeDirection, TradingAction, TradingTransaction, TfexTrade, ForexTrade } from '../types'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, Minus, ShoppingBag, BookOpen } from 'lucide-react'

// ─── TFEX constants ──────────────────────────────────────────────────

const TFEX_INSTRUMENTS = [
  { value: 'S50',    label: 'S50 — SET50 Index',         multiplier: 200,   priceUnit: 'pts'        },
  { value: 'GF10',   label: 'GF10 — Gold (10 Baht wt)',  multiplier: 10,    priceUnit: 'THB/bt'     },
  { value: 'GDF',    label: 'GDF — Gold D (50g)',         multiplier: 50,    priceUnit: 'THB/g'      },
  { value: 'SLV',    label: 'SLV — Silver (500 oz)',      multiplier: 500,   priceUnit: 'USD/oz'     },
  { value: 'USDTHB', label: 'USDTHB — USD/THB Futures',  multiplier: 1000,  priceUnit: 'THB/USD'    },
  { value: 'CUSTOM', label: 'Custom',                     multiplier: 1,     priceUnit: 'units'      },
] as const

const TFEX_MONTH_CODES = [
  { month: 3,  code: 'H', name: 'Mar' },
  { month: 6,  code: 'M', name: 'Jun' },
  { month: 9,  code: 'U', name: 'Sep' },
  { month: 12, code: 'Z', name: 'Dec' },
]

function getUpcomingTfexMonths(): { value: string; label: string }[] {
  const today = new Date()
  const results: { value: string; label: string }[] = []
  for (let y = today.getFullYear(); y <= today.getFullYear() + 1; y++) {
    for (const q of TFEX_MONTH_CODES) {
      if (new Date(y, q.month - 1, 15) >= today) {
        const yy = String(y).slice(2)
        results.push({ value: `${q.code}${yy}`, label: `${q.name} ${y}` })
      }
    }
  }
  return results.slice(0, 8)
}

// ─── FOREX constants ─────────────────────────────────────────────────

const FOREX_PAIRS = [
  { value: 'XAUUSD', label: 'XAU/USD — Gold Spot',  lotSize: 100,    currency: 'USD' as Currency },
  { value: 'EURUSD', label: 'EUR/USD',               lotSize: 100000, currency: 'USD' as Currency },
  { value: 'GBPUSD', label: 'GBP/USD',               lotSize: 100000, currency: 'USD' as Currency },
  { value: 'USDJPY', label: 'USD/JPY',               lotSize: 100000, currency: 'USD' as Currency },
  { value: 'USDTHB', label: 'USD/THB',               lotSize: 100000, currency: 'THB' as Currency },
  { value: 'BTCUSD', label: 'BTC/USD',               lotSize: 1,      currency: 'USD' as Currency },
  { value: 'ETHUSD', label: 'ETH/USD',               lotSize: 1,      currency: 'USD' as Currency },
  { value: 'CUSTOM', label: 'Custom',                lotSize: 100000, currency: 'USD' as Currency },
]

// ─── P&L helpers ─────────────────────────────────────────────────────

function tfexPnl(t: TfexTrade): number | null {
  if (t.exit_price === null) return null
  const sign = t.direction === 'long' ? 1 : -1
  return (t.exit_price - t.entry_price) * t.contracts * t.multiplier * sign - t.commission
}

function forexPnl(t: ForexTrade): number | null {
  if (t.exit_price === null) return null
  const sign = t.direction === 'long' ? 1 : -1
  return (t.exit_price - t.entry_price) * t.lots * t.lot_size * sign - t.commission
}

function directionBadge(d: TradeDirection) {
  return <span className={`dir-badge dir-${d}`}>{d === 'long' ? '▲ Long' : '▼ Short'}</span>
}

function statusBadge(isOpen: boolean) {
  return <span className={`status-badge status-${isOpen ? 'open' : 'closed'}`}>{isOpen ? 'Open' : 'Closed'}</span>
}

function pnlCell(pnl: number | null, currency: Currency) {
  if (pnl === null) return <span className="text-muted">—</span>
  const cls = pnl > 0 ? 'text-success' : pnl < 0 ? 'text-error' : ''
  const Icon = pnl > 0 ? TrendingUp : pnl < 0 ? TrendingDown : Minus
  return (
    <span className={`pnl-cell ${cls}`}>
      <Icon size={12} />
      {formatCurrency(pnl, currency)}
    </span>
  )
}

// ─── Spot section ─────────────────────────────────────────────────────

interface SpotProps { version: number; bump: () => void; rate: number }

type SpotForm = { date: string; asset_name: string; currency: Currency; action: TradingAction; units: string; price_per_unit: string; fees: string; notes: string }
const emptySpotForm: SpotForm = { date: todayISO(), asset_name: '', currency: 'THB', action: 'buy', units: '', price_per_unit: '', fees: '0', notes: '' }

function SpotSection({ version, bump, rate }: SpotProps) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<SpotForm>(emptySpotForm)
  const [delId, setDelId] = useState<number | null>(null)
  const [tab, setTab] = useState<'trades' | 'positions' | 'log'>('trades')
  const [filterAsset, setFilterAsset] = useState('')
  const [filterCur, setFilterCur] = useState<Currency | 'all'>('all')

  const [allTxs, setAllTxs] = useState<TradingTransaction[]>([])
  useEffect(() => { api.getTradingTransactions().then(setAllTxs).catch(console.error) }, [version])

  const { trades, positions, totals } = useMemo(() => {
    const t = computeFifoTrades(allTxs)
    const p = computeTradingPositions(allTxs)
    let pnlTHB = 0, proceedsTHB = 0, costTHB = 0, wins = 0, losses = 0
    for (const tr of t) {
      const r = tr.currency === 'USD' ? rate : 1
      pnlTHB += tr.realized_pnl * r
      proceedsTHB += tr.proceeds * r
      costTHB += tr.cost_basis * r
      if (tr.realized_pnl > 0) wins++; else if (tr.realized_pnl < 0) losses++
    }
    return {
      trades: t, positions: p,
      totals: { pnlTHB, proceedsTHB, costTHB, wins, losses, count: t.length, openCount: p.length,
        winRate: t.length > 0 ? (wins / t.length) * 100 : null,
        pnlPct: costTHB > 0 ? (pnlTHB / costTHB) * 100 : null },
    }
  }, [allTxs, rate])

  const f = (arr: typeof trades) => arr.filter(t =>
    (filterCur === 'all' || t.currency === filterCur) &&
    (!filterAsset || t.asset_name.toLowerCase().includes(filterAsset.toLowerCase()))
  )
  const fp = positions.filter(p =>
    (filterCur === 'all' || p.currency === filterCur) &&
    (!filterAsset || p.asset_name.toLowerCase().includes(filterAsset.toLowerCase()))
  )
  const fl = allTxs.filter(tx =>
    (filterCur === 'all' || tx.currency === filterCur) &&
    (!filterAsset || tx.asset_name.toLowerCase().includes(filterAsset.toLowerCase()))
  )

  const sf = <K extends keyof SpotForm>(k: K, v: SpotForm[K]) => setForm(f => ({ ...f, [k]: v }))
  const amount = (() => {
    const u = parseFloat(form.units), p = parseFloat(form.price_per_unit), fee = parseFloat(form.fees) || 0
    if (!isNaN(u) && !isNaN(p)) return form.action === 'buy' ? u * p + fee : u * p - fee
    return null
  })()

  function openAdd() { setEditId(null); setForm({ ...emptySpotForm, date: todayISO() }); setModal(true) }
  function openEdit(tx: TradingTransaction) { setEditId(tx.id); setForm({ date: tx.date, asset_name: tx.asset_name, currency: tx.currency, action: tx.action, units: String(tx.units), price_per_unit: String(tx.price_per_unit), fees: String(tx.fees), notes: tx.notes ?? '' }); setModal(true) }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = { date: form.date, asset_name: form.asset_name.trim(), currency: form.currency, action: form.action, units: parseFloat(form.units), price_per_unit: parseFloat(form.price_per_unit), fees: parseFloat(form.fees) || 0, notes: form.notes }
    if (!data.asset_name || isNaN(data.units) || isNaN(data.price_per_unit)) return
    if (editId !== null) await api.updateTradingTransaction(editId, data); else await api.createTradingTransaction(data)
    bump(); setModal(false)
  }

  return (
    <>
      <div className="tr-section-header">
        <div className="stats-grid">
          {[
            { label: 'Closed Trades', value: String(totals.count), sub: `${totals.wins}W / ${totals.losses}L` },
            { label: 'Win Rate', value: totals.winRate !== null ? `${totals.winRate.toFixed(1)}%` : '--' },
            { label: 'Open Positions', value: String(totals.openCount) },
            { label: 'Total Proceeds', value: formatCurrency(totals.proceedsTHB, 'THB') },
          ].map(s => (
            <div key={s.label} className="stat-card card">
              <span className="stat-label">{s.label}</span>
              <strong className="stat-value">{s.value}</strong>
              {s.sub && <span className="stat-sub">{s.sub}</span>}
            </div>
          ))}
          <div className="stat-card card">
            <span className="stat-label">Realized P&amp;L (FIFO)</span>
            <strong className={`stat-value ${totals.pnlTHB >= 0 ? 'text-success' : 'text-error'}`}>{formatCurrency(totals.pnlTHB, 'THB')}</strong>
            <span className="stat-sub">{totals.pnlPct !== null ? formatPct(totals.pnlPct) : '--'}</span>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add Trade</button>
      </div>

      <div className="card">
        <div className="tr-toolbar">
          <div className="tr-tabs">
            {(['trades', 'positions', 'log'] as const).map(t => (
              <button key={t} className={`tr-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                {t === 'trades' ? <><TrendingUp size={13} /> Closed Trades</> : t === 'positions' ? <><ShoppingBag size={13} /> Open Positions</> : <><BookOpen size={13} /> Transaction Log</>}
              </button>
            ))}
          </div>
          <div className="table-filters">
            <input className="input input-sm" placeholder="Filter asset..." value={filterAsset} onChange={e => setFilterAsset(e.target.value)} />
            <select className="select select-sm" value={filterCur} onChange={e => setFilterCur(e.target.value as Currency | 'all')}>
              <option value="all">All Currencies</option><option value="THB">THB</option><option value="USD">USD</option>
            </select>
          </div>
        </div>

        {tab === 'trades' && (f(trades).length === 0 ? <p className="table-empty">No closed trades yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <th>Date</th><th>Asset</th><th className="text-right">Units</th><th className="text-right">Sell Price</th>
              <th className="text-right">Proceeds</th><th className="text-right">Cost Basis</th>
              <th className="text-right">P&amp;L (FIFO)</th><th className="text-right">Return</th><th className="text-right">Days</th>
            </tr></thead>
            <tbody>{f(trades).map(t => {
              const pct = t.cost_basis > 0 ? (t.realized_pnl / t.cost_basis) * 100 : null
              const cls = t.realized_pnl > 0 ? 'text-success' : t.realized_pnl < 0 ? 'text-error' : ''
              return <tr key={t.sell_tx_id}>
                <td className="text-muted">{formatDate(t.date)}</td>
                <td><span className="asset-name">{t.asset_name}</span><span className="currency-badge">{t.currency}</span></td>
                <td className="text-right">{formatNumber(t.units, 4)}</td>
                <td className="text-right">{formatCurrency(t.sell_price, t.currency)}</td>
                <td className="text-right">{formatCurrency(t.proceeds, t.currency)}</td>
                <td className="text-right">{formatCurrency(t.cost_basis, t.currency)}</td>
                <td className={`text-right font-bold ${cls}`}>{pnlCell(t.realized_pnl, t.currency)}</td>
                <td className={`text-right ${cls}`}>{pct !== null ? formatPct(pct) : '--'}</td>
                <td className="text-right text-muted">{t.holding_days ?? '--'}</td>
              </tr>
            })}</tbody>
          </table></div>
        ))}

        {tab === 'positions' && (fp.length === 0 ? <p className="table-empty">No open positions.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Asset</th><th className="text-right">Units</th><th className="text-right">Avg Cost</th><th className="text-right">Total Cost</th></tr></thead>
            <tbody>{fp.map(p => <tr key={p.asset_name}>
              <td><span className="asset-name">{p.asset_name}</span><span className="currency-badge">{p.currency}</span></td>
              <td className="text-right">{formatNumber(p.units, 4)}</td>
              <td className="text-right">{formatCurrency(p.avg_cost, p.currency)}</td>
              <td className="text-right">{formatCurrency(p.total_cost, p.currency)}</td>
            </tr>)}</tbody>
          </table></div>
        ))}

        {tab === 'log' && (fl.length === 0 ? <p className="table-empty">No transactions yet.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Action</th><th>Asset</th><th className="text-right">Units</th><th className="text-right">Price</th><th className="text-right">Fees</th><th className="text-right">Total</th><th>Notes</th><th></th></tr></thead>
            <tbody>{fl.map(tx => <tr key={tx.id}>
              <td className="text-muted">{formatDate(tx.date)}</td>
              <td><span className={`action-badge action-${tx.action}`}>{tx.action.toUpperCase()}</span></td>
              <td><span className="asset-name">{tx.asset_name}</span><span className="currency-badge">{tx.currency}</span></td>
              <td className="text-right">{formatNumber(tx.units, 4)}</td>
              <td className="text-right">{formatCurrency(tx.price_per_unit, tx.currency)}</td>
              <td className="text-right">{formatCurrency(tx.fees, tx.currency)}</td>
              <td className="text-right">{formatCurrency(tx.total_cost, tx.currency)}</td>
              <td className="text-muted">{tx.notes ?? '—'}</td>
              <td><span className="row-actions">
                <button className="btn-icon" onClick={() => openEdit(tx)}><Pencil size={13} /></button>
                {delId === tx.id ? <><button className="btn-icon danger" onClick={() => { api.deleteTradingTransaction(tx.id).then(() => bump()); setDelId(null) }}>Confirm</button><button className="btn-icon" onClick={() => setDelId(null)}>Cancel</button></> : <button className="btn-icon danger" onClick={() => setDelId(tx.id)}><Trash2 size={13} /></button>}
              </span></td>
            </tr>)}</tbody>
          </table></div>
        ))}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId !== null ? 'Edit Trade' : 'Add Spot Trade'}</h2>
              <button className="btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body" onSubmit={submit}>
              <div className="action-toggle" style={{ marginBottom: 16 }}>
                {(['buy', 'sell'] as TradingAction[]).map(a => (
                  <button key={a} type="button" className={`action-toggle-btn ${form.action === a ? `active-${a}` : ''}`} onClick={() => sf('action', a)}>
                    {a === 'buy' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {a === 'buy' ? 'Buy' : 'Sell'}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label className="form-field"><span className="form-label">Date</span><input className="input" type="date" value={form.date} onChange={e => sf('date', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Currency</span>
                  <select className="input select" value={form.currency} onChange={e => sf('currency', e.target.value as Currency)}>
                    <option value="THB">THB</option><option value="USD">USD</option>
                  </select>
                </label>
                <label className="form-field" style={{ gridColumn: '1/-1' }}><span className="form-label">Asset Name</span><input className="input" type="text" placeholder="e.g. AAPL, BTC, PTT" value={form.asset_name} onChange={e => sf('asset_name', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Units</span><input className="input" type="number" step="any" min="0" value={form.units} onChange={e => sf('units', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Price per Unit</span><input className="input" type="number" step="any" min="0" value={form.price_per_unit} onChange={e => sf('price_per_unit', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Fees</span><input className="input" type="number" step="any" min="0" value={form.fees} onChange={e => sf('fees', e.target.value)} /></label>
                <label className="form-field"><span className="form-label">{form.action === 'buy' ? 'Total Cost' : 'Net Proceeds'}</span><input className="input" readOnly value={amount !== null ? formatCurrency(amount, form.currency) : '—'} /></label>
                <label className="form-field" style={{ gridColumn: '1/-1' }}><span className="form-label">Notes</span><input className="input" type="text" placeholder="Optional" value={form.notes} onChange={e => sf('notes', e.target.value)} /></label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId !== null ? 'Save Changes' : (form.action === 'buy' ? 'Record Buy' : 'Record Sell')}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ─── TFEX section ─────────────────────────────────────────────────────

interface TfexProps { version: number; bump: () => void }

type TfexForm = {
  instrument: string; monthCode: string; direction: TradeDirection
  contracts: string; multiplier: string; entry_date: string; entry_price: string
  exit_date: string; exit_price: string; commission: string; notes: string
}

function emptyTfexForm(): TfexForm {
  const months = getUpcomingTfexMonths()
  return {
    instrument: 'S50', monthCode: months[0]?.value ?? 'H26', direction: 'long',
    contracts: '', multiplier: '200', entry_date: todayISO(), entry_price: '',
    exit_date: '', exit_price: '', commission: '0', notes: '',
  }
}

function TfexSection({ version, bump }: TfexProps) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<TfexForm>(emptyTfexForm)
  const [delId, setDelId] = useState<number | null>(null)

  const [allTrades, setAllTrades] = useState<TfexTrade[]>([])
  useEffect(() => { api.getTfexTrades().then(setAllTrades).catch(console.error) }, [version])

  const { trades, totals } = useMemo(() => {
    let pnlTHB = 0, wins = 0, losses = 0, open = 0
    for (const t of allTrades) {
      const p = tfexPnl(t)
      if (p === null) { open++; continue }
      pnlTHB += p
      if (p > 0) wins++; else if (p < 0) losses++
    }
    const closed = allTrades.filter(t => t.exit_price !== null).length
    return { trades: allTrades, totals: { pnlTHB, wins, losses, open, closed, winRate: closed > 0 ? (wins / closed) * 100 : null } }
  }, [allTrades])

  const sf = <K extends keyof TfexForm>(k: K, v: TfexForm[K]) => setForm(f => ({ ...f, [k]: v }))

  function setInstrument(value: string) {
    const preset = TFEX_INSTRUMENTS.find(i => i.value === value) ?? TFEX_INSTRUMENTS[0]!
    setForm(f => ({ ...f, instrument: value, multiplier: String(preset.multiplier) }))
  }

  function contractName(): string {
    if (form.instrument === 'CUSTOM') return `CUSTOM${form.monthCode}`
    return `${form.instrument}${form.monthCode}`
  }

  function openAdd() { setEditId(null); setForm(emptyTfexForm()); setModal(true) }
  function openEdit(t: TfexTrade) {
    const month = t.contract.slice(-3)
    const prefix = t.contract.slice(0, -3)
    const inst = TFEX_INSTRUMENTS.find(i => i.value === prefix) ? prefix : 'CUSTOM'
    setEditId(t.id)
    setForm({ instrument: inst, monthCode: month, direction: t.direction, contracts: String(t.contracts), multiplier: String(t.multiplier), entry_date: t.entry_date, entry_price: String(t.entry_price), exit_date: t.exit_date ?? '', exit_price: t.exit_price !== null ? String(t.exit_price) : '', commission: String(t.commission), notes: t.notes ?? '' })
    setModal(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = { entry_date: form.entry_date, contract: contractName(), direction: form.direction, contracts: parseInt(form.contracts), multiplier: parseFloat(form.multiplier), entry_price: parseFloat(form.entry_price), exit_date: form.exit_date, exit_price: form.exit_price, commission: parseFloat(form.commission) || 0, notes: form.notes }
    if (!data.contract || isNaN(data.contracts) || isNaN(data.entry_price)) return
    if (editId !== null) await api.updateTfexTrade(editId, data); else await api.createTfexTrade(data)
    bump(); setModal(false)
  }

  const previewPnl = (() => {
    if (!form.exit_price) return null
    const sign = form.direction === 'long' ? 1 : -1
    const c = parseInt(form.contracts), m = parseFloat(form.multiplier), ep = parseFloat(form.entry_price), xp = parseFloat(form.exit_price), comm = parseFloat(form.commission) || 0
    if ([c, m, ep, xp].some(isNaN)) return null
    return (xp - ep) * c * m * sign - comm
  })()

  const months = getUpcomingTfexMonths()

  return (
    <>
      <div className="tr-section-header">
        <div className="stats-grid">
          <div className="stat-card card"><span className="stat-label">Open Positions</span><strong className="stat-value">{totals.open}</strong></div>
          <div className="stat-card card"><span className="stat-label">Closed Trades</span><strong className="stat-value">{totals.closed}</strong><span className="stat-sub">{totals.wins}W / {totals.losses}L</span></div>
          <div className="stat-card card"><span className="stat-label">Win Rate</span><strong className="stat-value">{totals.winRate !== null ? `${totals.winRate.toFixed(1)}%` : '--'}</strong></div>
          <div className="stat-card card"><span className="stat-label">Realized P&amp;L (THB)</span><strong className={`stat-value ${totals.pnlTHB >= 0 ? 'text-success' : 'text-error'}`}>{formatCurrency(totals.pnlTHB, 'THB')}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add TFEX Trade</button>
      </div>

      <div className="card">
        {trades.length === 0 ? <p className="table-empty">No TFEX trades yet. Click "Add TFEX Trade" to start.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <th>Entry Date</th><th>Contract</th><th>Direction</th><th className="text-right">Contracts</th>
              <th className="text-right">Multi</th><th className="text-right">Entry</th><th>Exit Date</th>
              <th className="text-right">Exit</th><th className="text-right">Commission</th>
              <th className="text-right">P&amp;L (THB)</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>{trades.map(t => {
              const pnl = tfexPnl(t)
              return <tr key={t.id}>
                <td className="text-muted">{formatDate(t.entry_date)}</td>
                <td><strong className="asset-name">{t.contract}</strong></td>
                <td>{directionBadge(t.direction)}</td>
                <td className="text-right">{t.contracts}</td>
                <td className="text-right">{formatNumber(t.multiplier, 0)}</td>
                <td className="text-right">{formatNumber(t.entry_price, 2)}</td>
                <td className="text-muted">{t.exit_date ? formatDate(t.exit_date) : '—'}</td>
                <td className="text-right">{t.exit_price !== null ? formatNumber(t.exit_price, 2) : '—'}</td>
                <td className="text-right">{formatCurrency(t.commission, 'THB')}</td>
                <td className="text-right font-bold">{pnlCell(pnl, 'THB')}</td>
                <td>{statusBadge(t.exit_price === null)}</td>
                <td><span className="row-actions">
                  <button className="btn-icon" onClick={() => openEdit(t)}><Pencil size={13} /></button>
                  {delId === t.id ? <><button className="btn-icon danger" onClick={() => { api.deleteTfexTrade(t.id).then(() => bump()); setDelId(null) }}>Confirm</button><button className="btn-icon" onClick={() => setDelId(null)}>Cancel</button></> : <button className="btn-icon danger" onClick={() => setDelId(t.id)}><Trash2 size={13} /></button>}
                </span></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId !== null ? 'Edit TFEX Trade' : 'Add TFEX Trade'}</h2>
              <button className="btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body" onSubmit={submit}>

              {/* Direction */}
              <div className="action-toggle" style={{ marginBottom: 16 }}>
                {(['long', 'short'] as TradeDirection[]).map(d => (
                  <button key={d} type="button" className={`action-toggle-btn ${form.direction === d ? `active-${d === 'long' ? 'buy' : 'sell'}` : ''}`} onClick={() => sf('direction', d)}>
                    {d === 'long' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {d === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>

              {/* Instrument + Month → Contract name */}
              <div className="form-grid">
                <label className="form-field">
                  <span className="form-label">Instrument</span>
                  <select className="input select" value={form.instrument} onChange={e => setInstrument(e.target.value)}>
                    {TFEX_INSTRUMENTS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Contract Month</span>
                  <select className="input select" value={form.monthCode} onChange={e => sf('monthCode', e.target.value)}>
                    {months.map(m => <option key={m.value} value={m.value}>{m.label} ({m.value})</option>)}
                    {!months.find(m => m.value === form.monthCode) && <option value={form.monthCode}>{form.monthCode}</option>}
                  </select>
                </label>
              </div>

              <div className="tfex-contract-preview">
                Contract: <strong>{contractName()}</strong>
                &nbsp;·&nbsp;Multiplier: <strong>{form.multiplier} THB/unit</strong>
              </div>

              <div className="form-grid">
                <label className="form-field"><span className="form-label">Contracts</span><input className="input" type="number" min="1" step="1" placeholder="1" value={form.contracts} onChange={e => sf('contracts', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Multiplier (THB/unit)</span><input className="input" type="number" step="any" min="0" value={form.multiplier} onChange={e => sf('multiplier', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Entry Date</span><input className="input" type="date" value={form.entry_date} onChange={e => sf('entry_date', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Entry Price</span><input className="input" type="number" step="any" placeholder="e.g. 1250.0" value={form.entry_price} onChange={e => sf('entry_price', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Exit Date <em className="form-optional">(leave blank if open)</em></span><input className="input" type="date" value={form.exit_date} onChange={e => sf('exit_date', e.target.value)} /></label>
                <label className="form-field"><span className="form-label">Exit Price</span><input className="input" type="number" step="any" placeholder="e.g. 1280.0" value={form.exit_price} onChange={e => sf('exit_price', e.target.value)} /></label>
                <label className="form-field"><span className="form-label">Commission (THB, round-trip)</span><input className="input" type="number" step="any" min="0" value={form.commission} onChange={e => sf('commission', e.target.value)} /></label>
                <label className="form-field"><span className="form-label">Preview P&amp;L</span>
                  <input className="input" readOnly value={previewPnl !== null ? formatCurrency(previewPnl, 'THB') : '—'} style={{ color: previewPnl !== null ? (previewPnl >= 0 ? 'var(--success)' : 'var(--error)') : undefined }} />
                </label>
                <label className="form-field" style={{ gridColumn: '1/-1' }}><span className="form-label">Notes</span><input className="input" type="text" placeholder="Optional" value={form.notes} onChange={e => sf('notes', e.target.value)} /></label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId !== null ? 'Save Changes' : 'Record Trade'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ─── FOREX section ────────────────────────────────────────────────────

interface ForexProps { version: number; bump: () => void; rate: number }

type ForexForm = {
  pairPreset: string; pair: string; direction: TradeDirection
  lots: string; lot_size: string; entry_date: string; entry_price: string
  exit_date: string; exit_price: string; commission: string; currency: Currency; notes: string
}

function emptyForexForm(): ForexForm {
  return {
    pairPreset: 'XAUUSD', pair: 'XAUUSD', direction: 'long',
    lots: '', lot_size: '100', entry_date: todayISO(), entry_price: '',
    exit_date: '', exit_price: '', commission: '0', currency: 'USD', notes: '',
  }
}

function ForexSection({ version, bump, rate }: ForexProps) {
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<ForexForm>(emptyForexForm)
  const [delId, setDelId] = useState<number | null>(null)

  const [allForex, setAllForex] = useState<ForexTrade[]>([])
  useEffect(() => { api.getForexTrades().then(setAllForex).catch(console.error) }, [version])

  const { trades, totals } = useMemo(() => {
    let pnlTHB = 0, wins = 0, losses = 0, open = 0
    for (const t of allForex) {
      const p = forexPnl(t)
      if (p === null) { open++; continue }
      const r = t.currency === 'USD' ? rate : 1
      pnlTHB += p * r
      if (p > 0) wins++; else if (p < 0) losses++
    }
    const closed = allForex.filter(t => t.exit_price !== null).length
    return { trades: allForex, totals: { pnlTHB, wins, losses, open, closed, winRate: closed > 0 ? (wins / closed) * 100 : null } }
  }, [allForex, rate])

  const sf = <K extends keyof ForexForm>(k: K, v: ForexForm[K]) => setForm(f => ({ ...f, [k]: v }))

  function setPairPreset(value: string) {
    const preset = FOREX_PAIRS.find(p => p.value === value) ?? FOREX_PAIRS[0]!
    setForm(f => ({ ...f, pairPreset: value, pair: value === 'CUSTOM' ? f.pair : value, lot_size: String(preset.lotSize), currency: preset.currency }))
  }

  function openAdd() { setEditId(null); setForm(emptyForexForm()); setModal(true) }
  function openEdit(t: ForexTrade) {
    const preset = FOREX_PAIRS.find(p => p.value === t.pair)
    setEditId(t.id)
    setForm({ pairPreset: preset ? t.pair : 'CUSTOM', pair: t.pair, direction: t.direction, lots: String(t.lots), lot_size: String(t.lot_size), entry_date: t.entry_date, entry_price: String(t.entry_price), exit_date: t.exit_date ?? '', exit_price: t.exit_price !== null ? String(t.exit_price) : '', commission: String(t.commission), currency: t.currency, notes: t.notes ?? '' })
    setModal(true)
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const data = { entry_date: form.entry_date, pair: form.pair.trim().toUpperCase(), direction: form.direction, lots: parseFloat(form.lots), lot_size: parseFloat(form.lot_size), entry_price: parseFloat(form.entry_price), exit_date: form.exit_date, exit_price: form.exit_price, commission: parseFloat(form.commission) || 0, currency: form.currency, notes: form.notes }
    if (!data.pair || isNaN(data.lots) || isNaN(data.entry_price)) return
    if (editId !== null) await api.updateForexTrade(editId, data); else await api.createForexTrade(data)
    bump(); setModal(false)
  }

  const previewPnl = (() => {
    if (!form.exit_price) return null
    const sign = form.direction === 'long' ? 1 : -1
    const l = parseFloat(form.lots), ls = parseFloat(form.lot_size), ep = parseFloat(form.entry_price), xp = parseFloat(form.exit_price), comm = parseFloat(form.commission) || 0
    if ([l, ls, ep, xp].some(isNaN)) return null
    return (xp - ep) * l * ls * sign - comm
  })()

  return (
    <>
      <div className="tr-section-header">
        <div className="stats-grid">
          <div className="stat-card card"><span className="stat-label">Open Positions</span><strong className="stat-value">{totals.open}</strong></div>
          <div className="stat-card card"><span className="stat-label">Closed Trades</span><strong className="stat-value">{totals.closed}</strong><span className="stat-sub">{totals.wins}W / {totals.losses}L</span></div>
          <div className="stat-card card"><span className="stat-label">Win Rate</span><strong className="stat-value">{totals.winRate !== null ? `${totals.winRate.toFixed(1)}%` : '--'}</strong></div>
          <div className="stat-card card"><span className="stat-label">Realized P&amp;L (THB)</span><strong className={`stat-value ${totals.pnlTHB >= 0 ? 'text-success' : 'text-error'}`}>{formatCurrency(totals.pnlTHB, 'THB')}</strong></div>
        </div>
        <button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add FOREX Trade</button>
      </div>

      <div className="card">
        {trades.length === 0 ? <p className="table-empty">No FOREX/CFD trades yet. Click "Add FOREX Trade" to start.</p> : (
          <div className="table-wrap"><table className="table">
            <thead><tr>
              <th>Entry Date</th><th>Pair</th><th>Direction</th><th className="text-right">Lots</th>
              <th className="text-right">Lot Size</th><th className="text-right">Entry</th><th>Exit Date</th>
              <th className="text-right">Exit</th><th className="text-right">P&amp;L</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>{trades.map(t => {
              const pnl = forexPnl(t)
              return <tr key={t.id}>
                <td className="text-muted">{formatDate(t.entry_date)}</td>
                <td><strong className="asset-name">{t.pair}</strong><span className="currency-badge">{t.currency}</span></td>
                <td>{directionBadge(t.direction)}</td>
                <td className="text-right">{formatNumber(t.lots, 2)}</td>
                <td className="text-right">{formatNumber(t.lot_size, 0)}</td>
                <td className="text-right">{formatNumber(t.entry_price, 5)}</td>
                <td className="text-muted">{t.exit_date ? formatDate(t.exit_date) : '—'}</td>
                <td className="text-right">{t.exit_price !== null ? formatNumber(t.exit_price, 5) : '—'}</td>
                <td className="text-right font-bold">{pnlCell(pnl, t.currency)}</td>
                <td>{statusBadge(t.exit_price === null)}</td>
                <td><span className="row-actions">
                  <button className="btn-icon" onClick={() => openEdit(t)}><Pencil size={13} /></button>
                  {delId === t.id ? <><button className="btn-icon danger" onClick={() => { api.deleteForexTrade(t.id).then(() => bump()); setDelId(null) }}>Confirm</button><button className="btn-icon" onClick={() => setDelId(null)}>Cancel</button></> : <button className="btn-icon danger" onClick={() => setDelId(t.id)}><Trash2 size={13} /></button>}
                </span></td>
              </tr>
            })}</tbody>
          </table></div>
        )}
      </div>

      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId !== null ? 'Edit FOREX Trade' : 'Add FOREX / CFD Trade'}</h2>
              <button className="btn-icon" onClick={() => setModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body" onSubmit={submit}>

              <div className="action-toggle" style={{ marginBottom: 16 }}>
                {(['long', 'short'] as TradeDirection[]).map(d => (
                  <button key={d} type="button" className={`action-toggle-btn ${form.direction === d ? `active-${d === 'long' ? 'buy' : 'sell'}` : ''}`} onClick={() => sf('direction', d)}>
                    {d === 'long' ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    {d === 'long' ? 'Long' : 'Short'}
                  </button>
                ))}
              </div>

              <div className="form-grid">
                <label className="form-field">
                  <span className="form-label">Instrument Preset</span>
                  <select className="input select" value={form.pairPreset} onChange={e => setPairPreset(e.target.value)}>
                    {FOREX_PAIRS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </label>
                <label className="form-field">
                  <span className="form-label">Pair / Symbol {form.pairPreset === 'CUSTOM' && <em className="form-optional">(editable)</em>}</span>
                  <input className="input" type="text" value={form.pair} onChange={e => sf('pair', e.target.value.toUpperCase())} readOnly={form.pairPreset !== 'CUSTOM'} required />
                </label>
                <label className="form-field"><span className="form-label">Lots</span><input className="input" type="number" step="any" min="0" placeholder="e.g. 0.1" value={form.lots} onChange={e => sf('lots', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Lot Size (units/lot)</span><input className="input" type="number" step="any" min="1" value={form.lot_size} onChange={e => sf('lot_size', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Entry Date</span><input className="input" type="date" value={form.entry_date} onChange={e => sf('entry_date', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Entry Price</span><input className="input" type="number" step="any" placeholder="e.g. 2350.000" value={form.entry_price} onChange={e => sf('entry_price', e.target.value)} required /></label>
                <label className="form-field"><span className="form-label">Exit Date <em className="form-optional">(leave blank if open)</em></span><input className="input" type="date" value={form.exit_date} onChange={e => sf('exit_date', e.target.value)} /></label>
                <label className="form-field"><span className="form-label">Exit Price</span><input className="input" type="number" step="any" value={form.exit_price} onChange={e => sf('exit_price', e.target.value)} /></label>
                <label className="form-field">
                  <span className="form-label">Commission</span><input className="input" type="number" step="any" min="0" value={form.commission} onChange={e => sf('commission', e.target.value)} />
                </label>
                <label className="form-field">
                  <span className="form-label">P&amp;L Currency</span>
                  <select className="input select" value={form.currency} onChange={e => sf('currency', e.target.value as Currency)}>
                    <option value="USD">USD</option><option value="THB">THB</option>
                  </select>
                </label>
                <label className="form-field" style={{ gridColumn: '1/-1' }}>
                  <span className="form-label">Preview P&amp;L ({form.currency})</span>
                  <input className="input" readOnly value={previewPnl !== null ? formatCurrency(previewPnl, form.currency) : '—'} style={{ color: previewPnl !== null ? (previewPnl >= 0 ? 'var(--success)' : 'var(--error)') : undefined }} />
                </label>
                <label className="form-field" style={{ gridColumn: '1/-1' }}><span className="form-label">Notes</span><input className="input" type="text" placeholder="Optional" value={form.notes} onChange={e => sf('notes', e.target.value)} /></label>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId !== null ? 'Save Changes' : 'Record Trade'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main page ────────────────────────────────────────────────────────

type MarketTab = 'spot' | 'tfex' | 'forex'

export function TradingRecordPage() {
  const { version, bump } = useDatabase()
  const [market, setMarket] = useState<MarketTab>('spot')
  const [rate, setRate] = useState(35.0)

  useEffect(() => {
    api.getSettings().then((s) => {
      setRate(parseFloat(s.exchange_rate_thb_usd ?? '35.0'))
    }).catch(console.error)
  }, [version])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Trading Record</h1>
          <p className="page-desc">Independent trade log — separate from the main portfolio system.</p>
        </div>
      </div>

      <div className="market-tabs">
        {([['spot', 'Spot / ETF', 'FIFO'], ['tfex', 'TFEX', 'Futures'], ['forex', 'FOREX / CFD', 'Derivatives']] as const).map(([key, label, sub]) => (
          <button key={key} className={`market-tab ${market === key ? 'active' : ''}`} onClick={() => setMarket(key)}>
            <span className="market-tab-label">{label}</span>
            <span className="market-tab-sub">{sub}</span>
          </button>
        ))}
      </div>

      {market === 'spot'  && <SpotSection  version={version} bump={bump} rate={rate} />}
      {market === 'tfex'  && <TfexSection  version={version} bump={bump} />}
      {market === 'forex' && <ForexSection version={version} bump={bump} rate={rate} />}
    </div>
  )
}
