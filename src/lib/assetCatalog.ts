import type { AssetType, Currency } from '../types'

export type AssetCatalogMarket = 'US' | 'TH'
export type AssetCatalogSource = 'nasdaq' | 'set' | 'sec' | 'fallback'

export interface AssetCatalogItem {
  symbol: string
  name: string
  type: AssetType
  currency: Currency
  market: AssetCatalogMarket
  source: AssetCatalogSource
  exchange?: string
}

interface SearchOptions {
  query: string
  assetType?: AssetType | ''
  currency?: Currency | ''
  limit?: number
}

const FALLBACK_ASSETS: AssetCatalogItem[] = [
  { symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'META', name: 'Meta Platforms Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway Inc. Class B', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NYSE' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NYSE' },
  { symbol: 'V', name: 'Visa Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NYSE' },
  { symbol: 'TSLA', name: 'Tesla Inc.', type: 'stock', currency: 'USD', market: 'US', source: 'fallback', exchange: 'NASDAQ' },
  { symbol: 'ADVANC', name: 'Advanced Info Service Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'AOT', name: 'Airports of Thailand Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'BBL', name: 'Bangkok Bank Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'BDMS', name: 'Bangkok Dusit Medical Services Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'CPALL', name: 'CP ALL Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'DELTA', name: 'Delta Electronics (Thailand) Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'KBANK', name: 'Kasikornbank Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'KTB', name: 'Krung Thai Bank Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'PTT', name: 'PTT Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'PTTEP', name: 'PTT Exploration and Production Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'SCC', name: 'The Siam Cement Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'SCB', name: 'SCB X Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'TISCO', name: 'TISCO Financial Group Public Company Limited', type: 'stock', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'SET' },
  { symbol: 'BBASIC', name: 'Bualuang Basic Dividend Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
  { symbol: 'B-INNOTECH', name: 'Bualuang Innovation and Technology Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
  { symbol: 'K-GA', name: 'K Global Allocation Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
  { symbol: 'K-USA', name: 'K US Equity Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
  { symbol: 'SCBSET50', name: 'SCB SET50 Index Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
  { symbol: 'TMBGQG', name: 'Eastspring Global Quality Growth Fund', type: 'fund', currency: 'THB', market: 'TH', source: 'fallback', exchange: 'TH Mutual Fund' },
]

const US_EXCHANGE_LABELS: Record<string, string> = {
  A: 'NYSE American',
  N: 'NYSE',
  P: 'NYSE Arca',
  Q: 'NASDAQ',
  Z: 'Cboe BZX',
  V: 'IEX',
}

let usStocksCache: Promise<AssetCatalogItem[]> | null = null
let thaiStocksCache: Promise<AssetCatalogItem[]> | null = null

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase()
}

function dedupeAssets(items: AssetCatalogItem[]): AssetCatalogItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.symbol}|${item.type}|${item.currency}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function scoreAsset(item: AssetCatalogItem, query: string): number {
  const q = normalizeSearch(query)
  if (!q) return item.source === 'fallback' ? 2 : 1
  const symbol = item.symbol.toLowerCase()
  const name = item.name.toLowerCase()
  if (symbol === q) return 100
  if (symbol.startsWith(q)) return 80
  if (name.startsWith(q)) return 65
  if (symbol.includes(q)) return 50
  if (name.includes(q)) return 40
  return 0
}

function filterAndRank(items: AssetCatalogItem[], options: SearchOptions): AssetCatalogItem[] {
  const limit = options.limit ?? 30
  return dedupeAssets(items)
    .map((item) => ({ item, score: scoreAsset(item, options.query) }))
    .filter(({ item, score }) => {
      if (options.assetType && item.type !== options.assetType) return false
      if (options.currency && item.currency !== options.currency) return false
      return score > 0
    })
    .sort((a, b) => b.score - a.score || a.item.symbol.localeCompare(b.item.symbol))
    .slice(0, limit)
    .map(({ item }) => item)
}

async function requestAssetCatalog(source: string, payload?: unknown): Promise<unknown> {
  if (window.fortuneflow?.requestAssetCatalog) {
    return window.fortuneflow.requestAssetCatalog(source, payload)
  }

  if (source === 'nasdaqListed') {
    const response = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt')
    return response.text()
  }

  if (source === 'otherListed') {
    const response = await fetch('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt')
    return response.text()
  }

  if (source === 'usTickersTxt') {
    const response = await fetch('https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/all/all_tickers.txt')
    return response.text()
  }

  if (source === 'usNasdaqFullTickers') {
    const response = await fetch('https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nasdaq/nasdaq_full_tickers.json')
    return response.json()
  }

  if (source === 'usNyseFullTickers') {
    const response = await fetch('https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/nyse/nyse_full_tickers.json')
    return response.json()
  }

  if (source === 'usAmexFullTickers') {
    const response = await fetch('https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main/amex/amex_full_tickers.json')
    return response.json()
  }

  if (source === 'secFundSearch') {
    const response = await fetch('https://api.sec.or.th/FundFactsheet/fund', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return response.json()
  }

  if (source === 'thaiStocksCsv') {
    const response = await fetch('https://huggingface.co/datasets/ThunderDrag/Thailand-Stock-Symbols-and-Metadata/resolve/main/thailand.csv')
    return response.text()
  }

  throw new Error('Unsupported asset catalog source')
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"' && next === '"') {
      current += '"'
      i += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

function parseNasdaqListed(text: string): AssetCatalogItem[] {
  return text
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('File Creation Time'))
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 8 && cols[3] !== 'Y' && cols[6] === 'N')
    .flatMap((cols) => {
      const symbol = cols[0]
      const name = cols[1]
      if (!symbol || !name) return []

      return [{
        symbol,
        name,
        type: 'stock' as AssetType,
        currency: 'USD' as Currency,
        market: 'US' as AssetCatalogMarket,
        source: 'nasdaq' as AssetCatalogSource,
        exchange: 'NASDAQ',
      }]
    })
}

function parseOtherListed(text: string): AssetCatalogItem[] {
  return text
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('File Creation Time'))
    .map((line) => line.split('|'))
    .filter((cols) => cols.length >= 7 && cols[4] !== 'Y' && cols[6] === 'N')
    .flatMap((cols) => {
      const symbol = cols[0]
      const name = cols[1]
      const exchangeCode = cols[2]
      if (!symbol || !name) return []

      return [{
        symbol,
        name,
        type: 'stock' as AssetType,
        currency: 'USD' as Currency,
        market: 'US' as AssetCatalogMarket,
        source: 'nasdaq' as AssetCatalogSource,
        exchange: exchangeCode ? US_EXCHANGE_LABELS[exchangeCode] ?? exchangeCode : undefined,
      }]
    })
}

function parseUsTickersTxt(text: string): AssetCatalogItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((symbol) => ({
      symbol,
      name: symbol,
      type: 'stock' as AssetType,
      currency: 'USD' as Currency,
      market: 'US' as AssetCatalogMarket,
      source: 'fallback' as AssetCatalogSource,
      exchange: 'US',
    }))
}

function parseUsFullTickers(value: unknown, exchange: string): AssetCatalogItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((row) => row as Record<string, unknown>)
    .flatMap((row) => {
      const symbol = String(row.symbol ?? '').trim()
      const name = String(row.name ?? '').trim()
      if (!symbol || !name) return []

      return [{
        symbol,
        name,
        type: 'stock' as AssetType,
        currency: 'USD' as Currency,
        market: 'US' as AssetCatalogMarket,
        source: 'fallback' as AssetCatalogSource,
        exchange,
      }]
    })
}

