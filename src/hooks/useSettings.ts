import { useCallback } from 'react'
import { useDatabase } from './useDatabase'
import * as Q from '../lib/queries'
import { fetchUsdThbRate } from '../lib/exchangeRate'

export function useSettings() {
  const { db, persist } = useDatabase()

  const exchangeRate = parseFloat(Q.getSetting(db, 'exchange_rate_thb_usd') ?? '35.0')
  const exchangeRateSource = Q.getSetting(db, 'exchange_rate_source') || 'Manual'
  const exchangeRateDate = Q.getSetting(db, 'exchange_rate_date')
  const exchangeRateUpdatedAt = Q.getSetting(db, 'exchange_rate_updated_at')
  const exchangeRateLastError = Q.getSetting(db, 'exchange_rate_last_error')

  const setExchangeRate = useCallback(
    (rate: number) => {
      Q.setSetting(db, 'exchange_rate_thb_usd', String(rate))
      Q.setSetting(db, 'exchange_rate_source', 'Manual')
      Q.setSetting(db, 'exchange_rate_date', '')
      Q.setSetting(db, 'exchange_rate_updated_at', new Date().toISOString())
      Q.setSetting(db, 'exchange_rate_last_error', '')
      persist()
    },
    [db, persist]
  )

  const refreshExchangeRate = useCallback(async () => {
    const result = await fetchUsdThbRate()
    Q.setSetting(db, 'exchange_rate_thb_usd', String(result.rate))
    Q.setSetting(db, 'exchange_rate_source', result.source)
    Q.setSetting(db, 'exchange_rate_date', result.date)
    Q.setSetting(db, 'exchange_rate_updated_at', result.fetchedAt)
    Q.setSetting(db, 'exchange_rate_last_error', '')
    persist()
    return result
  }, [db, persist])

  return {
    exchangeRate,
    exchangeRateSource,
    exchangeRateDate,
    exchangeRateUpdatedAt,
    exchangeRateLastError,
    setExchangeRate,
    refreshExchangeRate,
  }
}
