import { useState, type ReactNode } from 'react';
import client from '../api/client';
import { AuthContext, type AuthUser } from './AuthContext';

interface AuthSession { token: string; user: AuthUser }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const s = localStorage.getItem('user');
    return s ? JSON.parse(s) : null;
  });

  const setSession = (token: string, nextUser: AuthUser) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  const login = async (username: string, password: string) => {
    const { data } = await client.post<AuthSession>('/auth/login', { username, password });
    setSession(data.token, data.user);
  };

  const impersonate = async (userId: number) => {
    const { data } = await client.post<AuthSession>('/auth/impersonate', { userId });
    setSession(data.token, data.user);
  };

  const stopImpersonating = async () => {
    const { data } = await client.post<AuthSession>('/auth/stop-impersonating');
    setSession(data.token, data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, login, impersonate, stopImpersonating, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
