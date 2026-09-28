/**
 * AquaBloom Step 9: Supplier Operational Offer Detail & Decision Area
 * 
 * Provides:
 * - Pristine operational summary (Product, Quantity, Staging, Timeline, Unit Price)
 * - Strict counterparty data isolation (Zero leakage of advertiser info, budget, venue compensation, or margins)
 * - Atomic Accept Offer with confirmation modal
 * - Structured Decline Offer with verified reason codes and optional explanation
 * - Authoritative server-side expiration validation
 */

import React, { useState } from 'react';
import {
  SupplierOperationalOffer,
  SupplierDeclineReasonCode,
} from '../../../types.js';
import { api } from '../../../lib/api.js';
import {
  X,
  Package,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Layers,
  FileText,
  DollarSign,
  Truck,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface SupplierOfferDetailModalProps {
  offer: SupplierOperationalOffer;
  onClose: () => void;
  onOfferUpdated: (updatedOffer: SupplierOperationalOffer) => void;
}

export const SupplierOfferDetailModal: React.FC<SupplierOfferDetailModalProps> = ({
  offer,
  onClose,
  onOfferUpdated,
}) => {
  const [isAcceptModalOpen, setIsAcceptModalOpen] = useState(false);
  const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);

  // Decline dialog state
  const [declineReason, setDeclineReason] = useState<SupplierDeclineReasonCode>('CAPACITY_UNAVAILABLE');
  const [declineExplanation, setDeclineExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const now = new Date();
  const expiresAtDate = new Date(offer.expiresAt);
  const isExpired = offer.status === 'EXPIRED' || (offer.status === 'PENDING' && expiresAtDate <= now);
  const isPending = offer.status === 'PENDING' && !isExpired;

  // Handle Accept
  const handleConfirmAccept = async () => {
    setIsSubmitting(true);
    setActionError(null);

    try {
      const idempotencyKey = `accept_offer_${offer.id}_${Date.now()}`;
      const res = await api.acceptSupplierOffer(offer.id, { idempotencyKey });

      if (res.error) {
        throw new Error(res.error.message || 'Failed to accept operational offer.');
      }

      if (res.data?.offer) {
        onOfferUpdated(res.data.offer);
        setIsAcceptModalOpen(false);
      }
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while accepting offer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Decline
  const handleConfirmDecline = async () => {
    if (declineReason === 'OTHER' && !declineExplanation.trim()) {
      setActionError('Please provide a short explanation for declining.');
      return;
    }

    setIsSubmitting(true);
    setActionError(null);

    try {
      const idempotencyKey = `decline_offer_${offer.id}_${Date.now()}`;
      const res = await api.declineSupplierOffer(offer.id, {
        reasonCode: declineReason,
        explanation: declineExplanation.trim() || undefined,
        idempotencyKey,
      });

      if (res.error) {
        throw new Error(res.error.message || 'Failed to decline operational offer.');
      }

      if (res.data) {
        onOfferUpdated(res.data);
        setIsDeclineModalOpen(false);
      }
    } catch (err: any) {
      setActionError(err.message || 'An error occurred while declining offer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const req = offer.operationalRequirementsSnapshot;
  const terms = offer.offerTerms;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl rounded-2xl border border-[#2a2a38] bg-[#0c0c12] shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#21212d] bg-[#111118] px-6 py-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-mono text-sm font-bold text-[#c5a059]">{offer.publicId}</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase ${
                  offer.status === 'ACCEPTED'
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/50'
                    : offer.status === 'DECLINED'
                    ? 'bg-red-950/80 text-red-300 border border-red-800/50'
                    : isExpired
                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                    : 'bg-amber-950/80 text-amber-300 border border-amber-800/50'
                }`}
              >
                {isExpired && offer.status === 'PENDING' ? 'EXPIRED' : offer.status}
              </span>
            </div>
            <span className="text-[11px] text-[#7d7d90] mt-0.5 block">
              Contract Ref: <strong className="font-mono text-zinc-300">{offer.campaignAgreementPublicId}</strong>
            </span>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-[#1a1a24] hover:text-white transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Action Error Banner */}
          {actionError && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-xs text-red-300 flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{actionError}</span>
            </div>
          )}

          {/* Status Specific Notice Banners */}
          {offer.status === 'ACCEPTED' && (
            <div className="rounded-xl border border-emerald-800/50 bg-emerald-950/20 p-4 flex items-center space-x-3 text-xs text-emerald-300">
              <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              <div>
                <strong className="block font-semibold text-white">Offer Accepted &bull; Production Assignment Created</strong>
                <span>
                  You accepted this offer on {offer.acceptedAt ? new Date(offer.acceptedAt).toLocaleDateString() : 'Confirmed'}. You can track work order status under "My Assignments".
                </span>
              </div>
            </div>
          )}

          {offer.status === 'DECLINED' && (
            <div className="rounded-xl border border-red-800/50 bg-red-950/20 p-4 flex items-center space-x-3 text-xs text-red-300">
              <XCircle className="h-5 w-5 text-red-400 shrink-0" />
              <div>
                <strong className="block font-semibold text-white">Offer Declined</strong>
                <span>
                  Declined on {offer.declinedAt ? new Date(offer.declinedAt).toLocaleDateString() : 'Recorded'} (Reason: {offer.declineReasonCode?.replace(/_/g, ' ') || 'Declined by supplier'}).
                  {offer.declineExplanation && ` Note: "${offer.declineExplanation}"`}
                </span>
              </div>
            </div>
          )}

          {isExpired && offer.status !== 'ACCEPTED' && offer.status !== 'DECLINED' && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4 flex items-center space-x-3 text-xs text-zinc-300">
              <AlertTriangle className="h-5 w-5 text-zinc-400 shrink-0" />
              <div>
                <strong className="block font-semibold text-white">Offer Window Expired</strong>
                <span>The response window for this operational offer closed on {new Date(offer.expiresAt).toLocaleString()}.</span>
              </div>
            </div>
          )}

          {/* 1. Production Scope & Volume */}
          <div className="rounded-xl border border-[#21212d] bg-[#0f0f16] p-5 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Package className="h-4 w-4" />
              <span>1. Production Volume &amp; Specifications</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Target Quantity</span>
                <span className="font-mono text-xl font-bold text-white mt-1 block">
                  {req?.bottleQuantity?.toLocaleString()} <span className="text-xs font-normal text-zinc-400">units</span>
                </span>
              </div>

              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Container Format</span>
                <span className="text-sm font-semibold text-zinc-200 mt-1 block">
                  {req?.productRequirements?.bottleType || 'Standard Bottle'} ({req?.productRequirements?.volumeLabel || `${req?.productRequirements?.preferredVolumeMl || 500}ml`})
                </span>
              </div>

              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Material &amp; Cap</span>
                <span className="text-sm font-semibold text-zinc-200 mt-1 block">
                  {req?.productRequirements?.preferredMaterial || 'Aluminum'} &bull; {req?.productRequirements?.capType || 'Screw Cap'}
                </span>
              </div>
            </div>

            {/* Label & Printing Specs */}
            <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-[#717182] block">Label &amp; Surface Finishing Specification</span>
              <p className="text-zinc-200">
                {req?.productRequirements?.labelType || 'Direct Screen Print'} &bull; Eco-compliant finishing specification.
              </p>
              {req?.productRequirements?.notes && (
                <p className="text-[#88889a] text-[11px] mt-1 italic">
                  Additional specification: {req.productRequirements.notes}
                </p>
              )}
            </div>
          </div>

          {/* 2. Packaging, Staging & Timeline */}
          <div className="rounded-xl border border-[#21212d] bg-[#0f0f16] p-5 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <Calendar className="h-4 w-4" />
              <span>2. Timeline &amp; Logistics Staging Instructions</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Production Lead Time</span>
                <span className="text-sm font-semibold text-white">
                  {terms.productionLeadTime.value} {terms.productionLeadTime.unit.toLowerCase()}
                </span>
                <span className="text-[11px] text-[#717182] block">
                  Campaign distribution duration: {req?.productionTimeline?.durationWeeks || 4} weeks
                </span>
              </div>

              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Preferred Staging Period</span>
                <span className="text-sm font-semibold text-white">
                  {req?.productionTimeline?.preferredStartMonthYear || 'Scheduled by Agreement'}
                </span>
                <span className="text-[11px] text-[#717182] block">
                  Logistics pickup window to be coordinated upon assignment.
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5 text-xs">
              <span className="text-[10px] uppercase font-bold text-[#717182] block">Staging &amp; Packaging Requirements</span>
              <p className="text-zinc-200 mt-1">
                {req?.packagingAndStagingRequirements || 'Standard palletized shrink-wrapped tray packaging.'}
              </p>
            </div>
          </div>

          {/* 3. Authorized Commercial Terms (Supplier Price) */}
          <div className="rounded-xl border border-[#21212d] bg-[#0f0f16] p-5 space-y-4">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-[#c5a059]">
              <DollarSign className="h-4 w-4" />
              <span>3. Authorized Supplier Compensation (Pristine Isolation)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Unit Product Price</span>
                <span className="font-mono text-base font-bold text-[#c5a059] mt-1 block">
                  ₹{terms.unitCustomerFacingPrice.amount.toFixed(2)} / unit
                </span>
              </div>

              <div className="rounded-lg border border-[#1b1b26] bg-[#14141e] p-3.5">
                <span className="text-[10px] uppercase font-bold text-[#717182] block">Total Production Value</span>
                <span className="font-mono text-base font-bold text-white mt-1 block">
                  ₹{terms.totalBottleAmount.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#717182] italic leading-relaxed">
              * Commercial isolation guarantee: Supplier views only applicable manufacturing rates. Counterparty commercial arrangements and margins remain strictly confidential.
            </p>
          </div>

          {/* 4. Offer Validity & Expiration */}
          <div className="flex items-center justify-between text-xs text-[#808092] rounded-xl border border-[#1c1c28] bg-[#09090f] p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-[#c5a059]" />
              <span>
                Offer Dispatched: <strong>{new Date(offer.createdAt).toLocaleDateString()}</strong> &bull; Valid Until:{' '}
                <strong className={isExpired ? 'text-red-400' : 'text-zinc-200'}>
                  {new Date(offer.expiresAt).toLocaleString()}
                </strong>
              </span>
            </div>
            <span className="text-[10px] font-mono text-[#c5a059]">Ref: {offer.orderReadinessPublicId}</span>
          </div>
        </div>

        {/* Modal Footer / Actions */}
        <div className="border-t border-[#21212d] bg-[#111118] px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg bg-[#1e1e2a] hover:bg-[#282838] text-zinc-300 transition"
          >
            Close View
          </button>

          {isPending && (
            <div className="w-full sm:w-auto flex items-center gap-3">
              <button
                onClick={() => setIsDeclineModalOpen(true)}
                disabled={isSubmitting}
                className="w-1/2 sm:w-auto px-4 py-2 text-xs font-semibold rounded-lg border border-red-800/60 bg-red-950/30 hover:bg-red-900/40 text-red-300 transition disabled:opacity-50"
              >
                Decline Offer
              </button>

              <button
                onClick={() => setIsAcceptModalOpen(true)}
                disabled={isSubmitting}
                className="w-1/2 sm:w-auto px-5 py-2 text-xs font-bold rounded-lg bg-[#c5a059] hover:bg-[#d4af37] text-black transition disabled:opacity-50"
              >
                Accept Offer
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Accept Confirmation Dialog */}
      {isAcceptModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85">
          <div className="w-full max-w-md rounded-xl border border-emerald-700/60 bg-[#0d1611] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-emerald-400">
              <CheckCircle2 className="h-6 w-6" />
              <h3 className="font-display text-base font-bold text-white">
                Confirm Operational Acceptance
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              By accepting offer <strong className="font-mono text-[#c5a059]">{offer.publicId}</strong>, you commit to bottling{' '}
              <strong className="text-white">{req?.bottleQuantity?.toLocaleString()} units</strong> within the agreed{' '}
              <strong className="text-white">{terms.productionLeadTime.value} {terms.productionLeadTime.unit.toLowerCase()}</strong> lead time.
            </p>

            <div className="rounded-lg border border-emerald-900/40 bg-[#08100b] p-3 text-[11px] text-zinc-400 space-y-1">
              <div>&bull; Acceptance immediately creates binding Supplier Assignment.</div>
              <div>&bull; Sibling pending offers for this campaign will be automatically cancelled.</div>
              <div>&bull; Production execution begins after Step 12 payment authorization.</div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsAcceptModalOpen(false)}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAccept}
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm Acceptance</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decline Confirmation Dialog */}
      {isDeclineModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85">
          <div className="w-full max-w-md rounded-xl border border-red-800/60 bg-[#160c0f] p-6 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-2 text-red-400">
              <XCircle className="h-6 w-6" />
              <h3 className="font-display text-base font-bold text-white">
                Decline Operational Offer
              </h3>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed">
              Please select a structured reason for declining offer <strong className="font-mono text-[#c5a059]">{offer.publicId}</strong>.
              This facilitates administrative re-matching without affecting the campaign agreement.
            </p>

            {/* Structured Reasons */}
            <div className="space-y-2 text-xs">
              {[
                { code: 'CAPACITY_UNAVAILABLE', label: 'Capacity unavailable' },
                { code: 'TIMELINE_UNAVAILABLE', label: 'Timeline unavailable' },
                { code: 'PRODUCT_UNAVAILABLE', label: 'Product unavailable' },
                { code: 'PRODUCTION_CONSTRAINTS', label: 'Production constraints' },
                { code: 'COMMERCIAL_TERMS_NOT_SUITABLE', label: 'Commercial terms not suitable' },
                { code: 'OTHER', label: 'Other (specify reason)' },
              ].map((item) => (
                <label
                  key={item.code}
                  className={`flex items-center space-x-2.5 rounded-lg border p-2.5 cursor-pointer transition ${
                    declineReason === item.code
                      ? 'border-red-600 bg-red-950/40 text-white font-medium'
                      : 'border-[#28171b] bg-[#1a0e12] text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="declineReason"
                    value={item.code}
                    checked={declineReason === item.code}
                    onChange={() => setDeclineReason(item.code as SupplierDeclineReasonCode)}
                    className="accent-red-500"
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>

            {/* Explanation textarea if OTHER or optional */}
            <div>
              <label className="text-[11px] font-semibold text-zinc-300 block mb-1">
                Additional Explanation {declineReason === 'OTHER' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                value={declineExplanation}
                onChange={(e) => setDeclineExplanation(e.target.value)}
                placeholder="Briefly state production line constraints or scheduling conflict..."
                rows={2}
                className="w-full rounded-lg border border-[#301b21] bg-[#120a0d] p-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-red-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                onClick={() => setIsDeclineModalOpen(false)}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDecline}
                disabled={isSubmitting}
                className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-red-700 hover:bg-red-600 text-white transition disabled:opacity-50"
              >
                {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Confirm Decline</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
