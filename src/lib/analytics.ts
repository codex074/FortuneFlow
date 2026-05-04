import type { Transaction, Asset, AssetType, Currency } from '../types'
import { computeXIRR } from './xirr'
import { fifoSell, type FifoLot } from './calc'

export interface AssetMetrics {
  asset_name: string
  asset_type: AssetType
  currency: Currency
  units: number
  total_invested: number
  current_value: number | null
  unrealized_profit: number | null
  realized_profit: number
  total_dividends: number
  xirr: number | null
  cagr: number | null
  first_buy_date: string
  holding_days: number
}

export interface PortfolioAnalytics {
  xirr: number | null
  total_invested_thb: number
  current_value_thb: number | null
  total_dividends_thb: number
  dividend_yield: number | null
  assets: AssetMetrics[]
  ranked_by_xirr: AssetMetrics[]
}

export interface DividendByMonth {
  month: string
  amount: number
}

export interface DividendByAsset {
  asset_name: string
  currency: Currency
  total: number
  count: number
}

function parseDate(dateStr: string): Date {
  return new Date(dateStr + 'T00:00:00')
}

export function computeAnalytics(
  transactions: Transaction[],
  assets: Asset[],
  exchangeRate: number,
  today = new Date()
): PortfolioAnalytics {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const assetMap = new Map(assets.map(a => [a.name, a]))

  type AssetState = {
    units: number
    totalCost: number
    lots: FifoLot[]
    realizedProfit: number
    totalDividends: number
    firstBuyDate: string
    currency: Currency
    assetType: AssetType
    cashflows: { amount: number; date: Date }[]
  }

  const stateMap = new Map<string, AssetState>()
  const portfolioCashflows: { amount: number; date: Date }[] = []
  let totalDividendsTHB = 0

  for (const tx of sorted) {
    if (!stateMap.has(tx.asset_name)) {
      stateMap.set(tx.asset_name, {
        units: 0, totalCost: 0, lots: [], realizedProfit: 0, totalDividends: 0,
        firstBuyDate: '', currency: tx.currency, assetType: tx.asset_type, cashflows: [],
      })
    }
    const s = stateMap.get(tx.asset_name)!
    const txDate = parseDate(tx.date)
    const rate = tx.currency === 'USD' ? exchangeRate : 1

    if (tx.action === 'buy') {
      if (!s.firstBuyDate) s.firstBuyDate = tx.date
      s.units += tx.units
      s.totalCost += tx.total_cost
      s.lots.push({ units: tx.units, costPerUnit: tx.total_cost / tx.units })
      s.cashflows.push({ amount: -tx.total_cost, date: txDate })
      portfolioCashflows.push({ amount: -tx.total_cost * rate, date: txDate })
    } else if (tx.action === 'sell') {
      const costBasis = fifoSell(s.lots, tx.units)
      const proceeds = tx.price_per_unit * tx.units - tx.fees
      s.realizedProfit += proceeds - costBasis
      s.units -= tx.units
      s.totalCost -= costBasis
      s.cashflows.push({ amount: proceeds, date: txDate })
      portfolioCashflows.push({ amount: proceeds * rate, date: txDate })
    } else if (tx.action === 'dividend') {
      s.totalDividends += tx.total_cost
      totalDividendsTHB += tx.total_cost * rate
      s.cashflows.push({ amount: tx.total_cost, date: txDate })
      portfolioCashflows.push({ amount: tx.total_cost * rate, date: txDate })
    }
  }

  const assetMetrics: AssetMetrics[] = []
  let totalInvestedTHB = 0
  let currentValueTHB = 0
  let hasMissingPrices = false

  for (const [name, s] of stateMap) {
    if (s.units <= 0.0001) continue

    const asset = assetMap.get(name)
    const currentPrice = asset?.current_price ?? null
    const currentValue = currentPrice !== null ? currentPrice * s.units : null
    const rate = s.currency === 'USD' ? exchangeRate : 1

    totalInvestedTHB += s.totalCost * rate

    let assetXirr: number | null = null
    let cagr: number | null = null

    if (currentValue !== null) {
      currentValueTHB += currentValue * rate
      assetXirr = computeXIRR([...s.cashflows, { amount: currentValue, date: today }])

      if (s.firstBuyDate && s.totalCost > 0) {
        const years = (today.getTime() - parseDate(s.firstBuyDate).getTime()) / (365.25 * 24 * 3600 * 1000)
        if (years >= 0.083) {
          const totalReturn = (currentValue + s.realizedProfit + s.totalDividends) / s.totalCost
          if (totalReturn > 0) cagr = Math.pow(totalReturn, 1 / years) - 1
        }
      }
    } else {
      hasMissingPrices = true
    }

    const holdingDays = s.firstBuyDate
      ? Math.floor((today.getTime() - parseDate(s.firstBuyDate).getTime()) / (24 * 3600 * 1000))
      : 0

    assetMetrics.push({
      asset_name: name,
      asset_type: s.assetType,
      currency: s.currency,
      units: s.units,
      total_invested: s.totalCost,
      current_value: currentValue,
      unrealized_profit: currentValue !== null ? currentValue - s.totalCost : null,
      realized_profit: s.realizedProfit,
      total_dividends: s.totalDividends,
      xirr: assetXirr,
      cagr,
      first_buy_date: s.firstBuyDate,
      holding_days: holdingDays,
    })
  }

  let portfolioXirr: number | null = null
  if (!hasMissingPrices && currentValueTHB > 0 && portfolioCashflows.length > 0) {
    portfolioXirr = computeXIRR([...portfolioCashflows, { amount: currentValueTHB, date: today }])
  }

  const ranked = [...assetMetrics]
    .filter(a => a.xirr !== null && a.current_value !== null)
    .sort((a, b) => (b.xirr ?? 0) - (a.xirr ?? 0))

  return {
    xirr: portfolioXirr,
    total_invested_thb: totalInvestedTHB,
    current_value_thb: hasMissingPrices ? null : currentValueTHB,
    total_dividends_thb: totalDividendsTHB,
    dividend_yield: totalInvestedTHB > 0 && totalDividendsTHB > 0
      ? totalDividendsTHB / totalInvestedTHB
      : null,
    assets: assetMetrics,
    ranked_by_xirr: ranked,
  }
}

export function getDividendsByMonth(
  transactions: Transaction[],
  exchangeRate: number,
  year: number
): DividendByMonth[] {
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2024, i, 1).toLocaleDateString('en-US', { month: 'short' }),
    amount: 0,
  }))

  for (const tx of transactions) {
    if (tx.action !== 'dividend') continue
    if (parseInt(tx.date.slice(0, 4)) !== year) continue
    const m = parseInt(tx.date.slice(5, 7)) - 1
    if (m < 0 || m > 11) continue
    const rate = tx.currency === 'USD' ? exchangeRate : 1
    monthly[m]!.amount += tx.total_cost * rate
  }

  return monthly
}

export function getDividendsByAsset(
  transactions: Transaction[],
  exchangeRate: number
): DividendByAsset[] {
  const map = new Map<string, DividendByAsset>()

  for (const tx of transactions) {
    if (tx.action !== 'dividend') continue
    const rate = tx.currency === 'USD' ? exchangeRate : 1
    const existing = map.get(tx.asset_name) ?? {
      asset_name: tx.asset_name, currency: tx.currency, total: 0, count: 0,
    }
    existing.total += tx.total_cost * rate
    existing.count++
    map.set(tx.asset_name, existing)
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total)
}
