// Auth context: session bootstrap, login/logout, current user.
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, bootstrapSession, setAccessToken } from './api'
import { applyMode, applyTheme, type Mode, type ThemeId } from './cn'
import { setLanguage, type Language } from '../i18n'

/** Apply a user's saved preferences (theme + language) to the document. */
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
      const token = await bootstrapSession()
      if (!active) return
      if (token) {
        try {
          setUser(await fetchMe())
        } catch {
          setUser(null)
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
  }, [user?.setting?.themeColor, user?.setting?.themeMode, user?.setting?.language])

  const login = useCallback(async (identity: string, password: string): Promise<AuthUser> => {
    const res = await api.post<{ user: AuthUser; accessToken: string }>('/auth/login', {
      identity,
      password,
    })
    setAccessToken(res.data.accessToken)
    // Login returns the user without settings; fetch the full profile.
    const me = await fetchMe().catch(() => res.data.user)
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
