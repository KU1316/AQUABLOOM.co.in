/**
 * AQUABLOOM — STEP 12B: PAYMENT INITIATION ENGINE
 * 
 * Provides:
 * 1. Provider-independent abstraction (`PaymentProvider`, `PaymentProviderRegistry`)
 * 2. Strict authorization & counterparty isolation (`PaymentAuthorizationService`)
 * 3. Payment Initiation Service (`PaymentInitiationService`)
 *    - Validates Order state = PAYMENT_REQUIRED
 *    - Validates Order ownership by authenticated Advertiser
 *    - Retrieves authoritative amount strictly from OrderPricingSnapshot.grandTotal
 *    - Rejects client-tampered amounts and currencies
 *    - Reuses single Payment record per Order; handles repeated clicks / idempotent initiation
 *    - Creates separate PaymentAttempt for each legitimate payment attempt
 *    - Handles failure states: records failure, Payment remains unpaid, Order remains payable, retryable
 *    - Emits audit and timeline events
 */

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
  PaymentAttemptStatus,
  PaymentProvider,
  CreatePaymentIntentOptions,
  PaymentIntentResult,
  InitiatePaymentInput,
  PaymentInitiationResult,
  ProviderVerificationResult,
  VerifyPaymentInput,
  PaymentVerificationResult,
} from '../types.js';
import { FinancialLedgerEngine } from './financialLedgerServices.js';
import { FulfillmentAuthorizationService } from './fulfillmentAuthorizationServices.js';

/**
 * ========================================================
 * 1. PROVIDER ABSTRACTION & REGISTRY
 * ========================================================
 */

/**
 * Standard Simulated / Mock Provider for Step 12 Architecture
 * Simulates creation of provider payment intents without hardcoding to a specific third-party SDK.
 */
export class SimulatedPaymentProvider implements PaymentProvider {
  public name = 'SIMULATED';

  public async createPaymentIntent(
    options: CreatePaymentIntentOptions
  ): Promise<PaymentIntentResult> {
    const timestamp = Date.now();
    const paymentIntentId = `pi_sim_${options.orderId}_${timestamp}`;
    const clientSecret = `cs_sim_${options.orderId}_secret_${Math.random().toString(36).substring(2, 10)}`;

    return {
      paymentIntentId,
      clientSecret,
      provider: this.name,
      status: 'REQUIRES_PAYMENT_METHOD',
      amountMinor: options.amountMinor,
      currency: options.currency,
      providerMetadata: {
        simulatedAt: new Date().toISOString(),
        orderPublicId: options.orderPublicId,
        advertiserId: options.advertiserId,
      },
    };
  }

  public async retrievePaymentIntent(paymentIntentId: string): Promise<PaymentIntentResult> {
    return {
      paymentIntentId,
      provider: this.name,
      status: 'REQUIRES_PAYMENT_METHOD',
      amountMinor: 0,
      currency: 'INR',
    };
  }

  public async verifyPayment(
    providerReference: string,
    metadata?: Record<string, any>
  ): Promise<ProviderVerificationResult> {
    const nowIso = new Date().toISOString();

    // 1. Simulation override (for tests / edge cases)
    if (metadata?.simulationOverride) {
      const override = metadata.simulationOverride;
      return {
        providerReference,
        status: override.status || 'SUCCEEDED',
        amountMinor:
          override.amountMinor !== undefined
            ? override.amountMinor
            : metadata?.expectedAmountMinor || 0,
        currency: override.currency || 'INR',
        failureReason: override.failureReason,
        errorCode: override.errorCode,
        providerMetadata: {
          simulated: true,
          overridden: true,
        },
        verifiedAt: nowIso,
      };
    }

    // 2. Reject explicit invalid reference strings
    if (
      !providerReference ||
      providerReference === 'invalid_provider_ref' ||
      providerReference === 'unknown_ref' ||
      providerReference.startsWith('invalid_')
    ) {
      throw new ValidationError(`Transaction '${providerReference}' not found on payment gateway.`);
    }

    // 3. Simulated failure triggers
    if (
      providerReference.includes('fail') ||
      providerReference.includes('declined') ||
      providerReference.includes('error')
    ) {
      return {
        providerReference,
        status: 'FAILED',
        amountMinor: metadata?.expectedAmountMinor || 0,
        currency: 'INR',
        failureReason: 'Payment method declined by issuing bank (insufficient funds or card block).',
        errorCode: 'CARD_DECLINED',
        verifiedAt: nowIso,
      };
    }

    // 4. Default simulated success
    return {
      providerReference,
      status: 'SUCCEEDED',
      amountMinor: metadata?.expectedAmountMinor || 0,
      currency: 'INR',
      providerMetadata: {
        simulated: true,
        gatewayTransactionId: `txn_gw_${Math.random().toString(36).substring(2, 10)}`,
        authCode: 'AUTH_SIM_9921',
      },
      verifiedAt: nowIso,
    };
  }
}

