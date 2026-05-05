import { useMemo, useState } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as Q from '../lib/queries'
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
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType, type Currency } from '../types'
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
  Check,
  Edit3,
  Trash2,
  X,
} from 'lucide-react'

function formatSharePct(value: number): string {
  return `${value.toFixed(1)}%`
}

export function DashboardPage() {
  const { db, version, persist } = useDatabase()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedType, setSelectedType] = useState<AssetType | null>(null)
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [priceDateInput, setPriceDateInput] = useState(todayISO())
  const [priceNotesInput, setPriceNotesInput] = useState('')

  const { recentTx, ytdFlow, ytdTrend, quarterlyGrowth, availableYears } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const priceHistory = Q.getAllPriceHistory(db)
    const rateStr = Q.getSetting(db, 'exchange_rate_thb_usd')
    const exchangeRate = rateStr ? parseFloat(rateStr) : 35.0
    const yearOptions = Array.from(
      new Set([
        currentYear,
        ...transactions.map((tx) => Number(tx.date.slice(0, 4))).filter(Number.isFinite),
        ...priceHistory.map((point) => Number(point.price_date.slice(0, 4))).filter(Number.isFinite),
      ])
    ).sort((a, b) => b - a)
    const yearTransactions = transactions.filter((tx) => Number(tx.date.slice(0, 4)) === selectedYear)

    const holdings = computeHoldings(yearTransactions, assets)
    return {
      totals: computeTotals(holdings, exchangeRate),
      allocation: allocationByType(holdings, exchangeRate),
      recentTx: yearTransactions.slice(0, 8),
      ytdFlow: computeYtdFlow(transactions, exchangeRate, new Date(), selectedYear),
      ytdTrend: computeYtdInvestmentTrend(transactions, exchangeRate, selectedYear),
      quarterlyGrowth: computeQuarterlyPortfolioGrowth(transactions, priceHistory, exchangeRate, new Date(), 8, selectedYear),
      availableYears: yearOptions,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version, selectedYear, currentYear])

  const { portfolioHoldings, portfolioTotals, typeSummaries } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const rateStr = Q.getSetting(db, 'exchange_rate_thb_usd')
    const exchangeRate = rateStr ? parseFloat(rateStr) : 35.0
    const h = computeHoldings(transactions, assets)
    const grouped = groupByAssetType(h)
    const portfolioAlloc = allocationByType(h, exchangeRate)
    const totalAllocationTHB = portfolioAlloc.reduce((sum, item) => sum + item.value, 0)

    const summaries = portfolioAlloc.map((item) => {
      const type = item.type as AssetType
      const items = grouped.get(type) ?? []
      const investedTHB = items.reduce((sum, holding) => {
        const rate = holding.currency === 'USD' ? exchangeRate : 1
        return sum + holding.total_invested * rate
      }, 0)
      const unrealizedProfitTHB = items.reduce((sum, holding) => {
        const rate = holding.currency === 'USD' ? exchangeRate : 1
        return sum + (holding.unrealized_profit ?? 0) * rate
      }, 0)
      const realizedProfitTHB = items.reduce((sum, holding) => {
        const rate = holding.currency === 'USD' ? exchangeRate : 1
        return sum + holding.realized_profit * rate
      }, 0)
      const hasAllPrices = items.every((holding) => holding.current_value !== null)

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

    return {
      portfolioHoldings: h,
      portfolioTotals: computeTotals(h, exchangeRate),
      typeSummaries: summaries,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version])

  const selectedSummary = selectedType
    ? typeSummaries.find((summary) => summary.type === selectedType) ?? null
    : null

  const handleTypeSelect = (type: AssetType) => {
    setSelectedType(type)
    setEditingPrice(null)
  }

  const handlePieClick = (entry: unknown) => {
    const type = (entry as { type?: AssetType }).type
    if (type) handleTypeSelect(type)
  }

  const startEditPrice = (assetName: string, currentPrice: number | null) => {
    setEditingPrice(assetName)
    setPriceInput(currentPrice !== null ? String(currentPrice) : '')
    setPriceDateInput(todayISO())
    setPriceNotesInput('')
  }

  const savePrice = (assetName: string, currency: Currency) => {
    const price = parseFloat(priceInput)
    if (!isNaN(price) && price >= 0 && priceDateInput) {
      Q.upsertPriceHistory(db, assetName, currency, priceDateInput, price, priceNotesInput)
      persist()
    }
    setEditingPrice(null)
  }

  const deleteHistory = (id: number) => {
    Q.deletePriceHistory(db, id)
    persist()
  }

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
                  <XAxis
                    dataKey="month"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#787671', fontSize: 12 }}
                  />
                  <YAxis
                    width={88}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#787671', fontSize: 12 }}
                    tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [
                      formatCurrency(Number(value), 'THB'),
                      name,
                    ]}
                    labelFormatter={(label: string) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeTHB"
                    name="YTD Net"
                    stroke="#2a9d99"
                    strokeWidth={3}
                    fill="url(#ytdInvestmentFill)"
                    dot={{ r: 3, fill: '#2a9d99', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <p>No YTD data for {selectedYear}. Add transactions to see the trend.</p>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="card-title">{selectedYear} Quarterly Portfolio Growth</h2>
          {quarterlyGrowth.length > 0 && quarterlyGrowth.some((point) => point.valueTHB !== 0 || point.netFlowTHB !== 0) ? (
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
                  <XAxis
                    dataKey="quarter"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#787671', fontSize: 12 }}
                  />
                  <YAxis
                    width={88}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#787671', fontSize: 12 }}
                    tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value: number | string, name: string) => [
                      formatCurrency(Number(value), 'THB'),
                      name,
                    ]}
                    labelFormatter={(label: string) => label}
                  />
                  <Area
                    type="monotone"
                    dataKey="valueTHB"
                    name="Portfolio"
                    stroke="#5645d4"
                    strokeWidth={3}
                    fill="url(#portfolioGrowthFill)"
                    dot={{ r: 3, fill: '#5645d4', strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state">
              <p>No quarterly data yet. Add transactions to see portfolio growth.</p>
            </div>
          )}
        </div>

      </div>

      {portfolioHoldings.length === 0 ? (
        <div className="empty-state card">
          <p>No holdings yet. Add transactions to see your portfolio.</p>
        </div>
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
                  <Pie
                    data={typeSummaries}
                    dataKey="valueTHB"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={82}
                    outerRadius={126}
                    paddingAngle={3}
                    onClick={handlePieClick}
                  >
                    {typeSummaries.map((summary) => (
                      <Cell
                        key={summary.type}
                        fill={ASSET_TYPE_COLORS[summary.type]}
                        stroke={selectedType === summary.type ? '#0a1530' : '#ffffff'}
                        strokeWidth={selectedType === summary.type ? 4 : 2}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number | string) => formatCurrency(Number(value), 'THB')}
                    labelFormatter={(label: string) => label}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="portfolio-chart-center">
                <span>Total Value</span>
                <strong>
                  {portfolioTotals.totalValueTHB !== null
                    ? formatCurrency(portfolioTotals.totalValueTHB, 'THB')
                    : formatCurrency(portfolioTotals.totalInvestedTHB, 'THB')}
                </strong>
              </div>
            </div>

            <div className="portfolio-type-grid">
              {typeSummaries.map((summary) => (
                <button
                  key={summary.type}
                  className={`portfolio-type-button ${selectedType === summary.type ? 'active' : ''}`}
                  onClick={() => handleTypeSelect(summary.type)}
                >
                  <span className="legend-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[summary.type] }} />
                  <span className="portfolio-type-name">{summary.label}</span>
                  <span className="portfolio-type-meta">{formatSharePct(summary.percentage)}</span>
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
                        {tx.action === 'deposit' || tx.action === 'withdraw' || tx.action === 'dividend'
                          ? ASSET_TYPE_LABELS[tx.asset_type]
                          : `${tx.units} units`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <p>No transactions yet.</p>
              </div>
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
                <div className="portfolio-metric">
                  <span className="stat-label">Assets</span>
                  <strong>{selectedSummary.items.length}</strong>
                </div>
                <div className="portfolio-metric">
                  <span className="stat-label">Value</span>
                  <strong>{formatCurrency(selectedSummary.valueTHB, 'THB')}</strong>
                </div>
                <div className="portfolio-metric">
                  <span className="stat-label">Unrealized P&amp;L</span>
                  <strong className={selectedSummary.unrealizedProfitTHB !== null ? (selectedSummary.unrealizedProfitTHB < 0 ? 'text-error' : 'text-success') : ''}>
                    {selectedSummary.unrealizedProfitTHB !== null ? formatCurrency(selectedSummary.unrealizedProfitTHB, 'THB') : '--'}
                  </strong>
                </div>
                <div className="portfolio-metric">
                  <span className="stat-label">Realized P&amp;L</span>
                  <strong className={selectedSummary.realizedProfitTHB < 0 ? 'text-error' : 'text-success'}>
                    {formatCurrency(selectedSummary.realizedProfitTHB, 'THB')}
                  </strong>
                </div>
              </div>

              <div className="portfolio-holding-list">
                {selectedSummary.items.map((h) => {
                  const priceHistory = h.asset_type !== 'cash'
                    ? Q.getPriceHistory(db, h.asset_name, h.currency, 5)
                    : []

                  return (
                    <div key={h.asset_name} className="portfolio-holding-item">
                      <div className="holding-row">
                        <div className="holding-identity">
                          <span className="holding-name">{h.asset_name}</span>
                          <span className="portfolio-holding-sub">
                            {h.asset_type === 'cash' ? 'Cash balance' : `${formatNumber(h.units, 4)} units`}
                          </span>
                        </div>
                        <div className="holding-stats-inline">
                          <div className="holding-stat">
                            <span className="stat-label">{h.asset_type === 'cash' ? 'Balance' : 'Avg Cost'}</span>
                            <span className="stat-value">
                              {h.asset_type === 'cash' ? formatCurrency(h.current_value ?? 0, h.currency) : formatCurrency(h.avg_cost, h.currency)}
                            </span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">{h.asset_type === 'cash' ? 'Rate' : 'Price'}</span>
                            <span className="stat-value">
                              {h.asset_type === 'cash' ? (
                                '1.00'
                              ) : editingPrice === h.asset_name ? (
                                <span className="price-edit-panel">
                                  <input
                                    className="input input-sm"
                                    type="number"
                                    step="any"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && savePrice(h.asset_name, h.currency)}
                                    autoFocus
                                  />
                                  <input
                                    className="input input-sm"
                                    type="date"
                                    value={priceDateInput}
                                    onChange={(e) => setPriceDateInput(e.target.value)}
                                  />
                                  <input
                                    className="input input-sm price-note-input"
                                    type="text"
                                    placeholder="Note"
                                    value={priceNotesInput}
                                    onChange={(e) => setPriceNotesInput(e.target.value)}
                                  />
                                  <button className="btn-icon" onClick={() => savePrice(h.asset_name, h.currency)}><Check size={14} /></button>
                                  <button className="btn-icon" onClick={() => setEditingPrice(null)}><X size={14} /></button>
                                </span>
                              ) : (
                                <span className="editable" onClick={() => startEditPrice(h.asset_name, h.current_price)}>
                                  {h.current_price !== null ? formatCurrency(h.current_price, h.currency) : 'Set price'}
                                  <Edit3 size={12} />
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">Invested</span>
                            <span className="stat-value">{formatCurrency(h.total_invested, h.currency)}</span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">Value</span>
                            <span className="stat-value">
                              {h.current_value !== null ? formatCurrency(h.current_value, h.currency) : '--'}
                            </span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">Unrealized P&amp;L</span>
                            <span className={`stat-value ${h.unrealized_profit !== null ? (h.unrealized_profit >= 0 ? 'text-success' : 'text-error') : ''}`}>
                              {h.unrealized_profit !== null
                                ? `${formatCurrency(h.unrealized_profit, h.currency)} (${formatPct(h.unrealized_profit_pct ?? 0)})`
                                : '--'}
                            </span>
                          </div>
                          {h.realized_profit !== 0 && (
                            <div className="holding-stat">
                              <span className="stat-label">Realized P&amp;L</span>
                              <span className={`stat-value ${h.realized_profit >= 0 ? 'text-success' : 'text-error'}`}>
                                {formatCurrency(h.realized_profit, h.currency)}
                              </span>
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
                                <button className="btn-icon danger" onClick={() => deleteHistory(point.id)} title="Delete price point">
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                            {priceHistory.length === 0 && (
                              <div className="price-history-empty">No price history yet.</div>
                            )}
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
    </div>
  )
}
