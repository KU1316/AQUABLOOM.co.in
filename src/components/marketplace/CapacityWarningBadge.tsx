/**
 * AquaBloom Capacity Warning & Evaluation Component
 * 
 * Step 5: Capacity is a WARNING / DECISION threshold, NOT an automatic hard blocker.
 * If proposed quantity exceeds available venue capacity, this component shows the overage
 * clearly (e.g. required 20,000 vs available 6,000 = +14,000 / +233% overage warning)
 * rather than silently rejecting or hiding the venue.
 */

import React from 'react';
import { CapacityEvaluation } from '../../types.js';
import { CheckCircle2, AlertTriangle, Package, Warehouse, Info } from 'lucide-react';

interface CapacityWarningBadgeProps {
  evaluation?: CapacityEvaluation;
  compact?: boolean;
}

export const CapacityWarningBadge: React.FC<CapacityWarningBadgeProps> = ({ evaluation, compact = false }) => {
  if (!evaluation) {
    return null;
  }

  const {
    status,
    availableBottleCapacity,
    proposedCampaignQuantity,
    capacityOverage,
    isWarning,
    warningMessage,
  } = evaluation;

  const isOverCapacity = status === 'OVER_CAPACITY' || isWarning || capacityOverage > 0;
  const overagePercentage =
    availableBottleCapacity > 0 ? Math.round((capacityOverage / availableBottleCapacity) * 100) : 100;

  if (compact) {
    if (status === 'WITHIN_CAPACITY') {
      return (
        <span className="inline-flex items-center space-x-1 rounded-full border border-emerald-800/40 bg-emerald-950/30 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400">
          <CheckCircle2 className="h-3 w-3" />
          <span>Within Capacity ({availableBottleCapacity.toLocaleString()} Avail)</span>
        </span>
      );
    }

    return (
      <span className="inline-flex items-center space-x-1 rounded-full border border-amber-800/50 bg-amber-950/40 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
        <AlertTriangle className="h-3 w-3 text-amber-400" />
        <span>Capacity Warning: +{capacityOverage.toLocaleString()} ({overagePercentage}%)</span>
      </span>
    );
  }

  // Expanded card format
  return (
    <div
      className={`rounded-xl border p-4 text-xs transition ${
        status === 'WITHIN_CAPACITY'
          ? 'border-emerald-800/40 bg-emerald-950/20 text-emerald-300'
          : 'border-amber-800/50 bg-amber-950/25 text-amber-200'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center space-x-2">
          {status === 'WITHIN_CAPACITY' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          )}
          <span className="font-semibold text-white">
            {status === 'WITHIN_CAPACITY'
              ? 'Storage Capacity Verified'
              : 'Storage Capacity Warning (Decision Required)'}
          </span>
        </div>

        <span
          className={`rounded px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider ${
            status === 'WITHIN_CAPACITY'
              ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-700/40'
              : 'bg-amber-900/50 text-amber-300 border border-amber-700/50'
          }`}
        >
          {status === 'WITHIN_CAPACITY' ? 'Compliant' : 'Warning'}
        </span>
      </div>

      <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 border-y border-white/5 py-2 my-2 text-[11px]">
        <div>
          <span className="text-[#888899] block">Campaign Need</span>
          <span className="font-mono font-bold text-white">
            {proposedCampaignQuantity.toLocaleString()} bottles
          </span>
        </div>
        <div>
          <span className="text-[#888899] block">Available Storage</span>
          <span className="font-mono font-bold text-white">
            {availableBottleCapacity.toLocaleString()} bottles
          </span>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <span className="text-[#888899] block">Capacity Delta</span>
          {isOverCapacity ? (
            <span className="font-mono font-bold text-amber-400">
              +{capacityOverage.toLocaleString()} ({overagePercentage}%)
            </span>
          ) : (
            <span className="font-mono font-bold text-emerald-400">
              {(availableBottleCapacity - proposedCampaignQuantity).toLocaleString()} reserve
            </span>
          )}
        </div>
      </div>

      <p className="mt-1 text-[11px] leading-relaxed text-[#a0a0b2]">
        {warningMessage}
      </p>

      {isOverCapacity && (
        <div className="mt-2.5 rounded bg-black/40 p-2 text-[10px] text-[#8e8e9f] flex items-start space-x-1.5">
          <Info className="h-3.5 w-3.5 text-[#c5a059] shrink-0 mt-0.5" />
          <span>
            <strong className="text-white">Commercial Option:</strong> Staged phased deliveries or split distribution can fulfill this campaign. Viewing or selecting this venue does not create commitments.
          </span>
        </div>
      )}
    </div>
  );
};
