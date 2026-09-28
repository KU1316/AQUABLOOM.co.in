/**
 * AQUABLOOM STEP 12D: PAYMENT WEBHOOKS, IDEMPOTENCY & RECONCILIATION TEST SUITE
 * 
 * Verifies:
 * 1. duplicate webhook:
 *    - Processed at most once logically; returns EVENT_ALREADY_PROCESSED
 *    - Does NOT create duplicate Payment, duplicate PaymentAttempt, or duplicate fulfillment
 * 2. invalid signature:
 *    - Rejects invalid / forged HMAC-SHA256 signature with AuthenticationError (401)
 * 3. replayed event:
 *    - Rejects timestamps older than allowable tolerance (300s) as replay attacks
 *    - Rejects timestamps significantly in the future
 * 4. delayed event:
 *    - Delayed success event on an already PAID payment reconciles as MATCHED without state corruption
 *    - Out-of-order failure event on an already PAID payment is guarded: does NOT downgrade PAID state, flagged as PENDING_REVIEW
 * 5. wrong amount:
 *    - Underpayment detected, reconciliation state MISMATCHED, payment UNDERPAID_FLAGGED, NOT marked PAID
 *    - Overpayment detected, reconciliation state MISMATCHED, payment OVERPAID_RECONCILIATION_FLAGGED, NOT marked PAID
 * 6. wrong currency:
 *    - Mismatched currency (e.g. USD vs INR) detected, flagged as MISMATCHED, payment FAILED, NOT marked PAID
 * 7. payment reversal:
 *    - Provider reversal / chargeback / refund event transitions payment to REVERSED
 *    - Order revoked from PAID back to PAYMENT_REQUIRED to block fulfillment
 *    - Reconciliation state marked REVERSED with reason captured
 * 8. provider/internal mismatch:
 *    - Unrecognized provider reference caught cleanly, reconciliation state MISMATCHED, no crashes
 * 9. concurrent webhook processing:
 *    - Parallel concurrent webhook calls for the identical event ID safely serialized via mutex
 *    - Exactly one returns PROCESSED, the other returns EVENT_ALREADY_PROCESSED
 *    - Zero duplicate records created
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
} from '../src/server/paymentInitiationServices.js';
import {
  PaymentWebhookService,
  PaymentWebhookSecurity,
  DEFAULT_WEBHOOK_SECRET,
} from '../src/server/paymentWebhookServices.js';
import { AuthenticationError, ValidationError, ConflictError } from '../src/lib/errors.js';
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
  ProviderWebhookEvent,
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
    id: `usr_adv_12d_${customRunId}`,
    publicAccountId: `AB-ADV-12D-${customRunId}`,
    contactName: 'Sarah Jenkins',
    email: `advertiser_12d_${customRunId}@aurabev.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Beverages India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_12d_${customRunId}`,
    publicAccountId: `AB-VEN-12D-${customRunId}`,
    contactName: 'Vikram Mehta',
    email: `venue_12d_${customRunId}@mumbaicentre.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Mumbai Convention Centre',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_12d_${customRunId}`,
    publicAccountId: `AB-SUP-12D-${customRunId}`,
    contactName: 'Rajesh Sharma',
    email: `supplier_12d_${customRunId}@punebottlers.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'Pune Eco Bottlers Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_12d_${customRunId}`,
    publicAccountId: `AB-LOG-12D-${customRunId}`,
    contactName: 'Anita Rao',
    email: `logistics_12d_${customRunId}@swiftindia.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'Swift India Freight Express',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_12d_${customRunId}`,
    publicAccountId: `AB-ADM-12D-${customRunId}`,
    contactName: 'Devon Vance',
    email: `admin_12d_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Technologies India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const externalAdvertiser: User = {
    id: `usr_ext_adv_12d_${customRunId}`,
    publicAccountId: `AB-ADV-EXT-${customRunId}`,
    contactName: 'Unrelated Advertiser',
    email: `unrelated_12d_${customRunId}@competitor.example`,
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

  // 3. Supplier Product
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
    id: `cmp_12d_${customRunId}`,
    publicCampaignId: `AB-CMP-12D-${customRunId}`,
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
    id: `prp_12d_${customRunId}`,
    publicProposalId: `AB-PRP-12D-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_12d_${customRunId}`,
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
  const agreementId = `cag_12d_${customRunId}`;
  const agreementPublicId = `AB-CAG-12D-${customRunId}`;
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
    currentVersionId: `cgv_12d_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-12D-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-12D-${customRunId}`,
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

  // 11. Step 11B Order Creation
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_12d_${customRunId}` },
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

async function runStep12DTests(): Promise<void> {
  console.log('================================================================');
  console.log('STARTING AQUABLOOM STEP 12D: PAYMENT WEBHOOKS, IDEMPOTENCY & REC');
  console.log('================================================================');

  const runId = Math.random().toString(36).substring(2, 8);
  const ctx = setupTestPipeline(runId);
  const { order, advertiserUser, snapshot } = ctx;

  console.log(`✅ Test Order prepared: ${order.publicId} (Status: ${order.status})`);
  console.log(`✅ Snapshot grand total: ₹${(snapshot.grandTotal.amountMinor / 100).toFixed(2)} (${snapshot.grandTotal.amountMinor} paise)`);

  // Initiate Payment so internal Payment and PaymentAttempt records exist
  const initiation = await PaymentInitiationService.initiatePayment(
    { orderId: order.id },
    advertiserUser
  );
  const providerRef = initiation.paymentIntentId!;
  console.log(`✅ Payment initiated: ${initiation.paymentPublicId}, providerRef=${providerRef}`);

  // -------------------------------------------------------------
  // TEST 1: DUPLICATE WEBHOOK (IDEMPOTENCY & ONCE-ONLY PROCESSING)
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Duplicate Webhook Idempotency ---');

  const event1Id = `evt_test_success_${runId}`;
  const nowSec = Math.floor(Date.now() / 1000);

  const validPayload: ProviderWebhookEvent = {
    id: event1Id,
    provider: 'SIMULATED',
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: order.id,
      orderPublicId: order.publicId,
      providerReference: providerRef,
      amountMinor: snapshot.grandTotal.amountMinor,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  };

  const payloadStr1 = JSON.stringify(validPayload);
  const signature1 = PaymentWebhookSecurity.generateSignature(payloadStr1, DEFAULT_WEBHOOK_SECRET, nowSec);

  // 1A. First Delivery: Must process successfully
  const firstResult = await PaymentWebhookService.processWebhook(
    payloadStr1,
    signature1,
    { secret: DEFAULT_WEBHOOK_SECRET }
  );

  assert.strictEqual(firstResult.received, true);
  assert.strictEqual(firstResult.status, 'PROCESSED');
  assert.strictEqual(firstResult.reconciliationState, 'MATCHED');

  const paymentAfter1 = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentAfter1.status, 'PAID', 'Payment must be PAID after successful webhook');
  const attemptsCountBeforeDuplicate = db.getPaymentAttemptsByOrderId(order.id).length;
  const reconciliationsBeforeDuplicate = db.getPaymentReconciliationRecordsByOrderId(order.id).length;

  // 1B. Duplicate Delivery: Must return EVENT_ALREADY_PROCESSED without duplicating any state
  const duplicateResult = await PaymentWebhookService.processWebhook(
    payloadStr1,
    signature1,
    { secret: DEFAULT_WEBHOOK_SECRET }
  );

  assert.strictEqual(duplicateResult.received, true);
  assert.strictEqual(duplicateResult.status, 'EVENT_ALREADY_PROCESSED');
  assert.ok(duplicateResult.message.includes('EVENT_ALREADY_PROCESSED'));

  // Ensure NO duplicate Payment, NO duplicate PaymentAttempt, NO duplicate ledger/reconciliation entries
  const allPaymentsForOrder = db.getAllPayments().filter((p) => p.orderId === order.id);
  assert.strictEqual(allPaymentsForOrder.length, 1, 'Duplicate webhook must NOT create a duplicate Payment');

  const attemptsCountAfterDuplicate = db.getPaymentAttemptsByOrderId(order.id).length;
  assert.strictEqual(
    attemptsCountAfterDuplicate,
    attemptsCountBeforeDuplicate,
    'Duplicate webhook must NOT create a duplicate PaymentAttempt'
  );

  const reconciliationsAfterDuplicate = db.getPaymentReconciliationRecordsByOrderId(order.id).length;
  assert.strictEqual(
    reconciliationsAfterDuplicate,
    reconciliationsBeforeDuplicate,
    'Duplicate webhook must NOT create duplicate reconciliation entries'
  );

  console.log('✅ TEST 1 PASSED: Duplicate webhook idempotently ignored (EVENT_ALREADY_PROCESSED); zero duplicate records created.');

  // -------------------------------------------------------------
  // TEST 2: INVALID SIGNATURE VERIFICATION
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Invalid Signature Verification ---');

  const invalidSigPayload = JSON.stringify({
    id: `evt_invalid_sig_${runId}`,
    eventType: 'payment_intent.succeeded',
    data: { providerReference: providerRef, amountMinor: 100, currency: 'INR', status: 'SUCCEEDED' },
  });

  const forgedSignature = `t=${nowSec},v1=ba03816f9f687483471bb952feadca83398935cbb2c75a401c1077978d38dc66`;

  let invalidSigCaught = false;
  try {
    await PaymentWebhookService.processWebhook(
      invalidSigPayload,
      forgedSignature,
      { secret: 'wrong_secret_123' }
    );
  } catch (err: any) {
    if (err instanceof AuthenticationError && err.statusCode === 401) {
      invalidSigCaught = true;
    }
  }

  assert.ok(invalidSigCaught, 'Invalid signature must be strictly rejected with 401 AuthenticationError');
  console.log('✅ TEST 2 PASSED: Tampered/invalid signature rejected with 401 AuthenticationError.');

  // -------------------------------------------------------------
  // TEST 3: REPLAYED EVENT (TIMESTAMP ATTACK)
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Replayed Event (Timestamp Replay Protection) ---');

  const staleTimestamp = nowSec - 600; // 10 minutes old (tolerance is 300s / 5 min)
  const stalePayload = JSON.stringify({
    id: `evt_stale_${runId}`,
    eventType: 'payment_intent.succeeded',
    data: { providerReference: providerRef, amountMinor: 100, currency: 'INR', status: 'SUCCEEDED' },
  });
  const staleSignature = PaymentWebhookSecurity.generateSignature(stalePayload, DEFAULT_WEBHOOK_SECRET, staleTimestamp);

  let staleCaught = false;
  try {
    await PaymentWebhookService.processWebhook(
      stalePayload,
      staleSignature,
      { secret: DEFAULT_WEBHOOK_SECRET, toleranceSeconds: 300 }
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('Replay attack detected')) {
      staleCaught = true;
    }
  }

  assert.ok(staleCaught, 'Stale replayed webhook must be rejected with ValidationError (Replay attack detected)');

  // Test future timestamp
  const futureTimestamp = nowSec + 300; // 5 minutes in future
  const futureSignature = PaymentWebhookSecurity.generateSignature(stalePayload, DEFAULT_WEBHOOK_SECRET, futureTimestamp);
  let futureCaught = false;
  try {
    await PaymentWebhookService.processWebhook(
      stalePayload,
      futureSignature,
      { secret: DEFAULT_WEBHOOK_SECRET }
    );
  } catch (err: any) {
    if (err instanceof ValidationError && err.message.includes('future')) {
      futureCaught = true;
    }
  }
  assert.ok(futureCaught, 'Future timestamp webhook must be rejected');

  console.log('✅ TEST 3 PASSED: Replay attack & future timestamp strictly blocked.');

  // -------------------------------------------------------------
  // TEST 4: DELAYED EVENT & OUT-OF-ORDER STATE GUARDS
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Delayed & Out-of-Order Events ---');

  // 4A. Delayed Succeeded Event on an already PAID payment
  // Order & Payment are already PAID from Test 1.
  const delayedSuccessId = `evt_delayed_success_${runId}`;
  const delayedSuccessPayload = JSON.stringify({
    id: delayedSuccessId,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: order.id,
      providerReference: providerRef,
      amountMinor: snapshot.grandTotal.amountMinor,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  });
  const delayedSuccessSig = PaymentWebhookSecurity.generateSignature(delayedSuccessPayload, DEFAULT_WEBHOOK_SECRET);

  const delayedResult = await PaymentWebhookService.processWebhook(
    delayedSuccessPayload,
    delayedSuccessSig
  );

  assert.strictEqual(delayedResult.status, 'PROCESSED');
  assert.strictEqual(delayedResult.reconciliationState, 'MATCHED');
  assert.ok(delayedResult.message.includes('Delayed webhook matched'));

  const paymentAfterDelayed = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentAfterDelayed.status, 'PAID', 'Payment must remain PAID');

  // 4B. Out-of-order Failure Event on an already PAID payment:
  // Must NOT downgrade the confirmed PAID payment! State guard must protect it
  const outOfOrderFailId = `evt_out_of_order_fail_${runId}`;
  const outOfOrderFailPayload = JSON.stringify({
    id: outOfOrderFailId,
    eventType: 'payment_intent.payment_failed',
    timestamp: new Date().toISOString(),
    data: {
      orderId: order.id,
      providerReference: providerRef,
      amountMinor: snapshot.grandTotal.amountMinor,
      currency: 'INR',
      status: 'FAILED',
      failureReason: 'Delayed card charge failed notice from earlier attempt',
    },
  });
  const outOfOrderFailSig = PaymentWebhookSecurity.generateSignature(outOfOrderFailPayload, DEFAULT_WEBHOOK_SECRET);

  const outOfOrderResult = await PaymentWebhookService.processWebhook(
    outOfOrderFailPayload,
    outOfOrderFailSig
  );

  assert.strictEqual(outOfOrderResult.status, 'PROCESSED');
  assert.strictEqual(outOfOrderResult.reconciliationState, 'PENDING_REVIEW', 'Out-of-order failure must be flagged for review');

  // Verify server-side state guard: Payment is STILL PAID!
  const paymentGuarded = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentGuarded.status, 'PAID', 'State guard: Confirmed PAID payment must not be downgraded by out-of-order failure');

  console.log('✅ TEST 4 PASSED: Delayed event reconciled cleanly; out-of-order failure guarded against downgrading confirmed payment.');

  // -------------------------------------------------------------
  // TEST 5: WRONG AMOUNT (UNDERPAYMENT & OVERPAYMENT RECONCILIATION)
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Wrong Amount Reconciliation ---');

  // Setup separate order for underpayment test
  const underpayCtx = setupTestPipeline(`up_${runId}`);
  const underpayInitiation = await PaymentInitiationService.initiatePayment(
    { orderId: underpayCtx.order.id },
    underpayCtx.advertiserUser
  );
  const underpayExpectedPaise = underpayCtx.snapshot.grandTotal.amountMinor;
  const underpayReceivedPaise = underpayExpectedPaise - 50000; // ₹500 short

  const underpayPayload = JSON.stringify({
    id: `evt_underpay_${runId}`,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: underpayCtx.order.id,
      providerReference: underpayInitiation.paymentIntentId,
      amountMinor: underpayReceivedPaise,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  });
  const underpaySig = PaymentWebhookSecurity.generateSignature(underpayPayload, DEFAULT_WEBHOOK_SECRET);

  const underpayResult = await PaymentWebhookService.processWebhook(underpayPayload, underpaySig);

  assert.strictEqual(underpayResult.status, 'FLAGGED_FOR_RECONCILIATION');
  assert.strictEqual(underpayResult.reconciliationState, 'MISMATCHED');
  assert.ok(underpayResult.message.includes('Underpayment'));

  const underpayPaymentDb = db.getPaymentByOrderId(underpayCtx.order.id)!;
  assert.strictEqual(underpayPaymentDb.status, 'UNDERPAID_FLAGGED');
  assert.strictEqual(underpayPaymentDb.paidAt, undefined, 'Underpaid payment must NOT be marked PAID');
  const underpayOrderDb = db.getOrderById(underpayCtx.order.id)!;
  assert.strictEqual(underpayOrderDb.status, 'PAYMENT_REQUIRED', 'Order must NOT be marked PAID on underpayment');

  // Setup separate order for overpayment test
  const overpayCtx = setupTestPipeline(`op_${runId}`);
  const overpayInitiation = await PaymentInitiationService.initiatePayment(
    { orderId: overpayCtx.order.id },
    overpayCtx.advertiserUser
  );
  const overpayExpectedPaise = overpayCtx.snapshot.grandTotal.amountMinor;
  const overpayReceivedPaise = overpayExpectedPaise + 100000; // ₹1,000 extra

  const overpayPayload = JSON.stringify({
    id: `evt_overpay_${runId}`,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: overpayCtx.order.id,
      providerReference: overpayInitiation.paymentIntentId,
      amountMinor: overpayReceivedPaise,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  });
  const overpaySig = PaymentWebhookSecurity.generateSignature(overpayPayload, DEFAULT_WEBHOOK_SECRET);

  const overpayResult = await PaymentWebhookService.processWebhook(overpayPayload, overpaySig);

  assert.strictEqual(overpayResult.status, 'FLAGGED_FOR_RECONCILIATION');
  assert.strictEqual(overpayResult.reconciliationState, 'MISMATCHED');
  assert.ok(overpayResult.message.includes('Overpayment'));

  const overpayPaymentDb = db.getPaymentByOrderId(overpayCtx.order.id)!;
  assert.strictEqual(overpayPaymentDb.status, 'OVERPAID_RECONCILIATION_FLAGGED');
  assert.strictEqual(overpayPaymentDb.paidAt, undefined, 'Overpaid payment must NOT be marked PAID');
  const overpayOrderDb = db.getOrderById(overpayCtx.order.id)!;
  assert.strictEqual(overpayOrderDb.status, 'PAYMENT_REQUIRED', 'Order must NOT be marked PAID on overpayment');

  console.log('✅ TEST 5 PASSED: Underpayment and Overpayment flagged as MISMATCHED with discrepancy details; neither marked PAID.');

  // -------------------------------------------------------------
  // TEST 6: WRONG CURRENCY
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Wrong Currency Validation ---');

  const currCtx = setupTestPipeline(`curr_${runId}`);
  const currInitiation = await PaymentInitiationService.initiatePayment(
    { orderId: currCtx.order.id },
    currCtx.advertiserUser
  );

  const currPayload = JSON.stringify({
    id: `evt_curr_${runId}`,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: currCtx.order.id,
      providerReference: currInitiation.paymentIntentId,
      amountMinor: currCtx.snapshot.grandTotal.amountMinor,
      currency: 'USD', // Non-INR currency
      status: 'SUCCEEDED',
    },
  });
  const currSig = PaymentWebhookSecurity.generateSignature(currPayload, DEFAULT_WEBHOOK_SECRET);

  const currResult = await PaymentWebhookService.processWebhook(currPayload, currSig);

  assert.strictEqual(currResult.status, 'FLAGGED_FOR_RECONCILIATION');
  assert.strictEqual(currResult.reconciliationState, 'MISMATCHED');
  assert.ok(currResult.message.includes('Currency mismatch'));

  const currPaymentDb = db.getPaymentByOrderId(currCtx.order.id)!;
  assert.strictEqual(currPaymentDb.status, 'FAILED');
  assert.strictEqual(currPaymentDb.paidAt, undefined);

  console.log('✅ TEST 6 PASSED: Non-INR currency rejected and flagged as MISMATCHED.');

  // -------------------------------------------------------------
  // TEST 7: PAYMENT REVERSAL (CHARGEBACK / REFUND PROTECTION)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Payment Reversal Handling ---');

  // Take our already PAID order from Test 1 & 4
  const reversalPayload = JSON.stringify({
    id: `evt_reversal_${runId}`,
    eventType: 'charge.dispute.created',
    timestamp: new Date().toISOString(),
    data: {
      orderId: order.id,
      providerReference: providerRef,
      amountMinor: snapshot.grandTotal.amountMinor,
      currency: 'INR',
      status: 'REVERSED',
      reversalReason: 'Customer bank disputed transaction (fraud claim)',
    },
  });
  const reversalSig = PaymentWebhookSecurity.generateSignature(reversalPayload, DEFAULT_WEBHOOK_SECRET);

  const reversalResult = await PaymentWebhookService.processWebhook(reversalPayload, reversalSig);

  assert.strictEqual(reversalResult.status, 'REVERSED');
  assert.strictEqual(reversalResult.reconciliationState, 'REVERSED');

  // Verify DB state: Payment must NOT remain PAID; must be REVERSED
  const paymentReversedDb = db.getPaymentByOrderId(order.id)!;
  assert.strictEqual(paymentReversedDb.status, 'REVERSED', 'Payment status must be REVERSED');

  // Order status must be revoked from PAID back to PAYMENT_REQUIRED to block fulfillment
  const orderReversedDb = db.getOrderById(order.id)!;
  assert.strictEqual(
    orderReversedDb.status,
    'PAYMENT_REQUIRED',
    'Order status must be revoked from PAID to PAYMENT_REQUIRED to halt fulfillment authorization'
  );

  // Reconciliation record must capture reversal details
  const reconciliations = db.getPaymentReconciliationRecordsByOrderId(order.id);
  const reversalRec = reconciliations.find((r) => r.reconciliationState === 'REVERSED');
  assert.ok(reversalRec, 'Reversal reconciliation record must exist');
  assert.ok(reversalRec!.discrepancyReason?.includes('Customer bank disputed transaction'));
  assert.strictEqual(reversalRec!.expectedAmountMinor, snapshot.grandTotal.amountMinor);

  console.log('✅ TEST 7 PASSED: Payment reversal properly revoked PAID status on Order & Payment; reconciliation state=REVERSED.');

  // -------------------------------------------------------------
  // TEST 8: PROVIDER / INTERNAL MISMATCH
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: Provider / Internal Reference Mismatch ---');

  const unknownRef = 'pi_completely_unknown_gateway_tx_99999';
  const mismatchPayload = JSON.stringify({
    id: `evt_mismatch_${runId}`,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      providerReference: unknownRef,
      amountMinor: 500000,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  });
  const mismatchSig = PaymentWebhookSecurity.generateSignature(mismatchPayload, DEFAULT_WEBHOOK_SECRET);

  const mismatchResult = await PaymentWebhookService.processWebhook(mismatchPayload, mismatchSig);

  assert.strictEqual(mismatchResult.status, 'REJECTED_MISMATCH');
  assert.strictEqual(mismatchResult.reconciliationState, 'MISMATCHED');
  assert.ok(mismatchResult.message.includes('could not be reconciled with internal database records'));

  // Reconciliation record should be saved for manual investigation
  const allReconciliations = db.getAllPaymentReconciliationRecords();
  const unmatchedRec = allReconciliations.find((r) => r.providerReference === unknownRef);
  assert.ok(unmatchedRec, 'Unmatched provider reference must be recorded for financial auditing');
  assert.strictEqual(unmatchedRec!.reconciliationState, 'MISMATCHED');

  console.log('✅ TEST 8 PASSED: Unmatched provider reference cleanly caught and logged as MISMATCHED.');

  // -------------------------------------------------------------
  // TEST 9: CONCURRENT WEBHOOK PROCESSING (MUTEX INTEGRITY)
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: Concurrent Webhook Processing ---');

  const concurrentCtx = setupTestPipeline(`conc_${runId}`);
  const concurrentInitiation = await PaymentInitiationService.initiatePayment(
    { orderId: concurrentCtx.order.id },
    concurrentCtx.advertiserUser
  );
  const concurrentProviderRef = concurrentInitiation.paymentIntentId!;

  const concurrentEventId = `evt_concurrent_${runId}`;
  const concurrentPayload = JSON.stringify({
    id: concurrentEventId,
    eventType: 'payment_intent.succeeded',
    timestamp: new Date().toISOString(),
    data: {
      orderId: concurrentCtx.order.id,
      providerReference: concurrentProviderRef,
      amountMinor: concurrentCtx.snapshot.grandTotal.amountMinor,
      currency: 'INR',
      status: 'SUCCEEDED',
    },
  });
  const concurrentSig = PaymentWebhookSecurity.generateSignature(concurrentPayload, DEFAULT_WEBHOOK_SECRET);

  // Fire 5 identical webhooks simultaneously in parallel
  const parallelPromises = [
    PaymentWebhookService.processWebhook(concurrentPayload, concurrentSig),
    PaymentWebhookService.processWebhook(concurrentPayload, concurrentSig),
    PaymentWebhookService.processWebhook(concurrentPayload, concurrentSig),
    PaymentWebhookService.processWebhook(concurrentPayload, concurrentSig),
    PaymentWebhookService.processWebhook(concurrentPayload, concurrentSig),
  ];

  const results = await Promise.all(parallelPromises);

  const processedCount = results.filter((r) => r.status === 'PROCESSED').length;
  const duplicateCount = results.filter((r) => r.status === 'EVENT_ALREADY_PROCESSED').length;

  assert.strictEqual(processedCount, 1, 'Exactly one concurrent call must return PROCESSED');
  assert.strictEqual(duplicateCount, 4, 'Remaining concurrent calls must return EVENT_ALREADY_PROCESSED');

  // Verify internal DB integrity: exactly 1 payment record, exactly 1 payment attempt, exactly 1 PAID state
  const paymentsForOrder = db.getAllPayments().filter((p) => p.orderId === concurrentCtx.order.id);
  assert.strictEqual(paymentsForOrder.length, 1, 'Exactly one payment record must exist');
  assert.strictEqual(paymentsForOrder[0].status, 'PAID');

  const reconciliationsForOrder = db.getPaymentReconciliationRecordsByOrderId(concurrentCtx.order.id);
  assert.strictEqual(reconciliationsForOrder.length, 1, 'Exactly one reconciliation record must exist');

  console.log('✅ TEST 9 PASSED: Parallel concurrent webhooks serialized; exactly 1 PROCESSED and 4 EVENT_ALREADY_PROCESSED without race conditions.');

  console.log('\n================================================================');
  console.log('ALL STEP 12D TESTS COMPLETED SUCCESSFULLY! 🚀');
  console.log('================================================================');
}

runStep12DTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
