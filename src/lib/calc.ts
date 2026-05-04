import type { Transaction, Asset, Holding, PriceHistory, AssetType, Currency } from '../types'

const CASH_ACCOUNT_NAMES: Record<Currency, string> = {
  THB: 'Cash THB',
  USD: 'Cash USD',
}

export interface CashLedgerEntry {
  id: number
  date: string
  currency: Currency
  action: Transaction['action']
  asset_name: string
  notes: string | null
  amount: number
  balance_after: number
}

function transactionValueTHB(tx: Transaction, exchangeRate: number): number {
  const rate = tx.currency === 'USD' ? exchangeRate : 1
  return tx.total_cost * rate
}

export function getCashAccountName(currency: Currency): string {
  return CASH_ACCOUNT_NAMES[currency]
}

export function getCashDelta(tx: Transaction): number {
  if (tx.action === 'deposit') return tx.total_cost
  if (tx.action === 'withdraw') return -tx.total_cost
  if (tx.asset_type === 'cash') return 0
  if (tx.action === 'buy') return -tx.total_cost
  if (tx.action === 'sell') return tx.price_per_unit * tx.units - tx.fees
  if (tx.action === 'dividend') return tx.total_cost
  return 0
}

function usesCashLedger(transactions: Transaction[]): boolean {
  return transactions.some((tx) => tx.asset_type === 'cash' || tx.action === 'deposit' || tx.action === 'withdraw')
}

export function computeCashBalances(transactions: Transaction[]): Record<Currency, number> {
  const balances: Record<Currency, number> = { THB: 0, USD: 0 }

  for (const tx of transactions) {
    balances[tx.currency] += getCashDelta(tx)
  }

  return balances
}

export function computeAssetUnits(
  transactions: Transaction[],
  assetName: string,
  assetType: AssetType,
  currency: Currency
): number {
  return transactions.reduce((units, tx) => {
    const sameAsset = tx.asset_name === assetName && tx.asset_type === assetType && tx.currency === currency
    if (!sameAsset) return units
    if (tx.action === 'buy') return units + tx.units
    if (tx.action === 'sell') return units - tx.units
    return units
  }, 0)
}

export function computeCashLedger(transactions: Transaction[]): CashLedgerEntry[] {
  const balances: Record<Currency, number> = { THB: 0, USD: 0 }
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const ledger: CashLedgerEntry[] = []

  for (const tx of sorted) {
    const amount = getCashDelta(tx)
    if (Math.abs(amount) <= 0.0001) continue

    balances[tx.currency] += amount
    ledger.push({
      id: tx.id,
      date: tx.date,
      currency: tx.currency,
      action: tx.action,
      asset_name: tx.asset_type === 'cash' ? getCashAccountName(tx.currency) : tx.asset_name,
      notes: tx.notes,
      amount,
      balance_after: balances[tx.currency],
    })
  }

  return ledger.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
}

