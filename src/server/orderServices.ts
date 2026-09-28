/**
 * AquaBloom Step 11B: Order Creation Engine
 * 
 * Provides:
 * 1. OrderAuthorizationService (strict RBAC for Order operations)
 * 2. OrderValidationEngine (verifies locked agreements, readiness, assignments, pricing)
 * 3. OrderService (idempotent, atomic creation and state machine lifecycle)
 */

import { db } from './db.js';
import {
  User,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  OrderReadiness,
  SupplierAssignment,
  LogisticsAssignment,
  FinalPricingCalculationResult,
  Order,
  OrderStatus,
  OrderStatusTransition,
  CreateOrderInput,
  OrderSharedView,
  OrderAuthoritativeReferences,
  OrderPricingSnapshot,
  OrderOperationalTermsSnapshot,
  AdvertiserOrderReviewView,
  OrderPaymentHandoffResult,
} from '../types.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js';
import { eventDispatcher } from '../lib/events.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { PaymentReadinessService } from './paymentReadinessServices.js';

/**
 * ========================================================
 * 1. ORDER AUTHORIZATION SERVICE
 * ========================================================
 */
export class OrderAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to access Orders.');
    }
  }

  /**
   * Asserts actor can create an Order for the given OrderReadiness.
   * Only the designated Advertiser transaction context or Platform Admin can create the Order.
   * Suppliers, Logistics Partners, Venues, or third parties are strictly denied.
   */
  public static assertCanCreate(readiness: OrderReadiness, actor: User): void {
    OrderAuthorizationService.assertAuthenticated(actor);

    if (actor.role === 'ADMIN') return;

    if (actor.role === 'ADVERTISER' && readiness.advertiserId === actor.id) {
      return;
    }

    const now = new Date().toISOString();
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'ORDER_ACCESS_DENIED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        actorId: actor.id,
        actorRole: actor.role,
        orderReadinessId: readiness.id,
        orderReadinessPublicId: readiness.publicId,
        advertiserId: readiness.advertiserId,
        timestamp: now,
        reason: 'Only the contracted Advertiser or Admin may create an Order. Counterparty access denied.',
      },
    });

    throw new AuthorizationError(
      `Access denied: Only the contracted Advertiser transaction context can create its Order. Role '${actor.role}' is not authorized.`
    );
  }

  /**
   * Asserts actor can view the Order and its financial data.
   * Only the contracted Advertiser or Admin may view.
   * Supplier and Logistics users must NOT gain access to advertiser financial information
   * merely because they are assigned to the transaction.
   */
  public static assertCanView(order: Order, actor: User): void {
    OrderAuthorizationService.assertAuthenticated(actor);

    if (actor.role === 'ADMIN') return;

    if (actor.role === 'ADVERTISER' && order.advertiserId === actor.id) {
      return;
    }

    const now = new Date().toISOString();
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'ORDER_ACCESS_DENIED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        actorId: actor.id,
        actorRole: actor.role,
        orderId: order.id,
        orderPublicId: order.publicId,
        orderAdvertiserId: order.advertiserId,
        timestamp: now,
        reason: 'Supplier, Logistics, Venue, and unauthorized parties must not access advertiser order financial details.',
      },
    });

    throw new AuthorizationError(
      `Access denied: Actor '${actor.publicAccountId || actor.id}' is not authorized to access Order '${order.publicId}'. Supplier and Logistics users cannot access advertiser financial data.`
    );
  }
}

/**
 * ========================================================
 * 2. ORDER VALIDATION ENGINE
 * ========================================================
 */
export interface OrderPreconditionContext {
  readiness: OrderReadiness;
  agreement: CampaignAgreement;
  agreementSnapshot: CampaignAgreementSnapshot;
  supplierAssignment: SupplierAssignment;
  logisticsAssignment: LogisticsAssignment;
  pricingResult: FinalPricingCalculationResult;
  advertiserBrandName: string;
  venueName: string;
  campaignName: string;
}

