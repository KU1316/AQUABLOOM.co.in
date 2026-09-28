/**
 * AquaBloom Structural Portal — Venue Area (/portal/venue)
 * 
 * Step 2: Implements Venue operational profile management,
 * footfall & capacity calculation, visibility state, and account architecture.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { VenueProfile } from '../../types.js';
import { VenueProfileEditor } from '../profile/VenueProfileEditor.js';
import { AccountSettingsCard } from '../profile/AccountSettingsCard.js';
import { VenueOpportunitiesList } from '../marketplace/VenueOpportunitiesList.js';
import { VenueCapacityDashboard } from '../marketplace/VenueCapacityDashboard.js';
import { ProposalList } from '../proposals/ProposalList.js';
import { AgreementList } from '../agreements/AgreementList.js';
import { VenueCompensationSection } from './VenueCompensationSection.js';
import { Building2, ShieldCheck, UserCheck, Settings, FileText, Clock, Key, Layers, Warehouse, MessageSquare, FileCheck2, Coins } from 'lucide-react';
import { generateBusinessId } from '../../lib/idGenerator.js';

export const VenuePortal: React.FC = () => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'OPPORTUNITIES' | 'PROPOSALS' | 'AGREEMENTS' | 'COMPENSATION' | 'CAPACITY' | 'PROFILE' | 'ACCOUNT' | 'OVERVIEW'>('AGREEMENTS');
  const [reservedAgreementId] = useState(() => generateBusinessId('AB-CAG'));

  const venueProfile = profile as VenueProfile;

  return (
    <div className="bg-[#08080a] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212b] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Building2 className="h-4 w-4" />
              <span>Hosting Venue Workspace Boundary</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {venueProfile?.venueName || user?.organizationName || 'Venue Portal'}
            </h1>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Public Account ID:{' '}
              <span className="font-mono text-[#c5a059] font-medium">{user?.publicAccountId}</span> &bull; Property Coordinator:{' '}
              <span className="text-white font-medium">{user?.contactName}</span> ({user?.email})
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="rounded-full border border-[#c5a059]/40 bg-[#161622] px-3 py-1 text-xs font-semibold text-[#d4af37]">
              Role: VENUE
            </span>
            <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-400 flex items-center space-x-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Identity Verified</span>
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="mt-6 flex space-x-2 border-b border-[#1c1c28] pb-3 overflow-x-auto">
          <button
            onClick={() => setActiveTab('OPPORTUNITIES')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'OPPORTUNITIES'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Campaign Opportunities</span>
          </button>

          <button
            onClick={() => setActiveTab('PROPOSALS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'PROPOSALS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>Proposals & Negotiations</span>
          </button>

          <button
            onClick={() => setActiveTab('AGREEMENTS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'AGREEMENTS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <FileCheck2 className="h-4 w-4" />
            <span>Campaign Agreements</span>
          </button>

          <button
            onClick={() => setActiveTab('COMPENSATION')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'COMPENSATION'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Coins className="h-4 w-4" />
            <span>Compensation &amp; Settlements</span>
          </button>

          <button
            onClick={() => setActiveTab('CAPACITY')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'CAPACITY'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Warehouse className="h-4 w-4" />
            <span>Storage & Capacity</span>
          </button>

          <button
            onClick={() => setActiveTab('PROFILE')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'PROFILE'
                ? 'bg-[#c5a059] text-black'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <UserCheck className="h-4 w-4" />
            <span>Venue Operational Profile</span>
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
          {activeTab === 'OPPORTUNITIES' && <VenueOpportunitiesList />}

          {activeTab === 'PROPOSALS' && (
            <ProposalList
              currentUserRole="VENUE"
              currentUserId={user?.id || ''}
            />
          )}

          {activeTab === 'AGREEMENTS' && <AgreementList userRole="VENUE" />}

          {activeTab === 'COMPENSATION' && <VenueCompensationSection />}

          {activeTab === 'CAPACITY' && <VenueCapacityDashboard />}

          {activeTab === 'PROFILE' && (
            venueProfile ? (
              <VenueProfileEditor profile={venueProfile} />
            ) : (
              <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-8 text-center text-xs text-[#737385]">
                Initializing venue operational profile...
              </div>
            )
          )}

          {activeTab === 'ACCOUNT' && <AccountSettingsCard />}

          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-[#232330] bg-[#0d0d12] p-6">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Step 2 Operational Integration Active</span>
                </div>
                <p className="mt-2 text-xs text-[#9595a6] leading-relaxed">
                  Venue identity and capacity parameters are authenticated within the venue authorization boundary. When all mandatory profile fields are completed, your venue automatically transitions to <span className="font-semibold text-emerald-400">PUBLIC_ELIGIBLE</span> status for advertiser discovery.
                </p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#1c1c26] pt-6 text-xs">
                  <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                      Internal Stable ID
                    </span>
                    <p className="mt-1 font-mono text-sm text-[#e2e2ec]">{user?.id}</p>
                  </div>
                  <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                      Reserved Campaign Agreement ID Pattern
                    </span>
                    <p className="mt-1 font-mono text-sm text-[#d4af37]">{reservedAgreementId}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Placement &amp; Inventory</h3>
                    <Clock className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Bottle distribution zones and proposal review workflows will connect sequentially in later marketplace integration steps.
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Campaign proposals awaiting Marketplace activation.
                  </div>
                </div>

                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Data Visibility Scope</h3>
                    <Key className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Enforced backend visibility: <span className="font-mono text-[#c5a059]">TRANSACTION_SHARED</span>. Venues only see campaigns and delivery schedules assigned directly to their property.
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Bilateral transaction isolation operational.
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
