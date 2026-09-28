/**
 * AQUABLOOM STEP 12E: FINANCIAL LEDGER FOUNDATION TEST SUITE
 * 
 * Verifies:
 * 1. Ledger creation after verified payment:
 *    - Authoritative payment entry created with unique transaction ID, Order, Payment,
 *      transaction type (PAYMENT_RECEIVED), amount, currency (INR), direction (CREDIT),
 *      timestamp, source reference, reconciliation status, related party.
 *    - Double-entry accruals created for Supplier, Venue, Logistics, Tax, and Platform margin.
 *    - Complete balanced ledger check (payment received = debits + platform margin).
 * 2. Duplicate payment event:
 *    - Idempotency guard: duplicate verification or webhook event does not duplicate ledger entries.
 * 3. Amount mismatch:
 *    - Underpayment / Overpayment do NOT create financial ledger entries.
 * 4. Venue visibility:
 *    - Venue sees only compensation amount, status, expected settlement info.
 *    - Venue CANNOT see advertiser payment amount, payment method, advertiser transaction details,
 *      supplier internal cost, logistics cost, or platform margin.
 *    - Unauthorized counterparties blocked with 403 AuthorizationError.
 * 5. Supplier visibility:
 *    - Supplier sees only their manufacturing payable, product, quantity, settlement status.
 *    - Supplier CANNOT see advertiser total payment, venue compensation, logistics cost, or platform margin.
 * 6. Financial transaction uniqueness:
 *    - Every financial ledger entry has a unique, non-colliding business ID (AB-FTX-...).
 * 7. Compensation calculation boundaries:
 *    - Strictly based on eligible supplier bottle advertising cost (productPriceTotalMinor).
 *    - Excludes advertiser plan fee, logistics, tax, and unrelated charges.
 *    - Strictly capped at statutory maximum of 12.5%.
 */

import assert from 'node:assert';
import { db } from '../src/server/db.js';
import { FinalPricingEngine } from '../src/server/finalPricingServices.js';
import { OrderService } from '../src/server/orderServices.js';
import { OrderReadinessService } from '../src/server/orderReadinessServices.js';
import { AgreementSnapshotService } from '../src/server/agreementServices.js';
import { SupplierOperationalOfferService } from '../src/server/supplierAssignmentServices.js';
import { LogisticsOperationalOfferService } from '../src/server/logisticsAssignmentServices.js';
import {
  PaymentInitiationService,
  PaymentVerificationService,
  PaymentProviderRegistry,
  SimulatedPaymentProvider,
} from '../src/server/paymentInitiationServices.js';
import {
  FinancialLedgerService,
  FinancialLedgerEngine,
  FinancialLedgerAuthorizationService,
} from '../src/server/financialLedgerServices.js';
import { AuthorizationError, ValidationError } from '../src/lib/errors.js';
import type {
  User,
  Order,
  OrderReadiness,
  SupplierAssignment,
  LogisticsAssignment,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  FinalPricingCalculationResult,
  OrderPricingSnapshot,
} from '../src/types.js';

interface TestContext {
  advertiserUser: User;
  venueUser: User;
  supplierUser: User;
  logisticsPartner: User;
  adminUser: User;
  unauthorizedUser: User;
  order: Order;
  orderReadiness: OrderReadiness;
  supplierAssignment: SupplierAssignment;
  logisticsAssignment: LogisticsAssignment;
  lockedAgreement: CampaignAgreement;
  agreementSnapshot: CampaignAgreementSnapshot;
  pricingResult: FinalPricingCalculationResult;
  snapshot: OrderPricingSnapshot;
}

