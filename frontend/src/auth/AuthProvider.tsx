import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import client, { clearApiCache } from '../api/client'
import {
  AuthContext,
  type AuthContextValue,
  type AuthRole,
  type AuthUser,
  type AuthUserIdentity,
} from './AuthContext'

interface AuthResponse {
  token: string
  user: AuthUser
}

const AUTH_ROLES = new Set<AuthRole>([
  'ADMIN',
  'MARKET',
  'SALES',
  'BUSINESS_SUPERVISOR',
  'DOWNSTREAM_SALES',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAuthRole(value: unknown): value is AuthRole {
  return typeof value === 'string' && AUTH_ROLES.has(value as AuthRole)
}

function isAuthUserIdentity(value: unknown): value is AuthUserIdentity {
  return (
    isRecord(value) &&
    typeof value.id === 'number' &&
    typeof value.username === 'string' &&
    typeof value.name === 'string' &&
    isAuthRole(value.role)
  )
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!isAuthUserIdentity(value)) return false
  return (
    !('impersonator' in value) ||
    value.impersonator == null ||
    isAuthUserIdentity(value.impersonator)
  )
}

function storedUser(): AuthUser | null {
  const serialized = localStorage.getItem('user')
  if (!serialized) return null
  try {
    const parsed: unknown = JSON.parse(serialized)
    return isAuthUser(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(storedUser)
  const sessionRequest = useRef(0)

  const setSession = useCallback((token: string, nextUser: AuthUser) => {
    clearApiCache()
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(nextUser))
    setUser(nextUser)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const requestId = ++sessionRequest.current
    const { data } = await client.post<AuthResponse>('/auth/login', { username, password })
    if (requestId === sessionRequest.current) setSession(data.token, data.user)
  }, [setSession])

  const impersonate = useCallback(async (userId: number) => {
    const requestId = ++sessionRequest.current
    const { data } = await client.post<AuthResponse>('/auth/impersonate', { userId })
    if (requestId === sessionRequest.current) setSession(data.token, data.user)
  }, [setSession])

  const stopImpersonating = useCallback(async () => {
    const requestId = ++sessionRequest.current
    const { data } = await client.post<AuthResponse>('/auth/stop-impersonating')
    if (requestId === sessionRequest.current) setSession(data.token, data.user)
  }, [setSession])

  const logout = useCallback(() => {
    sessionRequest.current += 1
    clearApiCache()
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setUser(null)
    window.location.href = '/login'
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, login, impersonate, stopImpersonating, logout }),
    [impersonate, login, logout, stopImpersonating, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
