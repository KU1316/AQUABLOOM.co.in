/**
 * AquaBloom Campaign Agreement & Commercial Lock Services — Step 7
 * 
 * Modular backend architecture:
 * 1. AgreementAuthorizationService — Role boundary enforcement & counterparty isolation
 * 2. AgreementNotificationService — Role-aware user notifications
 * 3. AgreementSnapshotService — Immutable locked snapshot generation
 * 4. AgreementService — Primary facade for agreement lifecycle:
 *    creation, confirmation, atomic commercial lock, shared views, versions, audit trail
 */

import { db } from './db.js';
import {
  User,
  CampaignAgreement,
  CampaignAgreementVersion,
  CampaignAgreementSnapshot,
  CampaignAgreementInternalRecord,
  CampaignAgreementSharedView,
  CampaignAgreementPreviewView,
  SanitizedAgreementVersion,
  CreateCampaignAgreementInput,
  ConfirmCampaignAgreementInput,
  LockCampaignAgreementInput,
  CampaignAgreementFilterQuery,
  AgreementCommercialTerms,
  AdvertiserProfile,
  VenueProfile,
  Campaign,
} from '../types.js';
import {
  validateAgreementCreation,
  validateAgreementConfirmation,
  validateAgreementLock,
  buildAgreementCommercialTerms,
  toAgreementSharedView,
  toAgreementPreviewView,
  CANCELLATION_POLICY_ID,
  RENEWAL_POLICY_ID,
  MASTER_AGREEMENT_REFERENCE,
} from '../lib/agreementValidation.js';
import {
  ValidationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  AgreementLockedError,
} from '../lib/errors.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';

// ==========================================
// 1. AGREEMENT AUTHORIZATION SERVICE
// ==========================================
export class AgreementAuthorizationService {
  public static assertAuthenticated(actor?: User): asserts actor is User {
    if (!actor || !actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: 'anonymous',
        role: 'UNAUTHENTICATED' as any,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: 'anonymous',
          role: 'UNAUTHENTICATED',
          timestamp: new Date().toISOString(),
          reason: 'Unauthenticated access attempt to Campaign Agreement.',
        },
      });
      throw new AuthorizationError('Authentication required to access Campaign Agreement.');
    }
  }

  public static assertCanView(agreement: CampaignAgreement, actor: User): void {
    AgreementAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    const now = new Date().toISOString();

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Suppliers and Logistics Partners cannot access Campaign Agreements at this stage.',
        },
      });
      throw new AuthorizationError('Suppliers and Logistics Partners cannot view or access Campaign Agreements.');
    }

    if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant advertiser access attempted.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to view this Campaign Agreement.');
    }

    if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant venue access attempted.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to view this Campaign Agreement.');
    }
  }

  public static assertCanConfirm(agreement: CampaignAgreement, actor: User): void {
    AgreementAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    const now = new Date().toISOString();

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Suppliers and Logistics Partners cannot confirm Campaign Agreements.',
        },
      });
      throw new AuthorizationError('Suppliers and Logistics Partners cannot confirm Campaign Agreements.');
    }

    if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant or unauthorized advertiser party attempted confirmation.',
        },
      });
      throw new AuthorizationError('Access denied: You are not the Advertiser party for this Campaign Agreement.');
    }

    if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant or unauthorized venue party attempted confirmation.',
        },
      });
      throw new AuthorizationError('Access denied: You are not the Venue party for this Campaign Agreement.');
    }
  }

  public static assertCanLock(agreement: CampaignAgreement, actor: User): void {
    AgreementAuthorizationService.assertAuthenticated(actor);
    if (actor.role === 'ADMIN') return;

    const now = new Date().toISOString();

    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Suppliers and Logistics Partners cannot lock Campaign Agreements.',
        },
      });
      throw new AuthorizationError('Suppliers and Logistics Partners cannot lock Campaign Agreements.');
    }

    if (actor.role === 'ADVERTISER' && agreement.advertiserId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant advertiser attempted to lock agreement.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to lock this Campaign Agreement.');
    }

    if (actor.role === 'VENUE' && agreement.venueId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Cross-tenant venue attempted to lock agreement.',
        },
      });
      throw new AuthorizationError('Access denied: You are not authorized to lock this Campaign Agreement.');
    }

    if (agreement.advertiserId !== actor.id && agreement.venueId !== actor.id) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_ACCESS_DENIED',
        userId: actor.id,
        role: actor.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          actor: actor.id,
          role: actor.role,
          timestamp: now,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          reason: 'Non-party account attempted to lock agreement.',
        },
      });
      throw new AuthorizationError('Access denied: Only confirmed parties or platform administrators may lock this Campaign Agreement.');
    }
  }

  public static assertNotLocked(agreement: CampaignAgreement, actor?: User): void {
    if (agreement.status === 'LOCKED') {
      if (actor) {
        eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'AGREEMENT_UPDATE_REJECTED',
          userId: actor.id,
          role: actor.role,
          scope: 'TRANSACTION_SHARED',
          payload: {
            actor: actor.id,
            role: actor.role,
            agreementId: agreement.id,
            agreementPublicId: agreement.publicId,
            agreement: { id: agreement.id, publicId: agreement.publicId },
            versionNumber: agreement.currentVersionNumber,
            version: agreement.currentVersionNumber,
            timestamp: new Date().toISOString(),
            result: 'REJECTED',
            reason: 'AGREEMENT_LOCKED: Normal commercial amendments are not permitted after lock.',
          },
        });
      }
      throw new AgreementLockedError(
        'AGREEMENT_LOCKED: Normal commercial amendments, party changes, or term mutations are strictly forbidden on a LOCKED Campaign Agreement.'
      );
    }
  }
}

