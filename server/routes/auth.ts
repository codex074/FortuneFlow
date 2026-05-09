import { Router } from 'express'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { sql } from '../db.js'
import { signToken, type AuthRequest, authMiddleware } from '../auth.js'
import { sendVerificationEmail, sendPasswordResetEmail } from '../email.js'

const router = Router()

router.post('/register', async (req, res) => {
  try {
    const { email, password, displayName } = req.body
    if (!email || !password || !displayName) {
      res.status(400).json({ error: 'Email, password, and display name are required' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' })
      return
    }

    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const result = await sql`
      INSERT INTO users (email, password_hash, display_name, email_verified, verification_token, verification_expires)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${displayName}, FALSE, ${verificationToken}, ${verificationExpires})
      RETURNING id, email, display_name
    `
    const user = result[0]!

    await sql`
      INSERT INTO settings (user_id, key, value)
      VALUES (${user.id}, 'exchange_rate_thb_usd', '35.0')
    `

    try {
      await sendVerificationEmail(email.toLowerCase(), verificationToken, displayName)
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr)
    }

    res.status(201).json({
      message: 'Account created. Please check your email to verify.',
      pendingVerification: true,
    })
  } catch (err) {
    console.error('Register error:', err)
    res.status(500).json({ error: 'Registration failed' })
  }
})

router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params
    const result = await sql`
      SELECT id, email FROM users
      WHERE verification_token = ${token} AND verification_expires > NOW()
    `
    if (result.length === 0) {
      res.status(400).json({ error: 'Invalid or expired verification link' })
      return
    }

    await sql`
      UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_expires = NULL
      WHERE id = ${result[0]!.id}
    `

    res.json({ message: 'Email verified successfully' })
  } catch (err) {
    console.error('Verify email error:', err)
    res.status(500).json({ error: 'Verification failed' })
  }
})

router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ error: 'Email is required' })
      return
    }

    const result = await sql`
      SELECT id, email, display_name, email_verified FROM users WHERE email = ${email.toLowerCase()}
    `
    if (result.length === 0) {
      res.json({ message: 'If an account exists, a verification email has been sent.' })
      return
    }

    const user = result[0]!
    if (user.email_verified) {
      res.json({ message: 'Email is already verified. You can sign in.' })
      return
    }

    const verificationToken = crypto.randomBytes(32).toString('hex')
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await sql`
      UPDATE users SET verification_token = ${verificationToken}, verification_expires = ${verificationExpires}
      WHERE id = ${user.id}
    `

    await sendVerificationEmail(user.email as string, verificationToken, user.display_name as string)

    res.json({ message: 'If an account exists, a verification email has been sent.' })
  } catch (err) {
    console.error('Resend verification error:', err)
    res.status(500).json({ error: 'Failed to resend verification email' })
  }
})

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' })
      return
    }

    const result = await sql`
      SELECT id, email, password_hash, display_name, email_verified FROM users WHERE email = ${email.toLowerCase()}
    `
    if (result.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const user = result[0]!
    const valid = await bcrypt.compare(password, user.password_hash as string)
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    if (!user.email_verified) {
      res.status(403).json({ error: 'Please verify your email before signing in', needsVerification: true, email: user.email })
      return
    }

    const token = signToken({ userId: user.id as number, email: user.email as string })
    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.display_name },
    })
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({ error: 'Login failed' })
  }
})

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email) {
      res.status(400).json({ error: 'Email is required' })
      return
    }

    const result = await sql`
      SELECT id, email, display_name FROM users WHERE email = ${email.toLowerCase()}
    `

    if (result.length > 0) {
      const user = result[0]!
      const resetToken = crypto.randomBytes(32).toString('hex')
      const resetExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString()

      await sql`
        UPDATE users SET reset_token = ${resetToken}, reset_expires = ${resetExpires}
        WHERE id = ${user.id}
      `

      await sendPasswordResetEmail(user.email as string, resetToken, user.display_name as string)
    }

    res.json({ message: 'If an account with that email exists, a reset link has been sent.' })
  } catch (err) {
    console.error('Forgot password error:', err)
    res.status(500).json({ error: 'Failed to process request' })
  }
})

router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body
    if (!token || !password) {
      res.status(400).json({ error: 'Token and new password are required' })
      return
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' })
      return
    }

    const result = await sql`
      SELECT id FROM users WHERE reset_token = ${token} AND reset_expires > NOW()
    `
    if (result.length === 0) {
      res.status(400).json({ error: 'Invalid or expired reset link' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)
    await sql`
      UPDATE users SET password_hash = ${passwordHash}, reset_token = NULL, reset_expires = NULL, email_verified = TRUE
      WHERE id = ${result[0]!.id}
    `

    res.json({ message: 'Password has been reset successfully' })
  } catch (err) {
    console.error('Reset password error:', err)
    res.status(500).json({ error: 'Failed to reset password' })
  }
})

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { userId } = (req as AuthRequest).user!
    const result = await sql`
      SELECT id, email, display_name, created_at FROM users WHERE id = ${userId}
    `
    if (result.length === 0) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    const user = result[0]!
    res.json({ id: user.id, email: user.email, displayName: user.display_name })
  } catch (err) {
    console.error('Get user error:', err)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

export default router
