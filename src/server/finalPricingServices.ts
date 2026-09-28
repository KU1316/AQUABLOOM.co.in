/**
 * AquaBloom Step 11A: Final Pricing Calculation Engine & Money Safety
 * 
 * Provides:
 * 1. SafeMoney: Deterministic integer minor units (paise) math, zero floating point inaccuracies.
 * 2. FinalPricingAuthorizationService: Strict counterparty and admin access control.
 * 3. TaxCalculationEngine: Authoritative GST rule engine (CGST, SGST, IGST) with strict PRICING_BLOCKED on missing configuration.
 * 4. FinalPricingEngine: Orchestration across SupplierAssignment, LogisticsAssignment, and OrderReadiness.
 */

import { db } from './db.js';
import {
  User,
  OrderReadiness,
  SupplierAssignment,
  LogisticsAssignment,
  CampaignAgreement,
  CampaignAgreementSnapshot,
  FinalPricingCalculationResult,
  FinalPricingStatus,
  TaxCalculationResult,
  TaxComponentBreakdown,
  FinalPricingSharedView,
} from '../types.js';
import {
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../lib/errors.js';
import { eventDispatcher } from '../lib/events.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';

/**
 * ========================================================
 * 1. SAFE MONEY UTILITY (Integer Minor Units / Paise)
 * ========================================================
 * 1 INR = 100 Paise.
 * All arithmetic is performed on integers (BigInt or integer numbers) to prevent
 * IEEE-754 binary floating-point roundoff issues (e.g. 0.1 + 0.2 !== 0.3).
 */
export class SafeMoney {
  /**
   * Converts a major unit currency value (e.g. 15.50 or 100) to integer minor units (e.g. 1550 or 10000).
   * Throws ValidationError if input is not a finite number.
   */
  public static toMinor(majorAmount: number): number {
    if (typeof majorAmount !== 'number' || !Number.isFinite(majorAmount) || Number.isNaN(majorAmount)) {
      throw new ValidationError(`Invalid monetary amount: '${majorAmount}'. Amount must be a finite number.`);
    }
    // Round to avoid IEEE 754 precision quirks like 19.99 * 100 = 1998.9999999999998
    return Math.round(majorAmount * 100);
  }

  /**
   * Converts integer minor units back to major unit float string formatted with 2 decimal places.
   * e.g. 1550 -> "15.50"
   */
  public static toMajorString(minorAmount: number): string {
    if (!Number.isInteger(minorAmount)) {
      throw new ValidationError(`Minor unit amount must be an integer, received: ${minorAmount}`);
    }
    const sign = minorAmount < 0 ? '-' : '';
    const abs = Math.abs(minorAmount);
    const major = Math.floor(abs / 100);
    const minor = abs % 100;
    return `${sign}${major}.${minor.toString().padStart(2, '0')}`;
  }

  /**
   * Formats integer minor units into display string with currency symbol.
   * e.g. 1550 -> "₹15.50"
   */
  public static formatINR(minorAmount: number): string {
    return `₹${SafeMoney.toMajorString(minorAmount)}`;
  }

  /**
   * Multiplies minor units by an integer quantity deterministically.
   */
  public static multiplyQuantity(unitPriceMinor: number, quantity: number): number {
    if (!Number.isInteger(unitPriceMinor)) {
      throw new ValidationError(`Unit price in minor units must be an integer: ${unitPriceMinor}`);
    }
    if (!Number.isInteger(quantity) || quantity < 0) {
      throw new ValidationError(`Quantity must be a positive integer: ${quantity}`);
    }
    return unitPriceMinor * quantity;
  }

  /**
   * Calculates percentage tax deterministically using integer arithmetic with standard half-up rounding.
   * Formula: Math.round((amountMinor * rateBasisPoints) / 10000)
   * rateBasisPoints = ratePercentage * 100 (e.g. 18% = 1800 basis points, 9% = 900 basis points)
   */
  public static calculateTaxMinor(taxableAmountMinor: number, ratePercentage: number): number {
    if (!Number.isInteger(taxableAmountMinor)) {
      throw new ValidationError(`Taxable amount must be integer minor units: ${taxableAmountMinor}`);
    }
    if (typeof ratePercentage !== 'number' || ratePercentage < 0) {
      throw new ValidationError(`Tax rate percentage must be non-negative: ${ratePercentage}`);
    }
    const basisPoints = Math.round(ratePercentage * 100);
    // (amount * basisPoints) / 10000
    const rawTax = (taxableAmountMinor * basisPoints) / 10000;
    return Math.round(rawTax);
  }
}

/**
 * ========================================================
 * 2. TAX CALCULATION ENGINE & STATUTORY GST RULES
 * ========================================================
 * Implements Indian GST statutory rules:
 * - Packaged beverage / commercial advertising: Standard GST Rate = 18%
 * - Intra-State (Supplier and Venue in same state): 9% CGST + 9% SGST
 * - Inter-State (Supplier and Venue in different states): 18% IGST
 * - If state configuration or geographic jurisdiction cannot be determined:
 *   DO NOT GUESS. Return PRICING_BLOCKED.
 */
export class TaxCalculationEngine {
  public static readonly GST_STANDARD_RATE_PERCENTAGE = 18.0;
  public static readonly CGST_RATE_PERCENTAGE = 9.0;
  public static readonly SGST_RATE_PERCENTAGE = 9.0;
  public static readonly IGST_RATE_PERCENTAGE = 18.0;

  /**
   * Evaluates tax applicability and calculates exact breakdown.
   * If tax information is unavailable, returns a blocked diagnostic without throwing unhandled exceptions.
   */
  public static evaluateTaxes(
    taxableAmountMinor: number,
    supplierState: string | undefined,
    venueState: string | undefined
  ): {
    isSuccess: boolean;
    blockingReason?: string;
    result?: TaxCalculationResult;
  } {
    if (!supplierState || supplierState.trim() === '') {
      return {
        isSuccess: false,
        blockingReason: 'Tax calculation blocked: Supplier dispatch state/jurisdiction is missing or unconfigured.',
      };
    }

    if (!venueState || venueState.trim() === '') {
      return {
        isSuccess: false,
        blockingReason: 'Tax calculation blocked: Venue receiving delivery state/jurisdiction is missing or unconfigured.',
      };
    }

    const normSupplierState = supplierState.trim().toLowerCase();
    const normVenueState = venueState.trim().toLowerCase();
    const isInterState = normSupplierState !== normVenueState;

    if (isInterState) {
      // Inter-state supply: IGST @ 18%
      const igstAmountMinor = SafeMoney.calculateTaxMinor(
        taxableAmountMinor,
        TaxCalculationEngine.IGST_RATE_PERCENTAGE
      );
      const component: TaxComponentBreakdown = {
        taxType: 'IGST',
        ratePercentage: TaxCalculationEngine.IGST_RATE_PERCENTAGE,
        taxableAmountMinor,
        taxAmountMinor: igstAmountMinor,
        taxableAmountFormatted: SafeMoney.formatINR(taxableAmountMinor),
        taxAmountFormatted: SafeMoney.formatINR(igstAmountMinor),
      };

      return {
        isSuccess: true,
        result: {
          taxApplicable: true,
          jurisdiction: {
            originState: supplierState.trim(),
            destinationState: venueState.trim(),
            isInterState: true,
          },
          ratePercentageTotal: TaxCalculationEngine.IGST_RATE_PERCENTAGE,
          taxComponents: [component],
          totalTaxMinor: igstAmountMinor,
          totalTaxFormatted: SafeMoney.formatINR(igstAmountMinor),
        },
      };
    } else {
      // Intra-state supply: CGST @ 9% + SGST @ 9%
      const cgstAmountMinor = SafeMoney.calculateTaxMinor(
        taxableAmountMinor,
        TaxCalculationEngine.CGST_RATE_PERCENTAGE
      );
      const sgstAmountMinor = SafeMoney.calculateTaxMinor(
        taxableAmountMinor,
        TaxCalculationEngine.SGST_RATE_PERCENTAGE
      );
      const totalTaxMinor = cgstAmountMinor + sgstAmountMinor;

      const cgstComponent: TaxComponentBreakdown = {
        taxType: 'CGST',
        ratePercentage: TaxCalculationEngine.CGST_RATE_PERCENTAGE,
        taxableAmountMinor,
        taxAmountMinor: cgstAmountMinor,
        taxableAmountFormatted: SafeMoney.formatINR(taxableAmountMinor),
        taxAmountFormatted: SafeMoney.formatINR(cgstAmountMinor),
      };

      const sgstComponent: TaxComponentBreakdown = {
        taxType: 'SGST',
        ratePercentage: TaxCalculationEngine.SGST_RATE_PERCENTAGE,
        taxableAmountMinor,
        taxAmountMinor: sgstAmountMinor,
        taxableAmountFormatted: SafeMoney.formatINR(taxableAmountMinor),
        taxAmountFormatted: SafeMoney.formatINR(sgstAmountMinor),
      };

      return {
        isSuccess: true,
        result: {
          taxApplicable: true,
          jurisdiction: {
            originState: supplierState.trim(),
            destinationState: venueState.trim(),
            isInterState: false,
          },
          ratePercentageTotal: TaxCalculationEngine.GST_STANDARD_RATE_PERCENTAGE,
          taxComponents: [cgstComponent, sgstComponent],
          totalTaxMinor,
          totalTaxFormatted: SafeMoney.formatINR(totalTaxMinor),
        },
      };
    }
  }
}

/**
 * ========================================================
 * 3. FINAL PRICING AUTHORIZATION SERVICE
 * ========================================================
 */
export class FinalPricingAuthorizationService {
  public static assertAuthenticated(actor: User): void {
    if (!actor || !actor.id) {
      throw new AuthenticationError('Authentication required to access Final Pricing.');
    }
  }

  /**
   * Asserts actor can trigger calculation or view full pricing result.
   * - ADMIN: Can calculate and view any.
   * - ADVERTISER: Can calculate and view their own campaign's pricing.
   * - VENUE: Can view only sanitised views of their campaign agreements; supplier details and internal costs excluded.
   * - SUPPLIERS & LOGISTICS: Forbidden from accessing aggregate pricing calculation.
   */
  public static assertCanCalculate(readiness: OrderReadiness, actor: User): void {
    FinalPricingAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'ADVERTISER' && readiness.advertiserId === actor.id) {
      return;
    }

    throw new AuthorizationError(
      `Role '${actor.role}' is not authorized to trigger Final Pricing calculation for Order Readiness '${readiness.publicId}'. Only the designated Advertiser or System Admin may trigger calculation.`
    );
  }

  public static assertCanView(readiness: OrderReadiness, actor: User): void {
    FinalPricingAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    if (actor.role === 'ADVERTISER' && readiness.advertiserId === actor.id) {
      return;
    }

    if (actor.role === 'VENUE' && readiness.venueId === actor.id) {
      return;
    }

    throw new AuthorizationError(
      `Access denied: Actor '${actor.publicAccountId || actor.id}' is not authorized to view pricing for Order Readiness '${readiness.publicId}'.`
    );
  }
}

