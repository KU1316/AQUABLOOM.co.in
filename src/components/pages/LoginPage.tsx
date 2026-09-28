/**
 * AquaBloom Public Website — Login (/login)
 * 
 * Participant authentication portal.
 * Directs each authenticated participant to their respective role-aware area:
 * - ADVERTISER -> /portal/advertiser
 * - VENUE -> /portal/venue
 * - SUPPLIER -> /portal/supplier
 * - LOGISTICS_PARTNER -> /portal/logistics
 * - ADMIN -> /portal/admin
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { UserRole } from '../../types.js';
import { Lock, ArrowRight, Shield, AlertCircle, Sparkles } from 'lucide-react';

interface LoginPageProps {
  navigate: (path: string) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ navigate }) => {
  const { login, switchRoleQuickLogin, isAuthenticated, user } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const routeRole = (role: UserRole) => {
    switch (role) {
      case 'ADVERTISER':
        navigate('/portal/advertiser');
        break;
      case 'VENUE':
        navigate('/portal/venue');
        break;
      case 'SUPPLIER':
        navigate('/portal/supplier');
        break;
      case 'LOGISTICS_PARTNER':
        navigate('/portal/logistics');
        break;
      case 'ADMIN':
        navigate('/portal/admin');
        break;
      default:
        navigate('/');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await login(email, password);
      if (!res.success) {
        setError(res.error || 'Authentication credentials were not accepted.');
        return;
      }

      if (res.role) {
        routeRole(res.role);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickRoleSelect = async (role: UserRole) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await switchRoleQuickLogin(role);
      routeRole(role);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Quick login failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#08080a] text-white py-16 px-4 sm:px-6 lg:px-8 min-h-[75vh] flex items-center justify-center">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#c5a059]/40 bg-[#121217]">
            <Lock className="h-5 w-5 text-[#c5a059]" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold tracking-tight text-white">
            AquaBloom Participant Access
          </h1>
          <p className="mt-2 text-xs text-[#8e8e9e]">
            Enter your credentials to enter your role-authorized workspace.
          </p>
        </div>

        {/* Form Card */}
        <div className="mt-8 rounded-2xl border border-[#23232f] bg-[#0d0d12] p-8 shadow-2xl">
          {error && (
            <div className="mb-5 flex items-center space-x-2.5 rounded-lg border border-red-900/40 bg-red-950/30 p-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {isAuthenticated && user && (
            <div className="mb-5 rounded-lg border border-[#c5a059]/40 bg-[#161622] p-3 text-xs text-[#c5a059] flex items-center justify-between">
              <span>Logged in as: <strong>{user.organizationName}</strong> ({user.role})</span>
              <button
                type="button"
                onClick={() => routeRole(user.role)}
                className="underline font-bold"
              >
                Go to Portal
              </button>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                Corporate Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="participant@company.com"
                className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#9d9dae]">
                  Password
                </label>
                <span className="text-[10px] text-[#717180]">Min. 8 characters</span>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="mt-1 w-full rounded-lg border border-[#272733] bg-[#121217] px-3.5 py-2.5 text-xs text-white placeholder-[#505060] focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center space-x-2 rounded-lg bg-gradient-to-r from-[#c5a059] to-[#d4af37] py-3 text-xs font-bold uppercase tracking-wider text-[#0a0a0d] transition hover:opacity-95 disabled:opacity-50"
            >
              <span>{isSubmitting ? 'Authenticating...' : 'Sign In'}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>

          {/* Quick-test role switcher for verification */}
          <div className="mt-8 border-t border-[#1e1e28] pt-6">
            <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-[#a0a0b2] mb-3">
              <Sparkles className="h-3.5 w-3.5 text-[#c5a059]" />
              <span>Quick Test Verification (Role-Aware Switching):</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('ADVERTISER')}
                className="rounded border border-[#272736] bg-[#121219] py-1.5 px-2 text-[11px] text-[#c9c9d4] hover:border-[#c5a059] hover:text-[#d4af37]"
              >
                Advertiser Role
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('VENUE')}
                className="rounded border border-[#272736] bg-[#121219] py-1.5 px-2 text-[11px] text-[#c9c9d4] hover:border-[#c5a059] hover:text-[#d4af37]"
              >
                Venue Role
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('SUPPLIER')}
                className="rounded border border-[#272736] bg-[#121219] py-1.5 px-2 text-[11px] text-[#c9c9d4] hover:border-[#c5a059] hover:text-[#d4af37]"
              >
                Supplier Role
              </button>
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('LOGISTICS_PARTNER')}
                className="rounded border border-[#272736] bg-[#121219] py-1.5 px-2 text-[11px] text-[#c9c9d4] hover:border-[#c5a059] hover:text-[#d4af37]"
              >
                Logistics Role
              </button>
            </div>
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect('ADMIN')}
                className="text-[10px] text-[#606070] hover:text-[#9090a0] underline"
              >
                Internal Admin Boundary Test
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-[#717182]">
          Need to register a new participant organization?{' '}
          <button
            onClick={() => navigate('/get-started')}
            className="text-[#c5a059] font-bold hover:underline ml-1"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
};