export function computeHoldings(transactions: Transaction[], assets: Asset[]): Holding[] {
  const map = new Map<string, {
    units: number
    totalCost: number
    asset_type: AssetType
    currency: Transaction['currency']
    realized_profit: number
  }>()
  const cashBalances: Record<Currency, number> = { THB: 0, USD: 0 }

  // Process in chronological order so avg cost is accurate at each sell
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  for (const tx of sorted) {
    cashBalances[tx.currency] += getCashDelta(tx)
    if (tx.asset_type === 'cash' || tx.action === 'deposit' || tx.action === 'withdraw') continue

    const existing = map.get(tx.asset_name) ?? {
      units: 0,
      totalCost: 0,
      asset_type: tx.asset_type,
      currency: tx.currency,
      realized_profit: 0,
    }

    if (tx.action === 'buy') {
      existing.units += tx.units
      existing.totalCost += tx.total_cost
    } else if (tx.action === 'sell') {
      const avgCost = existing.units > 0 ? existing.totalCost / existing.units : 0
      const costBasis = avgCost * tx.units
      // realized profit = proceeds (price × units) − cost basis − fees
      const proceeds = tx.price_per_unit * tx.units - tx.fees
      existing.realized_profit += proceeds - costBasis
      existing.units -= tx.units
      existing.totalCost -= costBasis
    }
    // dividend: no effect on units or cost basis

    map.set(tx.asset_name, existing)
  }

  const assetMap = new Map(assets.map((a) => [a.name, a]))

  const holdings: Holding[] = []
  for (const [name, data] of map) {
    if (data.units <= 0.0001) {
      // Fully sold — still include if there's realized profit to show? No, filter out from holdings view.
      continue
    }

    const asset = assetMap.get(name)
    const currentPrice = asset?.current_price ?? null
    const currentValue = currentPrice !== null ? currentPrice * data.units : null
    const unrealizedProfit = currentValue !== null ? currentValue - data.totalCost : null
    const unrealizedProfitPct = unrealizedProfit !== null && data.totalCost > 0 ? (unrealizedProfit / data.totalCost) * 100 : null

    holdings.push({
      asset_name: name,
      asset_type: data.asset_type,
      currency: data.currency,
      units: data.units,
      avg_cost: data.totalCost / data.units,
      total_invested: data.totalCost,
      current_price: currentPrice,
      current_value: currentValue,
      unrealized_profit: unrealizedProfit,
      unrealized_profit_pct: unrealizedProfitPct,
      realized_profit: data.realized_profit,
      profit_loss: unrealizedProfit,
      profit_loss_pct: unrealizedProfitPct,
    })
  }

  for (const currency of Object.keys(cashBalances) as Currency[]) {
    const balance = cashBalances[currency]
    if (transactions.length === 0 || Math.abs(balance) <= 0.0001) continue

    holdings.push({
      asset_name: CASH_ACCOUNT_NAMES[currency],
      asset_type: 'cash',
      currency,
      units: balance,
      avg_cost: 1,
      total_invested: balance,
      current_price: 1,
      current_value: balance,
      unrealized_profit: 0,
      unrealized_profit_pct: 0,
      realized_profit: 0,
      profit_loss: 0,
      profit_loss_pct: 0,
    })
  }

  return holdings.sort((a, b) => a.asset_type.localeCompare(b.asset_type) || a.asset_name.localeCompare(b.asset_name))
}

export function computeRealizedProfit(transactions: Transaction[]): number {
  const map = new Map<string, { units: number; totalCost: number }>()
  let totalRealized = 0

  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  for (const tx of sorted) {
    const existing = map.get(tx.asset_name) ?? { units: 0, totalCost: 0 }

    if (tx.action === 'buy') {
      existing.units += tx.units
      existing.totalCost += tx.total_cost
    } else if (tx.action === 'sell') {
      const avgCost = existing.units > 0 ? existing.totalCost / existing.units : 0
      const costBasis = avgCost * tx.units
      const proceeds = tx.price_per_unit * tx.units - tx.fees
      totalRealized += proceeds - costBasis
      existing.units -= tx.units
      existing.totalCost -= costBasis
    }

    map.set(tx.asset_name, existing)
  }

  return totalRealized
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
  let unrealizedProfitTHB = 0
  let realizedProfitTHB = 0
  let hasAllPrices = true

  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    totalInvestedTHB += h.total_invested * rate
    realizedProfitTHB += h.realized_profit * rate
    if (h.current_value !== null) {
      totalValueTHB += h.current_value * rate
      unrealizedProfitTHB += (h.unrealized_profit ?? 0) * rate
    } else {
      hasAllPrices = false
    }
  }

  return {
    totalInvestedTHB,
    totalValueTHB: hasAllPrices ? totalValueTHB : null,
    totalInvestedUSD: totalInvestedTHB / exchangeRate,
    totalValueUSD: hasAllPrices ? totalValueTHB / exchangeRate : null,
    // unrealized
    unrealizedProfitTHB: hasAllPrices ? unrealizedProfitTHB : null,
    unrealizedProfitUSD: hasAllPrices ? unrealizedProfitTHB / exchangeRate : null,
    unrealizedProfitPct: hasAllPrices && totalInvestedTHB > 0 ? (unrealizedProfitTHB / totalInvestedTHB) * 100 : null,
    // realized
    realizedProfitTHB,
    realizedProfitUSD: realizedProfitTHB / exchangeRate,
    // combined (for backward compat)
    profitLossTHB: hasAllPrices ? unrealizedProfitTHB : null,
    profitLossUSD: hasAllPrices ? unrealizedProfitTHB / exchangeRate : null,
    profitLossPct: hasAllPrices && totalInvestedTHB > 0 ? (unrealizedProfitTHB / totalInvestedTHB) * 100 : null,
  }
}

