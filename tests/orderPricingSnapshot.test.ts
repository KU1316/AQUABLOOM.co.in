/**
 * AQUABLOOM — STEP 11C TEST SUITE
 * Immutable Order Pricing Snapshot & Payment Readiness
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
  OrderPricingSnapshotEngine,
  PaymentReadinessService,
  PaymentReadinessAuthorizationService,
  deepFreeze,
} from '../src/server/paymentReadinessServices.js';
import { generateBusinessId } from '../src/lib/idGenerator.js';
import { AuthorizationError, ConflictError } from '../src/lib/errors.js';
import type {
  User,
  OrderReadiness,
  SupplierAssignment,
  LogisticsAssignment,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  FinalPricingCalculationResult,
} from '../src/types.js';

interface TestContext {
  advertiserUser: User;
  venueUser: User;
  supplierUser: User;
  logisticsPartner: User;
  adminUser: User;
  externalAdvertiser: User;
  orderReadiness: OrderReadiness;
  supplierAssignment: SupplierAssignment;
  logisticsAssignment: LogisticsAssignment;
  lockedAgreement: CampaignAgreement;
  agreementSnapshot: CampaignAgreementSnapshot;
  pricingResult: FinalPricingCalculationResult;
}

function setupTestPipeline(customRunId: string): TestContext {
  const nowIso = new Date().toISOString();

  // Users
  const advertiserUser: User = {
    id: `usr_adv_11c_${customRunId}`,
    publicAccountId: `AB-ADV-11C-${customRunId}`,
    contactName: 'Sarah Jenkins',
    email: `advertiser_11c_${customRunId}@aurabev.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Beverages India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const venueUser: User = {
    id: `usr_ven_11c_${customRunId}`,
    publicAccountId: `AB-VEN-11C-${customRunId}`,
    contactName: 'Rahul Mehta',
    email: `venue_11c_${customRunId}@convention.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Mumbai Convention Centre',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const supplierUser: User = {
    id: `usr_sup_11c_${customRunId}`,
    publicAccountId: `AB-SUP-11C-${customRunId}`,
    contactName: 'Vikram Joshi',
    email: `supplier_11c_${customRunId}@punebottlers.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'Pune Eco Bottlers Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const logisticsPartner: User = {
    id: `usr_log_11c_${customRunId}`,
    publicAccountId: `AB-LOG-11C-${customRunId}`,
    contactName: 'Sunil Shinde',
    email: `logistics_11c_${customRunId}@swiftindia.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'Swift India Freight Express',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const adminUser: User = {
    id: `usr_adm_11c_${customRunId}`,
    publicAccountId: `AB-ADM-11C-${customRunId}`,
    contactName: 'Compliance Admin',
    email: `admin_11c_${customRunId}@aquabloom.example`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom HQ Compliance',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  const externalAdvertiser: User = {
    id: `usr_adv_ext_${customRunId}`,
    publicAccountId: `AB-ADV-EXT-${customRunId}`,
    contactName: 'External Lead',
    email: `external_11c_${customRunId}@otherbrand.example`,
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

  // Profiles
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

  // Admin approval updates
  db.updateApprovalStatus(supplierUser.id, 'APPROVED', adminUser.id, 'Verified bottling facility');
  db.updateApprovalStatus(logisticsPartner.id, 'APPROVED', adminUser.id, 'Verified freight fleet');

  // Supplier Product (Unit Price: ₹24.50)
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
        capType: 'Screw Cap',
        bottleFinish: 'Matte White Powder Coat',
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

  // Campaign
  const campaign: any = {
    id: `cmp_11c_${customRunId}`,
    publicCampaignId: `AB-CMP-11C-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Aura Maharashtra Q4 Launch',
    status: 'ACTIVE',
    versionNumber: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveCampaign(campaign);

  // Proposal
  const proposal: any = {
    id: `prp_11c_${customRunId}`,
    publicProposalId: `AB-PRP-11C-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_11c_${customRunId}`,
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
        stagingInstructions: 'Gate 3 bay',
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

  // Locked Campaign Agreement
  const agreementId = `cag_11c_${customRunId}`;
  const agreementPublicId = `AB-CAG-11C-${customRunId}`;
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
    currentVersionId: `cgv_11c_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-11C-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-11C-${customRunId}`,
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

  // Snapshot
  // Snapshot
  const agreementSnapshot = AgreementSnapshotService.createSnapshot(agreement, adminUser);

  // Assess Order Readiness
  const { orderReadiness: validatedReadiness } = OrderReadinessService.assessOrderReadiness(agreement.id, adminUser);

  // Supplier Offer & Assignment
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

  // Logistics Offer & Assignment
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
    advertiserUser,
    venueUser,
    supplierUser,
    logisticsPartner,
    adminUser,
    externalAdvertiser,
    orderReadiness: validatedReadiness,
    supplierAssignment,
    logisticsAssignment,
    lockedAgreement: agreement,
    agreementSnapshot,
    pricingResult,
  };
}

export async function runStep11CTests(): Promise<void> {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 11C: IMMUTABLE PRICING SNAPSHOT & PAYMENT READINESS');
  console.log('=============================================================');

  const runId = Math.random().toString(36).substring(2, 8);
  const ctx = setupTestPipeline(runId);

  // 1. Create Order via OrderService
  const order = await OrderService.createOrder(
    { orderReadinessId: ctx.orderReadiness.id, idempotencyKey: `idemp_11c_${runId}` },
    ctx.advertiserUser
  );

  console.log(`✅ Order created successfully: ${order.publicId}`);

  // ---------------------------------------------------------------------------
  // TEST 1: Snapshot Creation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 1: Snapshot Creation & Preserved Fields ---');
  {
    const snapshot = OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.advertiserUser);
    assert.ok(snapshot, 'Order pricing snapshot must exist');
    assert.ok(snapshot.id.startsWith('ops_'), 'ID must start with ops_');
    assert.ok(snapshot.publicId.startsWith('AB-OPS-'), 'Public ID must follow AB-OPS format');
    assert.strictEqual(snapshot.orderId, order.id);
    assert.strictEqual(snapshot.orderPublicId, order.publicId);
    assert.strictEqual(snapshot.currency, 'INR');
    assert.strictEqual(snapshot.contractedQuantity, ctx.pricingResult.sourceReferences.contractedQuantity);

    // Verify Product Price preservation
    assert.strictEqual(snapshot.productPrice.unitPriceMinor, ctx.pricingResult.productUnitPrice.amountMinor);
    assert.strictEqual(snapshot.productPrice.productPriceTotalMinor, ctx.pricingResult.productPriceTotalMinor);
    assert.strictEqual(snapshot.productPrice.productPriceTotalFormatted, ctx.pricingResult.productPriceTotalFormatted);

    // Verify Logistics Cost preservation
    assert.strictEqual(snapshot.logisticsCost.logisticsCostTotalMinor, ctx.pricingResult.logisticsCostTotalMinor);
    assert.strictEqual(snapshot.logisticsCost.logisticsCostTotalFormatted, ctx.pricingResult.logisticsCostTotalFormatted);

    // Verify Taxable Amount preservation
    assert.strictEqual(snapshot.taxableAmount.taxableAmountMinor, ctx.pricingResult.taxableAmountMinor);

    // Verify Taxes preservation
    assert.strictEqual(snapshot.taxes.totalTaxMinor, ctx.pricingResult.taxes.totalTaxMinor);
    assert.strictEqual(snapshot.taxes.totalTaxFormatted, ctx.pricingResult.taxes.totalTaxFormatted);
    assert.strictEqual(snapshot.taxes.jurisdiction.originState, ctx.pricingResult.taxes.jurisdiction.originState);
    assert.strictEqual(snapshot.taxes.jurisdiction.destinationState, ctx.pricingResult.taxes.jurisdiction.destinationState);
    assert.strictEqual(snapshot.taxes.jurisdiction.isInterState, ctx.pricingResult.taxes.jurisdiction.isInterState);
    assert.strictEqual(snapshot.taxes.taxComponents.length, ctx.pricingResult.taxes.taxComponents.length);

    // Verify Grand Total
    assert.strictEqual(snapshot.grandTotal.amountMinor, ctx.pricingResult.grandTotalMinor);
    assert.strictEqual(snapshot.grandTotal.amountFormatted, ctx.pricingResult.grandTotalFormatted);

    // Verify Product and Logistics version tracking
    assert.strictEqual(snapshot.productPricingVersion.productId, ctx.supplierAssignment.productId);
    assert.strictEqual(snapshot.productPricingVersion.productVersionId, ctx.supplierAssignment.productVersionId);
    assert.strictEqual(snapshot.logisticsOfferVersion.logisticsAssignmentId, ctx.logisticsAssignment.id);
    assert.strictEqual(snapshot.taxConfigurationVersion.taxEngineVersion, 'GST_IN_V1');

    assert.strictEqual(snapshot.isFrozen, true);
    assert.ok(snapshot.frozenAt);
    assert.ok(snapshot.calculationReferenceId);

    console.log('✅ Test 1 passed: Snapshot created preserving all 12 required authoritative fields.');
  }

  // ---------------------------------------------------------------------------
  // TEST 2: Immutability Enforcement
  // ---------------------------------------------------------------------------
  console.log('--- TEST 2: Immutability Enforcement ---');
  {
    const snapshot = OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.advertiserUser);

    // Verify object is frozen
    assert.strictEqual(Object.isFrozen(snapshot), true, 'Snapshot root must be frozen');
    assert.strictEqual(Object.isFrozen(snapshot.grandTotal), true, 'grandTotal object must be frozen');
    assert.strictEqual(Object.isFrozen(snapshot.productPrice), true, 'productPrice object must be frozen');
    assert.strictEqual(Object.isFrozen(snapshot.taxes), true, 'taxes object must be frozen');

    // Attempting mutation in strict mode throws TypeError
    assert.throws(
      () => {
        (snapshot as any).grandTotal.amountMinor = 1000;
      },
      TypeError,
      'Mutating frozen grandTotal must throw TypeError'
    );

    assert.throws(
      () => {
        (snapshot as any).currency = 'USD';
      },
      TypeError,
      'Mutating frozen root property must throw TypeError'
    );

    // Attempting to overwrite stored snapshot with altered numbers via DB throws ConflictError
    const clonedTampered = JSON.parse(JSON.stringify(snapshot));
    clonedTampered.grandTotal.amountMinor = 999999;
    assert.throws(
      () => {
        db.saveOrderPricingSnapshot(clonedTampered);
      },
      (err: any) => err instanceof ConflictError && err.message.includes('strictly immutable'),
      'Overwriting snapshot in database with different financial values must throw ConflictError'
    );

    // Re-verify stored snapshot remains pristine
    const pristineSnapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    assert.strictEqual(pristineSnapshot?.grandTotal.amountMinor, ctx.pricingResult.grandTotalMinor);

    console.log('✅ Test 2 passed: Immutability enforced at runtime, object graph, and database levels.');
  }

  // ---------------------------------------------------------------------------
  // TEST 3: Correct Authoritative Payment Amount
  // ---------------------------------------------------------------------------
  console.log('--- TEST 3: Authoritative Payment Amount Resolution ---');
  {
    const paymentAmount = PaymentReadinessService.getAuthoritativePaymentAmount(order.id, ctx.advertiserUser);
    assert.strictEqual(paymentAmount.amountMinor, ctx.pricingResult.grandTotalMinor);
    assert.strictEqual(paymentAmount.amountFormatted, ctx.pricingResult.grandTotalFormatted);
    assert.strictEqual(paymentAmount.currency, 'INR');
    assert.strictEqual(paymentAmount.isFrozen, true);
    assert.strictEqual(paymentAmount.orderPublicId, order.publicId);

    // Verify Payment Readiness record
    const readiness = PaymentReadinessService.getPaymentReadiness(order.id, ctx.advertiserUser);
    assert.ok(readiness.id.startsWith('opr_'));
    assert.ok(readiness.publicId.startsWith('AB-OPR-'));
    assert.strictEqual(readiness.status, 'READY_FOR_PAYMENT');
    assert.strictEqual(readiness.amount.amountMinor, ctx.pricingResult.grandTotalMinor);
    assert.strictEqual(readiness.amount.amountFormatted, ctx.pricingResult.grandTotalFormatted);
    assert.strictEqual(readiness.currency, 'INR');
    assert.strictEqual(readiness.boundaries.paymentInitiated, false);
    assert.strictEqual(readiness.boundaries.paymentCompleted, false);

    // Verify Advertiser breakdown view
    const advertiserView = PaymentReadinessService.getAdvertiserPaymentView(order.id, ctx.advertiserUser);
    assert.strictEqual(advertiserView.amountMinor, ctx.pricingResult.grandTotalMinor);
    assert.strictEqual(advertiserView.breakdown.grandTotalFormatted, ctx.pricingResult.grandTotalFormatted);
    assert.strictEqual(advertiserView.breakdown.productPriceTotalFormatted, ctx.pricingResult.productPriceTotalFormatted);
    assert.strictEqual(advertiserView.breakdown.logisticsCostTotalFormatted, ctx.pricingResult.logisticsCostTotalFormatted);
    assert.strictEqual(advertiserView.breakdown.totalTaxFormatted, ctx.pricingResult.taxes.totalTaxFormatted);

    console.log('✅ Test 3 passed: Authoritative payment amount matches grand total with full breakdown.');
  }

  // ---------------------------------------------------------------------------
  // TEST 4: Later Product Price Change Does Not Modify Snapshot
  // ---------------------------------------------------------------------------
  console.log('--- TEST 4: Later Product Price Change Protection ---');
  {
    const initialPaymentAmount = PaymentReadinessService.getAuthoritativePaymentAmount(order.id, ctx.advertiserUser);

    // Supplier attempts to increase product customer-facing price drastically to ₹75.00
    const { product: updatedProduct, version: v2 } = db.createProductVersion(
      ctx.supplierAssignment.productId,
      {
        customerFacingPrice: { amount: 75.0, currency: 'INR' },
        supplierInternalCost: { amount: 40.0, currency: 'INR' },
        changeReason: 'Raw material aluminum cost surge',
        minimumOrderQuantity: 5000,
        productionLeadTime: { value: 14, unit: 'DAYS' },
      },
      ctx.supplierUser.id
    );

    // Retrieve snapshot and authoritative payment amount again
    const postChangePaymentAmount = PaymentReadinessService.getAuthoritativePaymentAmount(order.id, ctx.advertiserUser);
    const postChangeSnapshot = OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.advertiserUser);

    assert.strictEqual(
      postChangePaymentAmount.amountMinor,
      initialPaymentAmount.amountMinor,
      'Payment amount must remain exactly original locked amount regardless of later supplier price increase'
    );
    assert.strictEqual(
      postChangeSnapshot.productPrice.productPriceTotalMinor,
      ctx.pricingResult.productPriceTotalMinor,
      'Product price total must remain original'
    );
    assert.strictEqual(
      postChangeSnapshot.productPricingVersion.productVersionNumber,
      1,
      'Preserved product version number must remain 1'
    );

    console.log('✅ Test 4 passed: Later product price surge had ZERO impact on locked snapshot.');
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Later Logistics Price Change Does Not Modify Snapshot
  // ---------------------------------------------------------------------------
  console.log('--- TEST 5: Later Logistics Price Change Protection ---');
  {
    // Logistics partner creates new rate card or attempts to double logistics cost to ₹50,000
    const logisticsAssignment = db.getLogisticsAssignmentById(ctx.logisticsAssignment.id);
    assert.ok(logisticsAssignment);

    // Mutate mutable records in the DB
    (logisticsAssignment as any).lockedOperationalSnapshot.costInput.logisticsCostMinor = 5000000;
    (logisticsAssignment as any).lockedOperationalSnapshot.costInput.currency = 'INR';
    db.saveLogisticsAssignment(logisticsAssignment);

    // Retrieve snapshot and payment amount
    const postLogisticsChangeAmount = PaymentReadinessService.getAuthoritativePaymentAmount(order.id, ctx.advertiserUser);
    const postLogisticsSnapshot = OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.advertiserUser);

    assert.strictEqual(
      postLogisticsChangeAmount.amountMinor,
      ctx.pricingResult.grandTotalMinor,
      'Payment amount must remain strictly original despite external logistics cost increase'
    );
    assert.strictEqual(
      postLogisticsSnapshot.logisticsCost.logisticsCostTotalMinor,
      ctx.pricingResult.logisticsCostTotalMinor,
      'Logistics cost total must remain original'
    );

    console.log('✅ Test 5 passed: Later logistics price change had ZERO impact on locked snapshot.');
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Unauthorized Access & Counterparty Security Isolation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 6: Counterparty Security Isolation ---');
  {
    // 1. Supplier MUST NOT see advertiser grand total or payment readiness
    assert.throws(
      () => {
        OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.supplierUser);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Supplier partners are strictly prohibited'),
      'Supplier must be denied access to OrderPricingSnapshot'
    );

    assert.throws(
      () => {
        PaymentReadinessService.getPaymentReadiness(order.id, ctx.supplierUser);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Suppliers cannot view advertiser payment readiness'),
      'Supplier must be denied access to PaymentReadiness'
    );

    // 2. Venue MUST NOT see advertiser grand total or supplier cost base
    assert.throws(
      () => {
        OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.venueUser);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Venues are strictly prohibited'),
      'Venue must be denied access to OrderPricingSnapshot'
    );

    assert.throws(
      () => {
        PaymentReadinessService.getPaymentReadiness(order.id, ctx.venueUser);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('Venues cannot view advertiser payment readiness'),
      'Venue must be denied access to PaymentReadiness'
    );

    // 3. Unrelated external advertiser MUST NOT see this order
    assert.throws(
      () => {
        OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.externalAdvertiser);
      },
      (err: any) => err instanceof AuthorizationError && err.message.includes('You do not own Order'),
      'External advertiser must be denied access to OrderPricingSnapshot'
    );

    // 4. Admin CAN see it
    const adminSnapshot = OrderPricingSnapshotEngine.getSnapshot(order.id, ctx.adminUser);
    assert.strictEqual(adminSnapshot.grandTotal.amountMinor, ctx.pricingResult.grandTotalMinor);

    console.log('✅ Test 6 passed: Strict counterparty isolation verified (Suppliers & Venues completely blocked).');
  }

  // ---------------------------------------------------------------------------
  // TEST 7: Duplicate Snapshot Creation Prevention (Idempotency)
  // ---------------------------------------------------------------------------
  console.log('--- TEST 7: Duplicate Snapshot Creation Prevention ---');
  {
    const snapshotCountBefore = db.getAllOrderPricingSnapshots().length;
    const readinessCountBefore = db.getAllOrderPaymentReadiness().length;

    // Call freeze snapshot multiple times
    const snapshotCall1 = OrderPricingSnapshotEngine.freezeSnapshotSync(order.id, ctx.advertiserUser);
    const snapshotCall2 = OrderPricingSnapshotEngine.freezeSnapshotSync(order.id, ctx.advertiserUser);

    assert.strictEqual(snapshotCall1.id, snapshotCall2.id);
    assert.strictEqual(snapshotCall1.publicId, snapshotCall2.publicId);

    // Call assessPaymentReadiness multiple times
    const readiness1 = PaymentReadinessService.assessPaymentReadinessSync(order.id, ctx.advertiserUser);
    const readiness2 = PaymentReadinessService.assessPaymentReadinessSync(order.id, ctx.advertiserUser);

    assert.strictEqual(readiness1.id, readiness2.id);
    assert.strictEqual(readiness1.publicId, readiness2.publicId);

    const snapshotCountAfter = db.getAllOrderPricingSnapshots().length;
    const readinessCountAfter = db.getAllOrderPaymentReadiness().length;

    assert.strictEqual(snapshotCountAfter, snapshotCountBefore, 'No duplicate snapshots created');
    assert.strictEqual(readinessCountAfter, readinessCountBefore, 'No duplicate readiness records created');

    console.log('✅ Test 7 passed: Duplicate snapshot and readiness calls are strictly idempotent.');
  }

  // ---------------------------------------------------------------------------
  // TEST 8: Concurrent Snapshot & Readiness Creation
  // ---------------------------------------------------------------------------
  console.log('--- TEST 8: Concurrent Snapshot & Readiness Creation ---');
  {
    const concurrentRunId = Math.random().toString(36).substring(2, 8);
    const concurrentCtx = setupTestPipeline(concurrentRunId);

    // Use Step 11A pricing
    const pricing = concurrentCtx.pricingResult;

    // Create an un-snapshotted raw order mock for concurrency stress test
    const rawOrderId = `ord_concur_${concurrentRunId}`;
    const rawOrderPublicId = `AB-ORD-CONCUR-${concurrentRunId}`;
    const rawOrder: any = {
      id: rawOrderId,
      publicId: rawOrderPublicId,
      orderReference: `ORD-REF-CONCUR-${concurrentRunId}`,
      status: 'PAYMENT_REQUIRED',
      campaignId: concurrentCtx.orderReadiness.campaignId,
      advertiserId: concurrentCtx.advertiserUser.id,
      venueId: concurrentCtx.venueUser.id,
      supplierAssignmentId: concurrentCtx.supplierAssignment.id,
      logisticsAssignmentId: concurrentCtx.logisticsAssignment.id,
      finalPricingResultId: pricing.id,
      pricing: {
        grandTotalMinor: pricing.grandTotalMinor,
        grandTotalFormatted: pricing.grandTotalFormatted,
      },
      boundaries: { orderCreated: true, paymentInitiated: false },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveOrder(rawOrder);

    // Fire 5 concurrent asynchronous freeze calls
    const freezePromises = [
      OrderPricingSnapshotEngine.freezeSnapshot(rawOrderId, concurrentCtx.advertiserUser),
      OrderPricingSnapshotEngine.freezeSnapshot(rawOrderId, concurrentCtx.advertiserUser),
      OrderPricingSnapshotEngine.freezeSnapshot(rawOrderId, concurrentCtx.advertiserUser),
      OrderPricingSnapshotEngine.freezeSnapshot(rawOrderId, concurrentCtx.advertiserUser),
      OrderPricingSnapshotEngine.freezeSnapshot(rawOrderId, concurrentCtx.advertiserUser),
    ];

    const results = await Promise.all(freezePromises);

    const firstId = results[0].id;
    const firstPublicId = results[0].publicId;

    for (const res of results) {
      assert.strictEqual(res.id, firstId, 'All concurrent freezes must resolve to the identical snapshot ID');
      assert.strictEqual(res.publicId, firstPublicId, 'All concurrent freezes must resolve to the identical public ID');
      assert.strictEqual(res.grandTotal.amountMinor, pricing.grandTotalMinor);
    }

    // Fire 5 concurrent payment readiness assessment calls
    const readinessPromises = [
      PaymentReadinessService.assessPaymentReadiness(rawOrderId, concurrentCtx.advertiserUser),
      PaymentReadinessService.assessPaymentReadiness(rawOrderId, concurrentCtx.advertiserUser),
      PaymentReadinessService.assessPaymentReadiness(rawOrderId, concurrentCtx.advertiserUser),
      PaymentReadinessService.assessPaymentReadiness(rawOrderId, concurrentCtx.advertiserUser),
      PaymentReadinessService.assessPaymentReadiness(rawOrderId, concurrentCtx.advertiserUser),
    ];

    const readinessResults = await Promise.all(readinessPromises);
    const firstReadinessId = readinessResults[0].id;

    for (const r of readinessResults) {
      assert.strictEqual(r.id, firstReadinessId, 'All concurrent readiness assessments must resolve to the identical ID');
      assert.strictEqual(r.status, 'READY_FOR_PAYMENT');
      assert.strictEqual(r.amount.amountMinor, pricing.grandTotalMinor);
    }

    console.log('✅ Test 8 passed: 5 concurrent freeze & readiness calls resolved atomically without race conditions.');
  }

  console.log('=============================================================');
  console.log('ALL 8 STEP 11C TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('=============================================================');
  process.exit(0);
}

// Run directly
runStep11CTests().catch((err) => {
  console.error('❌ Step 11C test failed:', err);
  process.exit(1);
});
