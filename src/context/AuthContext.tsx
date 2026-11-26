import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken } from '../api/client';
import { RoleCode, UserProfile } from '../types/erp';

interface AuthContextValue {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserProfile>;
  logout: () => void;
  getHomeRoute: (role?: RoleCode) => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function getRoleHomeRoute(role?: RoleCode): string {
  switch (role) {
    case 'OWNER':
      return '/owner';
    case 'FACTORY_ADMIN':
      return '/admin';
    case 'PRODUCTION_SUPERVISOR':
      return '/production';
    case 'SALESMAN':
      return '/salesman';
    case 'ACCOUNTANT':
      return '/reports';
    default:
      return '/login';
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) {
      setLoading(false);
      return;
    }
    apiFetch<UserProfile>('/auth/me')
      .then((u) => setUser(u))
      .catch(() => {
        setStoredToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: UserProfile }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        getHomeRoute: (r) => getRoleHomeRoute(r ?? user?.role),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
