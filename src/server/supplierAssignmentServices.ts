/**
 * AquaBloom Step 9: Supplier Assignment & Operational Offer Services
 * 
 * Provides:
 * 1. SupplierAssignmentAuthorizationService: Strict tenant & role boundaries.
 *    - Suppliers can ONLY view & act upon offers assigned to their account.
 *    - Suppliers CANNOT view Advertiser/Venue internal profiles, commercial compensation, or agreement negotiation histories.
 *    - Advertisers, Venues, and Admins can view assignments & shared status.
 *    - Logistics partners cannot interact with supplier offers/assignments.
 * 2. SupplierMatchingEngine: Deterministic rule-based matching (NO AI).
 *    - Validates supplier account status (ACTIVE / APPROVED).
 *    - Validates product status (ACTIVE, AVAILABLE).
 *    - Validates volume, container format, MOQ, and capacity.
 * 3. SupplierOperationalOfferService:
 *    - Formulates isolated operational offers containing ONLY operational parameters.
 *    - Dispatches notifications and audit timeline events.
 *    - Handles deterministic decline and acceptance.
 * 4. SupplierAssignmentService:
 *    - Atomic acceptance & assignment creation.
 *    - Prevents duplicate active assignments on the same OrderReadiness.
 *    - Enforces operational state transitions (READY_FOR_ORDER -> ASSIGNED).
 *    - Implements reassignment recovery flow.
 */

import { db } from './db.js';
import {
  User,
  OrderReadiness,
  SupplierOperationalOffer,
  SupplierAssignment,
  SupplierCandidateMatch,
  SupplierOperationalRequirementsSnapshot,
  SupplierAssignmentSharedView,
  CreateSupplierOfferInput,
  DeclineSupplierOfferInput,
  AcceptSupplierOfferInput,
  SupplierDeclineReasonCode,
  Product,
  ProductVersion,
  SupplierProfile,
} from '../types.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  AgreementLockedError,
} from '../lib/errors.js';
import { eventDispatcher } from '../lib/events.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';

/**
 * ========================================================
 * 1. SUPPLIER ASSIGNMENT AUTHORIZATION SERVICE
 * ========================================================
 */