function setupTestPipeline(rawRunId: string, customVenueCompPercentage = 10.0): TestContext {
  const customRunId = `${rawRunId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  // 1. Users
  const advertiserUser: User = {
    id: `usr_adv_12e_${customRunId}`,
    publicAccountId: `AB-ADV-12E-${customRunId}`,
    contactName: 'Nisha Agarwal',
    email: `adv_12e_${customRunId}@brand.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Spark Beverages',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_12e_${customRunId}`,
    publicAccountId: `AB-VEN-12E-${customRunId}`,
    contactName: 'Rohit Kulkarni',
    email: `venue_12e_${customRunId}@hub.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Bandra Business Plaza',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_12e_${customRunId}`,
    publicAccountId: `AB-SUP-12E-${customRunId}`,
    contactName: 'Gaurav Shinde',
    email: `supplier_12e_${customRunId}@ecobottle.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'EcoSpring Packaging Works',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_12e_${customRunId}`,
    publicAccountId: `AB-LOG-12E-${customRunId}`,
    contactName: 'Harish Nair',
    email: `logistics_12e_${customRunId}@speedfreight.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'SpeedFreight Logistics Mumbai',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_12e_${customRunId}`,
    publicAccountId: `AB-ADM-12E-${customRunId}`,
    contactName: 'AquaBloom System Admin',
    email: `admin_12e_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Operations HQ',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const unauthorizedUser: User = {
    id: `usr_unauth_12e_${customRunId}`,
    publicAccountId: `AB-UNA-12E-${customRunId}`,
    contactName: 'Unrelated User',
    email: `unrelated_12e_${customRunId}@other.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Other Unrelated Mall',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.saveUser(advertiserUser);
  db.saveUser(venueUser);
  db.saveUser(supplierUser);
  db.saveUser(logisticsPartner);
  db.saveUser(adminUser);
  db.saveUser(unauthorizedUser);

  // 2. Profiles
  const advProfile: any = {
    userId: advertiserUser.id,
    role: 'ADVERTISER',
    businessName: advertiserUser.organizationName,
    businessType: 'CORPORATION',
    contactPerson: advertiserUser.contactName,
    billingAddress: '401 Nariman Point, Mumbai, Maharashtra',
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
    approvalStatus: 'APPROVED',
  };
  db.saveProfile(advertiserUser.id, advProfile, adminUser.id);

  const venProfile: any = {
    userId: venueUser.id,
    role: 'VENUE',
    venueName: venueUser.organizationName,
    venueType: 'COMMERCIAL_HUB',
    location: {
      address: 'Plot C-54, G Block, BKC, Bandra East',
      city: 'Mumbai',
      stateRegion: 'Maharashtra',
      postalCode: '400051',
      country: 'India',
    },
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
    approvalStatus: 'APPROVED',
  };
  db.saveProfile(venueUser.id, venProfile, adminUser.id);

  const supProfile: any = {
    userId: supplierUser.id,
    role: 'SUPPLIER',
    businessName: supplierUser.organizationName,
    facility: {
      facilityName: 'EcoSpring Packaging Facility',
      city: 'Navi Mumbai',
      state: 'Maharashtra',
      stateRegion: 'Maharashtra',
      country: 'India',
      address: 'MIDC Phase II, TTC Industrial Area, Mahape',
      postalCode: '400710',
    },
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
    approvalStatus: 'APPROVED',
  };
  db.saveProfile(supplierUser.id, supProfile, adminUser.id);

  const logProfile: any = {
    userId: logisticsPartner.id,
    role: 'LOGISTICS_PARTNER',
    businessName: logisticsPartner.organizationName,
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
    approvalStatus: 'APPROVED',
  };
  db.saveProfile(logisticsPartner.id, logProfile, adminUser.id);

  db.updateApprovalStatus(supplierUser.id, 'APPROVED', adminUser.id, 'Verified bottling facility');
  db.updateApprovalStatus(logisticsPartner.id, 'APPROVED', adminUser.id, 'Verified freight fleet');

  // 3. Product with internal production cost
  const { product } = db.createProduct(
    supplierUser.id,
    {
      name: 'EcoSpring 500ml Premium Still Water',
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
        capType: 'Screw Cap',
        bottleFinish: 'Matte White Powder Coat',
        finishingOptions: ['Matte White Powder Coat'],
        labelType: 'Direct Screen Print',
        printingCapability: 'Full CMYK',
        packagingConfiguration: '24 bottles per carton',
      },
      leadTime: { value: 14, unit: 'DAYS' },
      minimumOrderQuantity: 5000,
      customerFacingPrice: { amount: 24.50, currency: 'INR' },
      supplierInternalCost: { amount: 16.00, currency: 'INR' },
    } as any,
    adminUser.id
  );

  // 4. Campaign
  const campaign: any = {
    id: `cmp_12e_${customRunId}`,
    publicCampaignId: `AB-CMP-12E-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Summer Hydration Wave 2026',
    objective: 'Brand Awareness',
    status: 'PROPOSED',
    totalTargetAudience: 50000,
    preferredStartPeriod: '2026-11-01',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveCampaign(campaign);

  // 5. Proposal
  const proposal: any = {
    id: `prp_12e_${customRunId}`,
    publicProposalId: `AB-PRP-12E-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_12e_${customRunId}`,
    terms: {
      campaignQuantity: 10000,
      campaignDuration: { value: 4, unit: 'WEEKS' },
      preferredStartPeriod: { type: 'MONTH', label: 'November 2026' },
      productRequirements: { volumeMl: 500, bottleMaterial: 'Aluminum', labelType: 'Direct Screen Print' },
      distributionRequirements: { placementDetails: 'Main Atrium BKC', estimatedDistributionPace: '2500/week', refrigerationRequired: false },
      placementRequirements: ['Registration'],
      collaborationRequirement: { status: 'NOT_REQUIRED' },
      venueCompensationTerms: {
        proposedPercentage: Math.min(12.5, customVenueCompPercentage),
        agreedPercentage: customVenueCompPercentage,
        termsDescription: `${customVenueCompPercentage}% allowance`,
        notes: '',
        eligibleBaseDescription: 'Supplier Cost',
        maximumCapPercentage: 12.5,
      },
      advertiserResponsibilities: ['Artwork'],
      venueResponsibilities: ['Placement'],
      aquaBloomResponsibilities: ['Logistics'],
      deliveryTermsKnown: {
        deliveryAddress: 'Plot C-54, G Block, BKC, Bandra East, Mumbai, Maharashtra 400051',
        stagingInstructions: 'Gate 3 loading bay delivery only',
        specialHandling: 'Keep upright',
        refrigerationRequired: false,
        status: 'PENDING_LOGISTICS_ASSIGNMENT',
      },
      qrRequirements: { targetUrl: 'https://aurabeverages.example', customDomainAllowed: false },
      cancellationTerms: { cancellationCutoffStage: 'PRODUCTION_START', refundEligibilityDescription: 'Full refund' },
      renewalTerms: { renewalOptionAvailable: true, termsSummary: 'Option to extend' },
      customConditions: '',
      importantConditions: [],
    },
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveProposal(proposal);

  // 6. Campaign Agreement
  const agreementId = `cag_12e_${customRunId}`;
  const agreementPublicId = `AB-CAG-12E-${customRunId}`;
  const agreement: CampaignAgreement = {
    id: agreementId,
    publicId: agreementPublicId,
    campaignId: campaign.id,
    campaignPublicId: campaign.publicCampaignId,
    campaignName: campaign.name,
    campaignCategory: 'Beverage & Hospitality',
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
    currentVersionId: `cgv_12e_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-12E-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-12E-${customRunId}`,
    terms: proposal.terms as any,
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

  // 7. Snapshot & Order Readiness
  const agreementSnapshot = AgreementSnapshotService.createSnapshot(agreement, adminUser);
  const { orderReadiness: validatedReadiness } = OrderReadinessService.assessOrderReadiness(agreement.id, adminUser);

  // 8. Supplier Assignment
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

  // 9. Logistics Assignment
  const logisticsOffer = LogisticsOperationalOfferService.createOffer(
    {
      orderReadinessId: validatedReadiness.id,
      logisticsPartnerId: logisticsPartner.id,
      originAddress: 'MIDC Phase II, TTC Industrial Area, Mahape, Navi Mumbai 400710',
      destinationAddress: 'Plot C-54, G Block, BKC, Bandra East, Mumbai, Maharashtra 400051',
      vehicleType: 'TRUCK_MEDIUM',
      distanceKm: 35,
      deliveryWindowStart: '2026-11-01',
      deliveryWindowEnd: '2026-11-03',
      stagingInstructions: 'Gate 3 loading bay delivery only',
      refrigerationRequired: false,
      quotedLogisticsCost: 20000,
      finalNegotiatedLogisticsCost: 20000,
    } as any,
    adminUser
  );
  const logisticsAssignmentResult = LogisticsOperationalOfferService.acceptOffer(
    logisticsOffer.id,
    { finalAgreedLogisticsCost: 20000 } as any,
    logisticsPartner
  );
  const logisticsAssignment = logisticsAssignmentResult.assignment;

  // 10. Step 11A Final Pricing
  const pricingResult = FinalPricingEngine.calculateFinalPricing(validatedReadiness.id, adminUser);

  // 11. Step 11B Order Creation
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_12e_${customRunId}` },
    advertiserUser
  );

  const snapshot = db.getOrderPricingSnapshotByOrderId(order.id)!;
  assert.ok(snapshot);

  return {
    advertiserUser,
    venueUser,
    supplierUser,
    logisticsPartner,
    adminUser,
    unauthorizedUser,
    order,
    orderReadiness: validatedReadiness,
    supplierAssignment,
    logisticsAssignment,
    lockedAgreement: agreement,
    agreementSnapshot,
    pricingResult,
    snapshot,
  };
}

