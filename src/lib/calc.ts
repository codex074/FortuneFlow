import type { Transaction, Asset, Holding, AssetType } from '../types'

function transactionValueTHB(tx: Transaction, exchangeRate: number): number {
  const rate = tx.currency === 'USD' ? exchangeRate : 1
  return tx.total_cost * rate
}

export function computeHoldings(transactions: Transaction[], assets: Asset[]): Holding[] {
  const map = new Map<string, { units: number; totalCost: number; asset_type: AssetType; currency: Transaction['currency'] }>()

  for (const tx of transactions) {
    const existing = map.get(tx.asset_name) ?? {
      units: 0,
      totalCost: 0,
      asset_type: tx.asset_type,
      currency: tx.currency,
    }

    if (tx.action === 'buy') {
      existing.units += tx.units
      existing.totalCost += tx.total_cost
    } else {
      existing.units -= tx.units
      existing.totalCost -= tx.units * (existing.totalCost / (existing.units + tx.units))
    }

    map.set(tx.asset_name, existing)
  }

  const assetMap = new Map(assets.map((a) => [a.name, a]))

  const holdings: Holding[] = []
  for (const [name, data] of map) {
    if (data.units <= 0.0001) continue

    const asset = assetMap.get(name)
    const currentPrice = asset?.current_price ?? null
    const currentValue = currentPrice !== null ? currentPrice * data.units : null
    const profitLoss = currentValue !== null ? currentValue - data.totalCost : null
    const profitLossPct = profitLoss !== null && data.totalCost > 0 ? (profitLoss / data.totalCost) * 100 : null

    holdings.push({
      asset_name: name,
      asset_type: data.asset_type,
      currency: data.currency,
      units: data.units,
      avg_cost: data.totalCost / data.units,
      total_invested: data.totalCost,
      current_price: currentPrice,
      current_value: currentValue,
      profit_loss: profitLoss,
      profit_loss_pct: profitLossPct,
    })
  }

  return holdings.sort((a, b) => a.asset_type.localeCompare(b.asset_type) || a.asset_name.localeCompare(b.asset_name))
}

export function groupByAssetType(holdings: Holding[]): Map<AssetType, Holding[]> {
  const groups = new Map<AssetType, Holding[]>()
  for (const h of holdings) {
    const arr = groups.get(h.asset_type) ?? []
    arr.push(h)
    groups.set(h.asset_type, arr)
  }
  return groups
}

export function computeTotals(holdings: Holding[], exchangeRate: number) {
  let totalInvestedTHB = 0
  let totalValueTHB = 0
  let hasAllPrices = true

  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    totalInvestedTHB += h.total_invested * rate
    if (h.current_value !== null) {
      totalValueTHB += h.current_value * rate
    } else {
      hasAllPrices = false
    }
  }

  return {
    totalInvestedTHB,
    totalValueTHB: hasAllPrices ? totalValueTHB : null,
    totalInvestedUSD: totalInvestedTHB / exchangeRate,
    totalValueUSD: hasAllPrices ? totalValueTHB / exchangeRate : null,
    profitLossTHB: hasAllPrices ? totalValueTHB - totalInvestedTHB : null,
    profitLossUSD: hasAllPrices ? (totalValueTHB - totalInvestedTHB) / exchangeRate : null,
    profitLossPct: hasAllPrices && totalInvestedTHB > 0 ? ((totalValueTHB - totalInvestedTHB) / totalInvestedTHB) * 100 : null,
  }
}

export function allocationByType(holdings: Holding[], exchangeRate: number) {
  const map = new Map<AssetType, number>()
  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    const value = (h.current_value ?? h.total_invested) * rate
    map.set(h.asset_type, (map.get(h.asset_type) ?? 0) + value)
  }
  return Array.from(map.entries()).map(([type, value]) => ({ type, value }))
}

export function computeYtdFlow(transactions: Transaction[], exchangeRate: number, today = new Date()) {
  const year = today.getFullYear()
  const startOfYear = `${year}-01-01`

  let netInvestedTHB = 0
  let buyTHB = 0
  let sellTHB = 0
  let transactionCount = 0
  let investedBeforeYearTHB = 0

  for (const tx of transactions) {
    const valueTHB = transactionValueTHB(tx, exchangeRate)
    const signedValue = tx.action === 'buy' ? valueTHB : -valueTHB

    if (tx.date >= startOfYear) {
      netInvestedTHB += signedValue
      transactionCount += 1
      if (tx.action === 'buy') buyTHB += valueTHB
      else sellTHB += valueTHB
    } else {
      investedBeforeYearTHB += signedValue
    }
  }

  return {
    year,
    netInvestedTHB,
    buyTHB,
    sellTHB,
    transactionCount,
    growthPct: investedBeforeYearTHB > 0 ? (netInvestedTHB / investedBeforeYearTHB) * 100 : null,
  }
}

function quarterKey(date: Date): string {
  const quarter = Math.floor(date.getMonth() / 3) + 1
  return `${date.getFullYear()} Q${quarter}`
}

function parseTransactionDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

function addQuarter(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 3, 1)
}

function startOfQuarter(date: Date): Date {
  const quarterStartMonth = Math.floor(date.getMonth() / 3) * 3
  return new Date(date.getFullYear(), quarterStartMonth, 1)
}

export function computeQuarterlyPortfolioGrowth(
  transactions: Transaction[],
  exchangeRate: number,
  today = new Date(),
  maxQuarters = 8
) {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const firstTransaction = sorted[0]
  const currentQuarterStart = startOfQuarter(today)
  const firstQuarterStart = firstTransaction ? startOfQuarter(parseTransactionDate(firstTransaction.date)) : currentQuarterStart
  const quarters: { quarter: string; valueTHB: number; netFlowTHB: number }[] = []

  let transactionIndex = 0
  let cumulativeTHB = 0

  for (let cursor = firstQuarterStart; cursor <= currentQuarterStart; cursor = addQuarter(cursor)) {
    const nextQuarter = addQuarter(cursor)
    let netFlowTHB = 0

    while (transactionIndex < sorted.length) {
      const tx = sorted[transactionIndex]!
      if (parseTransactionDate(tx.date) >= nextQuarter) break

      const signedValue = tx.action === 'buy'
        ? transactionValueTHB(tx, exchangeRate)
        : -transactionValueTHB(tx, exchangeRate)

      cumulativeTHB += signedValue
      netFlowTHB += signedValue
      transactionIndex += 1
    }

    quarters.push({
      quarter: quarterKey(cursor),
      valueTHB: cumulativeTHB,
      netFlowTHB,
    })
  }

  return quarters.slice(-maxQuarters)
}