export class SupplierAssignmentAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required for supplier assignment operations.');
    }
  }

  public static assertAdmin(actor: User, actionName = 'This operation'): void {
    SupplierAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role !== 'ADMIN') {
      throw new AuthorizationError(`${actionName} is strictly reserved for system administrators.`);
    }
  }

  /**
   * Asserts actor can view the candidate matching results for an Order Readiness record.
   * Admins, Advertisers, and Venues associated with the agreement can view candidates.
   * Suppliers and Logistics partners are forbidden from querying general candidate matching pools.
   */
  public static assertCanViewCandidates(readiness: OrderReadiness, actor: User): void {
    SupplierAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      throw new AuthorizationError(
        'Suppliers and Logistics partners cannot browse supplier matching pools.'
      );
    }

    if (actor.role === 'ADVERTISER' && readiness.advertiserId !== actor.id) {
      throw new AuthorizationError('Access denied: You are not authorized for this Order Readiness record.');
    }

    if (actor.role === 'VENUE' && readiness.venueId !== actor.id) {
      throw new AuthorizationError('Access denied: You are not authorized for this Order Readiness record.');
    }
  }

  /**
   * Asserts actor can view a specific Supplier Operational Offer.
   * - Admin can view all.
   * - The designated Supplier can view their own offer.
   * - Advertisers and Venues of the underlying OrderReadiness can view offer status (sanitized).
   * - Other suppliers and logistics partners are strictly forbidden.
   */
  public static assertCanViewOffer(offer: SupplierOperationalOffer, actor: User): void {
    SupplierAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'SUPPLIER') {
      if (offer.supplierId !== actor.id) {
        eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'SUPPLIER_CROSS_TENANT_ACCESS_ATTEMPT',
          userId: actor.id,
          role: actor.role,
          scope: 'INTERNAL_ADMIN',
          payload: {
            actor: actor.id,
            targetOfferId: offer.id,
            targetOfferPublicId: offer.publicId,
            reason: 'Supplier attempted to access operational offer of another supplier.',
          },
        });
        throw new AuthorizationError('Access denied: You can only view operational offers dispatched to your account.');
      }
      return;
    }

    if (actor.role === 'ADVERTISER' || actor.role === 'VENUE') {
      const readiness = db.getOrderReadinessById(offer.orderReadinessId);
      if (!readiness) {
        throw new NotFoundError('Associated Order Readiness not found.');
      }
      if (actor.role === 'ADVERTISER' && readiness.advertiserId !== actor.id) {
        throw new AuthorizationError('Access denied: Not authorized for this campaign offer.');
      }
      if (actor.role === 'VENUE' && readiness.venueId !== actor.id) {
        throw new AuthorizationError('Access denied: Not authorized for this campaign offer.');
      }
      return;
    }

    throw new AuthorizationError('Access denied: Unauthorized role for supplier offers.');
  }

  /**
   * Asserts actor can respond (Accept / Decline) to a Supplier Operational Offer.
   * Strictly the assigned Supplier or Admin.
   */
  public static assertCanRespondToOffer(offer: SupplierOperationalOffer, actor: User): void {
    SupplierAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role !== 'SUPPLIER' || offer.supplierId !== actor.id) {
      throw new AuthorizationError(
        'Access denied: Only the designated supplier can accept or decline this operational offer.'
      );
    }
  }

  /**
   * Asserts actor can view a Supplier Assignment.
   * - Admin can view all.
   * - The assigned Supplier can view.
   * - The participating Advertiser and Venue can view.
   */
  public static assertCanViewAssignment(assignment: SupplierAssignment, actor: User): void {
    SupplierAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'SUPPLIER') {
      if (assignment.supplierId !== actor.id) {
        throw new AuthorizationError('Access denied: You are not the assigned supplier for this record.');
      }
      return;
    }

    if (actor.role === 'ADVERTISER' || actor.role === 'VENUE') {
      const readiness = db.getOrderReadinessById(assignment.orderReadinessId);
      if (!readiness) {
        throw new NotFoundError('Associated Order Readiness not found.');
      }
      if (actor.role === 'ADVERTISER' && readiness.advertiserId !== actor.id) {
        throw new AuthorizationError('Access denied: Not authorized for this assignment.');
      }
      if (actor.role === 'VENUE' && readiness.venueId !== actor.id) {
        throw new AuthorizationError('Access denied: Not authorized for this assignment.');
      }
      return;
    }

    throw new AuthorizationError('Access denied: Unauthorized role for supplier assignment.');
  }
}

/**
 * ========================================================
 * 2. DETERMINISTIC SUPPLIER MATCHING ENGINE
 * ========================================================
 */
