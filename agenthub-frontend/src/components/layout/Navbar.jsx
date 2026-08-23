import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Radar, LogOut, ShieldCheck, User as UserIcon, ArrowLeftRight } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { Button } from '../ui/primitives'

export default function Navbar() {
  const { user, activeRole, isAuthenticated, logout, switchRole } = useAuthStore()
  const [switching, setSwitching] = useState(false)
  const navigate = useNavigate()

  const roles = user?.roles || []
  const otherRole = roles.find((r) => r !== activeRole)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  // Switching role re-issues the session server-side rather than flipping a
  // local flag, so the new access token genuinely carries the new role.
  const handleSwitch = async () => {
    if (!otherRole) return
    setSwitching(true)
    try {
      const data = await switchRole(otherRole)
      navigate(data.active_role === 'admin' ? '/admin' : '/dashboard')
    } finally {
      setSwitching(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-base-700 bg-base-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link to={activeRole === 'admin' ? '/admin' : '/'} className="flex items-center gap-2">
          <Radar className="h-5 w-5 text-agent-researcher" aria-hidden="true" />
          <span className="font-display text-lg font-semibold tracking-tight">AgentHub</span>
        </Link>

        {isAuthenticated ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 font-mono text-xs text-ink-400 sm:flex">
              {activeRole === 'admin'
                ? <ShieldCheck className="h-3.5 w-3.5 text-agent-researcher" aria-hidden="true" />
                : <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {user?.username} · {activeRole}
            </span>

            {otherRole && (
              <button
                onClick={handleSwitch}
                disabled={switching}
                className="flex items-center gap-1.5 rounded-md border border-agent-researcher/30 px-3 py-1.5 text-sm text-agent-researcher transition-colors hover:bg-agent-researcher/10 disabled:opacity-50"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">
                  {switching ? 'Switching…' : `Switch to ${otherRole}`}
                </span>
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-md border border-base-600 px-3 py-1.5 text-sm text-ink-300 hover:bg-base-800 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link to="/login" className="text-sm text-ink-300 hover:text-ink-100 px-3 py-1.5">Sign in</Link>
            <Link to="/register"><Button className="!py-1.5 !px-3 text-sm">Request access</Button></Link>
          </div>
        )}
      </div>
    </header>
  )
}
