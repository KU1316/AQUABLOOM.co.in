/**
 * AquaBloom Step 7 — Campaign Agreement & Commercial Lock Validation Engine
 * 
 * Implements strict domain rules:
 * - Mutually confirmed proposal verification (READY_FOR_AGREEMENT)
 * - Multi-venue independent commercial relationship isolation
 * - Role-based authorization & party verification
 * - Venue compensation cap (Max 12.5% of eligible supplier bottle advertising cost)
 * - Pre-production cancellation terms enforcement
 * - Explicit renewal requirement policy
 * - Role-aware shared view transformation with zero financial/supplier leakage
 */

import {
  User,
  Proposal,
  ProposalVersion,
  Campaign,
  CampaignAgreement,
  CampaignAgreementStatus,
  AgreementCommercialTerms,
  CampaignAgreementSharedView,
  CampaignAgreementPreviewView,
  CampaignAgreementVersion,
  SanitizedAgreementVersion,
  CreateCampaignAgreementInput,
  ConfirmCampaignAgreementInput,
  LockCampaignAgreementInput,
  AdvertiserProfile,
  VenueProfile,
} from '../types.js';

export const VENUE_COMPENSATION_MAX_PERCENTAGE = 12.5;
export const CANCELLATION_POLICY_ID = 'POL-CANC-PREPROD-01';
export const RENEWAL_POLICY_ID = 'POL-RENW-EXPLICIT-01';
export const MASTER_AGREEMENT_REFERENCE = 'AquaBloom Commercial Master Terms v1.2';

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
}

/**
 * Validates that an agreement can be generated from a proposal.
 */
