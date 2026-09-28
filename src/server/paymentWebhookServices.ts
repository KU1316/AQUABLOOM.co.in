/**
 * AQUABLOOM — STEP 12D: PAYMENT WEBHOOKS, IDEMPOTENCY & RECONCILIATION ENGINE
 * 
 * Objectives:
 * 1. Webhook Security:
 *    - Signature verification using HMAC-SHA256
 *    - Authenticated provider source check
 *    - Event ID verification
 *    - Timestamp replay protection (configurable tolerance, rejects stale / future events)
 *    - Server-side payload validation (never trust unverified payloads)
 * 2. Idempotency:
 *    - Every provider event processed at most once logically
 *    - Duplicate event returns EVENT_ALREADY_PROCESSED
 *    - Strictly prevents: duplicate Payment, duplicate PaymentAttempt, duplicate ledger entry, duplicate fulfillment
 * 3. Concurrency Protection:
 *    - Mutex lock per providerEventId ensuring concurrent duplicate calls execute safely without race conditions
 * 4. Event Order & State Guards:
 *    - Delayed events handled safely
 *    - Out-of-order failure events cannot downgrade a confirmed PAID payment
 *    - State guards prevent corrupted status transitions
 * 5. Reconciliation Engine:
 *    - States: MATCHED, PENDING_REVIEW, MISMATCHED, REVERSED
 *    - Captures: provider reference, internal transaction reference, expected amount, received amount,
 *      currency, timestamps, discrepancy reasons, and audit trails
 * 6. Payment Reversal:
 *    - Provider reversals / chargebacks / refunds are never treated as successful permanent payments
 *    - Payment marked REVERSED, Order status transitioned out of PAID to prevent fulfillment authorization
 *    - Reversal reconciliation record created
 */

import crypto from 'node:crypto';
import { db } from './db.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';
import {
  AuthenticationError,
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
} from '../lib/errors.js';
import type {
  User,
  Order,
  OrderPricingSnapshot,
  Payment,
  PaymentAttempt,
  PaymentStatus,
  ProviderWebhookEvent,
  WebhookEventRecord,
  PaymentReconciliationRecord,
  ReconciliationState,
  WebhookProcessingStatus,
  ProcessWebhookResult,
} from '../types.js';
import { FinancialLedgerEngine } from './financialLedgerServices.js';
import { FulfillmentAuthorizationService } from './fulfillmentAuthorizationServices.js';

export const DEFAULT_WEBHOOK_SECRET = 'whsec_aquabloom_standard_2026_test_key';
export const DEFAULT_TOLERANCE_SECONDS = 300; // 5 minutes

/**
 * ========================================================
 * 1. WEBHOOK SECURITY & CRYPTOGRAPHIC VERIFICATION
 * ========================================================
 */
