/**
 * AquaBloom Profile Validation & Completion Engine
 * 
 * Enforces business rules:
 * - Clear separation between Account (auth/identity) and Profile (business details)
 * - Required vs. Optional field categorization
 * - Non-arbitrary, honest mathematical completion calculation
 * - Validation of physical/operational constraints (positive numbers, valid contacts)
 * - Venue public visibility determination (PRIVATE -> PUBLIC_ELIGIBLE)
 */

import {
  AdvertiserProfile,
  VenueProfile,
  SupplierProfile,
  LogisticsProfile,
  ProfileCompletion,
  VenueVisibilityState,
} from '../types.js';

export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  completion: ProfileCompletion;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_REGEX = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;

// 1. ADVERTISER PROFILE VALIDATION & COMPLETION
export function calculateAdvertiserCompletion(
  profile: Partial<AdvertiserProfile>
): ProfileCompletion {
  const requiredChecks: Array<{ field: string; label: string; passed: boolean }> = [
    {
      field: 'brandName',
      label: 'Brand / Business Name',
      passed: typeof profile.brandName === 'string' && profile.brandName.trim().length >= 2,
    },
    {
      field: 'industry',
      label: 'Industry / Business Type',
      passed: typeof profile.industry === 'string' && profile.industry.trim().length >= 2,
    },
    {
      field: 'description',
      label: 'Business Description',
      passed: typeof profile.description === 'string' && profile.description.trim().length >= 10,
    },
    {
      field: 'primaryContact.name',
      label: 'Primary Contact Name',
      passed:
        typeof profile.primaryContact?.name === 'string' &&
        profile.primaryContact.name.trim().length >= 2,
    },
    {
      field: 'primaryContact.email',
      label: 'Primary Contact Email',
      passed:
        typeof profile.primaryContact?.email === 'string' &&
        EMAIL_REGEX.test(profile.primaryContact.email.trim()),
    },
    {
      field: 'location.city',
      label: 'Headquarters City',
      passed:
        typeof profile.location?.city === 'string' && profile.location.city.trim().length >= 2,
    },
    {
      field: 'location.country',
      label: 'Headquarters Country',
      passed:
        typeof profile.location?.country === 'string' &&
        profile.location.country.trim().length >= 2,
    },
  ];

  const missingRequiredFields = requiredChecks
    .filter((c) => !c.passed)
    .map((c) => c.label);

  const passedCount = requiredChecks.filter((c) => c.passed).length;
  const percentage = Math.round((passedCount / requiredChecks.length) * 100);

  return {
    isComplete: missingRequiredFields.length === 0,
    percentage,
    missingRequiredFields,
  };
}

export function validateAdvertiserProfile(
  data: Partial<AdvertiserProfile>
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (data.websiteUrl && data.websiteUrl.trim().length > 0) {
    if (!URL_REGEX.test(data.websiteUrl.trim())) {
      errors.push({ field: 'websiteUrl', message: 'Please enter a valid website URL.' });
    }
  }

  if (data.primaryContact?.email && !EMAIL_REGEX.test(data.primaryContact.email.trim())) {
    errors.push({ field: 'primaryContact.email', message: 'Valid contact email is required.' });
  }

  const completion = calculateAdvertiserCompletion(data);

  return {
    isValid: errors.length === 0,
    errors,
    completion,
  };
}

