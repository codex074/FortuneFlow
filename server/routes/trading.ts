import { Router } from 'express'
import { sql } from '../db.js'
import { authMiddleware, type AuthRequest } from '../auth.js'

const router = Router()
router.use(authMiddleware)

// ── Trading Transactions ──

router.get('/transactions', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const rows = await sql`
      SELECT * FROM trading_transactions WHERE user_id = ${userId}
      ORDER BY date DESC, created_at DESC
    `
    res.json(rows)
  } catch (err) {
    console.error('Get trading transactions error:', err)
    res.status(500).json({ error: 'Failed to get trading transactions' })
  }
})

router.post('/transactions', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { date, asset_name, currency, action, units, price_per_unit, fees, notes } = req.body
    const totalCost = units * price_per_unit + (fees || 0)
    await sql`
      INSERT INTO trading_transactions (user_id, date, asset_name, currency, action, units, price_per_unit, total_cost, fees, notes)
      VALUES (${userId}, ${date}, ${asset_name}, ${currency}, ${action}, ${units}, ${price_per_unit}, ${totalCost}, ${fees || 0}, ${notes || null})
    `
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Insert trading transaction error:', err)
    res.status(500).json({ error: 'Failed to create trading transaction' })
  }
})

router.put('/transactions/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    const { date, asset_name, currency, action, units, price_per_unit, fees, notes } = req.body
    const totalCost = units * price_per_unit + (fees || 0)
    await sql`
      UPDATE trading_transactions SET date=${date}, asset_name=${asset_name}, currency=${currency},
        action=${action}, units=${units}, price_per_unit=${price_per_unit}, total_cost=${totalCost},
        fees=${fees || 0}, notes=${notes || null}
      WHERE id=${id} AND user_id=${userId}
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Update trading transaction error:', err)
    res.status(500).json({ error: 'Failed to update trading transaction' })
  }
})

router.delete('/transactions/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    await sql`DELETE FROM trading_transactions WHERE id=${id} AND user_id=${userId}`
    res.json({ success: true })
  } catch (err) {
    console.error('Delete trading transaction error:', err)
    res.status(500).json({ error: 'Failed to delete trading transaction' })
  }
})

// ── TFEX Trades ──

router.get('/tfex', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const rows = await sql`
      SELECT * FROM tfex_trades WHERE user_id = ${userId}
      ORDER BY entry_date DESC, created_at DESC
    `
    res.json(rows)
  } catch (err) {
    console.error('Get TFEX trades error:', err)
    res.status(500).json({ error: 'Failed to get TFEX trades' })
  }
})

router.post('/tfex', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { entry_date, contract, direction, contracts, multiplier, entry_price, exit_date, exit_price, commission, notes } = req.body
    await sql`
      INSERT INTO tfex_trades (user_id, entry_date, contract, direction, contracts, multiplier, entry_price, exit_date, exit_price, commission, notes)
      VALUES (${userId}, ${entry_date}, ${contract}, ${direction}, ${contracts}, ${multiplier}, ${entry_price},
        ${exit_date || null}, ${exit_price !== '' && exit_price != null ? parseFloat(exit_price) : null}, ${commission || 0}, ${notes || null})
    `
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Insert TFEX trade error:', err)
    res.status(500).json({ error: 'Failed to create TFEX trade' })
  }
})

router.put('/tfex/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    const { entry_date, contract, direction, contracts, multiplier, entry_price, exit_date, exit_price, commission, notes } = req.body
    await sql`
      UPDATE tfex_trades SET entry_date=${entry_date}, contract=${contract}, direction=${direction},
        contracts=${contracts}, multiplier=${multiplier}, entry_price=${entry_price},
        exit_date=${exit_date || null}, exit_price=${exit_price !== '' && exit_price != null ? parseFloat(exit_price) : null},
        commission=${commission || 0}, notes=${notes || null}
      WHERE id=${id} AND user_id=${userId}
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Update TFEX trade error:', err)
    res.status(500).json({ error: 'Failed to update TFEX trade' })
  }
})

router.delete('/tfex/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    await sql`DELETE FROM tfex_trades WHERE id=${id} AND user_id=${userId}`
    res.json({ success: true })
  } catch (err) {
    console.error('Delete TFEX trade error:', err)
    res.status(500).json({ error: 'Failed to delete TFEX trade' })
  }
})

// ── Forex Trades ──

router.get('/forex', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const rows = await sql`
      SELECT * FROM forex_trades WHERE user_id = ${userId}
      ORDER BY entry_date DESC, created_at DESC
    `
    res.json(rows)
  } catch (err) {
    console.error('Get forex trades error:', err)
    res.status(500).json({ error: 'Failed to get forex trades' })
  }
})

router.post('/forex', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const { entry_date, pair, direction, lots, lot_size, entry_price, exit_date, exit_price, commission, currency, notes } = req.body
    await sql`
      INSERT INTO forex_trades (user_id, entry_date, pair, direction, lots, lot_size, entry_price, exit_date, exit_price, commission, currency, notes)
      VALUES (${userId}, ${entry_date}, ${pair}, ${direction}, ${lots}, ${lot_size}, ${entry_price},
        ${exit_date || null}, ${exit_price !== '' && exit_price != null ? parseFloat(exit_price) : null}, ${commission || 0}, ${currency}, ${notes || null})
    `
    res.status(201).json({ success: true })
  } catch (err) {
    console.error('Insert forex trade error:', err)
    res.status(500).json({ error: 'Failed to create forex trade' })
  }
})

router.put('/forex/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    const { entry_date, pair, direction, lots, lot_size, entry_price, exit_date, exit_price, commission, currency, notes } = req.body
    await sql`
      UPDATE forex_trades SET entry_date=${entry_date}, pair=${pair}, direction=${direction},
        lots=${lots}, lot_size=${lot_size}, entry_price=${entry_price},
        exit_date=${exit_date || null}, exit_price=${exit_price !== '' && exit_price != null ? parseFloat(exit_price) : null},
        commission=${commission || 0}, currency=${currency}, notes=${notes || null}
      WHERE id=${id} AND user_id=${userId}
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Update forex trade error:', err)
    res.status(500).json({ error: 'Failed to update forex trade' })
  }
})

router.delete('/forex/:id', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const id = parseInt(req.params.id)
    await sql`DELETE FROM forex_trades WHERE id=${id} AND user_id=${userId}`
    res.json({ success: true })
  } catch (err) {
    console.error('Delete forex trade error:', err)
    res.status(500).json({ error: 'Failed to delete forex trade' })
  }
})

export default router