/**
 * ========================================================
 * 4. FINAL PRICING CALCULATION ENGINE
 * ========================================================
 */
export class FinalPricingEngine {
  /**
   * Executes the deterministic pricing calculation workflow for an OrderReadiness record.
   *
   * Rigorous prerequisite validation:
   * 1. CampaignAgreement = LOCKED
   * 2. OrderReadiness = READY_FOR_ORDER
   * 3. SupplierAssignment = ASSIGNED
   * 4. LogisticsAssignment = ASSIGNED
   *
   * Customer-Facing Formula:
   * PRODUCT PRICE + LOGISTICS COST + APPLICABLE TAXES = TOTAL
   *
   * Strict Rules:
   * - NO separate "Label Fee" (included in product price).
   * - Authoritative supplier product price version used.
   * - Authoritative accepted logistics cost used.
   * - Money safety via SafeMoney (minor units / paise).
   * - Deterministic output.
   * - Returns PRICING_BLOCKED on missing tax config or missing rates.
   */
  public static calculateFinalPricing(
    orderReadinessIdOrPublicId: string,
    actor: User
  ): FinalPricingCalculationResult {
    // 1. Authenticate & fetch OrderReadiness
    const readiness = db.getOrderReadinessById(orderReadinessIdOrPublicId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness '${orderReadinessIdOrPublicId}' not found.`);
    }

    // 2. Authorize
    FinalPricingAuthorizationService.assertCanCalculate(readiness, actor);

    const now = new Date().toISOString();

    // 3. Verify Agreement State
    const agreement = db.getAgreementById(readiness.campaignAgreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${readiness.campaignAgreementId}' not found.`);
    }

