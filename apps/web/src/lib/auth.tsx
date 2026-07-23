// Auth context: session bootstrap, login/logout, current user.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, bootstrapSession, setAccessToken } from './api'
import { applyMode, applyTheme, type Mode, type ThemeId } from './cn'
import { setLanguage, type Language } from '../i18n'

/** Apply a user's saved preferences (color + mode + language) to the document. */
function applyUserSetting(setting?: UserSetting | null): void {
  if (!setting) return
  applyTheme(setting.themeColor as ThemeId)
  applyMode(setting.themeMode as Mode)
  setLanguage(setting.language as Language)
}

export interface UserSetting {
  themeColor: string
  themeMode: string
  language: string
  fontSize: number
  notifyInvite: boolean
  notifyMention: boolean
  notifyRevision: boolean
}

export interface AuthUser {
  id: string
  username: string
  email: string
  emailVerified: boolean
  createdAt: string
  setting?: UserSetting | null
}

interface AuthContextValue {
  user: AuthUser | null
  /** True until the initial silent session bootstrap completes. */
  initializing: boolean
  login: (identity: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshMe: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchMe(): Promise<AuthUser> {
  const res = await api.get<AuthUser>('/auth/me')
  return res.data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [initializing, setInitializing] = useState(true)

  const refreshMe = useCallback(async () => {
    setUser(await fetchMe())
  }, [])

  // Silent bootstrap: if a refresh cookie exists, restore the session on load.
  useEffect(() => {
    let active = true
    ;(async () => {
      const { token, user: bootstrapped } = await bootstrapSession()
      if (!active) return
      if (token) {
        if (bootstrapped) {
          // New API bundles the profile with /auth/refresh — no extra round-trip.
          setUser(bootstrapped as AuthUser)
        } else {
          // Older API (deploy window) returned only a token — fall back to /auth/me.
          try {
            setUser(await fetchMe())
          } catch {
            setUser(null)
          }
        }
      }
      if (active) setInitializing(false)
    })()
    return () => {
      active = false
    }
  }, [])

  // Apply the user's saved theme + language whenever their settings change
  // (login, bootstrap, or a settings update that calls refreshMe).
  useEffect(() => {
    applyUserSetting(user?.setting)
    // Intentionally keyed on the specific fields we apply, not the whole `user?.setting`
    // object — depending on the object would re-run on unrelated setting changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.setting?.themeColor, user?.setting?.themeMode, user?.setting?.language])

  const login = useCallback(async (identity: string, password: string): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser; accessToken: string }>('/auth/login', {
      identity,
      password,
    })
    setAccessToken(res.data.accessToken)
    // New API returns the full profile (the `setting` key is present, possibly null)
    // — use it directly. Older API omitted settings entirely, so fall back to /auth/me
    // only when the key is absent (deploy window), never on a legitimately-null setting.
    const hasFullProfile = res.data.user != null && 'setting' in res.data.user
    const me = hasFullProfile ? res.data.user : await fetchMe().catch(() => res.data.user)
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, initializing, login, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  )
}

// The hook is co-located with its provider by design (standard React context pattern);
// splitting it out just to satisfy Fast Refresh would fragment the auth module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
