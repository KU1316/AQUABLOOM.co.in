/**
 * AquaBloom Step 11C: Immutable Order Pricing Snapshot & Payment Readiness
 * 
 * Objectives:
 * 1. Freeze the exact amount that the Advertiser will be required to pay.
 * 2. Immutable OrderPricingSnapshot preserving all authoritative components:
 *    - Order ID & Public ID
 *    - Product price & version
 *    - Logistics cost & version
 *    - Taxable amount & tax configuration/jurisdiction
 *    - Taxes (components & totals)
 *    - Grand total (SafeMoney minor units / paise)
 *    - Currency ('INR')
 *    - Calculation timestamp & Reference IDs
 * 3. Authoritative payment amount resolution (Never trust browser-supplied amounts, never recalculate during payment).
 * 4. Resilience to subsequent price changes (Future catalog or rate adjustments never mutate the frozen snapshot).
 * 5. Payment Readiness record (`READY_FOR_PAYMENT`) without initiating payment yet.
 * 6. Counterparty security isolation (Suppliers and Venues strictly barred from advertiser financial totals, margins, and cost bases).
 */

import { db } from './db.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';
import {
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
} from '../lib/errors.js';
import type {
  User,
  Order,
  OrderPricingSnapshot,
  OrderPaymentReadiness,
  AdvertiserPaymentReadinessView,
  FinalPricingCalculationResult,
  SupplierAssignment,
  LogisticsAssignment,
} from '../types.js';

/**
 * Deep freezes an object recursively to guarantee memory-level immutability.
 */
export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Authorization service enforcing strict counterparty isolation for payment amounts
 */
export class PaymentReadinessAuthorizationService {
  /**
   * Asserts whether an actor can view or access an Order Pricing Snapshot.
   * Rules:
   * - System Admin: permitted.
   * - Contracted Advertiser: permitted.
   * - Supplier: DENIED. Supplier cannot see advertiser grand total, AquaBloom margin, or private financial info.
   * - Venue: DENIED. Venue cannot see advertiser grand total or supplier cost base.
   * - Other advertisers / third parties: DENIED.
   */
  public static assertCanAccessSnapshot(
    snapshot: OrderPricingSnapshot,
    order: Order,
    actor: User
  ): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (actor.role === 'ADVERTISER') {
      if (order.advertiserId === actor.id) {
        return;
      }
      PaymentReadinessAuthorizationService.recordAccessDenied(
        order.id,
        actor,
        'Advertiser attempted to access pricing snapshot of a different advertiser.'
      );
      throw new AuthorizationError(
        `Access denied: You do not own Order '${order.publicId}'. Only the contracted advertiser can view this pricing snapshot.`
      );
    }

    if (actor.role === 'SUPPLIER') {
      PaymentReadinessAuthorizationService.recordAccessDenied(
        order.id,
        actor,
        'Supplier attempted to access advertiser financial totals / margin.'
      );
      throw new AuthorizationError(
        `Access denied: Supplier partners are strictly prohibited from viewing advertiser grand totals, AquaBloom margins, or private billing details.`
      );
    }

    if (actor.role === 'VENUE') {
      PaymentReadinessAuthorizationService.recordAccessDenied(
        order.id,
        actor,
        'Venue attempted to access advertiser grand total / supplier cost base.'
      );
      throw new AuthorizationError(
        `Access denied: Venues are strictly prohibited from viewing advertiser grand totals or underlying supplier cost data.`
      );
    }