export function allocationByType(holdings: Holding[], exchangeRate: number) {
  const map = new Map<AssetType, number>()
  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    const value = (h.current_value ?? h.total_invested) * rate
    if (value <= 0) continue
    map.set(h.asset_type, (map.get(h.asset_type) ?? 0) + value)
  }
  return Array.from(map.entries()).map(([type, value]) => ({ type, value }))
}

export function computeYtdFlow(transactions: Transaction[], exchangeRate: number, today = new Date(), year = today.getFullYear()) {
  const startOfYear = `${year}-01-01`
  const endOfYear = `${year}-12-31`
  const cashLedger = usesCashLedger(transactions)

  let netInvestedTHB = 0
  let buyTHB = 0
  let sellTHB = 0
  let transactionCount = 0
  let investedBeforeYearTHB = 0

  for (const tx of transactions) {
    if (tx.action === 'deposit') {
      const valueTHB = transactionValueTHB(tx, exchangeRate)
      if (tx.date >= startOfYear && tx.date <= endOfYear) {
        netInvestedTHB += valueTHB
        buyTHB += valueTHB
        transactionCount += 1
      } else {
        investedBeforeYearTHB += valueTHB
      }
      continue
    }
    if (tx.action === 'withdraw') {
      const valueTHB = transactionValueTHB(tx, exchangeRate)
      if (tx.date >= startOfYear && tx.date <= endOfYear) {
        netInvestedTHB -= valueTHB
        sellTHB += valueTHB
        transactionCount += 1
      } else {
        investedBeforeYearTHB -= valueTHB
      }
      continue
    }
    if (tx.action === 'dividend') continue
    if (tx.asset_type === 'cash') continue
    if (cashLedger) continue
    const valueTHB = transactionValueTHB(tx, exchangeRate)
    const signedValue = tx.action === 'buy' ? valueTHB : -valueTHB

    if (tx.date >= startOfYear && tx.date <= endOfYear) {
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

function monthLabel(month: number): string {
  return new Date(2024, month, 1).toLocaleDateString('en-US', { month: 'short' })
}

export function computeYtdInvestmentTrend(
  transactions: Transaction[],
  exchangeRate: number,
  year: number,
  today = new Date()
) {
  const cashLedger = usesCashLedger(transactions)
  const currentYear = today.getFullYear()
  const lastMonth = year === currentYear ? today.getMonth() : 11
  const monthly = Array.from({ length: lastMonth + 1 }, (_, month) => ({
    month: monthLabel(month),
    investedTHB: 0,
    soldTHB: 0,
    netFlowTHB: 0,
    cumulativeTHB: 0,
  }))

  for (const tx of transactions) {
    const txYear = Number(tx.date.slice(0, 4))
    const txMonth = Number(tx.date.slice(5, 7)) - 1
    if (txYear !== year || txMonth < 0 || txMonth > lastMonth) continue

    if (tx.action === 'dividend') continue
    if (cashLedger && tx.action !== 'deposit' && tx.action !== 'withdraw') continue
    const valueTHB = transactionValueTHB(tx, exchangeRate)
    const point = monthly[txMonth]
    if (!point) continue

    if (tx.action === 'buy' || tx.action === 'deposit') {
      point.investedTHB += valueTHB
      point.netFlowTHB += valueTHB
    } else if (tx.action === 'sell' || tx.action === 'withdraw') {
      point.soldTHB += valueTHB
      point.netFlowTHB -= valueTHB
    }
  }

  let cumulativeTHB = 0
  return monthly.map((point) => {
    cumulativeTHB += point.netFlowTHB
    return { ...point, cumulativeTHB }
  })
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

function dateISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function historicalPriceKey(assetName: string, currency: Currency): string {
  return `${assetName}\u0000${currency}`
}

function buildPriceHistoryMap(priceHistory: PriceHistory[]) {
  const map = new Map<string, PriceHistory[]>()

  for (const point of priceHistory) {
    const key = historicalPriceKey(point.asset_name, point.currency)
    const points = map.get(key) ?? []
    points.push(point)
    map.set(key, points)
  }

  for (const points of map.values()) {
    points.sort((a, b) => a.price_date.localeCompare(b.price_date))
  }

  return map
}

function findHistoricalPrice(
  priceMap: Map<string, PriceHistory[]>,
  assetName: string,
  currency: Currency,
  asOfDate: string
): number | null {
  const points = priceMap.get(historicalPriceKey(assetName, currency))
  if (!points) return null

  let price: number | null = null
  for (const point of points) {
    if (point.price_date > asOfDate) break
    price = point.price
  }
  return price
}

export function computeQuarterlyPortfolioGrowth(
  transactions: Transaction[],
  priceHistory: PriceHistory[],
  exchangeRate: number,
  today = new Date(),
  maxQuarters = 8,
  year?: number
) {
  const includeCash = usesCashLedger(transactions)
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
  const firstTransaction = sorted[0]
  const currentQuarterStart = startOfQuarter(today)
  const requestedYear = year ?? null
  const requestedYearStart = requestedYear !== null ? new Date(requestedYear, 0, 1) : null
  const firstQuarterStart = requestedYearStart
    ? startOfQuarter(requestedYearStart)
    : firstTransaction
      ? startOfQuarter(parseTransactionDate(firstTransaction.date))
      : currentQuarterStart
  const lastQuarterStart = requestedYear !== null
    ? (requestedYear === today.getFullYear() ? currentQuarterStart : new Date(requestedYear, 9, 1))
    : currentQuarterStart
  const quarters: { quarter: string; valueTHB: number; netFlowTHB: number }[] = []
  const priceMap = buildPriceHistoryMap(priceHistory)
  const assetStates = new Map<string, {
    assetName: string
    currency: Currency
    units: number
    totalCost: number
  }>()
  const cashBalances: Record<Currency, number> = { THB: 0, USD: 0 }

  let transactionIndex = 0

  for (let cursor = firstQuarterStart; cursor <= lastQuarterStart; cursor = addQuarter(cursor)) {
    const nextQuarter = addQuarter(cursor)
    const quarterStart = dateISO(cursor)
    const quarterAsOf = dateISO(new Date(nextQuarter.getFullYear(), nextQuarter.getMonth(), 0))
    let netFlowTHB = 0

    while (transactionIndex < sorted.length) {
      const tx = sorted[transactionIndex]!
      if (parseTransactionDate(tx.date) >= nextQuarter) break

      cashBalances[tx.currency] += getCashDelta(tx)

      if (tx.asset_type !== 'cash' && tx.action !== 'deposit' && tx.action !== 'withdraw') {
        const key = historicalPriceKey(tx.asset_name, tx.currency)
        const state = assetStates.get(key) ?? {
          assetName: tx.asset_name,
          currency: tx.currency,
          units: 0,
          totalCost: 0,
        }

        if (tx.action === 'buy') {
          state.units += tx.units
          state.totalCost += tx.total_cost
        } else if (tx.action === 'sell') {
          const avgCost = state.units > 0 ? state.totalCost / state.units : 0
          const costBasis = avgCost * tx.units
          state.units -= tx.units
          state.totalCost -= costBasis
        }
        assetStates.set(key, state)
      }

      const signedValue = tx.date < quarterStart
        ? 0
        : includeCash
          ? tx.action === 'deposit'
            ? transactionValueTHB(tx, exchangeRate)
            : tx.action === 'withdraw'
              ? -transactionValueTHB(tx, exchangeRate)
              : 0
          : tx.action === 'buy'
            ? transactionValueTHB(tx, exchangeRate)
            : tx.action === 'sell'
              ? -transactionValueTHB(tx, exchangeRate)
              : 0
      netFlowTHB += signedValue
      transactionIndex += 1
    }

    let valueTHB = 0
    for (const state of assetStates.values()) {
      if (state.units <= 0.0001) continue
      const rate = state.currency === 'USD' ? exchangeRate : 1
      const fallbackPrice = state.units > 0 ? state.totalCost / state.units : 0
      const price = findHistoricalPrice(priceMap, state.assetName, state.currency, quarterAsOf) ?? fallbackPrice
      valueTHB += state.units * price * rate
    }

    if (includeCash) {
      valueTHB += cashBalances.THB
      valueTHB += cashBalances.USD * exchangeRate
    }

    quarters.push({
      quarter: quarterKey(cursor),
      valueTHB,
      netFlowTHB,
    })
  }

  return quarters.slice(-maxQuarters)
}
