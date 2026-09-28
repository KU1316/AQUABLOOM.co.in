/**
 * AquaBloom Venue Portal — Storage Capacity & Commitments Overview
 * 
 * Step 5: Capacity management dashboard for Venue Coordinators.
 * Clarifies available holding space and proves that marketplace discovery
 * does not freeze or commit inventory.
 */

import React, { useState, useEffect } from 'react';
import { VenueCapacityOverview } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  Warehouse,
  ShieldCheck,
  Package,
  Layers,
  Info,
  Clock,
  CheckCircle2,
  RefreshCw,
  FileCheck,
} from 'lucide-react';

export const VenueCapacityDashboard: React.FC = () => {
  const [overview, setOverview] = useState<VenueCapacityOverview | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchCapacity = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getVenueCapacity();
      if (res.error) {
        setErrorMessage(res.error.message);
      } else if (res.data) {
        setOverview(res.data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load venue capacity overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCapacity();
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#21212d] bg-[#0e0e14] p-12 text-center text-xs text-[#8e8e9f]">
        <RefreshCw className="h-6 w-6 animate-spin text-[#c5a059] mx-auto mb-2" />
        <span>Loading storage capacity telemetry...</span>
      </div>
    );
  }

  if (errorMessage || !overview) {
    return (
      <div className="rounded-xl border border-rose-800/50 bg-rose-950/30 p-4 text-xs text-rose-300">
        {errorMessage || 'Unable to retrieve venue capacity profile.'}
      </div>
    );
  }

  const { maxBottleHoldingCapacity, currentOngoingBottleCommitment, availableBottleCapacity } = overview;
  const utilizationPercent =
    maxBottleHoldingCapacity > 0
      ? Math.round((currentOngoingBottleCommitment / maxBottleHoldingCapacity) * 100)
      : 0;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-[#272738] bg-[#101017] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Warehouse className="h-4 w-4" />
              <span>Operational Facility Telemetry &bull; Step 5</span>
            </div>
            <h2 className="mt-1 text-xl font-display font-bold text-white sm:text-2xl">
              Venue Storage Capacity & Commitments
            </h2>
            <p className="mt-1 text-xs text-[#8e8e9f]">
              Property: <span className="text-white font-medium">{overview.venueName}</span> ({overview.publicAccountId})
            </p>
          </div>

          <button
            onClick={fetchCapacity}
            className="flex items-center space-x-2 rounded-xl border border-[#2b2b3d] bg-[#161622] px-3.5 py-2 text-xs text-[#9d9db3] hover:text-white transition self-start sm:self-auto"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh Telemetry</span>
          </button>
        </div>
      </div>

      {/* Storage Capacity Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#232332] bg-[#111118] p-5">
          <div className="text-xs font-medium text-[#848496]">Max Physical Capacity</div>
          <div className="mt-2 text-3xl font-display font-bold font-mono text-white">
            {maxBottleHoldingCapacity.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#69697a]">
            Total physical bottle staging capacity
          </div>
        </div>

        <div className="rounded-2xl border border-[#232332] bg-[#111118] p-5">
          <div className="text-xs font-medium text-[#848496]">Committed Inventory</div>
          <div className="mt-2 text-3xl font-display font-bold font-mono text-[#a0a0b8]">
            {currentOngoingBottleCommitment.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#69697a]">
            {overview.activeCommitmentCount} active formal Campaign Agreements
          </div>
        </div>

        <div className="rounded-2xl border border-[#c5a059]/40 bg-[#161622] p-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#c5a059]">
            Available Storage Space
          </div>
          <div className="mt-2 text-3xl font-display font-bold font-mono text-[#d4af37]">
            {availableBottleCapacity.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-[#a0a0b8]">
            Instant uncommitted storage for active campaigns
          </div>
        </div>
      </div>

      {/* Utilization Bar */}
      <div className="rounded-2xl border border-[#21212e] bg-[#101017] p-5 space-y-3">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-white">Storage Facility Utilization</span>
          <span className="font-mono text-[#c5a059] font-bold">{utilizationPercent}% Allocated</span>
        </div>
        <div className="w-full bg-[#1b1b26] h-3 rounded-full overflow-hidden">
          <div
            className="bg-gradient-to-r from-[#c5a059] to-[#d4af37] h-full rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, utilizationPercent)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-[#717185]">
          <span>0 bottles</span>
          <span>{maxBottleHoldingCapacity.toLocaleString()} bottles max</span>
        </div>
      </div>

      {/* Master Consistency Safeguard Card */}
      <div className="rounded-2xl border border-[#21212e] bg-[#0c0c12] p-5 space-y-3">
        <div className="flex items-center space-x-2 text-xs font-semibold text-white">
          <ShieldCheck className="h-4 w-4 text-[#c5a059]" />
          <span>Capacity Reservation Invariant (Master Consistency Rule)</span>
        </div>
        <p className="text-xs leading-relaxed text-[#9d9db3]">
          {overview.operationalNotes}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
          <div className="rounded-lg border border-[#1b1b26] bg-[#121218] p-3 text-[#9d9db3]">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mb-1" />
            <span className="font-medium text-white block">Marketplace Browsing</span>
            <span className="text-[11px] text-[#78788a]">Zero capacity reserved. Advertisers can explore and score without impacting your floor.</span>
          </div>

          <div className="rounded-lg border border-[#1b1b26] bg-[#121218] p-3 text-[#9d9db3]">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mb-1" />
            <span className="font-medium text-white block">Capacity Warnings</span>
            <span className="text-[11px] text-[#78788a]">If a campaign needs more bottles than your available space, advertisers see an informative warning, never a hidden rejection.</span>
          </div>

          <div className="rounded-lg border border-[#1b1b26] bg-[#121218] p-3 text-[#9d9db3]">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 mb-1" />
            <span className="font-medium text-white block">Commercial Agreements</span>
            <span className="text-[11px] text-[#78788a]">Only formalized, signed Campaign Agreements in future transaction phases lock capacity.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