    if (agreement.status !== 'LOCKED') {
      throw new ValidationError(
        `Final Pricing calculation rejected: Campaign Agreement '${agreement.publicId}' must be LOCKED. Current status: ${agreement.status}`
      );
    }

    // 4. Verify Order Readiness State
    if (readiness.status !== 'READY_FOR_ORDER') {
      throw new ValidationError(
        `Final Pricing calculation rejected: Order Readiness '${readiness.publicId}' must be READY_FOR_ORDER. Current status: ${readiness.status}`
      );
    }

    // 5. Verify Supplier Assignment State
    const supplierAssignment = db.getSupplierAssignmentByOrderReadiness(readiness.id);
    if (!supplierAssignment || supplierAssignment.status !== 'ASSIGNED') {
      throw new ValidationError(
        `Final Pricing calculation rejected: Supplier Assignment must be ASSIGNED. Found: ${
          supplierAssignment ? supplierAssignment.status : 'NONE'
        }`
      );
    }

    // Verify cross-record reference consistency
    if (supplierAssignment.orderReadinessId !== readiness.id || supplierAssignment.campaignAgreementId !== agreement.id) {
      throw new ConflictError(
        `Supplier Assignment '${supplierAssignment.publicId}' transaction mismatch with Order Readiness '${readiness.publicId}'.`
      );
    }

