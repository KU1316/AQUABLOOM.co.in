/**
 * AquaBloom Product Validation & Business Logic Engine — Step 3
 * 
 * Enforces authoritative rules for:
 * 1. Supplier eligibility (Approved status, Active account, Complete profile)
 * 2. Product configuration integrity (Volume, Material, Finish, Print)
 * 3. Commercial pricing (INR only, inclusive pricing, non-negative)
 * 4. Operational rules (Positive MOQ, structured lead times)
 * 5. Lifecycle state machine transitions
 * 6. Historical version effective-dating and public sanitization
 */

import {
  CreateProductInput,
  CreateProductVersionInput,
  ProductStatus,
  ProductAvailability,
  ProductVersion,
  Product,
  CustomerFacingProductSummary,
  User,
  SupplierProfile,
} from '../types.js';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field?: string; message: string; code?: string }>;
}

/**
 * Validates supplier operational eligibility to author or manage products.
 */
export function validateSupplierEligibility(
  supplierUser: User | null | undefined,
  supplierProfile: SupplierProfile | null | undefined
): ValidationResult {
  const errors: Array<{ field?: string; message: string; code?: string }> = [];

  if (!supplierUser) {
    errors.push({ field: 'supplierUser', message: 'Supplier account does not exist or is unauthenticated.' });
    return { isValid: false, errors };
  }

  if (supplierUser.role !== 'SUPPLIER') {
    errors.push({ field: 'role', message: `Only accounts with the SUPPLIER role can author products (current role: ${supplierUser.role}).` });
  }

  if (supplierUser.status === 'SUSPENDED' || supplierUser.status === 'DEACTIVATED' || supplierUser.status === 'RESTRICTED') {
    errors.push({ field: 'accountStatus', message: `Supplier account is ${supplierUser.status}. Product operations are restricted.` });
  }

  if (!supplierProfile) {
    errors.push({ field: 'profile', message: 'Supplier operational profile has not been initialized.' });
    return { isValid: false, errors };
  }

  if (supplierProfile.approvalStatus !== 'APPROVED') {
    errors.push({
      field: 'approvalStatus',
      code: 'SUPPLIER_NOT_APPROVED',
      message: `Supplier operational status is '${supplierProfile.approvalStatus}'. Only APPROVED suppliers may create and supply production products.`,
    });
  }

  const isProfileComplete =
    supplierProfile.completion?.isComplete ??
    (supplierProfile as any).profileCompletion?.isComplete ??
    true;

  if (!isProfileComplete) {
    errors.push({
      field: 'profileCompletion',
      message: 'Supplier profile must be 100% complete before creating catalog products.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates input for creating a new product master record.
 */
export function validateProductCreation(
  input: CreateProductInput,
  supplierUser?: User | null,
  supplierProfile?: SupplierProfile | null
): ValidationResult {
  const errors: Array<{ field?: string; message: string }> = [];

  // Check eligibility if context is provided
  if (supplierUser && supplierProfile) {
    const eligibility = validateSupplierEligibility(supplierUser, supplierProfile);
    if (!eligibility.isValid) {
      errors.push(...eligibility.errors);
    }
  }

  // Name
  if (!input.name || typeof input.name !== 'string' || input.name.trim().length < 3) {
    errors.push({ field: 'name', message: 'Product name is required (minimum 3 characters).' });
  } else if (input.name.trim().length > 120) {
    errors.push({ field: 'name', message: 'Product name must not exceed 120 characters.' });
  }

  // Category
  if (!input.category || typeof input.category !== 'string' || input.category.trim().length === 0) {
    errors.push({ field: 'category', message: 'Product category is required (e.g. Natural Spring Water, Sparkling Mineral).' });
  }

  // Specifications
  if (!input.specifications) {
    errors.push({ field: 'specifications', message: 'Physical bottle specifications are required.' });
  } else {
    const s = input.specifications;
    if (!s.bottleMaterial || typeof s.bottleMaterial !== 'string' || s.bottleMaterial.trim().length === 0) {
      errors.push({ field: 'specifications.bottleMaterial', message: 'Bottle material specification is required (e.g. 100% rPET, Aluminum, Glass).' });
    }

    if (typeof s.bottleCapacityMl !== 'number' || isNaN(s.bottleCapacityMl) || s.bottleCapacityMl <= 0) {
      errors.push({ field: 'specifications.bottleCapacityMl', message: 'Bottle volume must be a positive numeric value in milliliters (ml).' });
    }

    if (!s.bottleShape || typeof s.bottleShape !== 'string' || s.bottleShape.trim().length === 0) {
      errors.push({ field: 'specifications.bottleShape', message: 'Bottle shape profile is required.' });
    }

    if (!s.bottleType || typeof s.bottleType !== 'string' || s.bottleType.trim().length === 0) {
      errors.push({ field: 'specifications.bottleType', message: 'Bottle container type is required.' });
    }

    if (!s.capType || typeof s.capType !== 'string' || s.capType.trim().length === 0) {
      errors.push({ field: 'specifications.capType', message: 'Cap specification is required.' });
    }

    if (!s.labelType || typeof s.labelType !== 'string' || s.labelType.trim().length === 0) {
      errors.push({ field: 'specifications.labelType', message: 'Label type specification is required (e.g. Full-Wrap Shrink Sleeve).' });
    }

    if (!s.printingCapability || typeof s.printingCapability !== 'string' || s.printingCapability.trim().length === 0) {
      errors.push({ field: 'specifications.printingCapability', message: 'Printing capability specification is required.' });
    }
  }

  // Customer-Facing Price
  if (!input.customerFacingPrice) {
    errors.push({ field: 'customerFacingPrice', message: 'Customer-facing unit price is required.' });
  } else {
    const { amount, currency } = input.customerFacingPrice;
    if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
      errors.push({ field: 'customerFacingPrice.amount', message: 'Customer-facing price amount must be a non-negative number.' });
    }

    if (currency && currency !== 'INR') {
      errors.push({ field: 'customerFacingPrice.currency', message: "Currency must be 'INR' for AquaBloom India operations." });
    }
  }

  // Supplier Internal Cost (Private, optional)
  if (input.supplierInternalCost) {
    const { amount, currency } = input.supplierInternalCost;
    if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
      errors.push({ field: 'supplierInternalCost.amount', message: 'Supplier internal cost must be a non-negative number.' });
    }
    if (currency && currency !== 'INR') {
      errors.push({ field: 'supplierInternalCost.currency', message: "Currency must be 'INR'." });
    }
  }

  // Minimum Order Quantity (MOQ)
  if (
    typeof input.minimumOrderQuantity !== 'number' ||
    isNaN(input.minimumOrderQuantity) ||
    !Number.isInteger(input.minimumOrderQuantity) ||
    input.minimumOrderQuantity <= 0
  ) {
    errors.push({ field: 'minimumOrderQuantity', message: 'Minimum order quantity (MOQ) must be a positive integer.' });
  }

  // Production Lead Time
  if (!input.productionLeadTime) {
    errors.push({ field: 'productionLeadTime', message: 'Production lead time is required.' });
  } else {
    const { value, unit } = input.productionLeadTime;
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
      errors.push({ field: 'productionLeadTime.value', message: 'Lead time duration must be a positive number.' });
    }
    if (unit !== 'DAYS' && unit !== 'WEEKS') {
      errors.push({ field: 'productionLeadTime.unit', message: "Lead time unit must be either 'DAYS' or 'WEEKS'." });
    }
  }

  // Status
  if (input.status && input.status !== 'DRAFT' && input.status !== 'ACTIVE') {
    errors.push({ field: 'status', message: "Initial product status must be either 'DRAFT' or 'ACTIVE'." });
  }

  // Availability
  const validAvailabilities: ProductAvailability[] = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];
  if (input.availability && !validAvailabilities.includes(input.availability)) {
    errors.push({
      field: 'availability',
      message: `Invalid availability. Must be one of: ${validAvailabilities.join(', ')}`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates product lifecycle state transitions.
 * 
 * Transition Matrix:
 * DRAFT -> ACTIVE, DISCONTINUED
 * ACTIVE -> INACTIVE, DISCONTINUED
 * INACTIVE -> ACTIVE, DISCONTINUED
 * DISCONTINUED -> Terminal (cannot reactivate automatically)
 */
export function validateStatusTransition(
  currentStatus: ProductStatus,
  targetStatus: ProductStatus
): ValidationResult {
  if (currentStatus === targetStatus) {
    return { isValid: true, errors: [] };
  }

  if (currentStatus === 'DISCONTINUED') {
    return {
      isValid: false,
      errors: [
        {
          field: 'status',
          message: 'Discontinued products cannot be reactivated automatically. Master data is permanently archived.',
        },
      ],
    };
  }

  const validTransitions: Record<ProductStatus, ProductStatus[]> = {
    DRAFT: ['ACTIVE', 'DISCONTINUED'],
    ACTIVE: ['INACTIVE', 'DISCONTINUED'],
    INACTIVE: ['ACTIVE', 'DISCONTINUED'],
    DISCONTINUED: [],
  };

  const allowed = validTransitions[currentStatus] || [];
  if (!allowed.includes(targetStatus)) {
    return {
      isValid: false,
      errors: [
        {
          field: 'status',
          message: `Cannot transition product status from '${currentStatus}' to '${targetStatus}'. Allowed: ${allowed.join(', ')}`,
        },
      ],
    };
  }

  return { isValid: true, errors: [] };
}

/**
 * Validates input for creating a new product version.
 */
export function validateProductVersionCreation(input: CreateProductVersionInput): ValidationResult {
  const errors: Array<{ field?: string; message: string }> = [];

  // Effective From Date
  if (input.effectiveFrom) {
    const parsed = new Date(input.effectiveFrom);
    if (isNaN(parsed.getTime())) {
      errors.push({ field: 'effectiveFrom', message: 'effectiveFrom must be a valid ISO date/time string.' });
    }
  }

  // Price
  if (!input.customerFacingPrice) {
    errors.push({ field: 'customerFacingPrice', message: 'Customer-facing price is required.' });
  } else {
    const { amount, currency } = input.customerFacingPrice;
    if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
      errors.push({ field: 'customerFacingPrice.amount', message: 'Price amount must be a non-negative number.' });
    }
    if (currency && currency !== 'INR') {
      errors.push({ field: 'customerFacingPrice.currency', message: "Currency must be 'INR'." });
    }
  }

  // Internal Cost
  if (input.supplierInternalCost) {
    const { amount, currency } = input.supplierInternalCost;
    if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
      errors.push({ field: 'supplierInternalCost.amount', message: 'Supplier internal cost must be a non-negative number.' });
    }
    if (currency && currency !== 'INR') {
      errors.push({ field: 'supplierInternalCost.currency', message: "Currency must be 'INR'." });
    }
  }

  // MOQ
  if (
    typeof input.minimumOrderQuantity !== 'number' ||
    isNaN(input.minimumOrderQuantity) ||
    !Number.isInteger(input.minimumOrderQuantity) ||
    input.minimumOrderQuantity <= 0
  ) {
    errors.push({ field: 'minimumOrderQuantity', message: 'Minimum order quantity must be a positive integer.' });
  }

  // Lead Time
  if (!input.productionLeadTime) {
    errors.push({ field: 'productionLeadTime', message: 'Production lead time is required.' });
  } else {
    const { value, unit } = input.productionLeadTime;
    if (typeof value !== 'number' || isNaN(value) || value <= 0) {
      errors.push({ field: 'productionLeadTime.value', message: 'Lead time duration must be a positive number.' });
    }
    if (unit !== 'DAYS' && unit !== 'WEEKS') {
      errors.push({ field: 'productionLeadTime.unit', message: "Lead time unit must be either 'DAYS' or 'WEEKS'." });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Finds the currently active effective product version for a given timestamp.
 * 
 * Rules:
 * - effectiveFrom <= targetDate
 * - effectiveUntil is null OR effectiveUntil > targetDate
 * - If multiple versions qualify, picks the one with highest versionNumber / latest effectiveFrom.
 */
export function getEffectiveProductVersion(
  versions: ProductVersion[],
  targetDate: Date = new Date()
): ProductVersion | undefined {
  const targetTime = targetDate.getTime();

  const matching = versions.filter((v) => {
    const fromTime = new Date(v.effectiveFrom).getTime();
    if (fromTime > targetTime) return false; // In the future

    if (v.effectiveUntil) {
      const untilTime = new Date(v.effectiveUntil).getTime();
      if (untilTime <= targetTime) return false; // Already expired
    }

    return true;
  });

  if (matching.length === 0) return undefined;

  // Sort by latest effectiveFrom desc, then highest versionNumber desc
  matching.sort((a, b) => {
    const timeDiff = new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.versionNumber - a.versionNumber;
  });

  return matching[0];
}

/**
 * Sanitizes a product for public/customer/advertiser viewing.
 * Strictly removes supplier internal costs, private profit margins, and internal IDs.
 */
export function sanitizeProductForMarketplace(product: Product): CustomerFacingProductSummary {
  return {
    publicProductId: product.publicProductId,
    name: product.name,
    description: product.description,
    category: product.category,
    status: product.status,
    availability: product.availability,
    versionNumber: product.currentVersionNumber,
    specifications: product.specifications,
    customerFacingPrice: {
      amount: product.customerFacingPrice.amount,
      currency: product.customerFacingPrice.currency,
    },
    minimumOrderQuantity: product.minimumOrderQuantity,
    productionLeadTime: product.productionLeadTime,
    updatedAt: product.updatedAt,
  };
}