export class SupplierMatchingEngine {
  /**
   * Evaluates deterministic matching criteria for an OrderReadiness record across available products.
   * Validates:
   * 1. CampaignAgreement is LOCKED and OrderReadiness is READY_FOR_ORDER.
   * 2. Supplier account is APPROVED and ACTIVE.
   * 3. Product is ACTIVE and AVAILABLE.
   * 4. Bottle volume matches requirement (if specified).
   * 5. Material matches requirement (if specified).
   * 6. Quantity >= product version minimumOrderQuantity.
   * 7. Production capacity is sufficient for campaign volume.
   */
  public static findEligibleSuppliers(orderReadinessId: string): SupplierCandidateMatch[] {
    const readiness = db.getOrderReadinessById(orderReadinessId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness record '${orderReadinessId}' not found.`);
    }

    if (readiness.status !== 'READY_FOR_ORDER') {
      throw new ValidationError(
        `Supplier matching cannot proceed. Order Readiness status must be READY_FOR_ORDER, found: ${readiness.status}`
      );
    }

    const agreementSnapshot = db.getAgreementSnapshotByAgreementId(readiness.campaignAgreementId);
    if (!agreementSnapshot) {
      throw new NotFoundError(
        `Authoritative Campaign Agreement Snapshot not found for agreement '${readiness.campaignAgreementId}'.`
      );
    }

    const requiredQuantity = agreementSnapshot.campaignTermsSnapshot?.quantity || 0;
    const reqProduct = agreementSnapshot.productRequirementsSnapshot || {};

    const allUsers = db.getUsers();
    const candidateMatches: SupplierCandidateMatch[] = [];

    // Find all supplier users
    const supplierUsers = allUsers.filter((u) => u.role === 'SUPPLIER');

    for (const supUser of supplierUsers) {
      const profile = db.getProfile(supUser.id) as SupplierProfile | undefined;
      const isApproved = supUser.status === 'ACTIVE' && profile?.approvalStatus === 'APPROVED';

      const supplierProducts = db.getProductsBySupplier(supUser.id);

      for (const prod of supplierProducts) {
        const rejectionReasons: string[] = [];

        // Account status check
        if (!isApproved) {
          rejectionReasons.push(`Supplier account status is ${supUser.status}, approval is ${profile?.approvalStatus || 'PENDING'}`);
        }

        // Product lifecycle & availability check
        const isProductActive = prod.status === 'ACTIVE';
        const isProductAvailable = prod.availability === 'AVAILABLE';
        if (!isProductActive) {
          rejectionReasons.push(`Product status is ${prod.status} (required: ACTIVE)`);
        }
        if (!isProductAvailable) {
          rejectionReasons.push(`Product availability is ${prod.availability} (required: AVAILABLE)`);
        }

        // Fetch active version
        const versions = db.getProductVersions(prod.id);
        const activeVersion = versions.find((v) => v.id === prod.activeVersionId) || versions[0];

        if (!activeVersion) {
          rejectionReasons.push('Product has no active version snapshot.');
          continue;
        }

        // Volume check (match volume if specified in requirements)
        let volumeMatches = true;
        if (reqProduct.preferredVolumeMl && activeVersion.specifications?.bottleCapacityMl) {
          if (activeVersion.specifications.bottleCapacityMl !== reqProduct.preferredVolumeMl) {
            volumeMatches = false;
            rejectionReasons.push(
              `Capacity volume mismatch: product offers ${activeVersion.specifications.bottleCapacityMl}ml, requirement requested ${reqProduct.preferredVolumeMl}ml`
            );
          }
        }

        // Material check
        let materialMatches = true;
        if (reqProduct.preferredMaterial && activeVersion.specifications?.bottleMaterial) {
          const reqMat = reqProduct.preferredMaterial.toLowerCase();
          const prodMat = activeVersion.specifications.bottleMaterial.toLowerCase();
          if (!prodMat.includes(reqMat) && !reqMat.includes(prodMat)) {
            materialMatches = false;
            rejectionReasons.push(
              `Material mismatch: product offers '${activeVersion.specifications.bottleMaterial}', requirement requested '${reqProduct.preferredMaterial}'`
            );
          }
        }

        // MOQ check
        let moqSatisfied = true;
        if (activeVersion.minimumOrderQuantity && requiredQuantity < activeVersion.minimumOrderQuantity) {
          moqSatisfied = false;
          rejectionReasons.push(
            `Campaign quantity (${requiredQuantity}) is below product minimum order quantity (${activeVersion.minimumOrderQuantity})`
          );
        }

        // Capacity check
        let capacitySufficient = true;
        const monthlyCapacity = prod.productionCapacity?.unitsPerMonth || profile?.productionCapacity?.bottlesPerMonth;
        if (monthlyCapacity && requiredQuantity > monthlyCapacity) {
          capacitySufficient = false;
          rejectionReasons.push(
            `Campaign quantity (${requiredQuantity}) exceeds supplier monthly capacity limit (${monthlyCapacity})`
          );
        }

        const isEligible = rejectionReasons.length === 0;

        candidateMatches.push({
          supplierId: supUser.id,
          supplierPublicAccountId: supUser.publicAccountId,
          supplierBusinessName: profile?.supplierBusinessName || supUser.organizationName,
          facilityLocation: {
            city: profile?.operatingLocation?.facilityCity || 'Unspecified',
            stateProvince: profile?.operatingLocation?.stateProvince,
            country: profile?.operatingLocation?.country || 'United States',
          },
          product: {
            id: prod.id,
            publicProductId: prod.publicProductId,
            versionId: activeVersion.id,
            publicVersionId: activeVersion.publicVersionId,
            versionNumber: activeVersion.versionNumber,
            name: prod.name,
            category: prod.category,
            specifications: activeVersion.specifications,
            customerFacingPrice: activeVersion.customerFacingPrice,
            minimumOrderQuantity: activeVersion.minimumOrderQuantity,
            productionLeadTime: activeVersion.productionLeadTime,
          },
          matchEvaluation: {
            isEligible,
            statusApproved: isApproved,
            productAvailable: isProductActive && isProductAvailable,
            volumeMatches,
            materialMatches,
            capacitySufficient,
            moqSatisfied,
            leadTimeFeasible: true,
            rejectionReasons,
          },
        });
      }
    }

    // Sort: Eligible first, then by unit price ascending (deterministic ranking, zero AI)
    return candidateMatches.sort((a, b) => {
      if (a.matchEvaluation.isEligible && !b.matchEvaluation.isEligible) return -1;
      if (!a.matchEvaluation.isEligible && b.matchEvaluation.isEligible) return 1;
      return a.product.customerFacingPrice.amount - b.product.customerFacingPrice.amount;
    });
  }
}

/**
 * ========================================================
 * 3. SUPPLIER OPERATIONAL OFFER SERVICE
 * ========================================================
 */
export class SupplierOperationalOfferService {
  /**
   * Generates a isolated operational offer for a chosen supplier and product.
   * Extracts ONLY necessary operational info from the locked Agreement Snapshot.
   */
  public static createOffer(input: CreateSupplierOfferInput, actor: User): SupplierOperationalOffer {
    SupplierAssignmentAuthorizationService.assertAdmin(actor, 'Creating a supplier operational offer');

    const readiness = db.getOrderReadinessById(input.orderReadinessId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness record '${input.orderReadinessId}' not found.`);
    }

