import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Loader2, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const [error, setError] = useState('')
  const exchangeOAuthCode = useAuthStore((s) => s.exchangeOAuthCode)
  const navigate = useNavigate()
  const attempted = useRef(false)

  useEffect(() => {
    const code = searchParams.get('code')
    if (!code) {
      setError('Missing authorization code.')
      return
    }
    // StrictMode double-invokes effects in dev - the exchange code is
    // one-time-use server-side, so guard against firing it twice.
    if (attempted.current) return
    attempted.current = true

    exchangeOAuthCode(code)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => setError('That sign-in link is invalid or has expired. Please try again.'))
  }, [searchParams, exchangeOAuthCode, navigate])

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
      {error ? (
        <>
          <AlertTriangle className="h-8 w-8 text-agent-critic" aria-hidden="true" />
          <p className="text-sm text-ink-300">{error}</p>
          <Link to="/login" className="text-sm text-agent-researcher hover:underline">Back to sign in</Link>
        </>
      ) : (
        <>
          <Loader2 className="h-6 w-6 animate-spin text-agent-researcher" aria-hidden="true" />
          <p className="text-sm text-ink-400">Finishing sign-in…</p>
        </>
      )}
    </div>
  )
}
