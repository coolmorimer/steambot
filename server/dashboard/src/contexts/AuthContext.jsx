import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setUser(data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) fetchMe();
    else setLoading(false);
  }, [fetchMe]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token',  data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    await fetchMe();
    return data;
  };

  const register = async (email, password, name, referralCode) => {
    const { data } = await api.post('/auth/register', { email, password, name, referral_code: referralCode || undefined });
    localStorage.setItem('access_token',  data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    await fetchMe();
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout', { refresh_token: localStorage.getItem('refresh_token') });
    } catch {}
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const isAdmin    = user?.role === 'admin';
  const isSysAdmin = !!user?.is_sysadmin;
  const isPartner  = !!user?.is_partner;
  const sub        = user?.subscription;

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, fetchMe, isAdmin, isSysAdmin, isPartner, sub }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
