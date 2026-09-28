/**
 * AquaBloom Step 10: Logistics Assignment & Operational Offer Services
 * 
 * Provides:
 * 1. LogisticsAssignmentAuthorizationService: Strict tenant & role boundaries.
 *    - Logistics partners can ONLY view & act upon offers dispatched to their account.
 *    - Logistics partners CANNOT view Advertiser private profiles, plan fees, total budget,
 *      venue commercial terms, or supplier internal production costs.
 *    - Cross-tenant isolation (Logistics Partner A cannot access Partner B's offers).
 *    - Advertisers, Venues, and Suppliers view controlled operational status.
 * 2. LogisticsMatchingEngine: Deterministic rule-based matching (NO AI).
 *    - Verifies entry condition: CampaignAgreement = LOCKED, OrderReadiness = READY_FOR_ORDER,
 *      SupplierAssignment = ASSIGNED.
 *    - Verifies logistics partner account status (ACTIVE & APPROVED).
 *    - Evaluates pickup and delivery service area coverage.
 *    - Evaluates physical shipment capacity (pallets/weight).
 *    - Evaluates fleet capabilities (temperature control if required).
 *    - Returns machine-readable rejection reasons upon ineligibility.
 * 3. LogisticsOperationalOfferService:
 *    - Formulates isolated operational requirements snapshot containing:
 *      * Authoritative pickup source (derived from SupplierAssignment & Supplier profile)
 *      * Authoritative delivery destination (derived from locked CampaignAgreementSnapshot)
 *      * Shipment physical characteristics (pallets, weight, bottle specs, handling instructions)
 *      * Authoritative logistics cost input for downstream pricing
 *    - Dispatches notifications and audit timeline events.
 *    - Handles deterministic decline and acceptance.
 * 4. LogisticsAssignmentService:
 *    - Atomic acceptance & assignment creation.
 *    - Prevents duplicate active assignments on the same OrderReadiness.
 *    - Marks downstream state READY_FOR_FINAL_PRICING when Supplier + Logistics are both ASSIGNED.
 *    - Implements reassignment recovery flow preserving historical audit trails.
 */

import { db } from './db.js';
import {
  User,
  OrderReadiness,
  SupplierAssignment,
  LogisticsOperationalOffer,
  LogisticsAssignment,
  LogisticsCandidateMatch,
  LogisticsRequirementSnapshot,
  LogisticsAssignmentSharedView,
  CreateLogisticsOfferInput,
  DeclineLogisticsOfferInput,
  AcceptLogisticsOfferInput,
  ReassignLogisticsInput,
  LogisticsDeclineReasonCode,
  LogisticsProfile,
  SupplierProfile,
} from '../types.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
  LogisticsAssignmentNotReadyError,
} from '../lib/errors.js';
import { eventDispatcher } from '../lib/events.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';

/**
 * ========================================================
 * 1. LOGISTICS ASSIGNMENT AUTHORIZATION SERVICE
 * ========================================================
 */
export class LogisticsAssignmentAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required for logistics assignment operations.');
    }
  }

  public static assertAdmin(actor: User, actionName = 'This operation'): void {
    LogisticsAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role !== 'ADMIN') {
      throw new AuthorizationError(`${actionName} is strictly reserved for system administrators.`);
    }
  }

  /**
   * Asserts actor can view candidate matching results for an Order Readiness record.
   * Admins, Advertisers, and Venues associated with the agreement can view candidates.
   * Suppliers and Logistics partners are forbidden from querying general candidate matching pools.
   */
  public static assertCanViewCandidates(readiness: OrderReadiness, actor: User): void {
    LogisticsAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      throw new AuthorizationError(
        'Suppliers and Logistics partners cannot browse logistics matching pools.'
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
   * Asserts actor can view a specific Logistics Operational Offer.
   * - Admin can view all.
   * - The designated Logistics Partner can view their own offer.
   * - Advertisers and Venues of the underlying OrderReadiness can view sanitized offer status.
   * - Suppliers and other logistics partners are strictly forbidden.
   */
  public static assertCanViewOffer(offer: LogisticsOperationalOffer, actor: User): void {
    LogisticsAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'LOGISTICS_PARTNER') {
      if (offer.logisticsPartnerId !== actor.id) {
        eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'LOGISTICS_CROSS_TENANT_ACCESS_ATTEMPT',
          userId: actor.id,
          role: actor.role,
          scope: 'INTERNAL_ADMIN',
          payload: {
            actor: actor.id,
            targetOfferId: offer.id,
            targetOfferPublicId: offer.publicId,
            reason: 'Logistics partner attempted to access operational offer of another logistics partner.',
          },
        });
        throw new AuthorizationError(
          'Access denied: You can only view operational offers dispatched to your account.'
        );
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

    throw new AuthorizationError('Access denied: Unauthorized role for logistics operational offers.');
  }

  /**
   * Asserts actor can respond (Accept / Decline) to a Logistics Operational Offer.
   * Strictly the assigned Logistics Partner or Admin.
   */
  public static assertCanRespondToOffer(offer: LogisticsOperationalOffer, actor: User): void {
    LogisticsAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role !== 'LOGISTICS_PARTNER' || offer.logisticsPartnerId !== actor.id) {
      throw new AuthorizationError(
        'Access denied: Only the designated logistics partner can accept or decline this operational offer.'
      );
    }
  }

  /**
   * Asserts actor can view a Logistics Assignment.
   * - Admin can view all.
   * - The assigned Logistics Partner can view.
   * - The participating Advertiser, Venue, and assigned Supplier can view operational status.
   */
  public static assertCanViewAssignment(assignment: LogisticsAssignment, actor: User): void {
    LogisticsAssignmentAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'LOGISTICS_PARTNER') {
      if (assignment.logisticsPartnerId !== actor.id) {
        throw new AuthorizationError('Access denied: You are not the assigned logistics partner for this record.');
      }
      return;
    }

    if (actor.role === 'SUPPLIER') {
      if (assignment.supplierAssignmentId) {
        const supAssn = db.getSupplierAssignmentById(assignment.supplierAssignmentId);
        if (supAssn && supAssn.supplierId === actor.id) {
          return;
        }
      }
      throw new AuthorizationError('Access denied: You are not the assigned supplier for this order.');
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

    throw new AuthorizationError('Access denied: Unauthorized role for logistics assignment.');
  }
}

