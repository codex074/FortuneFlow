import { Router } from 'express'
import { sql } from '../db.js'
import { authMiddleware, type AuthRequest } from '../auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const rows = await sql`
      SELECT * FROM assets WHERE user_id = ${userId} ORDER BY type, name
    `
    res.json(rows)
  } catch (err) {
    console.error('Get assets error:', err)
    res.status(500).json({ error: 'Failed to get assets' })
  }
})

router.put('/:name/price', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const name = req.params.name
    const { price } = req.body
    await sql`
      UPDATE assets SET current_price = ${price}, last_updated = NOW()::TEXT
      WHERE name = ${name} AND user_id = ${userId}
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Update asset price error:', err)
    res.status(500).json({ error: 'Failed to update asset price' })
  }
})

export default router
