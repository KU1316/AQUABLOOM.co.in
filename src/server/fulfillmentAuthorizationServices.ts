/**
 * AQUABLOOM — STEP 12F: PAYMENT -> FULFILLMENT AUTHORIZATION
 * 
 * OBJECTIVE:
 * Create the hard financial gate that permits production to begin.
 * 
 * AUTHORIZATION REQUIREMENTS:
 * Fulfillment Authorization can become:
 * `AUTHORIZED`
 * ONLY when:
 * 1. Campaign Agreement = LOCKED
 * 2. Supplier Assignment = ASSIGNED
 * 3. Logistics Assignment = ASSIGNED
 * 4. Order = PAID
 * 5. Payment = VERIFIED/PAID
 * 6. Financial transaction is valid (Balanced double-entry ledger exists)
 * 
 * IMPORTANT COMMERCIAL BOUNDARY:
 * Before: `PRODUCTION_STARTED`
 * normal Campaign Cancellation remains available according to the cancellation engine.
 * Once production starts:
 * normal Campaign Cancellation becomes unavailable.
 * Enforce only the fulfillment gate required for production.
 * 
 * FAILURE:
 * If payment is not verified: `NOT_AUTHORIZED`
 * Production must remain blocked.
 * 
 * IDEMPOTENCY:
 * Repeated payment confirmation must not create multiple authorizations.
 * 
 * SECURITY:
 * Supplier cannot manually authorize fulfillment.
 * Advertiser cannot manually mark an Order as paid or authorize fulfillment.
 * Frontend cannot bypass this gate.
 */

import { db } from './db.js';
import {
  User,
  Order,
  Payment,
  FulfillmentAuthorization,
  FulfillmentAuthorizationStatus,
  FulfillmentValidationCheck,
  FulfillmentValidationCheckCode,
  FulfillmentValidationSummary,
  FulfillmentAuthorizationView,
  CampaignAgreement,
  SupplierAssignment,
  LogisticsAssignment,
  FinancialLedgerEntry,
} from '../types.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError,
} from '../lib/errors.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';

export interface AuthorizeFulfillmentOptions {
  actor?: User | string;
  sourcePaymentReference?: string;
  allowSystemBypassRoleCheck?: boolean;
}

