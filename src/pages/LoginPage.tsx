import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { AppLogo } from '../components/brand/AppLogo'
import * as api from '../lib/api'
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react'

type Mode = 'login' | 'register' | 'verify-pending' | 'forgot' | 'forgot-sent'

export function LoginPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'forgot') {
      if (!email) { setError('Please enter your email'); return }
      setLoading(true)
      try {
        await api.forgotPassword(email)
        setMode('forgot-sent')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }

    if (mode === 'register') {
      if (!displayName) { setError('Please enter your display name'); return }
      if (password.length < 6) { setError('Password must be at least 6 characters'); return }
      if (password !== confirmPassword) { setError('Passwords do not match'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password, displayName)
        setMode('verify-pending')
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong'
      if (msg.includes('verify your email')) {
        setMode('verify-pending')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleResendVerification = async () => {
    setResending(true)
    setResendMsg(null)
    try {
      const res = await api.resendVerification(email)
      setResendMsg(res.message)
    } catch {
      setResendMsg('Failed to resend. Please try again.')
    } finally {
      setResending(false)
    }
  }

  const switchMode = (target: Mode) => {
    setMode(target)
    setError(null)
    setResendMsg(null)
    setConfirmPassword('')
    setDisplayName('')
  }

  if (mode === 'verify-pending') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-brand">
            <Mail size={48} style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
            <h1>Check Your Email</h1>
            <p>We sent a verification link to</p>
          </div>
          <p style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 15 }}>{email}</p>
          <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.6 }}>
            Click the link in the email to verify your account.<br />
            The link expires in 24 hours.
          </p>
          {resendMsg && <p className="text-success" style={{ fontSize: 13 }}>{resendMsg}</p>}
          <button
            className="btn btn-secondary"
            onClick={handleResendVerification}
            disabled={resending}
            style={{ marginTop: 8 }}
          >
            {resending ? 'Sending...' : 'Resend Verification Email'}
          </button>
          <p className="login-switch" style={{ marginTop: 16 }}>
            <button type="button" className="login-switch-btn" onClick={() => switchMode('login')}>
              <ArrowLeft size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    )
  }

  if (mode === 'forgot-sent') {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <div className="login-brand">
            <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 12px' }} />
            <h1>Email Sent</h1>
            <p>If an account exists for <strong>{email}</strong>, we sent a password reset link.</p>
          </div>
          <p style={{ color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.6 }}>
            Check your inbox and click the link to reset your password.<br />
            The link expires in 1 hour.
          </p>
          <p className="login-switch" style={{ marginTop: 16 }}>
            <button type="button" className="login-switch-btn" onClick={() => switchMode('login')}>
              <ArrowLeft size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              Back to Sign In
            </button>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <AppLogo />
          <h1>FortuneFlow</h1>
          <p>
            {mode === 'login' && 'Sign in to your account'}
            {mode === 'register' && 'Create a new account'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {mode === 'register' && (
          <label className="form-label">
            Display Name
            <input
              className="input"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
            />
          </label>
        )}

        <label className="form-label">
          Email
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            autoFocus
          />
        </label>

        {mode !== 'forgot' && (
          <label className="form-label">
            Password
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
        )}

        {mode === 'register' && (
          <label className="form-label">
            Confirm Password
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm password"
              autoComplete="new-password"
            />
          </label>
        )}

        {error && <p className="text-error">{error}</p>}

        <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
          {loading
            ? 'Please wait...'
            : mode === 'login'
            ? 'Sign In'
            : mode === 'register'
            ? 'Create Account'
            : 'Send Reset Link'}
        </button>

        {mode === 'login' && (
          <>
            <button
              type="button"
              className="login-forgot-btn"
              onClick={() => switchMode('forgot')}
            >
              Forgot password?
            </button>
            <p className="login-switch">
              Don't have an account?{' '}
              <button type="button" className="login-switch-btn" onClick={() => switchMode('register')}>
                Sign Up
              </button>
            </p>
          </>
        )}

        {mode === 'register' && (
          <p className="login-switch">
            Already have an account?{' '}
            <button type="button" className="login-switch-btn" onClick={() => switchMode('login')}>
              Sign In
            </button>
          </p>
        )}

        {mode === 'forgot' && (
          <p className="login-switch">
            <button type="button" className="login-switch-btn" onClick={() => switchMode('login')}>
              <ArrowLeft size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
              Back to Sign In
            </button>
          </p>
        )}
      </form>
    </div>
  )
}