export class OrderValidationEngine {
  /**
   * Validates all mandatory Step 11B Order Creation preconditions:
   * 1. Campaign Agreement = LOCKED
   * 2. OrderReadiness = READY_FOR_ORDER
   * 3. SupplierAssignment = ASSIGNED
   * 4. LogisticsAssignment = ASSIGNED
   * 5. Pricing calculation = valid (CALCULATED)
   * 6. Counterparty & snapshot cross-references consistent
   */
  public static validateOrderCreationPreconditions(
    orderReadinessIdOrPublicId: string,
    actor: User
  ): OrderPreconditionContext {
    // 1. Fetch OrderReadiness
    const readiness = db.getOrderReadinessById(orderReadinessIdOrPublicId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness '${orderReadinessIdOrPublicId}' not found.`);
    }

    // 2. Authorize
    OrderAuthorizationService.assertCanCreate(readiness, actor);

    // 3. Campaign Agreement must exist and be LOCKED
    const agreement = db.getAgreementById(readiness.campaignAgreementId);
    if (!agreement) {
      throw new NotFoundError(
        `Campaign Agreement '${readiness.campaignAgreementId}' referenced by Order Readiness not found.`
      );
    }
    if (agreement.status !== 'LOCKED') {
      throw new ValidationError(
        `Cannot create Order: Campaign Agreement '${agreement.publicId}' must be LOCKED. Current status: ${agreement.status}`
      );
    }

    // 4. Order Readiness must be READY_FOR_ORDER
    if (readiness.status !== 'READY_FOR_ORDER') {
      throw new ValidationError(
        `Cannot create Order: Order Readiness '${readiness.publicId}' must be READY_FOR_ORDER. Current status: ${readiness.status}`
      );
    }

    // 5. Supplier Assignment must exist and be ASSIGNED
    const supplierAssignment = db.getSupplierAssignmentByOrderReadiness(readiness.id);
    if (!supplierAssignment) {
      throw new ValidationError(
        `Cannot create Order: Missing Supplier Assignment for Order Readiness '${readiness.publicId}'.`
      );
    }
    if (supplierAssignment.status !== 'ASSIGNED') {
      throw new ValidationError(
        `Cannot create Order: Supplier Assignment '${supplierAssignment.publicId}' must be ASSIGNED. Current status: ${supplierAssignment.status}`
      );
    }

    // 6. Logistics Assignment must exist and be ASSIGNED
    const logisticsAssignment = db.getLogisticsAssignmentByOrderReadiness(readiness.id);
    if (!logisticsAssignment) {
      throw new ValidationError(
        `Cannot create Order: Missing Logistics Assignment for Order Readiness '${readiness.publicId}'.`
      );
    }
    if (logisticsAssignment.status !== 'ASSIGNED') {
      throw new ValidationError(
        `Cannot create Order: Logistics Assignment '${logisticsAssignment.publicId}' must be ASSIGNED. Current status: ${logisticsAssignment.status}`
      );
    }

    // 7. Pricing calculation must exist and be valid (CALCULATED)
    const pricingResult = db.getFinalPricingResultByOrderReadiness(readiness.id);
    if (!pricingResult) {
      throw new ValidationError(
        `Cannot create Order: Missing Final Pricing Result for Order Readiness '${readiness.publicId}'. Pricing must be calculated first.`
      );
    }
    if (pricingResult.status !== 'CALCULATED') {
      throw new ValidationError(
        `Cannot create Order: Pricing calculation must be valid (CALCULATED). Current status: ${pricingResult.status}. Reason: ${pricingResult.blockingReason || 'Pricing blocked or invalid.'}`
      );
    }

    // 8. Authoritative Agreement Snapshot must exist
    const agreementSnapshot = db.getAgreementSnapshotByAgreementId(agreement.id);
    if (!agreementSnapshot) {
      throw new NotFoundError(
        `Cannot create Order: Authoritative Campaign Agreement Snapshot for agreement '${agreement.publicId}' not found.`
      );
    }

    // 9. Fetch Campaign & Profile metadata for clean names
    const campaign = db.getCampaignById(readiness.campaignId);
    const campaignName = campaign ? campaign.name : agreement.campaignName || 'AquaBloom Campaign';

    const advertiserProfile = db.getProfile(readiness.advertiserId);
    const advertiserBrandName =
      (advertiserProfile as any)?.companyName ||
      (advertiserProfile as any)?.brandName ||
      agreement.advertiserOrganization ||
      'Advertiser';

    const venueProfile = db.getProfile(readiness.venueId);
    const venueName =
      (venueProfile as any)?.venueName ||
      (venueProfile as any)?.companyName ||
      agreement.venueOrganization ||
      'Venue';

    return {
      readiness,
      agreement,
      agreementSnapshot,
      supplierAssignment,
      logisticsAssignment,
      pricingResult,
      advertiserBrandName,
      venueName,
      campaignName,
    };
  }

  /**
   * Validates Order state transitions according to the foundation architecture:
   * Foundation states:
   * - DRAFT
   * - PRICED
   * - PAYMENT_REQUIRED
   * - PAYMENT_PROCESSING
   * - PAID
   * - PAYMENT_FAILED
   * - READY_FOR_FULFILLMENT
   * - CANCELLED
   */
  public static validateStatusTransition(
    currentStatus: OrderStatus | null,
    newStatus: OrderStatus
  ): void {
    if (currentStatus === null) {
      if (newStatus === 'DRAFT' || newStatus === 'PRICED') return;
      throw new ValidationError(`Initial Order status must be DRAFT or PRICED, received '${newStatus}'.`);
    }

    const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
      DRAFT: ['PRICED', 'CANCELLED'],
      PRICED: ['PAYMENT_REQUIRED', 'CANCELLED'],
      PAYMENT_REQUIRED: ['PAYMENT_PROCESSING', 'CANCELLED'],
      PAYMENT_PROCESSING: ['PAID', 'PAYMENT_FAILED', 'CANCELLED'],
      PAYMENT_FAILED: ['PAYMENT_REQUIRED', 'PAYMENT_PROCESSING', 'CANCELLED'],
      PAID: ['READY_FOR_FULFILLMENT', 'CANCELLED'],
      READY_FOR_FULFILLMENT: ['CANCELLED'],
      CANCELLED: [],
    };

    const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
    if (!allowed.includes(newStatus)) {
      throw new ValidationError(
        `Invalid Order status transition: cannot transition from '${currentStatus}' to '${newStatus}'. Allowed: [${allowed.join(', ')}]`
      );
    }
  }
}

/**
 * ========================================================
 * 3. ORDER SERVICE
 * ========================================================
 */
export class OrderService {
  // In-flight mutex to enforce atomicity and prevent race conditions on concurrent creation
  private static inFlightCreations = new Map<string, Promise<Order>>();

  /**
   * Creates an AquaBloom Order from an OrderReadiness record.
   *
   * Rigorous Rules:
   * - Preconditions:
   *   1. Campaign Agreement = LOCKED
   *   2. OrderReadiness = READY_FOR_ORDER
   *   3. SupplierAssignment = ASSIGNED
   *   4. LogisticsAssignment = ASSIGNED
   *   5. Pricing calculation = valid (status === 'CALCULATED')
   * - Idempotency:
   *   Repeated requests return the existing Order without creating duplicates.
   * - References:
   *   Preserves all 9 required authoritative references and snapshots.
   * - Status Progression:
   *   Initial status: PRICED, then transitions to PAYMENT_REQUIRED.
   *   Payment & Production are strictly NOT implemented here.
   */
  public static async createOrder(input: CreateOrderInput, actor: User): Promise<Order> {
    const readinessKey = input.orderReadinessId;

    // Check if another concurrent request for this readiness is in progress
    const existingPromise = OrderService.inFlightCreations.get(readinessKey);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = OrderService.executeCreateOrder(input, actor);
    OrderService.inFlightCreations.set(readinessKey, promise);

    try {
      const order = await promise;
      return order;
    } finally {
      OrderService.inFlightCreations.delete(readinessKey);
    }
  }

  /**
   * Synchronous creation core (also callable synchronously when needed)
   */
  public static createOrderSync(input: CreateOrderInput, actor: User): Order {
    // 1. Idempotency Check by readinessId
    const existingByReadiness = db.getOrderByOrderReadiness(input.orderReadinessId);
    if (existingByReadiness) {
      if (input.idempotencyKey && existingByReadiness.idempotencyKey && existingByReadiness.idempotencyKey !== input.idempotencyKey) {
        throw new ConflictError(
          `Conflict: Order already exists for Order Readiness '${input.orderReadinessId}' with different idempotency key.`
        );
      }
      return existingByReadiness;
    }

    // 2. Idempotency Check by idempotencyKey
    if (input.idempotencyKey) {
      const existingByKey = db.getOrderByIdempotencyKey(input.idempotencyKey);
      if (existingByKey) {
        if (existingByKey.orderReadinessId !== input.orderReadinessId) {
          throw new ConflictError(
            `Conflict: Idempotency key '${input.idempotencyKey}' was already used for a different Order.`
          );
        }
        return existingByKey;
      }
    }

    // 3. Precondition Validation & Entity Assembly
    const ctx = OrderValidationEngine.validateOrderCreationPreconditions(input.orderReadinessId, actor);
    const {
      readiness,
      agreement,
      agreementSnapshot,
      supplierAssignment,
      logisticsAssignment,
      pricingResult,
      advertiserBrandName,
      venueName,
      campaignName,
    } = ctx;

    const now = new Date().toISOString();
    const orderId = generateInternalId('ord');
    const orderPublicId = generateBusinessId('AB-ORD');
    const orderReference = `ORD-REF-${Math.floor(100000 + Math.random() * 900000)}`;

    // Build the 9 authoritative references
    const references: OrderAuthoritativeReferences = {
      campaignId: readiness.campaignId,
      campaignPublicId: agreement.campaignPublicId || (campaign ? campaign.publicCampaignId : ''),
      campaignName,

      advertiserId: readiness.advertiserId,
      advertiserPublicId: agreement.advertiserPublicId || (db.findUserById(readiness.advertiserId)?.publicAccountId ?? ''),
      advertiserBrandName,

      venueId: readiness.venueId,
      venuePublicId: agreement.venuePublicId || (db.findUserById(readiness.venueId)?.publicAccountId ?? ''),
      venueName,

      campaignAgreementId: agreement.id,
      campaignAgreementPublicId: agreement.publicId,

      campaignAgreementSnapshotId: agreementSnapshot.id,
      campaignAgreementSnapshotPublicId: agreementSnapshot.publicSnapshotId || (agreementSnapshot as any).publicId,

      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,

      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      supplierId: supplierAssignment.supplierId,
      supplierBusinessName: supplierAssignment.supplierBusinessName,
      productId: supplierAssignment.productId,
      productPublicId: supplierAssignment.productPublicId,
      productVersionId: supplierAssignment.productVersionId,
      productVersionNumber: supplierAssignment.productVersionNumber,

      logisticsAssignmentId: logisticsAssignment.id,
      logisticsAssignmentPublicId: logisticsAssignment.publicId,
      logisticsPartnerId: logisticsAssignment.logisticsPartnerId,
      logisticsPartnerBusinessName: logisticsAssignment.logisticsPartnerBusinessName,

      finalPricingResultId: pricingResult.id,
      finalPricingResultPublicId: pricingResult.publicId,
      pricingReference: pricingResult.pricingReference,
    };

    const product = db.getProductById(supplierAssignment.productId);
    const productName = product ? product.name : 'AquaBloom Pure Aluminum Spring Water';

    const snapshotId = generateInternalId('ops');
    const snapshotPublicId = generateBusinessId('AB-OPS');

    // Build Authoritative Pricing Snapshot from Step 11A Final Pricing Result
    const pricingSnapshot: OrderPricingSnapshot = {
      id: snapshotId,
      publicId: snapshotPublicId,
      orderId,
      orderPublicId,
      orderReference,

      currency: 'INR',
      contractedQuantity: pricingResult.sourceReferences.contractedQuantity,

      productPrice: {
        unitPriceMinor: pricingResult.productUnitPrice.amountMinor,
        unitPriceFormatted: pricingResult.productUnitPrice.formatted,
        productPriceTotalMinor: pricingResult.productPriceTotalMinor,
        productPriceTotalFormatted: pricingResult.productPriceTotalFormatted,
      },

      logisticsCost: {
        logisticsCostTotalMinor: pricingResult.logisticsCostTotalMinor,
        logisticsCostTotalFormatted: pricingResult.logisticsCostTotalFormatted,
      },

      taxableAmount: {
        taxableAmountMinor: pricingResult.taxableAmountMinor,
        taxableAmountFormatted: pricingResult.taxableAmountFormatted,
      },

      taxes: {
        totalTaxMinor: pricingResult.taxes.totalTaxMinor,
        totalTaxFormatted: pricingResult.taxes.totalTaxFormatted,
        jurisdiction: {
          originState: pricingResult.taxes.jurisdiction.originState,
          destinationState: pricingResult.taxes.jurisdiction.destinationState,
          isInterState: pricingResult.taxes.jurisdiction.isInterState,
        },
        taxComponents: pricingResult.taxes.taxComponents.map((c) => ({
          taxType: c.taxType,
          ratePercentage: c.ratePercentage,
          taxableAmountMinor: c.taxableAmountMinor,
          taxAmountMinor: c.taxAmountMinor,
          taxableAmountFormatted: c.taxableAmountFormatted,
          taxAmountFormatted: c.taxAmountFormatted,
        })),
      },

      grandTotal: {
        amountMinor: pricingResult.grandTotalMinor,
        amountFormatted: pricingResult.grandTotalFormatted,
      },

      productPricingVersion: {
        productId: supplierAssignment.productId,
        productPublicId: supplierAssignment.productPublicId,
        productName,
        productVersionId: supplierAssignment.productVersionId,
        productVersionNumber: supplierAssignment.productVersionNumber,
        unitCustomerFacingPriceMinor: pricingResult.productUnitPrice.amountMinor,
        unitCustomerFacingPriceFormatted: pricingResult.productUnitPrice.formatted,
      },

      logisticsOfferVersion: {
        logisticsAssignmentId: logisticsAssignment.id,
        logisticsAssignmentPublicId: logisticsAssignment.publicId,
        logisticsPartnerId: logisticsAssignment.logisticsPartnerId,
        logisticsPartnerBusinessName: logisticsAssignment.logisticsPartnerBusinessName,
        logisticsCostMinor: pricingResult.logisticsCostTotalMinor,
        logisticsCostFormatted: pricingResult.logisticsCostTotalFormatted,
        pricingVersionId: logisticsAssignment.lockedOperationalSnapshot.costInput?.pricingVersionId,
      },

      taxConfigurationVersion: {
        taxEngineVersion: pricingResult.taxes.taxEngineVersion || 'GST_IN_V1',
        jurisdiction: {
          originState: pricingResult.taxes.jurisdiction.originState,
          destinationState: pricingResult.taxes.jurisdiction.destinationState,
          isInterState: pricingResult.taxes.jurisdiction.isInterState,
        },
        taxComponents: pricingResult.taxes.taxComponents.map((c) => ({
          taxType: c.taxType,
          ratePercentage: c.ratePercentage,
          taxableAmountMinor: c.taxableAmountMinor,
          taxAmountMinor: c.taxAmountMinor,
          taxableAmountFormatted: c.taxableAmountFormatted,
          taxAmountFormatted: c.taxAmountFormatted,
        })),
      },

      calculationTimestamp: pricingResult.calculatedAt,
      calculationReferenceId: pricingResult.id,

      isFrozen: true,
      frozenAt: now,
      frozenBy: actor.id,

      unitPriceMinor: pricingResult.productUnitPrice.amountMinor,
      unitPriceFormatted: pricingResult.productUnitPrice.formatted,
      productPriceTotalMinor: pricingResult.productPriceTotalMinor,
      productPriceTotalFormatted: pricingResult.productPriceTotalFormatted,
      logisticsCostTotalMinor: pricingResult.logisticsCostTotalMinor,
      logisticsCostTotalFormatted: pricingResult.logisticsCostTotalFormatted,
      taxableAmountMinor: pricingResult.taxableAmountMinor,
      taxableAmountFormatted: pricingResult.taxableAmountFormatted,
      totalTaxMinor: pricingResult.taxes.totalTaxMinor,
      totalTaxFormatted: pricingResult.taxes.totalTaxFormatted,
      grandTotalMinor: pricingResult.grandTotalMinor,
      grandTotalFormatted: pricingResult.grandTotalFormatted,
      taxJurisdiction: {
        originState: pricingResult.taxes.jurisdiction.originState,
        destinationState: pricingResult.taxes.jurisdiction.destinationState,
        isInterState: pricingResult.taxes.jurisdiction.isInterState,
      },
      taxComponents: pricingResult.taxes.taxComponents.map((c) => ({
        taxType: c.taxType,
        ratePercentage: c.ratePercentage,
        taxableAmountMinor: c.taxableAmountMinor,
        taxAmountMinor: c.taxAmountMinor,
        taxableAmountFormatted: c.taxableAmountFormatted,
        taxAmountFormatted: c.taxAmountFormatted,
      })),
      formulaNote: pricingResult.safeguards.formulaNote,
    };

    // Build Authoritative Operational Terms Snapshot from Agreement & Assignment Snapshots
    const specs =
      supplierAssignment.lockedOfferSnapshot.productSpecificationsSnapshot ||
      (supplierAssignment.lockedOfferSnapshot as any).specifications ||
      {};

    const operationalTerms: OrderOperationalTermsSnapshot = {
      contractedQuantity:
        agreementSnapshot.campaignTermsSnapshot?.quantity ||
        supplierAssignment.lockedOfferSnapshot.bottleQuantity,
      preferredStartPeriod: agreement.terms.preferredStartPeriod?.label || 'Not specified',
      deliveryAddress:
        agreement.terms.deliveryTermsKnown?.deliveryAddress ||
        logisticsAssignment.lockedOperationalSnapshot.requirements.destinationVenue.address ||
        'Designated Venue Address',
      refrigerationRequired: agreement.terms.deliveryTermsKnown?.refrigerationRequired ?? false,
      stagingInstructions: agreement.terms.deliveryTermsKnown?.stagingInstructions,
      bottleSpecifications: {
        bottleMaterial: specs.bottleMaterial || 'Aluminum',
        bottleCapacityMl: specs.bottleCapacityMl || 500,
        labelType: specs.labelType || 'Direct Screen Print',
        volumeLabel: specs.volumeLabel || `${specs.bottleCapacityMl || 500} ml`,
        printingCapability: specs.printingCapability,
      },
    };

    // Step 11B Initial Status Flow:
    // 1. Initial creation status: PRICED
    // 2. Then transition according to order-state architecture: PAYMENT_REQUIRED
    const initialTransition: OrderStatusTransition = {
      fromStatus: null,
      toStatus: 'PRICED',
      transitionedAt: now,
      transitionedBy: actor.id,
      reason: 'Order initialized and authoritative pricing verified from Step 11A.',
    };

    const paymentRequiredTransition: OrderStatusTransition = {
      fromStatus: 'PRICED',
      toStatus: 'PAYMENT_REQUIRED',
      transitionedAt: now,
      transitionedBy: actor.id,
      reason: 'Authoritative pricing validated; payment required from advertiser.',
    };

    const order: Order = {
      id: orderId,
      publicId: orderPublicId,
      orderReference,
      idempotencyKey: input.idempotencyKey,

      status: 'PAYMENT_REQUIRED',
      statusHistory: [initialTransition, paymentRequiredTransition],

      references,

      // Indexing accessors
      campaignId: references.campaignId,
      campaignPublicId: references.campaignPublicId,
      advertiserId: references.advertiserId,
      advertiserPublicId: references.advertiserPublicId,
      venueId: references.venueId,
      venuePublicId: references.venuePublicId,
      campaignAgreementId: references.campaignAgreementId,
      campaignAgreementPublicId: references.campaignAgreementPublicId,
      campaignAgreementSnapshotId: references.campaignAgreementSnapshotId,
      orderReadinessId: references.orderReadinessId,
      orderReadinessPublicId: references.orderReadinessPublicId,
      supplierAssignmentId: references.supplierAssignmentId,
      supplierAssignmentPublicId: references.supplierAssignmentPublicId,
      logisticsAssignmentId: references.logisticsAssignmentId,
      logisticsAssignmentPublicId: references.logisticsAssignmentPublicId,
      finalPricingResultId: references.finalPricingResultId,
      finalPricingResultPublicId: references.finalPricingResultPublicId,

      pricing: pricingSnapshot,
      operationalTerms,

      boundaries: {
        orderCreated: true,
        paymentInitiated: false,
        productionStarted: false,
        fulfillmentScheduled: false,
      },

      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };

    // Persist Order
    order.pricingSnapshotId = pricingSnapshot.id;
    db.saveOrder(order);

    // Step 11C: Save Immutable Order Pricing Snapshot & Establish Payment Readiness
    db.saveOrderPricingSnapshot(pricingSnapshot);
    const paymentReadiness = PaymentReadinessService.assessPaymentReadinessSync(order.id, actor);
    order.paymentReadinessId = paymentReadiness.id;
    db.saveOrder(order);

    // Update pricing result future boundary
    pricingResult.futureBoundaries.orderCreated = true;
    db.saveFinalPricingResult(pricingResult);

    // Dispatch Events
    eventDispatcher.dispatch({
      category: 'BUSINESS_TIMELINE',
      eventType: 'ORDER_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        orderReference: order.orderReference,
        status: order.status,
        grandTotalFormatted: order.pricing.grandTotalFormatted,
        advertiserPublicId: order.advertiserPublicId,
        campaignPublicId: order.campaignPublicId,
        timestamp: now,
      },
    });

    eventDispatcher.dispatch({
      category: 'BUSINESS_TIMELINE',
      eventType: 'ORDER_STATUS_CHANGED',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        fromStatus: 'PRICED',
        toStatus: 'PAYMENT_REQUIRED',
        reason: paymentRequiredTransition.reason,
        timestamp: now,
      },
    });

    return order;
  }

  private static async executeCreateOrder(input: CreateOrderInput, actor: User): Promise<Order> {
    return OrderService.createOrderSync(input, actor);
  }

  /**
   * Retrieves an Order by ID or Public ID with authorization enforcement.
   */
  public static getOrder(orderIdOrPublicId: string, actor: User): Order {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    OrderAuthorizationService.assertCanView(order, actor);
    return order;
  }

  /**
   * Retrieves a sanitized customer-facing summary view of the Order.
   */
  public static getSharedView(orderIdOrPublicId: string, actor: User): OrderSharedView {
    const order = OrderService.getOrder(orderIdOrPublicId, actor);

    return {
      orderId: order.id,
      publicId: order.publicId,
      orderReference: order.orderReference,
      status: order.status,
      campaignName: order.references.campaignName,
      advertiserBrandName: order.references.advertiserBrandName,
      venueName: order.references.venueName,
      contractedQuantity: order.pricing.contractedQuantity,
      pricing: {
        currency: 'INR',
        grandTotalFormatted: order.pricing.grandTotalFormatted,
        productPriceTotalFormatted: order.pricing.productPriceTotalFormatted,
        logisticsCostTotalFormatted: order.pricing.logisticsCostTotalFormatted,
        totalTaxFormatted: order.pricing.totalTaxFormatted,
        taxComponents: order.pricing.taxComponents.map((c) => ({
          taxType: c.taxType,
          ratePercentage: c.ratePercentage,
          taxAmountFormatted: c.taxAmountFormatted,
        })),
      },
      references: {
        campaignPublicId: order.campaignPublicId,
        agreementPublicId: order.campaignAgreementPublicId,
        orderReadinessPublicId: order.orderReadinessPublicId,
        supplierAssignmentPublicId: order.supplierAssignmentPublicId,
        logisticsAssignmentPublicId: order.logisticsAssignmentPublicId,
        finalPricingPublicId: order.finalPricingResultPublicId,
      },
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  /**
   * Transitions an Order status in accordance with the foundation state machine.
   * Note: Payment processing and production are explicitly NOT implemented here.
   */
  public static transitionStatus(
    orderIdOrPublicId: string,
    newStatus: OrderStatus,
    reason: string,
    actor: User
  ): Order {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    // Only Admin or the Advertiser can transition order states
    OrderAuthorizationService.assertCanView(order, actor);
    if (actor.role !== 'ADMIN' && order.advertiserId !== actor.id) {
      throw new AuthorizationError('Not authorized to change order status.');
    }

    OrderValidationEngine.validateStatusTransition(order.status, newStatus);

    const now = new Date().toISOString();
    const transition: OrderStatusTransition = {
      fromStatus: order.status,
      toStatus: newStatus,
      transitionedAt: now,
      transitionedBy: actor.id,
      reason,
    };

    order.status = newStatus;
    order.statusHistory.push(transition);
    order.updatedAt = now;
    order.updatedBy = actor.id;

    db.saveOrder(order);

    eventDispatcher.dispatch({
      category: 'BUSINESS_TIMELINE',
      eventType: 'ORDER_STATUS_CHANGED',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
        reason,
        timestamp: now,
      },
    });

    return order;
  }

  /**
   * Retrieves orders for the authenticated user based on role:
   * - ADVERTISER: only their own orders
   * - ADMIN: all orders
   * - Counterparties (SUPPLIER, VENUE, LOGISTICS_PARTNER): strictly forbidden from accessing advertiser order lists
   */
  public static getOrdersForUser(actor: User): Order[] {
    OrderAuthorizationService.assertAuthenticated(actor);

    if (actor.role === 'ADMIN') {
      return db.getAllOrders();
    }

    if (actor.role === 'ADVERTISER') {
      return db.getOrdersByAdvertiser(actor.id);
    }

    throw new AuthorizationError(
      `Access denied: Role '${actor.role}' is not authorized to list customer Orders.`
    );
  }
}

/**
 * ========================================================
 * 4. STEP 11D: ADVERTISER ORDER REVIEW SERVICE
 * ========================================================
 */
export class OrderReviewService {
  /**
   * Retrieves the comprehensive Advertiser Order Review view.
   * Strictly enforces:
   * 1. Only the contracted Advertiser or Admin may access.
   * 2. Authoritative payment amount resolved directly from OrderPricingSnapshot.grandTotal.
   * 3. Price formula: Product Price + Logistics + Applicable Taxes = Total (No separate Label Fee).
   * 4. Transparency: Expandable tax components without exposing supplier internal cost,
   *    AquaBloom margin, or venue compensation calculation.
   */
  public static getAdvertiserOrderReview(
    orderIdOrPublicId: string,
    actor: User
  ): AdvertiserOrderReviewView {
    const order = OrderService.getOrder(orderIdOrPublicId, actor);

    // Fetch snapshot (ensures frozen snapshot is present)
    const snapshot = db.getOrderPricingSnapshotByOrderId(order.id) || order.pricing;
    if (!snapshot) {
      throw new NotFoundError(
        `Immutable Order Pricing Snapshot missing for Order '${order.publicId}'.`
      );
    }

    // Fetch payment readiness & payment entity
    const readiness = db.getOrderPaymentReadinessByOrderId(order.id);
    const payment = db.getPaymentByOrderId(order.id);
    const attempts = db.getPaymentAttemptsByOrderId(order.id);
    const attemptsCount = attempts.length > 0 ? attempts.length : (payment?.attemptsCount || (payment ? 1 : 0));

    // Resolve authoritative Payment State (Step 12G)
    let paymentStatus: string = 'PAYMENT_REQUIRED';
    let paymentStatusLabel: string = 'Payment Required';
    let canProceedToPayment: boolean = order.status === 'PAYMENT_REQUIRED';
    let canRetryPayment: boolean = false;

    if (!payment) {
      paymentStatus = 'PAYMENT_REQUIRED';
      paymentStatusLabel = 'Payment Required';
      canProceedToPayment = order.status === 'PAYMENT_REQUIRED';
      canRetryPayment = false;
    } else {
      switch (payment.status) {
        case 'PAID':
          paymentStatus = 'PAID';
          paymentStatusLabel = 'Paid';
          canProceedToPayment = false;
          canRetryPayment = false;
          break;
        case 'PROCESSING':
          paymentStatus = 'PROCESSING';
          paymentStatusLabel = 'Processing';
          canProceedToPayment = false;
          canRetryPayment = false;
          break;
        case 'REQUIRES_ACTION':
        case 'REQUIRES_CONFIRMATION':
          paymentStatus = 'VERIFICATION_PENDING';
          paymentStatusLabel = 'Verification Pending';
          canProceedToPayment = false;
          canRetryPayment = false;
          break;
        case 'FAILED':
          paymentStatus = 'FAILED';
          paymentStatusLabel = 'Failed';
          canProceedToPayment = false;
          canRetryPayment = true;
          break;
        case 'EXPIRED':
        case 'CANCELLED':
          paymentStatus = 'EXPIRED';
          paymentStatusLabel = 'Expired';
          canProceedToPayment = false;
          canRetryPayment = true;
          break;
        case 'UNDERPAID_FLAGGED':
        case 'OVERPAID_RECONCILIATION_FLAGGED':
        case 'RECONCILIATION_FLAGGED':
          paymentStatus = 'RECONCILIATION_PENDING';
          paymentStatusLabel = 'Reconciliation Pending';
          canProceedToPayment = false;
          canRetryPayment = false;
          break;
        case 'PENDING':
        case 'REQUIRES_PAYMENT_METHOD':
        default:
          paymentStatus = 'PAYMENT_REQUIRED';
          paymentStatusLabel = 'Payment Required';
          canProceedToPayment = order.status === 'PAYMENT_REQUIRED';
          canRetryPayment = false;
          break;
      }
    }

    // Resolve Fulfillment Authorization (Step 12F & 12G)
    const auth = db.getFulfillmentAuthorizationByOrderId(order.id);
    const fulfillmentAuthorization = auth && auth.status === 'AUTHORIZED'
      ? {
          authorizationId: auth.id,
          authorizationPublicId: auth.publicId,
          status: auth.status,
          isAuthorized: true,
          productionPermitted: auth.productionPermitted,
          authorizedAt: auth.authorizedAt || null,
          commercialBoundary: {
            productionStarted: auth.commercialBoundary?.productionStarted ?? false,
            cancellationPermitted: auth.commercialBoundary?.cancellationPermitted ?? true,
            cancellationCutoffStage: auth.commercialBoundary?.cancellationCutoffStage || 'PRODUCTION_START',
            notice: auth.commercialBoundary?.notice,
          },
        }
      : {
          authorizationId: auth ? auth.id : '',
          authorizationPublicId: auth ? auth.publicId : '',
          status: auth ? auth.status : 'NOT_AUTHORIZED',
          isAuthorized: false,
          productionPermitted: false,
          authorizedAt: auth?.authorizedAt || null,
          commercialBoundary: {
            productionStarted: false,
            cancellationPermitted: true,
            cancellationCutoffStage: 'PRODUCTION_START',
          },
        };

    // Fetch venue profile for location metadata
    const venueProfile = db.getProfile(order.venueId) as any;

    const reviewView: AdvertiserOrderReviewView = {
      orderId: order.id,
      publicId: order.publicId,
      orderReference: order.orderReference,
      status: order.status,
      statusLabel: order.status === 'PAYMENT_REQUIRED' ? 'PAYMENT REQUIRED' : order.status,
      isPaymentRequired: order.status === 'PAYMENT_REQUIRED',

      campaign: {
        id: order.campaignId,
        publicId: order.campaignPublicId,
        name: order.references.campaignName,
        preferredStartPeriod: order.operationalTerms?.preferredStartPeriod,
      },

      venue: {
        id: order.venueId,
        publicId: order.venuePublicId,
        name: order.references.venueName,
        city: venueProfile?.address?.city || venueProfile?.city || 'Pune',
        state: venueProfile?.address?.stateRegion || venueProfile?.state || 'Maharashtra',
        address: order.operationalTerms?.deliveryAddress,
        venueType: venueProfile?.venueType || 'Convention Center',
      },

      product: {
        id: order.references.productId,
        publicId: order.references.productPublicId,
        name: order.pricing.productPricingVersion?.productName || 'Pure Spring Aluminum Bottle',
        versionNumber: order.references.productVersionNumber,
        specifications: order.operationalTerms?.bottleSpecifications || {
          bottleMaterial: 'Aluminum',
          bottleCapacityMl: 500,
          labelType: 'Direct Screen Print',
          volumeLabel: '500 ml',
        },
      },

      contractedQuantity: order.pricing.contractedQuantity,

      logistics: {
        assignmentPublicId: order.logisticsAssignmentPublicId,
        partnerBusinessName: order.references.logisticsPartnerBusinessName,
        deliveryAddress: order.operationalTerms?.deliveryAddress || 'Designated Venue Address',
        preferredStartPeriod: order.operationalTerms?.preferredStartPeriod || 'Within 14 days',
        refrigerationRequired: order.operationalTerms?.refrigerationRequired ?? false,
        stagingInstructions: order.operationalTerms?.stagingInstructions,
      },

      pricing: {
        currency: 'INR',
        unitPriceFormatted: snapshot.productPrice.unitPriceFormatted,
        productPriceTotalFormatted: snapshot.productPrice.productPriceTotalFormatted,
        productPriceTotalMinor: snapshot.productPrice.productPriceTotalMinor,
        logisticsCostTotalFormatted: snapshot.logisticsCost.logisticsCostTotalFormatted,
        logisticsCostTotalMinor: snapshot.logisticsCost.logisticsCostTotalMinor,
        applicableTaxesFormatted: snapshot.taxes.totalTaxFormatted,
        applicableTaxesMinor: snapshot.taxes.totalTaxMinor,
        grandTotalFormatted: snapshot.grandTotal.amountFormatted,
        grandTotalMinor: snapshot.grandTotal.amountMinor,
        snapshotPublicId: snapshot.publicId,
        isFrozen: true,
        pricingReference: order.references.pricingReference || snapshot.orderReference,
        calculatedAt: snapshot.calculationTimestamp,
        taxBreakdown: {
          jurisdiction: snapshot.taxes.jurisdiction,
          components: (snapshot.taxes.taxComponents || []).map((t) => ({
            taxType: t.taxType,
            ratePercentage: t.ratePercentage,
            taxAmountFormatted: t.taxAmountFormatted,
          })),
        },
      },

      payment: {
        status: paymentStatus,
        statusLabel: paymentStatusLabel,
        paymentReadinessPublicId: readiness?.publicId || 'AB-OPR-PENDING',
        authoritativeAmountFormatted: snapshot.grandTotal.amountFormatted,
        authoritativeAmountMinor: snapshot.grandTotal.amountMinor,
        currency: 'INR',
        canProceedToPayment,
        canRetryPayment,
        paymentReference: payment?.paymentReference || undefined,
        paidAt: payment?.paidAt || undefined,
        failedAt: payment?.failedAt || undefined,
        lastFailureReason: payment?.lastFailureReason || undefined,
        attemptsCount,
        provider: payment?.provider || undefined,
        providerTransactionReference:
          payment?.providerTransactionReference || payment?.paymentIntentId || undefined,
        readinessTimestamp: readiness?.readinessTimestamp || snapshot.calculationTimestamp,
      },

      fulfillmentAuthorization,

      createdAt: order.createdAt,
    };

    return reviewView;
  }

  /**
   * Initiates payment handoff to Step 12 payment architecture.
   * Resolves authoritative payment amount directly from PaymentReadinessService.
   * Does NOT implement payment gateway/provider processing (Step 12 boundary).
   */
  public static initiatePaymentHandoff(
    orderIdOrPublicId: string,
    actor: User
  ): OrderPaymentHandoffResult {
    const order = OrderService.getOrder(orderIdOrPublicId, actor);

    if (order.status !== 'PAYMENT_REQUIRED') {
      throw new ValidationError(
        `Cannot initiate payment handoff for Order '${order.publicId}' with status '${order.status}'. Must be 'PAYMENT_REQUIRED'.`
      );
    }

    // Authoritative payment amount resolution from OrderPricingSnapshot.grandTotal
    const authPayment = PaymentReadinessService.getAuthoritativePaymentAmount(order.id, actor);
    const readiness = PaymentReadinessService.getPaymentReadiness(order.id, actor);

    const now = new Date().toISOString();
    const handoffResult: OrderPaymentHandoffResult = {
      orderId: order.id,
      orderPublicId: order.publicId,
      orderReference: order.orderReference,
      paymentReadinessId: readiness.id,
      paymentReadinessPublicId: readiness.publicId,
      snapshotPublicId: authPayment.snapshotPublicId,
      authoritativeAmount: {
        amountMinor: authPayment.amountMinor,
        amountFormatted: authPayment.amountFormatted,
        currency: 'INR',
      },
      status: 'HANDOFF_TO_PAYMENT_GATEWAY',
      nextStep: 'STEP_12_PAYMENT_GATEWAY',
      handoffTimestamp: now,
      message: `Payment handoff initiated successfully for Order ${order.publicId}. Verified authoritative amount ${authPayment.amountFormatted}. Ready for Step 12 Payment Gateway.`,
    };

    eventDispatcher.dispatch({
      category: 'BUSINESS_TIMELINE',
      eventType: 'ORDER_PAYMENT_HANDOFF_INITIATED',
      userId: actor.id,
      role: actor.role,
      scope: 'RESTRICTED',
      payload: {
        orderId: order.id,
        orderPublicId: order.publicId,
        orderReference: order.orderReference,
        authoritativeGrandTotal: authPayment.amountFormatted,
        paymentReadinessPublicId: readiness.publicId,
        handoffTimestamp: now,
      },
    });

    return handoffResult;
  }
}
