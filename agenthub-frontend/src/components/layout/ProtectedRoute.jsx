import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'

/**
 * The workspace (tasks) side. An *admin session* is redirected to the admin
 * console rather than shown the task pages: signing in as admin means you
 * came here to administer the platform, and a dual-role account that wants
 * the workspace can switch role from the navbar.
 *
 * Client-side routing only - it decides what to render, never what data is
 * allowed. Every endpoint re-checks on the server.
 */
export default function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const activeRole = useAuthStore((s) => s.activeRole)

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (activeRole === 'admin') return <Navigate to="/admin" replace />
  return children
}
