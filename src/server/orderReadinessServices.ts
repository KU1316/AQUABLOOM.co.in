/**
 * AquaBloom Step 8: Order Readiness & Data Handoff Engine
 * 
 * Provides:
 * 1. OrderReadinessAuthorizationService (strict RBAC for Order Readiness)
 * 2. OrderReadinessValidationEngine (deterministic validation against CampaignAgreementSnapshot)
 * 3. DataHandoffService (controlled atomic extraction of downstream data without profile pollution)
 * 4. OrderReadinessService (order readiness orchestration, idempotency, lifecycle management)
 */

import { db } from './db.js';
import {
  User,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  OrderReadiness,
  OrderReadinessStatus,
  OrderReadinessValidationSummary,
  OrderReadinessValidationIssue,
  DownstreamOrderSnapshot,
  DataHandoff,
  OrderReadinessSharedView,
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
 * 1. ORDER READINESS AUTHORIZATION SERVICE
 * ========================================================
 */
export class OrderReadinessAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to access Order Readiness.');
    }
  }

  /**
   * Asserts actor can view order readiness status.
   * Advertiser and Venue can view their own agreement's readiness.
   * Admin can view all.
   * Suppliers and Logistics Partners are strictly forbidden.
   */
  public static assertCanView(readiness: OrderReadiness, actor: User): void {
    OrderReadinessAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    const now = new Date().toISOString();

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'ORDER_READINESS_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          orderReadinessId: readiness.id,
          orderReadinessPublicId: readiness.publicId,
          reason: 'Suppliers and Logistics Partners cannot view Order Readiness at this stage.',
        },
      });
      throw new AuthorizationError(
        'Access denied: Suppliers and Logistics Partners cannot view Order Readiness at this stage.'
      );
    }

    if (actor.role === 'ADVERTISER' && readiness.advertiserId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'ORDER_READINESS_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          orderReadinessId: readiness.id,
          orderReadinessPublicId: readiness.publicId,
          reason: 'Cross-tenant advertiser access attempted on Order Readiness.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to view this Order Readiness record.');
    }

    if (actor.role === 'VENUE' && readiness.venueId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'ORDER_READINESS_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          orderReadinessId: readiness.id,
          orderReadinessPublicId: readiness.publicId,
          reason: 'Cross-tenant venue access attempted on Order Readiness.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to view this Order Readiness record.');
    }
  }

  /**
   * Asserts actor can initiate or validate Order Readiness.
   * Can be initiated by Advertiser, Venue party, or Admin.
   */
  public static assertCanManage(agreement: CampaignAgreement, actor: User): void {
    OrderReadinessAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      throw new AuthorizationError(
        'Access denied: Suppliers and Logistics Partners cannot initiate Order Readiness.'
      );
    }

    if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
      throw new AuthorizationError('Access denied: You are not the Advertiser party for this Campaign Agreement.');
    }

    if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
      throw new AuthorizationError('Access denied: You are not the Venue party for this Campaign Agreement.');
    }
  }
}

/**
 * ========================================================
 * 2. ORDER READINESS VALIDATION ENGINE
 * ========================================================
 * Validates locked CampaignAgreementSnapshot for complete downstream readiness.
 * Does NOT inspect live editable profile data.
 * Does NOT assign supplier, logistics, or calculate final pricing.
 */