async function runStep12ETests() {
  console.log('================================================================');
  console.log('STARTING AQUABLOOM STEP 12E: FINANCIAL LEDGER FOUNDATION TESTS');
  console.log('================================================================');

  // Register simulated payment provider
  PaymentProviderRegistry.register(new SimulatedPaymentProvider());

  // ------------------------------------------------------------------
  // TEST 1: LEDGER CREATION AFTER VERIFIED PAYMENT
  // ------------------------------------------------------------------
  console.log('\n--- TEST 1: Ledger Creation After Verified Payment ---');
  const runId1 = `r1_${Date.now().toString(36)}`;
  const ctx1 = setupTestPipeline(runId1, 10.0);

  // Initiate payment
  const initResult = await PaymentInitiationService.initiatePayment(
    { orderId: ctx1.order.id },
    ctx1.advertiserUser
  );
  assert.ok(initResult.paymentId);
  const paymentRecord = db.getPaymentById(initResult.paymentId)!;

  // Guard Check: Verify ledger entries CANNOT be created before payment is verified as PAID
  assert.throws(
    () => {
      FinancialLedgerService.recordPaymentLedgerEntries(ctx1.order, paymentRecord);
    },
    ValidationError,
    'Unverified payment must be strictly rejected from ledger creation'
  );

  // Verify payment via server-side verification
  const verifyResult = await PaymentVerificationService.verifyPayment(
    {
      orderId: ctx1.order.id,
      providerReference: initResult.paymentIntentId!,
    },
    ctx1.advertiserUser
  );
  assert.strictEqual(verifyResult.isPaid, true);

  // Check ledger entries created automatically
  const ledgerEntries = db.getFinancialLedgerEntriesByOrderId(ctx1.order.id);
  assert.strictEqual(ledgerEntries.length, 6, 'Exactly 6 double-entry records must be created');

  // Check Entry 1: PAYMENT_RECEIVED
  const paymentEntry = ledgerEntries.find((e) => e.transactionType === 'PAYMENT_RECEIVED')!;
  assert.ok(paymentEntry, 'PAYMENT_RECEIVED entry must exist');
  assert.strictEqual(paymentEntry.direction, 'CREDIT');
  assert.strictEqual(paymentEntry.amountMinor, ctx1.snapshot.grandTotal.amountMinor);
  assert.strictEqual(paymentEntry.currency, 'INR');
  assert.strictEqual(paymentEntry.relatedParty.partyRole, 'ADVERTISER');
  assert.strictEqual(paymentEntry.orderId, ctx1.order.id);
  assert.strictEqual(paymentEntry.paymentId, paymentRecord.id);
  assert.ok(paymentEntry.publicId.startsWith('AB-FTX-'), 'Financial transaction ID must follow standard business format');
  assert.strictEqual(paymentEntry.reconciliationStatus, 'MATCHED');

  // Check Entry 2: SUPPLIER_PAYABLE_ACCRUAL
  const supplierEntry = ledgerEntries.find((e) => e.transactionType === 'SUPPLIER_PAYABLE_ACCRUAL')!;
  assert.ok(supplierEntry, 'SUPPLIER_PAYABLE_ACCRUAL entry must exist');
  assert.strictEqual(supplierEntry.direction, 'DEBIT');
  assert.strictEqual(supplierEntry.relatedParty.partyRole, 'SUPPLIER');
  assert.strictEqual(supplierEntry.amountMinor, 16000000, 'Supplier internal cost: ₹16 * 10,000 = 16000000 paise');

  // Check Entry 3: VENUE_COMPENSATION_ACCRUAL
  const venueEntry = ledgerEntries.find((e) => e.transactionType === 'VENUE_COMPENSATION_ACCRUAL')!;
  assert.ok(venueEntry, 'VENUE_COMPENSATION_ACCRUAL entry must exist');
  assert.strictEqual(venueEntry.direction, 'DEBIT');
  assert.strictEqual(venueEntry.relatedParty.partyRole, 'VENUE');
  // Eligible base: productPriceTotalMinor = 24500000 paise. 10% rate = 2450000 paise (₹24,500)
  assert.strictEqual(venueEntry.amountMinor, 2450000, 'Venue compensation: 10% of bottle advertising cost');

  // Check Entry 4: LOGISTICS_PAYABLE_ACCRUAL
  const logisticsEntry = ledgerEntries.find((e) => e.transactionType === 'LOGISTICS_PAYABLE_ACCRUAL')!;
  assert.ok(logisticsEntry, 'LOGISTICS_PAYABLE_ACCRUAL entry must exist');
  assert.strictEqual(logisticsEntry.direction, 'DEBIT');
  assert.strictEqual(logisticsEntry.relatedParty.partyRole, 'LOGISTICS_PARTNER');
  assert.strictEqual(logisticsEntry.amountMinor, 2000000, 'Logistics cost: ₹20,000 = 2000000 paise');

  // Check Entry 5: TAX_LIABILITY_ACCRUAL
  const taxEntry = ledgerEntries.find((e) => e.transactionType === 'TAX_LIABILITY_ACCRUAL')!;
  assert.ok(taxEntry, 'TAX_LIABILITY_ACCRUAL entry must exist');
  assert.strictEqual(taxEntry.direction, 'DEBIT');
  assert.strictEqual(taxEntry.relatedParty.partyRole, 'TAX_AUTHORITY');
  assert.strictEqual(taxEntry.amountMinor, ctx1.snapshot.taxes.totalTaxMinor);

  // Check Entry 6: PLATFORM_MARGIN_ACCRUAL
  const platformEntry = ledgerEntries.find((e) => e.transactionType === 'PLATFORM_MARGIN_ACCRUAL')!;
  assert.ok(platformEntry, 'PLATFORM_MARGIN_ACCRUAL entry must exist');
  assert.strictEqual(platformEntry.direction, 'CREDIT');
  assert.strictEqual(platformEntry.relatedParty.partyRole, 'PLATFORM');

  // Double-Entry Balance Check:
  const debitsAndMarginSum =
    supplierEntry.amountMinor +
    venueEntry.amountMinor +
    logisticsEntry.amountMinor +
    taxEntry.amountMinor +
    platformEntry.amountMinor;
  assert.strictEqual(paymentEntry.amountMinor, debitsAndMarginSum, 'Ledger must be completely balanced');

  // Check Venue Compensation Record
  const venueCompRecords = db.getVenueCompensationRecordsByOrderId(ctx1.order.id);
  assert.strictEqual(venueCompRecords.length, 1);
  const vcr = venueCompRecords[0];
  assert.strictEqual(vcr.eligibleSupplierBottleAdvertisingCostMinor, ctx1.snapshot.productPrice.productPriceTotalMinor);
  assert.strictEqual(vcr.compensationRatePercentage, 10.0);
  assert.strictEqual(vcr.cappedAtStatutoryLimit, false);
  assert.strictEqual(vcr.compensationAmountMinor, 2450000);
  assert.strictEqual(vcr.compensationStatus, 'ACCRUED');
  assert.strictEqual(vcr.exclusions.advertiserPlanFeeExcluded, true);
  assert.strictEqual(vcr.exclusions.logisticsExcluded, true);
  assert.strictEqual(vcr.exclusions.taxExcluded, true);

  console.log('✅ TEST 1 PASSED: Authoritative financial ledger created with balanced double-entry accounts.');

  // ------------------------------------------------------------------
  // TEST 2: DUPLICATE PAYMENT EVENT (IDEMPOTENCY)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 2: Duplicate Payment Event (Idempotency) ---');
  const orderUpdated = db.getOrderById(ctx1.order.id)!;
  const paymentUpdated = db.getPaymentById(paymentRecord.id)!;

  // Call ledger creation a second time (simulating duplicate webhook or retry)
  const duplicateResult = FinancialLedgerService.recordPaymentLedgerEntries(
    orderUpdated,
    paymentUpdated,
    { actorId: 'retry_attempt' }
  );
  assert.ok(duplicateResult.summary.isBalanced);

  // Assert no duplicate records were added
  const entriesAfterDuplicate = db.getFinancialLedgerEntriesByOrderId(ctx1.order.id);
  assert.strictEqual(
    entriesAfterDuplicate.length,
    6,
    'Zero duplicate ledger entries must be added on repeated/duplicate payment event'
  );

  const venueCompsAfterDuplicate = db.getVenueCompensationRecordsByOrderId(ctx1.order.id);
  assert.strictEqual(venueCompsAfterDuplicate.length, 1, 'Venue compensation record must remain exactly 1');

  console.log('✅ TEST 2 PASSED: Duplicate payment event safely ignored; ledger remains idempotent.');

  // ------------------------------------------------------------------
  // TEST 3: AMOUNT MISMATCH GUARD
  // ------------------------------------------------------------------
  console.log('\n--- TEST 3: Amount Mismatch Guard ---');
  const runId3 = `r3_${Date.now().toString(36)}`;
  const ctx3 = setupTestPipeline(runId3, 10.0);

  const initResult3 = await PaymentInitiationService.initiatePayment(
    { orderId: ctx3.order.id },
    ctx3.advertiserUser
  );

  // Attempt verification with an underpayment simulation
  let underpayBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: ctx3.order.id,
        providerReference: `pi_sim_${ctx3.order.id}_underpay`,
        simulationOverride: {
          status: 'SUCCEEDED',
          amountMinor: 10000000, // ₹1,00,000 instead of ₹3,12,700 (underpayment)
          currency: 'INR',
        },
      },
      ctx3.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Underpayment')) {
      underpayBlocked = true;
    }
  }
  assert.ok(underpayBlocked, 'Underpayment must be rejected with ValidationError');

  // Assert NO ledger entries exist for mismatched order
  const mismatchedEntries = db.getFinancialLedgerEntriesByOrderId(ctx3.order.id);
  assert.strictEqual(mismatchedEntries.length, 0, 'No ledger entries can exist for underpaid / unverified order');

  const mismatchedVenueComps = db.getVenueCompensationRecordsByOrderId(ctx3.order.id);
  assert.strictEqual(mismatchedVenueComps.length, 0, 'No venue compensation record can exist for unverified order');

  console.log('✅ TEST 3 PASSED: Amount mismatch strictly prevented ledger creation.');

  // ------------------------------------------------------------------
  // TEST 4: VENUE VISIBILITY & DATA ISOLATION
  // ------------------------------------------------------------------
  console.log('\n--- TEST 4: Venue Visibility & Isolation ---');

  // Venue requests its own compensation view
  const venueView = FinancialLedgerAuthorizationService.getVenueCompensationView(
    ctx1.order.id,
    ctx1.venueUser
  );

  // 1. Venue sees only permitted fields
  assert.strictEqual(venueView.orderPublicId, ctx1.order.publicId);
  assert.strictEqual(venueView.campaignName, ctx1.lockedAgreement.campaignName);
  assert.strictEqual(venueView.compensationStatus, 'ACCRUED');
  assert.strictEqual(venueView.compensationAmountFormatted, '₹24500.00');
  assert.strictEqual(venueView.currency, 'INR');
  assert.strictEqual(venueView.compensationRatePercentage, 10.0);

  // 2. Venue view STRICTLY OMITS sensitive platform / advertiser / supplier information
  assert.strictEqual((venueView as any).advertiserPaymentAmount, undefined);
  assert.strictEqual((venueView as any).paymentMethod, undefined);
  assert.strictEqual((venueView as any).advertiserTransactionDetails, undefined);
  assert.strictEqual((venueView as any).supplierInternalCost, undefined);
  assert.strictEqual((venueView as any).logisticsCost, undefined);
  assert.strictEqual((venueView as any).platformMargin, undefined);
  assert.strictEqual((venueView as any).taxes, undefined);

  // 3. Unauthorized access check: Unrelated user cannot view venue compensation
  assert.throws(
    () => {
      FinancialLedgerAuthorizationService.getVenueCompensationView(ctx1.order.id, ctx1.unauthorizedUser);
    },
    AuthorizationError,
    'Unrelated user must be blocked with 403 AuthorizationError'
  );

  // 4. Venue cannot view internal platform summary
  assert.throws(
    () => {
      FinancialLedgerAuthorizationService.getOrderLedgerSummary(ctx1.order.id, ctx1.venueUser);
    },
    AuthorizationError,
    'Venue must be blocked from viewing internal full ledger summary'
  );

  console.log('✅ TEST 4 PASSED: Venue visibility strictly isolated (zero sensitive data leaked).');

  // ------------------------------------------------------------------
  // TEST 5: SUPPLIER VISIBILITY & DATA ISOLATION
  // ------------------------------------------------------------------
  console.log('\n--- TEST 5: Supplier Visibility & Isolation ---');

  // Supplier requests their payable view
  const supplierView = FinancialLedgerAuthorizationService.getSupplierPayableView(
    ctx1.order.id,
    ctx1.supplierUser
  );

  assert.strictEqual(supplierView.orderPublicId, ctx1.order.publicId);
  assert.strictEqual(supplierView.quantity, 10000);
  assert.strictEqual(supplierView.payableAmountFormatted, '₹160000.00');
  assert.strictEqual(supplierView.settlementStatus, 'ACCRUED');

  // Supplier view STRICTLY OMITS venue compensation, advertiser payment, logistics cost, platform margin
  assert.strictEqual((supplierView as any).venueCompensation, undefined);
  assert.strictEqual((supplierView as any).advertiserPaymentAmount, undefined);
  assert.strictEqual((supplierView as any).logisticsCost, undefined);
  assert.strictEqual((supplierView as any).platformMargin, undefined);

  // Unauthorized access check
  assert.throws(
    () => {
      FinancialLedgerAuthorizationService.getSupplierPayableView(ctx1.order.id, ctx1.venueUser);
    },
    AuthorizationError,
    'Venue cannot view supplier payable details'
  );

  console.log('✅ TEST 5 PASSED: Supplier visibility strictly protected and isolated.');

  // ------------------------------------------------------------------
  // TEST 6: FINANCIAL TRANSACTION UNIQUENESS
  // ------------------------------------------------------------------
  console.log('\n--- TEST 6: Financial Transaction Uniqueness ---');

  const allEntries = db.getFinancialLedgerEntriesByOrderId(ctx1.order.id);
  const publicIds = allEntries.map((e) => e.publicId);
  const internalIds = allEntries.map((e) => e.id);

  const uniquePublicIds = new Set(publicIds);
  const uniqueInternalIds = new Set(internalIds);

  assert.strictEqual(uniquePublicIds.size, allEntries.length, 'Every public financial transaction ID must be unique');
  assert.strictEqual(uniqueInternalIds.size, allEntries.length, 'Every internal ledger ID must be unique');

  for (const entry of allEntries) {
    assert.ok(entry.publicId.startsWith('AB-FTX-'), `Public ID format must start with AB-FTX-: ${entry.publicId}`);
    assert.ok(entry.timestamp, 'Entry timestamp must exist');
    assert.ok(entry.sourceReference, 'Entry sourceReference must exist');
    assert.ok(entry.relatedParty.partyName, 'Entry relatedParty.partyName must exist');
  }

  console.log('✅ TEST 6 PASSED: Unique, immutable transaction IDs generated for all ledger entries.');

  // ------------------------------------------------------------------
  // TEST 7: COMPENSATION CALCULATION BOUNDARIES (12.5% STATUTORY CAP & EXCLUSIONS)
  // ------------------------------------------------------------------
  console.log('\n--- TEST 7: Compensation Calculation Boundaries ---');

  // 7A: Direct Engine Boundary & Statutory Cap Test
  const directCapCheck = FinancialLedgerEngine.calculateVenueCompensation(
    24500000, // ₹2,45,000 eligible bottle advertising cost (paise)
    16.5,     // 16.5% attempted rate (> statutory maximum 12.5%)
    12.5      // 12.5% statutory cap
  );
  assert.strictEqual(directCapCheck.effectiveCompensationRate, 12.5, 'Attempted 16.5% rate must be capped at 12.5%');
  assert.strictEqual(directCapCheck.cappedAtStatutoryLimit, true, 'cappedAtStatutoryLimit must be true');
  assert.strictEqual(directCapCheck.compensationAmountMinor, 3062500, '12.5% of ₹2,45,000 = ₹30,625.00 (3062500 paise)');
  assert.strictEqual(directCapCheck.compensationAmountFormatted, '₹30625.00');

  // Direct Engine Zero Rate Boundary Test
  const directZeroCheck = FinancialLedgerEngine.calculateVenueCompensation(
    24500000,
    0.0,
    12.5
  );
  assert.strictEqual(directZeroCheck.effectiveCompensationRate, 0.0);
  assert.strictEqual(directZeroCheck.compensationAmountMinor, 0);

  // 7B: End-to-End Pipeline Scenario: Maximum Allowable Statutory Rate (12.5%)
  const runId7A = `r7a_${Date.now().toString(36)}`;
  const ctx7A = setupTestPipeline(runId7A, 12.5);

  const init7A = await PaymentInitiationService.initiatePayment(
    { orderId: ctx7A.order.id },
    ctx7A.advertiserUser
  );
  await PaymentVerificationService.verifyPayment(
    { orderId: ctx7A.order.id, providerReference: init7A.paymentIntentId! },
    ctx7A.advertiserUser
  );

  const vcr7A = db.getVenueCompensationRecordsByOrderId(ctx7A.order.id)[0];
  assert.ok(vcr7A);
  assert.strictEqual(vcr7A.compensationRatePercentage, 12.5, 'Rate must equal statutory maximum of 12.5%');
  // Base is strictly productPriceTotalMinor (₹2,45,000 = 24500000 paise)
  // 12.5% of 24500000 paise = 3062500 paise (₹30,625.00)
  assert.strictEqual(vcr7A.eligibleSupplierBottleAdvertisingCostMinor, 24500000);
  assert.strictEqual(vcr7A.compensationAmountMinor, 3062500);
  assert.strictEqual(vcr7A.compensationAmountFormatted, '₹30625.00');

  // 7C: End-to-End Pipeline Scenario: Rate below cap (8.0%)
  const runId7B = `r7b_${Date.now().toString(36)}`;
  const ctx7B = setupTestPipeline(runId7B, 8.0);

  const init7B = await PaymentInitiationService.initiatePayment(
    { orderId: ctx7B.order.id },
    ctx7B.advertiserUser
  );
  await PaymentVerificationService.verifyPayment(
    { orderId: ctx7B.order.id, providerReference: init7B.paymentIntentId! },
    ctx7B.advertiserUser
  );

  const vcr7B = db.getVenueCompensationRecordsByOrderId(ctx7B.order.id)[0];
  assert.ok(vcr7B);
  assert.strictEqual(vcr7B.compensationRatePercentage, 8.0);
  assert.strictEqual(vcr7B.cappedAtStatutoryLimit, false);

  // 8.0% of 24500000 paise = 1960000 paise (₹19,600.00)
  assert.strictEqual(vcr7B.compensationAmountMinor, 1960000);
  assert.strictEqual(vcr7B.compensationAmountFormatted, '₹19600.00');

  // Exclusions Check:
  // Base does NOT include logistics cost (₹20,000), taxes (₹47,700), or plan fee
  assert.notStrictEqual(vcr7B.eligibleSupplierBottleAdvertisingCostMinor, ctx7B.snapshot.grandTotal.amountMinor);
  assert.strictEqual(
    vcr7B.eligibleSupplierBottleAdvertisingCostMinor,
    ctx7B.snapshot.productPrice.productPriceTotalMinor,
    'Base must be strictly productPriceTotalMinor'
  );

  console.log('✅ TEST 7 PASSED: 12.5% statutory cap and base exclusions strictly enforced.');

  console.log('\n================================================================');
  console.log('ALL STEP 12E TESTS COMPLETED SUCCESSFULLY! 🚀');
  console.log('================================================================\n');
}

runStep12ETests().catch((err) => {
  console.error('FATAL TEST RUNNER ERROR:', err);
  process.exit(1);
});
