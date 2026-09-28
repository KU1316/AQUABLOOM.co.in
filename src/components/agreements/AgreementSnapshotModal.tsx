import React, { useState, useEffect } from 'react';
import { CampaignAgreementSnapshot } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  Lock,
  ShieldCheck,
  FileText,
  X,
  Calendar,
  Building2,
  Megaphone,
  CheckCircle2,
  Package,
  Layers,
  AlertCircle,
  Hash,
  Clock,
  Download,
} from 'lucide-react';

interface Props {
  agreementId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AgreementSnapshotModal: React.FC<Props> = ({
  agreementId,
  isOpen,
  onClose,
}) => {
  const [snapshot, setSnapshot] = useState<CampaignAgreementSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && agreementId) {
      const fetchSnapshot = async () => {
        setLoading(true);
        setError(null);
        try {
          const res = await api.getCampaignAgreementSnapshot(agreementId);
          if (res.error) {
            throw new Error(res.error.message || 'Failed to fetch Agreement Snapshot.');
          }
          setSnapshot(res.data || null);
        } catch (err: any) {
          setError(err.message || 'Error loading snapshot.');
        } finally {
          setLoading(false);
        }
      };

      fetchSnapshot();
    }
  }, [isOpen, agreementId]);

  if (!isOpen) return null;

  return (
    <div
      id="agreement-snapshot-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto"
    >
      <div
        id="agreement-snapshot-modal-container"
        className="relative flex flex-col w-full max-w-4xl rounded-2xl border border-amber-500/30 bg-[#0c0c12] text-white shadow-2xl overflow-hidden max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#212130] bg-[#14141e] px-6 py-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-base font-bold text-white">Immutable Agreement Snapshot</h2>
                <span className="rounded-md bg-amber-500/10 border border-amber-500/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-400">
                  LOCKED
                </span>
              </div>
              <p className="text-xs text-[#9d9db3] font-mono mt-0.5">
                Snapshot Ref: <span className="text-amber-400 font-semibold">{snapshot?.publicSnapshotId || '...'}</span> &bull; Agreement: {snapshot?.agreementPublicId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Immutability Notice Banner */}
        <div className="border-b border-amber-500/20 bg-amber-950/20 px-6 py-3 text-xs text-amber-300/90 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Cryptographic & Commercial Integrity:</strong> This snapshot is deep-cloned and sealed. Subsequent amendments cannot alter these recorded commercial obligations.
            </span>
          </div>
          <span className="font-mono text-[11px] text-amber-400/80 shrink-0 ml-4">
            Version {snapshot?.versionNumber}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-zinc-500 text-xs flex flex-col items-center justify-center space-y-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <span>Loading authoritative snapshot record...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-xs text-rose-300 flex items-center space-x-3">
              <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          ) : snapshot ? (
            <>
              {/* Snapshot Metadata & Timestamps */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl border border-[#232332] bg-[#12121c] p-4 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Locked Timestamp</span>
                  <span className="text-white font-mono font-medium">
                    {new Date(snapshot.lockedAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Lock Version</span>
                  <span className="text-emerald-400 font-mono font-medium">
                    v{snapshot.lockVersion} (Immutable Transaction)
                  </span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Public Agreement ID</span>
                  <span className="text-amber-400 font-mono font-medium">
                    {snapshot.agreementPublicId}
                  </span>
                </div>
              </div>

              {/* Source References */}
              {snapshot.sourceReferences && (
                <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2 text-xs">
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Lineage & Source References</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-500 block text-[9px]">Proposal</span>
                      <span className="text-white">{snapshot.sourceReferences.sourceProposalPublicId}</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-500 block text-[9px]">Campaign</span>
                      <span className="text-white">{snapshot.campaignSnapshot.publicCampaignId}</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-500 block text-[9px]">Advertiser ID</span>
                      <span className="text-white">{snapshot.advertiserSnapshot.publicAccountId}</span>
                    </div>
                    <div className="p-2 rounded bg-zinc-900 border border-zinc-800">
                      <span className="text-zinc-500 block text-[9px]">Venue ID</span>
                      <span className="text-white">{snapshot.venueSnapshot.publicAccountId}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Contracting Parties Snapshot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#232332] bg-[#12121c] p-4 space-y-2 text-xs">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                    <Megaphone className="w-4 h-4" />
                    <span>Advertiser Profile Snapshot</span>
                  </div>
                  <div className="text-sm font-bold text-white">{snapshot.advertiserSnapshot.brandName || 'Advertiser'}</div>
                  <div className="text-zinc-400">{snapshot.advertiserSnapshot.industry || 'Commercial Brand'} &bull; {snapshot.advertiserSnapshot.locationCity || 'Direct'}</div>
                </div>

                <div className="rounded-xl border border-[#232332] bg-[#12121c] p-4 space-y-2 text-xs">
                  <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                    <Building2 className="w-4 h-4" />
                    <span>Venue Profile Snapshot</span>
                  </div>
                  <div className="text-sm font-bold text-white">{snapshot.venueSnapshot.venueName || 'Venue Partner'}</div>
                  <div className="text-zinc-400">{snapshot.venueSnapshot.venueType || 'Hospitality'} &bull; {snapshot.venueSnapshot.locationCity || 'Direct'}</div>
                </div>
              </div>

              {/* Sealed Commercial Terms */}
              <div className="rounded-xl border border-[#232332] bg-[#12121c] p-4 space-y-3 text-xs">
                <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <Package className="w-4 h-4" />
                  <span>Sealed Commercial Terms</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Bottle Quantity</span>
                    <span className="text-base font-bold font-mono text-white">
                      {snapshot.campaignTermsSnapshot.quantity?.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Duration</span>
                    <span className="text-base font-bold text-white">
                      {snapshot.campaignTermsSnapshot.duration?.value} {snapshot.campaignTermsSnapshot.duration?.unit?.toLowerCase()}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Product Formulation</span>
                    <span className="text-base font-bold text-white">
                      {snapshot.productRequirementsSnapshot?.preferredVolumeMl || 500}ml {snapshot.productRequirementsSnapshot?.preferredMaterial || 'rPET'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px]">Negotiated Venue Compensation</span>
                    <span className="text-base font-bold font-mono text-emerald-400">
                      {snapshot.compensationTermsSnapshot.proposedPercentage}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Operational Rules & Governance Summary */}
              <div className="rounded-xl border border-[#232332] bg-[#12121c] p-4 space-y-2 text-xs text-zinc-300">
                <div className="flex items-center space-x-2 text-amber-400 font-bold uppercase tracking-wider text-[11px]">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Governance & Cancellation Rules</span>
                </div>
                <p className="leading-relaxed text-zinc-400">
                  Pre-production cancellation: <span className="text-zinc-200 font-semibold">{snapshot.cancellationTermsSnapshot?.termsSummary}</span>
                </p>
                <p className="leading-relaxed text-zinc-400">
                  Manufacturing commitment: <span className="text-zinc-200 font-semibold">{snapshot.cancellationTermsSnapshot?.nonRecoverableCostPrinciple}</span>
                </p>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-[#212130] bg-[#14141e] px-6 py-3 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <span>Authority: AquaBloom Immutable Transaction Register</span>
          <button
            onClick={onClose}
            className="rounded-lg bg-zinc-800 px-4 py-1.5 font-medium text-white hover:bg-zinc-700 transition"
          >
            Close Snapshot
          </button>
        </div>
      </div>
    </div>
  );
};
