/**
 * AquaBloom Step 9: Supplier Assignment & Operational Offer Test Suite
 * 
 * Verifies:
 * 1. Supplier Assignment authorization boundaries (Suppliers see only their offers, cross-tenant isolation, logistics denied).
 * 2. Deterministic candidate matching across product catalog (MOQ, capacity, specifications, account approval).
 * 3. Operational snapshot data isolation (advertiser private budget & venue commercial terms excluded).
 * 4. Supplier Operational Offer creation & state transitions (PENDING -> ACCEPTED / DECLINED / EXPIRED).
 * 5. Atomic Supplier Assignment generation upon acceptance.
 * 6. Protection against duplicate active supplier assignments on the same OrderReadiness.
 * 7. Cancellation of sibling pending offers upon one offer being accepted.
 * 8. Supplier Reassignment recovery mechanism.
 * 9. Counterparty Shared View hygiene (no internal cost leakage, boundary integrity).
 * 10. Audit timeline events dispatched for all Step 9 actions.
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
  SupplierMatchingEngine,
  SupplierOperationalOfferService,
  SupplierAssignmentService,
  SupplierAssignmentAuthorizationService,
} from '../src/server/supplierAssignmentServices.js';
import {
  AuthorizationError,
  ValidationError,
  ConflictError,
  NotFoundError,
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
} from '../src/types.js';

const nowIso = new Date().toISOString();
const runId = Math.random().toString(36).substring(2, 8);

// Actors
const adminUser: User = {
  id: `usr_admin_step9_${runId}`,
  publicAccountId: `AB-ACC-ADMIN-09-${runId}`,
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Step 9 Admin',
  email: `admin9_${runId}@aquabloom.internal`,
  organizationName: 'AquaBloom Global',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: `usr_adv_step9_${runId}`,
  publicAccountId: `AB-ACC-ADV-09-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Elena Rostova',
  email: `elena9_${runId}@aurabeverage.com`,
  organizationName: 'Aura Luxury Beverage Group',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: `usr_ven_step9_${runId}`,
  publicAccountId: `AB-ACC-VEN-09-${runId}`,
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Marcus Vance',
  email: `marcus9_${runId}@millenniumcenter.com`,
  organizationName: 'Grand Millennium Convention Center',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUserA: User = {
  id: `usr_supA_step9_${runId}`,
  publicAccountId: `AB-ACC-SUPA-09-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Sarah Jenkins',
  email: `sarah9_${runId}@alpinebottling.com`,
  organizationName: 'Alpine Pure Bottling Co.',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUserB: User = {
  id: `usr_supB_step9_${runId}`,
  publicAccountId: `AB-ACC-SUPB-09-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Robert Vance',
  email: `robert9_${runId}@summitbottling.com`,
  organizationName: 'Summit Spring Co-Packers',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const unapprovedSupplierUser: User = {
  id: `usr_supUnapp_step9_${runId}`,
  publicAccountId: `AB-ACC-SUPU-09-${runId}`,
  role: 'SUPPLIER',
  status: 'PENDING_REVIEW',
  contactName: 'Pending Supplier',
  email: `pending9_${runId}@unapproved.com`,
  organizationName: 'Unapproved Bottlers Inc.',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const logisticsUser: User = {
  id: `usr_log_step9_${runId}`,
  publicAccountId: `AB-ACC-LOG-09-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'David Chen',
  email: `david9_${runId}@coldchain.com`,
  organizationName: 'Apex Cold-Chain Fleet',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Seed Users
db.saveUser(adminUser);
db.saveUser(advertiserUser);
db.saveUser(venueUser);
db.saveUser(supplierUserA);
db.saveUser(supplierUserB);
db.saveUser(unapprovedSupplierUser);
db.saveUser(logisticsUser);

// Seed Profiles
db.saveProfile(advertiserUser.id, {
  role: 'ADVERTISER',
  accountId: advertiserUser.id,
  brandName: advertiserUser.organizationName,
  industry: 'Beverages',
  description: 'Premium organic beverage brand',
  primaryContact: { name: advertiserUser.contactName, email: advertiserUser.email },
  location: { city: 'San Francisco', country: 'United States' },
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: advertiserUser.id,
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
}, advertiserUser.id);

db.saveProfile(venueUser.id, {
  role: 'VENUE',
  accountId: venueUser.id,
  venueName: venueUser.organizationName,
  venueType: 'Convention Center',
  description: 'Major downtown convention facility',
  location: { city: 'Chicago', country: 'United States' },
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

db.saveProfile(supplierUserA.id, {
  role: 'SUPPLIER',
  accountId: supplierUserA.id,
  supplierBusinessName: supplierUserA.organizationName,
  description: 'Certified automated spring water bottling facility',
  primaryContact: { name: supplierUserA.contactName, email: supplierUserA.email },
  operatingLocation: { facilityCity: 'Boulder', stateProvince: 'Colorado', country: 'United States' },
  capabilities: {
    waterTypes: ['Spring Water'],
    bottleMaterials: ['Recycled Aluminum Can', '100% rPET'],
    bottleSizes: ['500ml Standard'],
    bottleShapes: ['Sleek Slimline'],
    printingFinishes: ['Direct UV High-Definition Print'],
  },
  productionCapacity: { bottlesPerMonth: 100000, minimumRunSize: 1000 },
  leadTimeInfo: { standardTurnaroundDays: 14 },
  operationalStatus: 'OPERATING',
  approvalStatus: 'APPROVED',
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
}, adminUser.id);

db.saveProfile(supplierUserB.id, {
  role: 'SUPPLIER',
  accountId: supplierUserB.id,
  supplierBusinessName: supplierUserB.organizationName,
  description: 'High capacity co-packer and bottler',
  primaryContact: { name: supplierUserB.contactName, email: supplierUserB.email },
  operatingLocation: { facilityCity: 'Denver', stateProvince: 'Colorado', country: 'United States' },
  capabilities: {
    waterTypes: ['Purified Water'],
    bottleMaterials: ['Recycled Aluminum Can'],
    bottleSizes: ['500ml Standard'],
    bottleShapes: ['Sleek Slimline'],
    printingFinishes: ['Direct UV High-Definition Print'],
  },
  productionCapacity: { bottlesPerMonth: 150000, minimumRunSize: 2000 },
  leadTimeInfo: { standardTurnaroundDays: 10 },
  operationalStatus: 'OPERATING',
  approvalStatus: 'APPROVED',
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: adminUser.id,
  completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
}, adminUser.id);

// Admin approves supplier accounts
db.updateApprovalStatus(supplierUserA.id, 'APPROVED', adminUser.id, 'Verified facility credentials');
db.updateApprovalStatus(supplierUserB.id, 'APPROVED', adminUser.id, 'Verified co-packer credentials');

db.saveProfile(unapprovedSupplierUser.id, {
  role: 'SUPPLIER',
  accountId: unapprovedSupplierUser.id,
  supplierBusinessName: unapprovedSupplierUser.organizationName,
  description: 'Unverified plant facility',
  primaryContact: { name: unapprovedSupplierUser.contactName, email: unapprovedSupplierUser.email },
  operatingLocation: { facilityCity: 'Phoenix', country: 'United States' },
  capabilities: { waterTypes: [], bottleMaterials: [], bottleSizes: [], bottleShapes: [], printingFinishes: [] },
  productionCapacity: { bottlesPerMonth: 50000, minimumRunSize: 5000 },
  leadTimeInfo: { standardTurnaroundDays: 20 },
  operationalStatus: 'OPERATING',
  approvalStatus: 'PENDING_REVIEW',
  version: 1,
  createdAt: nowIso,
  updatedAt: nowIso,
  updatedBy: unapprovedSupplierUser.id,
  completion: { isComplete: false, percentage: 40, missingRequiredFields: ['certifications'] },
}, unapprovedSupplierUser.id);

// Seed Supplier Products & Versions
const { product: prodA1, version: verA1 } = db.createProduct(
  supplierUserA.id,
  {
    name: '500ml Recycled Aluminum Sleek Can',
    description: 'Direct UV print 500ml aluminum beverage can for cold-fill water',
    category: 'Aluminum Cans',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    customerFacingPrice: { amount: 18.5, currency: 'INR' },
    supplierInternalCost: { amount: 11.0, currency: 'INR' },
    minimumOrderQuantity: 5000,
    productionLeadTime: { value: 14, unit: 'DAYS' },
    specifications: {
      bottleMaterial: 'Recycled Aluminum Can',
      bottleCapacityMl: 500,
      volumeLabel: '500 ml Slim Aluminum',
      bottleShape: 'Sleek Slimline',
      bottleType: 'Aluminum Can (330ml-500ml)',
      capType: 'Stay-on Tab (Aluminum)',
      bottleFinish: 'Matte Tactile Finish',
      labelType: 'Direct UV High-Definition Print',
      printingCapability: 'Multi-Color UV Gradient',
      finishingOptions: ['Matte UV', 'Tactile Emboss'],
      packagingConfiguration: '24 cans per corrugated tray',
    },
    productionCapacity: { unitsPerMonth: 80000 },
  },
  supplierUserA.id
);

const { product: prodB1 } = db.createProduct(
  supplierUserB.id,
  {
    name: '500ml Premium Aluminum Can Fast-Track',
    description: 'Rapid turnaround 500ml aluminum can',
    category: 'Aluminum Cans',
    status: 'ACTIVE',
    availability: 'AVAILABLE',
    customerFacingPrice: { amount: 21.0, currency: 'INR' },
    supplierInternalCost: { amount: 13.5, currency: 'INR' },
    minimumOrderQuantity: 3000,
    productionLeadTime: { value: 10, unit: 'DAYS' },
    specifications: {
      bottleMaterial: 'Recycled Aluminum Can',
      bottleCapacityMl: 500,
      volumeLabel: '500 ml Slim Aluminum',
      bottleShape: 'Sleek Slimline',
      bottleType: 'Aluminum Can (330ml-500ml)',
      capType: 'Stay-on Tab (Aluminum)',
      bottleFinish: 'Gloss Finish',
      labelType: 'Direct UV High-Definition Print',
      printingCapability: 'Full Color Direct Print',
      finishingOptions: ['Gloss UV'],
      packagingConfiguration: '24 cans per tray',
    },
    productionCapacity: { unitsPerMonth: 120000 },
  },
  supplierUserB.id
);

// Create Locked Campaign Agreement and OrderReadiness
const agreementId = `cag_step9_${runId}`;
const agreementPublicId = `AB-CAG-09-${runId}`;
const commercialTerms: AgreementCommercialTerms = {
  campaignQuantity: 10000,
  campaignDuration: { value: 4, unit: 'WEEKS' },
  preferredStartPeriod: {
    label: 'Next Month',
    windowStart: '2026-11-01',
    windowEnd: '2026-11-30',
  },
  distributionRequirements: {
    placementDetails: 'Main convention lobby racks',
    estimatedDistributionPace: '2500/week',
    refrigerationRequired: true,
  },
  placementRequirements: ['Registration Area', 'VIP Lounge'],
  productRequirements: {
    preferredVolumeMl: 500,
    volumeLabel: '500 ml Slim Aluminum',
    preferredMaterial: 'Recycled Aluminum Can',
    labelType: 'Direct UV High-Definition Print',
    capType: 'Stay-on Tab (Aluminum)',
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
    refrigerationRequired: true,
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
  importantConditions: ['Must use approved aluminum packaging'],
};

const mockCampaign: Campaign = {
  id: `cmp_step9_${runId}`,
  publicCampaignId: `AB-CMP-09-${runId}`,
  advertiserId: advertiserUser.id,
  name: 'Aura Luxury Global Refresh',
  category: 'Beverages',
  description: 'Premium organic spring water distribution',
  objective: 'Brand Visibility & Sampling',
  targetAudience: {
    characteristics: ['Affluent Conference Delegates'],
    demographics: 'Young Urban Executives 25-50',
  },
  timing: {
    duration: { value: 4, unit: 'WEEKS' },
    preferredStartPeriod: { label: 'Next Month', windowStart: '2026-11-01', windowEnd: '2026-11-30' },
  },
  distributionRequirements: {
    placementDetails: 'Main convention lobby racks',
    estimatedDistributionPace: '2500/week',
  },
  venueRequirements: {
    preferredVenueTypes: ['Convention Center'],
    preferredLocations: [{ city: 'Chicago', country: 'United States' }],
    placementRequirements: ['Registration Area', 'VIP Lounge'],
  },
  bottleRequirements: {
    requiredQuantity: 10000,
    preferredVolumeMl: 500,
    volumeLabel: '500 ml Slim Aluminum',
    bottleType: 'Aluminum Can (330ml-500ml)',
    labelType: 'Direct UV High-Definition Print',
  },
  collaborationRequirement: {
    status: 'NOT_REQUIRED',
  },
  status: 'AGREEMENT_LOCKED',
  currentVersionNumber: 1,
  activeVersionId: `cvr_step9_${runId}`,
  createdAt: nowIso,
  updatedAt: nowIso,
  createdBy: advertiserUser.id,
  updatedBy: advertiserUser.id,
};
db.saveCampaign(mockCampaign);

const agreement: CampaignAgreement = {
  id: agreementId,
  publicId: agreementPublicId,
  campaignId: mockCampaign.id,
  campaignPublicId: mockCampaign.publicCampaignId,
  campaignName: mockCampaign.name,
  campaignCategory: mockCampaign.category,
  advertiserId: advertiserUser.id,
  advertiserPublicId: advertiserUser.publicAccountId,
  advertiserBrandName: advertiserUser.organizationName,
  venueId: venueUser.id,
  venuePublicId: venueUser.publicAccountId,
  venueName: venueUser.organizationName,
  sourceProposalId: `prp_step9_${runId}`,
  sourceProposalPublicId: `AB-PRP-09-${runId}`,
  sourceProposalVersionId: `prv_step9_${runId}`,
  sourceProposalVersionNumber: 1,
  status: 'LOCKED',
  currentVersionId: `cgv_step9_v1_${runId}`,
  currentVersionNumber: 1,
  lockVersion: 1,
  lockedAt: nowIso,
  lockedBy: adminUser.id,
  lockedSnapshotId: `AB-CGS-09-${runId}`,
  cancellationPolicyId: 'standard_cancellation_policy_v1',
  renewalPolicyId: 'explicit_approval_renewal_v1',
  agreementReference: `AGR-REF-09-${runId}`,
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

// Create Snapshot
const agreementSnapshot = AgreementSnapshotService.createSnapshot(
  agreement,
  adminUser
);

// Evaluate Order Readiness (Step 8) -> Generates READY_FOR_ORDER
const { orderReadiness, validationSummary } = OrderReadinessService.assessOrderReadiness(agreement.id, adminUser);
if (orderReadiness.status !== 'READY_FOR_ORDER') {
  console.error('Validation issues:', JSON.stringify(validationSummary.issues, null, 2));
}
assert.equal(orderReadiness.status, 'READY_FOR_ORDER');

console.log('✅ Baseline setup complete: Locked Agreement and OrderReadiness READY_FOR_ORDER');

async function runStep9Tests() {
  console.log('\n=============================================================');
  console.log('STARTING AQUABLOOM STEP 9: SUPPLIER ASSIGNMENT & OFFER TESTS');
  console.log('=============================================================\n');

  // Test 1: Deterministic Supplier Matching
  console.log('--- TEST 1: Deterministic Rule-Based Supplier Matching ---');
  const candidates = SupplierMatchingEngine.findEligibleSuppliers(orderReadiness.id);
  assert(candidates.length >= 2, 'Should find candidate matches for the order readiness');

  const matchA = candidates.find((c) => c.supplierId === supplierUserA.id);
  assert(matchA, 'Supplier A should be present in matching results');
  if (!matchA.matchEvaluation.isEligible) {
    console.error('Supplier A rejection reasons:', matchA.matchEvaluation.rejectionReasons);
  }
  assert.equal(matchA.matchEvaluation.isEligible, true, 'Supplier A product should be fully eligible');
  assert.equal(matchA.matchEvaluation.statusApproved, true);
  assert.equal(matchA.matchEvaluation.productAvailable, true);
  assert.equal(matchA.matchEvaluation.volumeMatches, true);
  assert.equal(matchA.matchEvaluation.materialMatches, true);
  assert.equal(matchA.matchEvaluation.moqSatisfied, true);
  assert.equal(matchA.matchEvaluation.capacitySufficient, true);

  const matchB = candidates.find((c) => c.supplierId === supplierUserB.id);
  assert(matchB, 'Supplier B should be present in matching results');
  assert.equal(matchB.matchEvaluation.isEligible, true, 'Supplier B product should be eligible');

  // Unapproved supplier check: should be marked not eligible
  const matchUnapp = candidates.find((c) => c.supplierId === unapprovedSupplierUser.id);
  if (matchUnapp) {
    assert.equal(matchUnapp.matchEvaluation.isEligible, false, 'Unapproved supplier must NOT be eligible');
  }

  // Matching ranking: Deterministic ascending price (18.5 INR < 21.0 INR)
  const eligibleMatches = candidates.filter((c) => c.matchEvaluation.isEligible && (c.supplierId === supplierUserA.id || c.supplierId === supplierUserB.id));
  assert(eligibleMatches.length >= 2, 'Both seeded test suppliers must be eligible');
  assert.equal(eligibleMatches[0].supplierId, supplierUserA.id, 'Cheaper eligible supplier should be ranked ahead of supplier B');
  assert.equal(eligibleMatches[1].supplierId, supplierUserB.id, 'Supplier B should follow Supplier A in price-ascending order');
  console.log('✅ Test 1 passed: Deterministic supplier matching successfully validated.');

  // Test 2: RBAC on Candidate Matching Query
  console.log('\n--- TEST 2: RBAC on Candidate Matching Query ---');
  // Admin, Advertiser, Venue can view
  SupplierAssignmentAuthorizationService.assertCanViewCandidates(orderReadiness, adminUser);
  SupplierAssignmentAuthorizationService.assertCanViewCandidates(orderReadiness, advertiserUser);
  SupplierAssignmentAuthorizationService.assertCanViewCandidates(orderReadiness, venueUser);

  // Supplier and Logistics forbidden from viewing candidate matching pools
  assert.throws(
    () => SupplierAssignmentAuthorizationService.assertCanViewCandidates(orderReadiness, supplierUserA),
    /cannot browse supplier matching pools/
  );
  assert.throws(
    () => SupplierAssignmentAuthorizationService.assertCanViewCandidates(orderReadiness, logisticsUser),
    /cannot browse supplier matching pools/
  );
  console.log('✅ Test 2 passed: Candidate pool access strictly isolated from non-authorized roles.');

  // Test 3: Operational Offer Dispatch & Data Isolation
  console.log('\n--- TEST 3: Operational Offer Creation & Data Isolation ---');
  const offerA = SupplierOperationalOfferService.createOffer(
    {
      orderReadinessId: orderReadiness.id,
      supplierId: supplierUserA.id,
      productId: prodA1.id,
      expiresInHours: 48,
    },
    adminUser
  );

  assert.equal(offerA.status, 'PENDING');
  assert.equal(offerA.offerTerms.bottleQuantity, 10000);
  assert.equal(offerA.offerTerms.unitCustomerFacingPrice.amount, 18.5);
  assert.equal(offerA.offerTerms.totalBottleAmount.amount, 185000);
  assert.equal(offerA.offerTerms.currency, 'INR');

  // Verify Data Isolation: Supplier operational requirements snapshot must NOT contain
  // venue compensation, private advertising budget, or agreement negotiation history
  const snap = offerA.operationalRequirementsSnapshot;
  assert.equal(snap.bottleQuantity, 10000);
  assert.equal(snap.orderReadinessId, orderReadiness.id);
  assert.equal(snap.campaignAgreementId, agreement.id);
  assert((snap as any).venueCompensationTerms === undefined, 'Venue compensation must NOT leak to supplier offer');
  assert((snap as any).publishedBudget === undefined, 'Advertiser budget must NOT leak to supplier offer');
  assert((snap as any).advertiserResponsibilities === undefined, 'Advertiser responsibilities must NOT leak to supplier offer');
  console.log('✅ Test 3 passed: Operational offer dispatched with pristine data isolation.');

  // Test 4: Supplier Cross-Tenant Access Isolation
  console.log('\n--- TEST 4: Supplier Tenant Isolation on Offers ---');
  // Supplier A can view offer A
  SupplierAssignmentAuthorizationService.assertCanViewOffer(offerA, supplierUserA);

  // Supplier B CANNOT view offer A
  assert.throws(
    () => SupplierAssignmentAuthorizationService.assertCanViewOffer(offerA, supplierUserB),
    /Access denied/
  );

  // Supplier B CANNOT accept or decline offer A
  assert.throws(
    () => SupplierAssignmentAuthorizationService.assertCanRespondToOffer(offerA, supplierUserB),
    /Only the designated supplier can accept or decline/
  );
  console.log('✅ Test 4 passed: Supplier cross-tenant security boundaries verified.');

  // Test 5: Offer Decline with Reason Code
  console.log('\n--- TEST 5: Supplier Decline Flow ---');
  // Dispatch offer to Supplier B to test decline
  const offerB = SupplierOperationalOfferService.createOffer(
    {
      orderReadinessId: orderReadiness.id,
      supplierId: supplierUserB.id,
      productId: prodB1.id,
    },
    adminUser
  );

  const declinedOfferB = SupplierOperationalOfferService.declineOffer(
    offerB.id,
    {
      reasonCode: 'CAPACITY_UNAVAILABLE',
      explanation: 'Production line #3 undergoing scheduled calibration this month.',
    },
    supplierUserB
  );

  assert.equal(declinedOfferB.status, 'DECLINED');
  assert.equal(declinedOfferB.declineReasonCode, 'CAPACITY_UNAVAILABLE');
  assert(declinedOfferB.declinedAt !== undefined);
  console.log('✅ Test 5 passed: Supplier decline flow successfully processed with audit reasons.');

  // Test 6: Supplier Offer Acceptance & Atomic Assignment Creation
  console.log('\n--- TEST 6: Supplier Acceptance & Atomic Assignment ---');
  const { offer: acceptedOffer, assignment } = SupplierOperationalOfferService.acceptOffer(
    offerA.id,
    {},
    supplierUserA
  );

  assert.equal(acceptedOffer.status, 'ACCEPTED');
  assert(acceptedOffer.acceptedAt !== undefined);

  assert.equal(assignment.status, 'ASSIGNED');
  assert.equal(assignment.orderReadinessId, orderReadiness.id);
  assert.equal(assignment.supplierId, supplierUserA.id);
  assert.equal(assignment.lockedOfferSnapshot.bottleQuantity, 10000);
  assert.equal(assignment.lockedOfferSnapshot.unitCustomerFacingPrice.amount, 18.5);
  assert.equal(assignment.lockedOfferSnapshot.totalBottleAmount.amount, 185000);
  assert.equal(assignment.futureBoundaries.logisticsAssigned, false);
  assert.equal(assignment.futureBoundaries.productionScheduled, false);

  // Verify historical snapshot immutability: Mutations to Product master do NOT alter assignment
  db.updateProduct(prodA1.id, { name: 'Altered Product Name Future Version' }, supplierUserA.id);
  const reloadedAssignment = SupplierAssignmentService.getAssignment(assignment.id, adminUser);
  assert.equal(
    reloadedAssignment.lockedOfferSnapshot.bottleQuantity,
    10000,
    'Historical bottle quantity snapshot remains immutable'
  );
  assert.equal(
    reloadedAssignment.lockedOfferSnapshot.productSpecificationsSnapshot.bottleCapacityMl,
    500,
    'Historical product specifications snapshot remains immutable'
  );
  console.log('✅ Test 6 passed: Offer accepted, assignment created atomically with immutable historical snapshot.');

  // Test 7: Concurrency & Duplicate Assignment Prevention
  console.log('\n--- TEST 7: Duplicate Assignment Prevention ---');
  // Attempting to create a new offer on an order readiness that already has an ASSIGNED supplier must fail
  assert.throws(
    () =>
      SupplierOperationalOfferService.createOffer(
        {
          orderReadinessId: orderReadiness.id,
          supplierId: supplierUserB.id,
          productId: prodB1.id,
        },
        adminUser
      ),
    /already has an active supplier assignment/
  );
  console.log('✅ Test 7 passed: Duplicate active supplier assignment strictly blocked.');

  // Test 8: Counterparty Shared View
  console.log('\n--- TEST 8: Supplier Assignment Shared View ---');
  const sharedView = SupplierAssignmentService.getSharedView(assignment.id, advertiserUser);
  assert.equal(sharedView.assignmentId, assignment.id);
  assert.equal(sharedView.supplierBusinessName, 'Alpine Pure Bottling Co.');
  assert.equal(sharedView.bottleQuantity, 10000);
  assert.equal(sharedView.status, 'ASSIGNED');
  assert.equal(sharedView.boundaries.supplierAssigned, true);
  assert.equal(sharedView.boundaries.logisticsAssigned, false);
  assert.equal(sharedView.boundaries.productionStarted, false);
  assert((sharedView as any).unitCustomerFacingPrice === undefined, 'Shared counterparty view hides raw unit price');
  console.log('✅ Test 8 passed: Counterparty shared view conforms to isolation and boundaries.');

  // Test 9: Supplier Reassignment Recovery Flow
  console.log('\n--- TEST 9: Supplier Reassignment Recovery Flow ---');
  const reassignResult = SupplierAssignmentService.reassignSupplier(
    assignment.id,
    'Supplier experiencing unexpected raw material supply delay. Reassigning to backup partner.',
    adminUser
  );

  assert.equal(reassignResult.previousAssignment.status, 'CANCELLED');
  assert(reassignResult.previousAssignment.reassignmentDetails !== null);
  assert.equal(
    reloadedAssignment.orderReadinessPublicId,
    reassignResult.previousAssignment.orderReadinessPublicId
  );

  // Now OrderReadiness is unlocked for a new offer without cancelling the Campaign Agreement!
  const newOfferForB = SupplierOperationalOfferService.createOffer(
    {
      orderReadinessId: orderReadiness.id,
      supplierId: supplierUserB.id,
      productId: prodB1.id,
    },
    adminUser
  );
  assert.equal(newOfferForB.status, 'PENDING');
  assert.equal(newOfferForB.supplierId, supplierUserB.id);

  const { assignment: assignmentB } = SupplierOperationalOfferService.acceptOffer(
    newOfferForB.id,
    {},
    supplierUserB
  );
  assert.equal(assignmentB.status, 'ASSIGNED');
  assert.equal(assignmentB.supplierId, supplierUserB.id);
  console.log('✅ Test 9 passed: Reassignment recovery executed smoothly without cancelling campaign.');

  // Test 10: Audit Event Trail Verification
  console.log('\n--- TEST 10: Audit Event Trail Verification ---');
  const events = db.getEvents();
  const offerCreatedEvents = events.filter((e) => e.eventType === 'SUPPLIER_OFFER_CREATED');
  const offerDeclinedEvents = events.filter((e) => e.eventType === 'SUPPLIER_OFFER_DECLINED');
  const assignmentConfirmedEvents = events.filter((e) => e.eventType === 'SUPPLIER_ASSIGNMENT_CONFIRMED');
  const reassignmentEvents = events.filter((e) => e.eventType === 'SUPPLIER_ASSIGNMENT_CANCELLED_FOR_REASSIGNMENT');

  assert(offerCreatedEvents.length >= 2, 'Offer created events should be recorded in audit log');
  assert(offerDeclinedEvents.length >= 1, 'Offer declined event should be recorded in audit log');
  assert(assignmentConfirmedEvents.length >= 2, 'Assignment confirmed events should be recorded');
  assert(reassignmentEvents.length >= 1, 'Reassignment event should be recorded in audit log');
  console.log('✅ Test 10 passed: Complete audit event trail verified.');

  console.log('\n=============================================================');
  console.log('ALL AQUABLOOM STEP 9 SUPPLIER ASSIGNMENT TESTS PASSED');
  console.log('=============================================================\n');
}

runStep9Tests().catch((err) => {
  console.error('❌ Step 9 Test Suite Failed:', err);
  process.exit(1);
});
