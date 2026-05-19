import { useState, useEffect, useCallback } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as api from '../lib/api'
import {
  computeHoldings,
  computeTotals,
  allocationByType,
  computeYtdFlow,
  computeYtdInvestmentTrend,
  computeQuarterlyPortfolioGrowth,
  groupByAssetType,
} from '../lib/calc'
import { formatCurrency, formatPct, formatDate, formatNumber, todayISO } from '../lib/format'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType, type Currency, type Transaction, type Asset, type PriceHistory, type Holding } from '../types'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  CalendarDays,
  TrendingUp,
  TrendingDown,
  Wallet,
  DollarSign,
  CheckCircle,
  Edit3,
  Trash2,
  X,
} from 'lucide-react'

function formatSharePct(value: number): string {
  return `${value.toFixed(1)}%`
}

function listMonths(startMonth: string, endMonth: string): string[] {
  const [syRaw, smRaw] = startMonth.split('-').map(Number)
  const [eyRaw, emRaw] = endMonth.split('-').map(Number)
  if (!syRaw || !smRaw || !eyRaw || !emRaw) return []
  let y = syRaw
  let m = smRaw
  const out: string[] = []
  while (y < eyRaw || (y === eyRaw && m <= emRaw)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`)
    m++
    if (m > 12) { m = 1; y++ }
  }
  return out
}

function lastDayOfMonth(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  const day = new Date(y, m, 0).getDate()
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
}

interface TypeSummary {
  type: AssetType
  label: string
  valueTHB: number
  investedTHB: number
  unrealizedProfitTHB: number | null
  realizedProfitTHB: number
  percentage: number
  items: Holding[]
}

export function DashboardPage() {
  const { version, bump } = useDatabase()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedType, setSelectedType] = useState<AssetType | null>(null)

  interface MonthlyRow {
    price: string
    notes: string
    originalId: number | null
    originalPrice: number | null
    originalNotes: string
    originalDate: string | null
  }
  const [monthlyEditAsset, setMonthlyEditAsset] = useState<{ asset_name: string; currency: Currency } | null>(null)
  const [monthlyMonths, setMonthlyMonths] = useState<string[]>([])
  const [monthlyInputs, setMonthlyInputs] = useState<Record<string, MonthlyRow>>({})
  const [savingMonthly, setSavingMonthly] = useState(false)

  const [allTransactions, setAllTransactions] = useState<Transaction[]>([])
  const [allAssets, setAllAssets] = useState<Asset[]>([])
  const [allPriceHistory, setAllPriceHistory] = useState<PriceHistory[]>([])
  const [exchangeRate, setExchangeRate] = useState(35.0)
  const [priceHistoryMap, setPriceHistoryMap] = useState<Map<string, PriceHistory[]>>(new Map())

  useEffect(() => {
    Promise.all([api.getTransactions(), api.getAssets(), api.getAllPriceHistory(), api.getSettings()])
      .then(([txs, assets, prices, settings]) => {
        setAllTransactions(txs)
        setAllAssets(assets)
        setAllPriceHistory(prices)
        setExchangeRate(parseFloat(settings.exchange_rate_thb_usd ?? '35.0'))

        const phMap = new Map<string, PriceHistory[]>()
        for (const p of prices) {
          const key = `${p.asset_name}:${p.currency}`
          const arr = phMap.get(key) ?? []
          arr.push(p)
          phMap.set(key, arr)
        }
        for (const [, arr] of phMap) {
          arr.sort((a, b) => b.price_date.localeCompare(a.price_date))
        }
        setPriceHistoryMap(phMap)
      })
      .catch(console.error)
  }, [version])

  const availableYears = Array.from(
    new Set([
      currentYear,
      ...allTransactions.map((tx) => Number(tx.date.slice(0, 4))).filter(Number.isFinite),
      ...allPriceHistory.map((p) => Number(p.price_date.slice(0, 4))).filter(Number.isFinite),
    ])
  ).sort((a, b) => b - a)

  const yearTransactions = allTransactions.filter((tx) => Number(tx.date.slice(0, 4)) === selectedYear)
  const recentTx = yearTransactions.slice(0, 8)
  const ytdFlow = computeYtdFlow(allTransactions, exchangeRate, new Date(), selectedYear)
  const ytdTrend = computeYtdInvestmentTrend(allTransactions, exchangeRate, selectedYear)
  const quarterlyGrowth = computeQuarterlyPortfolioGrowth(allTransactions, allPriceHistory, exchangeRate, new Date(), 8, selectedYear)

  const portfolioHoldings = computeHoldings(allTransactions, allAssets)
  const portfolioSummaryHoldings = computeHoldings(allTransactions, allAssets, { includeClosed: true })
  const portfolioTotals = computeTotals(portfolioSummaryHoldings, exchangeRate)
  const portfolioAlloc = allocationByType(portfolioHoldings, exchangeRate)
  const totalAllocationTHB = portfolioAlloc.reduce((sum, item) => sum + item.value, 0)
  const grouped = groupByAssetType(portfolioHoldings)
  const groupedSummary = groupByAssetType(portfolioSummaryHoldings)

  const typeSummaries: TypeSummary[] = portfolioAlloc.map((item) => {
    const type = item.type as AssetType
    const items = grouped.get(type) ?? []
    const summaryItems = groupedSummary.get(type) ?? items
    const investedTHB = items.reduce((sum, h) => {
      const rate = h.currency === 'USD' ? exchangeRate : 1
      return sum + h.total_invested * rate
    }, 0)
    const unrealizedProfitTHB = items.reduce((sum, h) => {
      const rate = h.currency === 'USD' ? exchangeRate : 1
      return sum + (h.unrealized_profit ?? 0) * rate
    }, 0)
    const realizedProfitTHB = summaryItems.reduce((sum, h) => {
      const rate = h.currency === 'USD' ? exchangeRate : 1
      return sum + h.realized_profit * rate
    }, 0)
    const hasAllPrices = items.every((h) => h.current_value !== null)

    return {
      type,
      label: ASSET_TYPE_LABELS[type],
      valueTHB: item.value,
      investedTHB,
      unrealizedProfitTHB: hasAllPrices ? unrealizedProfitTHB : null,
      realizedProfitTHB,
      percentage: totalAllocationTHB > 0 ? (item.value / totalAllocationTHB) * 100 : 0,
      items,
    }
  })

  const selectedSummary = selectedType
    ? typeSummaries.find((s) => s.type === selectedType) ?? null
    : null

  const handleTypeSelect = (type: AssetType) => {
    setSelectedType(type)
  }

  const handlePieClick = (entry: unknown) => {
    const type = (entry as { type?: AssetType }).type
    if (type) handleTypeSelect(type)
  }

  const getEarliestTxDate = useCallback((assetName: string, currency: Currency): string | null => {
    let earliest: string | null = null
    let earliestBuy: string | null = null
    for (const tx of allTransactions) {
      if (tx.asset_name !== assetName || tx.currency !== currency) continue
      if (earliest === null || tx.date < earliest) earliest = tx.date
      if (tx.action === 'buy' && (earliestBuy === null || tx.date < earliestBuy)) earliestBuy = tx.date
    }
    return earliestBuy ?? earliest
  }, [allTransactions])

  const openMonthlyEdit = useCallback((assetName: string, currency: Currency) => {
    const earliest = getEarliestTxDate(assetName, currency) ?? todayISO()
    const startMonth = earliest.slice(0, 7)
    const endMonth = todayISO().slice(0, 7)
    const months = listMonths(startMonth, endMonth)

    const existing = priceHistoryMap.get(`${assetName}:${currency}`) ?? []
    const inputs: Record<string, MonthlyRow> = {}
    for (const m of months) {
      const found = existing.find((p) => p.price_date.startsWith(m))
      inputs[m] = {
        price: found ? String(found.price) : '',
        notes: found?.notes ?? '',
        originalId: found?.id ?? null,
        originalPrice: found?.price ?? null,
        originalNotes: found?.notes ?? '',
        originalDate: found?.price_date ?? null,
      }
    }
    setMonthlyMonths(months)
    setMonthlyInputs(inputs)
    setMonthlyEditAsset({ asset_name: assetName, currency })
  }, [getEarliestTxDate, priceHistoryMap])

  const closeMonthlyEdit = useCallback(() => {
    setMonthlyEditAsset(null)
    setMonthlyMonths([])
    setMonthlyInputs({})
  }, [])

  const setMonthlyField = useCallback((month: string, field: 'price' | 'notes', value: string) => {
    setMonthlyInputs((prev) => {
      const row = prev[month]
      if (!row) return prev
      return { ...prev, [month]: { ...row, [field]: value } }
    })
  }, [])

  const saveMonthlyPrices = useCallback(async () => {
    if (!monthlyEditAsset) return
    setSavingMonthly(true)
    try {
      const ops: Promise<unknown>[] = []
      for (const month of monthlyMonths) {
        const row = monthlyInputs[month]
        if (!row) continue
        const trimmed = row.price.trim()
        const parsedPrice = trimmed === '' ? null : Number(trimmed)
        if (parsedPrice !== null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) continue

        const notes = row.notes ?? ''
        const priceChanged = parsedPrice !== row.originalPrice
        const notesChanged = notes !== (row.originalNotes ?? '')

        if (parsedPrice !== null && (priceChanged || notesChanged)) {
          ops.push(api.upsertPriceHistory({
            asset_name: monthlyEditAsset.asset_name,
            currency: monthlyEditAsset.currency,
            price_date: row.originalDate ?? lastDayOfMonth(month),
            price: parsedPrice,
            notes,
          }))
        } else if (parsedPrice === null && row.originalId !== null) {
          ops.push(api.deletePriceHistory(row.originalId))
        }
      }
      if (ops.length > 0) {
        await Promise.all(ops)
        bump()
      }
      closeMonthlyEdit()
    } finally {
      setSavingMonthly(false)
    }
  }, [monthlyEditAsset, monthlyMonths, monthlyInputs, bump, closeMonthlyEdit])

  const deleteHistory = useCallback(async (id: number) => {
    await api.deletePriceHistory(id)
    bump()
  }, [bump])

  const unrealizedPositive = (portfolioTotals.unrealizedProfitTHB ?? 0) >= 0
  const realizedPositive = portfolioTotals.realizedProfitTHB >= 0
  const ytdPositive = ytdFlow.netInvestedTHB >= 0

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <label className="year-filter" title="Investment year">
          <CalendarDays size={16} />
          <span>Investment Year</span>
          <select className="input select" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
            {availableYears.map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <div className="metric-icon-wrap violet"><Wallet size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">Total Invested (THB)</div>
            <div className="metric-value">{formatCurrency(portfolioTotals.totalInvestedTHB, 'THB')}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap sky"><DollarSign size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">Total Invested (USD)</div>
            <div className="metric-value">{formatCurrency(portfolioTotals.totalInvestedUSD, 'USD')}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap teal"><Wallet size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">
              Current Value (THB){!portfolioTotals.hasAllPrices && portfolioTotals.totalValueTHB !== null && <span className="metric-partial"> partial</span>}
            </div>
            <div className="metric-value">
              {portfolioTotals.totalValueTHB !== null ? formatCurrency(portfolioTotals.totalValueTHB, 'THB') : '—'}
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className={`metric-icon-wrap ${unrealizedPositive ? 'emerald' : 'rose'}`}>
            {unrealizedPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div className="metric-body">
            <div className="metric-label">
              Unrealized P&amp;L{!portfolioTotals.hasAllPrices && portfolioTotals.unrealizedProfitTHB !== null && <span className="metric-partial"> partial</span>}
            </div>
            <div className={`metric-value ${unrealizedPositive ? 'success' : 'error'}`}>
              {portfolioTotals.unrealizedProfitTHB !== null
                ? `${formatCurrency(portfolioTotals.unrealizedProfitTHB, 'THB')} (${formatPct(portfolioTotals.unrealizedProfitPct ?? 0)})`
                : '—'}
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className={`metric-icon-wrap ${realizedPositive ? 'emerald' : 'rose'}`}>
            <CheckCircle size={18} />
          </div>
          <div className="metric-body">
            <div className="metric-label">Realized P&amp;L</div>
            <div className={`metric-value ${realizedPositive ? 'success' : 'error'}`}>
              {formatCurrency(portfolioTotals.realizedProfitTHB, 'THB')}
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className={`metric-icon-wrap ${ytdPositive ? 'amber' : 'rose'}`}><CalendarDays size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">{selectedYear} YTD Net Invested</div>
            <div className={`metric-value ${ytdPositive ? '' : 'error'}`}>
              {formatCurrency(ytdFlow.netInvestedTHB, 'THB')}
              {ytdFlow.growthPct !== null ? ` (${formatPct(ytdFlow.growthPct)})` : ''}
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h2 className="card-title">{selectedYear} YTD Net Investment</h2>
          {ytdTrend.some((point) => point.cumulativeTHB !== 0) ? (
            <div className="growth-chart">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={ytdTrend} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ytdInvestmentFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2a9d99" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2a9d99" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ede9e4" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#787671', fontSize: 12 }} />
                  <YAxis width={88} tickLine={false} axisLine={false} tick={{ fill: '#787671', fontSize: 12 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number | string, n: string) => [formatCurrency(Number(v), 'THB'), n]} labelFormatter={(l: string) => l} />
                  <Area type="monotone" dataKey="cumulativeTHB" name="YTD Net" stroke="#2a9d99" strokeWidth={3} fill="url(#ytdInvestmentFill)" dot={{ r: 3, fill: '#2a9d99', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state"><p>No YTD data for {selectedYear}. Add transactions to see the trend.</p></div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">{selectedYear} Quarterly Portfolio Growth</h2>
          {quarterlyGrowth.length > 0 && quarterlyGrowth.some((p) => p.valueTHB !== 0 || p.netFlowTHB !== 0) ? (
            <div className="growth-chart">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={quarterlyGrowth} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="portfolioGrowthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5645d4" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#5645d4" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#ede9e4" vertical={false} />
                  <XAxis dataKey="quarter" tickLine={false} axisLine={false} tick={{ fill: '#787671', fontSize: 12 }} />
                  <YAxis width={88} tickLine={false} axisLine={false} tick={{ fill: '#787671', fontSize: 12 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
                  <Tooltip formatter={(v: number | string, n: string) => [formatCurrency(Number(v), 'THB'), n]} labelFormatter={(l: string) => l} />
                  <Area type="monotone" dataKey="valueTHB" name="Portfolio" stroke="#5645d4" strokeWidth={3} fill="url(#portfolioGrowthFill)" dot={{ r: 3, fill: '#5645d4', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state"><p>No quarterly data yet. Add transactions to see portfolio growth.</p></div>
          )}
        </div>
      </div>

      {portfolioHoldings.length === 0 ? (
        <div className="empty-state card"><p>No holdings yet. Add transactions to see your portfolio.</p></div>
      ) : (
        <>
          <div className="portfolio-dashboard">
            <div className="card portfolio-chart-card">
              <div className="portfolio-card-header">
                <div>
                  <h2 className="card-title">Allocation by Type</h2>
                  <p className="card-desc">Portfolio value split across asset categories.</p>
                </div>
                <div className="portfolio-total-pill">
                  <Wallet size={16} />
                  <span>{formatCurrency(portfolioTotals.totalInvestedTHB, 'THB')}</span>
                </div>
              </div>

              <div className="portfolio-chart-shell">
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie data={typeSummaries} dataKey="valueTHB" nameKey="label" cx="50%" cy="50%" innerRadius={82} outerRadius={126} paddingAngle={3} onClick={handlePieClick}>
                      {typeSummaries.map((s) => (
                        <Cell key={s.type} fill={ASSET_TYPE_COLORS[s.type]} stroke={selectedType === s.type ? '#0a1530' : '#ffffff'} strokeWidth={selectedType === s.type ? 4 : 2} style={{ cursor: 'pointer' }} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number | string) => formatCurrency(Number(v), 'THB')} labelFormatter={(l: string) => l} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="portfolio-chart-center">
                  <span>Total Value</span>
                  <strong>{portfolioTotals.totalValueTHB !== null ? formatCurrency(portfolioTotals.totalValueTHB, 'THB') : formatCurrency(portfolioTotals.totalInvestedTHB, 'THB')}</strong>
                </div>
              </div>

              <div className="portfolio-type-grid">
                {typeSummaries.map((s) => (
                  <button key={s.type} className={`portfolio-type-button ${selectedType === s.type ? 'active' : ''}`} onClick={() => handleTypeSelect(s.type)}>
                    <span className="legend-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[s.type] }} />
                    <span className="portfolio-type-name">{s.label}</span>
                    <span className="portfolio-type-meta">{formatSharePct(s.percentage)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="card-title">Recent Transactions</h2>
              {recentTx.length > 0 ? (
                <div className="recent-tx-list">
                  {recentTx.map((tx) => (
                    <div key={tx.id} className="recent-tx-row">
                      <div className="recent-tx-left">
                        <span className={`tx-action-badge ${tx.action}`}>{tx.action.toUpperCase()}</span>
                        <div>
                          <div className="recent-tx-name">{tx.asset_name}</div>
                          <div className="recent-tx-date">{formatDate(tx.date)}</div>
                        </div>
                      </div>
                      <div className="recent-tx-right">
                        <div className="recent-tx-amount">{formatCurrency(tx.total_cost, tx.currency)}</div>
                        <div className="recent-tx-units">
                          {tx.action === 'deposit' || tx.action === 'withdraw' || tx.action === 'dividend' || tx.action === 'interest'
                            ? ASSET_TYPE_LABELS[tx.asset_type]
                            : `${tx.units} units`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state"><p>No transactions yet.</p></div>
              )}
            </div>
          </div>

          <div className="card portfolio-detail-panel">
            {selectedSummary ? (
              <>
                <div className="portfolio-detail-hero">
                  <div>
                    <span className="portfolio-detail-kicker">Selected Type</span>
                    <h2 className="portfolio-detail-title">
                      <span className="group-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[selectedSummary.type] }} />
                      {selectedSummary.label}
                    </h2>
                  </div>
                  <div className="portfolio-detail-percent">{formatSharePct(selectedSummary.percentage)}</div>
                </div>

                <div className="portfolio-metric-grid">
                  <div className="portfolio-metric"><span className="stat-label">Assets</span><strong>{selectedSummary.items.length}</strong></div>
                  <div className="portfolio-metric"><span className="stat-label">Value</span><strong>{formatCurrency(selectedSummary.valueTHB, 'THB')}</strong></div>
                  <div className="portfolio-metric">
                    <span className="stat-label">Unrealized P&amp;L</span>
                    <strong className={selectedSummary.unrealizedProfitTHB !== null ? (selectedSummary.unrealizedProfitTHB < 0 ? 'text-error' : 'text-success') : ''}>{selectedSummary.unrealizedProfitTHB !== null ? formatCurrency(selectedSummary.unrealizedProfitTHB, 'THB') : '--'}</strong>
                  </div>
                  <div className="portfolio-metric">
                    <span className="stat-label">Realized P&amp;L</span>
                    <strong className={selectedSummary.realizedProfitTHB < 0 ? 'text-error' : 'text-success'}>{formatCurrency(selectedSummary.realizedProfitTHB, 'THB')}</strong>
                  </div>
                </div>

                <div className="portfolio-holding-list">
                  {selectedSummary.items.map((h) => {
                    const phKey = `${h.asset_name}:${h.currency}`
                    const priceHistory = h.asset_type !== 'cash' ? (priceHistoryMap.get(phKey) ?? []).slice(0, 5) : []

                    return (
                      <div key={h.asset_name} className="portfolio-holding-item">
                        <div className="holding-row">
                          <div className="holding-identity">
                            <span className="holding-name">{h.asset_name}</span>
                            <span className="portfolio-holding-sub">{h.asset_type === 'cash' ? 'Cash balance' : `${formatNumber(h.units, 4)} units`}</span>
                          </div>
                          <div className="holding-stats-inline">
                            <div className="holding-stat">
                              <span className="stat-label">{h.asset_type === 'cash' ? 'Balance' : 'Avg Cost'}</span>
                              <span className="stat-value">{h.asset_type === 'cash' ? formatCurrency(h.current_value ?? 0, h.currency) : formatCurrency(h.avg_cost, h.currency)}</span>
                            </div>
                            <div className="holding-stat">
                              <span className="stat-label">{h.asset_type === 'cash' ? 'Rate' : 'Price'}</span>
                              <span className="stat-value">
                                {h.asset_type === 'cash' ? '1.00' : (
                                  <span className="editable" onClick={() => openMonthlyEdit(h.asset_name, h.currency)} title="Edit monthly prices">
                                    {h.current_price !== null ? formatCurrency(h.current_price, h.currency) : 'Set price'}
                                    <Edit3 size={12} />
                                  </span>
                                )}
                              </span>
                            </div>
                            <div className="holding-stat"><span className="stat-label">Invested</span><span className="stat-value">{formatCurrency(h.total_invested, h.currency)}</span></div>
                            <div className="holding-stat"><span className="stat-label">Value</span><span className="stat-value">{h.current_value !== null ? formatCurrency(h.current_value, h.currency) : '--'}</span></div>
                            <div className="holding-stat">
                              <span className="stat-label">Unrealized P&amp;L</span>
                              <span className={`stat-value ${h.unrealized_profit !== null ? (h.unrealized_profit >= 0 ? 'text-success' : 'text-error') : ''}`}>
                                {h.unrealized_profit !== null ? `${formatCurrency(h.unrealized_profit, h.currency)} (${formatPct(h.unrealized_profit_pct ?? 0)})` : '--'}
                              </span>
                            </div>
                            {h.realized_profit !== 0 && (
                              <div className="holding-stat">
                                <span className="stat-label">Realized P&amp;L</span>
                                <span className={`stat-value ${h.realized_profit >= 0 ? 'text-success' : 'text-error'}`}>{formatCurrency(h.realized_profit, h.currency)}</span>
                              </div>
                            )}
                          </div>
                          <div className="holding-currency">{h.currency}</div>
                        </div>
                        {h.asset_type !== 'cash' && (
                          <details className="price-history-details">
                            <summary>Price history</summary>
                            <div className="price-history-list">
                              {priceHistory.map((point) => (
                                <div key={point.id} className="price-history-row">
                                  <span>{formatDate(point.price_date)}</span>
                                  <strong>{formatCurrency(point.price, h.currency)}</strong>
                                  {point.notes && <em>{point.notes}</em>}
                                  <button className="btn-icon danger" onClick={() => deleteHistory(point.id)} title="Delete price point"><Trash2 size={13} /></button>
                                </div>
                              ))}
                              {priceHistory.length === 0 && <div className="price-history-empty">No price history yet.</div>}
                            </div>
                          </details>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            ) : (
              <div className="portfolio-select-empty">
                <TrendingUp size={28} />
                <h2>Asset Type Details</h2>
                <p>No category selected.</p>
              </div>
            )}
          </div>
        </>
      )}

      {monthlyEditAsset && (
        <div className="modal-backdrop" onClick={closeMonthlyEdit}>
          <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Monthly Prices · {monthlyEditAsset.asset_name}</h2>
              <button className="btn-icon" onClick={closeMonthlyEdit}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p className="monthly-price-hint">
                Optional — fill in any month you have a price for since purchase. Empty rows stay empty; clearing a saved row removes it.
              </p>
              <div className="monthly-price-list">
                <div className="monthly-price-head">
                  <span>Month</span>
                  <span>Price ({monthlyEditAsset.currency})</span>
                  <span>Note</span>
                </div>
                {monthlyMonths.map((month) => {
                  const row = monthlyInputs[month]
                  if (!row) return null
                  return (
                    <div key={month} className="monthly-price-row">
                      <span className="monthly-price-month">{monthLabel(month)}</span>
                      <input
                        className="input input-sm"
                        type="number"
                        step="any"
                        min="0"
                        placeholder="—"
                        value={row.price}
                        onChange={(e) => setMonthlyField(month, 'price', e.target.value)}
                      />
                      <input
                        className="input input-sm"
                        type="text"
                        placeholder="Optional note"
                        value={row.notes}
                        onChange={(e) => setMonthlyField(month, 'notes', e.target.value)}
                      />
                    </div>
                  )
                })}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={closeMonthlyEdit} disabled={savingMonthly}>Cancel</button>
                <button type="button" className="btn" onClick={saveMonthlyPrices} disabled={savingMonthly}>
                  {savingMonthly ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
