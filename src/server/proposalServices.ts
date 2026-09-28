/**
 * AquaBloom Proposal & Negotiation Services — Step 6
 * 
 * Modular backend architecture:
 * 1. ProposalAuthorizationService — Enforces strict role and participant visibility
 * 2. ProposalValidationService — Coordinates domain and term validation
 * 3. ProposalExpirationService — Server-side expiration evaluation
 * 4. ProposalNotificationService — Role-aware user notifications
 * 5. ProposalVersionService — Immutable version snapshot generation
 * 6. NegotiationService — Versioning, mutual confirmation, counter-proposals, acceptance, decline, withdrawal
 * 7. ProposalService — Primary facade for proposal lifecycle
 */

import { db } from './db.js';
import {
  User,
  AdvertiserProfile,
  VenueProfile,
  Campaign,
  Proposal,
  ProposalVersion,
  ProposalNegotiationEvent,
  ProposalDetailView,
  CreateProposalInput,
  CounterProposalInput,
  AcceptProposalInput,
  DeclineProposalInput,
  WithdrawProposalInput,
  ProposalFilterQuery,
  CapacityEvaluation,
} from '../types.js';
import {
  validateProposalCreation,
  validateProposalCounter,
  validateProposalAcceptance,
  validateProposalDecline,
  validateProposalWithdrawal,
  checkProposalExpiration,
  diffProposalTerms,
} from '../lib/proposalValidation.js';
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
} from '../lib/errors.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';
import { evaluateCapacity } from '../lib/matchingEngine.js';

// ==========================================
// 1. PROPOSAL AUTHORIZATION SERVICE
// ==========================================
export class ProposalAuthorizationService {
  public static assertCanView(proposal: Proposal, user: User): void {
    if (user.role === 'ADMIN') return;

    const isAdvertiser = user.id === proposal.advertiserId;
    const isVenue = user.id === proposal.venueId;

    if (!isAdvertiser && !isVenue) {
      throw new AuthorizationError(
        'Access denied: You are neither the owning advertiser nor the recipient venue for this proposal.'
      );
    }
  }

  public static assertCanCreate(user: User): void {
    if (user.role !== 'ADVERTISER' && user.role !== 'ADMIN') {
      throw new AuthorizationError(
        'Only registered Advertiser accounts may create and initiate campaign proposals.'
      );
    }
  }

  public static assertCanCounter(proposal: Proposal, user: User): void {
    if (user.role === 'ADMIN') return;
    const isAdvertiser = user.id === proposal.advertiserId;
    const isVenue = user.id === proposal.venueId;
    if (!isAdvertiser && !isVenue) {
      throw new AuthorizationError('You are not authorized to negotiate this proposal.');
    }
  }

  public static assertCanAccept(proposal: Proposal, user: User): void {
    if (user.role === 'ADMIN') return;
    const isAdvertiser = user.id === proposal.advertiserId;
    const isVenue = user.id === proposal.venueId;
    if (!isAdvertiser && !isVenue) {
      throw new AuthorizationError('You are not authorized to accept this proposal.');
    }
  }

  public static assertCanDecline(proposal: Proposal, user: User): void {
    if (user.role === 'ADMIN') return;
    const isAdvertiser = user.id === proposal.advertiserId;
    const isVenue = user.id === proposal.venueId;
    if (!isAdvertiser && !isVenue) {
      throw new AuthorizationError('You are not authorized to decline this proposal.');
    }
  }

  public static assertCanWithdraw(proposal: Proposal, user: User): void {
    if (user.role === 'ADMIN') return;
    if (user.id !== proposal.advertiserId) {
      throw new AuthorizationError(
        'Only the initiating Advertiser may withdraw a proposal. Venues may decline instead.'
      );
    }
  }
}

