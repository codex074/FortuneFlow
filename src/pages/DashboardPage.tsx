import { useMemo } from 'react'
import { useDatabase } from '../hooks/useDatabase'
import * as Q from '../lib/queries'
import {
  computeHoldings,
  computeTotals,
  allocationByType,
  computeYtdFlow,
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
import { CalendarDays, TrendingUp, TrendingDown, Wallet, DollarSign } from 'lucide-react'

export function DashboardPage() {
  const { db, version } = useDatabase()

  const { totals, allocation, recentTx, ytdFlow, quarterlyGrowth } = useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const rateStr = Q.getSetting(db, 'exchange_rate_thb_usd')
    const exchangeRate = rateStr ? parseFloat(rateStr) : 35.0

    const holdings = computeHoldings(transactions, assets)
    return {
      totals: computeTotals(holdings, exchangeRate),
      allocation: allocationByType(holdings, exchangeRate),
      recentTx: Q.getRecentTransactions(db, 8),
      ytdFlow: computeYtdFlow(transactions, exchangeRate),
      quarterlyGrowth: computeQuarterlyPortfolioGrowth(transactions, exchangeRate),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, version])

  const profitPositive = (totals.profitLossTHB ?? 0) >= 0
  const ytdPositive = ytdFlow.netInvestedTHB >= 0

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="summary-grid">
        <div className="summary-card tint-lavender">
          <div className="summary-icon"><Wallet size={24} /></div>
          <div className="summary-label">Total Invested (THB)</div>
          <div className="summary-value">{formatCurrency(totals.totalInvestedTHB, 'THB')}</div>
        </div>
        <div className="summary-card tint-sky">
          <div className="summary-icon"><DollarSign size={24} /></div>
          <div className="summary-label">Total Invested (USD)</div>
          <div className="summary-value">{formatCurrency(totals.totalInvestedUSD, 'USD')}</div>
        </div>
        <div className="summary-card tint-mint">
          <div className="summary-icon"><Wallet size={24} /></div>
          <div className="summary-label">Current Value (THB)</div>
          <div className="summary-value">
            {totals.totalValueTHB !== null ? formatCurrency(totals.totalValueTHB, 'THB') : '-- Update prices --'}
          </div>
        </div>
        <div className={`summary-card ${profitPositive ? 'tint-mint' : 'tint-rose'}`}>
          <div className="summary-icon">{profitPositive ? <TrendingUp size={24} /> : <TrendingDown size={24} />}</div>
          <div className="summary-label">Profit / Loss</div>
          <div className={`summary-value ${profitPositive ? 'text-success' : 'text-error'}`}>
            {totals.profitLossTHB !== null
              ? `${formatCurrency(totals.profitLossTHB, 'THB')} (${formatPct(totals.profitLossPct ?? 0)})`
              : '-- Update prices --'}
          </div>
        </div>
        <div className={`summary-card ${ytdPositive ? 'tint-yellow' : 'tint-rose'}`}>
          <div className="summary-icon"><CalendarDays size={24} /></div>
          <div className="summary-label">YTD Net Invested</div>
          <div className={`summary-value ${ytdPositive ? '' : 'text-error'}`}>
            {formatCurrency(ytdFlow.netInvestedTHB, 'THB')}
            {ytdFlow.growthPct !== null ? ` (${formatPct(ytdFlow.growthPct)})` : ''}
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card dashboard-card-wide">
          <h2 className="card-title">Quarterly Portfolio Growth</h2>
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
                    <div className="recent-tx-units">{tx.units} units</div>
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
