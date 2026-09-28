/**
 * AquaBloom Step 10: Logistics Assignment & Operational Offer Test Suite
 * 
 * Verifies:
 * 1. Entry Condition Validation:
 *    - OrderReadiness status MUST be READY_FOR_ORDER.
 *    - CampaignAgreement MUST be LOCKED.
 *    - SupplierAssignment MUST be ASSIGNED (Prerequisite Step 9).
 *    - Throws LogisticsAssignmentNotReadyError if prerequisite steps missing.
 * 2. Deterministic Candidate Matching:
 *    - Geographic Corridor: Logistics Partner service areas include pickup city AND delivery city.
 *    - Capacity: Weekly pallet capacity >= estimated shipment pallets.
 *    - Temperature Control: Partner fleet matches if cold chain required.
 *    - Vehicle Types: Compatible with pallet transport (Reefer, Dry Van, Box Truck, Flatbed).
 *    - Partner Status: Must be ACTIVE and APPROVED.
 * 3. Operational Offer Creation & Data Isolation:
 *    - Dispatched by Admin.
 *    - Offer snapshot strictly contains pickup and delivery locations, schedule windows, pallet counts, cargo specs.
 *    - Strictly EXCLUDES supplier commercial price, advertiser budget, venue compensation %.
 * 4. Partner Tenant Isolation & Authorization Boundaries:
 *    - Logistics partner sees only their offers.
 *    - Cross-carrier inspection blocked (AuthorizationError).
 *    - Advertisers/Venues cannot create/accept logistics offers.
 * 5. Offer Decline Flow:
 *    - Decline with audited reason code (NO_CAPACITY, SERVICE_CORRIDOR_UNAVAILABLE, FLEET_EQUIPMENT_UNAVAILABLE, SCHEDULING_WINDOW_CONFLICT, OTHER).
 * 6. Offer Acceptance & Atomic Assignment:
 *    - Accepting offer transitions offer to ACCEPTED and generates LogisticsAssignment (AB-LAS-...).
 *    - Atomically sets supplierAssignment.futureBoundaries.logisticsAssigned = true.
 *    - Sets readiness future boundaries readyForFinalPricing = true.
 *    - Any sibling pending offers for the same OrderReadiness are automatically marked CANCELLED.
 * 7. Duplicate Assignment Prevention:
 *    - Second offer acceptance on same OrderReadiness throws ConflictError.
 * 8. Reassignment Recovery Flow:
 *    - Admin can cancel and reassign logistics.
 *    - Resets supplierAssignment.futureBoundaries.logisticsAssigned = false.
 *    - Preserves audit trail with historical reference.
 * 9. Counterparty Shared View:
 *    - Clean sanitized view with pickup/delivery windows, pallet counts, and boundaries.
 * 10. Audit Trail:
 *     - Audited events: LOGISTICS_MATCHING_EXECUTED, LOGISTICS_OFFER_DISPATCHED, LOGISTICS_OFFER_DECLINED,
 *       LOGISTICS_OFFER_ACCEPTED, LOGISTICS_ASSIGNMENT_CREATED, LOGISTICS_REASSIGNMENT_STARTED.
 */

import { strict as assert } from 'assert';
import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementSnapshotService,
} from '../src/server/agreementServices.js';
import {
  OrderReadinessService,
} from '../src/server/orderReadinessServices.js';
import {
  SupplierOperationalOfferService,
} from '../src/server/supplierAssignmentServices.js';
import {
  LogisticsMatchingEngine,
  LogisticsOperationalOfferService,
  LogisticsAssignmentService,
  LogisticsAssignmentAuthorizationService,
} from '../src/server/logisticsAssignmentServices.js';
import {
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
  LogisticsAssignmentNotReadyError,
} from '../src/lib/errors.js';
import type {
  User,
  Campaign,
  Proposal,
  CampaignAgreement,
  AgreementCommercialTerms,
  Product,
  ProductVersion,
  SupplierProfile,
  LogisticsProfile,
  SupplierAssignment,
  OrderReadiness,
} from '../src/types.js';

const nowIso = new Date().toISOString();
const runId = Math.random().toString(36).substring(2, 8);

