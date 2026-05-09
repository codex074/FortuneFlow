import { Router } from 'express'
import { sql } from '../db.js'
import { authMiddleware, type AuthRequest } from '../auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { asset_name, currency, limit } = req.query

    if (asset_name && currency) {
      const l = parseInt(limit as string) || 5
      const rows = await sql`
        SELECT * FROM price_history
        WHERE user_id = ${userId} AND asset_name = ${asset_name as string} AND currency = ${currency as string}
        ORDER BY price_date DESC, created_at DESC LIMIT ${l}
      `
      res.json(rows)
    } else {
      const rows = await sql`
        SELECT * FROM price_history WHERE user_id = ${userId}
        ORDER BY asset_name, currency, price_date
      `
      res.json(rows)
    }
  } catch (err) {
    console.error('Get price history error:', err)
    res.status(500).json({ error: 'Failed to get price history' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { asset_name, currency, price_date, price, notes } = req.body

    await sql`
      INSERT INTO price_history (user_id, asset_name, currency, price_date, price, notes)
      VALUES (${userId}, ${asset_name}, ${currency}, ${price_date}, ${price}, ${notes || null})
      ON CONFLICT (user_id, asset_name, currency, price_date)
      DO UPDATE SET price = EXCLUDED.price, notes = EXCLUDED.notes
    `
    await sql`
      UPDATE assets SET current_price = ${price}, last_updated = ${price_date}
      WHERE name = ${asset_name} AND user_id = ${userId} AND currency = ${currency}
        AND (last_updated IS NULL OR last_updated <= ${price_date})
    `

    await cleanupMonthlyPrices(userId, asset_name, currency)

    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Upsert price history error:', err)
    res.status(500).json({ error: 'Failed to save price history' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)

    const target = await sql`
      SELECT asset_name, currency FROM price_history WHERE id = ${id} AND user_id = ${userId}
    `
    await sql`DELETE FROM price_history WHERE id = ${id} AND user_id = ${userId}`

    if (target.length > 0) {
      const { asset_name, currency } = target[0]!
      const latest = await sql`
        SELECT price, price_date FROM price_history
        WHERE asset_name = ${asset_name} AND user_id = ${userId} AND currency = ${currency}
        ORDER BY price_date DESC, created_at DESC LIMIT 1
      `
      if (latest.length > 0) {
        await sql`
          UPDATE assets SET current_price = ${latest[0]!.price}, last_updated = ${latest[0]!.price_date}
          WHERE name = ${asset_name} AND user_id = ${userId} AND currency = ${currency}
        `
      } else {
        await sql`
          UPDATE assets SET current_price = NULL, last_updated = NULL
          WHERE name = ${asset_name} AND user_id = ${userId} AND currency = ${currency}
        `
      }
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Delete price history error:', err)
    res.status(500).json({ error: 'Failed to delete price history' })
  }
})

async function cleanupMonthlyPrices(userId: number, assetName: string, currency: string) {
  const rows = await sql`
    SELECT id, price_date FROM price_history
    WHERE user_id = ${userId} AND asset_name = ${assetName} AND currency = ${currency}
    ORDER BY price_date
  `

  const byMonth = new Map<string, { id: number; price_date: string }[]>()
  for (const row of rows) {
    const monthKey = (row.price_date as string).slice(0, 7)
    const group = byMonth.get(monthKey) ?? []
    group.push({ id: row.id as number, price_date: row.price_date as string })
    byMonth.set(monthKey, group)
  }

  const idsToDelete: number[] = []
  for (const [monthKey, group] of byMonth) {
    if (group.length <= 1) continue
    const year = parseInt(monthKey.slice(0, 4))
    const month = parseInt(monthKey.slice(5, 7))
    const lastDay = new Date(year, month, 0).getDate()
    const monthEnd = `${monthKey}-${String(lastDay).padStart(2, '0')}`

    let closestIdx = 0
    let closestDist = Math.abs(new Date(group[0]!.price_date).getTime() - new Date(monthEnd).getTime())
    for (let i = 1; i < group.length; i++) {
      const dist = Math.abs(new Date(group[i]!.price_date).getTime() - new Date(monthEnd).getTime())
      if (dist < closestDist) { closestDist = dist; closestIdx = i }
    }

    for (let i = 0; i < group.length; i++) {
      if (i !== closestIdx) idsToDelete.push(group[i]!.id)
    }
  }

  if (idsToDelete.length > 0) {
    await sql`DELETE FROM price_history WHERE id = ANY(${idsToDelete})`
  }
}

export default router
