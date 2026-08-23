import React, { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/layout/Navbar'
import ProtectedRoute from './components/layout/ProtectedRoute'
import Footer from './components/layout/Footer'
import AdminRoute from './components/layout/AdminRoute'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import OAuthCallback from './pages/OAuthCallback'
import Dashboard from './pages/Dashboard'
import TaskView from './pages/TaskView'
import AdminDashboard from './pages/AdminDashboard'
import { useAuthStore } from './store/authStore'

export default function App() {
  const bootstrap = useAuthStore((s) => s.bootstrap)
  const bootstrapped = useAuthStore((s) => s.bootstrapped)

  // The access token lives in memory, so a page load starts with none. This
  // trades the HttpOnly refresh cookie for a fresh one before anything
  // renders - without it every reload would look like a logout.
  useEffect(() => { bootstrap() }, [bootstrap])

  if (!bootstrapped) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="font-mono text-sm text-ink-600">Restoring session…</p>
      </div>
    )
  }

  return (
    <BrowserRouter>
      {/* A column that is at least the viewport tall, with the routed page
          as the growing middle. That is what pins the footer to the bottom
          on short pages without it overlapping content on long ones - and it
          means pages size themselves with flex instead of subtracting the
          height of every piece of chrome from 100vh. */}
      <div className="flex min-h-screen flex-col">
        <Navbar />
        <main className="flex flex-1 flex-col">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/oauth/callback" element={<OAuthCallback />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/task/:taskId" element={<ProtectedRoute><TaskView /></ProtectedRoute>} />
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          </Routes>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}
