import { useState, useCallback, useEffect } from 'react'
import { useDatabase } from './useDatabase'
import * as api from '../lib/api'
import { fetchUsdThbRate } from '../lib/exchangeRate'

export function useSettings() {
  const { version, bump } = useDatabase()

  const [exchangeRate, setExchangeRateState] = useState(35.0)
  const [exchangeRateSource, setExchangeRateSource] = useState('Manual')
  const [exchangeRateDate, setExchangeRateDate] = useState<string | null>(null)
  const [exchangeRateUpdatedAt, setExchangeRateUpdatedAt] = useState<string | null>(null)
  const [exchangeRateLastError, setExchangeRateLastError] = useState<string | null>(null)

  useEffect(() => {
    api.getSettings().then((settings) => {
      setExchangeRateState(parseFloat(settings.exchange_rate_thb_usd ?? '35.0'))
      setExchangeRateSource(settings.exchange_rate_source || 'Manual')
      setExchangeRateDate(settings.exchange_rate_date || null)
      setExchangeRateUpdatedAt(settings.exchange_rate_updated_at || null)
      setExchangeRateLastError(settings.exchange_rate_last_error || null)
    }).catch(console.error)
  }, [version])

  const setExchangeRate = useCallback(
    async (rate: number) => {
      await api.setSettingsBulk({
        exchange_rate_thb_usd: String(rate),
        exchange_rate_source: 'Manual',
        exchange_rate_date: '',
        exchange_rate_updated_at: new Date().toISOString(),
        exchange_rate_last_error: '',
      })
      bump()
    },
    [bump]
  )

  const refreshExchangeRate = useCallback(async () => {
    const result = await fetchUsdThbRate()
    await api.setSettingsBulk({
      exchange_rate_thb_usd: String(result.rate),
      exchange_rate_source: result.source,
      exchange_rate_date: result.date,
      exchange_rate_updated_at: result.fetchedAt,
      exchange_rate_last_error: '',
    })
    bump()
    return result
  }, [bump])

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
