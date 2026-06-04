"use client";

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);
const API_BASE = 'http://localhost:8082';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('auth');
      if (stored) setUser(JSON.parse(stored));
    } catch { /* corrupted storage */ }
    setLoading(false);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw data;

    const userData = { token: data.token, email: data.email, fullName: data.fullName, profileComplete: data.profileComplete ?? false };
    setUser(userData);
    localStorage.setItem('auth', JSON.stringify(userData));
    return userData;
  }, []);

  const sendRegistrationOtp = useCallback(async (email) => {
    const res = await fetch(`${API_BASE}/api/auth/send-registration-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw data;
    return data;
  }, []);

  const register = useCallback(async (fullName, email, password, otp) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, email, password, otp }),
    });
    const data = await res.json();
    if (!res.ok) throw data;

    const userData = { token: data.token, email: data.email, fullName: data.fullName, profileComplete: data.profileComplete ?? false };
    setUser(userData);
    localStorage.setItem('auth', JSON.stringify(userData));
    return userData;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('auth');
  }, []);

  const setProfileComplete = useCallback(() => {
    setUser(prev => {
      const updated = { ...prev, profileComplete: true };
      localStorage.setItem('auth', JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, sendRegistrationOtp, logout, setProfileComplete, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