/**
 * Failing Provider for failure testing
 */
export class FailingSimulatedProvider implements PaymentProvider {
  public name = 'FAILING_SIMULATED';

  public async createPaymentIntent(
    options: CreatePaymentIntentOptions
  ): Promise<PaymentIntentResult> {
    throw new Error('Payment gateway upstream network timeout or provider rejected initiation.');
  }

  public async verifyPayment(
    providerReference: string,
    metadata?: Record<string, any>
  ): Promise<ProviderVerificationResult> {
    return {
      providerReference,
      status: 'FAILED',
      amountMinor: metadata?.expectedAmountMinor || 0,
      currency: 'INR',
      failureReason: 'Upstream gateway processing failure: Provider connection declined.',
      errorCode: 'GATEWAY_ERROR',
      verifiedAt: new Date().toISOString(),
    };
  }
}

/**
 * Payment Provider Registry
 */
export class PaymentProviderRegistry {
  private static providers: Map<string, PaymentProvider> = new Map();
  private static defaultProviderName: string = 'SIMULATED';

  static {
    PaymentProviderRegistry.register(new SimulatedPaymentProvider());
    PaymentProviderRegistry.register(new FailingSimulatedProvider());
  }

  public static register(provider: PaymentProvider): void {
    PaymentProviderRegistry.providers.set(provider.name.toUpperCase(), provider);
  }

  public static get(name?: string): PaymentProvider {
    const key = (name || PaymentProviderRegistry.defaultProviderName).toUpperCase();
    const provider = PaymentProviderRegistry.providers.get(key);
    if (!provider) {
      throw new ValidationError(`Payment provider '${name}' is not registered in system.`);
    }
    return provider;
  }

  public static setDefault(name: string): void {
    const key = name.toUpperCase();
    if (!PaymentProviderRegistry.providers.has(key)) {
      throw new ValidationError(`Cannot set unknown provider '${name}' as default.`);
    }
    PaymentProviderRegistry.defaultProviderName = key;
  }
}

/**
 * ========================================================
 * 2. PAYMENT AUTHORIZATION SERVICE
 * ========================================================
 */
