import axios from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

/**
 * The access token lives in this module variable and nowhere else - not in
 * localStorage, not in sessionStorage, not on window. Anything in web
 * storage is readable by every script on the origin, so one XSS hole (ours,
 * a dependency's, a browser extension's) hands over the session. A variable
 * in a module closure dies with the tab and never appears in a storage
 * inspector.
 *
 * The refresh token isn't here at all: it's an HttpOnly cookie the server
 * sets, which this code cannot read by design. `withCredentials` is what
 * makes the browser send it back on /auth calls.
 *
 * The cost of memory-only storage is that a page reload starts with no
 * token - which is why the app calls refresh once on boot (see
 * authStore.bootstrap) to trade the cookie for a fresh one.
 */
let accessToken = null

export const setAccessToken = (token) => { accessToken = token }
export const getAccessToken = () => accessToken

const api = axios.create({ baseURL: API_URL, withCredentials: true })

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

let refreshInFlight = null

// Exported so the app can restore a session on boot without going through a
// failed request first.
export async function refreshSession() {
  // Multiple 401s firing at once (several components mounting together)
  // must trigger exactly one refresh, not a stampede - and with rotation a
  // stampede is worse than wasteful: the second request would present an
  // already-rotated token and trip the server's reuse detection, logging
  // the user out of every session.
  refreshInFlight = refreshInFlight || axios.post(`${API_URL}/auth/refresh`, {}, { withCredentials: true })
  try {
    const { data } = await refreshInFlight
    setAccessToken(data.access_token)
    return data
  } finally {
    refreshInFlight = null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    const url = original?.url || ''
    const isAuthRoute = ['/auth/login', '/auth/register', '/auth/refresh'].some((p) => url.includes(p))

    if (error.response?.status === 401 && !original._retry && !isAuthRoute) {
      original._retry = true
      try {
        const data = await refreshSession()
        original.headers.Authorization = `Bearer ${data.access_token}`
        return api(original)
      } catch {
        setAccessToken(null)
        if (!window.location.pathname.startsWith('/login')) {
          window.location.href = '/login?status=expired'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