    PaymentReadinessAuthorizationService.recordAccessDenied(
      order.id,
      actor,
      `Role '${actor.role}' attempted unauthorized access to pricing snapshot.`
    );
    throw new AuthorizationError(
      `Access denied: Role '${actor.role}' is not authorized to view financial pricing snapshots.`
    );
  }

  /**
   * Asserts whether an actor can access an Order Payment Readiness record.
   */
  public static assertCanAccessPaymentReadiness(
    readiness: OrderPaymentReadiness,
    actor: User
  ): void {
    if (actor.role === 'ADMIN') {
      return;
    }

    if (actor.role === 'ADVERTISER') {
      if (readiness.advertiserId === actor.id) {
        return;
      }
      PaymentReadinessAuthorizationService.recordAccessDenied(
        readiness.orderId,
        actor,
        'Advertiser attempted to access payment readiness of another advertiser.'
      );
      throw new AuthorizationError(
        `Access denied: You do not have permission to view payment readiness for Order '${readiness.orderPublicId}'.`
      );
    }

    if (actor.role === 'SUPPLIER') {
      PaymentReadinessAuthorizationService.recordAccessDenied(
        readiness.orderId,
        actor,
        'Supplier attempted to access advertiser payment readiness record.'
      );
      throw new AuthorizationError(
        `Access denied: Suppliers cannot view advertiser payment readiness records or grand totals.`
      );
    }

    if (actor.role === 'VENUE') {
      PaymentReadinessAuthorizationService.recordAccessDenied(
        readiness.orderId,
        actor,
        'Venue attempted to access advertiser payment readiness record.'
      );
      throw new AuthorizationError(
        `Access denied: Venues cannot view advertiser payment readiness records or grand totals.`
      );
    }

    PaymentReadinessAuthorizationService.recordAccessDenied(
      readiness.orderId,
      actor,
      `Role '${actor.role}' attempted unauthorized access to payment readiness.`
    );
    throw new AuthorizationError(
      `Access denied: Role '${actor.role}' is not authorized to view payment readiness.`
    );
  }

  private static recordAccessDenied(orderId: string, actor: User, reason: string): void {
    eventDispatcher.dispatch({
      id: generateInternalId('evt'),
      eventType: 'SECURITY_ALERT',
      severity: 'WARNING',
      category: 'AUTHORIZATION',
      title: 'Payment Readiness Access Denied',
      description: `Unauthorized financial access attempt on Order '${orderId}' by user '${actor.publicAccountId}' (${actor.role}): ${reason}`,
      actorId: actor.id,
      actorRole: actor.role,
      actorPublicId: actor.publicAccountId,
      resourceType: 'ORDER_PAYMENT_READINESS',
      resourceId: orderId,
      metadata: { orderId, reason, actorRole: actor.role },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Engine responsible for freezing and maintaining immutable Order Pricing Snapshots
 */
export class OrderPricingSnapshotEngine {
  private static inFlightFreezes: Map<string, Promise<OrderPricingSnapshot>> = new Map();

  /**
   * Freezes the Order Pricing Snapshot asynchronously with in-flight concurrency protection.
   */
  public static async freezeSnapshot(
    orderIdOrPublicId: string,
    actor: User
  ): Promise<OrderPricingSnapshot> {
    const existingPromise = OrderPricingSnapshotEngine.inFlightFreezes.get(orderIdOrPublicId);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      return OrderPricingSnapshotEngine.freezeSnapshotSync(orderIdOrPublicId, actor);
    })();

    OrderPricingSnapshotEngine.inFlightFreezes.set(orderIdOrPublicId, promise);
    try {
      return await promise;
    } finally {
      OrderPricingSnapshotEngine.inFlightFreezes.delete(orderIdOrPublicId);
    }
  }

  /**
   * Synchronous core to build and persist an immutable Order Pricing Snapshot.
   */
  public static freezeSnapshotSync(
    orderIdOrPublicId: string,
    actor: User
  ): OrderPricingSnapshot {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    // 1. Idempotency Check: If already frozen, verify authorization and return deep-frozen snapshot
    const existingSnapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    if (existingSnapshot) {
      PaymentReadinessAuthorizationService.assertCanAccessSnapshot(existingSnapshot, order, actor);
      return deepFreeze(JSON.parse(JSON.stringify(existingSnapshot)));
    }

    // 2. Authorization Check for creation/freezing
    if (actor.role !== 'ADMIN' && (actor.role !== 'ADVERTISER' || order.advertiserId !== actor.id)) {
      throw new AuthorizationError(
        `Access denied: Only the contracted advertiser or admin can freeze pricing for Order '${order.publicId}'.`
      );
    }

    // 3. Retrieve authoritative source records
    const pricingResult = db.getFinalPricingResultById(order.finalPricingResultId);
    if (!pricingResult) {
      throw new NotFoundError(
        `Final Pricing Result '${order.finalPricingResultId}' not found for Order '${order.publicId}'.`
      );
    }

    if (pricingResult.status !== 'CALCULATED') {
      throw new ValidationError(
        `Cannot freeze pricing snapshot: Final pricing status is '${pricingResult.status}', must be 'CALCULATED'.`
      );
    }

    const supplierAssignment = db.getSupplierAssignmentById(order.supplierAssignmentId);
    if (!supplierAssignment) {
      throw new NotFoundError(
        `Supplier Assignment '${order.supplierAssignmentId}' not found for Order '${order.publicId}'.`
      );
    }

    const logisticsAssignment = db.getLogisticsAssignmentById(order.logisticsAssignmentId);
    if (!logisticsAssignment) {
      throw new NotFoundError(
        `Logistics Assignment '${order.logisticsAssignmentId}' not found for Order '${order.publicId}'.`
      );
    }

    const now = new Date().toISOString();
    const snapshotId = generateInternalId('ops');
    const snapshotPublicId = generateBusinessId('AB-OPS');

    const product = db.getProductById(supplierAssignment.productId);
    const productName = product ? product.name : 'AquaBloom Pure Aluminum Spring Water';

    // 4. Construct complete, authoritative, and immutable snapshot
    const snapshot: OrderPricingSnapshot = {
      id: snapshotId,
      publicId: snapshotPublicId,
      orderId: order.id,
      orderPublicId: order.publicId,
      orderReference: order.orderReference,

      currency: 'INR',
      contractedQuantity: pricingResult.contractedQuantity,

      productPrice: {
        unitPriceMinor: pricingResult.productUnitPriceMinor,
        unitPriceFormatted: pricingResult.productUnitPriceFormatted,
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
        taxComponents: (pricingResult.taxes.taxComponents || []).map((c) => ({
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

      // Authoritative versions frozen at order freeze
      productPricingVersion: {
        productId: supplierAssignment.productId,
        productPublicId: supplierAssignment.productPublicId,
        productName,
        productVersionId: supplierAssignment.productVersionId,
        productVersionNumber: supplierAssignment.productVersionNumber,
        unitCustomerFacingPriceMinor: pricingResult.productUnitPriceMinor,
        unitCustomerFacingPriceFormatted: pricingResult.productUnitPriceFormatted,
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
        taxEngineVersion: (pricingResult.taxes as any).taxEngineVersion || 'GST_IN_V1',
        jurisdiction: {
          originState: pricingResult.taxes.jurisdiction.originState,
          destinationState: pricingResult.taxes.jurisdiction.destinationState,
          isInterState: pricingResult.taxes.jurisdiction.isInterState,
        },
        taxComponents: (pricingResult.taxes.taxComponents || []).map((c) => ({
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

      // Backward-compatible flattened properties
      unitPriceMinor: pricingResult.productUnitPriceMinor,
      unitPriceFormatted: pricingResult.productUnitPriceFormatted,
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
      taxComponents: (pricingResult.taxes.taxComponents || []).map((c) => ({
        taxType: c.taxType,
        ratePercentage: c.ratePercentage,
        taxableAmountMinor: c.taxableAmountMinor,
        taxAmountMinor: c.taxAmountMinor,
        taxableAmountFormatted: c.taxableAmountFormatted,
        taxAmountFormatted: c.taxAmountFormatted,
      })),
      formulaNote: pricingResult.safeguards.formulaNote,
    };

    // 5. Persist snapshot
    db.saveOrderPricingSnapshot(snapshot);

    // 6. Update Order with snapshot link
    order.pricing = snapshot;
    order.pricingSnapshotId = snapshot.id;
    db.saveOrder(order);

    // 7. Dispatch audit event
    eventDispatcher.dispatch({
      id: generateInternalId('evt'),
      eventType: 'ORDER_PRICING_SNAPSHOT_FROZEN',
      severity: 'INFO',
      category: 'AUDIT',
      title: 'Order Pricing Snapshot Frozen',
      description: `Immutable pricing snapshot '${snapshot.publicId}' frozen for Order '${order.publicId}'. Authoritative Grand Total: ${snapshot.grandTotal.amountFormatted}`,
      actorId: actor.id,
      actorRole: actor.role,
      actorPublicId: actor.publicAccountId,
      resourceType: 'ORDER_PRICING_SNAPSHOT',
      resourceId: snapshot.id,
      metadata: {
        snapshotPublicId: snapshot.publicId,
        orderPublicId: order.publicId,
        grandTotalMinor: snapshot.grandTotal.amountMinor,
        currency: snapshot.currency,
        frozenAt: now,
      },
      timestamp: now,
    });

    return deepFreeze(JSON.parse(JSON.stringify(snapshot)));
  }

  /**
   * Retrieves an Order Pricing Snapshot by order or snapshot ID, verifying counterparty isolation.
   */
  public static getSnapshot(
    orderIdOrPublicId: string,
    actor: User
  ): OrderPricingSnapshot {
    const order = db.getOrderById(orderIdOrPublicId);
    let snapshot: OrderPricingSnapshot | undefined;

    if (order) {
      snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    } else {
      snapshot = db.getOrderPricingSnapshotById(orderIdOrPublicId);
    }

    if (!snapshot) {
      throw new NotFoundError(
        `Order Pricing Snapshot not found for identifier '${orderIdOrPublicId}'.`
      );
    }

    const relatedOrder = order || db.getOrderById(snapshot.orderId);
    if (!relatedOrder) {
      throw new NotFoundError(`Underlying Order for snapshot '${snapshot.publicId}' not found.`);
    }

    PaymentReadinessAuthorizationService.assertCanAccessSnapshot(snapshot, relatedOrder, actor);
    return deepFreeze(JSON.parse(JSON.stringify(snapshot)));
  }
}

/**
 * Service managing Payment Readiness records and authoritative payment resolution
 */
export class PaymentReadinessService {
  private static inFlightAssessments: Map<string, Promise<OrderPaymentReadiness>> = new Map();

  /**
   * Assesses and establishes the Payment Readiness record for an Order asynchronously.
   */
  public static async assessPaymentReadiness(
    orderIdOrPublicId: string,
    actor: User
  ): Promise<OrderPaymentReadiness> {
    const existingPromise = PaymentReadinessService.inFlightAssessments.get(orderIdOrPublicId);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async () => {
      return PaymentReadinessService.assessPaymentReadinessSync(orderIdOrPublicId, actor);
    })();

    PaymentReadinessService.inFlightAssessments.set(orderIdOrPublicId, promise);
    try {
      return await promise;
    } finally {
      PaymentReadinessService.inFlightAssessments.delete(orderIdOrPublicId);
    }
  }

  /**
   * Synchronous core to create and persist an OrderPaymentReadiness record.
   */
  public static assessPaymentReadinessSync(
    orderIdOrPublicId: string,
    actor: User
  ): OrderPaymentReadiness {
    const order = db.getOrderById(orderIdOrPublicId);
    if (!order) {
      throw new NotFoundError(`Order '${orderIdOrPublicId}' not found.`);
    }

    // 1. Idempotency: Return existing readiness if already created
    const existingReadiness = db.getOrderPaymentReadinessByOrderId(order.id);
    if (existingReadiness) {
      PaymentReadinessAuthorizationService.assertCanAccessPaymentReadiness(existingReadiness, actor);
      return deepFreeze(JSON.parse(JSON.stringify(existingReadiness)));
    }

    // 2. Ensure snapshot is frozen
    let snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    if (!snapshot) {
      snapshot = OrderPricingSnapshotEngine.freezeSnapshotSync(order.id, actor);
    } else {
      PaymentReadinessAuthorizationService.assertCanAccessSnapshot(snapshot, order, actor);
    }

    const now = new Date().toISOString();
    const readinessId = generateInternalId('opr');
    const readinessPublicId = generateBusinessId('AB-OPR');

    // 3. Create Payment Readiness Record
    const record: OrderPaymentReadiness = {
      id: readinessId,
      publicId: readinessPublicId,
      orderId: order.id,
      orderPublicId: order.publicId,
      orderReference: order.orderReference,

      advertiserId: order.advertiserId,
      advertiserPublicId: order.advertiserPublicId,

      amount: {
        amountMinor: snapshot.grandTotal.amountMinor,
        amountFormatted: snapshot.grandTotal.amountFormatted,
      },
      currency: 'INR',

      status: 'READY_FOR_PAYMENT',

      snapshotReference: {
        snapshotId: snapshot.id,
        snapshotPublicId: snapshot.publicId,
      },

      readinessTimestamp: now,

      boundaries: {
        paymentInitiated: false,
        paymentCompleted: false,
      },

      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
    };

    // 4. Persist Payment Readiness
    db.saveOrderPaymentReadiness(record);

    // 5. Update Order link
    order.paymentReadinessId = record.id;
    db.saveOrder(order);

    // 6. Dispatch event
    eventDispatcher.dispatch({
      id: generateInternalId('evt'),
      eventType: 'ORDER_PAYMENT_READINESS_ESTABLISHED',
      severity: 'INFO',
      category: 'AUDIT',
      title: 'Order Payment Readiness Established',
      description: `Order '${order.publicId}' is READY_FOR_PAYMENT with authoritative amount ${record.amount.amountFormatted}.`,
      actorId: actor.id,
      actorRole: actor.role,
      actorPublicId: actor.publicAccountId,
      resourceType: 'ORDER_PAYMENT_READINESS',
      resourceId: record.id,
      metadata: {
        readinessPublicId: record.publicId,
        orderPublicId: order.publicId,
        amountMinor: record.amount.amountMinor,
        currency: record.currency,
        snapshotPublicId: snapshot.publicId,
      },
      timestamp: now,
    });

    return deepFreeze(JSON.parse(JSON.stringify(record)));
  }

  /**
   * Retrieves the Payment Readiness record by order or readiness ID.
   */
  public static getPaymentReadiness(
    orderIdOrPublicId: string,
    actor: User
  ): OrderPaymentReadiness {
    const order = db.getOrderById(orderIdOrPublicId);
    let record: OrderPaymentReadiness | undefined;

    if (order) {
      record = db.getOrderPaymentReadinessByOrderId(order.id);
    } else {
      record = db.getOrderPaymentReadinessById(orderIdOrPublicId);
    }

    if (!record) {
      throw new NotFoundError(
        `Payment Readiness record not found for identifier '${orderIdOrPublicId}'.`
      );
    }

    PaymentReadinessAuthorizationService.assertCanAccessPaymentReadiness(record, actor);
    return deepFreeze(JSON.parse(JSON.stringify(record)));
  }

  /**
   * Authoritative resolution of the payment amount.
   * CRITICAL REQUIREMENT (Step 11C Section 3):
   * "The future payment system must use: OrderPricingSnapshot.grandTotal
   * Never trust an amount supplied by the browser.
   * Never recalculate a different amount during payment."
   */
  public static getAuthoritativePaymentAmount(
    orderIdOrPublicId: string,
    actor: User
  ): {
    amountMinor: number;
    amountFormatted: string;
    currency: 'INR';
    snapshotId: string;
    snapshotPublicId: string;
    orderId: string;
    orderPublicId: string;
    isFrozen: true;
  } {
    const snapshot = OrderPricingSnapshotEngine.getSnapshot(orderIdOrPublicId, actor);
    return {
      amountMinor: snapshot.grandTotal.amountMinor,
      amountFormatted: snapshot.grandTotal.amountFormatted,
      currency: 'INR',
      snapshotId: snapshot.id,
      snapshotPublicId: snapshot.publicId,
      orderId: snapshot.orderId,
      orderPublicId: snapshot.orderPublicId,
      isFrozen: true,
    };
  }

  /**
   * Safe Advertiser view of the Payment Readiness and breakdown
   */
  public static getAdvertiserPaymentView(
    orderIdOrPublicId: string,
    actor: User
  ): AdvertiserPaymentReadinessView {
    const readiness = PaymentReadinessService.getPaymentReadiness(orderIdOrPublicId, actor);
    const snapshot = OrderPricingSnapshotEngine.getSnapshot(readiness.orderId, actor);

    return {
      paymentReadinessId: readiness.id,
      publicId: readiness.publicId,
      orderPublicId: readiness.orderPublicId,
      orderReference: readiness.orderReference,
      status: readiness.status,
      amountMinor: readiness.amount.amountMinor,
      amountFormatted: readiness.amount.amountFormatted,
      currency: readiness.currency,
      pricingSnapshotPublicId: readiness.snapshotReference.snapshotPublicId,
      breakdown: {
        productPriceTotalFormatted: snapshot.productPrice.productPriceTotalFormatted,
        logisticsCostTotalFormatted: snapshot.logisticsCost.logisticsCostTotalFormatted,
        taxableAmountFormatted: snapshot.taxableAmount.taxableAmountFormatted,
        totalTaxFormatted: snapshot.taxes.totalTaxFormatted,
        grandTotalFormatted: snapshot.grandTotal.amountFormatted,
        taxes: snapshot.taxes.taxComponents.map((t) => ({
          taxType: t.taxType,
          ratePercentage: t.ratePercentage,
          taxAmountFormatted: t.taxAmountFormatted,
        })),
      },
      readinessTimestamp: readiness.readinessTimestamp,
    };
  }
}