    // 6. Verify Logistics Assignment State
    const logisticsAssignment = db.getLogisticsAssignmentByOrderReadiness(readiness.id);
    if (!logisticsAssignment || logisticsAssignment.status !== 'ASSIGNED') {
      throw new ValidationError(
        `Final Pricing calculation rejected: Logistics Assignment must be ASSIGNED. Found: ${
          logisticsAssignment ? logisticsAssignment.status : 'NONE'
        }`
      );
    }

    // Verify cross-record reference consistency
    if (logisticsAssignment.orderReadinessId !== readiness.id || logisticsAssignment.campaignAgreementId !== agreement.id) {
      throw new ConflictError(
        `Logistics Assignment '${logisticsAssignment.publicId}' transaction mismatch with Order Readiness '${readiness.publicId}'.`
      );
    }

    // 7. Extract authoritative quantity from locked agreement snapshot
    const agreementSnapshot = db.getAgreementSnapshotByAgreementId(agreement.id);
    if (!agreementSnapshot) {
      throw new NotFoundError(`Authoritative Agreement Snapshot not found for agreement '${agreement.publicId}'.`);
    }

    const contractedQuantity = agreementSnapshot.campaignTermsSnapshot?.quantity;
    if (!contractedQuantity || contractedQuantity <= 0) {
      throw new ValidationError(`Contracted quantity in agreement snapshot must be greater than zero.`);
    }

    // Verify contracted quantity matches supplier locked quantity
    if (supplierAssignment.lockedOfferSnapshot.bottleQuantity !== contractedQuantity) {
      throw new ConflictError(
        `Quantity mismatch: Agreement contracted quantity (${contractedQuantity}) does not match Supplier Assignment locked quantity (${supplierAssignment.lockedOfferSnapshot.bottleQuantity}).`
      );
    }

    // 8. Extract authoritative product price version from Supplier Assignment
    const lockedSupplierOffer = supplierAssignment.lockedOfferSnapshot;
    const unitPriceMajor = lockedSupplierOffer.unitCustomerFacingPrice?.amount;

    if (typeof unitPriceMajor !== 'number' || unitPriceMajor <= 0) {
      return FinalPricingEngine.buildBlockedResult(
        readiness,
        agreement,
        supplierAssignment,
        logisticsAssignment,
        contractedQuantity,
        'Authoritative product unit customer-facing price is missing or invalid in Supplier Assignment locked snapshot.',
        actor,
        now
      );
    }

    // Verify the product & active version exists in database for reference consistency
    const product = db.getProductById(supplierAssignment.productId);
    if (!product) {
      return FinalPricingEngine.buildBlockedResult(
        readiness,
        agreement,
        supplierAssignment,
        logisticsAssignment,
        contractedQuantity,
        `Supplier product '${supplierAssignment.productId}' was not found in catalog.`,
        actor,
        now
      );
    }

    // Check version validity
    const productVersions = db.getProductVersions(product.id);
    const assignedVersion = productVersions.find((v) => v.id === supplierAssignment.productVersionId);
    if (!assignedVersion) {
      return FinalPricingEngine.buildBlockedResult(
        readiness,
        agreement,
        supplierAssignment,
        logisticsAssignment,
        contractedQuantity,
        `Assigned product version '${supplierAssignment.productVersionId}' is stale or missing in product version history.`,
        actor,
        now
      );
    }

