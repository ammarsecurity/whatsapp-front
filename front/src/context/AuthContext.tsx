import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { api, extractToken } from '../lib/api'
import {
  clearToken,
  getToken,
  getUser,
  setToken as persistToken,
  setUser as persistUser,
} from '../lib/storage'
import { isSuperAdmin, userFromLoginResponse, type AuthUser } from '../lib/user'

interface AuthContextValue {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  isSuperAdmin: boolean
  login: (username: string, password: string) => Promise<void>
  updateProfile: (body: {
    currentPassword: string
    username?: string
    password?: string
  }) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(getToken)
  const [user, setUserState] = useState<AuthUser | null>(getUser)

  const applySession = useCallback((t: string, loginData: Record<string, unknown>) => {
    const u = userFromLoginResponse(loginData, t)
    persistToken(t)
    persistUser(u)
    setTokenState(t)
    setUserState(u)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.login({ username, password })
    const t = extractToken(data)
    if (!t) throw new Error('No token in login response')
    applySession(t, data)
  }, [applySession])

  const updateProfile = useCallback(
    async (body: {
      currentPassword: string
      username?: string
      password?: string
    }) => {
      const data = await api.updateProfile(body)
      const t = extractToken(data)
      if (!t) throw new Error('No token in profile update response')
      applySession(t, data)
    },
    [applySession],
  )

  const logout = useCallback(() => {
    clearToken()
    setTokenState(null)
    setUserState(null)
  }, [])

  const value = useMemo(
    () => ({
      token,
      user,
      isAuthenticated: !!token,
      isSuperAdmin: isSuperAdmin(user),
      login,
      updateProfile,
      logout,
    }),
    [token, user, login, updateProfile, logout],
  )

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
