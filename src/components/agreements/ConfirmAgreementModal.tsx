import React, { useState } from 'react';
import { CampaignAgreementSharedView } from '../../types.js';
import { api } from '../../lib/api.js';
import { ShieldCheck, AlertCircle, CheckCircle2, Lock, X } from 'lucide-react';

interface Props {
  agreement: CampaignAgreementSharedView;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (updated: any) => void;
}

export const ConfirmAgreementModal: React.FC<Props> = ({
  agreement,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [acknowledged, setAcknowledged] = useState(false);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!acknowledged) {
      setError('You must acknowledge the commercial lock conditions before confirming.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.confirmCampaignAgreement(agreement.agreementId, {
        expectedVersion: agreement.currentVersionNumber,
        acknowledgement: true,
        notes: notes.trim() || undefined,
        idempotencyKey: `cnf_${agreement.agreementId}_v${agreement.currentVersionNumber}_${Date.now()}`,
      });

      if (res.error) {
        throw new Error(res.error.message || 'Failed to confirm Campaign Agreement.');
      }

      onSuccess(res.data?.agreement);
      onClose();
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during confirmation.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-xl rounded-xl border border-[#2d2d3d] bg-[#12121a] shadow-2xl overflow-hidden text-white my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21212f] px-6 py-4 bg-[#181824]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#c5a059]/10 text-[#c5a059] border border-[#c5a059]/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Confirm Campaign Agreement</h2>
              <p className="text-xs text-[#9d9db3] font-mono">{agreement.publicId}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleConfirm} className="p-6 space-y-5">
          {error && (
            <div className="rounded-lg border border-rose-800/60 bg-rose-950/40 p-3.5 text-xs text-rose-300 flex items-start space-x-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Agreement summary pill */}
          <div className="rounded-lg border border-[#272738] bg-[#0d0d14] p-4 space-y-2 text-xs">
            <div className="flex justify-between items-center text-[#9d9db3]">
              <span>Campaign:</span>
              <span className="font-semibold text-white">{agreement.campaign.name}</span>
            </div>
            <div className="flex justify-between items-center text-[#9d9db3]">
              <span>Counterparty:</span>
              <span className="font-semibold text-[#c5a059]">{agreement.counterparty.name}</span>
            </div>
            <div className="flex justify-between items-center text-[#9d9db3]">
              <span>Agreed Quantity:</span>
              <span className="font-semibold text-white font-mono">
                {agreement.terms.campaignQuantity.toLocaleString()} bottles
              </span>
            </div>
            <div className="flex justify-between items-center text-[#9d9db3]">
              <span>Campaign Duration:</span>
              <span className="font-semibold text-white">
                {agreement.terms.campaignDuration?.value || 4} {agreement.terms.campaignDuration?.unit?.toLowerCase() || 'weeks'}
              </span>
            </div>
          </div>

          {/* Commercial Lock Notice */}
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 p-4 space-y-2">
            <div className="flex items-center space-x-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Lock className="w-3.5 h-3.5" />
              <span>Commercial Lock Warning</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Once both parties confirm this agreement and it transitions to <strong>LOCKED</strong>, normal commercial
              amendments, quantities, dates, and venue allocations are permanently sealed.
            </p>
            <p className="text-xs text-amber-200/90 leading-relaxed">
              Cancellation is permitted <strong>strictly before manufacturing production starts</strong>. Once supplier
              production commences, cancellations are non-recoverable.
            </p>
          </div>

          {/* Acknowledgement Checkbox */}
          <label className="flex items-start space-x-3 cursor-pointer p-3 rounded-lg border border-[#2d2d3e] bg-[#161622] hover:border-[#3e3e55] transition">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-[#c5a059] focus:ring-[#c5a059]"
            />
            <span className="text-xs text-zinc-300 leading-relaxed font-medium">
              I confirm that I have reviewed the Campaign Agreement and understand that once both parties confirm and the agreement is locked, normal commercial amendments are not permitted.
            </span>
          </label>

          {/* Optional Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#9d9db3] mb-1">
              Confirmation Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Authorized by brand director, packaging vector proofs approved."
              rows={2}
              className="w-full rounded-lg border border-[#272738] bg-[#0d0d14] px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-[#c5a059] focus:outline-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-[#21212f]">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!acknowledged || loading}
              className={`flex items-center space-x-2 rounded-lg px-5 py-2 text-xs font-bold transition ${
                acknowledged && !loading
                  ? 'bg-[#c5a059] text-black hover:bg-[#d8b26e]'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{loading ? 'Submitting...' : 'Sign & Submit Confirmation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
