/**
 * AQUABLOOM STEP 12B: ADVERTISER PAYMENT INITIATION TEST SUITE
 * 
 * Verifies:
 * 1. Valid initiation (Entry conditions: Order = PAYMENT_REQUIRED, OrderPricingSnapshot exists & valid, Advertiser owns Order)
 * 2. Authoritative amount retrieved strictly from OrderPricingSnapshot.grandTotal (paise / minor units)
 * 3. Provider abstraction interface (createPaymentIntent independent of provider)
 * 4. Duplicate click / repeated initiation (reused single Payment record, separate PaymentAttempts)
 * 5. Altered / tampered amount rejected
 * 6. Altered / tampered currency rejected
 * 7. Wrong advertiser rejected (unauthorized counterparty / other advertiser isolation)
 * 8. Wrong order state rejected (e.g. DRAFT, CANCELLED, etc.)
 * 9. Missing snapshot rejected
 * 10. Repeated retry on failure (failure recorded, Payment remains unpaid, Order remains payable, retry creates subsequent PaymentAttempt)
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
  PaymentProviderRegistry,
  SimulatedPaymentProvider,
  FailingSimulatedProvider,
} from '../src/server/paymentInitiationServices.js';
import { generateBusinessId } from '../src/lib/idGenerator.js';
import { AuthorizationError, ValidationError, ConflictError } from '../src/lib/errors.js';
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
  externalAdvertiser: User;
  order: Order;
  orderReadiness: OrderReadiness;
  supplierAssignment: SupplierAssignment;
  logisticsAssignment: LogisticsAssignment;
  lockedAgreement: CampaignAgreement;
  agreementSnapshot: CampaignAgreementSnapshot;
  pricingResult: FinalPricingCalculationResult;
  productId: string;
}

function setupTestPipeline(customRunId: string): TestContext {
  const nowIso = new Date().toISOString();

  // 1. Users
  const advertiserUser: User = {
    id: `usr_adv_12b_${customRunId}`,
    publicAccountId: `AB-ADV-12B-${customRunId}`,
    contactName: 'Sarah Jenkins',
    email: `advertiser_12b_${customRunId}@aurabev.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Beverages India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_12b_${customRunId}`,
    publicAccountId: `AB-VEN-12B-${customRunId}`,
    contactName: 'Vikram Mehta',
    email: `venue_12b_${customRunId}@mumbaicentre.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Mumbai Convention Centre',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_12b_${customRunId}`,
    publicAccountId: `AB-SUP-12B-${customRunId}`,
    contactName: 'Rajesh Sharma',
    email: `supplier_12b_${customRunId}@punebottlers.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'Pune Eco Bottlers Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_12b_${customRunId}`,
    publicAccountId: `AB-LOG-12B-${customRunId}`,
    contactName: 'Anita Rao',
    email: `logistics_12b_${customRunId}@swiftindia.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'Swift India Freight Express',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_12b_${customRunId}`,
    publicAccountId: `AB-ADM-12B-${customRunId}`,
    contactName: 'Devon Vance',
    email: `admin_12b_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Global Operations',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const externalAdvertiser: User = {
    id: `usr_adv_oth_12b_${customRunId}`,
    publicAccountId: `AB-ADV-OTH-12B-${customRunId}`,
    contactName: 'Michael Chang',
    email: `external_12b_${customRunId}@otherbrand.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'External Brand Global Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  db.saveUser(advertiserUser);
  db.saveUser(venueUser);
  db.saveUser(supplierUser);
  db.saveUser(logisticsPartner);
  db.saveUser(adminUser);
  db.saveUser(externalAdvertiser);

  // 2. Profiles
  const advProfile: any = {
    userId: advertiserUser.id,
    role: 'ADVERTISER',
    brandName: 'Aura Beverages',
    companyName: 'Aura Beverages India Pvt Ltd',
    billingAddress: {
      street: '100 Marine Drive',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400020',
      country: 'India',
    },
    contactPerson: { name: 'Sarah Jenkins', role: 'Head of Marketing' },
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(advertiserUser.id, advProfile, adminUser.id);

  const venProfile: any = {
    userId: venueUser.id,
    role: 'VENUE',
    venueName: 'Mumbai Convention Centre',
    venueType: 'Convention Center',
    address: {
      streetAddress: 'Bandra Kurla Complex, Bandra East',
      city: 'Mumbai',
      stateRegion: 'Maharashtra',
      country: 'India',
      postalCode: '400051',
    },
    location: {
      address: 'Bandra Kurla Complex, Bandra East',
      city: 'Mumbai',
      state: 'Maharashtra',
      stateRegion: 'Maharashtra',
      country: 'India',
      postalCode: '400051',
    },
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(venueUser.id, venProfile, adminUser.id);

  const supProfile: any = {
    userId: supplierUser.id,
    role: 'SUPPLIER',
    businessName: 'Pune Eco Bottlers Pvt Ltd',
    facility: {
      facilityName: 'Pune Eco Bottling Facility',
      city: 'Pune',
      state: 'Maharashtra',
      stateRegion: 'Maharashtra',
      country: 'India',
      address: 'Plot 42 Chakan MIDC',
      postalCode: '410501',
    },
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(supplierUser.id, supProfile, adminUser.id);

  const logProfile: any = {
    userId: logisticsPartner.id,
    role: 'LOGISTICS_PARTNER',
    businessName: 'Swift India Freight Express',
    approvalStatus: 'APPROVED',
    completion: { percentage: 100, isComplete: true, lastCalculatedAt: nowIso },
  };
  db.saveProfile(logisticsPartner.id, logProfile, adminUser.id);

  db.updateApprovalStatus(supplierUser.id, 'APPROVED', adminUser.id, 'Verified bottling facility');
  db.updateApprovalStatus(logisticsPartner.id, 'APPROVED', adminUser.id, 'Verified freight fleet');

  // 3. Supplier Product (Unit Price: ₹24.50)
  const { product } = db.createProduct(
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
        capType: 'Screw Cap',
        bottleFinish: 'Matte White Powder Coat',
        finishingOptions: ['Matte White Powder Coat'],
        labelType: 'Direct Screen Print',
        printingCapability: 'Full CMYK',
        packagingConfiguration: '24 bottles per carton',
      },
      leadTime: { value: 14, unit: 'DAYS' },
      minimumOrderQuantity: 5000,
      customerFacingPrice: { amount: 24.5, currency: 'INR' },
      supplierInternalCost: { amount: 16.0, currency: 'INR' },
    },
    adminUser.id
  );

  // 4. Campaign
  const campaign: any = {
    id: `cmp_12b_${customRunId}`,
    publicCampaignId: `AB-CMP-12B-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Aura Maharashtra Q4 Launch',
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
    id: `prp_12b_${customRunId}`,
    publicProposalId: `AB-PRP-12B-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_12b_${customRunId}`,
    terms: {
      campaignQuantity: 10000,
      campaignDuration: { value: 4, unit: 'WEEKS' },
      preferredStartPeriod: { type: 'MONTH', label: 'November 2026' },
      productRequirements: { volumeMl: 500, bottleMaterial: 'Aluminum', labelType: 'Direct Screen Print' },
      distributionRequirements: { placementDetails: 'Lobby', estimatedDistributionPace: '2500/week', refrigerationRequired: false },
      placementRequirements: ['Registration'],
      collaborationRequirement: { status: 'NOT_REQUIRED' },
      venueCompensationTerms: {
        proposedPercentage: 10,
        termsDescription: '10% allowance',
        notes: '',
        eligibleBaseDescription: 'Supplier Cost',
        maximumCapPercentage: 12.5,
      },
      advertiserResponsibilities: ['Artwork'],
      venueResponsibilities: ['Placement'],
      aquaBloomResponsibilities: ['Logistics'],
      deliveryTermsKnown: {
        deliveryAddress: 'Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051',
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

  // 6. Agreement
  const agreementId = `cag_12b_${customRunId}`;
  const agreementPublicId = `AB-CAG-12B-${customRunId}`;
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
    currentVersionId: `cgv_12b_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-12B-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-12B-${customRunId}`,
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
      originAddress: 'Plot 42 Chakan MIDC, Pune, Maharashtra 410501',
      destinationAddress: 'Bandra Kurla Complex, Bandra East, Mumbai, Maharashtra 400051',
      vehicleType: 'TRUCK_MEDIUM',
      distanceKm: 145,
      deliveryWindowStart: '2026-11-01',
      deliveryWindowEnd: '2026-11-03',
      stagingInstructions: 'Gate 3 loading bay delivery only',
      refrigerationRequired: false,
      quotedLogisticsCost: 20000,
      finalNegotiatedLogisticsCost: 20000,
    },
    adminUser
  );
  const logisticsAssignmentResult = LogisticsOperationalOfferService.acceptOffer(
    logisticsOffer.id,
    { finalAgreedLogisticsCost: 20000 },
    logisticsPartner
  );
  const logisticsAssignment = logisticsAssignmentResult.assignment;

  // 10. Step 11A Final Pricing
  const pricingResult = FinalPricingEngine.calculateFinalPricing(validatedReadiness.id, adminUser);

  // 11. Step 11B Order Creation (creates Order and automatically creates & freezes OrderPricingSnapshot)
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_12b_${customRunId}` },
    advertiserUser
  );

  return {
    advertiserUser,
    venueUser,
    supplierUser,
    logisticsPartner,
    adminUser,
    externalAdvertiser,
    order,
    orderReadiness: validatedReadiness,
    supplierAssignment,
    logisticsAssignment,
    lockedAgreement: agreement,
    agreementSnapshot,
    pricingResult,
    productId: product.id,
  };
}

async function runStep12BTests(): Promise<void> {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 12B: ADVERTISER PAYMENT INITIATION');
  console.log('=============================================================');

  const runId = Math.random().toString(36).substring(2, 8);
  const ctx = setupTestPipeline(runId);

  const snapshot = db.getOrderPricingSnapshotByOrderId(ctx.order.id);
  assert(Boolean(snapshot), 'OrderPricingSnapshot must exist for the Order');
  const authoritativeMinor = snapshot!.grandTotal.amountMinor;
  const authoritativeFormatted = snapshot!.grandTotal.amountFormatted;

  console.log(`✅ Order created successfully: ${ctx.order.publicId} (Status: ${ctx.order.status})`);
  console.log(`✅ Authoritative snapshot grand total: ${authoritativeFormatted} (${authoritativeMinor} paise)`);

  // =========================================================================
  // TEST 1: VALID INITIATION
  // =========================================================================
  console.log('\n--- TEST 1: Valid Payment Initiation ---');

  const initiationResult = await PaymentInitiationService.initiatePayment(
    { orderId: ctx.order.id },
    ctx.advertiserUser
  );

  assert(Boolean(initiationResult.paymentId), 'Payment ID must be generated');
  assert(Boolean(initiationResult.paymentPublicId), 'Payment public ID must be generated');
  assert(initiationResult.orderId === ctx.order.id, 'Payment must be associated with the Order');
  assert.strictEqual(initiationResult.orderStatus, 'PAYMENT_REQUIRED', 'Order must remain in PAYMENT_REQUIRED status');
  assert.strictEqual(initiationResult.paymentStatus, 'REQUIRES_PAYMENT_METHOD', 'Payment status must be REQUIRES_PAYMENT_METHOD');
  assert.strictEqual(initiationResult.authoritativeAmount.amountMinor, authoritativeMinor, 'Authoritative amount minor must match snapshot');
  assert.strictEqual(initiationResult.authoritativeAmount.amountFormatted, authoritativeFormatted, 'Authoritative amount formatted must match snapshot');
  assert.strictEqual(initiationResult.attemptNumber, 1, 'First initiation must be Attempt #1');
  assert.strictEqual(initiationResult.isReused, false, 'First initiation creates new payment record');
  assert(Boolean(initiationResult.paymentIntentId), 'Payment intent ID must be returned');

  // Verify DB state
  const savedPayment = db.getPaymentByOrderId(ctx.order.id);
  assert(Boolean(savedPayment), 'Payment record must be saved in database');
  assert.notStrictEqual(savedPayment!.status, 'PAID', 'Payment must NOT be marked PAID during initiation');
  assert.strictEqual(savedPayment!.amountMinor, authoritativeMinor, 'Saved payment amount must match authoritative snapshot');

  const savedAttempts = db.getPaymentAttemptsByOrderId(ctx.order.id);
  assert.strictEqual(savedAttempts.length, 1, 'Exactly one payment attempt should exist');
  assert.strictEqual(savedAttempts[0].status, 'PROCESSING', 'Attempt should be in PROCESSING state after intent created');
  assert.strictEqual(savedAttempts[0].amountMinor, authoritativeMinor, 'Attempt amount must match authoritative snapshot');

  console.log('✅ TEST 1 PASSED: Valid payment initiation completed with authoritative snapshot amount.');

  // =========================================================================
  // TEST 2: DUPLICATE CLICK / REPEATED INITIATION (REUSES PAYMENT RECORD)
  // =========================================================================
  console.log('\n--- TEST 2: Duplicate Click / Repeated Initiation ---');

  const duplicateResult = await PaymentInitiationService.initiatePayment(
    { orderId: ctx.order.id, idempotencyKey: 'idemp_click_2' },
    ctx.advertiserUser
  );

  assert.strictEqual(duplicateResult.paymentId, initiationResult.paymentId, 'Duplicate click must reuse the EXACT same Payment record');
  assert.strictEqual(duplicateResult.paymentPublicId, initiationResult.paymentPublicId, 'Public ID must match');
  assert.strictEqual(duplicateResult.isReused, true, 'isReused flag must be true');
  assert.strictEqual(duplicateResult.attemptNumber, 2, 'Legitimate retry click must create PaymentAttempt #2');

  const attemptsAfterSecond = db.getPaymentAttemptsByOrderId(ctx.order.id);
  assert.strictEqual(attemptsAfterSecond.length, 2, 'Should have exactly 2 PaymentAttempts for two initiation clicks');
  assert.strictEqual(attemptsAfterSecond[1].attemptNumber, 2, 'Second attempt must have attemptNumber = 2');

  const allPaymentsForOrder = db.getAllPayments().filter((p) => p.orderId === ctx.order.id);
  assert.strictEqual(allPaymentsForOrder.length, 1, 'MUST have exactly ONE Payment record for the Order');

  console.log('✅ TEST 2 PASSED: Duplicate click safely reused the single Payment record and created Attempt #2.');

  // =========================================================================
  // TEST 3: ALTERED / TAMPERED AMOUNT REJECTED
  // =========================================================================
  console.log('\n--- TEST 3: Altered Amount Tamper Protection ---');

  let tamperedAmountBlocked = false;
  try {
    // Malicious browser attempts to alter amount from ₹3,12,700 to ₹1.00 (100 paise)
    await PaymentInitiationService.initiatePayment(
      {
        orderId: ctx.order.id,
        clientProvidedAmountMinor: 100, // Tampered!
      },
      ctx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Tampered amount detected')) {
      tamperedAmountBlocked = true;
    }
  }

  assert(tamperedAmountBlocked, 'Altered client payment amount must be strictly rejected with ValidationError');

  // Verify DB payment amount remains intact
  const paymentAfterTamper = db.getPaymentByOrderId(ctx.order.id);
  assert.strictEqual(paymentAfterTamper!.amountMinor, authoritativeMinor, 'Payment record amount must NEVER be overwritten with tampered client amount');

  console.log('✅ TEST 3 PASSED: Tampered client payment amount was rejected and authoritative amount preserved.');

  // =========================================================================
  // TEST 4: ALTERED / TAMPERED CURRENCY REJECTED
  // =========================================================================
  console.log('\n--- TEST 4: Altered Currency Tamper Protection ---');

  let tamperedCurrencyBlocked = false;
  try {
    // Malicious attempt to change currency from INR to USD
    await PaymentInitiationService.initiatePayment(
      {
        orderId: ctx.order.id,
        clientProvidedCurrency: 'USD',
      },
      ctx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Currency mismatch')) {
      tamperedCurrencyBlocked = true;
    }
  }

  assert(tamperedCurrencyBlocked, 'Tampered currency must be strictly rejected');
  console.log('✅ TEST 4 PASSED: Tampered client currency was rejected.');

  // =========================================================================
  // TEST 5: WRONG ADVERTISER / COUNTERPARTY REJECTED
  // =========================================================================
  console.log('\n--- TEST 5: Wrong Advertiser & Counterparty Security Isolation ---');

  // 1. External Advertiser (not owning this Order)
  let rivalBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: ctx.order.id }, ctx.externalAdvertiser);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.message.includes('You do not own Order')) {
      rivalBlocked = true;
    }
  }
  assert(rivalBlocked, 'External advertiser must be blocked with 403 AuthorizationError');

  // 2. Supplier
  let supplierBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: ctx.order.id }, ctx.supplierUser);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.message.includes('SUPPLIER')) {
      supplierBlocked = true;
    }
  }
  assert(supplierBlocked, 'Supplier must be blocked from initiating order payment');

  // 3. Venue
  let venueBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: ctx.order.id }, ctx.venueUser);
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.message.includes('VENUE')) {
      venueBlocked = true;
    }
  }
  assert(venueBlocked, 'Venue must be blocked from initiating order payment');

  console.log('✅ TEST 5 PASSED: Strict counterparty isolation verified (unauthorized advertisers, suppliers, venues blocked).');

  // =========================================================================
  // TEST 6: WRONG ORDER STATE REJECTED
  // =========================================================================
  console.log('\n--- TEST 6: Wrong Order State Rejection ---');

  // Clone an order with DRAFT and CANCELLED status
  const draftOrderId = `ord_draft_${runId}`;
  const draftOrder: Order = {
    ...ctx.order,
    id: draftOrderId,
    publicId: generateBusinessId('AB-ORD-DRAFT'),
    status: 'DRAFT',
  };
  db.saveOrder(draftOrder);

  // Give draftOrder a snapshot
  const draftSnapshot: OrderPricingSnapshot = {
    ...snapshot!,
    id: `ops_draft_${runId}`,
    publicId: generateBusinessId('AB-OPS-DRAFT'),
    orderId: draftOrderId,
    orderPublicId: draftOrder.publicId,
  };
  db.saveOrderPricingSnapshot(draftSnapshot);

  let draftBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: draftOrderId }, ctx.advertiserUser);
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('DRAFT')) {
      draftBlocked = true;
    }
  }
  assert(draftBlocked, 'Orders in DRAFT status must be rejected');

  // Cancelled Order
  const cancelledOrderId = `ord_cancelled_${runId}`;
  const cancelledOrder: Order = {
    ...ctx.order,
    id: cancelledOrderId,
    publicId: generateBusinessId('AB-ORD-CANCELLED'),
    status: 'CANCELLED',
  };
  db.saveOrder(cancelledOrder);

  const cancelledSnapshot: OrderPricingSnapshot = {
    ...snapshot!,
    id: `ops_cancelled_${runId}`,
    publicId: generateBusinessId('AB-OPS-CANCELLED'),
    orderId: cancelledOrderId,
    orderPublicId: cancelledOrder.publicId,
  };
  db.saveOrderPricingSnapshot(cancelledSnapshot);

  let cancelledBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: cancelledOrderId }, ctx.advertiserUser);
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('CANCELLED')) {
      cancelledBlocked = true;
    }
  }
  assert(cancelledBlocked, 'Orders in CANCELLED status must be rejected');

  console.log('✅ TEST 6 PASSED: Non-payable order states (DRAFT, CANCELLED) strictly rejected.');

  // =========================================================================
  // TEST 7: MISSING SNAPSHOT REJECTED
  // =========================================================================
  console.log('\n--- TEST 7: Missing Pricing Snapshot Rejection ---');

  const noSnapshotOrderId = `ord_nosnap_${runId}`;
  const noSnapshotOrder: Order = {
    ...ctx.order,
    id: noSnapshotOrderId,
    publicId: generateBusinessId('AB-ORD-NOSNAP'),
    status: 'PAYMENT_REQUIRED',
  };
  db.saveOrder(noSnapshotOrder);
  // (Do NOT save a pricing snapshot for this order)

  let missingSnapshotBlocked = false;
  try {
    await PaymentInitiationService.initiatePayment({ orderId: noSnapshotOrderId }, ctx.advertiserUser);
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('missing')) {
      missingSnapshotBlocked = true;
    }
  }
  assert(missingSnapshotBlocked, 'Orders missing an OrderPricingSnapshot must be rejected');

  console.log('✅ TEST 7 PASSED: Missing pricing snapshot correctly rejected.');

  // =========================================================================
  // TEST 8: FAILURE HANDLING & REPEATED RETRY
  // =========================================================================
  console.log('\n--- TEST 8: Failure Handling & Repeated Retry ---');

  // Create a fresh test order for failure & retry testing
  const retryOrderId = `ord_retry_${runId}`;
  const retryOrder: Order = {
    ...ctx.order,
    id: retryOrderId,
    publicId: generateBusinessId('AB-ORD-RETRY'),
    status: 'PAYMENT_REQUIRED',
  };
  db.saveOrder(retryOrder);

  const retrySnapshot: OrderPricingSnapshot = {
    ...snapshot!,
    id: `ops_retry_${runId}`,
    publicId: generateBusinessId('AB-OPS-RETRY'),
    orderId: retryOrderId,
    orderPublicId: retryOrder.publicId,
  };
  db.saveOrderPricingSnapshot(retrySnapshot);

  // Attempt 1: Using FAILING_SIMULATED provider
  let failureThrown = false;
  try {
    await PaymentInitiationService.initiatePayment(
      {
        orderId: retryOrderId,
        providerPreference: 'FAILING_SIMULATED',
      },
      ctx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Payment initiation failed')) {
      failureThrown = true;
    }
  }
  assert(failureThrown, 'Provider failure must throw ValidationError to inform the client');

  // Verify system state after failure:
  // 1. Payment remains UNPAID (status = FAILED)
  const failedPayment = db.getPaymentByOrderId(retryOrderId);
  assert(Boolean(failedPayment), 'Payment record must be created and preserved on failure');
  assert.strictEqual(failedPayment!.status, 'FAILED', 'Payment status must be FAILED, not PAID');
  assert.strictEqual(failedPayment!.paidAt, undefined, 'paidAt must remain undefined');
  assert(Boolean(failedPayment!.lastFailureReason), 'Failure reason must be recorded on Payment record');

  // 2. Order remains payable (status = PAYMENT_REQUIRED, NOT marked PAID)
  const orderAfterFailure = db.getOrderById(retryOrderId);
  assert.strictEqual(orderAfterFailure!.status, 'PAYMENT_REQUIRED', 'Order must remain in PAYMENT_REQUIRED status');

  // 3. PaymentAttempt #1 recorded as FAILED
  const retryAttempts = db.getPaymentAttemptsByOrderId(retryOrderId);
  assert.strictEqual(retryAttempts.length, 1, 'Exactly one attempt should be recorded for the failed attempt');
  assert.strictEqual(retryAttempts[0].status, 'FAILED', 'Attempt #1 status must be FAILED');
  assert(Boolean(retryAttempts[0].failureReason), 'Attempt #1 failure reason must be preserved');

  // Attempt 2: Advertiser retries using working SIMULATED provider
  console.log('Initiating Retry (Attempt #2)...');
  const retrySuccess = await PaymentInitiationService.initiatePayment(
    {
      orderId: retryOrderId,
      providerPreference: 'SIMULATED',
    },
    ctx.advertiserUser
  );

  assert.strictEqual(retrySuccess.attemptNumber, 2, 'Retry must be recorded as Attempt #2');
  assert.strictEqual(retrySuccess.paymentId, failedPayment!.id, 'Retry must reuse the existing Payment record');
  assert.strictEqual(retrySuccess.paymentStatus, 'REQUIRES_PAYMENT_METHOD', 'Retry updates status to REQUIRES_PAYMENT_METHOD');

  const attemptsAfterRetry = db.getPaymentAttemptsByOrderId(retryOrderId);
  assert.strictEqual(attemptsAfterRetry.length, 2, 'Database must have exactly 2 attempts');
  assert.strictEqual(attemptsAfterRetry[0].status, 'FAILED', 'Attempt #1 remains FAILED');
  assert.strictEqual(attemptsAfterRetry[1].status, 'PROCESSING', 'Attempt #2 succeeded into PROCESSING');

  const finalPaymentRecord = db.getPaymentByOrderId(retryOrderId);
  assert.strictEqual(finalPaymentRecord!.attemptsCount, 2, 'Payment record attemptsCount must be 2');
  assert.strictEqual(finalPaymentRecord!.latestAttemptId, attemptsAfterRetry[1].id, 'latestAttemptId must point to Attempt #2');
  assert.notStrictEqual(finalPaymentRecord!.status, 'PAID', 'Payment still not PAID until webhook/confirmation');

  console.log('✅ TEST 8 PASSED: Failure handling and repeated retry verified: Payment remains unpaid, Order remains payable, attempts tracked independently.');

  console.log('\n=============================================================');
  console.log('ALL STEP 12B TESTS COMPLETED SUCCESSFULLY! 🚀');
  console.log('=============================================================');
}

runStep12BTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
