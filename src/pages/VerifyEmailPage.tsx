import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import * as api from '../lib/api'
import { CheckCircle, XCircle } from 'lucide-react'

export function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('Invalid verification link'); return }

    api.verifyEmail(token)
      .then((res) => { setStatus('success'); setMessage(res.message) })
      .catch((err) => { setStatus('error'); setMessage(err instanceof Error ? err.message : 'Verification failed') })
  }, [token])

  return (
    <div className="login-screen">
      <div className="login-card" style={{ textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
            <p>Verifying your email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle size={48} style={{ color: 'var(--success)', margin: '0 auto 16px' }} />
            <h2 style={{ margin: '0 0 8px' }}>Email Verified!</h2>
            <p style={{ color: 'var(--ink-3)', marginBottom: 20 }}>{message}</p>
            <button className="btn btn-primary login-submit" onClick={() => navigate('/')}>
              Sign In
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle size={48} style={{ color: 'var(--error)', margin: '0 auto 16px' }} />
            <h2 style={{ margin: '0 0 8px' }}>Verification Failed</h2>
            <p style={{ color: 'var(--ink-3)', marginBottom: 20 }}>{message}</p>
            <button className="btn btn-primary login-submit" onClick={() => navigate('/')}>
              Back to Sign In
            </button>
          </>
        )}
      </div>
    </div>
  )
}
