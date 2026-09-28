import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { api } from '../../lib/api.js';
import {
  CampaignAgreementPreviewView,
  SanitizedAgreementVersion,
} from '../../types.js';
import { AgreementStatusBadge } from './AgreementStatusBadge.js';
import { AgreementSnapshotModal } from './AgreementSnapshotModal.js';
import {
  X,
  Lock,
  Clock,
  ShieldCheck,
  AlertTriangle,
  Building2,
  Megaphone,
  Package,
  Calendar,
  Layers,
  FileCheck2,
  DollarSign,
  Truck,
  QrCode,
  RotateCcw,
  Sparkles,
  Info,
  History,
  Users,
  CheckCircle2,
  ChevronRight,
  Eye,
  AlertCircle,
} from 'lucide-react';

interface Props {
  agreementId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const AgreementDetailModal: React.FC<Props> = ({
  agreementId,
  isOpen,
  onClose,
  onUpdate,
}) => {
  const { user } = useAuth();
  const [preview, setPreview] = useState<CampaignAgreementPreviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHistoricalVersion, setSelectedHistoricalVersion] = useState<SanitizedAgreementVersion | null>(null);
  const [activeSection, setActiveSection] = useState<'ALL' | 'PARTIES' | 'SPECIFICATIONS' | 'RESPONSIBILITIES' | 'COMMERCIAL' | 'POLICIES' | 'VERSIONS'>('ALL');