export class OrderReadinessValidationEngine {
  public static validate(
    agreement: CampaignAgreement,
    snapshot: CampaignAgreementSnapshot
  ): OrderReadinessValidationSummary {
    const issues: OrderReadinessValidationIssue[] = [];

    // 1. Campaign Exists Check
    const campaign = db.getCampaignById(agreement.campaignId);
    const campaignExists = Boolean(campaign);
    if (!campaignExists) {
      issues.push({
        code: 'CAMPAIGN_NOT_FOUND',
        field: 'campaignId',
        message: `Campaign '${agreement.campaignId}' was not found in database.`,
        blocking: true,
      });
    }

    // 2. Agreement is LOCKED Check
    const agreementIsLocked = agreement.status === 'LOCKED' && Boolean(agreement.lockedAt);
    if (!agreementIsLocked) {
      issues.push({
        code: 'AGREEMENT_NOT_LOCKED',
        field: 'agreement.status',
        message: 'Campaign Agreement is not in LOCKED status. Only locked agreements can achieve order readiness.',
        blocking: true,
      });
    }

    // 3. Snapshot exists check
    const snapshotExists = Boolean(snapshot && snapshot.id && snapshot.publicSnapshotId);
    if (!snapshotExists) {
      issues.push({
        code: 'SNAPSHOT_MISSING',
        field: 'snapshot',
        message: 'Authoritative locked Campaign Agreement Snapshot is missing.',
        blocking: true,
      });
    }

    // 4. Snapshot validity check
    let snapshotIsValid = false;
    if (snapshot) {
      const hasSourceRef = Boolean(snapshot.agreementId === agreement.id);
      const hasLockedBy = Boolean(snapshot.lockedBy);
      snapshotIsValid = hasSourceRef && hasLockedBy;
      if (!snapshotIsValid) {
        issues.push({
          code: 'SNAPSHOT_CORRUPTED',
          field: 'snapshot.agreementId',
          message: 'Campaign Agreement Snapshot integrity check failed (mismatched agreement ID or missing lock metadata).',
          blocking: true,
        });
      }
    }

    // 5. Advertiser party check
    const advertiserUser = db.findUserById(agreement.advertiserId);
    const advertiserExists = Boolean(
      advertiserUser &&
      snapshot?.advertiserSnapshot?.brandName &&
      snapshot?.advertiserSnapshot?.publicAccountId
    );
    if (!advertiserExists) {
      issues.push({
        code: 'ADVERTISER_PARTY_INVALID',
        field: 'advertiserSnapshot',
        message: 'Advertiser entity or locked brand snapshot details are incomplete.',
        blocking: true,
      });
    }

    // 6. Venue party check
    const venueUser = db.findUserById(agreement.venueId);
    const venueExists = Boolean(
      venueUser &&
      snapshot?.venueSnapshot?.venueName &&
      snapshot?.venueSnapshot?.publicAccountId
    );
    if (!venueExists) {
      issues.push({
        code: 'VENUE_PARTY_INVALID',
        field: 'venueSnapshot',
        message: 'Venue entity or locked venue snapshot details are incomplete.',
        blocking: true,
      });
    }

    // 7. Quantity check
    const quantity = snapshot?.campaignTermsSnapshot?.quantity;
    const quantityIsValid = typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0;
    if (!quantityIsValid) {
      issues.push({
        code: 'INVALID_CAMPAIGN_QUANTITY',
        field: 'campaignTermsSnapshot.quantity',
        message: `Campaign bottle quantity must be a positive integer, received: ${quantity}`,
        blocking: true,
      });
    }

    // 8. Duration check
    const duration = snapshot?.campaignTermsSnapshot?.duration;
    const durationValue = typeof duration?.value === 'number' ? duration.value : (duration as any)?.weeks;
    const durationIsValid = typeof durationValue === 'number' && durationValue > 0;
    if (!durationIsValid) {
      issues.push({
        code: 'INVALID_CAMPAIGN_DURATION',
        field: 'campaignTermsSnapshot.duration',
        message: 'Campaign duration must be specified and greater than 0.',
        blocking: true,
      });
    }

    // 9. Campaign dates/period check
    const startPeriod = snapshot?.campaignTermsSnapshot?.preferredStartPeriod;
    const campaignDatesPeriodValid = Boolean(
      startPeriod &&
      ((typeof (startPeriod as any).month === 'number' &&
        (startPeriod as any).month >= 1 &&
        (startPeriod as any).month <= 12 &&
        typeof (startPeriod as any).year === 'number' &&
        (startPeriod as any).year >= 2024) ||
       (typeof startPeriod.label === 'string' && startPeriod.label.trim().length > 0))
    );
    if (!campaignDatesPeriodValid) {
      issues.push({
        code: 'INVALID_START_PERIOD',
        field: 'campaignTermsSnapshot.preferredStartPeriod',
        message: 'Preferred campaign start period (month/year or label) is invalid or empty.',
        blocking: true,
      });
    }

    // 10. Product requirements check
    const productReqs = snapshot?.productRequirementsSnapshot;
    const productRequirementsValid = Boolean(
      productReqs &&
      (productReqs.preferredVolumeMl || productReqs.bottleType || productReqs.labelType || productReqs.notes || productReqs.volumeLabel)
    );
    if (!productRequirementsValid) {
      issues.push({
        code: 'PRODUCT_REQUIREMENTS_INCOMPLETE',
        field: 'productRequirementsSnapshot',
        message: 'Product specifications in locked agreement snapshot are empty or missing key parameters.',
        blocking: false, // Warning level if standard specs suffice
      });
    }

    // 11. Distribution requirements check
    const distReqs = snapshot?.distributionSnapshot;
    const distributionRequirementsValid = Boolean(
      distReqs &&
      (distReqs.placementDetails || (distReqs as any).distributionSchedule || (distReqs as any).venueAllocationPercentage !== undefined)
    );
    if (!distributionRequirementsValid) {
      issues.push({
        code: 'DISTRIBUTION_REQUIREMENTS_MISSING',
        field: 'distributionSnapshot',
        message: 'Distribution requirements schedule, placement details or allocation is missing in snapshot.',
        blocking: false,
      });
    }

    // 12. Placement requirements check
    const placementReqs = snapshot?.placementSnapshot?.placementRequirements;
    const placementRequirementsValid = Array.isArray(placementReqs) && placementReqs.length > 0;
    if (!placementRequirementsValid) {
      issues.push({
        code: 'PLACEMENT_REQUIREMENTS_MISSING',
        field: 'placementSnapshot.placementRequirements',
        message: 'At least one placement requirement must be specified in the agreement snapshot.',
        blocking: false,
      });
    }

    // 13. Commercial terms check
    const compTerms = snapshot?.compensationTermsSnapshot;
    const commercialTermsValid = Boolean(
      compTerms &&
      typeof compTerms.proposedPercentage === 'number' &&
      compTerms.proposedPercentage >= 0 &&
      compTerms.proposedPercentage <= 12.5 &&
      compTerms.maximumCapPercentage <= 12.5
    );
    if (!commercialTermsValid) {
      issues.push({
        code: 'COMMERCIAL_TERMS_INVALID',
        field: 'compensationTermsSnapshot',
        message: 'Commercial compensation terms exceed statutory 12.5% maximum cap or are invalid.',
        blocking: true,
      });
    }

    // 14. Responsibilities check
    const responsibilities = snapshot?.responsibilitiesSnapshot;
    const responsibilitiesValid = Boolean(
      responsibilities &&
      Array.isArray(responsibilities.advertiserResponsibilities) &&
      responsibilities.advertiserResponsibilities.length > 0 &&
      Array.isArray(responsibilities.venueResponsibilities) &&
      responsibilities.venueResponsibilities.length > 0 &&
      Array.isArray(responsibilities.aquaBloomResponsibilities) &&
      responsibilities.aquaBloomResponsibilities.length > 0
    );
    if (!responsibilitiesValid) {
      issues.push({
        code: 'RESPONSIBILITIES_INCOMPLETE',
        field: 'responsibilitiesSnapshot',
        message: 'Tri-party responsibilities must be fully populated for Advertiser, Venue, and AquaBloom.',
        blocking: true,
      });
    }

    // 15. Delivery terms check
    const deliveryTerms = snapshot?.deliveryTermsSnapshot;
    const deliveryTermsValid = Boolean(
      deliveryTerms &&
      deliveryTerms.stagingInstructions !== undefined &&
      deliveryTerms.specialHandling !== undefined
    );
    if (!deliveryTermsValid) {
      issues.push({
        code: 'DELIVERY_TERMS_MISSING',
        field: 'deliveryTermsSnapshot',
        message: 'Delivery staging or special handling parameters are missing.',
        blocking: true,
      });
    }

    const blockingIssues = issues.filter((i) => i.blocking);
    const warningIssues = issues.filter((i) => !i.blocking);

    return {
      isValid: blockingIssues.length === 0,
      checkedAt: new Date().toISOString(),
      blockingIssueCount: blockingIssues.length,
      warningIssueCount: warningIssues.length,
      issues,
      checksPerformed: {
        campaignExists,
        agreementIsLocked,
        snapshotExists,
        snapshotIsValid,
        advertiserExists,
        venueExists,
        quantityIsValid,
        durationIsValid,
        campaignDatesPeriodValid,
        productRequirementsValid,
        distributionRequirementsValid,
        placementRequirementsValid,
        commercialTermsValid,
        responsibilitiesValid,
        deliveryTermsValid,
      },
    };
  }
}

