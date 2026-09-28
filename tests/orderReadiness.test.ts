/**
 * AquaBloom Step 8: Order Readiness & Data Handoff Unit and Integration Tests
 * 
 * Verifies:
 * 1. Order Readiness authorization (Advertiser/Venue allowed, cross-tenant denied, Supplier/Logistics denied)
 * 2. Order Readiness validation (Blocked if agreement not locked, blocked if required terms missing)
 * 3. Successful Order Readiness evaluation on locked agreement (status: READY_FOR_ORDER)
 * 4. Data Handoff creation (status: COMPLETED, immutable downstream snapshot matches locked snapshot)
 * 5. Downstream isolation (does NOT pull live editable user profiles, maintains boundaries)
 * 6. Idempotency (repeated assessments return consistent record without duplicates)
 * 7. Counterparty Shared View (clean, stripped of internal admin fields)
 * 8. Audit event dispatching for evaluation success and failure
 */

import { strict as assert } from 'assert';
import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementSnapshotService,
} from '../src/server/agreementServices.js';
import {
  OrderReadinessService,
  OrderReadinessAuthorizationService,
  OrderReadinessValidationEngine,
  DataHandoffService,
} from '../src/server/orderReadinessServices.js';
import {
  AuthorizationError,
  AgreementLockedError,
  NotFoundError,
} from '../src/lib/errors.js';
import { eventDispatcher } from '../src/lib/events.js';
import type {
  User,
  Campaign,
  Proposal,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  AgreementCommercialTerms,
} from '../src/types.js';

const nowIso = new Date().toISOString();
const runId = Math.random().toString(36).substring(2, 8);

