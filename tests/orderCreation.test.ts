/**
 * AquaBloom Step 11B: Order Creation Test Suite
 * 
 * Verifies:
 * 1. Valid Order creation with state progression (Initial PRICED -> PAYMENT_REQUIRED).
 * 2. Missing Agreement rejection.
 * 3. Unlocked Agreement rejection.
 * 4. Missing Supplier Assignment rejection.
 * 5. Missing Logistics Assignment rejection.
 * 6. Invalid / Blocked pricing rejection.
 * 7. Duplicate creation / idempotency key enforcement.
 * 8. Concurrent creation handling.
 * 9. Unauthorized creation and counterparty isolation (Supplier, Logistics, Venue, External Advertiser).
 * 10. Verification of all 9 required authoritative references and operational snapshots.
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
  LogisticsOperationalOfferService,
} from '../src/server/logisticsAssignmentServices.js';
import {
  FinalPricingEngine,
} from '../src/server/finalPricingServices.js';
import {
  OrderService,
  OrderAuthorizationService,
  OrderValidationEngine,
} from '../src/server/orderServices.js';
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
  LogisticsProfile,
  SupplierAssignment,
  LogisticsAssignment,
  OrderReadiness,
  VenueProfile,
  AdvertiserProfile,
  FinalPricingCalculationResult,
  Order,
} from '../src/types.js';

const nowIso = new Date().toISOString();
const runId = Math.random().toString(36).substring(2, 8);

// Actors
const adminUser: User = {
  id: `usr_admin_ord_${runId}`,
  publicAccountId: `AB-ACC-ADMIN-ORD-${runId}`,
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Order Admin',
  email: `admin_ord_${runId}@aquabloom.internal`,
  organizationName: 'AquaBloom Order Ops',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: `usr_adv_ord_${runId}`,
  publicAccountId: `AB-ACC-ADV-ORD-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Sarah Jenkins',
  email: `sarah_ord_${runId}@aurabeverages.example`,
  organizationName: 'Aura Beverages India',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: `usr_ven_ord_${runId}`,
  publicAccountId: `AB-ACC-VEN-ORD-${runId}`,
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Marcus Vance',
  email: `marcus_ord_${runId}@mumbaiconvention.example`,
  organizationName: 'Mumbai Convention Centre',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUser: User = {
  id: `usr_sup_ord_${runId}`,
  publicAccountId: `AB-ACC-SUP-ORD-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Rajesh Sharma',
  email: `rajesh_ord_${runId}@puneecobottlers.example`,
  organizationName: 'Pune Eco Bottlers Pvt Ltd',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const logisticsPartner: User = {
  id: `usr_log_ord_${runId}`,
  publicAccountId: `AB-ACC-LOG-ORD-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Vikram Patel',
  email: `vikram_ord_${runId}@swiftfreight.example`,
  organizationName: 'Swift India Freight Express',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const externalUser: User = {
  id: `usr_ext_ord_${runId}`,
  publicAccountId: `AB-ACC-EXT-ORD-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'External Spy',
  email: `spy_ord_${runId}@competitor.example`,
  organizationName: 'Competitor Corp',
  createdAt: nowIso,
  updatedAt: nowIso,
};

/**
 * Pipeline Setup Helper
 */