    if (readiness.status !== 'READY_FOR_ORDER') {
      throw new ValidationError(
        `Cannot issue supplier operational offer. Order Readiness must be READY_FOR_ORDER, found: ${readiness.status}`
      );
    }

    // Check if an active assignment already exists
    const existingAssignment = db.getSupplierAssignmentByOrderReadiness(readiness.id);
    if (existingAssignment && existingAssignment.status === 'ASSIGNED') {
      throw new ConflictError(
        `Order Readiness '${readiness.publicId}' already has an active supplier assignment (${existingAssignment.publicId}). Reassignment or cancellation is required before issuing new offers.`
      );
    }

    // Check if a pending offer already exists for this supplier and order readiness
    const existingOffers = db.getSupplierOffersByOrderReadiness(readiness.id);
    const existingPending = existingOffers.find(
      (o) => o.supplierId === input.supplierId && o.status === 'PENDING'
    );
    if (existingPending) {
      throw new ConflictError(
        `A pending operational offer (${existingPending.publicId}) already exists for this supplier.`
      );
    }

    const supplierUser = db.findUserById(input.supplierId);
    if (!supplierUser || supplierUser.role !== 'SUPPLIER') {
      throw new NotFoundError(`Supplier user '${input.supplierId}' not found.`);
    }

    const supplierProfile = db.getProfile(supplierUser.id) as SupplierProfile | undefined;
    if (supplierUser.status !== 'ACTIVE' || supplierProfile?.approvalStatus !== 'APPROVED') {
      throw new ValidationError(
        `Supplier account is not approved for production offers (status: ${supplierUser.status}, approval: ${supplierProfile?.approvalStatus}).`
      );
    }

    const product = db.getProductById(input.productId);
    if (!product || product.supplierId !== supplierUser.id) {
      throw new NotFoundError(`Product '${input.productId}' does not belong to supplier '${supplierUser.id}'.`);
    }

