import { useState, useEffect } from 'react'
import { useDatabase } from './useDatabase'
import * as api from '../lib/api'
import { computeHoldings, computeTotals, allocationByType } from '../lib/calc'
import type { Holding, Asset, AssetType } from '../types'

interface PortfolioResult {
  holdings: Holding[]
  totals: ReturnType<typeof computeTotals>
  allocation: { type: AssetType; value: number }[]
  exchangeRate: number
  assets: Asset[]
}

const defaultTotals: ReturnType<typeof computeTotals> = {
  totalInvestedTHB: 0,
  totalValueTHB: null,
  totalInvestedUSD: 0,
  totalValueUSD: null,
  hasAllPrices: true,
  unrealizedProfitTHB: null,
  unrealizedProfitUSD: null,
  unrealizedProfitPct: null,
  realizedProfitTHB: 0,
  realizedProfitUSD: 0,
  profitLossTHB: null,
  profitLossUSD: null,
  profitLossPct: null,
}

export function usePortfolio() {
  const { version } = useDatabase()
  const [portfolio, setPortfolio] = useState<PortfolioResult>({
    holdings: [],
    totals: defaultTotals,
    allocation: [],
    exchangeRate: 35,
    assets: [],
  })

  useEffect(() => {
    Promise.all([api.getTransactions(), api.getAssets(), api.getSettings()])
      .then(([transactions, assets, settings]) => {
        const exchangeRate = settings.exchange_rate_thb_usd ? parseFloat(settings.exchange_rate_thb_usd) : 35.0
        const holdings = computeHoldings(transactions, assets)
        const totals = computeTotals(holdings, exchangeRate)
        const allocation = allocationByType(holdings, exchangeRate)
        setPortfolio({ holdings, totals, allocation, exchangeRate, assets })
      })
      .catch(console.error)
  }, [version])

  return portfolio
}
