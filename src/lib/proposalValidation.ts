/**
 * AquaBloom Proposal & Negotiation Validation Engine — Step 6
 * 
 * Implements strict domain validation and state-transition rules for:
 * 1. Proposal initialization and party eligibility
 * 2. Proposal version terms and differential calculation
 * 3. Counter-proposals and mutual confirmation reset
 * 4. Capacity overage decision enforcement for venue acceptance
 * 5. Expiration, withdrawal, decline, and concurrency verification
 */

import {
  User,
  AdvertiserProfile,
  VenueProfile,
  Campaign,
  Proposal,
  ProposalTerms,
  CreateProposalInput,
  CounterProposalInput,
  AcceptProposalInput,
  DeclineProposalInput,
  WithdrawProposalInput,
  DeclineReasonCode,
} from '../types.js';

export interface ValidationIssue {
  field?: string;
  code: string;
  message: string;
}

export interface ProposalValidationResult {
  isValid: boolean;
  errors: ValidationIssue[];
}

/**
 * Validates initial proposal creation.
 */
export function validateProposalCreation(
  campaign: Campaign,
  venueUser: User,
  venueProfile: VenueProfile | undefined,
  advertiserUser: User,
  advertiserProfile: AdvertiserProfile | undefined,
  input: CreateProposalInput
): ProposalValidationResult {
  const errors: ValidationIssue[] = [];

  // 1. Ownership: Campaign must belong to advertiser
  if (campaign.advertiserId !== advertiserUser.id) {
    errors.push({
      field: 'campaignId',
      code: 'CAMPAIGN_OWNERSHIP_MISMATCH',
      message: 'Advertiser does not own the referenced campaign.',
    });
  }

  // 2. Advertiser Account Status & Profile
  if (advertiserUser.status !== 'ACTIVE') {
    errors.push({
      field: 'advertiserId',
      code: 'ADVERTISER_NOT_ACTIVE',
      message: 'Advertiser account is not active.',
    });
  }
  if (!advertiserProfile || !advertiserProfile.completion?.isComplete) {
    errors.push({
      field: 'advertiserProfile',
      code: 'ADVERTISER_PROFILE_INCOMPLETE',
      message: 'Advertiser profile must be complete before creating proposals.',
    });
  }

  // 3. Venue Account Status, Profile, and Marketplace Eligibility
  if (venueUser.role !== 'VENUE') {
    errors.push({
      field: 'venueId',
      code: 'INVALID_VENUE_ROLE',
      message: 'Target recipient must be a Venue account.',
    });
  }
  if (venueUser.status !== 'ACTIVE') {
    errors.push({
      field: 'venueId',
      code: 'VENUE_NOT_ACTIVE',
      message: 'Target venue account is not active.',
    });
  }
  if (!venueProfile || !venueProfile.completion?.isComplete) {
    errors.push({
      field: 'venueProfile',
      code: 'VENUE_PROFILE_INCOMPLETE',
      message: 'Target venue profile must be 100% complete.',
    });
  }
  if (venueProfile && venueProfile.visibilityState !== 'PUBLIC_ELIGIBLE') {
    errors.push({
      field: 'venueVisibility',
      code: 'VENUE_NOT_MARKETPLACE_ELIGIBLE',
      message: 'Target venue is not marketplace eligible for proposals.',
    });
  }

  // 4. Campaign Status Eligibility: Must be READY_FOR_MATCHING, MATCHING, or PROPOSAL_ACTIVE
  const eligibleStatuses = ['READY_FOR_MATCHING', 'MATCHING', 'PROPOSAL_ACTIVE'];
  if (!eligibleStatuses.includes(campaign.status)) {
    errors.push({
      field: 'campaignStatus',
      code: 'CAMPAIGN_STATUS_INELIGIBLE',
      message: `Campaign status '${campaign.status}' is not eligible for new proposals. Must be in matching or active proposal phase.`,
    });
  }

  // 5. Quantity validation
  const quantity = input.initialTerms?.campaignQuantity ?? campaign.bottleRequirements?.requiredQuantity;
  if (!quantity || quantity <= 0 || !Number.isInteger(quantity)) {
    errors.push({
      field: 'campaignQuantity',
      code: 'INVALID_QUANTITY',
      message: 'Campaign bottle quantity must be a positive whole number.',
    });
  }

  // 6. Venue Compensation validation: Max 12.5%
  const compPercentage = input.initialTerms?.venueCompensationTerms?.proposedPercentage;
  if (compPercentage !== undefined && (compPercentage < 0 || compPercentage > 12.5)) {
    errors.push({
      field: 'venueCompensationTerms.proposedPercentage',
      code: 'COMPENSATION_EXCEEDS_MAX',
      message: 'Venue compensation percentage cannot exceed 12.5% of bottle advertising fee.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates proposal counter-proposal.
 */
export function validateProposalCounter(
  proposal: Proposal,
  actor: User,
  input: CounterProposalInput
): ProposalValidationResult {
  const errors: ValidationIssue[] = [];

  // Check state eligibility
  const counterableStatuses = ['SENT', 'VIEWED', 'UNDER_NEGOTIATION', 'ACCEPTED'];
  if (!counterableStatuses.includes(proposal.status)) {
    errors.push({
      field: 'status',
      code: 'INVALID_STATE_FOR_COUNTER',
      message: `Cannot counter a proposal in '${proposal.status}' state.`,
    });
  }

  // Check expiration
  if (checkProposalExpiration(proposal)) {
    errors.push({
      field: 'expiresAt',
      code: 'PROPOSAL_EXPIRED',
      message: 'Proposal has expired and cannot receive counter-proposals.',
    });
  }

  // Optimistic Concurrency check
  if (input.expectedVersion !== proposal.currentVersionNumber) {
    errors.push({
      field: 'expectedVersion',
      code: 'CONCURRENCY_VERSION_MISMATCH',
      message: `Proposal has been updated to Version ${proposal.currentVersionNumber}. Please reload and review latest terms.`,
    });
  }

  // Actor authorization: must be either the advertiser or venue
  const isAdvertiser = actor.id === proposal.advertiserId;
  const isVenue = actor.id === proposal.venueId;
  if (!isAdvertiser && !isVenue && actor.role !== 'ADMIN') {
    errors.push({
      field: 'actor',
      code: 'UNAUTHORIZED_NEGOTIATION_ACTOR',
      message: 'Only the participating Advertiser or Venue may submit a counter-proposal.',
    });
  }

  // Change summary requirement
  if (!input.changeSummary || input.changeSummary.trim().length < 3) {
    errors.push({
      field: 'changeSummary',
      code: 'CHANGE_SUMMARY_REQUIRED',
      message: 'A concise change summary describing your counter-proposal is required.',
    });
  }

  // Terms validation if updated
  if (input.terms.campaignQuantity !== undefined) {
    if (input.terms.campaignQuantity <= 0 || !Number.isInteger(input.terms.campaignQuantity)) {
      errors.push({
        field: 'campaignQuantity',
        code: 'INVALID_QUANTITY',
        message: 'Campaign quantity must be a positive integer.',
      });
    }
  }

  if (input.terms.venueCompensationTerms?.proposedPercentage !== undefined) {
    const pct = input.terms.venueCompensationTerms.proposedPercentage;
    if (pct < 0 || pct > 12.5) {
      errors.push({
        field: 'venueCompensationTerms.proposedPercentage',
        code: 'COMPENSATION_EXCEEDS_MAX',
        message: 'Venue compensation percentage cannot exceed 12.5%.',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates proposal acceptance.
 */
export function validateProposalAcceptance(
  proposal: Proposal,
  actor: User,
  venueProfile: VenueProfile | undefined,
  input: AcceptProposalInput
): ProposalValidationResult {
  const errors: ValidationIssue[] = [];

  // Check state eligibility
  const acceptableStatuses = ['SENT', 'VIEWED', 'UNDER_NEGOTIATION', 'ACCEPTED'];
  if (!acceptableStatuses.includes(proposal.status)) {
    errors.push({
      field: 'status',
      code: 'INVALID_STATE_FOR_ACCEPTANCE',
      message: `Cannot accept a proposal in '${proposal.status}' state.`,
    });
  }

  // Check expiration
  if (checkProposalExpiration(proposal)) {
    errors.push({
      field: 'expiresAt',
      code: 'PROPOSAL_EXPIRED',
      message: 'Proposal has expired and cannot be accepted.',
    });
  }

  // Concurrency check
  if (input.expectedVersion !== proposal.currentVersionNumber) {
    errors.push({
      field: 'expectedVersion',
      code: 'CONCURRENCY_VERSION_MISMATCH',
      message: `Proposal has been updated to Version ${proposal.currentVersionNumber}. Please review latest terms before confirming.`,
    });
  }

  const isAdvertiser = actor.id === proposal.advertiserId;
  const isVenue = actor.id === proposal.venueId;

  if (!isAdvertiser && !isVenue && actor.role !== 'ADMIN') {
    errors.push({
      field: 'actor',
      code: 'UNAUTHORIZED_ACCEPTANCE',
      message: 'Only the participating Advertiser or Venue may accept this proposal.',
    });
  }

  // If Venue is accepting, verify capacity overage rule (Requirements 15 & 16)
  if (isVenue && venueProfile) {
    const available = venueProfile.capacity?.availableBottleCapacity ?? 0;
    const proposedQuantity = proposal.terms.campaignQuantity;

    if (proposedQuantity > available) {
      // Quantity exceeds available capacity
      const overageDecision = input.capacityOverageDecision || proposal.terms.capacityOverageDecision?.status;
      if (overageDecision !== 'ACCEPT_OVERAGE') {
        errors.push({
          field: 'capacityOverageDecision',
          code: 'CAPACITY_OVERAGE_UNRESOLVED',
          message: `Campaign quantity (${proposedQuantity.toLocaleString()}) exceeds venue available capacity (${available.toLocaleString()}). Venue must explicitly accept the capacity overage or counter-propose a lower quantity.`,
        });
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates proposal decline.
 */
export function validateProposalDecline(
  proposal: Proposal,
  actor: User,
  input: DeclineProposalInput
): ProposalValidationResult {
  const errors: ValidationIssue[] = [];

  const declinableStatuses = ['SENT', 'VIEWED', 'UNDER_NEGOTIATION', 'ACCEPTED'];
  if (!declinableStatuses.includes(proposal.status)) {
    errors.push({
      field: 'status',
      code: 'INVALID_STATE_FOR_DECLINE',
      message: `Cannot decline a proposal in '${proposal.status}' state.`,
    });
  }

  const isAdvertiser = actor.id === proposal.advertiserId;
  const isVenue = actor.id === proposal.venueId;

  if (!isAdvertiser && !isVenue && actor.role !== 'ADMIN') {
    errors.push({
      field: 'actor',
      code: 'UNAUTHORIZED_DECLINE',
      message: 'Only the participating Advertiser or Venue may decline this proposal.',
    });
  }

  const validReasons: DeclineReasonCode[] = [
    'TERMS_NOT_ACCEPTABLE',
    'TIMING_NOT_SUITABLE',
    'QUANTITY_NOT_SUITABLE',
    'CAPACITY_ISSUE',
    'CAMPAIGN_PREFERENCE_MISMATCH',
    'OTHER',
  ];

  if (!input.reasonCode || !validReasons.includes(input.reasonCode)) {
    errors.push({
      field: 'reasonCode',
      code: 'INVALID_DECLINE_REASON',
      message: 'A valid structured decline reason must be specified.',
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Validates proposal withdrawal. Only Advertiser can withdraw.
 */
export function validateProposalWithdrawal(
  proposal: Proposal,
  actor: User,
  _input: WithdrawProposalInput
): ProposalValidationResult {
  const errors: ValidationIssue[] = [];

  // Only advertiser can withdraw
  if (actor.id !== proposal.advertiserId && actor.role !== 'ADMIN') {
    errors.push({
      field: 'actor',
      code: 'WITHDRAWAL_RESTRICTED_TO_ADVERTISER',
      message: 'Only the initiating Advertiser may withdraw this proposal. Venues may decline instead.',
    });
  }

  const withdrawableStatuses = ['DRAFT', 'SENT', 'VIEWED', 'UNDER_NEGOTIATION', 'ACCEPTED'];
  if (!withdrawableStatuses.includes(proposal.status)) {
    errors.push({
      field: 'status',
      code: 'INVALID_STATE_FOR_WITHDRAWAL',
      message: `Cannot withdraw a proposal in '${proposal.status}' state.`,
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Checks if a proposal has expired server-side.
 */
export function checkProposalExpiration(proposal: Proposal): boolean {
  if (['DECLINED', 'WITHDRAWN', 'READY_FOR_AGREEMENT'].includes(proposal.status)) {
    return false;
  }
  if (!proposal.expiresAt) return false;
  return new Date() > new Date(proposal.expiresAt);
}

/**
 * Calculates differences between two sets of proposal terms.
 */
export function diffProposalTerms(
  oldTerms: ProposalTerms,
  newTerms: ProposalTerms
): { changedFields: string[]; summary: string } {
  const changed: string[] = [];
  const summaries: string[] = [];

  if (oldTerms.campaignQuantity !== newTerms.campaignQuantity) {
    changed.push('campaignQuantity');
    summaries.push(`Quantity changed from ${oldTerms.campaignQuantity.toLocaleString()} to ${newTerms.campaignQuantity.toLocaleString()} bottles`);
  }

  if (
    oldTerms.campaignDuration.value !== newTerms.campaignDuration.value ||
    oldTerms.campaignDuration.unit !== newTerms.campaignDuration.unit
  ) {
    changed.push('campaignDuration');
    summaries.push(`Duration revised to ${newTerms.campaignDuration.value} ${newTerms.campaignDuration.unit.toLowerCase()}`);
  }

  if (oldTerms.preferredStartPeriod.label !== newTerms.preferredStartPeriod.label) {
    changed.push('preferredStartPeriod');
    summaries.push(`Start period changed to "${newTerms.preferredStartPeriod.label}"`);
  }

  if (oldTerms.distributionRequirements.placementDetails !== newTerms.distributionRequirements.placementDetails) {
    changed.push('distributionRequirements.placementDetails');
    summaries.push('Distribution placement details revised');
  }

  if (oldTerms.distributionRequirements.refrigerationRequired !== newTerms.distributionRequirements.refrigerationRequired) {
    changed.push('distributionRequirements.refrigerationRequired');
    summaries.push(`Refrigeration ${newTerms.distributionRequirements.refrigerationRequired ? 'requested' : 'removed'}`);
  }

  if (JSON.stringify(oldTerms.placementRequirements) !== JSON.stringify(newTerms.placementRequirements)) {
    changed.push('placementRequirements');
    summaries.push('Placement requirements modified');
  }

  if (
    oldTerms.venueCompensationTerms.proposedPercentage !== newTerms.venueCompensationTerms.proposedPercentage ||
    oldTerms.venueCompensationTerms.termsDescription !== newTerms.venueCompensationTerms.termsDescription
  ) {
    changed.push('venueCompensationTerms');
    summaries.push(`Venue compensation updated to ${newTerms.venueCompensationTerms.proposedPercentage ?? 0}%`);
  }

  if (oldTerms.customConditions !== newTerms.customConditions) {
    changed.push('customConditions');
    summaries.push('Custom negotiated conditions revised');
  }

  return {
    changedFields: changed.length > 0 ? changed : ['TERMS_REVISED'],
    summary: summaries.length > 0 ? summaries.join('; ') : 'Updated negotiated proposal terms',
  };
}