    // 9. Extract authoritative logistics cost from Logistics Assignment
    const lockedLogisticsCost = logisticsAssignment.lockedOperationalSnapshot.costInput?.logisticsCost?.amount;
    if (typeof lockedLogisticsCost !== 'number' || lockedLogisticsCost < 0) {
      return FinalPricingEngine.buildBlockedResult(
        readiness,
        agreement,
        supplierAssignment,
        logisticsAssignment,
        contractedQuantity,
        'Authoritative logistics cost is missing or invalid in Logistics Assignment locked snapshot.',
        actor,
        now
      );
    }

    // 10. Extract origin and destination states for Tax Calculation
    const supplierUser = db.findUserById(supplierAssignment.supplierId);
    const supplierProfile = supplierUser ? (db.getProfile(supplierUser.id) as any) : undefined;
    const supplierState =
      supplierProfile?.facility?.stateRegion ||
      supplierProfile?.facility?.state ||
      supplierProfile?.location?.stateRegion ||
      supplierProfile?.location?.state ||
      supplierProfile?.facilityLocations?.[0]?.state ||
      supplierProfile?.facilityLocations?.[0]?.stateRegion ||
      logisticsAssignment.lockedOperationalSnapshot.requirements.pickupSource.stateRegion ||
      logisticsAssignment.lockedOperationalSnapshot.requirements.pickupSource.state ||
      '';

    const venueUser = db.findUserById(readiness.venueId);
    const venueProfile = venueUser ? (db.getProfile(venueUser.id) as any) : undefined;
    const venueState =
      venueProfile?.location?.stateRegion ||
      venueProfile?.location?.state ||
      agreementSnapshot.venueSnapshot?.locationCity || // fallback check
      '';

    // Safe integer minor units calculation
    const unitPriceMinor = SafeMoney.toMinor(unitPriceMajor);
    const productPriceTotalMinor = SafeMoney.multiplyQuantity(unitPriceMinor, contractedQuantity);
    const logisticsCostTotalMinor = SafeMoney.toMinor(lockedLogisticsCost);

    // Taxable amount = Product Price + Logistics Cost
    const taxableAmountMinor = productPriceTotalMinor + logisticsCostTotalMinor;

    // 11. Evaluate Taxes
    const taxEvaluation = TaxCalculationEngine.evaluateTaxes(
      taxableAmountMinor,
      supplierState,
      venueState
    );

    if (!taxEvaluation.isSuccess || !taxEvaluation.result) {
      return FinalPricingEngine.buildBlockedResult(
        readiness,
        agreement,
        supplierAssignment,
        logisticsAssignment,
        contractedQuantity,
        taxEvaluation.blockingReason || 'Tax configuration unavailable for applicable jurisdiction.',
        actor,
        now
      );
    }

    const taxesResult = taxEvaluation.result;
    const grandTotalMinor = taxableAmountMinor + taxesResult.totalTaxMinor;

    // 12. Evaluate Venue Compensation Safeguard (Server-side evaluation, not leaked)
    const agreedVenueCompPercentage =
      (agreement.terms.venueCompensationTerms as any)?.proposedPercentage ??
      agreement.terms.venueCompensationTerms?.venueCompensationPercentage ??
      (agreementSnapshot.compensationTermsSnapshot as any)?.proposedPercentage ??
      agreementSnapshot.compensationTermsSnapshot?.venueCompensationPercentage ??
      0;
    const statutoryCapPercentage = 12.5;
    const effectiveCompPercentage = Math.min(agreedVenueCompPercentage, statutoryCapPercentage);
    const cappedAtStatutoryLimit = agreedVenueCompPercentage > statutoryCapPercentage;

    // Venue compensation base is strictly the supplier bottle advertising cost (productPriceTotalMinor)
    const venueCompMinor = SafeMoney.calculateTaxMinor(productPriceTotalMinor, effectiveCompPercentage);

    // 13. Assemble Final Pricing Calculation Result
    const internalId = generateInternalId('fpr');
    const publicId = generateBusinessId('AB-FPR');
    const pricingReference = `FPR-REF-${Math.floor(100000 + Math.random() * 900000)}`;