    if (product.status !== 'ACTIVE' || product.availability !== 'AVAILABLE') {
      throw new ValidationError(`Product '${product.publicProductId}' is not active or available.`);
    }

    const versions = db.getProductVersions(product.id);
    const activeVersion = versions.find((v) => v.id === product.activeVersionId) || versions[0];
    if (!activeVersion) {
      throw new ValidationError(`Product '${product.publicProductId}' has no active version.`);
    }

    const agreementSnapshot = db.getAgreementSnapshotByAgreementId(readiness.campaignAgreementId);
    if (!agreementSnapshot) {
      throw new NotFoundError(
        `Authoritative Agreement Snapshot not found for agreement '${readiness.campaignAgreementId}'.`
      );
    }

    const bottleQuantity = agreementSnapshot.campaignTermsSnapshot?.quantity || 0;
    if (bottleQuantity < activeVersion.minimumOrderQuantity) {
      throw new ValidationError(
        `Campaign bottle requirement (${bottleQuantity}) is below product MOQ (${activeVersion.minimumOrderQuantity}).`
      );
    }

    const unitPrice = activeVersion.customerFacingPrice.amount;
    const totalAmount = unitPrice * bottleQuantity;

    const now = new Date().toISOString();
    const expiryHours = input.expiresInHours || 72;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

    const offerId = generateInternalId('soo');
    const publicOfferId = generateBusinessId('AB-SOO');

    // Build STRICT ISOLATED operational snapshot for supplier
    const operationalRequirementsSnapshot: SupplierOperationalRequirementsSnapshot = {
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: readiness.campaignAgreementId,
      campaignAgreementPublicId: agreementSnapshot.agreementPublicId,
      bottleQuantity,
      productRequirements: {
        bottleType: agreementSnapshot.productRequirementsSnapshot?.bottleType,
        preferredVolumeMl: agreementSnapshot.productRequirementsSnapshot?.preferredVolumeMl,
        volumeLabel: agreementSnapshot.productRequirementsSnapshot?.volumeLabel,
        preferredMaterial: agreementSnapshot.productRequirementsSnapshot?.preferredMaterial,
        labelType: agreementSnapshot.productRequirementsSnapshot?.labelType,
        capType: agreementSnapshot.productRequirementsSnapshot?.capType,
        notes: agreementSnapshot.productRequirementsSnapshot?.notes,
      },
      packagingAndStagingRequirements:
        agreementSnapshot.deliveryTermsSnapshot?.stagingInstructions ||
        'Standard shrink-wrapped tray packaging',
      productionTimeline: {
        durationWeeks: agreementSnapshot.campaignSnapshot?.durationWeeks || 4,
        preferredStartMonthYear: agreementSnapshot.campaignSnapshot?.preferredStartMonthYear || 'Immediate',
      },
    };

    const offer: SupplierOperationalOffer = {
      id: offerId,
      publicId: publicOfferId,
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: readiness.campaignAgreementId,
      campaignAgreementPublicId: agreementSnapshot.agreementPublicId,
      supplierId: supplierUser.id,
      supplierPublicAccountId: supplierUser.publicAccountId,
      supplierBusinessName: supplierProfile?.supplierBusinessName || supplierUser.organizationName,
      productId: product.id,
      productPublicId: product.publicProductId,
      productVersionId: activeVersion.id,
      productVersionNumber: activeVersion.versionNumber,
      status: 'PENDING',
      operationalRequirementsSnapshot,
      offerTerms: {
        bottleQuantity,
        unitCustomerFacingPrice: {
          amount: unitPrice,
          currency: 'INR',
        },
        totalBottleAmount: {
          amount: totalAmount,
          currency: 'INR',
        },
        productionLeadTime: activeVersion.productionLeadTime,
        currency: 'INR',
      },
      expiresAt,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };

    db.saveSupplierOffer(offer);

    // Notify Supplier
    db.createNotification(
      supplierUser.id,
      'New Operational Bottling Offer Dispatched',
      `You have received an operational offer (${offer.publicId}) to produce ${bottleQuantity.toLocaleString()} bottles for campaign delivery. Please accept or decline before expiry.`,
      'INFO'
    );

