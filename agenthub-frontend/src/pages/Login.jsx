import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Radar } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Button, Input, Card, Notice } from '../components/ui/primitives'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const login = useAuthStore((s) => s.login)
  const startGoogleLogin = useAuthStore((s) => s.startGoogleLogin)
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const status = params.get('status')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      // No role is sent. The server derives it from the account, so an
      // account with admin access always lands in the admin console.
      const data = await login(email, password)
      navigate(data.active_role === 'admin' ? '/admin' : '/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not sign in. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Radar className="mb-3 h-8 w-8 text-agent-researcher" aria-hidden="true" />
          <h1 className="font-display text-xl font-semibold text-ink-100">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-400">Sign in to your agent workspace</p>
        </div>

        {status === 'pending' && (
          <div className="mb-4">
            <Notice tone="warn">
              Your account is waiting for administrator approval. You will be able
              to sign in once it has been approved.
            </Notice>
          </div>
        )}
        {status === 'denied' && (
          <div className="mb-4">
            <Notice tone="danger">
              Your access request was not approved. Contact an administrator.
            </Notice>
          </div>
        )}
        {status === 'expired' && (
          <div className="mb-4">
            <Notice tone="info">Your session expired. Please sign in again.</Notice>
          </div>
        )}

        <button
          onClick={startGoogleLogin}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-base-600 bg-base-900 py-2.5 text-sm font-medium text-ink-100 hover:bg-base-800 transition-colors"
        >
          <GoogleIcon /> Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-xs text-ink-600">or</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input id="email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input id="password" type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
          {error && <p className="text-sm text-agent-critic">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-400">
          New here? <Link to="/register" className="text-agent-researcher hover:underline">Request access</Link>
        </p>
      </Card>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.4 0 6.4 1.2 8.8 3.5l6.6-6.6C35.3 2.4 30 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.7 6c1.9-5.6 7.1-9.7 13.8-9.7z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.6c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.2-3.9 6.7-9.7 6.7-17.2z" />
      <path fill="#FBBC05" d="M10.2 19.2c-.5 1.5-.8 3.1-.8 4.8s.3 3.3.8 4.8l-7.7 6C.9 31.5 0 27.9 0 24s.9-7.5 2.5-10.8z" />
      <path fill="#34A853" d="M24 48c6 0 11.3-2 15-5.4l-7.3-5.7c-2 1.4-4.6 2.2-7.7 2.2-6.7 0-11.9-4.1-13.8-9.7l-7.7 6C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}