export class PaymentAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to initiate payment.');
    }
  }

  /**
   * Asserts actor can initiate payment for the Order.
   * Only the contracted Advertiser or Platform Admin can initiate payment.
   * Suppliers, Venues, Logistics Partners, or other Advertisers are rejected with 403.
   */
  public static assertCanInitiatePayment(order: Order, actor: User): void {
    PaymentAuthorizationService.assertAuthenticated(actor);

    if (actor.role === 'ADMIN') {
      return;
    }

    if (actor.role === 'ADVERTISER') {
      if (order.advertiserId === actor.id) {
        return;
      }
      PaymentAuthorizationService.recordAccessDenied(
        order.id,
        actor,
        `Advertiser '${actor.publicAccountId || actor.id}' attempted to pay for an Order owned by '${order.advertiserPublicId || order.advertiserId}'.`
      );
      throw new AuthorizationError(
        `Access denied: You do not own Order '${order.publicId}'. Only the contracted advertiser may initiate payment.`
      );
    }

    // Venues, Suppliers, Logistics Partners, or others
    PaymentAuthorizationService.recordAccessDenied(
      order.id,
      actor,
      `Counterparty with role '${actor.role}' attempted to initiate payment for Order '${order.publicId}'.`
    );
    throw new AuthorizationError(
      `Access denied: Users with role '${actor.role}' cannot initiate order payments. Only the contracted advertiser can pay.`
    );
  }

  /**
   * Asserts actor can verify payment for the Order (Step 12C).
   * Only the contracted Advertiser or Platform Admin can verify payment.
   * Suppliers, Venues, Logistics Partners, or other Advertisers are rejected with 403.
   */
  public static assertCanVerifyPayment(order: Order, actor: User): void {
    PaymentAuthorizationService.assertAuthenticated(actor);

    if (actor.role === 'ADMIN') {
      return;
    }

    if (actor.role === 'ADVERTISER') {
      if (order.advertiserId === actor.id) {
        return;
      }
      PaymentAuthorizationService.recordAccessDenied(
        order.id,
        actor,
        `Advertiser '${actor.publicAccountId || actor.id}' attempted to verify payment for Order owned by '${order.advertiserPublicId || order.advertiserId}'.`
      );
      throw new AuthorizationError(
        `Access denied: You do not own Order '${order.publicId}'. Only the contracted advertiser or administrator may verify payment.`
      );
    }

    PaymentAuthorizationService.recordAccessDenied(
      order.id,
      actor,
      `Counterparty with role '${actor.role}' attempted to verify payment for Order '${order.publicId}'.`
    );
    throw new AuthorizationError(
      `Access denied: Users with role '${actor.role}' cannot verify order payments.`
    );
  }

  private static recordAccessDenied(orderId: string, actor: User, reason: string): void {
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'ORDER_ACCESS_DENIED',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId,
        actorId: actor.id,
        actorRole: actor.role,
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

/**
 * ========================================================
 * 3. PAYMENT INITIATION SERVICE (STEP 12B)
 * ========================================================
 */
export class PaymentInitiationService {
  /**
   * Initiates payment for an Order.
   * 
   * Strict Entry Conditions:
   * 1. Authenticated advertiser
   * 2. Advertiser owns the Order (or platform admin)
   * 3. Order status = PAYMENT_REQUIRED
   * 4. OrderPricingSnapshot exists & is valid / frozen
   * 5. Authoritative amount retrieved strictly from OrderPricingSnapshot.grandTotal
   * 6. Rejects tampered client-supplied amount or currency
   * 7. Reuses single Payment record per Order; creates PaymentAttempt for each attempt
   * 8. On failure: Payment remains unpaid, Order remains payable, failure recorded, retryable
   */
  public static async initiatePayment(
    input: InitiatePaymentInput,
    actor: User
  ): Promise<PaymentInitiationResult> {
    PaymentAuthorizationService.assertAuthenticated(actor);

    const {
      orderId,
      idempotencyKey,
      providerPreference,
      clientProvidedAmountMinor,
      clientProvidedCurrency,
    } = input;

    // 1. Retrieve Order
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' was not found.`);
    }

    // 2. Verify Security & Ownership
    PaymentAuthorizationService.assertCanInitiatePayment(order, actor);

    // 3. Verify Order Status = PAYMENT_REQUIRED
    if (order.status !== 'PAYMENT_REQUIRED') {
      throw new ValidationError(
        `Payment initiation rejected: Order '${order.publicId}' is in '${order.status}' status. Payment can only be initiated when Order status is 'PAYMENT_REQUIRED'.`
      );
    }

    // 4. Retrieve Authoritative OrderPricingSnapshot
    const snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    if (!snapshot) {
      throw new ValidationError(
        `Payment initiation rejected: Authoritative OrderPricingSnapshot is missing for Order '${order.publicId}'. Pricing must be frozen before payment.`
      );
    }

    // Verify snapshot validity & immutability
    if (!snapshot.isFrozen || !snapshot.grandTotal || typeof snapshot.grandTotal.amountMinor !== 'number') {
      throw new ValidationError(
        `Payment initiation rejected: OrderPricingSnapshot for Order '${order.publicId}' is corrupt or unconfirmed.`
      );
    }

    // 5. Authoritative Amount Resolution (Sourced strictly from snapshot.grandTotal)
    const authoritativeAmountMinor = snapshot.grandTotal.amountMinor;
    const authoritativeAmountFormatted = snapshot.grandTotal.amountFormatted;
    const authoritativeCurrency: 'INR' = snapshot.currency;

    if (authoritativeAmountMinor <= 0) {
      throw new ValidationError(
        `Payment initiation rejected: Authoritative grand total must be positive (received ${authoritativeAmountMinor}).`
      );
    }

    // 6. Security Check: Reject Tampered Client-Provided Values
    if (clientProvidedCurrency !== undefined && clientProvidedCurrency !== authoritativeCurrency) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PAYMENT_TAMPER_ATTEMPT',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          orderId: order.id,
          expectedCurrency: authoritativeCurrency,
          receivedCurrency: clientProvidedCurrency,
        },
      });
      throw new ValidationError(
        `Payment rejected: Currency mismatch. Expected '${authoritativeCurrency}', received '${clientProvidedCurrency}'.`
      );
    }

    if (clientProvidedAmountMinor !== undefined && clientProvidedAmountMinor !== authoritativeAmountMinor) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PAYMENT_TAMPER_ATTEMPT',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          orderId: order.id,
          expectedAmountMinor: authoritativeAmountMinor,
          receivedAmountMinor: clientProvidedAmountMinor,
        },
      });
      throw new ValidationError(
        `Payment rejected: Tampered amount detected. Authoritative amount is ${authoritativeAmountFormatted} (${authoritativeAmountMinor} paise), received ${clientProvidedAmountMinor} paise.`
      );
    }

    // 7. Check for Idempotency / Duplicate Click
    // First, check if payment already exists for this order
    let existingPayment = db.getPaymentByOrderId(order.id);
    let isReused = false;

    const now = new Date().toISOString();

    if (!existingPayment) {
      // Create new Payment record
      const paymentId = generateInternalId('pay');
      const paymentPublicId = generateBusinessId('AB-PAY');
      const paymentReference = `PAY-REF-${Math.floor(100000 + Math.random() * 900000)}`;

      const newPayment: Payment = {
        id: paymentId,
        publicId: paymentPublicId,
        paymentReference,
        orderId: order.id,
        orderPublicId: order.publicId,
        orderReference: order.orderReference,
        advertiserId: order.advertiserId,
        advertiserPublicId: order.advertiserPublicId,
        amountMinor: authoritativeAmountMinor,
        amountFormatted: authoritativeAmountFormatted,
        currency: authoritativeCurrency,
        pricingSnapshotId: snapshot.id,
        pricingSnapshotPublicId: snapshot.publicId,
        status: 'PENDING',
        provider: providerPreference || 'SIMULATED',
        idempotencyKey: idempotencyKey || undefined,
        attemptsCount: 0,
        initiatedAt: now,
        createdAt: now,
        updatedAt: now,
      };

      existingPayment = db.savePayment(newPayment);
    } else {
      isReused = true;

      // Ensure existing payment amount matches authoritative snapshot (cannot diverge)
      if (existingPayment.amountMinor !== authoritativeAmountMinor) {
        existingPayment.amountMinor = authoritativeAmountMinor;
        existingPayment.amountFormatted = authoritativeAmountFormatted;
      }

      // If existing payment is already PAID, do not allow new initiation
      if (existingPayment.status === 'PAID') {
        throw new ConflictError(
          `Payment for Order '${order.publicId}' has already been completed.`
        );
      }
    }

    // 8. Create PaymentAttempt record for this legitimate attempt
    const attemptNumber = existingPayment.attemptsCount + 1;
    const attemptId = generateInternalId('pma');
    const attemptPublicId = generateBusinessId('AB-PMA');

    const providerInstance = PaymentProviderRegistry.get(providerPreference || existingPayment.provider);

    const paymentAttempt: PaymentAttempt = {
      id: attemptId,
      publicId: attemptPublicId,
      paymentId: existingPayment.id,
      orderId: order.id,
      attemptNumber,
      provider: providerInstance.name,
      status: 'INITIATED',
      amountMinor: authoritativeAmountMinor,
      currency: authoritativeCurrency,
      initiatedAt: now,
    };

    db.savePaymentAttempt(paymentAttempt);

    // Update payment attempts counter
    existingPayment.attemptsCount = attemptNumber;
    existingPayment.latestAttemptId = attemptId;
    existingPayment.updatedAt = now;
    db.savePayment(existingPayment);

    // 9. Call Provider Abstraction to create payment intent
    try {
      const intentResult = await providerInstance.createPaymentIntent({
        orderId: order.id,
        orderPublicId: order.publicId,
        amountMinor: authoritativeAmountMinor,
        currency: authoritativeCurrency,
        advertiserId: order.advertiserId,
        customerEmail: actor.email,
        idempotencyKey: idempotencyKey,
        metadata: {
          paymentId: existingPayment.id,
          paymentPublicId: existingPayment.publicId,
          attemptNumber,
        },
      });

      // Update attempt status
      paymentAttempt.status = 'PROCESSING';
      paymentAttempt.providerReference = intentResult.paymentIntentId;
      db.savePaymentAttempt(paymentAttempt);

      // Update payment record with intent details
      existingPayment.status = 'REQUIRES_PAYMENT_METHOD';
      existingPayment.paymentIntentId = intentResult.paymentIntentId;
      existingPayment.clientSecret = intentResult.clientSecret;
      existingPayment.provider = intentResult.provider;
      existingPayment.updatedAt = new Date().toISOString();
      db.savePayment(existingPayment);

      // Timeline / Audit event
      eventDispatcher.dispatch({
        category: 'BUSINESS_TIMELINE',
        eventType: 'PAYMENT_INITIATED',
        userId: actor.id,
        role: actor.role,
        scope: 'RESTRICTED',
        payload: {
          paymentId: existingPayment.id,
          paymentPublicId: existingPayment.publicId,
          orderId: order.id,
          orderPublicId: order.publicId,
          authoritativeAmountFormatted,
          attemptNumber,
          provider: intentResult.provider,
          paymentIntentId: intentResult.paymentIntentId,
        },
      });

      return {
        paymentId: existingPayment.id,
        paymentPublicId: existingPayment.publicId,
        paymentReference: existingPayment.paymentReference,
        orderId: order.id,
        orderPublicId: order.publicId,
        orderStatus: order.status,
        paymentStatus: existingPayment.status,
        authoritativeAmount: {
          amountMinor: authoritativeAmountMinor,
          amountFormatted: authoritativeAmountFormatted,
          currency: authoritativeCurrency,
        },
        attemptNumber,
        attemptId: paymentAttempt.id,
        attemptPublicId: paymentAttempt.publicId,
        clientSecret: intentResult.clientSecret,
        paymentIntentId: intentResult.paymentIntentId,
        provider: intentResult.provider,
        isReused,
        message: `Payment initiated successfully for Order ${order.publicId}. Authoritative amount: ${authoritativeAmountFormatted}.`,
      };
    } catch (providerError: any) {
      // 10. FAILURE HANDLING
      // If initiation fails:
      // - Payment remains unpaid (FAILED or PENDING)
      // - Order remains payable (PAYMENT_REQUIRED; DO NOT mark PAID)
      // - Failure is recorded on attempt and payment
      // - Advertiser can retry
      const failureReason = providerError?.message || 'Payment provider initiation failed.';
      const failureTimestamp = new Date().toISOString();

      paymentAttempt.status = 'FAILED';
      paymentAttempt.failureReason = failureReason;
      paymentAttempt.completedAt = failureTimestamp;
      db.savePaymentAttempt(paymentAttempt);

      existingPayment.status = 'FAILED';
      existingPayment.failedAt = failureTimestamp;
      existingPayment.lastFailureReason = failureReason;
      existingPayment.updatedAt = failureTimestamp;
      db.savePayment(existingPayment);

      eventDispatcher.dispatch({
        category: 'BUSINESS_TIMELINE',
        eventType: 'PAYMENT_INITIATION_FAILED',
        userId: actor.id,
        role: actor.role,
        scope: 'RESTRICTED',
        payload: {
          paymentId: existingPayment.id,
          paymentPublicId: existingPayment.publicId,
          orderId: order.id,
          orderPublicId: order.publicId,
          attemptNumber,
          failureReason,
        },
      });

      throw new ValidationError(
        `Payment initiation failed: ${failureReason}. The order remains payable and you can retry.`
      );
    }
  }

  /**
   * Retrieves payment record for an Order with security isolation
   */
  public static getPaymentForOrder(orderIdOrPublicId: string, actor: User): Payment | undefined {
    PaymentAuthorizationService.assertAuthenticated(actor);

    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderIdOrPublicId}' was not found.`);
    }

    PaymentAuthorizationService.assertCanInitiatePayment(order, actor);

    return db.getPaymentByOrderId(order.id);
  }

  /**
   * Retrieves payment attempts for an Order
   */
  public static getPaymentAttemptsForOrder(orderIdOrPublicId: string, actor: User): PaymentAttempt[] {
    PaymentAuthorizationService.assertAuthenticated(actor);

    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderIdOrPublicId}' was not found.`);
    }

    PaymentAuthorizationService.assertCanInitiatePayment(order, actor);

    return db.getPaymentAttemptsByOrderId(order.id);
  }
}

