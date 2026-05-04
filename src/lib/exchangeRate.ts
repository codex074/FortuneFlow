const FRANKFURTER_USD_THB_URL = 'https://api.frankfurter.dev/v2/rate/USD/THB'

export interface ExchangeRateResult {
  rate: number
  date: string
  source: string
  fetchedAt: string
}

interface FrankfurterRateResponse {
  rate?: number
  date?: string
}

export async function fetchUsdThbRate(): Promise<ExchangeRateResult> {
  const response = await fetch(FRANKFURTER_USD_THB_URL, {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(`Exchange rate API returned ${response.status}`)
  }

  const data = await response.json() as FrankfurterRateResponse
  if (typeof data.rate !== 'number' || data.rate <= 0) {
    throw new Error('Exchange rate API returned an invalid rate')
  }

  return {
    rate: data.rate,
    date: data.date ?? new Date().toISOString().slice(0, 10),
    source: 'Frankfurter',
    fetchedAt: new Date().toISOString(),
  }
}
