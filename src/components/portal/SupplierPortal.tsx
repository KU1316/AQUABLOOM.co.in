/**
 * AquaBloom Step 9: Supplier Operational Terminal & Workspace Portal
 * 
 * Provides complete operational workflow:
 * - Supplier Dashboard: Authoritative operational metrics (New Offers, Awaiting Response, Accepted, Active, Expired, Declined)
 * - Incoming Offers: Comprehensive offers queue with status filtering, dynamic expiration, and detail review
 * - My Assignments: Confirmed production commitments with locked specification inspection and "Awaiting Production Authorization" indicator
 * - Product Catalog: Zero-plastic bottle product line management
 * - Production: Upcoming-state view for Step 13 manufacturing operations
 * - Notifications: Live notification center for offer dispatches & assignment events
 * - Profile / Business Settings: Facility parameters & account settings
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import {
  SupplierProfile,
  SupplierOperationalOffer,
  SupplierAssignment,
} from '../../types.js';
import { api } from '../../lib/api.js';
import { SupplierDashboard } from './supplier/SupplierDashboard.js';
import { SupplierOffersList } from './supplier/SupplierOffersList.js';
import { SupplierOfferDetailModal } from './supplier/SupplierOfferDetailModal.js';
import { SupplierAssignmentsList } from './supplier/SupplierAssignmentsList.js';
import { SupplierProductionPlaceholder } from './supplier/SupplierProductionPlaceholder.js';
import { SupplierNotifications } from './supplier/SupplierNotifications.js';
import { ProductCatalog } from '../products/ProductCatalog.js';
import { SupplierProfileEditor } from '../profile/SupplierProfileEditor.js';
import { AccountSettingsCard } from '../profile/AccountSettingsCard.js';
import {
  Factory,
  LayoutDashboard,
  Inbox,
  CalendarCheck,
  Package,
  Settings,
  Bell,
  UserCheck,
  ShieldCheck,
  RefreshCw,
  Sliders,
} from 'lucide-react';

export type SupplierPortalTab =
  | 'DASHBOARD'
  | 'OFFERS'
  | 'ASSIGNMENTS'
  | 'CATALOG'
  | 'PRODUCTION'
  | 'NOTIFICATIONS'
  | 'SETTINGS';

interface SupplierPortalProps {
  initialTab?: SupplierPortalTab;
  initialOfferId?: string;
}

export const SupplierPortal: React.FC<SupplierPortalProps> = ({
  initialTab = 'DASHBOARD',
  initialOfferId,
}) => {
  const { user, profile } = useAuth();
  const [activeTab, setActiveTab] = useState<SupplierPortalTab>(initialTab);
  const [settingsSubTab, setSettingsSubTab] = useState<'PROFILE' | 'ACCOUNT'>('PROFILE');

  // Operational State
  const [offers, setOffers] = useState<SupplierOperationalOffer[]>([]);
  const [assignments, setAssignments] = useState<SupplierAssignment[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<SupplierOperationalOffer | null>(null);

  const supplierProfile = profile as SupplierProfile;

  // Load backend data for supplier
  const fetchSupplierData = async () => {
    setLoadingData(true);
    try {
      const [offersRes, assignmentsRes] = await Promise.all([
        api.getSupplierOffers(),
        api.getSupplierAssignments(),
      ]);

      const loadedOffers = offersRes.data || [];
      const loadedAssignments = assignmentsRes.data || [];

      setOffers(loadedOffers);
      setAssignments(loadedAssignments);

      // Deep link to initial offer if requested
      if (initialOfferId) {
        const found = loadedOffers.find(
          (o) => o.id === initialOfferId || o.publicId === initialOfferId
        );
        if (found) {
          setSelectedOffer(found);
          setActiveTab('OFFERS');
        }
      }
    } catch (err) {
      console.error('Error fetching supplier operational data:', err);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    fetchSupplierData();
  }, []);

  // Update a single offer after accept/decline action
  const handleOfferUpdated = (updatedOffer: SupplierOperationalOffer) => {
    setOffers((prev) =>
      prev.map((o) => (o.id === updatedOffer.id ? updatedOffer : o))
    );
    setSelectedOffer(updatedOffer);
    // Refresh assignments in case an offer was accepted and created an assignment
    api.getSupplierAssignments().then((res) => {
      if (res.data) setAssignments(res.data);
    });
  };

  // Compute live badges
  const now = new Date();
  const pendingOffersCount = offers.filter(
    (o) => o.status === 'PENDING' && new Date(o.expiresAt) > now
  ).length;

  const activeAssignmentsCount = assignments.filter((a) => a.status === 'ASSIGNED').length;

  return (
    <div className="bg-[#08080a] text-white py-8 sm:py-12 px-4 sm:px-6 lg:px-8 min-h-screen">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Portal Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#21212b] pb-6">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Factory className="h-4 w-4" />
              <span>Production Supplier Operational Terminal &bull; Step 9 Active</span>
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">
              {supplierProfile?.supplierBusinessName || user?.organizationName || 'Supplier Portal'}
            </h1>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Public Account ID:{' '}
              <span className="font-mono text-[#c5a059] font-medium">{user?.publicAccountId}</span> &bull; Representative:{' '}
              <span className="text-white font-medium">{user?.contactName}</span> ({user?.email})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#c5a059]/40 bg-[#161622] px-3 py-1 text-xs font-semibold text-[#d4af37]">
              Role: SUPPLIER
            </span>
            <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-3 py-1 text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Identity Verified</span>
            </span>
          </div>
        </div>

        {/* Operational Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 border-b border-[#1c1c28] pb-3">
          {/* 1. Dashboard */}
          <button
            onClick={() => setActiveTab('DASHBOARD')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'DASHBOARD'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            <span>Dashboard</span>
          </button>

          {/* 2. Incoming Offers */}
          <button
            onClick={() => setActiveTab('OFFERS')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'OFFERS'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <Inbox className="h-4 w-4" />
            <span>Incoming Offers</span>
            {pendingOffersCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === 'OFFERS' ? 'bg-black text-[#c5a059]' : 'bg-amber-500 text-black'
                }`}
              >
                {pendingOffersCount}
              </span>
            )}
          </button>

          {/* 3. My Assignments */}
          <button
            onClick={() => setActiveTab('ASSIGNMENTS')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'ASSIGNMENTS'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <CalendarCheck className="h-4 w-4" />
            <span>My Assignments</span>
            {activeAssignmentsCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  activeTab === 'ASSIGNMENTS' ? 'bg-black text-[#c5a059]' : 'bg-emerald-500 text-black'
                }`}
              >
                {activeAssignmentsCount}
              </span>
            )}
          </button>

          {/* 4. Product Catalog */}
          <button
            onClick={() => setActiveTab('CATALOG')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'CATALOG'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <Package className="h-4 w-4" />
            <span>Product Catalog</span>
          </button>

          {/* 5. Production (Step 13 Upcoming Placeholder) */}
          <button
            onClick={() => setActiveTab('PRODUCTION')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'PRODUCTION'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <Factory className="h-4 w-4" />
            <span>Production</span>
          </button>

          {/* 6. Notifications */}
          <button
            onClick={() => setActiveTab('NOTIFICATIONS')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'NOTIFICATIONS'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
          </button>

          {/* 7. Settings / Manufacturing Profile */}
          <button
            onClick={() => setActiveTab('SETTINGS')}
            className={`flex items-center space-x-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
              activeTab === 'SETTINGS'
                ? 'bg-[#c5a059] text-black font-bold shadow-md shadow-[#c5a059]/20'
                : 'bg-[#121218] text-[#9d9db3] hover:text-white hover:bg-[#181822]'
            }`}
          >
            <Settings className="h-4 w-4" />
            <span>Profile &amp; Settings</span>
          </button>
        </div>

        {/* Tab View Content Area */}
        <div className="pt-2">
          {/* 1. Dashboard Tab */}
          {activeTab === 'DASHBOARD' && (
            <SupplierDashboard
              offers={offers}
              assignments={assignments}
              loading={loadingData}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onSelectOffer={(offer) => setSelectedOffer(offer)}
              onRefresh={fetchSupplierData}
            />
          )}

          {/* 2. Incoming Offers Tab */}
          {activeTab === 'OFFERS' && (
            <SupplierOffersList
              offers={offers}
              loading={loadingData}
              onSelectOffer={(offer) => setSelectedOffer(offer)}
              onRefresh={fetchSupplierData}
            />
          )}

          {/* 3. My Assignments Tab */}
          {activeTab === 'ASSIGNMENTS' && (
            <SupplierAssignmentsList
              assignments={assignments}
              loading={loadingData}
              onRefresh={fetchSupplierData}
            />
          )}

          {/* 4. Product Catalog Tab */}
          {activeTab === 'CATALOG' && <ProductCatalog />}

          {/* 5. Production Tab (Step 13 Upcoming state) */}
          {activeTab === 'PRODUCTION' && (
            <SupplierProductionPlaceholder
              onViewAssignments={() => setActiveTab('ASSIGNMENTS')}
            />
          )}

          {/* 6. Notifications Tab */}
          {activeTab === 'NOTIFICATIONS' && <SupplierNotifications />}

          {/* 7. Settings & Manufacturing Profile Tab */}
          {activeTab === 'SETTINGS' && (
            <div className="space-y-6">
              <div className="flex space-x-2 border-b border-[#21212d] pb-3">
                <button
                  onClick={() => setSettingsSubTab('PROFILE')}
                  className={`flex items-center space-x-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    settingsSubTab === 'PROFILE'
                      ? 'bg-[#2a2a38] text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Manufacturing Profile</span>
                </button>

                <button
                  onClick={() => setSettingsSubTab('ACCOUNT')}
                  className={`flex items-center space-x-2 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition ${
                    settingsSubTab === 'ACCOUNT'
                      ? 'bg-[#2a2a38] text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5" />
                  <span>Account Architecture</span>
                </button>
              </div>

              {settingsSubTab === 'PROFILE' && (
                supplierProfile ? (
                  <SupplierProfileEditor profile={supplierProfile} />
                ) : (
                  <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-8 text-center text-xs text-[#737385]">
                    Initializing supplier operational profile...
                  </div>
                )
              )}

              {settingsSubTab === 'ACCOUNT' && <AccountSettingsCard />}
            </div>
          )}
        </div>
      </div>

      {/* Offer Details & Decision Modal */}
      {selectedOffer && (
        <SupplierOfferDetailModal
          offer={selectedOffer}
          onClose={() => setSelectedOffer(null)}
          onOfferUpdated={handleOfferUpdated}
        />
      )}
    </div>
  );
};
