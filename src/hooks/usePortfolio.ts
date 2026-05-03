import { useMemo } from 'react'
import { useDatabase } from './useDatabase'
import * as Q from '../lib/queries'
import { computeHoldings, computeTotals, allocationByType } from '../lib/calc'

export function usePortfolio() {
  const { db } = useDatabase()

  return useMemo(() => {
    const transactions = Q.getAllTransactions(db)
    const assets = Q.getAllAssets(db)
    const rateStr = Q.getSetting(db, 'exchange_rate_thb_usd')
    const exchangeRate = rateStr ? parseFloat(rateStr) : 35.0

    const holdings = computeHoldings(transactions, assets)
    const totals = computeTotals(holdings, exchangeRate)
    const allocation = allocationByType(holdings, exchangeRate)

    return { holdings, totals, allocation, exchangeRate, assets }
  }, [db])
}
