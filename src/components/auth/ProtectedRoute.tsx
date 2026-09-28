/**
 * AquaBloom Protected Route Guard
 * 
 * Enforces:
 * 1. Authentication requirement (redirects or displays login CTA for guests)
 * 2. Role-based authorization requirement (blocks mismatched roles)
 * 3. Strict Admin internal boundary defense
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { UserRole } from '../../types.js';
import { ShieldAlert, Lock, ArrowRight, LogIn } from 'lucide-react';

interface ProtectedRouteProps {
  requiredRole?: UserRole | UserRole[];
  navigate: (path: string) => void;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requiredRole,
  navigate,
  children,
}) => {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#08080a]">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#c5a059] border-t-transparent" />
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-[#a3a3b0]">
            Verifying Participant Identity...
          </p>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated Check
  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto my-16 max-w-lg px-4">
        <div className="rounded-xl border border-[#2d2d38] bg-[#0e0e13] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-[#c5a059]/40 bg-[#16161f]">
            <Lock className="h-6 w-6 text-[#c5a059]" />
          </div>
          <h2 className="mt-4 font-display text-xl font-bold tracking-wide text-white">
            Authentication Required
          </h2>
          <p className="mt-2 text-sm text-[#8e8e9e] leading-relaxed">
            This application boundary requires an authenticated AquaBloom participant identity.
          </p>
          <div className="mt-6 flex flex-col space-y-3">
            <button
              onClick={() => navigate('/login')}
              className="flex items-center justify-center space-x-2 rounded-lg bg-[#c5a059] px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-black transition hover:opacity-90"
            >
              <LogIn className="h-4 w-4" />
              <span>Participant Login</span>
            </button>
            <button
              onClick={() => navigate('/get-started')}
              className="rounded-lg border border-[#2d2d38] px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#b5b5c3] transition hover:border-[#424252] hover:text-white"
            >
              Register New Organization
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Role Authorization Check
  if (requiredRole) {
    const allowed = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!allowed.includes(user.role)) {
      return (
        <div className="mx-auto my-16 max-w-lg px-4">
          <div className="rounded-xl border border-red-900/40 bg-[#120a0d] p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-red-700/50 bg-red-950/40">
              <ShieldAlert className="h-6 w-6 text-red-400" />
            </div>
            <h2 className="mt-4 font-display text-xl font-bold tracking-wide text-white">
              Access Restricted
            </h2>
            <p className="mt-2 text-sm text-red-200/80 leading-relaxed">
              Your account role (<span className="font-mono text-red-300 font-bold">{user.role}</span>) is not authorized to access this restricted boundary.
            </p>
            <p className="mt-1 text-xs text-[#7d7d8c]">
              Authorized participant roles: {allowed.join(', ')}
            </p>
            <div className="mt-6 flex justify-center">
              <button
                onClick={() => {
                  switch (user.role) {
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
                }}
                className="flex items-center space-x-1.5 rounded-lg border border-[#3b3b4a] bg-[#1a1a24] px-4 py-2 text-xs font-semibold text-white hover:border-[#c5a059]"
              >
                <span>Return to your authorized portal</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#c5a059]" />
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};
