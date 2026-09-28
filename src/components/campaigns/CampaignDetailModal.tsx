/**
 * AquaBloom Campaign Detail & Specification Modal
 * 
 * Step 4: Displays the full internal campaign specification,
 * sanitization projection (Marketplace Opportunity View),
 * readiness validation checklist, and version history.
 */

import React, { useState, useEffect } from 'react';
import {
  Campaign,
  CampaignVersion,
  CampaignOpportunityView,
  CampaignValidationResult,
} from '../../types.js';
import { api } from '../../lib/api.js';
import {
  X,
  ShieldCheck,
  Eye,
  History,
  FileCheck,
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  MapPin,
  Calendar,
  Box,
  Edit,
  ArrowRight,
  RotateCcw,
  Trash2,
} from 'lucide-react';

interface CampaignDetailModalProps {
  campaignId: string;
  onClose: () => void;
  onEdit: (campaign: Campaign) => void;
  onRefresh: () => void;
}

export const CampaignDetailModal: React.FC<CampaignDetailModalProps> = ({
  campaignId,
  onClose,
  onEdit,
  onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'DETAILS' | 'OPPORTUNITY' | 'VALIDATION' | 'VERSIONS'>('DETAILS');
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [versions, setVersions] = useState<CampaignVersion[]>([]);
  const [opportunity, setOpportunity] = useState<CampaignOpportunityView | null>(null);
  const [validation, setValidation] = useState<CampaignValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const loadData = async () => {
    setIsLoading(true);
    setActionError(null);
    try {
      const campRes = await api.getCampaign(campaignId);
      if (campRes.data) {
        setCampaign(campRes.data);
      } else if (campRes.error) {
        setActionError(campRes.error.message);
      }

      // Load versions
      const verRes = await api.getCampaignVersions(campaignId);
      if (verRes.data) {
        setVersions(verRes.data);
      }

      // Load opportunity view
      const oppRes = await api.getCampaignOpportunity(campaignId);
      if (oppRes.data) {
        setOpportunity(oppRes.data);
      }

      // Load validation
      const valRes = await api.validateCampaignDraft(campaignId);
      if (valRes.data) {
        setValidation(valRes.data);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to load campaign details.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [campaignId]);

  const handlePrepareForMatching = async () => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await api.prepareCampaignForMatching(campaignId);
      if (res.error) {
        setActionError(res.error.message);
        if (res.data?.validationResult) {
          setValidation(res.data.validationResult);
          setActiveTab('VALIDATION');
        }
      } else {
        await loadData();
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to prepare campaign for matching.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRevertToDraft = async () => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await api.revertCampaignToDraft(campaignId);
      if (res.error) {
        setActionError(res.error.message);
      } else {
        await loadData();
        onRefresh();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to revert campaign to draft.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!window.confirm('Are you sure you want to delete this draft campaign? This cannot be undone.')) {
      return;
    }
    setIsProcessing(true);
    try {
      const res = await api.deleteDraftCampaign(campaignId);
      if (res.error) {
        setActionError(res.error.message);
        setIsProcessing(false);
      } else {
        onRefresh();
        onClose();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete campaign.');
      setIsProcessing(false);
    }
  };

  if (isLoading || !campaign) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="rounded-xl border border-[#262638] bg-[#0d0d14] p-8 text-center text-sm text-[#88889c]">
          Loading campaign specifications...
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#0c0c12] border border-[#232332] rounded-2xl shadow-2xl text-white my-8 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#1c1c28] bg-[#11111a] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-xs font-bold text-[#c5a059]">
                {campaign.publicCampaignId}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  campaign.status === 'READY_FOR_MATCHING'
                    ? 'border border-emerald-800/50 bg-emerald-950/40 text-emerald-400'
                    : 'border border-amber-800/50 bg-amber-950/40 text-amber-400'
                }`}
              >
                {campaign.status}
              </span>
              <span className="rounded-full border border-[#2b2b3d] bg-[#161622] px-2 py-0.5 text-[10px] font-mono text-[#9e9eb4]">
                v{campaign.currentVersionNumber}
              </span>
            </div>
            <h2 className="text-xl font-display font-bold text-white mt-1.5">{campaign.name}</h2>
            <p className="text-xs text-[#808096] mt-0.5">
              Category: <span className="text-white font-medium">{campaign.category}</span> &bull; Last Modified:{' '}
              <span className="text-white">{new Date(campaign.updatedAt).toLocaleDateString()}</span>
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => onEdit(campaign)}
              className="rounded-lg border border-[#c5a059]/40 bg-[#161622] px-3 py-1.5 text-xs font-semibold text-[#d4af37] hover:bg-[#1e1e2d] flex items-center space-x-1.5"
            >
              <Edit className="h-3.5 w-3.5" />
              <span>Edit</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-lg p-2 text-[#7d7d91] hover:bg-[#1a1a26] hover:text-white transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-[#1c1c28] bg-[#09090e] px-6 text-xs font-medium">
          <button
            onClick={() => setActiveTab('DETAILS')}
            className={`py-3 px-4 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'DETAILS'
                ? 'border-[#c5a059] text-[#c5a059] font-bold'
                : 'border-transparent text-[#7e7e94] hover:text-white'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>Full Specifications</span>
          </button>

          <button
            onClick={() => setActiveTab('OPPORTUNITY')}
            className={`py-3 px-4 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'OPPORTUNITY'
                ? 'border-[#c5a059] text-[#c5a059] font-bold'
                : 'border-transparent text-[#7e7e94] hover:text-white'
            }`}
          >
            <Eye className="h-4 w-4" />
            <span>Marketplace Preview (Sanitized)</span>
          </button>

          <button
            onClick={() => setActiveTab('VALIDATION')}
            className={`py-3 px-4 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'VALIDATION'
                ? 'border-[#c5a059] text-[#c5a059] font-bold'
                : 'border-transparent text-[#7e7e94] hover:text-white'
            }`}
          >
            <FileCheck className="h-4 w-4" />
            <span>Validation Checklist</span>
            {validation && !validation.isValid && (
              <span className="rounded-full bg-red-950 px-1.5 py-0.2 text-[9px] text-red-400 border border-red-800">
                {validation.errors.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('VERSIONS')}
            className={`py-3 px-4 flex items-center space-x-2 border-b-2 transition ${
              activeTab === 'VERSIONS'
                ? 'border-[#c5a059] text-[#c5a059] font-bold'
                : 'border-transparent text-[#7e7e94] hover:text-white'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Version History ({versions.length})</span>
          </button>
        </div>

        {/* Action Error Banner */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 rounded-lg border border-red-800/50 bg-red-950/30 text-xs text-red-300 flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Tab Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto">
          {/* TAB 1: DETAILS */}
          {activeTab === 'DETAILS' && (
            <div className="space-y-6">
              {/* Bottle & Volume High-Level Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl border border-[#212130] bg-[#111118] p-4">
                  <span className="text-[10px] uppercase font-bold text-[#737385] tracking-wider">
                    Required Quantity
                  </span>
                  <p className="mt-1 font-mono text-base font-bold text-[#c5a059]">
                    {campaign.bottleRequirements.requiredQuantity.toLocaleString()} Bottles
                  </p>
                </div>
                <div className="rounded-xl border border-[#212130] bg-[#111118] p-4">
                  <span className="text-[10px] uppercase font-bold text-[#737385] tracking-wider">
                    Volume &amp; Material
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {campaign.bottleRequirements.volumeLabel} &bull; {campaign.bottleRequirements.preferredMaterial}
                  </p>
                </div>
                <div className="rounded-xl border border-[#212130] bg-[#111118] p-4">
                  <span className="text-[10px] uppercase font-bold text-[#737385] tracking-wider">
                    Duration
                  </span>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {campaign.timing.duration.value} {campaign.timing.duration.unit.toLowerCase()}
                  </p>
                </div>
                <div className="rounded-xl border border-[#212130] bg-[#111118] p-4">
                  <span className="text-[10px] uppercase font-bold text-[#737385] tracking-wider">
                    Target Start Period
                  </span>
                  <p className="mt-1 text-sm font-semibold text-[#d4af37]">
                    {campaign.timing.preferredStartPeriod.label}
                  </p>
                </div>
              </div>

              {/* Narrative & Objective */}
              <div className="rounded-xl border border-[#212130] bg-[#0e0e16] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  Campaign Narrative &amp; Primary Objective
                </h3>
                <p className="mt-2 text-sm text-[#e0e0ec] leading-relaxed">
                  {campaign.description || 'No detailed narrative provided for this campaign.'}
                </p>
                <div className="mt-3 flex items-center space-x-2 text-xs text-[#8f8fa4]">
                  <span className="font-semibold text-white">Objective:</span>
                  <span>{campaign.objective}</span>
                </div>
              </div>

              {/* Target Audience & Venues */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#212130] bg-[#0e0e16] p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    Target Audience Demographics
                  </h3>
                  <p className="mt-2 text-xs text-[#cfcfe0]">
                    {campaign.targetAudience.demographics || 'Not specified'}
                  </p>
                  <div className="mt-3">
                    <span className="text-[10px] uppercase font-bold text-[#757588]">Characteristics:</span>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {campaign.targetAudience.characteristics.map((c, idx) => (
                        <span
                          key={idx}
                          className="rounded-full border border-[#28283a] bg-[#141420] px-2.5 py-0.5 text-[11px] text-[#cfcfe0]"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-[#212130] bg-[#0e0e16] p-5">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    Venue Types &amp; Locations
                  </h3>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {campaign.venueRequirements.preferredVenueTypes.map((vt, idx) => (
                      <span
                        key={idx}
                        className="rounded-md border border-[#c5a059]/30 bg-[#c5a059]/10 px-2 py-0.5 text-[11px] text-[#d4af37]"
                      >
                        {vt}
                      </span>
                    ))}
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <span className="text-[10px] uppercase font-bold text-[#757588]">Target Cities:</span>
                    {campaign.venueRequirements.preferredLocations.map((loc, idx) => (
                      <div key={idx} className="flex items-center space-x-1.5 text-xs text-[#c0c0d4]">
                        <MapPin className="h-3 w-3 text-[#c5a059]" />
                        <span>{loc.city}</span>
                        {loc.area && <span className="text-[#7e7e94]">({loc.area})</span>}
                        <span className="text-[#646477]">&bull; {loc.country}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Placement & Distribution */}
              <div className="rounded-xl border border-[#212130] bg-[#0e0e16] p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                  Placement &amp; Display Standards
                </h3>
                <p className="mt-2 text-xs text-[#cfcfe0] leading-relaxed">
                  {campaign.distributionRequirements.placementDetails}
                </p>
                <div className="mt-3 flex items-center space-x-4 text-xs text-[#8f8fa4]">
                  <div>
                    <span className="font-semibold text-white">Refrigerated Display:</span>{' '}
                    {campaign.distributionRequirements.refrigerationRequired ? 'Required' : 'Ambient acceptable'}
                  </div>
                  <div>
                    <span className="font-semibold text-white">Collaboration:</span>{' '}
                    {campaign.collaborationRequirement.status}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: OPPORTUNITY PREVIEW */}
          {activeTab === 'OPPORTUNITY' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/20 p-4 text-xs text-emerald-200">
                <div className="flex items-center space-x-2 font-bold text-emerald-400 mb-1">
                  <ShieldCheck className="h-4 w-4" />
                  <span>Sanitization Verification Active</span>
                </div>
                This projection reflects strictly what prospective venues and matching algorithms see.
                Internal advertiser ID, payment credentials, contract notes, and margin structures are strictly omitted.
              </div>

              {opportunity && (
                <div className="rounded-xl border border-[#28283a] bg-[#101018] p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-[#1c1c28] pb-4">
                    <div>
                      <span className="font-mono text-xs font-bold text-[#c5a059]">
                        {opportunity.publicCampaignId}
                      </span>
                      <h3 className="text-lg font-bold text-white mt-1">{opportunity.name}</h3>
                      <p className="text-xs text-[#8d8da0]">Industry: {opportunity.category}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-[#727284]">Target Volume</span>
                      <p className="font-mono text-base font-bold text-[#c5a059]">
                        {(opportunity.requiredQuantity || opportunity.bottleRequirements?.requiredQuantity || 0).toLocaleString()} Units
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="rounded-lg bg-[#141420] p-3">
                      <span className="text-[10px] text-[#78788c] uppercase font-bold">Venue Match Types</span>
                      <p className="mt-1 font-semibold text-white">
                        {opportunity.preferredVenueTypes?.join(', ') || 'Any Venue'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#141420] p-3">
                      <span className="text-[10px] text-[#78788c] uppercase font-bold">Target Geography</span>
                      <p className="mt-1 font-semibold text-white">
                        {opportunity.preferredLocations?.map((l: any) => l.city).join(', ') || 'Nationwide'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-[#141420] p-3">
                      <span className="text-[10px] text-[#78788c] uppercase font-bold">Start Window</span>
                      <p className="mt-1 font-semibold text-white">{opportunity.preferredStartPeriod?.label || 'Flexible'}</p>
                    </div>
                  </div>

                  <div className="border-t border-[#1c1c28] pt-4 text-xs">
                    <span className="text-[10px] text-[#78788c] uppercase font-bold">Published Budget Range</span>
                    <p className="mt-1 font-mono text-sm text-[#d4af37]">
                      {opportunity.publishedBudget?.disclosed && opportunity.publishedBudget?.minAmount
                        ? `₹${opportunity.publishedBudget.minAmount.toLocaleString()} – ₹${opportunity.publishedBudget.maxAmount?.toLocaleString()} INR`
                        : (opportunity.publishedBudget?.displayRange || 'Budget disclosed on mutual matching')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: VALIDATION */}
          {activeTab === 'VALIDATION' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">Campaign Readiness Checklist</h3>
                  <p className="text-xs text-[#838396]">
                    Backend rules verify all mandatory operational parameters before venue matching.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  {validation?.isValid ? (
                    <span className="rounded-full border border-emerald-800 bg-emerald-950/40 px-3 py-1 text-xs font-bold text-emerald-400 flex items-center space-x-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Ready for Matching</span>
                    </span>
                  ) : (
                    <span className="rounded-full border border-amber-800 bg-amber-950/40 px-3 py-1 text-xs font-bold text-amber-400 flex items-center space-x-1.5">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>Incomplete ({validation?.errors.length} Issues)</span>
                    </span>
                  )}
                </div>
              </div>

              {validation && validation.errors.length > 0 ? (
                <div className="space-y-2">
                  {validation.errors.map((err, idx) => (
                    <div
                      key={idx}
                      className="flex items-start space-x-3 rounded-lg border border-red-900/40 bg-red-950/20 p-3 text-xs"
                    >
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        {err.field && <span className="font-mono text-red-300 font-bold">[{err.field}] </span>}
                        <span className="text-red-200">{err.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-6 text-center text-xs text-emerald-200 space-y-2">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                  <p className="font-bold text-sm text-emerald-300">All Readiness Checks Passed</p>
                  <p className="text-[#a5c4b1] max-w-md mx-auto">
                    This campaign satisfies all authoritative backend constraints. It is eligible to enter the venue matching pipeline.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: VERSIONS */}
          {activeTab === 'VERSIONS' && (
            <div className="space-y-4">
              <p className="text-xs text-[#8e8ea2]">
                Every modification creates an immutable audit version, capturing who changed what and when.
              </p>
              <div className="space-y-3">
                {versions.map((v) => (
                  <div
                    key={v.id}
                    className="rounded-xl border border-[#212130] bg-[#101018] p-4 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-[#c5a059]">v{v.versionNumber}</span>
                        <span className="font-mono text-[10px] text-[#7a7a8e]">{v.publicVersionId}</span>
                      </div>
                      <span className="text-[10px] text-[#7a7a8e]">
                        {new Date(v.createdAt).toLocaleString()}
                      </span>
                    </div>

                    <div className="text-xs text-[#d2d2e2]">
                      <span className="font-semibold text-white">Reason:</span> {v.changeReason}
                    </div>

                    {v.changedFields.length > 0 && (
                      <div className="flex items-center space-x-1.5 text-[11px] text-[#86869a]">
                        <span>Fields modified:</span>
                        <div className="flex flex-wrap gap-1">
                          {v.changedFields.map((f, idx) => (
                            <span
                              key={idx}
                              className="rounded bg-[#1a1a28] px-1.5 py-0.5 font-mono text-[#c5a059] text-[10px]"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Bar Footer */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-[#1c1c28] bg-[#0c0c12]">
          <div className="flex items-center space-x-2">
            {campaign.status === 'DRAFT' && (
              <button
                type="button"
                onClick={handleDeleteDraft}
                disabled={isProcessing}
                className="rounded-lg border border-red-900/40 bg-red-950/20 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-950/40 disabled:opacity-50 flex items-center space-x-1"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete Draft</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {campaign.status === 'READY_FOR_MATCHING' ? (
              <button
                type="button"
                onClick={handleRevertToDraft}
                disabled={isProcessing}
                className="rounded-lg border border-[#303044] bg-[#161622] px-4 py-2 text-xs font-semibold text-white hover:bg-[#202030] disabled:opacity-50 flex items-center space-x-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5 text-amber-400" />
                <span>Revert to Draft for Editing</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handlePrepareForMatching}
                disabled={isProcessing}
                className="rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] disabled:opacity-50 flex items-center space-x-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Submit for Venue Matching</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