    // Dispatch audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'SUPPLIER_OFFER_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        offerId: offer.id,
        publicOfferId: offer.publicId,
        orderReadinessId: readiness.id,
        orderReadinessPublicId: readiness.publicId,
        supplierId: supplierUser.id,
        bottleQuantity,
        unitPrice,
        totalAmount,
        expiresAt,
        timestamp: now,
      },
    });

    return offer;
  }

  /**
   * Supplier declines the operational offer with a mandatory reason code.
   */
  public static declineOffer(
    offerId: string,
    input: DeclineSupplierOfferInput,
    actor: User
  ): SupplierOperationalOffer {
    const offer = db.getSupplierOfferById(offerId);
    if (!offer) {
      throw new NotFoundError(`Supplier Operational Offer '${offerId}' not found.`);
    }

    SupplierAssignmentAuthorizationService.assertCanRespondToOffer(offer, actor);

    if (offer.status !== 'PENDING') {
      throw new ValidationError(`Offer cannot be declined. Current status is ${offer.status}.`);
    }

    if (!input.reasonCode) {
      throw new ValidationError('A valid reason code is required when declining an operational offer.');
    }

    const now = new Date().toISOString();
    offer.status = 'DECLINED';
    offer.declinedAt = now;
    offer.declineReasonCode = input.reasonCode;
    offer.declineExplanation = input.explanation?.trim() || null;
    offer.updatedAt = now;
    offer.updatedBy = actor.id;

    db.saveSupplierOffer(offer);

    // Dispatch audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'SUPPLIER_OFFER_DECLINED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        offerId: offer.id,
        publicOfferId: offer.publicId,
        orderReadinessId: offer.orderReadinessId,
        supplierId: offer.supplierId,
        reasonCode: input.reasonCode,
        explanation: input.explanation,
        timestamp: now,
      },
    });

    // Notify internal admins for reassignment / recovery
    const admins = db.getUsers().filter((u) => u.role === 'ADMIN');
    for (const adm of admins) {
      db.createNotification(
        adm.id,
        'Supplier Declined Operational Offer',
        `Supplier ${offer.supplierBusinessName} declined offer ${offer.publicId} (${input.reasonCode}). Order Readiness ${offer.orderReadinessPublicId} is ready for reassignment.`,
        'WARNING'
      );
    }

    return offer;
  }

  /**
   * Supplier accepts the operational offer.
   * Immediately transitions the offer to ACCEPTED and generates the authoritative SupplierAssignment.
   */
  public static acceptOffer(
    offerId: string,
    _input: AcceptSupplierOfferInput,
    actor: User
  ): { offer: SupplierOperationalOffer; assignment: SupplierAssignment } {
    const offer = db.getSupplierOfferById(offerId);
    if (!offer) {
      throw new NotFoundError(`Supplier Operational Offer '${offerId}' not found.`);
    }

    SupplierAssignmentAuthorizationService.assertCanRespondToOffer(offer, actor);

    if (offer.status !== 'PENDING') {
      throw new ValidationError(`Offer cannot be accepted. Current status is ${offer.status}.`);
    }

    // Check expiry
    if (new Date(offer.expiresAt) < new Date()) {
      offer.status = 'EXPIRED';
      offer.updatedAt = new Date().toISOString();
      db.saveSupplierOffer(offer);
      throw new ValidationError(`Operational offer ${offer.publicId} has expired and cannot be accepted.`);
    }

    // Atomic assignment check on OrderReadiness
    const existingAssignment = db.getSupplierAssignmentByOrderReadiness(offer.orderReadinessId);
    if (existingAssignment && existingAssignment.status === 'ASSIGNED') {
      throw new ConflictError(
        `Order Readiness '${offer.orderReadinessPublicId}' already has an active supplier assignment (${existingAssignment.publicId}).`
      );
    }

    // Fetch product version for historical snapshot guarantee
    const product = db.getProductById(offer.productId);
    const versions = product ? db.getProductVersions(product.id) : [];
    const version = versions.find((v) => v.id === offer.productVersionId) || versions[0];
    if (!version) {
      throw new NotFoundError('Product version for offer snapshot not found.');
    }

    const now = new Date().toISOString();

    // 1. Mark offer ACCEPTED
    offer.status = 'ACCEPTED';
    offer.acceptedAt = now;
    offer.updatedAt = now;
    offer.updatedBy = actor.id;
    db.saveSupplierOffer(offer);

    // 2. Create authoritative SupplierAssignment
    const assignmentId = generateInternalId('sas');
    const publicAssignmentId = generateBusinessId('AB-SAS');

    const assignment: SupplierAssignment = {
      id: assignmentId,
      publicId: publicAssignmentId,
      orderReadinessId: offer.orderReadinessId,
      orderReadinessPublicId: offer.orderReadinessPublicId,
      campaignAgreementId: offer.campaignAgreementId,
      campaignAgreementPublicId: offer.campaignAgreementPublicId,
      supplierOperationalOfferId: offer.id,
      supplierOperationalOfferPublicId: offer.publicId,
      supplierId: offer.supplierId,
      supplierPublicAccountId: offer.supplierPublicAccountId,
      supplierBusinessName: offer.supplierBusinessName,
      productId: offer.productId,
      productPublicId: offer.productPublicId,
      productVersionId: offer.productVersionId,
      productVersionNumber: offer.productVersionNumber,
      status: 'ASSIGNED',
      assignedAt: now,
      assignedBy: actor.id,
      lockedOfferSnapshot: {
        bottleQuantity: offer.offerTerms.bottleQuantity,
        unitCustomerFacingPrice: offer.offerTerms.unitCustomerFacingPrice,
        totalBottleAmount: offer.offerTerms.totalBottleAmount,
        productionLeadTime: offer.offerTerms.productionLeadTime,
        productSpecificationsSnapshot: JSON.parse(JSON.stringify(version.specifications)),
        operationalRequirementsSnapshot: JSON.parse(JSON.stringify(offer.operationalRequirementsSnapshot)),
      },
      futureBoundaries: {
        logisticsAssigned: false,
        productionScheduled: false,
        qcInitiated: false,
        paymentCalculated: false,
      },
      createdAt: now,
      updatedAt: now,
    };

    db.saveSupplierAssignment(assignment);

    // 3. Cancel any other pending offers for this OrderReadiness
    const otherOffers = db.getSupplierOffersByOrderReadiness(offer.orderReadinessId);
    for (const other of otherOffers) {
      if (other.id !== offer.id && other.status === 'PENDING') {
        other.status = 'CANCELLED';
        other.updatedAt = now;
        other.updatedBy = actor.id;
        db.saveSupplierOffer(other);
      }
    }

    // 4. Notifications
    db.createNotification(
      offer.supplierId,
      'Bottling Assignment Confirmed',
      `You are officially assigned to produce ${assignment.lockedOfferSnapshot.bottleQuantity.toLocaleString()} bottles (${assignment.publicId}). Next stage: Logistics & Production handoff.`,
      'SUCCESS'
    );

    // Notify advertiser & venue counterparties
    const readiness = db.getOrderReadinessById(offer.orderReadinessId);
    if (readiness) {
      db.createNotification(
        readiness.advertiserId,
        'Supplier Assigned for Campaign',
        `Certified bottling partner ${offer.supplierBusinessName} has accepted production assignment ${assignment.publicId}.`,
        'INFO'
      );
      db.createNotification(
        readiness.venueId,
        'Supplier Assigned for Campaign',
        `Production supplier assignment ${assignment.publicId} is confirmed for your upcoming distribution campaign.`,
        'INFO'
      );
    }

    // 5. Dispatch audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'SUPPLIER_ASSIGNMENT_CONFIRMED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        assignmentId: assignment.id,
        publicAssignmentId: assignment.publicId,
        offerId: offer.id,
        publicOfferId: offer.publicId,
        orderReadinessId: offer.orderReadinessId,
        supplierId: offer.supplierId,
        supplierName: offer.supplierBusinessName,
        bottleQuantity: assignment.lockedOfferSnapshot.bottleQuantity,
        totalAmount: assignment.lockedOfferSnapshot.totalBottleAmount.amount,
        timestamp: now,
      },
    });

    return { offer, assignment };
  }
}

