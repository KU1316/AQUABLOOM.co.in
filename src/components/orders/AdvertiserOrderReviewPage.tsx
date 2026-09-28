/**
 * AquaBloom Step 12G: Advertiser Payment UI & Financial Visibility
 * 
 * Connected to Step 12 payment architecture without rebuilding the payment backend.
 * 
 * Features:
 * 1. Complete Advertiser View:
 *    - Order reference
 *    - Campaign
 *    - Venue
 *    - Product
 *    - Quantity
 *    - Product price
 *    - Logistics
 *    - Applicable taxes
 *    - Total payable (strictly sourced from OrderPricingSnapshot.grandTotal)
 *    - Payment status
 *    - Payment reference (when appropriate)
 *    - Payment timestamp (after successful payment)
 * 2. Distinct UI presentations for all 7 Payment States:
 *    - Payment Required
 *    - Processing
 *    - Verification Pending
 *    - Paid (Displays "Payment Successful")
 *    - Failed (Displays failure reason with non-duplicating retry action)
 *    - Expired (Displays expiration notice with retry action)
 *    - Reconciliation Pending (Displays reconciliation flag notice)
 * 3. Non-duplicating Retry:
 *    - Allows advertiser to retry without creating duplicate Orders.
 * 4. Fulfillment Status:
 *    - Displays "Fulfillment Authorized" only when the backend has actually authorized it.
 * 5. Strict Role Isolation:
 *    - Counterparties (Supplier, Logistics, Venue) and external accounts receive 403 Forbidden.
 */

