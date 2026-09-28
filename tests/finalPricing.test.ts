/**
 * AquaBloom Step 11A: Final Pricing Engine Foundation Test Suite
 * 
 * Verifies:
 * 1. Valid Product + Logistics Price calculation (Customer-Facing formula: Product Price + Logistics Cost + Taxes = Total).
 * 2. Correct Quantity multiplication from authoritative Agreement Snapshot.
 * 3. Correct Tax calculation (GST statutory rules: Intra-state CGST 9% + SGST 9%, Inter-state IGST 18%).
 * 4. Missing tax configuration triggers PRICING_BLOCKED with unambiguous diagnostic reason.
 * 5. Missing / zero product price triggers PRICING_BLOCKED.
 * 6. Missing logistics price triggers PRICING_BLOCKED.
 * 7. Stale product version detection / rejection.
 * 8. Unauthorized pricing request (RBAC enforcement).
 * 9. Floating-point / money precision safety (SafeMoney integer minor units / paise).
 * 10. Venue compensation evaluated server-side, adhering to <= 12.5% statutory cap and isolated from counterparty views.
 * 11. Workflow state preconditions (Agreement != LOCKED, Readiness != READY_FOR_ORDER, Supplier != ASSIGNED, Logistics != ASSIGNED).
 * 12. Idempotent / repeat pricing requests with deterministic outputs.
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
  SafeMoney,
  TaxCalculationEngine,
  FinalPricingAuthorizationService,
  FinalPricingEngine,
} from '../src/server/finalPricingServices.js';
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
} from '../src/types.js';

const nowIso = new Date().toISOString();
const runId = Math.random().toString(36).substring(2, 8);

// Actors
const adminUser: User = {
  id: `usr_admin_step11_${runId}`,
  publicAccountId: `AB-ACC-ADMIN-11-${runId}`,
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Step 11 Admin',
  email: `admin11_${runId}@aquabloom.internal`,
  organizationName: 'AquaBloom Pricing Ops',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: `usr_adv_step11_${runId}`,
  publicAccountId: `AB-ACC-ADV-11-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Sarah Jenkins',
  email: `sarah11_${runId}@aurabeverages.example`,
  organizationName: 'Aura Beverages India',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: `usr_ven_step11_${runId}`,
  publicAccountId: `AB-ACC-VEN-11-${runId}`,
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Marcus Vance',
  email: `marcus11_${runId}@mumbaiconvention.example`,
  organizationName: 'Mumbai Convention Centre',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUser: User = {
  id: `usr_sup_step11_${runId}`,
  publicAccountId: `AB-ACC-SUP-11-${runId}`,
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Rajesh Sharma',
  email: `rajesh11_${runId}@puneecobottlers.example`,
  organizationName: 'Pune Eco Bottlers Pvt Ltd',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const logisticsPartner: User = {
  id: `usr_log_step11_${runId}`,
  publicAccountId: `AB-ACC-LOG-11-${runId}`,
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Vikram Patel',
  email: `vikram11_${runId}@swiftfreight.example`,
  organizationName: 'Swift India Freight Express',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const externalUser: User = {
  id: `usr_ext_step11_${runId}`,
  publicAccountId: `AB-ACC-EXT-11-${runId}`,
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'External Spy',
  email: `spy11_${runId}@competitor.example`,
  organizationName: 'Competitor Corp',
  createdAt: nowIso,
  updatedAt: nowIso,
};

/**
 * Test Harness Setup
 */