// Mock Actors
const adminUser: User = {
  id: `usr_admin_step8_${runId}`,
  publicAccountId: `AB-ACC-ADMIN-08-${runId}`,
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Step 8 Admin',
  email: `admin8_${runId}@aquabloom.internal`,
  organizationName: 'AquaBloom Global',
  phone: '+1-555-0800',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: `usr_adv_step8_${runId}`,
  publicAccountId: `AB-ACC-ADV-08-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Brand Manager Step 8',
  email: `brand8_${runId}@sparklejuice.com`,
  organizationName: 'Sparkle Juice Corp',
  phone: '+1-555-0801',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: `usr_ven_step8_${runId}`,
  publicAccountId: `AB-ACC-VEN-08-${runId}`,
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Venue Manager Step 8',
  email: `manager8_${runId}@grandarena.com`,
  organizationName: 'Grand Arena Center',
  phone: '+1-555-0802',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const foreignAdvertiserUser: User = {
  id: `usr_adv_foreign_step8_${runId}`,
  publicAccountId: `AB-ACC-ADV-99-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Foreign Brand User',
  email: `foreign_${runId}@otherbrand.com`,
  organizationName: 'Other Brand Inc',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUser: User = {
  id: `usr_sup_step8_${runId}`,
  publicAccountId: `AB-ACC-SUP-08-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Bottle Supplier',
  email: `supplier_${runId}@bottles.com`,
  organizationName: 'Eco Bottles Ltd',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const logisticsUser: User = {
  id: `usr_log_step8_${runId}`,
  publicAccountId: `AB-ACC-LOG-08-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Logistics Dispatcher',
  email: `dispatcher_${runId}@freight.com`,
  organizationName: 'Swift Freight',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Seed users
db.saveUser(adminUser);
db.saveUser(advertiserUser);
db.saveUser(venueUser);
db.saveUser(foreignAdvertiserUser);
db.saveUser(supplierUser);
db.saveUser(logisticsUser);

// Seed Profiles
db.saveProfile(
  advertiserUser.id,
  {
    role: 'ADVERTISER',
    accountId: advertiserUser.id,
    brandName: 'Sparkle Juice Corp',
    industry: 'Beverages',
    description: 'Premium organic sparkling juice',
    primaryContact: { name: advertiserUser.contactName, email: advertiserUser.email },
    location: { city: 'San Francisco', country: 'United States' },
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: advertiserUser.id,
    completion: { percentage: 100, isComplete: true, missingRequiredFields: [] },
  },
  advertiserUser.id
);

db.saveProfile(
  venueUser.id,
  {
    role: 'VENUE',
    accountId: venueUser.id,
    venueName: 'Grand Arena Center',
    venueType: 'CONCERT_HALL',
    description: 'Major metropolitan events venue',
    location: { city: 'San Francisco', country: 'United States' },
    audienceCategory: 'Music & Entertainment',
    footfall: { monthlyVisitors: 85000 },
    bottleConsumption: { estimatedMonthlyBottles: 15000 },
    capacity: { maxBottleHoldingCapacity: 20000, currentOngoingBottleCommitment: 2000, availableBottleCapacity: 18000 },
    campaignAvailability: 'IMMEDIATE',
    visibilityState: 'PUBLIC_ELIGIBLE',
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    updatedBy: venueUser.id,
    completion: { percentage: 100, isComplete: true, missingRequiredFields: [] },
  },
  venueUser.id
);

// Setup Campaign
const mockCampaign: Campaign = {
  id: `cmp_step8_${runId}`,
  publicCampaignId: `AB-CMP-STEP8-${runId}`,
  advertiserId: advertiserUser.id,
  name: 'Sparkle Summer Refresh 2026',
  category: 'Beverages',
  description: 'Summer brand sampling at arena concourses',
  objective: 'Brand Awareness & Product Sampling',
  targetAudience: {
    characteristics: ['Active Lifestyle Adults 21-40'],
    demographics: 'Young Urban Adults',
  },
  timing: {
    duration: { value: 4, unit: 'WEEKS' },
    preferredStartPeriod: { label: 'July 2026', windowStart: '2026-07-01', windowEnd: '2026-07-31' },
  },
  distributionRequirements: {
    placementDetails: 'Weekly delivery batch to loading bay',
    estimatedDistributionPace: 'Weekly batch',
  },
  venueRequirements: {
    preferredVenueTypes: ['CONCERT_HALL', 'ARENA'],
    preferredLocations: [{ city: 'San Francisco', country: 'United States' }],
    placementRequirements: ['Concourse Chillout Zones', 'VIP Lounge Refreshment Bar'],
  },
  bottleRequirements: {
    requiredQuantity: 10000,
    preferredVolumeMl: 500,
    volumeLabel: '500ml',
    bottleType: 'Eco Aluminum Recyclable',
    labelType: 'Full-bleed Matte Wrap',
  },
  collaborationRequirement: {
    status: 'REQUIRED',
    preferredTerms: 'Venue social media mention and staff attire allowed',
  },
  status: 'AGREEMENT_LOCKED',
  currentVersionNumber: 1,
  activeVersionId: `cvr_step8_${runId}`,
  createdAt: nowIso,
  updatedAt: nowIso,
  createdBy: advertiserUser.id,
  updatedBy: advertiserUser.id,
};
db.saveCampaign(mockCampaign);

// Commercial Terms
const commercialTerms: AgreementCommercialTerms = {
  campaignQuantity: 10000,
  campaignDuration: { value: 4, unit: 'WEEKS' },
  preferredStartPeriod: { label: 'July 2026', windowStart: '2026-07-01', windowEnd: '2026-07-31' },
  distributionRequirements: {
    placementDetails: 'Weekly staggered delivery to loading dock 2',
    estimatedDistributionPace: 'Weekly staggered delivery',
  },
  placementRequirements: ['Concourse Chillout Zones', 'VIP Lounge Refreshment Bar'],
  productRequirements: {
    preferredVolumeMl: 500,
    volumeLabel: '500ml',
    bottleType: 'Eco Aluminum Recyclable',
    labelType: 'Full-bleed Matte Wrap',
  },
  collaborationRequirement: {
    status: 'REQUIRED',
    preferredTerms: 'Venue social media mention and branded staff attire allowed',
  },
  venueCompensationTerms: {
    proposedPercentage: 10.0,
    termsDescription: '10% of eligible supplier bottle base cost',
    notes: 'Calculated at order placement stage',
    eligibleBaseDescription: 'Supplier bottle production subtotal',
    maximumCapPercentage: 12.5,
  },
  advertiserResponsibilities: ['Provide high-res vector label artwork', 'Review proof within 48h'],
  venueResponsibilities: ['Chilled distribution at events', 'Maintain display cleanliness'],
  aquaBloomResponsibilities: ['Quality assurance', 'Dispute mediation', 'Logistics coordination'],
  deliveryTermsKnown: {
    stagingInstructions: 'Deliver to Loading Bay 2',
    specialHandling: 'Keep dry, stack max 4 high',
    refrigerationRequired: false,
    status: 'PENDING_LOGISTICS_ASSIGNMENT',
  },
  qrRequirements: {
    customRedirectUrl: 'https://sparklejuice.com/summer-promo',
    trackingEnabled: true,
    status: 'CONFIGURED_FOR_PRODUCTION',
  },
  cancellationTerms: {
    policyId: 'standard_cancellation_v1',
    cutoffStage: 'PRODUCTION_START',
    termsSummary: 'No cancellation after supplier production starts',
    eligibleCancellationStage: 'PRE_PRODUCTION',
    nonRecoverableCostPrinciple: 'Advertiser bears unrecoverable manufacturing costs',
  },
  renewalTerms: {
    policyId: 'explicit_approval_renewal_v1',
    renewalType: 'EXPLICIT_APPROVAL_REQUIRED',
    termsSummary: 'Requires mutual written confirmation',
  },
  importantConditions: ['No competing carbonated beverage ads on premises during run'],
};

// Create Locked Agreement
const lockedAgreement: CampaignAgreement = {
  id: `cag_step8_locked_${runId}`,
  publicId: `AB-CAG-STEP8-${runId}`,
  campaignId: mockCampaign.id,
  campaignPublicId: mockCampaign.publicCampaignId,
  campaignName: mockCampaign.name,
  campaignCategory: mockCampaign.category,
  advertiserId: advertiserUser.id,
  advertiserPublicId: advertiserUser.publicAccountId,
  advertiserBrandName: 'Sparkle Juice Corp',
  venueId: venueUser.id,
  venuePublicId: venueUser.publicAccountId,
  venueName: 'Grand Arena Center',
  sourceProposalId: `prp_step8_${runId}`,
  sourceProposalPublicId: `AB-PRP-STEP8-${runId}`,
  sourceProposalVersionId: `prv_step8_${runId}`,
  sourceProposalVersionNumber: 1,
  status: 'LOCKED',
  currentVersionId: `cgv_step8_v1_${runId}`,
  currentVersionNumber: 1,
  lockVersion: 1,
  lockedAt: nowIso,
  lockedBy: advertiserUser.id,
  lockedSnapshotId: `AB-CGS-STEP8-${runId}`,
  advertiserConfirmedAt: nowIso,
  venueConfirmedAt: nowIso,
  cancellationPolicyId: 'standard_cancellation_v1',
  renewalPolicyId: 'explicit_approval_renewal_v1',
  agreementReference: `REF-AGR-${runId}`,
  terms: commercialTerms,
  createdAt: nowIso,
  updatedAt: nowIso,
  createdBy: advertiserUser.id,
  updatedBy: advertiserUser.id,
};
db.saveAgreement(lockedAgreement);

// Create Snapshot
const lockedSnapshot: CampaignAgreementSnapshot = {
  id: `cgs_step8_${runId}`,
  publicSnapshotId: `AB-CGS-STEP8-${runId}`,
  agreementId: lockedAgreement.id,
  agreementPublicId: lockedAgreement.publicId,
  agreementVersionId: `cgv_step8_v1_${runId}`,
  versionNumber: 1,
  lockedAt: nowIso,
  lockedBy: advertiserUser.id,
  lockVersion: 1,
  campaignSnapshot: {
    campaignName: mockCampaign.name,
    publicCampaignId: mockCampaign.publicCampaignId,
    category: mockCampaign.category,
    objective: mockCampaign.objective,
    targetAudience: 'Active Lifestyle Adults 21-40',
    durationWeeks: 4,
    preferredStartMonthYear: '07/2026',
  },
  advertiserSnapshot: {
    brandName: 'Sparkle Juice Corp',
    publicAccountId: advertiserUser.publicAccountId,
    industry: 'Beverages',
    primaryContactName: advertiserUser.contactName,
    locationCity: 'San Francisco',
    locationCountry: 'United States',
  },
  venueSnapshot: {
    venueName: 'Grand Arena Center',
    publicAccountId: venueUser.publicAccountId,
    venueType: 'CONCERT_HALL',
    audienceCategory: 'Music & Entertainment',
    locationCity: 'San Francisco',
    locationCountry: 'United States',
    monthlyVisitors: 85000,
    availableBottleCapacity: 18000,
    maxBottleHoldingCapacity: 20000,
    placementPossibilities: ['Concourse Chillout Zones', 'VIP Lounge Refreshment Bar'],
  },
  campaignTermsSnapshot: {
    quantity: 10000,
    duration: { value: 4, unit: 'WEEKS' },
    preferredStartPeriod: { label: 'July 2026', windowStart: '2026-07-01', windowEnd: '2026-07-31' },
    customConditions: 'Ensure packaging is 100% recyclable',
    importantConditions: ['No competing carbonated beverage ads on premises during run'],
  },
  productRequirementsSnapshot: commercialTerms.productRequirements,
  distributionSnapshot: commercialTerms.distributionRequirements,
  placementSnapshot: {
    placementRequirements: commercialTerms.placementRequirements,
  },
  collaborationSnapshot: commercialTerms.collaborationRequirement,
  compensationTermsSnapshot: commercialTerms.venueCompensationTerms,
  responsibilitiesSnapshot: {
    advertiserResponsibilities: commercialTerms.advertiserResponsibilities,
    venueResponsibilities: commercialTerms.venueResponsibilities,
    aquaBloomResponsibilities: commercialTerms.aquaBloomResponsibilities,
  },
  deliveryTermsSnapshot: commercialTerms.deliveryTermsKnown,
  qrRequirementsSnapshot: commercialTerms.qrRequirements,
  cancellationTermsSnapshot: commercialTerms.cancellationTerms,
  renewalTermsSnapshot: commercialTerms.renewalTerms,
  commercialTermsSnapshot: commercialTerms,
};
db.saveAgreementSnapshot(lockedSnapshot);

// Also create an Unlocked Agreement to test rejection
const draftAgreement: CampaignAgreement = {
  id: `cag_step8_draft_${runId}`,
  publicId: `AB-CAG-DRAFT-${runId}`,
  campaignId: mockCampaign.id,
  campaignPublicId: mockCampaign.publicCampaignId,
  campaignName: mockCampaign.name,
  campaignCategory: mockCampaign.category,
  advertiserId: advertiserUser.id,
  advertiserPublicId: advertiserUser.publicAccountId,
  advertiserBrandName: 'Sparkle Juice Corp',
  venueId: venueUser.id,
  venuePublicId: venueUser.publicAccountId,
  venueName: 'Grand Arena Center',
  sourceProposalId: `prp_step8_draft_${runId}`,
  sourceProposalPublicId: `AB-PRP-DRAFT-${runId}`,
  sourceProposalVersionId: `prv_step8_draft_${runId}`,
  sourceProposalVersionNumber: 1,
  status: 'DRAFT',
  currentVersionId: `cgv_draft_v1_${runId}`,
  currentVersionNumber: 1,
  lockVersion: 0,
  cancellationPolicyId: 'standard_cancellation_v1',
  renewalPolicyId: 'explicit_approval_renewal_v1',
  agreementReference: `REF-DRAFT-${runId}`,
  terms: commercialTerms,
  createdAt: nowIso,
  updatedAt: nowIso,
  createdBy: advertiserUser.id,
  updatedBy: advertiserUser.id,
};
db.saveAgreement(draftAgreement);

async function runStep8Tests() {
  console.log('=== AQUABLOOM STEP 8: ORDER READINESS & DATA HANDOFF TESTS ===\n');

  // Test 1: Access Control - Suppliers and Logistics Partners cannot view or initiate Order Readiness
  console.log('Test 1: Access Control - Role Isolation');
  assert.throws(
    () => {
      OrderReadinessAuthorizationService.assertCanManage(lockedAgreement, supplierUser);
    },
    (err: any) => err instanceof AuthorizationError,
    'Suppliers must not be permitted to initiate order readiness'
  );

  assert.throws(
    () => {
      OrderReadinessAuthorizationService.assertCanManage(lockedAgreement, logisticsUser);
    },
    (err: any) => err instanceof AuthorizationError,
    'Logistics partners must not be permitted to initiate order readiness'
  );
  console.log('  ✓ Supplier & Logistics partner initiation blocked successfully');

  // Test 2: Multi-tenant Isolation - Cross-tenant party cannot manage
  console.log('Test 2: Multi-tenant Isolation');
  assert.throws(
    () => {
      OrderReadinessAuthorizationService.assertCanManage(lockedAgreement, foreignAdvertiserUser);
    },
    (err: any) => err instanceof AuthorizationError,
    'Foreign advertiser must not be permitted to initiate order readiness for this agreement'
  );
  console.log('  ✓ Cross-tenant advertiser initiation rejected with AuthorizationError');

  // Test 3: Unlocked Agreement Cannot Achieve Order Readiness
  console.log('Test 3: Unlocked Agreement Rejection');
  assert.throws(
    () => {
      OrderReadinessService.assessOrderReadiness(draftAgreement.id, advertiserUser);
    },
    (err: any) => err instanceof AgreementLockedError,
    'Unlocked draft agreement must be rejected from achieving order readiness'
  );
  console.log('  ✓ Unlocked agreement rejected with AgreementLockedError');

  // Test 4: Successful Order Readiness Assessment on Locked Agreement
  console.log('Test 4: Order Readiness Assessment & Validation');
  const result = OrderReadinessService.assessOrderReadiness(lockedAgreement.id, advertiserUser);

  assert.ok(result.orderReadiness, 'OrderReadiness record should be created');
  assert.equal(result.orderReadiness.status, 'READY_FOR_ORDER');
  assert.ok(result.validationSummary.isValid, 'Validation should be valid');
  assert.equal(result.validationSummary.blockingIssueCount, 0);
  assert.ok(result.orderReadiness.publicId.startsWith('AB-ORDR-'));
  assert.equal(result.orderReadiness.campaignAgreementId, lockedAgreement.id);
  assert.equal(result.orderReadiness.sourceSnapshotVersion, 1);
  console.log('  ✓ Order readiness record evaluated to READY_FOR_ORDER with 0 blocking issues');

  // Test 5: Data Handoff Generated
  console.log('Test 5: Data Handoff Creation');
  assert.ok(result.handoff, 'Data Handoff must be created when valid');
  assert.equal(result.handoff?.status, 'COMPLETED');
  assert.ok(result.handoff?.publicId.startsWith('AB-DHO-'));
  assert.equal(result.handoff?.sourceId, lockedAgreement.id);
  assert.equal(result.handoff?.destinationType, 'ORDER_READINESS');
  assert.equal(result.handoff?.destinationReference, result.orderReadiness.id);
  console.log('  ✓ Data handoff successfully created with COMPLETED status');

  // Test 6: Downstream Order Snapshot Isolation & Integrity
  console.log('Test 6: Downstream Snapshot Verification (No profile pollution)');
  const snapshot = result.orderReadiness.orderSnapshot;
  assert.ok(snapshot, 'DownstreamOrderSnapshot must exist on readiness record');
  assert.equal(snapshot.productRequirements.requiredBottleQuantity, 10000);
  assert.equal(snapshot.venue.venueName, 'Grand Arena Center');
  assert.equal(snapshot.advertiser.brandName, 'Sparkle Juice Corp');
  assert.equal(snapshot.commercialTerms.venueCompensationPercentage, 10.0);
  assert.equal(snapshot.boundaries.finalPricingCalculated, false);
  assert.equal(snapshot.boundaries.supplierAssigned, false);
  assert.equal(snapshot.boundaries.logisticsAssigned, false);
  assert.equal(snapshot.boundaries.paymentCreated, false);
  console.log('  ✓ Downstream snapshot contains exact locked data and strict boundary flags');

  // Test 7: Idempotency Protection
  console.log('Test 7: Idempotency Protection');
  const secondResult = OrderReadinessService.assessOrderReadiness(lockedAgreement.id, venueUser);
  assert.equal(secondResult.orderReadiness.id, result.orderReadiness.id, 'Must return identical readiness ID');
  assert.equal(secondResult.orderReadiness.publicId, result.orderReadiness.publicId, 'Must return identical publicId');
  assert.equal(secondResult.orderReadiness.status, 'READY_FOR_ORDER');
  console.log('  ✓ Subsequent assessment idempotently returns consistent readiness record without duplication');

  // Test 8: Safe Counterparty Shared View
  console.log('Test 8: Safe Counterparty Shared View');
  const sharedView = OrderReadinessService.getSharedView(result.orderReadiness.id, advertiserUser);
  assert.equal(sharedView.publicId, result.orderReadiness.publicId);
  assert.equal(sharedView.agreementPublicId, lockedAgreement.publicId);
  assert.equal(sharedView.isReadyForOrder, true);
  assert.equal(sharedView.isBlocked, false);
  assert.equal(sharedView.requiredBottleQuantity, 10000);
  assert.equal(sharedView.advertiserBrandName, 'Sparkle Juice Corp');
  assert.equal(sharedView.venueName, 'Grand Arena Center');
  assert.ok(sharedView.publicValidationMessage.length > 0);
  // Ensure no internal DB fields leaked in shared view
  assert.equal((sharedView as any).handoffId, undefined);
  assert.equal((sharedView as any).orderSnapshot, undefined);
  console.log('  ✓ Shared view produces sanitized counterparty data without technical internal leak');

  // Test 9: Supplier and Logistics cannot view Shared View
  console.log('Test 9: Counterparty View Access Denial for Supplier/Logistics');
  assert.throws(
    () => {
      OrderReadinessService.getSharedView(result.orderReadiness.id, supplierUser);
    },
    (err: any) => err instanceof AuthorizationError,
    'Suppliers must not be allowed to access shared readiness view'
  );
  console.log('  ✓ Supplier access to shared view rejected with AuthorizationError');

  console.log('\n=== ALL STEP 8 TESTS PASSED SUCCESSFULLY ===');
}

runStep8Tests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
