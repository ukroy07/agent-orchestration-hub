import { create } from 'zustand'
import api from '../services/api'

export const useAdminStore = create((set, get) => ({
  stats: null,
  users: [],
  pending: [],
  loading: false,
  error: null,

  // One call loads the whole dashboard. The two endpoints are fetched in
  // parallel rather than in sequence - they're independent, and serialising
  // them just doubles the time the page spends on its skeleton.
  load: async () => {
    set({ loading: true, error: null })
    try {
      const [stats, users, pending] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/users'),
        api.get('/admin/registrations'),
      ])
      set({ stats: stats.data, users: users.data, pending: pending.data, loading: false })
    } catch (err) {
      set({
        loading: false,
        error: err?.response?.status === 403
          ? 'Your account does not have the platform admin role.'
          : (err?.response?.data?.detail || 'Could not load platform stats.'),
      })
    }
  },

  setRoles: async (userId, roles) => {
    const { data } = await api.patch(`/admin/users/${userId}/roles`, { roles })
    set((s) => ({ users: s.users.map((u) => (u.id === userId ? data : u)) }))
    // Role counts and the per-user rollup both move when roles change, so
    // the summary is stale the moment this succeeds.
    await get().load()
    return data
  },

  approve: async (userId, roles) => {
    const { data } = await api.post(`/admin/registrations/${userId}/approve`, { roles })
    await get().load()
    return data
  },

  reject: async (userId) => {
    const { data } = await api.post(`/admin/registrations/${userId}/reject`)
    await get().load()
    return data
  },
}))
