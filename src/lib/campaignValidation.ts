/**
 * AquaBloom Campaign Validation & Sanitization Engine
 * 
 * Step 4: Authoritative business logic for:
 * 1. Advertiser eligibility checks (account status, role, campaign-owner profile details).
 * 2. Campaign requirement validation (machine-readable codes).
 * 3. Status transition state machine.
 * 4. Campaign Opportunity View sanitization (zero private data / cost leakage).
 */

import {
  User,
  AdvertiserProfile,
  Campaign,
  CampaignStatus,
  CampaignValidationResult,
  CampaignValidationError,
  CampaignOpportunityView,
  CreateCampaignInput,
  UpdateCampaignInput,
} from '../types.js';

/**
 * Validates whether an advertiser account is eligible to create or manage campaigns.
 * Rule: Authenticated, ADVERTISER role, eligible account status (not suspended/deactivated/rejected),
 * with minimal campaign-owner profile information.
 * Notice: Advertisers do NOT require Admin approval merely to author campaigns.
 */
export function validateAdvertiserEligibility(
  user: User | null | undefined,
  profile: AdvertiserProfile | null | undefined
): { isValid: boolean; errors: Array<{ field?: string; code: string; message: string }> } {
  const errors: Array<{ field?: string; code: string; message: string }> = [];

  if (!user) {
    errors.push({
      field: 'user',
      code: 'UNAUTHENTICATED',
      message: 'Authentication required to create or manage advertising campaigns.',
    });
    return { isValid: false, errors };
  }

  if (user.role !== 'ADVERTISER') {
    errors.push({
      field: 'role',
      code: 'FORBIDDEN_ROLE',
      message: `Role '${user.role}' is not authorized. Only ADVERTISER accounts can create campaigns.`,
    });
    return { isValid: false, errors };
  }

  // Account Status Check
  const restrictedStatuses = ['SUSPENDED', 'DEACTIVATED', 'REJECTED'];
  if (restrictedStatuses.includes(user.status)) {
    errors.push({
      field: 'status',
      code: 'ACCOUNT_RESTRICTED',
      message: `Advertiser account is currently in '${user.status}' status and cannot create or modify campaigns.`,
    });
  }

  // Campaign-owner Profile verification
  if (!profile) {
    errors.push({
      field: 'profile',
      code: 'MISSING_ADVERTISER_PROFILE',
      message: 'Advertiser profile must be initialized before creating advertising campaigns.',
    });
  } else {
    if (!profile.brandName && !user.organizationName) {
      errors.push({
        field: 'brandName',
        code: 'MISSING_BRAND_NAME',
        message: 'A brand name or organization name is required in the advertiser profile.',
      });
    }
    if (!profile.primaryContact?.email && !user.email) {
      errors.push({
        field: 'primaryContact.email',
        code: 'MISSING_CONTACT_EMAIL',
        message: 'A primary authorized contact email is required.',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates campaign fields.
 * If isSubmittingForMatching is false, checks minimum requirements for DRAFT saving.
 * If isSubmittingForMatching is true, performs exhaustive validation required for READY_FOR_MATCHING.
 */
export function validateCampaign(
  input: Partial<Campaign> | CreateCampaignInput | UpdateCampaignInput,
  isSubmittingForMatching: boolean = false
): CampaignValidationResult {
  const errors: CampaignValidationError[] = [];
  const missingRequiredFields: string[] = [];

  // 1. Campaign Name
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    errors.push({
      field: 'name',
      code: 'MISSING_CAMPAIGN_NAME',
      message: 'Campaign name is required.',
    });
    missingRequiredFields.push('name');
  } else if (name.length < 3) {
    errors.push({
      field: 'name',
      code: 'INVALID_CAMPAIGN_NAME',
      message: 'Campaign name must be at least 3 characters.',
    });
  }

  // If this is merely a draft save and not matching preparation, name is the only hard blocker
  // but we still record missing required fields so the advertiser can track progress.

  // 2. Campaign Objective
  const objective = typeof input.objective === 'string' ? input.objective.trim() : '';
  if (!objective) {
    missingRequiredFields.push('objective');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'objective',
        code: 'MISSING_OBJECTIVE',
        message: 'Campaign objective is required before preparing for venue matching.',
      });
    }
  }

  // 3. Campaign Category / Industry
  const category = typeof input.category === 'string' ? input.category.trim() : '';
  if (!category) {
    missingRequiredFields.push('category');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'category',
        code: 'MISSING_CATEGORY',
        message: 'Industry category is required for venue categorization.',
      });
    }
  }

  // 4. Target Audience
  const audience = input.targetAudience;
  const characteristics = audience?.characteristics || [];
  const demographics = audience?.demographics?.trim() || '';
  const hasAudience = characteristics.length > 0 || demographics.length > 0;
  if (!hasAudience) {
    missingRequiredFields.push('targetAudience');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'targetAudience',
        code: 'MISSING_TARGET_AUDIENCE',
        message: 'Target audience characteristics or demographics are required.',
      });
    }
  }

  // 5. Bottle Requirements & Quantity
  const bottleReqs = input.bottleRequirements;
  const quantity = bottleReqs?.requiredQuantity;
  if (quantity === undefined || quantity === null || typeof quantity !== 'number' || isNaN(quantity) || quantity <= 0 || !Number.isInteger(quantity)) {
    missingRequiredFields.push('bottleRequirements.requiredQuantity');
    if (isSubmittingForMatching || (quantity !== undefined && quantity !== null)) {
      errors.push({
        field: 'bottleRequirements.requiredQuantity',
        code: 'INVALID_QUANTITY',
        message: 'Required bottle quantity must be a positive whole number greater than zero.',
      });
    }
  } else if (quantity < 500) {
    errors.push({
      field: 'bottleRequirements.requiredQuantity',
      code: 'BELOW_MINIMUM_CAMPAIGN_QUANTITY',
      message: 'Campaign bottle quantity must be at least 500 units for batch manufacturing.',
    });
  }

  // 6. Campaign Duration
  const duration = input.timing?.duration;
  const durationValue = duration?.value;
  const durationUnit = duration?.unit;
  const validUnits = ['DAYS', 'WEEKS', 'MONTHS'];

  if (
    durationValue === undefined ||
    durationValue === null ||
    typeof durationValue !== 'number' ||
    isNaN(durationValue) ||
    durationValue <= 0 ||
    !durationUnit ||
    !validUnits.includes(durationUnit)
  ) {
    missingRequiredFields.push('timing.duration');
    if (isSubmittingForMatching || (durationValue !== undefined && durationValue !== null)) {
      errors.push({
        field: 'timing.duration',
        code: 'MISSING_DURATION',
        message: 'Expected campaign duration must specify a positive numeric value and unit (DAYS, WEEKS, or MONTHS).',
      });
    }
  }

  // 7. Preferred Start Period
  const startPeriod = input.timing?.preferredStartPeriod;
  const startPeriodLabel = typeof startPeriod?.label === 'string' ? startPeriod.label.trim() : '';
  if (!startPeriodLabel) {
    missingRequiredFields.push('timing.preferredStartPeriod');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'timing.preferredStartPeriod',
        code: 'MISSING_START_PERIOD',
        message: 'A preferred campaign start period (e.g. Q4 2026, Immediate) is required.',
      });
    }
  }

  // 8. Venue Requirements
  const venueReqs = input.venueRequirements;
  const preferredVenues = venueReqs?.preferredVenueTypes || [];
  const preferredLocations = venueReqs?.preferredLocations || [];
  if (preferredVenues.length === 0 && preferredLocations.length === 0) {
    missingRequiredFields.push('venueRequirements');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'venueRequirements',
        code: 'MISSING_VENUE_REQUIREMENT',
        message: 'At least one preferred venue type or target geographic location is required for matching.',
      });
    }
  }

  // 9. Distribution / Placement Requirements
  const distReqs = input.distributionRequirements;
  const placementDetails = typeof distReqs?.placementDetails === 'string' ? distReqs.placementDetails.trim() : '';
  const placementList = venueReqs?.placementRequirements || [];
  if (!placementDetails && placementList.length === 0) {
    missingRequiredFields.push('distributionRequirements.placementDetails');
    if (isSubmittingForMatching) {
      errors.push({
        field: 'distributionRequirements.placementDetails',
        code: 'MISSING_PLACEMENT_REQUIREMENT',
        message: 'Placement and distribution requirements are required for on-site handling.',
      });
    }
  }

  // 10. Budget sanity check if provided
  if (input.publishedBudget?.disclosed) {
    const min = input.publishedBudget.minAmount;
    const max = input.publishedBudget.maxAmount;
    if (min !== undefined && (typeof min !== 'number' || isNaN(min) || min < 0)) {
      errors.push({
        field: 'publishedBudget.minAmount',
        code: 'INVALID_BUDGET_RANGE',
        message: 'Minimum budget amount cannot be negative.',
      });
    }
    if (max !== undefined && (typeof max !== 'number' || isNaN(max) || max < 0)) {
      errors.push({
        field: 'publishedBudget.maxAmount',
        code: 'INVALID_BUDGET_RANGE',
        message: 'Maximum budget amount cannot be negative.',
      });
    }
    if (min !== undefined && max !== undefined && max < min) {
      errors.push({
        field: 'publishedBudget.maxAmount',
        code: 'INVALID_BUDGET_RANGE',
        message: 'Maximum budget amount cannot be less than minimum budget amount.',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    missingRequiredFields,
  };
}

/**
 * State Transition Matrix for Campaign Lifecycle
 */
const ALLOWED_CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ['READY_FOR_MATCHING', 'CANCELLED'],
  READY_FOR_MATCHING: ['DRAFT', 'MATCHING', 'CANCELLED'],
  MATCHING: ['READY_FOR_MATCHING', 'PROPOSAL_ACTIVE', 'CANCELLED'],
  PROPOSAL_ACTIVE: ['MATCHING', 'AGREEMENT_PENDING', 'CANCELLED'],
  AGREEMENT_PENDING: ['PROPOSAL_ACTIVE', 'AGREEMENT_LOCKED', 'CANCELLED'],
  AGREEMENT_LOCKED: ['ORDER_IN_PROGRESS', 'CANCELLED'],
  ORDER_IN_PROGRESS: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['ACTIVE', 'AT_RISK', 'CANCELLED'],
  ACTIVE: ['AT_RISK', 'COMPLETED', 'CANCELLED'],
  AT_RISK: ['ACTIVE', 'RESOLVED', 'CANCELLED'],
  COMPLETED: [], // Terminal
  CANCELLED: [], // Terminal
  RESOLVED: ['COMPLETED'],
};

/**
 * Validates status transitions through the state machine.
 */
export function validateCampaignStatusTransition(
  fromStatus: CampaignStatus,
  toStatus: CampaignStatus
): { isValid: boolean; allowed: boolean; errors: Array<{ message: string; code: string }> } {
  if (fromStatus === toStatus) {
    return { isValid: true, allowed: true, errors: [] };
  }

  const allowed = ALLOWED_CAMPAIGN_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    return {
      isValid: false,
      allowed: false,
      errors: [
        {
          code: 'INVALID_STATUS_TRANSITION',
          message: `Illegal campaign transition from '${fromStatus}' to '${toStatus}'. Permitted transitions from '${fromStatus}': ${
            allowed.length > 0 ? allowed.join(', ') : 'None (Terminal State)'
          }.`,
        },
      ],
    };
  }

  return { isValid: true, allowed: true, errors: [] };
}