  // Step 7 Part 3 Interactive State
  const [isSnapshotOpen, setIsSnapshotOpen] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchPreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCampaignAgreementPreview(agreementId);
      if (res.error) {
        throw new Error(res.error.message || 'Failed to fetch campaign agreement review details.');
      }
      setPreview(res.data || null);
    } catch (err: any) {
      setError(err.message || 'Error loading agreement preview.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && agreementId) {
      fetchPreview();
    }
  }, [isOpen, agreementId]);

  const canConfirm = preview && (
    preview.agreementStatus === 'DRAFT' ||
    preview.agreementStatus === 'AWAITING_ADVERTISER_CONFIRMATION' ||
    preview.agreementStatus === 'AWAITING_VENUE_CONFIRMATION'
  ) && (
    (user?.role === 'ADVERTISER' && !preview.confirmationStatus.advertiserConfirmed) ||
    (user?.role === 'VENUE' && !preview.confirmationStatus.venueConfirmed) ||
    user?.role === 'ADMIN'
  );

  const canLock = preview && preview.agreementStatus === 'READY_TO_LOCK' && (
    user?.role === 'ADMIN' ||
    user?.role === 'ADVERTISER' ||
    user?.role === 'VENUE'
  );

  const isLocked = preview?.agreementStatus === 'LOCKED';

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preview || !acknowledged) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.confirmCampaignAgreement(agreementId, {
        expectedVersion: preview.currentVersion.versionNumber,
        acknowledgement: true,
        notes: confirmNotes.trim() || undefined,
        idempotencyKey: `cnf_${agreementId}_v${preview.currentVersion.versionNumber}_${Date.now()}`,
      });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to submit agreement confirmation.');
      }
      setActionSuccess('Confirmation recorded successfully.');
      setAcknowledged(false);
      setConfirmNotes('');
      await fetchPreview();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setActionError(err.message || 'An error occurred during confirmation.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLock = async () => {
    if (!preview) return;
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await api.lockCampaignAgreement(agreementId, {
        expectedVersion: preview.currentVersion.versionNumber,
        lockVersion: preview.lockVersion,
        idempotencyKey: `lck_${agreementId}_v${preview.currentVersion.versionNumber}_${Date.now()}`,
      });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to lock Campaign Agreement.');
      }
      setActionSuccess('Campaign Agreement is now locked.');
      await fetchPreview();
      if (onUpdate) onUpdate();
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while locking the agreement.');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      id="agreement-preview-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 sm:p-6 backdrop-blur-sm overflow-y-auto"
    >
      <div
        id="agreement-preview-container"
        className="relative flex flex-col w-full max-w-5xl rounded-2xl border border-[#212130] bg-[#0a0a10] text-white shadow-2xl overflow-hidden max-h-[92vh]"
      >
        {/* Modal Top Navigation Bar */}
        <div className="flex items-center justify-between border-b border-[#212130] bg-[#12121c] px-5 py-4 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-[#c5a059]/10 text-[#c5a059] border border-[#c5a059]/30">
              <FileCheck2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Campaign Agreement Review
                </h1>
                {preview && (
                  <>
                    <AgreementStatusBadge status={preview.agreementStatus} size="sm" />
                    <span className="rounded-md border border-[#c5a059]/40 bg-[#c5a059]/10 px-2 py-0.5 text-[11px] font-mono font-semibold text-[#d8b26e]">
                      Version {preview.currentVersion.versionNumber}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs text-[#8e8e9f] font-mono mt-0.5">
                Ref: <span className="text-white font-medium">{preview?.agreementReference || 'AB-CAG-...'}</span> &bull; Public ID:{' '}
                <span className="text-[#c5a059]">{preview?.publicId}</span>
              </p>
            </div>
          </div>
          <button
            id="close-agreement-preview-modal-btn"
            onClick={onClose}
            aria-label="Close Agreement Preview"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Filter Section Tabs for Responsive Navigation */}
        <div className="flex border-b border-[#1c1c28] bg-[#0e0e16] px-5 py-2 space-x-2 overflow-x-auto text-xs shrink-0 scrollbar-none">
          {(
            [
              { id: 'ALL', label: 'Full Agreement' },
              { id: 'PARTIES', label: 'Parties & Scope' },
              { id: 'SPECIFICATIONS', label: 'Bottle & Schedule' },
              { id: 'RESPONSIBILITIES', label: 'Responsibilities' },
              { id: 'COMMERCIAL', label: 'Compensation & Rules' },
              { id: 'POLICIES', label: 'Policies' },
              { id: 'VERSIONS', label: 'Version Trail' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`min-h-[38px] px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition ${
                activeSection === tab.id
                  ? 'bg-[#c5a059] text-black font-semibold'
                  : 'text-[#8e8e9f] hover:text-white hover:bg-[#161622]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable Document Content Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {loading ? (
            <div className="py-24 text-center text-[#8e8e9f] text-sm flex flex-col items-center justify-center space-y-3">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#c5a059] border-t-transparent" />
              <span>Loading sanitized Campaign Agreement review model...</span>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-5 text-xs text-rose-300 flex items-center space-x-3">
              <AlertTriangle className="w-6 h-6 shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold text-rose-200">Unable to load agreement</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          ) : preview ? (
            <>
              {/* Action feedback banners */}
              {actionError && (
                <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-4 text-xs text-rose-300 flex items-start space-x-3">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
              {actionSuccess && (
                <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/40 p-4 text-xs text-emerald-300 flex items-start space-x-3">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span>{actionSuccess}</span>
                </div>
              )}

              {/* STEP 7 PART 3: CONFIRMATION, LOCK & SNAPSHOT STATUS BANNER */}
              {isLocked ? (
                <div
                  id="agreement-locked-banner"
                  className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-[#181512] to-amber-950/30 p-5 shadow-xl relative overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      <div className="p-3 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
                        <Lock className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-mono font-bold text-amber-400">
                            COMMERCIALLY LOCKED
                          </span>
                          <span className="text-xs text-zinc-400">
                            Version {preview.currentVersion.versionNumber} Sealed
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-white">
                          This Campaign Agreement is permanently locked.
                        </h2>
                        <p className="text-xs text-zinc-300 leading-relaxed max-w-2xl">
                          Commercial terms, bottle volume ({preview.quantity.toLocaleString()} units), venue allocations, and distribution rates are sealed. Cancellations are permitted strictly before manufacturing production starts.
                        </p>
                        <div className="pt-1 flex flex-wrap items-center gap-4 text-xs text-zinc-400 font-mono">
                          <span>Locked At: {preview.lockedAt ? new Date(preview.lockedAt).toLocaleString() : 'Authoritative Lock'}</span>
                          {preview.lockedSnapshotPublicId && (
                            <span>Snapshot ID: <strong className="text-amber-400">{preview.lockedSnapshotPublicId}</strong></span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex sm:flex-col items-end justify-center">
                      <button
                        onClick={() => setIsSnapshotOpen(true)}
                        className="flex items-center space-x-2 rounded-xl bg-amber-500/15 border border-amber-500/40 px-4 py-2 text-xs font-bold text-amber-300 hover:bg-amber-500/25 transition"
                      >
                        <Eye className="w-4 h-4" />
                        <span>View Immutable Snapshot</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : preview.agreementStatus === 'READY_TO_LOCK' ? (
                <div
                  id="agreement-ready-to-lock-banner"
                  className="rounded-xl border border-[#c5a059] bg-gradient-to-r from-[#1c1810] via-[#14141e] to-[#1c1810] p-5 shadow-2xl relative overflow-hidden"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start space-x-3">
                      <div className="p-3 rounded-xl bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/40 shrink-0">
                        <ShieldCheck className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="rounded-md bg-[#c5a059]/20 border border-[#c5a059]/50 px-2 py-0.5 text-xs font-mono font-bold text-[#d8b26e]">
                            READY TO LOCK
                          </span>
                          <span className="text-xs text-emerald-400 font-semibold flex items-center space-x-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Both Parties Confirmed</span>
                          </span>
                        </div>
                        <h2 className="text-base font-bold text-white">
                          Mutual Confirmation Complete
                        </h2>
                        <p className="text-xs text-[#b8b8cc] leading-relaxed max-w-2xl">
                          Advertiser and Venue have both formally confirmed Version {preview.currentVersion.versionNumber}. You can now execute the atomic lock to seal commercial terms and generate an immutable snapshot.
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center">
                      {canLock ? (
                        <button
                          onClick={handleLock}
                          disabled={actionLoading}
                          className="flex items-center space-x-2 rounded-xl bg-[#c5a059] px-5 py-2.5 text-xs font-bold text-black hover:bg-[#d8b26e] shadow-lg shadow-[#c5a059]/20 transition"
                        >
                          <Lock className="w-4 h-4" />
                          <span>{actionLoading ? 'Locking Agreement...' : 'Lock Campaign Agreement'}</span>
                        </button>
                      ) : (
                        <span className="text-xs text-zinc-500">Awaiting lock execution</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  id="agreement-confirmation-panel"
                  className="rounded-xl border border-[#2d2d3e] bg-[#12121c] p-5 shadow-lg space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#212130] pb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                          Formal Party Confirmation
                        </span>
                        <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-[10px] font-mono text-zinc-300">
                          Version {preview.currentVersion.versionNumber}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1">
                        Both parties must explicitly confirm before the agreement can be atomically locked. Viewing or downloading does not constitute confirmation.
                      </p>
                    </div>

                    {/* Dual Party Confirmation Indicators */}
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center space-x-2 text-xs bg-[#0b0b10] border border-[#212130] px-3 py-1.5 rounded-lg">
                        <span className="text-zinc-400">Advertiser:</span>
                        {preview.confirmationStatus.advertiserConfirmed ? (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmed</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium">Pending</span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2 text-xs bg-[#0b0b10] border border-[#212130] px-3 py-1.5 rounded-lg">
                        <span className="text-zinc-400">Venue:</span>
                        {preview.confirmationStatus.venueConfirmed ? (
                          <span className="flex items-center space-x-1 text-emerald-400 font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Confirmed</span>
                          </span>
                        ) : (
                          <span className="text-amber-400 font-medium">Pending</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Explicit Confirmation Action Form (if user can confirm) */}
                  {canConfirm ? (
                    <form onSubmit={handleConfirm} className="space-y-4 pt-1">
                      <div className="rounded-lg border border-[#2f2f42] bg-[#161624] p-4 space-y-3">
                        <label className="flex items-start space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={acknowledged}
                            onChange={(e) => setAcknowledged(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-[#c5a059] focus:ring-[#c5a059]"
                          />
                          <span className="text-xs text-zinc-200 leading-relaxed font-medium">
                            I confirm that I have reviewed the Campaign Agreement and understand that once both parties confirm and the agreement is locked, normal commercial amendments are not permitted.
                          </span>
                        </label>

                        <div className="pt-1">
                          <input
                            type="text"
                            placeholder="Optional confirmation note (e.g. Approved by legal & brand teams)"
                            value={confirmNotes}
                            onChange={(e) => setConfirmNotes(e.target.value)}
                            className="w-full rounded-lg border border-[#272738] bg-[#0d0d14] px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-[#c5a059] focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={!acknowledged || actionLoading}
                          className={`flex items-center space-x-2 rounded-xl px-5 py-2.5 text-xs font-bold transition ${
                            acknowledged && !actionLoading
                              ? 'bg-[#c5a059] text-black hover:bg-[#d8b26e]'
                              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                          }`}
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{actionLoading ? 'Confirming...' : 'Sign & Submit Confirmation'}</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="text-xs text-zinc-500 italic">
                      {preview.confirmationStatus.advertiserConfirmed && user?.role === 'ADVERTISER'
                        ? 'Your formal confirmation has been recorded. Awaiting Venue confirmation.'
                        : preview.confirmationStatus.venueConfirmed && user?.role === 'VENUE'
                        ? 'Your formal confirmation has been recorded. Awaiting Advertiser confirmation.'
                        : 'Reviewing agreement terms in read-only mode.'}
                    </div>
                  )}
                </div>
              )}

              {/* SECTION: PARTIES & CAMPAIGN CONTEXT (Items 1, 2, 3, 4, 5, 6, 7) */}
              {(activeSection === 'ALL' || activeSection === 'PARTIES') && (
                <div id="section-parties-and-campaign" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <Users className="w-4 h-4" />
                    <span>Contracting Parties & Strategic Campaign Scope</span>
                  </div>

                  {/* Contracting Parties Cards (Items 3, 4, 5) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Item 4: Advertiser Card */}
                    <div
                      id="card-party-advertiser"
                      className="rounded-xl border border-[#232332] bg-[#101018] p-4 relative"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-[#1c1c28]">
                        <div className="flex items-center space-x-2">
                          <Megaphone className="w-4 h-4 text-[#c5a059]" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Advertiser Party
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded border border-[#c5a059]/20">
                          {preview.advertiser.publicAccountId}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <h3 className="text-base font-bold text-white">
                          {preview.advertiser.brandName}
                        </h3>
                        <p className="text-xs text-[#8e8e9f]">
                          Industry: <span className="text-zinc-200">{preview.advertiser.industry}</span>
                        </p>
                        <p className="text-xs text-[#8e8e9f]">
                          Jurisdiction: <span className="text-zinc-200">{preview.advertiser.city}, {preview.advertiser.country}</span>
                        </p>
                        {preview.parties.advertiser.primaryContactName && (
                          <p className="text-xs text-[#8e8e9f]">
                            Primary Contact: <span className="text-zinc-200">{preview.parties.advertiser.primaryContactName}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Item 5: Venue Card */}
                    <div
                      id="card-party-venue"
                      className="rounded-xl border border-[#232332] bg-[#101018] p-4 relative"
                    >
                      <div className="flex items-center justify-between pb-3 border-b border-[#1c1c28]">
                        <div className="flex items-center space-x-2">
                          <Building2 className="w-4 h-4 text-[#c5a059]" />
                          <span className="text-xs font-bold text-white uppercase tracking-wider">
                            Host Venue Party
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded border border-[#c5a059]/20">
                          {preview.venue.publicAccountId}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5">
                        <h3 className="text-base font-bold text-white">
                          {preview.venue.venueName}
                        </h3>
                        <p className="text-xs text-[#8e8e9f]">
                          Type: <span className="text-zinc-200">{preview.venue.venueType}</span> &bull; Audience: <span className="text-zinc-200">{preview.venue.audienceCategory}</span>
                        </p>
                        <p className="text-xs text-[#8e8e9f]">
                          Location: <span className="text-zinc-200">{preview.venue.city}, {preview.venue.country}</span>
                        </p>
                        {preview.parties.venue.monthlyVisitors !== undefined && (
                          <p className="text-xs text-[#8e8e9f]">
                            Estimated Footfall: <span className="text-zinc-200">{preview.parties.venue.monthlyVisitors.toLocaleString()} visitors/mo</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Campaign Scope & Objectives (Items 2, 6, 7) */}
                  <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1c1c28] pb-3">
                      <div>
                        <span className="text-[11px] font-mono text-[#8e8e9f] uppercase">
                          Referenced Campaign
                        </span>
                        <h3 className="text-sm sm:text-base font-bold text-white mt-0.5">
                          {preview.campaign.name}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 font-medium">
                          Category: {preview.campaign.category}
                        </span>
                        <span className="rounded border border-[#c5a059]/40 bg-[#c5a059]/10 px-2 py-0.5 text-xs font-mono text-[#d8b26e]">
                          {preview.campaign.publicId}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {/* Item 6: Campaign Objective */}
                      <div className="space-y-1">
                        <span className="text-[#8e8e9f] font-semibold uppercase tracking-wider text-[10px]">
                          Item 6 &bull; Campaign Objective
                        </span>
                        <p className="text-zinc-200 leading-relaxed bg-[#0a0a10] p-3 rounded-lg border border-[#1b1b24]">
                          {preview.campaignObjective}
                        </p>
                      </div>

                      {/* Item 7: Target Audience */}
                      <div className="space-y-1">
                        <span className="text-[#8e8e9f] font-semibold uppercase tracking-wider text-[10px]">
                          Item 7 &bull; Target Audience Demographics
                        </span>
                        <p className="text-zinc-200 leading-relaxed bg-[#0a0a10] p-3 rounded-lg border border-[#1b1b24]">
                          {typeof preview.targetAudience === 'string'
                            ? preview.targetAudience
                            : `${preview.targetAudience.demographics || 'General demographics'} • Characteristics: ${preview.targetAudience.characteristics?.join(', ') || 'General Footfall'}`}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: SPECIFICATIONS & SCHEDULE (Items 8, 9, 10, 11) */}
              {(activeSection === 'ALL' || activeSection === 'SPECIFICATIONS') && (
                <div id="section-specifications-and-schedule" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <Package className="w-4 h-4" />
                    <span>Product Volumes & Distribution Calendar</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Item 8: Quantity */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                        Item 8 &bull; Total Quantity
                      </span>
                      <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-display">
                        {preview.quantity.toLocaleString()}{' '}
                        <span className="text-xs font-normal text-[#c5a059]">Bottles</span>
                      </div>
                      <p className="text-[11px] text-[#8e8e9f] mt-1">
                        Production batch total
                      </p>
                    </div>

                    {/* Item 10: Campaign Duration */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                        Item 10 &bull; Duration
                      </span>
                      <div className="text-xl sm:text-2xl font-bold text-white mt-1 font-display">
                        {preview.campaignDuration.value}{' '}
                        <span className="text-xs font-normal text-[#c5a059] uppercase">
                          {preview.campaignDuration.unit.toLowerCase()}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8e8e9f] mt-1">
                        Active in-venue presence
                      </p>
                    </div>

                    {/* Item 11: Campaign Dates / Preferred Period */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 sm:col-span-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                        Item 11 &bull; Preferred Period / Dates
                      </span>
                      <div className="text-sm font-semibold text-white mt-1">
                        {preview.campaignDates.preferredStartPeriod.label || 'Scheduled Run'}
                        {preview.campaignDates.preferredStartPeriod.windowStart && (
                          <span className="text-xs text-[#8e8e9f] ml-2 font-normal">
                            ({preview.campaignDates.preferredStartPeriod.windowStart} &ndash; {preview.campaignDates.preferredStartPeriod.windowEnd || 'Open'})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#8e8e9f] mt-1">
                        Duration: {preview.campaignDates.durationLabel}
                      </p>
                    </div>
                  </div>

                  {/* Item 9: Bottle/Product Requirements Known at this Stage */}
                  <div className="rounded-xl border border-[#232332] bg-[#101018] p-4">
                    <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                      Item 9 &bull; Bottle & Product Requirements Known at this Stage
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2 text-xs">
                      <div className="bg-[#0a0a10] p-2.5 rounded-lg border border-[#1c1c28]">
                        <span className="text-[10px] text-[#8e8e9f] block">Volume</span>
                        <span className="font-semibold text-white">
                          {preview.productRequirements?.preferredVolumeMl || (preview.productRequirements as any)?.bottleVolumeMl || 500} ml
                        </span>
                      </div>
                      <div className="bg-[#0a0a10] p-2.5 rounded-lg border border-[#1c1c28]">
                        <span className="text-[10px] text-[#8e8e9f] block">Material</span>
                        <span className="font-semibold text-white">
                          {preview.productRequirements?.preferredMaterial || (preview.productRequirements as any)?.bottleMaterial || '100% rPET'}
                        </span>
                      </div>
                      <div className="bg-[#0a0a10] p-2.5 rounded-lg border border-[#1c1c28]">
                        <span className="text-[10px] text-[#8e8e9f] block">Label Finish</span>
                        <span className="font-semibold text-white">
                          {preview.productRequirements?.labelType || 'Full-Wrap Shrink Sleeve'}
                        </span>
                      </div>
                      <div className="bg-[#0a0a10] p-2.5 rounded-lg border border-[#1c1c28]">
                        <span className="text-[10px] text-[#8e8e9f] block">Cap Style</span>
                        <span className="font-semibold text-white">
                          {preview.productRequirements?.capType || 'Tamper-Evident Screw Cap'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: DISTRIBUTION, PLACEMENT & COLLABORATION (Items 12, 13, 14, 17, 18) */}
              {(activeSection === 'ALL' || activeSection === 'SPECIFICATIONS') && (
                <div id="section-distribution-and-logistics" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <Truck className="w-4 h-4" />
                    <span>Venue Distribution, Staging & Digital Requirements</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Item 12: Distribution Requirements */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#c5a059]" />
                        <span>Item 12 &bull; Distribution Requirements</span>
                      </span>
                      <div className="text-xs text-zinc-300 space-y-1.5">
                        <p>
                          <strong className="text-white">Placement Details:</strong>{' '}
                          {preview.distributionRequirements.placementDetails || (preview.distributionRequirements as any).storageLocation || 'Standard ambient staging'}
                        </p>
                        <p>
                          <strong className="text-white">Distribution Pace:</strong>{' '}
                          {preview.distributionRequirements.estimatedDistributionPace || 'Evenly paced across duration'}
                        </p>
                        <p>
                          <strong className="text-white">Refrigeration:</strong>{' '}
                          {preview.distributionRequirements.refrigerationRequired ? 'Refrigerated storage required' : 'Ambient temperature'}
                        </p>
                      </div>
                    </div>

                    {/* Item 13: Placement Requirements */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <Building2 className="w-3.5 h-3.5 text-[#c5a059]" />
                        <span>Item 13 &bull; Placement Requirements</span>
                      </span>
                      <ul className="text-xs text-zinc-300 space-y-1 list-disc list-inside">
                        {preview.placementRequirements.map((req, i) => (
                          <li key={i}>{req}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Item 14: Collaboration Requirements */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-[#c5a059]" />
                        <span>Item 14 &bull; Collaboration Model</span>
                      </span>
                      <div className="text-xs text-zinc-300 space-y-1.5">
                        <p>
                          <strong className="text-white">Status:</strong>{' '}
                          <span className="text-[#c5a059] font-medium">{preview.collaborationRequirements.status}</span>
                        </p>
                        {preview.collaborationRequirements.preferredTerms && (
                          <p>
                            <strong className="text-white">Preferred Terms:</strong>{' '}
                            {preview.collaborationRequirements.preferredTerms}
                          </p>
                        )}
                        <p>
                          <strong className="text-white">Notes:</strong>{' '}
                          {preview.collaborationRequirements.notes || 'Mutual coordinated staging'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Item 17 & 18: Delivery Terms & QR Tracking */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Item 17: Delivery Terms Known at This Stage */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <Truck className="w-3.5 h-3.5 text-[#c5a059]" />
                        <span>Item 17 &bull; Delivery Terms Known at This Stage</span>
                      </span>
                      <div className="text-xs text-zinc-300 space-y-1.5">
                        <p>
                          <strong className="text-white">Staging:</strong> {preview.deliveryTermsKnown.stagingInstructions}
                        </p>
                        <p>
                          <strong className="text-white">Special Handling:</strong> {preview.deliveryTermsKnown.specialHandling}
                        </p>
                        <p>
                          <strong className="text-white">Refrigeration:</strong> {preview.deliveryTermsKnown.refrigerationRequired ? 'Refrigerated Storage Required' : 'Ambient Storage Standard'}
                        </p>
                        <div className="rounded bg-[#0c0c12] p-2 text-[11px] font-mono text-[#c5a059] border border-[#212130]">
                          Notice: {preview.deliveryTermsKnown.logisticsNotice}
                        </div>
                      </div>
                    </div>

                    {/* Item 18: QR Requirements */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <QrCode className="w-3.5 h-3.5 text-[#c5a059]" />
                        <span>Item 18 &bull; QR Code & Analytics Requirements</span>
                      </span>
                      <div className="text-xs text-zinc-300 space-y-1.5">
                        <p>
                          <strong className="text-white">Tracking Status:</strong>{' '}
                          <span className="text-emerald-400 font-medium">
                            {preview.qrRequirements.trackingEnabled ? 'Real-Time Engagement Enabled' : 'Disabled'}
                          </span>
                        </p>
                        <p className="break-all">
                          <strong className="text-white">Redirect Destination:</strong>{' '}
                          <span className="font-mono text-[#c5a059]">{preview.qrRequirements.customRedirectUrl || 'Configured via AquaBloom Brand Portal'}</span>
                        </p>
                        <p className="text-[11px] text-[#8e8e9f]">
                          Unique batch cryptographic telemetry embedded on bottle label matrix.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: RESPONSIBILITIES (Item 15) */}
              {(activeSection === 'ALL' || activeSection === 'RESPONSIBILITIES') && (
                <div id="section-responsibilities" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Item 15 &bull; Tripartite Division of Responsibilities</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Advertiser Responsibilities */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                      <div className="flex items-center space-x-2 pb-2 border-b border-[#1c1c28]">
                        <Megaphone className="w-4 h-4 text-[#c5a059]" />
                        <h4 className="text-xs font-bold text-white uppercase">
                          Advertiser Obligations
                        </h4>
                      </div>
                      <ul className="text-xs text-zinc-300 space-y-2 list-disc list-inside">
                        {preview.responsibilities.advertiserResponsibilities.map((resp, i) => (
                          <li key={i} className="leading-relaxed">{resp}</li>
                        ))}
                      </ul>
                    </div>

                    {/* Venue Responsibilities */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                      <div className="flex items-center space-x-2 pb-2 border-b border-[#1c1c28]">
                        <Building2 className="w-4 h-4 text-[#c5a059]" />
                        <h4 className="text-xs font-bold text-white uppercase">
                          Venue Obligations
                        </h4>
                      </div>
                      <ul className="text-xs text-zinc-300 space-y-2 list-disc list-inside">
                        {preview.responsibilities.venueResponsibilities.map((resp, i) => (
                          <li key={i} className="leading-relaxed">{resp}</li>
                        ))}
                      </ul>
                    </div>

                    {/* AquaBloom Responsibilities */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                      <div className="flex items-center space-x-2 pb-2 border-b border-[#1c1c28]">
                        <FileCheck2 className="w-4 h-4 text-[#c5a059]" />
                        <h4 className="text-xs font-bold text-white uppercase">
                          Platform Obligations
                        </h4>
                      </div>
                      <ul className="text-xs text-zinc-300 space-y-2 list-disc list-inside">
                        {preview.responsibilities.aquaBloomResponsibilities.map((resp, i) => (
                          <li key={i} className="leading-relaxed">{resp}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: COMMERCIAL COMPENSATION & PRICING RULES (Item 16) */}
              {(activeSection === 'ALL' || activeSection === 'COMMERCIAL') && (
                <div id="section-compensation-and-pricing-rules" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <DollarSign className="w-4 h-4" />
                    <span>Item 16 &bull; Commercial Compensation & Statutory Pricing Safeguards</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Negotiated Venue Compensation */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                        Negotiated Venue Compensation Share
                      </span>
                      <div className="text-2xl font-bold text-[#d8b26e] font-display">
                        {preview.compensationTerms.proposedPercentage.toFixed(1)}%{' '}
                        <span className="text-xs font-normal text-zinc-400">of Eligible Advertising Base</span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {preview.compensationTerms.termsDescription}
                      </p>
                      <div className="rounded-lg border border-[#c5a059]/30 bg-[#c5a059]/10 p-3 text-xs text-[#d8b26e] space-y-1">
                        <strong className="block font-semibold">Statutory Cap Protection Rule:</strong>
                        <p>{preview.compensationTerms.statutoryCapRule}</p>
                      </div>
                    </div>

                    {/* Strict Pricing Rule Banner (No fake pricing, formula explicit) */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-3">
                      <span className="text-[10px] uppercase font-bold text-[#8e8e9f] flex items-center space-x-1.5">
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                        <span>Commercial Pricing Governance Safeguard</span>
                      </span>
                      <div className="rounded-lg bg-[#0a0a10] p-3 border border-[#1e1e2c] text-xs space-y-2">
                        <div className="font-mono text-[#c5a059] font-bold">
                          Formula: {preview.pricingSafeguards.formulaNote}
                        </div>
                        <p className="text-[#8e8e9f] leading-relaxed">
                          In accordance with AquaBloom commercial rules, no final pricing or fabricated advertiser totals appear at this agreement review stage.
                        </p>
                        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-zinc-400 pt-1 border-t border-[#1c1c28]">
                          <span>&bull; Supplier internal cost: <strong>Excluded</strong></span>
                          <span>&bull; AquaBloom margin: <strong>Excluded</strong></span>
                          <span>&bull; Unconfirmed logistics: <strong>Excluded</strong></span>
                          <span>&bull; Unconfirmed taxes: <strong>Excluded</strong></span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: GOVERNANCE & POLICIES (Items 19, 20, 22) */}
              {(activeSection === 'ALL' || activeSection === 'POLICIES') && (
                <div id="section-governance-policies" className="space-y-4">
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Contractual Policies & Agreement Governance</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Item 19: Cancellation Terms */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                          Item 19 &bull; Cancellation Policy
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {preview.cancellationTerms.policyId}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white">
                        Cutoff Stage: {preview.cancellationTerms.cutoffStage}
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {preview.cancellationTerms.termsSummary}
                      </p>
                      <div className="text-[11px] text-[#c5a059] bg-[#0c0c12] p-2 rounded border border-[#1e1e2c]">
                        Principle: {preview.cancellationTerms.nonRecoverableCostPrinciple}
                      </div>
                    </div>

                    {/* Item 20: Renewal Terms */}
                    <div className="rounded-xl border border-[#232332] bg-[#101018] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] uppercase font-bold text-[#8e8e9f]">
                          Item 20 &bull; Renewal Policy
                        </span>
                        <span className="font-mono text-[10px] text-zinc-400">
                          {preview.renewalTerms.policyId}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white">
                        Type: {preview.renewalTerms.renewalType}
                      </h4>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {preview.renewalTerms.termsSummary}
                      </p>
                      <div className="text-[11px] text-[#c5a059] bg-[#0c0c12] p-2 rounded border border-[#1e1e2c]">
                        {preview.renewalTerms.renewalPolicyNote}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: VERSION TRAIL & HISTORICAL VERSIONS (Items 23, 24) */}
              {(activeSection === 'ALL' || activeSection === 'VERSIONS') && (
                <div id="section-version-trail" className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                      <History className="w-4 h-4" />
                      <span>Items 23 & 24 &bull; Current Version & Immutable Audit Trail</span>
                    </div>
                    <span className="text-xs text-[#8e8e9f] font-mono">
                      Total Versions: {preview.versionHistory.length}
                    </span>
                  </div>

                  {/* Item 23: Current Version Summary */}
                  <div className="rounded-xl border border-[#c5a059]/40 bg-[#12121c] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="rounded bg-[#c5a059] px-2 py-0.5 text-[11px] font-bold text-black font-mono">
                          Current Version {preview.currentVersion.versionNumber}
                        </span>
                        <span className="text-xs text-zinc-400 font-mono">
                          {preview.currentVersion.publicVersionId}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-200 mt-1">
                        {preview.currentVersion.changeSummary}
                      </p>
                    </div>
                    <div className="text-xs text-[#8e8e9f] font-mono shrink-0">
                      Created: {preview.currentVersion.createdDate}
                    </div>
                  </div>

                  {/* Item 24: Historical Versions Table / Cards */}
                  <div className="space-y-2">
                    <span className="text-[10px] uppercase font-bold text-[#8e8e9f] block">
                      Historical Version Records (Read-Only)
                    </span>
                    <div className="overflow-x-auto rounded-xl border border-[#212130] bg-[#101018]">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-[#1e1e2a] bg-[#0d0d14] text-[11px] uppercase tracking-wider text-[#8e8e9f]">
                          <tr>
                            <th className="py-3 px-4">Version</th>
                            <th className="py-3 px-4">Created Date</th>
                            <th className="py-3 px-4">Authorized Actor</th>
                            <th className="py-3 px-4">Change Summary</th>
                            <th className="py-3 px-4">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#181824] text-zinc-300">
                          {preview.versionHistory.map((ver) => (
                            <tr key={ver.id} className="hover:bg-[#141420] transition">
                              <td className="py-3 px-4 font-mono font-bold text-white">
                                v{ver.versionNumber}
                                {ver.versionNumber === preview.currentVersion.versionNumber && (
                                  <span className="ml-2 rounded bg-emerald-950/80 border border-emerald-700/60 px-1.5 py-0.2 text-[10px] text-emerald-400">
                                    Current
                                  </span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-[#8e8e9f] font-mono">
                                {ver.createdDate}
                              </td>
                              <td className="py-3 px-4">
                                <div className="font-medium text-white">{ver.actor.name}</div>
                                <div className="text-[10px] text-[#8e8e9f]">
                                  {ver.actor.role} &bull; {ver.actor.organizationName}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-zinc-300 max-w-xs truncate">
                                {ver.changeSummary}
                              </td>
                              <td className="py-3 px-4">
                                <button
                                  onClick={() => setSelectedHistoricalVersion(ver)}
                                  className="flex items-center space-x-1 rounded px-2.5 py-1 text-[11px] font-medium text-[#c5a059] bg-[#c5a059]/10 hover:bg-[#c5a059]/20 transition"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="border-t border-[#212130] bg-[#101018] px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-[#8e8e9f]">
            Status: <span className="font-semibold text-white">{preview?.agreementStatus}</span> &bull; Master Ref: <span className="text-[#c5a059] font-mono">{preview?.agreementReference}</span>
          </div>
          <button
            id="close-agreement-preview-footer-btn"
            onClick={onClose}
            className="min-h-[44px] min-w-[90px] rounded-lg border border-zinc-700 px-5 py-2 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
          >
            Close
          </button>
        </div>
      </div>

      {/* Historical Version Inspector Modal */}
      {selectedHistoricalVersion && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-[#2a2a3c] bg-[#12121c] p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#232334] pb-3">
              <div className="flex items-center space-x-2">
                <History className="w-5 h-5 text-[#c5a059]" />
                <h3 className="text-base font-bold">
                  Agreement Version {selectedHistoricalVersion.versionNumber}
                </h3>
              </div>
              <button
                onClick={() => setSelectedHistoricalVersion(null)}
                className="rounded p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <span className="text-[#8e8e9f] block">Version Public Identifier:</span>
                <span className="font-mono text-[#c5a059] font-medium">{selectedHistoricalVersion.publicVersionId}</span>
              </div>
              <div>
                <span className="text-[#8e8e9f] block">Created Date:</span>
                <span className="text-zinc-200">{selectedHistoricalVersion.createdDate}</span>
              </div>
              <div>
                <span className="text-[#8e8e9f] block">Author / Actor:</span>
                <span className="text-zinc-200 font-medium">{selectedHistoricalVersion.actor.name} ({selectedHistoricalVersion.actor.role})</span>
              </div>
              <div>
                <span className="text-[#8e8e9f] block">Organization:</span>
                <span className="text-zinc-200">{selectedHistoricalVersion.actor.organizationName}</span>
              </div>
              <div>
                <span className="text-[#8e8e9f] block">Change Summary:</span>
                <p className="bg-[#0a0a10] p-3 rounded border border-[#212130] text-zinc-200 mt-1">
                  {selectedHistoricalVersion.changeSummary}
                </p>
              </div>
              <div className="rounded bg-zinc-900 p-2.5 text-[11px] text-zinc-400 border border-zinc-800">
                Notice: Historical version terms are immutable and read-only. No modifications are permitted from this screen.
              </div>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedHistoricalVersion(null)}
                className="rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d8b26e]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Immutable Agreement Snapshot Modal */}
      <AgreementSnapshotModal
        agreementId={agreementId}
        isOpen={isSnapshotOpen}
        onClose={() => setIsSnapshotOpen(false)}
      />
    </div>
  );
};
