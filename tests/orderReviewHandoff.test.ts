/**
 * AQUABLOOM — STEP 11D TEST SUITE
 * Advertiser Order Review & Payment Handoff
 * 
 * Verifies:
 * 1. Correct Order displayed
 * 2. Correct price displayed (Product Price + Logistics + Applicable Taxes = Total; no Label Fee)
 * 3. Correct quantity
 * 4. Correct campaign/venue
 * 5. Correct payment status ("PAYMENT REQUIRED")
 * 6. Correct payment handoff (hands off to Step 12 payment architecture)
 * 7. Unauthorized access blocked (direct URL access using another Advertiser account)
 * 8. Snapshot amount matches displayed total
 */

import assert from 'node:assert';
import { db } from '../src/server/db.js';
import { FinalPricingEngine } from '../src/server/finalPricingServices.js';
import { OrderService, OrderReviewService } from '../src/server/orderServices.js';
import { OrderReadinessService } from '../src/server/orderReadinessServices.js';
import { AgreementSnapshotService } from '../src/server/agreementServices.js';
import { SupplierOperationalOfferService } from '../src/server/supplierAssignmentServices.js';
import { LogisticsOperationalOfferService } from '../src/server/logisticsAssignmentServices.js';
import {
  OrderPricingSnapshotEngine,
  PaymentReadinessService,
} from '../src/server/paymentReadinessServices.js';
import { generateBusinessId } from '../src/lib/idGenerator.js';
import { AuthorizationError, AuthenticationError, ValidationError } from '../src/lib/errors.js';
import type {
  User,
  Order,
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
    id: `usr_adv_11d_${customRunId}`,
    publicAccountId: `AB-ADV-11D-${customRunId}`,
    contactName: 'Sarah Jenkins',
    email: `advertiser_11d_${customRunId}@aurabev.example`,
    role: 'ADVERTISER',
    status: 'ACTIVE',
    organizationName: 'Aura Beverages India Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const venueUser: User = {
    id: `usr_ven_11d_${customRunId}`,
    publicAccountId: `AB-VEN-11D-${customRunId}`,
    contactName: 'Vikram Mehta',
    email: `venue_11d_${customRunId}@mumbaicentre.example`,
    role: 'VENUE',
    status: 'ACTIVE',
    organizationName: 'Mumbai Convention Centre',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const supplierUser: User = {
    id: `usr_sup_11d_${customRunId}`,
    publicAccountId: `AB-SUP-11D-${customRunId}`,
    contactName: 'Rajesh Sharma',
    email: `supplier_11d_${customRunId}@punebottlers.example`,
    role: 'SUPPLIER',
    status: 'ACTIVE',
    organizationName: 'Pune Eco Bottlers Pvt Ltd',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const logisticsPartner: User = {
    id: `usr_log_11d_${customRunId}`,
    publicAccountId: `AB-LOG-11D-${customRunId}`,
    contactName: 'Anita Rao',
    email: `logistics_11d_${customRunId}@swiftindia.example`,
    role: 'LOGISTICS_PARTNER',
    status: 'ACTIVE',
    organizationName: 'Swift India Freight Express',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const adminUser: User = {
    id: `usr_adm_11d_${customRunId}`,
    publicAccountId: `AB-ADM-11D-${customRunId}`,
    contactName: 'Devon Vance',
    email: `admin_11d_${customRunId}@aquabloom.internal`,
    role: 'ADMIN',
    status: 'ACTIVE',
    organizationName: 'AquaBloom Global Operations',
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const externalAdvertiser: User = {
    id: `usr_adv_oth_11d_${customRunId}`,
    publicAccountId: `AB-ADV-OTH-11D-${customRunId}`,
    contactName: 'Michael Chang',
    email: `external_11d_${customRunId}@otherbrand.example`,
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
    id: `cmp_11d_${customRunId}`,
    publicCampaignId: `AB-CMP-11D-${customRunId}`,
    advertiserId: advertiserUser.id,
    name: 'Aura Maharashtra Q4 Launch',
    status: 'ACTIVE',
    versionNumber: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  db.saveCampaign(campaign);

  // 5. Proposal
  const proposal: any = {
    id: `prp_11d_${customRunId}`,
    publicProposalId: `AB-PRP-11D-${customRunId}`,
    campaignId: campaign.id,
    advertiserId: advertiserUser.id,
    venueId: venueUser.id,
    initiatorRole: 'ADVERTISER',
    status: 'ACCEPTED',
    activeVersionNumber: 1,
    activeVersionId: `prv_11d_${customRunId}`,
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

  // 6. Locked Campaign Agreement
  const agreementId = `cag_11d_${customRunId}`;
  const agreementPublicId = `AB-CAG-11D-${customRunId}`;
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
    currentVersionId: `cgv_11d_v1_${customRunId}`,
    currentVersionNumber: 1,
    lockVersion: 1,
    lockedAt: nowIso,
    lockedBy: adminUser.id,
    lockedSnapshotId: `AB-CGS-11D-${customRunId}`,
    cancellationPolicyId: 'standard_cancellation_policy_v1',
    renewalPolicyId: 'explicit_approval_renewal_v1',
    agreementReference: `AGR-REF-11D-${customRunId}`,
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

  // 10. Step 11A Final Pricing
  const pricingResult = FinalPricingEngine.calculateFinalPricing(validatedReadiness.id, adminUser);

  // 11. Step 11B Order Creation
  const order = OrderService.createOrderSync(
    { orderReadinessId: validatedReadiness.id, idempotencyKey: `ord_idem_11d_${customRunId}` },
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

async function runStep11DTests(): Promise<void> {
  console.log('=============================================================');
  console.log('STARTING AQUABLOOM STEP 11D: ADVERTISER ORDER REVIEW & HANDOFF');
  console.log('=============================================================');

  const runId = Math.random().toString(36).substring(2, 8);
  const ctx = setupTestPipeline(runId);

  // ========================================================
  // TEST 1: Correct Order Displayed
  // ========================================================
  console.log('--- TEST 1: Correct Order Displayed ---');
  const review = OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.advertiserUser);

  assert.strictEqual(review.orderId, ctx.order.id, 'Order ID must match exactly');
  assert.strictEqual(review.publicId, ctx.order.publicId, 'Order public ID must match');
  assert.strictEqual(review.orderReference, ctx.order.orderReference, 'Order reference must match');
  assert(review.publicId.startsWith('AB-ORD-'), 'Order public ID must have valid AB-ORD- prefix');
  assert(review.createdAt, 'Created timestamp must exist');
  console.log(`✅ TEST 1 PASSED: Correct Order displayed (${review.publicId} / ${review.orderReference}).`);

  // ========================================================
  // TEST 2: Correct Price Displayed (Formula: Product + Logistics + Taxes = Total; No Label Fee)
  // ========================================================
  console.log('--- TEST 2: Correct Price Displayed (Formula & No Label Fee) ---');
  const pricing = review.pricing;

  // Assert individual formula components
  assert.strictEqual(pricing.currency, 'INR', 'Currency must be INR');
  assert.strictEqual(typeof pricing.productPriceTotalFormatted, 'string', 'Product price must be formatted');
  assert.strictEqual(typeof pricing.logisticsCostTotalFormatted, 'string', 'Logistics cost must be formatted');
  assert.strictEqual(typeof pricing.applicableTaxesFormatted, 'string', 'Applicable taxes must be formatted');
  assert.strictEqual(typeof pricing.grandTotalFormatted, 'string', 'Grand total must be formatted');

  // Verify math: Product + Logistics + Taxes = Grand Total
  const mathSumMinor = pricing.productPriceTotalMinor + pricing.logisticsCostTotalMinor + pricing.applicableTaxesMinor;
  assert.strictEqual(mathSumMinor, pricing.grandTotalMinor, 'Grand total minor must equal sum of product + logistics + taxes');

  // Explicit test: No Label Fee
  assert.strictEqual((review as any).labelFee, undefined, 'No separate Label Fee must be present on review');
  assert.strictEqual((pricing as any).labelFee, undefined, 'No separate Label Fee must be present on pricing');
  assert.strictEqual((pricing as any).labelFeeMinor, undefined, 'No label fee minor allowed');

  // Verify that confidential financial information is NOT exposed
  assert.strictEqual((pricing as any).supplierBaseCostMinor, undefined, 'Supplier internal cost must NOT be exposed');
  assert.strictEqual((pricing as any).aquabloomMarginMinor, undefined, 'AquaBloom margin must NOT be exposed');
  assert.strictEqual((pricing as any).venueCompensationMinor, undefined, 'Venue compensation must NOT be exposed');

  console.log(`✅ TEST 2 PASSED: Price formula verified: ${pricing.productPriceTotalFormatted} + ${pricing.logisticsCostTotalFormatted} + ${pricing.applicableTaxesFormatted} = ${pricing.grandTotalFormatted} (No Label Fee, no internal margins).`);

  // ========================================================
  // TEST 3: Correct Quantity Displayed
  // ========================================================
  console.log('--- TEST 3: Correct Quantity Displayed ---');
  assert.strictEqual(review.contractedQuantity, 10000, 'Contracted quantity must be 10,000 units');
  assert.strictEqual(
    review.contractedQuantity,
    ctx.lockedAgreement.terms.campaignQuantity,
    'Contracted quantity must match commercial agreement'
  );
  console.log(`✅ TEST 3 PASSED: Correct contracted quantity displayed (${review.contractedQuantity.toLocaleString()} bottles).`);

  // ========================================================
  // TEST 4: Correct Campaign and Venue Information Displayed
  // ========================================================
  console.log('--- TEST 4: Correct Campaign and Venue Displayed ---');
  assert.strictEqual(review.campaign.name, 'Aura Maharashtra Q4 Launch', 'Campaign name must match');
  assert.strictEqual(review.campaign.publicId, ctx.lockedAgreement.campaignPublicId, 'Campaign public ID must match');
  assert.strictEqual(review.venue.name, 'Mumbai Convention Centre', 'Venue name must match');
  assert.strictEqual(review.venue.publicId, ctx.lockedAgreement.venuePublicId, 'Venue public ID must match');
  assert.strictEqual(review.venue.city, 'Mumbai', 'Venue city must match profile address');

  // Also check product configuration and logistics staging
  assert.strictEqual(review.product.specifications.bottleMaterial, 'Aluminum', 'Material must match');
  assert.strictEqual(review.product.specifications.bottleCapacityMl, 500, 'Capacity ml must match');
  assert.strictEqual(review.logistics.partnerBusinessName, 'Swift India Freight Express', 'Logistics partner must match');
  assert.strictEqual(review.logistics.deliveryAddress, (ctx.lockedAgreement.terms.deliveryTermsKnown as any).deliveryAddress, 'Delivery address must match');
  console.log('✅ TEST 4 PASSED: Correct campaign, venue, product, and delivery staging displayed.');

  // ========================================================
  // TEST 5: Correct Payment Status ("PAYMENT REQUIRED")
  // ========================================================
  console.log('--- TEST 5: Correct Payment Status ---');
  assert.strictEqual(review.status, 'PAYMENT_REQUIRED', 'Order status must be PAYMENT_REQUIRED');
  assert.strictEqual(review.payment.status, 'PAYMENT REQUIRED', 'Payment status label must be PAYMENT REQUIRED');
  assert.strictEqual(review.payment.canProceedToPayment, true, 'canProceedToPayment flag must be true');

  // Verify authoritative payment amount matches OrderPricingSnapshot.grandTotal
  const snapshot = db.getOrderPricingSnapshotByOrderId(ctx.order.id);
  assert(snapshot, 'Snapshot must exist');
  assert.strictEqual(
    review.payment.authoritativeAmountFormatted,
    snapshot.grandTotal.amountFormatted,
    'Payment authoritative amount must match OrderPricingSnapshot.grandTotal formatted'
  );
  assert.strictEqual(
    review.payment.authoritativeAmountMinor,
    snapshot.grandTotal.amountMinor,
    'Payment authoritative amount minor must match OrderPricingSnapshot.grandTotal.amountMinor'
  );
  console.log(`✅ TEST 5 PASSED: Payment status is 'PAYMENT REQUIRED' with authoritative amount ${review.payment.authoritativeAmountFormatted}.`);

  // ========================================================
  // TEST 6: Correct Payment Handoff (Hands off to Step 12 Payment Architecture)
  // ========================================================
  console.log('--- TEST 6: Correct Payment Handoff to Step 12 ---');
  const handoff = OrderReviewService.initiatePaymentHandoff(ctx.order.id, ctx.advertiserUser);

  assert.strictEqual(handoff.orderId, ctx.order.id, 'Handoff orderId must match');
  assert.strictEqual(handoff.orderPublicId, ctx.order.publicId, 'Handoff orderPublicId must match');
  assert.strictEqual(handoff.status, 'HANDOFF_TO_PAYMENT_GATEWAY', 'Status must be HANDOFF_TO_PAYMENT_GATEWAY');
  assert.strictEqual(handoff.nextStep, 'STEP_12_PAYMENT_GATEWAY', 'Next step must be STEP_12_PAYMENT_GATEWAY');
  assert.strictEqual(
    handoff.authoritativeAmount.amountMinor,
    snapshot.grandTotal.amountMinor,
    'Handoff amount minor must match snapshot grandTotal'
  );
  assert.strictEqual(
    handoff.authoritativeAmount.amountFormatted,
    snapshot.grandTotal.amountFormatted,
    'Handoff amount formatted must match snapshot grandTotal'
  );
  assert(handoff.handoffTimestamp, 'Handoff timestamp must be recorded');

  // Verify audit event was logged
  const events = db.getEvents();
  const handoffEvent = events.find(
    (e) => e.eventType === 'ORDER_PAYMENT_HANDOFF_INITIATED' && e.payload?.orderId === ctx.order.id
  );
  assert(handoffEvent, 'ORDER_PAYMENT_HANDOFF_INITIATED business timeline event must be dispatched');
  assert.strictEqual(handoffEvent.userId, ctx.advertiserUser.id, 'Event actor must be advertiser');

  console.log(`✅ TEST 6 PASSED: Payment handoff initiated to Step 12 with exact authoritative snapshot total (${handoff.authoritativeAmount.amountFormatted}).`);

  // ========================================================
  // TEST 7: Unauthorized Access Blocked
  // ========================================================
  console.log('--- TEST 7: Unauthorized Access Blocked ---');

  // 7a. Direct access using another Advertiser account
  assert.throws(
    () => {
      OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.externalAdvertiser);
    },
    (err: any) => {
      assert(err instanceof AuthorizationError, 'Must throw AuthorizationError');
      assert(err.message.includes('Access denied'), 'Message must indicate access denied');
      return true;
    },
    'External advertiser must be blocked with AuthorizationError'
  );

  // 7b. Direct payment handoff by another Advertiser account
  assert.throws(
    () => {
      OrderReviewService.initiatePaymentHandoff(ctx.order.id, ctx.externalAdvertiser);
    },
    (err: any) => {
      assert(err instanceof AuthorizationError, 'Must throw AuthorizationError');
      return true;
    },
    'External advertiser payment handoff must be blocked'
  );

  // 7c. Direct access by Venue
  assert.throws(
    () => {
      OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.venueUser);
    },
    (err: any) => {
      assert(err instanceof AuthorizationError, 'Must throw AuthorizationError');
      return true;
    },
    'Venue must be blocked from reviewing advertiser order financial details'
  );

  // 7d. Direct access by Supplier
  assert.throws(
    () => {
      OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.supplierUser);
    },
    (err: any) => {
      assert(err instanceof AuthorizationError, 'Must throw AuthorizationError');
      return true;
    },
    'Supplier must be blocked from reviewing advertiser order financial details'
  );

  // 7e. Direct access by Logistics Partner
  assert.throws(
    () => {
      OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.logisticsPartner);
    },
    (err: any) => {
      assert(err instanceof AuthorizationError, 'Must throw AuthorizationError');
      return true;
    },
    'Logistics partner must be blocked from reviewing advertiser order financial details'
  );

  // 7f. Admin can review for operational oversight
  const adminReview = OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.adminUser);
  assert.strictEqual(adminReview.orderId, ctx.order.id, 'Admin must be permitted to view for compliance oversight');

  // Verify access denied security events were dispatched
  const accessDeniedEvents = db.getEvents().filter((e) => e.eventType === 'ORDER_ACCESS_DENIED');
  assert(accessDeniedEvents.length >= 4, 'ORDER_ACCESS_DENIED audit events must be logged for unauthorized attempts');

  console.log('✅ TEST 7 PASSED: Unauthorized access strictly blocked for external advertisers, venues, suppliers, and logistics.');

  // ========================================================
  // TEST 8: Snapshot Amount Matches Displayed Total (Zero Float Divergence & Price Change Proof)
  // ========================================================
  console.log('--- TEST 8: Snapshot Amount Matches Displayed Total ---');

  // 8a. Direct assertion between snapshot and review
  assert.strictEqual(
    review.pricing.grandTotalMinor,
    snapshot.grandTotal.amountMinor,
    'Displayed grand total minor must equal OrderPricingSnapshot.grandTotal.amountMinor'
  );
  assert.strictEqual(
    review.pricing.grandTotalFormatted,
    snapshot.grandTotal.amountFormatted,
    'Displayed grand total formatted must equal OrderPricingSnapshot.grandTotal.amountFormatted'
  );

  // 8b. Simulate Supplier product price modification in database AFTER order creation
  db.createProductVersion(
    ctx.supplierAssignment.productId,
    {
      customerFacingPrice: { amount: 85.0, currency: 'INR' },
      supplierInternalCost: { amount: 50.0, currency: 'INR' },
      changeReason: 'Aluminum raw material cost surge',
      minimumOrderQuantity: 5000,
      productionLeadTime: { value: 14, unit: 'DAYS' },
    },
    ctx.supplierUser.id
  );

  // 8c. Simulate Logistics operational rate modification
  const logisticsAssignment = db.getLogisticsAssignmentById(ctx.logisticsAssignment.id);
  if (logisticsAssignment) {
    (logisticsAssignment as any).lockedOperationalSnapshot.costInput.logisticsCostMinor = 9900000;
  }

  // 8d. Re-fetch review and ensure snapshot price remains 100% frozen and identical
  const postChangeReview = OrderReviewService.getAdvertiserOrderReview(ctx.order.id, ctx.advertiserUser);

  assert.strictEqual(
    postChangeReview.pricing.grandTotalMinor,
    snapshot.grandTotal.amountMinor,
    'Grand total must remain completely unaffected by supplier catalog price change'
  );
  assert.strictEqual(
    postChangeReview.pricing.productPriceTotalMinor,
    snapshot.productPrice.productPriceTotalMinor,
    'Product price total must remain completely unaffected by catalog price change'
  );
  assert.strictEqual(
    postChangeReview.pricing.logisticsCostTotalMinor,
    snapshot.logisticsCost.logisticsCostTotalMinor,
    'Logistics cost total must remain completely unaffected by logistics price changes'
  );

  // 8e. Also check payment handoff authoritative amount after price tampering
  const postChangeHandoff = OrderReviewService.initiatePaymentHandoff(ctx.order.id, ctx.advertiserUser);
  assert.strictEqual(
    postChangeHandoff.authoritativeAmount.amountMinor,
    snapshot.grandTotal.amountMinor,
    'Handoff amount must remain identical to locked snapshot total'
  );

  console.log(`✅ TEST 8 PASSED: Displayed total ${postChangeReview.pricing.grandTotalFormatted} matches snapshot amount with zero divergence, and is strictly immune to upstream catalog and tariff modifications.`);

  console.log('\n=============================================================');
  console.log('ALL STEP 11D TESTS COMPLETED SUCCESSFULLY!');
  console.log('=============================================================');
}

runStep11DTests().catch((err) => {
  console.error('STEP 11D TEST FAILED:', err);
  process.exit(1);
});
