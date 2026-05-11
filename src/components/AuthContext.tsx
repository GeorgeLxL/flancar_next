'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import axios from 'axios';
import { getMe } from '@/lib/api';

export interface User {
  email: string;
  staffId: string;
  staffName: string;
  roleId: string;
  accessToken: string;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
  loading: boolean;
  refetch: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {},
  loading: true,
  refetch: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = () => {
    setLoading(true);
    getMe()
      .then(r => {
        setUser(r);
        localStorage.setItem('user', JSON.stringify(r));
      })
      .catch(error => {
        if (axios.isAxiosError(error) && error.response?.status === 401) {
          setUser(null);
          localStorage.removeItem('user');
        } else {
          console.error('ユーザー情報の取得に失敗:', error);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
    const handler = () => refetch();
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refetch }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
