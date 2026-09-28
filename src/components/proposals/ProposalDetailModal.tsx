import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import {
  Proposal,
  ProposalVersion,
  ProposalDetailView,
  UserRole,
} from '../../types.js';
import { ProposalStatusBadge } from './ProposalStatusBadge.js';
import { CounterProposalModal } from './CounterProposalModal.js';
import { AcceptProposalModal } from './AcceptProposalModal.js';
import { DeclineProposalModal } from './DeclineProposalModal.js';
import { WithdrawProposalModal } from './WithdrawProposalModal.js';
import { AgreementDetailModal } from '../agreements/AgreementDetailModal.js';
import {
  X,
  Building2,
  Megaphone,
  Layers,
  Calendar,
  DollarSign,
  Warehouse,
  FileCheck2,
  Clock,
  History,
  MessageSquare,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertTriangle,
  Info,
  ChevronRight,
  ShieldCheck,
  Package,
  Lock,
} from 'lucide-react';

interface ProposalDetailModalProps {
  proposalId: string;
  currentUserRole: UserRole;
  currentUserId: string;
  onClose: () => void;
  onProposalUpdated?: () => void;
}

export const ProposalDetailModal: React.FC<ProposalDetailModalProps> = ({
  proposalId,
  currentUserRole,
  currentUserId,
  onClose,
  onProposalUpdated,
}) => {
  const [detail, setDetail] = useState<ProposalDetailView | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Version browser state
  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null);

  // Sub-modal triggers
  const [showCounterModal, setShowCounterModal] = useState<boolean>(false);
  const [showAcceptModal, setShowAcceptModal] = useState<boolean>(false);
  const [showDeclineModal, setShowDeclineModal] = useState<boolean>(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState<boolean>(false);
  const [agreementModalId, setAgreementModalId] = useState<string | null>(null);
  const [agreementLoading, setAgreementLoading] = useState<boolean>(false);

  const handleOpenOrCreateAgreement = async () => {
    if (!detail?.proposal) return;
    setAgreementLoading(true);
    try {
      const res = await api.createCampaignAgreement({
        sourceProposalId: detail.proposal.id,
        idempotencyKey: `agr_init_${detail.proposal.id}`,
      });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to initialize Campaign Agreement.');
      }
      setAgreementModalId(res.data?.id || res.data?.agreementId || null);
    } catch (err: any) {
      alert(err.message || 'Error creating agreement.');
    } finally {
      setAgreementLoading(false);
    }
  };

  useEffect(() => {
    loadProposal();
  }, [proposalId]);

  async function loadProposal() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProposalDetail(proposalId);
      if (res.error) {
        setError(res.error.message || 'Failed to load proposal details.');
      } else if (res.data) {
        setDetail(res.data);
        setSelectedVersionNumber(res.data.proposal.currentVersionNumber);

        // If venue recipient and proposal is still in SENT status, mark as VIEWED
        if (
          currentUserRole === 'VENUE' &&
          res.data.proposal.status === 'SENT' &&
          res.data.proposal.venueId === currentUserId
        ) {
          api.markProposalViewed(proposalId).then((viewRes) => {
            if (viewRes.data) {
              setDetail((prev) =>
                prev
                  ? {
                      ...prev,
                      proposal: viewRes.data!,
                    }
                  : null
              );
            }
          });
        }
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred while loading proposal.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="rounded-2xl border border-[#232332] bg-[#0c0c12] p-8 text-center text-xs text-[#8e8e9f]">
          Loading proposal negotiation workspace...
        </div>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="rounded-2xl border border-rose-900/40 bg-[#0c0c12] p-6 max-w-md w-full text-center space-y-4">
          <div className="text-rose-400 font-semibold text-sm">Error Loading Proposal</div>
          <p className="text-xs text-[#9a9ab0]">{error || 'Proposal not found or access denied.'}</p>
          <button
            onClick={onClose}
            className="rounded-lg bg-[#1f1f2e] px-4 py-2 text-xs text-white hover:bg-[#28283c]"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const { proposal, activeVersion, versions, timeline, capacityEvaluation, permissions } = detail;

  // Selected version for display (defaults to active version)
  const displayedVersion =
    versions.find((v) => v.versionNumber === selectedVersionNumber) || activeVersion;
  const isViewingHistorical = displayedVersion.versionNumber !== proposal.currentVersionNumber;

  const terms = displayedVersion.terms;

  // Mutual confirmation state
  const isAdvertiserConfirmed = !!proposal.advertiserConfirmedAt;
  const isVenueConfirmed = !!proposal.venueConfirmedAt;
  const isMutuallyConfirmed = proposal.status === 'READY_FOR_AGREEMENT';

  function handleActionSuccess(updatedProposal: Proposal) {
    setShowCounterModal(false);
    setShowAcceptModal(false);
    setShowDeclineModal(false);
    setShowWithdrawModal(false);
    loadProposal();
    if (onProposalUpdated) {
      onProposalUpdated();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl border border-[#272738] bg-[#0a0a0f] text-white shadow-2xl my-4 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Top Header */}
        <div className="border-b border-[#1f1f2e] bg-[#101018] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5a059]/10 border border-[#c5a059]/30 text-[#c5a059]">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono text-sm font-bold text-white tracking-wide">
                  {proposal.publicProposalId}
                </span>
                <span className="rounded bg-[#1e1e2c] border border-[#2d2d3e] px-2 py-0.5 text-[10px] font-mono text-[#c5a059]">
                  v{proposal.currentVersionNumber} Active
                </span>
                <ProposalStatusBadge status={proposal.status} />
              </div>
              <p className="text-xs text-[#8e8e9f] mt-0.5">
                Campaign: <span className="text-white font-medium">{proposal.campaignName}</span> ({proposal.publicCampaignId})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#88889c] hover:bg-[#1f1f2e] hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Mutual Confirmation Banner or Milestone */}
        {isMutuallyConfirmed ? (
          <div className="bg-emerald-950/40 border-b border-emerald-500/40 px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-300">
            <div className="flex items-center space-x-2.5">
              <FileCheck2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <span className="font-bold text-emerald-200">
                  Mutual Confirmation Complete &bull; Proposal Finalized
                </span>
                <p className="text-[11px] text-emerald-400/90 mt-0.5">
                  Both Advertiser ({proposal.advertiserBrandName}) and Venue ({proposal.venueName}) have confirmed Version {proposal.currentVersionNumber}.
                  Campaign Agreement is ready for formal review & commercial locking.
                </p>
              </div>
            </div>
            <button
              onClick={handleOpenOrCreateAgreement}
              disabled={agreementLoading}
              className="flex items-center space-x-1.5 rounded-lg bg-[#c5a059] px-3.5 py-1.5 text-xs font-bold text-black hover:bg-[#d8b26e] transition shrink-0 self-start sm:self-auto"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>{agreementLoading ? 'Opening Agreement...' : 'Open Campaign Agreement (Step 7)'}</span>
            </button>
          </div>
        ) : (
          <div className="bg-[#12121c] border-b border-[#20202e] px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center space-x-4">
              <span className="text-[11px] text-[#7a7a8e] uppercase font-bold tracking-wider">
                Mutual Confirmation Progress:
              </span>
              <div className="flex items-center space-x-1.5">
                {isAdvertiserConfirmed ? (
                  <span className="flex items-center space-x-1 text-emerald-400 text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Advertiser Confirmed</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[#7e7e92] text-[11px]">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Advertiser Pending</span>
                  </span>
                )}
              </div>
              <span className="text-[#3a3a4d]">&bull;</span>
              <div className="flex items-center space-x-1.5">
                {isVenueConfirmed ? (
                  <span className="flex items-center space-x-1 text-emerald-400 text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Venue Confirmed</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[#7e7e92] text-[11px]">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Venue Pending</span>
                  </span>
                )}
              </div>
            </div>

            <div className="text-[11px] text-[#7a7a8e]">
              Expires: {new Date(proposal.expiresAt).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* Historical Viewing Banner */}
        {isViewingHistorical && (
          <div className="bg-amber-950/30 border-b border-amber-900/40 px-6 py-2 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center space-x-2">
              <History className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                Viewing historical <strong>Version {displayedVersion.versionNumber}</strong> created by {displayedVersion.actor.organizationName}. Historical negotiation versions are immutable.
              </span>
            </div>
            <button
              onClick={() => setSelectedVersionNumber(proposal.currentVersionNumber)}
              className="rounded bg-amber-900/40 px-2 py-0.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-800/40 transition"
            >
              Return to Active (v{proposal.currentVersionNumber})
            </button>
          </div>
        )}

        {/* Main Body - Scrollable */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Counterparties Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Advertiser */}
            <div className="rounded-xl border border-[#212130] bg-[#12121a] p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059] flex items-center space-x-1.5">
                <Megaphone className="h-3.5 w-3.5" />
                <span>Advertiser Brand</span>
              </div>
              <div className="font-semibold text-white text-sm">
                {proposal.advertiserBrandName}
              </div>
              <div className="text-[#848496]">
                Account: <span className="font-mono text-[#a5a5bb]">{proposal.advertiserPublicId}</span>
              </div>
              {proposal.advertiserConfirmedAt && (
                <div className="text-[10px] text-emerald-400 flex items-center space-x-1 pt-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Approved at {new Date(proposal.advertiserConfirmedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* Venue */}
            <div className="rounded-xl border border-[#212130] bg-[#12121a] p-4 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059] flex items-center space-x-1.5">
                <Building2 className="h-3.5 w-3.5" />
                <span>Hosting Venue</span>
              </div>
              <div className="font-semibold text-white text-sm">
                {proposal.venueName}
              </div>
              <div className="text-[#848496]">
                Account: <span className="font-mono text-[#a5a5bb]">{proposal.venuePublicId}</span>
              </div>
              {proposal.venueConfirmedAt && (
                <div className="text-[10px] text-emerald-400 flex items-center space-x-1 pt-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>Approved at {new Date(proposal.venueConfirmedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Capacity Evaluation Card */}
          {capacityEvaluation && (
            <div
              className={`rounded-xl border p-4 text-xs ${
                capacityEvaluation.isWarning
                  ? 'border-amber-900/40 bg-amber-950/15 text-amber-300'
                  : 'border-emerald-900/30 bg-emerald-950/10 text-emerald-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold flex items-center space-x-1.5">
                  <Warehouse className="h-4 w-4" />
                  <span>Venue Holding Capacity Live Evaluation</span>
                </span>
                <span className="font-mono text-[11px] font-bold">
                  {capacityEvaluation.status === 'WITHIN_CAPACITY'
                    ? 'WITHIN HOLDING CAPACITY'
                    : 'OVER CAPACITY WARNING'}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[#9595a6]">
                <div>
                  <div className="text-[10px]">Proposed Bottles</div>
                  <div className="font-mono font-bold text-white text-sm mt-0.5">
                    {capacityEvaluation.proposedCampaignQuantity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px]">Available Holding</div>
                  <div className="font-mono font-bold text-white text-sm mt-0.5">
                    {capacityEvaluation.availableBottleCapacity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px]">Max Holding Floor</div>
                  <div className="font-mono font-bold text-[#848496] text-sm mt-0.5">
                    {capacityEvaluation.maxBottleHoldingCapacity.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-[10px]">Overage Units</div>
                  <div
                    className={`font-mono font-bold text-sm mt-0.5 ${
                      capacityEvaluation.capacityOverage > 0 ? 'text-amber-400' : 'text-emerald-400'
                    }`}
                  >
                    {capacityEvaluation.capacityOverage > 0
                      ? `+${capacityEvaluation.capacityOverage.toLocaleString()}`
                      : '0'}
                  </div>
                </div>
              </div>

              {capacityEvaluation.warningMessage && (
                <div className="mt-2.5 text-[11px] text-amber-400/90 border-t border-amber-900/30 pt-2">
                  {capacityEvaluation.warningMessage}
                </div>
              )}
            </div>
          )}

          {/* Version History Selector Tabs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center space-x-1.5">
                <History className="h-3.5 w-3.5 text-[#c5a059]" />
                <span>Negotiation Version History ({versions.length})</span>
              </span>
              <span className="text-[11px] text-[#7a7a8e]">Select a version to inspect terms</span>
            </div>

            <div className="flex space-x-2 overflow-x-auto pb-1">
              {versions.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVersionNumber(v.versionNumber)}
                  className={`flex items-center space-x-2 rounded-lg border px-3 py-1.5 text-xs transition shrink-0 ${
                    selectedVersionNumber === v.versionNumber
                      ? 'border-[#c5a059] bg-[#c5a059]/10 text-white font-bold'
                      : 'border-[#222230] bg-[#12121a] text-[#8e8e9f] hover:border-[#35354a]'
                  }`}
                >
                  <span className="font-mono">v{v.versionNumber}</span>
                  <span className="text-[10px] text-[#717182]">&bull; {v.actor.role}</span>
                  {v.versionNumber === proposal.currentVersionNumber && (
                    <span className="rounded bg-emerald-950/60 text-emerald-400 text-[9px] px-1.5 py-0.2">
                      Active
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Version Terms Content */}
          <div className="rounded-xl border border-[#242436] bg-[#111118] p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#1e1e2a] pb-3">
              <div>
                <span className="font-bold text-white text-sm">
                  Terms Snapshot &bull; Version {displayedVersion.versionNumber}
                </span>
                <p className="text-[11px] text-[#78788a] mt-0.5">
                  Summary: <span className="text-[#a5a5bb]">{displayedVersion.changeSummary}</span>
                </p>
              </div>

              <span className="text-[10px] text-[#6b6b7d]">
                Created {new Date(displayedVersion.createdAt).toLocaleString()} by {displayedVersion.actor.organizationName}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Bottle Quantity */}
              <div className="rounded-lg border border-[#1e1e2a] bg-[#151520] p-3">
                <div className="text-[10px] text-[#7d7d8e]">Campaign Quantity</div>
                <div className="text-base font-bold font-mono text-white mt-1">
                  {terms.campaignQuantity.toLocaleString()} bottles
                </div>
                <div className="text-[10px] text-[#5e5e6e]">Total distribution commitment</div>
              </div>

              {/* Duration */}
              <div className="rounded-lg border border-[#1e1e2a] bg-[#151520] p-3">
                <div className="text-[10px] text-[#7d7d8e]">Campaign Duration</div>
                <div className="text-base font-bold font-mono text-white mt-1">
                  {terms.campaignDuration.value} {terms.campaignDuration.unit.toLowerCase()}
                </div>
                <div className="text-[10px] text-[#5e5e6e]">
                  {terms.distributionRequirements.estimatedDistributionPace}
                </div>
              </div>

              {/* Start Period */}
              <div className="rounded-lg border border-[#1e1e2a] bg-[#151520] p-3">
                <div className="text-[10px] text-[#7d7d8e]">Target Start Window</div>
                <div className="text-sm font-semibold text-white mt-1">
                  {terms.preferredStartPeriod.windowStart || 'Immediate'}
                </div>
                <div className="text-[10px] text-[#5e5e6e]">
                  Through {terms.preferredStartPeriod.windowEnd || 'Open'}
                </div>
              </div>
            </div>

            {/* Venue Compensation Box */}
            <div className="rounded-xl border border-[#2b2b3d] bg-[#151522] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white flex items-center space-x-1.5">
                  <DollarSign className="h-4 w-4 text-[#c5a059]" />
                  <span>Venue Distribution Compensation Terms</span>
                </span>
                <span className="text-[10px] text-[#8e8e9f]">
                  Calculated exclusively from eligible supplier advertising cost
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <span className="text-[10px] text-[#828296]">Venue Compensation %</span>
                  <div className="font-mono text-lg font-bold text-[#c5a059] mt-0.5">
                    {terms.venueCompensationTerms.proposedPercentage ?? 0}%
                  </div>
                  <span className="text-[10px] text-[#717182]">Capped at 12.5% max</span>
                </div>

                <div>
                  <span className="text-[10px] text-[#828296]">Compensation Basis</span>
                  <div className="text-xs text-[#b8b8cc] mt-0.5 leading-relaxed">
                    {terms.venueCompensationTerms.termsDescription || 'Calculated from eligible supplier total bottle advertising cost.'}
                  </div>
                </div>
              </div>

              {terms.venueCompensationTerms.notes && (
                <div className="text-[11px] text-[#828296] border-t border-[#222230] pt-2">
                  <span className="text-[#a0a0b5] font-medium">Notes:</span> {terms.venueCompensationTerms.notes}
                </div>
              )}
            </div>

            {/* Placement & Product Requirements */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a8d]">
                  Placement & Staging
                </span>
                <p className="text-white">
                  {terms.distributionRequirements.placementDetails}
                </p>
                <div className="text-[11px] text-[#717182]">
                  Refrigeration Required:{' '}
                  <span className="text-white">
                    {terms.distributionRequirements.refrigerationRequired ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a8d]">
                  Vessel & Formulation Specs
                </span>
                <p className="text-white">
                  {terms.productRequirements?.volumeLabel || '500 ml Standard'} &bull;{' '}
                  {terms.productRequirements?.preferredMaterial || '100% rPET'}
                </p>
                <div className="text-[11px] text-[#717182]">
                  {terms.productRequirements?.labelType || 'Full-Wrap Shrink Sleeve'} &bull;{' '}
                  {terms.productRequirements?.capType || 'Screw Cap'}
                </div>
              </div>
            </div>

            {/* Custom Conditions */}
            {terms.customConditions && (
              <div className="border-t border-[#1e1e2a] pt-3 space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[#7a7a8d]">
                  Custom Conditions & Special Notes
                </span>
                <p className="text-[#c0c0d4] text-[11px] leading-relaxed">
                  {terms.customConditions}
                </p>
              </div>
            )}
          </div>

          {/* Negotiation Audit Timeline */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-white flex items-center space-x-1.5">
              <History className="h-4 w-4 text-[#c5a059]" />
              <span>Immutable Negotiation Timeline ({timeline.length} Events)</span>
            </h4>

            <div className="rounded-xl border border-[#212130] bg-[#101018] p-4 divide-y divide-[#1b1b26] text-xs">
              {timeline.map((event) => (
                <div key={event.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-white">{event.action}</span>
                      <span className="rounded bg-[#1c1c28] px-1.5 py-0.2 font-mono text-[10px] text-[#8e8e9f]">
                        v{event.versionNumber}
                      </span>
                      <span className="text-[#69697a]">&bull;</span>
                      <span className="text-[#a0a0b5]">{event.actor.organizationName}</span>
                      <span className="text-[#555566]">({event.actor.role})</span>
                    </div>

                    {event.changeSummary && (
                      <p className="text-[#7d7d8e] text-[11px]">{event.changeSummary}</p>
                    )}

                    {event.notes && (
                      <p className="text-amber-400/90 text-[11px]">Note: {event.notes}</p>
                    )}
                  </div>

                  <span className="text-[10px] text-[#616172] shrink-0">
                    {new Date(event.timestamp).toLocaleTimeString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className="border-t border-[#1f1f2e] bg-[#0c0c14] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-[#68687a] flex items-center space-x-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-[#c5a059]" />
            <span>Step 6 owns Proposal & Negotiation only. Campaign Agreement is finalized in Step 7.</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Decline Proposal */}
            {permissions.canDecline && (
              <button
                onClick={() => setShowDeclineModal(true)}
                className="flex items-center space-x-1.5 rounded-lg border border-rose-900/40 bg-rose-950/20 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-900/30 transition"
              >
                <XCircle className="h-3.5 w-3.5" />
                <span>Decline</span>
              </button>
            )}

            {/* Withdraw Proposal (Advertiser only) */}
            {permissions.canWithdraw && (
              <button
                onClick={() => setShowWithdrawModal(true)}
                className="flex items-center space-x-1.5 rounded-lg border border-[#353548] bg-[#181822] px-3 py-1.5 text-xs font-semibold text-[#a5a5bb] hover:bg-[#20202e] transition"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Withdraw</span>
              </button>
            )}

            {/* Counter-Proposal */}
            {permissions.canCounter && (
              <button
                onClick={() => setShowCounterModal(true)}
                className="flex items-center space-x-1.5 rounded-lg border border-amber-800/50 bg-amber-950/30 px-3.5 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-900/40 transition"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Counter-Propose</span>
              </button>
            )}

            {/* Accept / Confirm Version */}
            {permissions.canAccept && (
              <button
                onClick={() => setShowAcceptModal(true)}
                className="flex items-center space-x-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black hover:bg-emerald-400 transition"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Confirm Proposal Terms</span>
              </button>
            )}

            {/* Campaign Agreement Step 7 Button */}
            {isMutuallyConfirmed && (
              <button
                onClick={handleOpenOrCreateAgreement}
                disabled={agreementLoading}
                className="flex items-center space-x-1.5 rounded-lg bg-[#c5a059] px-4 py-1.5 text-xs font-bold text-black hover:bg-[#d8b26e] transition"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>{agreementLoading ? 'Opening...' : 'Open Campaign Agreement (Step 7)'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      {showCounterModal && (
        <CounterProposalModal
          proposal={proposal}
          activeVersion={activeVersion}
          onClose={() => setShowCounterModal(false)}
          onSuccess={(res) => handleActionSuccess(res.proposal)}
        />
      )}

      {showAcceptModal && (
        <AcceptProposalModal
          proposal={proposal}
          activeVersion={activeVersion}
          capacityEvaluation={capacityEvaluation}
          userRole={currentUserRole}
          onClose={() => setShowAcceptModal(false)}
          onSuccess={(res) => handleActionSuccess(res.proposal)}
        />
      )}

      {showDeclineModal && (
        <DeclineProposalModal
          proposal={proposal}
          onClose={() => setShowDeclineModal(false)}
          onSuccess={(res) => handleActionSuccess(res)}
        />
      )}

      {showWithdrawModal && (
        <WithdrawProposalModal
          proposal={proposal}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={(res) => handleActionSuccess(res)}
        />
      )}

      {agreementModalId && (
        <AgreementDetailModal
          agreementId={agreementModalId}
          isOpen={!!agreementModalId}
          onClose={() => setAgreementModalId(null)}
          onUpdate={loadProposal}
        />
      )}
    </div>
  );
};
