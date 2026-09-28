/**
 * AquaBloom Structural Portal — Logistics Area (/portal/logistics)
 * 
 * Step 2: Implements Logistics Partner operational profile management,
 * fleet capabilities, coverage corridors, approval status, and account architecture.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { LogisticsProfile } from '../../types.js';
import { LogisticsProfileEditor } from '../profile/LogisticsProfileEditor.js';
import { AccountSettingsCard } from '../profile/AccountSettingsCard.js';
import { Truck, ShieldCheck, UserCheck, Settings, FileText, Clock, Key } from 'lucide-react';

export const LogisticsPortal: React.FC = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'ACCOUNT' | 'OVERVIEW'>('PROFILE');

  const logisticsProfile = profile as LogisticsProfile;

  return (
    <div className="bg-[#08080a] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212b] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Truck className="h-4 w-4" />
              <span>Logistics Partner Workspace Boundary</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {logisticsProfile?.businessName || user?.organizationName || 'Logistics Portal'}
            </h1>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Public Account ID:{' '}
              <span className="font-mono text-[#c5a059] font-medium">{user?.publicAccountId}</span> &bull; Fleet Coordinator:{' '}
              <span className="text-white font-medium">{user?.contactName}</span> ({user?.email})
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="rounded-full border border-[#c5a059]/40 bg-[#161622] px-3 py-1 text-xs font-semibold text-[#d4af37]">
              Role: LOGISTICS_PARTNER
            </span>
            <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-400 flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Identity Verified</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex space-x-2 border-b border-[#1c1c28] pb-3">
          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'PROFILE'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Carrier Fleet Profile</span>
          </button>

          <button
            onClick={() => setActiveTab('ACCOUNT')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'ACCOUNT'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Account Architecture</span>
          </button>

          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'OVERVIEW'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <FileText className="h-4 w-4" />
            <span>Readiness Overview</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-6">
          {activeTab === 'PROFILE' && (
            logisticsProfile ? (
              <LogisticsProfileEditor profile={logisticsProfile} />
            ) : (
              <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-8 text-center text-xs text-[#737385]">
                Initializing logistics partner operational profile...
              </div>
            )
          )}

          {activeTab === 'ACCOUNT' && <AccountSettingsCard />}

          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#232320] bg-[#0d0d12] p-6">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Step 2 Operational Integration Active</span>
                </div>
                <p className="mt-2 text-xs text-[#9595a6] leading-relaxed">
                  Carrier fleet identity and coverage corridors are authenticated within the logistics routing boundary. Approved carriers are eligible for route dispatch scheduling when orders are fulfilled.
                </p>

                <div className="mt-6 border-t border-[#1c1c26] pt-6 text-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                    Internal Stable ID
                  </span>
                  <p className="mt-1 font-mono text-sm text-[#e2e2ec]">{user?.id}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Freight Dispatch Pipeline</h3>
                    <Clock className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Manifest scheduling, transit waybills, and loading dock appointment windows will be governed under Step 4 (Logistics &amp; Delivery).
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Carrier dispatch awaiting module deployment.
                  </div>
                </div>

                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Data Visibility Scope</h3>
                    <Key className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Enforced backend visibility: <span className="font-mono text-[#c5a059]">TRANSACTION_SHARED</span>. Carriers only receive delivery manifests and venue loading dock directions for contracted consignments.
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Manifest access security active.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