/**
 * ========================================================
 * 3. DATA HANDOFF SERVICE
 * ========================================================
 * Controlled, immutable payload transformation from locked snapshot
 * to the future Order Engine snapshot.
 */
export class DataHandoffService {
  /**
   * Generates the immutable DownstreamOrderSnapshot strictly from
   * the locked snapshot, discarding live mutable user profile data.
   */
  public static extractDownstreamOrderSnapshot(
    agreement: CampaignAgreement,
    snapshot: CampaignAgreementSnapshot
  ): DownstreamOrderSnapshot {
    return {
      campaign: {
        campaignId: agreement.campaignId,
        publicCampaignId: snapshot.campaignSnapshot.publicCampaignId,
        campaignName: snapshot.campaignSnapshot.campaignName,
        objective: snapshot.campaignSnapshot.objective,
        category: snapshot.campaignSnapshot.category,
        targetAudience: snapshot.campaignSnapshot.targetAudience,
        durationWeeks: snapshot.campaignSnapshot.durationWeeks,
        preferredStartMonthYear: snapshot.campaignSnapshot.preferredStartMonthYear,
      },
      venue: {
        venueId: agreement.venueId,
        publicAccountId: snapshot.venueSnapshot.publicAccountId,
        venueName: snapshot.venueSnapshot.venueName,
        venueType: snapshot.venueSnapshot.venueType,
        audienceCategory: snapshot.venueSnapshot.audienceCategory,
        locationCity: snapshot.venueSnapshot.locationCity,
        locationCountry: snapshot.venueSnapshot.locationCountry,
        placementRequirements: [...(snapshot.placementSnapshot?.placementRequirements || [])],
        distributionRequirements: JSON.parse(JSON.stringify(snapshot.distributionSnapshot || {})),
        venueResponsibilities: [...(snapshot.responsibilitiesSnapshot?.venueResponsibilities || [])],
      },
      advertiser: {
        advertiserId: agreement.advertiserId,
        publicAccountId: snapshot.advertiserSnapshot.publicAccountId,
        brandName: snapshot.advertiserSnapshot.brandName,
        advertiserResponsibilities: [...(snapshot.responsibilitiesSnapshot?.advertiserResponsibilities || [])],
      },
      productRequirements: {
        requiredBottleQuantity: snapshot.campaignTermsSnapshot.quantity,
        bottleType: snapshot.productRequirementsSnapshot?.bottleType,
        preferredVolumeMl: snapshot.productRequirementsSnapshot?.preferredVolumeMl,
        volumeLabel: snapshot.productRequirementsSnapshot?.volumeLabel,
        preferredMaterial: snapshot.productRequirementsSnapshot?.preferredMaterial,
        labelType: snapshot.productRequirementsSnapshot?.labelType,
        capType: snapshot.productRequirementsSnapshot?.capType,
        notes: snapshot.productRequirementsSnapshot?.notes,
      },
      distribution: {
        quantity: snapshot.campaignTermsSnapshot.quantity,
        distributionSchedule: (snapshot.distributionSnapshot as any)?.distributionSchedule || snapshot.distributionSnapshot?.estimatedDistributionPace,
        placementRequirements: [...(snapshot.placementSnapshot?.placementRequirements || [])],
        venueAllocation: snapshot.campaignTermsSnapshot.quantity,
      },
      collaboration: JSON.parse(JSON.stringify(snapshot.collaborationSnapshot || {})),
      qrRequirements: {
        customRedirectUrl: snapshot.qrRequirementsSnapshot?.customRedirectUrl,
        trackingEnabled: snapshot.qrRequirementsSnapshot?.trackingEnabled ?? true,
        status: 'CONFIGURED_FOR_PRODUCTION',
      },
      commercialTerms: {
        venueCompensationPercentage: snapshot.compensationTermsSnapshot.proposedPercentage,
        venueCompensationTermsDescription: snapshot.compensationTermsSnapshot.termsDescription,
        venueCompensationNotes: snapshot.compensationTermsSnapshot.notes,
        venueCompensationEligibleBaseDescription: snapshot.compensationTermsSnapshot.eligibleBaseDescription,
        venueCompensationStatutoryCapPercentage: snapshot.compensationTermsSnapshot.maximumCapPercentage,
        cancellationCutoffStage: 'PRODUCTION_START',
        cancellationTermsSummary: snapshot.cancellationTermsSnapshot.termsSummary,
        renewalType: 'EXPLICIT_APPROVAL_REQUIRED',
        renewalTermsSummary: snapshot.renewalTermsSnapshot.termsSummary,
        customConditions: snapshot.campaignTermsSnapshot.customConditions,
        importantConditions: [...(snapshot.campaignTermsSnapshot.importantConditions || [])],
      },
      boundaries: {
        finalPricingCalculated: false,
        supplierAssigned: false,
        logisticsAssigned: false,
        paymentCreated: false,
        productionStarted: false,
      },
    };
  }