export function validateAgreementCreation(
  proposal: Proposal | undefined,
  campaign: Campaign | undefined,
  actor: User,
  sourceProposalVersion?: ProposalVersion | null
): ValidationResult {
  const errors: ValidationIssue[] = [];

  if (!proposal) {
    errors.push({ field: 'sourceProposalId', message: 'Source proposal does not exist.' });
    return { isValid: false, errors };
  }

  // Actor authorization: Only Advertiser, Venue, or Admin can initiate agreement creation
  if (actor.role !== 'ADMIN') {
    if (actor.role === 'ADVERTISER' && proposal.advertiserId !== actor.id) {
      errors.push({ field: 'actor', message: 'You are not authorized to create an agreement for this proposal.' });
    } else if (actor.role === 'VENUE' && proposal.venueId !== actor.id) {
      errors.push({ field: 'actor', message: 'You are not authorized to create an agreement for this proposal.' });
    } else if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      errors.push({ field: 'actor', message: 'Suppliers and Logistics Partners cannot create or access Campaign Agreements.' });
    }
  }

  // Status must be READY_FOR_AGREEMENT
  if (proposal.status !== 'READY_FOR_AGREEMENT') {
    errors.push({
      field: 'proposalStatus',
      message: `Proposal must be in 'READY_FOR_AGREEMENT' status to create a Campaign Agreement. Current status: '${proposal.status}'.`,
    });
  }

  // Mutual confirmation verification
  if (!proposal.advertiserConfirmedAt) {
    errors.push({
      field: 'advertiserConfirmedAt',
      message: 'Proposal must be confirmed by the Advertiser before an agreement can be created.',
    });
  }

  if (!proposal.venueConfirmedAt) {
    errors.push({
      field: 'venueConfirmedAt',
      message: 'Proposal must be confirmed by the Venue before an agreement can be created.',
    });
  }

  // Check expiration
  if (proposal.status === 'EXPIRED' || (proposal.expiresAt && new Date(proposal.expiresAt).getTime() < Date.now())) {
    errors.push({
      field: 'expiresAt',
      message: 'Source proposal has expired and cannot be converted into a Campaign Agreement.',
    });
  }

  // Check withdrawal or decline
  if (proposal.status === 'WITHDRAWN' || proposal.status === 'DECLINED') {
    errors.push({
      field: 'proposalStatus',
      message: `Proposal has been ${proposal.status.toLowerCase()} and cannot be converted into a Campaign Agreement.`,
    });
  }

  // Validate campaign
  if (!campaign) {
    errors.push({ field: 'campaignId', message: 'Referenced campaign does not exist.' });
  } else {
    if (campaign.id !== proposal.campaignId) {
      errors.push({ field: 'campaignId', message: 'Proposal does not belong to referenced campaign.' });
    }
    if (campaign.advertiserId !== proposal.advertiserId) {
      errors.push({ field: 'campaignId', message: 'Campaign advertiser does not match proposal advertiser.' });
    }
    if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
      errors.push({ field: 'campaignStatus', message: `Campaign is in ${campaign.status} status and is not eligible for agreement creation.` });
    }
  }

  // Validate venue relationship
  if (!proposal.venueId) {
    errors.push({ field: 'venueId', message: 'Proposal does not specify a valid venue recipient.' });
  }

  // Validate source proposal version if provided
  if (sourceProposalVersion !== undefined && sourceProposalVersion !== null) {
    if (sourceProposalVersion.proposalId !== proposal.id) {
      errors.push({
        field: 'sourceProposalVersionId',
        message: 'Source proposal version does not belong to the source proposal.',
      });
    }
    if (sourceProposalVersion.versionNumber !== proposal.currentVersionNumber) {
      errors.push({
        field: 'sourceProposalVersionNumber',
        message: `Source proposal version (v${sourceProposalVersion.versionNumber}) is not the latest mutually confirmed version (v${proposal.currentVersionNumber}).`,
      });
    }
    if ((sourceProposalVersion as any).status && (sourceProposalVersion as any).status !== 'CONFIRMED' && (sourceProposalVersion as any).status !== 'PROPOSED' && (sourceProposalVersion as any).status !== 'DRAFT') {
      errors.push({
        field: 'sourceProposalVersionStatus',
        message: `Source proposal version status '${(sourceProposalVersion as any).status}' is not eligible.`,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates a confirmation attempt on an agreement.
 */
export function validateAgreementConfirmation(
  agreement: CampaignAgreement,
  actor: User,
  input: ConfirmCampaignAgreementInput
): ValidationResult {
  const errors: ValidationIssue[] = [];

  // Role permissions
  if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
    errors.push({
      field: 'actorRole',
      message: 'Suppliers and Logistics Partners are not permitted to access or confirm Campaign Agreements.',
    });
    return { isValid: false, errors };
  }

  // Party affiliation
  if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
    errors.push({
      field: 'actor',
      message: 'You are not the Advertiser party for this Campaign Agreement.',
    });
  } else if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
    errors.push({
      field: 'actor',
      message: 'You are not the Venue party for this Campaign Agreement.',
    });
  } else if (actor.role !== 'ADVERTISER' && actor.role !== 'VENUE' && actor.role !== 'ADMIN') {
    errors.push({
      field: 'actorRole',
      message: 'Only the designated Advertiser, Venue, or an authorized Admin may confirm this agreement.',
    });
  }

  // Status check: cannot confirm if locked, superseded, or terminated
  if (agreement.status === 'LOCKED') {
    errors.push({
      field: 'status',
      message: 'This Campaign Agreement is already LOCKED. Commercial terms are sealed and cannot be re-confirmed.',
    });
  } else if (agreement.status === 'SUPERSEDED' || agreement.status === 'TERMINATED') {
    errors.push({
      field: 'status',
      message: `Cannot confirm agreement with status '${agreement.status}'.`,
    });
  }

  // Version check
  if (input.expectedVersion !== agreement.currentVersionNumber) {
    errors.push({
      field: 'expectedVersion',
      message: `Version conflict: your request specified Version ${input.expectedVersion}, but the active agreement is Version ${agreement.currentVersionNumber}.`,
    });
  }

  // Acknowledgement requirement
  if (!input.acknowledgement) {
    errors.push({
      field: 'acknowledgement',
      message: 'Explicit acknowledgement of the commercial lock and pre-production cancellation terms is required to confirm.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates an atomic lock request.
 */
export function validateAgreementLock(
  agreement: CampaignAgreement,
  actor: User,
  input: LockCampaignAgreementInput
): ValidationResult {
  const errors: ValidationIssue[] = [];

  // Status check: must not already be locked
  if (agreement.status === 'LOCKED') {
    errors.push({
      field: 'status',
      message: 'Campaign Agreement is already LOCKED. Duplicate lock operations are rejected.',
    });
    return { isValid: false, errors };
  }

  // Both parties must have confirmed
  if (!agreement.advertiserConfirmedAt) {
    errors.push({
      field: 'advertiserConfirmedAt',
      message: 'Cannot lock agreement: Advertiser confirmation is missing.',
    });
  }

  if (!agreement.venueConfirmedAt) {
    errors.push({
      field: 'venueConfirmedAt',
      message: 'Cannot lock agreement: Venue confirmation is missing.',
    });
  }

  // Lock version check (optimistic concurrency protection)
  if (input.lockVersion !== agreement.lockVersion) {
    errors.push({
      field: 'lockVersion',
      message: `Concurrent modification detected: expected lock version ${input.lockVersion}, current lock version is ${agreement.lockVersion}.`,
    });
  }

  // Expected version check
  if (input.expectedVersion !== agreement.currentVersionNumber) {
    errors.push({
      field: 'expectedVersion',
      message: `Version mismatch: specified Version ${input.expectedVersion}, current is Version ${agreement.currentVersionNumber}.`,
    });
  }

  // Authorization check
  if (actor.role !== 'ADMIN') {
    if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
      errors.push({ field: 'actor', message: 'You are not authorized to lock this agreement.' });
    } else if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
      errors.push({ field: 'actor', message: 'You are not authorized to lock this agreement.' });
    } else if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      errors.push({ field: 'actorRole', message: 'Suppliers and Logistics Partners cannot lock Campaign Agreements.' });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Assembles default AgreementCommercialTerms from source proposal terms.
 * Guarantees venue compensation cap at 12.5% max.
 */
export function buildAgreementCommercialTerms(
  proposal: Proposal,
  venueProfile?: VenueProfile
): AgreementCommercialTerms {
  const pTerms = proposal.terms;

  // Venue compensation calculation rule
  const rawTerms = proposal.terms as any;
  const requestedPercentage =
    rawTerms.venueCompensationTerms?.proposedPercentage !== undefined
      ? rawTerms.venueCompensationTerms.proposedPercentage
      : rawTerms.venueCompensation?.proposedPercentage !== undefined
      ? rawTerms.venueCompensation.proposedPercentage
      : 10.0;
  const cappedPercentage = Math.min(requestedPercentage, VENUE_COMPENSATION_MAX_PERCENTAGE);

  return {
    campaignQuantity: pTerms.campaignQuantity,
    campaignDuration: pTerms.campaignDuration,
    preferredStartPeriod: pTerms.preferredStartPeriod,
    distributionRequirements: pTerms.distributionRequirements,
    placementRequirements: pTerms.placementRequirements || [
      'Dedicated AquaBloom Placement Display',
      'High-Footfall Visitor Hub',
    ],
    productRequirements: {
      preferredVolumeMl: pTerms.productRequirements?.preferredVolumeMl || 500,
      volumeLabel: pTerms.productRequirements?.volumeLabel || '500 ml Premium',
      preferredMaterial: pTerms.productRequirements?.preferredMaterial || '100% rPET',
      labelType: pTerms.productRequirements?.labelType || 'Full-Wrap Shrink Sleeve',
      capType: pTerms.productRequirements?.capType || 'Tamper-Evident Screw Cap',
      notes: pTerms.productRequirements?.notes || 'Agreed beverage branding formulation',
    },
    collaborationRequirement: pTerms.collaborationRequirement || {
      status: 'NOT_REQUIRED',
    },
    venueCompensationTerms: {
      proposedPercentage: cappedPercentage,
      maximumCapPercentage: VENUE_COMPENSATION_MAX_PERCENTAGE,
      termsDescription: `${cappedPercentage.toFixed(1)}% of eligible supplier total bottle advertising cost.`,
      notes: 'Final monetary compensation will be calculated in downstream pricing lock once supplier production costs are allocated.',
      eligibleBaseDescription: 'Calculated strictly against verified eligible bottle advertising manufacturing cost, excluding logistics and ancillary surcharges.',
    },
    advertiserResponsibilities: [
      'Provide final approved high-resolution vector artwork and brand guidelines prior to production cutoff.',
      'Maintain active contact availability for production proofs and digital sample sign-off.',
      'Acknowledge that campaign cancellation is permitted strictly prior to production start.',
      'Comply with AquaBloom commercial payment schedule upon final order pricing confirmation.',
    ],
    venueResponsibilities: [
      'Maintain dedicated, clean, ambient storage capacity for the agreed campaign bottle volume.',
      'Position bottles exclusively within agreed venue placement staging areas.',
      'Ensure bottles are offered complimentary to verified venue visitors during the campaign window.',
      'Refrain from reselling, redirecting, or tampering with campaign inventory.',
    ],
    aquaBloomResponsibilities: [
      'Coordinate and oversee verified packaging supplier production and quality compliance.',
      'Manage regional freight logistics from manufacturing facility to venue loading dock.',
      'Provide real-time digital QR engagement tracking and verified distribution reporting.',
      'Facilitate secure settlement and commercial disbursement between all participating stakeholders.',
    ],
    deliveryTermsKnown: {
      stagingInstructions: 'Palletized delivery to venue ground-level receiving dock with standard liftgate service.',
      specialHandling: 'Keep in dry, temperature-controlled ambient conditions (15°C - 24°C). Avoid direct sunlight.',
      refrigerationRequired: false,
      status: 'PENDING_LOGISTICS_ASSIGNMENT',
    },
    qrRequirements: {
      customRedirectUrl: undefined,
      trackingEnabled: true,
      status: 'CONFIGURED_FOR_PRODUCTION',
    },
    cancellationTerms: {
      policyId: CANCELLATION_POLICY_ID,
      cutoffStage: 'PRODUCTION_START',
      termsSummary: 'Advertiser or Venue may cancel without penalty strictly BEFORE manufacturing production commences.',
      eligibleCancellationStage: 'Only valid during AGREEMENT_LOCKED stage prior to SUPPLIER_PRODUCTION_START.',
      nonRecoverableCostPrinciple: 'Once raw materials are committed and production begins, cancellations are non-recoverable and will be handled exclusively under Recovery & Resolution procedures.',
    },
    renewalTerms: {
      policyId: RENEWAL_POLICY_ID,
      renewalType: 'EXPLICIT_APPROVAL_REQUIRED',
      termsSummary: 'This Campaign Agreement does not automatically renew. Extension or subsequent run requires explicit mutual agreement and a new agreement document.',
    },
    customConditions: pTerms.customConditions,
    importantConditions: [
      'Mutual commercial lock takes legal effect upon atomic confirmation by both authorized parties.',
      'Neither party may unilaterally alter agreed quantities, delivery staging, or venue allocations following lock.',
      'Any post-lock adjustments must be processed through formal platform governance and resolution protocols.',
    ],
  };
}

/**
 * Transforms a CampaignAgreement into a safe, role-aware shared view.
 * Prevents any internal leakage:
 * - NO supplier internal cost
 * - NO AquaBloom platform margin
 * - NO advertiser internal payment details
 * - NO internal financial ledger data
 * - NO internal database IDs (uses public IDs)
 * - NO internal system risk scores
 */
export function toAgreementSharedView(
  agreement: CampaignAgreement,
  actor: User,
  campaign: Campaign,
  advertiserProfile?: AdvertiserProfile,
  venueProfile?: VenueProfile
): CampaignAgreementSharedView {
  const isAdvertiser = actor.role === 'ADVERTISER';
  const isVenue = actor.role === 'VENUE';
  const isAdmin = actor.role === 'ADMIN';

  // Permission calculation
  const canConfirm =
    agreement.status !== 'LOCKED' &&
    agreement.status !== 'SUPERSEDED' &&
    agreement.status !== 'TERMINATED' &&
    ((isAdvertiser && agreement.advertiserId === actor.id && !agreement.advertiserConfirmedAt) ||
      (isVenue && agreement.venueId === actor.id && !agreement.venueConfirmedAt) ||
      isAdmin);

  const canLock =
    agreement.status === 'READY_TO_LOCK' &&
    (agreement.advertiserId === actor.id || agreement.venueId === actor.id || isAdmin);

  // Counterparty data tailored to the viewer
  const counterparty = isAdvertiser
    ? {
        role: 'VENUE' as const,
        name: agreement.venueName,
        publicAccountId: agreement.venuePublicId,
        categoryOrType: venueProfile?.venueType || 'Hospitality & Commercial Campus',
        city: venueProfile?.location.city || 'Metro Region',
      }
    : {
        role: 'ADVERTISER' as const,
        name: agreement.advertiserBrandName,
        publicAccountId: agreement.advertiserPublicId,
        categoryOrType: advertiserProfile?.industry || 'Beverage & Consumer Goods',
        city: advertiserProfile?.location.city || 'Headquarters',
      };

  return {
    agreementId: agreement.id,
    publicId: agreement.publicId,
    status: agreement.status,
    currentVersionNumber: agreement.currentVersionNumber,
    isLocked: agreement.status === 'LOCKED',
    lockedAt: agreement.lockedAt,
    lockedSnapshotPublicId: agreement.lockedSnapshotId || null,
    advertiserConfirmed: !!agreement.advertiserConfirmedAt,
    advertiserConfirmedAt: agreement.advertiserConfirmedAt,
    venueConfirmed: !!agreement.venueConfirmedAt,
    venueConfirmedAt: agreement.venueConfirmedAt,
    canCurrentUserConfirm: canConfirm,
    canCurrentUserLock: canLock,
    agreementReference: agreement.agreementReference,
    campaign: {
      id: campaign.id,
      publicId: campaign.publicCampaignId,
      name: campaign.name,
      category: campaign.category,
      objective: campaign.objective,
      targetAudience: campaign.targetAudience,
      duration: agreement.terms.campaignDuration,
      preferredStartPeriod: agreement.terms.preferredStartPeriod,
    },
    counterparty,
    terms: agreement.terms,
    permissions: {
      canView: true,
      canConfirm,
      canLock,
    },
  };
}

/**
 * Transforms a CampaignAgreement into the human-readable Campaign Agreement Review / Preview model.
 * Enforces all 24 required data points:
 * 1. Agreement reference
 * 2. Campaign
 * 3. Parties
 * 4. Advertiser
 * 5. Venue
 * 6. Campaign objective
 * 7. Target audience
 * 8. Quantity
 * 9. Bottle/product requirements known at this stage
 * 10. Campaign duration
 * 11. Campaign dates / preferred period
 * 12. Distribution requirements
 * 13. Placement requirements
 * 14. Collaboration requirements
 * 15. Responsibilities
 * 16. Compensation terms
 * 17. Delivery terms known at this stage
 * 18. QR requirements
 * 19. Cancellation terms
 * 20. Renewal terms
 * 21. Confirmation status
 * 22. Agreement status
 * 23. Current version
 * 24. Version history
 *
 * Strict Security & Pricing Rules:
 * - NO supplier internal cost
 * - NO AquaBloom platform margin
 * - NO unconfirmed logistics cost
 * - NO unconfirmed taxes
 * - NO fake final advertiser total
 * - NO internal financial references or ledger locks
 */
export function toAgreementPreviewView(
  agreement: CampaignAgreement,
  actor: User,
  campaign: Campaign,
  versions: CampaignAgreementVersion[],
  advertiserProfile?: AdvertiserProfile,
  venueProfile?: VenueProfile,
  actorLookup?: (userId: string) => { name: string; role: string; organizationName: string } | undefined
): CampaignAgreementPreviewView {
  const isAdvertiser = actor.role === 'ADVERTISER';
  const isVenue = actor.role === 'VENUE';
  const isAdmin = actor.role === 'ADMIN';

  const canConfirm =
    agreement.status !== 'LOCKED' &&
    agreement.status !== 'SUPERSEDED' &&
    agreement.status !== 'TERMINATED' &&
    ((isAdvertiser && agreement.advertiserId === actor.id && !agreement.advertiserConfirmedAt) ||
      (isVenue && agreement.venueId === actor.id && !agreement.venueConfirmedAt) ||
      isAdmin);

  const advertiser = {
    publicAccountId: agreement.advertiserPublicId,
    brandName: agreement.advertiserBrandName,
    industry: advertiserProfile?.industry || 'Beverage & Consumer Brands',
    city: advertiserProfile?.location?.city || 'Metro Area',
    country: advertiserProfile?.location?.country || 'USA',
    primaryContactName: advertiserProfile?.primaryContact?.name || (advertiserProfile as any)?.primaryContactName,
  };

  const venue = {
    publicAccountId: agreement.venuePublicId,
    venueName: agreement.venueName,
    venueType: venueProfile?.venueType || 'Hospitality & Commercial Campus',
    audienceCategory: venueProfile?.audienceCategory || 'Commercial / Mixed Footfall',
    city: venueProfile?.location?.city || 'Metro Area',
    country: venueProfile?.location?.country || 'USA',
    monthlyVisitors: venueProfile?.footfall?.monthlyVisitors,
    availableBottleCapacity: venueProfile?.capacity?.availableBottleCapacity,
    primaryContactName: venueProfile?.operationalContact?.coordinatorName || (venueProfile as any)?.primaryContactName,
  };

  const sortedVersions = versions.slice().sort((a, b) => b.versionNumber - a.versionNumber);

  const sanitizedVersions: SanitizedAgreementVersion[] = sortedVersions.map((v) => {
    const actorInfo = actorLookup ? actorLookup(v.createdBy) : undefined;
    return {
      id: v.id,
      publicVersionId: v.publicVersionId,
      versionNumber: v.versionNumber,
      createdAt: v.createdAt,
      createdDate: v.createdAt ? v.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      actor: {
        userId: actorInfo?.name ? v.createdBy : 'usr_system',
        role: actorInfo?.role || (v.createdBy === agreement.advertiserId ? 'ADVERTISER' : v.createdBy === agreement.venueId ? 'VENUE' : 'ADMIN'),
        name: actorInfo?.name || (v.createdBy === agreement.advertiserId ? agreement.advertiserBrandName : v.createdBy === agreement.venueId ? agreement.venueName : 'AquaBloom Legal Platform'),
        organizationName: actorInfo?.organizationName || (v.createdBy === agreement.advertiserId ? agreement.advertiserBrandName : v.createdBy === agreement.venueId ? agreement.venueName : 'AquaBloom Master Operations'),
      },
      changeSummary: v.changeSummary,
      status: v.status,
      advertiserConfirmedAt: v.advertiserConfirmedAt,
      venueConfirmedAt: v.venueConfirmedAt,
    };
  });

  const currVer = sortedVersions.find((v) => v.versionNumber === agreement.currentVersionNumber) || sortedVersions[0];

  const durationVal = agreement.terms.campaignDuration?.value || 4;
  const durationUnit = (agreement.terms.campaignDuration?.unit || 'WEEKS').toLowerCase();

  return {
    // 1. Agreement reference
    agreementReference: agreement.agreementReference,
    agreementId: agreement.id,
    publicId: agreement.publicId,

    // 2. Campaign
    campaign: {
      id: campaign.id,
      publicId: campaign.publicCampaignId,
      name: campaign.name,
      category: campaign.category,
      objective: campaign.objective,
      targetAudience: campaign.targetAudience,
      duration: agreement.terms.campaignDuration,
      preferredStartPeriod: agreement.terms.preferredStartPeriod,
    },

    // 3. Parties
    parties: {
      advertiser,
      venue,
    },

    // 4. Advertiser
    advertiser: {
      publicAccountId: advertiser.publicAccountId,
      brandName: advertiser.brandName,
      industry: advertiser.industry,
      city: advertiser.city,
      country: advertiser.country,
    },

    // 5. Venue
    venue: {
      publicAccountId: venue.publicAccountId,
      venueName: venue.venueName,
      venueType: venue.venueType,
      audienceCategory: venue.audienceCategory,
      city: venue.city,
      country: venue.country,
    },

    // Viewer context
    viewerRole: actor.role as 'ADVERTISER' | 'VENUE' | 'ADMIN',

    // 6. Campaign objective
    campaignObjective: campaign.objective,

    // 7. Target audience
    targetAudience: campaign.targetAudience,

    // 8. Quantity
    quantity: agreement.terms.campaignQuantity,

    // 9. Bottle/product requirements known at this stage
    productRequirements: agreement.terms.productRequirements,

    // 10. Campaign duration
    campaignDuration: agreement.terms.campaignDuration,

    // 11. Campaign dates / preferred period
    campaignDates: {
      preferredStartPeriod: agreement.terms.preferredStartPeriod,
      durationLabel: `${durationVal} ${durationUnit}`,
    },

    // 12. Distribution requirements
    distributionRequirements: agreement.terms.distributionRequirements,

    // 13. Placement requirements
    placementRequirements: agreement.terms.placementRequirements,

    // 14. Collaboration requirements
    collaborationRequirements: agreement.terms.collaborationRequirement,

    // 15. Responsibilities
    responsibilities: {
      advertiserResponsibilities: agreement.terms.advertiserResponsibilities,
      venueResponsibilities: agreement.terms.venueResponsibilities,
      aquaBloomResponsibilities: agreement.terms.aquaBloomResponsibilities,
    },

    // 16. Compensation terms (preserving percentage, 12.5% cap note, no fabricated final amount)
    compensationTerms: {
      proposedPercentage: agreement.terms.venueCompensationTerms.proposedPercentage,
      termsDescription: agreement.terms.venueCompensationTerms.termsDescription,
      notes: agreement.terms.venueCompensationTerms.notes,
      eligibleBaseDescription: agreement.terms.venueCompensationTerms.eligibleBaseDescription,
      maximumCapPercentage: VENUE_COMPENSATION_MAX_PERCENTAGE,
      statutoryCapRule: `Maximum venue compensation is strictly capped at ${VENUE_COMPENSATION_MAX_PERCENTAGE}% of eligible supplier total bottle advertising cost.`,
      finalAmountCalculated: false,
    },

    // Pricing Rule Safeguards (Formula: Product Price + Logistics + Taxes = Final Total)
    pricingSafeguards: {
      status: 'NO_FINAL_PRICING_AT_AGREEMENT_STAGE',
      formulaNote: 'Product Price + Logistics + Applicable Taxes = Final Advertiser Total',
      supplierInternalCostExcluded: true,
      aquaBloomMarginExcluded: true,
      unconfirmedLogisticsExcluded: true,
      unconfirmedTaxesExcluded: true,
      fakeFinalAdvertiserTotalExcluded: true,
    },

    // 17. Delivery terms known at this stage
    deliveryTermsKnown: {
      stagingInstructions: agreement.terms.deliveryTermsKnown.stagingInstructions,
      specialHandling: agreement.terms.deliveryTermsKnown.specialHandling,
      refrigerationRequired: agreement.terms.deliveryTermsKnown.refrigerationRequired,
      status: 'PENDING_LOGISTICS_ASSIGNMENT',
      logisticsNotice: 'Carrier assignments, route planning, and final delivery logistics will be designated during subsequent execution stages.',
    },

    // 18. QR requirements
    qrRequirements: {
      customRedirectUrl: agreement.terms.qrRequirements.customRedirectUrl,
      trackingEnabled: agreement.terms.qrRequirements.trackingEnabled,
      status: 'CONFIGURED_FOR_PRODUCTION',
    },

    // 19. Cancellation terms
    cancellationTerms: {
      policyId: agreement.terms.cancellationTerms.policyId,
      cutoffStage: 'PRODUCTION_START',
      termsSummary: agreement.terms.cancellationTerms.termsSummary,
      eligibleCancellationStage: agreement.terms.cancellationTerms.eligibleCancellationStage,
      nonRecoverableCostPrinciple: agreement.terms.cancellationTerms.nonRecoverableCostPrinciple,
    },

    // 20. Renewal terms
    renewalTerms: {
      policyId: agreement.terms.renewalTerms.policyId,
      renewalType: 'EXPLICIT_APPROVAL_REQUIRED',
      termsSummary: agreement.terms.renewalTerms.termsSummary,
      renewalPolicyNote: 'Contracts do not renew automatically. Any extension requires explicit written approval and a new Campaign Agreement.',
    },

    // 21. Confirmation status
    confirmationStatus: {
      advertiserConfirmed: !!agreement.advertiserConfirmedAt,
      advertiserConfirmedAt: agreement.advertiserConfirmedAt,
      venueConfirmed: !!agreement.venueConfirmedAt,
      venueConfirmedAt: agreement.venueConfirmedAt,
      canCurrentUserConfirm: canConfirm,
      statusSummary: !agreement.advertiserConfirmedAt && !agreement.venueConfirmedAt
        ? 'Pending review and confirmation by both parties'
        : !agreement.advertiserConfirmedAt
        ? 'Confirmed by Venue; awaiting Advertiser formal review'
        : !agreement.venueConfirmedAt
        ? 'Confirmed by Advertiser; awaiting Venue formal review'
        : 'Mutually confirmed by both parties',
      readinessMessage: 'Confirmation will become available when the agreement is ready.',
    },

    // 22. Agreement status
    agreementStatus: agreement.status,

    // 23. Current version
    currentVersion: {
      versionNumber: agreement.currentVersionNumber,
      publicVersionId: currVer ? currVer.publicVersionId : `AB-CGV-${agreement.publicId.replace('AB-CAG-', '')}-01`,
      createdAt: currVer ? currVer.createdAt : agreement.createdAt,
      createdDate: (currVer ? currVer.createdAt : agreement.createdAt).split('T')[0],
      status: currVer ? currVer.status : agreement.status,
      changeSummary: currVer ? currVer.changeSummary : 'Formal Campaign Agreement generated from mutually confirmed proposal.',
    },

    // 24. Version history
    versionHistory: sanitizedVersions,

    importantConditions: agreement.terms.importantConditions,
    customConditions: agreement.terms.customConditions,
    isLocked: agreement.status === 'LOCKED',
    lockedAt: agreement.lockedAt,
    lockedSnapshotPublicId: agreement.lockedSnapshotId || null,
    lockVersion: agreement.lockVersion,
  };
}
