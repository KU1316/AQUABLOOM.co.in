import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import {
  Campaign,
  MarketplaceVenue,
  CreateProposalInput,
  ProposalTerms,
  Proposal,
} from '../../types.js';
import {
  X,
  Send,
  AlertCircle,
  CheckCircle2,
  Building2,
  Megaphone,
  Layers,
  DollarSign,
  Calendar,
  Warehouse,
  FileText,
  Sparkles,
  Info,
} from 'lucide-react';

interface CreateProposalModalProps {
  venue: MarketplaceVenue;
  campaignId?: string;
  onClose: () => void;
  onSuccess: (proposal: Proposal) => void;
}

export const CreateProposalModal: React.FC<CreateProposalModalProps> = ({
  venue,
  campaignId: initialCampaignId,
  onClose,
  onSuccess,
}) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>(initialCampaignId || '');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Proposal terms form state
  const [campaignQuantity, setCampaignQuantity] = useState<number>(10000);
  const [durationWeeks, setDurationWeeks] = useState<number>(4);
  const [startWindowStart, setStartWindowStart] = useState<string>(
    new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  );
  const [startWindowEnd, setStartWindowEnd] = useState<string>(
    new Date(Date.now() + 44 * 86400000).toISOString().split('T')[0]
  );
  const [placementDetails, setPlacementDetails] = useState<string>(
    venue.placementPossibilities?.[0] || 'Main Entrance Concierge & Welcome Kiosk'
  );
  const [refrigerationRequired, setRefrigerationRequired] = useState<boolean>(true);
  const [venueSharePercentage, setVenueSharePercentage] = useState<number>(15);
  const [estimatedPerBottleCost, setEstimatedPerBottleCost] = useState<number>(25); // Estimated base bottle adv cost in INR
  const [customConditions, setCustomConditions] = useState<string>(
    `Bottles to be prominently staged in branded chillers near reception during peak business hours.`
  );
  const [expirationDays, setExpirationDays] = useState<number>(14);

  // Load advertiser campaigns
  useEffect(() => {
    async function loadCampaigns() {
      setLoading(true);
      try {
        const res = await api.getCampaigns();
        if (res.data) {
          // Filter to campaigns ready for matching or active
          const eligible = res.data.filter(
            (c) => c.status === 'MATCHING' || c.status === 'PROPOSAL_ACTIVE' || c.status === 'ACTIVE'
          );
          setCampaigns(eligible);

          if (initialCampaignId) {
            const found = res.data.find((c) => c.id === initialCampaignId || c.publicCampaignId === initialCampaignId);
            if (found) {
              setSelectedCampaignId(found.id);
              setSelectedCampaign(found);
              applyCampaignDefaults(found);
            }
          } else if (eligible.length > 0) {
            setSelectedCampaignId(eligible[0].id);
            setSelectedCampaign(eligible[0]);
            applyCampaignDefaults(eligible[0]);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load campaigns.');
      } finally {
        setLoading(false);
      }
    }
    loadCampaigns();
  }, [initialCampaignId]);

  function applyCampaignDefaults(camp: Campaign) {
    if (camp.bottleRequirements?.requiredQuantity) {
      setCampaignQuantity(camp.bottleRequirements.requiredQuantity);
    }
    if (camp.timing?.duration?.value) {
      setDurationWeeks(camp.timing.duration.value);
    }
    if (camp.timing?.preferredStartPeriod?.windowStart) {
      setStartWindowStart(camp.timing.preferredStartPeriod.windowStart);
    }
    if (camp.timing?.preferredStartPeriod?.windowEnd) {
      setStartWindowEnd(camp.timing.preferredStartPeriod.windowEnd);
    }
    if (camp.distributionRequirements?.placementDetails) {
      setPlacementDetails(camp.distributionRequirements.placementDetails);
    }
    if (camp.distributionRequirements?.refrigerationRequired !== undefined) {
      setRefrigerationRequired(camp.distributionRequirements.refrigerationRequired);
    }
  }

  function handleCampaignSelect(campId: string) {
    setSelectedCampaignId(campId);
    const camp = campaigns.find((c) => c.id === campId);
    if (camp) {
      setSelectedCampaign(camp);
      applyCampaignDefaults(camp);
    }
  }

  // Live calculations
  const holdingCapacity = venue.capacity?.maxBottleHoldingCapacity || 0;
  const currentOngoing = venue.capacity?.currentOngoingBottleCommitment || 0;
  const availableCapacity = Math.max(0, holdingCapacity - currentOngoing);
  const isOverCapacity = campaignQuantity > availableCapacity;
  const overageBottles = isOverCapacity ? campaignQuantity - availableCapacity : 0;

  // Venue compensation calculation (only from eligible supplier advertising cost)
  const estimatedTotalBottleAdvCost = campaignQuantity * estimatedPerBottleCost;
  const estimatedTotalPayoutAmount = (estimatedTotalBottleAdvCost * venueSharePercentage) / 100;
  const estimatedPerBottlePayoutAmount = (estimatedPerBottleCost * venueSharePercentage) / 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCampaign) {
      setError('Please select an active campaign to initiate this proposal.');
      return;
    }
    if (campaignQuantity <= 0) {
      setError('Campaign bottle quantity must be greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const expiresAt = new Date(Date.now() + expirationDays * 86400000).toISOString();

      const initialTerms: ProposalTerms = {
        campaignQuantity,
        campaignDuration: {
          value: durationWeeks,
          unit: 'WEEKS',
        },
        preferredStartPeriod: {
          label: `${startWindowStart} to ${startWindowEnd}`,
          windowStart: startWindowStart,
          windowEnd: startWindowEnd,
          notes: selectedCampaign.timing?.preferredStartPeriod?.notes || '',
        },
        distributionRequirements: {
          placementDetails,
          estimatedDistributionPace: `${Math.round(campaignQuantity / durationWeeks).toLocaleString()} bottles per week`,
          refrigerationRequired,
          handlingNotes: selectedCampaign.distributionRequirements?.handlingNotes || '',
        },
        placementRequirements: venue.placementPossibilities?.slice(0, 3) || [placementDetails],
        productRequirements: {
          preferredVolumeMl: selectedCampaign.bottleRequirements?.preferredVolumeMl || 500,
          volumeLabel: selectedCampaign.bottleRequirements?.volumeLabel || '500 ml Standard',
          preferredMaterial: selectedCampaign.bottleRequirements?.preferredMaterial || '100% rPET',
          labelType: selectedCampaign.bottleRequirements?.labelType || 'Full-Wrap Shrink Sleeve',
          capType: selectedCampaign.bottleRequirements?.capType || 'Screw Cap (Tamper-Evident)',
          notes: 'Standard enterprise botanical beverage execution',
        },
        collaborationRequirement: selectedCampaign.collaborationRequirement || {
          status: 'NOT_REQUIRED',
          preferredTerms: '',
          notes: '',
        },
        venueCompensationTerms: {
          proposedPercentage: venueSharePercentage,
          termsDescription: `${venueSharePercentage}% venue distribution compensation fee calculated from eligible supplier total bottle advertising cost (capped at 12.5%).`,
          notes: 'Step 6 does NOT lock final commercial settlement. Final commercial agreement executed in Step 7.',
        },
        customConditions,
      };

      const payload: CreateProposalInput = {
        campaignId: selectedCampaign.id,
        venueId: venue.id,
        initialTerms,
        expiresAt,
      };

      const res = await api.createProposal(payload);

      if (res.error) {
        setError(res.error.message || 'Failed to submit proposal.');
        setSubmitting(false);
        return;
      }

      if (res.data?.proposal) {
        onSuccess(res.data.proposal);
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred while creating the proposal.');
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#272738] bg-[#0c0c12] text-white shadow-2xl my-8 overflow-hidden">
        {/* Header */}
        <div className="border-b border-[#1f1f2e] bg-[#12121c] px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#c5a059]/10 border border-[#c5a059]/30 text-[#c5a059]">
              <Send className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059]">
                Step 6 &bull; Campaign Proposal Initiation
              </div>
              <h3 className="text-base font-bold text-white">
                Initiate Proposal to {venue.venueName}
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

        {/* Master Rules Reminder Banner */}
        <div className="bg-amber-950/20 border-b border-amber-900/30 px-6 py-2.5 flex items-center gap-2 text-xs text-amber-300">
          <Info className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            <strong>Master Rule:</strong> A proposal connects 1 Advertiser + 1 Venue + 1 Campaign. Initiating a proposal does <strong>NOT</strong> permanently consume venue capacity or create a binding commercial transaction until Step 7.
          </span>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-xl border border-rose-900/40 bg-rose-950/20 p-3.5 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Target Venue Context Card */}
          <div className="rounded-xl border border-[#212130] bg-[#14141e] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <Building2 className="h-5 w-5 text-[#c5a059]" />
              <div>
                <div className="font-semibold text-white">{venue.venueName}</div>
                <div className="text-[#848496]">
                  {venue.venueType} &bull; {venue.location.city}, {venue.location.country}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[10px] text-[#848496]">Available Holding</div>
                <div className="font-mono font-bold text-white">
                  {availableCapacity.toLocaleString()} bottles
                </div>
              </div>
              <span className="rounded bg-[#20202c] px-2.5 py-1 text-[11px] font-mono text-[#c5a059]">
                {venue.publicAccountId}
              </span>
            </div>
          </div>

          {/* Campaign Selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-[#a5a5bb] flex items-center space-x-1.5">
              <Megaphone className="h-3.5 w-3.5 text-[#c5a059]" />
              <span>Select Advertising Campaign *</span>
            </label>
            {loading ? (
              <div className="rounded-lg border border-[#232332] bg-[#121218] p-3 text-xs text-[#7d7d8e]">
                Loading campaigns...
              </div>
            ) : campaigns.length === 0 ? (
              <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-3 text-xs text-amber-300">
                No campaigns available. Create and validate a campaign in the Campaigns tab first.
              </div>
            ) : (
              <select
                value={selectedCampaignId}
                onChange={(e) => handleCampaignSelect(e.target.value)}
                className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] px-3.5 py-2.5 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              >
                {campaigns.map((camp) => (
                  <option key={camp.id} value={camp.id}>
                    {camp.name} ({camp.publicCampaignId}) &bull; {camp.category} &bull; Status: {camp.status}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Terms Section */}
          <div className="border-t border-[#1c1c28] pt-4 space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#c5a059] flex items-center space-x-1.5">
              <FileText className="h-3.5 w-3.5" />
              <span>Proposed Campaign Terms</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Bottle Quantity */}
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Proposed Bottle Quantity *
                </label>
                <input
                  type="number"
                  min="500"
                  step="500"
                  value={campaignQuantity}
                  onChange={(e) => setCampaignQuantity(parseInt(e.target.value, 10) || 0)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none font-mono"
                />
                {isOverCapacity && (
                  <div className="mt-1 text-[11px] text-amber-400 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    <span>Exceeds venue holding by {overageBottles.toLocaleString()} bottles (venue may accept via split shipments in Step 6).</span>
                  </div>
                )}
              </div>

              {/* Duration */}
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Campaign Duration (Weeks) *
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

              {/* Start Window */}
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Target Start Date
                </label>
                <input
                  type="date"
                  value={startWindowStart}
                  onChange={(e) => setStartWindowStart(e.target.value)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              {/* End Window */}
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Target End Date
                </label>
                <input
                  type="date"
                  value={startWindowEnd}
                  onChange={(e) => setStartWindowEnd(e.target.value)}
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>
            </div>

            {/* Placement & Handling */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[#a5a5bb] font-medium mb-1">
                  Placement Requirements
                </label>
                <input
                  type="text"
                  value={placementDetails}
                  onChange={(e) => setPlacementDetails(e.target.value)}
                  placeholder="e.g. Main Lobby Reception Kiosk"
                  className="w-full rounded-lg border border-[#2d2d3e] bg-[#14141f] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
                />
              </div>

              <div className="flex items-center space-x-2 pt-6">
                <input
                  type="checkbox"
                  id="refrigerationReq"
                  checked={refrigerationRequired}
                  onChange={(e) => setRefrigerationRequired(e.target.checked)}
                  className="rounded border-[#3a3a4d] bg-[#1a1a24] text-[#c5a059] focus:ring-0"
                />
                <label htmlFor="refrigerationReq" className="text-xs text-[#d1d1e0] cursor-pointer">
                  Refrigeration / Chilled Staging Required
                </label>
              </div>
            </div>

            {/* Venue Compensation Section */}
            <div className="rounded-xl border border-[#242436] bg-[#12121a] p-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center space-x-1.5">
                  <DollarSign className="h-4 w-4 text-[#c5a059]" />
                  <span>Venue Distribution Compensation Terms</span>
                </span>
                <span className="text-[10px] text-[#8e8e9f]">Calculated from eligible supplier cost</span>
              </div>

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
                      value={venueSharePercentage}
                      onChange={(e) => setVenueSharePercentage(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-lg border border-[#2d2d3e] bg-[#171722] px-3 py-2 text-xs text-white font-mono focus:border-[#c5a059] focus:outline-none"
                    />
                    <span className="ml-2 text-xs text-[#8e8e9f]">%</span>
                  </div>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#161622] p-2.5">
                  <div className="text-[10px] text-[#78788a]">Est. Per-Bottle Payout</div>
                  <div className="text-sm font-bold font-mono text-[#c5a059] mt-0.5">
                    ₹{estimatedPerBottlePayoutAmount.toFixed(2)}
                  </div>
                  <div className="text-[9px] text-[#5e5e6e]">Per distributed unit</div>
                </div>

                <div className="rounded-lg border border-[#1e1e2c] bg-[#161622] p-2.5">
                  <div className="text-[10px] text-[#78788a]">Est. Total Campaign Payout</div>
                  <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">
                    ₹{Math.round(estimatedTotalPayoutAmount).toLocaleString()}
                  </div>
                  <div className="text-[9px] text-[#5e5e6e]">Subject to Step 7 Agreement</div>
                </div>
              </div>
            </div>

            {/* Custom Conditions */}
            <div>
              <label className="block text-xs font-semibold text-[#a5a5bb] mb-1">
                Custom Terms & Special Operational Conditions
              </label>
              <textarea
                rows={2}
                value={customConditions}
                onChange={(e) => setCustomConditions(e.target.value)}
                placeholder="Any special handling, display positioning, or timing instructions..."
                className="w-full rounded-xl border border-[#2d2d3e] bg-[#14141f] p-3 text-xs text-white focus:border-[#c5a059] focus:outline-none"
              />
            </div>

            {/* Expiration Days */}
            <div className="flex items-center justify-between text-xs text-[#8e8e9f]">
              <span>Proposal Validity Window:</span>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={expirationDays}
                  onChange={(e) => setExpirationDays(parseInt(e.target.value, 10) || 14)}
                  className="w-16 rounded-lg border border-[#2d2d3e] bg-[#14141f] px-2 py-1 text-xs text-white font-mono text-center focus:border-[#c5a059] focus:outline-none"
                />
                <span>days (auto-expires if unconfirmed)</span>
              </div>
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
              disabled={submitting || !selectedCampaign}
              className="flex items-center space-x-2 rounded-lg bg-[#c5a059] px-5 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>{submitting ? 'Submitting Proposal...' : 'Submit Proposal to Venue'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