export class FulfillmentAuthorizationService {
  /**
   * Evaluates all 6 hard financial gate requirements.
   * Pure evaluation function that does not modify database state.
   */
  public static evaluateGateConditions(orderIdOrPublicId: string): {
    order: Order;
    payment: Payment | undefined;
    agreement: CampaignAgreement | undefined;
    supplierAssignment: SupplierAssignment | undefined;
    logisticsAssignment: LogisticsAssignment | undefined;
    ledgerEntries: FinancialLedgerEntry[];
    validationSummary: FulfillmentValidationSummary;
  } {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    // Resolve authoritative references safely
    const agreementId =
      order.campaignAgreementId ||
      order.references?.campaignAgreementId ||
      (order as any).authoritativeReferences?.campaignAgreementId;

    const supplierAssignmentId =
      order.supplierAssignmentId ||
      order.references?.supplierAssignmentId ||
      (order as any).authoritativeReferences?.supplierAssignmentId;

    const logisticsAssignmentId =
      order.logisticsAssignmentId ||
      order.references?.logisticsAssignmentId ||
      (order as any).authoritativeReferences?.logisticsAssignmentId;

    const agreement = agreementId ? db.getAgreementById(agreementId) : undefined;
    const supplierAssignment = supplierAssignmentId
      ? db.getSupplierAssignmentById(supplierAssignmentId)
      : order.orderReadinessId
      ? db.getSupplierAssignmentByOrderReadiness(order.orderReadinessId)
      : undefined;
    const logisticsAssignment = logisticsAssignmentId
      ? db.getLogisticsAssignmentById(logisticsAssignmentId)
      : order.orderReadinessId
      ? db.getLogisticsAssignmentByOrderReadiness(order.orderReadinessId)
      : undefined;

    // Payment lookup
    const payment = db.getPaymentByOrderId(order.id);

    // Financial ledger entries lookup
    const ledgerEntries = db.getFinancialLedgerEntriesByOrderId(order.id);

    const checks: FulfillmentValidationCheck[] = [];
    const failureReasons: string[] = [];

    // CHECK 1: Campaign Agreement = LOCKED
    const agreementLocked = !!(
      agreement &&
      agreement.status === 'LOCKED' &&
      agreement.lockedAt
    );
    checks.push({
      code: 'AGREEMENT_LOCKED',
      name: 'Campaign Agreement is Locked',
      passed: agreementLocked,
      details: agreementLocked
        ? `Agreement ${agreement?.publicId} is locked as of ${agreement?.lockedAt}.`
        : `Agreement status is '${agreement?.status || 'NOT_FOUND'}'; must be LOCKED.`,
      blocking: true,
    });
    if (!agreementLocked) {
      failureReasons.push(
        `Campaign Agreement must be LOCKED (found: ${agreement?.status || 'MISSING'}).`
      );
    }

    // CHECK 2: Supplier Assignment = ASSIGNED
    const supplierAssigned = !!(
      supplierAssignment && supplierAssignment.status === 'ASSIGNED'
    );
    checks.push({
      code: 'SUPPLIER_ASSIGNED',
      name: 'Supplier Assignment is Assigned',
      passed: supplierAssigned,
      details: supplierAssigned
        ? `Supplier Assignment ${supplierAssignment?.publicId} is ASSIGNED.`
        : `Supplier Assignment status is '${supplierAssignment?.status || 'NOT_FOUND'}'; must be ASSIGNED.`,
      blocking: true,
    });
    if (!supplierAssigned) {
      failureReasons.push(
        `Supplier Assignment must be ASSIGNED (found: ${supplierAssignment?.status || 'MISSING'}).`
      );
    }

    // CHECK 3: Logistics Assignment = ASSIGNED
    const logisticsAssigned = !!(
      logisticsAssignment && logisticsAssignment.status === 'ASSIGNED'
    );
    checks.push({
      code: 'LOGISTICS_ASSIGNED',
      name: 'Logistics Assignment is Assigned',
      passed: logisticsAssigned,
      details: logisticsAssigned
        ? `Logistics Assignment ${logisticsAssignment?.publicId} is ASSIGNED.`
        : `Logistics Assignment status is '${logisticsAssignment?.status || 'NOT_FOUND'}'; must be ASSIGNED.`,
      blocking: true,
    });
    if (!logisticsAssigned) {
      failureReasons.push(
        `Logistics Assignment must be ASSIGNED (found: ${logisticsAssignment?.status || 'MISSING'}).`
      );
    }

    // CHECK 4: Order = PAID
    const orderPaid = order.status === 'PAID' || order.status === 'READY_FOR_FULFILLMENT';
    checks.push({
      code: 'ORDER_PAID',
      name: 'Order Status is PAID',
      passed: orderPaid,
      details: orderPaid
        ? `Order status is '${order.status}'.`
        : `Order status is '${order.status}'; must be PAID.`,
      blocking: true,
    });
    if (!orderPaid) {
      failureReasons.push(`Order status must be PAID (found: ${order.status}).`);
    }

    // CHECK 5: Payment = VERIFIED/PAID
    const paymentVerified = !!(
      payment &&
      payment.status === 'PAID' &&
      payment.verifiedAt
    );
    checks.push({
      code: 'PAYMENT_VERIFIED',
      name: 'Payment is Verified and PAID',
      passed: paymentVerified,
      details: paymentVerified
        ? `Payment ${payment?.publicId} verified at ${payment?.verifiedAt}.`
        : `Payment status is '${payment?.status || 'NOT_FOUND'}'; must be PAID with verifiedAt.`,
      blocking: true,
    });
    if (!paymentVerified) {
      failureReasons.push(
        `Payment must be VERIFIED and PAID (found: ${payment?.status || 'MISSING'}).`
      );
    }

    // CHECK 6: Financial transaction is valid (Balanced double-entry ledger exists)
    let financialTxValid = false;
    let ledgerDetails = '';

    if (ledgerEntries.length >= 6) {
      const paymentReceived = ledgerEntries.find(
        (e) => e.transactionType === 'PAYMENT_RECEIVED'
      );
      const supplierPayable = ledgerEntries.find(
        (e) => e.transactionType === 'SUPPLIER_PAYABLE_ACCRUAL'
      );
      const venueComp = ledgerEntries.find(
        (e) => e.transactionType === 'VENUE_COMPENSATION_ACCRUAL'
      );
      const logisticsPayable = ledgerEntries.find(
        (e) => e.transactionType === 'LOGISTICS_PAYABLE_ACCRUAL'
      );
      const taxLiability = ledgerEntries.find(
        (e) => e.transactionType === 'TAX_LIABILITY_ACCRUAL'
      );
      const platformMargin = ledgerEntries.find(
        (e) => e.transactionType === 'PLATFORM_MARGIN_ACCRUAL'
      );

      if (
        paymentReceived &&
        supplierPayable &&
        venueComp &&
        logisticsPayable &&
        taxLiability &&
        platformMargin
      ) {
        const sumAccruals =
          supplierPayable.amountMinor +
          venueComp.amountMinor +
          logisticsPayable.amountMinor +
          taxLiability.amountMinor +
          platformMargin.amountMinor;

        if (paymentReceived.amountMinor === sumAccruals) {
          financialTxValid = true;
          ledgerDetails = `Authoritative balanced ledger verified: ${ledgerEntries.length} entries totaling ₹${(paymentReceived.amountMinor / 100).toFixed(2)}.`;
        } else {
          ledgerDetails = `Unbalanced financial ledger: Received ${paymentReceived.amountMinor} vs Sum Accruals ${sumAccruals}.`;
        }
      } else {
        ledgerDetails = `Missing required ledger accounts (found ${ledgerEntries.length} entries).`;
      }
    } else {
      ledgerDetails = `No valid financial ledger entries found for order (found ${ledgerEntries.length}).`;
    }

    checks.push({
      code: 'FINANCIAL_TRANSACTION_VALID',
      name: 'Financial Ledger Transaction is Valid',
      passed: financialTxValid,
      details: ledgerDetails,
      blocking: true,
    });
    if (!financialTxValid) {
      failureReasons.push(`Financial transaction is invalid: ${ledgerDetails}`);
    }

    const isValid = checks.every((c) => c.passed);

    return {
      order,
      payment,
      agreement,
      supplierAssignment,
      logisticsAssignment,
      ledgerEntries,
      validationSummary: {
        isValid,
        checks,
        failureReasons,
      },
    };
  }