// ==========================================
// 2. AGREEMENT NOTIFICATION SERVICE
// ==========================================
export class AgreementNotificationService {
  /**
   * Notifies authorized parties when a Campaign Agreement is generated.
   */
  public static notifyAgreementCreated(agreement: CampaignAgreement): void {
    const now = new Date().toISOString();

    // Notify Advertiser
    db.saveNotification({
      id: generateInternalId('notif'),
      userId: agreement.advertiserId,
      title: 'Campaign Agreement Generated',
      message: `Campaign Agreement ${agreement.publicId} has been generated from mutually confirmed proposal for ${agreement.campaignName}. Please review and confirm.`,
      type: 'INFO',
      read: false,
      createdAt: now,
      campaignId: agreement.campaignId,
      publicCampaignId: agreement.campaignPublicId,
    });

    // Notify Venue
    db.saveNotification({
      id: generateInternalId('notif'),
      userId: agreement.venueId,
      title: 'Campaign Agreement Available for Review',
      message: `A formal Campaign Agreement ${agreement.publicId} is now available for review between your venue and ${agreement.advertiserBrandName}.`,
      type: 'INFO',
      read: false,
      createdAt: now,
      campaignId: agreement.campaignId,
      publicCampaignId: agreement.campaignPublicId,
    });
  }

  /**
   * Notifies authorized parties that confirmation is required.
   */
  public static notifyAgreementRequiresConfirmation(
    agreement: CampaignAgreement,
    targetParty: 'ADVERTISER' | 'VENUE' | 'BOTH' = 'BOTH'
  ): void {
    const now = new Date().toISOString();

    const targets: string[] = [];
    if (targetParty === 'ADVERTISER' || targetParty === 'BOTH') {
      targets.push(agreement.advertiserId);
    }
    if (targetParty === 'VENUE' || targetParty === 'BOTH') {
      targets.push(agreement.venueId);
    }

    targets.forEach((userId) => {
      db.saveNotification({
        id: generateInternalId('notif'),
        userId,
        title: `Agreement Requires Confirmation: ${agreement.publicId}`,
        message: `Action Required: Campaign Agreement ${agreement.publicId} for ${agreement.campaignName} requires your formal review and confirmation of commercial terms.`,
        type: 'WARNING',
        read: false,
        createdAt: now,
        campaignId: agreement.campaignId,
        publicCampaignId: agreement.campaignPublicId,
      });
    });
  }

  /**
   * Notifies Venue when Advertiser confirms.
   */
  public static notifyAdvertiserConfirmed(agreement: CampaignAgreement, advertiserUser: User): void {
    const now = new Date().toISOString();
    db.saveNotification({
      id: generateInternalId('notif'),
      userId: agreement.venueId,
      title: `Advertiser Confirmed Campaign Agreement: ${agreement.publicId}`,
      message: `Advertiser (${advertiserUser.organizationName}) has confirmed Campaign Agreement ${agreement.publicId}. Your confirmation is required to advance the agreement to commercial lock readiness.`,
      type: 'INFO',
      read: false,
      createdAt: now,
      campaignId: agreement.campaignId,
      publicCampaignId: agreement.campaignPublicId,
    });
  }

  /**
   * Notifies Advertiser when Venue confirms.
   */
  public static notifyVenueConfirmed(agreement: CampaignAgreement, venueUser: User): void {
    const now = new Date().toISOString();
    db.saveNotification({
      id: generateInternalId('notif'),
      userId: agreement.advertiserId,
      title: `Venue Confirmed Campaign Agreement: ${agreement.publicId}`,
      message: `Venue (${venueUser.organizationName}) has confirmed Campaign Agreement ${agreement.publicId}. Your confirmation is required to advance the agreement to commercial lock readiness.`,
      type: 'INFO',
      read: false,
      createdAt: now,
      campaignId: agreement.campaignId,
      publicCampaignId: agreement.campaignPublicId,
    });
  }

  public static notifyPartyConfirmed(agreement: CampaignAgreement, actor: User): void {
    const isAdvertiser = actor.role === 'ADVERTISER' || actor.id === agreement.advertiserId;
    if (isAdvertiser) {
      this.notifyAdvertiserConfirmed(agreement, actor);
    } else {
      this.notifyVenueConfirmed(agreement, actor);
    }
  }

  public static notifyReadyToLock(agreement: CampaignAgreement): void {
    const now = new Date().toISOString();

    // Notify both authorized parties
    [agreement.advertiserId, agreement.venueId].forEach((userId) => {
      db.saveNotification({
        id: generateInternalId('notif'),
        userId,
        title: `Campaign Agreement Ready to Lock: ${agreement.publicId}`,
        message: `Both parties have confirmed Campaign Agreement ${agreement.publicId}. Commercial terms are mutually verified and the agreement is now READY TO LOCK.`,
        type: 'SUCCESS',
        read: false,
        createdAt: now,
        campaignId: agreement.campaignId,
        publicCampaignId: agreement.campaignPublicId,
      });
    });
  }

  public static notifyAgreementLocked(agreement: CampaignAgreement): void {
    const now = new Date().toISOString();

    // Notify both authorized parties
    [agreement.advertiserId, agreement.venueId].forEach((userId) => {
      db.saveNotification({
        id: generateInternalId('notif'),
        userId,
        title: `Campaign Agreement Locked: ${agreement.publicId}`,
        message: `Campaign Agreement ${agreement.publicId} is now officially LOCKED. Commercial terms are sealed and immutable snapshot ${agreement.lockedSnapshotId || ''} has been secured.`,
        type: 'SUCCESS',
        read: false,
        createdAt: now,
        campaignId: agreement.campaignId,
        publicCampaignId: agreement.campaignPublicId,
      });
    });
  }