// ==========================================
// 2. PROPOSAL EXPIRATION SERVICE
// ==========================================
export class ProposalExpirationService {
  public static evaluateAndApply(proposal: Proposal): Proposal {
    if (['DECLINED', 'WITHDRAWN', 'EXPIRED', 'READY_FOR_AGREEMENT'].includes(proposal.status)) {
      return proposal;
    }

    if (checkProposalExpiration(proposal)) {
      proposal.status = 'EXPIRED';
      proposal.updatedAt = new Date().toISOString();
      db.saveProposal(proposal);

      // Record negotiation event
      db.recordProposalEvent({
        id: generateInternalId('pne'),
        proposalId: proposal.id,
        versionNumber: proposal.currentVersionNumber,
        action: 'EXPIRED',
        actor: {
          userId: 'system',
          role: 'ADMIN',
          organizationName: 'AquaBloom System',
        },
        timestamp: new Date().toISOString(),
        changeSummary: 'Proposal passed expiration deadline without mutual confirmation.',
      });

      // Audit event
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PROPOSAL_EXPIRED',
        userId: proposal.advertiserId,
        scope: 'TRANSACTION_SHARED',
        payload: {
          proposalId: proposal.id,
          publicProposalId: proposal.publicProposalId,
          campaignId: proposal.campaignId,
          venueId: proposal.venueId,
          expiredAt: proposal.expiresAt,
        },
      });

      // Notify both parties
      ProposalNotificationService.notifyExpired(proposal);
    }

    return proposal;
  }
}

