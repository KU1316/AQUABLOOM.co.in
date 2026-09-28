import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import {
  Proposal,
  ProposalVersion,
  AcceptProposalInput,
  CapacityEvaluation,
  CapacityOverageDecision,
  UserRole,
} from '../../types.js';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Warehouse,
  FileCheck2,
  Info,
  DollarSign,
} from 'lucide-react';

interface AcceptProposalModalProps {
  proposal: Proposal;
  activeVersion: ProposalVersion;
  capacityEvaluation?: CapacityEvaluation;
  userRole: UserRole;
  onClose: () => void;
  onSuccess: (result: { proposal: Proposal; isMutuallyConfirmed: boolean }) => void;
}

export const AcceptProposalModal: React.FC<AcceptProposalModalProps> = ({
  proposal,
  activeVersion,
  capacityEvaluation,
  userRole,
  onClose,
  onSuccess,
}) => {
  const isOverCapacity = capacityEvaluation?.isWarning;
  const isVenue = userRole === 'VENUE';

  const [capacityOverageDecision, setCapacityOverageDecision] =
    useState<'ACCEPT_OVERAGE' | 'DO_NOT_ACCEPT_OVERAGE'>('ACCEPT_OVERAGE');
  const [notes, setNotes] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const terms = activeVersion.terms;

  async function handleAccept(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: AcceptProposalInput = {
        expectedVersion: proposal.currentVersionNumber,
        capacityOverageDecision: isVenue && isOverCapacity ? capacityOverageDecision : undefined,
        notes: notes.trim() || undefined,
      };

      const res = await api.acceptProposal(proposal.id, payload);

      if (res.error) {
        setError(res.error.message || 'Failed to record acceptance.');
        setSubmitting(false);
        return;
      }

      if (res.data) {
        onSuccess(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-lg rounded-2xl border border-[#272738] bg-[#0c0c12] text-white shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="border-b border-[#1f1f2e] bg-[#12121c] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Step 6 &bull; Confirm Terms
              </div>
              <h3 className="text-base font-bold text-white">
                Accept Proposal {proposal.publicProposalId} (v{proposal.currentVersionNumber})
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#88889c] hover:bg-[#1f1f2e] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleAccept} className="p-6 space-y-5">
          {/* Summary Card */}
          <div className="rounded-xl border border-[#212130] bg-[#14141e] p-4 space-y-3 text-xs">
            <div className="font-semibold text-white">Confirmation Terms Snapshot</div>
            <div className="grid grid-cols-2 gap-2 text-[#9a9ab0]">
              <div>
                Campaign: <span className="text-white font-medium">{proposal.campaignName}</span>
              </div>
              <div>
                Quantity: <span className="text-white font-mono font-medium">{terms.campaignQuantity.toLocaleString()}</span> bottles
              </div>
              <div>
                Duration: <span className="text-white font-medium">{terms.campaignDuration.value} {terms.campaignDuration.unit.toLowerCase()}</span>
              </div>
              <div>
                Venue Share: <span className="text-emerald-400 font-mono font-medium">{terms.venueCompensationTerms.proposedPercentage ?? 0}%</span>
              </div>
            </div>
          </div>

          {/* Capacity Overage Decision (Required if venue & over capacity) */}
          {isVenue && isOverCapacity && (
            <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4 space-y-3 text-xs">
              <div className="flex items-center space-x-2 text-amber-300 font-semibold">
                <Warehouse className="h-4 w-4 shrink-0" />
                <span>Capacity Overage Decision Required</span>
              </div>
              <p className="text-[#a0a0b5] text-[11px]">
                The proposed quantity ({terms.campaignQuantity.toLocaleString()} bottles) exceeds your available holding capacity ({capacityEvaluation?.availableBottleCapacity.toLocaleString()} bottles). Please select whether you accept this overage or require renegotiation:
              </p>

              <select
                value={capacityOverageDecision}
                onChange={(e) => setCapacityOverageDecision(e.target.value as 'ACCEPT_OVERAGE' | 'DO_NOT_ACCEPT_OVERAGE')}
                className="w-full rounded-lg border border-amber-800/50 bg-[#161622] p-2 text-xs text-white focus:outline-none"
              >
                <option value="ACCEPT_OVERAGE">Accept Overage (Accommodate via temporary staging or staggered operational flows)</option>
                <option value="DO_NOT_ACCEPT_OVERAGE">Do Not Accept Overage (Submit counter-proposal with reduced quantity)</option>
              </select>
            </div>
          )}

          {/* Optional notes */}
          <div>
            <label className="block text-xs font-semibold text-[#a5a5bb] mb-1">
              Confirmation Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Confirmed with operations team; ready to proceed to Campaign Agreement."
              className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] p-3 text-xs text-white focus:border-[#c5a059] focus:outline-none"
            />
          </div>

          {/* Explanatory Note on Step 6 vs Step 7 */}
          <div className="rounded-xl bg-[#111118] border border-[#1e1e28] p-3 flex items-start gap-2.5 text-[11px] text-[#8e8e9f]">
            <Info className="h-4 w-4 text-[#c5a059] shrink-0 mt-0.5" />
            <div>
              Confirming terms records your approval of Version {proposal.currentVersionNumber}. When both Advertiser and Venue confirm, the proposal reaches <strong>READY FOR AGREEMENT</strong>. The formal Campaign Agreement and commercial binding will take place in Step 7.
            </div>
          </div>

          {/* Modal Actions */}
          <div className="border-t border-[#1f1f2e] pt-4 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-[#2e2e3e] bg-[#14141d] px-4 py-2 text-xs font-semibold text-[#c0c0d4] hover:bg-[#1a1a26] transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center space-x-2 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-bold text-black hover:bg-emerald-400 transition disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{submitting ? 'Confirming...' : 'Confirm & Accept Version'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
