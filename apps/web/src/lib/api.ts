// Axios instance + in-memory access token + transparent refresh-on-401.
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // send/receive the httpOnly refresh cookie
})

/* ------------------------- in-memory access token ------------------------- */
// Kept in memory (not localStorage) to reduce XSS token-theft surface. Survives
// reloads via the refresh cookie + bootstrap() in AuthProvider.
let accessToken: string | null = null
export const setAccessToken = (token: string | null) => {
  accessToken = token
}
export const getAccessToken = () => accessToken

/* ------------------------------ interceptors ------------------------------ */
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`
  return config
})

// Single-flight refresh: concurrent 401s share one /auth/refresh call.
let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  try {
    // Raw axios (not `api`) so this request bypasses the interceptor recursion.
    const res = await axios.post<{ accessToken: string }>(
      `${API_URL}/auth/refresh`,
      {},
      { withCredentials: true },
    )
    setAccessToken(res.data.accessToken)
    return res.data.accessToken
  } catch {
    setAccessToken(null)
    return null
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined
    const url = original?.url ?? ''
    const isAuthFlow = url.includes('/auth/refresh') || url.includes('/auth/login')

    if (error.response?.status === 401 && original && !original._retry && !isAuthFlow) {
      original._retry = true
      refreshing = refreshing ?? refreshAccessToken()
      const token = await refreshing
      refreshing = null
      if (token) {
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
    }
    return Promise.reject(error)
  },
)

/**
 * Best-effort silent bootstrap on app load. Restores the session from the refresh
 * cookie and returns BOTH the access token and the user profile, so AuthProvider
 * can hydrate without a separate serial /auth/me round-trip.
 *
 * `user` is `null` when there's no session (401) OR when talking to an older API
 * build that doesn't yet bundle the profile — callers fall back to /auth/me in the
 * latter case. A transient network blip (cold API/DB, no HTTP response) is retried
 * once so a brief hiccup doesn't spuriously log the user out.
 */
export async function bootstrapSession(): Promise<{ token: string | null; user: unknown }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await axios.post<{ accessToken: string; user?: unknown }>(
        `${API_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      )
      setAccessToken(res.data.accessToken)
      return { token: res.data.accessToken, user: res.data.user ?? null }
    } catch (err) {
      // A real 401/403 (no/expired session) is final — don't retry, just clear.
      if (axios.isAxiosError(err) && err.response) break
      // No response = network/cold-start blip: pause briefly and retry once.
      if (attempt === 0) await new Promise((r) => setTimeout(r, 600))
    }
  }
  setAccessToken(null)
  return { token: null, user: null }
}

/** Decode a JWT's `exp` claim (unix seconds). Returns null if unparseable. */
function jwtExp(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof json.exp === 'number' ? json.exp : null
  } catch {
    return null
  }
}

/**
 * Return a currently-valid access token for out-of-band consumers that do NOT go
 * through the axios 401-retry interceptor — chiefly the collab WebSocket handshake.
 *
 * Hocuspocus calls its `token` getter on every (re)connect. If we handed back the
 * stale in-memory token, a socket that reconnects after the access token expired
 * would be rejected by the server (onAuthenticate → 'invalid-token') and stay
 * rejected until some unrelated HTTP 401 happened to refresh it. So here we
 * proactively refresh when the token is missing or within 30s of expiry, sharing
 * the single-flight `refreshing` promise so we never fire two /auth/refresh calls.
 */
export async function getFreshAccessToken(): Promise<string> {
  const current = accessToken
  const exp = current ? jwtExp(current) : null
  const stillValid = current && exp !== null && exp * 1000 - Date.now() > 30_000
  if (stillValid) return current

  refreshing = refreshing ?? refreshAccessToken()
  const token = await refreshing
  refreshing = null
  return token ?? current ?? ''
}

/** Narrow an axios error into the API's `{ code, message }` body. */
export function apiError(err: unknown): { code?: string; message?: string; status?: number } {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { code?: string; message?: string } | undefined
    return { code: data?.code, message: data?.message, status: err.response?.status }
  }
  return { message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด' }
}