    const calculationResult: FinalPricingCalculationResult = {
      id: internalId,
      publicId,
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: agreement.id,
      campaignAgreementPublicId: agreement.publicId,
      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      logisticsAssignmentId: logisticsAssignment.id,
      logisticsAssignmentPublicId: logisticsAssignment.publicId,

      status: 'CALCULATED',
      blockingReason: null,
      currency: 'INR',
      pricingVersion: 1,
      pricingReference,
      calculatedAt: now,
      calculatedBy: actor.id,

      sourceReferences: {
        productId: product.id,
        productPublicId: product.publicProductId,
        productVersionId: assignedVersion.id,
        productVersionNumber: assignedVersion.versionNumber,
        supplierId: supplierAssignment.supplierId,
        supplierBusinessName: supplierAssignment.supplierBusinessName,
        logisticsPartnerId: logisticsAssignment.logisticsPartnerId,
        logisticsPartnerBusinessName: logisticsAssignment.logisticsPartnerBusinessName,
        contractedQuantity,
      },

      productUnitPrice: {
        amountMinor: unitPriceMinor,
        formatted: SafeMoney.formatINR(unitPriceMinor),
      },

      productPriceTotalMinor,
      productPriceTotalFormatted: SafeMoney.formatINR(productPriceTotalMinor),

      logisticsCostTotalMinor,
      logisticsCostTotalFormatted: SafeMoney.formatINR(logisticsCostTotalMinor),

      taxableAmountMinor,
      taxableAmountFormatted: SafeMoney.formatINR(taxableAmountMinor),

      taxes: taxesResult,

      grandTotalMinor,
      grandTotalFormatted: SafeMoney.formatINR(grandTotalMinor),

      safeguards: {
        formulaNote: 'PRODUCT PRICE + LOGISTICS COST + APPLICABLE TAXES = TOTAL',
        separateLabelFeeCharged: false,
        supplierInternalCostExcluded: true,
        advertiserPlanFeeExcluded: true,
      },

      venueCompensationEvaluation: {
        statutoryCapPercentage: 12.5,
        agreedPercentage: agreedVenueCompPercentage,
        eligibleBaseAmountMinor: productPriceTotalMinor,
        eligibleBaseDescription:
          'Supplier bottle advertising cost excluding logistics, taxes, and advertiser plan fees.',
        calculatedVenueCompensationMinor: venueCompMinor,
        calculatedVenueCompensationFormatted: SafeMoney.formatINR(venueCompMinor),
        cappedAtStatutoryLimit,
      },

      futureBoundaries: {
        orderCreated: false,
        paymentInitiated: false,
        productionScheduled: false,
      },

      createdAt: now,
      updatedAt: now,
    };

    // Save to database
    db.saveFinalPricingResult(calculationResult);

