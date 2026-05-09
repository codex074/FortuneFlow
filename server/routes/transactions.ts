import { Router } from 'express'
import { sql } from '../db.js'
import { authMiddleware, type AuthRequest } from '../auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { asset_type, currency, search } = req.query

    let rows
    if (asset_type && currency && search) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND asset_type = ${asset_type as string} AND currency = ${currency as string} AND asset_name ILIKE ${'%' + (search as string) + '%'}
        ORDER BY date DESC, created_at DESC
      `
    } else if (asset_type && currency) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND asset_type = ${asset_type as string} AND currency = ${currency as string}
        ORDER BY date DESC, created_at DESC
      `
    } else if (asset_type && search) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND asset_type = ${asset_type as string} AND asset_name ILIKE ${'%' + (search as string) + '%'}
        ORDER BY date DESC, created_at DESC
      `
    } else if (currency && search) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND currency = ${currency as string} AND asset_name ILIKE ${'%' + (search as string) + '%'}
        ORDER BY date DESC, created_at DESC
      `
    } else if (asset_type) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND asset_type = ${asset_type as string}
        ORDER BY date DESC, created_at DESC
      `
    } else if (currency) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND currency = ${currency as string}
        ORDER BY date DESC, created_at DESC
      `
    } else if (search) {
      rows = await sql`
        SELECT * FROM transactions
        WHERE user_id = ${userId} AND asset_name ILIKE ${'%' + (search as string) + '%'}
        ORDER BY date DESC, created_at DESC
      `
    } else {
      rows = await sql`
        SELECT * FROM transactions WHERE user_id = ${userId}
        ORDER BY date DESC, created_at DESC
      `
    }

    res.json(rows)
  } catch (err) {
    console.error('Get transactions error:', err)
    res.status(500).json({ error: 'Failed to get transactions' })
  }
})

router.get('/recent', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const limit = parseInt(req.query.limit as string) || 10
    const rows = await sql`
      SELECT * FROM transactions WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC LIMIT ${limit}
    `
    res.json(rows)
  } catch (err) {
    console.error('Get recent transactions error:', err)
    res.status(500).json({ error: 'Failed to get recent transactions' })
  }
})

router.post('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { date, asset_name, asset_type, currency, action, units, price_per_unit, fees, notes, total_cost_override } = req.body
    const totalCost = total_cost_override ?? (units * price_per_unit + (fees || 0))

    await sql`
      INSERT INTO transactions (user_id, date, asset_name, asset_type, currency, action, units, price_per_unit, total_cost, fees, notes)
      VALUES (${userId}, ${date}, ${asset_name}, ${asset_type}, ${currency}, ${action}, ${units}, ${price_per_unit}, ${totalCost}, ${fees || 0}, ${notes || null})
    `
    await sql`
      INSERT INTO assets (user_id, name, type, currency)
      VALUES (${userId}, ${asset_name}, ${asset_type}, ${currency})
      ON CONFLICT (user_id, name) DO NOTHING
    `
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Insert transaction error:', err)
    res.status(500).json({ error: 'Failed to create transaction' })
  }
})

router.put('/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    const { date, asset_name, asset_type, currency, action, units, price_per_unit, fees, notes, total_cost_override } = req.body
    const totalCost = total_cost_override ?? (units * price_per_unit + (fees || 0))

    await sql`
      UPDATE transactions SET date=${date}, asset_name=${asset_name}, asset_type=${asset_type},
        currency=${currency}, action=${action}, units=${units}, price_per_unit=${price_per_unit},
        total_cost=${totalCost}, fees=${fees || 0}, notes=${notes || null}
      WHERE id=${id} AND user_id=${userId}
    `
    await sql`
      INSERT INTO assets (user_id, name, type, currency)
      VALUES (${userId}, ${asset_name}, ${asset_type}, ${currency})
      ON CONFLICT (user_id, name) DO NOTHING
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Update transaction error:', err)
    res.status(500).json({ error: 'Failed to update transaction' })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    await sql`DELETE FROM transactions WHERE id=${id} AND user_id=${userId}`
    res.json({ success: true })
  } catch (err) {
    console.error('Delete transaction error:', err)
    res.status(500).json({ error: 'Failed to delete transaction' })
  }
})

export default router
