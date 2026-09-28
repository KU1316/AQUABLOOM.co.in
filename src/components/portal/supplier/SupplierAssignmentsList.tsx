/**
 * AquaBloom Step 9: Confirmed Supplier Assignments List View
 * 
 * Displays:
 * - Authoritative SupplierAssignment records belonging strictly to authenticated supplier
 * - Operational parameters: Bottle quantity, specifications, timeline, lead time, staging instructions
 * - Assignment status ("ASSIGNED")
 * - Next-stage indicator: "Awaiting Production Authorization"
 * - Clear notice: Production execution is authorized strictly following customer payment & Step 12 financial gate.
 */

import React, { useState } from 'react';
import { SupplierAssignment } from '../../../types.js';
import {
  CalendarCheck,
  Package,
  Clock,
  Calendar,
  Layers,
  FileCheck2,
  Lock,
  ArrowRight,
  ShieldCheck,
  Search,
  X,
  Truck,
} from 'lucide-react';

interface SupplierAssignmentsListProps {
  assignments: SupplierAssignment[];
  loading: boolean;
  onRefresh: () => void;
}

export const SupplierAssignmentsList: React.FC<SupplierAssignmentsListProps> = ({
  assignments,
  loading,
  onRefresh,
}) => {
  const [selectedAssignment, setSelectedAssignment] = useState<SupplierAssignment | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredAssignments = assignments.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.publicId.toLowerCase().includes(q) ||
      a.campaignAgreementPublicId.toLowerCase().includes(q) ||
      (a.productPublicId || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#21212d] pb-5">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <CalendarCheck className="h-4 w-4" />
            <span>Confirmed Production Commitments</span>
          </div>
          <h2 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white">
            My Production Assignments
          </h2>
          <p className="mt-1 text-xs text-[#8e8e9f]">
            Binding operational production assignments confirmed by your account. Review operational blueprints and packaging requirements.
          </p>
        </div>

        <span className="rounded-lg border border-[#232332] bg-[#121218] px-3.5 py-1.5 font-mono text-xs text-emerald-400 self-start sm:self-auto">
          Active Assignments: {assignments.length}
        </span>
      </div>

      {/* Production Notice Card */}
      <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 sm:p-5 flex items-start space-x-3 text-xs text-amber-200/90 leading-relaxed">
        <Lock className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-white font-semibold block mb-0.5">
            Operational Stage: Awaiting Production Authorization
          </strong>
          <span>
            Supplier assignment confirms your production capacity reservation. Physical production run initiation, batch tracking, and QC handoff are strictly gated until order pricing snapshot is finalized and customer payment is verified (Step 12 Financial Gate).
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assignments by ID or ref..."
            className="w-full rounded-xl border border-[#262634] bg-[#101017] pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#c5a059]"
          />
        </div>
      </div>

      {/* Assignments List */}
      {filteredAssignments.length === 0 ? (
        <div className="rounded-2xl border border-[#21212d] bg-[#0c0c12] p-12 text-center space-y-3">
          <Package className="h-10 w-10 text-[#555566] mx-auto mb-2" />
          <h3 className="text-sm font-bold text-white">No active supplier assignments</h3>
          <p className="text-xs text-[#838396] max-w-sm mx-auto">
            Once you accept an incoming operational offer, the confirmed assignment blueprint will appear here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssignments.map((assignment) => {
            const snapshot = assignment.lockedOfferSnapshot;
            const opReq = snapshot.operationalRequirementsSnapshot;

            return (
              <div
                key={assignment.id}
                onClick={() => setSelectedAssignment(assignment)}
                className="cursor-pointer rounded-xl border border-[#21212d] bg-[#0c0c13] p-5 hover:border-emerald-600/70 hover:bg-[#111119] transition group space-y-4 shadow-sm"
              >
                {/* Header: Assignment ID, Status, Contract Ref */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-emerald-400 group-hover:text-emerald-300">
                        {assignment.publicId}
                      </span>
                      <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                        {assignment.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#717182] font-mono mt-0.5 block">
                      Contract: {assignment.campaignAgreementPublicId}
                    </span>
                  </div>

                  <span className="rounded-full bg-amber-950/60 border border-amber-800/40 px-2.5 py-0.5 text-[10px] font-semibold text-amber-400 shrink-0">
                    Awaiting Auth
                  </span>
                </div>

                {/* Specs Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs border-y border-[#1c1c28] py-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Quantity</span>
                    <span className="font-mono text-base font-bold text-white">
                      {snapshot.bottleQuantity?.toLocaleString()} units
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Format &amp; Volume</span>
                    <span className="font-medium text-zinc-200">
                      {opReq?.productRequirements?.bottleType || 'Standard'} ({opReq?.productRequirements?.preferredVolumeMl || 500}ml)
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Production Lead Time</span>
                    <span className="text-zinc-300">
                      {snapshot.productionLeadTime.value} {snapshot.productionLeadTime.unit.toLowerCase()}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#69697a] block">Assigned Date</span>
                    <span className="text-zinc-300">
                      {new Date(assignment.assignedAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Footer: Value & Detail CTA */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-[#69697a] block uppercase font-bold">Authorized Value</span>
                    <span className="font-mono font-bold text-[#c5a059] text-sm">
                      ₹{snapshot.totalBottleAmount.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-emerald-400 group-hover:text-white transition">
                    <span>Inspect Blueprint</span>
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Assignment Detail Inspection Modal */}
      {selectedAssignment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl rounded-2xl border border-[#2a2a38] bg-[#0c0c12] shadow-2xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#21212d] bg-[#111118] px-6 py-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-emerald-400">{selectedAssignment.publicId}</span>
                  <span className="rounded px-2 py-0.5 text-[10px] font-bold uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-800/50">
                    {selectedAssignment.status}
                  </span>
                </div>
                <span className="text-[11px] text-[#7d7d90] mt-0.5 block">
                  Contract Agreement Ref: <strong className="font-mono text-zinc-300">{selectedAssignment.campaignAgreementPublicId}</strong>
                </span>
              </div>

              <button
                onClick={() => setSelectedAssignment(null)}
                className="rounded-lg p-1.5 text-zinc-400 hover:bg-[#1a1a24] hover:text-white transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto text-xs">
              {/* Next Stage Status Banner */}
              <div className="rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 space-y-1 text-amber-200">
                <div className="flex items-center space-x-2 font-bold text-white">
                  <Lock className="h-4 w-4 text-amber-400" />
                  <span>Next Stage: Awaiting Production Authorization</span>
                </div>
                <p className="text-[11px] text-zinc-300 leading-relaxed">
                  This assignment is locked into the order readiness pipeline. Production line start and batch labeling are authorized once customer payment is verified by the Step 12 financial gate engine.
                </p>
              </div>

              {/* Specifications Snapshot */}
              <div className="rounded-xl border border-[#21212d] bg-[#0f0f16] p-4 space-y-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059] block">
                  Locked Production Specifications
                </span>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#69697a] block">Target Volume</span>
                    <span className="font-mono text-base font-bold text-white">
                      {selectedAssignment.lockedOfferSnapshot.bottleQuantity.toLocaleString()} bottles
                    </span>
                  </div>

                  <div>
                    <span className="text-[#69697a] block">Unit Customer Price</span>
                    <span className="font-mono text-base font-bold text-[#c5a059]">
                      ₹{selectedAssignment.lockedOfferSnapshot.unitCustomerFacingPrice.amount.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#69697a] block">Lead Time</span>
                    <span className="text-zinc-200">
                      {selectedAssignment.lockedOfferSnapshot.productionLeadTime.value}{' '}
                      {selectedAssignment.lockedOfferSnapshot.productionLeadTime.unit.toLowerCase()}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#69697a] block">Assigned Timestamp</span>
                    <span className="text-zinc-200">
                      {new Date(selectedAssignment.assignedAt).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1c1c28] text-[11px] text-zinc-400">
                  <span className="font-semibold text-zinc-300 block mb-0.5">Packaging &amp; Staging Requirement:</span>
                  {selectedAssignment.lockedOfferSnapshot.operationalRequirementsSnapshot?.packagingAndStagingRequirements ||
                    'Standard palletized shrink-wrapped tray packaging.'}
                </div>
              </div>

              {/* Operational Reference IDs */}
              <div className="rounded-xl border border-[#1e1e28] bg-[#0a0a10] p-4 text-[11px] text-zinc-400 space-y-1.5 font-mono">
                <div>Order Readiness ID: <span className="text-zinc-200">{selectedAssignment.orderReadinessPublicId}</span></div>
                <div>Operational Offer ID: <span className="text-zinc-200">{selectedAssignment.supplierOperationalOfferPublicId}</span></div>
                <div>Product Version ID: <span className="text-zinc-200">{selectedAssignment.productPublicId} (v{selectedAssignment.productVersionNumber})</span></div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-[#21212d] bg-[#111118] px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedAssignment(null)}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#1e1e2a] hover:bg-[#282838] text-zinc-300 transition"
              >
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
