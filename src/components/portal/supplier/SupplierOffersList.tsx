/**
 * AquaBloom Step 9: Incoming Supplier Operational Offers List View
 * 
 * Provides:
 * - Real-time filtered offer directory (All, Awaiting Response, Accepted, Declined, Expired, Cancelled)
 * - Operational cards showing bottle specs, volume, timeline, lead time, staging, and authorized pricing
 * - Dynamic expiration countdown indicators
 * - Strict counterparty isolation (Zero advertiser commercial data leakage)
 * - Detail inspection trigger with Accept / Decline action area
 */

import React, { useState } from 'react';
import { SupplierOperationalOffer } from '../../../types.js';
import {
  Inbox,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Search,
  Filter,
  Package,
  Calendar,
  DollarSign,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface SupplierOffersListProps {
  offers: SupplierOperationalOffer[];
  loading: boolean;
  onSelectOffer: (offer: SupplierOperationalOffer) => void;
  onRefresh: () => void;
}

type StatusFilter = 'ALL' | 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';

export const SupplierOffersList: React.FC<SupplierOffersListProps> = ({
  offers,
  loading,
  onSelectOffer,
  onRefresh,
}) => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const now = new Date();

  // Helper to determine if an offer is expired
  const isOfferExpired = (offer: SupplierOperationalOffer) => {
    return offer.status === 'EXPIRED' || (offer.status === 'PENDING' && new Date(offer.expiresAt) <= now);
  };

  // Filter offers
  const filteredOffers = offers.filter((offer) => {
    // Status check
    if (statusFilter === 'PENDING') {
      if (offer.status !== 'PENDING' || isOfferExpired(offer)) return false;
    } else if (statusFilter === 'EXPIRED') {
      if (!isOfferExpired(offer) && offer.status !== 'EXPIRED') return false;
    } else if (statusFilter !== 'ALL') {
      if (offer.status !== statusFilter) return false;
    }

    // Search query check (offer ID, agreement ref, product name, volume)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = offer.publicId.toLowerCase().includes(q);
      const matchAgreement = offer.campaignAgreementPublicId.toLowerCase().includes(q);
      const matchProduct = (offer.productPublicId || '').toLowerCase().includes(q);
      const matchBottle = (offer.operationalRequirementsSnapshot?.productRequirements?.bottleType || '')
        .toLowerCase()
        .includes(q);
      if (!matchId && !matchAgreement && !matchProduct && !matchBottle) {
        return false;
      }
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212d] pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Inbox className="h-4 w-4" />
            <span>Incoming Operational Bottling Offers</span>
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">
            Production Offers Queue
          </h2>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Review incoming production requests matched from locked campaign agreements. Review specifications and accept or decline within the response window.
          </p>
        </div>

        <span className="rounded-lg border border-[#232332] bg-[#121218] px-3.5 py-1.5 font-mono text-xs text-[#c5a059] self-start sm:self-auto">
          Total Offers: {offers.length}
        </span>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Status Filter Pills */}
        <div className="flex flex-wrap gap-1.5 p-1 bg-[#0c0c12] rounded-xl border border-[#21212d]">
          {[
            { id: 'ALL', label: 'All Offers', count: offers.length },
            {
              id: 'PENDING',
              label: 'Awaiting Action',
              count: offers.filter((o) => o.status === 'PENDING' && !isOfferExpired(o)).length,
            },
            {
              id: 'ACCEPTED',
              label: 'Accepted',
              count: offers.filter((o) => o.status === 'ACCEPTED').length,
            },
            {
              id: 'DECLINED',
              label: 'Declined',
              count: offers.filter((o) => o.status === 'DECLINED').length,
            },
            {
              id: 'EXPIRED',
              label: 'Expired',
              count: offers.filter((o) => isOfferExpired(o)).length,
            },
            {
              id: 'CANCELLED',
              label: 'Reassigned',
              count: offers.filter((o) => o.status === 'CANCELLED').length,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id as StatusFilter)}
              className={`flex items-center space-x-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === tab.id
                  ? 'bg-[#c5a059] text-black font-bold'
                  : 'text-[#8b8b9d] hover:text-white hover:bg-[#161622]'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  statusFilter === tab.id ? 'bg-black/20 text-black' : 'bg-[#1a1a24] text-[#8e8e9e]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID or ref..."
            className="w-full rounded-xl border border-[#262634] bg-[#101017] pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#c5a059]"
          />
        </div>
      </div>

      {/* Offers Cards / List */}
      {filteredOffers.length === 0 ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center space-y-3">
          <Inbox className="h-10 w-10 text-[#555566] mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No supplier offers found</h3>
          <p className="text-xs text-[#838396] max-w-sm mx-auto">
            {statusFilter === 'ALL'
              ? 'There are currently no operational offers dispatched to your supplier account.'
              : `No operational offers with status "${statusFilter}" were found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredOffers.map((offer) => {
            const req = offer.operationalRequirementsSnapshot;
            const terms = offer.offerTerms;
            const expiresDate = new Date(offer.expiresAt);
            const expired = isOfferExpired(offer);
            const hoursLeft = Math.max(
              0,
              Math.round((expiresDate.getTime() - now.getTime()) / (1000 * 60 * 60))
            );

            return (
              <div
                key={offer.id}
                onClick={() => onSelectOffer(offer)}
                className="cursor-pointer rounded-xl border border-[#21212f] bg-[#0c0c13] p-5 hover:border-[#c5a059] hover:bg-[#111119] transition group space-y-4 shadow-sm"
              >
                {/* Card Top: Offer ID, Contract Ref, Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-[#c5a059] group-hover:text-[#d4af37]">
                        {offer.publicId}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                          offer.status === 'ACCEPTED'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                            : offer.status === 'DECLINED'
                            ? 'bg-red-950/80 text-red-300 border border-red-800/50'
                            : expired
                            ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                            : 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                        }`}
                      >
                        {expired && offer.status === 'PENDING' ? 'EXPIRED' : offer.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#717182] font-mono mt-0.5 block">
                      Ref: {offer.campaignAgreementPublicId}
                    </span>
                  </div>

                  {/* Expiration or Status Tag */}
                  {offer.status === 'PENDING' && !expired && (
                    <div className="flex items-center space-x-1 rounded bg-amber-950/50 border border-amber-800/30 px-2 py-1 text-[10px] font-semibold text-amber-400 shrink-0">
                      <Clock className="h-3 w-3" />
                      <span>{hoursLeft > 0 ? `${hoursLeft}h left` : 'Expiring soon'}</span>
                    </div>
                  )}
                </div>

                {/* Card Middle: Key Specs */}
                <div className="grid grid-cols-2 gap-3 text-xs border-y border-[#1c1c28] py-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Volume</span>
                    <span className="font-mono text-base font-bold text-white">
                      {req?.bottleQuantity?.toLocaleString()} units
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Product &amp; Size</span>
                    <span className="font-medium text-zinc-200">
                      {req?.productRequirements?.bottleType || 'Bottle'} ({req?.productRequirements?.preferredVolumeMl || 500}ml)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Material &amp; Finish</span>
                    <span className="text-zinc-300">
                      {req?.productRequirements?.preferredMaterial || 'Aluminum'} &bull; {req?.productRequirements?.labelType || 'Direct Print'}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Production Lead Time</span>
                    <span className="text-zinc-300">
                      {terms.productionLeadTime.value} {terms.productionLeadTime.unit.toLowerCase()}
                    </span>
                  </div>
                </div>

                {/* Card Bottom: Authorized Price & Action CTA */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-[#69697a] block uppercase font-bold">Authorized Value</span>
                    <span className="font-mono font-bold text-[#c5a059] text-sm">
                      ₹{terms.totalBottleAmount.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-[#c5a059] group-hover:text-white transition">
                    <span>{offer.status === 'PENDING' && !expired ? 'Review & Respond' : 'View Details'}</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
