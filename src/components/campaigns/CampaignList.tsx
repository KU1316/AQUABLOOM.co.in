/**
 * AquaBloom Campaign Management View
 * 
 * Step 4: Primary interface for Advertisers to view, filter,
 * author, edit, validate, and prepare campaigns for venue matching.
 */

import React, { useState, useEffect } from 'react';
import { Campaign } from '../../types.js';
import { api } from '../../lib/api.js';
import { CampaignEditorModal } from './CampaignEditorModal.js';
import { CampaignDetailModal } from './CampaignDetailModal.js';
import {
  Plus,
  Search,
  Filter,
  Layers,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  Eye,
  Edit,
  RotateCcw,
  Check,
  Calendar,
  MapPin,
} from 'lucide-react';

export interface CampaignListProps {
  onDiscoverVenues?: (campaignId: string) => void;
}

export const CampaignList: React.FC<CampaignListProps> = ({ onDiscoverVenues }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DRAFT' | 'READY_FOR_MATCHING'>('ALL');

  // Modal states
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.getCampaigns();
      if (res.error) {
        setErrorMessage(res.error.message);
      } else if (res.data) {
        setCampaigns(res.data);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load campaigns.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadCampaigns();
  }, []);

  const handleOpenCreate = () => {
    setEditingCampaign(null);
    setIsEditorOpen(true);
  };

  const handleOpenEdit = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setIsEditorOpen(true);
  };

  const handleEditorSuccess = (_saved: Campaign) => {
    setIsEditorOpen(false);
    loadCampaigns();
  };

  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.publicCampaignId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.category.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || c.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Calculate Metrics
  const totalCampaigns = campaigns.length;
  const draftCount = campaigns.filter((c) => c.status === 'DRAFT').length;
  const readyCount = campaigns.filter((c) => c.status === 'READY_FOR_MATCHING').length;
  const totalBottles = campaigns.reduce(
    (sum, c) => sum + (c.bottleRequirements?.requiredQuantity || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Top Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[#232332] bg-[#0c0c11] p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#7e7e94]">
            Total Campaigns
          </span>
          <p className="mt-1 font-mono text-xl font-bold text-white">{totalCampaigns}</p>
        </div>
        <div className="rounded-xl border border-[#232332] bg-[#0c0c11] p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">
            In Draft
          </span>
          <p className="mt-1 font-mono text-xl font-bold text-amber-400">{draftCount}</p>
        </div>
        <div className="rounded-xl border border-[#232332] bg-[#0c0c11] p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">
            Ready for Matching
          </span>
          <p className="mt-1 font-mono text-xl font-bold text-emerald-400">{readyCount}</p>
        </div>
        <div className="rounded-xl border border-[#232332] bg-[#0c0c11] p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#c5a059]">
            Total Volume Target
          </span>
          <p className="mt-1 font-mono text-xl font-bold text-[#d4af37]">
            {totalBottles.toLocaleString()} <span className="text-xs font-normal text-[#8e8ea2]">bottles</span>
          </p>
        </div>
      </div>

      {/* Control / Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-[#1e1e2b] bg-[#0d0d14] p-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#68687a]" />
            <input
              type="text"
              placeholder="Search by name, ID, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-[#262638] bg-[#12121c] pl-9 pr-3 py-2 text-xs text-white placeholder-[#5d5d73] focus:border-[#c5a059] focus:outline-none"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-lg border border-[#262638] bg-[#12121c] px-3 py-2 text-xs text-white focus:border-[#c5a059] focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft Only</option>
            <option value="READY_FOR_MATCHING">Ready for Matching</option>
          </select>
        </div>

        <button
          onClick={handleOpenCreate}
          className="w-full sm:w-auto rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition flex items-center justify-center space-x-1.5 shadow-lg shadow-[#c5a059]/10"
        >
          <Plus className="h-4 w-4" />
          <span>Author New Campaign</span>
        </button>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-red-800/40 bg-red-950/20 text-xs text-red-300 flex items-center space-x-2">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Campaign List Table / Grid */}
      {isLoading ? (
        <div className="rounded-xl border border-[#20202e] bg-[#0c0c11] p-12 text-center text-xs text-[#737385]">
          Loading campaign records from authoritative database...
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <div className="rounded-xl border border-[#20202e] bg-[#0c0c11] p-12 text-center">
          <Layers className="h-10 w-10 text-[#4d4d61] mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Campaigns Found</h3>
          <p className="mt-1 text-xs text-[#808096] max-w-md mx-auto">
            {searchQuery || statusFilter !== 'ALL'
              ? 'No campaigns match the specified search filters.'
              : 'Start your high-impact physical hydration advertising journey by authoring your first brand campaign.'}
          </p>
          <button
            onClick={handleOpenCreate}
            className="mt-4 rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37]"
          >
            Author Campaign Now
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCampaigns.map((camp) => (
            <div
              key={camp.id}
              className="rounded-xl border border-[#20202e] bg-[#0d0d14] p-5 hover:border-[#38384d] transition text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1a1a26] pb-4">
                <div className="flex items-center space-x-3">
                  <span className="font-mono font-bold text-[#c5a059]">
                    {camp.publicCampaignId}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      camp.status === 'READY_FOR_MATCHING'
                        ? 'border border-emerald-800/50 bg-emerald-950/40 text-emerald-400'
                        : 'border border-amber-800/50 bg-amber-950/40 text-amber-400'
                    }`}
                  >
                    {camp.status}
                  </span>
                  <span className="rounded-full border border-[#28283a] bg-[#141420] px-2 py-0.5 text-[10px] font-mono text-[#8a8a9e]">
                    v{camp.currentVersionNumber}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  {onDiscoverVenues && (
                    <button
                      onClick={() => onDiscoverVenues(camp.id)}
                      className="rounded-md border border-[#c5a059] bg-[#c5a059] px-3 py-1.5 text-xs font-bold text-black hover:bg-[#d4af37] transition flex items-center space-x-1"
                    >
                      <Sparkles className="h-3 w-3 text-black" />
                      <span>Match Venues</span>
                    </button>
                  )}
                  <button
                    onClick={() => setSelectedCampaignId(camp.id)}
                    className="rounded-md border border-[#2b2b3d] bg-[#14141e] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1e1e2d] flex items-center space-x-1"
                  >
                    <Eye className="h-3 w-3 text-[#c5a059]" />
                    <span>View Specs</span>
                  </button>
                  <button
                    onClick={() => handleOpenEdit(camp)}
                    className="rounded-md border border-[#c5a059]/40 bg-[#161622] px-3 py-1.5 text-xs font-semibold text-[#d4af37] hover:bg-[#1f1f2e] flex items-center space-x-1"
                  >
                    <Edit className="h-3 w-3" />
                    <span>Edit</span>
                  </button>
                </div>
              </div>

              {/* Title & Specs */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <h4 className="text-sm font-bold text-white">{camp.name}</h4>
                  <p className="mt-1 text-xs text-[#8c8ca0] line-clamp-2">
                    {camp.description || 'No detailed campaign narrative provided.'}
                  </p>
                  <div className="mt-2 flex items-center space-x-2 text-[11px] text-[#717185]">
                    <span>Category: <strong className="text-[#a5a5bb]">{camp.category}</strong></span>
                    <span>&bull;</span>
                    <span>Objective: <strong className="text-[#a5a5bb]">{camp.objective}</strong></span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[#727285] tracking-wider">
                    Volume &amp; Bottle
                  </span>
                  <p className="mt-1 font-mono text-sm font-bold text-[#c5a059]">
                    {camp.bottleRequirements?.requiredQuantity?.toLocaleString()} Units
                  </p>
                  <p className="text-[11px] text-[#9393a6]">
                    {camp.bottleRequirements?.volumeLabel} &bull; {camp.bottleRequirements?.preferredMaterial}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[#727285] tracking-wider">
                    Timing &amp; Geography
                  </span>
                  <div className="mt-1 flex items-center space-x-1 text-xs text-white">
                    <Calendar className="h-3 w-3 text-[#c5a059]" />
                    <span>{camp.timing?.duration?.value} {camp.timing?.duration?.unit?.toLowerCase()}</span>
                    <span className="text-[#727285]">({camp.timing?.preferredStartPeriod?.label})</span>
                  </div>
                  <div className="mt-1 flex items-center space-x-1 text-[11px] text-[#9393a6]">
                    <MapPin className="h-3 w-3 text-[#727285]" />
                    <span>
                      {camp.venueRequirements?.preferredLocations?.map((l) => l.city).join(', ') || 'Nationwide'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Editor Modal */}
      {isEditorOpen && (
        <CampaignEditorModal
          campaign={editingCampaign}
          onClose={() => setIsEditorOpen(false)}
          onSuccess={handleEditorSuccess}
        />
      )}

      {/* Detail Modal */}
      {selectedCampaignId && (
        <CampaignDetailModal
          campaignId={selectedCampaignId}
          onClose={() => setSelectedCampaignId(null)}
          onEdit={(camp) => {
            setSelectedCampaignId(null);
            handleOpenEdit(camp);
          }}
          onRefresh={loadCampaigns}
        />
      )}
    </div>
  );
};
