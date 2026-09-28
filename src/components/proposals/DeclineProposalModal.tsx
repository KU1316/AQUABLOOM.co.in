import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { Proposal, DeclineReasonCode, DeclineProposalInput } from '../../types.js';
import { X, XCircle, AlertCircle } from 'lucide-react';

interface DeclineProposalModalProps {
  proposal: Proposal;
  onClose: () => void;
  onSuccess: (proposal: Proposal) => void;
}

export const DeclineProposalModal: React.FC<DeclineProposalModalProps> = ({
  proposal,
  onClose,
  onSuccess,
}) => {
  const [reasonCode, setReasonCode] = useState<DeclineReasonCode>('TERMS_NOT_ACCEPTABLE');
  const [explanation, setExplanation] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDecline(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: DeclineProposalInput = {
        expectedVersion: proposal.currentVersionNumber,
        reasonCode,
        explanation: explanation.trim() || undefined,
      };

      const res = await api.declineProposal(proposal.id, payload);

      if (res.error) {
        setError(res.error.message || 'Failed to decline proposal.');
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
      <div className="relative w-full max-w-md rounded-2xl border border-rose-900/40 bg-[#0c0c12] text-white shadow-2xl my-8 overflow-hidden">
        <div className="border-b border-rose-900/30 bg-rose-950/20 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400">
              <XCircle className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                Step 6 &bull; Decline Proposal
              </div>
              <h3 className="text-base font-bold text-white">
                Decline Proposal {proposal.publicProposalId}
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

        <form onSubmit={handleDecline} className="p-6 space-y-4 text-xs">
          <p className="text-[#a0a0b5] leading-relaxed">
            Declining closes further negotiation on this proposal. A structured reason code is recorded in the immutable timeline.
          </p>

          <div>
            <label className="block font-semibold text-[#c5c5dc] mb-1">
              Primary Reason for Declining *
            </label>
            <select
              value={reasonCode}
              onChange={(e) => setReasonCode(e.target.value as DeclineReasonCode)}
              className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] p-3 text-xs text-white focus:outline-none"
            >
              <option value="TERMS_NOT_ACCEPTABLE">Terms not acceptable</option>
              <option value="TIMING_NOT_SUITABLE">Timing not suitable</option>
              <option value="QUANTITY_NOT_SUITABLE">Quantity not suitable</option>
              <option value="CAPACITY_ISSUE">Capacity / storage limitation issue</option>
              <option value="CAMPAIGN_PREFERENCE_MISMATCH">Campaign preference / category mismatch</option>
              <option value="OTHER">Other operational reason</option>
            </select>
          </div>

          <div>
            <label className="block font-semibold text-[#c5c5dc] mb-1">
              Detailed Explanation (Optional)
            </label>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Provide context for the counterparty..."
              className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] p-3 text-xs text-white focus:border-[#c5a059] focus:outline-none"
            />
          </div>

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
              className="flex items-center space-x-2 rounded-lg bg-rose-600 px-5 py-2 text-xs font-bold text-white hover:bg-rose-500 transition disabled:opacity-50"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>{submitting ? 'Declining...' : 'Confirm Decline'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
