import { useCallback } from 'react'
import { useDatabase } from './useDatabase'
import * as Q from '../lib/queries'

export function useSettings() {
  const { db, persist } = useDatabase()

  const exchangeRate = parseFloat(Q.getSetting(db, 'exchange_rate_thb_usd') ?? '35.0')

  const setExchangeRate = useCallback(
    (rate: number) => {
      Q.setSetting(db, 'exchange_rate_thb_usd', String(rate))
      persist()
    },
    [db, persist]
  )

  return { exchangeRate, setExchangeRate }
}
