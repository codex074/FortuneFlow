import { Router } from 'express'
import { authMiddleware } from '../auth.js'

const router = Router()
router.use(authMiddleware)

interface YahooChartResult {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        adjclose?: Array<{ adjclose?: (number | null)[] }>
        quote?: Array<{ close?: (number | null)[] }>
      }
    }>
    error?: { code?: string; description?: string } | null
  }
}

function isoDate(timestamp: number): string {
  const d = new Date(timestamp * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

router.get('/yahoo/monthly', async (req, res) => {
  try {
    const symbol = String(req.query.symbol ?? '').trim()
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' })
    }
    const startStr = String(req.query.start ?? '').trim()
    const now = Math.floor(Date.now() / 1000)
    let startTs: number
    if (/^\d{4}-\d{2}(-\d{2})?$/.test(startStr)) {
      const padded = startStr.length === 7 ? `${startStr}-01` : startStr
      const parsed = Math.floor(new Date(`${padded}T00:00:00Z`).getTime() / 1000)
      const earliest = now - 20 * 365 * 24 * 3600
      startTs = Math.max(parsed, earliest)
    } else {
      startTs = now - 5 * 365 * 24 * 3600
    }

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${startTs}&period2=${now}&interval=1mo&events=history`
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FortuneFlow/1.0)',
        'Accept': 'application/json',
      },
    })

    if (!upstream.ok) {
      return res.status(502).json({ error: `Yahoo Finance responded ${upstream.status}` })
    }

    const data = await upstream.json() as YahooChartResult
    const result = data.chart?.result?.[0]
    if (!result || !Array.isArray(result.timestamp)) {
      const desc = data.chart?.error?.description ?? 'No data for symbol'
      return res.status(404).json({ error: desc })
    }

    const closes = result.indicators?.adjclose?.[0]?.adjclose ?? result.indicators?.quote?.[0]?.close ?? []
    const points: { date: string; close: number }[] = []
    for (let i = 0; i < result.timestamp.length; i++) {
      const ts = result.timestamp[i]
      const close = closes[i]
      if (typeof ts !== 'number' || typeof close !== 'number' || !Number.isFinite(close)) continue
      points.push({ date: isoDate(ts), close })
    }

    res.json({ symbol, source: 'yahoo', points })
  } catch (err) {
    console.error('Yahoo fetch error:', err)
    res.status(500).json({ error: 'Failed to fetch from Yahoo' })
  }
})

export default router