// 2. VENUE PROFILE VALIDATION & COMPLETION
export function calculateVenueCompletion(
  profile: Partial<VenueProfile>
): { completion: ProfileCompletion; visibilityState: VenueVisibilityState } {
  const requiredChecks: Array<{ field: string; label: string; passed: boolean }> = [
    {
      field: 'venueName',
      label: 'Venue Name',
      passed: typeof profile.venueName === 'string' && profile.venueName.trim().length >= 2,
    },
    {
      field: 'venueType',
      label: 'Venue Type',
      passed: typeof profile.venueType === 'string' && profile.venueType.trim().length >= 2,
    },
    {
      field: 'description',
      label: 'Venue Description',
      passed: typeof profile.description === 'string' && profile.description.trim().length >= 10,
    },
    {
      field: 'location.city',
      label: 'City',
      passed:
        typeof profile.location?.city === 'string' && profile.location.city.trim().length >= 2,
    },
    {
      field: 'location.country',
      label: 'Country',
      passed:
        typeof profile.location?.country === 'string' &&
        profile.location.country.trim().length >= 2,
    },
    {
      field: 'audienceCategory',
      label: 'Audience Category',
      passed:
        typeof profile.audienceCategory === 'string' &&
        profile.audienceCategory.trim().length >= 2,
    },
    {
      field: 'footfall.monthlyVisitors',
      label: 'Monthly Footfall Count',
      passed:
        typeof profile.footfall?.monthlyVisitors === 'number' &&
        profile.footfall.monthlyVisitors >= 0,
    },
    {
      field: 'bottleConsumption.estimatedMonthlyBottles',
      label: 'Estimated Monthly Bottle Consumption',
      passed:
        typeof profile.bottleConsumption?.estimatedMonthlyBottles === 'number' &&
        profile.bottleConsumption.estimatedMonthlyBottles >= 0,
    },
    {
      field: 'capacity.maxBottleHoldingCapacity',
      label: 'Maximum Bottle Holding Capacity',
      passed:
        typeof profile.capacity?.maxBottleHoldingCapacity === 'number' &&
        profile.capacity.maxBottleHoldingCapacity >= 0,
    },
    {
      field: 'campaignAvailability',
      label: 'Campaign Availability Window',
      passed:
        typeof profile.campaignAvailability === 'string' &&
        profile.campaignAvailability.trim().length >= 2,
    },
    {
      field: 'operationalContact.coordinatorName',
      label: 'Property Coordinator Name',
      passed:
        typeof profile.operationalContact?.coordinatorName === 'string' &&
        profile.operationalContact.coordinatorName.trim().length >= 2,
    },
    {
      field: 'operationalContact.email',
      label: 'Coordinator Contact Email',
      passed:
        typeof profile.operationalContact?.email === 'string' &&
        EMAIL_REGEX.test(profile.operationalContact.email.trim()),
    },
  ];

  const missingRequiredFields = requiredChecks
    .filter((c) => !c.passed)
    .map((c) => c.label);

  const passedCount = requiredChecks.filter((c) => c.passed).length;
  const percentage = Math.round((passedCount / requiredChecks.length) * 100);

  const isComplete = missingRequiredFields.length === 0;

  // Determine visibility state: if complete, eligible for public venue directory listing
  let visibilityState: VenueVisibilityState = profile.visibilityState || 'PRIVATE';
  if (isComplete && visibilityState === 'PRIVATE') {
    visibilityState = 'PUBLIC_ELIGIBLE';
  } else if (!isComplete) {
    visibilityState = 'PRIVATE';
  }

  return {
    completion: {
      isComplete,
      percentage,
      missingRequiredFields,
    },
    visibilityState,
  };
}

export function validateVenueProfile(data: Partial<VenueProfile>): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (
    data.capacity?.maxBottleHoldingCapacity !== undefined &&
    data.capacity.maxBottleHoldingCapacity < 0
  ) {
    errors.push({
      field: 'capacity.maxBottleHoldingCapacity',
      message: 'Bottle capacity must be a positive number.',
    });
  }

  if (
    data.footfall?.monthlyVisitors !== undefined &&
    data.footfall.monthlyVisitors < 0
  ) {
    errors.push({
      field: 'footfall.monthlyVisitors',
      message: 'Monthly visitors count cannot be negative.',
    });
  }

  if (
    data.bottleConsumption?.estimatedMonthlyBottles !== undefined &&
    data.bottleConsumption.estimatedMonthlyBottles < 0
  ) {
    errors.push({
      field: 'bottleConsumption.estimatedMonthlyBottles',
      message: 'Bottle consumption estimate cannot be negative.',
    });
  }

  if (
    data.operationalContact?.email &&
    !EMAIL_REGEX.test(data.operationalContact.email.trim())
  ) {
    errors.push({
      field: 'operationalContact.email',
      message: 'Valid operational contact email is required.',
    });
  }

  const { completion } = calculateVenueCompletion(data);

  return {
    isValid: errors.length === 0,
    errors,
    completion,
  };
}

