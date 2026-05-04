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
} from '../lib/calc'
import { formatCurrency, formatPct, formatDate } from '../lib/format'
import { ASSET_TYPE_LABELS, ASSET_TYPE_COLORS, type AssetType } from '../types'
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
import { CalendarDays, TrendingUp, TrendingDown, Wallet, DollarSign, CheckCircle } from 'lucide-react'

export function DashboardPage() {
  const { db, version } = useDatabase()
  const currentYear = new Date().getFullYear()
  const [selectedYear, setSelectedYear] = useState(currentYear)

  const { totals, allocation, recentTx, ytdFlow, ytdTrend, quarterlyGrowth, availableYears } = useMemo(() => {
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

  const unrealizedPositive = (totals.unrealizedProfitTHB ?? 0) >= 0
  const realizedPositive = totals.realizedProfitTHB >= 0
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
            <div className="metric-value">{formatCurrency(totals.totalInvestedTHB, 'THB')}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap sky"><DollarSign size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">Total Invested (USD)</div>
            <div className="metric-value">{formatCurrency(totals.totalInvestedUSD, 'USD')}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon-wrap teal"><Wallet size={18} /></div>
          <div className="metric-body">
            <div className="metric-label">Current Value (THB)</div>
            <div className="metric-value">
              {totals.totalValueTHB !== null ? formatCurrency(totals.totalValueTHB, 'THB') : '—'}
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className={`metric-icon-wrap ${unrealizedPositive ? 'emerald' : 'rose'}`}>
            {unrealizedPositive ? <TrendingUp size={18} /> : <TrendingDown size={18} />}
          </div>
          <div className="metric-body">
            <div className="metric-label">Unrealized P&amp;L</div>
            <div className={`metric-value ${unrealizedPositive ? 'success' : 'error'}`}>
              {totals.unrealizedProfitTHB !== null
                ? `${formatCurrency(totals.unrealizedProfitTHB, 'THB')} (${formatPct(totals.unrealizedProfitPct ?? 0)})`
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
              {formatCurrency(totals.realizedProfitTHB, 'THB')}
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
        <div className="card dashboard-card-wide">
          <h2 className="card-title">{selectedYear} YTD Net Investment</h2>
          {ytdTrend.some((point) => point.investedTHB !== 0 || point.soldTHB !== 0) ? (
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

        <div className="card dashboard-card-wide">
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

        <div className="card">
          <h2 className="card-title">Asset Allocation</h2>
          {allocation.length > 0 ? (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="type"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={110}
                    paddingAngle={2}
                  >
                    {allocation.map((entry) => (
                      <Cell key={entry.type} fill={ASSET_TYPE_COLORS[entry.type as AssetType]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value, 'THB')}
                    labelFormatter={(label: string) => ASSET_TYPE_LABELS[label as AssetType] ?? label}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="chart-legend">
                {allocation.map((entry) => (
                  <div key={entry.type} className="legend-item">
                    <span className="legend-dot" style={{ backgroundColor: ASSET_TYPE_COLORS[entry.type as AssetType] }} />
                    <span>{ASSET_TYPE_LABELS[entry.type as AssetType]}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">
              <p>No investments yet. Add your first transaction to see allocation.</p>
            </div>
          )}
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
    </div>
  )
}