function setupTestPipeline(customRunId: string) {
  // Save actors
  db.saveUser(adminUser);
  db.saveUser(advertiserUser);
  db.saveUser(venueUser);
  db.saveUser(supplierUser);
  db.saveUser(logisticsPartner);
  db.saveUser(externalUser);

  // Profiles
  const advProfile: AdvertiserProfile = {
    userId: advertiserUser.id,
    role: 'ADVERTISER',
    brandName: 'Aura Beverages',
    companyName: 'Aura Beverages India Pvt Ltd',
    industry: 'FMCG Beverages',
    billingAddress: {
      street: '100 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400020',
      country: 'India',
    },
    contactPerson: { name: 'Sarah Jenkins', role: 'Head of Brand Marketing' },
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, missingFields: [], isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(advertiserUser.id, advProfile);

  const venProfile: VenueProfile = {
    userId: venueUser.id,
    role: 'VENUE',
    venueName: 'Mumbai Convention Centre',
    companyName: 'Mumbai Convention Centre Ltd',
    venueType: 'Exhibition & Convention Center',
    location: {
      address: 'Bandra Kurla Complex, Bandra East',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateRegion: 'Maharashtra',
      country: 'India',
      postalCode: '400051',
    },
    weeklyFootfall: 25000,
    typicalVisitorStayMinutes: 180,
    audienceProfile: {
      primaryDemographic: 'Corporate Executives',
      incomeTier: 'Upper Middle',
      ageGroups: ['25-34', '35-44'],
      interests: ['Technology', 'Business', 'Sustainability'],
    },
    operationalSpecifications: {
      distributionPoints: 6,
      storageCapacityBottles: 20000,
      refrigeratedStorageAvailable: false,
      dailyServingCapacity: 5000,
      recyclingBinLocations: 12,
    },
    commercialPreferences: {
      minimumCampaignBottles: 5000,
      maximumCampaignBottles: 50000,
      leadTimeWeeks: 2,
    },
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, missingFields: [], isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(venueUser.id, venProfile);

  const supProfile: any = {
    userId: supplierUser.id,
    role: 'SUPPLIER',
    businessName: 'Pune Eco Bottlers Pvt Ltd',
    facility: {
      facilityName: 'Pune Eco Plant',
      city: 'Pune',
      stateRegion: 'Maharashtra',
      country: 'India',
      address: 'MIDC Chakan Industrial Area',
      postalCode: '410501',
      dispatchScheduleDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    facilityLocations: [
      {
        city: 'Pune',
        state: 'Maharashtra',
        stateRegion: 'Maharashtra',
        country: 'India',
        address: 'Plot 42, Hinjewadi Phase 2, Pune',
        primary: true,
      },
    ],
    productionCapacityBottlesPerWeek: 100000,
    certifications: ['FSSAI Food Grade ISO 22000', 'BPA-Free Certified', 'BIS Clean Water Standard'],
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, missingFields: [], isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(supplierUser.id, supProfile);

  const logProfile: LogisticsProfile = {
    userId: logisticsPartner.id,
    role: 'LOGISTICS_PARTNER',
    accountId: logisticsPartner.id,
    businessName: 'Swift India Freight Express',
    serviceAreas: ['Pune', 'Mumbai', 'Bengaluru', 'Maharashtra'],
    vehicleFleet: [
      { vehicleType: 'Reefer Truck (24ft)', capacityPallets: 14, temperatureControlled: true },
      { vehicleType: 'Heavy Closed Van (32ft)', capacityPallets: 24, temperatureControlled: false },
    ],
    weeklyPalletCapacity: 120,
    availablePalletCapacity: 90,
    insuranceCoverageAmountINR: 5000000,
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, missingFields: [], isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(logisticsPartner.id, logProfile);

  // Admin approval updates
  db.updateApprovalStatus(supplierUser.id, 'APPROVED', adminUser.id, 'Verified bottling facility');
  db.updateApprovalStatus(logisticsPartner.id, 'APPROVED', adminUser.id, 'Verified freight fleet');

  // Supplier Product
  const { product, version } = db.createProduct(
    supplierUser.id,
    {
      name: 'AquaBloom 500ml Pristine Spring Water',
      description: 'Zero-plastic aluminum beverage bottle',
      category: 'Premium Spring Water',
      status: 'ACTIVE',
      availability: 'AVAILABLE',
      specifications: {
        bottleMaterial: 'Aluminum',
        bottleCapacityMl: 500,
        volumeLabel: '500 ml',
        bottleShape: 'Sleek Cylinder',
        bottleType: 'Standard Bottle',
        capType: 'Screw Cap (Tamper-Evident)',
        bottleFinish: 'Matte White Powder Coat',
        labelType: 'Direct Screen Print (No Plastic Film)',
        printingCapability: 'Full CMYK 6-Color',
        finishingOptions: ['Matte Soft-Touch', 'Spot Gloss Highlight'],
        packagingConfiguration: '24 bottles per carton, 40 cartons per euro pallet',
      },
      leadTime: { value: 14, unit: 'DAYS' },
      minimumOrderQuantity: 5000,
      customerFacingPrice: { amount: 24.5, currency: 'INR' },
      supplierInternalCost: { amount: 16.0, currency: 'INR' },
    }
  );

  // Campaign
  const campaign: Campaign = {
    id: `cmp_ord_${customRunId}`,
    publicCampaignId: `AB-CMP-ORD-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Aura Maharashtra Launch 2026',
    description: 'Corporate launch campaign across Mumbai conference venues',
    category: 'Beverage & Hospitality',
    objective: 'Brand Awareness',
    targetAudience: {
      demographics: 'Business Executives & Tech Professionals',
      targetVenueTypes: ['Exhibition & Convention Center'],
      characteristics: ['Urban', 'Sustainability conscious'],
    },
    venueRequirements: {
      targetVenueTypes: ['Exhibition & Convention Center'],
      footfallExpectation: { minimumWeeklyFootfall: 20000 },
      location: { city: 'Mumbai', country: 'India' },
    },
    bottleRequirements: {
      quantity: 10000,
      preferredVolumeMl: 500,
      preferredMaterial: 'Aluminum',
    },
    timing: {
      duration: { value: 4, unit: 'WEEKS' },
      preferredStartPeriod: { type: 'MONTH', label: 'October 2026' },
    },
    distributionRequirements: {
      estimatedDistributionPace: '2500 bottles/week',
      refrigerationRequired: false,
    },
    collaborationRequirement: {
      status: 'OPEN_TO_COLLABORATION',
    },
    budget: {
      disclosed: true,
      minAmount: 200000,
      maxAmount: 400000,
      currency: 'INR',
    },
    status: 'ACTIVE',
    versionNumber: 1,
    activeVersionId: `cmv_ord_${customRunId}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveCampaign(campaign);

  // Proposal
  const proposal: Proposal = {
    id: `prp_ord_${customRunId}`,
    publicProposalId: `AB-PRP-ORD-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_ord_${customRunId}`,
    terms: {
      campaignQuantity: 10000,
      campaignDuration: { value: 4, unit: 'WEEKS' },
      preferredStartPeriod: { type: 'MONTH', label: 'October 2026' },
      productRequirements: {
        volumeMl: 500,
        bottleMaterial: 'Aluminum',
        labelType: 'Direct Screen Print',
      },
      distributionRequirements: {
        placementDetails: 'Main convention lobby racks',
        estimatedDistributionPace: '2500/week',
        refrigerationRequired: false,
      },
      placementRequirements: ['Registration Area', 'VIP Lounge'],
      collaborationRequirement: { status: 'NOT_REQUIRED' },
      venueCompensationTerms: {
        proposedPercentage: 10,
        termsDescription: '10% base distribution allowance',
        notes: 'Paid upon distribution audit',
        eligibleBaseDescription: 'Supplier Production Cost',
        maximumCapPercentage: 12.5,
      },
      advertiserResponsibilities: ['Provide CMYK vector artwork'],
      venueResponsibilities: ['Staging and placement'],
      aquaBloomResponsibilities: ['Quality assurance and delivery coordination'],
      deliveryTermsKnown: {
        deliveryAddress: 'Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051',
        stagingInstructions: 'Unload at Gate 3 bay',
        specialHandling: 'Keep upright',
        refrigerationRequired: false,
        status: 'PENDING_LOGISTICS_ASSIGNMENT',
      },
      qrRequirements: {
        targetUrl: 'https://aurabeverages.example/clean-water-initiative',
        customDomainAllowed: false,
      },
      cancellationTerms: {
        cancellationCutoffStage: 'PRODUCTION_START',
        refundEligibilityDescription: 'Full refund prior to production lock',
      },
      renewalTerms: {
        renewalOptionAvailable: true,
        termsSummary: 'Option to extend for Q1 2027',
      },
      customConditions: 'Standard enterprise compliance',
      importantConditions: ['Food-grade delivery verification'],
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveProposal(proposal);

  // Agreement
  const commercialTerms: AgreementCommercialTerms = {
    campaignQuantity: 10000,
    campaignDuration: { value: 4, unit: 'WEEKS' },
    preferredStartPeriod: { type: 'MONTH', label: 'October 2026' },
    productRequirements: proposal.terms.productRequirements,
    distributionRequirements: proposal.terms.distributionRequirements,
    placementRequirements: proposal.terms.placementRequirements,
    collaborationRequirement: proposal.terms.collaborationRequirement,
    venueCompensationTerms: proposal.terms.venueCompensationTerms,
    advertiserResponsibilities: proposal.terms.advertiserResponsibilities,
    venueResponsibilities: proposal.terms.venueResponsibilities,
    aquaBloomResponsibilities: proposal.terms.aquaBloomResponsibilities,
    deliveryTermsKnown: proposal.terms.deliveryTermsKnown,
    qrRequirements: proposal.terms.qrRequirements,
    cancellationTerms: proposal.terms.cancellationTerms,
    renewalTerms: proposal.terms.renewalTerms,
    customConditions: proposal.terms.customConditions,
    importantConditions: proposal.terms.importantConditions,
  };

  const agreementId = `cag_ord_${customRunId}`;
  const agreementPublicId = `AB-CAG-ORD-${customRunId}`;
  const agreement: CampaignAgreement = {
    id: agreementId,
    publicId: agreementPublicId,
    campaignId: campaign.id,
    campaignPublicId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: campaign.category,
    advertiserId: advertiserUser.id,
    advertiserPublicId: advertiserUser.publicAccountId,
    advertiserBrandName: advertiserUser.organizationName,
    venueId: venueUser.id,
    venuePublicId: venueUser.publicAccountId,
    venueName: venueUser.organizationName,
    sourceProposalId: proposal.id,
    sourceProposalPublicId: proposal.publicProposalId,
    sourceProposalVersionId: proposal.activeVersionId,
    sourceProposalVersionNumber: 1,
    status: 'LOCKED',
    currentVersionId: `cgv_ord_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-ORD-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-ORD-${customRunId}`,
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

  // Snapshot
  AgreementSnapshotService.createSnapshot(agreement, adminUser);

  // Assess Order Readiness
  const { orderReadiness: validatedReadiness } = OrderReadinessService.assessOrderReadiness(agreement.id, adminUser);

  // Step 9: Supplier Assignment
  const supplierOffer = SupplierOperationalOfferService.createOffer(
    {
      orderReadinessId: validatedReadiness.id,
      supplierId: supplierUser.id,
      productId: product.id,
      expiresInHours: 72,
    },
    adminUser
  );
  const supplierAssignmentResult = SupplierOperationalOfferService.acceptOffer(
    supplierOffer.id,
    {},
    supplierUser
  );
  const supplierAssignment = supplierAssignmentResult.assignment;

  // Step 10: Logistics Assignment
  const logisticsOffer = LogisticsOperationalOfferService.createOffer(
    {
      orderReadinessId: validatedReadiness.id,
      logisticsPartnerId: logisticsPartner.id,
      expiresInHours: 48,
    },
    adminUser
  );
  const logisticsAssignmentResult = LogisticsOperationalOfferService.acceptOffer(
    logisticsOffer.id,
    {},
    logisticsPartner
  );
  const logisticsAssignment = logisticsAssignmentResult.assignment;

  // Step 11A: Final Pricing Calculation
  const pricingResult = FinalPricingEngine.calculateFinalPricing(validatedReadiness.id, adminUser);

  return {
    lockedAgreement: agreement,
    readiness: validatedReadiness,
    product,
    productVersion: version,
    supplierAssignment,
    logisticsAssignment,
    pricingResult,
  };
}

async function runOrderCreationTests() {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 11B: ORDER CREATION TESTS');
  console.log('=============================================================');

  const fixture = setupTestPipeline(runId);
  const { lockedAgreement, readiness, supplierAssignment, logisticsAssignment, pricingResult } = fixture;

  console.log(`✅ Pipeline setup complete. Agreement: ${lockedAgreement.publicId}, Readiness: ${readiness.publicId}, Pricing: ${pricingResult.publicId}`);

  // -------------------------------------------------------------
  // TEST 1: Valid Order Creation & Lifecycle Progression
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Valid Order Creation & Lifecycle Progression ---');
  {
    const order = OrderService.createOrderSync(
      { orderReadinessId: readiness.id, idempotencyKey: `idemp_${runId}_1` },
      advertiserUser
    );

    assert.ok(order, 'Order should be created successfully');
    assert.ok(order.id.startsWith('ord_'), 'Internal ID must start with ord_');
    assert.ok(order.publicId.startsWith('AB-ORD-'), 'Public ID must start with AB-ORD-');
    assert.ok(order.orderReference.startsWith('ORD-REF-'), 'Order reference must start with ORD-REF-');
    
    // Status should have progressed to PAYMENT_REQUIRED with PRICED in history
    assert.strictEqual(order.status, 'PAYMENT_REQUIRED', 'Order status should be PAYMENT_REQUIRED');
    assert.strictEqual(order.statusHistory.length, 2, 'Status history should contain PRICED and PAYMENT_REQUIRED');
    assert.strictEqual(order.statusHistory[0].fromStatus, null);
    assert.strictEqual(order.statusHistory[0].toStatus, 'PRICED');
    assert.strictEqual(order.statusHistory[1].fromStatus, 'PRICED');
    assert.strictEqual(order.statusHistory[1].toStatus, 'PAYMENT_REQUIRED');

    // Downstream boundaries
    assert.strictEqual(order.boundaries.orderCreated, true);
    assert.strictEqual(order.boundaries.paymentInitiated, false);
    assert.strictEqual(order.boundaries.productionStarted, false);
    assert.strictEqual(order.boundaries.fulfillmentScheduled, false);

    // Database lookup
    const fetchedById = db.getOrderById(order.id);
    const fetchedByPublicId = db.getOrderById(order.publicId);
    const fetchedByReadiness = db.getOrderByOrderReadiness(readiness.id);
    assert.ok(fetchedById, 'Order should be retrieved by internal ID');
    assert.ok(fetchedByPublicId, 'Order should be retrieved by public ID');
    assert.ok(fetchedByReadiness, 'Order should be retrieved by readiness ID');

    // Updated pricing boundary
    const updatedPricing = db.getFinalPricingResultById(pricingResult.id);
    assert.strictEqual(updatedPricing?.futureBoundaries.orderCreated, true, 'Pricing result orderCreated boundary should be true');

    console.log(`✅ Test 1 passed: Valid order created (${order.publicId}), initial PRICED transitioned to PAYMENT_REQUIRED.`);
  }

  // -------------------------------------------------------------
  // TEST 2: Missing Agreement Precondition
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Missing Agreement Precondition ---');
  {
    const missingAgreementReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_missing_agr_${runId}`,
      publicId: `AB-ORDR-MISS-AGR-${runId}`,
      campaignAgreementId: `cag_non_existent_${runId}`,
    };
    db.saveOrderReadiness(missingAgreementReadiness);

    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: missingAgreementReadiness.id }, advertiserUser),
      (err: any) => err instanceof NotFoundError && err.message.includes('not found')
    );

    console.log('✅ Test 2 passed: Missing Campaign Agreement strictly rejected.');
  }

  // -------------------------------------------------------------
  // TEST 3: Unlocked Agreement Precondition
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Unlocked Agreement Precondition ---');
  {
    const unlockedAgreement: CampaignAgreement = {
      ...lockedAgreement,
      id: `cag_unlocked_${runId}`,
      publicId: `AB-CAG-UNLOCKED-${runId}`,
      status: 'PENDING_SIGNATURES',
    };
    db.saveAgreement(unlockedAgreement);

    const unreadyReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_unlocked_agr_${runId}`,
      publicId: `AB-ORDR-UNL-AGR-${runId}`,
      campaignAgreementId: unlockedAgreement.id,
    };
    db.saveOrderReadiness(unreadyReadiness);

    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: unreadyReadiness.id }, advertiserUser),
      (err: any) => err instanceof ValidationError && err.message.includes('must be LOCKED')
    );

    console.log('✅ Test 3 passed: Unlocked Campaign Agreement strictly rejected.');
  }

  // -------------------------------------------------------------
  // TEST 4: Missing Supplier Assignment Precondition
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Missing Supplier Assignment Precondition ---');
  {
    const noSupReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_no_sup_${runId}`,
      publicId: `AB-ORDR-NO-SUP-${runId}`,
      campaignAgreementId: lockedAgreement.id,
    };
    db.saveOrderReadiness(noSupReadiness);

    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: noSupReadiness.id }, advertiserUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Supplier Assignment')
    );

    console.log('✅ Test 4 passed: Missing Supplier Assignment strictly rejected.');
  }

  // -------------------------------------------------------------
  // TEST 5: Missing Logistics Assignment Precondition
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Missing Logistics Assignment Precondition ---');
  {
    const noLogReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_no_log_${runId}`,
      publicId: `AB-ORDR-NO-LOG-${runId}`,
      campaignAgreementId: lockedAgreement.id,
    };
    db.saveOrderReadiness(noLogReadiness);

    // Save supplier assignment for this readiness
    const supAssign: SupplierAssignment = {
      ...supplierAssignment,
      id: `sas_no_log_${runId}`,
      publicId: `AB-SAS-NO-LOG-${runId}`,
      orderReadinessId: noLogReadiness.id,
      status: 'ASSIGNED',
    };
    db.saveSupplierAssignment(supAssign);

    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: noLogReadiness.id }, advertiserUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Logistics Assignment')
    );

    console.log('✅ Test 5 passed: Missing Logistics Assignment strictly rejected.');
  }

  // -------------------------------------------------------------
  // TEST 6: Invalid / Blocked Pricing Precondition
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Invalid / Blocked Pricing Precondition ---');
  {
    const invalidPricingReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_inv_price_${runId}`,
      publicId: `AB-ORDR-INV-PRICE-${runId}`,
      campaignAgreementId: lockedAgreement.id,
    };
    db.saveOrderReadiness(invalidPricingReadiness);

    const supAssign: SupplierAssignment = {
      ...supplierAssignment,
      id: `sas_inv_price_${runId}`,
      publicId: `AB-SAS-INV-PR-${runId}`,
      orderReadinessId: invalidPricingReadiness.id,
      status: 'ASSIGNED',
    };
    db.saveSupplierAssignment(supAssign);

    const logAssign: LogisticsAssignment = {
      ...logisticsAssignment,
      id: `las_inv_price_${runId}`,
      publicId: `AB-LAS-INV-PR-${runId}`,
      orderReadinessId: invalidPricingReadiness.id,
      status: 'ASSIGNED',
    };
    db.saveLogisticsAssignment(logAssign);

    // Test case 6a: Pricing not calculated at all
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: invalidPricingReadiness.id }, advertiserUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Pricing must be calculated first')
    );

    // Test case 6b: Pricing is PRICING_BLOCKED
    const blockedPricing: FinalPricingCalculationResult = {
      ...pricingResult,
      id: `fpr_blocked_${runId}`,
      publicId: `AB-FPR-BLOCKED-${runId}`,
      orderReadinessId: invalidPricingReadiness.id,
      status: 'PRICING_BLOCKED',
      blockingReason: 'Destination tax state unknown',
    };
    db.saveFinalPricingResult(blockedPricing);

    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: invalidPricingReadiness.id }, advertiserUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Pricing calculation must be valid (CALCULATED)')
    );

    console.log('✅ Test 6 passed: Uncalculated or PRICING_BLOCKED pricing strictly rejected.');
  }

  // -------------------------------------------------------------
  // TEST 7: Idempotency & Duplicate Creation Prevention
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Idempotency & Duplicate Creation Prevention ---');
  {
    const initialOrdersCount = db.getAllOrders().length;
    const existingOrder = db.getOrderByOrderReadiness(readiness.id);
    assert.ok(existingOrder, 'Existing order must exist from Test 1');

    // Repeat creation request with identical idempotency key
    const duplicateOrder1 = OrderService.createOrderSync(
      { orderReadinessId: readiness.id, idempotencyKey: `idemp_${runId}_1` },
      advertiserUser
    );
    assert.strictEqual(duplicateOrder1.id, existingOrder.id, 'Should return the exact same Order instance');

    // Repeat creation request without key
    const duplicateOrder2 = OrderService.createOrderSync(
      { orderReadinessId: readiness.id },
      advertiserUser
    );
    assert.strictEqual(duplicateOrder2.id, existingOrder.id, 'Should return the exact same Order instance without key');

    // Verify DB count has not increased
    const finalOrdersCount = db.getAllOrders().length;
    assert.strictEqual(finalOrdersCount, initialOrdersCount, 'No duplicate records should be added to the database');

    // Reusing same idempotency key for another readiness should trigger ConflictError
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: `different_readiness_${runId}`, idempotencyKey: `idemp_${runId}_1` }, advertiserUser),
      (err: any) => err instanceof ConflictError
    );

    console.log('✅ Test 7 passed: Repeated creation requests are strictly idempotent; conflicting keys rejected.');
  }

  // -------------------------------------------------------------
  // TEST 8: Concurrent Creation Handling
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Concurrent Creation Handling ---');
  {
    // Set up a fresh second pipeline for concurrency testing
    const concurrentRunId = `${runId}_cnc`;
    const concFixture = setupTestPipeline(concurrentRunId);

    const ordersCountBefore = db.getAllOrders().length;

    // Simulate 5 simultaneous async creation calls
    const concurrentCalls = await Promise.all([
      OrderService.createOrder({ orderReadinessId: concFixture.readiness.id, idempotencyKey: `cnc_key_${concurrentRunId}` }, advertiserUser),
      OrderService.createOrder({ orderReadinessId: concFixture.readiness.id, idempotencyKey: `cnc_key_${concurrentRunId}` }, advertiserUser),
      OrderService.createOrder({ orderReadinessId: concFixture.readiness.id, idempotencyKey: `cnc_key_${concurrentRunId}` }, advertiserUser),
      OrderService.createOrder({ orderReadinessId: concFixture.readiness.id, idempotencyKey: `cnc_key_${concurrentRunId}` }, advertiserUser),
      OrderService.createOrder({ orderReadinessId: concFixture.readiness.id, idempotencyKey: `cnc_key_${concurrentRunId}` }, advertiserUser),
    ]);

    const firstOrderId = concurrentCalls[0].id;
    for (const ord of concurrentCalls) {
      assert.strictEqual(ord.id, firstOrderId, 'All concurrent calls must resolve to the identical Order ID');
    }

    const ordersCountAfter = db.getAllOrders().length;
    assert.strictEqual(ordersCountAfter, ordersCountBefore + 1, 'Exactly one order must be persisted in database');

    console.log('✅ Test 8 passed: 5 concurrent creation calls resolved atomically to a single order.');
  }

  // -------------------------------------------------------------
  // TEST 9: Unauthorized Creation & Counterparty Security Isolation
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Unauthorized Creation & Counterparty Security Isolation ---');
  {
    const authRunId = `${runId}_auth`;
    const authFixture = setupTestPipeline(authRunId);

    // Venue user must NOT be able to create Order
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: authFixture.readiness.id }, venueUser),
      (err: any) => err instanceof AuthorizationError && err.message.includes('Role \'VENUE\' is not authorized')
    );

    // Supplier must NOT be able to create Order
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: authFixture.readiness.id }, supplierUser),
      (err: any) => err instanceof AuthorizationError && err.message.includes('Role \'SUPPLIER\' is not authorized')
    );

    // Logistics Partner must NOT be able to create Order
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: authFixture.readiness.id }, logisticsPartner),
      (err: any) => err instanceof AuthorizationError && err.message.includes('Role \'LOGISTICS_PARTNER\' is not authorized')
    );

    // External Advertiser must NOT be able to create Order
    assert.throws(
      () => OrderService.createOrderSync({ orderReadinessId: authFixture.readiness.id }, externalUser),
      (err: any) => err instanceof AuthorizationError
    );

    // Now create the Order legitimately as Advertiser
    const legitOrder = OrderService.createOrderSync(
      { orderReadinessId: authFixture.readiness.id },
      advertiserUser
    );

    // Supplier and Logistics must NOT gain access to advertiser financial information
    assert.throws(
      () => OrderService.getOrder(legitOrder.id, supplierUser),
      (err: any) => err instanceof AuthorizationError && err.message.includes('Supplier and Logistics users cannot access advertiser financial data')
    );

    assert.throws(
      () => OrderService.getOrder(legitOrder.id, logisticsPartner),
      (err: any) => err instanceof AuthorizationError && err.message.includes('Supplier and Logistics users cannot access advertiser financial data')
    );

    assert.throws(
      () => OrderService.getOrder(legitOrder.id, venueUser),
      (err: any) => err instanceof AuthorizationError
    );

    assert.throws(
      () => OrderService.getOrder(legitOrder.id, externalUser),
      (err: any) => err instanceof AuthorizationError
    );

    // Admin and Contracted Advertiser CAN view
    assert.doesNotThrow(() => OrderService.getOrder(legitOrder.id, advertiserUser));
    assert.doesNotThrow(() => OrderService.getOrder(legitOrder.id, adminUser));

    console.log('✅ Test 9 passed: Unauthorized creation and counterparty financial data leaks strictly prevented.');
  }

  // -------------------------------------------------------------
  // TEST 10: Verification of All 9 Authoritative References & Snapshots
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Verification of All 9 Authoritative References & Snapshots ---');
  {
    const order = db.getOrderByOrderReadiness(readiness.id);
    assert.ok(order, 'Order must exist');

    // 1. Campaign
    assert.strictEqual(order.references.campaignId, readiness.campaignId);
    assert.strictEqual(order.references.campaignPublicId, lockedAgreement.campaignPublicId);
    assert.strictEqual(order.references.campaignName, 'Aura Maharashtra Launch 2026');

    // 2. Advertiser
    assert.strictEqual(order.references.advertiserId, advertiserUser.id);
    assert.strictEqual(order.references.advertiserPublicId, advertiserUser.publicAccountId);
    assert.ok(order.references.advertiserBrandName.includes('Aura'));

    // 3. Venue
    assert.strictEqual(order.references.venueId, venueUser.id);
    assert.strictEqual(order.references.venuePublicId, venueUser.publicAccountId);
    assert.ok(order.references.venueName.includes('Mumbai Convention Centre'));

    // 4. Campaign Agreement
    assert.strictEqual(order.references.campaignAgreementId, lockedAgreement.id);
    assert.strictEqual(order.references.campaignAgreementPublicId, lockedAgreement.publicId);

    // 5. Agreement Snapshot
    assert.ok(order.references.campaignAgreementSnapshotId);
    assert.ok(order.references.campaignAgreementSnapshotPublicId.startsWith('AB-CGS-'));

    // 6. Order Readiness
    assert.strictEqual(order.references.orderReadinessId, readiness.id);
    assert.strictEqual(order.references.orderReadinessPublicId, readiness.publicId);

    // 7. Supplier Assignment
    assert.strictEqual(order.references.supplierAssignmentId, supplierAssignment.id);
    assert.strictEqual(order.references.supplierAssignmentPublicId, supplierAssignment.publicId);
    assert.strictEqual(order.references.supplierId, supplierUser.id);
    assert.strictEqual(order.references.supplierBusinessName, 'Pune Eco Bottlers Pvt Ltd');

    // 8. Logistics Assignment
    assert.strictEqual(order.references.logisticsAssignmentId, logisticsAssignment.id);
    assert.strictEqual(order.references.logisticsAssignmentPublicId, logisticsAssignment.publicId);
    assert.strictEqual(order.references.logisticsPartnerId, logisticsPartner.id);
    assert.strictEqual(order.references.logisticsPartnerBusinessName, 'Swift India Freight Express');

    // 9. Pricing Result
    assert.strictEqual(order.references.finalPricingResultId, pricingResult.id);
    assert.strictEqual(order.references.finalPricingResultPublicId, pricingResult.publicId);
    assert.strictEqual(order.references.pricingReference, pricingResult.pricingReference);

    // Authoritative Pricing Snapshot integrity
    assert.strictEqual(order.pricing.contractedQuantity, 10000);
    assert.strictEqual(order.pricing.grandTotalMinor, pricingResult.grandTotalMinor);
    assert.strictEqual(order.pricing.productPriceTotalMinor, pricingResult.productPriceTotalMinor);
    assert.strictEqual(order.pricing.logisticsCostTotalMinor, pricingResult.logisticsCostTotalMinor);
    assert.strictEqual(order.pricing.taxableAmountMinor, pricingResult.taxableAmountMinor);
    assert.strictEqual(order.pricing.totalTaxMinor, pricingResult.taxes.totalTaxMinor);

    // Operational Terms snapshot
    assert.strictEqual(order.operationalTerms.contractedQuantity, 10000);
    assert.strictEqual(order.operationalTerms.refrigerationRequired, false);
    assert.strictEqual(order.operationalTerms.bottleSpecifications.bottleMaterial, 'Aluminum');
    assert.strictEqual(order.operationalTerms.bottleSpecifications.bottleCapacityMl, 500);

    // Shared View
    const sharedView = OrderService.getSharedView(order.id, advertiserUser);
    assert.strictEqual(sharedView.publicId, order.publicId);
    assert.strictEqual(sharedView.status, 'PAYMENT_REQUIRED');
    assert.strictEqual(sharedView.contractedQuantity, 10000);
    assert.strictEqual(sharedView.references.finalPricingPublicId, pricingResult.publicId);

    console.log('✅ Test 10 passed: All 9 authoritative references, pricing snapshots, and operational terms verified.');
  }

  console.log('\n=============================================================');
  console.log('ALL 10 STEP 11B ORDER CREATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=============================================================');
}

runOrderCreationTests().catch((err) => {
  console.error('❌ Step 11B Order Creation test failed:', err);
  process.exit(1);
});
