import { create } from 'zustand'
import api, { API_URL, refreshSession, setAccessToken } from '../services/api'

/**
 * Nothing about the session is persisted to localStorage any more - not the
 * token (see services/api.js) and not the user, because a cached user object
 * is a cached *role*, and a stale role means the UI shows an admin console
 * to someone whose admin access was revoked. The session is rebuilt on every
 * page load from the HttpOnly refresh cookie instead, which means the server
 * decides what this browser is allowed to be.
 */
export const useAuthStore = create((set, get) => ({
  user: null,
  activeRole: null,
  isAuthenticated: false,
  // False until the boot-time refresh has resolved. Routing must wait for
  // it, or a reload bounces an authenticated admin to /login for a frame
  // before snapping back.
  bootstrapped: false,

  applySession: (data) => {
    setAccessToken(data.access_token)
    set({ user: data.user, activeRole: data.active_role, isAuthenticated: true })
  },

  bootstrap: async () => {
    // Anyone who used the previous build has an access token, a refresh
    // token and a user object sitting in localStorage. They are dead weight
    // now - but a refresh token in web storage is exactly the exposure this
    // release removes, so clear them rather than leaving them to sit there
    // until the browser profile is wiped.
    for (const key of ['access_token', 'refresh_token', 'user']) {
      localStorage.removeItem(key)
    }

    try {
      const data = await refreshSession()
      get().applySession(data)
    } catch {
      setAccessToken(null)
      set({ user: null, activeRole: null, isAuthenticated: false })
    } finally {
      set({ bootstrapped: true })
    }
  },

  // No role argument: the server decides the session role from the account.
  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    get().applySession(data)
    return data
  },

  // Registration is a *request* for access, so this deliberately returns a
  // message rather than a session - there is nothing to sign into yet.
  register: async (email, username, password, requestedRole) => {
    const { data } = await api.post('/auth/register', {
      email, username, password, requested_role: requestedRole,
    })
    return data
  },

  // Re-issues the session under another role the account already holds.
  // Server-side it goes through the same membership check as login; the
  // client cannot grant itself a role by calling this.
  switchRole: async (role) => {
    const { data } = await api.post('/auth/switch-role', { role })
    get().applySession(data)
    return data
  },

  exchangeOAuthCode: async (code) => {
    const { data } = await api.post('/auth/oauth/exchange', { code })
    get().applySession(data)
    return data
  },

  startGoogleLogin: () => {
    window.location.href = `${API_URL}/auth/google/login`
  },

  logout: async () => {
    try {
      await api.post('/auth/logout')
    } catch {
      // best-effort - clear local state regardless
    }
    setAccessToken(null)
    set({ user: null, activeRole: null, isAuthenticated: false })
  },
}))