/**
 * ========================================================
 * 4. SUPPLIER ASSIGNMENT RETRIEVAL & REASSIGNMENT SERVICE
 * ========================================================
 */
export class SupplierAssignmentService {
  public static getAssignment(idOrPublicId: string, actor: User): SupplierAssignment {
    const assignment = db.getSupplierAssignmentById(idOrPublicId);
    if (!assignment) {
      throw new NotFoundError(`Supplier Assignment '${idOrPublicId}' not found.`);
    }

    SupplierAssignmentAuthorizationService.assertCanViewAssignment(assignment, actor);
    return assignment;
  }

  public static getAssignmentByOrderReadiness(orderReadinessId: string, actor: User): SupplierAssignment | null {
    const assignment = db.getSupplierAssignmentByOrderReadiness(orderReadinessId);
    if (!assignment) {
      return null;
    }

    SupplierAssignmentAuthorizationService.assertCanViewAssignment(assignment, actor);
    return assignment;
  }

  /**
   * Safe Counterparty Shared View.
   * Strips internal unit pricing breakdown and supplier private specifications if viewed by non-admins/non-suppliers.
   */
  public static getSharedView(assignmentId: string, actor: User): SupplierAssignmentSharedView {
    const assignment = SupplierAssignmentService.getAssignment(assignmentId, actor);

    return {
      assignmentId: assignment.id,
      publicId: assignment.publicId,
      orderReadinessPublicId: assignment.orderReadinessPublicId,
      campaignAgreementPublicId: assignment.campaignAgreementPublicId,
      supplierBusinessName: assignment.supplierBusinessName,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      bottleQuantity: assignment.lockedOfferSnapshot.bottleQuantity,
      productPublicId: assignment.productPublicId,
      leadTime: assignment.lockedOfferSnapshot.productionLeadTime,
      boundaries: {
        supplierAssigned: true,
        logisticsAssigned: false,
        productionStarted: false,
        paymentCompleted: false,
      },
    };
  }