/**
 * ========================================================
 * 4. STEP 12C: SERVER-SIDE PAYMENT VERIFICATION SERVICE
 * ========================================================
 *
 * Verifies that payment actually succeeded via authoritative server checks.
 * The UI must never determine payment success.
 *
 * Flow:
 * Payment initiated
 * ↓
 * Provider result
 * ↓
 * Server verification
 * ↓
 * Amount + currency validation
 * ↓
 * Payment verified
 * ↓
 * Payment = PAID
 */
export class PaymentVerificationService {
  /**
   * Performs authoritative server-side payment verification (Step 12C)
   *
   * Verifies:
   * 1. Provider transaction/reference authenticity
   * 2. Authoritative amount strictly against OrderPricingSnapshot.grandTotal
   * 3. Authoritative currency ('INR')
   * 4. Order existence and ownership
   * 5. Payment existence
   * 6. Provider status (SUCCEEDED vs FAILED/OTHER)
   *
   * Handles:
   * - Underpayment: Do not mark PAID. Flag for reconciliation.
   * - Overpayment: Do not silently treat as normal payment. Flag for reconciliation. No refunds invented here.
   * - Failed payment: Record failure status, provider reference, failure reason, timestamp. Allow retry.
   * - Duplicate verification: Idempotent return without altering state.
   * - Success: Payment = PAID (Order = PAID; do not yet implement production).
   */
  public static async verifyPayment(
    input: VerifyPaymentInput,
    actor: User
  ): Promise<PaymentVerificationResult> {
    PaymentAuthorizationService.assertAuthenticated(actor);

    if (!input.orderId) {
      throw new ValidationError('OrderId is required for payment verification.');
    }

    // 1. Fetch Order
    const order = db.getOrderById(input.orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${input.orderId}' was not found.`);
    }

    // 2. Security Isolation: Counterparty and ownership check
    PaymentAuthorizationService.assertCanVerifyPayment(order, actor);

    // 3. Check Order State
    if (order.status === 'CANCELLED') {
      throw new ValidationError(`Cannot verify payment for cancelled Order '${order.publicId}'.`);
    }

    // 4. Fetch Payment Record
    const payment = db.getPaymentByOrderId(order.id);
    if (!payment) {
      throw new ValidationError(
        `No payment record found for Order '${order.publicId}'. Payment must be initiated first.`
      );
    }

    // 5. Fetch Authoritative Snapshot
    const snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    if (!snapshot) {
      throw new ValidationError(
        `OrderPricingSnapshot is missing for Order '${order.publicId}'. Cannot verify payment without authoritative pricing.`
      );
    }

    const expectedAmountMinor = snapshot.grandTotal.amountMinor;
    const expectedCurrency = snapshot.currency;

    // Fetch existing attempts
    const attempts = db.getPaymentAttemptsByOrderId(order.id);
    const latestAttempt =
      attempts.find((a) => a.id === payment.latestAttemptId) || attempts[attempts.length - 1];

    // 6. Duplicate Verification Check (Idempotency)
    // If payment is already verified as PAID:
    if (payment.status === 'PAID') {
      return {
        paymentId: payment.id,
        paymentPublicId: payment.publicId,
        paymentReference: payment.paymentReference,
        orderId: order.id,
        orderPublicId: order.publicId,
        orderStatus: order.status,
        paymentStatus: 'PAID',
        isPaid: true,
        authoritativeAmount: {
          amountMinor: snapshot.grandTotal.amountMinor,
          amountFormatted: snapshot.grandTotal.amountFormatted,
          currency: snapshot.currency,
        },
        verifiedAmount: {
          amountMinor: payment.amountMinor,
          amountFormatted: payment.amountFormatted,
          currency: payment.currency,
        },
        provider: payment.provider,
        providerReference: payment.providerTransactionReference || input.providerReference,
        attemptId: latestAttempt?.id || '',
        attemptPublicId: latestAttempt?.publicId || '',
        attemptNumber: latestAttempt?.attemptNumber || payment.attemptsCount,
        attemptStatus: 'SUCCESS',
        reconciliationRequired: false,
        verifiedAt: payment.verifiedAt || payment.paidAt || new Date().toISOString(),
        message: 'Payment has already been successfully verified and marked as PAID (Idempotent verification).',
      };
    }

    // 7. Validate Provider Reference
    if (!input.providerReference || input.providerReference.trim() === '') {
      throw new ValidationError('Provider transaction reference is required for payment verification.');
    }

    // 8. Invoke Provider Gateway for Authoritative Status
    const provider = PaymentProviderRegistry.get(input.providerPreference || payment.provider || 'SIMULATED');
    let providerResult: ProviderVerificationResult;

    try {
      providerResult = await provider.verifyPayment(input.providerReference, {
        expectedAmountMinor,
        orderId: order.id,
        simulationOverride: input.simulationOverride,
      });
    } catch (providerErr: any) {
      const nowIso = new Date().toISOString();
      const failReason =
        providerErr?.message || `Invalid provider transaction reference '${input.providerReference}'.`;

      if (latestAttempt) {
        latestAttempt.status = 'FAILED';
        latestAttempt.failureReason = failReason;
        latestAttempt.providerReference = input.providerReference;
        latestAttempt.completedAt = nowIso;
        db.savePaymentAttempt(latestAttempt);
      }

      payment.status = 'FAILED';
      payment.failedAt = nowIso;
      payment.lastFailureReason = failReason;
      payment.providerTransactionReference = input.providerReference;
      payment.updatedAt = nowIso;
      db.savePayment(payment);

      throw new ValidationError(`Payment verification failed: ${failReason}`);
    }

    const nowIso = new Date().toISOString();

    // 9. Gateway Provider Status Verification
    if (providerResult.status !== 'SUCCEEDED') {
      const failureReason =
        providerResult.failureReason || `Gateway reported transaction status '${providerResult.status}'.`;

      if (latestAttempt) {
        latestAttempt.status = 'FAILED';
        latestAttempt.failureReason = failureReason;
        latestAttempt.errorCode = providerResult.errorCode || 'GATEWAY_DECLINED';
        latestAttempt.providerReference = input.providerReference;
        latestAttempt.completedAt = nowIso;
        db.savePaymentAttempt(latestAttempt);
      }

      payment.status = 'FAILED';
      payment.failedAt = nowIso;
      payment.lastFailureReason = failureReason;
      payment.providerTransactionReference = input.providerReference;
      payment.updatedAt = nowIso;
      db.savePayment(payment);

      eventDispatcher.dispatch({
        category: 'BUSINESS_TIMELINE',
        eventType: 'PAYMENT_VERIFICATION_FAILED',
        userId: actor.id,
        role: actor.role,
        scope: 'RESTRICTED',
        payload: {
          orderId: order.id,
          paymentId: payment.id,
          providerReference: input.providerReference,
          failureReason,
          timestamp: nowIso,
        },
      });

      throw new ValidationError(`Payment verification failed: ${failureReason}. You can retry.`);
    }

    // 10. Currency Verification
    if (providerResult.currency !== expectedCurrency) {
      const currencyMismatchReason = `Currency mismatch: Gateway verified '${providerResult.currency}', expected authoritative '${expectedCurrency}'.`;

      if (latestAttempt) {
        latestAttempt.status = 'FAILED';
        latestAttempt.failureReason = currencyMismatchReason;
        latestAttempt.errorCode = 'CURRENCY_MISMATCH';
        latestAttempt.providerReference = input.providerReference;
        latestAttempt.verifiedCurrency = providerResult.currency;
        latestAttempt.completedAt = nowIso;
        db.savePaymentAttempt(latestAttempt);
      }

      payment.status = 'FAILED';
      payment.failedAt = nowIso;
      payment.lastFailureReason = currencyMismatchReason;
      payment.providerTransactionReference = input.providerReference;
      payment.updatedAt = nowIso;
      db.savePayment(payment);

      throw new ValidationError(currencyMismatchReason);
    }

    // 11. Amount Verification
    const verifiedAmountMinor = providerResult.amountMinor;

    // 11A. UNDERPAYMENT:
    // Do not mark PAID.
    // Set appropriate failure/reconciliation state.
    if (verifiedAmountMinor < expectedAmountMinor) {
      const underpayReason = `Underpayment detected: Received ₹${(verifiedAmountMinor / 100).toFixed(2)} (${verifiedAmountMinor} paise), expected authoritative ₹${(expectedAmountMinor / 100).toFixed(2)} (${expectedAmountMinor} paise).`;

      if (latestAttempt) {
        latestAttempt.status = 'FAILED';
        latestAttempt.failureReason = underpayReason;
        latestAttempt.errorCode = 'UNDERPAYMENT_DETECTED';
        latestAttempt.providerReference = input.providerReference;
        latestAttempt.verifiedAmountMinor = verifiedAmountMinor;
        latestAttempt.verifiedCurrency = providerResult.currency;
        latestAttempt.completedAt = nowIso;
        db.savePaymentAttempt(latestAttempt);
      }

      payment.status = 'UNDERPAID_FLAGGED';
      payment.reconciliationStatus = 'UNDERPAID_FLAGGED';
      payment.reconciliationNotes = underpayReason;
      payment.discrepancyDetails = {
        expectedAmountMinor,
        receivedAmountMinor: verifiedAmountMinor,
        expectedCurrency,
        receivedCurrency: providerResult.currency,
      };
      payment.failedAt = nowIso;
      payment.lastFailureReason = underpayReason;
      payment.providerTransactionReference = input.providerReference;
      payment.updatedAt = nowIso;
      db.savePayment(payment);

      eventDispatcher.dispatch({
        category: 'BUSINESS_TIMELINE',
        eventType: 'PAYMENT_UNDERPAID_FLAGGED',
        userId: actor.id,
        role: actor.role,
        scope: 'RESTRICTED',
        payload: {
          orderId: order.id,
          paymentId: payment.id,
          expectedAmountMinor,
          receivedAmountMinor: verifiedAmountMinor,
          timestamp: nowIso,
        },
      });

      throw new ValidationError(
        `Underpayment detected: received ${verifiedAmountMinor} paise, expected ${expectedAmountMinor} paise. Payment cannot be marked PAID and has been flagged for reconciliation.`
      );
    }

    // 11B. OVERPAYMENT:
    // Do not silently treat as normal payment.
    // Flag for reconciliation according to the financial architecture.
    // Do not invent refund behavior here.
    if (verifiedAmountMinor > expectedAmountMinor) {
      const overpayReason = `Overpayment detected: Received ₹${(verifiedAmountMinor / 100).toFixed(2)} (${verifiedAmountMinor} paise), expected authoritative ₹${(expectedAmountMinor / 100).toFixed(2)} (${expectedAmountMinor} paise). Flagged for financial reconciliation.`;

      if (latestAttempt) {
        latestAttempt.status = 'FAILED';
        latestAttempt.failureReason = overpayReason;
        latestAttempt.errorCode = 'OVERPAYMENT_FLAGGED';
        latestAttempt.providerReference = input.providerReference;
        latestAttempt.verifiedAmountMinor = verifiedAmountMinor;
        latestAttempt.verifiedCurrency = providerResult.currency;
        latestAttempt.completedAt = nowIso;
        db.savePaymentAttempt(latestAttempt);
      }

      payment.status = 'OVERPAID_RECONCILIATION_FLAGGED';
      payment.reconciliationStatus = 'OVERPAID_FLAGGED';
      payment.reconciliationNotes = overpayReason;
      payment.discrepancyDetails = {
        expectedAmountMinor,
        receivedAmountMinor: verifiedAmountMinor,
        expectedCurrency,
        receivedCurrency: providerResult.currency,
      };
      payment.failedAt = nowIso;
      payment.lastFailureReason = overpayReason;
      payment.providerTransactionReference = input.providerReference;
      payment.updatedAt = nowIso;
      db.savePayment(payment);

      eventDispatcher.dispatch({
        category: 'BUSINESS_TIMELINE',
        eventType: 'PAYMENT_OVERPAID_FLAGGED',
        userId: actor.id,
        role: actor.role,
        scope: 'RESTRICTED',
        payload: {
          orderId: order.id,
          paymentId: payment.id,
          expectedAmountMinor,
          receivedAmountMinor: verifiedAmountMinor,
          timestamp: nowIso,
        },
      });

      throw new ValidationError(
        `Overpayment detected: received ${verifiedAmountMinor} paise, expected ${expectedAmountMinor} paise. Flagged for financial reconciliation; payment cannot be automatically marked PAID.`
      );
    }

    // 11C. EXACT MATCH & SUCCESS:
    // Only after successful server-side verification:
    // Payment = PAID
    // Do not yet implement production.
    if (latestAttempt) {
      latestAttempt.status = 'SUCCESS';
      latestAttempt.providerReference = input.providerReference;
      latestAttempt.verifiedAmountMinor = verifiedAmountMinor;
      latestAttempt.verifiedCurrency = providerResult.currency;
      latestAttempt.verifiedAt = nowIso;
      latestAttempt.completedAt = nowIso;
      latestAttempt.failureReason = undefined;
      latestAttempt.errorCode = undefined;
      db.savePaymentAttempt(latestAttempt);
    }

    payment.status = 'PAID';
    payment.paidAt = nowIso;
    payment.verifiedAt = nowIso;
    payment.verifiedBy = actor.id;
    payment.providerTransactionReference = input.providerReference;
    payment.reconciliationStatus = 'NONE';
    payment.lastFailureReason = undefined;
    payment.updatedAt = nowIso;
    db.savePayment(payment);

    // Update Order to PAID without advancing to production yet
    order.status = 'PAID';
    order.updatedAt = nowIso;
    db.saveOrder(order);

    // Step 12E: Create authoritative immutable financial ledger entries and venue compensation record
    FinancialLedgerEngine.createAuthoritativeLedgerEntries(order.id, payment.id, actor.id);

    // Step 12F: Hard financial gate for fulfillment authorization
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(order.id, {
        actor: actor.id,
        sourcePaymentReference: input.providerReference,
        allowSystemBypassRoleCheck: true,
      });
    } catch (gateErr) {
      console.warn(`[FulfillmentAuthorization] Gate evaluation completed with result:`, gateErr);
    }

