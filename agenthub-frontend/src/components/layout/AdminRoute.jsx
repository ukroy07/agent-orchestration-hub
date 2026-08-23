import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * Gates the admin console on the *active session role*, not merely on the
 * account holding the admin role. A dual-role account signed in as a plain
 * user is treated as a plain user here - which matches what the server does,
 * since require_admin checks the same thing.
 *
 * Client-side gate, for navigation only. It hides a page; it does not
 * protect data - every /admin/* endpoint re-checks against the database on
 * every request. Treat this as UX, never as the security boundary.
 */
export default function AdminRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const activeRole = useAuthStore((s) => s.activeRole)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (activeRole !== 'admin') return <Navigate to="/dashboard" replace />
  return children
}
