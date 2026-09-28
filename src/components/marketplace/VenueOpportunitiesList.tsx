/**
 * AquaBloom Venue Portal — Campaign Opportunities Explorer
 * 
 * Step 5: Allows Venue coordinators to discover incoming advertiser campaigns
 * seeking distribution venues, with real-time capacity compatibility checks.
 */

import React, { useState, useEffect } from 'react';
import { CampaignOpportunityView, CapacityEvaluation } from '../../types.js';
import { api } from '../../lib/api.js';
import { CapacityWarningBadge } from './CapacityWarningBadge.js';
import {
  Search,
  Filter,
  Layers,
  Sparkles,
  Calendar,
  Package,
  Users,
  MapPin,
  Clock,
  DollarSign,
  AlertCircle,
  RefreshCw,
  Building2,
  Info,
} from 'lucide-react';

export const VenueOpportunitiesList: React.FC = () => {
  const [opportunities, setOpportunities] = useState<
    Array<CampaignOpportunityView & { capacityEvaluation: CapacityEvaluation }>
  >([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const fetchOpportunities = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getVenueOpportunities({
        category: categoryFilter !== 'ALL' ? categoryFilter : undefined,
        search: search.trim() ? search.trim() : undefined,
      });

      if (res.error) {
        setErrorMessage(res.error.message);
      } else if (res.data) {
        setOpportunities(res.data.items);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load campaign opportunities.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOpportunities();
  }, [categoryFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOpportunities();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#272738] bg-[#101017] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Layers className="h-4 w-4" />
              <span>Inbound Distribution Opportunities &bull; Step 5</span>
            </div>
            <h2 className="mt-1 text-xl font-display font-bold text-white sm:text-2xl">
              Campaign Opportunities for Your Venue
            </h2>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Discover active advertising campaigns seeking distribution at your property type. Evaluated against your venue storage capacity in real-time.
            </p>
          </div>

          <button
            onClick={fetchOpportunities}
            disabled={isLoading}
            className="flex items-center space-x-2 rounded-xl border border-[#2b2b3d] bg-[#161622] px-3.5 py-2 text-xs text-[#9d9db3] hover:text-white transition self-start sm:self-auto"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-[#c5a059]' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3.5 top-3 h-4 w-4 text-[#717185]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search campaigns by brand category, objective, or keywords..."
            className="w-full rounded-xl border border-[#262635] bg-[#0e0e14] pl-10 pr-4 py-2.5 text-xs text-white placeholder-[#5e5e70] focus:border-[#c5a059] focus:outline-none"
          />
        </form>

        <div className="flex items-center space-x-2 rounded-xl border border-[#262635] bg-[#0e0e14] px-3 py-2 text-xs">
          <span className="text-[#717185]">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
          >
            <option value="ALL" className="bg-[#121218]">All Categories</option>
            <option value="Luxury Goods & Botanical Elixirs" className="bg-[#121218]">Luxury & Botanicals</option>
            <option value="Enterprise SaaS & Technology" className="bg-[#121218]">Tech & Enterprise</option>
            <option value="Financial Services & Wealth Management" className="bg-[#121218]">Finance & Wealth</option>
            <option value="Automotive & Mobility" className="bg-[#121218]">Automotive</option>
          </select>
        </div>
      </div>

      {/* Operational Disclaimer */}
      <div className="rounded-xl border border-[#20202c] bg-[#0c0c11] p-3 text-[11px] text-[#737385] flex items-center space-x-2">
        <Info className="h-4 w-4 text-[#c5a059] shrink-0" />
        <span>
          <strong className="text-white">Venue Safeguard:</strong> Browsing campaign opportunities does NOT commit bottles, reserve capacity, or accept proposals. Capacity evaluations are instant calculations based on your active profile.
        </span>
      </div>

      {/* Error Message */}
      {errorMessage && (
        <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-xs text-rose-300">
          {errorMessage}
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-2xl border border-[#21212d] bg-[#0e0e14] p-12 text-center text-xs text-[#8e8e9f]">
          <RefreshCw className="h-6 w-6 animate-spin text-[#c5a059] mx-auto mb-2" />
          <span>Searching active campaign briefs...</span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && opportunities.length === 0 && (
        <div className="rounded-2xl border border-[#21212d] bg-[#0e0e14] p-12 text-center space-y-3">
          <Layers className="h-8 w-8 text-[#555569] mx-auto" />
          <h3 className="text-sm font-semibold text-white">No active campaign opportunities found</h3>
          <p className="text-xs text-[#7e7e92] max-w-sm mx-auto">
            Currently no advertisers have campaigns active in your eligible categories. Check back as new campaigns enter the matching phase.
          </p>
        </div>
      )}

      {/* Opportunities List */}
      {!isLoading && opportunities.length > 0 && (
        <div className="space-y-4">
          {opportunities.map((opp) => (
            <div
              key={opp.publicCampaignId}
              className="rounded-2xl border border-[#21212e] bg-[#0f0f16] p-5 sm:p-6 transition hover:border-[#353549] space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs font-semibold text-[#c5a059] bg-[#1a1a24] px-2 py-0.5 rounded">
                      {opp.publicCampaignId}
                    </span>
                    <span className="rounded bg-[#1a1a24] px-2 py-0.5 text-[11px] font-medium text-[#9d9db3]">
                      {opp.category}
                    </span>
                    <CapacityWarningBadge evaluation={opp.capacityEvaluation} compact />
                  </div>

                  <h3 className="text-lg font-display font-bold text-white pt-1">
                    {opp.name}
                  </h3>

                  <div className="text-xs text-[#8e8e9f]">
                    Objective: <span className="text-white font-medium">{opp.objective}</span>
                  </div>
                </div>

                <div className="text-left sm:text-right shrink-0">
                  <div className="text-xs text-[#78788a]">Required Volume</div>
                  <div className="text-lg font-bold font-mono text-white">
                    {opp.requiredQuantity.toLocaleString()} bottles
                  </div>
                  <div className="text-[11px] text-[#c5a059]">
                    {opp.bottleRequirements.volumeLabel || (opp.bottleRequirements.preferredVolumeMl ? `${opp.bottleRequirements.preferredVolumeMl} ml` : 'Standard')} &bull; {opp.expectedDuration.value} {opp.expectedDuration.unit.toLowerCase()}
                  </div>
                </div>
              </div>

              {/* Description / Objectives */}
              <p className="text-xs text-[#9d9db3] leading-relaxed">
                Seeking distribution placement across {opp.preferredVenueTypes.join(', ')} in {opp.preferredLocations.map(l => l.city).join(', ')}.
              </p>

              {/* Specifications Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg border border-[#1e1e2c] bg-[#14141e] p-2.5">
                  <span className="text-[10px] text-[#78788c] block">Bottle Spec</span>
                  <span className="font-medium text-white truncate block">
                    {opp.bottleRequirements.bottleType || opp.bottleRequirements.preferredMaterial || 'Custom Mold'}
                  </span>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#14141e] p-2.5">
                  <span className="text-[10px] text-[#78788c] block">Label & Finish</span>
                  <span className="font-medium text-white truncate block">
                    {opp.bottleRequirements.labelType || 'Full Wrap Label'}
                  </span>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#14141e] p-2.5">
                  <span className="text-[10px] text-[#78788c] block">Duration</span>
                  <span className="font-medium text-white block">
                    {opp.expectedDuration.value} {opp.expectedDuration.unit.toLowerCase()}
                  </span>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#14141e] p-2.5">
                  <span className="text-[10px] text-[#78788c] block">Placement Req.</span>
                  <span className="font-medium text-white block truncate">
                    {opp.placementRequirements.length > 0 ? opp.placementRequirements.join(', ') : 'Front Desk Concierge'}
                  </span>
                </div>
              </div>

              {/* Capacity Warning Card if Over Capacity */}
              {(opp.capacityEvaluation.status === 'OVER_CAPACITY' || opp.capacityEvaluation.isWarning) && (
                <CapacityWarningBadge evaluation={opp.capacityEvaluation} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
