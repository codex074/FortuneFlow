import type { Transaction, Asset, Holding, PriceHistory, AssetType, Currency, TradingTransaction } from '../types'

export interface FifoLot {
  units: number
  costPerUnit: number
}

export function fifoSell(lots: FifoLot[], unitsToSell: number): number {
  let costBasis = 0
  let remaining = unitsToSell

  while (remaining > 0.0001 && lots.length > 0) {
    const oldest = lots[0]!
    if (oldest.units <= remaining) {
      costBasis += oldest.units * oldest.costPerUnit
      remaining -= oldest.units
      lots.shift()
    } else {
      costBasis += remaining * oldest.costPerUnit
      oldest.units -= remaining
      remaining = 0
    }
  }

  return costBasis
}

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
  if (tx.action === 'interest') return tx.total_cost
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

export function holdingKey(assetName: string, assetType: AssetType, currency: Currency): string {
  return `${assetName}|${assetType}|${currency}`
}

interface ComputeHoldingsOptions {
  includeClosed?: boolean
}

export function computeHoldings(
  transactions: Transaction[],
  assets: Asset[],
  options: ComputeHoldingsOptions = {}
): Holding[] {
  const map = new Map<string, {
    asset_name: string
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

    const key = holdingKey(tx.asset_name, tx.asset_type, tx.currency)
    const existing = map.get(key) ?? {
      asset_name: tx.asset_name,
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
      const proceeds = tx.price_per_unit * tx.units - tx.fees
      existing.realized_profit += proceeds - costBasis
      existing.units -= tx.units
      existing.totalCost -= costBasis
    } else if (tx.action === 'dividend' || tx.action === 'interest') {
      existing.realized_profit += tx.total_cost
    }

    map.set(key, existing)
  }

  const assetMap = new Map(assets.map((a) => [holdingKey(a.name, a.type, a.currency), a]))

  const holdings: Holding[] = []
  for (const [key, data] of map) {
    const isClosed = data.units <= 0.0001
    if (isClosed && (!options.includeClosed || Math.abs(data.realized_profit) <= 0.0001)) {
      continue
    }

    const asset = assetMap.get(key)
    const currentPrice = asset?.current_price ?? null
    const currentValue = isClosed ? 0 : (currentPrice !== null ? currentPrice * data.units : null)
    const unrealizedProfit = isClosed ? 0 : (currentValue !== null ? currentValue - data.totalCost : null)
    const unrealizedProfitPct = isClosed ? null : (unrealizedProfit !== null && data.totalCost > 0 ? (unrealizedProfit / data.totalCost) * 100 : null)

    holdings.push({
      asset_name: data.asset_name,
      asset_type: data.asset_type,
      currency: data.currency,
      units: data.units,
      avg_cost: isClosed ? 0 : data.totalCost / data.units,
      total_invested: isClosed ? 0 : data.totalCost,
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

export interface FifoTradeRecord {
  sell_tx_id: number
  date: string
  asset_name: string
  currency: Currency
  units: number
  sell_price: number
  proceeds: number
  cost_basis: number
  realized_pnl: number
  holding_days: number | null
}

export interface TradingPosition {
  asset_name: string
  currency: Currency
  units: number
  avg_cost: number
  total_cost: number
}

interface FifoLotWithDate extends FifoLot {
  buyDate: string
}

function buildTradingLots(transactions: TradingTransaction[]): Map<string, FifoLotWithDate[]> {
  const lots = new Map<string, FifoLotWithDate[]>()
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  for (const tx of sorted) {
    const queue = lots.get(tx.asset_name) ?? []
    if (tx.action === 'buy') {
      queue.push({ units: tx.units, costPerUnit: tx.total_cost / tx.units, buyDate: tx.date })
    } else if (tx.action === 'sell') {
      let remaining = tx.units
      while (remaining > 0.0001 && queue.length > 0) {
        const oldest = queue[0]!
        if (oldest.units <= remaining) { remaining -= oldest.units; queue.shift() }
        else { oldest.units -= remaining; remaining = 0 }
      }
    }
    lots.set(tx.asset_name, queue)
  }
  return lots
}

export function computeFifoTrades(transactions: TradingTransaction[]): FifoTradeRecord[] {
  const lots = new Map<string, FifoLotWithDate[]>()
  const records: FifoTradeRecord[] = []
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

  for (const tx of sorted) {
    const queue = lots.get(tx.asset_name) ?? []

    if (tx.action === 'buy') {
      queue.push({ units: tx.units, costPerUnit: tx.total_cost / tx.units, buyDate: tx.date })
      lots.set(tx.asset_name, queue)
    } else if (tx.action === 'sell') {
      let remaining = tx.units
      let costBasis = 0
      let oldestBuyDate: string | null = null

      while (remaining > 0.0001 && queue.length > 0) {
        const oldest = queue[0]!
        if (oldestBuyDate === null) oldestBuyDate = oldest.buyDate

        if (oldest.units <= remaining) {
          costBasis += oldest.units * oldest.costPerUnit
          remaining -= oldest.units
          queue.shift()
        } else {
          costBasis += remaining * oldest.costPerUnit
          oldest.units -= remaining
          remaining = 0
        }
      }

      const proceeds = tx.price_per_unit * tx.units - tx.fees
      const sellDate = new Date(`${tx.date}T00:00:00`)
      const holdingDays = oldestBuyDate !== null
        ? Math.floor((sellDate.getTime() - new Date(`${oldestBuyDate}T00:00:00`).getTime()) / (24 * 3600 * 1000))
        : null

      records.push({
        sell_tx_id: tx.id,
        date: tx.date,
        asset_name: tx.asset_name,
        currency: tx.currency,
        units: tx.units,
        sell_price: tx.price_per_unit,
        proceeds,
        cost_basis: costBasis,
        realized_pnl: proceeds - costBasis,
        holding_days: holdingDays,
      })

      lots.set(tx.asset_name, queue)
    }
  }

  return records.sort((a, b) => b.date.localeCompare(a.date) || b.sell_tx_id - a.sell_tx_id)
}

export function computeTradingPositions(transactions: TradingTransaction[]): TradingPosition[] {
  const lots = buildTradingLots(transactions)
  const currencyMap = new Map<string, Currency>()
  for (const tx of transactions) currencyMap.set(tx.asset_name, tx.currency)

  const positions: TradingPosition[] = []
  for (const [assetName, queue] of lots) {
    const remaining = queue.filter(l => l.units > 0.0001)
    if (remaining.length === 0) continue
    const units = remaining.reduce((s, l) => s + l.units, 0)
    const totalCost = remaining.reduce((s, l) => s + l.units * l.costPerUnit, 0)
    positions.push({
      asset_name: assetName,
      currency: currencyMap.get(assetName) ?? 'THB',
      units,
      avg_cost: units > 0 ? totalCost / units : 0,
      total_cost: totalCost,
    })
  }
  return positions.sort((a, b) => a.asset_name.localeCompare(b.asset_name))
}

export interface CashFlow {
  date: string
  amount: number
}

export function xirr(flows: CashFlow[]): number | null {
  if (flows.length < 2) return null

  const sorted = [...flows].sort((a, b) => a.date.localeCompare(b.date))
  const hasPositive = sorted.some((f) => f.amount > 0)
  const hasNegative = sorted.some((f) => f.amount < 0)
  if (!hasPositive || !hasNegative) return null

  const epochDay = 24 * 3600 * 1000
  const t0 = new Date(`${sorted[0]!.date}T00:00:00`).getTime()
  const years = sorted.map((f) => (new Date(`${f.date}T00:00:00`).getTime() - t0) / (365 * epochDay))
  if (years[years.length - 1]! <= 0) return null

  let rate = 0.1
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0
    let dnpv = 0
    for (let i = 0; i < sorted.length; i++) {
      const t = years[i]!
      const cf = sorted[i]!.amount
      const base = 1 + rate
      if (base <= 0) { rate = -0.999; npv = NaN; break }
      const factor = Math.pow(base, t)
      npv += cf / factor
      dnpv -= (cf * t) / (factor * base)
    }
    if (!Number.isFinite(npv) || Math.abs(dnpv) < 1e-12) return null
    const next = rate - npv / dnpv
    if (!Number.isFinite(next)) return null
    if (Math.abs(next - rate) < 1e-7) return next * 100
    rate = next <= -1 ? -0.999 : next
  }
  return null
}

function todayDateISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeHoldingCashflows(
  transactions: Transaction[],
  assetName: string,
  assetType: AssetType,
  currency: Currency,
  currentValue: number | null,
  asOfDate: string = todayDateISO()
): CashFlow[] {
  const flows: CashFlow[] = []
  for (const tx of transactions) {
    if (tx.asset_name !== assetName || tx.asset_type !== assetType || tx.currency !== currency) continue
    if (tx.action === 'buy') {
      flows.push({ date: tx.date, amount: -tx.total_cost })
    } else if (tx.action === 'sell') {
      flows.push({ date: tx.date, amount: tx.price_per_unit * tx.units - tx.fees })
    } else if (tx.action === 'dividend' || tx.action === 'interest') {
      flows.push({ date: tx.date, amount: tx.total_cost })
    }
  }
  if (currentValue !== null && currentValue > 0) {
    flows.push({ date: asOfDate, amount: currentValue })
  }
  return flows
}

export function computeHoldingXirrs(
  transactions: Transaction[],
  holdings: Holding[],
  asOfDate: string = todayDateISO()
): Map<string, number | null> {
  const result = new Map<string, number | null>()
  for (const h of holdings) {
    if (h.asset_type === 'cash') continue
    const flows = computeHoldingCashflows(
      transactions,
      h.asset_name,
      h.asset_type,
      h.currency,
      h.current_value,
      asOfDate
    )
    result.set(holdingKey(h.asset_name, h.asset_type, h.currency), xirr(flows))
  }
  return result
}

export function computePortfolioXirr(
  transactions: Transaction[],
  holdings: Holding[],
  exchangeRate: number,
  asOfDate: string = todayDateISO()
): number | null {
  const flows: CashFlow[] = []
  for (const tx of transactions) {
    if (tx.asset_type === 'cash' || tx.action === 'deposit' || tx.action === 'withdraw') continue
    const rate = tx.currency === 'USD' ? exchangeRate : 1
    if (tx.action === 'buy') {
      flows.push({ date: tx.date, amount: -tx.total_cost * rate })
    } else if (tx.action === 'sell') {
      flows.push({ date: tx.date, amount: (tx.price_per_unit * tx.units - tx.fees) * rate })
    } else if (tx.action === 'dividend' || tx.action === 'interest') {
      flows.push({ date: tx.date, amount: tx.total_cost * rate })
    }
  }
  let currentValueTHB = 0
  for (const h of holdings) {
    if (h.asset_type === 'cash') continue
    if (h.current_value === null) continue
    const rate = h.currency === 'USD' ? exchangeRate : 1
    currentValueTHB += h.current_value * rate
  }
  if (currentValueTHB > 0) flows.push({ date: asOfDate, amount: currentValueTHB })
  return xirr(flows)
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
    } else if (tx.action === 'dividend' || tx.action === 'interest') {
      totalRealized += tx.total_cost
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
  let investedWithPricesTHB = 0
  let unrealizedProfitTHB = 0
  let realizedProfitTHB = 0
  let hasAllPrices = true

  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    totalInvestedTHB += h.total_invested * rate
    realizedProfitTHB += h.realized_profit * rate
    if (h.current_value !== null) {
      totalValueTHB += h.current_value * rate
      investedWithPricesTHB += h.total_invested * rate
      unrealizedProfitTHB += (h.unrealized_profit ?? 0) * rate
    } else {
      hasAllPrices = false
    }
  }

  const pct = investedWithPricesTHB > 0 ? (unrealizedProfitTHB / investedWithPricesTHB) * 100 : null

  return {
    totalInvestedTHB,
    totalValueTHB: totalValueTHB > 0 ? totalValueTHB : null,
    totalInvestedUSD: totalInvestedTHB / exchangeRate,
    totalValueUSD: totalValueTHB > 0 ? totalValueTHB / exchangeRate : null,
    hasAllPrices,
    // unrealized
    unrealizedProfitTHB: investedWithPricesTHB > 0 ? unrealizedProfitTHB : null,
    unrealizedProfitUSD: investedWithPricesTHB > 0 ? unrealizedProfitTHB / exchangeRate : null,
    unrealizedProfitPct: pct,
    // realized
    realizedProfitTHB,
    realizedProfitUSD: realizedProfitTHB / exchangeRate,
    // combined (for backward compat)
    profitLossTHB: investedWithPricesTHB > 0 ? unrealizedProfitTHB : null,
    profitLossUSD: investedWithPricesTHB > 0 ? unrealizedProfitTHB / exchangeRate : null,
    profitLossPct: pct,
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

  let baseTHB = 0

  for (const tx of transactions) {
    const txYear = Number(tx.date.slice(0, 4))
    const txMonth = Number(tx.date.slice(5, 7)) - 1
    if (tx.action === 'dividend') continue
    if (cashLedger && tx.action !== 'deposit' && tx.action !== 'withdraw') continue

    const valueTHB = transactionValueTHB(tx, exchangeRate)
    const isInflow = tx.action === 'buy' || tx.action === 'deposit'

    if (txYear < year) {
      baseTHB += isInflow ? valueTHB : -valueTHB
    } else if (txYear === year && txMonth >= 0 && txMonth <= lastMonth) {
      const point = monthly[txMonth]
      if (!point) continue
      if (isInflow) {
        point.investedTHB += valueTHB
        point.netFlowTHB += valueTHB
      } else if (tx.action === 'sell' || tx.action === 'withdraw') {
        point.soldTHB += valueTHB
        point.netFlowTHB -= valueTHB
      }
    }
  }

  let cumulativeTHB = baseTHB
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
  const quarters: { quarter: string; asOf: string; valueTHB: number; netFlowTHB: number }[] = []
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
      asOf: quarterAsOf,
      valueTHB,
      netFlowTHB,
    })
  }

  return quarters.slice(-maxQuarters)
}