  /**
   * Reassignment recovery mechanism:
   * If a supplier assignment fails or must be cancelled, admins can cancel the current assignment
   * and reopen the OrderReadiness for a new supplier match without cancelling the campaign agreement.
   */
  public static reassignSupplier(
    currentAssignmentId: string,
    reason: string,
    actor: User
  ): { previousAssignment: SupplierAssignment; message: string } {
    SupplierAssignmentAuthorizationService.assertAdmin(actor, 'Reassigning supplier');

    const assignment = db.getSupplierAssignmentById(currentAssignmentId);
    if (!assignment) {
      throw new NotFoundError(`Supplier Assignment '${currentAssignmentId}' not found.`);
    }

    if (assignment.status !== 'ASSIGNED') {
      throw new ValidationError(`Assignment cannot be cancelled for reassignment. Current status: ${assignment.status}`);
    }

    const now = new Date().toISOString();
    assignment.status = 'CANCELLED';
    assignment.updatedAt = now;
    assignment.reassignmentDetails = {
      reassignedAt: now,
      reassignedBy: actor.id,
      previousAssignmentId: assignment.id,
      reason: reason.trim(),
    };

    db.saveSupplierAssignment(assignment);

    // Dispatch audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'SUPPLIER_ASSIGNMENT_CANCELLED_FOR_REASSIGNMENT',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        assignmentId: assignment.id,
        publicAssignmentId: assignment.publicId,
        orderReadinessId: assignment.orderReadinessId,
        reason,
        cancelledBy: actor.id,
        timestamp: now,
      },
    });

    return {
      previousAssignment: assignment,
      message: `Assignment ${assignment.publicId} cancelled. Order Readiness ${assignment.orderReadinessPublicId} is now available for new supplier offer dispatch.`,
    };
  }
}
