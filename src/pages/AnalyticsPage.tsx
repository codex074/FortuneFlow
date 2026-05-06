import { useMemo, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, ReferenceLine,
} from 'recharts'
import { useDatabase } from '../hooks/useDatabase'
import { useSettings } from '../hooks/useSettings'
import * as Q from '../lib/queries'
import { computeAnalytics, getDividendsByMonth, getDividendsByAsset } from '../lib/analytics'
import { formatCurrency } from '../lib/format'
import { TrendingUp, TrendingDown, Award, AlertTriangle, DollarSign, BarChart3 } from 'lucide-react'

const BENCHMARKS = [
  { name: 'S&P 500', xirr: 0.103, color: '#5645d4' },
  { name: 'SET Index', xirr: 0.052, color: '#2a9d99' },
  { name: 'Gold', xirr: 0.071, color: '#f5d75e' },
  { name: 'Cash (3%)', xirr: 0.030, color: '#94a3b8' },
]

function XIRRLabel({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">N/A</span>
  const pct = (value * 100).toFixed(1) + '%'
  const cls = value >= 0 ? 'text-green' : 'text-red'
  return <span className={cls}>{value >= 0 ? '+' : ''}{pct}</span>
}

function CAGRLabel({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted">N/A</span>
  const pct = (value * 100).toFixed(1) + '%'
  const cls = value >= 0 ? 'text-green' : 'text-red'
  return <span className={cls}>{value >= 0 ? '+' : ''}{pct}</span>
}

export function AnalyticsPage() {
  const { db, version } = useDatabase()
  const { exchangeRate } = useSettings()
  const [dividendYear, setDividendYear] = useState(new Date().getFullYear())

  const { analytics, dividendsByMonth, dividendsByAsset, availableYears } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const analytics = computeAnalytics(transactions, assets, exchangeRate)
    const dividendsByMonth = getDividendsByMonth(transactions, exchangeRate, dividendYear)
    const dividendsByAsset = getDividendsByAsset(transactions, exchangeRate)

    const years = new Set<number>()
    for (const tx of transactions) {
      if (tx.action === 'dividend' || tx.action === 'interest') years.add(parseInt(tx.date.slice(0, 4)))
    }
    if (years.size === 0) years.add(new Date().getFullYear())

    return { analytics, dividendsByMonth, dividendsByAsset, availableYears: [...years].sort((a, b) => b - a) }
  }, [db, version, exchangeRate, dividendYear])

  const benchmarkData = useMemo(() => {
    const portfolio = analytics.xirr !== null
      ? [{ name: 'My Portfolio', xirr: analytics.xirr, color: '#5856D6', isPortfolio: true }]
      : []
    return [...portfolio, ...BENCHMARKS.map(b => ({ ...b, isPortfolio: false }))]
  }, [analytics.xirr])

  const top3 = analytics.ranked_by_xirr.slice(0, 3)
  const worst3 = [...analytics.ranked_by_xirr].reverse().slice(0, 3)

  const totalDividend = analytics.total_dividends_thb

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Analytics</h1>
      </div>

      {/* Portfolio XIRR KPI */}
      <div className="metric-grid" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-icon-wrap violet">
            <BarChart3 size={18} />
          </div>
          <div className="metric-body">
            <p className="metric-label">Portfolio XIRR</p>
            <p className="metric-value">
              <XIRRLabel value={analytics.xirr} />
            </p>
            <p className="metric-sub">Annualized return on all investments</p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap emerald">
            <DollarSign size={18} />
          </div>
          <div className="metric-body">
            <p className="metric-label">Total Dividends & Interest</p>
            <p className="metric-value">{formatCurrency(totalDividend, 'THB')}</p>
            <p className="metric-sub">
              {analytics.dividend_yield !== null
                ? `Yield: ${(analytics.dividend_yield * 100).toFixed(2)}% on invested`
                : 'No dividend data'}
            </p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap sky">
            <TrendingUp size={18} />
          </div>
          <div className="metric-body">
            <p className="metric-label">Best XIRR</p>
            <p className="metric-value">
              <XIRRLabel value={top3[0]?.xirr ?? null} />
            </p>
            <p className="metric-sub">{top3[0]?.asset_name ?? '—'}</p>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-icon-wrap rose">
            <TrendingDown size={18} />
          </div>
          <div className="metric-body">
            <p className="metric-label">Worst XIRR</p>
            <p className="metric-value">
              <XIRRLabel value={worst3[0]?.xirr ?? null} />
            </p>
            <p className="metric-sub">{worst3[0]?.asset_name ?? '—'}</p>
          </div>
        </div>
      </div>

      <div className="analytics-grid">
        {/* Best & Worst Performers */}
        <div className="analytics-card">
          <div className="analytics-card-header">
            <Award size={16} />
            <h3>Best Performers</h3>
          </div>
          {top3.length === 0 ? (
            <p className="text-muted empty-hint">Add current prices to your holdings to see rankings.</p>
          ) : (
            <div className="performer-list">
              {top3.map((a, i) => (
                <div key={a.asset_name} className="performer-row">
                  <span className={`performer-rank rank-${i + 1}`}>{i + 1}</span>
                  <div className="performer-info">
                    <span className="performer-name">{a.asset_name}</span>
                    <span className="performer-type">{a.asset_type}</span>
                  </div>
                  <div className="performer-stats">
                    <span className="text-green font-bold"><XIRRLabel value={a.xirr} /></span>
                    <span className="text-muted" style={{ fontSize: 11 }}>CAGR <CAGRLabel value={a.cagr} /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="analytics-card">
          <div className="analytics-card-header">
            <AlertTriangle size={16} />
            <h3>Worst Performers</h3>
          </div>
          {worst3.length === 0 ? (
            <p className="text-muted empty-hint">Add current prices to your holdings to see rankings.</p>
          ) : (
            <div className="performer-list">
              {worst3.map((a, i) => (
                <div key={a.asset_name} className="performer-row">
                  <span className="performer-rank rank-worst">{i + 1}</span>
                  <div className="performer-info">
                    <span className="performer-name">{a.asset_name}</span>
                    <span className="performer-type">{a.asset_type}</span>
                  </div>
                  <div className="performer-stats">
                    <span className="text-red font-bold"><XIRRLabel value={a.xirr} /></span>
                    <span className="text-muted" style={{ fontSize: 11 }}>CAGR <CAGRLabel value={a.cagr} /></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Benchmark Comparison */}
        <div className="analytics-card analytics-card-wide">
          <div className="analytics-card-header">
            <BarChart3 size={16} />
            <h3>Benchmark Comparison</h3>
            <span className="analytics-note">Historical averages for reference</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={benchmarkData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, 'XIRR']}
                contentStyle={{ borderRadius: 8, fontSize: 13 }}
              />
              <ReferenceLine y={0} stroke="#e2e8f0" />
              <Bar dataKey="xirr" radius={[4, 4, 0, 0]}>
                {benchmarkData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} opacity={entry.isPortfolio ? 1 : 0.65} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Dividend Income by Month */}
        <div className="analytics-card analytics-card-wide">
          <div className="analytics-card-header">
            <DollarSign size={16} />
            <h3>Dividend & Interest Income</h3>
            <select
              className="analytics-year-select"
              value={dividendYear}
              onChange={(e) => setDividendYear(parseInt(e.target.value))}
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          {totalDividend === 0 ? (
            <p className="text-muted empty-hint">No dividend or interest transactions recorded yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={dividendsByMonth} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v: number) => [formatCurrency(v, 'THB'), 'Dividend']}
                  contentStyle={{ borderRadius: 8, fontSize: 13 }}
                />
                <Bar dataKey="amount" fill="#059669" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}

          {dividendsByAsset.length > 0 && (
            <div className="dividend-asset-list">
              {dividendsByAsset.slice(0, 6).map((d) => (
                <div key={d.asset_name} className="dividend-asset-row">
                  <span className="performer-name">{d.asset_name}</span>
                  <span className="text-muted" style={{ fontSize: 12 }}>{d.count}×</span>
                  <span className="font-bold text-green">{formatCurrency(d.total, 'THB')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* XIRR & CAGR per Asset */}
        <div className="analytics-card analytics-card-full">
          <div className="analytics-card-header">
            <TrendingUp size={16} />
            <h3>XIRR & CAGR per Asset</h3>
          </div>
          {analytics.assets.length === 0 ? (
            <p className="text-muted empty-hint">No holdings to analyze.</p>
          ) : (
            <div className="table-wrapper" style={{ marginTop: 8 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Holding Period</th>
                    <th>Total Invested</th>
                    <th>Current Value</th>
                    <th>XIRR</th>
                    <th>CAGR</th>
                    <th>Dividends</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.assets.map((a) => (
                    <tr key={a.asset_name}>
                      <td className="font-medium">{a.asset_name}</td>
                      <td><span className="badge-tag">{a.asset_type}</span></td>
                      <td className="text-muted">
                        {a.holding_days >= 365
                          ? `${(a.holding_days / 365).toFixed(1)}y`
                          : `${a.holding_days}d`}
                      </td>
                      <td>{formatCurrency(a.total_invested, a.currency)}</td>
                      <td>{a.current_value !== null ? formatCurrency(a.current_value, a.currency) : <span className="text-muted">No price</span>}</td>
                      <td><XIRRLabel value={a.xirr} /></td>
                      <td><CAGRLabel value={a.cagr} /></td>
                      <td>
                        {a.total_dividends > 0
                          ? <span className="text-green">{formatCurrency(a.total_dividends, a.currency)}</span>
                          : <span className="text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