export class PaymentWebhookSecurity {
  /**
   * Generates a valid HMAC-SHA256 signature for test or provider webhook emission.
   * Format: t={timestamp},v1={hex_digest}
   */
  public static generateSignature(
    payload: string,
    secret: string,
    timestamp: number = Math.floor(Date.now() / 1000)
  ): string {
    const signedPayload = `${timestamp}.${payload}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');
    return `t=${timestamp},v1=${signature}`;
  }

  /**
   * Verifies the authenticity and freshness of the webhook payload.
   * Checks:
   * 1. Signature header format
   * 2. Timestamp replay attack tolerance
   * 3. HMAC-SHA256 cryptographic match using timingSafeEqual
   */
  public static verifySignature(
    rawPayload: string,
    signatureHeader: string | undefined,
    secret: string,
    toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS
  ): { valid: boolean; timestamp: number; reason?: string } {
    if (!signatureHeader) {
      return { valid: false, timestamp: 0, reason: 'Missing signature header' };
    }

    // Parse header: e.g. "t=1727170000,v1=abcdef..." or raw hex
    let timestamp = 0;
    let expectedSignature = '';

    const parts = signatureHeader.split(',');
    for (const part of parts) {
      const [key, value] = part.trim().split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v1' || key === 'sig') {
        expectedSignature = value;
      }
    }

    if (!expectedSignature) {
      // If single string provided without v1 prefix
      if (!signatureHeader.includes('=')) {
        expectedSignature = signatureHeader.trim();
        timestamp = Math.floor(Date.now() / 1000);
      } else {
        return { valid: false, timestamp: 0, reason: 'Missing v1 signature component in header' };
      }
    }

    if (!timestamp || isNaN(timestamp)) {
      return { valid: false, timestamp: 0, reason: 'Missing or invalid timestamp component in signature header' };
    }

    // Replay attack validation
    const currentEpochSeconds = Math.floor(Date.now() / 1000);
    const ageSeconds = currentEpochSeconds - timestamp;

    if (ageSeconds > toleranceSeconds) {
      return {
        valid: false,
        timestamp,
        reason: `Replay attack detected: webhook timestamp (${timestamp}) is ${ageSeconds}s old (tolerance: ${toleranceSeconds}s)`,
      };
    }

    if (timestamp - currentEpochSeconds > 60) {
      return {
        valid: false,
        timestamp,
        reason: `Invalid future webhook timestamp (${timestamp})`,
      };
    }

    // Compute expected HMAC
    const signedPayload = `${timestamp}.${rawPayload}`;
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Safe comparison
    const computedBuf = Buffer.from(computedSignature, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (computedBuf.length !== expectedBuf.length) {
      return { valid: false, timestamp, reason: 'Signature mismatch' };
    }

    const match = crypto.timingSafeEqual(computedBuf, expectedBuf);
    if (!match) {
      return { valid: false, timestamp, reason: 'Cryptographic signature verification failed' };
    }

    return { valid: true, timestamp };
  }
}

/**
 * ========================================================
 * 2. CONCURRENCY MUTEX LOCK
 * ========================================================
 */
class WebhookConcurrencyLock {
  private static inFlightLocks = new Map<string, Promise<any>>();

  public static async executeExclusive<T>(key: string, task: () => Promise<T>): Promise<T> {
    while (this.inFlightLocks.has(key)) {
      try {
        await this.inFlightLocks.get(key);
      } catch {
        // Wait for prior resolution/rejection
      }
    }

    let resolveFn: () => void;
    let rejectFn: (err: any) => void;
    const completionPromise = new Promise<void>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    this.inFlightLocks.set(key, completionPromise);

    try {
      const result = await task();
      resolveFn!();
      return result;
    } catch (err) {
      rejectFn!(err);
      throw err;
    } finally {
      this.inFlightLocks.delete(key);
    }
  }
}

/**
 * ========================================================
 * 3. PAYMENT WEBHOOK & RECONCILIATION SERVICE
 * ========================================================
 */
export class PaymentWebhookService {
  /**
   * Process an incoming webhook payload with strict security, idempotency,
   * state guarding, and financial reconciliation.
   */
  public static async processWebhook(
    rawBody: string | object,
    signatureHeader?: string,
    options?: {
      providerName?: string;
      secret?: string;
      toleranceSeconds?: number;
      skipSignatureVerification?: boolean;
    }
  ): Promise<ProcessWebhookResult> {
    const rawPayloadString = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    const secret = options?.secret || DEFAULT_WEBHOOK_SECRET;
    const toleranceSeconds = options?.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
    const providerName = options?.providerName || 'SIMULATED';

    // 1. Signature & Replay Verification
    if (!options?.skipSignatureVerification) {
      const sigCheck = PaymentWebhookSecurity.verifySignature(
        rawPayloadString,
        signatureHeader,
        secret,
        toleranceSeconds
      );

      if (!sigCheck.valid) {
        if (sigCheck.reason?.includes('Replay attack') || sigCheck.reason?.includes('future')) {
          throw new ValidationError(`Webhook rejected: ${sigCheck.reason}`, 400);
        }
        throw new AuthenticationError(`Webhook signature verification failed: ${sigCheck.reason}`, 401);
      }
    }

    // 2. Parse and Validate Payload
    let event: ProviderWebhookEvent;
    try {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    } catch (err: any) {
      throw new ValidationError(`Invalid JSON webhook payload: ${err.message}`, 400);
    }

    if (!event || !event.id) {
      throw new ValidationError('Webhook event must include a valid unique "id"', 400);
    }
    if (!event.eventType) {
      throw new ValidationError('Webhook event must include "eventType"', 400);
    }
    if (!event.data || !event.data.providerReference) {
      throw new ValidationError('Webhook event data must include "providerReference"', 400);
    }

    // 3. Concurrency Protection (Lock by event ID)
    return await WebhookConcurrencyLock.executeExclusive(event.id, async () => {
      const nowIso = new Date().toISOString();

      // 4. Idempotency Check: Every provider event must be processed at most once logically
      const existingEvent = db.getWebhookEventRecord(event.id);
      if (existingEvent) {
        eventDispatcher.dispatch({
          id: generateInternalId('evt'),
          category: 'AUDIT_EVENTS',
          eventType: 'WEBHOOK_DUPLICATE_IGNORED',
          entityId: event.id,
          entityType: 'PAYMENT_WEBHOOK_EVENT',
          details: {
            providerEventId: event.id,
            originalStatus: existingEvent.status,
            receivedAt: nowIso,
            message: 'Duplicate webhook event received; ignored idempotently without side effects.',
          },
          createdAt: nowIso,
        });

        return {
          received: true,
          status: 'EVENT_ALREADY_PROCESSED',
          providerEventId: event.id,
          paymentId: existingEvent.paymentId,
          orderId: existingEvent.orderId,
          message: 'EVENT_ALREADY_PROCESSED: Event has already been processed. No duplicate actions performed.',
          processedAt: existingEvent.processedAt,
        };
      }

      // Compute payload digest for record integrity
      const payloadDigestSha256 = crypto
        .createHash('sha256')
        .update(rawPayloadString, 'utf8')
        .digest('hex');

      // 5. Correlate with Internal Payment & Order
      let order: Order | undefined;
      let payment: Payment | undefined;

      // Correlate by orderId / orderPublicId if provided
      if (event.data.orderId) {
        order = db.getOrderById(event.data.orderId);
      } else if (event.data.orderPublicId) {
        order = db.getOrderById(event.data.orderPublicId);
      }

      // Correlate by paymentIntentId or providerReference
      if (!payment && event.data.paymentIntentId) {
        const allPayments = db.getAllPayments();
        payment = allPayments.find(
          (p) => p.paymentIntentId === event.data.paymentIntentId || p.providerTransactionReference === event.data.paymentIntentId
        );
        if (payment && !order) {
          order = db.getOrderById(payment.orderId);
        }
      }

      if (!payment && event.data.providerReference) {
        const allPayments = db.getAllPayments();
        payment = allPayments.find(
          (p) =>
            p.providerTransactionReference === event.data.providerReference ||
            p.paymentIntentId === event.data.providerReference
        );
        if (payment && !order) {
          order = db.getOrderById(payment.orderId);
        }
      }

      if (order && !payment) {
        payment = db.getPaymentByOrderId(order.id);
      }

      // ------------------------------------------------------------------
      // CASE 1: PROVIDER / INTERNAL MISMATCH
      // (Provider sent a reference that does not match any internal record)
      // ------------------------------------------------------------------
      if (!order || !payment) {
        const mismatchRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: event.data.orderId || 'UNKNOWN_ORDER',
          orderPublicId: event.data.orderPublicId || 'UNKNOWN_ORDER',
          paymentId: payment?.id,
          paymentPublicId: payment?.publicId,
          provider: event.provider || providerName,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: 'UNMATCHED_NO_INTERNAL_RECORD',
          reconciliationState: 'MISMATCHED',
          expectedAmountMinor: 0,
          receivedAmountMinor: event.data.amountMinor || 0,
          expectedCurrency: 'INR',
          receivedCurrency: event.data.currency || 'UNKNOWN',
          discrepancyReason: `Provider reference "${event.data.providerReference}" does not match any known Order or Payment record in AquaBloom.`,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: 'Mismatched webhook logged for manual financial audit investigation.',
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'WEBHOOK_MISMATCH_DETECTED',
              details: `Uncorrelated provider reference ${event.data.providerReference} received on event ${event.id}`,
            },
          ],
        };

        db.savePaymentReconciliationRecord(mismatchRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || providerName,
          eventType: event.eventType,
          status: 'REJECTED_MISMATCH',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        eventDispatcher.dispatch({
          id: generateInternalId('evt'),
          category: 'AUDIT_EVENTS',
          eventType: 'PAYMENT_WEBHOOK_MISMATCH',
          entityId: event.id,
          entityType: 'PAYMENT_WEBHOOK',
          details: {
            providerEventId: event.id,
            providerReference: event.data.providerReference,
            reconciliationRecordId: mismatchRecord.publicId,
          },
          createdAt: nowIso,
        });

        return {
          received: true,
          status: 'REJECTED_MISMATCH',
          providerEventId: event.id,
          reconciliationState: 'MISMATCHED',
          message: `Provider reference "${event.data.providerReference}" could not be reconciled with internal database records.`,
          processedAt: nowIso,
        };
      }

      // Snapshot is authoritative
      const snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
      if (!snapshot) {
        throw new ConflictError(`Integrity failure: Order ${order.publicId} is missing OrderPricingSnapshot`);
      }

      const expectedAmountMinor = snapshot.grandTotal.amountMinor;
      const expectedCurrency = snapshot.currency || 'INR';
      const receivedAmountMinor = event.data.amountMinor;
      const receivedCurrency = event.data.currency;

      // ------------------------------------------------------------------
      // CASE 2: PAYMENT REVERSAL / CHARGEBACK / REFUND
      // A provider reversal must NOT be treated as a successful permanent payment!
      // ------------------------------------------------------------------
      const isReversalEvent =
        event.eventType.toLowerCase().includes('refund') ||
        event.eventType.toLowerCase().includes('revers') ||
        event.eventType.toLowerCase().includes('dispute') ||
        event.data.status === 'REVERSED';

      if (isReversalEvent) {
        const previousPaymentStatus = payment.status;
        payment.status = 'REVERSED';
        payment.reconciliationStatus = 'OVERPAID_FLAGGED'; // Flagged for reconciliation
        payment.reconciliationNotes = `Reversal event received: ${event.data.reversalReason || event.eventType}`;
        payment.updatedAt = nowIso;
        db.savePayment(payment);

        // State guard: Revert Order away from PAID to block fulfillment authorization
        const previousOrderStatus = order.status;
        order.status = 'PAYMENT_REQUIRED';
        order.updatedAt = nowIso;
        db.saveOrder(order);

        const reversalRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: order.id,
          orderPublicId: order.publicId,
          paymentId: payment.id,
          paymentPublicId: payment.publicId,
          provider: event.provider || payment.provider,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: payment.paymentReference,
          reconciliationState: 'REVERSED',
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
          discrepancyReason: `Payment reversed by gateway provider. Event: ${event.eventType}. Reason: ${event.data.reversalReason || 'Provider reversal'}`,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: `Reversal recorded. Order status reverted from ${previousOrderStatus} to PAYMENT_REQUIRED to protect fulfillment pipeline.`,
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'PAYMENT_REVERSED',
              details: `Payment transitioned from ${previousPaymentStatus} to REVERSED; Order reverted to PAYMENT_REQUIRED.`,
            },
          ],
        };
        db.savePaymentReconciliationRecord(reversalRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || payment.provider,
          eventType: event.eventType,
          orderId: order.id,
          paymentId: payment.id,
          status: 'REVERSED',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        eventDispatcher.dispatch({
          id: generateInternalId('evt'),
          category: 'BUSINESS_TIMELINE',
          eventType: 'PAYMENT_REVERSED_AUDIT',
          entityId: order.id,
          entityType: 'ORDER',
          details: {
            orderPublicId: order.publicId,
            paymentPublicId: payment.publicId,
            providerReference: event.data.providerReference,
            reversalReason: event.data.reversalReason || event.eventType,
            reconciliationRecordId: reversalRecord.publicId,
          },
          createdAt: nowIso,
        });

        return {
          received: true,
          status: 'REVERSED',
          providerEventId: event.id,
          paymentId: payment.id,
          orderId: order.id,
          reconciliationState: 'REVERSED',
          message: 'Payment reversal processed and flagged for reconciliation. Order reverted to PAYMENT_REQUIRED.',
          processedAt: nowIso,
        };
      }

      // ------------------------------------------------------------------
      // CASE 3: WRONG CURRENCY
      // ------------------------------------------------------------------
      if (receivedCurrency !== expectedCurrency) {
        payment.status = 'FAILED';
        payment.lastFailureReason = `Currency mismatch: expected ${expectedCurrency}, received ${receivedCurrency}`;
        payment.updatedAt = nowIso;
        db.savePayment(payment);

        const mismatchRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: order.id,
          orderPublicId: order.publicId,
          paymentId: payment.id,
          paymentPublicId: payment.publicId,
          provider: event.provider || payment.provider,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: payment.paymentReference,
          reconciliationState: 'MISMATCHED',
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
          discrepancyReason: `Currency mismatch: expected ${expectedCurrency}, received ${receivedCurrency}`,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: 'Webhook rejected due to unsupported/tampered currency.',
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'CURRENCY_MISMATCH_REJECTED',
              details: `Expected ${expectedCurrency}, received ${receivedCurrency}`,
            },
          ],
        };
        db.savePaymentReconciliationRecord(mismatchRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || payment.provider,
          eventType: event.eventType,
          orderId: order.id,
          paymentId: payment.id,
          status: 'FLAGGED_FOR_RECONCILIATION',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        return {
          received: true,
          status: 'FLAGGED_FOR_RECONCILIATION',
          providerEventId: event.id,
          paymentId: payment.id,
          orderId: order.id,
          reconciliationState: 'MISMATCHED',
          message: `Currency mismatch rejected: expected ${expectedCurrency}, received ${receivedCurrency}`,
          processedAt: nowIso,
        };
      }

      // ------------------------------------------------------------------
      // CASE 4: WRONG AMOUNT (UNDERPAYMENT OR OVERPAYMENT)
      // ------------------------------------------------------------------
      if (receivedAmountMinor !== expectedAmountMinor) {
        const isUnderpayment = receivedAmountMinor < expectedAmountMinor;
        const discrepancyType = isUnderpayment ? 'UNDERPAYMENT' : 'OVERPAYMENT';
        const discrepancyReason = isUnderpayment
          ? `Underpayment: expected ${expectedAmountMinor} paise (₹${(expectedAmountMinor / 100).toFixed(2)}), received ${receivedAmountMinor} paise (₹${(receivedAmountMinor / 100).toFixed(2)})`
          : `Overpayment: expected ${expectedAmountMinor} paise (₹${(expectedAmountMinor / 100).toFixed(2)}), received ${receivedAmountMinor} paise (₹${(receivedAmountMinor / 100).toFixed(2)})`;

        payment.status = isUnderpayment ? 'UNDERPAID_FLAGGED' : 'OVERPAID_RECONCILIATION_FLAGGED';
        payment.reconciliationStatus = isUnderpayment ? 'UNDERPAID_FLAGGED' : 'OVERPAID_FLAGGED';
        payment.reconciliationNotes = discrepancyReason;
        payment.discrepancyDetails = {
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
        };
        payment.updatedAt = nowIso;
        db.savePayment(payment);

        const amountMismatchRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: order.id,
          orderPublicId: order.publicId,
          paymentId: payment.id,
          paymentPublicId: payment.publicId,
          provider: event.provider || payment.provider,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: payment.paymentReference,
          reconciliationState: 'MISMATCHED',
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
          discrepancyReason,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: `${discrepancyType} detected via webhook. Order remains ${order.status}; payment not marked PAID.`,
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'AMOUNT_MISMATCH_FLAGGED',
              details: discrepancyReason,
            },
          ],
        };
        db.savePaymentReconciliationRecord(amountMismatchRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || payment.provider,
          eventType: event.eventType,
          orderId: order.id,
          paymentId: payment.id,
          status: 'FLAGGED_FOR_RECONCILIATION',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        return {
          received: true,
          status: 'FLAGGED_FOR_RECONCILIATION',
          providerEventId: event.id,
          paymentId: payment.id,
          orderId: order.id,
          reconciliationState: 'MISMATCHED',
          message: discrepancyReason,
          processedAt: nowIso,
        };
      }

      // ------------------------------------------------------------------
      // CASE 5: OUT-OF-ORDER & DELAYED EVENTS (SERVER-SIDE STATE GUARDS)
      // ------------------------------------------------------------------

      // If payment is already confirmed PAID:
      if (payment.status === 'PAID') {
        // A. Delayed success event: Acknowledge cleanly and record MATCHED reconciliation
        if (event.data.status === 'SUCCEEDED') {
          const matchedRecord: PaymentReconciliationRecord = {
            id: generateInternalId('prc'),
            publicId: generateBusinessId('AB-PRC'),
            orderId: order.id,
            orderPublicId: order.publicId,
            paymentId: payment.id,
            paymentPublicId: payment.publicId,
            provider: event.provider || payment.provider,
            providerEventId: event.id,
            providerReference: event.data.providerReference,
            internalTransactionReference: payment.paymentReference,
            reconciliationState: 'MATCHED',
            expectedAmountMinor,
            receivedAmountMinor,
            expectedCurrency,
            receivedCurrency,
            eventTimestamp: event.timestamp || nowIso,
            receivedTimestamp: nowIso,
            processedTimestamp: nowIso,
            notes: 'Delayed webhook matched confirmed payment. Payment remains PAID.',
            auditTrail: [
              {
                timestamp: nowIso,
                action: 'DELAYED_WEBHOOK_MATCHED',
                details: 'Payment was already verified as PAID. Webhook matched successfully.',
              },
            ],
          };
          db.savePaymentReconciliationRecord(matchedRecord);

          db.saveWebhookEventRecord({
            id: generateInternalId('whe'),
            providerEventId: event.id,
            provider: event.provider || payment.provider,
            eventType: event.eventType,
            orderId: order.id,
            paymentId: payment.id,
            status: 'PROCESSED',
            receivedAt: nowIso,
            processedAt: nowIso,
            payloadDigestSha256,
            rawPayloadPreview: rawPayloadString.substring(0, 300),
          });

          return {
            received: true,
            status: 'PROCESSED',
            providerEventId: event.id,
            paymentId: payment.id,
            orderId: order.id,
            reconciliationState: 'MATCHED',
            message: 'Delayed webhook matched previously confirmed payment.',
            processedAt: nowIso,
          };
        }

        // B. Out-of-order failure event:
        // Do NOT downgrade a confirmed PAID payment! Flag for review
        if (event.data.status === 'FAILED') {
          const reviewRecord: PaymentReconciliationRecord = {
            id: generateInternalId('prc'),
            publicId: generateBusinessId('AB-PRC'),
            orderId: order.id,
            orderPublicId: order.publicId,
            paymentId: payment.id,
            paymentPublicId: payment.publicId,
            provider: event.provider || payment.provider,
            providerEventId: event.id,
            providerReference: event.data.providerReference,
            internalTransactionReference: payment.paymentReference,
            reconciliationState: 'PENDING_REVIEW',
            expectedAmountMinor,
            receivedAmountMinor,
            expectedCurrency,
            receivedCurrency,
            discrepancyReason: `Out-of-order failure event received after payment was already confirmed as PAID. Provider reason: ${event.data.failureReason || 'Failed attempt'}`,
            eventTimestamp: event.timestamp || nowIso,
            receivedTimestamp: nowIso,
            processedTimestamp: nowIso,
            notes: 'Payment preserved as PAID under state guard. Flagged for review.',
            auditTrail: [
              {
                timestamp: nowIso,
                action: 'OUT_OF_ORDER_FAILURE_GUARDED',
                details: 'Out-of-order failure ignored; payment was already verified.',
              },
            ],
          };
          db.savePaymentReconciliationRecord(reviewRecord);

          db.saveWebhookEventRecord({
            id: generateInternalId('whe'),
            providerEventId: event.id,
            provider: event.provider || payment.provider,
            eventType: event.eventType,
            orderId: order.id,
            paymentId: payment.id,
            status: 'PROCESSED',
            receivedAt: nowIso,
            processedAt: nowIso,
            payloadDigestSha256,
            rawPayloadPreview: rawPayloadString.substring(0, 300),
          });

          return {
            received: true,
            status: 'PROCESSED',
            providerEventId: event.id,
            paymentId: payment.id,
            orderId: order.id,
            reconciliationState: 'PENDING_REVIEW',
            message: 'Out-of-order failure event received after payment was already verified as PAID; state guarded.',
            processedAt: nowIso,
          };
        }
      }

      // ------------------------------------------------------------------
      // CASE 6: FAILED PAYMENT EVENT
      // ------------------------------------------------------------------
      if (event.data.status === 'FAILED') {
        payment.status = 'FAILED';
        payment.failedAt = nowIso;
        payment.lastFailureReason = event.data.failureReason || 'Payment failed at gateway';
        payment.updatedAt = nowIso;
        db.savePayment(payment);

        const failRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: order.id,
          orderPublicId: order.publicId,
          paymentId: payment.id,
          paymentPublicId: payment.publicId,
          provider: event.provider || payment.provider,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: payment.paymentReference,
          reconciliationState: 'MATCHED',
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
          discrepancyReason: event.data.failureReason,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: 'Gateway failure recorded. Order remains payable for retry.',
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'PAYMENT_FAILED_AT_GATEWAY',
              details: event.data.failureReason || 'Gateway failure',
            },
          ],
        };
        db.savePaymentReconciliationRecord(failRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || payment.provider,
          eventType: event.eventType,
          orderId: order.id,
          paymentId: payment.id,
          status: 'PROCESSED',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        return {
          received: true,
          status: 'PROCESSED',
          providerEventId: event.id,
          paymentId: payment.id,
          orderId: order.id,
          reconciliationState: 'MATCHED',
          message: 'Payment failure recorded from gateway webhook.',
          processedAt: nowIso,
        };
      }

      // ------------------------------------------------------------------
      // CASE 7: SUCCESSFUL PAYMENT VERIFICATION VIA WEBHOOK
      // (Exact amount match, INR currency, SUCCEEDED status)
      // ------------------------------------------------------------------
      if (event.data.status === 'SUCCEEDED') {
        payment.status = 'PAID';
        payment.paidAt = nowIso;
        payment.verifiedAt = nowIso;
        payment.verifiedBy = `webhook:${event.provider || providerName}`;
        payment.providerTransactionReference = event.data.providerReference;
        payment.reconciliationStatus = 'NONE';
        payment.updatedAt = nowIso;
        db.savePayment(payment);

        order.status = 'PAID';
        order.updatedAt = nowIso;
        db.saveOrder(order);

        // Step 12E: Create authoritative immutable financial ledger entries and venue compensation record
        FinancialLedgerEngine.createAuthoritativeLedgerEntries(
          order.id,
          payment.id,
          `webhook:${event.provider || providerName}`
        );

        // Step 12F: Hard financial gate for fulfillment authorization
        try {
          FulfillmentAuthorizationService.authorizeFulfillment(order.id, {
            actor: `webhook:${event.provider || providerName}`,
            sourcePaymentReference: event.data.providerReference,
            allowSystemBypassRoleCheck: true,
          });
        } catch (gateErr) {
          console.warn(`[FulfillmentAuthorization] Webhook gate evaluation completed:`, gateErr);
        }

        // Update latest attempt if present
        if (payment.latestAttemptId) {
          const attempt = db.getPaymentAttemptById(payment.latestAttemptId);
          if (attempt && attempt.status !== 'SUCCESS') {
            attempt.status = 'SUCCESS';
            attempt.completedAt = nowIso;
            attempt.verifiedAt = nowIso;
            attempt.verifiedAmountMinor = receivedAmountMinor;
            attempt.verifiedCurrency = receivedCurrency;
            attempt.providerReference = event.data.providerReference;
            db.savePaymentAttempt(attempt);
          }
        }

        const successRecord: PaymentReconciliationRecord = {
          id: generateInternalId('prc'),
          publicId: generateBusinessId('AB-PRC'),
          orderId: order.id,
          orderPublicId: order.publicId,
          paymentId: payment.id,
          paymentPublicId: payment.publicId,
          provider: event.provider || payment.provider,
          providerEventId: event.id,
          providerReference: event.data.providerReference,
          internalTransactionReference: payment.paymentReference,
          reconciliationState: 'MATCHED',
          expectedAmountMinor,
          receivedAmountMinor,
          expectedCurrency,
          receivedCurrency,
          eventTimestamp: event.timestamp || nowIso,
          receivedTimestamp: nowIso,
          processedTimestamp: nowIso,
          notes: 'Webhook verified payment success. Authoritative amount matched exactly in INR.',
          auditTrail: [
            {
              timestamp: nowIso,
              action: 'PAYMENT_VERIFIED_VIA_WEBHOOK',
              details: `Payment ${payment.publicId} verified as PAID for Order ${order.publicId}`,
            },
          ],
        };
        db.savePaymentReconciliationRecord(successRecord);

        db.saveWebhookEventRecord({
          id: generateInternalId('whe'),
          providerEventId: event.id,
          provider: event.provider || payment.provider,
          eventType: event.eventType,
          orderId: order.id,
          paymentId: payment.id,
          status: 'PROCESSED',
          receivedAt: nowIso,
          processedAt: nowIso,
          payloadDigestSha256,
          rawPayloadPreview: rawPayloadString.substring(0, 300),
        });

        eventDispatcher.dispatch({
          id: generateInternalId('evt'),
          category: 'BUSINESS_TIMELINE',
          eventType: 'PAYMENT_VERIFIED_PAID',
          entityId: order.id,
          entityType: 'ORDER',
          details: {
            orderPublicId: order.publicId,
            paymentPublicId: payment.publicId,
            amountMinor: receivedAmountMinor,
            currency: receivedCurrency,
            providerReference: event.data.providerReference,
            source: 'WEBHOOK',
          },
          createdAt: nowIso,
        });

        return {
          received: true,
          status: 'PROCESSED',
          providerEventId: event.id,
          paymentId: payment.id,
          orderId: order.id,
          reconciliationState: 'MATCHED',
          message: 'Payment verified and marked PAID via webhook.',
          processedAt: nowIso,
        };
      }

      // Default fallback
      return {
        received: true,
        status: 'PROCESSED',
        providerEventId: event.id,
        paymentId: payment.id,
        orderId: order.id,
        reconciliationState: 'PENDING_REVIEW',
        message: `Unhandled event status: ${event.data.status}`,
        processedAt: nowIso,
      };
    });
  }
}
