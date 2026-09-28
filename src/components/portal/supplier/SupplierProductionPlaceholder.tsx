/**
 * AquaBloom Step 9: Supplier Production Operations Terminal Placeholder
 * 
 * Clean upcoming-state view for Step 13 integration.
 * Strictly avoids implementing Step 13 actions (production start, QC, dispatch)
 * while clearly presenting the operational gating condition (Step 12 financial gate).
 */

import React from 'react';
import { Factory, Lock, ShieldCheck, ArrowRight, Clock, AlertCircle } from 'lucide-react';

interface SupplierProductionPlaceholderProps {
  onViewAssignments: () => void;
}

export const SupplierProductionPlaceholder: React.FC<SupplierProductionPlaceholderProps> = ({
  onViewAssignments,
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-[#21212d] pb-5">
        <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
          <Factory className="h-4 w-4" />
          <span>Physical Manufacturing Stage &bull; Step 13 Preview</span>
        </div>
        <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">
          Production Run Operations
        </h2>
        <p className="mt-1 text-xs text-[#8e8e9f]">
          Work order execution, batch line tracking, direct screen printing QC, and dispatch handoff.
        </p>
      </div>

      {/* Main Empty State & Gate Notice */}
      <div className="rounded-2xl border border-[#232332] bg-[#0c0c12] p-8 sm:p-12 text-center max-w-2xl mx-auto space-y-5 shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-amber-800/40 bg-amber-950/30 text-amber-400">
          <Lock className="h-8 w-8" />
        </div>

        <div className="space-y-2">
          <h3 className="font-display text-lg font-bold text-white">
            No Production Orders Authorized Yet
          </h3>
          <p className="text-xs text-[#9595a8] leading-relaxed max-w-md mx-auto">
            Physical bottling runs require confirmed Step 12 customer payment and authoritative fulfillment gate authorization.
            Production batch tracking, line scheduling, and quality assurance logs will unlock here once an order enters active fulfillment.
          </p>
        </div>

        <div className="rounded-xl border border-[#1f1f2c] bg-[#12121a] p-4 text-left text-xs space-y-2 max-w-lg mx-auto">
          <div className="text-[11px] font-bold uppercase text-[#c5a059] flex items-center space-x-1.5">
            <ShieldCheck className="h-4 w-4 text-[#c5a059]" />
            <span>Production Gating Workflow:</span>
          </div>
          <ol className="space-y-1.5 text-zinc-300 text-[11px] list-decimal list-inside">
            <li>Supplier accepts operational offer (Step 9 confirmed).</li>
            <li>Logistics partner assigned (Step 10 confirmed).</li>
            <li>Customer final pricing calculated (Step 11 locked).</li>
            <li>Customer payment verified on authoritative ledger (Step 12 hard financial gate).</li>
            <li>Production work order unlocks automatically for manufacturing.</li>
          </ol>
        </div>

        <div className="pt-2">
          <button
            onClick={onViewAssignments}
            className="inline-flex items-center space-x-2 rounded-xl bg-[#c5a059] hover:bg-[#d4af37] px-5 py-2.5 text-xs font-bold text-black transition"
          >
            <span>Review Current Supplier Assignments</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