  /**
   * Executes atomic data handoff with retry protection and status tracking.
   */
  public static executeHandoff(
    orderReadiness: OrderReadiness,
    snapshot: CampaignAgreementSnapshot,
    actor: User,
    idempotencyKey?: string
  ): DataHandoff {
    const existing = db.getDataHandoffByDestinationRef(orderReadiness.id);
    if (existing && existing.status === 'COMPLETED') {
      return existing;
    }

    const now = new Date().toISOString();
    const handoffId = existing ? existing.id : generateInternalId('dho');
    const publicId = existing ? existing.publicId : generateBusinessId('AB-DHO');

    const handoff: DataHandoff = {
      id: handoffId,
      publicId,
      sourceType: 'CAMPAIGN_AGREEMENT_SNAPSHOT',
      sourceId: orderReadiness.campaignAgreementId,
      sourceSnapshotId: snapshot.publicSnapshotId,
      destinationType: 'ORDER_READINESS',
      destinationReference: orderReadiness.id,
      status: 'PENDING',
      payloadVersion: snapshot.versionNumber,
      idempotencyKey,
      retryCount: (existing?.retryCount || 0) + 1,
      maxRetries: 3,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };

    try {
      handoff.status = 'VALIDATING';
      db.saveDataHandoff(handoff);

      // Verify source snapshot integrity
      if (!snapshot || !snapshot.id || snapshot.agreementId !== orderReadiness.campaignAgreementId) {
        throw new Error('Integrity validation failed: Snapshot agreement mismatch.');
      }

      handoff.status = 'COMPLETED';
      handoff.completedAt = new Date().toISOString();
      handoff.validationResult = {
        isSuccess: true,
        validatedAt: handoff.completedAt,
      };

      db.saveDataHandoff(handoff);

      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'DATA_HANDOFF_COMPLETED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          handoffId: handoff.id,
          handoffPublicId: handoff.publicId,
          orderReadinessId: orderReadiness.id,
          orderReadinessPublicId: orderReadiness.publicId,
          sourceSnapshotId: snapshot.publicSnapshotId,
          agreementId: orderReadiness.campaignAgreementId,
          timestamp: handoff.completedAt,
        },
      });

      return handoff;
    } catch (err: any) {
      handoff.status = 'FAILED';
      handoff.lastError = err?.message || 'Data handoff transformation failure.';
      handoff.validationResult = {
        isSuccess: false,
        reason: handoff.lastError || undefined,
        validatedAt: new Date().toISOString(),
      };
      db.saveDataHandoff(handoff);

      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'DATA_HANDOFF_FAILED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          handoffId: handoff.id,
          orderReadinessId: orderReadiness.id,
          error: handoff.lastError,
          timestamp: new Date().toISOString(),
        },
      });

      throw err;
    }
  }
}