export interface BenchmarkRef {
  name: string
  currency: Currency
}

export interface RiskMetrics {
  maxDrawdownPct: number | null
  volatilityPct: number | null
  samples: number
}

function maxDrawdownFromSeries(values: number[]): number | null {
  if (values.length < 2) return null
  let peak = values[0]!
  let maxDd = 0
  for (const v of values) {
    if (v > peak) peak = v
    if (peak > 0) {
      const dd = (peak - v) / peak
      if (dd > maxDd) maxDd = dd
    }
  }
  return maxDd * 100
}

function stdevOfReturns(values: number[]): number | null {
  if (values.length < 2) return null
  const returns: number[] = []
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1]!
    if (prev <= 0) continue
    returns.push((values[i]! - prev) / prev)
  }
  if (returns.length < 2) return null
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
  return Math.sqrt(variance)
}

export function computeRiskFromSeries(values: number[], periodsPerYear: number): RiskMetrics {
  const maxDrawdownPct = maxDrawdownFromSeries(values)
  const stdev = stdevOfReturns(values)
  const volatilityPct = stdev !== null ? stdev * Math.sqrt(periodsPerYear) * 100 : null
  return { maxDrawdownPct, volatilityPct, samples: values.length }
}

export function computeHoldingRisk(
  priceHistory: PriceHistory[],
  assetName: string,
  currency: Currency
): RiskMetrics {
  const series = priceHistory
    .filter((p) => p.asset_name === assetName && p.currency === currency)
    .map((p) => ({ date: p.price_date, price: p.price }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const monthly = new Map<string, number>()
  for (const p of series) monthly.set(p.date.slice(0, 7), p.price)
  const values = Array.from(monthly.values())
  return computeRiskFromSeries(values, 12)
}

export function computePortfolioRisk(
  quarterlyValues: { valueTHB: number }[]
): RiskMetrics {
  const values = quarterlyValues.map((q) => q.valueTHB).filter((v) => v > 0)
  return computeRiskFromSeries(values, 4)
}

export type TargetAllocation = Partial<Record<AssetType, number>>

export interface AllocationDriftRow {
  type: AssetType
  currentValueTHB: number
  currentPct: number
  targetPct: number
  driftPct: number
  rebalanceTHB: number
}

export function computeAllocationDrift(
  holdings: Holding[],
  target: TargetAllocation,
  exchangeRate: number
): AllocationDriftRow[] {
  const valueByType = new Map<AssetType, number>()
  let totalTHB = 0
  for (const h of holdings) {
    const rate = h.currency === 'USD' ? exchangeRate : 1
    const value = (h.current_value ?? h.total_invested) * rate
    if (value <= 0) continue
    valueByType.set(h.asset_type, (valueByType.get(h.asset_type) ?? 0) + value)
    totalTHB += value
  }

  const types = new Set<AssetType>([
    ...valueByType.keys(),
    ...(Object.keys(target) as AssetType[]).filter((t) => (target[t] ?? 0) > 0),
  ])

  const rows: AllocationDriftRow[] = []
  for (const type of types) {
    const currentValueTHB = valueByType.get(type) ?? 0
    const currentPct = totalTHB > 0 ? (currentValueTHB / totalTHB) * 100 : 0
    const targetPct = target[type] ?? 0
    const targetValueTHB = (targetPct / 100) * totalTHB
    rows.push({
      type,
      currentValueTHB,
      currentPct,
      targetPct,
      driftPct: currentPct - targetPct,
      rebalanceTHB: targetValueTHB - currentValueTHB,
    })
  }

  return rows.sort((a, b) => b.targetPct - a.targetPct || b.currentPct - a.currentPct)
}

export function computeBenchmarkSeries(
  priceHistory: PriceHistory[],
  benchmark: BenchmarkRef,
  quarters: { asOf: string; valueTHB: number }[]
): (number | null)[] {
  const priceMap = buildPriceHistoryMap(priceHistory)
  const rawPrices: (number | null)[] = quarters.map((q) =>
    findHistoricalPrice(priceMap, benchmark.name, benchmark.currency, q.asOf)
  )

  let anchorIdx = -1
  for (let i = 0; i < rawPrices.length; i++) {
    if (rawPrices[i] !== null && quarters[i]!.valueTHB > 0) {
      anchorIdx = i
      break
    }
  }
  if (anchorIdx === -1) return rawPrices.map(() => null)

  const anchorPrice = rawPrices[anchorIdx]!
  const anchorValueTHB = quarters[anchorIdx]!.valueTHB
  if (anchorPrice <= 0 || anchorValueTHB <= 0) return rawPrices.map(() => null)

  return rawPrices.map((p) => {
    if (p === null) return null
    return (p / anchorPrice) * anchorValueTHB
  })
}
