/**
 * AQUABLOOM STEP 12E: FINANCIAL LEDGER FOUNDATION & VENUE COMPENSATION
 * 
 * Objective:
 * Create the internal financial ledger foundation after verified payment.
 * AquaBloom is the payment collection point.
 * Advertiser does NOT directly pay:
 * - Supplier
 * - Venue
 * - Logistics Partner
 * 
 * Authoritative Money Flow:
 * ADVERTISER
 *      ↓ (Payment received: ₹ Grand Total)
 * AQUABLOOM PLATFORM
 *      ↓ (Authoritative Double-Entry Financial Ledger)
 * ├── Supplier settlement accrual (bottle production cost)
 * ├── Venue compensation accrual (bottle advertising cost * rate %, max 12.5%)
 * ├── Logistics settlement accrual (freight delivery cost)
 * ├── Statutory Tax liability accrual (GST CGST/SGST/IGST)
 * └── AquaBloom operating revenue / gross margin
 * 
 * Safeguards:
 * 1. Payment Entry Rule:
 *    - ONLY create ledger entries after verified payment (Payment = PAID).
 *    - NEVER create ledger entries because payment screen opened, button clicked, or PaymentAttempt created.
 * 2. Idempotency:
 *    - Repeated calls return existing ledger records without creating duplicates.
 * 3. Venue Compensation:
 *    - Eligible base is strictly the supplier bottle advertising cost (product price total).
 *    - Strictly excludes: advertiser plan fees, logistics, taxes, and unrelated charges.
 *    - Strictly capped at statutory maximum of 12.5%.
 *    - For recurring orders, calculated independently per renewal.
 * 4. Visibility & Data Isolation:
 *    - Venue sees ONLY their compensation amount, status, and expected settlement info.
 *    - Venue NEVER sees: advertiser payment amount, payment method, advertiser transaction details,
 *      supplier internal cost, logistics cost, or AquaBloom margin.
 *    - Supplier/logistics internal financial information remains protected.
 * 5. Important:
 *    - Do NOT execute supplier, venue, or logistics settlement yet.
 *    - This step creates the immutable financial truth required for later settlement.
 */

import { db } from './db.js';
import { SafeMoney } from './finalPricingServices.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';
import {
  ValidationError,
  NotFoundError,
  AuthorizationError,
  AuthenticationError,
  ConflictError,
} from '../lib/errors.js';
import type {
  User,
  Order,
  Payment,
  FinancialLedgerEntry,
  VenueCompensationRecord,
  VenueCompensationSettlementView,
  SupplierPayableSettlementView,
  LogisticsPayableSettlementView,
  OrderFinancialLedgerSummary,
  FinancialTransactionType,
  LedgerEntryDirection,
  SettlementStatus,
  ReconciliationState,
} from '../types.js';

export class FinancialLedgerService {
  public static readonly STATUTORY_MAX_VENUE_COMPENSATION_RATE = 12.5;

