/**
 * AquaBloom Step 7 Part 1 — Campaign Agreement Foundation Automated Verification Suite
 * 
 * Verifies:
 * 1. Valid READY_FOR_AGREEMENT proposal creates an Agreement Draft
 * 2. Invalid proposal cannot create Agreement
 * 3. Wrong advertiser cannot create Agreement
 * 4. Wrong venue cannot create Agreement
 * 5. Supplier cannot create/access Agreement
 * 6. Logistics partner cannot create/access Agreement
 * 7. Duplicate creation does not create duplicate Agreement (Idempotency)
 * 8. Agreement receives non-sequential AB-CAG-XXXXXXXX ID
 * 9. Version 1 is created correctly with immutable record
 * 10. Multi-venue campaign supports independent Agreements
 * 11. Invalid source proposal version is rejected
 * 12. Agreement status machine starts in DRAFT and does NOT perform final locking
 */

import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementAuthorizationService,
} from '../src/server/agreementServices.js';
import {
  validateAgreementCreation,
} from '../src/lib/agreementValidation.js';
import {
  User,
  Proposal,
  ProposalVersion,
  Campaign,
  CampaignAgreement,
  AdvertiserProfile,
  VenueProfile,
} from '../src/types.js';
import { generateInternalId, generateBusinessId } from '../src/lib/idGenerator.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runAgreementFoundationTests() {
  console.log('====================================================');
  console.log('STARTING AQUABLOOM STEP 7 PART 1: AGREEMENT FOUNDATION TESTS');
  console.log('====================================================\n');

  const now = new Date().toISOString();

  // Seed Users
  const advertiserUser: User = {
    id: 'usr_adv_step7_01',
    publicAccountId: 'AB-ACC-ADV-S7',
    role: 'ADVERTISER',
    organizationName: 'AquaLuxe Beverages',
    email: 'contact@aqualuxe.example',
    contactName: 'Elena Rostova',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  const otherAdvertiserUser: User = {
    id: 'usr_adv_step7_other',
    publicAccountId: 'AB-ACC-ADV-OTH',
    role: 'ADVERTISER',
    organizationName: 'Rival Brands Inc',
    email: 'rival@rival.example',
    contactName: 'Bob Rival',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueUser1: User = {
    id: 'usr_ven_step7_01',
    publicAccountId: 'AB-ACC-VEN-S7A',
    role: 'VENUE',
    organizationName: 'Grand Hyatt Central',
    email: 'events@grandhyatt.example',
    contactName: 'Marcus Vance',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueUser2: User = {
    id: 'usr_ven_step7_02',
    publicAccountId: 'AB-ACC-VEN-S7B',
    role: 'VENUE',
    organizationName: 'Silicon Valley Innovation Hub',
    email: 'operations@svih.example',
    contactName: 'Chloe Zhang',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const otherVenueUser: User = {
    id: 'usr_ven_step7_other',
    publicAccountId: 'AB-ACC-VEN-OTH',
    role: 'VENUE',
    organizationName: 'Unrelated Arena',
    email: 'unrelated@arena.example',
    contactName: 'Frank Unrelated',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const supplierUser: User = {
    id: 'usr_sup_step7_01',
    publicAccountId: 'AB-ACC-SUP-S7',
    role: 'SUPPLIER',
    organizationName: 'EcoBottles Manufacturing',
    email: 'sales@ecobottles.example',
    contactName: 'Sam Supplier',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const logisticsUser: User = {
    id: 'usr_log_step7_01',
    publicAccountId: 'AB-ACC-LOG-S7',
    role: 'LOGISTICS_PARTNER',
    organizationName: 'Express Fleet Solutions',
    email: 'dispatch@expressfleet.example',
    contactName: 'Larry Logistics',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  // Seed Profiles
  const advProfile: AdvertiserProfile = {
    role: 'ADVERTISER',
    accountId: advertiserUser.id,
    brandName: 'AquaLuxe Botanical Hydration',
    description: 'Ultra-pure electrolyte and herbal botanical infusion brand.',
    industry: 'Premium Beverage',
    location: { city: 'San Francisco', country: 'USA' },
    primaryContact: { name: 'Elena Rostova', email: 'contact@aqualuxe.example' },
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: advertiserUser.id,
    changeImpact: 'NO_IMPACT',
  };

  const venProfile1: VenueProfile = {
    role: 'VENUE',
    accountId: venueUser1.id,
    venueName: 'Grand Hyatt Central',
    description: 'Premier urban conference hotel with high corporate footfall.',
    operationalContact: { coordinatorName: 'Front Desk Lead', email: 'frontdesk@hyatt.example' },
    venueType: 'Luxury Hotel & Convention Center',
    audienceCategory: 'Executive & High Net Worth',
    location: { address: '100 Hyatt Way', city: 'San Francisco', country: 'USA' },
    footfall: { monthlyVisitors: 85000, peakTrafficTimes: 'Mon-Sun' },
    bottleConsumption: { estimatedMonthlyBottles: 25000 },
    capacity: { maxBottleHoldingCapacity: 30000, availableBottleCapacity: 20000, currentOngoingBottleCommitment: 0 },
    campaignAvailability: 'YEAR_ROUND',
    visibilityState: 'PUBLIC_ELIGIBLE',
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: venueUser1.id,
    changeImpact: 'NO_IMPACT',
  };

  const venProfile2: VenueProfile = {
    role: 'VENUE',
    accountId: venueUser2.id,
    venueName: 'Silicon Valley Innovation Hub',
    description: 'Collaborative technology ecosystem and accelerator campus.',
    operationalContact: { coordinatorName: 'Campus Operations', email: 'ops@svhub.example' },
    venueType: 'Tech Incubator & Research Park',
    audienceCategory: 'Tech Founders & Investors',
    location: { address: '500 Tech Blvd', city: 'San Jose', country: 'USA' },
    footfall: { monthlyVisitors: 60000, peakTrafficTimes: 'Mon-Fri' },
    bottleConsumption: { estimatedMonthlyBottles: 15000 },
    capacity: { maxBottleHoldingCapacity: 25000, availableBottleCapacity: 15000, currentOngoingBottleCommitment: 0 },
    campaignAvailability: 'YEAR_ROUND',
    visibilityState: 'PUBLIC_ELIGIBLE',
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: venueUser2.id,
    changeImpact: 'NO_IMPACT',
  };

  const testUserIds = [
    advertiserUser.id,
    otherAdvertiserUser.id,
    venueUser1.id,
    venueUser2.id,
    otherVenueUser.id,
    supplierUser.id,
    logisticsUser.id,
  ];
  (db as any).schema.users = (db as any).schema.users.filter((u: any) => !testUserIds.includes(u.id));

  (db as any).schema.users.push(
    advertiserUser,
    otherAdvertiserUser,
    venueUser1,
    venueUser2,
    otherVenueUser,
    supplierUser,
    logisticsUser
  );
  (db as any).schema.profiles[advertiserUser.id] = advProfile;
  (db as any).schema.profiles[venueUser1.id] = venProfile1;
  (db as any).schema.profiles[venueUser2.id] = venProfile2;

  // Clean up any test artifacts from prior test runs to ensure isolation
  (db as any).schema.agreements = (db as any).schema.agreements.filter(
    (a: any) => a.sourceProposalId !== 'prp_s7_venue1' && a.sourceProposalId !== 'prp_s7_venue2'
  );

  // Seed Campaign (Multi-venue eligible)
  const campaign: Campaign = {
    id: 'cmp_s7_multi_venue',
    publicCampaignId: 'AB-CMP-S7-001',
    advertiserId: advertiserUser.id,
    name: 'Fall 2026 Pure Glacier Tour',
    description: 'A botanical beverage tour across premier regional hubs.',
    category: 'Beverage & Hospitality',
    objective: 'Brand Visibility & Premium Sampling',
    targetAudience: { demographics: 'Affluent Professionals', characteristics: ['Tech-savvy', 'Eco-conscious'] },
    venueRequirements: {
      preferredVenueTypes: ['Luxury Hotel', 'Tech Campus'],
      preferredLocations: [{ city: 'San Francisco', country: 'USA' }],
      placementRequirements: ['Front Desk', 'Conference Lounge'],
    },
    bottleRequirements: {
      requiredQuantity: 10000,
      preferredVolumeMl: 500,
      preferredMaterial: 'Glass / rPET',
      packagingConfiguration: 'Pack of 24',
    },
    timing: {
      duration: { value: 6, unit: 'WEEKS' },
      preferredStartPeriod: { label: 'November 2026' },
    },
    distributionRequirements: {
      placementDetails: 'Staged at main concierge and conference registration',
      refrigerationRequired: true,
    },
    collaborationRequirement: {
      status: 'OPEN_TO_COLLABORATION',
      notes: 'Open to co-branded eco-awareness flyers',
    },
    status: 'ACTIVE',
    currentVersionNumber: 1,
    activeVersionId: 'cmv_s7_1',
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: advertiserUser.id,
  };
  db.saveCampaign(campaign);

  // Seed Proposal 1: Venue 1 (Grand Hyatt) -> READY_FOR_AGREEMENT
  const proposal1: Proposal = {
    id: 'prp_s7_venue1',
    publicProposalId: 'AB-PRP-S7-001',
    campaignId: campaign.id,
    publicCampaignId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advProfile.brandName,
    venueId: venueUser1.id,
    venuePublicId: venueUser1.publicAccountId,
    venueName: venProfile1.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: {
      campaignQuantity: 5000,
      campaignDuration: campaign.timing.duration,
      preferredStartPeriod: campaign.timing.preferredStartPeriod,
      distributionRequirements: campaign.distributionRequirements,
      placementRequirements: ['Concierge Staging Desk'],
      productRequirements: {
        preferredVolumeMl: 500,
        preferredMaterial: 'Glass',
      },
      collaborationRequirement: campaign.collaborationRequirement,
      venueCompensationTerms: {
        proposedPercentage: 10.0,
        termsDescription: '10.0% of bottle ad cost',
        notes: 'Compliant with AquaBloom 12.5% cap',
      },
      customConditions: 'Must not freeze bottles',
    },
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: venueUser1.id,
  };

  const proposalVersion1: ProposalVersion = {
    id: `prv_${proposal1.id}_v1`,
    publicVersionId: 'AB-PRV-S7-001-01',
    proposalId: proposal1.id,
    versionNumber: 1,
    actor: {
      userId: advertiserUser.id,
      role: 'ADVERTISER',
      organizationName: advProfile.brandName,
    },
    terms: proposal1.terms,
    createdAt: now,
    createdBy: advertiserUser.id,
    changeSummary: 'Initial proposal mutually confirmed.',
    changedFields: [],
  };

  db.saveProposal(proposal1);
  db.saveProposalVersion(proposalVersion1);

  // Seed Proposal 2: Venue 2 (Silicon Valley Hub) -> READY_FOR_AGREEMENT
  const proposal2: Proposal = {
    id: 'prp_s7_venue2',
    publicProposalId: 'AB-PRP-S7-002',
    campaignId: campaign.id,
    publicCampaignId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advProfile.brandName,
    venueId: venueUser2.id,
    venuePublicId: venueUser2.publicAccountId,
    venueName: venProfile2.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: {
      campaignQuantity: 5000,
      campaignDuration: campaign.timing.duration,
      preferredStartPeriod: campaign.timing.preferredStartPeriod,
      distributionRequirements: campaign.distributionRequirements,
      placementRequirements: ['Innovation Lounge Entrance'],
      productRequirements: {
        preferredVolumeMl: 500,
        preferredMaterial: 'rPET',
      },
      collaborationRequirement: campaign.collaborationRequirement,
      venueCompensationTerms: {
        proposedPercentage: 12.0,
        termsDescription: '12.0% of bottle ad cost',
        notes: 'Compliant with AquaBloom 12.5% cap',
      },
      customConditions: 'Eco-bins alongside',
    },
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: venueUser2.id,
  };

  const proposalVersion2: ProposalVersion = {
    id: `prv_${proposal2.id}_v1`,
    publicVersionId: 'AB-PRV-S7-002-01',
    proposalId: proposal2.id,
    versionNumber: 1,
    actor: {
      userId: advertiserUser.id,
      role: 'ADVERTISER',
      organizationName: advProfile.brandName,
    },
    terms: proposal2.terms,
    createdAt: now,
    createdBy: advertiserUser.id,
    changeSummary: 'Second venue mutually confirmed.',
    changedFields: [],
  };

  db.saveProposal(proposal2);
  db.saveProposalVersion(proposalVersion2);

  // --- TEST GROUP 1: Valid READY_FOR_AGREEMENT creates Agreement Draft ---
  console.log('--- TEST GROUP 1: Valid READY_FOR_AGREEMENT creates Agreement Draft ---');

  const agreement1 = AgreementService.createAgreement(
    { sourceProposalId: proposal1.id },
    advertiserUser
  );

  assert(!!agreement1, 'Agreement is created successfully');
  assert(agreement1.status === 'DRAFT', 'Agreement initial status is DRAFT (not locked)');
  assert(agreement1.lockedAt === null, 'Agreement is NOT locked at creation');
  assert(agreement1.lockedSnapshotId === null, 'No locked snapshot attached during draft creation');
  assert(agreement1.currentVersionNumber === 1, 'Initial agreement version number is 1');
  assert(agreement1.campaignId === campaign.id, 'Agreement correctly references Campaign');
  assert(agreement1.advertiserId === advertiserUser.id, 'Agreement correctly references Advertiser');
  assert(agreement1.venueId === venueUser1.id, 'Agreement correctly references Venue 1');
  assert(agreement1.sourceProposalId === proposal1.id, 'Agreement preserves source proposal ID');
  assert(agreement1.sourceProposalVersionNumber === 1, 'Agreement preserves source proposal version number');

  // --- TEST GROUP 2: Public Identifier Format ---
  console.log('\n--- TEST GROUP 2: Public Identifier Format (AB-CAG-XXXXXXXX) ---');

  assert(agreement1.publicId.startsWith('AB-CAG-'), 'Public ID starts with AB-CAG-');
  assert(/^AB-CAG-[A-Z0-9-]+$/.test(agreement1.publicId), `Public ID format conforms to specification: ${agreement1.publicId}`);
  assert(agreement1.publicId !== agreement1.id, 'Internal ID is distinct from public ID (non-sequential, obfuscated)');

  // --- TEST GROUP 3: Agreement Versioning Foundation ---
  console.log('\n--- TEST GROUP 3: Agreement Versioning Foundation ---');

  const versions = db.getAgreementVersions(agreement1.id);
  assert(versions.length === 1, 'Exactly 1 version record exists for new agreement');
  assert(versions[0].versionNumber === 1, 'Version record has versionNumber 1');
  assert(versions[0].agreementId === agreement1.id, 'Version record references agreement');
  assert(versions[0].status === 'ACTIVE', 'Initial draft version status is ACTIVE');
  assert(versions[0].sourceProposalVersionId === agreement1.sourceProposalVersionId, 'Version record references source proposal version');
  assert(versions[0].publicVersionId.startsWith('AB-CGV-'), `Public Version ID format conforms: ${versions[0].publicVersionId}`);

  // --- TEST GROUP 4: Idempotency Protection ---
  console.log('\n--- TEST GROUP 4: Idempotency & Duplicate Protection ---');

  const duplicateAttempt = AgreementService.createAgreement(
    { sourceProposalId: proposal1.id },
    advertiserUser
  );
  assert(duplicateAttempt.id === agreement1.id, 'Repeated creation returns the existing agreement instance');
  assert(duplicateAttempt.publicId === agreement1.publicId, 'Repeated creation returns the same public ID');
  const allAgreementsForProp = db.getAllAgreements().filter((a) => a.sourceProposalId === proposal1.id);
  assert(allAgreementsForProp.length === 1, 'No duplicate agreement records were inserted in database');

  // --- TEST GROUP 5: Source Proposal Validation Constraints ---
  console.log('\n--- TEST GROUP 5: Source Proposal Validation Constraints ---');

  // Test 5A: Non-existent proposal
  let rejectedNotFound = false;
  try {
    AgreementService.createAgreement({ sourceProposalId: 'prp_non_existent' }, advertiserUser);
  } catch (err: any) {
    rejectedNotFound = true;
  }
  assert(rejectedNotFound, 'Attempt to create agreement from non-existent proposal is rejected');

  // Test 5B: Unconfirmed proposal (DRAFT)
  const unconfirmedProposal: Proposal = {
    ...proposal1,
    id: 'prp_s7_unconfirmed',
    publicProposalId: 'AB-PRP-S7-UNCONF',
    status: 'DRAFT',
    advertiserConfirmedAt: null,
    venueConfirmedAt: null,
  };
  const unconfirmedVal = validateAgreementCreation(unconfirmedProposal, campaign, advertiserUser);
  assert(!unconfirmedVal.isValid, 'Unconfirmed proposal fails validation');
  assert(
    unconfirmedVal.errors.some((e) => e.field === 'proposalStatus'),
    'Reports proposalStatus must be READY_FOR_AGREEMENT'
  );
  assert(
    unconfirmedVal.errors.some((e) => e.field === 'advertiserConfirmedAt'),
    'Reports advertiser must have confirmed'
  );

  // Test 5C: Expired proposal
  const expiredProposal: Proposal = {
    ...proposal1,
    id: 'prp_s7_expired',
    publicProposalId: 'AB-PRP-S7-EXP',
    status: 'EXPIRED',
    expiresAt: new Date(Date.now() - 3600000).toISOString(),
  };
  const expiredVal = validateAgreementCreation(expiredProposal, campaign, advertiserUser);
  assert(!expiredVal.isValid, 'Expired proposal fails validation');
  assert(
    expiredVal.errors.some((e) => e.field === 'expiresAt' || e.field === 'proposalStatus'),
    'Reports proposal has expired'
  );

  // Test 5D: Withdrawn proposal
  const withdrawnProposal: Proposal = {
    ...proposal1,
    id: 'prp_s7_withdrawn',
    publicProposalId: 'AB-PRP-S7-WITHDRAWN',
    status: 'WITHDRAWN',
  };
  const withdrawnVal = validateAgreementCreation(withdrawnProposal, campaign, advertiserUser);
  assert(!withdrawnVal.isValid, 'Withdrawn proposal fails validation');
  assert(
    withdrawnVal.errors.some((e) => e.field === 'proposalStatus'),
    'Reports proposal was withdrawn'
  );

  // --- TEST GROUP 6: Role & Counterparty Isolation ---
  console.log('\n--- TEST GROUP 6: Role & Counterparty Isolation ---');

  // Test 6A: Wrong advertiser cannot create agreement
  const wrongAdvVal = validateAgreementCreation(proposal1, campaign, otherAdvertiserUser);
  assert(!wrongAdvVal.isValid, 'Unrelated advertiser cannot create agreement for another advertiser');
  assert(wrongAdvVal.errors.some((e) => e.field === 'actor'), 'Rejects with actor authorization error');

  // Test 6B: Wrong venue cannot create agreement
  const wrongVenVal = validateAgreementCreation(proposal1, campaign, otherVenueUser);
  assert(!wrongVenVal.isValid, 'Unrelated venue cannot create agreement for another venue');
  assert(wrongVenVal.errors.some((e) => e.field === 'actor'), 'Rejects with actor authorization error');

  // Test 6C: Supplier cannot create agreement
  const supplierVal = validateAgreementCreation(proposal1, campaign, supplierUser);
  assert(!supplierVal.isValid, 'Supplier cannot create campaign agreement');
  assert(supplierVal.errors.some((e) => e.field === 'actor'), 'Rejects supplier actor');

  // Test 6D: Supplier cannot view agreement
  let supplierViewDenied = false;
  try {
    AgreementAuthorizationService.assertCanView(agreement1, supplierUser);
  } catch (err: any) {
    supplierViewDenied = true;
  }
  assert(supplierViewDenied, 'Supplier view access strictly denied by AgreementAuthorizationService');

  // Test 6E: Logistics Partner cannot view agreement
  let logisticsViewDenied = false;
  try {
    AgreementAuthorizationService.assertCanView(agreement1, logisticsUser);
  } catch (err: any) {
    logisticsViewDenied = true;
  }
  assert(logisticsViewDenied, 'Logistics Partner view access strictly denied by AgreementAuthorizationService');

  // Test 6F: Cross-tenant advertiser cannot view agreement
  let crossAdvDenied = false;
  try {
    AgreementAuthorizationService.assertCanView(agreement1, otherAdvertiserUser);
  } catch (err: any) {
    crossAdvDenied = true;
  }
  assert(crossAdvDenied, 'Unrelated advertiser cannot view another advertiser agreement');

  // Test 6G: Owning parties CAN view
  let advCanView = true;
  try {
    AgreementAuthorizationService.assertCanView(agreement1, advertiserUser);
  } catch (err: any) {
    advCanView = false;
  }
  assert(advCanView, 'Owning advertiser CAN view agreement');

  let venCanView = true;
  try {
    AgreementAuthorizationService.assertCanView(agreement1, venueUser1);
  } catch (err: any) {
    venCanView = false;
  }
  assert(venCanView, 'Recipient venue CAN view agreement');

  // --- TEST GROUP 7: Source Proposal Version Consistency ---
  console.log('\n--- TEST GROUP 7: Source Proposal Version Consistency ---');

  // Test 7A: Source proposal version number mismatch
  const staleProposalVersion: ProposalVersion = {
    ...proposalVersion1,
    id: 'prv_stale_v0',
    versionNumber: 0, // Stale version
  };
  const staleVal = validateAgreementCreation(proposal1, campaign, advertiserUser, staleProposalVersion);
  assert(!staleVal.isValid, 'Outdated proposal version is rejected');
  assert(
    staleVal.errors.some((e) => e.field === 'sourceProposalVersionNumber'),
    'Reports source proposal version is not the latest mutually confirmed version'
  );

  // Test 7B: Proposal version belongs to different proposal
  const mismatchedPropVersion: ProposalVersion = {
    ...proposalVersion1,
    id: 'prv_alien_v1',
    proposalId: 'prp_alien_999',
  };
  const mismatchVal = validateAgreementCreation(proposal1, campaign, advertiserUser, mismatchedPropVersion);
  assert(!mismatchVal.isValid, 'Alien proposal version is rejected');
  assert(
    mismatchVal.errors.some((e) => e.field === 'sourceProposalVersionId'),
    'Reports proposal version does not belong to proposal'
  );

  // --- TEST GROUP 8: Multi-Venue Independent Agreements ---
  console.log('\n--- TEST GROUP 8: Multi-Venue Independent Agreements ---');

  const agreement2 = AgreementService.createAgreement(
    { sourceProposalId: proposal2.id },
    advertiserUser
  );

  assert(!!agreement2, 'Second agreement for same campaign with Venue 2 created successfully');
  assert(agreement2.id !== agreement1.id, 'Agreements have distinct internal IDs');
  assert(agreement2.publicId !== agreement1.publicId, 'Agreements have distinct public IDs');
  assert(agreement2.campaignId === campaign.id, 'Both agreements reference the same parent campaign');
  assert(agreement2.venueId === venueUser2.id, 'Agreement 2 belongs to Venue 2');
  assert(agreement1.venueId === venueUser1.id, 'Agreement 1 belongs to Venue 1');
  assert(agreement2.terms.campaignQuantity === 5000, 'Agreement 2 quantity matches Venue 2 proposal');
  assert(
    agreement2.terms.venueCompensationTerms.proposedPercentage === 12.0,
    'Agreement 2 maintains its independent negotiated compensation (12.0%)'
  );
  assert(
    agreement1.terms.venueCompensationTerms.proposedPercentage === 10.0,
    'Agreement 1 maintains its independent negotiated compensation (10.0%)'
  );

  // --- TEST GROUP 9: Domain Policies & Business Invariants ---
  console.log('\n--- TEST GROUP 9: Domain Policies & Business Invariants ---');

  assert(
    agreement1.terms.venueCompensationTerms.maximumCapPercentage === 12.5,
    'Venue compensation terms enforces 12.5% statutory cap'
  );
  assert(
    agreement1.terms.cancellationTerms.cutoffStage === 'PRODUCTION_START',
    'Cancellation policy is strictly PRE-PRODUCTION'
  );
  assert(
    agreement1.terms.renewalTerms.renewalType === 'EXPLICIT_APPROVAL_REQUIRED',
    'Renewal policy requires explicit advertiser approval'
  );
  assert(
    agreement1.terms.deliveryTermsKnown.status === 'PENDING_LOGISTICS_ASSIGNMENT',
    'Delivery terms states logistics is determined at future stage without fabricated costs'
  );

  // --- TEST GROUP 10: Step 7 Part 1 Scope Boundaries ---
  console.log('\n--- TEST GROUP 10: Step 7 Part 1 Scope Boundaries ---');

  // Verify internal record exists and has no leaked supplier/logistics pricing
  const internalRecord = db.getAgreementInternalRecord(agreement1.id);
  assert(!!internalRecord, 'Internal record foundation created');
  assert(
    internalRecord?.futureSupplierAssignmentReference === null,
    'Supplier assignment is explicitly null (future stage)'
  );
  assert(
    internalRecord?.futureLogisticsAssignmentReference === null,
    'Logistics assignment is explicitly null (future stage)'
  );
  assert(
    internalRecord?.internalFinancialReferences.finalPayableCalculated === false,
    'Final payable is NOT calculated in Part 1'
  );
  assert(
    agreement1.status === 'DRAFT',
    'Agreement remains in DRAFT without accidental atomic lock'
  );

  console.log('\n====================================================');
  console.log('ALL STEP 7 PART 1 AGREEMENT FOUNDATION TESTS PASSED! 🎉');
  console.log('====================================================\n');
}

runAgreementFoundationTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
