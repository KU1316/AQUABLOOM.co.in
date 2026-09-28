/**
 * AquaBloom Account Settings & Identity Card
 * 
 * Manages account-level boundaries (distinct from profile operational data):
 * - Public Account Identifier (AB-ACC-...)
 * - Stable Internal ID (usr_...)
 * - Account Status lifecycle badge (ACTIVE, PENDING_REVIEW, etc.)
 * - Authenticated Identity & session termination
 */

import React from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { Shield, Key, Mail, Calendar, LogOut, Clock, UserCheck } from 'lucide-react';

export const AccountSettingsCard: React.FC = () => {
  const { user, session, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/40 px-3 py-1 text-xs font-semibold text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>Active Operational Account</span>
          </span>
        );
      case 'PENDING_REVIEW':
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full border border-amber-800/50 bg-amber-950/40 px-3 py-1 text-xs font-semibold text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Under Compliance Review</span>
          </span>
        );
      case 'RESTRICTED':
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full border border-orange-800/50 bg-orange-950/40 px-3 py-1 text-xs font-semibold text-orange-400">
            <span>Restricted Access</span>
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full border border-rose-800/50 bg-rose-950/40 px-3 py-1 text-xs font-semibold text-rose-400">
            <span>Application Declined</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1.5 rounded-full border border-[#303042] bg-[#14141c] px-3 py-1 text-xs font-medium text-[#a0a0b2]">
            <span>{status || 'Active'}</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Overview Header */}
      <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c1c28] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Shield className="h-4 w-4" />
              <span>Identity & Security Boundary</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-white">Account Architecture</h2>
            <p className="text-xs text-[#8e8e9f]">
              Core identity and access authorization credentials managed by the AquaBloom authentication kernel.
            </p>
          </div>
          <div>{getStatusBadge(user?.status)}</div>
        </div>

        {/* Identifier Grid */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
            <div className="flex items-center space-x-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              <Key className="h-3.5 w-3.5 text-[#c5a059]" />
              <span>Public Account Identifier</span>
            </div>
            <p className="mt-2 font-mono text-sm font-semibold text-[#c5a059]">
              {user?.publicAccountId || 'AB-ACC-PENDING'}
            </p>
            <p className="mt-1 text-[11px] text-[#6d6d7e]">
              High-entropy identifier used for non-confidential invoices, billing, and public agreements.
            </p>
          </div>

          <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
            <div className="flex items-center space-x-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              <Shield className="h-3.5 w-3.5 text-[#888899]" />
              <span>Internal Stable Storage Key</span>
            </div>
            <p className="mt-2 font-mono text-sm text-[#e2e2ec]">{user?.id}</p>
            <p className="mt-1 text-[11px] text-[#6d6d7e]">
              UUID-based primary database key. Protected by backend visibility scopes.
            </p>
          </div>

          <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
            <div className="flex items-center space-x-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
              <UserCheck className="h-3.5 w-3.5 text-[#888899]" />
              <span>Authorized Security Role</span>
            </div>
            <p className="mt-2 font-mono text-sm font-semibold text-white">{user?.role}</p>
            <p className="mt-1 text-[11px] text-[#6d6d7e]">
              Enforced server-side. Cannot be modified or elevated by client requests.
            </p>
          </div>
        </div>

        {/* Identity Details */}
        <div className="mt-6 border-t border-[#1c1c28] pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9d9db3]">
            Registered Account Information
          </h3>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start space-x-3 rounded-lg border border-[#1a1a24] bg-[#111116] p-3.5">
              <Mail className="h-4 w-4 text-[#c5a059] shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-[#737385]">Authentication Email</span>
                <p className="font-medium text-white">{user?.email}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border border-[#1a1a24] bg-[#111116] p-3.5">
              <Calendar className="h-4 w-4 text-[#c5a059] shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-[#737385]">Account Registered Date</span>
                <p className="font-medium text-white">
                  {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { dateStyle: 'medium' }) : 'Verified'}
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border border-[#1a1a24] bg-[#111116] p-3.5">
              <Clock className="h-4 w-4 text-[#c5a059] shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-[#737385]">Current Session Token ID</span>
                <p className="font-mono text-[11px] text-[#9a9ab0] truncate max-w-[200px]">{session?.id}</p>
              </div>
            </div>

            <div className="flex items-start space-x-3 rounded-lg border border-[#1a1a24] bg-[#111116] p-3.5">
              <Shield className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="text-[11px] text-[#737385]">Session Security Scope</span>
                <p className="font-medium text-emerald-400">Authenticated (Port 3000 Ingress)</p>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end border-t border-[#1c1c28] pt-6">
          <button
            onClick={handleLogout}
            className="flex items-center space-x-2 rounded-lg border border-rose-900/40 bg-rose-950/20 px-4 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 hover:border-rose-800 transition"
          >
            <LogOut className="h-4 w-4" />
            <span>Terminate Active Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