  /**
   * Dispatches a user-action-required notification when an agreement operation fails.
   */
  public static notifyActionFailed(
    userId: string,
    agreement: { id: string; publicId: string; campaignId?: string; campaignPublicId?: string },
    actionTitle: string,
    userActionRequired: string
  ): void {
    const now = new Date().toISOString();
    db.saveNotification({
      id: generateInternalId('notif'),
      userId,
      title: `Agreement Action Failed: ${actionTitle}`,
      message: `${userActionRequired}`,
      type: 'WARNING',
      read: false,
      createdAt: now,
      campaignId: agreement.campaignId,
      publicCampaignId: agreement.campaignPublicId,
    });
  }
}

// ==========================================
// 3. AGREEMENT SNAPSHOT SERVICE
// ==========================================
export class AgreementSnapshotService {
  /**
   * Generates and stores an immutable snapshot at lock time.
   * Subsequent profile changes or campaign edits will NOT alter this snapshot.
   */
  public static createSnapshot(
    agreement: CampaignAgreement,
    actor: User
  ): CampaignAgreementSnapshot {
    const now = new Date().toISOString();
    const snapshotId = generateInternalId('cgs');
    const publicSnapshotId = generateBusinessId('AB-CGS');

    const rawAdvProfile = db.getProfileByUserId(agreement.advertiserId) as AdvertiserProfile | undefined;
    const rawVenProfile = db.getProfileByUserId(agreement.venueId) as VenueProfile | undefined;
    const rawCampaign = db.getCampaignById(agreement.campaignId);

    const advProfile = rawAdvProfile ? JSON.parse(JSON.stringify(rawAdvProfile)) : undefined;
    const venProfile = rawVenProfile ? JSON.parse(JSON.stringify(rawVenProfile)) : undefined;
    const campaign = rawCampaign ? JSON.parse(JSON.stringify(rawCampaign)) : undefined;

    const termsClone = JSON.parse(JSON.stringify(agreement.terms));

    const snapshot: CampaignAgreementSnapshot = {
      id: snapshotId,
      publicSnapshotId,
      agreementId: agreement.id,
      agreementPublicId: agreement.publicId,
      agreementVersionId: agreement.currentVersionId,
      versionNumber: agreement.currentVersionNumber,
      lockedAt: now,
      lockedBy: actor.id,
      lockVersion: agreement.lockVersion,
      agreementReference: agreement.agreementReference,
      sourceReferences: {
        sourceProposalId: agreement.sourceProposalId,
        sourceProposalPublicId: agreement.sourceProposalPublicId,
        sourceProposalVersionId: agreement.sourceProposalVersionId,
        sourceProposalVersionNumber: agreement.sourceProposalVersionNumber,
      },
      advertiserSnapshot: {
        brandName: agreement.advertiserBrandName,
        publicAccountId: agreement.advertiserPublicId,
        industry: advProfile?.industry,
        advertisingCategory: advProfile?.advertisingCategory,
        primaryContactName: advProfile?.primaryContact?.name,
        contactEmail: advProfile?.primaryContact?.email,
        locationCity: advProfile?.location?.city,
        locationCountry: advProfile?.location?.country,
      },
      venueSnapshot: {
        venueName: agreement.venueName,
        publicAccountId: agreement.venuePublicId,
        venueType: venProfile?.venueType || 'Hospitality & Commercial',
        audienceCategory: venProfile?.audienceCategory || 'Mixed Premium',
        locationCity: venProfile?.location?.city || 'Metro Area',
        locationCountry: venProfile?.location?.country || 'USA',
        monthlyVisitors: venProfile?.footfall?.monthlyVisitors || 50000,
        availableBottleCapacity: venProfile?.capacity?.availableBottleCapacity || 15000,
        maxBottleHoldingCapacity: venProfile?.capacity?.maxBottleHoldingCapacity || 25000,
        placementPossibilities: venProfile?.placementPossibilities ? [...venProfile.placementPossibilities] : ['Main Reception Staging'],
      },
      campaignSnapshot: {
        campaignName: agreement.campaignName,
        publicCampaignId: agreement.campaignPublicId,
        category: agreement.campaignCategory,
        objective: campaign?.objective || 'Targeted Premium Brand Engagement',
        targetAudience: typeof campaign?.targetAudience === 'string' ? campaign.targetAudience : campaign?.targetAudience?.demographics || campaign?.targetAudience?.characteristics?.join(', ') || 'Verified Venue Footfall',
        durationWeeks: agreement.terms.campaignDuration?.value || 4,
        preferredStartMonthYear: agreement.terms.preferredStartPeriod?.label || 'Q3 2026',
      },
      campaignTermsSnapshot: {
        quantity: termsClone.campaignQuantity,
        duration: termsClone.campaignDuration,
        preferredStartPeriod: termsClone.preferredStartPeriod,
        customConditions: termsClone.customConditions,
        importantConditions: termsClone.importantConditions,
      },
      productRequirementsSnapshot: termsClone.productRequirements,
      distributionSnapshot: termsClone.distributionRequirements,
      placementSnapshot: {
        placementRequirements: termsClone.placementRequirements,
      },
      collaborationSnapshot: termsClone.collaborationRequirement,
      compensationTermsSnapshot: termsClone.venueCompensationTerms,
      responsibilitiesSnapshot: {
        advertiserResponsibilities: termsClone.advertiserResponsibilities,
        venueResponsibilities: termsClone.venueResponsibilities,
        aquaBloomResponsibilities: termsClone.aquaBloomResponsibilities,
      },
      deliveryTermsSnapshot: termsClone.deliveryTermsKnown,
      qrRequirementsSnapshot: termsClone.qrRequirements,
      cancellationTermsSnapshot: termsClone.cancellationTerms,
      renewalTermsSnapshot: termsClone.renewalTerms,
      commercialTermsSnapshot: termsClone,
    };

    db.saveAgreementSnapshot(snapshot);
    return JSON.parse(JSON.stringify(snapshot));
  }
}

