/**
 * AquaBloom Authentication Context
 * 
 * Provides unified authentication state, role verification,
 * login/registration actions, and session persistence.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, UserRole, RegisterInput, UserProfile } from '../types.js';
import { api } from '../lib/api.js';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>;
  register: (input: RegisterInput) => Promise<{ success: boolean; error?: string; role?: UserRole; fieldErrors?: Array<{ field?: string; message: string }> }>;
  logout: () => Promise<void>;
  switchRoleQuickLogin: (role: UserRole) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ success: boolean; error?: string; fieldErrors?: Array<{ field?: string; message: string }> }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Initialize session from stored token
  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      try {
        const res = await api.getSession();
        if (mounted && res.data) {
          setUser(res.data.user);
          setSession(res.data.session);
          if (res.data.profile) {
            setProfile(res.data.profile);
          } else if (res.data.user.role !== 'ADMIN') {
            const pRes = await api.getProfile();
            if (pRes.data) {
              setProfile(pRes.data.profile);
            }
          }
        }
      } catch (err) {
        console.error('Session restore error:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    checkAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshProfile = async () => {
    if (!user || user.role === 'ADMIN') return;
    try {
      const res = await api.getProfile();
      if (res.data) {
        setUser(res.data.user);
        setProfile(res.data.profile);
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>) => {
    try {
      const res = await api.updateProfile(updates);
      if (res.error) {
        return {
          success: false,
          error: res.error.message,
          fieldErrors: res.error.details,
        };
      }
      if (res.data) {
        setUser(res.data.user);
        setProfile(res.data.profile);
        return { success: true };
      }
      return { success: false, error: 'Update failed.' };
    } catch (err) {
      return { success: false, error: 'An unexpected error occurred while updating profile.' };
    }
  };

  const login = async (email: string, pass: string) => {
    setIsLoading(true);
    try {
      const res = await api.login({ email, password: pass });
      if (res.error) {
        return { success: false, error: res.error.message };
      }
      if (res.data) {
        setUser(res.data.user);
        setProfile(res.data.profile || null);
        setSession(res.data.session);
        return { success: true, role: res.data.user.role };
      }
      return { success: false, error: 'Login could not be completed.' };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (input: RegisterInput) => {
    setIsLoading(true);
    try {
      const res = await api.register(input);
      if (res.error) {
        return {
          success: false,
          error: res.error.message,
          fieldErrors: res.error.details,
        };
      }
      if (res.data) {
        setUser(res.data.user);
        setProfile(res.data.profile || null);
        setSession(res.data.session);
        return { success: true, role: res.data.user.role };
      }
      return { success: false, error: 'Registration failed.' };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await api.logout();
      setUser(null);
      setProfile(null);
      setSession(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper for evaluation / rapid testing of different roles
  const switchRoleQuickLogin = async (role: UserRole) => {
    const roleCredentials: Record<UserRole, { email: string; pass: string }> = {
      ADVERTISER: { email: 'advertiser@aquabloom.example', pass: 'AquaBloom2026!' },
      VENUE: { email: 'venue@aquabloom.example', pass: 'AquaBloom2026!' },
      SUPPLIER: { email: 'supplier@aquabloom.example', pass: 'AquaBloom2026!' },
      LOGISTICS_PARTNER: { email: 'logistics@aquabloom.example', pass: 'AquaBloom2026!' },
      ADMIN: { email: 'internal.admin@aquabloom.corp', pass: 'AquaBloomAdmin2026#' },
    };

    const target = roleCredentials[role];
    if (target) {
      await login(target.email, target.pass);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        switchRoleQuickLogin,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
