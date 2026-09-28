/**
 * AQUABLOOM STEP 12C: SERVER-SIDE PAYMENT VERIFICATION TEST SUITE
 * 
 * Verifies:
 * 1. Successful payment verification:
 *    - Server validates provider reference authenticity, amount, currency, order, payment, provider status.
 *    - Verified amount strictly equals OrderPricingSnapshot.grandTotal.
 *    - Payment = PAID only after successful server-side verification.
 *    - Production is not yet implemented.
 * 2. Failed payment:
 *    - Record failure status, provider reference, failure reason, timestamp.
 *    - Allow retry where appropriate.
 * 3. Wrong amount:
 *    - Underpayment: Do not mark PAID. Set appropriate failure/reconciliation state (UNDERPAID_FLAGGED).
 *    - Overpayment: Do not silently treat as normal payment. Flag for reconciliation (OVERPAID_RECONCILIATION_FLAGGED).
 *      Do not invent refund behavior here.
 * 4. Wrong currency:
 *    - Mismatched currency (e.g. USD instead of INR) rejected and flagged as failed.
 * 5. Invalid provider reference:
 *    - Unrecognized/non-existent transaction reference rejected.
 * 6. Duplicate verification:
 *    - Idempotent return without altering state or double counting.
 * 7. Unauthorized verification:
 *    - Strict counterparty isolation (unrelated advertiser, supplier, venue, logistics blocked with 403).
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
  FailingSimulatedProvider,
} from '../src/server/paymentInitiationServices.js';
import { generateBusinessId } from '../src/lib/idGenerator.js';
import { AuthorizationError, ValidationError, NotFoundError } from '../src/lib/errors.js';
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
  Payment,
  PaymentAttempt,
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
  snapshot: OrderPricingSnapshot;
  productId: string;
}

function setupTestPipeline(customRunId: string): TestContext {
  const nowIso = new Date().toISOString();

  // 1. Users
  const advertiserUser: User = {
    id: `usr_adv_12c_${customRunId}`,
    publicAccountId: `AB-ADV-12C-${customRunId}`,
    contactName: 'Sarah Jenkins',
    email: `advertiser_12c_${customRunId}@aurabev.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Beverages India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_12c_${customRunId}`,
    publicAccountId: `AB-VEN-12C-${customRunId}`,
    contactName: 'Vikram Mehta',
    email: `venue_12c_${customRunId}@mumbaicentre.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Mumbai Convention Centre',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_12c_${customRunId}`,
    publicAccountId: `AB-SUP-12C-${customRunId}`,
    contactName: 'Rajesh Sharma',
    email: `supplier_12c_${customRunId}@punebottlers.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'Pune Eco Bottlers Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_12c_${customRunId}`,
    publicAccountId: `AB-LOG-12C-${customRunId}`,
    contactName: 'Anita Rao',
    email: `logistics_12c_${customRunId}@swiftindia.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'Swift India Freight Express',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_12c_${customRunId}`,
    publicAccountId: `AB-ADM-12C-${customRunId}`,
    contactName: 'Devon Vance',
    email: `admin_12c_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Technologies India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const externalAdvertiser: User = {
    id: `usr_ext_adv_12c_${customRunId}`,
    publicAccountId: `AB-ADV-EXT-${customRunId}`,
    contactName: 'Unrelated Advertiser',
    email: `unrelated_12c_${customRunId}@competitor.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Unrelated Competitor Pvt Ltd',
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
    } as any,
    adminUser.id
  );

  // 4. Campaign
  const campaign: any = {
    id: `cmp_12c_${customRunId}`,
    publicCampaignId: `AB-CMP-12C-${customRunId}`,
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
    id: `prp_12c_${customRunId}`,
    publicProposalId: `AB-PRP-12C-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_12c_${customRunId}`,
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
  const agreementId = `cag_12c_${customRunId}`;
  const agreementPublicId = `AB-CAG-12C-${customRunId}`;
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
    currentVersionId: `cgv_12c_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-12C-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-12C-${customRunId}`,
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

  // 11. Step 11B Order Creation (creates Order and automatically creates & freezes OrderPricingSnapshot)
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_12c_${customRunId}` },
    advertiserUser
  );

  const snapshot = db.getOrderPricingSnapshotByOrderId(order.id)!;

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
    snapshot,
    productId: product.id,
  };
}

async function runStep12CTests() {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 12C: SERVER-SIDE PAYMENT VERIFICATION');
  console.log('=============================================================');

  const runId = Math.random().toString(36).substring(2, 8);
  const ctx = setupTestPipeline(runId);
  const { order, advertiserUser, externalAdvertiser, supplierUser, venueUser, adminUser, snapshot } = ctx;

  console.log(`✅ Test Order prepared: ${order.publicId} (Status: ${order.status})`);
  console.log(`✅ Authoritative snapshot grand total: ₹${(snapshot.grandTotal.amountMinor / 100).toFixed(2)} (${snapshot.grandTotal.amountMinor} paise)`);

  // Ensure default simulated provider is registered
  PaymentProviderRegistry.register(new SimulatedPaymentProvider());
  PaymentProviderRegistry.register(new FailingSimulatedProvider());

  // -------------------------------------------------------------
  // TEST 1: SUCCESSFUL PAYMENT VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Successful Payment Verification ---');
  
  // 1A. Initiate Payment First
  const initiationResult = await PaymentInitiationService.initiatePayment(
    { orderId: order.id },
    advertiserUser
  );
  assert.ok(initiationResult.paymentId, 'Payment must be initiated');
  assert.strictEqual(initiationResult.paymentStatus, 'REQUIRES_PAYMENT_METHOD');
  assert.strictEqual(initiationResult.authoritativeAmount.amountMinor, snapshot.grandTotal.amountMinor);

  // Verify DB state prior to verification
  let paymentBeforeVerify = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentBeforeVerify.status, 'REQUIRES_PAYMENT_METHOD');
  assert.strictEqual(paymentBeforeVerify.paidAt, undefined);

  // 1B. Server-Side Verification with Valid Provider Reference
  const validProviderRef = initiationResult.paymentIntentId!;
  const verificationResult = await PaymentVerificationService.verifyPayment(
    {
      orderId: order.id,
      providerReference: validProviderRef,
    },
    advertiserUser
  );

  assert.strictEqual(verificationResult.isPaid, true, 'Payment must be marked as isPaid=true');
  assert.strictEqual(verificationResult.paymentStatus, 'PAID', 'Payment status must be PAID');
  assert.strictEqual(verificationResult.orderStatus, 'PAID', 'Order status must be updated to PAID');
  assert.strictEqual(
    verificationResult.verifiedAmount.amountMinor,
    snapshot.grandTotal.amountMinor,
    'Verified amount must strictly equal OrderPricingSnapshot.grandTotal'
  );
  assert.strictEqual(verificationResult.verifiedAmount.currency, 'INR', 'Currency must be INR');
  assert.strictEqual(verificationResult.providerReference, validProviderRef, 'Provider reference must match');
  assert.strictEqual(verificationResult.reconciliationRequired, false, 'No reconciliation required for exact match');

  // Verify DB persistence of PAID state
  const paymentAfterVerify = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentAfterVerify.status, 'PAID', 'Database payment record must be marked PAID');
  assert.ok(paymentAfterVerify.paidAt, 'paidAt timestamp must be recorded');
  assert.ok(paymentAfterVerify.verifiedAt, 'verifiedAt timestamp must be recorded');
  assert.strictEqual(paymentAfterVerify.verifiedBy, advertiserUser.id);
  assert.strictEqual(paymentAfterVerify.providerTransactionReference, validProviderRef);

  const updatedOrder = db.getOrderById(order.id)!;
  assert.strictEqual(updatedOrder.status, 'PAID', 'Database order must be marked PAID');
  // Confirm production is NOT yet implemented or triggered
  assert.notStrictEqual(updatedOrder.status, 'READY_FOR_FULFILLMENT');

  const attempts = db.getPaymentAttemptsByOrderId(order.id);
  assert.strictEqual(attempts.length, 1, 'Single attempt created');
  assert.strictEqual(attempts[0].status, 'SUCCESS', 'PaymentAttempt must be marked SUCCESS');
  assert.strictEqual(attempts[0].verifiedAmountMinor, snapshot.grandTotal.amountMinor);

  console.log('✅ TEST 1 PASSED: Valid server-side verification completed; Payment = PAID, Order = PAID.');

  // -------------------------------------------------------------
  // TEST 2: DUPLICATE VERIFICATION (IDEMPOTENCY)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Duplicate Verification (Idempotency) ---');

  const duplicateResult = await PaymentVerificationService.verifyPayment(
    {
      orderId: order.id,
      providerReference: validProviderRef,
    },
    advertiserUser
  );

  assert.strictEqual(duplicateResult.isPaid, true);
  assert.strictEqual(duplicateResult.paymentStatus, 'PAID');
  assert.strictEqual(duplicateResult.reconciliationRequired, false);
  assert.ok(
    duplicateResult.message.includes('Idempotent') || duplicateResult.message.includes('already been successfully verified'),
    'Duplicate verification must return idempotent success message'
  );

  // Attempts count must not have increased
  const attemptsAfterDuplicate = db.getPaymentAttemptsByOrderId(order.id);
  assert.strictEqual(attemptsAfterDuplicate.length, 1, 'Duplicate verification must not create new attempts');

  console.log('✅ TEST 2 PASSED: Duplicate verification safely returned idempotent success without altering state.');

  // -------------------------------------------------------------
  // TEST 3: FAILED PAYMENT (GATEWAY DECLINE / ERROR)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Failed Payment Handling ---');

  const failedRunId = Math.random().toString(36).substring(2, 8);
  const failCtx = setupTestPipeline(failedRunId);
  const failOrder = failCtx.order;

  // Initiate payment
  const failInitiation = await PaymentInitiationService.initiatePayment(
    { orderId: failOrder.id },
    failCtx.advertiserUser
  );

  // Trigger simulated provider failure (card declined)
  let failureCaught = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: failOrder.id,
        providerReference: 'pi_sim_fail_card_declined_123',
      },
      failCtx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('declined')) {
      failureCaught = true;
    }
  }

  assert.ok(failureCaught, 'Failed payment gateway response must throw ValidationError');

  // Verify failure status recorded in DB
  const failedPaymentRecord = db.getPaymentByOrderId(failOrder.id)!;
  assert.strictEqual(failedPaymentRecord.status, 'FAILED', 'Payment status must be recorded as FAILED');
  assert.ok(failedPaymentRecord.failedAt, 'failedAt timestamp must be recorded');
  assert.ok(failedPaymentRecord.lastFailureReason, 'failure reason must be recorded');
  assert.ok(failedPaymentRecord.lastFailureReason.includes('declined'), 'declined reason must be detailed');
  assert.strictEqual(failedPaymentRecord.paidAt, undefined, 'Payment must NOT be marked PAID');

  const failAttempts = db.getPaymentAttemptsByOrderId(failOrder.id);
  assert.strictEqual(failAttempts[0].status, 'FAILED', 'Attempt status must be marked FAILED');
  assert.ok(failAttempts[0].failureReason);

  // Order remains payable (DO NOT mark PAID)
  const failOrderDb = db.getOrderById(failOrder.id)!;
  assert.strictEqual(failOrderDb.status, 'PAYMENT_REQUIRED', 'Order remains payable (PAYMENT_REQUIRED) after failure');

  console.log('✅ TEST 3 PASSED: Failed payment properly recorded; status=FAILED, failureReason, timestamp stored; Order remains payable.');

  // -------------------------------------------------------------
  // TEST 4: WRONG AMOUNT - UNDERPAYMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Wrong Amount - Underpayment ---');

  const underpayRunId = Math.random().toString(36).substring(2, 8);
  const underpayCtx = setupTestPipeline(underpayRunId);
  const underpayOrder = underpayCtx.order;
  const expectedPaise = underpayCtx.snapshot.grandTotal.amountMinor;
  const underpaidPaise = expectedPaise - 50000; // ₹500 less

  await PaymentInitiationService.initiatePayment(
    { orderId: underpayOrder.id },
    underpayCtx.advertiserUser
  );

  let underpayBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: underpayOrder.id,
        providerReference: `pi_sim_${underpayOrder.id}_underpay`,
        simulationOverride: {
          status: 'SUCCEEDED',
          amountMinor: underpaidPaise,
          currency: 'INR',
        },
      },
      underpayCtx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Underpayment')) {
      underpayBlocked = true;
    }
  }

  assert.ok(underpayBlocked, 'Underpayment must be rejected with ValidationError');

  // Verify DB state: Do NOT mark PAID; set reconciliation state
  const underpaidPayment = db.getPaymentByOrderId(underpayOrder.id)!;
  assert.strictEqual(underpaidPayment.status, 'UNDERPAID_FLAGGED', 'Payment must be UNDERPAID_FLAGGED');
  assert.strictEqual(underpaidPayment.reconciliationStatus, 'UNDERPAID_FLAGGED');
  assert.ok(underpaidPayment.reconciliationNotes?.includes('Underpayment'));
  assert.strictEqual(underpaidPayment.discrepancyDetails?.expectedAmountMinor, expectedPaise);
  assert.strictEqual(underpaidPayment.discrepancyDetails?.receivedAmountMinor, underpaidPaise);
  assert.strictEqual(underpaidPayment.paidAt, undefined, 'Underpaid payment must NOT have paidAt timestamp');

  const underpayOrderDb = db.getOrderById(underpayOrder.id)!;
  assert.strictEqual(underpayOrderDb.status, 'PAYMENT_REQUIRED', 'Order must NOT be marked PAID on underpayment');

  console.log('✅ TEST 4 PASSED: Underpayment rejected; Payment flagged as UNDERPAID_FLAGGED, discrepancy recorded, not marked PAID.');

  // -------------------------------------------------------------
  // TEST 5: WRONG AMOUNT - OVERPAYMENT
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Wrong Amount - Overpayment ---');

  const overpayRunId = Math.random().toString(36).substring(2, 8);
  const overpayCtx = setupTestPipeline(overpayRunId);
  const overpayOrder = overpayCtx.order;
  const overpaidPaise = overpayCtx.snapshot.grandTotal.amountMinor + 100000; // ₹1,000 extra

  await PaymentInitiationService.initiatePayment(
    { orderId: overpayOrder.id },
    overpayCtx.advertiserUser
  );

  let overpayBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: overpayOrder.id,
        providerReference: `pi_sim_${overpayOrder.id}_overpay`,
        simulationOverride: {
          status: 'SUCCEEDED',
          amountMinor: overpaidPaise,
          currency: 'INR',
        },
      },
      overpayCtx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Overpayment')) {
      overpayBlocked = true;
    }
  }

  assert.ok(overpayBlocked, 'Overpayment must be flagged and rejected with ValidationError');

  // Verify DB state: Do NOT silently treat as normal payment. Flag for reconciliation.
  const overpaidPayment = db.getPaymentByOrderId(overpayOrder.id)!;
  assert.strictEqual(overpaidPayment.status, 'OVERPAID_RECONCILIATION_FLAGGED', 'Payment status must be OVERPAID_RECONCILIATION_FLAGGED');
  assert.strictEqual(overpaidPayment.reconciliationStatus, 'OVERPAID_FLAGGED');
  assert.ok(overpaidPayment.reconciliationNotes?.includes('Overpayment'));
  assert.strictEqual(overpaidPayment.discrepancyDetails?.expectedAmountMinor, overpayCtx.snapshot.grandTotal.amountMinor);
  assert.strictEqual(overpaidPayment.discrepancyDetails?.receivedAmountMinor, overpaidPaise);
  assert.strictEqual(overpaidPayment.paidAt, undefined, 'Overpaid payment must NOT be marked PAID');

  const overpayOrderDb = db.getOrderById(overpayOrder.id)!;
  assert.strictEqual(overpayOrderDb.status, 'PAYMENT_REQUIRED', 'Order must NOT be marked PAID on overpayment');

  console.log('✅ TEST 5 PASSED: Overpayment flagged for reconciliation; not silently treated as normal payment, no refund invented.');

  // -------------------------------------------------------------
  // TEST 6: WRONG CURRENCY
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Wrong Currency Validation ---');

  const currencyRunId = Math.random().toString(36).substring(2, 8);
  const currencyCtx = setupTestPipeline(currencyRunId);
  const currencyOrder = currencyCtx.order;

  await PaymentInitiationService.initiatePayment(
    { orderId: currencyOrder.id },
    currencyCtx.advertiserUser
  );

  let currencyBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: currencyOrder.id,
        providerReference: `pi_sim_${currencyOrder.id}_currency`,
        simulationOverride: {
          status: 'SUCCEEDED',
          amountMinor: currencyCtx.snapshot.grandTotal.amountMinor,
          currency: 'USD', // Wrong currency!
        },
      },
      currencyCtx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Currency mismatch')) {
      currencyBlocked = true;
    }
  }

  assert.ok(currencyBlocked, 'Currency mismatch must be rejected with ValidationError');

  const currencyPayment = db.getPaymentByOrderId(currencyOrder.id)!;
  assert.strictEqual(currencyPayment.status, 'FAILED');
  assert.ok(currencyPayment.lastFailureReason?.includes('Currency mismatch'));

  console.log('✅ TEST 6 PASSED: Wrong currency strictly rejected; status recorded as FAILED.');

  // -------------------------------------------------------------
  // TEST 7: INVALID PROVIDER REFERENCE
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Invalid Provider Reference ---');

  const invalidRefRunId = Math.random().toString(36).substring(2, 8);
  const invalidRefCtx = setupTestPipeline(invalidRefRunId);
  const invalidRefOrder = invalidRefCtx.order;

  await PaymentInitiationService.initiatePayment(
    { orderId: invalidRefOrder.id },
    invalidRefCtx.advertiserUser
  );

  let invalidRefBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: invalidRefOrder.id,
        providerReference: 'invalid_provider_ref',
      },
      invalidRefCtx.advertiserUser
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('not found on payment gateway')) {
      invalidRefBlocked = true;
    }
  }

  assert.ok(invalidRefBlocked, 'Invalid provider reference must be rejected with ValidationError');

  console.log('✅ TEST 7 PASSED: Invalid provider reference strictly caught and rejected.');

  // -------------------------------------------------------------
  // TEST 8: UNAUTHORIZED VERIFICATION & COUNTERPARTY ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Unauthorized Verification Isolation ---');

  const authRunId = Math.random().toString(36).substring(2, 8);
  const authCtx = setupTestPipeline(authRunId);
  const authOrder = authCtx.order;

  await PaymentInitiationService.initiatePayment(
    { orderId: authOrder.id },
    authCtx.advertiserUser
  );

  // 8A. Unrelated External Advertiser Blocked
  let externalAdvBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: authOrder.id,
        providerReference: `pi_sim_${authOrder.id}_auth`,
      },
      authCtx.externalAdvertiser
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      externalAdvBlocked = true;
    }
  }
  assert.ok(externalAdvBlocked, 'External advertiser must be blocked with 403');

  // 8B. Supplier Blocked
  let supplierBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: authOrder.id,
        providerReference: `pi_sim_${authOrder.id}_auth`,
      },
      authCtx.supplierUser
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      supplierBlocked = true;
    }
  }
  assert.ok(supplierBlocked, 'Supplier must be blocked with 403');

  // 8C. Venue Blocked
  let venueBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: authOrder.id,
        providerReference: `pi_sim_${authOrder.id}_auth`,
      },
      authCtx.venueUser
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      venueBlocked = true;
    }
  }
  assert.ok(venueBlocked, 'Venue must be blocked with 403');

  // 8D. Logistics Partner Blocked
  let logisticsBlocked = false;
  try {
    await PaymentVerificationService.verifyPayment(
      {
        orderId: authOrder.id,
        providerReference: `pi_sim_${authOrder.id}_auth`,
      },
      authCtx.logisticsPartner
    );
  } catch (err: any) {
    if (err instanceof AuthorizationError && err.statusCode === 403) {
      logisticsBlocked = true;
    }
  }
  assert.ok(logisticsBlocked, 'Logistics partner must be blocked with 403');

  // 8E. Platform Admin is Permitted
  const adminVerified = await PaymentVerificationService.verifyPayment(
    {
      orderId: authOrder.id,
      providerReference: `pi_sim_${authOrder.id}_admin_auth`,
    },
    authCtx.adminUser
  );
  assert.strictEqual(adminVerified.isPaid, true);
  assert.strictEqual(adminVerified.paymentStatus, 'PAID');

  console.log('✅ TEST 8 PASSED: Strict counterparty isolation verified (unauthorized advertisers, suppliers, venues, logistics blocked; Admin authorized).');

  console.log('\n=============================================================');
  console.log('ALL STEP 12C TESTS COMPLETED SUCCESSFULLY! 🚀');
  console.log('=============================================================');
}

runStep12CTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