// 3. SUPPLIER PROFILE VALIDATION & COMPLETION
export function calculateSupplierCompletion(
  profile: Partial<SupplierProfile>
): ProfileCompletion {
  const requiredChecks: Array<{ field: string; label: string; passed: boolean }> = [
    {
      field: 'supplierBusinessName',
      label: 'Supplier / Bottler Business Name',
      passed:
        typeof profile.supplierBusinessName === 'string' &&
        profile.supplierBusinessName.trim().length >= 2,
    },
    {
      field: 'description',
      label: 'Facility & Production Overview',
      passed: typeof profile.description === 'string' && profile.description.trim().length >= 10,
    },
    {
      field: 'primaryContact.name',
      label: 'Plant / Commercial Contact Name',
      passed:
        typeof profile.primaryContact?.name === 'string' &&
        profile.primaryContact.name.trim().length >= 2,
    },
    {
      field: 'primaryContact.email',
      label: 'Primary Contact Email',
      passed:
        typeof profile.primaryContact?.email === 'string' &&
        EMAIL_REGEX.test(profile.primaryContact.email.trim()),
    },
    {
      field: 'operatingLocation.facilityCity',
      label: 'Bottling Facility City',
      passed:
        typeof profile.operatingLocation?.facilityCity === 'string' &&
        profile.operatingLocation.facilityCity.trim().length >= 2,
    },
    {
      field: 'operatingLocation.country',
      label: 'Operating Country',
      passed:
        typeof profile.operatingLocation?.country === 'string' &&
        profile.operatingLocation.country.trim().length >= 2,
    },
    {
      field: 'capabilities.waterTypes',
      label: 'Water Sourcing Capabilities',
      passed:
        Array.isArray(profile.capabilities?.waterTypes) &&
        profile.capabilities!.waterTypes.length > 0,
    },
    {
      field: 'capabilities.bottleMaterials',
      label: 'Bottle Material Capabilities',
      passed:
        Array.isArray(profile.capabilities?.bottleMaterials) &&
        profile.capabilities!.bottleMaterials.length > 0,
    },
    {
      field: 'capabilities.bottleSizes',
      label: 'Bottle Size Formats',
      passed:
        Array.isArray(profile.capabilities?.bottleSizes) &&
        profile.capabilities!.bottleSizes.length > 0,
    },
    {
      field: 'productionCapacity.bottlesPerMonth',
      label: 'Monthly Production Capacity',
      passed:
        typeof profile.productionCapacity?.bottlesPerMonth === 'number' &&
        profile.productionCapacity.bottlesPerMonth >= 0,
    },
    {
      field: 'leadTimeInfo.standardTurnaroundDays',
      label: 'Standard Production Turnaround (Days)',
      passed:
        typeof profile.leadTimeInfo?.standardTurnaroundDays === 'number' &&
        profile.leadTimeInfo.standardTurnaroundDays >= 0,
    },
  ];

  const missingRequiredFields = requiredChecks
    .filter((c) => !c.passed)
    .map((c) => c.label);

  const passedCount = requiredChecks.filter((c) => c.passed).length;
  const percentage = Math.round((passedCount / requiredChecks.length) * 100);

  return {
    isComplete: missingRequiredFields.length === 0,
    percentage,
    missingRequiredFields,
  };
}

export function validateSupplierProfile(
  data: Partial<SupplierProfile>
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (
    data.productionCapacity?.bottlesPerMonth !== undefined &&
    data.productionCapacity.bottlesPerMonth < 0
  ) {
    errors.push({
      field: 'productionCapacity.bottlesPerMonth',
      message: 'Bottles per month cannot be negative.',
    });
  }

  if (
    data.productionCapacity?.minimumRunSize !== undefined &&
    data.productionCapacity.minimumRunSize < 0
  ) {
    errors.push({
      field: 'productionCapacity.minimumRunSize',
      message: 'Minimum run size cannot be negative.',
    });
  }

  if (
    data.leadTimeInfo?.standardTurnaroundDays !== undefined &&
    data.leadTimeInfo.standardTurnaroundDays < 0
  ) {
    errors.push({
      field: 'leadTimeInfo.standardTurnaroundDays',
      message: 'Turnaround days cannot be negative.',
    });
  }

  const completion = calculateSupplierCompletion(data);

  return {
    isValid: errors.length === 0,
    errors,
    completion,
  };
}