// ==========================================
// 3. PROPOSAL NOTIFICATION SERVICE
// ==========================================
export class ProposalNotificationService {
  public static notifyCreated(proposal: Proposal): void {
    // Notify Venue
    db.createNotification(
      proposal.venueId,
      'New Campaign Proposal Received',
      `Advertiser "${proposal.advertiserBrandName}" has submitted proposal ${proposal.publicProposalId} for campaign "${proposal.campaignName}".`,
      'INFO',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyViewed(proposal: Proposal): void {
    // Notify Advertiser
    db.createNotification(
      proposal.advertiserId,
      'Proposal Viewed by Venue',
      `Venue "${proposal.venueName}" has opened and reviewed proposal ${proposal.publicProposalId}.`,
      'INFO',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyCountered(proposal: Proposal, actor: User): void {
    const isFromVenue = actor.id === proposal.venueId;
    const recipientId = isFromVenue ? proposal.advertiserId : proposal.venueId;
    const senderName = isFromVenue ? proposal.venueName : proposal.advertiserBrandName;

    db.createNotification(
      recipientId,
      'Counter-Proposal Received',
      `${senderName} submitted Version ${proposal.currentVersionNumber} for proposal ${proposal.publicProposalId}. Review the revised terms.`,
      'WARNING',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyAcceptedByOne(proposal: Proposal, acceptingActor: User): void {
    const isFromVenue = acceptingActor.id === proposal.venueId;
    const otherPartyId = isFromVenue ? proposal.advertiserId : proposal.venueId;
    const actorName = isFromVenue ? proposal.venueName : proposal.advertiserBrandName;

    db.createNotification(
      otherPartyId,
      'Proposal Confirmed by Counterparty',
      `${actorName} has accepted Version ${proposal.currentVersionNumber} of proposal ${proposal.publicProposalId}. Your confirmation is required to finalize agreement readiness.`,
      'SUCCESS',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyMutualConfirmation(proposal: Proposal): void {
    const message = `Proposal ${proposal.publicProposalId} (Campaign: "${proposal.campaignName}") is mutually confirmed and READY FOR CAMPAIGN AGREEMENT.`;
    db.createNotification(
      proposal.advertiserId,
      'Proposal Ready for Agreement',
      message,
      'SUCCESS',
      proposal.campaignId,
      proposal.publicCampaignId
    );
    db.createNotification(
      proposal.venueId,
      'Proposal Ready for Agreement',
      message,
      'SUCCESS',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyDeclined(proposal: Proposal, decliningActor: User): void {
    const isFromVenue = decliningActor.id === proposal.venueId;
    const otherPartyId = isFromVenue ? proposal.advertiserId : proposal.venueId;
    const actorName = isFromVenue ? proposal.venueName : proposal.advertiserBrandName;

    db.createNotification(
      otherPartyId,
      'Proposal Declined',
      `${actorName} has declined proposal ${proposal.publicProposalId}. Reason: ${proposal.declineDetails?.reasonCode}.`,
      'ERROR',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyWithdrawn(proposal: Proposal): void {
    db.createNotification(
      proposal.venueId,
      'Proposal Withdrawn by Advertiser',
      `Advertiser "${proposal.advertiserBrandName}" has withdrawn proposal ${proposal.publicProposalId}.`,
      'INFO',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }

  public static notifyExpired(proposal: Proposal): void {
    db.createNotification(
      proposal.advertiserId,
      'Proposal Expired',
      `Proposal ${proposal.publicProposalId} has reached its expiration deadline without mutual confirmation.`,
      'WARNING',
      proposal.campaignId,
      proposal.publicCampaignId
    );
    db.createNotification(
      proposal.venueId,
      'Proposal Expired',
      `Proposal ${proposal.publicProposalId} has reached its expiration deadline.`,
      'WARNING',
      proposal.campaignId,
      proposal.publicCampaignId
    );
  }
}

// ==========================================
// 4. PROPOSAL VERSION SERVICE
// ==========================================
export class ProposalVersionService {
  public static createInitialVersion(
    proposal: Proposal,
    actor: User,
    changeSummary: string = 'Initial Proposal Submission'
  ): ProposalVersion {
    const version: ProposalVersion = {
      id: generateInternalId('prv'),
      publicVersionId: generateBusinessId('AB-PRV'),
      proposalId: proposal.id,
      versionNumber: 1,
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      changeSummary,
      changedFields: ['INITIAL_PROPOSAL'],
      terms: JSON.parse(JSON.stringify(proposal.terms)),
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
    };

    db.saveProposalVersion(version);
    return version;
  }

  public static createCounterVersion(
    proposal: Proposal,
    actor: User,
    input: CounterProposalInput
  ): ProposalVersion {
    const diff = diffProposalTerms(proposal.terms, {
      ...proposal.terms,
      ...input.terms,
    } as any);

    const nextVersionNumber = proposal.currentVersionNumber + 1;
    const version: ProposalVersion = {
      id: generateInternalId('prv'),
      publicVersionId: generateBusinessId('AB-PRV'),
      proposalId: proposal.id,
      versionNumber: nextVersionNumber,
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      changeSummary: input.changeSummary.trim() || diff.summary,
      changedFields: diff.changedFields,
      terms: JSON.parse(JSON.stringify(proposal.terms)),
      createdAt: new Date().toISOString(),
      createdBy: actor.id,
    };

    db.saveProposalVersion(version);
    return version;
  }
}

// ==========================================
// 5. NEGOTIATION SERVICE
// ==========================================
export class NegotiationService {
  /**
   * Submits a counter-proposal, generating a new immutable ProposalVersion
   * and resetting mutual confirmations.
   */
  public static counter(
    proposalId: string,
    actor: User,
    input: CounterProposalInput
  ): { proposal: Proposal; version: ProposalVersion } {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    // Evaluate expiration
    ProposalExpirationService.evaluateAndApply(proposal);
    ProposalAuthorizationService.assertCanCounter(proposal, actor);

    // Validation
    const val = validateProposalCounter(proposal, actor, input);
    if (!val.isValid) {
      if (val.errors.some((e) => e.code === 'CONCURRENCY_VERSION_MISMATCH')) {
        throw new ConflictError(val.errors[0].message);
      }
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    // Merge updated terms
    const mergedTerms = {
      ...proposal.terms,
      ...input.terms,
      // If quantity changed, reset capacity overage decision to pending
      capacityOverageDecision:
        input.terms.campaignQuantity && input.terms.campaignQuantity !== proposal.terms.campaignQuantity
          ? { status: 'PENDING' as const }
          : proposal.terms.capacityOverageDecision,
    };

    proposal.terms = mergedTerms;
    proposal.currentVersionNumber += 1;
    proposal.status = 'UNDER_NEGOTIATION';
    proposal.updatedAt = new Date().toISOString();
    proposal.updatedBy = actor.id;

    // Reset mutual confirmation!
    proposal.advertiserConfirmedAt = null;
    proposal.advertiserConfirmedBy = null;
    proposal.venueConfirmedAt = null;
    proposal.venueConfirmedBy = null;

    // Save new immutable version
    const version = ProposalVersionService.createCounterVersion(proposal, actor, input);

    // Persist proposal
    db.saveProposal(proposal);

    // Record timeline negotiation event
    db.recordProposalEvent({
      id: generateInternalId('pne'),
      proposalId: proposal.id,
      versionNumber: version.versionNumber,
      action: 'COUNTERED',
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      timestamp: version.createdAt,
      changeSummary: version.changeSummary,
    });

    // Audit events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_COUNTERED',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        versionNumber: version.versionNumber,
        changedFields: version.changedFields,
        actorRole: actor.role,
      },
    });
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_VERSION_CREATED',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        versionNumber: version.versionNumber,
        versionId: version.id,
      },
    });

    // Notifications
    ProposalNotificationService.notifyCountered(proposal, actor);

    return { proposal, version };
  }

  /**
   * Records explicit acceptance of current proposal version.
   * If both parties confirm, transitions to READY_FOR_AGREEMENT.
   */
  public static accept(
    proposalId: string,
    actor: User,
    input: AcceptProposalInput
  ): { proposal: Proposal; isMutuallyConfirmed: boolean } {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    ProposalExpirationService.evaluateAndApply(proposal);
    ProposalAuthorizationService.assertCanAccept(proposal, actor);

    const venueProfile = db.getProfileByUserId(proposal.venueId) as VenueProfile | undefined;
    const val = validateProposalAcceptance(proposal, actor, venueProfile, input);
    if (!val.isValid) {
      if (val.errors.some((e) => e.code === 'CONCURRENCY_VERSION_MISMATCH')) {
        throw new ConflictError(val.errors[0].message);
      }
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    const now = new Date().toISOString();
    const isAdvertiser = actor.id === proposal.advertiserId;
    const isVenue = actor.id === proposal.venueId;

    if (isAdvertiser) {
      proposal.advertiserConfirmedAt = now;
      proposal.advertiserConfirmedBy = actor.id;
    }

    if (isVenue) {
      proposal.venueConfirmedAt = now;
      proposal.venueConfirmedBy = actor.id;

      // Handle capacity overage decision if required
      const available = venueProfile?.capacity?.availableBottleCapacity ?? 0;
      if (proposal.terms.campaignQuantity > available) {
        proposal.terms.capacityOverageDecision = {
          status: 'ACCEPT_OVERAGE',
          decidedAt: now,
          decidedBy: actor.id,
          notes: input.notes || 'Venue coordinator explicitly approved storage overage for this campaign.',
        };

        eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'CAPACITY_OVERAGE_ACCEPTED',
          userId: actor.id,
          scope: 'TRANSACTION_SHARED',
          payload: {
            proposalId: proposal.id,
            venueId: proposal.venueId,
            proposedQuantity: proposal.terms.campaignQuantity,
            availableCapacity: available,
            overage: proposal.terms.campaignQuantity - available,
          },
        });
      }
    }

    // Check if both parties have confirmed the active version
    const bothConfirmed = !!(proposal.advertiserConfirmedAt && proposal.venueConfirmedAt);

    if (bothConfirmed) {
      proposal.status = 'READY_FOR_AGREEMENT';
      // Synchronize Campaign state (Requirement 34): PROPOSAL_ACTIVE -> AGREEMENT_PENDING
      const campaign = db.getCampaignById(proposal.campaignId);
      if (campaign && campaign.status === 'PROPOSAL_ACTIVE') {
        campaign.status = 'AGREEMENT_PENDING';
        campaign.updatedAt = now;
        campaign.updatedBy = actor.id;
        db.saveCampaign(campaign);
      }
    } else {
      proposal.status = 'ACCEPTED';
    }

    proposal.updatedAt = now;
    proposal.updatedBy = actor.id;
    db.saveProposal(proposal);

    // Record timeline event
    db.recordProposalEvent({
      id: generateInternalId('pne'),
      proposalId: proposal.id,
      versionNumber: proposal.currentVersionNumber,
      action: bothConfirmed ? 'READY_FOR_AGREEMENT' : 'ACCEPTED',
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      timestamp: now,
      changeSummary: bothConfirmed
        ? `Both parties confirmed Version ${proposal.currentVersionNumber}. Proposal is READY FOR CAMPAIGN AGREEMENT.`
        : `${actor.role === 'ADVERTISER' ? 'Advertiser' : 'Venue'} confirmed Version ${proposal.currentVersionNumber}. Awaiting counterparty confirmation.`,
      notes: input.notes,
    });

    // Audit events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: bothConfirmed ? 'PROPOSAL_READY_FOR_AGREEMENT' : 'PROPOSAL_ACCEPTED',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        versionNumber: proposal.currentVersionNumber,
        actorRole: actor.role,
        bothConfirmed,
      },
    });

    // Notifications
    if (bothConfirmed) {
      ProposalNotificationService.notifyMutualConfirmation(proposal);
    } else {
      ProposalNotificationService.notifyAcceptedByOne(proposal, actor);
    }

    return { proposal, isMutuallyConfirmed: bothConfirmed };
  }

  /**
   * Declines a proposal with structured reason.
   */
  public static decline(
    proposalId: string,
    actor: User,
    input: DeclineProposalInput
  ): Proposal {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    ProposalExpirationService.evaluateAndApply(proposal);
    ProposalAuthorizationService.assertCanDecline(proposal, actor);

    const val = validateProposalDecline(proposal, actor, input);
    if (!val.isValid) {
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    const now = new Date().toISOString();
    proposal.status = 'DECLINED';
    proposal.declineDetails = {
      reasonCode: input.reasonCode,
      explanation: input.explanation?.trim(),
      declinedBy: actor.id,
      declinedAt: now,
    };
    proposal.updatedAt = now;
    proposal.updatedBy = actor.id;

    db.saveProposal(proposal);

    // Record timeline event
    db.recordProposalEvent({
      id: generateInternalId('pne'),
      proposalId: proposal.id,
      versionNumber: proposal.currentVersionNumber,
      action: 'DECLINED',
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      timestamp: now,
      changeSummary: `Proposal declined: ${input.reasonCode}`,
      notes: input.explanation,
    });

    // Audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_DECLINED',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        reasonCode: input.reasonCode,
        declinedByRole: actor.role,
      },
    });

    ProposalNotificationService.notifyDeclined(proposal, actor);
    return proposal;
  }

  /**
   * Withdraws a proposal by the initiating Advertiser.
   */
  public static withdraw(
    proposalId: string,
    actor: User,
    input: WithdrawProposalInput
  ): Proposal {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    ProposalExpirationService.evaluateAndApply(proposal);
    ProposalAuthorizationService.assertCanWithdraw(proposal, actor);

    const val = validateProposalWithdrawal(proposal, actor, input);
    if (!val.isValid) {
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    const now = new Date().toISOString();
    proposal.status = 'WITHDRAWN';
    proposal.withdrawalDetails = {
      explanation: input.explanation?.trim(),
      withdrawnBy: actor.id,
      withdrawnAt: now,
    };
    proposal.updatedAt = now;
    proposal.updatedBy = actor.id;

    db.saveProposal(proposal);

    // Record timeline event
    db.recordProposalEvent({
      id: generateInternalId('pne'),
      proposalId: proposal.id,
      versionNumber: proposal.currentVersionNumber,
      action: 'WITHDRAWN',
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      timestamp: now,
      changeSummary: 'Proposal withdrawn by initiating Advertiser.',
      notes: input.explanation,
    });

    // Audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_WITHDRAWN',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        withdrawnBy: actor.id,
      },
    });

    ProposalNotificationService.notifyWithdrawn(proposal);
    return proposal;
  }
}

