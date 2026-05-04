import { useMemo, useState } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as Q from '../lib/queries'
import { allocationByType, computeHoldings, computeTotals, groupByAssetType } from '../lib/calc'
import { formatCurrency, formatDate, formatNumber, formatPct, todayISO } from '../lib/format'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType, type Currency } from '../types'
import { Check, Edit3, Trash2, Wallet, TrendingUp } from 'lucide-react'
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'

function formatSharePct(value: number): string {
  return `${value.toFixed(1)}%`
}

export function PortfolioPage() {
  const { db, version, persist } = useDatabase()
  const [selectedType, setSelectedType] = useState<AssetType | null>(null)
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')
  const [priceDateInput, setPriceDateInput] = useState(todayISO())
  const [priceNotesInput, setPriceNotesInput] = useState('')

  const { holdings, totals, typeSummaries } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const rateStr = Q.getSetting(db, 'exchange_rate_thb_usd')
    const exchangeRate = rateStr ? parseFloat(rateStr) : 35.0
    const h = computeHoldings(transactions, assets)
    const grouped = groupByAssetType(h)
    const allocation = allocationByType(h, exchangeRate)
    const totalAllocationTHB = allocation.reduce((sum, item) => sum + item.value, 0)

    const summaries = allocation.map((item) => {
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
      holdings: h,
      totals: computeTotals(h, exchangeRate),
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

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Portfolio</h1>
      </div>

      {holdings.length === 0 ? (
        <div className="empty-state card">
          <p>No holdings yet. Add transactions to see your portfolio.</p>
        </div>
      ) : (
        <div className="portfolio-dashboard">
          <div className="card portfolio-chart-card">
            <div className="portfolio-card-header">
              <div>
                <h2 className="card-title">Allocation by Type</h2>
                <p className="card-desc">Portfolio value split across asset categories.</p>
              </div>
              <div className="portfolio-total-pill">
                <Wallet size={16} />
                <span>{formatCurrency(totals.totalInvestedTHB, 'THB')}</span>
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
                  {totals.totalValueTHB !== null
                    ? formatCurrency(totals.totalValueTHB, 'THB')
                    : formatCurrency(totals.totalInvestedTHB, 'THB')}
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
                      <div className="holding-header">
                        <div>
                          <div className="holding-name">{h.asset_name}</div>
                          <div className="portfolio-holding-sub">
                            {h.asset_type === 'cash' ? 'Available cash balance' : `${formatNumber(h.units, 4)} units`}
                          </div>
                        </div>
                        <div className="holding-currency">{h.currency}</div>
                      </div>
                      <div className="holding-grid">
                        <div className="holding-stat">
                          <span className="stat-label">{h.asset_type === 'cash' ? 'Balance' : 'Avg Cost'}</span>
                          <span className="stat-value">
                            {h.asset_type === 'cash' ? formatCurrency(h.current_value ?? 0, h.currency) : formatCurrency(h.avg_cost, h.currency)}
                          </span>
                        </div>
                        <div className="holding-stat">
                          <span className="stat-label">{h.asset_type === 'cash' ? 'Rate' : 'Current Price'}</span>
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
                      {h.asset_type !== 'cash' && (
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
        </div>
      )}
    </div>
  )
}
