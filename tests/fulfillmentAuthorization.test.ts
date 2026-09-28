/**
 * AQUABLOOM — STEP 12F: PAYMENT -> FULFILLMENT AUTHORIZATION TEST SUITE
 * 
 * Tests the hard financial gate that permits production to begin.
 * 
 * Verifies:
 * 1. Successful authorization:
 *    - All 6 hard gate requirements satisfied:
 *      * Campaign Agreement = LOCKED
 *      * Supplier Assignment = ASSIGNED
 *      * Logistics Assignment = ASSIGNED
 *      * Order = PAID
 *      * Payment = VERIFIED/PAID
 *      * Financial transaction is valid (balanced double-entry ledger)
 *    - Record created/reused:
 *      * authorization ID
 *      * Order
 *      * Payment
 *      * authorization status = AUTHORIZED
 *      * authorized timestamp
 *      * source payment reference
 *      * validation results
 *      * audit event
 *    - Commercial boundary:
 *      * Before PRODUCTION_STARTED normal Campaign Cancellation remains available.
 *      * productionPermitted = true
 *    - Order status advances to READY_FOR_FULFILLMENT.
 * 
 * 2. Unpaid Order:
 *    - Order status is not PAID.
 *    - Gate check fails ORDER_PAID.
 *    - Status = NOT_AUTHORIZED, productionPermitted = false, production remains blocked.
 * 
 * 3. Failed Payment:
 *    - Payment status is FAILED or unverified.
 *    - Gate check fails PAYMENT_VERIFIED.
 *    - Status = NOT_AUTHORIZED, productionPermitted = false, production remains blocked.
 * 
 * 4. Missing Supplier Assignment:
 *    - Supplier Assignment missing or not ASSIGNED.
 *    - Gate check fails SUPPLIER_ASSIGNED.
 *    - Status = NOT_AUTHORIZED, productionPermitted = false.
 * 
 * 5. Missing Logistics Assignment:
 *    - Logistics Assignment missing or not ASSIGNED.
 *    - Gate check fails LOGISTICS_ASSIGNED.
 *    - Status = NOT_AUTHORIZED, productionPermitted = false.
 * 
 * 6. Unlocked Agreement:
 *    - Campaign Agreement is not LOCKED.
 *    - Gate check fails AGREEMENT_LOCKED.
 *    - Status = NOT_AUTHORIZED, productionPermitted = false.
 * 
 * 7. Duplicate authorization (Idempotency):
 *    - Repeated payment confirmation must not create multiple authorizations.
 *    - Database count remains 1, timestamps and public IDs preserved.
 * 
 * 8. Unauthorized manual authorization (Security):
 *    - Supplier cannot manually authorize fulfillment.
 *    - Advertiser cannot manually mark an Order as paid or authorize fulfillment.
 *    - Venues and Logistics partners cannot manually authorize fulfillment.
 *    - Frontend cannot bypass this gate.
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
import { FinancialLedgerEngine } from '../src/server/financialLedgerServices.js';
import {
  FulfillmentAuthorizationService,
  FulfillmentAuthorizationEngine,
} from '../src/server/fulfillmentAuthorizationServices.js';
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
  Payment,
  FulfillmentAuthorization,
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
    id: `usr_adv_12f_${customRunId}`,
    publicAccountId: `AB-ADV-12F-${customRunId}`,
    contactName: 'Kavita Chawla',
    email: `adv_12f_${customRunId}@brand.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Premium Beverages',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_12f_${customRunId}`,
    publicAccountId: `AB-VEN-12F-${customRunId}`,
    contactName: 'Rohit Kulkarni',
    email: `venue_12f_${customRunId}@hub.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Bandra Business Hub',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_12f_${customRunId}`,
    publicAccountId: `AB-SUP-12F-${customRunId}`,
    contactName: 'Gaurav Shinde',
    email: `supplier_12f_${customRunId}@ecobottle.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'EcoSpring Packaging Works',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_12f_${customRunId}`,
    publicAccountId: `AB-LOG-12F-${customRunId}`,
    contactName: 'Harish Nair',
    email: `logistics_12f_${customRunId}@speedfreight.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'SpeedFreight Logistics Mumbai',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_12f_${customRunId}`,
    publicAccountId: `AB-ADM-12F-${customRunId}`,
    contactName: 'AquaBloom System Admin',
    email: `admin_12f_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Operations HQ',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const unauthorizedUser: User = {
    id: `usr_unauth_12f_${customRunId}`,
    publicAccountId: `AB-UNA-12F-${customRunId}`,
    contactName: 'Unrelated Actor',
    email: `unrelated_12f_${customRunId}@other.example`,
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
      customerFacingPrice: { amount: 25.00, currency: 'INR' },
      supplierInternalCost: { amount: 16.00, currency: 'INR' },
    } as any,
    adminUser.id
  );

  // 4. Campaign
  const campaign: any = {
    id: `cmp_12f_${customRunId}`,
    publicCampaignId: `AB-CMP-12F-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Summer Refresh Campaign 2026',
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
    id: `prp_12f_${customRunId}`,
    publicProposalId: `AB-PRP-12F-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_12f_${customRunId}`,
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
  const agreementId = `cag_12f_${customRunId}`;
  const agreementPublicId = `AB-CAG-12F-${customRunId}`;
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
    currentVersionId: `cgv_12f_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-12F-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-12F-${customRunId}`,
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

  // 10. Final Pricing
  const pricingResult = FinalPricingEngine.calculateFinalPricing(validatedReadiness.id, adminUser);

  // 11. Order Creation
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_12f_${customRunId}` },
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

async function runStep12FTests() {
  console.log('================================================================');
  console.log('STARTING AQUABLOOM STEP 12F: PAYMENT -> FULFILLMENT AUTHORIZATION TESTS');
  console.log('================================================================');

  PaymentProviderRegistry.register(new SimulatedPaymentProvider());

  // --------------------------------------------------------------------------
  // TEST 1: SUCCESSFUL AUTHORIZATION
  // --------------------------------------------------------------------------
  console.log('\n[TEST 1] Successful Authorization: All 6 Gate Conditions Satisfied');
  {
    const ctx = setupTestPipeline('test1_success');

    // 1. Initiate Payment
    const initResult = await PaymentInitiationService.initiatePayment(
      {
        orderId: ctx.order.id,
        paymentMethod: 'NET_BANKING',
        providerPreference: 'SIMULATED',
        idempotencyKey: `init_t1_${ctx.order.id}`,
      },
      ctx.advertiserUser
    );

    // 2. Authoritative Verification with Gateway
    const validProviderRef = initResult.paymentIntentId;
    const verifyResult = await PaymentVerificationService.verifyPayment(
      {
        orderId: ctx.order.id,
        providerReference: validProviderRef,
        providerPreference: 'SIMULATED',
      },
      ctx.advertiserUser
    );

    assert.strictEqual(verifyResult.paymentStatus, 'PAID');

    // 3. Verify Fulfillment Authorization was created and AUTHORIZED
    const auth = db.getFulfillmentAuthorizationByOrderId(ctx.order.id);
    assert.ok(auth, 'FulfillmentAuthorization record must exist.');
    assert.strictEqual(auth.status, 'AUTHORIZED', 'Status must be AUTHORIZED.');
    assert.strictEqual(auth.productionPermitted, true, 'productionPermitted must be true.');
    assert.ok(auth.authorizedAt, 'authorizedAt timestamp must be set.');
    assert.strictEqual(auth.deniedAt, null, 'deniedAt must be null on success.');
    assert.ok(auth.publicId.startsWith('AB-FFA-'), 'Public ID must have prefix AB-FFA.');
    assert.strictEqual(auth.orderId, ctx.order.id);
    assert.strictEqual(auth.sourcePaymentReference, validProviderRef);
    assert.strictEqual(auth.validationResults.isValid, true, 'All validation checks must pass.');
    assert.strictEqual(auth.validationResults.checks.length, 6, 'Must evaluate exactly 6 gate checks.');
    assert.ok(auth.auditEventId, 'auditEventId must be recorded.');

    // 4. Verify Commercial Boundary
    assert.strictEqual(auth.commercialBoundary.productionStarted, false);
    assert.strictEqual(auth.commercialBoundary.cancellationPermitted, true);
    assert.ok(
      auth.commercialBoundary.boundaryNote.includes('PRODUCTION_STARTED'),
      'Commercial boundary note must explicitly mention PRODUCTION_STARTED.'
    );

    // 5. Verify Order Status advanced to READY_FOR_FULFILLMENT
    const updatedOrder = db.getOrderById(ctx.order.id)!;
    assert.strictEqual(updatedOrder.status, 'READY_FOR_FULFILLMENT');
    const hasStatusHistory = updatedOrder.statusHistory?.some(
      (h) => h.toStatus === 'READY_FOR_FULFILLMENT'
    );
    assert.ok(hasStatusHistory, 'Order status history must document READY_FOR_FULFILLMENT transition.');

    // 6. Verify Audit Events
    const events = db.getEvents();
    const authorizedAuditEvent = events.find(
      (e) => e.eventType === 'FULFILLMENT_AUTHORIZED' && e.entityId === auth.id
    );
    assert.ok(authorizedAuditEvent, 'Authoritative FULFILLMENT_AUTHORIZED audit event must exist.');

    console.log('  ✓ Step 12F gate correctly evaluated all 6 conditions.');
    console.log(`  ✓ Fulfillment authorization ${auth.publicId} created with status AUTHORIZED.`);
    console.log(`  ✓ Commercial boundary intact (productionStarted=false, cancellationPermitted=true).`);
    console.log(`  ✓ Order transitioned to READY_FOR_FULFILLMENT.`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: UNPAID ORDER
  // --------------------------------------------------------------------------
  console.log('\n[TEST 2] Unpaid Order: Gate Blocked');
  {
    const ctx = setupTestPipeline('test2_unpaid');

    // Order is in PAYMENT_REQUIRED status (unpaid)
    assert.strictEqual(ctx.order.status, 'PAYMENT_REQUIRED');

    // Evaluate gate conditions
    const evalResult = FulfillmentAuthorizationService.evaluateGateConditions(ctx.order.id);
    assert.strictEqual(evalResult.validationSummary.isValid, false);
    const orderPaidCheck = evalResult.validationSummary.checks.find((c) => c.code === 'ORDER_PAID');
    assert.ok(orderPaidCheck && !orderPaidCheck.passed, 'ORDER_PAID check must fail.');

    // Attempting manual authorization as admin must fail with ValidationError
    let errorCaught: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.adminUser,
      });
    } catch (err: any) {
      errorCaught = err;
    }

    assert.ok(errorCaught instanceof ValidationError, 'Must throw ValidationError for unpaid order.');
    assert.ok(errorCaught.message.includes('Order status must be PAID'));

    // Authorization record must be saved as NOT_AUTHORIZED
    const auth = db.getFulfillmentAuthorizationByOrderId(ctx.order.id);
    assert.ok(auth);
    assert.strictEqual(auth.status, 'NOT_AUTHORIZED');
    assert.strictEqual(auth.productionPermitted, false, 'Production must remain blocked.');
    assert.ok(auth.deniedAt, 'deniedAt timestamp must be recorded.');

    // Order must NOT be advanced
    const currentOrder = db.getOrderById(ctx.order.id)!;
    assert.strictEqual(currentOrder.status, 'PAYMENT_REQUIRED');

    console.log('  ✓ Unpaid order correctly failed ORDER_PAID check.');
    console.log('  ✓ Recorded NOT_AUTHORIZED and production remained blocked.');
  }

  // --------------------------------------------------------------------------
  // TEST 3: FAILED PAYMENT
  // --------------------------------------------------------------------------
  console.log('\n[TEST 3] Failed Payment: Gate Blocked');
  {
    const ctx = setupTestPipeline('test3_failed_payment');

    // Initiate payment
    const initResult = await PaymentInitiationService.initiatePayment(
      {
        orderId: ctx.order.id,
        paymentMethod: 'UPI',
        providerPreference: 'SIMULATED',
        idempotencyKey: `init_t3_${ctx.order.id}`,
      },
      ctx.advertiserUser
    );

    // Simulate payment failed in DB
    const payment = db.getPaymentById(initResult.paymentId)!;
    payment.status = 'FAILED';
    payment.lastFailureReason = 'Card network declined (insufficient funds)';
    payment.failedAt = new Date().toISOString();
    payment.verifiedAt = undefined;
    db.savePayment(payment);

    // Evaluate gate
    const evalResult = FulfillmentAuthorizationService.evaluateGateConditions(ctx.order.id);
    assert.strictEqual(evalResult.validationSummary.isValid, false);
    const paymentCheck = evalResult.validationSummary.checks.find((c) => c.code === 'PAYMENT_VERIFIED');
    assert.ok(paymentCheck && !paymentCheck.passed, 'PAYMENT_VERIFIED check must fail.');

    // Call authorizeFulfillment
    let errorCaught: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.adminUser,
      });
    } catch (err: any) {
      errorCaught = err;
    }
    assert.ok(errorCaught instanceof ValidationError);

    const auth = db.getFulfillmentAuthorizationByOrderId(ctx.order.id);
    assert.ok(auth);
    assert.strictEqual(auth.status, 'NOT_AUTHORIZED');
    assert.strictEqual(auth.productionPermitted, false);

    console.log('  ✓ Failed payment correctly failed PAYMENT_VERIFIED check.');
    console.log('  ✓ Production remains strictly blocked.');
  }

  // --------------------------------------------------------------------------
  // TEST 4: MISSING SUPPLIER ASSIGNMENT
  // --------------------------------------------------------------------------
  console.log('\n[TEST 4] Missing Supplier Assignment: Gate Blocked');
  {
    const ctx = setupTestPipeline('test4_missing_supplier');

    // Modify supplier assignment status to CANCELLED
    const supAssignment = db.getSupplierAssignmentById(ctx.supplierAssignment.id)!;
    supAssignment.status = 'CANCELLED';
    db.saveSupplierAssignment(supAssignment);

    // Also mark order as paid to isolate supplier check
    ctx.order.status = 'PAID';
    db.saveOrder(ctx.order);

    const evalResult = FulfillmentAuthorizationService.evaluateGateConditions(ctx.order.id);
    const supCheck = evalResult.validationSummary.checks.find((c) => c.code === 'SUPPLIER_ASSIGNED');
    assert.ok(supCheck && !supCheck.passed, 'SUPPLIER_ASSIGNED check must fail when not ASSIGNED.');

    let errorCaught: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.adminUser,
      });
    } catch (err: any) {
      errorCaught = err;
    }
    assert.ok(errorCaught instanceof ValidationError);
    assert.ok(errorCaught.message.includes('Supplier Assignment must be ASSIGNED'));

    console.log('  ✓ Missing/unassigned Supplier Assignment blocked fulfillment.');
  }

  // --------------------------------------------------------------------------
  // TEST 5: MISSING LOGISTICS ASSIGNMENT
  // --------------------------------------------------------------------------
  console.log('\n[TEST 5] Missing Logistics Assignment: Gate Blocked');
  {
    const ctx = setupTestPipeline('test5_missing_logistics');

    // Modify logistics assignment status to REJECTED
    const logAssignment = db.getLogisticsAssignmentById(ctx.logisticsAssignment.id)!;
    logAssignment.status = 'REJECTED';
    db.saveLogisticsAssignment(logAssignment);

    // Mark order as paid to isolate logistics check
    ctx.order.status = 'PAID';
    db.saveOrder(ctx.order);

    const evalResult = FulfillmentAuthorizationService.evaluateGateConditions(ctx.order.id);
    const logCheck = evalResult.validationSummary.checks.find((c) => c.code === 'LOGISTICS_ASSIGNED');
    assert.ok(logCheck && !logCheck.passed, 'LOGISTICS_ASSIGNED check must fail when not ASSIGNED.');

    let errorCaught: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.adminUser,
      });
    } catch (err: any) {
      errorCaught = err;
    }
    assert.ok(errorCaught instanceof ValidationError);
    assert.ok(errorCaught.message.includes('Logistics Assignment must be ASSIGNED'));

    console.log('  ✓ Missing/unassigned Logistics Assignment blocked fulfillment.');
  }

  // --------------------------------------------------------------------------
  // TEST 6: UNLOCKED AGREEMENT
  // --------------------------------------------------------------------------
  console.log('\n[TEST 6] Unlocked Campaign Agreement: Gate Blocked');
  {
    const ctx = setupTestPipeline('test6_unlocked_agreement');

    // Simulate an unlocked agreement in memory
    const internalAgreement = (db as any).schema.agreements.find(
      (a: any) => a.id === ctx.lockedAgreement.id
    );
    if (internalAgreement) {
      internalAgreement.status = 'DRAFT';
      internalAgreement.lockedAt = undefined;
    }

    ctx.order.status = 'PAID';
    db.saveOrder(ctx.order);

    const evalResult = FulfillmentAuthorizationService.evaluateGateConditions(ctx.order.id);
    const agreementCheck = evalResult.validationSummary.checks.find((c) => c.code === 'AGREEMENT_LOCKED');
    assert.ok(agreementCheck && !agreementCheck.passed, 'AGREEMENT_LOCKED check must fail when agreement is not LOCKED.');

    let errorCaught: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.adminUser,
      });
    } catch (err: any) {
      errorCaught = err;
    }
    assert.ok(errorCaught instanceof ValidationError);
    assert.ok(errorCaught.message.includes('Campaign Agreement must be LOCKED'));

    console.log('  ✓ Unlocked Agreement blocked fulfillment authorization.');
  }

  // --------------------------------------------------------------------------
  // TEST 7: DUPLICATE AUTHORIZATION (IDEMPOTENCY)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 7] Duplicate Authorization: Strict Idempotency');
  {
    const ctx = setupTestPipeline('test7_idempotency');

    // 1. Initiate and verify payment
    const initResult = await PaymentInitiationService.initiatePayment(
      {
        orderId: ctx.order.id,
        paymentMethod: 'NET_BANKING',
        providerPreference: 'SIMULATED',
        idempotencyKey: `init_t7_${ctx.order.id}`,
      },
      ctx.advertiserUser
    );

    const validProviderRef = initResult.paymentIntentId;
    await PaymentVerificationService.verifyPayment(
      {
        orderId: ctx.order.id,
        providerReference: validProviderRef,
        providerPreference: 'SIMULATED',
      },
      ctx.advertiserUser
    );

    const initialAuth = db.getFulfillmentAuthorizationByOrderId(ctx.order.id)!;
    assert.ok(initialAuth);
    assert.strictEqual(initialAuth.status, 'AUTHORIZED');

    const initialTotalAuths = db.getAllFulfillmentAuthorizations().length;
    const initialEventsCount = db.getEvents().length;

    // 2. Repeated authorization attempt
    const secondAuth = FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
      actor: ctx.adminUser,
    });

    assert.strictEqual(secondAuth.id, initialAuth.id, 'Must return identical authorization ID.');
    assert.strictEqual(secondAuth.publicId, initialAuth.publicId, 'Must return identical public ID.');
    assert.strictEqual(secondAuth.authorizedAt, initialAuth.authorizedAt, 'Timestamp must be preserved.');

    const newTotalAuths = db.getAllFulfillmentAuthorizations().length;
    assert.strictEqual(newTotalAuths, initialTotalAuths, 'Must not create duplicate DB records.');

    const newEventsCount = db.getEvents().length;
    assert.strictEqual(newEventsCount, initialEventsCount, 'Must not dispatch duplicate audit events.');

    console.log('  ✓ Repeated authorization calls safely returned existing authorization record.');
    console.log('  ✓ No duplicate records or duplicate events created.');
  }

  // --------------------------------------------------------------------------
  // TEST 8: UNAUTHORIZED MANUAL AUTHORIZATION (SECURITY)
  // --------------------------------------------------------------------------
  console.log('\n[TEST 8] Security: Counterparty Manual Authorization Strictly Prohibited');
  {
    const ctx = setupTestPipeline('test8_security');

    // 1. Supplier cannot manually authorize fulfillment
    let supplierError: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.supplierUser,
      });
    } catch (err: any) {
      supplierError = err;
    }
    assert.ok(supplierError instanceof AuthorizationError, 'Supplier must receive AuthorizationError.');
    assert.ok(supplierError.message.includes('Suppliers cannot manually authorize fulfillment'));

    // 2. Advertiser cannot manually mark an order as paid or authorize fulfillment
    let advertiserError: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.advertiserUser,
      });
    } catch (err: any) {
      advertiserError = err;
    }
    assert.ok(advertiserError instanceof AuthorizationError, 'Advertiser must receive AuthorizationError.');
    assert.ok(advertiserError.message.includes('Advertisers cannot manually mark orders as paid or authorize fulfillment'));

    // 3. Venue cannot manually authorize fulfillment
    let venueError: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.venueUser,
      });
    } catch (err: any) {
      venueError = err;
    }
    assert.ok(venueError instanceof AuthorizationError);
    assert.ok(venueError.message.includes('Venues cannot authorize fulfillment'));

    // 4. Logistics partner cannot manually authorize fulfillment
    let logisticsError: any = null;
    try {
      FulfillmentAuthorizationService.authorizeFulfillment(ctx.order.id, {
        actor: ctx.logisticsPartner,
      });
    } catch (err: any) {
      logisticsError = err;
    }
    assert.ok(logisticsError instanceof AuthorizationError);
    assert.ok(logisticsError.message.includes('Logistics partners cannot authorize fulfillment'));

    // 5. Unrelated counterparty cannot view authorization view
    let unrelatedViewError: any = null;
    try {
      FulfillmentAuthorizationService.getFulfillmentAuthorizationView(ctx.order.id, ctx.unauthorizedUser);
    } catch (err: any) {
      unrelatedViewError = err;
    }
    assert.ok(unrelatedViewError instanceof AuthorizationError);

    // 6. Authorized parties (Advertiser or Admin) can view role-isolated view
    const advView = FulfillmentAuthorizationService.getFulfillmentAuthorizationView(ctx.order.id, ctx.advertiserUser);
    assert.ok(advView);
    assert.strictEqual(advView.orderPublicId, ctx.order.publicId);
    assert.strictEqual(advView.isAuthorized, false);
    assert.strictEqual(advView.productionPermitted, false);

    console.log('  ✓ Supplier manual authorization blocked with 403.');
    console.log('  ✓ Advertiser manual authorization blocked with 403.');
    console.log('  ✓ Venue and Logistics manual authorization blocked with 403.');
    console.log('  ✓ Unrelated user view access blocked with 403.');
    console.log('  ✓ Counterparty role-isolated view working as designed.');
  }

  console.log('\n================================================================');
  console.log('ALL AQUABLOOM STEP 12F FULFILLMENT AUTHORIZATION TESTS PASSED! ✓');
  console.log('================================================================\n');
}

runStep12FTests().catch((err) => {
  console.error('STEP 12F TESTS FAILED:', err);
  process.exit(1);
});
