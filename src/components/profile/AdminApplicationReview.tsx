/**
 * AquaBloom Admin Partner Review Console
 * 
 * Internal administrative tool for evaluating Supplier and Logistics partner applications:
 * - List all applications with their operational profiles and completion metrics
 * - Filter by Status (PENDING_REVIEW, APPROVED, MORE_INFORMATION, REJECTED)
 * - Review and execute decisions (Approve, Request Information, Decline) with review notes
 * - Real-time audit events dispatched to audit ledger
 */

import React, { useState, useEffect } from 'react';
import { User, UserProfile, ApprovalStatus } from '../../types.js';
import { api } from '../../lib/api.js';
import {
  Shield,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  Factory,
  Truck,
  MapPin,
  Mail,
  User as UserIcon,
  RefreshCw,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

export const AdminApplicationReview: React.FC = () => {
  const [applications, setApplications] = useState<Array<{ user: User; profile: UserProfile }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedApp, setSelectedApp] = useState<{ user: User; profile: UserProfile } | null>(null);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | ApprovalStatus>('PENDING_REVIEW');

  const fetchApplications = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAdminPendingApplications();
      if (res.data) {
        setApplications(res.data);
        if (res.data.length > 0 && !selectedApp) {
          setSelectedApp(res.data[0]);
        }
      } else if (res.error) {
        setError(res.error.message);
      }
    } catch (err) {
      setError('Unable to retrieve pending partner applications.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleDecision = async (decision: ApprovalStatus) => {
    if (!selectedApp) return;
    setIsSubmitting(true);
    setActionSuccess(null);
    setError(null);

    try {
      const res = await api.adminReviewApplication(selectedApp.user.id, decision, notes);
      if (res.data) {
        setActionSuccess(`Application status successfully updated to ${decision}.`);
        setNotes('');
        // Refresh list
        await fetchApplications();
        // Update currently selected app
        setSelectedApp(res.data);
        setTimeout(() => setActionSuccess(null), 4000);
      } else if (res.error) {
        setError(res.error.message);
      }
    } catch (err) {
      setError('An error occurred while submitting administrative review decision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredApps = applications.filter((app) => {
    const appStatus = (app.profile as any).approvalStatus || 'PENDING_REVIEW';
    if (statusFilter === 'ALL') return true;
    return appStatus === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Console Header */}
      <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Shield className="h-4 w-4" />
              <span>Internal Governance &amp; Partner Review</span>
            </div>
            <h2 className="mt-1 font-display text-xl font-bold text-white">Partner Application Console</h2>
            <p className="text-xs text-[#8e8e9f]">
              Approve or request revisions for production suppliers and regional freight carriers.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={fetchApplications}
              className="flex items-center space-x-2 rounded-lg border border-[#2a2a38] bg-[#14141c] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1a1a24] transition"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin text-[#c5a059]' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="mt-6 flex flex-wrap gap-2 border-t border-[#1c1c28] pt-4">
          {(['PENDING_REVIEW', 'ALL', 'APPROVED', 'MORE_INFORMATION', 'REJECTED'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                statusFilter === filter
                  ? 'border border-[#c5a059] bg-[#c5a059]/15 text-[#d4af37]'
                  : 'border border-[#20202c] bg-[#121218] text-[#8e8e9f] hover:text-white'
              }`}
            >
              {filter.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center space-x-2 rounded-lg border border-rose-900/40 bg-rose-950/20 p-3.5 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {actionSuccess && (
        <div className="flex items-center space-x-2 rounded-lg border border-emerald-900/40 bg-emerald-950/20 p-3.5 text-xs text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Review Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Applications List */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#737385]">
            Registered Partner Queue ({filteredApps.length})
          </h3>

          {filteredApps.length === 0 && !isLoading && (
            <div className="rounded-xl border border-[#232330] bg-[#0c0c11] p-8 text-center text-xs text-[#737385]">
              No partner applications match the &ldquo;{statusFilter}&rdquo; status filter.
            </div>
          )}

          {filteredApps.map((app) => {
            const isSelected = selectedApp?.user.id === app.user.id;
            const profile = app.profile as any;
            const status = profile.approvalStatus || 'PENDING_REVIEW';
            const isSupplier = app.user.role === 'SUPPLIER';

            return (
              <div
                key={app.user.id}
                onClick={() => setSelectedApp(app)}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  isSelected
                    ? 'border-[#c5a059] bg-[#14141c]'
                    : 'border-[#20202c] bg-[#0c0c11] hover:border-[#2f2f40] hover:bg-[#101016]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="rounded-lg border border-[#282836] bg-[#14141c] p-2 text-[#c5a059]">
                      {isSupplier ? <Factory className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">
                        {profile.businessName || app.user.organizationName}
                      </h4>
                      <p className="text-[11px] text-[#737385]">
                        {app.user.role} &bull; {app.user.publicAccountId}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      status === 'APPROVED'
                        ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40'
                        : status === 'PENDING_REVIEW'
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
                        : status === 'MORE_INFORMATION'
                        ? 'bg-sky-950/60 text-sky-400 border border-sky-800/40'
                        : 'bg-rose-950/60 text-rose-400 border border-rose-800/40'
                    }`}
                  >
                    {status}
                  </span>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-[#1a1a24] pt-2.5 text-[11px] text-[#8e8e9f]">
                  <span>Completion: {profile.completion?.percentage ?? 0}%</span>
                  <span className="font-mono text-[10px] text-[#606070]">v{profile.version || 1}.0</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail Inspection & Decision Pane */}
        <div className="lg:col-span-7">
          {selectedApp ? (
            <div className="space-y-6 rounded-xl border border-[#232330] bg-[#0c0c11] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#1c1c28] pb-4">
                <div>
                  <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
                    <span>Application Inspection</span>
                  </div>
                  <h3 className="mt-1 font-display text-lg font-bold text-white">
                    {(selectedApp.profile as any).businessName || selectedApp.user.organizationName}
                  </h3>
                  <p className="text-xs text-[#8e8e9f]">
                    Candidate User ID: <span className="font-mono text-white">{selectedApp.user.id}</span>
                  </p>
                </div>

                <div className="text-right text-xs">
                  <span className="text-[#737385]">Current Decision:</span>
                  <div className="mt-1 font-bold text-[#c5a059]">
                    {(selectedApp.profile as any).approvalStatus || 'PENDING_REVIEW'}
                  </div>
                </div>
              </div>

              {/* Profile Details Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-3.5">
                  <span className="text-[10px] font-semibold uppercase text-[#737385]">Contact Liaison</span>
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center space-x-2 text-white font-medium">
                      <UserIcon className="h-3.5 w-3.5 text-[#c5a059]" />
                      <span>{(selectedApp.profile as any).primaryContact?.name || selectedApp.user.contactName}</span>
                    </div>
                    <div className="flex items-center space-x-2 text-[#8e8e9f]">
                      <Mail className="h-3.5 w-3.5 text-[#737385]" />
                      <span>{(selectedApp.profile as any).primaryContact?.email || selectedApp.user.email}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-[#1e1e28] bg-[#121218] p-3.5">
                  <span className="text-[10px] font-semibold uppercase text-[#737385]">Physical Location</span>
                  <div className="mt-2 flex items-start space-x-2 text-white">
                    <MapPin className="h-3.5 w-3.5 text-[#c5a059] shrink-0 mt-0.5" />
                    <span>
                      {(selectedApp.profile as any).operatingLocation?.facilityCity ||
                        (selectedApp.profile as any).operatingLocation?.hubCity ||
                        (selectedApp.profile as any).location?.city ||
                        'Not configured'}
                      ,{' '}
                      {(selectedApp.profile as any).operatingLocation?.country ||
                        (selectedApp.profile as any).location?.country ||
                        ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Description & Operational Metrics */}
              <div>
                <span className="text-xs font-bold uppercase text-[#888899]">Enterprise Overview</span>
                <p className="mt-1.5 rounded-lg border border-[#1e1e28] bg-[#121218] p-3.5 text-xs text-[#9d9db3] leading-relaxed">
                  {(selectedApp.profile as any).description || 'No formal overview submitted.'}
                </p>
              </div>

              {/* Supplier-Specific Inspection */}
              {selectedApp.user.role === 'SUPPLIER' && (
                <div className="space-y-3 border-t border-[#1c1c28] pt-4 text-xs">
                  <span className="font-bold uppercase text-[#888899]">Packaging Capabilities</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded border border-[#1e1e28] bg-[#121218] p-3">
                      <span className="text-[10px] text-[#737385]">Water Purification</span>
                      <p className="mt-1 font-medium text-white">
                        {(selectedApp.profile as any).capabilities?.waterTypes?.join(', ') || 'None specified'}
                      </p>
                    </div>
                    <div className="rounded border border-[#1e1e28] bg-[#121218] p-3">
                      <span className="text-[10px] text-[#737385]">Substrate Materials</span>
                      <p className="mt-1 font-medium text-white">
                        {(selectedApp.profile as any).capabilities?.bottleMaterials?.join(', ') || 'None specified'}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-between rounded border border-[#1e1e28] bg-[#121218] p-3">
                    <span>
                      Monthly Capacity:{' '}
                      <strong className="text-white">
                        {(
                          selectedApp.profile as any
                        ).productionCapacity?.bottlesPerMonth?.toLocaleString() || 0}{' '}
                        bottles
                      </strong>
                    </span>
                    <span>
                      Standard Turnaround:{' '}
                      <strong className="text-white">
                        {(selectedApp.profile as any).leadTimeInfo?.standardTurnaroundDays || 0} days
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Logistics-Specific Inspection */}
              {selectedApp.user.role === 'LOGISTICS_PARTNER' && (
                <div className="space-y-3 border-t border-[#1c1c28] pt-4 text-xs">
                  <span className="font-bold uppercase text-[#888899]">Fleet &amp; Service Coverage</span>
                  <div className="rounded border border-[#1e1e28] bg-[#121218] p-3">
                    <span className="text-[10px] text-[#737385]">Coverage Corridors</span>
                    <p className="mt-1 font-medium text-white">
                      {(selectedApp.profile as any).serviceAreas?.join(' • ') || 'None specified'}
                    </p>
                  </div>
                  <div className="flex justify-between rounded border border-[#1e1e28] bg-[#121218] p-3">
                    <span>
                      Pallets/Week:{' '}
                      <strong className="text-white">
                        {(selectedApp.profile as any).shipmentCapacity?.palletsPerWeek || 0}
                      </strong>
                    </span>
                    <span>
                      Max Payload:{' '}
                      <strong className="text-white">
                        {(selectedApp.profile as any).shipmentCapacity?.maxPayloadWeightKg || 0} kg
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Administrative Action Section */}
              <div className="border-t border-[#1c1c28] pt-4">
                <label className="block text-xs font-semibold text-white">
                  Administrative Review Notes / Justification
                </label>
                <div className="relative mt-1.5">
                  <MessageSquare className="absolute left-3 top-3 h-3.5 w-3.5 text-[#6c6c7d]" />
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter approval conditions, verification notes, or reasons for rejection..."
                    className="w-full rounded-lg border border-[#282836] bg-[#121218] pl-9 pr-3 py-2 text-xs text-white placeholder-[#5d5d6e] focus:border-[#c5a059] focus:outline-none"
                  />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDecision('REJECTED')}
                    className="flex items-center space-x-1.5 rounded-lg border border-rose-900/50 bg-rose-950/20 px-3.5 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-950/40 transition disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Decline Application</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDecision('MORE_INFORMATION')}
                    className="flex items-center space-x-1.5 rounded-lg border border-sky-900/50 bg-sky-950/20 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-950/40 transition disabled:opacity-50"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                    <span>Request Information</span>
                  </button>

                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleDecision('APPROVED')}
                    className="flex items-center space-x-1.5 rounded-lg bg-[#c5a059] px-4 py-2 text-xs font-bold text-black hover:bg-[#d4af37] transition disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Authorize &amp; Approve</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-[#232330] bg-[#0c0c11] text-xs text-[#737385]">
              Select an application from the queue to inspect details and record decisions.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