/**
 * ========================================================
 * 4. ORDER READINESS SERVICE
 * ========================================================
 * Orchestrates readiness validation, idempotent record creation,
 * and safe counterparty summary view formatting.
 */
export class OrderReadinessService {
  /**
   * Asserts whether a campaign agreement is ready for order transition.
   * If readiness record already exists, idempotently validates and returns it.
   */
  public static assessOrderReadiness(
    agreementId: string,
    actor: User,
    idempotencyKey?: string
  ): { orderReadiness: OrderReadiness; validationSummary: OrderReadinessValidationSummary; handoff?: DataHandoff } {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    OrderReadinessAuthorizationService.assertCanManage(agreement, actor);

    if (agreement.status !== 'LOCKED') {
      throw new AgreementLockedError(
        `Campaign Agreement '${agreement.publicId}' is not LOCKED (status: ${agreement.status}). Only fully confirmed, locked agreements can achieve Order Readiness.`
      );
    }

    const snapshot = db.getAgreementSnapshotByAgreementId(agreement.id);
    if (!snapshot) {
      throw new NotFoundError(
        `Authoritative locked Campaign Agreement Snapshot not found for agreement '${agreement.publicId}'.`
      );
    }

    return db.runTransaction(() => {
      const now = new Date().toISOString();
      const existing = db.getOrderReadinessByAgreementId(agreement.id);

      // Perform authoritative validation
      const validationSummary = OrderReadinessValidationEngine.validate(agreement, snapshot);

      const readinessId = existing ? existing.id : generateInternalId('ordr');
      const publicId = existing ? existing.publicId : generateBusinessId('AB-ORDR');

      const nextStatus: OrderReadinessStatus = validationSummary.isValid ? 'READY_FOR_ORDER' : 'BLOCKED';

      const orderSnapshot = validationSummary.isValid
        ? DataHandoffService.extractDownstreamOrderSnapshot(agreement, snapshot)
        : undefined;

      const orderReadiness: OrderReadiness = {
        id: readinessId,
        publicId,
        campaignAgreementId: agreement.id,
        campaignAgreementSnapshotId: snapshot.id,
        campaignId: agreement.campaignId,
        advertiserId: agreement.advertiserId,
        venueId: agreement.venueId,
        status: nextStatus,
        sourceSnapshotVersion: snapshot.versionNumber,
        validationSummary,
        orderSnapshot,
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
        validatedAt: now,
        createdBy: existing ? existing.createdBy : actor.id,
        validatedBy: actor.id,
      };

      // If valid, execute atomic data handoff
      let handoff: DataHandoff | undefined;
      if (validationSummary.isValid) {
        handoff = DataHandoffService.executeHandoff(orderReadiness, snapshot, actor, idempotencyKey);
        orderReadiness.handoffId = handoff.id;
      }

      db.saveOrderReadiness(orderReadiness);

      // Dispatch audit event
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: validationSummary.isValid ? 'ORDER_READINESS_EVALUATED_SUCCESS' : 'ORDER_READINESS_EVALUATED_BLOCKED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          orderReadinessId: orderReadiness.id,
          orderReadinessPublicId: orderReadiness.publicId,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          status: orderReadiness.status,
          isValid: validationSummary.isValid,
          blockingIssueCount: validationSummary.blockingIssueCount,
          timestamp: now,
        },
      });