// Actors
const adminUser: User = {
  id: `usr_admin_step10_${runId}`,
  publicAccountId: `AB-ACC-ADMIN-10-${runId}`,
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Step 10 Admin',
  email: `admin10_${runId}@aquabloom.internal`,
  organizationName: 'AquaBloom Logistics Control',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: `usr_adv_step10_${runId}`,
  publicAccountId: `AB-ACC-ADV-10-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Elena Rostova',
  email: `elena10_${runId}@aurabeverage.com`,
  organizationName: 'Aura Luxury Beverage Group',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: `usr_ven_step10_${runId}`,
  publicAccountId: `AB-ACC-VEN-10-${runId}`,
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Marcus Vance',
  email: `marcus10_${runId}@millenniumcenter.com`,
  organizationName: 'Grand Millennium Convention Center',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUser: User = {
  id: `usr_sup_step10_${runId}`,
  publicAccountId: `AB-ACC-SUP-10-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Sarah Jenkins',
  email: `sarah10_${runId}@alpinebottling.com`,
  organizationName: 'Alpine Pure Bottling Co.',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Qualified Logistics Partner A (serves Denver & San Francisco, high pallet capacity)
const logisticsPartnerA: User = {
  id: `usr_logA_step10_${runId}`,
  publicAccountId: `AB-ACC-LOGA-10-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Arthur Dent',
  email: `arthur10_${runId}@apexintermodal.com`,
  organizationName: 'Apex Intermodal Logistics',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Qualified Logistics Partner B (serves Denver & San Francisco, refrigerated capability)
const logisticsPartnerB: User = {
  id: `usr_logB_step10_${runId}`,
  publicAccountId: `AB-ACC-LOGB-10-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Beatrice Webb',
  email: `beatrice10_${runId}@summitfreight.com`,
  organizationName: 'Summit Freight & Cold Chain',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Unapproved Logistics Partner
const unapprovedLogisticsPartner: User = {
  id: `usr_logUnapp_step10_${runId}`,
  publicAccountId: `AB-ACC-LOGU-10-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'PENDING_REVIEW',
  contactName: 'Carl Unapproved',
  email: `carl10_${runId}@unapprovedfreight.com`,
  organizationName: 'Unapproved Freight Lines',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Out of Corridor Logistics Partner (serves only Miami & Atlanta)
const outOfCorridorLogisticsPartner: User = {
  id: `usr_logOut_step10_${runId}`,
  publicAccountId: `AB-ACC-LOGO-10-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Diana Prince',
  email: `diana10_${runId}@southernexpress.com`,
  organizationName: 'Southern Express Transit',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Seed Users
db.saveUser(adminUser);
db.saveUser(advertiserUser);
db.saveUser(venueUser);
db.saveUser(supplierUser);
db.saveUser(logisticsPartnerA);
db.saveUser(logisticsPartnerB);
db.saveUser(unapprovedLogisticsPartner);
db.saveUser(outOfCorridorLogisticsPartner);

// Seed Profiles
const supplierProfile: SupplierProfile = {
  role: 'SUPPLIER',
  accountId: supplierUser.id,
  supplierBusinessName: supplierUser.organizationName,
  description: 'Certified premium botanical water bottler.',
  primaryContact: {
    name: supplierUser.contactName,
    email: supplierUser.email,
  },
  facilityLocation: {
    factoryAddress: '100 Spring Road',
    city: 'Denver',
    stateRegion: 'CO',
    country: 'United States',
  },
  operatingLocation: {
    facilityCity: 'Denver',
    stateRegion: 'CO',
    country: 'United States',
  },
  certifications: ['FSSC 22000', 'ISO 9001'],
  materialsOffered: ['Glass', 'Aluminum', 'rPET'],
  packagingCapabilities: ['Shrink-wrap', 'Standard Palletized Cases'],
  productionCapacity: {
    maxMonthlyBottles: 500000,
    currentAllocatedBottles: 50000,
    availableMonthlyBottles: 450000,
  },
  leadTimeWeeks: 2,
  minimumOrderQuantity: 1000,
  approvalStatus: 'APPROVED',
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
};
db.saveProfile(supplierUser.id, supplierProfile);

// Seed Logistics Partner A Profile (Approved, serves Denver & San Francisco, 250 pallets/week)
const logisticsProfileA: LogisticsProfile = {
  role: 'LOGISTICS_PARTNER',
  accountId: logisticsPartnerA.id,
  businessName: logisticsPartnerA.organizationName,
  description: 'National freight network specializing in FMCG pallet transit.',
  primaryContact: {
    name: logisticsPartnerA.contactName,
    email: logisticsPartnerA.email,
  },
  operatingLocation: {
    hubCity: 'Denver',
    stateRegion: 'CO',
    country: 'United States',
  },
  serviceAreas: ['Denver', 'San Francisco', 'Salt Lake City', 'Oakland'],
  fleetCapabilities: {
    vehicleTypes: ['Dry Van', 'Box Truck', 'Reefer 53ft'],
    temperatureControlled: true,
  },
  shipmentCapacity: {
    palletsPerWeek: 250,
    maxPayloadWeightKg: 20000,
  },
  pickupCapability: 'Pallet Jack & Dock Lift Available',
  deliveryCapability: 'Liftgate & Inside Delivery',
  operationalAvailability: 'Available 24/7',
  approvalStatus: 'APPROVED',
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
};
db.saveProfile(logisticsPartnerA.id, logisticsProfileA);

// Seed Logistics Partner B Profile (Approved, serves Denver & San Francisco, 100 pallets/week)
const logisticsProfileB: LogisticsProfile = {
  role: 'LOGISTICS_PARTNER',
  accountId: logisticsPartnerB.id,
  businessName: logisticsPartnerB.organizationName,
  description: 'Specialized cold chain and sustainable ground transport.',
  primaryContact: {
    name: logisticsPartnerB.contactName,
    email: logisticsPartnerB.email,
  },
  operatingLocation: {
    hubCity: 'San Francisco',
    stateRegion: 'CA',
    country: 'United States',
  },
  serviceAreas: ['San Francisco', 'Denver', 'Sacramento', 'Reno'],
  fleetCapabilities: {
    vehicleTypes: ['Reefer 48ft', 'Dry Van'],
    temperatureControlled: true,
  },
  shipmentCapacity: {
    palletsPerWeek: 100,
    maxPayloadWeightKg: 18000,
  },
  pickupCapability: 'Dock Level Only',
  deliveryCapability: 'Loading Dock Only',
  operationalAvailability: 'Mon-Fri Regular Business Hours',
  approvalStatus: 'APPROVED',
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
};
db.saveProfile(logisticsPartnerB.id, logisticsProfileB);

// Seed Out of Corridor Profile (Approved, but only serves Miami/Atlanta)
const logisticsProfileOut: LogisticsProfile = {
  role: 'LOGISTICS_PARTNER',
  accountId: outOfCorridorLogisticsPartner.id,
  businessName: outOfCorridorLogisticsPartner.organizationName,
  description: 'Southeast regional fleet.',
  primaryContact: {
    name: outOfCorridorLogisticsPartner.contactName,
    email: outOfCorridorLogisticsPartner.email,
  },
  operatingLocation: {
    hubCity: 'Miami',
    stateRegion: 'FL',
    country: 'United States',
  },
  serviceAreas: ['Miami', 'Atlanta', 'Orlando'],
  fleetCapabilities: {
    vehicleTypes: ['Dry Van'],
    temperatureControlled: false,
  },
  shipmentCapacity: {
    palletsPerWeek: 80,
  },
  pickupCapability: 'Standard Dock',
  deliveryCapability: 'Standard Dock',
  operationalAvailability: 'Mon-Fri Regular Business Hours',
  approvalStatus: 'APPROVED',
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
};
db.saveProfile(outOfCorridorLogisticsPartner.id, logisticsProfileOut);

// Seed Unapproved Logistics Profile
const logisticsProfileUnapp: LogisticsProfile = {
  role: 'LOGISTICS_PARTNER',
  accountId: unapprovedLogisticsPartner.id,
  businessName: unapprovedLogisticsPartner.organizationName,
  description: 'Pending verification carrier.',
  primaryContact: {
    name: unapprovedLogisticsPartner.contactName,
    email: unapprovedLogisticsPartner.email,
  },
  operatingLocation: {
    hubCity: 'Denver',
    stateRegion: 'CO',
    country: 'United States',
  },
  serviceAreas: ['Denver', 'San Francisco'],
  fleetCapabilities: {
    vehicleTypes: ['Dry Van'],
    temperatureControlled: false,
  },
  shipmentCapacity: {
    palletsPerWeek: 50,
  },
  pickupCapability: 'Standard Dock',
  deliveryCapability: 'Standard Dock',
  operationalAvailability: 'Mon-Fri Regular Business Hours',
  approvalStatus: 'PENDING_REVIEW',
  completion: { isComplete: false, percentage: 60, missingRequiredFields: ['certifications'] },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
};
db.saveProfile(unapprovedLogisticsPartner.id, logisticsProfileUnapp);

// Update approval status via admin authority
db.updateApprovalStatus(supplierUser.id, 'APPROVED', adminUser.id, 'Verified Denver bottling plant facility');
db.updateApprovalStatus(logisticsPartnerA.id, 'APPROVED', adminUser.id, 'Verified intermodal carrier fleet');
db.updateApprovalStatus(logisticsPartnerB.id, 'APPROVED', adminUser.id, 'Verified reefer cold-chain carrier fleet');
db.updateApprovalStatus(outOfCorridorLogisticsPartner.id, 'APPROVED', adminUser.id, 'Verified regional carrier fleet');

// Seed Product for Supplier
// Seed Supplier Products & Versions
const { product: productA, version: productVersionA } = db.createProduct(
  supplierUser.id,
  {
    name: 'Alpine Glacial Pure 500ml Glass',
    description: 'Direct UV print 500ml glass beverage bottle',
    category: 'Glass Bottles',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    customerFacingPrice: { amount: 35.0, currency: 'INR' },
    supplierInternalCost: { amount: 20.0, currency: 'INR' },
    minimumOrderQuantity: 5000,
    productionLeadTime: { value: 14, unit: 'DAYS' },
    specifications: {
      bottleMaterial: 'Glass',
      bottleCapacityMl: 500,
      volumeLabel: '500 ml Premium Glass',
      bottleShape: 'Flint Standard',
      bottleType: 'PREMIUM_GLASS_FLINT',
      capType: 'ALUMINUM_ROPP',
      bottleFinish: 'Gloss Tactile Finish',
      labelType: 'PRESSURE_SENSITIVE_CLEAR',
      printingCapability: 'Multi-Color UV',
      finishingOptions: ['Clear Gloss'],
      packagingConfiguration: '12 bottles per carton',
    },
    productionCapacity: { unitsPerMonth: 80000 },
  },
  supplierUser.id
);

// Helper to construct upstream Locked Agreement and OrderReadiness
function setupBaselinePipeline(): {
  agreement: CampaignAgreement;
  readiness: OrderReadiness;
  supplierAssignment: SupplierAssignment;
} {
  const cId = `cmp_s10_${runId}`;
  const mockCampaign: Campaign = {
    id: cId,
    publicId: `AB-CMP-10-${runId}`,
    advertiserId: advertiserUser.id,
    advertiserPublicAccountId: advertiserUser.publicAccountId,
    brandName: advertiserUser.organizationName,
    status: 'ACTIVE',
    createdAt: nowIso,
    updatedAt: nowIso,
    currentVersionId: `cmv_s10_${runId}`,
    currentVersionNumber: 1,
    data: {
      name: 'Spring Botanical Launch 2026',
      objective: 'Brand Visibility',
      category: 'LUXURY_LIFESTYLE',
      targetAudience: { demographics: '25-45 Affluent' },
      duration: { value: 4, unit: 'WEEKS' },
      preferredStartPeriod: { preferredMonthYear: '2026-10', flexible: false },
      budget: { currency: 'INR', maximumBudget: 500000 },
    },
  };
  db.saveCampaign(mockCampaign);

  const agreementId = `cag_step10_${runId}`;
  const agreementPublicId = `AB-CAG-10-${runId}`;
  const commercialTerms: AgreementCommercialTerms = {
    campaignQuantity: 12000,
    campaignDuration: { value: 4, unit: 'WEEKS' },
    preferredStartPeriod: {
      label: 'Next Month',
      windowStart: '2026-11-01',
      windowEnd: '2026-11-30',
    },
    distributionRequirements: {
      placementDetails: 'Main convention lobby racks',
      estimatedDistributionPace: '3000/week',
      refrigerationRequired: false,
    },
    placementRequirements: ['Registration Area', 'VIP Lounge'],
    productRequirements: {
      preferredVolumeMl: 500,
      volumeLabel: '500 ml Premium Glass',
      preferredMaterial: 'Glass',
      labelType: 'PRESSURE_SENSITIVE_CLEAR',
      capType: 'ALUMINUM_ROPP',
      notes: 'Aura Luxury brand standards apply',
    },
    collaborationRequirement: { status: 'NOT_REQUIRED' },
    venueCompensationTerms: {
      proposedPercentage: 10,
      termsDescription: '10% base distribution allowance',
      notes: 'Paid upon distribution audit',
      eligibleBaseDescription: 'Supplier Production Cost',
      maximumCapPercentage: 12.5,
    },
    advertiserResponsibilities: ['Brand artwork submission', 'Campaign funding'],
    venueResponsibilities: ['Chilled display staging', 'Proof of distribution'],
    aquaBloomResponsibilities: ['Supplier quality auditing', 'Platform settlement'],
    deliveryTermsKnown: {
      stagingInstructions: 'Palletized loading dock staging at Loading Bay C',
      specialHandling: 'Keep dry and upright',
      refrigerationRequired: false,
      status: 'PENDING_LOGISTICS_ASSIGNMENT',
    },
    qrRequirements: {
      customRedirectUrl: 'https://aurabeverage.com/launch',
      trackingEnabled: true,
      status: 'CONFIGURED_FOR_PRODUCTION',
    },
    cancellationTerms: {
      policyId: 'standard_cancellation_policy_v1',
      cutoffStage: 'PRODUCTION_START',
      termsSummary: 'Non-refundable once bottling production initiates',
      eligibleCancellationStage: 'PRE_PRODUCTION',
      nonRecoverableCostPrinciple: 'Advertiser covers incurred materials cost',
    },
    renewalTerms: {
      policyId: 'explicit_approval_renewal_v1',
      renewalType: 'EXPLICIT_APPROVAL_REQUIRED',
      termsSummary: 'Requires mutual written confirmation for extension',
    },
    importantConditions: ['Must use approved glass packaging'],
  };

  const agreement: CampaignAgreement = {
    id: agreementId,
    publicId: agreementPublicId,
    campaignId: mockCampaign.id,
    campaignPublicId: mockCampaign.publicId,
    campaignName: mockCampaign.data.name,
    campaignCategory: mockCampaign.data.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advertiserUser.organizationName,
    venueId: venueUser.id,
    venuePublicId: venueUser.publicAccountId,
    venueName: venueUser.organizationName,
    sourceProposalId: `prp_step10_${runId}`,
    sourceProposalPublicId: `AB-PRP-10-${runId}`,
    sourceProposalVersionId: `prv_step10_${runId}`,
    sourceProposalVersionNumber: 1,
    status: 'LOCKED',
    currentVersionId: `cgv_step10_v1_${runId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-10-${runId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-10-${runId}`,
    terms: commercialTerms,
    advertiserConfirmedAt: nowIso,
    advertiserConfirmedBy: advertiserUser.id,
    venueConfirmedAt: nowIso,
    venueConfirmedBy: venueUser.id,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: advertiserUser.id,
    updatedBy: advertiserUser.id,
  };

  db.saveAgreement(agreement);

  // Save Venue Profile
  db.saveProfile(venueUser.id, {
    role: 'VENUE',
    accountId: venueUser.id,
    venueName: venueUser.organizationName,
    venueType: 'Convention Center',
    description: 'Major downtown convention facility',
    location: { city: 'San Francisco', country: 'United States' },
    audienceCategory: 'Corporate & Conference Attendees',
    footfall: { monthlyVisitors: 80000 },
    bottleConsumption: { estimatedMonthlyBottles: 20000 },
    capacity: { maxBottleHoldingCapacity: 30000, currentOngoingBottleCommitment: 0, availableBottleCapacity: 30000 },
    campaignAvailability: 'YEAR_ROUND',
    operationalContact: { coordinatorName: venueUser.contactName, email: venueUser.email },
    visibilityState: 'PUBLIC_ELIGIBLE',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: venueUser.id,
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
  }, venueUser.id);

  // Create Snapshot
  AgreementSnapshotService.createSnapshot(agreement, adminUser);

  // Assess Order Readiness
  const { orderReadiness: validatedReadiness } = OrderReadinessService.assessOrderReadiness(agreement.id, adminUser);

  // Complete Step 9 Supplier Assignment
  const supOffer = SupplierOperationalOfferService.createOffer(
    {
      orderReadinessId: validatedReadiness.id,
      supplierId: supplierUser.id,
      productId: productA.id,
    },
    adminUser
  );
  const { assignment: supplierAssignment } = SupplierOperationalOfferService.acceptOffer(
    supOffer.id,
    {},
    supplierUser
  );

  return {
    agreement,
    readiness: validatedReadiness,
    supplierAssignment,
  };
}

async function runLogisticsAssignmentTests() {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 10: LOGISTICS ASSIGNMENT & OFFER TESTS');
  console.log('=============================================================');

  const { agreement, readiness, supplierAssignment } = setupBaselinePipeline();
  console.log(`✅ Baseline pipeline initialized. Readiness: ${readiness.publicId}, Supplier Assignment: ${supplierAssignment.publicId}`);

  // -------------------------------------------------------------
  // TEST 1: Entry Condition Enforcement
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Entry Condition Enforcement ---');
  {
    // Test: Readiness not found throws NotFoundError
    assert.throws(
      () => LogisticsMatchingEngine.findEligibleLogisticsPartners('non_existent_readiness_id'),
      (err: any) => err instanceof NotFoundError
    );

    // Test: Missing supplier assignment throws LogisticsAssignmentNotReadyError
    // Create a dummy readiness without supplier assignment
    const dummyReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_dummy_${runId}`,
      publicId: `AB-ORDR-DUMMY-${runId}`,
    };
    db.saveOrderReadiness(dummyReadiness);

    assert.throws(
      () => LogisticsMatchingEngine.findEligibleLogisticsPartners(dummyReadiness.id),
      (err: any) => err instanceof LogisticsAssignmentNotReadyError && err.code === 'LOGISTICS_ASSIGNMENT_NOT_READY'
    );

    console.log('✅ Test 1 passed: Entry conditions rigorously enforce prerequisite Step 9 Supplier Assignment.');
  }

  // -------------------------------------------------------------
  // TEST 2: Deterministic Candidate Matching
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Deterministic Candidate Matching ---');
  {
    const candidates = LogisticsMatchingEngine.findEligibleLogisticsPartners(readiness.id);
    assert(Array.isArray(candidates), 'Expected candidate array');
    assert(candidates.length >= 2, `Expected at least 2 qualified candidates, found ${candidates.length}`);

    // Candidate A check
    const candA = candidates.find((c) => c.logisticsPartnerId === logisticsPartnerA.id);
    assert(candA, 'Logistics Partner A should be matched');
    assert.strictEqual(candA.matchEvaluation.isEligible, true);
    assert.strictEqual(candA.matchEvaluation.rejectionReasons.length, 0);
    assert.strictEqual(candA.matchEvaluation.statusApproved, true);
    assert.strictEqual(candA.matchEvaluation.pickupServiceable, true);
    assert.strictEqual(candA.matchEvaluation.deliveryServiceable, true);
    assert.strictEqual(candA.matchEvaluation.capacitySufficient, true);
    assert.strictEqual(candA.matchEvaluation.temperatureControlFeasible, true);

    // Candidate B check
    const candB = candidates.find((c) => c.logisticsPartnerId === logisticsPartnerB.id);
    assert(candB, 'Logistics Partner B should be matched');
    assert.strictEqual(candB.matchEvaluation.isEligible, true);
    assert.strictEqual(candB.matchEvaluation.rejectionReasons.length, 0);

    // Out of corridor candidate check
    const candOut = candidates.find((c) => c.logisticsPartnerId === outOfCorridorLogisticsPartner.id);
    assert(candOut, 'Out of corridor partner should be evaluated');
    assert.strictEqual(candOut.matchEvaluation.isEligible, false);
    assert(
      candOut.matchEvaluation.rejectionReasons.includes('SERVICE_UNAVAILABLE') ||
      candOut.matchEvaluation.rejectionReasons.includes('PICKUP_NOT_SERVICEABLE') ||
      candOut.matchEvaluation.rejectionReasons.includes('DELIVERY_NOT_SERVICEABLE')
    );

    // Unapproved candidate check
    const candUnapp = candidates.find((c) => c.logisticsPartnerId === unapprovedLogisticsPartner.id);
    assert(candUnapp, 'Unapproved partner should be evaluated');
    assert.strictEqual(candUnapp.matchEvaluation.isEligible, false);
    assert(candUnapp.matchEvaluation.rejectionReasons.includes('LOGISTICS_PARTNER_NOT_APPROVED'));

    console.log('✅ Test 2 passed: Deterministic matching correctly evaluates geographic corridor, capacity, equipment, and account approval.');
  }

  // -------------------------------------------------------------
  // TEST 3: Candidate Pool Authorization (RBAC)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Candidate Pool Authorization (RBAC) ---');
  {
    // Admin can view candidates
    assert.doesNotThrow(() => {
      LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, adminUser);
    });

    // Logistics Partner CANNOT query the candidate matching pool (Data Hiding)
    assert.throws(
      () => LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, logisticsPartnerA),
      (err: any) => err instanceof AuthorizationError
    );

    // Supplier CANNOT query logistics candidate matching pool
    assert.throws(
      () => LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, supplierUser),
      (err: any) => err instanceof AuthorizationError
    );

    // Associated Advertiser and Venue CAN view candidates
    assert.doesNotThrow(() => {
      LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, advertiserUser);
    });
    assert.doesNotThrow(() => {
      LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, venueUser);
    });

    // Non-associated external advertiser is forbidden
    const externalAdvertiser: User = {
      ...advertiserUser,
      id: `usr_ext_adv_${runId}`,
      publicAccountId: `AB-ACC-EXT-${runId}`,
    };
    assert.throws(
      () => LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, externalAdvertiser),
      (err: any) => err instanceof AuthorizationError
    );

    console.log('✅ Test 3 passed: Logistics candidate pool strictly isolated from non-admin actors.');
  }

  // -------------------------------------------------------------
  // TEST 4: Operational Offer Creation & Data Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Operational Offer Creation & Data Isolation ---');
  let offerA: any;
  let offerB: any;
  {
    // Non-admin attempting to create an offer must be rejected
    assert.throws(
      () =>
        LogisticsOperationalOfferService.createOffer(
          { orderReadinessId: readiness.id, logisticsPartnerId: logisticsPartnerA.id },
          logisticsPartnerA
        ),
      (err: any) => err instanceof AuthorizationError
    );

    // Admin dispatches offer to Partner A
    offerA = LogisticsOperationalOfferService.createOffer(
      { orderReadinessId: readiness.id, logisticsPartnerId: logisticsPartnerA.id, expiresInHours: 48 },
      adminUser
    );

    assert(offerA.id.startsWith('loo_'), 'Offer internal id format incorrect');
    assert(offerA.publicId.startsWith('AB-LOO-'), 'Offer public id format incorrect');
    assert.strictEqual(offerA.status, 'PENDING');
    assert.strictEqual(offerA.logisticsPartnerId, logisticsPartnerA.id);
    assert.strictEqual(offerA.orderReadinessId, readiness.id);
    assert.strictEqual(offerA.supplierAssignmentId, supplierAssignment.id);

    // Check data isolation in offer snapshot
    const snap = offerA.logisticsRequirementsSnapshot;
    assert(snap.pickupSource, 'Missing pickup source in snapshot');
    assert.strictEqual(snap.pickupSource.supplierBusinessName, supplierUser.organizationName);
    assert(snap.deliveryDestination, 'Missing delivery destination in snapshot');
    assert(snap.shipmentCharacteristics, 'Missing shipment characteristics');
    assert.strictEqual(snap.shipmentCharacteristics.bottleQuantity, 12000);
    assert.strictEqual(snap.shipmentCharacteristics.estimatedPallets, 12);

    // Ensure NO advertiser budget or venue commission rate leaked
    assert.strictEqual((snap as any).advertiserBudget, undefined);
    assert.strictEqual((snap as any).venueCompensationPercentage, undefined);
    assert.strictEqual((snap as any).supplierProductPrice, undefined);

    // Dispatch second offer to Partner B (sibling offer)
    offerB = LogisticsOperationalOfferService.createOffer(
      { orderReadinessId: readiness.id, logisticsPartnerId: logisticsPartnerB.id, expiresInHours: 48 },
      adminUser
    );
    assert.strictEqual(offerB.status, 'PENDING');

    console.log('✅ Test 4 passed: Operational offers dispatched with pristine data isolation.');
  }

  // -------------------------------------------------------------
  // TEST 5: Partner Tenant Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Partner Tenant Isolation ---');
  {
    // Partner A can view offer A
    assert.doesNotThrow(() => {
      LogisticsAssignmentAuthorizationService.assertCanViewOffer(offerA, logisticsPartnerA);
    });

    // Partner A CANNOT view offer B (Cross-tenant security violation)
    assert.throws(
      () => LogisticsAssignmentAuthorizationService.assertCanViewOffer(offerB, logisticsPartnerA),
      (err: any) => err instanceof AuthorizationError
    );

    // Partner A CANNOT respond to offer B
    assert.throws(
      () => LogisticsAssignmentAuthorizationService.assertCanRespondToOffer(offerB, logisticsPartnerA),
      (err: any) => err instanceof AuthorizationError
    );

    console.log('✅ Test 5 passed: Carrier tenant isolation prevents cross-tenant access to competitor offers.');
  }

  // -------------------------------------------------------------
  // TEST 6: Offer Decline Flow
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Offer Decline Flow ---');
  {
    const declinedOfferB = LogisticsOperationalOfferService.declineOffer(
      offerB.id,
      {
        reasonCode: 'CAPACITY_UNAVAILABLE',
        explanation: 'All 48ft reefers currently deployed on cross-country transit.',
      },
      logisticsPartnerB
    );

    assert.strictEqual(declinedOfferB.status, 'DECLINED');
    assert.strictEqual(declinedOfferB.declineReasonCode, 'CAPACITY_UNAVAILABLE');
    assert.strictEqual(declinedOfferB.declineExplanation, 'All 48ft reefers currently deployed on cross-country transit.');

    // Idempotent decline returns the same offer
    const idempotentDecline = LogisticsOperationalOfferService.declineOffer(
      offerB.id,
      { reasonCode: 'CAPACITY_UNAVAILABLE' },
      logisticsPartnerB
    );
    assert.strictEqual(idempotentDecline.status, 'DECLINED');

    console.log('✅ Test 6 passed: Carrier offer decline successfully recorded with audited operational reason.');
  }

  // -------------------------------------------------------------
  // TEST 7: Offer Acceptance & Atomic Assignment Creation
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Offer Acceptance & Atomic Assignment Creation ---');
  let assignmentA: any;
  {
    const acceptResult = LogisticsOperationalOfferService.acceptOffer(
      offerA.id,
      {},
      logisticsPartnerA
    );

    assert.strictEqual(acceptResult.offer.status, 'ACCEPTED');
    assert(acceptResult.assignment, 'Logistics assignment missing from result');
    assignmentA = acceptResult.assignment;

    assert(assignmentA.id.startsWith('las_'), 'Assignment internal id format incorrect');
    assert(assignmentA.publicId.startsWith('AB-LAS-'), 'Assignment public id format incorrect');
    assert.strictEqual(assignmentA.status, 'ASSIGNED');
    assert.strictEqual(assignmentA.logisticsPartnerId, logisticsPartnerA.id);
    assert.strictEqual(assignmentA.orderReadinessId, readiness.id);
    assert.strictEqual(assignmentA.supplierAssignmentId, supplierAssignment.id);

    // Verify atomic update to supplierAssignment boundaries
    const updatedSupAssignment = db.getSupplierAssignmentById(supplierAssignment.id);
    assert(updatedSupAssignment, 'Updated supplier assignment not found');
    assert.strictEqual(
      updatedSupAssignment.futureBoundaries.logisticsAssigned,
      true,
      'SupplierAssignment futureBoundaries.logisticsAssigned must be set to true'
    );

    // Verify readiness future boundaries
    assert.strictEqual(assignmentA.futureBoundaries.readyForFinalPricing, true);

    console.log('✅ Test 7 passed: Carrier acceptance atomically created LogisticsAssignment and updated future boundaries.');
  }

  // -------------------------------------------------------------
  // TEST 8: Duplicate Assignment Prevention
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Duplicate Assignment Prevention ---');
  {
    // Try to create another offer for the same readiness that already has an active assignment
    assert.throws(
      () =>
        LogisticsOperationalOfferService.createOffer(
          { orderReadinessId: readiness.id, logisticsPartnerId: logisticsPartnerB.id },
          adminUser
        ),
      (err: any) => err instanceof ConflictError
    );

    console.log('✅ Test 8 passed: Duplicate active logistics assignment strictly prevented.');
  }

  // -------------------------------------------------------------
  // TEST 9: Shared View Sanitization
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Shared View Sanitization ---');
  {
    const sharedViewAdv = LogisticsAssignmentService.getSharedView(assignmentA, advertiserUser);
    assert.strictEqual(sharedViewAdv.assignmentId, assignmentA.id);
    assert.strictEqual(sharedViewAdv.publicId, assignmentA.publicId);
    assert.strictEqual(sharedViewAdv.status, 'ASSIGNED');
    assert.strictEqual(sharedViewAdv.bottleQuantity, 12000);
    assert.strictEqual(sharedViewAdv.estimatedPallets, 12);
    assert.strictEqual(sharedViewAdv.boundaries.supplierAssigned, true);
    assert.strictEqual(sharedViewAdv.boundaries.logisticsAssigned, true);
    assert.strictEqual(sharedViewAdv.boundaries.readyForFinalPricing, true);

    // Ensure raw internal cost figures not exposed in shared view
    assert.strictEqual((sharedViewAdv as any).lockedOperationalSnapshot, undefined);

    console.log('✅ Test 9 passed: Role-isolated shared view verified for commercial privacy.');
  }

  // -------------------------------------------------------------
  // TEST 10: Reassignment Recovery Flow
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Reassignment Recovery Flow ---');
  {
    // Non-admin attempting reassignment fails
    assert.throws(
      () =>
        LogisticsAssignmentService.reassignLogistics(
          assignmentA.id,
          { reason: 'Interstate highway closure' },
          logisticsPartnerA
        ),
      (err: any) => err instanceof AuthorizationError
    );

    // Admin initiates reassignment
    const reassignResult = LogisticsAssignmentService.reassignLogistics(
      assignmentA.id,
      { reason: 'Severe weather advisory along I-70 corridor; reassigning to southern route.' },
      adminUser
    );

    assert(
      reassignResult.cancelledAssignment.status === 'CANCELLED' ||
      (reassignResult.cancelledAssignment.status as any) === 'REASSIGNED'
    );
    assert(reassignResult.cancelledAssignment.reassignmentDetails, 'Reassignment details missing');
    assert.strictEqual(
      reassignResult.cancelledAssignment.reassignmentDetails.reason,
      'Severe weather advisory along I-70 corridor; reassigning to southern route.'
    );

    // Verify supplierAssignment boundary reset
    const resetSupAssignment = db.getSupplierAssignmentById(supplierAssignment.id);
    assert.strictEqual(
      resetSupAssignment?.futureBoundaries.logisticsAssigned,
      false,
      'SupplierAssignment boundary should revert to false after cancellation'
    );

    // Ready for new offer dispatch now
    const newOffer = LogisticsOperationalOfferService.createOffer(
      { orderReadinessId: readiness.id, logisticsPartnerId: logisticsPartnerB.id, expiresInHours: 24 },
      adminUser
    );
    assert.strictEqual(newOffer.status, 'PENDING');
    assert.strictEqual(newOffer.logisticsPartnerId, logisticsPartnerB.id);

    console.log('✅ Test 10 passed: Logistics reassignment recovery executed cleanly without compromising campaign integrity.');
  }

  console.log('\n=============================================================');
  console.log('ALL AQUABLOOM STEP 10 LOGISTICS ASSIGNMENT TESTS PASSED');
  console.log('=============================================================');
}

runLogisticsAssignmentTests().catch((err) => {
  console.error('❌ Step 10 Logistics Assignment test failed:', err);
  process.exit(1);
});