/**
 * ========================================================
 * 2. DETERMINISTIC LOGISTICS MATCHING ENGINE
 * ========================================================
 */
export class LogisticsMatchingEngine {
  public static readonly MATCHING_RULE_VERSION = 'aquabloom_logistics_matching_v1.0';
  public static readonly PRICING_VERSION_ID = 'LOG-RATE-2026-V1';
  public static readonly PRICING_CONFIG_REF = 'STANDARD_REGIONAL_PALLET_MATRIX_V1';

  /**
   * Verifies strict entry conditions before logistics assignment operations.
   * Entry Condition:
   * 1. CampaignAgreement = LOCKED
   * 2. OrderReadiness = READY_FOR_ORDER
   * 3. SupplierAssignment = ASSIGNED
   * 
   * If any condition fails, throws LogisticsAssignmentNotReadyError.
   */
  public static verifyEntryConditions(orderReadinessId: string): {
    readiness: OrderReadiness;
    supplierAssignment: SupplierAssignment;
    agreementSnapshot: any;
  } {
    const readiness = db.getOrderReadinessById(orderReadinessId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness record '${orderReadinessId}' not found.`);
    }

    if (readiness.status !== 'READY_FOR_ORDER') {
      throw new LogisticsAssignmentNotReadyError(
        `Logistics assignment cannot begin: Order Readiness status must be READY_FOR_ORDER, found: ${readiness.status}`
      );
    }

    const agreement = db.getAgreementById(readiness.campaignAgreementId);
    if (!agreement || agreement.status !== 'LOCKED') {
      throw new LogisticsAssignmentNotReadyError(
        'Logistics assignment cannot begin: Campaign Agreement is not LOCKED.'
      );
    }

    const agreementSnapshot = db.getAgreementSnapshotByAgreementId(readiness.campaignAgreementId);
    if (!agreementSnapshot) {
      throw new LogisticsAssignmentNotReadyError(
        `Logistics assignment cannot begin: Authoritative Campaign Agreement Snapshot not found for agreement '${readiness.campaignAgreementId}'.`
      );
    }

    const supplierAssignment = db.getSupplierAssignmentByOrderReadiness(orderReadinessId);
    if (!supplierAssignment || supplierAssignment.status !== 'ASSIGNED') {
      throw new LogisticsAssignmentNotReadyError(
        'Logistics assignment cannot begin: Supplier Assignment must be ASSIGNED.'
      );
    }

    return { readiness, supplierAssignment, agreementSnapshot };
  }

  /**
   * Evaluates deterministic matching criteria for an OrderReadiness record across all logistics partner accounts.
   */
  public static findEligibleLogisticsPartners(orderReadinessId: string): LogisticsCandidateMatch[] {
    const { readiness, supplierAssignment, agreementSnapshot } =
      LogisticsMatchingEngine.verifyEntryConditions(orderReadinessId);

    // Derive authoritative pickup & delivery locations
    const pickupLocation = LogisticsMatchingEngine.deriveAuthoritativePickupLocation(supplierAssignment);
    const deliveryLocation = LogisticsMatchingEngine.deriveAuthoritativeDeliveryLocation(agreementSnapshot, readiness);
    const shipmentCharacteristics = LogisticsMatchingEngine.deriveShipmentCharacteristics(agreementSnapshot);

    const allUsers = db.getUsers();
    const logisticsUsers = allUsers.filter((u) => u.role === 'LOGISTICS_PARTNER');
    const candidateMatches: LogisticsCandidateMatch[] = [];

    for (const logUser of logisticsUsers) {
      const profile = db.getProfile(logUser.id) as LogisticsProfile | undefined;
      const rejectionReasons: string[] = [];

      // 1. Account status & approval check
      const isAccountActive = logUser.status === 'ACTIVE';
      const isApproved = profile?.approvalStatus === 'APPROVED';

      if (!isAccountActive) {
        rejectionReasons.push('LOGISTICS_PARTNER_INACTIVE');
      }
      if (!isApproved) {
        rejectionReasons.push('LOGISTICS_PARTNER_NOT_APPROVED');
      }

      // 2. Service area checks
      const pickupServiceable = LogisticsMatchingEngine.isLocationServiceable(
        pickupLocation.facilityCity,
        pickupLocation.stateProvince,
        pickupLocation.country,
        profile
      );
      const deliveryServiceable = LogisticsMatchingEngine.isLocationServiceable(
        deliveryLocation.city,
        undefined,
        deliveryLocation.country,
        profile
      );

      if (!pickupServiceable && !deliveryServiceable) {
        rejectionReasons.push('SERVICE_UNAVAILABLE');
      } else {
        if (!pickupServiceable) {
          rejectionReasons.push('PICKUP_NOT_SERVICEABLE');
        }
        if (!deliveryServiceable) {
          rejectionReasons.push('DELIVERY_NOT_SERVICEABLE');
        }
      }

      // 3. Capacity checks
      const weeklyPalletCap = profile?.shipmentCapacity?.palletsPerWeek || 0;
      const maxPayloadWeightKg = profile?.shipmentCapacity?.maxPayloadWeightKg;
      const capacitySufficient =
        weeklyPalletCap >= shipmentCharacteristics.estimatedPallets &&
        (!maxPayloadWeightKg || maxPayloadWeightKg >= shipmentCharacteristics.estimatedTotalWeightKg);

      if (!capacitySufficient) {
        rejectionReasons.push('CAPACITY_INSUFFICIENT');
      }

      // 4. Temperature control feasibility
      const tempControlRequired = shipmentCharacteristics.temperatureControlledRequired;
      const hasTempControl = !!profile?.fleetCapabilities?.temperatureControlled;
      const temperatureControlFeasible = !tempControlRequired || hasTempControl;

      if (!temperatureControlFeasible) {
        rejectionReasons.push('SERVICE_UNAVAILABLE');
      }

      // 5. Timeline feasibility
      const timelineFeasible = true;

      // 6. Deterministic logistics cost input calculation
      const estimatedCost = LogisticsMatchingEngine.calculateDeterministicCost(
        shipmentCharacteristics.estimatedPallets
      );

      const isEligible = rejectionReasons.length === 0;

      candidateMatches.push({
        logisticsPartnerId: logUser.id,
        logisticsPartnerPublicAccountId: logUser.publicAccountId,
        businessName: profile?.businessName || logUser.organizationName || logUser.contactName,
        hubLocation: {
          city: profile?.operatingLocation?.hubCity || 'Unspecified',
          stateRegion: profile?.operatingLocation?.stateRegion,
          country: profile?.operatingLocation?.country || 'United States',
        },
        serviceAreas: profile?.serviceAreas || [],
        fleetCapabilities: {
          vehicleTypes: profile?.fleetCapabilities?.vehicleTypes || ['Standard Box Truck'],
          temperatureControlled: hasTempControl,
        },
        shipmentCapacity: {
          palletsPerWeek: weeklyPalletCap,
          maxPayloadWeightKg,
        },
        pricing: {
          pricingVersionId: LogisticsMatchingEngine.PRICING_VERSION_ID,
          rateType: 'FIXED_PALLET_CORRIDOR_RATE',
          currency: 'INR',
          estimatedLogisticsCost: estimatedCost,
        },
        matchEvaluation: {
          isEligible,
          statusApproved: isAccountActive && isApproved,
          pickupServiceable,
          deliveryServiceable,
          capacitySufficient,
          temperatureControlFeasible,
          timelineFeasible,
          rejectionReasons,
        },
      });
    }

    // Deterministic ordering: eligible candidates first, then by estimated logistics cost ascending
    return candidateMatches.sort((a, b) => {
      if (a.matchEvaluation.isEligible && !b.matchEvaluation.isEligible) return -1;
      if (!a.matchEvaluation.isEligible && b.matchEvaluation.isEligible) return 1;
      return a.pricing.estimatedLogisticsCost.amount - b.pricing.estimatedLogisticsCost.amount;
    });
  }

  /**
   * Checks whether a geographic location is covered by a logistics partner's serviceAreas or operating hub.
   */
  public static isLocationServiceable(
    city: string,
    stateProvince: string | undefined,
    country: string,
    profile: LogisticsProfile | undefined
  ): boolean {
    if (!profile) return false;

    const rawAreas = profile.serviceAreas || [];
    const areas = rawAreas
      .map((a: any) => {
        if (typeof a === 'string') return a.toLowerCase().trim();
        if (a && typeof a === 'object') {
          return `${a.city || ''} ${a.state || a.stateRegion || ''} ${a.country || ''}`.toLowerCase().trim();
        }
        return '';
      })
      .filter((s: string) => s.length > 0);
    if (areas.length === 0) return false;

    // Check wildcard or national coverage
    const hasNational = areas.some(
      (a) =>
        a.includes('national') ||
        a.includes('global') ||
        a.includes('all') ||
        a.includes('worldwide') ||
        a.includes('countrywide')
    );
    if (hasNational) return true;

    const targetCity = (city || '').toLowerCase().trim();
    const targetState = (stateProvince || '').toLowerCase().trim();
    const hubCity = (profile.operatingLocation?.hubCity || '').toLowerCase().trim();
    const hubState = (profile.operatingLocation?.stateRegion || '').toLowerCase().trim();

    // Check if partner's hub matches
    if (targetCity && hubCity && (targetCity.includes(hubCity) || hubCity.includes(targetCity))) {
      return true;
    }
    if (targetState && hubState && (targetState.includes(hubState) || hubState.includes(targetState))) {
      return true;
    }

    // Check service area list
    return areas.some((area) => {
      if (targetCity && (area.includes(targetCity) || targetCity.includes(area))) return true;
      if (targetState && (area.includes(targetState) || targetState.includes(area))) return true;
      return false;
    });
  }

  /**
   * Derives authoritative pickup location from the assigned supplier.
   */
  public static deriveAuthoritativePickupLocation(supplierAssignment: SupplierAssignment): {
    supplierId: string;
    supplierPublicAccountId: string;
    supplierBusinessName: string;
    facilityCity: string;
    stateProvince?: string;
    country: string;
    facilityAddress?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    pickupWindow: {
      startDate: string;
      endDate: string;
      windowDescription: string;
    };
  } {
    const supplierUser = db.getUserById(supplierAssignment.supplierId);
    const supplierProfile = db.getProfile(supplierAssignment.supplierId) as SupplierProfile | undefined;

    const facilityCity = supplierProfile?.operatingLocation?.facilityCity || 'Alpine';
    const stateProvince = supplierProfile?.operatingLocation?.stateProvince;
    const country = supplierProfile?.operatingLocation?.country || 'United States';
    const facilityAddress = `${facilityCity}${stateProvince ? ', ' + stateProvince : ''}, ${country}`;

    // Target pickup window: 5 days prior to campaign period start
    const now = new Date();
    const pickupStart = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const pickupEnd = new Date(now.getTime() + 16 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return {
      supplierId: supplierAssignment.supplierId,
      supplierPublicAccountId: supplierUser?.publicAccountId || 'AB-ACC-SUP-UNSPECIFIED',
      supplierBusinessName: supplierAssignment.supplierBusinessName,
      facilityCity,
      stateProvince,
      country,
      facilityAddress,
      contactName: supplierProfile?.primaryContact?.name || supplierUser?.contactName,
      contactPhone: supplierProfile?.primaryContact?.phone,
      contactEmail: supplierProfile?.primaryContact?.email || supplierUser?.email,
      pickupWindow: {
        startDate: pickupStart,
        endDate: pickupEnd,
        windowDescription: `Ready for collection between ${pickupStart} and ${pickupEnd} (08:00 - 17:00 Standard Dock Hours)`,
      },
    };
  }

  /**
   * Derives authoritative delivery destination from locked CampaignAgreementSnapshot / OrderSnapshot.
   */
  public static deriveAuthoritativeDeliveryLocation(
    agreementSnapshot: any,
    readiness: OrderReadiness
  ): {
    venueId: string;
    venuePublicAccountId: string;
    venueName: string;
    venueType: string;
    city: string;
    country: string;
    deliveryAddress: string;
    dockRequirements?: string;
    receivingHours?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    deliveryWindow: {
      startDate: string;
      endDate: string;
      windowDescription: string;
    };
  } {
    const venueSnap =
      agreementSnapshot?.venueSnapshot ||
      agreementSnapshot?.partiesSnapshot?.venue ||
      {};
    const deliveryTerms =
      agreementSnapshot?.deliveryTermsSnapshot ||
      agreementSnapshot?.termsSnapshot?.deliveryTermsKnown ||
      {};

    const city = venueSnap.locationCity || venueSnap.city || 'Convention City';
    const country = venueSnap.locationCountry || venueSnap.country || 'United States';
    const deliveryAddress =
      deliveryTerms.deliveryAddress ||
      `${venueSnap.venueName || 'Venue Dock'}, ${city}, ${country}`;

    const now = new Date();
    const deliveryStart = new Date(now.getTime() + 18 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const deliveryEnd = new Date(now.getTime() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    return {
      venueId: readiness.venueId,
      venuePublicAccountId: venueSnap.publicAccountId || 'AB-ACC-VEN-UNSPECIFIED',
      venueName: venueSnap.venueName || 'Designated Venue',
      venueType: venueSnap.venueType || 'Convention / Event Space',
      city,
      country,
      deliveryAddress,
      dockRequirements: deliveryTerms.dockRequirements || 'Standard Loading Bay, Pallet Jack / Forklift Accessible',
      receivingHours: deliveryTerms.receivingHours || '08:00 - 16:00 Mon-Fri',
      contactName: deliveryTerms.contactName || venueSnap.primaryContactName,
      contactPhone: deliveryTerms.contactPhone,
      contactEmail: deliveryTerms.contactEmail,
      deliveryWindow: {
        startDate: deliveryStart,
        endDate: deliveryEnd,
        windowDescription: `Receiving window ${deliveryStart} to ${deliveryEnd} (${deliveryTerms.receivingHours || '08:00 - 16:00'})`,
      },
    };
  }

  /**
   * Derives shipment characteristics and transport requirements from the agreement snapshot.
   */
  public static deriveShipmentCharacteristics(agreementSnapshot: any): {
    bottleQuantity: number;
    estimatedPallets: number;
    estimatedTotalWeightKg: number;
    temperatureControlledRequired: boolean;
    productSpecifications: {
      bottleMaterial?: string;
      bottleCapacityMl?: number;
      labelType?: string;
      packagingType?: string;
    };
    handlingRequirements: string[];
    specialInstructions?: string;
  } {
    const bottleQuantity = agreementSnapshot?.campaignTermsSnapshot?.quantity || 12000;
    // Standard pallet carries ~1,000 bottles
    const estimatedPallets = Math.max(1, Math.ceil(bottleQuantity / 1000));
    // Water bottle weighs ~0.52 kg (500ml + aluminum/glass/PET packaging)
    const estimatedTotalWeightKg = Math.round(bottleQuantity * 0.52);

    const storageCond = agreementSnapshot?.deliveryTermsSnapshot?.storageConditions || '';
    const temperatureControlledRequired =
      storageCond.toLowerCase().includes('refrigerat') ||
      storageCond.toLowerCase().includes('cold') ||
      storageCond.toLowerCase().includes('temperature');

    const prodReq = agreementSnapshot?.productRequirementsSnapshot || {};

    return {
      bottleQuantity,
      estimatedPallets,
      estimatedTotalWeightKg,
      temperatureControlledRequired,
      productSpecifications: {
        bottleMaterial: prodReq.bottleMaterial || 'Eco Aluminum / Recyclable PET',
        bottleCapacityMl: prodReq.volumeMl || 500,
        labelType: prodReq.labelType || 'Waterproof Matt Finished Label',
        packagingType: 'Shrink-wrapped trays on wooden standard euro pallets',
      },
      handlingRequirements: [
        'Keep dry and clean',
        'Do not double stack pallets',
        'Food & Beverage transport grade vehicle only',
        temperatureControlledRequired ? 'Maintain 4°C - 10°C ambient' : 'Ambient temperature controlled',
      ],
      specialInstructions:
        agreementSnapshot?.deliveryTermsSnapshot?.storageConditions ||
        'Deliver directly to main facility loading dock bay.',
    };
  }

  /**
   * Calculates deterministic logistics cost input:
   * Base corridor transport fee + Pallet handling rate
   */
  public static calculateDeterministicCost(estimatedPallets: number): { amount: number; currency: 'INR' } {
    const baseCorridorFee = 5000; // Base regional corridor fee in INR
    const perPalletFee = 1500; // 1,500 INR per pallet
    const totalAmount = baseCorridorFee + estimatedPallets * perPalletFee;
    return {
      amount: totalAmount,
      currency: 'INR',
    };
  }
}

/**
 * ========================================================
 * 3. LOGISTICS OPERATIONAL OFFER SERVICE
 * ========================================================
 */
export class LogisticsOperationalOfferService {
  /**
   * Creates and dispatches a Logistics Operational Offer to an approved logistics partner.
   * Admin-only operation.
   */
  public static createOffer(
    input: CreateLogisticsOfferInput,
    actor: User
  ): LogisticsOperationalOffer {
    LogisticsAssignmentAuthorizationService.assertAdmin(actor, 'Creating logistics operational offers');

    // 1. Entry conditions verification
    const { readiness, supplierAssignment, agreementSnapshot } =
      LogisticsMatchingEngine.verifyEntryConditions(input.orderReadinessId);

    // 2. Concurrency / Duplicate active assignment guard
    const existingAssignment = db.getLogisticsAssignmentByOrderReadiness(readiness.id);
    if (existingAssignment && existingAssignment.status === 'ASSIGNED') {
      throw new ConflictError(
        `An active Logistics Assignment (${existingAssignment.publicId}) already exists for Order Readiness '${readiness.publicId}'.`
      );
    }

    // 3. Logistics Partner validation
    const logisticsUser = db.getUserById(input.logisticsPartnerId);
    if (!logisticsUser || logisticsUser.role !== 'LOGISTICS_PARTNER') {
      throw new NotFoundError(`Logistics partner user '${input.logisticsPartnerId}' not found.`);
    }

    const logisticsProfile = db.getProfile(logisticsUser.id) as LogisticsProfile | undefined;
    if (logisticsUser.status !== 'ACTIVE' || logisticsProfile?.approvalStatus !== 'APPROVED') {
      throw new ValidationError(
        `Logistics partner '${logisticsUser.publicAccountId}' is not active or approved.`
      );
    }

    // 4. Construct immutable requirements snapshot
    const pickupSource = LogisticsMatchingEngine.deriveAuthoritativePickupLocation(supplierAssignment);
    const deliveryDestination = LogisticsMatchingEngine.deriveAuthoritativeDeliveryLocation(
      agreementSnapshot,
      readiness
    );
    const shipmentCharacteristics = LogisticsMatchingEngine.deriveShipmentCharacteristics(agreementSnapshot);

    const logisticsRequirementsSnapshot: LogisticsRequirementSnapshot = {
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: readiness.campaignAgreementId,
      campaignAgreementPublicId: agreementSnapshot.campaignAgreementPublicId || 'AB-AGR-AUTHORITATIVE',
      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      pickupSource,
      deliveryDestination,
      shipmentCharacteristics,
      transactionReference: `TX-LOG-${readiness.publicId}-${Date.now().toString().slice(-6)}`,
    };

    // 5. Deterministic cost calculation
    const calculatedCost = LogisticsMatchingEngine.calculateDeterministicCost(
      shipmentCharacteristics.estimatedPallets
    );

    const now = new Date();
    const expiryHours = input.expiresInHours && input.expiresInHours > 0 ? input.expiresInHours : 48;
    const expiresAt = new Date(now.getTime() + expiryHours * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();

    const offerId = generateInternalId('loo');
    const offerPublicId = generateBusinessId('AB-LOO');

    const offer: LogisticsOperationalOffer = {
      id: offerId,
      publicId: offerPublicId,
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: readiness.campaignAgreementId,
      campaignAgreementPublicId: agreementSnapshot.campaignAgreementPublicId || 'AB-AGR-AUTHORITATIVE',
      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      logisticsPartnerId: logisticsUser.id,
      logisticsPartnerPublicAccountId: logisticsUser.publicAccountId,
      logisticsPartnerBusinessName:
        logisticsProfile?.businessName || logisticsUser.organizationName || logisticsUser.contactName,
      status: 'PENDING',
      matchingRuleVersion: LogisticsMatchingEngine.MATCHING_RULE_VERSION,
      logisticsRequirementsSnapshot,
      costInput: {
        logisticsCost: calculatedCost,
        pricingVersionId: LogisticsMatchingEngine.PRICING_VERSION_ID,
        rateType: 'FIXED_PALLET_CORRIDOR_RATE',
        currency: 'INR',
        pricingConfigurationReference: LogisticsMatchingEngine.PRICING_CONFIG_REF,
        effectiveAt: nowIso,
      },
      expiresAt,
      acceptedAt: null,
      declinedAt: null,
      declineReasonCode: null,
      declineExplanation: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: actor.id,
      updatedBy: actor.id,
    };

    db.saveLogisticsOffer(offer);

    // 6. Audit Events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_OFFER_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        offerId: offer.id,
        offerPublicId: offer.publicId,
        orderReadinessId: readiness.id,
        orderReadinessPublicId: readiness.publicId,
        logisticsPartnerId: logisticsUser.id,
        logisticsPartnerPublicAccountId: logisticsUser.publicAccountId,
        costAmount: calculatedCost.amount,
        currency: calculatedCost.currency,
        expiresAt,
      },
    });

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_OFFER_SENT',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        offerId: offer.id,
        offerPublicId: offer.publicId,
        recipientLogisticsPartnerId: logisticsUser.id,
        recipientLogisticsPartnerPublicId: logisticsUser.publicAccountId,
        orderReadinessPublicId: readiness.publicId,
      },
    });

    // 7. Notifications
    db.createNotification(
      logisticsUser.id,
      'New Logistics Operational Offer',
      `You have received operational offer ${offer.publicId} for ${shipmentCharacteristics.bottleQuantity} bottles (${shipmentCharacteristics.estimatedPallets} pallets).`,
      'INFO'
    );

    db.createNotification(
      readiness.advertiserId,
      'Logistics Operational Offer Dispatched',
      `A logistics operational offer has been dispatched for your campaign order ${readiness.publicId}.`,
      'INFO'
    );

    return offer;
  }

  /**
   * Declines a Logistics Operational Offer with a structured reason code.
   * Can be performed by the designated Logistics Partner or Admin.
   */
  public static declineOffer(
    offerId: string,
    input: DeclineLogisticsOfferInput,
    actor: User
  ): LogisticsOperationalOffer {
    const offer = db.getLogisticsOfferById(offerId);
    if (!offer) {
      throw new NotFoundError(`Logistics operational offer '${offerId}' not found.`);
    }

    LogisticsAssignmentAuthorizationService.assertCanRespondToOffer(offer, actor);

    if (offer.status === 'DECLINED') {
      return offer; // Idempotent return
    }

    if (offer.status !== 'PENDING') {
      throw new ConflictError(
        `Cannot decline offer with status '${offer.status}'. Only PENDING offers can be declined.`
      );
    }

    // Server-side expiry check
    if (new Date() > new Date(offer.expiresAt)) {
      offer.status = 'EXPIRED';
      offer.updatedAt = new Date().toISOString();
      db.saveLogisticsOffer(offer);

      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'LOGISTICS_OFFER_EXPIRED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          offerId: offer.id,
          offerPublicId: offer.publicId,
          orderReadinessId: offer.orderReadinessId,
          expiredAt: offer.expiresAt,
        },
      });

      throw new ConflictError('This operational offer has expired and can no longer be declined or accepted.');
    }

    const validReasonCodes: LogisticsDeclineReasonCode[] = [
      'CAPACITY_UNAVAILABLE',
      'PICKUP_NOT_FEASIBLE',
      'DELIVERY_NOT_FEASIBLE',
      'TIMELINE_NOT_FEASIBLE',
      'SERVICE_AREA_ISSUE',
      'OTHER',
    ];

    if (!validReasonCodes.includes(input.reasonCode)) {
      throw new ValidationError(
        `Invalid decline reason code: ${input.reasonCode}. Valid codes: ${validReasonCodes.join(', ')}`
      );
    }

    const nowIso = new Date().toISOString();
    offer.status = 'DECLINED';
    offer.declinedAt = nowIso;
    offer.declineReasonCode = input.reasonCode;
    offer.declineExplanation = input.explanation || null;
    offer.updatedAt = nowIso;
    offer.updatedBy = actor.id;

    db.saveLogisticsOffer(offer);

    // Audit Event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_OFFER_DECLINED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        offerId: offer.id,
        offerPublicId: offer.publicId,
        orderReadinessId: offer.orderReadinessId,
        orderReadinessPublicId: offer.orderReadinessPublicId,
        declinedByUserId: actor.id,
        reasonCode: input.reasonCode,
        explanation: input.explanation,
      },
    });

    // Notify Admins & Advertiser
    const readiness = db.getOrderReadinessById(offer.orderReadinessId);
    if (readiness) {
      db.createNotification(
        readiness.advertiserId,
        'Logistics Operational Offer Declined',
        `Logistics offer for order ${offer.orderReadinessPublicId} was declined. The operational team will assign an alternate partner.`,
        'WARNING'
      );
    }

    return offer;
  }

  /**
   * Accepts a Logistics Operational Offer atomically.
   * Generates the authoritative LogisticsAssignment.
   */
  public static acceptOffer(
    offerId: string,
    input: AcceptLogisticsOfferInput,
    actor: User
  ): { offer: LogisticsOperationalOffer; assignment: LogisticsAssignment } {
    const offer = db.getLogisticsOfferById(offerId);
    if (!offer) {
      throw new NotFoundError(`Logistics operational offer '${offerId}' not found.`);
    }

    LogisticsAssignmentAuthorizationService.assertCanRespondToOffer(offer, actor);

    // Idempotent acceptance check
    if (offer.status === 'ACCEPTED') {
      const existingAssignment = db.getLogisticsAssignmentByOrderReadiness(offer.orderReadinessId);
      if (existingAssignment && existingAssignment.logisticsOperationalOfferId === offer.id) {
        return { offer, assignment: existingAssignment };
      }
    }

    if (offer.status !== 'PENDING') {
      throw new ConflictError(
        `Cannot accept offer with status '${offer.status}'. Only PENDING offers can be accepted.`
      );
    }

    // 1. Server-side Expiry Check
    if (new Date() > new Date(offer.expiresAt)) {
      offer.status = 'EXPIRED';
      offer.updatedAt = new Date().toISOString();
      db.saveLogisticsOffer(offer);

      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'LOGISTICS_OFFER_EXPIRED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          offerId: offer.id,
          offerPublicId: offer.publicId,
          orderReadinessId: offer.orderReadinessId,
          expiredAt: offer.expiresAt,
        },
      });

      throw new ValidationError('This logistics operational offer has expired and cannot be accepted.');
    }

    // 2. Strict Invariant Re-verification
    const { readiness, supplierAssignment } =
      LogisticsMatchingEngine.verifyEntryConditions(offer.orderReadinessId);

    // 3. Concurrency Protection: Exactly ONE active LogisticsAssignment per OrderReadiness
    const currentActive = db.getLogisticsAssignmentByOrderReadiness(readiness.id);
    if (currentActive && currentActive.status === 'ASSIGNED') {
      if (currentActive.logisticsOperationalOfferId === offer.id) {
        return { offer, assignment: currentActive };
      }
      throw new ConflictError(
        `An active Logistics Assignment (${currentActive.publicId}) already exists for Order Readiness '${readiness.publicId}'. This offer is no longer available.`
      );
    }

    // 4. Partner eligibility re-check
    const partnerUser = db.getUserById(offer.logisticsPartnerId);
    const partnerProfile = db.getProfile(offer.logisticsPartnerId) as LogisticsProfile | undefined;
    if (!partnerUser || partnerUser.status !== 'ACTIVE' || partnerProfile?.approvalStatus !== 'APPROVED') {
      throw new ValidationError('Logistics partner account is no longer active or approved.');
    }

    const nowIso = new Date().toISOString();

    // 5. Update Offer Status
    offer.status = 'ACCEPTED';
    offer.acceptedAt = nowIso;
    offer.updatedAt = nowIso;
    offer.updatedBy = actor.id;
    db.saveLogisticsOffer(offer);

    // 6. Generate Authoritative Logistics Assignment
    const assignmentId = generateInternalId('las');
    const assignmentPublicId = generateBusinessId('AB-LAS');

    const assignment: LogisticsAssignment = {
      id: assignmentId,
      publicId: assignmentPublicId,
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: readiness.campaignAgreementId,
      campaignAgreementPublicId: offer.campaignAgreementPublicId,
      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      logisticsOperationalOfferId: offer.id,
      logisticsOperationalOfferPublicId: offer.publicId,
      logisticsPartnerId: offer.logisticsPartnerId,
      logisticsPartnerPublicAccountId: offer.logisticsPartnerPublicAccountId,
      logisticsPartnerBusinessName: offer.logisticsPartnerBusinessName,
      status: 'ASSIGNED',
      assignedAt: nowIso,
      assignedBy: actor.id,
      matchingRuleVersion: offer.matchingRuleVersion,
      lockedOperationalSnapshot: {
        requirements: offer.logisticsRequirementsSnapshot,
        costInput: {
          logisticsCost: offer.costInput.logisticsCost,
          pricingVersionId: offer.costInput.pricingVersionId,
          rateType: offer.costInput.rateType,
          currency: offer.costInput.currency,
          pricingConfigurationReference: offer.costInput.pricingConfigurationReference,
        },
      },
      futureBoundaries: {
        readyForFinalPricing: true,
        productionScheduled: false,
        shipmentExecuted: false,
        deliveryConfirmed: false,
        paymentCalculated: false,
      },
      reassignmentDetails: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    db.saveLogisticsAssignment(assignment);

    // 7. Update SupplierAssignment futureBoundaries
    supplierAssignment.futureBoundaries.logisticsAssigned = true;
    supplierAssignment.updatedAt = nowIso;
    db.saveSupplierAssignment(supplierAssignment);

    // 8. Cancel Sibling Pending Offers for this OrderReadiness
    const siblingOffers = db.getLogisticsOffersByOrderReadiness(readiness.id);
    for (const sib of siblingOffers) {
      if (sib.id !== offer.id && sib.status === 'PENDING') {
        sib.status = 'CANCELLED';
        sib.updatedAt = nowIso;
        db.saveLogisticsOffer(sib);

        db.createNotification(
          sib.logisticsPartnerId,
          'Logistics Offer No Longer Available',
          `Logistics operational offer ${sib.publicId} is no longer available as another partner accepted.`,
          'INFO'
        );
      }
    }

    // 9. Dispatch Audit Events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_OFFER_ACCEPTED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        offerId: offer.id,
        offerPublicId: offer.publicId,
        orderReadinessId: readiness.id,
        orderReadinessPublicId: readiness.publicId,
        logisticsPartnerId: offer.logisticsPartnerId,
        logisticsPartnerPublicAccountId: offer.logisticsPartnerPublicAccountId,
        acceptedAt: nowIso,
      },
    });

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_ASSIGNMENT_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        assignmentId: assignment.id,
        assignmentPublicId: assignment.publicId,
        orderReadinessId: readiness.id,
        orderReadinessPublicId: readiness.publicId,
        campaignAgreementPublicId: assignment.campaignAgreementPublicId,
        supplierAssignmentPublicId: assignment.supplierAssignmentPublicId,
        logisticsPartnerId: assignment.logisticsPartnerId,
        logisticsPartnerPublicAccountId: assignment.logisticsPartnerPublicAccountId,
        logisticsCostAmount: assignment.lockedOperationalSnapshot.costInput.logisticsCost.amount,
        currency: assignment.lockedOperationalSnapshot.costInput.logisticsCost.currency,
        readyForFinalPricing: true,
      },
    });

    // 10. Dispatch Notifications
    db.createNotification(
      offer.logisticsPartnerId,
      'Logistics Operational Offer Accepted',
      `You are officially assigned to transport shipment ${assignment.publicId} for Order ${readiness.publicId}.`,
      'SUCCESS'
    );

    db.createNotification(
      readiness.advertiserId,
      'Logistics Partner Assigned',
      `Logistics transport has been confirmed for campaign order ${readiness.publicId}. Ready for final pricing review.`,
      'SUCCESS'
    );

    db.createNotification(
      readiness.venueId,
      'Delivery Logistics Assigned',
      `Logistics partner ${assignment.logisticsPartnerBusinessName} has been assigned for shipment delivery to your facility.`,
      'INFO'
    );

    db.createNotification(
      supplierAssignment.supplierId,
      'Logistics Assigned for Production Order',
      `Logistics partner ${assignment.logisticsPartnerBusinessName} has been assigned for pickup coordination.`,
      'INFO'
    );

    return { offer, assignment };
  }
}

/**
 * ========================================================
 * 4. LOGISTICS ASSIGNMENT SERVICE
 * ========================================================
 */
export class LogisticsAssignmentService {
  public static getAssignmentById(idOrPublicId: string, actor: User): LogisticsAssignment {
    const assignment = db.getLogisticsAssignmentById(idOrPublicId);
    if (!assignment) {
      throw new NotFoundError(`Logistics Assignment '${idOrPublicId}' not found.`);
    }

    LogisticsAssignmentAuthorizationService.assertCanViewAssignment(assignment, actor);
    return assignment;
  }

  public static getAssignmentByOrderReadiness(
    orderReadinessId: string,
    actor: User
  ): LogisticsAssignment | undefined {
    const readiness = db.getOrderReadinessById(orderReadinessId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness record '${orderReadinessId}' not found.`);
    }

    LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, actor);

    return db.getLogisticsAssignmentByOrderReadiness(orderReadinessId);
  }

  /**
   * Safe counterparty view for Advertisers, Venues, and Suppliers.
   * Strips internal technical data and private margins while providing clear operational tracking.
   */
  public static getSharedView(
    assignment: LogisticsAssignment,
    actor: User
  ): LogisticsAssignmentSharedView {
    LogisticsAssignmentAuthorizationService.assertCanViewAssignment(assignment, actor);

    const snap = assignment.lockedOperationalSnapshot.requirements;

    return {
      assignmentId: assignment.id,
      publicId: assignment.publicId,
      orderReadinessPublicId: assignment.orderReadinessPublicId,
      campaignAgreementPublicId: assignment.campaignAgreementPublicId,
      supplierAssignmentPublicId: assignment.supplierAssignmentPublicId,
      logisticsPartnerBusinessName: assignment.logisticsPartnerBusinessName,
      status: assignment.status,
      assignedAt: assignment.assignedAt,
      bottleQuantity: snap.shipmentCharacteristics.bottleQuantity,
      estimatedPallets: snap.shipmentCharacteristics.estimatedPallets,
      pickupCity: snap.pickupSource.facilityCity,
      deliveryCity: snap.deliveryDestination.city,
      deliveryVenueName: snap.deliveryDestination.venueName,
      pickupWindowDescription: snap.pickupSource.pickupWindow.windowDescription,
      deliveryWindowDescription: snap.deliveryDestination.deliveryWindow.windowDescription,
      boundaries: {
        supplierAssigned: true,
        logisticsAssigned: assignment.status === 'ASSIGNED',
        readyForFinalPricing: assignment.status === 'ASSIGNED',
        productionStarted: false,
        shipmentExecuted: false,
        paymentCompleted: false,
      },
    };
  }

  /**
   * Reassignment recovery mechanism.
   * Cancels existing assignment (preserving historical auditability) and opens OrderReadiness
   * for a new logistics offer.
   * Admin-only operation.
   */
  public static reassignLogistics(
    assignmentId: string,
    input: ReassignLogisticsInput,
    actor: User
  ): { cancelledAssignment: LogisticsAssignment; message: string } {
    LogisticsAssignmentAuthorizationService.assertAdmin(actor, 'Reassigning logistics partner');

    const assignment = db.getLogisticsAssignmentById(assignmentId);
    if (!assignment) {
      throw new NotFoundError(`Logistics Assignment '${assignmentId}' not found.`);
    }

    if (assignment.status !== 'ASSIGNED') {
      throw new ConflictError(
        `Cannot reassign logistics when status is already '${assignment.status}'.`
      );
    }

    if (!input.reason || input.reason.trim().length < 5) {
      throw new ValidationError('A meaningful reason (minimum 5 characters) is required for reassignment.');
    }

    const nowIso = new Date().toISOString();

    assignment.status = 'CANCELLED';
    assignment.reassignmentDetails = {
      reassignedAt: nowIso,
      reassignedBy: actor.id,
      previousAssignmentId: assignment.id,
      reason: input.reason.trim(),
    };
    assignment.updatedAt = nowIso;
    db.saveLogisticsAssignment(assignment);

    // Update supplier assignment boundary back
    const supplierAssignment = db.getSupplierAssignmentById(assignment.supplierAssignmentId);
    if (supplierAssignment) {
      supplierAssignment.futureBoundaries.logisticsAssigned = false;
      supplierAssignment.updatedAt = nowIso;
      db.saveSupplierAssignment(supplierAssignment);
    }

    // Audit Event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'LOGISTICS_REASSIGNMENT_STARTED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        cancelledAssignmentId: assignment.id,
        cancelledAssignmentPublicId: assignment.publicId,
        orderReadinessId: assignment.orderReadinessId,
        orderReadinessPublicId: assignment.orderReadinessPublicId,
        reason: input.reason.trim(),
        initiatedBy: actor.id,
      },
    });

    // Notify Parties
    const readiness = db.getOrderReadinessById(assignment.orderReadinessId);
    if (readiness) {
      db.createNotification(
        readiness.advertiserId,
        'Logistics Reassignment In Progress',
        `Logistics assignment ${assignment.publicId} has been cancelled for reassignment: "${input.reason.trim()}". A new logistics partner will be assigned shortly.`,
        'WARNING'
      );
    }

    db.createNotification(
      assignment.logisticsPartnerId,
      'Logistics Assignment Cancelled for Reassignment',
      `Your assignment ${assignment.publicId} has been cancelled: "${input.reason.trim()}".`,
      'WARNING'
    );

    return {
      cancelledAssignment: assignment,
      message: `Logistics Assignment ${assignment.publicId} cancelled. New logistics candidate matching may now proceed.`,
    };
  }
}