function parseSecFunds(value: unknown): AssetCatalogItem[] {
  if (!Array.isArray(value)) return []

  return value
    .map((row) => row as Record<string, unknown>)
    .flatMap((row) => {
      const symbol = String(row.proj_abbr_name ?? row.class_abbr_name ?? '').trim()
      const name = String(row.proj_name_en ?? row.proj_name_th ?? row.class_name ?? '').trim()
      if (!symbol || !name) return []

      return [{
        symbol,
        name,
        type: 'fund' as AssetType,
        currency: 'THB' as Currency,
        market: 'TH' as AssetCatalogMarket,
        source: 'sec' as AssetCatalogSource,
        exchange: 'TH Mutual Fund',
      }]
    })
}

async function loadRemoteUsStocks(): Promise<AssetCatalogItem[]> {
  const [nasdaqListed, otherListed] = await Promise.allSettled([
    requestAssetCatalog('nasdaqListed'),
    requestAssetCatalog('otherListed'),
  ])

  const items: AssetCatalogItem[] = []
  if (nasdaqListed.status === 'fulfilled' && typeof nasdaqListed.value === 'string') {
    items.push(...parseNasdaqListed(nasdaqListed.value))
  }
  if (otherListed.status === 'fulfilled' && typeof otherListed.value === 'string') {
    items.push(...parseOtherListed(otherListed.value))
  }

  return items
}

