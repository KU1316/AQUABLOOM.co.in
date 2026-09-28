import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api.js';
import { Proposal, UserRole } from '../../types.js';
import { ProposalStatusBadge } from './ProposalStatusBadge.js';
import { ProposalDetailModal } from './ProposalDetailModal.js';
import {
  Layers,
  Search,
  Filter,
  Megaphone,
  Building2,
  Calendar,
  DollarSign,
  ChevronRight,
  Plus,
  RefreshCw,
  AlertCircle,
  FileCheck2,
  Clock,
  Sparkles,
  Info,
} from 'lucide-react';

interface ProposalListProps {
  currentUserRole: UserRole;
  currentUserId: string;
  onInitiateNewProposal?: () => void;
}

export const ProposalList: React.FC<ProposalListProps> = ({
  currentUserRole,
  currentUserId,
  onInitiateNewProposal,
}) => {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

  useEffect(() => {
    loadProposals();
  }, []);

  async function loadProposals(isRefresh = false) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await api.getProposals();
      if (res.error) {
        setError(res.error.message || 'Failed to load proposals.');
      } else if (res.data) {
        setProposals(res.data);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  // Filtered proposals
  const filteredProposals = proposals.filter((p) => {
    const matchesSearch =
      searchQuery.trim() === '' ||
      p.publicProposalId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.campaignName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.advertiserBrandName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.venueName.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (statusFilter === 'ALL') return true;
    if (statusFilter === 'READY_FOR_AGREEMENT') return p.status === 'READY_FOR_AGREEMENT';
    if (statusFilter === 'UNDER_NEGOTIATION')
      return p.status === 'UNDER_NEGOTIATION' || p.status === 'VIEWED' || p.status === 'SENT';
    if (statusFilter === 'ACCEPTED') return p.status === 'ACCEPTED';
    if (statusFilter === 'CLOSED')
      return p.status === 'DECLINED' || p.status === 'WITHDRAWN' || p.status === 'EXPIRED';

    return p.status === statusFilter;
  });

  // Status breakdown metrics
  const totalCount = proposals.length;
  const underNegotiationCount = proposals.filter(
    (p) => p.status === 'UNDER_NEGOTIATION' || p.status === 'SENT' || p.status === 'VIEWED'
  ).length;
  const readyForAgreementCount = proposals.filter((p) => p.status === 'READY_FOR_AGREEMENT').length;

  return (
    <div className="space-y-6">
      {/* Top Banner with Master Rule reminder */}
      <div className="rounded-xl border border-[#212130] bg-[#0c0c12] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
            <Layers className="h-4 w-4" />
            <span>Step 6 &bull; Proposal & Negotiation Workspace</span>
          </div>
          <h2 className="text-lg font-bold text-white mt-1">
            Active Campaign Proposals & Negotiations
          </h2>
          <p className="text-xs text-[#8e8e9f] mt-1 max-w-2xl">
            A proposal connects <strong>1 Advertiser + 1 Venue + 1 Campaign</strong>. Manage counter-offers, inspect immutable version histories, and complete mutual confirmation. (Campaign Agreements will be generated in Step 7).
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button
            onClick={() => loadProposals(true)}
            disabled={refreshing}
            className="flex items-center space-x-1.5 rounded-lg border border-[#272738] bg-[#14141e] px-3 py-2 text-xs font-semibold text-[#a5a5bb] hover:text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          {currentUserRole === 'ADVERTISER' && onInitiateNewProposal && (
            <button
              onClick={onInitiateNewProposal}
              className="flex items-center space-x-1.5 rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition"
            >
              <Plus className="h-4 w-4" />
              <span>Explore Marketplace</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="rounded-xl border border-[#1f1f2e] bg-[#101018] p-4">
          <div className="text-[10px] uppercase font-bold text-[#717182]">Total Proposals</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{totalCount}</div>
          <div className="text-[11px] text-[#5a5a6b]">Across all campaigns</div>
        </div>

        <div className="rounded-xl border border-amber-900/30 bg-amber-950/15 p-4">
          <div className="text-[10px] uppercase font-bold text-amber-400">Under Active Negotiation</div>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">{underNegotiationCount}</div>
          <div className="text-[11px] text-amber-500/80">Pending review or counter</div>
        </div>

        <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/15 p-4">
          <div className="text-[10px] uppercase font-bold text-emerald-400">Ready for Agreement</div>
          <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">
            {readyForAgreementCount}
          </div>
          <div className="text-[11px] text-emerald-500/80">Mutually confirmed (Step 7 ready)</div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-xl border border-[#1e1e2c] bg-[#111119] p-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#66667a]" />
          <input
            type="text"
            placeholder="Search proposals, campaigns, or venues..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-[#272738] bg-[#151522] pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#616172] focus:border-[#c5a059] focus:outline-none"
          />
        </div>

        {/* Status Tabs */}
        <div className="flex space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All' },
            { id: 'UNDER_NEGOTIATION', label: 'Under Negotiation' },
            { id: 'READY_FOR_AGREEMENT', label: 'Ready for Agreement' },
            { id: 'CLOSED', label: 'Closed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-[#c5a059] text-black'
                  : 'bg-[#181824] text-[#8e8ea6] hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Proposals List */}
      {loading ? (
        <div className="rounded-xl border border-[#20202e] bg-[#0d0d14] p-12 text-center text-xs text-[#78788a]">
          Loading proposals...
        </div>
      ) : filteredProposals.length === 0 ? (
        <div className="rounded-xl border border-[#20202e] bg-[#0d0d14] p-12 text-center text-xs text-[#78788a] space-y-3">
          <Layers className="h-8 w-8 text-[#4a4a5e] mx-auto" />
          <div className="text-white font-semibold">No Proposals Found</div>
          <p className="max-w-md mx-auto text-[#6f6f82]">
            {searchQuery
              ? 'No proposals match your search query.'
              : currentUserRole === 'ADVERTISER'
              ? 'You have not submitted any proposals yet. Explore the Venue Marketplace to find venues and submit proposals.'
              : 'You have not received any proposals yet. Make sure your venue profile is active to receive campaign matches.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProposals.map((prop) => {
            const counterpartyName =
              currentUserRole === 'ADVERTISER' ? prop.venueName : prop.advertiserBrandName;
            const counterpartyRole = currentUserRole === 'ADVERTISER' ? 'VENUE' : 'ADVERTISER';

            return (
              <div
                key={prop.id}
                onClick={() => setSelectedProposalId(prop.id)}
                className="group rounded-xl border border-[#212130] bg-[#11111a] hover:border-[#c5a059]/60 hover:bg-[#151522] p-4 sm:p-5 transition cursor-pointer space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <span className="font-mono text-sm font-bold text-white group-hover:text-[#c5a059] transition">
                      {prop.publicProposalId}
                    </span>
                    <span className="rounded bg-[#1b1b26] border border-[#28283a] px-2 py-0.5 text-[10px] font-mono text-[#a5a5bb]">
                      v{prop.currentVersionNumber}
                    </span>
                    <ProposalStatusBadge status={prop.status} />
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-[#6d6d7e]">
                    <span>Updated {new Date(prop.updatedAt).toLocaleDateString()}</span>
                    <ChevronRight className="h-4 w-4 text-[#6d6d7e] group-hover:text-[#c5a059] transition" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-1 border-t border-[#1a1a26]">
                  <div>
                    <span className="text-[10px] text-[#717182] uppercase font-semibold">
                      Campaign
                    </span>
                    <div className="font-semibold text-white truncate mt-0.5">
                      {prop.campaignName}
                    </div>
                    <div className="text-[10px] text-[#606072]">{prop.campaignCategory}</div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#717182] uppercase font-semibold">
                      Counterparty ({counterpartyRole})
                    </span>
                    <div className="font-semibold text-white truncate mt-0.5">
                      {counterpartyName}
                    </div>
                    <div className="text-[10px] font-mono text-[#606072]">
                      {currentUserRole === 'ADVERTISER' ? prop.venuePublicId : prop.advertiserPublicId}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#717182] uppercase font-semibold">
                      Quantity & Duration
                    </span>
                    <div className="font-mono font-medium text-white mt-0.5">
                      {prop.terms.campaignQuantity.toLocaleString()} bottles
                    </div>
                    <div className="text-[10px] text-[#606072]">
                      {prop.terms.campaignDuration.value} Weeks Duration
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-[#717182] uppercase font-semibold">
                      Venue Compensation
                    </span>
                    <div className="font-mono font-medium text-emerald-400 mt-0.5">
                      {prop.terms.venueCompensationTerms.proposedPercentage ?? 0}% (Max 12.5%)
                    </div>
                    <div className="text-[10px] text-[#606072] truncate max-w-[220px]">
                      {prop.terms.venueCompensationTerms.termsDescription || 'Supplier advertising cost basis'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Proposal Detail & Negotiation Workspace Modal */}
      {selectedProposalId && (
        <ProposalDetailModal
          proposalId={selectedProposalId}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          onClose={() => setSelectedProposalId(null)}
          onProposalUpdated={() => loadProposals(true)}
        />
      )}
    </div>
  );
};
