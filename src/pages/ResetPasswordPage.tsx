import { useState, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../lib/api'
import { AppLogo } from '../components/brand/AppLogo'
import { CheckCircle } from 'lucide-react'

export function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!password || !confirmPassword) { setError('Please fill in all fields'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (!token) { setError('Invalid reset link'); return }

    setLoading(true)
    try {
      await api.resetPassword(token, password)
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: 'center' }}>
          <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
          <h2 style={{ margin: '0 0 8px' }}>Password Reset!</h2>
          <p style={{ color: 'var(--ink-3)', marginBottom: 20 }}>
            Your password has been updated. You can now sign in with your new password.
          </p>
          <button className="btn btn-primary login-submit" onClick={() => navigate('/')}>
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <AppLogo />
          <h1>New Password</h1>
          <p>Enter a new password for your account</p>
        </div>

        <label className="form-label">
          New Password
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
            autoFocus
          />
        </label>

        <label className="form-label">
          Confirm Password
          <input
            className="input"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
          />
        </label>

        {error && <p className="text-error">{error}</p>}

        <button className="btn btn-primary login-submit" type="submit" disabled={loading}>
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
      </form>
    </div>
  )
}