// ==========================================
// 4. AGREEMENT SERVICE (FACADE)
// ==========================================
export class AgreementService {
  /**
   * Creates a formal Campaign Agreement from a proposal that reached READY_FOR_AGREEMENT.
   * Multi-venue campaigns create independent agreements per venue.
   */
  public static createAgreement(
    input: CreateCampaignAgreementInput,
    actor: User
  ): CampaignAgreement {
    // Idempotency check: if an active agreement for this source proposal already exists, return it!
    const existing = db.getAgreementByProposalId(input.sourceProposalId);
    if (existing) {
      AgreementAuthorizationService.assertCanView(existing, actor);
      return existing;
    }

    const proposal = db.getProposalById(input.sourceProposalId);
    if (!proposal) {
      throw new NotFoundError(`Proposal '${input.sourceProposalId}' not found.`);
    }

    const campaign = db.getCampaignById(proposal.campaignId);
    const venProfile = db.getProfileByUserId(proposal.venueId) as VenueProfile | undefined;
    const proposalVersions = db.getProposalVersions(proposal.id);
    const sourceProposalVersion = proposalVersions.find((v) => v.versionNumber === proposal.currentVersionNumber) || (proposalVersions.length > 0 ? proposalVersions[0] : null);

    // Validate agreement creation conditions
    const val = validateAgreementCreation(proposal, campaign, actor, sourceProposalVersion);
    if (!val.isValid) {
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    const now = new Date().toISOString();
    const agreementId = generateInternalId('cag');
    const publicId = generateBusinessId('AB-CAG');
    const versionId = generateInternalId('cgv');
    const publicVersionId = `${generateBusinessId('AB-CGV')}-01`;

    const terms = buildAgreementCommercialTerms(proposal, venProfile);
    const sourceProposalVersionId = sourceProposalVersion ? sourceProposalVersion.id : `prv_${proposal.id}_v${proposal.currentVersionNumber}`;

    const agreement: CampaignAgreement = {
      id: agreementId,
      publicId,
      campaignId: proposal.campaignId,
      campaignPublicId: proposal.publicCampaignId,
      campaignName: proposal.campaignName,
      campaignCategory: proposal.campaignCategory,
      advertiserId: proposal.advertiserId,
      advertiserPublicId: proposal.advertiserPublicId,
      advertiserBrandName: proposal.advertiserBrandName,
      venueId: proposal.venueId,
      venuePublicId: proposal.venuePublicId,
      venueName: proposal.venueName,
      sourceProposalId: proposal.id,
      sourceProposalPublicId: proposal.publicProposalId,
      sourceProposalVersionId,
      sourceProposalVersionNumber: proposal.currentVersionNumber,
      status: 'DRAFT',
      currentVersionId: versionId,
      currentVersionNumber: 1,
      lockedSnapshotId: null,
      advertiserConfirmedAt: null,
      advertiserConfirmedBy: null,
      venueConfirmedAt: null,
      venueConfirmedBy: null,
      lockedAt: null,
      lockedBy: null,
      lockVersion: 1,
      cancellationPolicyId: CANCELLATION_POLICY_ID,
      renewalPolicyId: RENEWAL_POLICY_ID,
      agreementReference: MASTER_AGREEMENT_REFERENCE,
      terms,
      createdAt: now,
      updatedAt: now,
      createdBy: actor.id,
      updatedBy: actor.id,
    };

    const initialVersion: CampaignAgreementVersion = {
      id: versionId,
      publicVersionId,
      agreementId,
      versionNumber: 1,
      sourceProposalVersionId: agreement.sourceProposalVersionId,
      agreementData: terms,
      createdAt: now,
      createdBy: actor.id,
      status: 'ACTIVE',
      changeSummary: 'Formal Campaign Agreement generated from mutually confirmed proposal.',
    };

    const internalRecord: CampaignAgreementInternalRecord = {
      id: generateInternalId('cair'),
      agreementId,
      publicId,
      sourceProposalId: proposal.id,
      sourceProposalVersionId: agreement.sourceProposalVersionId,
      lockedSnapshotId: null,
      workflowStage: 'COMMERCIAL_LOCK',
      futureSupplierAssignmentReference: null,
      futureLogisticsAssignmentReference: null,
      internalFinancialReferences: {
        ledgerLockStatus: 'PENDING_SUPPLIER_LOGISTICS_PRICING',
        finalPayableCalculated: false,
      },
      technicalMetadata: {
        schemaVersion: '1.0-step7',
        lockVersion: 1,
        environment: 'production-ready',
      },
      riskMetadata: {
        capacityOverageAcknowledged: !!proposal.terms.capacityOverageDecision,
        disputeRiskScore: 'LOW',
      },
      createdAt: now,
      updatedAt: now,
    };

    db.saveAgreement(agreement);
    db.saveAgreementVersion(initialVersion);
    db.saveAgreementInternalRecord(internalRecord);

    // Audit events
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'AGREEMENT_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        actor: actor.id,
        role: actor.role,
        timestamp: now,
        agreementId,
        agreementPublicId: publicId,
        agreement: { id: agreementId, publicId },
        versionNumber: 1,
        version: 1,
        sourceProposalId: proposal.id,
        campaignId: proposal.campaignId,
        venueId: proposal.venueId,
        advertiserId: proposal.advertiserId,
        quantity: terms.campaignQuantity,
      },
    });

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'AGREEMENT_VERSION_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        actor: actor.id,
        role: actor.role,
        timestamp: now,
        agreementId,
        agreementPublicId: publicId,
        agreement: { id: agreementId, publicId },
        versionNumber: 1,
        version: 1,
        publicVersionId,
      },
    });

    // Notify parties
    AgreementNotificationService.notifyAgreementCreated(agreement);
    AgreementNotificationService.notifyAgreementRequiresConfirmation(agreement, 'BOTH');

    return agreement;
  }

  /**
   * Confirms the agreement by either Advertiser or Venue.
   * Either party may confirm first. Once both confirm, status becomes READY_TO_LOCK.
   */
  public static confirmAgreement(
    agreementId: string,
    actor: User,
    input: ConfirmCampaignAgreementInput
  ): { agreement: CampaignAgreement; isReadyToLock: boolean } {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    AgreementAuthorizationService.assertCanConfirm(agreement, actor);

    // Record confirmation started audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'AGREEMENT_CONFIRMATION_STARTED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        actor: actor.id,
        role: actor.role,
        agreementId: agreement.id,
        agreementPublicId: agreement.publicId,
        versionNumber: agreement.currentVersionNumber,
        timestamp: new Date().toISOString(),
        result: 'STARTED',
        expectedVersion: input.expectedVersion,
      },
    });

    // Validate confirmation attempt
    if (agreement.status === 'LOCKED') {
      throw new AgreementLockedError(
        `Campaign Agreement '${agreement.publicId}' is already LOCKED. Commercial terms are sealed and cannot be re-confirmed.`
      );
    }

    const val = validateAgreementConfirmation(agreement, actor, input);
    if (!val.isValid) {
      AgreementNotificationService.notifyActionFailed(
        actor.id,
        agreement,
        'Agreement Confirmation Failed',
        val.errors[0].message
      );
      if (val.errors.some((e) => e.field === 'expectedVersion')) {
        throw new ConflictError(val.errors[0].message);
      }
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    // Graceful duplicate confirmation check (idempotent double-click handling)
    const isAdvertiser = actor.role === 'ADVERTISER' || (actor.role === 'ADMIN' && actor.id === agreement.advertiserId);
    const isVenue = actor.role === 'VENUE' || (actor.role === 'ADMIN' && actor.id === agreement.venueId);

    if (isAdvertiser && agreement.advertiserConfirmedAt) {
      return { agreement, isReadyToLock: agreement.status === 'READY_TO_LOCK' };
    }
    if (isVenue && agreement.venueConfirmedAt) {
      return { agreement, isReadyToLock: agreement.status === 'READY_TO_LOCK' };
    }

    const now = new Date().toISOString();

    if (isAdvertiser) {
      agreement.advertiserConfirmedAt = now;
      agreement.advertiserConfirmedBy = actor.id;
      if (agreement.venueConfirmedAt) {
        agreement.status = 'READY_TO_LOCK';
      } else {
        agreement.status = 'AWAITING_VENUE_CONFIRMATION';
      }
    } else if (isVenue) {
      agreement.venueConfirmedAt = now;
      agreement.venueConfirmedBy = actor.id;
      if (agreement.advertiserConfirmedAt) {
        agreement.status = 'READY_TO_LOCK';
      } else {
        agreement.status = 'AWAITING_ADVERTISER_CONFIRMATION';
      }
    } else if (actor.role === 'ADMIN') {
      // Admin confirmed on behalf: marks both confirmed
      agreement.advertiserConfirmedAt = agreement.advertiserConfirmedAt || now;
      agreement.advertiserConfirmedBy = agreement.advertiserConfirmedBy || actor.id;
      agreement.venueConfirmedAt = agreement.venueConfirmedAt || now;
      agreement.venueConfirmedBy = agreement.venueConfirmedBy || actor.id;
      agreement.status = 'READY_TO_LOCK';
    }

    agreement.updatedAt = now;
    agreement.updatedBy = actor.id;

    // Update active version confirmation metadata
    const versions = db.getAgreementVersions(agreement.id);
    const activeVer = versions.find((v) => v.id === agreement.currentVersionId);
    if (activeVer) {
      if (isAdvertiser) {
        activeVer.advertiserConfirmedAt = now;
        activeVer.advertiserConfirmedBy = actor.id;
      }
      if (isVenue) {
        activeVer.venueConfirmedAt = now;
        activeVer.venueConfirmedBy = actor.id;
      }
      if (agreement.status === 'READY_TO_LOCK') {
        activeVer.status = 'CONFIRMED';
      }
      db.saveAgreementVersion(activeVer);
    }

    db.saveAgreement(agreement);

    const isReadyToLock = agreement.status === 'READY_TO_LOCK';

    // Dispatch confirmation audit event
    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: isAdvertiser ? 'ADVERTISER_CONFIRMED' : 'VENUE_CONFIRMED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        actor: actor.id,
        role: actor.role,
        agreementId: agreement.id,
        agreementPublicId: agreement.publicId,
        agreement: { id: agreement.id, publicId: agreement.publicId },
        versionNumber: agreement.currentVersionNumber,
        version: agreement.currentVersionNumber,
        timestamp: now,
        result: 'SUCCESS',
        isReadyToLock,
        notes: input.notes,
      },
    });

    if (isReadyToLock) {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_READY_TO_LOCK',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          actor: actor.id,
          role: actor.role,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          timestamp: now,
          result: 'SUCCESS',
        },
      });
      AgreementNotificationService.notifyReadyToLock(agreement);
    } else {
      if (isAdvertiser) {
        AgreementNotificationService.notifyAdvertiserConfirmed(agreement, actor);
        AgreementNotificationService.notifyAgreementRequiresConfirmation(agreement, 'VENUE');
      } else {
        AgreementNotificationService.notifyVenueConfirmed(agreement, actor);
        AgreementNotificationService.notifyAgreementRequiresConfirmation(agreement, 'ADVERTISER');
      }
    }

    return { agreement, isReadyToLock };
  }

  /**
   * Atomically locks the Campaign Agreement inside a transaction.
   * Creates an immutable snapshot and prevents any further commercial modifications.
   * Concurrency-safe: duplicate lock requests return the single logical lock and snapshot.
   */
  public static lockAgreement(
    agreementId: string,
    actor: User,
    input: LockCampaignAgreementInput
  ): { agreement: CampaignAgreement; snapshot: CampaignAgreementSnapshot } {
    const existing = db.getAgreementById(agreementId);
    if (!existing) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    AgreementAuthorizationService.assertCanLock(existing, actor);

    // Status check: if already locked, reject with AgreementLockedError
    if (existing.status === 'LOCKED') {
      throw new AgreementLockedError(
        `Campaign Agreement '${existing.publicId}' is already LOCKED. Commercial terms are sealed and cannot be modified or re-locked.`
      );
    }

    // Pre-validate authoritative lock criteria outside transaction so failure notification is preserved
    const val = validateAgreementLock(existing, actor, input);
    if (!val.isValid) {
      AgreementNotificationService.notifyActionFailed(
        actor.id,
        existing,
        'Lock Agreement Failed',
        val.errors[0].message
      );
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_LOCK_FAILED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          actor: actor.id,
          role: actor.role,
          agreementId: existing.id,
          agreementPublicId: existing.publicId,
          agreement: { id: existing.id, publicId: existing.publicId },
          versionNumber: existing.currentVersionNumber,
          version: existing.currentVersionNumber,
          timestamp: new Date().toISOString(),
          result: 'FAILED',
          errors: val.errors,
        },
      });
      if (val.errors.some((e) => e.field === 'lockVersion' || e.field === 'expectedVersion')) {
        throw new ConflictError(val.errors[0].message);
      }
      throw new ValidationError(val.errors[0].message, val.errors);
    }

    return db.runTransaction(() => {
      // 1. Re-read authoritative Agreement state
      const agreement = db.getAgreementById(agreementId);
      if (!agreement) {
        throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
      }

      if (agreement.status === 'LOCKED') {
        throw new AgreementLockedError(
          `Campaign Agreement '${agreement.publicId}' is already LOCKED. Commercial terms are sealed and cannot be modified or re-locked.`
        );
      }

      const now = new Date().toISOString();

      // 3. Generate immutable snapshot
      const snapshot = AgreementSnapshotService.createSnapshot(agreement, actor);

      // 4. Perform atomic lock state transition
      agreement.status = 'LOCKED';
      agreement.lockedAt = now;
      agreement.lockedBy = actor.id;
      agreement.lockedSnapshotId = snapshot.publicSnapshotId;
      agreement.lockVersion += 1;
      agreement.updatedAt = now;
      agreement.updatedBy = actor.id;

      // 5. Mark current version as LOCKED
      const versions = db.getAgreementVersions(agreement.id);
      const activeVer = versions.find((v) => v.id === agreement.currentVersionId);
      if (activeVer) {
        activeVer.status = 'LOCKED';
        db.saveAgreementVersion(activeVer);
      }

      // 6. Update Campaign state
      const campaign = db.getCampaignById(agreement.campaignId);
      if (campaign && (campaign.status === 'AGREEMENT_PENDING' || campaign.status === 'PROPOSAL_ACTIVE' || campaign.status === 'ACTIVE')) {
        campaign.status = 'AGREEMENT_LOCKED';
        campaign.updatedAt = now;
        campaign.updatedBy = actor.id;
        db.saveCampaign(campaign);
      }

      // 7. Update internal record
      const internalRecord = db.getAgreementInternalRecord(agreement.id);
      if (internalRecord) {
        internalRecord.lockedSnapshotId = snapshot.publicSnapshotId;
        internalRecord.technicalMetadata.lockVersion = agreement.lockVersion;
        internalRecord.updatedAt = now;
        db.saveAgreementInternalRecord(internalRecord);
      }

      // 8. Persist agreement atomically
      db.saveAgreement(agreement);

      // 9. Dispatch audit event
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_LOCKED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          actor: actor.id,
          role: actor.role,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          timestamp: now,
          result: 'SUCCESS',
          lockedSnapshotId: snapshot.publicSnapshotId,
          lockVersion: agreement.lockVersion,
          campaignId: agreement.campaignId,
          venueId: agreement.venueId,
          advertiserId: agreement.advertiserId,
        },
      });

      // 10. Notify both parties
      AgreementNotificationService.notifyAgreementLocked(agreement);

      return { agreement, snapshot };
    });
  }

  /**
   * Creates a new agreement version (commercial amendments before lock).
   * Changing the agreement version strictly invalidates any previous party confirmations.
   * Rejects immediately if the agreement is already LOCKED.
   */
  public static createNewAgreementVersion(
    agreementId: string,
    actor: User,
    newTerms: AgreementCommercialTerms,
    changeSummary: string = 'Commercial amendment update'
  ): { agreement: CampaignAgreement; version: CampaignAgreementVersion } {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    AgreementAuthorizationService.assertCanConfirm(agreement, actor);

    // If agreement is LOCKED, mutation is strictly forbidden!
    if (agreement.status === 'LOCKED') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_UPDATE_REJECTED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          actor: actor.id,
          role: actor.role,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          versionNumber: agreement.currentVersionNumber,
          timestamp: new Date().toISOString(),
          result: 'REJECTED',
          reason: 'AGREEMENT_LOCKED: Normal commercial amendments are not permitted after lock.',
        },
      });
      throw new AgreementLockedError(
        'AGREEMENT_LOCKED: Normal commercial amendments, party changes, or term mutations are strictly forbidden on a LOCKED Campaign Agreement.'
      );
    }

    const now = new Date().toISOString();
    const nextVersionNumber = agreement.currentVersionNumber + 1;
    const versionId = generateInternalId('cgv');
    const publicVersionId = `${agreement.publicId.replace('AB-CAG', 'AB-CGV')}-${String(nextVersionNumber).padStart(2, '0')}`;

    // Mark previous active version as SUPERSEDED
    const versions = db.getAgreementVersions(agreement.id);
    const prevActive = versions.find((v) => v.id === agreement.currentVersionId);
    if (prevActive) {
      prevActive.status = 'SUPERSEDED';
      db.saveAgreementVersion(prevActive);
    }

    // Reset confirmations - confirmations belong to a specific version!
    agreement.advertiserConfirmedAt = null;
    agreement.advertiserConfirmedBy = null;
    agreement.venueConfirmedAt = null;
    agreement.venueConfirmedBy = null;
    agreement.status = 'DRAFT';
    agreement.currentVersionId = versionId;
    agreement.currentVersionNumber = nextVersionNumber;
    agreement.terms = JSON.parse(JSON.stringify(newTerms));
    agreement.updatedAt = now;
    agreement.updatedBy = actor.id;

    const newVersion: CampaignAgreementVersion = {
      id: versionId,
      publicVersionId,
      agreementId: agreement.id,
      versionNumber: nextVersionNumber,
      sourceProposalVersionId: agreement.sourceProposalVersionId,
      agreementData: agreement.terms,
      createdAt: now,
      createdBy: actor.id,
      status: 'ACTIVE',
      changeSummary: changeSummary || `Version ${nextVersionNumber} updated with revised terms.`,
    };

    db.saveAgreementVersion(newVersion);
    db.saveAgreement(agreement);

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'AGREEMENT_VERSION_CREATED',
      userId: actor.id,
      role: actor.role,
      scope: 'TRANSACTION_SHARED',
      payload: {
        actor: actor.id,
        role: actor.role,
        agreementId: agreement.id,
        agreementPublicId: agreement.publicId,
        agreement: { id: agreement.id, publicId: agreement.publicId },
        versionNumber: nextVersionNumber,
        version: nextVersionNumber,
        timestamp: now,
        result: 'SUCCESS',
      },
    });

    // Notify parties that a new version requires their confirmation
    AgreementNotificationService.notifyAgreementRequiresConfirmation(agreement, 'BOTH');

    return { agreement, version: newVersion };
  }

  /**
   * Rejects any direct mutation attempts on locked agreements.
   */
  public static updateCommercialTerms(
    agreementId: string,
    actor: User,
    newTerms: Partial<AgreementCommercialTerms>,
    changeSummary: string = 'Updated commercial terms'
  ): { agreement: CampaignAgreement; version: CampaignAgreementVersion } {
    const agreement = db.getAgreementById(agreementId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${agreementId}' not found.`);
    }

    AgreementAuthorizationService.assertCanConfirm(agreement, actor);

    if (agreement.status === 'LOCKED') {
      eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'AGREEMENT_UPDATE_REJECTED',
        userId: actor.id,
        role: actor.role,
        scope: 'TRANSACTION_SHARED',
        payload: {
          actor: actor.id,
          role: actor.role,
          agreementId: agreement.id,
          agreementPublicId: agreement.publicId,
          agreement: { id: agreement.id, publicId: agreement.publicId },
          versionNumber: agreement.currentVersionNumber,
          version: agreement.currentVersionNumber,
          timestamp: new Date().toISOString(),
          result: 'REJECTED',
          reason: 'AGREEMENT_LOCKED: Normal commercial amendments are not permitted after lock.',
        },
      });
      throw new AgreementLockedError(
        'AGREEMENT_LOCKED: Normal commercial amendments, party changes, or term mutations are strictly forbidden on a LOCKED Campaign Agreement.'
      );
    }

    const mergedTerms: AgreementCommercialTerms = {
      ...agreement.terms,
      ...newTerms,
    };

    return this.createNewAgreementVersion(agreementId, actor, mergedTerms, changeSummary);
  }

  /**
   * Retrieves an agreement and guarantees authorized access.
   */
  public static getAgreement(idOrPublicId: string, actor: User): CampaignAgreement {
    const agreement = db.getAgreementById(idOrPublicId);
    if (!agreement) {
      throw new NotFoundError(`Campaign Agreement '${idOrPublicId}' not found.`);
    }

    AgreementAuthorizationService.assertCanView(agreement, actor);

    eventDispatcher.dispatch({
      category: 'AUDIT_EVENTS',
      eventType: 'AGREEMENT_VIEWED',
      userId: actor.id,
      role: actor.role,
      scope: 'INTERNAL_ADMIN',
      payload: {
        actor: actor.id,
        role: actor.role,
        timestamp: new Date().toISOString(),
        agreementId: agreement.id,
        agreementPublicId: agreement.publicId,
        agreement: { id: agreement.id, publicId: agreement.publicId },
        versionNumber: agreement.currentVersionNumber,
        version: agreement.currentVersionNumber,
      },
    });

    return agreement;
  }

  /**
   * Retrieves role-aware, sanitized shared view of the agreement.
   * Completely excludes internal margin, financial ledger, and supplier cost data.
   */
  public static getSharedView(
    idOrPublicId: string,
    actor: User
  ): CampaignAgreementSharedView {
    const agreement = this.getAgreement(idOrPublicId, actor);
    const campaign = db.getCampaignById(agreement.campaignId);
    if (!campaign) {
      throw new NotFoundError(`Referenced Campaign '${agreement.campaignId}' not found.`);
    }

    const advProfile = db.getProfileByUserId(agreement.advertiserId) as AdvertiserProfile | undefined;
    const venProfile = db.getProfileByUserId(agreement.venueId) as VenueProfile | undefined;

    return toAgreementSharedView(agreement, actor, campaign, advProfile, venProfile);
  }

  /**
   * Lists agreements accessible to the authenticated actor.
   * Enforces cross-tenant boundary isolation.
   */
  public static listAgreements(
    query: CampaignAgreementFilterQuery,
    actor: User
  ): { items: CampaignAgreementSharedView[]; total: number } {
    if (actor.role === 'SUPPLIER' || actor.role === 'LOGISTICS_PARTNER') {
      throw new AuthorizationError('Suppliers and Logistics Partners cannot view or access Campaign Agreements.');
    }

    let all = db.getAllAgreements();

    // Role-based tenant isolation
    if (actor.role === 'ADVERTISER') {
      all = all.filter((a) => a.advertiserId === actor.id);
    } else if (actor.role === 'VENUE') {
      all = all.filter((a) => a.venueId === actor.id);
    }
    // Admins see all

    // Optional query filters
    if (query.campaignId) {
      all = all.filter((a) => a.campaignId === query.campaignId || a.campaignPublicId === query.campaignId);
    }
    if (query.venueId) {
      all = all.filter((a) => a.venueId === query.venueId || a.venuePublicId === query.venueId);
    }
    if (query.status) {
      all = all.filter((a) => a.status === query.status);
    }

    const total = all.length;
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? query.pageSize : 50;
    const start = (page - 1) * pageSize;
    const paged = all.slice(start, start + pageSize);

    const items = paged.map((agr) => {
      const camp = db.getCampaignById(agr.campaignId)!;
      const advProf = db.getProfileByUserId(agr.advertiserId) as AdvertiserProfile | undefined;
      const venProf = db.getProfileByUserId(agr.venueId) as VenueProfile | undefined;
      return toAgreementSharedView(agr, actor, camp, advProf, venProf);
    });

    return { items, total };
  }

  /**
   * Retrieves versions for an agreement.
   */
  public static getAgreementVersions(
    agreementId: string,
    actor: User
  ): CampaignAgreementVersion[] {
    const agreement = this.getAgreement(agreementId, actor);
    return db.getAgreementVersions(agreement.id);
  }

  /**
   * Retrieves a specific version of an agreement.
   * Enforces role-based authorization to prevent unauthorized historical version access.
   */
  public static getAgreementVersion(
    agreementId: string,
    versionIdentifier: string,
    actor: User
  ): SanitizedAgreementVersion {
    const agreement = this.getAgreement(agreementId, actor);
    const versions = db.getAgreementVersions(agreement.id);

    const version = versions.find(
      (v) =>
        v.id === versionIdentifier ||
        v.publicVersionId === versionIdentifier ||
        v.versionNumber.toString() === versionIdentifier
    );

    if (!version) {
      throw new NotFoundError(`Agreement Version '${versionIdentifier}' not found for agreement '${agreementId}'.`);
    }

    const creatorUser = db.findUserById(version.createdBy);
    const creatorProf = db.getProfileByUserId(version.createdBy);

    let actorName = (creatorUser as any)?.contactName || (creatorUser as any)?.organizationName || creatorUser?.email || 'Platform System';
    let actorOrg = 'AquaBloom Platform';
    if (creatorProf) {
      if ('brandName' in creatorProf && creatorProf.brandName) {
        actorName = creatorProf.brandName;
        actorOrg = creatorProf.brandName;
      } else if ('venueName' in creatorProf && creatorProf.venueName) {
        actorName = creatorProf.venueName;
        actorOrg = creatorProf.venueName;
      }
    }

    return {
      id: version.id,
      publicVersionId: version.publicVersionId,
      versionNumber: version.versionNumber,
      createdAt: version.createdAt,
      createdDate: version.createdAt ? version.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
      actor: {
        userId: creatorUser?.publicAccountId || version.createdBy,
        role: creatorUser?.role || (version.createdBy === agreement.advertiserId ? 'ADVERTISER' : 'VENUE'),
        name: actorName,
        organizationName: actorOrg,
      },
      changeSummary: version.changeSummary,
      status: version.status,
      advertiserConfirmedAt: version.advertiserConfirmedAt,
      venueConfirmedAt: version.venueConfirmedAt,
    };
  }

  /**
   * Retrieves the comprehensive human-readable Campaign Agreement preview model.
   * Exposes all 24 required data points with role isolation and zero internal pricing leakage.
   */
  public static getPreview(
    idOrPublicId: string,
    actor: User
  ): CampaignAgreementPreviewView {
    const agreement = this.getAgreement(idOrPublicId, actor);
    const campaign = db.getCampaignById(agreement.campaignId);
    if (!campaign) {
      throw new NotFoundError(`Referenced Campaign '${agreement.campaignId}' not found.`);
    }

    const versions = db.getAgreementVersions(agreement.id);
    const advProfile = db.getProfileByUserId(agreement.advertiserId) as AdvertiserProfile | undefined;
    const venProfile = db.getProfileByUserId(agreement.venueId) as VenueProfile | undefined;

    const actorLookup = (userId: string) => {
      const u = db.findUserById(userId);
      const prof = db.getProfileByUserId(userId);
      if (!u) return undefined;
      let name = (u as any)?.contactName || (u as any)?.organizationName || u.email;
      let org = 'AquaBloom Platform';
      if (prof) {
        if ('brandName' in prof && prof.brandName) {
          name = prof.brandName;
          org = prof.brandName;
        } else if ('venueName' in prof && prof.venueName) {
          name = prof.venueName;
          org = prof.venueName;
        }
      }
      return {
        name,
        role: u.role,
        organizationName: org,
      };
    };

    return toAgreementPreviewView(
      agreement,
      actor,
      campaign,
      versions,
      advProfile,
      venProfile,
      actorLookup
    );
  }

  /**
   * Retrieves locked snapshot for an agreement.
   */
  public static getAgreementSnapshot(
    agreementId: string,
    actor: User
  ): CampaignAgreementSnapshot {
    const agreement = this.getAgreement(agreementId, actor);
    const snapshot = db.getAgreementSnapshotByAgreementId(agreement.id);
    if (!snapshot) {
      throw new NotFoundError(`No locked snapshot found for agreement '${agreementId}'.`);
    }
    return snapshot;
  }
}
