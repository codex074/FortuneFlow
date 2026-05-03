import { useMemo, useState } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as Q from '../lib/queries'
import { computeHoldings, groupByAssetType } from '../lib/calc'
import { formatCurrency, formatNumber, formatPct } from '../lib/format'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType } from '../types'
import { ChevronDown, ChevronRight, Edit3, Check } from 'lucide-react'

export function PortfolioPage() {
  const { db, version, persist } = useDatabase()
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(Object.keys(ASSET_TYPE_LABELS)))
  const [editingPrice, setEditingPrice] = useState<string | null>(null)
  const [priceInput, setPriceInput] = useState('')

  const { grouped, holdings } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const h = computeHoldings(transactions, assets)
    return { grouped: groupByAssetType(h), holdings: h }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version])

  const toggleGroup = (type: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

  const startEditPrice = (assetName: string, currentPrice: number | null) => {
    setEditingPrice(assetName)
    setPriceInput(currentPrice !== null ? String(currentPrice) : '')
  }

  const savePrice = (assetName: string) => {
    const price = parseFloat(priceInput)
    if (!isNaN(price) && price >= 0) {
      Q.updateAssetPrice(db, assetName, price)
      persist()
    }
    setEditingPrice(null)
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
        <div className="portfolio-groups">
          {Array.from(grouped.entries()).map(([type, items]) => {
            const isExpanded = expandedGroups.has(type)
            return (
              <div key={type} className="portfolio-group">
                <button className="group-header" onClick={() => toggleGroup(type)}>
                  <span className="group-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[type as AssetType] }} />
                  <span className="group-title">{ASSET_TYPE_LABELS[type as AssetType]}</span>
                  <span className="group-count">{items.length}</span>
                  {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </button>
                {isExpanded && (
                  <div className="holdings-list">
                    {items.map((h) => (
                      <div key={h.asset_name} className="holding-card card">
                        <div className="holding-header">
                          <div className="holding-name">{h.asset_name}</div>
                          <div className="holding-currency">{h.currency}</div>
                        </div>
                        <div className="holding-grid">
                          <div className="holding-stat">
                            <span className="stat-label">Units</span>
                            <span className="stat-value">{formatNumber(h.units, 4)}</span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">Avg Cost</span>
                            <span className="stat-value">{formatCurrency(h.avg_cost, h.currency)}</span>
                          </div>
                          <div className="holding-stat">
                            <span className="stat-label">Current Price</span>
                            <span className="stat-value">
                              {editingPrice === h.asset_name ? (
                                <span className="inline-edit">
                                  <input
                                    className="input input-sm"
                                    type="number"
                                    step="any"
                                    value={priceInput}
                                    onChange={(e) => setPriceInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && savePrice(h.asset_name)}
                                    autoFocus
                                  />
                                  <button className="btn-icon" onClick={() => savePrice(h.asset_name)}><Check size={14} /></button>
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
                            <span className="stat-label">P/L</span>
                            <span className={`stat-value ${h.profit_loss !== null ? (h.profit_loss >= 0 ? 'text-success' : 'text-error') : ''}`}>
                              {h.profit_loss !== null
                                ? `${formatCurrency(h.profit_loss, h.currency)} (${formatPct(h.profit_loss_pct ?? 0)})`
                                : '--'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