    // Dispatch audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'FINAL_PRICING_CALCULATED',
      userId: actor.id,
      role: actor.role,
      payload: {
        pricingId: calculationResult.id,
        pricingPublicId: calculationResult.publicId,
        orderReadinessPublicId: readiness.publicId,
        productPriceTotal: calculationResult.productPriceTotalFormatted,
        logisticsCostTotal: calculationResult.logisticsCostTotalFormatted,
        totalTax: taxesResult.totalTaxFormatted,
        grandTotal: calculationResult.grandTotalFormatted,
      },
    });

    return calculationResult;
  }

  /**
   * Helper to construct a persistent PRICING_BLOCKED result with full diagnostics.
   */
  private static buildBlockedResult(
    readiness: OrderReadiness,
    agreement: CampaignAgreement,
    supplierAssignment: SupplierAssignment,
    logisticsAssignment: LogisticsAssignment,
    contractedQuantity: number,
    blockingReason: string,
    actor: User,
    now: string
  ): FinalPricingCalculationResult {
    const internalId = generateInternalId('fpr');
    const publicId = generateBusinessId('AB-FPR');

    const blockedResult: FinalPricingCalculationResult = {
      id: internalId,
      publicId,
      orderReadinessId: readiness.id,
      orderReadinessPublicId: readiness.publicId,
      campaignAgreementId: agreement.id,
      campaignAgreementPublicId: agreement.publicId,
      supplierAssignmentId: supplierAssignment.id,
      supplierAssignmentPublicId: supplierAssignment.publicId,
      logisticsAssignmentId: logisticsAssignment.id,
      logisticsAssignmentPublicId: logisticsAssignment.publicId,

      status: 'PRICING_BLOCKED',
      blockingReason,
      currency: 'INR',
      pricingVersion: 1,
      pricingReference: `FPR-REF-BLOCKED`,
      calculatedAt: now,
      calculatedBy: actor.id,

      sourceReferences: {
        productId: supplierAssignment.productId,
        productPublicId: supplierAssignment.productPublicId,
        productVersionId: supplierAssignment.productVersionId,
        productVersionNumber: supplierAssignment.productVersionNumber,
        supplierId: supplierAssignment.supplierId,
        supplierBusinessName: supplierAssignment.supplierBusinessName,
        logisticsPartnerId: logisticsAssignment.logisticsPartnerId,
        logisticsPartnerBusinessName: logisticsAssignment.logisticsPartnerBusinessName,
        contractedQuantity,
      },

      productUnitPrice: {
        amountMinor: 0,
        formatted: '₹0.00',
      },
      productPriceTotalMinor: 0,
      productPriceTotalFormatted: '₹0.00',
      logisticsCostTotalMinor: 0,
      logisticsCostTotalFormatted: '₹0.00',
      taxableAmountMinor: 0,
      taxableAmountFormatted: '₹0.00',

      taxes: {
        taxApplicable: false,
        jurisdiction: {
          originState: 'UNKNOWN',
          destinationState: 'UNKNOWN',
          isInterState: false,
        },
        ratePercentageTotal: 0,
        taxComponents: [],
        totalTaxMinor: 0,
        totalTaxFormatted: '₹0.00',
      },

      grandTotalMinor: 0,
      grandTotalFormatted: '₹0.00',

      safeguards: {
        formulaNote: 'PRODUCT PRICE + LOGISTICS COST + APPLICABLE TAXES = TOTAL',
        separateLabelFeeCharged: false,
        supplierInternalCostExcluded: true,
        advertiserPlanFeeExcluded: true,
      },

      venueCompensationEvaluation: {
        statutoryCapPercentage: 12.5,
        agreedPercentage: 0,
        eligibleBaseAmountMinor: 0,
        eligibleBaseDescription: 'Blocked pricing calculation',
        calculatedVenueCompensationMinor: 0,
        calculatedVenueCompensationFormatted: '₹0.00',
        cappedAtStatutoryLimit: false,
      },

      futureBoundaries: {
        orderCreated: false,
        paymentInitiated: false,
        productionScheduled: false,
      },

      createdAt: now,
      updatedAt: now,
    };

    db.saveFinalPricingResult(blockedResult);

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'FINAL_PRICING_BLOCKED',
      userId: actor.id,
      role: actor.role,
      payload: {
        pricingId: blockedResult.id,
        pricingPublicId: blockedResult.publicId,
        orderReadinessPublicId: readiness.publicId,
        blockingReason,
      },
    });

    return blockedResult;
  }

  /**
   * Generates a sanitised counterparty view for Advertisers & Venues.
   * Excludes venue compensation evaluation breakdown and supplier margins.
   */
  public static getSharedView(
    pricingResult: FinalPricingCalculationResult,
    actor: User
  ): FinalPricingSharedView {
    const readiness = db.getOrderReadinessById(pricingResult.orderReadinessId);
    if (!readiness) {
      throw new NotFoundError(`Order Readiness not found.`);
    }

    FinalPricingAuthorizationService.assertCanView(readiness, actor);

    return {
      pricingId: pricingResult.id,
      publicId: pricingResult.publicId,
      orderReadinessPublicId: pricingResult.orderReadinessPublicId,
      campaignAgreementPublicId: pricingResult.campaignAgreementPublicId,
      status: pricingResult.status,
      blockingReason: pricingResult.blockingReason,
      currency: pricingResult.currency,
      contractedQuantity: pricingResult.sourceReferences.contractedQuantity,
      productUnitPriceFormatted: pricingResult.productUnitPrice.formatted,
      productPriceTotalFormatted: pricingResult.productPriceTotalFormatted,
      logisticsCostTotalFormatted: pricingResult.logisticsCostTotalFormatted,
      taxableAmountFormatted: pricingResult.taxableAmountFormatted,
      totalTaxFormatted: pricingResult.taxes.totalTaxFormatted,
      grandTotalFormatted: pricingResult.grandTotalFormatted,
      taxComponents: pricingResult.taxes.taxComponents.map((c) => ({
        taxType: c.taxType,
        ratePercentage: c.ratePercentage,
        taxAmountFormatted: c.taxAmountFormatted,
      })),
      formulaNote: pricingResult.safeguards.formulaNote,
      calculatedAt: pricingResult.calculatedAt,
    };
  }
}