// 4. LOGISTICS PARTNER PROFILE VALIDATION & COMPLETION
export function calculateLogisticsCompletion(
  profile: Partial<LogisticsProfile>
): ProfileCompletion {
  const requiredChecks: Array<{ field: string; label: string; passed: boolean }> = [
    {
      field: 'businessName',
      label: 'Logistics Fleet / Carrier Name',
      passed:
        typeof profile.businessName === 'string' && profile.businessName.trim().length >= 2,
    },
    {
      field: 'description',
      label: 'Fleet & Dispatch Overview',
      passed: typeof profile.description === 'string' && profile.description.trim().length >= 10,
    },
    {
      field: 'primaryContact.name',
      label: 'Operations / Dispatch Contact Name',
      passed:
        typeof profile.primaryContact?.name === 'string' &&
        profile.primaryContact.name.trim().length >= 2,
    },
    {
      field: 'primaryContact.email',
      label: 'Dispatch Contact Email',
      passed:
        typeof profile.primaryContact?.email === 'string' &&
        EMAIL_REGEX.test(profile.primaryContact.email.trim()),
    },
    {
      field: 'operatingLocation.hubCity',
      label: 'Primary Terminal / Depot City',
      passed:
        typeof profile.operatingLocation?.hubCity === 'string' &&
        profile.operatingLocation.hubCity.trim().length >= 2,
    },
    {
      field: 'operatingLocation.country',
      label: 'Operating Country',
      passed:
        typeof profile.operatingLocation?.country === 'string' &&
        profile.operatingLocation.country.trim().length >= 2,
    },
    {
      field: 'serviceAreas',
      label: 'Coverage Regions / Service Areas',
      passed: Array.isArray(profile.serviceAreas) && profile.serviceAreas.length > 0,
    },
    {
      field: 'fleetCapabilities.vehicleTypes',
      label: 'Vehicle Fleet Types',
      passed:
        Array.isArray(profile.fleetCapabilities?.vehicleTypes) &&
        profile.fleetCapabilities!.vehicleTypes.length > 0,
    },
    {
      field: 'shipmentCapacity.palletsPerWeek',
      label: 'Weekly Pallet Freight Capacity',
      passed:
        typeof profile.shipmentCapacity?.palletsPerWeek === 'number' &&
        profile.shipmentCapacity.palletsPerWeek >= 0,
    },
    {
      field: 'pickupCapability',
      label: 'Pickup & Loading Capability',
      passed:
        typeof profile.pickupCapability === 'string' &&
        profile.pickupCapability.trim().length >= 2,
    },
    {
      field: 'deliveryCapability',
      label: 'Venue Delivery & Unloading Capability',
      passed:
        typeof profile.deliveryCapability === 'string' &&
        profile.deliveryCapability.trim().length >= 2,
    },
    {
      field: 'operationalAvailability',
      label: 'Operating Hours & Dispatch Schedule',
      passed:
        typeof profile.operationalAvailability === 'string' &&
        profile.operationalAvailability.trim().length >= 2,
    },
  ];

  const missingRequiredFields = requiredChecks
    .filter((c) => !c.passed)
    .map((c) => c.label);

  const passedCount = requiredChecks.filter((c) => c.passed).length;
  const percentage = Math.round((passedCount / requiredChecks.length) * 100);

  return {
    isComplete: missingRequiredFields.length === 0,
    percentage,
    missingRequiredFields,
  };
}

export function validateLogisticsProfile(
  data: Partial<LogisticsProfile>
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];

  if (
    data.shipmentCapacity?.palletsPerWeek !== undefined &&
    data.shipmentCapacity.palletsPerWeek < 0
  ) {
    errors.push({
      field: 'shipmentCapacity.palletsPerWeek',
      message: 'Pallets per week cannot be negative.',
    });
  }

  if (
    data.shipmentCapacity?.maxPayloadWeightKg !== undefined &&
    data.shipmentCapacity.maxPayloadWeightKg < 0
  ) {
    errors.push({
      field: 'shipmentCapacity.maxPayloadWeightKg',
      message: 'Max payload weight cannot be negative.',
    });
  }

  const completion = calculateLogisticsCompletion(data);

  return {
    isValid: errors.length === 0,
    errors,
    completion,
  };
}