  /**
   * Hard financial gate evaluation and authorization.
   * Can be invoked automatically upon verified payment or by Admin / System.
   * Strictly enforces:
   * - Supplier cannot manually authorize fulfillment
   * - Advertiser cannot manually mark an order as paid or authorize fulfillment
   * - Frontend cannot bypass this gate
   */
  public static authorizeFulfillment(
    orderIdOrPublicId: string,
    options: AuthorizeFulfillmentOptions = {}
  ): FulfillmentAuthorization {
    const actor = options.actor;
    const nowIso = new Date().toISOString();

    // 1. Role-based security checks
    let actorId = 'SYSTEM_FINANCIAL_GATE';
    let isSystem = false;

    if (typeof actor === 'string') {
      actorId = actor;
      isSystem =
        actor.startsWith('SYSTEM') ||
        actor.startsWith('webhook:') ||
        options.allowSystemBypassRoleCheck === true;
    } else if (actor && typeof actor === 'object') {
      actorId = actor.id;

      // SECURITY: Counterparty manual authorization is strictly prohibited
      if (actor.role === 'SUPPLIER') {
        throw new AuthorizationError(
          'Security violation: Suppliers cannot manually authorize fulfillment.'
        );
      }
      if (actor.role === 'ADVERTISER') {
        throw new AuthorizationError(
          'Security violation: Advertisers cannot manually mark orders as paid or authorize fulfillment.'
        );
      }
      if (actor.role === 'VENUE') {
        throw new AuthorizationError(
          'Security violation: Venues cannot authorize fulfillment.'
        );
      }
      if (actor.role === 'LOGISTICS_PARTNER') {
        throw new AuthorizationError(
          'Security violation: Logistics partners cannot authorize fulfillment.'
        );
      }

      // Only ADMIN or system can perform explicit authorization calls
      if (actor.role !== 'ADMIN' && !options.allowSystemBypassRoleCheck) {
        throw new AuthorizationError(
          `Unauthorized: Role '${actor.role}' cannot authorize fulfillment.`
        );
      }
    }

    // 2. Idempotency Check:
    // Repeated payment confirmation must not create multiple authorizations.
    const existingAuth = db.getFulfillmentAuthorizationByOrderId(orderIdOrPublicId);
    if (existingAuth && existingAuth.status === 'AUTHORIZED') {
      return existingAuth;
    }

    // 3. Evaluate the 6 hard financial gate conditions
    const evalResult = this.evaluateGateConditions(orderIdOrPublicId);
    const { order, payment, agreement, supplierAssignment, logisticsAssignment, validationSummary } =
      evalResult;

    const sourcePaymentReference =
      options.sourcePaymentReference ||
      payment?.providerTransactionReference ||
      payment?.paymentIntentId ||
      payment?.paymentReference ||
      '';

    const agreementId = agreement?.id || order.campaignAgreementId;
    const agreementPublicId = agreement?.publicId || order.campaignAgreementPublicId;
    const supplierAssignmentId = supplierAssignment?.id || order.supplierAssignmentId;
    const supplierAssignmentPublicId = supplierAssignment?.publicId || order.supplierAssignmentPublicId;
    const logisticsAssignmentId = logisticsAssignment?.id || order.logisticsAssignmentId;
    const logisticsAssignmentPublicId = logisticsAssignment?.publicId || order.logisticsAssignmentPublicId;
    const paymentId = payment?.id || '';
    const paymentPublicId = payment?.publicId || '';

    // Commercial boundary metadata:
    // Before PRODUCTION_STARTED normal campaign cancellation remains available.
    // Once production starts normal cancellation becomes unavailable.
    const commercialBoundary = {
      productionStarted: false,
      cancellationPermitted: true,
      boundaryNote:
        'Before PRODUCTION_STARTED normal Campaign Cancellation remains available. Once production starts, normal Campaign Cancellation becomes unavailable.',
    };

    // 4. Handle Failure Gate
    if (!validationSummary.isValid) {
      const deniedAuth: FulfillmentAuthorization = existingAuth || {
        id: generateInternalId('ffa'),
        publicId: generateBusinessId('AB-FFA'),
        orderId: order.id,
        orderPublicId: order.publicId,
        orderReference: order.orderReference,
        paymentId,
        paymentPublicId,
        campaignId: order.campaignId,
        campaignPublicId: order.campaignPublicId,
        supplierAssignmentId,
        supplierAssignmentPublicId,
        logisticsAssignmentId,
        logisticsAssignmentPublicId,
        agreementId,
        agreementPublicId,
        status: 'NOT_AUTHORIZED',
        authorizedAt: null,
        deniedAt: nowIso,
        authorizedBy: actorId,
        sourcePaymentReference,
        validationResults: validationSummary,
        productionPermitted: false,
        commercialBoundary,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      deniedAuth.status = 'NOT_AUTHORIZED';
      deniedAuth.productionPermitted = false;
      deniedAuth.deniedAt = nowIso;
      deniedAuth.authorizedAt = null;
      const deniedAuditEventId = generateInternalId('evt');
      deniedAuth.auditEventId = deniedAuditEventId;
      deniedAuth.updatedAt = nowIso;

      db.saveFulfillmentAuthorization(deniedAuth);

      const deniedEvent: any = {
        id: deniedAuditEventId,
        category: 'AUDIT_EVENTS',
        eventType: 'FULFILLMENT_AUTHORIZATION_DENIED',
        userId: actorId,
        scope: 'INTERNAL_ADMIN',
        payload: {
          orderId: order.id,
          orderPublicId: order.publicId,
          reasons: validationSummary.failureReasons,
          actor: actorId,
          timestamp: nowIso,
        },
        timestamp: nowIso,
      };
      db.recordEvent(deniedEvent);
      eventDispatcher.dispatch(deniedEvent);

      // If called manually by an Admin or API actor expecting success, throw ValidationError
      if (!isSystem) {
        throw new ValidationError(
          `Cannot authorize fulfillment. Hard financial gate requirements not satisfied:\n- ${validationSummary.failureReasons.join(
            '\n- '
          )}`
        );
      }

      return deniedAuth;
    }

    // 5. Handle Success Gate: AUTHORIZED
    const authorizedRecord: FulfillmentAuthorization = existingAuth || {
      id: generateInternalId('ffa'),
      publicId: generateBusinessId('AB-FFA'),
      orderId: order.id,
      orderPublicId: order.publicId,
      orderReference: order.orderReference,
      paymentId,
      paymentPublicId,
      campaignId: order.campaignId,
      campaignPublicId: order.campaignPublicId,
      supplierAssignmentId,
      supplierAssignmentPublicId,
      logisticsAssignmentId,
      logisticsAssignmentPublicId,
      agreementId,
      agreementPublicId,
      status: 'AUTHORIZED',
      authorizedAt: nowIso,
      deniedAt: null,
      authorizedBy: actorId,
      sourcePaymentReference,
      validationResults: validationSummary,
      productionPermitted: true,
      commercialBoundary,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    authorizedRecord.status = 'AUTHORIZED';
    authorizedRecord.productionPermitted = true;
    authorizedRecord.authorizedAt = nowIso;
    authorizedRecord.deniedAt = null;
    authorizedRecord.authorizedBy = actorId;
    authorizedRecord.sourcePaymentReference = sourcePaymentReference;
    authorizedRecord.validationResults = validationSummary;
    authorizedRecord.updatedAt = nowIso;

    // Transition Order status to READY_FOR_FULFILLMENT
    if (order.status !== 'READY_FOR_FULFILLMENT') {
      const fromStatus = order.status;
      order.status = 'READY_FOR_FULFILLMENT';
      if (!order.statusHistory) {
        order.statusHistory = [];
      }
      order.statusHistory.push({
        fromStatus,
        toStatus: 'READY_FOR_FULFILLMENT',
        transitionedAt: nowIso,
        transitionedBy: actorId,
        reason:
          'Fulfillment authorized: hard financial gate passed (Agreement locked, Supplier assigned, Logistics assigned, Order & Payment verified, Ledger balanced).',
      });
      order.updatedAt = nowIso;
      db.saveOrder(order);
    }

    // Create Audit Event ID
    const authorizedAuditEventId = generateInternalId('evt');
    authorizedRecord.auditEventId = authorizedAuditEventId;

    // Save Authorization Record
    db.saveFulfillmentAuthorization(authorizedRecord);

    // Dispatch Authoritative Audit Events
    const authEvent: any = {
      id: authorizedAuditEventId,
      category: 'AUDIT_EVENTS',
      eventType: 'FULFILLMENT_AUTHORIZED',
      entityId: authorizedRecord.id,
      entityType: 'FULFILLMENT_AUTHORIZATION',
      userId: actorId,
      scope: 'INTERNAL_ADMIN',
      payload: {
        authorizationId: authorizedRecord.id,
        authorizationPublicId: authorizedRecord.publicId,
        orderId: order.id,
        orderPublicId: order.publicId,
        paymentPublicId,
        sourcePaymentReference,
        authorizedBy: actorId,
        timestamp: nowIso,
      },
      timestamp: nowIso,
    };
    db.recordEvent(authEvent);
    eventDispatcher.dispatch(authEvent);

    const timelineEvent: any = {
      id: generateInternalId('evt'),
      category: 'BUSINESS_TIMELINE',
      eventType: 'FULFILLMENT_AUTHORIZED',
      entityId: order.id,
      entityType: 'ORDER',
      userId: actorId,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        authorizationPublicId: authorizedRecord.publicId,
        productionPermitted: true,
        commercialBoundary,
        timestamp: nowIso,
      },
      timestamp: nowIso,
    };
    db.recordEvent(timelineEvent);
    eventDispatcher.dispatch(timelineEvent);

    return authorizedRecord;
  }

  /**
   * Role-isolated view of fulfillment authorization for counterparties
   */
  public static getFulfillmentAuthorizationView(
    orderIdOrPublicId: string,
    actor: User
  ): FulfillmentAuthorizationView {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    // Role check: verify actor is a party to the order or Admin
    if (actor.role !== 'ADMIN') {
      const isAdvertiser =
        actor.role === 'ADVERTISER' &&
        (order.advertiserId === actor.id || order.advertiserPublicId === actor.publicAccountId);
      const isVenue =
        actor.role === 'VENUE' &&
        (order.venueId === actor.id || order.venuePublicId === actor.publicAccountId);
      const isSupplier =
        actor.role === 'SUPPLIER' &&
        (order.references?.supplierId === actor.id ||
          (order as any).authoritativeReferences?.supplierId === actor.id);
      const isLogistics =
        actor.role === 'LOGISTICS_PARTNER' &&
        (order.references?.logisticsPartnerId === actor.id ||
          (order as any).authoritativeReferences?.logisticsPartnerId === actor.id);

      if (!isAdvertiser && !isVenue && !isSupplier && !isLogistics) {
        throw new AuthorizationError(
          'Access denied: You are not authorized to view fulfillment authorization for this order.'
        );
      }
    }

    const auth = db.getFulfillmentAuthorizationByOrderId(order.id);
    if (!auth) {
      // Return un-authorized view based on current evaluation
      const evaluation = this.evaluateGateConditions(order.id);
      const { validationSummary } = evaluation;

      return {
        authorizationId: '',
        authorizationPublicId: '',
        orderPublicId: order.publicId,
        orderReference: order.orderReference,
        status: 'NOT_AUTHORIZED',
        isAuthorized: false,
        productionPermitted: false,
        authorizedAt: null,
        deniedAt: null,
        sourcePaymentReference: '',
        commercialBoundary: {
          productionStarted: false,
          cancellationPermitted: true,
          notice:
            'Before PRODUCTION_STARTED normal Campaign Cancellation remains available. Once production starts normal cancellation becomes unavailable.',
        },
        validationSummary: {
          agreementLocked:
            validationSummary.checks.find((c) => c.code === 'AGREEMENT_LOCKED')?.passed ?? false,
          supplierAssigned:
            validationSummary.checks.find((c) => c.code === 'SUPPLIER_ASSIGNED')?.passed ?? false,
          logisticsAssigned:
            validationSummary.checks.find((c) => c.code === 'LOGISTICS_ASSIGNED')?.passed ?? false,
          orderPaid:
            validationSummary.checks.find((c) => c.code === 'ORDER_PAID')?.passed ?? false,
          paymentVerified:
            validationSummary.checks.find((c) => c.code === 'PAYMENT_VERIFIED')?.passed ?? false,
          financialTransactionValid:
            validationSummary.checks.find((c) => c.code === 'FINANCIAL_TRANSACTION_VALID')?.passed ?? false,
          allChecksPassed: validationSummary.isValid,
          failureReasons: validationSummary.failureReasons,
        },
        createdAt: new Date().toISOString(),
      };
    }

    return {
      authorizationId: auth.id,
      authorizationPublicId: auth.publicId,
      orderPublicId: auth.orderPublicId,
      orderReference: auth.orderReference,
      status: auth.status,
      isAuthorized: auth.status === 'AUTHORIZED',
      productionPermitted: auth.productionPermitted,
      authorizedAt: auth.authorizedAt,
      deniedAt: auth.deniedAt,
      sourcePaymentReference: auth.sourcePaymentReference,
      commercialBoundary: {
        productionStarted: auth.commercialBoundary.productionStarted,
        cancellationPermitted: auth.commercialBoundary.cancellationPermitted,
        notice: auth.commercialBoundary.boundaryNote,
      },
      validationSummary: {
        agreementLocked:
          auth.validationResults.checks.find((c) => c.code === 'AGREEMENT_LOCKED')?.passed ?? false,
        supplierAssigned:
          auth.validationResults.checks.find((c) => c.code === 'SUPPLIER_ASSIGNED')?.passed ?? false,
        logisticsAssigned:
          auth.validationResults.checks.find((c) => c.code === 'LOGISTICS_ASSIGNED')?.passed ?? false,
        orderPaid:
          auth.validationResults.checks.find((c) => c.code === 'ORDER_PAID')?.passed ?? false,
        paymentVerified:
          auth.validationResults.checks.find((c) => c.code === 'PAYMENT_VERIFIED')?.passed ?? false,
        financialTransactionValid:
          auth.validationResults.checks.find((c) => c.code === 'FINANCIAL_TRANSACTION_VALID')?.passed ?? false,
        allChecksPassed: auth.validationResults.isValid,
        failureReasons: auth.validationResults.failureReasons,
      },
      createdAt: auth.createdAt,
    };
  }
}

export const FulfillmentAuthorizationEngine = FulfillmentAuthorizationService;