import React, { useState, useEffect } from 'react';
import {
  AdvertiserOrderReviewView,
  OrderPaymentHandoffResult,
  PaymentInitiationResult,
  PaymentVerificationResult,
} from '../../types.js';
import { api } from '../../lib/api.js';
import {
  CreditCard,
  Building2,
  Megaphone,
  Package,
  Truck,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Calendar,
  MapPin,
  Lock,
  ArrowRight,
  RefreshCw,
  BadgeAlert,
  RotateCcw,
  Clock,
  FileCheck2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';

interface Props {
  orderId: string;
  onBack?: () => void;
  onHandoffSuccess?: (handoff: OrderPaymentHandoffResult) => void;
  onPaymentInitiated?: (result: PaymentInitiationResult) => void;
}

export const AdvertiserOrderReviewPage: React.FC<Props> = ({
  orderId,
  onBack,
  onHandoffSuccess,
  onPaymentInitiated,
}) => {
  const [review, setReview] = useState<AdvertiserOrderReviewView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  // Expandable breakdown state
  const [isBreakdownExpanded, setIsBreakdownExpanded] = useState(false);

  // Action states
  const [isInitiating, setIsInitiating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const fetchReview = async () => {
    setLoading(true);
    setError(null);
    setIsUnauthorized(false);

    try {
      const res = await api.getAdvertiserOrderReview(orderId);
      if (res.error) {
        if (
          res.error.code === 'FORBIDDEN' ||
          res.error.message.includes('not authorized') ||
          res.error.message.includes('Access denied') ||
          res.error.message.includes('403')
        ) {
          setIsUnauthorized(true);
        }
        throw new Error(res.error.message || 'Failed to load Order Review.');
      }
      setReview(res.data || null);
    } catch (err: any) {
      if (
        err.message &&
        (err.message.includes('403') ||
          err.message.includes('Access denied') ||
          err.message.includes('not authorized') ||
          err.message.includes('FORBIDDEN'))
      ) {
        setIsUnauthorized(true);
      }
      setError(err.message || 'An error occurred while loading the order.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReview();
  }, [orderId]);

  // Handle "PROCEED TO PAYMENT" Initiation
  const handleProceedToPayment = async () => {
    if (!review || isInitiating) return;

    setIsInitiating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      const res = await api.initiatePayment(orderId, {
        idempotencyKey: `pay_req_${orderId}_${Date.now()}`,
      });

      if (res.error) {
        throw new Error(res.error.message || 'Payment initiation failed.');
      }

      if (res.data) {
        setActionSuccessMessage(res.data.message || 'Payment initiated successfully.');
        if (onPaymentInitiated) {
          onPaymentInitiated(res.data);
        }
        if (onHandoffSuccess) {
          onHandoffSuccess({
            orderId: res.data.orderId,
            orderPublicId: res.data.orderPublicId,
            orderReference: res.data.paymentReference,
            paymentReadinessId: res.data.attemptId,
            paymentReadinessPublicId: res.data.attemptPublicId,
            snapshotPublicId: res.data.paymentPublicId,
            authoritativeAmount: res.data.authoritativeAmount,
            status: 'HANDOFF_TO_PAYMENT_GATEWAY',
            nextStep: 'STEP_12_PAYMENT_GATEWAY',
            handoffTimestamp: new Date().toISOString(),
            message: res.data.message,
          });
        }
        await fetchReview();
      }
    } catch (err: any) {
      setActionError(err.message || 'Payment initiation failed. You can retry.');
    } finally {
      setIsInitiating(false);
    }
  };

  // Handle "RETRY PAYMENT" (Non-duplicating retry on the SAME order)
  const handleRetryPayment = async () => {
    if (!review || isInitiating) return;

    setIsInitiating(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      const res = await api.initiatePayment(orderId, {
        idempotencyKey: `pay_retry_${orderId}_${Date.now()}`,
      });

      if (res.error) {
        throw new Error(res.error.message || 'Payment retry initiation failed.');
      }

      setActionSuccessMessage(
        `New payment attempt #${res.data?.attemptNumber || ''} created for Order ${review.publicId}. You can now complete payment.`
      );
      await fetchReview();
    } catch (err: any) {
      setActionError(err.message || 'Payment retry failed.');
    } finally {
      setIsInitiating(false);
    }
  };

  // Handle "VERIFY PAYMENT (SERVER-SIDE)"
  const handleVerifyPayment = async () => {
    if (!review || isVerifying) return;

    const providerRef =
      review.payment.providerTransactionReference ||
      review.payment.paymentReference;

    if (!providerRef) {
      setActionError('Cannot verify payment: No provider transaction reference available.');
      return;
    }

    setIsVerifying(true);
    setActionError(null);
    setActionSuccessMessage(null);

    try {
      const res = await api.verifyPayment(orderId, {
        providerReference: providerRef,
        providerPreference: review.payment.provider || 'SIMULATED',
      });

      if (res.error) {
        throw new Error(res.error.message || 'Payment verification failed.');
      }

      setActionSuccessMessage(
        res.data?.message || 'Payment successfully verified by server.'
      );
      await fetchReview();
    } catch (err: any) {
      setActionError(err.message || 'Server-side payment verification failed.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Loading State
  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-8 text-center bg-[#08080a]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#c5a059] border-t-transparent mb-4" />
        <p className="text-sm font-medium text-zinc-300">Retrieving authoritative Order Review...</p>
        <p className="text-xs text-zinc-500 mt-1">Verifying immutable pricing snapshot &amp; payment state</p>
      </div>
    );
  }

  // Security Isolation / Unauthorized State (403 Forbidden)
  if (isUnauthorized) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 rounded-xl border border-red-900/40 bg-[#12080a] text-center">
        <div className="inline-flex p-3 rounded-full bg-red-950/60 border border-red-800/50 mb-4">
          <BadgeAlert className="h-6 w-6 text-red-400" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">Access Denied: Unauthorized Order Access</h2>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed max-w-md mx-auto">
          You are not authorized to view this Order. Under AquaBloom transaction boundaries,
          advertisers may only access their own orders. Counterparties (Venues, Suppliers, Logistics)
          and external accounts are strictly blocked from advertiser financial details and payments.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition"
            >
              Back to Workspace
            </button>
          )}
        </div>
      </div>
    );
  }

  // Generic Error State
  if (error || !review) {
    return (
      <div className="max-w-2xl mx-auto my-12 p-8 rounded-xl border border-zinc-800 bg-[#0e0e13] text-center">
        <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white">Unable to Load Order Review</h2>
        <p className="text-xs text-zinc-400 mt-2 mb-6">{error || 'Order record not found.'}</p>
        <div className="flex justify-center gap-3">
          <button
            onClick={fetchReview}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#c5a059] text-black hover:bg-[#d4af37] transition"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-zinc-800 text-white hover:bg-zinc-700 transition"
            >
              Back
            </button>
          )}
        </div>
      </div>
    );
  }

  const { campaign, venue, product, logistics, pricing, payment, fulfillmentAuthorization } = review;

  // Determine current active payment state
  const isPaid = payment.status === 'PAID' || review.status === 'PAID' || review.status === 'READY_FOR_FULFILLMENT';
  const isProcessing = payment.status === 'PROCESSING';
  const isVerificationPending = payment.status === 'VERIFICATION_PENDING';
  const isFailed = payment.status === 'FAILED';
  const isExpired = payment.status === 'EXPIRED';
  const isReconciliationPending = payment.status === 'RECONCILIATION_PENDING';
  const isPaymentRequired = !isPaid && (payment.status === 'PAYMENT_REQUIRED' || payment.status === 'PAYMENT REQUIRED');

  return (
    <div className="w-full max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      {/* Top Breadcrumb & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#21212b] pb-4">
        <div className="flex items-center space-x-2 text-xs text-zinc-400">
          {onBack && (
            <button
              onClick={onBack}
              className="hover:text-white transition font-medium"
            >
              Orders
            </button>
          )}
          {onBack && <span aria-hidden="true">&bull;</span>}
          <span className="text-zinc-200">Order Financial Review</span>
          <span aria-hidden="true">&bull;</span>
          <span className="font-mono text-[#c5a059]">{review.publicId}</span>
        </div>

        <div className="flex items-center space-x-3 text-xs text-zinc-400">
          <span>
            Ref: <strong className="font-mono text-zinc-200">{review.orderReference}</strong>
          </span>
          <span aria-hidden="true">&bull;</span>
          <span>
            Order Status:{' '}
            <strong className="text-zinc-200 uppercase font-mono">{review.status}</strong>
          </span>
          <button
            onClick={fetchReview}
            className="p-1 rounded hover:bg-[#1a1a24] text-zinc-400 hover:text-white transition"
            title="Refresh order details"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Action Notification Messages */}
      {actionSuccessMessage && (
        <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
            <span>{actionSuccessMessage}</span>
          </div>
          <button
            onClick={() => setActionSuccessMessage(null)}
            className="text-emerald-400 hover:text-white text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {actionError && (
        <div className="rounded-xl border border-red-800/40 bg-red-950/20 p-4 text-xs text-red-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-red-400 hover:text-white text-xs ml-4"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* =========================================================================
          STEP 12G: PAYMENT STATES BANNERS
          1. Paid (Payment Successful)
          2. Processing
          3. Verification Pending
          4. Failed (with Retry)
          5. Expired (with Retry)
          6. Reconciliation Pending
          7. Payment Required
         ========================================================================= */}

      {/* 1. STATE: PAID (PAYMENT SUCCESSFUL) */}
      {isPaid && (
        <div className="rounded-xl border border-emerald-500/50 bg-[#081a10] p-6 shadow-lg shadow-emerald-950/40 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="h-7 w-7 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                    Payment Successful
                  </span>
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">
                    PAID
                  </span>
                </div>
                <p className="text-xs text-emerald-200/90 mt-1">
                  Your payment has been received and authoritatively verified with the payment network.
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-[#05110a] border border-emerald-800/40 px-4 py-2.5 text-left sm:text-right shrink-0">
              <span className="text-[10px] uppercase font-semibold text-emerald-400 block tracking-wider">
                Total Paid
              </span>
              <span className="font-mono text-xl font-bold text-[#c5a059] tabular-nums">
                {pricing.grandTotalFormatted}
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-emerald-900/50 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">Payment Reference</span>
              <span className="font-mono font-semibold text-white">
                {payment.paymentReference || `PAY-REF-${review.orderReference.replace('ORD-REF-', '')}`}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block text-[11px]">Gateway Transaction Ref</span>
              <span className="font-mono text-zinc-300">
                {payment.providerTransactionReference || 'pi_verified_gateway'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block text-[11px]">Payment Timestamp</span>
              <span className="text-zinc-200 font-medium">
                {payment.paidAt
                  ? new Date(payment.paidAt).toLocaleString('en-IN', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Recorded on Ledger'}
              </span>
            </div>

            <div>
              <span className="text-zinc-400 block text-[11px]">Snapshot Guarantee</span>
              <span className="font-mono text-emerald-300">{pricing.snapshotPublicId}</span>
            </div>
          </div>

          {/* FULFILLMENT AUTHORIZATION SECTION (Step 12F & 12G)
              Show "Fulfillment Authorized" ONLY when backend has actually authorized it! */}
          <div className="pt-4 border-t border-emerald-900/50">
            {fulfillmentAuthorization && fulfillmentAuthorization.isAuthorized ? (
              <div className="rounded-lg border border-emerald-700/60 bg-[#06150c] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start space-x-3">
                  <FileCheck2 className="h-6 w-6 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-bold text-white">
                        Fulfillment Authorized
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-900/80 text-emerald-200 border border-emerald-600/50">
                        PRODUCTION PERMITTED
                      </span>
                    </div>
                    <p className="text-xs text-zinc-300">
                      Hard financial gate verified: Agreement locked, supplier &amp; logistics confirmed, and double-entry ledger balanced. Production queue authorized.
                    </p>
                    <p className="text-[11px] text-zinc-400 italic">
                      {fulfillmentAuthorization.commercialBoundary?.notice ||
                        'Before PRODUCTION_STARTED normal Campaign Cancellation remains available.'}
                    </p>
                  </div>
                </div>

                <div className="text-left md:text-right shrink-0 space-y-1">
                  <div className="text-[10px] text-zinc-400 uppercase tracking-wider">
                    Authorization ID
                  </div>
                  <div className="font-mono text-xs font-bold text-[#c5a059]">
                    {fulfillmentAuthorization.authorizationPublicId}
                  </div>
                  {fulfillmentAuthorization.authorizedAt && (
                    <div className="text-[11px] text-zinc-400">
                      {new Date(fulfillmentAuthorization.authorizedAt).toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-800 bg-[#0b0b10] p-4 flex items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <Clock className="h-5 w-5 text-amber-400 shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-zinc-200 block">
                      Awaiting Fulfillment Authorization
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      Payment verified. The system financial gate is evaluating supplier and logistics readiness for production.
                    </span>
                  </div>
                </div>
                <button
                  onClick={fetchReview}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs text-white transition shrink-0"
                >
                  Check Readiness
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. STATE: PROCESSING */}
      {isProcessing && (
        <div className="rounded-xl border border-blue-800/40 bg-[#0a111a] p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-400 border-t-transparent shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-white">Payment Processing</span>
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-blue-900/60 text-blue-300 border border-blue-700/50">
                    PROCESSING
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Your payment authorization has been submitted to the gateway network and is currently being processed.
                </p>
              </div>
            </div>

            <button
              onClick={fetchReview}
              className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Refresh Status</span>
            </button>
          </div>

          <div className="pt-3 border-t border-blue-900/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">Payment Reference</span>
              <span className="font-mono text-white">{payment.paymentReference || 'Pending'}</span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[11px]">Gateway Provider</span>
              <span className="text-zinc-200">{payment.provider || 'SIMULATED'}</span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[11px]">Attempt</span>
              <span className="font-mono text-zinc-200">#{payment.attemptsCount || 1}</span>
            </div>
          </div>
        </div>
      )}

      {/* 3. STATE: VERIFICATION PENDING */}
      {isVerificationPending && (
        <div className="rounded-xl border border-amber-800/40 bg-[#161208] p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <Clock className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-white">Verification Pending</span>
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-amber-900/60 text-amber-300 border border-amber-700/50">
                    PENDING VERIFICATION
                  </span>
                </div>
                <p className="text-xs text-zinc-300 mt-1">
                  Payment intent received from gateway. Awaiting authoritative server-side signature and amount verification.
                </p>
              </div>
            </div>

            <button
              onClick={handleVerifyPayment}
              disabled={isVerifying}
              className="flex items-center space-x-1.5 px-4 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs uppercase tracking-wider transition shrink-0 disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  <span>Verifying Transaction...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  <span>Verify Payment (Server-Side)</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-3 border-t border-amber-900/40 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-zinc-400 block text-[11px]">Provider Reference</span>
              <span className="font-mono text-white">{payment.providerTransactionReference || 'pi_simulated_ref'}</span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[11px]">Expected Amount</span>
              <span className="font-mono text-[#c5a059] font-bold">{pricing.grandTotalFormatted}</span>
            </div>
            <div>
              <span className="text-zinc-400 block text-[11px]">Attempt</span>
              <span className="font-mono text-zinc-200">#{payment.attemptsCount || 1}</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. STATE: FAILED (WITH RETRY ACTION) */}
      {isFailed && (
        <div className="rounded-xl border border-red-800/50 bg-[#160a0c] p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <XCircle className="h-6 w-6 text-red-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-white">Payment Failed</span>
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-red-900/60 text-red-300 border border-red-700/50">
                    FAILED
                  </span>
                </div>
                <p className="text-xs text-red-200 mt-1">
                  {payment.lastFailureReason || 'The payment network declined the transaction or timed out.'}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  Your Order #{review.orderReference} remains valid and pricing is frozen under Snapshot. Retrying will not duplicate your Order.
                </p>
              </div>
            </div>

            <button
              onClick={handleRetryPayment}
              disabled={isInitiating}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider transition shadow-md shrink-0 disabled:opacity-50"
            >
              {isInitiating ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Preparing Retry...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>Retry Payment</span>
                </>
              )}
            </button>
          </div>

          <div className="pt-3 border-t border-red-900/40 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
            <span>
              Previous Attempts: <strong className="font-mono text-white">{payment.attemptsCount || 1}</strong>
            </span>
            <span>
              Authoritative Amount Due: <strong className="font-mono text-[#c5a059]">{pricing.grandTotalFormatted}</strong>
            </span>
          </div>
        </div>
      )}

      {/* 5. STATE: EXPIRED (WITH RETRY ACTION) */}
      {isExpired && (
        <div className="rounded-xl border border-zinc-700 bg-[#121218] p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <Clock className="h-6 w-6 text-zinc-400 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold text-white">Payment Session Expired</span>
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                    EXPIRED
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  The payment gateway session has expired due to inactivity. Your contracted order and frozen pricing remain valid.
                </p>
              </div>
            </div>

            <button
              onClick={handleRetryPayment}
              disabled={isInitiating}
              className="flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-[#c5a059] hover:bg-[#d4af37] text-black font-bold text-xs uppercase tracking-wider transition shadow-md shrink-0 disabled:opacity-50"
            >
              {isInitiating ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black border-t-transparent" />
                  <span>Starting New Attempt...</span>
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  <span>Retry Payment</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 6. STATE: RECONCILIATION PENDING */}
      {isReconciliationPending && (
        <div className="rounded-xl border border-amber-700/60 bg-[#161208] p-6 shadow-sm space-y-3">
          <div className="flex items-start space-x-3">
            <AlertTriangle className="h-6 w-6 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-xl font-bold text-white">Reconciliation Pending</span>
                <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded bg-amber-900/60 text-amber-300 border border-amber-700/50">
                  FLAGGED FOR AUDIT
                </span>
              </div>
              <p className="text-xs text-amber-200">
                {payment.reconciliationNotes ||
                  'Automated audit detected an amount or status discrepancy. Our financial operations team is actively reviewing the transaction.'}
              </p>
              <p className="text-[11px] text-zinc-400">
                Expected Amount: <span className="font-mono text-white">{pricing.grandTotalFormatted}</span> &bull; Status: Under Investigation
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 7. STATE: PAYMENT REQUIRED (STANDARD INITIAL BANNER) */}
      {isPaymentRequired && (
        <div className="rounded-xl border border-[#c5a059]/40 bg-gradient-to-r from-[#17140e] via-[#101017] to-[#0c0c11] p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1.5">
              <div className="flex items-center space-x-2.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-[#c5a059] animate-pulse" />
                <span className="text-xs font-bold tracking-wider uppercase text-[#c5a059]">
                  PAYMENT REQUIRED
                </span>
                <span className="text-xs text-zinc-500">&bull;</span>
                <span className="text-xs text-zinc-400">
                  Snapshot: <span className="font-mono text-zinc-300">{pricing.snapshotPublicId}</span>
                </span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                Order Review &amp; Payment Authorization
              </h1>
              <p className="text-xs text-zinc-400 max-w-xl leading-relaxed">
                Commercial agreement locked and operational logistics confirmed. Please review your contracted
                specifications and proceed with payment authorization to begin production.
              </p>
            </div>

            {/* Authoritative Grand Total display */}
            <div className="rounded-xl bg-[#09090d] border border-[#21212b] p-4 text-left md:text-right shrink-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                Authoritative Amount Due
              </div>
              <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-[#c5a059] tabular-nums">
                {pricing.grandTotalFormatted}
              </div>
              <div className="mt-1 flex items-center md:justify-end space-x-1.5 text-[11px] text-emerald-400">
                <Lock className="h-3 w-3" />
                <span>Snapshot Frozen &bull; Guaranteed Price</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main 2-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Order Operational Specifications (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Section 1: Campaign & Venue Details */}
          <div className="rounded-xl border border-[#21212b] bg-[#0c0c11] p-5 sm:p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-[#1c1c27] pb-3 text-xs font-bold uppercase tracking-wider text-zinc-300">
              <Megaphone className="h-4 w-4 text-[#c5a059]" />
              <span>Campaign &amp; Venue Assignment</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="text-zinc-500 font-medium">Campaign Reference</span>
                <p className="font-semibold text-white text-sm">{campaign.name}</p>
                <p className="font-mono text-zinc-400 text-[11px]">{campaign.publicId}</p>
                {campaign.preferredStartPeriod && (
                  <p className="text-zinc-400 text-[11px] flex items-center gap-1 mt-1">
                    <Calendar className="h-3 w-3 text-zinc-500" />
                    <span>Schedule: {campaign.preferredStartPeriod}</span>
                  </p>
                )}
              </div>

              <div className="space-y-1 sm:border-l sm:border-[#1c1c27] sm:pl-4">
                <span className="text-zinc-500 font-medium">Host Venue</span>
                <p className="font-semibold text-white text-sm flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-[#c5a059]" />
                  <span>{venue.name}</span>
                </p>
                <p className="font-mono text-zinc-400 text-[11px]">{venue.publicId}</p>
                <p className="text-zinc-400 text-[11px] flex items-center gap-1 mt-1">
                  <MapPin className="h-3 w-3 text-zinc-500" />
                  <span>
                    {venue.city}, {venue.state} &bull; {venue.venueType}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Product & Contracted Quantity */}
          <div className="rounded-xl border border-[#21212b] bg-[#0c0c11] p-5 sm:p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-[#1c1c27] pb-3 text-xs font-bold uppercase tracking-wider text-zinc-300">
              <Package className="h-4 w-4 text-[#c5a059]" />
              <span>Product Specifications &amp; Quantity</span>
            </div>

            <div className="space-y-4 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-[#121218] p-3.5 rounded-lg border border-[#1d1d28]">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Selected Product</span>
                  <span className="font-semibold text-white text-sm">{product.name}</span>
                  <span className="text-zinc-400 text-[11px] block mt-0.5">
                    Catalog ID: <span className="font-mono text-zinc-300">{product.publicId}</span> &bull; Version v{product.versionNumber}
                  </span>
                </div>

                <div className="sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-[#232330]">
                  <span className="text-zinc-500 block text-[11px]">Contracted Quantity</span>
                  <span className="font-mono text-lg font-bold text-[#c5a059] tabular-nums">
                    {review.contractedQuantity.toLocaleString()}
                  </span>
                  <span className="text-zinc-400 text-[11px] block">Bottles</span>
                </div>
              </div>

              {/* Physical Specifications Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-[#0e0e14] p-2.5 rounded-lg border border-[#1a1a24]">
                  <span className="text-[10px] uppercase font-medium text-zinc-500 block">Bottle Material</span>
                  <span className="font-semibold text-zinc-200 text-xs mt-0.5 block">{product.specifications.bottleMaterial}</span>
                </div>
                <div className="bg-[#0e0e14] p-2.5 rounded-lg border border-[#1a1a24]">
                  <span className="text-[10px] uppercase font-medium text-zinc-500 block">Capacity</span>
                  <span className="font-semibold text-zinc-200 text-xs mt-0.5 block">{product.specifications.bottleCapacityMl} ml</span>
                </div>
                <div className="bg-[#0e0e14] p-2.5 rounded-lg border border-[#1a1a24]">
                  <span className="text-[10px] uppercase font-medium text-zinc-500 block">Label Branding</span>
                  <span className="font-semibold text-zinc-200 text-xs mt-0.5 block">{product.specifications.labelType}</span>
                </div>
                <div className="bg-[#0e0e14] p-2.5 rounded-lg border border-[#1a1a24]">
                  <span className="text-[10px] uppercase font-medium text-zinc-500 block">Print Spec</span>
                  <span className="font-semibold text-zinc-200 text-xs mt-0.5 block">
                    {product.specifications.printingCapability || 'Full CMYK Wrap'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Logistics & Delivery Information */}
          <div className="rounded-xl border border-[#21212b] bg-[#0c0c11] p-5 sm:p-6 space-y-4">
            <div className="flex items-center space-x-2 border-b border-[#1c1c27] pb-3 text-xs font-bold uppercase tracking-wider text-zinc-300">
              <Truck className="h-4 w-4 text-[#c5a059]" />
              <span>Logistics &amp; Delivery Staging</span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-zinc-500 block text-[11px]">Logistics Partner</span>
                  <span className="font-semibold text-white">{logistics.partnerBusinessName}</span>
                  <span className="text-zinc-500 block text-[11px] font-mono">{logistics.assignmentPublicId}</span>
                </div>

                <div className="space-y-1">
                  <span className="text-zinc-500 block text-[11px]">Delivery Schedule</span>
                  <span className="font-semibold text-white">{logistics.preferredStartPeriod}</span>
                  <span className="text-zinc-400 block text-[11px]">
                    Refrigeration:{' '}
                    <strong className={logistics.refrigerationRequired ? 'text-amber-400' : 'text-zinc-300'}>
                      {logistics.refrigerationRequired ? 'Required' : 'Ambient (Standard)'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#1a1a24]">
                <span className="text-zinc-500 block text-[11px]">Delivery Address &amp; Staging Location</span>
                <p className="text-zinc-300 text-xs mt-1 leading-relaxed bg-[#121218] p-2.5 rounded-lg border border-[#1d1d28]">
                  {logistics.deliveryAddress}
                </p>
                {logistics.stagingInstructions && (
                  <p className="text-zinc-400 text-[11px] mt-1.5 italic">
                    Staging Notes: {logistics.stagingInstructions}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Authoritative Pricing & Payment Action (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="rounded-xl border border-[#2a2a38] bg-[#0d0d14] p-5 sm:p-6 space-y-6 lg:sticky lg:top-6 shadow-md">
            <div className="border-b border-[#21212d] pb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Commercial Pricing
                </h2>
                <span className="text-[11px] font-mono text-[#c5a059] bg-[#c5a059]/10 px-2 py-0.5 rounded border border-[#c5a059]/30">
                  {pricing.currency}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                Authoritative pricing formula verified from Step 11C snapshot.
              </p>
            </div>

            {/* Authoritative Formula Display (Product Price + Logistics + Taxes = Grand Total) */}
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between text-zinc-300">
                <span>
                  Product Price ({review.contractedQuantity.toLocaleString()} units @ {pricing.unitPriceFormatted})
                </span>
                <span className="font-mono text-white tabular-nums font-medium">
                  {pricing.productPriceTotalFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span>+ Logistics &amp; Delivery</span>
                <span className="font-mono text-white tabular-nums font-medium">
                  {pricing.logisticsCostTotalFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between text-zinc-300">
                <span>+ Applicable Taxes (Statutory GST)</span>
                <span className="font-mono text-white tabular-nums font-medium">
                  {pricing.applicableTaxesFormatted}
                </span>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t border-[#232332] flex items-baseline justify-between">
                <div>
                  <span className="text-sm font-bold text-white block">= Total Payable</span>
                  <span className="text-[10px] text-zinc-500">All statutory taxes included</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xl sm:text-2xl font-bold text-[#c5a059] tabular-nums">
                    {pricing.grandTotalFormatted}
                  </span>
                </div>
              </div>
            </div>

            {/* Expandable Pricing Breakdown (Transparent, no margins/internal costs) */}
            <div className="rounded-lg border border-[#21212f] bg-[#09090e] p-3 text-xs">
              <button
                type="button"
                onClick={() => setIsBreakdownExpanded(!isBreakdownExpanded)}
                className="w-full flex items-center justify-between text-zinc-400 hover:text-white transition font-medium"
              >
                <span>Tax &amp; Tariff Breakdown</span>
                {isBreakdownExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {isBreakdownExpanded && (
                <div className="mt-3 pt-3 border-t border-[#1c1c28] space-y-2 text-[11px] text-zinc-400">
                  <div className="flex justify-between">
                    <span>Tax Jurisdiction:</span>
                    <span className="text-zinc-200">
                      {pricing.taxBreakdown.jurisdiction.originState} &rarr; {pricing.taxBreakdown.jurisdiction.destinationState}{' '}
                      ({pricing.taxBreakdown.jurisdiction.isInterState ? 'Inter-State IGST' : 'Intra-State CGST+SGST'})
                    </span>
                  </div>

                  {pricing.taxBreakdown.components.map((comp, idx) => (
                    <div key={idx} className="flex justify-between items-center text-zinc-300">
                      <span>{comp.taxType} ({comp.ratePercentage}%):</span>
                      <span className="font-mono tabular-nums text-white">{comp.taxAmountFormatted}</span>
                    </div>
                  ))}

                  <div className="pt-2 border-t border-[#1c1c28] text-[10px] text-zinc-500 leading-normal">
                    Statutory GST computed on consolidated taxable supply base. Guaranteed against price revision under Snapshot ID: {pricing.snapshotPublicId}.
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons based on Payment State */}
            <div className="space-y-3 pt-2">
              {isPaid ? (
                <div className="w-full py-3 px-4 rounded-xl bg-emerald-950/40 border border-emerald-700/50 text-emerald-300 flex items-center justify-center space-x-2 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Payment Completed &amp; Verified</span>
                </div>
              ) : isFailed || isExpired ? (
                <button
                  type="button"
                  onClick={handleRetryPayment}
                  disabled={isInitiating}
                  className="w-full flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-[#c5a059] text-black hover:bg-[#d4af37] transition shadow-lg shadow-[#c5a059]/10 active:scale-[0.99] disabled:opacity-50"
                >
                  {isInitiating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      <span>Retrying Payment...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="h-4 w-4" />
                      <span>Retry Payment</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              ) : isVerificationPending ? (
                <button
                  type="button"
                  onClick={handleVerifyPayment}
                  disabled={isVerifying}
                  className="w-full flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-black transition shadow-lg active:scale-[0.99] disabled:opacity-50"
                >
                  {isVerifying ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      <span>Verifying With Gateway...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Verify Payment</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  disabled={isInitiating || !payment.canProceedToPayment}
                  className={`w-full flex items-center justify-center space-x-2 py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition ${
                    payment.canProceedToPayment
                      ? 'bg-[#c5a059] text-black hover:bg-[#d4af37] shadow-lg shadow-[#c5a059]/10 active:scale-[0.99]'
                      : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                  }`}
                >
                  {isInitiating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-black border-t-transparent" />
                      <span>Initiating Payment...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4" />
                      <span>PROCEED TO PAYMENT</span>
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              )}

              <div className="flex items-center justify-center space-x-1.5 text-[11px] text-zinc-500">
                <ShieldCheck className="h-3.5 w-3.5 text-zinc-400" />
                <span>Protected by AquaBloom Escrow &amp; Commercial Lock</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
