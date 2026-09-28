/**
 * AquaBloom Step 7 Part 3 — Campaign Agreement Confirmation, Atomic Lock,
 * and Immutable Snapshot Automated Verification Suite
 * 
 * Verifies:
 * 1. Both parties must explicitly confirm (Advertiser + Venue)
 * 2. Status sequences: DRAFT -> AWAITING_VENUE_CONFIRMATION -> READY_TO_LOCK
 * 3. Version specificity: version increment clears previous confirmations
 * 4. Stale version and lock version concurrency rejection
 * 5. Atomic Lock creates immutable, detached CampaignAgreementSnapshot
 * 6. Mutations on locked agreement throw AgreementLockedError (409)
 * 7. db.runTransaction atomic rollback on lock transaction failure
 * 8. Multi-venue agreements lock independently
 */

import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementAuthorizationService,
  AgreementSnapshotService,
} from '../src/server/agreementServices.js';
import {
  validateAgreementConfirmation,
  validateAgreementLock,
} from '../src/lib/agreementValidation.js';
import {
  User,
  Proposal,
  ProposalVersion,
  Campaign,
  CampaignAgreement,
  CampaignAgreementVersion,
  AdvertiserProfile,
  VenueProfile,
} from '../src/types.js';
import { generateInternalId, generateBusinessId } from '../src/lib/idGenerator.js';
import { AgreementLockedError, ConflictError, ValidationError, AuthorizationError } from '../src/lib/errors.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runAgreementLockingTests() {
  console.log('====================================================');
  console.log('STARTING AQUABLOOM STEP 7 PART 3: CONFIRMATION & LOCK TESTS');
  console.log('====================================================\n');

  // Clean up any test artifacts from previous runs
  const testProposalIds = ['prp_s7_lock_venueA', 'prp_s7_lock_venueB', 'prp_s7_lock_amendment'];
  const testUserIds = ['usr_adv_lock_01', 'usr_ven_lock_01', 'usr_ven_lock_02', 'usr_admin_lock_01', 'usr_sup_lock_01'];
  (db as any).schema.users = (db as any).schema.users.filter((u: any) => !testUserIds.includes(u.id));
  (db as any).schema.campaigns = (db as any).schema.campaigns.filter((c: any) => c.id !== 'cmp_s7_lock_tour');
  (db as any).schema.proposals = (db as any).schema.proposals.filter((p: any) => !testProposalIds.includes(p.id));
  (db as any).schema.proposalVersions = (db as any).schema.proposalVersions.filter((v: any) => !testProposalIds.includes(v.proposalId));
  const existingTestAgreements = ((db as any).schema.agreements || []).filter((a: any) => testProposalIds.includes(a.sourceProposalId));
  const testAgreementIds = existingTestAgreements.map((a: any) => a.id);
  (db as any).schema.agreements = ((db as any).schema.agreements || []).filter((a: any) => !testAgreementIds.includes(a.id));
  (db as any).schema.agreementVersions = ((db as any).schema.agreementVersions || []).filter((v: any) => !testAgreementIds.includes(v.agreementId));
  (db as any).schema.agreementSnapshots = ((db as any).schema.agreementSnapshots || []).filter((s: any) => !testAgreementIds.includes(s.agreementId));
  (db as any).schema.agreementInternalRecords = ((db as any).schema.agreementInternalRecords || []).filter((r: any) => !testAgreementIds.includes(r.agreementId));

  const now = new Date().toISOString();

  // 1. Seed Users
  const advertiserUser: User = {
    id: 'usr_adv_lock_01',
    publicAccountId: 'AB-ACC-ADV-LCK',
    role: 'ADVERTISER',
    organizationName: 'Luxe Spring Botanicals',
    email: 'brand@luxespring.example',
    contactName: 'Victoria Sterling',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueUserA: User = {
    id: 'usr_ven_lock_01',
    publicAccountId: 'AB-ACC-VEN-LCK1',
    role: 'VENUE',
    organizationName: 'The Grand Atrium Hotel',
    email: 'events@grandatrium.example',
    contactName: 'Marcus Vance',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const venueUserB: User = {
    id: 'usr_ven_lock_02',
    publicAccountId: 'AB-ACC-VEN-LCK2',
    role: 'VENUE',
    organizationName: 'Skyline Terrace Lounge',
    email: 'partners@skylineterrace.example',
    contactName: 'Elena Rostova',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const adminUser: User = {
    id: 'usr_admin_lock_01',
    publicAccountId: 'AB-ACC-ADM-LCK',
    role: 'ADMIN',
    organizationName: 'AquaBloom Global Admin',
    email: 'admin@aquabloom.example',
    contactName: 'Operations Lead',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  const supplierUser: User = {
    id: 'usr_sup_lock_01',
    publicAccountId: 'AB-ACC-SUP-LCK',
    role: 'SUPPLIER',
    organizationName: 'Alpine Spring Bottlers',
    email: 'production@alpinespring.example',
    contactName: 'Hans Becker',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };

  (db as any).schema.users.push(
    advertiserUser,
    venueUserA,
    venueUserB,
    adminUser,
    supplierUser
  );

  const advProfile: AdvertiserProfile = {
    role: 'ADVERTISER',
    accountId: advertiserUser.id,
    brandName: 'Luxe Spring Botanicals',
    description: 'Luxury organic botanicals and functional beverages',
    industry: 'Wellness & Luxury Beverages',
    advertisingCategory: 'Organic Consumer Goods',
    primaryContact: {
      name: 'Victoria Sterling',
      email: 'brand@luxespring.example',
    },
    location: {
      city: 'San Francisco',
      country: 'USA',
    },
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: advertiserUser.id,
    changeImpact: 'NO_IMPACT',
  };

  const venProfileA: VenueProfile = {
    role: 'VENUE',
    accountId: venueUserA.id,
    venueName: 'The Grand Atrium Hotel',
    description: 'Luxury historic hotel in San Francisco',
    venueType: 'HOTEL_RESORT',
    audienceCategory: 'Executive & Luxury Travelers',
    bottleConsumption: {
      averageMonthlyConsumption: 12000,
      peakEventConsumption: 15000,
      dispenseLocations: ['Lobby Concierge', 'Executive Suite Service'],
      preferredMaterial: 'rPET',
    } as any,
    operationalContact: {
      coordinatorName: 'Marcus Vance',
      email: 'events@grandatrium.example',
    },
    location: {
      city: 'San Francisco',
      country: 'USA',
      address: '700 Market St',
    },
    footfall: {
      monthlyVisitors: 48000,
    },
    capacity: {
      availableBottleCapacity: 12000,
      maxBottleHoldingCapacity: 20000,
      currentOngoingBottleCommitment: 0,
    },
    placementPossibilities: ['Lobby Concierge', 'Executive Suite Service'],
    campaignAvailability: 'YEAR_ROUND',
    visibilityState: 'PUBLIC_ELIGIBLE',
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: venueUserA.id,
    changeImpact: 'NO_IMPACT',
  };

  const venProfileB: VenueProfile = {
    role: 'VENUE',
    accountId: venueUserB.id,
    venueName: 'Skyline Terrace Lounge',
    description: 'Premier rooftop lounge and event venue',
    venueType: 'NIGHTLIFE',
    audienceCategory: 'Affluent Nightlife Patrons',
    bottleConsumption: {
      averageMonthlyConsumption: 8000,
      peakEventConsumption: 10000,
      dispenseLocations: ['VIP Lounge Service', 'Main Bar Entry'],
      preferredMaterial: 'rPET',
    } as any,
    operationalContact: {
      coordinatorName: 'Elena Rostova',
      email: 'partners@skylineterrace.example',
    },
    location: {
      city: 'San Francisco',
      country: 'USA',
      address: '555 California St',
    },
    footfall: {
      monthlyVisitors: 32000,
    },
    capacity: {
      availableBottleCapacity: 8000,
      maxBottleHoldingCapacity: 15000,
      currentOngoingBottleCommitment: 0,
    },
    placementPossibilities: ['VIP Lounge Service', 'Main Bar Entry'],
    campaignAvailability: 'YEAR_ROUND',
    visibilityState: 'PUBLIC_ELIGIBLE',
    completion: { isComplete: true, percentage: 100, missingRequiredFields: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: venueUserB.id,
    changeImpact: 'NO_IMPACT',
  };

  (db as any).schema.profiles[advertiserUser.id] = advProfile;
  (db as any).schema.profiles[venueUserA.id] = venProfileA;
  (db as any).schema.profiles[venueUserB.id] = venProfileB;

  // 2. Seed Multi-Venue Campaign
  const campaign: Campaign = {
    id: 'cmp_s7_lock_tour',
    publicCampaignId: 'AB-CMP-LCK-001',
    advertiserId: advertiserUser.id,
    name: 'Pure Elegance Botanical 2026',
    description: 'A botanical beverage placement across luxury venues.',
    category: 'Luxury Consumer Wellness',
    objective: 'High-Touch Hospitality Placement',
    targetAudience: { demographics: 'Affluent Professionals', characteristics: ['Eco-conscious', 'Luxury Travel'] },
    venueRequirements: {
      preferredVenueTypes: ['Luxury Hotel', 'Nightlife Lounge'],
      preferredLocations: [{ city: 'San Francisco', country: 'USA' }],
      placementRequirements: ['Concierge Staging', 'VIP Lounge'],
    },
    bottleRequirements: {
      requiredQuantity: 20000,
      preferredVolumeMl: 500,
      preferredMaterial: 'Aluminum Bottle',
      packagingConfiguration: 'Case of 24',
    },
    timing: {
      duration: { value: 6, unit: 'WEEKS' },
      preferredStartPeriod: { label: 'October 2026' },
    },
    distributionRequirements: {
      placementDetails: 'Main concierge desk and VIP lounge staging',
      refrigerationRequired: true,
    },
    collaborationRequirement: {
      status: 'STANDARD_CAMPAIGN' as any,
      notes: 'Standard verified placement',
    },
    status: 'ACTIVE',
    currentVersionNumber: 1,
    activeVersionId: 'cmv_s7_lock_1',
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: advertiserUser.id,
  };
  db.saveCampaign(campaign);

  // 3. Seed Proposals for Venue A and Venue B
  const proposalA: Proposal = {
    id: 'prp_s7_lock_venueA',
    publicProposalId: 'AB-PRP-LCK-001',
    campaignId: campaign.id,
    publicCampaignId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advProfile.brandName,
    venueId: venueUserA.id,
    venuePublicId: venueUserA.publicAccountId,
    venueName: venProfileA.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: {
      campaignQuantity: 12000,
      campaignDuration: campaign.timing.duration,
      preferredStartPeriod: campaign.timing.preferredStartPeriod,
      distributionRequirements: campaign.distributionRequirements,
      placementRequirements: ['Lobby Concierge Desk', 'Executive Lounge'],
      productRequirements: {
        preferredVolumeMl: 500,
        preferredMaterial: 'Aluminum Bottle',
      },
      collaborationRequirement: campaign.collaborationRequirement,
      venueCompensationTerms: {
        proposedPercentage: 10.0,
        termsDescription: '10.0% of bottle advertising cost',
        notes: 'Compliant with AquaBloom 12.5% cap',
      },
      customConditions: 'Chilled distribution at concierge',
    },
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: venueUserA.id,
  };

  const proposalVersionA: ProposalVersion = {
    id: `prv_${proposalA.id}_v1`,
    publicVersionId: 'AB-PRV-LCK-001-01',
    proposalId: proposalA.id,
    versionNumber: 1,
    actor: {
      userId: advertiserUser.id,
      role: 'ADVERTISER',
      organizationName: advProfile.brandName,
    },
    terms: proposalA.terms,
    createdAt: now,
    createdBy: advertiserUser.id,
    changeSummary: 'Proposal A mutually confirmed for Grand Atrium.',
    changedFields: [],
  };

  db.saveProposal(proposalA);
  db.saveProposalVersion(proposalVersionA);

  const proposalB: Proposal = {
    id: 'prp_s7_lock_venueB',
    publicProposalId: 'AB-PRP-LCK-002',
    campaignId: campaign.id,
    publicCampaignId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advProfile.brandName,
    venueId: venueUserB.id,
    venuePublicId: venueUserB.publicAccountId,
    venueName: venProfileB.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: {
      campaignQuantity: 8000,
      campaignDuration: campaign.timing.duration,
      preferredStartPeriod: campaign.timing.preferredStartPeriod,
      distributionRequirements: campaign.distributionRequirements,
      placementRequirements: ['VIP Lounge Bar'],
      productRequirements: {
        preferredVolumeMl: 500,
        preferredMaterial: 'Aluminum Bottle',
      },
      collaborationRequirement: campaign.collaborationRequirement,
      venueCompensationTerms: {
        proposedPercentage: 8.5,
        termsDescription: '8.5% of bottle advertising cost',
        notes: 'Compliant with AquaBloom 12.5% cap',
      },
      customConditions: 'VIP station stocking',
    },
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: venueUserB.id,
  };

  const proposalVersionB: ProposalVersion = {
    id: `prv_${proposalB.id}_v1`,
    publicVersionId: 'AB-PRV-LCK-002-01',
    proposalId: proposalB.id,
    versionNumber: 1,
    actor: {
      userId: advertiserUser.id,
      role: 'ADVERTISER',
      organizationName: advProfile.brandName,
    },
    terms: proposalB.terms,
    createdAt: now,
    createdBy: advertiserUser.id,
    changeSummary: 'Proposal B mutually confirmed for Skyline Terrace.',
    changedFields: [],
  };

  db.saveProposal(proposalB);
  db.saveProposalVersion(proposalVersionB);

  const proposalC: Proposal = {
    id: 'prp_s7_lock_amendment',
    publicProposalId: 'AB-PRP-LCK-003',
    campaignId: campaign.id,
    publicCampaignId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advProfile.brandName,
    venueId: venueUserA.id,
    venuePublicId: venueUserA.publicAccountId,
    venueName: venProfileA.venueName,
    currentVersionNumber: 1,
    status: 'READY_FOR_AGREEMENT',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    advertiserConfirmedAt: now,
    venueConfirmedAt: now,
    terms: proposalA.terms,
    createdAt: now,
    updatedAt: now,
    createdBy: advertiserUser.id,
    updatedBy: venueUserA.id,
  };

  const proposalVersionC: ProposalVersion = {
    id: `prv_${proposalC.id}_v1`,
    publicVersionId: 'AB-PRV-LCK-003-01',
    proposalId: proposalC.id,
    versionNumber: 1,
    actor: {
      userId: advertiserUser.id,
      role: 'ADVERTISER',
      organizationName: advProfile.brandName,
    },
    terms: proposalC.terms,
    createdAt: now,
    createdBy: advertiserUser.id,
    changeSummary: 'Proposal C for amendment test.',
    changedFields: [],
  };

  db.saveProposal(proposalC);
  db.saveProposalVersion(proposalVersionC);

  // 4. Create Agreement A and Agreement B
  const agreementA = AgreementService.createAgreement(
    { sourceProposalId: proposalA.id },
    advertiserUser
  );
  assert(agreementA.status === 'DRAFT', 'Agreement A starts in DRAFT status');
  assert(agreementA.currentVersionNumber === 1, 'Agreement A is at Version 1');
  assert(agreementA.lockVersion === 1, 'Agreement A initial lockVersion is 1');

  const agreementB = AgreementService.createAgreement(
    { sourceProposalId: proposalB.id },
    advertiserUser
  );
  assert(agreementB.status === 'DRAFT', 'Agreement B starts in DRAFT status');

  console.log('\n--- TEST SCENARIO 1: Non-party & Unauthorized Confirmation Rejection ---');
  try {
    AgreementService.confirmAgreement(agreementA.id, supplierUser, {
      expectedVersion: 1,
      acknowledgement: true,
    });
    assert(false, 'Supplier should NOT be allowed to confirm agreement');
  } catch (err: any) {
    assert(err instanceof AuthorizationError, 'Supplier confirmation correctly blocked with AuthorizationError');
  }

  try {
    AgreementService.confirmAgreement(agreementA.id, venueUserB, {
      expectedVersion: 1,
      acknowledgement: true,
    });
    assert(false, 'Venue B should NOT be allowed to confirm Venue A agreement');
  } catch (err: any) {
    assert(err instanceof AuthorizationError, 'Cross-venue confirmation blocked with AuthorizationError');
  }

  console.log('\n--- TEST SCENARIO 2: Acknowledgement Validation ---');
  try {
    AgreementService.confirmAgreement(agreementA.id, advertiserUser, {
      expectedVersion: 1,
      acknowledgement: false,
    });
    assert(false, 'Confirmation without acknowledgement must be rejected');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Unacknowledged confirmation correctly rejected with ValidationError');
  }

  console.log('\n--- TEST SCENARIO 3: Step-by-Step Explicit Confirmation ---');
  // Advertiser Confirms Agreement A
  const { agreement: afterAdvConfirm } = AgreementService.confirmAgreement(agreementA.id, advertiserUser, {
    expectedVersion: 1,
    acknowledgement: true,
    notes: 'Reviewed and confirmed by brand lead Victoria Sterling',
  });
  assert(
    afterAdvConfirm.status === 'AWAITING_VENUE_CONFIRMATION',
    'Status transitions to AWAITING_VENUE_CONFIRMATION after Advertiser confirms'
  );
  assert(!!afterAdvConfirm.advertiserConfirmedAt, 'advertiserConfirmedAt is recorded');
  assert(!afterAdvConfirm.venueConfirmedAt, 'venueConfirmedAt is still null');

  // Attempt to lock Agreement A prematurely (before venue confirms)
  console.log('\n--- TEST SCENARIO 4: Reject Premature Lock ---');
  try {
    AgreementService.lockAgreement(agreementA.id, adminUser, {
      expectedVersion: 1,
      lockVersion: 1,
    });
    assert(false, 'Premature lock before both parties confirm must be rejected');
  } catch (err: any) {
    assert(err instanceof ValidationError, 'Lock before READY_TO_LOCK rejected with ValidationError');
  }

  // Venue Confirms Agreement A
  console.log('\n--- TEST SCENARIO 5: Venue Confirms -> Transition to READY_TO_LOCK ---');
  const { agreement: afterVenConfirm } = AgreementService.confirmAgreement(agreementA.id, venueUserA, {
    expectedVersion: 1,
    acknowledgement: true,
    notes: 'Approved by Grand Atrium General Manager Marcus Vance',
  });
  assert(
    afterVenConfirm.status === 'READY_TO_LOCK',
    'Status transitions to READY_TO_LOCK after both parties have confirmed'
  );
  assert(!!afterVenConfirm.venueConfirmedAt, 'venueConfirmedAt is recorded');
  assert(!!afterVenConfirm.advertiserConfirmedAt, 'advertiserConfirmedAt remains preserved');

  console.log('\n--- TEST SCENARIO 6: Version Invalidation on Terms Update ---');
  // Test Version Invalidation: Create an agreement version update to test confirmation wipe
  const agreementForAmendment = AgreementService.createAgreement(
    { sourceProposalId: proposalC.id },
    advertiserUser
  );
  // Advertiser confirms v1
  AgreementService.confirmAgreement(agreementForAmendment.id, advertiserUser, {
    expectedVersion: 1,
    acknowledgement: true,
  });
  const beforeAmend = db.getAgreementById(agreementForAmendment.id)!;
  assert(beforeAmend.advertiserConfirmedAt !== null, 'Advertiser confirmed v1');

  // Update commercial terms before lock -> creates Version 2
  const amendmentResult = AgreementService.updateCommercialTerms(
    agreementForAmendment.id,
    advertiserUser,
    { notes: 'Updated delivery instructions for Version 2' } as any,
    'Amended notes prior to final lock'
  );
  assert(amendmentResult.agreement.currentVersionNumber === 2, 'Agreement incremented to Version 2');
  assert(amendmentResult.agreement.status === 'DRAFT', 'Status reset to DRAFT upon new version');
  assert(amendmentResult.agreement.advertiserConfirmedAt === null, 'Advertiser confirmation invalidated upon new version');
  assert(amendmentResult.agreement.venueConfirmedAt === null, 'Venue confirmation is null for new version');

  // Confirming with stale expectedVersion should fail
  try {
    AgreementService.confirmAgreement(amendmentResult.agreement.id, advertiserUser, {
      expectedVersion: 1, // Stale! Current is 2
      acknowledgement: true,
    });
    assert(false, 'Confirm with stale expectedVersion must fail');
  } catch (err: any) {
    assert(err instanceof ConflictError, 'Stale expectedVersion rejected with ConflictError (409)');
  }

  console.log('\n--- TEST SCENARIO 7: Concurrency & Lock Version Protection ---');
  // Attempt to lock with mismatched lockVersion
  try {
    AgreementService.lockAgreement(afterVenConfirm.id, adminUser, {
      expectedVersion: 1,
      lockVersion: 999, // Mismatched!
    });
    assert(false, 'Lock with invalid lockVersion must fail');
  } catch (err: any) {
    assert(err instanceof ConflictError, 'Mismatched lockVersion rejected with ConflictError (409)');
  }

  console.log('\n--- TEST SCENARIO 8: Atomic Agreement Lock & Immutable Snapshot Creation ---');
  const { agreement: lockedAgreement, snapshot } = AgreementService.lockAgreement(afterVenConfirm.id, adminUser, {
    expectedVersion: 1,
    lockVersion: 1,
  });

  assert(lockedAgreement.status === 'LOCKED', 'Agreement A status is now LOCKED');
  assert(!!lockedAgreement.lockedAt, 'Agreement A lockedAt timestamp is recorded');
  assert(lockedAgreement.lockedBy === adminUser.id, 'Agreement A lockedBy is recorded');
  assert(lockedAgreement.lockVersion === 2, 'Agreement A lockVersion incremented to 2');
  assert(!!lockedAgreement.lockedSnapshotId, 'Agreement A references lockedSnapshotId');

  // Verify Snapshot exists and contains accurate, decoupled data
  const persistedSnapshot = db.getAgreementSnapshotByAgreementId(lockedAgreement.id);
  assert(!!persistedSnapshot, 'Snapshot was persisted in database');
  assert(snapshot.agreementPublicId === lockedAgreement.publicId, 'Snapshot points to agreement publicId');
  assert(snapshot.campaignTermsSnapshot.quantity === 12000, 'Snapshot captures exact quantity of 12000 units');
  assert(snapshot.venueSnapshot.venueName === 'The Grand Atrium Hotel', 'Snapshot captures venue identity');
  assert(snapshot.advertiserSnapshot.brandName === 'Luxe Spring Botanicals', 'Snapshot captures advertiser identity');
  assert(snapshot.compensationTermsSnapshot.proposedPercentage === 10.0, 'Snapshot captures 10.0% venue compensation');
  assert(snapshot.responsibilitiesSnapshot.venueResponsibilities.length > 0, 'Snapshot captures venue responsibilities');
  assert(snapshot.responsibilitiesSnapshot.advertiserResponsibilities.length > 0, 'Snapshot captures advertiser responsibilities');
  assert(snapshot.deliveryTermsSnapshot.status === 'PENDING_LOGISTICS_ASSIGNMENT', 'Snapshot captures delivery terms');

  // Verify Campaign status updated
  const updatedCampaign = db.getCampaignById(campaign.id)!;
  assert(updatedCampaign.status === 'AGREEMENT_LOCKED', 'Campaign transitioned to AGREEMENT_LOCKED');

  console.log('\n--- TEST SCENARIO 9: Multi-Venue Agreement Independence ---');
  // Agreement B for Venue B should remain in DRAFT while Agreement A is LOCKED
  const freshAgreementB = db.getAgreementById(agreementB.id)!;
  assert(freshAgreementB.status === 'DRAFT', 'Agreement B remains in DRAFT independently');
  assert(!freshAgreementB.lockedAt, 'Agreement B is not locked');

  console.log('\n--- TEST SCENARIO 10: Strict Mutation Rejection on LOCKED Agreement ---');
  // 1. Attempt to update commercial terms
  try {
    AgreementService.updateCommercialTerms(
      lockedAgreement.id,
      advertiserUser,
      { campaignQuantity: 15000 },
      'Illegal attempt to change bottle quantity after lock'
    );
    assert(false, 'updateCommercialTerms on locked agreement must be rejected');
  } catch (err: any) {
    assert(err instanceof AgreementLockedError, 'updateCommercialTerms rejected with AgreementLockedError (409)');
  }

  // 2. Attempt to create new version on locked agreement
  try {
    AgreementService.createNewAgreementVersion(
      lockedAgreement.id,
      advertiserUser,
      { campaignQuantity: 15000 } as any,
      'Illegal attempt to create version on locked agreement'
    );
    assert(false, 'createNewAgreementVersion on locked agreement must be rejected');
  } catch (err: any) {
    assert(err instanceof AgreementLockedError, 'createNewAgreementVersion rejected with AgreementLockedError (409)');
  }

  // 3. Attempt to confirm a locked agreement
  try {
    AgreementService.confirmAgreement(lockedAgreement.id, advertiserUser, {
      expectedVersion: 1,
      acknowledgement: true,
    });
    assert(false, 'confirmAgreement on locked agreement must be rejected');
  } catch (err: any) {
    assert(err instanceof AgreementLockedError, 'confirmAgreement on locked agreement rejected with AgreementLockedError');
  }

  // 4. Attempt to lock an already locked agreement
  try {
    AgreementService.lockAgreement(lockedAgreement.id, adminUser, {
      expectedVersion: 1,
      lockVersion: 2,
    });
    assert(false, 'lockAgreement on already locked agreement must be rejected');
  } catch (err: any) {
    assert(err instanceof AgreementLockedError, 'lockAgreement on locked agreement rejected with AgreementLockedError');
  }

  // 5. Direct db.saveAgreement rejection
  try {
    const mutated = JSON.parse(JSON.stringify(lockedAgreement)) as CampaignAgreement;
    mutated.terms.campaignQuantity = 99999;
    db.saveAgreement(mutated);
    assert(false, 'db.saveAgreement must reject direct modification of locked agreement');
  } catch (err: any) {
    assert(err instanceof AgreementLockedError, 'db.saveAgreement blocked with AgreementLockedError');
  }

  console.log('\n--- TEST SCENARIO 11: Atomic Rollback with db.runTransaction ---');
  const testValBefore = db.getAgreementById(agreementB.id)!.status;
  try {
    db.runTransaction(() => {
      const b = db.getAgreementById(agreementB.id)!;
      b.status = 'READY_TO_LOCK';
      db.saveAgreement(b);
      // Force intentional error inside transaction
      throw new Error('SIMULATED_TRANSACTION_FAILURE');
    });
    assert(false, 'Transaction should have thrown');
  } catch (err: any) {
    assert(err.message === 'SIMULATED_TRANSACTION_FAILURE', 'Caught simulated transaction failure');
  }
  const testValAfter = db.getAgreementById(agreementB.id)!.status;
  assert(testValAfter === testValBefore, 'Database state successfully rolled back after failed transaction');

  console.log('\n====================================================');
  console.log('ALL AQUABLOOM STEP 7 PART 3 TESTS PASSED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runAgreementLockingTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
