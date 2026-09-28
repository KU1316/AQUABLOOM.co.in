import React, { useState } from 'react';
import { api } from '../../lib/api.js';
import { Proposal, ProposalVersion, CounterProposalInput } from '../../types.js';
import {
  X,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Calendar,
  Layers,
  FileText,
  Info,
} from 'lucide-react';

interface CounterProposalModalProps {
  proposal: Proposal;
  activeVersion: ProposalVersion;
  onClose: () => void;
  onSuccess: (updated: { proposal: Proposal; version: ProposalVersion }) => void;
}

export const CounterProposalModal: React.FC<CounterProposalModalProps> = ({
  proposal,
  activeVersion,
  onClose,
  onSuccess,
}) => {
  const currentTerms = activeVersion.terms;

  const [changeSummary, setChangeSummary] = useState<string>('');
  const [campaignQuantity, setCampaignQuantity] = useState<number>(currentTerms.campaignQuantity);
  const [durationWeeks, setDurationWeeks] = useState<number>(currentTerms.campaignDuration.value);
  const [startWindowStart, setStartWindowStart] = useState<string>(
    currentTerms.preferredStartPeriod.windowStart || ''
  );
  const [startWindowEnd, setStartWindowEnd] = useState<string>(
    currentTerms.preferredStartPeriod.windowEnd || ''
  );
  const [placementDetails, setPlacementDetails] = useState<string>(
    currentTerms.distributionRequirements.placementDetails || ''
  );
  const [refrigerationRequired, setRefrigerationRequired] = useState<boolean>(
    !!currentTerms.distributionRequirements.refrigerationRequired
  );
  const [proposedPercentage, setProposedPercentage] = useState<number>(
    currentTerms.venueCompensationTerms.proposedPercentage ?? 10
  );
  const [customConditions, setCustomConditions] = useState<string>(
    currentTerms.customConditions || ''
  );

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Live estimated compensation calculation (capped at 12.5%)
  const estimatedPerBottleAdvCost = 25; // in INR
  const estimatedTotalBottleAdvCost = campaignQuantity * estimatedPerBottleAdvCost;
  const estimatedTotalPayout = (estimatedTotalBottleAdvCost * proposedPercentage) / 100;
  const estimatedPerBottlePayout = (estimatedPerBottleAdvCost * proposedPercentage) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!changeSummary.trim()) {
      setError('A concise change summary is required to submit a counter-proposal.');
      return;
    }
    if (campaignQuantity <= 0) {
      setError('Bottle quantity must be a positive integer.');
      return;
    }
    if (proposedPercentage > 12.5) {
      setError('Venue compensation percentage cannot exceed the platform cap of 12.5%.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: CounterProposalInput = {
        expectedVersion: proposal.currentVersionNumber,
        changeSummary: changeSummary.trim(),
        terms: {
          campaignQuantity,
          campaignDuration: {
            value: durationWeeks,
            unit: 'WEEKS',
          },
          preferredStartPeriod: {
            ...currentTerms.preferredStartPeriod,
            windowStart: startWindowStart,
            windowEnd: startWindowEnd,
          },
          distributionRequirements: {
            ...currentTerms.distributionRequirements,
            placementDetails,
            estimatedDistributionPace: `${Math.round(campaignQuantity / durationWeeks).toLocaleString()} bottles per week`,
            refrigerationRequired,
          },
          placementRequirements: [placementDetails],
          venueCompensationTerms: {
            ...currentTerms.venueCompensationTerms,
            proposedPercentage,
            termsDescription: `${proposedPercentage}% venue compensation of eligible supplier advertising cost (max 12.5%).`,
            notes: 'Calculated from eligible supplier advertising cost basis.',
          },
          customConditions,
        },
      };

      const res = await api.counterProposal(proposal.id, payload);

      if (res.error) {
        setError(res.error.message || 'Failed to submit counter-proposal.');
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
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#29293a] bg-[#0c0c12] text-white shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="border-b border-[#1f1f2e] bg-[#12121c] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <MessageSquare className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Step 6 &bull; Counter-Proposal
              </div>
              <h3 className="text-base font-bold text-white">
                Submit Counter-Proposal &bull; {proposal.publicProposalId} (v{proposal.currentVersionNumber + 1})
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

        {/* Informational Banner */}
        <div className="bg-[#12121b] border-b border-[#20202e] px-6 py-2.5 flex items-center gap-2 text-xs text-[#a0a0b8]">
          <Info className="h-4 w-4 shrink-0 text-[#c5a059]" />
          <span>
            Negotiating creates an immutable new <strong>Version {proposal.currentVersionNumber + 1}</strong>. Historical versions remain preserved and mutual confirmation is reset.
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Required Change Summary */}
          <div>
            <label className="block text-xs font-semibold text-amber-300 mb-1">
              Summary of Proposed Changes *
            </label>
            <textarea
              rows={2}
              required
              value={changeSummary}
              onChange={(e) => setChangeSummary(e.target.value)}
              placeholder="e.g., Adjusted bottle quantity to fit venue storage and requested 18% venue revenue share."
              className="w-full rounded-xl border border-amber-800/40 bg-[#161622] p-3 text-xs text-white focus:border-amber-400 focus:outline-none"
            />
          </div>

          {/* Terms Form */}
          <div className="border-t border-[#1e1e2c] pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Proposed Bottle Quantity
                </label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={campaignQuantity}
                  onChange={(e) => setCampaignQuantity(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Campaign Duration (Weeks)
                </label>
                <input
                  type="number"
                  min="1"
                  max="52"
                  value={durationWeeks}
                  onChange={(e) => setDurationWeeks(parseInt(e.target.value, 10) || 1)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Target Start Window
                </label>
                <input
                  type="date"
                  value={startWindowStart}
                  onChange={(e) => setStartWindowStart(e.target.value)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Target End Window
                </label>
                <input
                  type="date"
                  value={startWindowEnd}
                  onChange={(e) => setStartWindowEnd(e.target.value)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[#a5a5bb] font-medium mb-1 text-xs">
                Placement Requirements
              </label>
              <input
                type="text"
                value={placementDetails}
                onChange={(e) => setPlacementDetails(e.target.value)}
                className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            {/* Venue Revenue Share */}
            <div className="rounded-xl border border-[#242436] bg-[#12121a] p-4 space-y-3 text-xs">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <DollarSign className="h-4 w-4 text-[#c5a059]" />
                <span>Venue Distribution Share</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] text-[#9393a8] block mb-1">
                    Venue Compensation % (Max 12.5%)
                  </label>
                  <div className="flex items-center">
                    <input
                      type="number"
                      min="1"
                      max="12.5"
                      step="0.5"
                      value={proposedPercentage}
                      onChange={(e) => setProposedPercentage(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-[#2d2d3e] bg-[#171722] px-3 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                    />
                    <span className="ml-2 text-xs text-[#8e8e9f]">%</span>
                  </div>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#161622] p-2.5">
                  <div className="text-[10px] text-[#78788a]">Est. Per-Bottle Payout</div>
                  <div className="text-sm font-bold font-mono text-[#c5a059] mt-0.5">
                    ₹{estimatedPerBottlePayout.toFixed(2)}
                  </div>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#161622] p-2.5">
                  <div className="text-[10px] text-[#78788a]">Est. Total Payout</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    ₹{Math.round(estimatedTotalPayout).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom Conditions */}
            <div>
              <label className="block text-xs font-semibold text-[#a5a5bb] mb-1">
                Custom Terms & Notes
              </label>
              <textarea
                rows={2}
                value={customConditions}
                onChange={(e) => setCustomConditions(e.target.value)}
                className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] p-3 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
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
              disabled={submitting || !changeSummary.trim()}
              className="flex items-center space-x-2 rounded-lg bg-amber-500 px-5 py-2 text-xs font-bold text-black hover:bg-amber-400 transition disabled:opacity-50"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>{submitting ? 'Submitting...' : 'Submit Counter-Proposal'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
