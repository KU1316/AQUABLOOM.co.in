/**
 * AquaBloom Structural Portal — Advertiser Area (/portal/advertiser)
 * 
 * Step 2: Implements operational Advertiser profile management,
 * identity boundaries, completion tracking, and account settings.
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { AdvertiserProfile } from '../../types.js';
import { AdvertiserProfileEditor } from '../profile/AdvertiserProfileEditor.js';
import { AccountSettingsCard } from '../profile/AccountSettingsCard.js';
import { CampaignList } from '../campaigns/CampaignList.js';
import { VenueMarketplace } from '../marketplace/VenueMarketplace.js';
import { ProposalList } from '../proposals/ProposalList.js';
import { AgreementList } from '../agreements/AgreementList.js';
import { OrderList } from '../orders/OrderList.js';
import { Layers, ShieldCheck, UserCheck, Settings, FileText, Clock, Key, Megaphone, Sparkles, MessageSquare, FileCheck2, CreditCard } from 'lucide-react';
import { generateBusinessId } from '../../lib/idGenerator.js';

interface Props {
  initialOrderId?: string;
  initialTab?: 'CAMPAIGNS' | 'MARKETPLACE' | 'PROPOSALS' | 'AGREEMENTS' | 'ORDERS' | 'PROFILE' | 'ACCOUNT' | 'OVERVIEW';
}

export const AdvertiserPortal: React.FC<Props> = ({ initialOrderId, initialTab }) => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<'CAMPAIGNS' | 'MARKETPLACE' | 'PROPOSALS' | 'AGREEMENTS' | 'ORDERS' | 'PROFILE' | 'ACCOUNT' | 'OVERVIEW'>(
    initialOrderId ? 'ORDERS' : initialTab || 'AGREEMENTS'
  );
  const [targetCampaignId, setTargetCampaignId] = useState<string | undefined>(undefined);
  const [targetOrderId, setTargetOrderId] = useState<string | undefined>(initialOrderId);
  const [reservedCampaignId] = useState(() => generateBusinessId('AB-CMP'));
  const [reservedProposalId] = useState(() => generateBusinessId('AB-PRP'));

  const advertiserProfile = profile as AdvertiserProfile;

  return (
    <div className="bg-[#08080a] text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Portal Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212b] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Layers className="h-4 w-4" />
              <span>Advertiser Workspace Boundary</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {advertiserProfile?.brandName || user?.organizationName || 'Advertiser Portal'}
            </h1>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Public Account ID:{' '}
              <span className="font-mono text-[#c5a059] font-medium">{user?.publicAccountId}</span> &bull; Authorized Contact:{' '}
              <span className="text-white font-medium">{user?.contactName}</span> ({user?.email})
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="rounded-full border border-[#c5a059]/40 bg-[#161622] px-3 py-1 text-xs font-semibold text-[#d4af37]">
              Role: ADVERTISER
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
            onClick={() => setActiveTab('MARKETPLACE')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'MARKETPLACE'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            <span>Venue Marketplace</span>
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
            <span>Campaign Agreements (Step 7)</span>
          </button>

          <button
            onClick={() => setActiveTab('ORDERS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'ORDERS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            <span>Orders & Payment (Step 11)</span>
          </button>

          <button
            onClick={() => setActiveTab('CAMPAIGNS')}
            className={`flex items-center space-x-2 rounded-lg px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'CAMPAIGNS'
                ? 'bg-[#c5a059] text-black font-bold'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white'
            }`}
          >
            <Megaphone className="h-4 w-4" />
            <span>Advertising Campaigns</span>
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
            <span>Operational Profile</span>
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
          {activeTab === 'MARKETPLACE' && (
            <VenueMarketplace
              initialCampaignId={targetCampaignId}
              onNavigateToCampaigns={() => setActiveTab('CAMPAIGNS')}
              onProposalCreated={() => setActiveTab('PROPOSALS')}
            />
          )}

          {activeTab === 'PROPOSALS' && (
            <ProposalList
              currentUserRole="ADVERTISER"
              currentUserId={user?.id || ''}
              onInitiateNewProposal={() => setActiveTab('MARKETPLACE')}
            />
          )}

          {activeTab === 'AGREEMENTS' && (
            <AgreementList
              userRole="ADVERTISER"
            />
          )}

          {activeTab === 'ORDERS' && (
            <OrderList
              initialOrderId={targetOrderId}
            />
          )}

          {activeTab === 'CAMPAIGNS' && (
            <CampaignList
              onDiscoverVenues={(campaignId) => {
                setTargetCampaignId(campaignId);
                setActiveTab('MARKETPLACE');
              }}
            />
          )}

          {activeTab === 'PROFILE' && (
            advertiserProfile ? (
              <AdvertiserProfileEditor profile={advertiserProfile} />
            ) : (
              <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-8 text-center text-xs text-[#737385]">
                Initializing operational profile...
              </div>
            )
          )}

          {activeTab === 'ACCOUNT' && <AccountSettingsCard />}

          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Foundation Active Status */}
              <div className="rounded-xl border border-[#232330] bg-[#0d0d12] p-6">
                <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Step 2 Operational Integration Active</span>
                </div>
                <p className="mt-2 text-xs text-[#9595a6] leading-relaxed">
                  Role-aware authentication, account isolation, and profile completeness validation are fully operational. Complete all required fields in your Operational Profile to enable campaign proposal matching in subsequent steps.
                </p>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 border-t border-[#1c1c26] pt-6 text-xs">
                  <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                      Internal Stable ID
                    </span>
                    <p className="mt-1 font-mono text-sm text-[#e2e2ec]">{user?.id}</p>
                  </div>
                  <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                      Reserved Campaign ID Pattern
                    </span>
                    <p className="mt-1 font-mono text-sm text-[#d4af37]">{reservedCampaignId}</p>
                  </div>
                  <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-4">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737385]">
                      Reserved Proposal ID Pattern
                    </span>
                    <p className="mt-1 font-mono text-sm text-[#d4af37]">{reservedProposalId}</p>
                  </div>
                </div>
              </div>

              {/* Structural Workflow Placeholders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Campaign Pipeline</h3>
                    <Clock className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Campaign targeting (venue categories, geography, bottle volume) and artwork proofing modules will be activated in Step 3.
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Awaiting Campaign &amp; Marketplace module deployment.
                  </div>
                </div>

                <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-6">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-bold text-white">Data Visibility Scope</h3>
                    <Key className="h-4 w-4 text-[#757585]" />
                  </div>
                  <p className="mt-2 text-xs text-[#808090] leading-relaxed">
                    Enforced backend visibility: <span className="font-mono text-[#c5a059]">PRIVATE</span> (Draft campaigns) &amp; <span className="font-mono text-[#c5a059]">TRANSACTION_SHARED</span> (Agreements with matched venues and suppliers).
                  </p>
                  <div className="mt-4 rounded border border-dashed border-[#2b2b3b] p-4 text-center text-xs text-[#6e6e7d]">
                    Bilateral data isolation enforced.
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