// ==========================================
// 6. PROPOSAL SERVICE (PRIMARY ENTRY POINT)
// ==========================================
export class ProposalService {
  /**
   * Creates and initiates a new proposal from Advertiser to Venue.
   */
  public static createProposal(
    actor: User,
    input: CreateProposalInput
  ): { proposal: Proposal; version: ProposalVersion } {
    ProposalAuthorizationService.assertCanCreate(actor);

    const campaign = db.getCampaignById(input.campaignId);
    if (!campaign) {
      throw new NotFoundError(`Campaign '${input.campaignId}' not found.`);
    }

    const venueUser = db.getUserById(input.venueId);
    if (!venueUser) {
      throw new NotFoundError(`Venue '${input.venueId}' not found.`);
    }

    const advertiserProfile = db.getProfileByUserId(actor.id) as AdvertiserProfile | undefined;
    const venueProfile = db.getProfileByUserId(venueUser.id) as VenueProfile | undefined;

    // Validate creation
    const val = validateProposalCreation(
      campaign,
      venueUser,
      venueProfile,
      actor,
      advertiserProfile,
      input
    );
    if (!val.isValid) {
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    const now = new Date().toISOString();
    // Default expiration: 14 days or campaign deadline
    const defaultExpiry = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const expiresAt = input.expiresAt || campaign.proposalDeadline || defaultExpiry;

    const proposalId = generateInternalId('prp');
    const publicProposalId = generateBusinessId('AB-PRP');

    // Assemble initial terms from campaign defaults overridden by input terms
    const terms: Proposal['terms'] = {
      campaignQuantity: input.initialTerms?.campaignQuantity ?? campaign.bottleRequirements.requiredQuantity,
      campaignDuration: input.initialTerms?.campaignDuration ?? campaign.timing.duration,
      preferredStartPeriod: input.initialTerms?.preferredStartPeriod ?? campaign.timing.preferredStartPeriod,
      distributionRequirements: input.initialTerms?.distributionRequirements ?? campaign.distributionRequirements,
      placementRequirements: input.initialTerms?.placementRequirements ?? campaign.venueRequirements.placementRequirements,
      productRequirements: {
        bottleType: input.initialTerms?.productRequirements?.bottleType ?? campaign.bottleRequirements.bottleType,
        preferredVolumeMl: input.initialTerms?.productRequirements?.preferredVolumeMl ?? campaign.bottleRequirements.preferredVolumeMl,
        volumeLabel: input.initialTerms?.productRequirements?.volumeLabel ?? campaign.bottleRequirements.volumeLabel,
        preferredMaterial: input.initialTerms?.productRequirements?.preferredMaterial ?? campaign.bottleRequirements.preferredMaterial,
        labelType: input.initialTerms?.productRequirements?.labelType ?? campaign.bottleRequirements.labelType,
        capType: input.initialTerms?.productRequirements?.capType ?? campaign.bottleRequirements.capType,
        notes: input.initialTerms?.productRequirements?.notes ?? campaign.bottleRequirements.notes,
      },
      collaborationRequirement: input.initialTerms?.collaborationRequirement ?? campaign.collaborationRequirement,
      venueCompensationTerms: {
        termsDescription: input.initialTerms?.venueCompensationTerms?.termsDescription || 'Standard eligible supplier advertising cost share (up to 12.5% max)',
        proposedPercentage: input.initialTerms?.venueCompensationTerms?.proposedPercentage ?? 10,
        notes: input.initialTerms?.venueCompensationTerms?.notes || '',
      },
      capacityOverageDecision: {
        status: 'PENDING',
      },
      customConditions: input.initialTerms?.customConditions || '',
    };

    const proposal: Proposal = {
      id: proposalId,
      publicProposalId,
      campaignId: campaign.id,
      publicCampaignId: campaign.publicCampaignId,
      campaignName: campaign.name,
      campaignCategory: campaign.category,
      advertiserId: actor.id,
      advertiserPublicId: actor.publicAccountId,
      advertiserBrandName: advertiserProfile?.brandName || actor.organizationName,
      venueId: venueUser.id,
      venuePublicId: venueUser.publicAccountId,
      venueName: venueProfile?.venueName || venueUser.organizationName,
      currentVersionNumber: 1,
      status: 'SENT',
      terms,
      expiresAt,
      advertiserConfirmedAt: null,
      advertiserConfirmedBy: null,
      venueConfirmedAt: null,
      venueConfirmedBy: null,
      viewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };

    // Save proposal to database
    db.saveProposal(proposal);

    // Save immutable initial version
    const version = ProposalVersionService.createInitialVersion(proposal, actor);

    // Update campaign state to PROPOSAL_ACTIVE if in READY_FOR_MATCHING
    if (campaign.status === 'READY_FOR_MATCHING' || campaign.status === 'MATCHING') {
      campaign.status = 'PROPOSAL_ACTIVE';
      campaign.updatedAt = now;
      campaign.updatedBy = actor.id;
      db.saveCampaign(campaign);
    }

    // Record timeline negotiation event
    db.recordProposalEvent({
      id: generateInternalId('pne'),
      proposalId: proposal.id,
      versionNumber: 1,
      action: 'SENT',
      actor: {
        userId: actor.id,
        role: actor.role,
        organizationName: actor.organizationName,
      },
      timestamp: now,
      changeSummary: `Proposal initiated by Advertiser "${proposal.advertiserBrandName}".`,
    });

    // Audit events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_CREATED',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        publicProposalId: proposal.publicProposalId,
        campaignId: campaign.id,
        venueId: venueUser.id,
      },
    });
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'PROPOSAL_SENT',
      userId: actor.id,
      scope: 'TRANSACTION_SHARED',
      payload: {
        proposalId: proposal.id,
        publicProposalId: proposal.publicProposalId,
      },
    });

    // Notify venue
    ProposalNotificationService.notifyCreated(proposal);

    return { proposal, version };
  }

  /**
   * Retrieves proposal detail view including versions, timeline, capacity evaluation, and permissions.
   */
  public static getProposalDetail(proposalId: string, actor: User): ProposalDetailView {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    ProposalAuthorizationService.assertCanView(proposal, actor);
    ProposalExpirationService.evaluateAndApply(proposal);

    // Automatically record viewed by venue if status is SENT and actor is Venue
    if (proposal.status === 'SENT' && actor.id === proposal.venueId) {
      this.markViewed(proposal.id, actor);
    }

    const versions = db.getProposalVersions(proposal.id);
    const activeVersion = versions.find((v) => v.versionNumber === proposal.currentVersionNumber) || versions[0];
    const timeline = db.getProposalEvents(proposal.id);

    // Calculate live capacity evaluation for this venue and proposed quantity
    const venueProfile = db.getProfileByUserId(proposal.venueId) as VenueProfile | undefined;
    const capacityEvaluation: CapacityEvaluation = evaluateCapacity(
      {
        maxBottleHoldingCapacity: venueProfile?.capacity?.maxBottleHoldingCapacity ?? 0,
        currentOngoingBottleCommitment: venueProfile?.capacity?.currentOngoingBottleCommitment ?? 0,
        availableBottleCapacity: venueProfile?.capacity?.availableBottleCapacity ?? 0,
      },
      proposal.terms.campaignQuantity
    );

    const isAdvertiser = actor.id === proposal.advertiserId;
    const isVenue = actor.id === proposal.venueId;
    const isTerminal = ['DECLINED', 'WITHDRAWN', 'EXPIRED', 'READY_FOR_AGREEMENT'].includes(proposal.status);

    return {
      proposal,
      activeVersion,
      versions,
      timeline,
      capacityEvaluation,
      permissions: {
        canView: true,
        canCounter: !isTerminal && (isAdvertiser || isVenue),
        canAccept: !isTerminal && (isAdvertiser || isVenue),
        canDecline: !isTerminal && (isAdvertiser || isVenue),
        canWithdraw: !isTerminal && isAdvertiser,
      },
    };
  }

  /**
   * Marks proposal as VIEWED when opened by Venue.
   */
  public static markViewed(proposalId: string, actor: User): Proposal {
    const proposal = db.getProposalById(proposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${proposalId}' not found.`);
    }

    ProposalAuthorizationService.assertCanView(proposal, actor);

    if (proposal.status === 'SENT' && actor.id === proposal.venueId) {
      const now = new Date().toISOString();
      proposal.status = 'VIEWED';
      proposal.viewedAt = now;
      proposal.updatedAt = now;
      db.saveProposal(proposal);

      db.recordProposalEvent({
        id: generateInternalId('pne'),
        proposalId: proposal.id,
        versionNumber: proposal.currentVersionNumber,
        action: 'VIEWED',
        actor: {
          userId: actor.id,
          role: actor.role,
          organizationName: actor.organizationName,
        },
        timestamp: now,
        changeSummary: 'Proposal opened and reviewed by venue coordinator.',
      });

      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PROPOSAL_VIEWED',
        userId: actor.id,
        scope: 'TRANSACTION_SHARED',
        payload: {
          proposalId: proposal.id,
          venueId: actor.id,
        },
      });

      ProposalNotificationService.notifyViewed(proposal);
    }

    return proposal;
  }

  /**
   * Lists proposals filtered by role and optional query parameters.
   */
  public static listProposals(actor: User, query: ProposalFilterQuery): Proposal[] {
    let all = db.getAllProposals();

    // Check expiration on all candidate proposals
    all = all.map((p) => ProposalExpirationService.evaluateAndApply(p));

    // Role-based filtering
    let filtered: Proposal[];
    if (actor.role === 'ADMIN') {
      filtered = all;
    } else if (actor.role === 'ADVERTISER') {
      filtered = all.filter((p) => p.advertiserId === actor.id);
    } else if (actor.role === 'VENUE') {
      filtered = all.filter((p) => p.venueId === actor.id);
    } else {
      // Suppliers & Logistics partners CANNOT see proposals!
      return [];
    }

    // Query filters
    if (query.campaignId) {
      filtered = filtered.filter(
        (p) => p.campaignId === query.campaignId || p.publicCampaignId === query.campaignId
      );
    }
    if (query.venueId) {
      filtered = filtered.filter(
        (p) => p.venueId === query.venueId || p.venuePublicId === query.venueId
      );
    }
    if (query.status && query.status !== 'ALL') {
      filtered = filtered.filter((p) => p.status === query.status);
    }

    return filtered.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}
