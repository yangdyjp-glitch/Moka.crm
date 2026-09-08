import { createContext, useContext } from 'react'

export type AuthRole =
  | 'ADMIN'
  | 'MARKET'
  | 'SALES'
  | 'BUSINESS_SUPERVISOR'
  | 'DOWNSTREAM_SALES'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: AuthRole
  impersonator?: AuthUserIdentity | null
}

export interface AuthUserIdentity {
  id: number
  username: string
  name: string
  role: AuthRole
}

export interface AuthContextValue {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  impersonate: (userId: number) => Promise<void>
  stopImpersonating: () => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