  /**
   * Records the authoritative financial ledger entries upon verified payment.
   * 
   * Strict Guard:
   * Only creates ledger entries when payment status is 'PAID'.
   * Never creates entries on unverified attempts, draft orders, or payment screen opens.
   * 
   * Idempotency:
   * Returns existing ledger entries if already generated for this payment/order.
   */
  public static recordPaymentLedgerEntries(
    order: Order,
    payment: Payment,
    options?: { actorId?: string }
  ): {
    ledgerEntries: FinancialLedgerEntry[];
    venueCompensation: VenueCompensationRecord;
    summary: OrderFinancialLedgerSummary;
  } {
    // 1. Verification Guard
    if (payment.status !== 'PAID') {
      throw new ValidationError(
        `Authoritative financial ledger entries can ONLY be created for a verified payment. Current status: '${payment.status}'.`
      );
    }

    if (order.status !== 'PAID') {
      throw new ValidationError(
        `Authoritative financial ledger entries require the Order to be confirmed as PAID. Current status: '${order.status}'.`
      );
    }

    // 2. Idempotency Check
    const existingEntries = db.getFinancialLedgerEntriesByOrderId(order.id);
    const existingPaymentEntry = existingEntries.find((e) => e.transactionType === 'PAYMENT_RECEIVED');

    if (existingEntries.length > 0 && existingPaymentEntry) {
      const existingVenueComp = db.getVenueCompensationRecordsByOrderId(order.id)[0];
      const summary = this.buildOrderLedgerSummary(order.id, existingEntries, payment);
      return {
        ledgerEntries: existingEntries,
        venueCompensation: existingVenueComp,
        summary,
      };
    }

    // 3. Fetch Authoritative Snapshot & Context
    const snapshot = db.getOrderPricingSnapshotByOrderId(order.id);
    if (!snapshot) {
      throw new NotFoundError(
        `OrderPricingSnapshot not found for order '${order.publicId}'. Cannot construct financial ledger.`
      );
    }

    const refs = (order as any).authoritativeReferences || (order as any).references || (order as any);
    const campaignAgreementId = refs.campaignAgreementId || (order as any).campaignAgreementId;
    const agreement = db.getAgreementById(campaignAgreementId);
    if (!agreement) {
      throw new NotFoundError(
        `CampaignAgreement not found for order '${order.publicId}'.`
      );
    }

    const supplierAssignmentId = refs.supplierAssignmentId || (order as any).supplierAssignmentId;
    const logisticsAssignmentId = refs.logisticsAssignmentId || (order as any).logisticsAssignmentId;
    const supplierAssignment = supplierAssignmentId ? db.getSupplierAssignmentById(supplierAssignmentId) : undefined;
    const logisticsAssignment = logisticsAssignmentId ? db.getLogisticsAssignmentById(logisticsAssignmentId) : undefined;

    const supplierId = refs.supplierId || supplierAssignment?.supplierId || (order as any).supplierId;
    const venueId = refs.venueId || agreement.venueId || (order as any).venueId;
    const logisticsPartnerId = refs.logisticsPartnerId || logisticsAssignment?.logisticsPartnerId || (order as any).logisticsPartnerId;

    const supplierUser = supplierId ? db.findUserById(supplierId) : undefined;
    const venueUser = venueId ? db.findUserById(venueId) : undefined;
    const logisticsUser = logisticsPartnerId ? db.findUserById(logisticsPartnerId) : undefined;
    const advertiserUser = db.findUserById(order.advertiserId);

    const nowIso = new Date().toISOString();
    const actorId = options?.actorId || 'system:ledger_service';
    const campaignName = (order as any).campaignName || refs.campaignName || agreement.campaignName || 'AquaBloom Campaign';
    const campaignId = (order as any).campaignId || refs.campaignId || agreement.campaignId;
    const campaignPublicId = (order as any).campaignPublicId || refs.campaignPublicId || agreement.campaignPublicId || '';

    // 4. Calculate Double-Entry Amounts

    // 4A. Payment Received (Total Cash Inflow from Advertiser to AquaBloom)
    const paymentReceivedMinor = snapshot.grandTotal.amountMinor;
    const currency = snapshot.currency || 'INR';

    // 4B. Eligible Supplier Bottle Advertising Cost & Venue Compensation
    // Strictly the productPriceTotalMinor (excludes logistics, taxes, advertiser plan fees)
    const eligibleBaseAmountMinor = snapshot.productPrice.productPriceTotalMinor;

    const agreedPercentage =
      (agreement.terms.venueCompensationTerms as any)?.agreedPercentage ??
      (agreement.terms.venueCompensationTerms as any)?.proposedPercentage ??
      (agreement.terms.venueCompensationTerms as any)?.venueCompensationPercentage ??
      10.0;

    const venueCompCalc = FinancialLedgerService.calculateVenueCompensation(
      eligibleBaseAmountMinor,
      agreedPercentage
    );
    const statutoryCap = venueCompCalc.statutoryCapPercentage;
    const effectiveCompensationRate = venueCompCalc.effectiveCompensationRate;
    const cappedAtStatutoryLimit = venueCompCalc.cappedAtStatutoryLimit;
    const venueCompensationMinor = venueCompCalc.compensationAmountMinor;

    // 4C. Supplier Payable Accrual
    // Manufacturer internal production cost
    let supplierPayableMinor = 0;
    if (supplierAssignment) {
      const product = db.getProductById(supplierAssignment.productId);
      if (product?.supplierInternalCost?.amount && typeof product.supplierInternalCost.amount === 'number') {
        const unitInternalCostMinor = SafeMoney.toMinor(product.supplierInternalCost.amount);
        supplierPayableMinor = SafeMoney.multiplyQuantity(unitInternalCostMinor, snapshot.contractedQuantity);
      } else {
        // Fallback to customer-facing bottle price minus standard operating margin if cost unspecified
        supplierPayableMinor = Math.round(snapshot.productPrice.productPriceTotalMinor * 0.70);
      }
    } else {
      supplierPayableMinor = Math.round(snapshot.productPrice.productPriceTotalMinor * 0.70);
    }

    // 4D. Logistics Payable Accrual
    const logisticsPayableMinor = snapshot.logisticsCost.logisticsCostTotalMinor;

    // 4E. Statutory Tax Liability Accrual (GST)
    const taxLiabilityMinor = snapshot.taxes.totalTaxMinor;

    // 4F. Platform Operating Revenue / Gross Margin (AquaBloom retained amount)
    const platformMarginMinor =
      paymentReceivedMinor -
      (supplierPayableMinor + venueCompensationMinor + logisticsPayableMinor + taxLiabilityMinor);

    if (platformMarginMinor < 0) {
      console.warn(`[FinancialLedger] Negative platform margin calculated for order ${order.publicId}: ₹${(platformMarginMinor / 100).toFixed(2)}`);
    }

    // 5. Build Immutable Financial Ledger Entries
    const ledgerEntries: FinancialLedgerEntry[] = [];

    // ENTRY 1: Payment Received (Advertiser -> AquaBloom Platform)
    const paymentEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'PAYMENT_RECEIVED',
      amountMinor: paymentReceivedMinor,
      amountFormatted: SafeMoney.formatINR(paymentReceivedMinor),
      currency,
      direction: 'CREDIT',
      timestamp: payment.paidAt || nowIso,
      sourceReference: payment.providerTransactionReference || payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'ADVERTISER',
        partyId: order.advertiserId,
        partyPublicId: advertiserUser?.publicAccountId || refs.advertiserPublicId,
        partyName: advertiserUser?.organizationName || refs.advertiserBrandName || 'Advertiser',
      },
      settlementReference: null,
      settlementStatus: 'NOT_APPLICABLE' as SettlementStatus,
      notes: `Authoritative verified payment received from advertiser for campaign '${campaignName}'.`,
      metadata: {
        paymentMethod: payment.paymentMethod,
        provider: payment.provider,
        verifiedAt: payment.verifiedAt,
      },
    };
    ledgerEntries.push(paymentEntry);

    // ENTRY 2: Supplier Payable Accrual (AquaBloom -> Supplier)
    const supplierEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'SUPPLIER_PAYABLE_ACCRUAL',
      amountMinor: supplierPayableMinor,
      amountFormatted: SafeMoney.formatINR(supplierPayableMinor),
      currency,
      direction: 'DEBIT',
      timestamp: nowIso,
      sourceReference: payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'SUPPLIER',
        partyId: supplierId || 'unknown_supplier',
        partyPublicId: supplierUser?.publicAccountId || refs.supplierPublicId,
        partyName: supplierUser?.organizationName || refs.supplierBusinessName || 'Supplier Partner',
      },
      settlementReference: null,
      settlementStatus: 'ACCRUED' as SettlementStatus,
      notes: `Manufacturing bottle supply payable accrual for ${snapshot.contractedQuantity} units.`,
      metadata: {
        productId: supplierAssignment?.productId,
        quantity: snapshot.contractedQuantity,
      },
    };
    ledgerEntries.push(supplierEntry);

    // ENTRY 3: Venue Compensation Accrual (AquaBloom -> Venue)
    const venueEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'VENUE_COMPENSATION_ACCRUAL',
      amountMinor: venueCompensationMinor,
      amountFormatted: SafeMoney.formatINR(venueCompensationMinor),
      currency,
      direction: 'DEBIT',
      timestamp: nowIso,
      sourceReference: payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'VENUE',
        partyId: venueId || 'unknown_venue',
        partyPublicId: venueUser?.publicAccountId || refs.venuePublicId,
        partyName: venueUser?.organizationName || refs.venueName || 'Venue Partner',
      },
      settlementReference: null,
      settlementStatus: 'ACCRUED' as SettlementStatus,
      notes: `Venue bottle advertising compensation accrual at ${effectiveCompensationRate}% of eligible bottle advertising cost.`,
      metadata: {
        eligibleBaseAmountMinor,
        agreedCompensationRate: agreedPercentage,
        effectiveCompensationRate,
        cappedAtStatutoryLimit,
        statutoryCapPercentage: statutoryCap,
      },
    };
    ledgerEntries.push(venueEntry);

    // ENTRY 4: Logistics Payable Accrual (AquaBloom -> Logistics Partner)
    const logisticsEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'LOGISTICS_PAYABLE_ACCRUAL',
      amountMinor: logisticsPayableMinor,
      amountFormatted: SafeMoney.formatINR(logisticsPayableMinor),
      currency,
      direction: 'DEBIT',
      timestamp: nowIso,
      sourceReference: payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'LOGISTICS_PARTNER',
        partyId: logisticsPartnerId || 'unknown_logistics',
        partyPublicId: logisticsUser?.publicAccountId || refs.logisticsPartnerPublicId,
        partyName: logisticsUser?.organizationName || refs.logisticsPartnerBusinessName || 'Logistics Partner',
      },
      settlementReference: null,
      settlementStatus: 'ACCRUED' as SettlementStatus,
      notes: `Freight delivery and staging payable accrual.`,
      metadata: {
        logisticsAssignmentId: logisticsAssignment?.id,
      },
    };
    ledgerEntries.push(logisticsEntry);

    // ENTRY 5: Statutory Tax Liability Accrual (AquaBloom -> Indian GST Authority)
    const taxEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'TAX_LIABILITY_ACCRUAL',
      amountMinor: taxLiabilityMinor,
      amountFormatted: SafeMoney.formatINR(taxLiabilityMinor),
      currency,
      direction: 'DEBIT',
      timestamp: nowIso,
      sourceReference: payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'TAX_AUTHORITY',
        partyId: 'gst_authority_in',
        partyPublicId: 'GST-INDIA-MUM',
        partyName: 'Goods and Services Tax Authority',
      },
      settlementReference: null,
      settlementStatus: 'ACCRUED' as SettlementStatus,
      notes: `Statutory GST liability collected for remittance (${snapshot.taxes.jurisdiction.isInterState ? 'IGST' : 'CGST+SGST'}).`,
      metadata: {
        taxComponents: snapshot.taxes.taxComponents,
      },
    };
    ledgerEntries.push(taxEntry);

    // ENTRY 6: Platform Gross Margin Accrual (AquaBloom Retained Revenue)
    const platformEntry: FinancialLedgerEntry = {
      id: generateInternalId('flt'),
      publicId: generateBusinessId('AB-FTX'),
      orderId: order.id,
      orderPublicId: order.publicId,
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      transactionType: 'PLATFORM_MARGIN_ACCRUAL',
      amountMinor: platformMarginMinor,
      amountFormatted: SafeMoney.formatINR(platformMarginMinor),
      currency,
      direction: 'CREDIT',
      timestamp: nowIso,
      sourceReference: payment.paymentReference,
      reconciliationStatus: 'MATCHED',
      relatedParty: {
        partyRole: 'PLATFORM',
        partyId: 'aquabloom_platform',
        partyPublicId: 'AB-CORP-HQ',
        partyName: 'AquaBloom Technologies Platform Operations',
      },
      settlementReference: null,
      settlementStatus: 'ACCRUED' as SettlementStatus,
      notes: `Gross platform operating margin retained on order.`,
      metadata: {
        marginPercentage: Number(((platformMarginMinor / paymentReceivedMinor) * 100).toFixed(2)),
      },
    };
    ledgerEntries.push(platformEntry);

    // 6. Build Venue Compensation Record
    const venueCompensationRecord: VenueCompensationRecord = {
      id: generateInternalId('vcr'),
      publicId: generateBusinessId('AB-VCR'),
      orderId: order.id,
      orderPublicId: order.publicId,
      campaignId: campaignId || 'cmp_unknown',
      campaignPublicId: campaignPublicId || '',
      campaignName,
      venueId: venueId || 'unknown_venue',
      venuePublicId: venueUser?.publicAccountId || refs.venuePublicId || '',
      venueName: venueUser?.organizationName || refs.venueName || 'Venue Partner',
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      eligibleSupplierBottleAdvertisingCostMinor: eligibleBaseAmountMinor,
      eligibleSupplierBottleAdvertisingCostFormatted: SafeMoney.formatINR(eligibleBaseAmountMinor),
      compensationRatePercentage: effectiveCompensationRate,
      statutoryCapPercentage: 12.5,
      cappedAtStatutoryLimit,
      compensationAmountMinor: venueCompensationMinor,
      compensationAmountFormatted: SafeMoney.formatINR(venueCompensationMinor),
      currency,
      compensationStatus: 'ACCRUED',
      settlementStatus: 'ACCRUED' as SettlementStatus,
      settlementReference: null,
      accruedAt: nowIso,
      exclusions: {
        advertiserPlanFeeExcluded: true,
        logisticsExcluded: true,
        taxExcluded: true,
        unrelatedChargesExcluded: true,
      },
    };

    // 7. Save to Database
    db.saveFinancialLedgerEntries(ledgerEntries);
    db.saveVenueCompensationRecord(venueCompensationRecord);

    // 8. Dispatch Audit Event
    eventDispatcher.dispatch({
      id: generateInternalId('evt'),
      category: 'BUSINESS_TIMELINE',
      eventType: 'FINANCIAL_LEDGER_CREATED',
      entityId: order.id,
      entityType: 'ORDER',
      details: {
        orderPublicId: order.publicId,
        paymentPublicId: payment.publicId,
        paymentReceivedTotalMinor: paymentReceivedMinor,
        venueCompensationMinor,
        supplierPayableMinor,
        logisticsPayableMinor,
        taxLiabilityMinor,
        platformMarginMinor,
        entriesCount: ledgerEntries.length,
        actorId,
        timestamp: nowIso,
      },
      createdAt: nowIso,
    });

    const summary = this.buildOrderLedgerSummary(order.id, ledgerEntries, payment);

    return {
      ledgerEntries,
      venueCompensation: venueCompensationRecord,
      summary,
    };
  }

  /**
   * Venue-facing isolated view.
   * 
   * SECURITY & VISIBILITY:
   * Venue sees ONLY:
   * - its compensation amount
   * - compensation status
   * - expected settlement information
   * - eligible bottle advertising cost base description
   * 
   * Venue MUST NOT see:
   * - advertiser payment amount
   * - payment method
   * - advertiser transaction details
   * - supplier internal cost
   * - AquaBloom margin
   * - logistics cost
   * - tax amounts
   */
  public static getVenueCompensationView(
    orderId: string,
    actor: User
  ): VenueCompensationSettlementView {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to view venue compensation.');
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found.`);
    }

    const refs = (order as any).authoritativeReferences || (order as any).references || (order as any);
    const venueId = refs.venueId || (order as any).venueId;

    // Role check: Only matching Venue or ADMIN
    if (actor.role !== 'ADMIN' && venueId !== actor.id) {
      throw new AuthorizationError('You are not authorized to view venue compensation for this order.');
    }

    const compRecord = db.getVenueCompensationRecordsByOrderId(order.id)[0];
    if (!compRecord) {
      throw new NotFoundError(`No venue compensation record found for order '${order.publicId}'.`);
    }

    return {
      compensationRecordId: compRecord.id,
      compensationPublicId: compRecord.publicId,
      orderPublicId: order.publicId,
      campaignName: (order as any).campaignName || refs.campaignName || 'AquaBloom Campaign',
      venueName: compRecord.venueName,
      eligibleBaseDescription: 'Supplier bottle advertising cost (strictly excludes logistics, taxes, and advertiser plan fees)',
      compensationRatePercentage: compRecord.compensationRatePercentage,
      compensationAmountFormatted: compRecord.compensationAmountFormatted,
      currency: compRecord.currency,
      compensationStatus: compRecord.compensationStatus,
      expectedSettlementInformation: 'Accrued upon verified payment; scheduled for venue disbursement batch according to standard payment cycle.',
      accruedAt: compRecord.accruedAt,
    };
  }

  /**
   * Supplier-facing isolated view.
   * 
   * SECURITY & VISIBILITY:
   * Supplier sees ONLY their manufacturing bottle payable and settlement status.
   * STRICTLY PROTECTED: Venue compensation, advertiser payment, logistics cost, and AquaBloom margin.
   */
  public static getSupplierPayableView(
    orderId: string,
    actor: User
  ): SupplierPayableSettlementView {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to view supplier payable.');
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found.`);
    }

    const refs = (order as any).authoritativeReferences || (order as any).references || (order as any);
    const supplierId = refs.supplierId || (order as any).supplierId;

    if (actor.role !== 'ADMIN' && supplierId !== actor.id) {
      throw new AuthorizationError('You are not authorized to view supplier payable details for this order.');
    }

    const ledgerEntries = db.getFinancialLedgerEntriesByOrderId(order.id);
    const supplierEntry = ledgerEntries.find((e) => e.transactionType === 'SUPPLIER_PAYABLE_ACCRUAL');
    if (!supplierEntry) {
      throw new NotFoundError(`No supplier payable accrual found for order '${order.publicId}'.`);
    }

    const snapshot = db.getOrderPricingSnapshotByOrderId(order.id);

    return {
      ledgerEntryId: supplierEntry.id,
      publicId: supplierEntry.publicId,
      orderPublicId: order.publicId,
      supplierBusinessName: supplierEntry.relatedParty.partyName,
      productName: snapshot?.productPricingVersion.productName || 'Eco-bottle manufacturing batch',
      quantity: snapshot?.contractedQuantity || 0,
      payableAmountFormatted: supplierEntry.amountFormatted,
      currency: supplierEntry.currency,
      settlementStatus: supplierEntry.settlementStatus,
      accruedAt: supplierEntry.timestamp,
    };
  }

  /**
   * Logistics-facing isolated view.
   * 
   * SECURITY & VISIBILITY:
   * Logistics partner sees ONLY their freight payable and settlement status.
   * STRICTLY PROTECTED: Product price, venue compensation, advertiser payment, and AquaBloom margin.
   */
  public static getLogisticsPayableView(
    orderId: string,
    actor: User
  ): LogisticsPayableSettlementView {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to view logistics payable.');
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found.`);
    }

    const refs = (order as any).authoritativeReferences || (order as any).references || (order as any);
    const logisticsPartnerId = refs.logisticsPartnerId || (order as any).logisticsPartnerId;

    if (actor.role !== 'ADMIN' && logisticsPartnerId !== actor.id) {
      throw new AuthorizationError('You are not authorized to view logistics payable details for this order.');
    }

    const ledgerEntries = db.getFinancialLedgerEntriesByOrderId(order.id);
    const logisticsEntry = ledgerEntries.find((e) => e.transactionType === 'LOGISTICS_PAYABLE_ACCRUAL');
    if (!logisticsEntry) {
      throw new NotFoundError(`No logistics payable accrual found for order '${order.publicId}'.`);
    }

    return {
      ledgerEntryId: logisticsEntry.id,
      publicId: logisticsEntry.publicId,
      orderPublicId: order.publicId,
      logisticsPartnerBusinessName: logisticsEntry.relatedParty.partyName,
      payableAmountFormatted: logisticsEntry.amountFormatted,
      currency: logisticsEntry.currency,
      settlementStatus: logisticsEntry.settlementStatus,
      accruedAt: logisticsEntry.timestamp,
    };
  }

  /**
   * Internal Admin Summary: Complete audit view of all ledger entries for an order.
   */
  public static getOrderFinancialLedgerSummary(
    orderId: string,
    actor: User
  ): OrderFinancialLedgerSummary {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required.');
    }

    if (actor.role !== 'ADMIN') {
      throw new AuthorizationError('Only system administrators can access the full internal financial ledger.');
    }

    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order with ID '${orderId}' not found.`);
    }

    const payment = db.getPaymentByOrderId(order.id);
    if (!payment) {
      throw new NotFoundError(`Payment not found for order '${order.publicId}'.`);
    }

    const entries = db.getFinancialLedgerEntriesByOrderId(order.id);
    return this.buildOrderLedgerSummary(order.id, entries, payment);
  }

  /**
   * Helper to construct the complete balanced summary.
   */
  private static buildOrderLedgerSummary(
    orderId: string,
    entries: FinancialLedgerEntry[],
    payment: Payment
  ): OrderFinancialLedgerSummary {
    const paymentEntry = entries.find((e) => e.transactionType === 'PAYMENT_RECEIVED');
    const supplierEntry = entries.find((e) => e.transactionType === 'SUPPLIER_PAYABLE_ACCRUAL');
    const venueEntry = entries.find((e) => e.transactionType === 'VENUE_COMPENSATION_ACCRUAL');
    const logisticsEntry = entries.find((e) => e.transactionType === 'LOGISTICS_PAYABLE_ACCRUAL');
    const taxEntry = entries.find((e) => e.transactionType === 'TAX_LIABILITY_ACCRUAL');
    const platformEntry = entries.find((e) => e.transactionType === 'PLATFORM_MARGIN_ACCRUAL');

    const paymentReceivedTotalMinor = paymentEntry?.amountMinor || 0;
    const supplierPayableMinor = supplierEntry?.amountMinor || 0;
    const venueCompensationMinor = venueEntry?.amountMinor || 0;
    const logisticsPayableMinor = logisticsEntry?.amountMinor || 0;
    const taxLiabilityMinor = taxEntry?.amountMinor || 0;
    const platformMarginMinor = platformEntry?.amountMinor || 0;

    const sumDebitsAndMargin =
      supplierPayableMinor + venueCompensationMinor + logisticsPayableMinor + taxLiabilityMinor + platformMarginMinor;

    const isBalanced = entries.length >= 6 && paymentReceivedTotalMinor === sumDebitsAndMargin;

    return {
      orderId,
      orderPublicId: paymentEntry?.orderPublicId || '',
      paymentId: payment.id,
      paymentPublicId: payment.publicId,
      paymentReceivedTotalMinor,
      paymentReceivedTotalFormatted: SafeMoney.formatINR(paymentReceivedTotalMinor),
      supplierPayableMinor,
      supplierPayableFormatted: SafeMoney.formatINR(supplierPayableMinor),
      venueCompensationMinor,
      venueCompensationFormatted: SafeMoney.formatINR(venueCompensationMinor),
      logisticsPayableMinor,
      logisticsPayableFormatted: SafeMoney.formatINR(logisticsPayableMinor),
      taxLiabilityMinor,
      taxLiabilityFormatted: SafeMoney.formatINR(taxLiabilityMinor),
      platformMarginMinor,
      platformMarginFormatted: SafeMoney.formatINR(platformMarginMinor),
      isBalanced,
      entriesCount: entries.length,
      currency: 'INR',
      entries,
    };
  }

  /**
   * Convenience lookup wrapper by orderId and paymentId
   */
  public static createAuthoritativeLedgerEntries(
    orderId: string,
    paymentId: string,
    actorId?: string
  ): {
    ledgerEntries: FinancialLedgerEntry[];
    venueCompensation: VenueCompensationRecord;
    summary: OrderFinancialLedgerSummary;
  } {
    const order = db.getOrderById(orderId);
    if (!order) {
      throw new NotFoundError(`Order '${orderId}' not found.`);
    }
    const payment = db.getPaymentById(paymentId) || db.getPaymentByOrderId(orderId);
    if (!payment) {
      throw new NotFoundError(`Payment '${paymentId}' not found for order '${orderId}'.`);
    }

    return this.recordPaymentLedgerEntries(order, payment, { actorId });
  }

  /**
   * Venue compensation calculation helper
   * Maximum 12.5% statutory cap strictly enforced.
   * Base is strictly eligible supplier bottle advertising cost (product price total).
   */
  public static calculateVenueCompensation(
    eligibleBaseAmountMinor: number,
    agreedPercentage: number,
    customStatutoryCap: number = FinancialLedgerService.STATUTORY_MAX_VENUE_COMPENSATION_RATE
  ): {
    eligibleBaseAmountMinor: number;
    eligibleBaseAmountFormatted: string;
    compensationRatePercentage: number;
    statutoryCapPercentage: number;
    effectiveCompensationRate: number;
    cappedAtStatutoryLimit: boolean;
    compensationAmountMinor: number;
    compensationAmountFormatted: string;
  } {
    const statutoryCap = customStatutoryCap;
    const effectiveCompensationRate = Math.min(Math.max(0, agreedPercentage), statutoryCap);
    const cappedAtStatutoryLimit = agreedPercentage > statutoryCap;
    const compensationAmountMinor = SafeMoney.calculateTaxMinor(
      eligibleBaseAmountMinor,
      effectiveCompensationRate
    );

    return {
      eligibleBaseAmountMinor,
      eligibleBaseAmountFormatted: SafeMoney.formatINR(eligibleBaseAmountMinor),
      compensationRatePercentage: agreedPercentage,
      statutoryCapPercentage: statutoryCap,
      effectiveCompensationRate,
      cappedAtStatutoryLimit,
      compensationAmountMinor,
      compensationAmountFormatted: SafeMoney.formatINR(compensationAmountMinor),
    };
  }
}

export const FinancialLedgerEngine = FinancialLedgerService;

export class FinancialLedgerAuthorizationService {
  public static getVenueCompensationView(orderId: string, actor: User): VenueCompensationSettlementView {
    return FinancialLedgerService.getVenueCompensationView(orderId, actor);
  }

  public static getSupplierPayableView(orderId: string, actor: User): SupplierPayableSettlementView {
    return FinancialLedgerService.getSupplierPayableView(orderId, actor);
  }

  public static getLogisticsPayableView(orderId: string, actor: User): LogisticsPayableSettlementView {
    return FinancialLedgerService.getLogisticsPayableView(orderId, actor);
  }

  public static getOrderLedgerSummary(orderId: string, actor: User): OrderFinancialLedgerSummary {
    return FinancialLedgerService.getOrderFinancialLedgerSummary(orderId, actor);
  }

  public static getOrderFinancialLedgerSummary(orderId: string, actor: User): OrderFinancialLedgerSummary {
    return FinancialLedgerService.getOrderFinancialLedgerSummary(orderId, actor);
  }
}
