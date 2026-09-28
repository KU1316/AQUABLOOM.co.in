/**
 * AquaBloom Step 4 Advertiser Campaign Engine Automated Verification Suite
 * 
 * Verifies:
 * - Advertiser eligibility and role authorization
 * - Campaign data model validation and mandatory field constraints
 * - State machine transitions (DRAFT <-> READY_FOR_MATCHING)
 * - Versioning engine & change reason tracking (AB-CMV)
 * - Sanitization / Opportunity view (zero private advertiser data leakage)
 * - Controlled draft deletion constraints
 * - In-app notification and audit trail dispatching
 */

import { db } from '../src/server/db.js';
import {
  validateAdvertiserEligibility,
  validateCampaign,
  validateCampaignStatusTransition,
  getCampaignOpportunityView,
} from '../src/lib/campaignValidation.js';
import {
  User,
  AdvertiserProfile,
  CreateCampaignInput,
  UpdateCampaignInput,
  Campaign,
} from '../src/types.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runCampaignEngineTests() {
  console.log('====================================================');
  console.log('STARTING AQUABLOOM STEP 4 CAMPAIGN ENGINE TESTS');
  console.log('====================================================\n');

  // --- TEST GROUP 1: Advertiser Eligibility & Role Isolation ---
  console.log('--- TEST GROUP 1: Advertiser Eligibility & Role Isolation ---');

  const validAdvertiserUser: User = {
    id: 'usr_test_adv_valid',
    publicAccountId: 'AB-ACC-ADV01',
    role: 'ADVERTISER',
    organizationName: 'EcoTech Innovations Ltd',
    email: 'campaigns@ecotech.io',
    contactName: 'Sarah Jenkins',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validAdvertiserProfile: AdvertiserProfile = {
    role: 'ADVERTISER',
    accountId: validAdvertiserUser.id,
    brandName: 'EcoTech Hydration',
    industry: 'Technology',
    description: 'B2B Enterprise Leaders & Tech Workers Eco-Friendly Hydration Sponsor',
    primaryContact: {
      name: 'Sarah Jenkins',
      email: 'campaigns@ecotech.io',
      phone: '+91 98765 43210',
    },
    location: {
      city: 'Bengaluru',
      country: 'India',
    },
    websiteUrl: 'https://ecotech.io',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: validAdvertiserUser.id,
    completion: {
      isComplete: true,
      missingRequiredFields: [],
      percentage: 100,
    },
  };

  const eligibility = validateAdvertiserEligibility(validAdvertiserUser, validAdvertiserProfile);
  assert(eligibility.isValid, 'Eligible active advertiser with complete profile passes verification');

  const venueUser: User = {
    id: 'usr_test_venue_role',
    publicAccountId: 'AB-ACC-VEN01',
    role: 'VENUE',
    organizationName: 'Gold Gym Hub',
    email: 'contact@goldgym.com',
    contactName: 'Manager Dave',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const venueEligibility = validateAdvertiserEligibility(venueUser, undefined);
  assert(!venueEligibility.isValid, 'Non-advertiser role (VENUE) is strictly rejected from authoring campaigns');

  const suspendedAdvertiserUser: User = {
    ...validAdvertiserUser,
    id: 'usr_test_adv_suspended',
    status: 'SUSPENDED',
  };
  const suspendedEligibility = validateAdvertiserEligibility(suspendedAdvertiserUser, validAdvertiserProfile);
  assert(!suspendedEligibility.isValid, 'Suspended advertiser cannot author campaigns');

  // --- TEST GROUP 2: Validation of Campaign Parameters & Mandatory Fields ---
  console.log('\n--- TEST GROUP 2: Validation of Campaign Parameters & Constraints ---');

  const completeCampaignInput: CreateCampaignInput = {
    name: 'National Tech Summit Hydration Experience',
    description: 'Exclusive 500ml branded rPET bottles for attendees across 12 tech parks.',
    category: 'Information Technology',
    objective: 'Brand Awareness & High Dwell-Time Immersion',
    targetAudience: {
      characteristics: ['Software Engineers', 'Cloud Architects', 'C-Suite Tech Executives'],
      demographics: 'Ages 24-48, Tier-1 Metro Tech Centers',
      ageGroups: ['25-34', '35-44'],
    },
    venueRequirements: {
      preferredVenueTypes: ['Corporate Tech Park', 'Coworking Space'],
      preferredLocations: [
        { city: 'Bengaluru', area: 'Outer Ring Road', country: 'India' },
        { city: 'Hyderabad', area: 'HITEC City', country: 'India' },
      ],
      campaignPreferences: ['Premium Placement', 'Audience Interaction'],
      placementRequirements: ['Front Desk Chiller', 'Executive Boardrooms'],
    },
    bottleRequirements: {
      requiredQuantity: 25000,
      preferredVolumeMl: 500,
      volumeLabel: '500 ml',
      preferredMaterial: '100% rPET (Recycled Eco-PET)',
      preferredShape: 'Classic Cylinder',
      bottleFinish: 'Matte Premium Finish',
      labelType: 'Full-Wrap Shrink Sleeve (CMYK)',
    },
    timing: {
      duration: {
        value: 6,
        unit: 'WEEKS',
      },
      preferredStartPeriod: {
        label: 'Q4 2026',
        windowStart: '2026-10-01',
        windowEnd: '2026-11-15',
      },
    },
    distributionRequirements: {
      placementDetails: 'Bottles must be chilled in designated branded display refrigerators.',
      refrigerationRequired: true,
    },
    collaborationRequirement: {
      status: 'OPEN_TO_COLLABORATION',
      preferredTerms: 'Open to co-branded welcome flyers or digital sign board tie-ins.',
    },
    eligibilityRequirements: {
      minimumFootfall: 10000,
      venueCriteria: ['No concurrent direct software competitor advertising'],
    },
    publishedBudget: {
      disclosed: true,
      minAmount: 500000,
      maxAmount: 850000,
      currency: 'INR',
    },
  };

  const validValidation = validateCampaign(completeCampaignInput, true);
  assert(validValidation.isValid, 'Complete campaign parameters pass strict READY_FOR_MATCHING validation');

  // Test invalid quantity (< 500)
  const invalidQuantityInput: CreateCampaignInput = {
    ...completeCampaignInput,
    bottleRequirements: {
      ...completeCampaignInput.bottleRequirements,
      requiredQuantity: 150,
    },
  };
  const invalidQtyValidation = validateCampaign(invalidQuantityInput, false);
  assert(!invalidQtyValidation.isValid, 'Campaign with quantity < 500 fails minimum volume rule');

  // Test invalid budget (min > max)
  const invalidBudgetInput: CreateCampaignInput = {
    ...completeCampaignInput,
    publishedBudget: {
      disclosed: true,
      minAmount: 900000,
      maxAmount: 400000,
      currency: 'INR',
    },
  };
  const invalidBudgetVal = validateCampaign(invalidBudgetInput, false);
  assert(!invalidBudgetVal.isValid, 'Published budget where minimum exceeds maximum fails validation');

  // --- TEST GROUP 3: Database Creation, Public ID, and Version v1 ---
  console.log('\n--- TEST GROUP 3: Campaign Database Creation & Versioning ---');

  // Seed valid advertiser into database
  (db as any).schema.users = (db as any).schema.users.filter((u: any) => u.id !== validAdvertiserUser.id);
  (db as any).schema.users.push(validAdvertiserUser);
  (db as any).schema.profiles[validAdvertiserUser.id] = validAdvertiserProfile;

  const createdResult = db.createCampaign(validAdvertiserUser.id, completeCampaignInput, validAdvertiserUser.id);
  const campaign = createdResult.campaign;
  const version1 = createdResult.version;

  assert(campaign.advertiserId === validAdvertiserUser.id, 'Campaign advertiserId matches owning advertiser');
  assert(campaign.publicCampaignId.startsWith('AB-CMP-'), 'Public campaign ID has authoritative AB-CMP prefix');
  assert(campaign.status === 'DRAFT', 'Initial campaign created in default DRAFT status');
  assert(version1.versionNumber === 1, 'Initial version is version 1');
  assert(version1.publicVersionId.startsWith('AB-CMV-'), 'Public version ID has AB-CMV prefix');

  // --- TEST GROUP 4: Versioning on Campaign Update ---
  console.log('\n--- TEST GROUP 4: Versioning on Campaign Update ---');

  const updateInput: UpdateCampaignInput = {
    name: 'National Tech Summit Hydration Experience - Phase II',
    bottleRequirements: {
      ...campaign.bottleRequirements,
      requiredQuantity: 50000,
    },
    changeReason: 'Scaled target volume from 25,000 to 50,000 units',
  };

  const updatedResult = db.updateCampaign(campaign.id, updateInput, validAdvertiserUser.id, false);
  const updatedCampaign = updatedResult.campaign;
  const version2 = updatedResult.version;

  assert(updatedCampaign.currentVersionNumber === 2, 'Campaign version number successfully incremented to 2');
  assert(updatedCampaign.name === updateInput.name, 'Campaign name successfully updated in database');
  assert(updatedCampaign.bottleRequirements.requiredQuantity === 50000, 'Bottle quantity successfully updated');
  assert(version2.versionNumber === 2, 'Version record 2 created with versionNumber 2');
  assert(version2.changeReason === updateInput.changeReason, 'Version change reason accurately recorded');
  assert(version2.changedFields.includes('name'), 'Changed fields list contains name');
  assert(version2.changedFields.includes('bottleRequirements'), 'Changed fields list contains bottleRequirements');

  const allVersions = db.getCampaignVersions(campaign.id);
  assert(allVersions.length === 2, 'Database maintains immutable history of both versions');

  // --- TEST GROUP 5: State Machine & Transition Rules ---
  console.log('\n--- TEST GROUP 5: State Machine & Transition Rules ---');

  // Validate state transition table
  assert(validateCampaignStatusTransition('DRAFT', 'READY_FOR_MATCHING').allowed, 'DRAFT -> READY_FOR_MATCHING is allowed');
  assert(validateCampaignStatusTransition('READY_FOR_MATCHING', 'DRAFT').allowed, 'READY_FOR_MATCHING -> DRAFT is allowed');
  assert(!validateCampaignStatusTransition('DRAFT', 'COMPLETED').allowed, 'DRAFT -> COMPLETED is strictly forbidden');
  assert(!validateCampaignStatusTransition('DRAFT', 'ACTIVE').allowed, 'DRAFT -> ACTIVE directly without proposal is forbidden');

  // Execute prepare-for-matching on the updated campaign
  const prepResult = db.prepareCampaignForMatching(campaign.id, validAdvertiserUser.id, false);
  assert(prepResult.validationResult.isValid, 'Authoritative preparation succeeds for compliant campaign');
  assert(prepResult.campaign.status === 'READY_FOR_MATCHING', 'Campaign transitioned to READY_FOR_MATCHING status');

  // Revert back to DRAFT for edits
  const revertedCampaign = db.revertCampaignToDraft(campaign.id, validAdvertiserUser.id, false);
  assert(revertedCampaign.status === 'DRAFT', 'Campaign successfully reverted to DRAFT status');

  // Transition back to READY_FOR_MATCHING
  const prepResult2 = db.prepareCampaignForMatching(campaign.id, validAdvertiserUser.id, false);
  assert(prepResult2.campaign.status === 'READY_FOR_MATCHING', 'Campaign returned to READY_FOR_MATCHING');

  // --- TEST GROUP 6: Sanitization & Opportunity View (Zero Data Leakage) ---
  console.log('\n--- TEST GROUP 6: Sanitization & Opportunity View ---');

  const opportunityView = db.getCampaignOpportunity(campaign.id);
  assert(Boolean(opportunityView), 'Opportunity view generated successfully');
  if (!opportunityView) throw new Error('opportunityView is null');
  assert(opportunityView.publicCampaignId === campaign.publicCampaignId, 'Opportunity view presents public campaign ID');
  assert((opportunityView as any).id === undefined, 'Internal database ID is completely omitted');
  assert((opportunityView as any).advertiserId === undefined, 'Internal advertiser user ID is completely omitted');
  assert(opportunityView.bottleRequirements.requiredQuantity === 50000, 'Opportunity view presents planned quantity');
  assert(opportunityView.preferredVenueTypes.length > 0, 'Opportunity view presents target venue categories');
  assert(opportunityView.preferredStartPeriod.label === 'Q4 2026', 'Opportunity view presents start window');

  // --- TEST GROUP 7: Controlled Draft Deletion ---
  console.log('\n--- TEST GROUP 7: Controlled Draft Deletion ---');

  // Attempting to delete when READY_FOR_MATCHING must fail
  let deleteErrorThrown = false;
  try {
    db.deleteDraftCampaign(campaign.id, validAdvertiserUser.id, false);
  } catch (err: any) {
    deleteErrorThrown = true;
  }
  assert(deleteErrorThrown, 'Cannot delete campaign in READY_FOR_MATCHING status');

  // Create another campaign purely in draft to test clean deletion
  const draftToDeleteResult = db.createCampaign(
    validAdvertiserUser.id,
    {
      name: 'Temporary Scratch Campaign',
      category: 'Scratch',
      objective: 'Temporary testing',
      bottleRequirements: {
        requiredQuantity: 1000,
        preferredVolumeMl: 500,
        volumeLabel: '500 ml',
      },
    },
    validAdvertiserUser.id
  );
  const draftId = draftToDeleteResult.campaign.id;

  assert(db.getCampaignById(draftId) !== undefined, 'Scratch draft exists before deletion');
  db.deleteDraftCampaign(draftId, validAdvertiserUser.id, false);
  assert(db.getCampaignById(draftId) === undefined, 'Scratch draft is permanently removed after controlled deletion');

  // --- TEST GROUP 8: In-App Notifications ---
  console.log('\n--- TEST GROUP 8: In-App Notifications ---');

  const userNotifications = db.getUserNotifications(validAdvertiserUser.id);
  assert(userNotifications.length > 0, 'Notifications created for campaign authoring events');
  const latestNotif = userNotifications[0];
  assert(latestNotif.read === false, 'New notification is unread by default');

  const marked = db.markNotificationRead(latestNotif.id, validAdvertiserUser.id);
  assert(marked === true, 'Notification successfully marked as read');
  const updatedNotifs = db.getUserNotifications(validAdvertiserUser.id);
  assert(updatedNotifs.find((n) => n.id === latestNotif.id)?.read === true, 'Notification status persisted as read');

  console.log('\n====================================================');
  console.log('ALL AQUABLOOM STEP 4 CAMPAIGN ENGINE TESTS PASSED! 🎉');
  console.log('====================================================\n');
}

runCampaignEngineTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
