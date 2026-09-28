import React, { useState, useEffect } from 'react';
import { CampaignAgreementSharedView, CampaignAgreementStatus } from '../../types.js';
import { api } from '../../lib/api.js';
import { AgreementStatusBadge } from './AgreementStatusBadge.js';
import { AgreementDetailModal } from './AgreementDetailModal.js';
import {
  FileCheck2,
  Search,
  Filter,
  ArrowRight,
  Lock,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  Megaphone,
} from 'lucide-react';

interface Props {
  userRole: 'ADVERTISER' | 'VENUE' | 'ADMIN';
  campaignId?: string;
  venueId?: string;
  onRefreshNeeded?: () => void;
}

export const AgreementList: React.FC<Props> = ({
  userRole,
  campaignId,
  venueId,
  onRefreshNeeded,
}) => {
  const [agreements, setAgreements] = useState<CampaignAgreementSharedView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAgreementId, setSelectedAgreementId] = useState<string | null>(null);

  const fetchAgreements = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getCampaignAgreements({
        campaignId,
        venueId,
        status: statusFilter !== 'ALL' ? statusFilter : undefined,
      });
      if (res.error) {
        throw new Error(res.error.message || 'Failed to fetch Campaign Agreements.');
      }
      setAgreements(res.data || []);
    } catch (err: any) {
      setError(err.message || 'Error loading agreements.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgreements();
  }, [campaignId, venueId, statusFilter]);

  const filtered = agreements.filter((agr) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      agr.publicId.toLowerCase().includes(q) ||
      agr.campaign.name.toLowerCase().includes(q) ||
      agr.counterparty.name.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Public ID, Campaign, or Counterparty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#12121b] border border-[#232332] rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#c5a059]"
          />
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <Filter className="w-3.5 h-3.5 text-zinc-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#12121b] border border-[#232332] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#c5a059]"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="AWAITING_ADVERTISER_CONFIRMATION">Awaiting Advertiser</option>
            <option value="AWAITING_VENUE_CONFIRMATION">Awaiting Venue</option>
            <option value="READY_TO_LOCK">Ready to Lock</option>
            <option value="LOCKED">Commercially Locked</option>
          </select>
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="py-12 text-center text-zinc-500 text-xs">
          Loading Campaign Agreements...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl border border-rose-800/50 bg-rose-950/30 text-rose-300 text-xs">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#232332] p-8 text-center space-y-2">
          <FileCheck2 className="w-8 h-8 text-zinc-600 mx-auto" />
          <p className="text-sm font-semibold text-zinc-400">No Campaign Agreements found</p>
          <p className="text-xs text-zinc-600 max-w-sm mx-auto">
            Agreements are generated automatically when a proposal reaches mutual confirmation (Ready for Agreement).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((agr) => (
            <div
              key={agr.agreementId}
              onClick={() => setSelectedAgreementId(agr.agreementId)}
              className="cursor-pointer rounded-xl border border-[#232334] bg-[#12121b] hover:border-[#383850] p-4 transition text-white space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <span className="font-mono text-xs font-bold text-[#c5a059]">
                    {agr.publicId}
                  </span>
                  <AgreementStatusBadge status={agr.status} size="sm" />
                </div>
                <div className="text-[11px] text-zinc-500 flex items-center space-x-3">
                  <span>Version {agr.currentVersionNumber}</span>
                  <span>Ref: {agr.agreementReference}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Campaign</span>
                  <span className="font-bold text-white truncate block">{agr.campaign.name}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">
                    {userRole === 'VENUE' ? 'Advertiser' : 'Venue Partner'}
                  </span>
                  <span className="font-bold text-white truncate block">{agr.counterparty.name}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Agreed Terms</span>
                  <span className="font-mono text-white font-medium">
                    {agr.terms.campaignQuantity.toLocaleString()} bottles &bull; {agr.terms.campaignDuration?.value || 4} {agr.terms.campaignDuration?.unit?.toLowerCase() || 'weeks'}
                  </span>
                </div>
              </div>

              {/* Status footer with confirmation indicators */}
              <div className="pt-2 border-t border-[#1c1c28] flex items-center justify-between text-xs">
                <div className="flex items-center space-x-3 text-[11px] text-zinc-400">
                  <span className="flex items-center space-x-1">
                    <span>Advertiser:</span>
                    {agr.advertiserConfirmed ? (
                      <span className="text-emerald-400 font-medium">Confirmed</span>
                    ) : (
                      <span className="text-amber-400">Pending</span>
                    )}
                  </span>
                  <span>&bull;</span>
                  <span className="flex items-center space-x-1">
                    <span>Venue:</span>
                    {agr.venueConfirmed ? (
                      <span className="text-emerald-400 font-medium">Confirmed</span>
                    ) : (
                      <span className="text-amber-400">Pending</span>
                    )}
                  </span>
                </div>

                <div className="flex items-center space-x-1 text-[#c5a059] text-xs font-semibold hover:underline">
                  <span>Review Agreement</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedAgreementId && (
        <AgreementDetailModal
          agreementId={selectedAgreementId}
          isOpen={!!selectedAgreementId}
          onClose={() => setSelectedAgreementId(null)}
          onUpdate={() => {
            fetchAgreements();
            if (onRefreshNeeded) onRefreshNeeded();
          }}
        />
      )}
    </div>
  );
};
