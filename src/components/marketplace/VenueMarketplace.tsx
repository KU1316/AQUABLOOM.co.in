/**
 * AquaBloom Venue Marketplace & Matching Engine UI
 * 
 * Step 5: Primary Advertiser discovery surface for eligible venues.
 * Evaluates campaigns against candidate venues deterministically and explainably.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { MarketplaceVenue, Campaign, VenueMarketplaceQuery } from '../../types.js';
import { api } from '../../lib/api.js';
import { CapacityWarningBadge } from './CapacityWarningBadge.js';
import { MatchScoreBreakdown } from './MatchScoreBreakdown.js';
import { VenueDetailModal } from './VenueDetailModal.js';
import { CreateProposalModal } from '../proposals/CreateProposalModal.js';
import { Proposal } from '../../types.js';
import {
  Search,
  Filter,
  Layers,
  Sparkles,
  MapPin,
  Building2,
  Warehouse,
  Users,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Info,
  SlidersHorizontal,
  RefreshCw,
  Eye,
  Megaphone,
  ArrowUpDown,
  ShieldCheck,
} from 'lucide-react';

interface VenueMarketplaceProps {
  initialCampaignId?: string;
  onNavigateToCampaigns?: () => void;
  onProposalCreated?: (proposal: Proposal) => void;
}

export const VenueMarketplace: React.FC<VenueMarketplaceProps> = ({
  initialCampaignId,
  onNavigateToCampaigns,
  onProposalCreated,
}) => {
  // Campaign selection
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');

  // Proposal initiation state
  const [proposalTargetVenue, setProposalTargetVenue] = useState<MarketplaceVenue | null>(null);

  // Venue listings & query state
  const [venues, setVenues] = useState<MarketplaceVenue[]>([]);
  const [totalVenues, setTotalVenues] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('ALL');
  const [venueTypeFilter, setVenueTypeFilter] = useState<string>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<string>('ALL');
  const [capacityStatusFilter, setCapacityStatusFilter] = useState<'ALL' | 'WITHIN_CAPACITY' | 'OVER_CAPACITY'>('ALL');
  const [minScoreFilter, setMinScoreFilter] = useState<number>(0);
  const [minFootfallFilter, setMinFootfallFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'MATCH_SCORE' | 'CAPACITY' | 'FOOTFALL' | 'NAME'>('MATCH_SCORE');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Modal & Expand states
  const [selectedVenueForModal, setSelectedVenueForModal] = useState<MarketplaceVenue | null>(null);
  const [expandedVenueId, setExpandedVenueId] = useState<string | null>(null);

  // Load active advertiser campaigns for matching
  useEffect(() => {
    if (initialCampaignId) {
      setSelectedCampaignId(initialCampaignId);
    }
  }, [initialCampaignId]);

  useEffect(() => {
    let isMounted = true;
    async function loadCampaigns() {
      try {
        const res = await api.getCampaigns();
        if (res.data && isMounted) {
          setCampaigns(res.data);
          if (!selectedCampaignId && res.data.length > 0) {
            // Default to first ready for matching campaign or first campaign
            const ready = res.data.find((c) => c.status === 'READY_FOR_MATCHING');
            if (ready) {
              setSelectedCampaignId(ready.id);
            } else if (res.data[0]) {
              setSelectedCampaignId(res.data[0].id);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load campaigns for marketplace matching:', err);
      }
    }
    loadCampaigns();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch marketplace venues with deterministic matching
  const fetchVenues = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    const query: VenueMarketplaceQuery = {
      campaignId: selectedCampaignId || undefined,
      city: cityFilter !== 'ALL' ? cityFilter : undefined,
      venueType: venueTypeFilter !== 'ALL' ? venueTypeFilter : undefined,
      audienceCategory: audienceFilter !== 'ALL' ? audienceFilter : undefined,
      capacityStatus: capacityStatusFilter !== 'ALL' ? capacityStatusFilter : undefined,
      minScore: minScoreFilter > 0 ? minScoreFilter : undefined,
      minFootfall: minFootfallFilter > 0 ? minFootfallFilter : undefined,
      search: search.trim() ? search.trim() : undefined,
      sortBy,
      sortOrder,
      page: 1,
      pageSize: 50,
    };

    try {
      const res = await api.getMarketplaceVenues(query);
      if (res.error) {
        setErrorMessage(res.error.message);
      } else if (res.data) {
        setVenues(res.data.items);
        setTotalVenues(res.data.total);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error querying venue marketplace.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVenues();
  }, [
    selectedCampaignId,
    cityFilter,
    venueTypeFilter,
    audienceFilter,
    capacityStatusFilter,
    minScoreFilter,
    minFootfallFilter,
    sortBy,
    sortOrder,
  ]);

  // Handle search submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchVenues();
  };

  const selectedCampaign = useMemo(() => {
    return campaigns.find((c) => c.id === selectedCampaignId);
  }, [campaigns, selectedCampaignId]);

  return (
    <div className="space-y-6">
      {/* Top Banner: Matching Mode & Campaign Context */}
      <div className="rounded-2xl border border-[#272738] bg-[#101017] p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Sparkles className="h-4 w-4" />
              <span>Deterministic Matching Engine &bull; Step 5</span>
            </div>
            <h2 className="mt-1 text-xl font-display font-bold text-white sm:text-2xl">
              Venue Discovery Marketplace
            </h2>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Evaluate verified host venues against your campaign specifications with transparent mathematical scoring and capacity analysis.
            </p>
          </div>

          {/* Campaign Selector Control */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="min-w-[280px]">
              <label className="block text-[11px] font-semibold text-[#8b8b9e] mb-1">
                Active Campaign to Score Against:
              </label>
              <div className="relative">
                <select
                  value={selectedCampaignId}
                  onChange={(e) => setSelectedCampaignId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[#2b2b3d] bg-[#161622] px-3.5 py-2.5 pr-8 text-xs font-medium text-white focus:border-[#c5a059] focus:outline-none"
                >
                  <option value="">None (General Venue Discovery)</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.bottleRequirements.requiredQuantity.toLocaleString()} bottles &bull; {c.status})
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-[#717185]" />
              </div>
            </div>

            <button
              onClick={fetchVenues}
              disabled={isLoading}
              title="Refresh matches"
              className="flex items-center justify-center rounded-xl border border-[#2b2b3d] bg-[#161622] px-3 py-2.5 text-xs text-[#9d9db3] hover:text-white hover:bg-[#1f1f2e] transition"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-[#c5a059]' : ''}`} />
            </button>
          </div>
        </div>

        {/* Selected Campaign Requirements Pill Strip */}
        {selectedCampaign && (
          <div className="mt-4 pt-4 border-t border-[#1c1c28] flex flex-wrap items-center gap-2 text-xs text-[#9d9db3]">
            <span className="font-semibold text-white">Active Evaluation Parameters:</span>
            <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] text-[#c5a059] border border-[#262635]">
              Target: {selectedCampaign.bottleRequirements.requiredQuantity.toLocaleString()} bottles
            </span>
            <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] text-[#c5a059] border border-[#262635]">
              Category: {selectedCampaign.category}
            </span>
            <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] text-[#c5a059] border border-[#262635]">
              Duration: {selectedCampaign.timing.duration.value} {selectedCampaign.timing.duration.unit.toLowerCase()}
            </span>
            {selectedCampaign.venueRequirements.preferredVenueTypes.length > 0 && (
              <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] text-[#c0c0d1] border border-[#262635]">
                Preferred Types: {selectedCampaign.venueRequirements.preferredVenueTypes.slice(0, 2).join(', ')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Search & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1">
            <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#717185]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venues by name, city, audience segment, or keywords..."
              className="w-full rounded-xl border border-[#262635] bg-[#0e0e14] pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#5e5e70] focus:border-[#c5a059] focus:outline-none"
            />
          </form>

          {/* Filter Toggle Button */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center space-x-2 rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${
              showFilters || cityFilter !== 'ALL' || venueTypeFilter !== 'ALL' || capacityStatusFilter !== 'ALL' || minScoreFilter > 0
                ? 'border-[#c5a059] bg-[#c5a059]/10 text-[#d4af37]'
                : 'border-[#262635] bg-[#0e0e14] text-[#8e8e9f] hover:text-white'
            }`}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filters & Thresholds</span>
            {(cityFilter !== 'ALL' || venueTypeFilter !== 'ALL' || capacityStatusFilter !== 'ALL' || minScoreFilter > 0) && (
              <span className="h-2 w-2 rounded-full bg-[#c5a059]" />
            )}
          </button>

          {/* Sort Selector */}
          <div className="flex items-center space-x-2 rounded-xl border border-[#262635] bg-[#0e0e14] px-3 py-2 text-xs">
            <ArrowUpDown className="h-4 w-4 text-[#717185]" />
            <span className="text-[#717185]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
            >
              <option value="MATCH_SCORE" className="bg-[#121218]">Match Score</option>
              <option value="CAPACITY" className="bg-[#121218]">Available Storage</option>
              <option value="FOOTFALL" className="bg-[#121218]">Monthly Visitors</option>
              <option value="NAME" className="bg-[#121218]">Venue Name</option>
            </select>
          </div>
        </div>

        {/* Expandable Filter Tray */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl border border-[#21212e] bg-[#0f0f16] p-4 text-xs">
            {/* City Filter */}
            <div>
              <label className="block font-medium text-[#848496] mb-1">City Location</label>
              <select
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-full rounded-lg border border-[#262635] bg-[#161622] p-2 text-xs text-white focus:outline-none"
              >
                <option value="ALL">All Cities</option>
                <option value="Chicago">Chicago</option>
                <option value="New York">New York</option>
                <option value="San Francisco">San Francisco</option>
                <option value="Austin">Austin</option>
                <option value="Bengaluru">Bengaluru</option>
              </select>
            </div>

            {/* Venue Type Filter */}
            <div>
              <label className="block font-medium text-[#848496] mb-1">Venue Type</label>
              <select
                value={venueTypeFilter}
                onChange={(e) => setVenueTypeFilter(e.target.value)}
                className="w-full rounded-lg border border-[#262635] bg-[#161622] p-2 text-xs text-white focus:outline-none"
              >
                <option value="ALL">All Venue Types</option>
                <option value="Convention Center & Exhibition Hall">Convention Center</option>
                <option value="Luxury Hotel & Lounge">Luxury Hotel & Lounge</option>
                <option value="Corporate Technology Campus">Corporate Tech Campus</option>
                <option value="Sports Arena & Entertainment Complex">Sports Arena</option>
                <option value="Co-Working & Innovation Hub">Co-Working Hub</option>
              </select>
            </div>

            {/* Capacity Status Filter */}
            <div>
              <label className="block font-medium text-[#848496] mb-1">Storage Capacity Status</label>
              <select
                value={capacityStatusFilter}
                onChange={(e) => setCapacityStatusFilter(e.target.value as any)}
                className="w-full rounded-lg border border-[#262635] bg-[#161622] p-2 text-xs text-white focus:outline-none"
              >
                <option value="ALL">All (Do Not Filter Out)</option>
                <option value="WITHIN_CAPACITY">Within Capacity Only</option>
                <option value="OVER_CAPACITY">Capacity Warning (Over Capacity)</option>
              </select>
            </div>

            {/* Minimum Match Score */}
            <div>
              <label className="block font-medium text-[#848496] mb-1">
                Minimum Match Score: {minScoreFilter > 0 ? `${minScoreFilter}+ pts` : 'Any Score'}
              </label>
              <select
                value={minScoreFilter}
                onChange={(e) => setMinScoreFilter(Number(e.target.value))}
                className="w-full rounded-lg border border-[#262635] bg-[#161622] p-2 text-xs text-white focus:outline-none"
              >
                <option value="0">All Match Scores (0+)</option>
                <option value="40">Moderate Match (40+)</option>
                <option value="60">Good Match (60+)</option>
                <option value="80">Tier 1 Top Match (80+)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Master Consistency Rule Notice */}
      <div className="rounded-xl border border-[#21212d] bg-[#0c0c11] p-3 text-[11px] text-[#737385] flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="h-4 w-4 text-[#c5a059] shrink-0" />
          <span>
            <strong className="text-white">Discovery Rule:</strong> All eligible venues remain discoverable. Matched venues appear first. Capacity is a warning/decision threshold and does not block discovery. Viewing a venue does NOT reserve it.
          </span>
        </div>
        <span className="font-mono text-xs font-semibold text-[#c5a059] shrink-0">
          {totalVenues} Eligible Venues Found
        </span>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-xs text-rose-300 flex items-center space-x-2">
          <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="rounded-2xl border border-[#21212d] bg-[#0e0e14] p-12 text-center text-xs text-[#8e8e9f] space-y-3">
          <RefreshCw className="h-6 w-6 animate-spin text-[#c5a059] mx-auto" />
          <p>Evaluating venue eligibility and computing deterministic match matrix...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && venues.length === 0 && (
        <div className="rounded-2xl border border-[#21212d] bg-[#0e0e14] p-12 text-center space-y-4">
          <Building2 className="h-8 w-8 text-[#545468] mx-auto" />
          <div>
            <h3 className="text-base font-semibold text-white">No venues match the selected filters</h3>
            <p className="mt-1 text-xs text-[#7e7e92] max-w-md mx-auto">
              Try relaxing your city, category, or minimum score criteria. Remember that even venues requiring capacity adjustments remain discoverable.
            </p>
          </div>
          <button
            onClick={() => {
              setSearch('');
              setCityFilter('ALL');
              setVenueTypeFilter('ALL');
              setAudienceFilter('ALL');
              setCapacityStatusFilter('ALL');
              setMinScoreFilter(0);
            }}
            className="rounded-lg border border-[#303042] bg-[#181824] px-4 py-2 text-xs font-semibold text-white hover:bg-[#202030] transition"
          >
            Reset All Filters
          </button>
        </div>
      )}

      {/* Venue Listings Grid */}
      {!isLoading && venues.length > 0 && (
        <div className="space-y-4">
          {Array.from(new Map(venues.map((v) => [v.id, v])).values()).map((venue) => {
            const hasMatch = venue.matchEvaluation && venue.matchEvaluation.score !== null;
            const score = venue.matchEvaluation?.score ?? 0;
            const isExpanded = expandedVenueId === venue.id;

            return (
              <div
                key={venue.id}
                className="rounded-2xl border border-[#21212e] bg-[#0f0f16] p-5 sm:p-6 transition hover:border-[#353549] space-y-4"
              >
                {/* Card Top Row: Header & Primary Metrics */}
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#c5a059] bg-[#1a1a24] px-2 py-0.5 rounded">
                        {venue.publicAccountId}
                      </span>
                      <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] font-medium text-[#9d9db3]">
                        {venue.venueType}
                      </span>
                      {venue.capacityEvaluation && (
                        <CapacityWarningBadge evaluation={venue.capacityEvaluation} compact />
                      )}
                    </div>

                    <h3 className="text-lg font-display font-bold text-white sm:text-xl pt-1">
                      {venue.venueName}
                    </h3>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-[#8e8e9f] pt-0.5">
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
                      <span>&bull;</span>
                      <span className="flex items-center space-x-1">
                        <Warehouse className="h-3.5 w-3.5 text-[#c5a059]" />
                        <span>{venue.capacity.availableBottleCapacity.toLocaleString()} Bottles Available</span>
                      </span>
                    </div>
                  </div>

                  {/* Right Score Block */}
                  <div className="flex items-center lg:items-end justify-between lg:flex-col gap-3 shrink-0">
                    {hasMatch ? (
                      <div className="text-right">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-semibold text-[#8b8b9e] uppercase tracking-wider">
                            Match Score
                          </span>
                          <span className={`rounded-lg border px-2.5 py-1 text-sm font-bold font-mono ${
                            score >= 80
                              ? 'text-emerald-400 bg-emerald-950/40 border-emerald-800/40'
                              : score >= 60
                              ? 'text-amber-400 bg-amber-950/40 border-amber-800/40'
                              : 'text-rose-400 bg-rose-950/40 border-rose-800/40'
                          }`}>
                            {score}/100
                          </span>
                        </div>
                        <div className="text-[11px] text-[#9393a6] mt-1">
                          {venue.matchEvaluation?.scoreLabel} Fit
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-[#7e7e92] italic">
                        Select a campaign to score
                      </div>
                    )}

                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => setSelectedVenueForModal(venue)}
                        className="rounded-lg border border-[#2e2e3f] bg-[#171722] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#202030] hover:border-[#c5a059]/50 transition flex items-center space-x-1.5"
                      >
                        <Eye className="h-3.5 w-3.5 text-[#c5a059]" />
                        <span>Full Profile</span>
                      </button>

                      <button
                        onClick={() => setProposalTargetVenue(venue)}
                        className="rounded-lg bg-[#c5a059] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#d4af37] transition flex items-center space-x-1.5 shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Initiate Proposal</span>
                      </button>

                      {hasMatch && (
                        <button
                          onClick={() => setExpandedVenueId(isExpanded ? null : venue.id)}
                          className="rounded-lg border border-[#242433] bg-[#121218] px-3 py-1.5 text-xs text-[#9d9db3] hover:text-white transition flex items-center space-x-1"
                        >
                          <span>Matrix</span>
                          {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description Snippet */}
                <p className="text-xs text-[#9e9eb0] line-clamp-2 leading-relaxed">
                  {venue.description || 'Verified enterprise host venue with active promotional bottle distribution capacity.'}
                </p>

                {/* Placements & Audience Chips */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] font-semibold text-[#78788c]">Audience:</span>
                  <span className="rounded bg-[#161620] px-2 py-0.5 text-[11px] text-[#c0c0d1] border border-[#232330]">
                    {venue.audienceCategory}
                  </span>
                  {venue.placementPossibilities?.slice(0, 3).map((placement, idx) => (
                    <span
                      key={idx}
                      className="rounded bg-[#161620] px-2 py-0.5 text-[11px] text-[#a0a0b2] border border-[#232330]"
                    >
                      {placement}
                    </span>
                  ))}
                  {venue.placementPossibilities && venue.placementPossibilities.length > 3 && (
                    <span className="text-[11px] text-[#717185]">
                      +{venue.placementPossibilities.length - 3} more placements
                    </span>
                  )}
                </div>

                {/* Inline Capacity Warning Card if Over Capacity */}
                {venue.capacityEvaluation && (venue.capacityEvaluation.status === 'OVER_CAPACITY' || venue.capacityEvaluation.isWarning) && (
                  <div className="pt-2">
                    <CapacityWarningBadge evaluation={venue.capacityEvaluation} />
                  </div>
                )}

                {/* Inline Expandable Deterministic Match Score Matrix */}
                {isExpanded && venue.matchEvaluation && (
                  <div className="pt-3 border-t border-[#1f1f2c]">
                    <MatchScoreBreakdown
                      evaluation={venue.matchEvaluation}
                      venueName={venue.venueName}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Venue Detail Modal */}
      {selectedVenueForModal && (
        <VenueDetailModal
          venue={selectedVenueForModal}
          isOpen={!!selectedVenueForModal}
          onClose={() => setSelectedVenueForModal(null)}
          selectedCampaignName={selectedCampaign?.name}
          onInitiateProposal={(v) => setProposalTargetVenue(v)}
        />
      )}

      {/* Create Proposal Modal */}
      {proposalTargetVenue && (
        <CreateProposalModal
          venue={proposalTargetVenue}
          campaignId={selectedCampaignId}
          onClose={() => setProposalTargetVenue(null)}
          onSuccess={(newProp) => {
            setProposalTargetVenue(null);
            if (onProposalCreated) {
              onProposalCreated(newProp);
            }
          }}
        />
      )}
    </div>
  );
};
