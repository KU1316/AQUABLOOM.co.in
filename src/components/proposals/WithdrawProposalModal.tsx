import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { Proposal, WithdrawProposalInput } from '../../types.js';
import { X, RotateCcw, AlertCircle } from 'lucide-react';

interface WithdrawProposalModalProps {
  proposal: Proposal;
  onClose: () => void;
  onSuccess: (proposal: Proposal) => void;
}

export const WithdrawProposalModal: React.FC<WithdrawProposalModalProps> = ({
  proposal,
  onClose,
  onSuccess,
}) => {
  const [explanation, setExplanation] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload: WithdrawProposalInput = {
        expectedVersion: proposal.currentVersionNumber,
        explanation: explanation.trim() || undefined,
      };

      const res = await api.withdrawProposal(proposal.id, payload);

      if (res.error) {
        setError(res.error.message || 'Failed to withdraw proposal.');
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
      <div className="relative w-full max-w-md rounded-2xl border border-[#2e2e3f] bg-[#0c0c12] text-white shadow-2xl my-8 overflow-hidden">
        <div className="border-b border-[#1f1f2e] bg-[#12121c] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300">
              <RotateCcw className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                Step 6 &bull; Withdraw Proposal
              </div>
              <h3 className="text-base font-bold text-white">
                Withdraw Proposal {proposal.publicProposalId}
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

        <form onSubmit={handleWithdraw} className="p-6 space-y-4 text-xs">
          <p className="text-[#a0a0b5] leading-relaxed">
            Withdrawing permanently stops the negotiation for this proposal. The venue will no longer be able to accept or counter.
          </p>

          <div>
            <label className="block font-semibold text-[#c5c5dc] mb-1">
              Reason / Note for Withdrawal (Optional)
            </label>
            <textarea
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="e.g., Campaign timing updated or alternative venue selected."
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
              className="flex items-center space-x-2 rounded-lg bg-zinc-700 px-5 py-2 text-xs font-bold text-white hover:bg-zinc-600 transition disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>{submitting ? 'Withdrawing...' : 'Confirm Withdrawal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