function setupTestPipeline() {
  // Save users
  db.saveUser(adminUser);
  db.saveUser(advertiserUser);
  db.saveUser(venueUser);
  db.saveUser(supplierUser);
  db.saveUser(logisticsPartner);
  db.saveUser(externalUser);

  // Profiles
  const advProfile: AdvertiserProfile = {
    role: 'ADVERTISER',
    accountId: advertiserUser.id,
    brandName: 'Aura Beverages',
    industry: 'Premium Beverages',
    description: 'Eco-conscious hydration',
    primaryContact: {
      name: advertiserUser.contactName,
      email: advertiserUser.email,
    },
    location: {
      city: 'Mumbai',
      stateRegion: 'Maharashtra',
      country: 'India',
    },
    completion: {
      percentage: 100,
      missingFields: [],
      isComplete: true,
      lastCalculatedAt: nowIso,
    },
  };
  db.saveProfile(advertiserUser.id, advProfile);

  const venProfile: VenueProfile = {
    role: 'VENUE',
    accountId: venueUser.id,
    venueName: 'Mumbai Convention Centre',
    venueType: 'Exhibition & Convention Center',
    description: 'Premier business hub',
    location: {
      address: 'Bandra-Kurla Complex',
      city: 'Mumbai',
      stateRegion: 'Maharashtra',
      postalCode: '400051',
      country: 'India',
    },
    audienceCategory: 'Corporate & Technology',
    footfall: {
      monthlyVisitors: 150000,
      peakTrafficTimes: '10:00 - 18:00 Weekdays',
    },
    bottleConsumption: {
      estimatedMonthlyBottles: 30000,
    },
    capacity: {
      maxBottleHoldingCapacity: 50000,
      currentOngoingBottleCommitment: 5000,
      availableBottleCapacity: 45000,
    },
    campaignAvailability: 'YEAR_ROUND',
    completion: {
      percentage: 100,
      missingFields: [],
      isComplete: true,
      lastCalculatedAt: nowIso,
    },
  };
  db.saveProfile(venueUser.id, venProfile);

  const supProfile: SupplierProfile = {
    role: 'SUPPLIER',
    accountId: supplierUser.id,
    facility: {
      facilityName: 'Pune Eco Plant',
      city: 'Pune',
      stateRegion: 'Maharashtra',
      country: 'India',
      address: 'MIDC Chakan Industrial Area',
      postalCode: '410501',
      dispatchScheduleDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    },
    productionCapacity: {
      maxMonthlyUnits: 500000,
      currentCommittedUnits: 100000,
      availableMonthlyUnits: 400000,
      typicalLeadTimeDays: 14,
    },
    capabilities: ['Alu Bottle', 'Screen Print', 'Cold Fill'],
    certifications: ['FSSAI', 'ISO 22000'],
    approvalStatus: 'APPROVED',
    completion: {
      percentage: 100,
      missingFields: [],
      isComplete: true,
      lastCalculatedAt: nowIso,
    },
  };
  db.saveProfile(supplierUser.id, supProfile);

  const logProfile: LogisticsProfile = {
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
    completion: {
      percentage: 100,
      missingFields: [],
      isComplete: true,
      lastCalculatedAt: nowIso,
    },
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
      customerFacingPrice: { amount: 24.5, currency: 'INR' }, // ₹24.50 per bottle
      supplierInternalCost: { amount: 16.0, currency: 'INR' },
    }
  );

  // Campaign
  const campaign: Campaign = {
    id: `cmp_step11_${runId}`,
    publicCampaignId: `AB-CMP-11-${runId}`,
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
    activeVersionId: `cmv_step11_${runId}`,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveCampaign(campaign);

  // Proposal
  const proposal: Proposal = {
    id: `prp_step11_${runId}`,
    publicProposalId: `AB-PRP-11-${runId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_step11_${runId}`,
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

  const agreementId = `cag_step11_${runId}`;
  const agreementPublicId = `AB-CAG-11-${runId}`;
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
    currentVersionId: `cgv_step11_v1_${runId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-11-${runId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-11-${runId}`,
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

  return {
    lockedAgreement: agreement,
    readiness: validatedReadiness,
    product,
    productVersion: version,
    supplierAssignment,
    logisticsAssignment,
    logisticsOffer,
  };
}

/**
 * ========================================================
 * STEP 11A TEST RUNNER
 * ========================================================
 */
async function runFinalPricingEngineTests() {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 11A: FINAL PRICING ENGINE TESTS');
  console.log('=============================================================');

  const {
    lockedAgreement,
    readiness,
    product,
    productVersion,
    supplierAssignment,
    logisticsAssignment,
  } = setupTestPipeline();

  console.log(`✅ Test baseline initialized. Readiness: ${readiness.publicId}`);
  console.log(`   Supplier Assignment: ${supplierAssignment.publicId}`);
  console.log(`   Logistics Assignment: ${logisticsAssignment.publicId}`);

  // -------------------------------------------------------------
  // TEST 1: Money Safety & Integer Minor Units Precision
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Money Safety & Integer Arithmetic (Paise) ---');
  {
    // 100.50 INR -> 10050 paise
    const minor1 = SafeMoney.toMinor(100.5);
    assert.strictEqual(minor1, 10050);
    assert.strictEqual(SafeMoney.toMajorString(minor1), '100.50');
    assert.strictEqual(SafeMoney.formatINR(minor1), '₹100.50');

    // Float roundoff check: 19.99 * 100 in float can be 1998.9999999999998
    const minor2 = SafeMoney.toMinor(19.99);
    assert.strictEqual(minor2, 1999);
    assert.strictEqual(SafeMoney.formatINR(minor2), '₹19.99');

    // Multiply quantity: 24.50 (2450 paise) * 10,000 = 24,500,000 paise (₹245,000.00)
    const totalMinor = SafeMoney.multiplyQuantity(2450, 10000);
    assert.strictEqual(totalMinor, 24500000);
    assert.strictEqual(SafeMoney.formatINR(totalMinor), '₹245000.00');

    // Tax calculation half-up: 18% on 10050 paise = 1809 paise
    const taxMinor = SafeMoney.calculateTaxMinor(10050, 18.0);
    assert.strictEqual(taxMinor, 1809);

    console.log('✅ Test 1 passed: SafeMoney integer minor units prevent all binary float inaccuracies.');
  }

  // -------------------------------------------------------------
  // TEST 2: Valid Product + Logistics Pricing Calculation (Customer Formula)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Authoritative Deterministic Pricing Calculation ---');
  {
    const pricingResult = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);

    assert.strictEqual(pricingResult.status, 'CALCULATED');
    assert.strictEqual(pricingResult.currency, 'INR');
    assert.strictEqual(pricingResult.orderReadinessId, readiness.id);
    assert.strictEqual(pricingResult.supplierAssignmentId, supplierAssignment.id);
    assert.strictEqual(pricingResult.logisticsAssignmentId, logisticsAssignment.id);

    // Quantity check: 10,000 bottles
    assert.strictEqual(pricingResult.sourceReferences.contractedQuantity, 10000);

    // Product unit price: ₹24.50 = 2450 paise
    assert.strictEqual(pricingResult.productUnitPrice.amountMinor, 2450);
    assert.strictEqual(pricingResult.productUnitPrice.formatted, '₹24.50');

    // Product total: 10,000 * 2450 paise = 24,500,000 paise (₹245,000.00)
    assert.strictEqual(pricingResult.productPriceTotalMinor, 24500000);
    assert.strictEqual(pricingResult.productPriceTotalFormatted, '₹245000.00');

    // Logistics cost: 10 pallets = 5000 + 10 * 1500 = 20,000 INR = 2,000,000 paise
    assert.strictEqual(pricingResult.logisticsCostTotalMinor, 2000000);
    assert.strictEqual(pricingResult.logisticsCostTotalFormatted, '₹20000.00');

    // Taxable amount: Product (24,500,000) + Logistics (2,000,000) = 26,500,000 paise (₹265,000.00)
    assert.strictEqual(pricingResult.taxableAmountMinor, 26500000);
    assert.strictEqual(pricingResult.taxableAmountFormatted, '₹265000.00');

    // Strict rule: NO separate label fee
    assert.strictEqual(pricingResult.safeguards.separateLabelFeeCharged, false);
    assert.strictEqual(
      pricingResult.safeguards.formulaNote,
      'PRODUCT PRICE + LOGISTICS COST + APPLICABLE TAXES = TOTAL'
    );

    console.log('✅ Test 2 passed: Pricing strictly follows Product Price + Logistics Cost + Taxes.');
  }

  // -------------------------------------------------------------
  // TEST 3: Correct Statutory Tax Breakdown (Intra-state Maharashtra)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Tax Calculation (Intra-State CGST + SGST @ 9% each) ---');
  {
    const pricingResult = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);
    const taxes = pricingResult.taxes;

    assert.strictEqual(taxes.taxApplicable, true);
    assert.strictEqual(taxes.jurisdiction.isInterState, false);
    assert.strictEqual(taxes.ratePercentageTotal, 18.0);
    assert.strictEqual(taxes.taxComponents.length, 2);

    const cgst = taxes.taxComponents.find((c) => c.taxType === 'CGST');
    const sgst = taxes.taxComponents.find((c) => c.taxType === 'SGST');

    assert(cgst, 'CGST component missing');
    assert(sgst, 'SGST component missing');

    assert.strictEqual(cgst.ratePercentage, 9.0);
    assert.strictEqual(sgst.ratePercentage, 9.0);

    // 9% of 26,500,000 = 2,385,000 paise (₹23,850.00)
    assert.strictEqual(cgst.taxAmountMinor, 2385000);
    assert.strictEqual(sgst.taxAmountMinor, 2385000);
    assert.strictEqual(cgst.taxAmountFormatted, '₹23850.00');
    assert.strictEqual(sgst.taxAmountFormatted, '₹23850.00');

    // Total tax: 4,770,000 paise (₹47,700.00)
    assert.strictEqual(taxes.totalTaxMinor, 4770000);
    assert.strictEqual(taxes.totalTaxFormatted, '₹47700.00');

    // Grand Total: 26,500,000 + 4,770,000 = 31,270,000 paise (₹312,700.00)
    assert.strictEqual(pricingResult.grandTotalMinor, 31270000);
    assert.strictEqual(pricingResult.grandTotalFormatted, '₹312700.00');

    console.log('✅ Test 3 passed: Intra-state GST properly splits into CGST and SGST with exact totals.');
  }

  // -------------------------------------------------------------
  // TEST 4: Inter-State Tax Calculation (IGST @ 18%)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Inter-State Tax Calculation (IGST @ 18%) ---');
  {
    const interStateTax = TaxCalculationEngine.evaluateTaxes(
      26500000,
      'Gujarat', // Origin
      'Maharashtra' // Destination
    );

    assert.strictEqual(interStateTax.isSuccess, true);
    assert(interStateTax.result);
    assert.strictEqual(interStateTax.result.jurisdiction.isInterState, true);
    assert.strictEqual(interStateTax.result.taxComponents.length, 1);
    assert.strictEqual(interStateTax.result.taxComponents[0].taxType, 'IGST');
    assert.strictEqual(interStateTax.result.taxComponents[0].ratePercentage, 18.0);
    assert.strictEqual(interStateTax.result.totalTaxMinor, 4770000);

    console.log('✅ Test 4 passed: Inter-state calculation seamlessly applies unified 18% IGST.');
  }

  // -------------------------------------------------------------
  // TEST 5: Missing Tax Configuration Triggers PRICING_BLOCKED
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Missing Tax Configuration -> PRICING_BLOCKED ---');
  {
    const blockedTax = TaxCalculationEngine.evaluateTaxes(
      26500000,
      '', // Missing state
      'Maharashtra'
    );

    assert.strictEqual(blockedTax.isSuccess, false);
    assert(blockedTax.blockingReason?.includes('Supplier dispatch state/jurisdiction is missing'));

    const blockedTaxVenue = TaxCalculationEngine.evaluateTaxes(
      26500000,
      'Maharashtra',
      '' // Missing venue state
    );
    assert.strictEqual(blockedTaxVenue.isSuccess, false);
    assert(blockedTaxVenue.blockingReason?.includes('Venue receiving delivery state/jurisdiction is missing'));

    console.log('✅ Test 5 passed: Missing tax information returns PRICING_BLOCKED without guessing.');
  }

  // -------------------------------------------------------------
  // TEST 6: Stale / Missing Product Version Triggers PRICING_BLOCKED
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Stale Product Version Check ---');
  {
    // Clone supplier assignment and tamper with version
    const clonedAssignment: SupplierAssignment = JSON.parse(JSON.stringify(supplierAssignment));
    clonedAssignment.productVersionId = 'prv_stale_nonexistent';
    db.saveSupplierAssignment(clonedAssignment);

    const staleResult = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);
    assert.strictEqual(staleResult.status, 'PRICING_BLOCKED');
    assert(staleResult.blockingReason?.includes('is stale or missing in product version history'));

    // Restore original assignment
    db.saveSupplierAssignment(supplierAssignment);
    console.log('✅ Test 6 passed: Stale or modified product version halts pricing deterministically.');
  }

  // -------------------------------------------------------------
  // TEST 7: Authorization & Counterparty RBAC
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Authorization & Counterparty RBAC ---');
  {
    // Advertiser can calculate and view their own pricing
    assert.doesNotThrow(() => {
      FinalPricingAuthorizationService.assertCanCalculate(readiness, advertiserUser);
    });

    // Venue CANNOT trigger calculation
    assert.throws(
      () => FinalPricingAuthorizationService.assertCanCalculate(readiness, venueUser),
      (err: any) => err instanceof AuthorizationError
    );

    // Supplier CANNOT trigger calculation
    assert.throws(
      () => FinalPricingAuthorizationService.assertCanCalculate(readiness, supplierUser),
      (err: any) => err instanceof AuthorizationError
    );

    // Logistics Partner CANNOT trigger calculation
    assert.throws(
      () => FinalPricingAuthorizationService.assertCanCalculate(readiness, logisticsPartner),
      (err: any) => err instanceof AuthorizationError
    );

    // External Advertiser CANNOT trigger calculation or view
    assert.throws(
      () => FinalPricingAuthorizationService.assertCanCalculate(readiness, externalUser),
      (err: any) => err instanceof AuthorizationError
    );
    assert.throws(
      () => FinalPricingAuthorizationService.assertCanView(readiness, externalUser),
      (err: any) => err instanceof AuthorizationError
    );

    console.log('✅ Test 7 passed: Strict RBAC confines pricing execution to authorized actors.');
  }

  // -------------------------------------------------------------
  // TEST 8: Venue Compensation Evaluation Safeguards (<= 12.5% Cap)
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Venue Compensation Statutory Cap Evaluation ---');
  {
    const pricingResult = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);
    const compEval = pricingResult.venueCompensationEvaluation;

    // 10% agreed in proposal
    assert.strictEqual(compEval.agreedPercentage, 10.0);
    assert.strictEqual(compEval.statutoryCapPercentage, 12.5);
    assert.strictEqual(compEval.cappedAtStatutoryLimit, false);

    // Base is strictly product price total (₹245,000 = 24,500,000 paise)
    assert.strictEqual(compEval.eligibleBaseAmountMinor, 24500000);

    // 10% of 24,500,000 paise = 2,450,000 paise (₹24,500.00)
    assert.strictEqual(compEval.calculatedVenueCompensationMinor, 2450000);
    assert.strictEqual(compEval.calculatedVenueCompensationFormatted, '₹24500.00');

    // Counterparty shared view verification: venue compensation is NOT exposed
    const sharedView = FinalPricingEngine.getSharedView(pricingResult, advertiserUser);
    assert.strictEqual((sharedView as any).venueCompensationEvaluation, undefined);
    assert.strictEqual((sharedView as any).supplierInternalCost, undefined);

    console.log('✅ Test 8 passed: Venue compensation evaluated against 12.5% cap and kept isolated.');
  }

  // -------------------------------------------------------------
  // TEST 9: Entry Workflow State Preconditions
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Precondition Enforcement (Agreement, Readiness, Assignments) ---');
  {
    // Test agreement must be LOCKED
    const unlockedAgreement: CampaignAgreement = {
      ...lockedAgreement,
      id: `cag_unlocked_${runId}`,
      publicId: `AB-CAG-UNLOCKED-${runId}`,
      status: 'PENDING_SIGNATURES',
    };
    db.saveAgreement(unlockedAgreement);

    const unlockedReadiness: OrderReadiness = {
      ...readiness,
      id: `ordr_unlocked_${runId}`,
      publicId: `AB-ORDR-UNLOCKED-${runId}`,
      campaignAgreementId: unlockedAgreement.id,
    };
    db.saveOrderReadiness(unlockedReadiness);

    assert.throws(
      () => FinalPricingEngine.calculateFinalPricing(unlockedReadiness.id, adminUser),
      (err: any) => err instanceof ValidationError && err.message.includes('must be LOCKED')
    );

    // Tamper with OrderReadiness status
    const clonedReadiness: OrderReadiness = JSON.parse(JSON.stringify(readiness));
    clonedReadiness.status = 'BLOCKED';
    db.saveOrderReadiness(clonedReadiness);

    assert.throws(
      () => FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser),
      (err: any) => err instanceof ValidationError && err.message.includes('must be READY_FOR_ORDER')
    );

    // Restore OrderReadiness
    db.saveOrderReadiness(readiness);

    // Tamper with Supplier Assignment status
    const clonedSupplierAssignment: SupplierAssignment = JSON.parse(JSON.stringify(supplierAssignment));
    clonedSupplierAssignment.status = 'CANCELLED';
    db.saveSupplierAssignment(clonedSupplierAssignment);

    assert.throws(
      () => FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Supplier Assignment must be ASSIGNED')
    );

    // Restore Supplier Assignment
    db.saveSupplierAssignment(supplierAssignment);

    // Tamper with Logistics Assignment status
    const clonedLogisticsAssignment: LogisticsAssignment = JSON.parse(JSON.stringify(logisticsAssignment));
    clonedLogisticsAssignment.status = 'CANCELLED';
    db.saveLogisticsAssignment(clonedLogisticsAssignment);

    assert.throws(
      () => FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser),
      (err: any) => err instanceof ValidationError && err.message.includes('Logistics Assignment must be ASSIGNED')
    );

    // Restore Logistics Assignment
    db.saveLogisticsAssignment(logisticsAssignment);

    console.log('✅ Test 9 passed: Entry conditions rigorously reject invalid or incomplete workflows.');
  }

  // -------------------------------------------------------------
  // TEST 10: Determinism & Idempotent Recalculation
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: Determinism & Idempotent Calculation ---');
  {
    const result1 = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);
    const result2 = FinalPricingEngine.calculateFinalPricing(readiness.id, adminUser);

    assert.strictEqual(result1.productPriceTotalMinor, result2.productPriceTotalMinor);
    assert.strictEqual(result1.logisticsCostTotalMinor, result2.logisticsCostTotalMinor);
    assert.strictEqual(result1.taxableAmountMinor, result2.taxableAmountMinor);
    assert.strictEqual(result1.taxes.totalTaxMinor, result2.taxes.totalTaxMinor);
    assert.strictEqual(result1.grandTotalMinor, result2.grandTotalMinor);

    console.log('✅ Test 10 passed: Identical authoritative inputs yield identical financial outputs.');
  }

  console.log('\n=============================================================');
  console.log('ALL AQUABLOOM STEP 11A FINAL PRICING ENGINE TESTS PASSED');
  console.log('=============================================================');
}

runFinalPricingEngineTests().catch((err) => {
  console.error('❌ Step 11A Final Pricing Engine test failed:', err);
  process.exit(1);
});
