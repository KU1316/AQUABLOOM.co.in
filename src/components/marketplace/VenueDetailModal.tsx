/**
 * AquaBloom Venue Marketplace Detail Modal
 * 
 * Step 5: Complete sanitized venue exploration modal.
 * Preserves strict PII protection while presenting all operational criteria
 * needed for an Advertiser to evaluate fit.
 */

import React, { useState } from 'react';
import { MarketplaceVenue } from '../../types.js';
import { MatchScoreBreakdown } from './MatchScoreBreakdown.js';
import { CapacityWarningBadge } from './CapacityWarningBadge.js';
import {
  X,
  Building2,
  MapPin,
  Users,
  Warehouse,
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  Layers,
  Sparkles,
  Info,
  Calendar,
  Truck,
  DollarSign,
} from 'lucide-react';

interface VenueDetailModalProps {
  venue: MarketplaceVenue | null;
  isOpen: boolean;
  onClose: () => void;
  selectedCampaignName?: string;
  onInitiateProposal?: (venue: MarketplaceVenue) => void;
}

export const VenueDetailModal: React.FC<VenueDetailModalProps> = ({
  venue,
  isOpen,
  onClose,
  selectedCampaignName,
  onInitiateProposal,
}) => {
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'MATCHING' | 'CAPACITY' | 'PLACEMENT'>('OVERVIEW');

  if (!isOpen || !venue) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-4xl rounded-2xl border border-[#262635] bg-[#0c0c11] text-white shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-[#1c1c28] p-6 bg-[#111118]">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <span className="rounded bg-[#1a1a26] px-2 py-0.5 text-[11px] font-mono text-[#c5a059]">
                {venue.publicAccountId}
              </span>
              <span className="rounded bg-[#20202d] px-2 py-0.5 text-[11px] font-medium text-[#9d9db3]">
                {venue.venueType}
              </span>
              <span className="rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                Verified Venue
              </span>
            </div>
            <h2 className="text-xl font-display font-bold text-white sm:text-2xl">
              {venue.venueName}
            </h2>
            <div className="flex items-center space-x-3 text-xs text-[#8e8e9f]">
              <span className="flex items-center space-x-1">
                <MapPin className="h-3.5 w-3.5 text-[#c5a059]" />
                <span>
                  {venue.location.city}, {venue.location.stateRegion ? `${venue.location.stateRegion}, ` : ''}{venue.location.country}
                </span>
              </span>
              <span>&bull;</span>
              <span className="flex items-center space-x-1">
                <Users className="h-3.5 w-3.5 text-[#c5a059]" />
                <span>{venue.footfall.monthlyVisitors.toLocaleString()} Monthly Footfall</span>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-2 text-[#737385] hover:bg-[#1a1a24] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex border-b border-[#1c1c28] bg-[#0f0f15] px-6 gap-2 pt-2">
          <button
            onClick={() => setActiveTab('OVERVIEW')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'OVERVIEW'
                ? 'border-[#c5a059] text-white'
                : 'border-transparent text-[#7e7e92] hover:text-white'
            }`}
          >
            Venue Profile
          </button>
          <button
            onClick={() => setActiveTab('MATCHING')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'MATCHING'
                ? 'border-[#c5a059] text-white'
                : 'border-transparent text-[#7e7e92] hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-[#c5a059]" />
            <span>Match Matrix</span>
            {venue.matchEvaluation && venue.matchEvaluation.score !== null && (
              <span className="rounded bg-[#1a1a24] px-1.5 py-0.2 text-[10px] font-mono text-[#c5a059]">
                {venue.matchEvaluation.score}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('CAPACITY')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition flex items-center space-x-1.5 ${
              activeTab === 'CAPACITY'
                ? 'border-[#c5a059] text-white'
                : 'border-transparent text-[#7e7e92] hover:text-white'
            }`}
          >
            <Warehouse className="h-3.5 w-3.5 text-[#c5a059]" />
            <span>Storage & Capacity</span>
          </button>
          <button
            onClick={() => setActiveTab('PLACEMENT')}
            className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition ${
              activeTab === 'PLACEMENT'
                ? 'border-[#c5a059] text-white'
                : 'border-transparent text-[#7e7e92] hover:text-white'
            }`}
          >
            Placements & Facilities
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'OVERVIEW' && (
            <div className="space-y-6">
              {/* Description */}
              <div className="rounded-xl border border-[#21212e] bg-[#12121a] p-4 text-xs leading-relaxed text-[#c0c0d1]">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059] mb-1">
                  Venue Overview
                </div>
                <p>{venue.description || 'Verified enterprise venue partner in the AquaBloom premium distribution network.'}</p>
              </div>

              {/* Quick Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#1f1f2c] bg-[#101017] p-3 text-xs">
                  <div className="text-[#7d7d91] mb-1">Audience Segment</div>
                  <div className="font-semibold text-white truncate">{venue.audienceCategory}</div>
                </div>
                <div className="rounded-xl border border-[#1f1f2c] bg-[#101017] p-3 text-xs">
                  <div className="text-[#7d7d91] mb-1">Monthly Visitors</div>
                  <div className="font-semibold text-white font-mono">{venue.footfall.monthlyVisitors.toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-[#1f1f2c] bg-[#101017] p-3 text-xs">
                  <div className="text-[#7d7d91] mb-1">Available Storage</div>
                  <div className="font-semibold text-[#c5a059] font-mono">{venue.capacity.availableBottleCapacity.toLocaleString()} bottles</div>
                </div>
                <div className="rounded-xl border border-[#1f1f2c] bg-[#101017] p-3 text-xs">
                  <div className="text-[#7d7d91] mb-1">Campaign Availability</div>
                  <div className="font-semibold text-white">{venue.campaignAvailability.replace('_', ' ')}</div>
                </div>
              </div>

              {/* Capacity Warning Alert if relevant */}
              {venue.capacityEvaluation && (
                <CapacityWarningBadge evaluation={venue.capacityEvaluation} />
              )}

              {/* Audience Traits & Demographics */}
              <div className="rounded-xl border border-[#21212e] bg-[#111118] p-4 space-y-3">
                <div className="text-xs font-semibold text-white flex items-center space-x-2">
                  <Users className="h-4 w-4 text-[#c5a059]" />
                  <span>Audience Classification & Footfall Profile</span>
                </div>
                <div className="rounded-md border border-[#29293a] bg-[#181822] px-3 py-2 text-xs text-[#d2d2e0]">
                  Target Demographics: <strong className="text-white">{venue.audienceCategory}</strong>
                </div>
                {venue.footfall.peakTrafficTimes && (
                  <div className="text-xs text-[#9d9db3] flex items-center space-x-1.5 pt-1">
                    <Clock className="h-3.5 w-3.5 text-[#c5a059]" />
                    <span>Peak Footfall Times: <strong className="text-white">{venue.footfall.peakTrafficTimes}</strong></span>
                  </div>
                )}
              </div>

              {/* Acceptable & Forbidden Brand Categories */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-4 space-y-2">
                  <div className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                    <CheckCircle className="h-4 w-4" />
                    <span>Accepted Brand Categories</span>
                  </div>
                  {venue.campaignPreferences?.acceptedCategories && venue.campaignPreferences.acceptedCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {venue.campaignPreferences.acceptedCategories.map((c, idx) => (
                        <span key={idx} className="rounded bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 text-[11px] text-emerald-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#7d7d91]">Open to all verified enterprise categories.</p>
                  )}
                </div>

                <div className="rounded-xl border border-rose-900/30 bg-rose-950/10 p-4 space-y-2">
                  <div className="text-xs font-semibold text-rose-400 flex items-center space-x-1.5">
                    <XCircle className="h-4 w-4" />
                    <span>Strictly Forbidden Categories</span>
                  </div>
                  {venue.campaignPreferences?.forbiddenCategories && venue.campaignPreferences.forbiddenCategories.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {venue.campaignPreferences.forbiddenCategories.map((c, idx) => (
                        <span key={idx} className="rounded bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 text-[11px] text-rose-300">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#7d7d91]">No category exclusions recorded.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'MATCHING' && (
            <div className="space-y-4">
              {venue.matchEvaluation ? (
                <MatchScoreBreakdown
                  evaluation={venue.matchEvaluation}
                  venueName={venue.venueName}
                />
              ) : (
                <div className="rounded-xl border border-[#232330] bg-[#121218] p-8 text-center text-xs text-[#8e8e9f]">
                  Select an active advertising campaign in the marketplace toolbar above to calculate this venue's deterministic Match Score and dimension weights.
                </div>
              )}
            </div>
          )}

          {activeTab === 'CAPACITY' && (
            <div className="space-y-4">
              {venue.capacityEvaluation && (
                <CapacityWarningBadge evaluation={venue.capacityEvaluation} />
              )}

              <div className="rounded-xl border border-[#21212e] bg-[#111118] p-5 space-y-4">
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Warehouse className="h-4 w-4 text-[#c5a059]" />
                  <span>Physical Storage & Holding Specifications</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="rounded-lg border border-[#1e1e2c] bg-[#151520] p-3">
                    <div className="text-[#848496]">Max Holding Capacity</div>
                    <div className="text-lg font-bold font-mono text-white mt-1">
                      {venue.capacity.maxBottleHoldingCapacity.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#69697a]">Total warehouse/staging floor</div>
                  </div>

                  <div className="rounded-lg border border-[#1e1e2c] bg-[#151520] p-3">
                    <div className="text-[#848496]">Ongoing Commitments</div>
                    <div className="text-lg font-bold font-mono text-[#a0a0b8] mt-1">
                      {venue.capacity.currentOngoingBottleCommitment.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#69697a]">Active Campaign Agreements</div>
                  </div>

                  <div className="rounded-lg border border-[#1e1e2c] bg-[#151520] p-3">
                    <div className="text-[#848496]">Available Space</div>
                    <div className="text-lg font-bold font-mono text-[#c5a059] mt-1">
                      {venue.capacity.availableBottleCapacity.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-[#69697a]">Instant unreserved capacity</div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#1e1e2b] bg-[#0c0c12] p-3 text-xs text-[#9d9db3] space-y-2">
                  <div className="font-semibold text-white">Monthly Bottle Consumption Profile:</div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-[#c5a059] font-bold">
                      {venue.bottleConsumption.estimatedMonthlyBottles.toLocaleString()}
                    </span>
                    <span>bottles per month estimated distribution through venue outlets.</span>
                  </div>
                  {venue.bottleConsumption.consumptionRateNotes && (
                    <div className="text-[11px] text-[#78788a]">
                      Consumption Notes: {venue.bottleConsumption.consumptionRateNotes}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'PLACEMENT' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#21212e] bg-[#111118] p-5 space-y-3">
                <h4 className="text-sm font-semibold text-white">
                  Permitted Staging & Placement Zones
                </h4>
                {venue.placementPossibilities && venue.placementPossibilities.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {venue.placementPossibilities.map((placement, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg border border-[#20202e] bg-[#151520] p-3 flex items-center space-x-2"
                      >
                        <CheckCircle className="h-4 w-4 text-[#c5a059] shrink-0" />
                        <span className="text-white font-medium">{placement}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[#7d7d91]">Custom placement coordinated upon campaign confirmation.</p>
                )}
              </div>

              {/* Logistics & Staging Safeguards */}
              <div className="rounded-xl border border-[#21212e] bg-[#111118] p-5 space-y-3 text-xs">
                <h4 className="text-sm font-semibold text-white flex items-center space-x-2">
                  <Truck className="h-4 w-4 text-[#c5a059]" />
                  <span>Logistics & Operational Readiness</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[#1f1f2c] bg-[#14141e] p-3">
                    <div className="font-semibold text-white mb-1">Commercial Delivery Access</div>
                    <div className="text-[#8e8e9f]">
                      Standard freight reception protocols active. Specific dock access details are coordinated after mutual campaign agreement.
                    </div>
                  </div>

                  <div className="rounded-lg border border-[#1f1f2c] bg-[#14141e] p-3">
                    <div className="font-semibold text-white mb-1">Environmental Safeguards</div>
                    <div className="text-[#8e8e9f]">
                      100% recyclable vessel collection and staging compliant with AquaBloom circular sustainability standards.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with Master Consistency Rules */}
        <div className="border-t border-[#1c1c28] bg-[#0d0d12] p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="text-[11px] text-[#6b6b7d] flex items-center space-x-1.5">
            <Info className="h-3.5 w-3.5 text-[#c5a059] shrink-0" />
            <span>Viewing a venue does NOT reserve it or commit bottles. Formal proposals and agreements occur in later phases.</span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={onClose}
              className="rounded-lg border border-[#29293a] bg-[#14141d] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a1a26] transition"
            >
              Close Details
            </button>
            {onInitiateProposal && (
              <button
                onClick={() => {
                  onClose();
                  onInitiateProposal(venue);
                }}
                className="flex items-center space-x-1.5 rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition shadow-sm"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Initiate Proposal</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
