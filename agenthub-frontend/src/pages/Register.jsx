import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Radar, MailCheck } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { Button, Input, Card, RoleChoice } from '../components/ui/primitives'
import { ROLE_OPTIONS } from '../constants/roles'

export default function Register() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [requestedRole, setRequestedRole] = useState('user')
  const [submitted, setSubmitted] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const register = useAuthStore((s) => s.register)
  const startGoogleLogin = useAuthStore((s) => s.startGoogleLogin)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const data = await register(email, username, password, requestedRole)
      // There is no session to navigate into: registration is a request for
      // access, and the account cannot sign in until an admin approves it.
      setSubmitted(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not submit your request.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <Card className="w-full max-w-sm p-6 text-center sm:p-8">
          <MailCheck className="mx-auto mb-3 h-8 w-8 text-trust" aria-hidden="true" />
          <h1 className="font-display text-xl font-semibold text-ink-100">Request submitted</h1>
          <p className="mt-2 text-sm text-ink-400">{submitted.message}</p>
          <p className="mt-3 font-mono text-xs text-ink-600">
            {submitted.email} · requested {submitted.requested_role}
          </p>
          <Link to="/login" className="mt-6 inline-block text-sm text-agent-researcher hover:underline">
            Back to sign in
          </Link>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <Card className="w-full max-w-sm p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Radar className="mb-3 h-8 w-8 text-agent-researcher" aria-hidden="true" />
          <h1 className="font-display text-xl font-semibold text-ink-100">Request access</h1>
          <p className="mt-1 text-sm text-ink-400">An admin approves new accounts before first sign-in</p>
        </div>

        <button
          onClick={startGoogleLogin}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-base-600 bg-base-900 py-2.5 text-sm font-medium text-ink-100 hover:bg-base-800 transition-colors"
        >
          Continue with Google
        </button>

        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-base-700" />
          <span className="text-xs text-ink-600">or</span>
          <div className="h-px flex-1 bg-base-700" />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input id="email" type="email" label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
          <Input id="username" label="User ID" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="username" minLength={3} />
          <Input id="password" type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={8} />
          <RoleChoice
            label="Request access as"
            value={requestedRole}
            onChange={setRequestedRole}
            options={ROLE_OPTIONS}
          />
          <p className="-mt-1 text-xs text-ink-600">
            An administrator reviews every request and decides what access to grant.
          </p>
          {error && <p className="text-sm text-agent-critic">{error}</p>}
          <Button type="submit" disabled={loading}>{loading ? 'Submitting…' : 'Request access'}</Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-400">
          Already have an account? <Link to="/login" className="text-agent-researcher hover:underline">Sign in</Link>
        </p>
      </Card>
    </div>
  )
}
