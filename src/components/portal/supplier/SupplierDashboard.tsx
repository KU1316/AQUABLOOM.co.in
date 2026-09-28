/**
 * AquaBloom Step 9: Supplier Operational Dashboard
 * 
 * Displays authoritative real-time metrics computed directly from backend data:
 * - New Offers
 * - Offers Awaiting Response
 * - Accepted Assignments
 * - Active / Upcoming Assignments
 * - Expired Offers
 * - Declined Offers
 * 
 * Zero fabricated numbers: displays 0 and clean empty states if no records exist.
 */

import React from 'react';
import {
  SupplierOperationalOffer,
  SupplierAssignment,
} from '../../../types.js';
import {
  Inbox,
  Clock,
  CheckCircle2,
  CalendarCheck,
  AlertTriangle,
  XCircle,
  Package,
  ArrowRight,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';

interface SupplierDashboardProps {
  offers: SupplierOperationalOffer[];
  assignments: SupplierAssignment[];
  loading: boolean;
  onNavigateTab: (tab: 'OFFERS' | 'ASSIGNMENTS' | 'CATALOG' | 'PRODUCTION') => void;
  onSelectOffer: (offer: SupplierOperationalOffer) => void;
  onRefresh: () => void;
}

export const SupplierDashboard: React.FC<SupplierDashboardProps> = ({
  offers,
  assignments,
  loading,
  onNavigateTab,
  onSelectOffer,
  onRefresh,
}) => {
  const now = new Date();

  // Compute authoritative metrics from backend data
  const newOffersCount = offers.filter((o) => {
    const isPending = o.status === 'PENDING';
    const notExpired = new Date(o.expiresAt) > now;
    return isPending && notExpired;
  }).length;

  const awaitingResponseCount = offers.filter(
    (o) => o.status === 'PENDING' && new Date(o.expiresAt) > now
  ).length;

  const acceptedCount = offers.filter((o) => o.status === 'ACCEPTED').length;

  const activeAssignmentsCount = assignments.filter((a) => a.status === 'ASSIGNED').length;

  const expiredCount = offers.filter(
    (o) => o.status === 'EXPIRED' || (o.status === 'PENDING' && new Date(o.expiresAt) <= now)
  ).length;

  const declinedCount = offers.filter((o) => o.status === 'DECLINED').length;

  // Total volume committed across active assignments
  const totalVolumeCommitted = assignments
    .filter((a) => a.status === 'ASSIGNED')
    .reduce((sum, a) => sum + (a.lockedOfferSnapshot?.bottleQuantity || 0), 0);

  // Recent pending offers for quick response
  const recentPendingOffers = offers
    .filter((o) => o.status === 'PENDING' && new Date(o.expiresAt) > now)
    .slice(0, 3);

  // Recent assignments
  const recentAssignments = assignments.slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Top Banner with Quick Refresh & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-xl border border-[#232330] bg-gradient-to-r from-[#0d0d14] via-[#101018] to-[#0a0a0f] p-6">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <ShieldCheck className="h-4 w-4" />
            <span>Bottling Operations Center &bull; Step 9 Operational Terminal</span>
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">
            Manufacturing &amp; Fulfillment Terminal
          </h2>
          <p className="mt-1 text-xs text-[#9595a6] max-w-2xl leading-relaxed">
            Manage incoming AquaBloom bottling production offers, review operational specifications,
            execute atomic offer acceptance or structured decline, and track authorized production assignments.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center space-x-2 rounded-lg border border-[#2a2a38] bg-[#14141c] px-3.5 py-2 text-xs font-semibold text-[#d4af37] hover:border-[#c5a059] hover:bg-[#1a1a24] transition disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync State</span>
          </button>
        </div>
      </div>

      {/* Authoritative Metrics Grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#8e8e9e]">
            Operational Workflow Metrics
          </h3>
          <span className="text-[11px] text-[#717182]">Live Data Verification</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* 1. New Offers */}
          <div
            onClick={() => onNavigateTab('OFFERS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-[#c5a059]/60 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-[#c5a059]">
              <span className="text-[10px] font-bold uppercase tracking-wider">New Offers</span>
              <Inbox className="h-4 w-4 text-[#c5a059]" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-white">
              {newOffersCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">
              {newOffersCount === 1 ? '1 active offer' : `${newOffersCount} active offers`}
            </span>
          </div>

          {/* 2. Offers Awaiting Response */}
          <div
            onClick={() => onNavigateTab('OFFERS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-amber-500/50 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-amber-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Awaiting Action</span>
              <Clock className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-amber-400">
              {awaitingResponseCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">Requires response</span>
          </div>

          {/* 3. Accepted Assignments */}
          <div
            onClick={() => onNavigateTab('ASSIGNMENTS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-emerald-500/50 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-emerald-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Accepted</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-emerald-400">
              {acceptedCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">Confirmed offers</span>
          </div>

          {/* 4. Active Assignments */}
          <div
            onClick={() => onNavigateTab('ASSIGNMENTS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-[#c5a059]/60 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-[#c5a059]">
              <span className="text-[10px] font-bold uppercase tracking-wider">Assignments</span>
              <CalendarCheck className="h-4 w-4 text-[#c5a059]" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-white">
              {activeAssignmentsCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">Active contracts</span>
          </div>

          {/* 5. Expired Offers */}
          <div
            onClick={() => onNavigateTab('OFFERS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-zinc-500/50 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-zinc-300">
              <span className="text-[10px] font-bold uppercase tracking-wider">Expired</span>
              <AlertTriangle className="h-4 w-4 text-zinc-500" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-zinc-400">
              {expiredCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">Past window</span>
          </div>

          {/* 6. Declined Offers */}
          <div
            onClick={() => onNavigateTab('OFFERS')}
            className="cursor-pointer rounded-xl border border-[#232332] bg-[#0c0c12] p-4 hover:border-red-500/40 hover:bg-[#111119] transition group"
          >
            <div className="flex items-center justify-between text-[#8e8e9e] group-hover:text-red-400">
              <span className="text-[10px] font-bold uppercase tracking-wider">Declined</span>
              <XCircle className="h-4 w-4 text-red-400/80" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-red-400/90">
              {declinedCount}
            </div>
            <span className="text-[10px] text-[#757588] mt-1 block">Rejected offers</span>
          </div>
        </div>
      </div>

      {/* Production Volume Highlights Banner */}
      {activeAssignmentsCount > 0 && (
        <div className="rounded-xl border border-emerald-800/30 bg-emerald-950/15 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="rounded-lg bg-emerald-900/40 border border-emerald-700/50 p-2.5 shrink-0">
              <TrendingUp className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block">
                Committed Bottling Capacity
              </span>
              <p className="text-xs text-zinc-300 mt-0.5">
                Total contracted volume across {activeAssignmentsCount} assignment{activeAssignmentsCount > 1 ? 's' : ''}:{' '}
                <strong className="text-white font-mono">{totalVolumeCommitted.toLocaleString()} bottles</strong>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigateTab('ASSIGNMENTS')}
              className="flex items-center space-x-1.5 rounded-lg bg-emerald-800/60 hover:bg-emerald-700/60 border border-emerald-600/50 px-3.5 py-1.5 text-xs font-semibold text-emerald-100 transition shrink-0"
            >
              <span>View Assignments</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout: Action Items & Recent Assignments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Column 1: Offers Awaiting Response */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">Action Required: Incoming Offers</h3>
            </div>
            <button
              onClick={() => onNavigateTab('OFFERS')}
              className="text-xs font-semibold text-[#c5a059] hover:text-[#d4af37] flex items-center space-x-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentPendingOffers.length === 0 ? (
            <div className="rounded-lg border border-[#1d1d28] bg-[#08080c] p-8 text-center">
              <Inbox className="h-8 w-8 text-[#5a5a6b] mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-300">No new supplier offers</p>
              <p className="text-[11px] text-[#717182] mt-1 max-w-xs mx-auto">
                AquaBloom administrative matching automatically routes eligible bottling opportunities matching your product catalog.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentPendingOffers.map((offer) => {
                const expiresDate = new Date(offer.expiresAt);
                const hoursLeft = Math.max(
                  0,
                  Math.round((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60))
                );

                return (
                  <div
                    key={offer.id}
                    onClick={() => onSelectOffer(offer)}
                    className="cursor-pointer rounded-lg border border-[#1f1f2c] bg-[#111118] p-4 hover:border-[#c5a059] hover:bg-[#151520] transition group space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-[#c5a059]">
                        {offer.publicId}
                      </span>
                      <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-amber-950/60 text-amber-400 border border-amber-800/40">
                        {hoursLeft > 0 ? `${hoursLeft}h left` : 'Expires soon'}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-300">
                      <span className="font-medium text-white">
                        {offer.operationalRequirementsSnapshot?.bottleQuantity?.toLocaleString()} units
                      </span>{' '}
                      &bull;{' '}
                      <span>
                        {offer.operationalRequirementsSnapshot?.productRequirements?.bottleType ||
                          'Spring Water'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-[#7d7d90] pt-1 border-t border-[#1a1a24]">
                      <span>Lead Time: {offer.offerTerms.productionLeadTime.value} {offer.offerTerms.productionLeadTime.unit.toLowerCase()}</span>
                      <span className="text-[#c5a059] font-medium group-hover:underline">
                        Review Offer &rarr;
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Column 2: Confirmed Production Assignments */}
        <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CalendarCheck className="h-4 w-4 text-[#c5a059]" />
              <h3 className="text-sm font-bold text-white">Confirmed Production Assignments</h3>
            </div>
            <button
              onClick={() => onNavigateTab('ASSIGNMENTS')}
              className="text-xs font-semibold text-[#c5a059] hover:text-[#d4af37] flex items-center space-x-1"
            >
              <span>View All</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentAssignments.length === 0 ? (
            <div className="rounded-lg border border-[#1d1d28] bg-[#08080c] p-8 text-center">
              <Package className="h-8 w-8 text-[#5a5a6b] mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-300">No active supplier assignments</p>
              <p className="text-[11px] text-[#717182] mt-1 max-w-xs mx-auto">
                Accepted offers will appear here as binding production commitments awaiting production authorization.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAssignments.map((assignment) => (
                <div
                  key={assignment.id}
                  onClick={() => onNavigateTab('ASSIGNMENTS')}
                  className="cursor-pointer rounded-lg border border-[#1f1f2c] bg-[#111118] p-4 hover:border-emerald-600/60 hover:bg-[#141520] transition group space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {assignment.publicId}
                    </span>
                    <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-950/60 text-emerald-300 border border-emerald-800/40">
                      {assignment.status}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300">
                    <span className="font-medium text-white">
                      {assignment.lockedOfferSnapshot?.bottleQuantity?.toLocaleString()} bottles
                    </span>{' '}
                    &bull; Contract ref: {assignment.campaignAgreementPublicId}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#7d7d90] pt-1 border-t border-[#1a1a24]">
                    <span className="text-amber-400/90 font-medium">Awaiting Production Authorization</span>
                    <span className="text-zinc-400 group-hover:text-white transition">
                      Details &rarr;
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