async function loadFallbackUsTickers(): Promise<AssetCatalogItem[]> {
  const response = await requestAssetCatalog('usTickersTxt')
  if (typeof response !== 'string') return []
  return parseUsTickersTxt(response)
}

async function loadFallbackUsFullTickers(): Promise<AssetCatalogItem[]> {
  const [nasdaq, nyse, amex] = await Promise.allSettled([
    requestAssetCatalog('usNasdaqFullTickers'),
    requestAssetCatalog('usNyseFullTickers'),
    requestAssetCatalog('usAmexFullTickers'),
  ])

  return [
    ...(nasdaq.status === 'fulfilled' ? parseUsFullTickers(nasdaq.value, 'NASDAQ') : []),
    ...(nyse.status === 'fulfilled' ? parseUsFullTickers(nyse.value, 'NYSE') : []),
    ...(amex.status === 'fulfilled' ? parseUsFullTickers(amex.value, 'NYSE American') : []),
  ]
}

function parseThaiStocksCsv(text: string): AssetCatalogItem[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .flatMap((line) => {
      const [name, ticker, market] = parseCsvLine(line)
      const symbol = ticker?.trim()
      const companyName = name?.trim()
      if (!symbol || !companyName) return []

      return [{
        symbol,
        name: companyName,
        type: 'stock' as AssetType,
        currency: 'THB' as Currency,
        market: 'TH' as AssetCatalogMarket,
        source: 'set' as AssetCatalogSource,
        exchange: market?.trim() || 'SET',
      }]
    })
}

async function loadRemoteThaiStocks(): Promise<AssetCatalogItem[]> {
  const response = await requestAssetCatalog('thaiStocksCsv')
  if (typeof response !== 'string') return []
  return parseThaiStocksCsv(response)
}

function getRemoteUsStocks(): Promise<AssetCatalogItem[]> {
  usStocksCache ??= loadRemoteUsStocks()
    .then((items) => items.length > 0 ? items : loadFallbackUsFullTickers())
    .catch(() => loadFallbackUsFullTickers())
    .then((items) => items.length > 0 ? items : loadFallbackUsTickers())
    .catch((error) => {
      usStocksCache = null
      throw error
    })
  return usStocksCache
}

function getRemoteThaiStocks(): Promise<AssetCatalogItem[]> {
  thaiStocksCache ??= loadRemoteThaiStocks().catch((error) => {
    thaiStocksCache = null
    throw error
  })
  return thaiStocksCache
}

async function getRemoteThaiFunds(query: string): Promise<AssetCatalogItem[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const response = await requestAssetCatalog('secFundSearch', {
    keyword: trimmed,
    proj_abbr_name: trimmed,
    proj_name: trimmed,
  })

  return parseSecFunds(response)
}

export async function searchAssetCatalog(options: SearchOptions): Promise<AssetCatalogItem[]> {
  const remoteResults = await Promise.allSettled([
    options.currency !== 'THB' && options.assetType !== 'fund' ? getRemoteUsStocks() : Promise.resolve([]),
    options.currency !== 'USD' && options.assetType !== 'fund' ? getRemoteThaiStocks() : Promise.resolve([]),
    options.currency !== 'USD' && options.assetType !== 'stock' ? getRemoteThaiFunds(options.query) : Promise.resolve([]),
  ])

  const remoteAssets = remoteResults.flatMap((result) => result.status === 'fulfilled' ? result.value : [])
  return filterAndRank([...remoteAssets, ...FALLBACK_ASSETS], options)
}
