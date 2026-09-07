import { createContext, useContext } from 'react'

export interface AuthUser {
  id: number
  username: string
  name: string
  role: string
  impersonator?: {
    id: number
    username: string
    name: string
    role: string
  } | null
}

interface AuthContextValue {
  user: AuthUser | null
  login: (username: string, password: string) => Promise<void>
  impersonate: (userId: number) => Promise<void>
  stopImpersonating: () => Promise<void>
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue>(null!)
export const useAuth = () => useContext(AuthContext)