/**
 * Generates a sanitized Public Opportunity Projection for future Venue Discovery.
 * 
 * Strict Isolation:
 * - Omits internal database ID and internal advertiser user ID.
 * - Omits private email, contact phone, CRM information.
 * - Omits supplier information, internal manufacturing costs, and platform margins.
 * - Formats budget safely (e.g. ₹X - ₹Y or Not Disclosed).
 */
export function getCampaignOpportunityView(campaign: Campaign): CampaignOpportunityView {
  let displayBudget:
    | {
        disclosed: boolean;
        displayRange?: string;
        minAmount?: number;
        maxAmount?: number;
        currency: 'INR';
      }
    | undefined = undefined;

  if (campaign.publishedBudget && campaign.publishedBudget.disclosed) {
    const min = campaign.publishedBudget.minAmount;
    const max = campaign.publishedBudget.maxAmount;
    let displayRange = 'Disclosed upon inquiry';

    if (min !== undefined && max !== undefined) {
      displayRange = `₹${min.toLocaleString('en-IN')} – ₹${max.toLocaleString('en-IN')}`;
    } else if (min !== undefined) {
      displayRange = `From ₹${min.toLocaleString('en-IN')}`;
    } else if (max !== undefined) {
      displayRange = `Up to ₹${max.toLocaleString('en-IN')}`;
    }

    displayBudget = {
      disclosed: true,
      displayRange,
      minAmount: min,
      maxAmount: max,
      currency: 'INR',
    };
  } else {
    displayBudget = {
      disclosed: false,
      displayRange: 'Not Disclosed',
      currency: 'INR',
    };
  }

  return {
    publicCampaignId: campaign.publicCampaignId,
    name: campaign.name,
    category: campaign.category,
    objective: campaign.objective,
    targetAudience: {
      characteristics: campaign.targetAudience.characteristics || [],
      demographics: campaign.targetAudience.demographics,
      ageGroups: campaign.targetAudience.ageGroups,
    },
    preferredVenueTypes: campaign.venueRequirements.preferredVenueTypes || [],
    preferredLocations: campaign.venueRequirements.preferredLocations || [],
    requiredQuantity: campaign.bottleRequirements.requiredQuantity,
    expectedDuration: campaign.timing.duration,
    preferredStartPeriod: campaign.timing.preferredStartPeriod,
    bottleRequirements: {
      requiredQuantity: campaign.bottleRequirements.requiredQuantity,
      preferredVolumeMl: campaign.bottleRequirements.preferredVolumeMl,
      volumeLabel: campaign.bottleRequirements.volumeLabel,
      preferredMaterial: campaign.bottleRequirements.preferredMaterial,
      preferredShape: campaign.bottleRequirements.preferredShape,
      bottleType: campaign.bottleRequirements.bottleType,
      capType: campaign.bottleRequirements.capType,
      labelType: campaign.bottleRequirements.labelType,
    },
    placementRequirements: campaign.venueRequirements.placementRequirements || [],
    campaignPreferences: campaign.venueRequirements.campaignPreferences || [],
    collaborationRequirement: campaign.collaborationRequirement,
    eligibilityRequirements: campaign.eligibilityRequirements,
    publishedBudget: displayBudget,
    proposalDeadline: campaign.proposalDeadline,
    status: campaign.status,
    updatedAt: campaign.updatedAt,
  };
}