      return { orderReadiness, validationSummary, handoff };
    });
  }

  /**
   * Retrieves an Order Readiness record by ID with strict authorization.
   */
  public static getOrderReadiness(
    idOrPublicId: string,
    actor: User
  ): OrderReadiness {
    const readiness = db.getOrderReadinessById(idOrPublicId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness record '${idOrPublicId}' not found.`);
    }

    OrderReadinessAuthorizationService.assertCanView(readiness, actor);
    return readiness;
  }

  /**
   * Retrieves an Order Readiness record for a given agreement ID with strict authorization.
   */
  public static getOrderReadinessByAgreement(
    agreementId: string,
    actor: User
  ): OrderReadiness {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    const readiness = db.getOrderReadinessByAgreementId(agreement.id);
    if (!readiness) {
      throw new NotFoundError(
        `Order Readiness record has not yet been initiated for Campaign Agreement '${agreement.publicId}'.`
      );
    }

    OrderReadinessAuthorizationService.assertCanView(readiness, actor);
    return readiness;
  }

  /**
   * Safe counterparty view for Advertisers and Venues.
   * Strips all internal admin metadata and technical payload internals.
   */
  public static getSharedView(
    idOrPublicId: string,
    actor: User
  ): OrderReadinessSharedView {
    const readiness = OrderReadinessService.getOrderReadiness(idOrPublicId, actor);
    const agreement = db.getAgreementById(readiness.campaignAgreementId);
    const snapshot = db.getAgreementSnapshotByAgreementId(readiness.campaignAgreementId);

    const isReady = readiness.status === 'READY_FOR_ORDER';
    const isBlocked = readiness.status === 'BLOCKED';

    const blockingReasons = readiness.validationSummary?.issues
      .filter((i) => i.blocking)
      .map((i) => i.message);

    return {
      orderReadinessId: readiness.id,
      publicId: readiness.publicId,
      agreementPublicId: agreement?.publicId || 'UNKNOWN',
      campaignPublicId: snapshot?.campaignSnapshot?.publicCampaignId || 'UNKNOWN',
      status: readiness.status,
      statusDisplay: isReady ? 'Ready for Downstream Order Engine' : isBlocked ? 'Blocked — Action Required' : readiness.status,
      isReadyForOrder: isReady,
      isBlocked,
      requiredBottleQuantity: snapshot?.campaignTermsSnapshot?.quantity || 0,
      campaignDurationWeeks: snapshot?.campaignSnapshot?.durationWeeks || 0,
      preferredStartMonthYear: snapshot?.campaignSnapshot?.preferredStartMonthYear || 'N/A',
      advertiserBrandName: snapshot?.advertiserSnapshot?.brandName || 'Advertiser Partner',
      venueName: snapshot?.venueSnapshot?.venueName || 'Venue Partner',
      validatedAt: readiness.validatedAt,
      publicValidationMessage: isReady
        ? 'All campaign specifications and commercial parameters are verified and locked. Ready for downstream supplier allocation.'
        : 'Order readiness cannot proceed until outstanding blocking issues are resolved.',
      blockingReasons: blockingReasons && blockingReasons.length > 0 ? blockingReasons : undefined,
      boundaries: {
        orderCreated: false,
        supplierAssigned: false,
        logisticsAssigned: false,
        finalPricingCalculated: false,
        paymentCreated: false,
      },
    };
  }
}
