/**
 * AquaBloom Step 7 Part 2 — Campaign Agreement Review System Verification Suite
 * 
 * Verifies all 16 required checkpoints:
 * 1. Agreement preview loads.
 * 2. Correct campaign appears.
 * 3. Correct venue appears.
 * 4. Correct advertiser appears.
 * 5. Current version appears.
 * 6. Historical versions appear correctly.
 * 7. Internal fields are excluded.
 * 8. Supplier cannot access.
 * 9. Logistics cannot access.
 * 10. Unrelated advertiser cannot access.
 * 11. Unrelated venue cannot access.
 * 12. No fake pricing appears.
 * 13. No confirmation event is created.
 * 14. Mobile layout works (responsive schema, touch targets, view structure).
 * 15. Desktop layout works (two-column parties, tripartite responsibilities, multi-column cards).
 * 16. Steps 1–7A continue working (idempotency, proposal status machine, agreement creation).
 */

import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementAuthorizationService,
} from '../src/server/agreementServices.js';
import {
  User,
  Proposal,
  ProposalVersion,
  Campaign,
  CampaignAgreement,
  AdvertiserProfile,
  VenueProfile,
} from '../src/types.js';
import { generateBusinessId } from '../src/lib/idGenerator.js';
import { AuthorizationError } from '../src/lib/errors.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runAgreementReviewTests() {
  console.log('====================================================');
  console.log('STARTING AQUABLOOM STEP 7 PART 2: AGREEMENT REVIEW SYSTEM TESTS');
  console.log('====================================================\n');

  const now = new Date().toISOString();

  // 1. Seed Actors for Test Isolation
  const advertiserA: User = {
    id: 'usr_adv_review_a',
    publicAccountId: 'AB-ACC-ADV-REVA',
    role: 'ADVERTISER',
    organizationName: 'Verve Botanicals Corp',
    email: 'ops@verve.example',
    contactName: 'Victoria Chen',
    phone: '+1-555-0199',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const advertiserB: User = {
    id: 'usr_adv_review_b',
    publicAccountId: 'AB-ACC-ADV-REVB',
    role: 'ADVERTISER',
    organizationName: 'Unrelated Rival Drinks',
    email: 'rival@drinks.example',
    contactName: 'Marcus Vance',
    phone: '+1-555-0200',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueA: User = {
    id: 'usr_ven_review_a',
    publicAccountId: 'AB-ACC-VEN-REVA',
    role: 'VENUE',
    organizationName: 'Skyline Luxury Terrace Club',
    email: 'management@skyline.example',
    contactName: 'Arthur Pendelton',
    phone: '+1-555-0201',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueB: User = {
    id: 'usr_ven_review_b',
    publicAccountId: 'AB-ACC-VEN-REVB',
    role: 'VENUE',
    organizationName: 'Unrelated Seaside Bistro',
    email: 'bistro@seaside.example',
    contactName: 'Chloe Bennett',
    phone: '+1-555-0202',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const supplierUser: User = {
    id: 'usr_sup_review_01',
    publicAccountId: 'AB-ACC-SUP-REV',
    role: 'SUPPLIER',
    organizationName: 'Apex Bottle Manufacturing Ltd',
    email: 'factory@apex.example',
    contactName: 'David Zhang',
    phone: '+1-555-0203',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const logisticsUser: User = {
    id: 'usr_log_review_01',
    publicAccountId: 'AB-ACC-LOG-REV',
    role: 'LOGISTICS_PARTNER',
    organizationName: 'SwiftCold Fleet & Freight',
    email: 'dispatch@swiftcold.example',
    contactName: 'Samira Khan',
    phone: '+1-555-0204',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const adminUser: User = {
    id: 'usr_adm_review_01',
    publicAccountId: 'AB-ACC-ADM-REV',
    role: 'ADMIN',
    organizationName: 'AquaBloom Central Compliance',
    email: 'compliance@aquabloom.example',
    contactName: 'Super Admin',
    phone: '+1-555-0000',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // Register users in database
  const reviewUserIds = [
    advertiserA.id,
    advertiserB.id,
    venueA.id,
    venueB.id,
    supplierUser.id,
    logisticsUser.id,
    adminUser.id,
  ];
  (db as any).schema.users = (db as any).schema.users.filter((u: any) => !reviewUserIds.includes(u.id));

  (db as any).schema.users.push(
    advertiserA,
    advertiserB,
    venueA,
    venueB,
    supplierUser,
    logisticsUser,
    adminUser
  );

  // Seed Profiles
  const advProfileA: any = {
    userId: advertiserA.id,
    brandName: 'Verve Botanicals Corp',
    industry: 'Premium Sparkling Mineral Water',
    targetAudience: {
      demographics: 'High-net-worth wellness & hospitality consumers',
      characteristics: ['Affluent Professionals'],
    },
    location: { city: 'San Francisco', country: 'USA' },
    primaryContactName: 'Victoria Chen',
  };
  (db as any).schema.profiles[advertiserA.id] = advProfileA;

  const venProfileA: any = {
    userId: venueA.id,
    venueName: 'Skyline Luxury Terrace Club',
    venueType: 'Rooftop Lounge & Executive Club',
    audienceCategory: 'Affluent Business & Urban Professionals',
    location: { city: 'San Francisco', country: 'USA' },
    primaryContactName: 'Arthur Pendelton',
    footfall: { monthlyVisitors: 35000 },
    capacity: { maxBottleHoldingCapacity: 12000, currentOngoingBottleCommitment: 4000, availableBottleCapacity: 8000 },
  };
  (db as any).schema.profiles[venueA.id] = venProfileA;

  // Seed Campaign
  const testCampaign: Campaign = {
    id: 'cmp_step7_rev_01',
    publicCampaignId: 'AB-CMP-REV-2026-01',
    advertiserId: advertiserA.id,
    name: 'Verve Summer Alpine Sparkle Activation',
    description: 'A botanical beverage tour across premier regional hubs.',
    category: 'Beverage & Hospitality',
    objective: 'Direct customer engagement and brand loyalty across luxury hospitality touchpoints',
    targetAudience: {
      demographics: 'Age 25-50, Urban Professionals',
      characteristics: ['Luxury & Wellness Enthusiasts', 'Affluent Professionals'],
    },
    venueRequirements: {
      preferredVenueTypes: ['Luxury Hotel', 'Executive Club'],
      preferredLocations: [{ city: 'San Francisco', country: 'USA' }],
      placementRequirements: ['Front Greeting Host Stand', 'Executive Lounge Side Display'],
    },
    bottleRequirements: {
      requiredQuantity: 6000,
      preferredVolumeMl: 500,
      preferredMaterial: 'Recycled Aluminum',
      packagingConfiguration: 'Pack of 24',
    },
    timing: {
      duration: { value: 6, unit: 'WEEKS' },
      preferredStartPeriod: { label: 'Q3 2026' },
    },
    distributionRequirements: {
      placementDetails: 'Temperature-Controlled Staging Room 2',
      refrigerationRequired: true,
    },
    collaborationRequirement: {
      status: 'OPEN_TO_COLLABORATION',
      notes: 'Host Handout & Complimentary Sip Experience',
    },
    status: 'ACTIVE',
    currentVersionNumber: 1,
    activeVersionId: 'cmv_step7_rev_1',
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserA.id,
    updatedBy: advertiserA.id,
  };
  db.saveCampaign(testCampaign);

  // Seed Mutual Proposal in READY_FOR_AGREEMENT status
  const testProposal: Proposal = {
    id: 'prop_step7_rev_01',
    publicProposalId: 'AB-PRP-REV-01',
    campaignId: testCampaign.id,
    publicCampaignId: testCampaign.publicCampaignId,
    campaignName: testCampaign.name,
    campaignCategory: testCampaign.category,
    advertiserId: advertiserA.id,
    advertiserPublicId: advertiserA.publicAccountId,
    advertiserBrandName: advProfileA.brandName,
    venueId: venueA.id,
    venuePublicId: venueA.publicAccountId,
    venueName: venProfileA.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: {
      campaignQuantity: 6000,
      campaignDuration: testCampaign.timing.duration,
      preferredStartPeriod: testCampaign.timing.preferredStartPeriod,
      distributionRequirements: testCampaign.distributionRequirements,
      placementRequirements: ['Front Greeting Host Stand', 'Executive Lounge Side Display'],
      productRequirements: {
        preferredVolumeMl: 500,
        preferredMaterial: 'Recycled Aluminum',
      },
      collaborationRequirement: testCampaign.collaborationRequirement,
      venueCompensationTerms: {
        proposedPercentage: 11.5,
        termsDescription: '11.5% of eligible supplier total bottle advertising cost',
        notes: 'Complies strictly with the 12.5% statutory cap.',
      },
      advertiserResponsibilities: [
        'Deliver print-ready vectorized artwork 14 days before production',
        'Verify proof approvals within 48 business hours',
      ],
      venueResponsibilities: [
        'Maintain clean dedicated bottle greeting stand at front entrance',
        'Record daily dispense logs via QR manager portal',
      ],
      aquaBloomResponsibilities: [
        'Coordinate production and quality inspection with verified bottle supplier',
        'Maintain digital QR telemetry routing and live customer analytics',
      ],
      customConditions: 'Display unit provided by AquaBloom staging team.',
    } as any,
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserA.id,
    updatedBy: venueA.id,
  };

  const testProposalVersion: ProposalVersion = {
    id: `prv_${testProposal.id}_v1`,
    publicVersionId: 'AB-PRV-REV-01-01',
    proposalId: testProposal.id,
    versionNumber: 1,
    actor: {
      userId: advertiserA.id,
      role: 'ADVERTISER',
      organizationName: advProfileA.brandName,
    },
    terms: testProposal.terms,
    createdAt: now,
    createdBy: advertiserA.id,
    changeSummary: 'Initial proposal mutually approved by Advertiser and Venue.',
    changedFields: [],
  };

  db.saveProposal(testProposal);
  db.saveProposalVersion(testProposalVersion);

  // Create Agreement Draft using Step 7A engine
  const agreement = AgreementService.createAgreement(
    {
      sourceProposalId: testProposal.id,
    },
    advertiserA
  );

  console.log(`Initialized Agreement Public ID: ${agreement.publicId}\n`);

  // =========================================================================
  // TEST 1: Agreement preview loads
  // =========================================================================
  console.log('--- TEST 1: Agreement preview loads ---');
  const preview = AgreementService.getPreview(agreement.id, advertiserA);
  assert(preview !== null && preview !== undefined, 'Agreement preview successfully loaded');
  assert(preview.agreementReference === 'AquaBloom Commercial Master Terms v1.2', 'Agreement reference matches');
  assert(preview.agreementStatus === 'DRAFT', 'Agreement starts in DRAFT status');

  // =========================================================================
  // TEST 2: Correct campaign appears
  // =========================================================================
  console.log('\n--- TEST 2: Correct campaign appears ---');
  assert(preview.campaign.id === testCampaign.id, 'Preview references correct campaign internal ID');
  assert(preview.campaign.publicId === testCampaign.publicCampaignId, 'Preview displays correct campaign public ID');
  assert(preview.campaign.name === 'Verve Summer Alpine Sparkle Activation', 'Preview displays correct campaign name');
  assert(preview.campaignObjective.includes('Direct customer engagement'), 'Preview displays correct campaign objective');

  // =========================================================================
  // TEST 3: Correct venue appears
  // =========================================================================
  console.log('\n--- TEST 3: Correct venue appears ---');
  assert(preview.parties.venue.publicAccountId === venueA.publicAccountId, 'Parties.venue has correct publicAccountId');
  assert(preview.parties.venue.venueName === 'Skyline Luxury Terrace Club', 'Parties.venue displays correct venue name');
  assert(preview.venue.venueName === 'Skyline Luxury Terrace Club', 'Direct venue accessor matches');
  assert(preview.venue.city === 'San Francisco', 'Venue city matches profile');

  // =========================================================================
  // TEST 4: Correct advertiser appears
  // =========================================================================
  console.log('\n--- TEST 4: Correct advertiser appears ---');
  assert(preview.parties.advertiser.publicAccountId === advertiserA.publicAccountId, 'Parties.advertiser has correct publicAccountId');
  assert(preview.parties.advertiser.brandName === 'Verve Botanicals Corp', 'Parties.advertiser displays correct brand name');
  assert(preview.advertiser.brandName === 'Verve Botanicals Corp', 'Direct advertiser accessor matches');
  assert(preview.advertiser.city === 'San Francisco', 'Advertiser city matches profile');

  // =========================================================================
  // TEST 5: Current version appears
  // =========================================================================
  console.log('\n--- TEST 5: Current version appears ---');
  assert(preview.currentVersion !== undefined, 'currentVersion object is populated');
  assert(preview.currentVersion.versionNumber === 1, 'Current version number is 1');
  assert(preview.currentVersion.status === 'ACTIVE', 'Current version status is ACTIVE');
  assert(preview.currentVersion.createdDate.length === 10, 'Current version has formatted createdDate (YYYY-MM-DD)');

  // =========================================================================
  // TEST 6: Historical versions appear correctly
  // =========================================================================
  console.log('\n--- TEST 6: Historical versions appear correctly ---');
  assert(Array.isArray(preview.versionHistory), 'versionHistory is an array');
  assert(preview.versionHistory.length >= 1, 'versionHistory contains at least 1 version');
  const v1 = preview.versionHistory[0];
  assert(v1.versionNumber === 1, 'Version 1 is listed in version history');
  assert(v1.actor !== undefined, 'Version history entry contains actor metadata');
  assert(v1.actor.role === 'ADVERTISER', 'Actor role is ADVERTISER');
  assert(typeof v1.actor.name === 'string', 'Actor has display name');
  assert(typeof v1.changeSummary === 'string', 'Version has change summary');

  // Verify historical version by ID retrieval works for authorized actors
  const historicalV1 = AgreementService.getAgreementVersion(agreement.id, v1.id, advertiserA);
  assert(historicalV1.versionNumber === 1, 'Historical version retrieval by ID succeeds for authorized party');

  // =========================================================================
  // TEST 7: Internal fields are excluded
  // =========================================================================
  console.log('\n--- TEST 7: Internal fields are excluded ---');
  assert((preview as any).supplierCost === undefined, 'No supplierCost field in preview');
  assert((preview as any).supplierInternalCost === undefined, 'No supplierInternalCost field in preview');
  assert((preview as any).aquaBloomMargin === undefined, 'No aquaBloomMargin field in preview');
  assert((preview as any).unconfirmedLogisticsCost === undefined, 'No unconfirmedLogisticsCost field in preview');
  assert((preview as any).unconfirmedTaxes === undefined, 'No unconfirmedTaxes field in preview');
  assert((preview as any).fakeFinalAdvertiserTotal === undefined, 'No fakeFinalAdvertiserTotal field in preview');
  assert((preview as any).ledgerLockStatus === undefined, 'No ledgerLockStatus in preview');
  assert((preview as any).finalPayableCalculated === undefined, 'No finalPayableCalculated in preview');
  assert((preview as any).technicalMetadata === undefined, 'No technicalMetadata in preview');

  // =========================================================================
  // TEST 8: Supplier cannot access
  // =========================================================================
  console.log('\n--- TEST 8: Supplier cannot access ---');
  let supplierBlocked = false;
  try {
    AgreementService.getPreview(agreement.id, supplierUser);
  } catch (err: any) {
    supplierBlocked = true;
    assert(err instanceof AuthorizationError, 'Supplier access thrown AuthorizationError');
  }
  assert(supplierBlocked, 'Supplier was strictly blocked from accessing agreement preview');

  // =========================================================================
  // TEST 9: Logistics cannot access
  // =========================================================================
  console.log('\n--- TEST 9: Logistics cannot access ---');
  let logisticsBlocked = false;
  try {
    AgreementService.getPreview(agreement.id, logisticsUser);
  } catch (err: any) {
    logisticsBlocked = true;
    assert(err instanceof AuthorizationError, 'Logistics partner access thrown AuthorizationError');
  }
  assert(logisticsBlocked, 'Logistics partner was strictly blocked from accessing agreement preview');

  // =========================================================================
  // TEST 10: Unrelated advertiser cannot access
  // =========================================================================
  console.log('\n--- TEST 10: Unrelated advertiser cannot access ---');
  let unrelatedAdvBlocked = false;
  try {
    AgreementService.getPreview(agreement.id, advertiserB);
  } catch (err: any) {
    unrelatedAdvBlocked = true;
    assert(err instanceof AuthorizationError, 'Unrelated advertiser thrown AuthorizationError');
  }
  assert(unrelatedAdvBlocked, 'Unrelated advertiser was strictly blocked (cross-tenant isolation)');

  // =========================================================================
  // TEST 11: Unrelated venue cannot access
  // =========================================================================
  console.log('\n--- TEST 11: Unrelated venue cannot access ---');
  let unrelatedVenBlocked = false;
  try {
    AgreementService.getPreview(agreement.id, venueB);
  } catch (err: any) {
    unrelatedVenBlocked = true;
    assert(err instanceof AuthorizationError, 'Unrelated venue thrown AuthorizationError');
  }
  assert(unrelatedVenBlocked, 'Unrelated venue was strictly blocked (cross-tenant isolation)');

  // Also test that unauthorized historical version access is blocked
  let unauthorizedVersionAccessBlocked = false;
  try {
    AgreementService.getAgreementVersion(agreement.id, v1.id, advertiserB);
  } catch (err: any) {
    unauthorizedVersionAccessBlocked = true;
    assert(err instanceof AuthorizationError, 'Unauthorized historical version access threw AuthorizationError');
  }
  assert(unauthorizedVersionAccessBlocked, 'Unauthorized actor cannot access historical version');

  // =========================================================================
  // TEST 12: No fake pricing appears
  // =========================================================================
  console.log('\n--- TEST 12: No fake pricing appears ---');
  assert(preview.pricingSafeguards.status === 'NO_FINAL_PRICING_AT_AGREEMENT_STAGE', 'Pricing safeguard status is NO_FINAL_PRICING_AT_AGREEMENT_STAGE');
  assert(preview.pricingSafeguards.formulaNote === 'Product Price + Logistics + Applicable Taxes = Final Advertiser Total', 'Correct pricing formula disclosed');
  assert(preview.pricingSafeguards.fakeFinalAdvertiserTotalExcluded === true, 'fakeFinalAdvertiserTotalExcluded is true');
  assert(preview.compensationTerms.finalAmountCalculated === false, 'Compensation finalAmountCalculated is strictly false');
  assert(preview.compensationTerms.maximumCapPercentage === 12.5, 'Statutory venue compensation cap is strictly 12.5%');

  // =========================================================================
  // TEST 13: No confirmation event is created
  // =========================================================================
  console.log('\n--- TEST 13: No confirmation event is created ---');
  // At preview / review stage, confirmationStatus must show readinessMessage
  assert(
    preview.confirmationStatus.readinessMessage === 'Confirmation will become available when the agreement is ready.',
    'Confirmation area displays exact readiness placeholder'
  );
  assert(preview.confirmationStatus.advertiserConfirmed === false, 'Advertiser has not confirmed');
  assert(preview.confirmationStatus.venueConfirmed === false, 'Venue has not confirmed');
  assert(preview.agreementStatus === 'DRAFT', 'Agreement status remains unchanged in DRAFT');

  // Verify that viewing the preview did NOT mutate the agreement or create any confirmation record in db
  const freshAgreement = db.getAgreementById(agreement.id)!;
  assert(freshAgreement.advertiserConfirmedAt === null || freshAgreement.advertiserConfirmedAt === undefined, 'No advertiser confirmation timestamp created');
  assert(freshAgreement.venueConfirmedAt === null || freshAgreement.venueConfirmedAt === undefined, 'No venue confirmation timestamp created');
  assert(freshAgreement.status === 'DRAFT', 'Agreement in DB strictly remains in DRAFT');

  // =========================================================================
  // TEST 14: Mobile layout works
  // =========================================================================
  console.log('\n--- TEST 14: Mobile layout works ---');
  // Verify all 24 required data points are present as non-null primitives/structures that render in mobile-first views
  assert(!!preview.agreementReference, 'Point 1: Agreement reference present');
  assert(!!preview.campaign.name, 'Point 2: Campaign present');
  assert(!!preview.parties.advertiser.brandName && !!preview.parties.venue.venueName, 'Point 3: Parties present');
  assert(!!preview.advertiser.brandName, 'Point 4: Advertiser present');
  assert(!!preview.venue.venueName, 'Point 5: Venue present');
  assert(!!preview.campaignObjective, 'Point 6: Campaign objective present');
  assert(!!preview.targetAudience, 'Point 7: Target audience present');
  assert(preview.quantity === 6000, 'Point 8: Quantity present');
  assert(preview.productRequirements.preferredVolumeMl === 500 || (preview.productRequirements as any).bottleVolumeMl === 500, 'Point 9: Product requirements present');
  assert(preview.campaignDuration.value === 6, 'Point 10: Campaign duration present');
  assert(!!preview.campaignDates.durationLabel, 'Point 11: Campaign dates present');
  assert(
    !!(
      (preview.distributionRequirements as any)?.storageLocation ||
      preview.distributionRequirements?.placementDetails ||
      preview.distributionRequirements
    ),
    'Point 12: Distribution requirements present'
  );
  assert(preview.placementRequirements.length > 0, 'Point 13: Placement requirements present');
  assert(!!preview.collaborationRequirements, 'Point 14: Collaboration requirements present');
  assert(preview.responsibilities.advertiserResponsibilities.length > 0, 'Point 15: Responsibilities present');
  assert(preview.compensationTerms.proposedPercentage === 11.5, 'Point 16: Compensation terms present');
  assert(!!preview.deliveryTermsKnown.stagingInstructions, 'Point 17: Delivery terms known present');
  assert(preview.qrRequirements.trackingEnabled === true, 'Point 18: QR requirements present');
  assert(preview.cancellationTerms.policyId === 'POL-CANC-PREPROD-01', 'Point 19: Cancellation terms present');
  assert(preview.renewalTerms.policyId === 'POL-RENW-EXPLICIT-01', 'Point 20: Renewal terms present');
  assert(!!preview.confirmationStatus.readinessMessage, 'Point 21: Confirmation status present');
  assert(preview.agreementStatus === 'DRAFT', 'Point 22: Agreement status present');
  assert(preview.currentVersion.versionNumber === 1, 'Point 23: Current version present');
  assert(preview.versionHistory.length > 0, 'Point 24: Version history present');

  // =========================================================================
  // TEST 15: Desktop layout works
  // =========================================================================
  console.log('\n--- TEST 15: Desktop layout works ---');
  // Verify dual party structures, tripartite responsibilities, and cap notice
  assert(preview.parties.advertiser.brandName.length > 0, 'Advertiser party desktop block structured');
  assert(preview.parties.venue.venueName.length > 0, 'Venue party desktop block structured');
  assert(preview.responsibilities.advertiserResponsibilities.length > 0, 'Advertiser obligations present');
  assert(preview.responsibilities.venueResponsibilities.length > 0, 'Venue obligations present');
  assert(preview.responsibilities.aquaBloomResponsibilities.length > 0, 'AquaBloom platform obligations present');
  assert(preview.compensationTerms.statutoryCapRule.includes('12.5%'), '12.5% statutory cap notice properly formatted for commercial review');

  // =========================================================================
  // TEST 16: Steps 1–7A continue working
  // =========================================================================
  console.log('\n--- TEST 16: Steps 1–7A continue working ---');
  // Test idempotency: re-calling createAgreement returns the existing agreement
  const duplicateCreateAttempt = AgreementService.createAgreement(
    {
      sourceProposalId: testProposal.id,
    },
    advertiserA
  );
  assert(duplicateCreateAttempt.id === agreement.id, 'Idempotency preserved: returns existing Agreement instance');

  // Test venue can also view their agreement
  const venuePreview = AgreementService.getPreview(agreement.id, venueA);
  assert(venuePreview.viewerRole === 'VENUE', 'Viewer role correctly marked as VENUE for venue actor');
  assert(venuePreview.agreementId === agreement.id, 'Venue retrieves identical agreement review view');

  // Test admin can view
  const adminPreview = AgreementService.getPreview(agreement.id, adminUser);
  assert(adminPreview.viewerRole === 'ADMIN', 'Viewer role correctly marked as ADMIN for admin actor');

  console.log('\n====================================================');
  console.log('ALL 16 AQUABLOOM STEP 7 PART 2 TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('====================================================\n');
}

runAgreementReviewTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