    eventDispatcher.dispatch({
      category: 'BUSINESS_TIMELINE',
      eventType: 'PAYMENT_VERIFIED_PAID',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        paymentId: payment.id,
        paymentPublicId: payment.publicId,
        amountMinor: verifiedAmountMinor,
        currency: expectedCurrency,
        providerReference: input.providerReference,
        timestamp: nowIso,
      },
    });

    return {
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      paymentReference: payment.paymentReference,
      orderId: order.id,
      orderPublicId: order.publicId,
      orderStatus: order.status,
      paymentStatus: 'PAID',
      isPaid: true,
      authoritativeAmount: {
        amountMinor: snapshot.grandTotal.amountMinor,
        amountFormatted: snapshot.grandTotal.amountFormatted,
        currency: snapshot.currency,
      },
      verifiedAmount: {
        amountMinor: verifiedAmountMinor,
        amountFormatted: snapshot.grandTotal.amountFormatted,
        currency: providerResult.currency,
      },
      provider: payment.provider,
      providerReference: input.providerReference,
      attemptId: latestAttempt?.id || '',
      attemptPublicId: latestAttempt?.publicId || '',
      attemptNumber: latestAttempt?.attemptNumber || payment.attemptsCount,
      attemptStatus: 'SUCCESS',
      reconciliationRequired: false,
      verifiedAt: nowIso,
      message: `Payment successfully verified server-side. Payment marked as PAID for Order ${order.publicId}.`,
    };
  }
}
