import { Router } from 'express'
import { sql } from '../db.js'
import { authMiddleware, type AuthRequest } from '../auth.js'

const router = Router()
router.use(authMiddleware)

router.get('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const rows = await sql`SELECT key, value FROM settings WHERE user_id = ${userId}`
    const settings: Record<string, string> = {}
    for (const row of rows) {
      settings[row.key as string] = row.value as string
    }
    res.json(settings)
  } catch (err) {
    console.error('Get settings error:', err)
    res.status(500).json({ error: 'Failed to get settings' })
  }
})

router.put('/:key', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const key = req.params.key
    const { value } = req.body
    await sql`
      INSERT INTO settings (user_id, key, value) VALUES (${userId}, ${key}, ${value})
      ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
    `
    res.json({ success: true })
  } catch (err) {
    console.error('Set setting error:', err)
    res.status(500).json({ error: 'Failed to save setting' })
  }
})

router.put('/', async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const entries = req.body as Record<string, string>
    for (const [key, value] of Object.entries(entries)) {
      await sql`
        INSERT INTO settings (user_id, key, value) VALUES (${userId}, ${key}, ${value})
        ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value
      `
    }
    res.json({ success: true })
  } catch (err) {
    console.error('Bulk set settings error:', err)
    res.status(500).json({ error: 'Failed to save settings' })
  }
})

export default router
