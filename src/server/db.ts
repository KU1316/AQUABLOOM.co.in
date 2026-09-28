/**
 * AquaBloom Database Foundation — Step 2: Accounts + Profiles + Permissions
 * 
 * Manages persistent storage for:
 * 1. Users (Identity, Account Status, Public ID, Role)
 * 2. Profiles (Role-specific operational and business data, versioned, completion-aware)
 * 3. Sessions (Active tokens and expiry)
 * 4. Passwords (Demo/Development auth)
 * 5. Audit Events (System timeline and compliance trail)
 */

import fs from 'fs';
import path from 'path';
import {
  User,
  Session,
  UserRole,
  AppEvent,
  UserProfile,
  AdvertiserProfile,
  VenueProfile,
  SupplierProfile,
  LogisticsProfile,
  ApprovalStatus,
  AccountStatus,
  Product,
  ProductVersion,
  CreateProductInput,
  UpdateProductInput,
  CreateProductVersionInput,
  ProductStatus,
  ProductAvailability,
  CustomerFacingProductSummary,
  Campaign,
  CampaignVersion,
  CreateCampaignInput,
  UpdateCampaignInput,
  CampaignStatus,
  CampaignValidationResult,
  CampaignOpportunityView,
  MarketplaceVenue,
  VenueMarketplaceQuery,
  PaginatedResult,
  VenueCapacityOverview,
  CapacityEvaluation,
  MatchEvaluation,
  Proposal,
  ProposalVersion,
  ProposalNegotiationEvent,
  ProposalTerms,
  CampaignAgreement,
  CampaignAgreementVersion,
  CampaignAgreementSnapshot,
  CampaignAgreementInternalRecord,
  OrderReadiness,
  DataHandoff,
  SupplierOperationalOffer,
  SupplierAssignment,
  LogisticsOperationalOffer,
  LogisticsAssignment,
  FinalPricingCalculationResult,
  Order,
  OrderPricingSnapshot,
  OrderPaymentReadiness,
  Payment,
  PaymentAttempt,
  WebhookEventRecord,
  PaymentReconciliationRecord,
  FinancialLedgerEntry,
  VenueCompensationRecord,
  FulfillmentAuthorization,
} from '../types.js';
import { AgreementLockedError, ConflictError } from '../lib/errors.js';
import { generateInternalId, generateBusinessId } from '../lib/idGenerator.js';
import { eventDispatcher } from '../lib/events.js';
import {
  calculateAdvertiserCompletion,
  calculateVenueCompletion,
  calculateSupplierCompletion,
  calculateLogisticsCompletion,
} from '../lib/profileValidation.js';
import {
  validateStatusTransition,
  sanitizeProductForMarketplace,
} from '../lib/productValidation.js';
import {
  validateAdvertiserEligibility,
  validateCampaign,
  validateCampaignStatusTransition,
  getCampaignOpportunityView,
} from '../lib/campaignValidation.js';
import {
  evaluateVenueEligibility,
  evaluateCapacity,
  calculateMatchScore,
  sanitizeVenueForMarketplace,
  DEFAULT_MATCHING_CONFIGURATION_V1,
} from '../lib/matchingEngine.js';

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
  read: boolean;
  createdAt: string;
  campaignId?: string;
  publicCampaignId?: string;
}

interface DatabaseSchema {
  users: User[];
  sessions: Session[];
  passwords: Record<string, string>; // userId -> password
  events: AppEvent[];
  profiles: Record<string, UserProfile>; // userId -> UserProfile
  products: Product[];
  productVersions: ProductVersion[];
  campaigns: Campaign[];
  campaignVersions: CampaignVersion[];
  notifications: AppNotification[];
  proposals: Proposal[];
  proposalVersions: ProposalVersion[];
  proposalEvents: ProposalNegotiationEvent[];
  agreements: CampaignAgreement[];
  agreementVersions: CampaignAgreementVersion[];
  agreementSnapshots: CampaignAgreementSnapshot[];
  agreementInternalRecords: CampaignAgreementInternalRecord[];
  orderReadinessRecords: OrderReadiness[];
  dataHandoffRecords: DataHandoff[];
  supplierOffers: SupplierOperationalOffer[];
  supplierAssignments: SupplierAssignment[];
  logisticsOffers: LogisticsOperationalOffer[];
  logisticsAssignments: LogisticsAssignment[];
  finalPricingResults: FinalPricingCalculationResult[];
  orders: Order[];
  orderPricingSnapshots: OrderPricingSnapshot[];
  orderPaymentReadinessRecords: OrderPaymentReadiness[];
  payments: Payment[];
  paymentAttempts: PaymentAttempt[];
  webhookEventRecords: WebhookEventRecord[];
  paymentReconciliationRecords: PaymentReconciliationRecord[];
  financialLedgerEntries: FinancialLedgerEntry[];
  venueCompensationRecords: VenueCompensationRecord[];
  fulfillmentAuthorizations: FulfillmentAuthorization[];
}

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_FILE = path.join(DATA_DIR, 'aquabloom_db.json');

class DatabaseService {
  private schema: DatabaseSchema = {
    users: [],
    sessions: [],
    passwords: {},
    events: [],
    profiles: {},
    products: [],
    productVersions: [],
    campaigns: [],
    campaignVersions: [],
    notifications: [],
    proposals: [],
    proposalVersions: [],
    proposalEvents: [],
    agreements: [],
    agreementVersions: [],
    agreementSnapshots: [],
    agreementInternalRecords: [],
    orderReadinessRecords: [],
    dataHandoffRecords: [],
    supplierOffers: [],
    supplierAssignments: [],
    logisticsOffers: [],
    logisticsAssignments: [],
    finalPricingResults: [],
    orders: [],
    orderPricingSnapshots: [],
    orderPaymentReadinessRecords: [],
    payments: [],
    paymentAttempts: [],
    webhookEventRecords: [],
    paymentReconciliationRecords: [],
    financialLedgerEntries: [],
    venueCompensationRecords: [],
    fulfillmentAuthorizations: [],
  };

  constructor() {
    this.init();
    eventDispatcher.subscribe('AUDIT_EVENTS', (evt) => {
      this.recordEvent(evt);
    });
    eventDispatcher.subscribe('BUSINESS_TIMELINE', (evt) => {
      this.recordEvent(evt);
    });
  }

  private init(): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        this.schema = JSON.parse(raw);
        if (!this.schema.profiles) {
          this.schema.profiles = {};
        }
        if (!this.schema.products) {
          this.schema.products = [];
        }
        if (!this.schema.productVersions) {
          this.schema.productVersions = [];
        }
        if (!this.schema.campaigns) {
          this.schema.campaigns = [];
        }
        if (!this.schema.campaignVersions) {
          this.schema.campaignVersions = [];
        }
        if (!this.schema.notifications) {
          this.schema.notifications = [];
        }
        if (!this.schema.proposals) {
          this.schema.proposals = [];
        }
        if (!this.schema.proposalVersions) {
          this.schema.proposalVersions = [];
        }
        if (!this.schema.proposalEvents) {
          this.schema.proposalEvents = [];
        }
        if (!this.schema.agreements) {
          this.schema.agreements = [];
        }
        if (!this.schema.agreementVersions) {
          this.schema.agreementVersions = [];
        }
        if (!this.schema.agreementSnapshots) {
          this.schema.agreementSnapshots = [];
        }
        if (!this.schema.agreementInternalRecords) {
          this.schema.agreementInternalRecords = [];
        }
        if (!this.schema.orderReadinessRecords) {
          this.schema.orderReadinessRecords = [];
        }
        if (!this.schema.dataHandoffRecords) {
          this.schema.dataHandoffRecords = [];
        }
        if (!this.schema.supplierOffers) {
          this.schema.supplierOffers = [];
        }
        if (!this.schema.supplierAssignments) {
          this.schema.supplierAssignments = [];
        }
        if (!this.schema.logisticsOffers) {
          this.schema.logisticsOffers = [];
        }
        if (!this.schema.logisticsAssignments) {
          this.schema.logisticsAssignments = [];
        }
        if (!this.schema.finalPricingResults) {
          this.schema.finalPricingResults = [];
        }
        if (!this.schema.orders) {
          this.schema.orders = [];
        }
        if (!this.schema.orderPricingSnapshots) {
          this.schema.orderPricingSnapshots = [];
        }
        if (!this.schema.orderPaymentReadinessRecords) {
          this.schema.orderPaymentReadinessRecords = [];
        }
        if (!this.schema.payments) {
          this.schema.payments = [];
        }
        if (!this.schema.paymentAttempts) {
          this.schema.paymentAttempts = [];
        }
        if (!this.schema.webhookEventRecords) {
          this.schema.webhookEventRecords = [];
        }
        if (!this.schema.paymentReconciliationRecords) {
          this.schema.paymentReconciliationRecords = [];
        }
        if (!this.schema.financialLedgerEntries) {
          this.schema.financialLedgerEntries = [];
        }
        if (!this.schema.venueCompensationRecords) {
          this.schema.venueCompensationRecords = [];
        }
        if (!this.schema.fulfillmentAuthorizations) {
          this.schema.fulfillmentAuthorizations = [];
        }
        // Ensure all seeded accounts exist and have profiles
        this.backfillMissingData();
        this.save();
      } else {
        this.seedInitialUsers();
        this.save();
      }
    } catch (err) {
      console.warn('[DatabaseService] Could not load persisted file, initializing fresh store:', err);
      this.seedInitialUsers();
      this.save();
    }
  }

  private save(): void {
    try {
      const tempFile = `${DB_FILE}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 6)}`;
      fs.writeFileSync(tempFile, JSON.stringify(this.schema), 'utf-8');
      fs.renameSync(tempFile, DB_FILE);
    } catch (err) {
      console.error('[DatabaseService] Failed to persist database to file:', err);
    }
  }

  private backfillMissingData(): void {
    // Backfill any missing publicAccountIds or profiles for existing users
    for (const user of this.schema.users) {
      if (!user.publicAccountId) {
        user.publicAccountId = generateBusinessId('AB-ACC');
      }
      if (!user.status) {
        user.status = (user.role === 'SUPPLIER' || user.role === 'LOGISTICS_PARTNER')
          ? 'PENDING_REVIEW'
          : 'ACTIVE';
      }
      if (user.role !== 'ADMIN' && !this.schema.profiles[user.id]) {
        this.schema.profiles[user.id] = this.createDefaultProfileForUser(user);
      }
    }

    this.seedInitialProposalsIfEmpty();
  }

  private seedInitialProposalsIfEmpty(): void {
    if (this.schema.proposals && this.schema.proposals.length > 0) {
      return;
    }

    const advertiser = this.schema.users.find(
      (u) => u.role === 'ADVERTISER' && u.email === 'advertiser@aquabloom.example'
    );
    const venue = this.schema.users.find(
      (u) => u.role === 'VENUE' && u.email === 'venue.techhub@aquabloom.example'
    );

    if (!advertiser || !venue) return;

    const campaign = this.schema.campaigns.find((c) => c.advertiserId === advertiser.id);
    if (!campaign) return;

    const advProfile = this.schema.profiles[advertiser.id] as AdvertiserProfile | undefined;
    const venProfile = this.schema.profiles[venue.id] as VenueProfile | undefined;

    const now = new Date().toISOString();
    const proposalId = 'prp_aura_techhub_01';
    const publicProposalId = 'AB-PRP-AURA8821';
    const versionId = 'prv_aura_techhub_v1';
    const publicVersionId = 'AB-PRV-AURA8821-01';

    const terms: ProposalTerms = {
      campaignQuantity: 10000,
      campaignDuration: campaign.timing.duration,
      preferredStartPeriod: campaign.timing.preferredStartPeriod,
      distributionRequirements: campaign.distributionRequirements,
      placementRequirements: campaign.venueRequirements?.placementRequirements || [
        'Main Reception Display',
        'VIP Tech Lounge Staging',
      ],
      productRequirements: {
        preferredVolumeMl: campaign.bottleRequirements?.preferredVolumeMl || 500,
        volumeLabel: campaign.bottleRequirements?.volumeLabel || '500 ml Standard',
        preferredMaterial: campaign.bottleRequirements?.preferredMaterial || '100% rPET',
        labelType: campaign.bottleRequirements?.labelType || 'Full-Wrap Shrink Sleeve',
        capType: campaign.bottleRequirements?.capType || 'Screw Cap (Tamper-Evident)',
        notes: 'Premium botanical formulation aesthetic',
      },
      collaborationRequirement: campaign.collaborationRequirement || {
        status: 'NOT_REQUIRED',
        preferredTerms: '',
        notes: '',
      },
      venueCompensationTerms: {
        proposedPercentage: 10,
        termsDescription:
          '10% venue partner distribution compensation based on eligible supplier advertising cost (capped at 12.5%). Final settlement in Step 7.',
        notes: 'Subject to timely proof of placement confirmation.',
      },
      customConditions:
        'Bottles to be presented in chilled display racks at central entrance and second-floor lounge.',
    };

    const proposal: Proposal = {
      id: proposalId,
      publicProposalId,
      campaignId: campaign.id,
      publicCampaignId: campaign.publicCampaignId,
      campaignName: campaign.name,
      campaignCategory: campaign.category,
      advertiserId: advertiser.id,
      advertiserPublicId: advertiser.publicAccountId,
      advertiserBrandName: advProfile?.brandName || advertiser.organizationName,
      venueId: venue.id,
      venuePublicId: venue.publicAccountId,
      venueName: venProfile?.venueName || venue.organizationName,
      currentVersionNumber: 1,
      status: 'SENT',
      terms,
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      advertiserConfirmedAt: now,
      advertiserConfirmedBy: advertiser.id,
      createdAt: now,
      updatedAt: now,
      createdBy: advertiser.id,
      updatedBy: advertiser.id,
    };

    const version: ProposalVersion = {
      id: versionId,
      publicVersionId,
      proposalId,
      versionNumber: 1,
      actor: {
        userId: advertiser.id,
        role: 'ADVERTISER',
        organizationName: advertiser.organizationName,
      },
      changeSummary: 'Initial proposal submitted from marketplace match.',
      changedFields: ['INITIAL_SUBMISSION'],
      terms,
      createdAt: now,
      createdBy: advertiser.id,
    };

    const event1: ProposalNegotiationEvent = {
      id: 'pne_' + Math.random().toString(36).substring(2, 9),
      proposalId,
      versionNumber: 1,
      action: 'CREATED',
      actor: {
        userId: advertiser.id,
        role: 'ADVERTISER',
        organizationName: advertiser.organizationName,
      },
      timestamp: now,
      changeSummary: 'Proposal draft initialized.',
    };

    const event2: ProposalNegotiationEvent = {
      id: 'pne_' + Math.random().toString(36).substring(2, 9),
      proposalId,
      versionNumber: 1,
      action: 'SENT',
      actor: {
        userId: advertiser.id,
        role: 'ADVERTISER',
        organizationName: advertiser.organizationName,
      },
      timestamp: now,
      changeSummary: 'Proposal sent to TechHub Corporate Campus.',
    };

    this.schema.proposals.push(proposal);
    this.schema.proposalVersions.push(version);
    this.schema.proposalEvents.push(event1, event2);

    // Seed a mutually confirmed proposal ready for immediate Campaign Agreement testing
    const proposal2Id = 'prp_aura_techhub_02';
    const publicProposal2Id = 'AB-PRP-AURA9942';
    const version2Id = 'prv_aura_techhub_ready_v1';
    const publicVersion2Id = 'AB-PRV-AURA9942-01';

    const terms2: ProposalTerms = {
      ...terms,
      campaignQuantity: 8000,
    };

    const proposal2: Proposal = {
      id: proposal2Id,
      publicProposalId: publicProposal2Id,
      campaignId: campaign.id,
      publicCampaignId: campaign.publicCampaignId,
      campaignName: campaign.name,
      campaignCategory: campaign.category,
      advertiserId: advertiser.id,
      advertiserPublicId: advertiser.publicAccountId,
      advertiserBrandName: advProfile?.brandName || advertiser.organizationName,
      venueId: venue.id,
      venuePublicId: venue.publicAccountId,
      venueName: venProfile?.venueName || venue.organizationName,
      currentVersionNumber: 1,
      status: 'READY_FOR_AGREEMENT',
      terms: terms2,
      expiresAt: new Date(Date.now() + 14 * 86400000).toISOString(),
      advertiserConfirmedAt: now,
      advertiserConfirmedBy: advertiser.id,
      venueConfirmedAt: now,
      venueConfirmedBy: venue.id,
      createdAt: now,
      updatedAt: now,
      createdBy: advertiser.id,
      updatedBy: venue.id,
    };

    const version2: ProposalVersion = {
      id: version2Id,
      publicVersionId: publicVersion2Id,
      proposalId: proposal2Id,
      versionNumber: 1,
      actor: {
        userId: advertiser.id,
        role: 'ADVERTISER',
        organizationName: advertiser.organizationName,
      },
      changeSummary: 'Mutually confirmed proposal terms ready for commercial lock.',
      changedFields: ['INITIAL_SUBMISSION'],
      terms: terms2,
      createdAt: now,
      createdBy: advertiser.id,
    };

    const event3: ProposalNegotiationEvent = {
      id: 'pne_' + Math.random().toString(36).substring(2, 9),
      proposalId: proposal2Id,
      versionNumber: 1,
      action: 'READY_FOR_AGREEMENT',
      actor: {
        userId: venue.id,
        role: 'VENUE',
        organizationName: venue.organizationName,
      },
      timestamp: now,
      changeSummary: 'Both parties confirmed terms. Proposal is READY FOR CAMPAIGN AGREEMENT.',
    };

    this.schema.proposals.push(proposal2);
    this.schema.proposalVersions.push(version2);
    this.schema.proposalEvents.push(event3);
  }

  /**
   * Seed standard test participants for all 4 public roles and 1 internal admin.
   * Enables immediate verification and testing for all roles.
   */
  private seedInitialUsers(): void {
    this.schema.users = [];
    this.schema.passwords = {};
    this.schema.profiles = {};

    const defaultAccounts: Array<{
      email: string;
      role: UserRole;
      organizationName: string;
      contactName: string;
      pass: string;
      status: AccountStatus;
      publicAccountId: string;
    }> = [
      {
        email: 'advertiser@aquabloom.example',
        role: 'ADVERTISER',
        organizationName: 'Aura Luxury Beverage Group',
        contactName: 'Elena Rostova',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-AURA-2026',
      },
      {
        email: 'venue@aquabloom.example',
        role: 'VENUE',
        organizationName: 'Grand Millennium Convention Center',
        contactName: 'Marcus Vance',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-MILL-2026',
      },
      {
        email: 'venue.techpark@aquabloom.example',
        role: 'VENUE',
        organizationName: 'Prestige Tech Park Towers',
        contactName: 'Arun Kumar',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-PREST-2026',
      },
      {
        email: 'venue.stregis@aquabloom.example',
        role: 'VENUE',
        organizationName: 'The St. Regis Grand Suites',
        contactName: 'Victoria Sterling',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-REGIS-2026',
      },
      {
        email: 'venue.arena@aquabloom.example',
        role: 'VENUE',
        organizationName: 'Apex Arena & Sports Complex',
        contactName: 'Derrick Miller',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-ARNA-2026',
      },
      {
        email: 'venue.cowork@aquabloom.example',
        role: 'VENUE',
        organizationName: 'Zenith Innovation & Coworking Hub',
        contactName: 'Chloe Bennett',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-ZNTH-2026',
      },
      {
        email: 'venue.incomplete@aquabloom.example',
        role: 'VENUE',
        organizationName: 'Metropolitan Art Gallery',
        contactName: 'Julian Gray',
        pass: 'AquaBloom2026!',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-METR-2026',
      },
      {
        email: 'supplier@aquabloom.example',
        role: 'SUPPLIER',
        organizationName: 'Alpine Pure Bottling Co.',
        contactName: 'Sarah Jenkins',
        pass: 'AquaBloom2026!',
        status: 'PENDING_REVIEW',
        publicAccountId: 'AB-ACC-ALPN-2026',
      },
      {
        email: 'logistics@aquabloom.example',
        role: 'LOGISTICS_PARTNER',
        organizationName: 'Apex Cold-Chain Fleet',
        contactName: 'David Chen',
        pass: 'AquaBloom2026!',
        status: 'PENDING_REVIEW',
        publicAccountId: 'AB-ACC-APEX-2026',
      },
      {
        email: 'internal.admin@aquabloom.corp',
        role: 'ADMIN',
        organizationName: 'AquaBloom Global Infrastructure',
        contactName: 'System Administrator',
        pass: 'AquaBloomAdmin2026#',
        status: 'ACTIVE',
        publicAccountId: 'AB-ACC-ADMN-2026',
      },
    ];

    for (const acc of defaultAccounts) {
      const userId = generateInternalId('usr');
      const now = new Date().toISOString();
      const user: User = {
        id: userId,
        publicAccountId: acc.publicAccountId,
        email: acc.email.toLowerCase(),
        role: acc.role,
        organizationName: acc.organizationName,
        contactName: acc.contactName,
        createdAt: now,
        updatedAt: now,
        status: acc.status,
      };

      this.schema.users.push(user);
      this.schema.passwords[userId] = acc.pass;

      // Seed detailed operational profiles for public roles
      if (acc.role === 'ADVERTISER') {
        const advProfile: AdvertiserProfile = {
          role: 'ADVERTISER',
          accountId: userId,
          brandName: acc.organizationName,
          industry: 'Luxury Goods & Botanical Elixirs',
          description: 'Producer of high-end organic botanical infusions and premium mineral beverages targeting discerning hospitality clientele.',
          primaryContact: {
            name: acc.contactName,
            email: acc.email,
            phone: '+1 (415) 890-2300',
            title: 'VP Global Brand Partnerships',
          },
          location: {
            city: 'San Francisco',
            stateRegion: 'California',
            country: 'United States',
          },
          websiteUrl: 'https://auraluxury.example',
          advertisingCategory: 'Beverage & Hospitality',
          targetAudience: {
            demographics: 'Affluent professionals, business travelers, luxury hospitality guests aged 28-55',
            targetVenueTypes: ['Luxury Hotels', 'Executive Lounges', 'Private Aviation FBOs'],
            preferredReach: '50,000+ monthly targeted engagements',
          },
          campaignPreferences: {
            sustainabilityFocus: true,
            preferredLeadTimeWeeks: 4,
          },
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
          changeImpact: 'NO_IMPACT',
          completion: {
            isComplete: true,
            percentage: 100,
            missingRequiredFields: [],
          },
        };
        this.schema.profiles[userId] = advProfile;
      } else if (acc.role === 'VENUE') {
        let venProfile: VenueProfile;

        if (acc.email === 'venue.techpark@aquabloom.example') {
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: 'Corporate Technology Campus',
            description: 'Premier high-tech business campus housing 40 multinational engineering headquarters, innovation labs, and executive cafeteria nodes.',
            location: {
              address: 'Outer Ring Road, Bellandur',
              city: 'Bengaluru',
              stateRegion: 'Karnataka',
              postalCode: '560103',
              country: 'India',
            },
            audienceCategory: 'Software Engineers, Tech Founders, Corporate Executives & Venture Investors',
            footfall: {
              monthlyVisitors: 65000,
              peakTrafficTimes: 'Monday - Friday 09:00 - 19:00',
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 28000,
              consumptionRateNotes: 'Continuous high baseline across tech office towers',
            },
            capacity: {
              maxBottleHoldingCapacity: 50000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 50000,
            },
            campaignAvailability: 'YEAR_ROUND',
            campaignPreferences: {
              acceptedCategories: ['Technology', 'Fintech', 'Luxury Goods & Botanical Elixirs', 'Clean Energy', 'Travel'],
              forbiddenCategories: ['Gambling', 'Tobacco'],
            },
            placementPossibilities: ['Tech Tower Main Atrium', 'Campus Cafeteria Hub', 'Innovation Center Lobby', 'Executive Briefing Center'],
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+91 80 4122 9000',
              dockNotes: 'Gate 3 Service Bay with freight elevator access',
            },
            visibilityState: 'PUBLIC_ELIGIBLE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: true,
              percentage: 100,
              missingRequiredFields: [],
            },
          };
        } else if (acc.email === 'venue.stregis@aquabloom.example') {
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: 'Luxury Hotel & Lounge',
            description: 'Five-star heritage hospitality icon in Midtown Manhattan featuring luxury presidential suites, private member lounges, and high-net-worth traveler footfall.',
            location: {
              address: 'Two East 55th Street',
              city: 'New York',
              stateRegion: 'New York',
              postalCode: '10022',
              country: 'United States',
            },
            audienceCategory: 'Affluent Business Travelers, Luxury Hospitality Guests & Executives',
            footfall: {
              monthlyVisitors: 22000,
              peakTrafficTimes: 'Daily 07:00 - 23:00',
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 12000,
              consumptionRateNotes: 'Consistent high consumption in suites and rooftop lounge',
            },
            capacity: {
              maxBottleHoldingCapacity: 15000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 15000,
            },
            campaignAvailability: 'YEAR_ROUND',
            campaignPreferences: {
              acceptedCategories: ['Luxury Goods & Botanical Elixirs', 'Travel', 'Fine Dining', 'Hospitality', 'Fintech'],
              forbiddenCategories: ['Fast Fashion', 'Fast Food', 'Tobacco'],
            },
            placementPossibilities: ['Front Desk & Concierge Welcome', 'Executive Member Lounge', 'Presidential Suites', 'Rooftop Terrace'],
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+1 (212) 753-4500',
              dockNotes: '55th St Service Entry, delivery before 11:00 AM',
            },
            visibilityState: 'PUBLIC_ELIGIBLE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: true,
              percentage: 100,
              missingRequiredFields: [],
            },
          };
        } else if (acc.email === 'venue.arena@aquabloom.example') {
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: 'Sports & Entertainment Arena',
            description: 'Multi-purpose sports arena accommodating major league sporting events, international music tours, and large-scale consumer gatherings.',
            location: {
              address: '1111 S Figueroa St',
              city: 'Los Angeles',
              stateRegion: 'California',
              postalCode: '90015',
              country: 'United States',
            },
            audienceCategory: 'Sports Enthusiasts, Entertainment Goers & General Public',
            footfall: {
              monthlyVisitors: 120000,
              peakTrafficTimes: 'Event Evenings & Weekends',
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 45000,
              consumptionRateNotes: 'High volume surge during game days and concerts',
            },
            capacity: {
              maxBottleHoldingCapacity: 80000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 80000,
            },
            campaignAvailability: 'YEAR_ROUND',
            campaignPreferences: {
              acceptedCategories: ['Sports', 'Beverage & Hospitality', 'Consumer Electronics', 'Entertainment', 'Luxury Goods & Botanical Elixirs'],
              forbiddenCategories: [],
            },
            placementPossibilities: ['VIP Concourse Display', 'Box Suite Receptions', 'Press Room Lounge'],
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+1 (213) 742-7100',
              dockNotes: 'Loading Bay 1 with forklift staging area',
            },
            visibilityState: 'PUBLIC_ELIGIBLE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: true,
              percentage: 100,
              missingRequiredFields: [],
            },
          };
        } else if (acc.email === 'venue.cowork@aquabloom.example') {
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: 'Coworking & Startup Incubator',
            description: 'Modern collaborative coworking sanctuary and venture incubator catering to early-stage technology founders, design agencies, and creative freelancers.',
            location: {
              address: '500 E 4th Street',
              city: 'Austin',
              stateRegion: 'Texas',
              postalCode: '78701',
              country: 'United States',
            },
            audienceCategory: 'Tech Founders, Creative Freelancers, Venture Investors',
            footfall: {
              monthlyVisitors: 8500,
              peakTrafficTimes: 'Monday - Friday 08:30 - 18:00',
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 4000,
              consumptionRateNotes: 'Steady daily weekday consumption',
            },
            capacity: {
              maxBottleHoldingCapacity: 6000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 6000,
            },
            campaignAvailability: 'YEAR_ROUND',
            campaignPreferences: {
              acceptedCategories: ['Technology', 'Software', 'Beverage & Hospitality', 'Lifestyle', 'Luxury Goods & Botanical Elixirs'],
              forbiddenCategories: ['Tobacco', 'Gambling'],
            },
            placementPossibilities: ['Central Espresso Bar Staging', 'Community Desks', 'Main Event Hall'],
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+1 (512) 499-8000',
              dockNotes: 'Alley Loading Zone with double door entry',
            },
            visibilityState: 'PUBLIC_ELIGIBLE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: true,
              percentage: 100,
              missingRequiredFields: [],
            },
          };
        } else if (acc.email === 'venue.incomplete@aquabloom.example') {
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: '',
            description: 'Art gallery in River North art district undergoing registration.',
            location: {
              city: '',
              country: 'United States',
            },
            audienceCategory: 'Art Enthusiasts',
            footfall: {
              monthlyVisitors: 1200,
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 800,
            },
            capacity: {
              maxBottleHoldingCapacity: 2000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 2000,
            },
            campaignAvailability: 'YEAR_ROUND',
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+1 (312) 555-9988',
            },
            visibilityState: 'PRIVATE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: false,
              percentage: 42,
              missingRequiredFields: ['Venue Type', 'City', 'Country', 'Audience Category'],
            },
          };
        } else {
          // Default: Grand Millennium Convention Center
          venProfile = {
            role: 'VENUE',
            accountId: userId,
            venueName: acc.organizationName,
            venueType: 'Convention Center & Exhibition Hall',
            description: 'Premier downtown conference facility featuring 450,000 sq ft of exhibition space, 42 executive suites, and continuous high-density visitor traffic.',
            location: {
              address: '700 Millennium Plaza',
              city: 'Chicago',
              stateRegion: 'Illinois',
              postalCode: '60601',
              country: 'United States',
            },
            audienceCategory: 'Corporate Executives, Technology Delegates & Industry Leaders',
            footfall: {
              monthlyVisitors: 85000,
              peakTrafficTimes: 'Tuesday - Thursday 08:00 - 18:00',
            },
            bottleConsumption: {
              estimatedMonthlyBottles: 24000,
              consumptionRateNotes: 'Highest during Q2 and Q4 industry summits',
            },
            capacity: {
              maxBottleHoldingCapacity: 35000,
              currentOngoingBottleCommitment: 0,
              availableBottleCapacity: 35000,
            },
            campaignAvailability: 'YEAR_ROUND',
            campaignPreferences: {
              acceptedCategories: ['Technology', 'Fintech', 'Luxury Automotive', 'Clean Energy', 'Travel', 'Luxury Goods & Botanical Elixirs'],
              forbiddenCategories: ['Gambling', 'Tobacco', 'Fast Fashion'],
            },
            placementPossibilities: ['Registration Pavilions', 'Keynote Main Hall', 'VIP Speaker Lounges', 'Executive Boardrooms'],
            operationalContact: {
              coordinatorName: acc.contactName,
              email: acc.email,
              phone: '+1 (312) 555-0194',
              dockNotes: 'Loading Bay C with hydraulic liftgate, delivery window 06:00 - 10:00',
            },
            visibilityState: 'PUBLIC_ELIGIBLE',
            version: 1,
            createdAt: now,
            updatedAt: now,
            updatedBy: userId,
            changeImpact: 'NO_IMPACT',
            completion: {
              isComplete: true,
              percentage: 100,
              missingRequiredFields: [],
            },
          };
        }
        this.schema.profiles[userId] = venProfile;
      } else if (acc.role === 'SUPPLIER') {
        const supProfile: SupplierProfile = {
          role: 'SUPPLIER',
          accountId: userId,
          supplierBusinessName: acc.organizationName,
          description: 'Certified state-of-the-art co-packer and natural spring water bottler with automated UV wrap sleeve and embossed aluminum capabilities.',
          primaryContact: {
            name: acc.contactName,
            email: acc.email,
            phone: '+1 (303) 440-1288',
            role: 'Head of Commercial Co-Packing',
          },
          operatingLocation: {
            facilityCity: 'Boulder',
            stateProvince: 'Colorado',
            country: 'United States',
          },
          capabilities: {
            waterTypes: ['Natural Spring Water', 'Artesian Sparkling Water', 'Electrolyte Infused Water'],
            bottleMaterials: ['Recycled Aluminum Can', 'rPET Recycled Plastic', 'Flint Glass Bottle'],
            bottleSizes: ['330ml Sleek Can', '500ml Standard', '750ml Premium Glass'],
            bottleShapes: ['Sleek Slimline', 'Classic Cylinder', 'Ergonomic Grip'],
            printingFinishes: ['Direct UV High-Definition Print', 'Matte Textured Shrink Sleeve', 'Foil Embossed Label'],
          },
          productionCapacity: {
            bottlesPerMonth: 250000,
            minimumRunSize: 5000,
          },
          leadTimeInfo: {
            standardTurnaroundDays: 14,
            rushOrderAvailable: true,
          },
          operationalStatus: 'OPERATING',
          approvalStatus: 'PENDING_REVIEW',
          approvalNotes: 'Initial production verification submitted. Water source quality certifications attached.',
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
          changeImpact: 'NO_IMPACT',
          completion: {
            isComplete: true,
            percentage: 100,
            missingRequiredFields: [],
          },
        };
        this.schema.profiles[userId] = supProfile;
      } else if (acc.role === 'LOGISTICS_PARTNER') {
        const logProfile: LogisticsProfile = {
          role: 'LOGISTICS_PARTNER',
          accountId: userId,
          businessName: acc.organizationName,
          description: 'Regional cold-chain and dry freight carrier specializing in urban dock deliveries, venue pallet breakdown, and scheduled event logistics.',
          primaryContact: {
            name: acc.contactName,
            email: acc.email,
            phone: '+1 (206) 555-8821',
            dispatchTitle: 'Director of Fleet Operations',
          },
          operatingLocation: {
            hubCity: 'Seattle',
            stateRegion: 'Washington',
            country: 'United States',
          },
          serviceAreas: ['Pacific Northwest (WA, OR, ID)', 'Northern California Corridor', 'Salt Lake City Metro'],
          fleetCapabilities: {
            vehicleTypes: ['Refrigerated 26ft Box Truck', '53ft Dry Van Freightliner', 'Urban Sprinter Delivery Van'],
            temperatureControlled: true,
          },
          shipmentCapacity: {
            palletsPerWeek: 120,
            maxPayloadWeightKg: 18000,
          },
          pickupCapability: 'Direct bottling dock pickup with pallet jack and electric forklift staging',
          deliveryCapability: 'White-glove venue dock unloading, liftgate service, security check-in compliance',
          operationalAvailability: 'Monday - Friday (05:00 - 20:00), Weekend On-Call for Special Events',
          approvalStatus: 'PENDING_REVIEW',
          approvalNotes: 'DOT compliance number and commercial carrier insurance submitted for review.',
          version: 1,
          createdAt: now,
          updatedAt: now,
          updatedBy: userId,
          changeImpact: 'NO_IMPACT',
          completion: {
            isComplete: true,
            percentage: 100,
            missingRequiredFields: [],
          },
        };
        this.schema.profiles[userId] = logProfile;
      }
    }

    // Seed initial campaign in READY_FOR_MATCHING status for Aura Luxury Beverage Group
    const defaultAdvertiser = this.schema.users.find((u) => u.email === 'advertiser@aquabloom.example');
    if (defaultAdvertiser && this.schema.campaigns.length === 0) {
      try {
        this.createCampaign(
          defaultAdvertiser.id,
          {
            name: 'Aura Botanical Elixir Executive Launch',
            category: 'Luxury Goods & Botanical Elixirs',
            description: 'Targeted brand awareness campaign distributing custom cold-pressed botanical water across premier convention centers, luxury hospitality lounges, and tech enterprise headquarters.',
            objective: 'Brand Awareness & Executive Sampling',
            status: 'READY_FOR_MATCHING',
            bottleRequirements: {
              requiredQuantity: 20000,
              preferredVolumeMl: 500,
              volumeLabel: '500 ml Slim Aluminum',
              preferredMaterial: 'Recycled Aluminum Can',
              preferredShape: 'Sleek Slimline',
              bottleType: 'Aluminum Can (330ml-500ml)',
              capType: 'Stay-on Tab (Aluminum)',
              bottleFinish: 'Matte Tactile Finish',
              labelType: 'Direct UV High-Definition Print',
              printingCapability: 'Multi-Color UV Gradient with Embossing',
              packagingConfiguration: '24 cans per corrugated tray',
            },
            timing: {
              duration: {
                value: 4,
                unit: 'WEEKS',
              },
              preferredStartPeriod: {
                label: 'Immediate (Next 30 Days)',
                windowStart: new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0],
                windowEnd: new Date(Date.now() + 37 * 86400000).toISOString().split('T')[0],
                notes: 'Prioritized for executive conference season',
              },
            },
            targetAudience: {
              demographics: 'Affluent professionals, business travelers, corporate executives, and technology delegates aged 28-55',
              characteristics: ['Corporate Executives', 'Tech Founders', 'High Net Worth', 'Luxury Hospitality Guests'],
              interests: ['Sustainability', 'Wellness & Longevity', 'Innovation & Tech', 'Fine Dining & Hospitality'],
            },
            venueRequirements: {
              preferredVenueTypes: ['Convention Center & Exhibition Hall', 'Corporate Technology Campus', 'Luxury Hotel & Lounge'],
              preferredLocations: [
                { city: 'Chicago', stateRegion: 'Illinois', country: 'United States' },
                { city: 'New York', stateRegion: 'New York', country: 'United States' },
                { city: 'Bengaluru', stateRegion: 'Karnataka', country: 'India' },
              ],
              placementRequirements: ['Registration Pavilions', 'VIP Speaker Lounges', 'Executive Boardrooms', 'Central Concierge Desk'],
            },
            distributionRequirements: {
              placementDetails: 'Executive concierge welcome desks, VIP keynote breakout suites, and member lounges',
              estimatedDistributionPace: '5,000 bottles weekly across campaign duration',
              refrigerationRequired: true,
              handlingNotes: 'Ambient delivery acceptable; venue chilling recommended 2 hours prior to daily distribution',
            },
            collaborationRequirement: {
              status: 'OPEN_TO_COLLABORATION',
              preferredTerms: 'Venue staff to stage bottles in branded chiller kiosks',
            },
            eligibilityRequirements: {
              venueCriteria: ['Dedicated front desk or lounge concierge', 'Air-conditioned staging area'],
              minimumFootfall: 15000,
              excludedVenueTypes: ['Nightclub', 'Fast Food Restaurant'],
            },
            publishedBudget: {
              disclosed: true,
              minAmount: 1500000,
              maxAmount: 2200000,
              currency: 'INR',
            },
          },
          defaultAdvertiser.id
        );
      } catch (err) {
        console.error('Failed to seed initial campaign:', err);
      }
    }
  }

  public createDefaultProfileForUser(user: User): UserProfile {
    const now = new Date().toISOString();
    if (user.role === 'ADVERTISER') {
      const p: AdvertiserProfile = {
        role: 'ADVERTISER',
        accountId: user.id,
        brandName: user.organizationName,
        industry: '',
        description: '',
        primaryContact: {
          name: user.contactName,
          email: user.email,
          phone: user.phone,
        },
        location: {
          city: '',
          country: '',
        },
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        changeImpact: 'NO_IMPACT',
        completion: {
          isComplete: false,
          percentage: 42,
          missingRequiredFields: ['Industry / Business Type', 'Business Description', 'Headquarters City', 'Headquarters Country'],
        },
      };
      return p;
    } else if (user.role === 'VENUE') {
      const p: VenueProfile = {
        role: 'VENUE',
        accountId: user.id,
        venueName: user.organizationName,
        venueType: '',
        description: '',
        location: {
          city: '',
          country: '',
        },
        audienceCategory: '',
        footfall: {
          monthlyVisitors: 0,
        },
        bottleConsumption: {
          estimatedMonthlyBottles: 0,
        },
        capacity: {
          maxBottleHoldingCapacity: 0,
          currentOngoingBottleCommitment: 0,
          availableBottleCapacity: 0,
        },
        campaignAvailability: 'YEAR_ROUND',
        operationalContact: {
          coordinatorName: user.contactName,
          email: user.email,
          phone: user.phone,
        },
        visibilityState: 'PRIVATE',
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        changeImpact: 'NO_IMPACT',
        completion: {
          isComplete: false,
          percentage: 33,
          missingRequiredFields: [
            'Venue Type',
            'Venue Description',
            'City',
            'Country',
            'Audience Category',
          ],
        },
      };
      return p;
    } else if (user.role === 'SUPPLIER') {
      const p: SupplierProfile = {
        role: 'SUPPLIER',
        accountId: user.id,
        supplierBusinessName: user.organizationName,
        description: '',
        primaryContact: {
          name: user.contactName,
          email: user.email,
          phone: user.phone,
        },
        operatingLocation: {
          facilityCity: '',
          country: '',
        },
        capabilities: {
          waterTypes: [],
          bottleMaterials: [],
          bottleSizes: [],
          bottleShapes: [],
          printingFinishes: [],
        },
        productionCapacity: {
          bottlesPerMonth: 0,
          minimumRunSize: 0,
        },
        leadTimeInfo: {
          standardTurnaroundDays: 0,
        },
        operationalStatus: 'OPERATING',
        approvalStatus: 'PENDING_REVIEW',
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        changeImpact: 'NO_IMPACT',
        completion: {
          isComplete: false,
          percentage: 27,
          missingRequiredFields: [
            'Facility & Production Overview',
            'Bottling Facility City',
            'Operating Country',
            'Water Sourcing Capabilities',
            'Bottle Material Capabilities',
            'Bottle Size Formats',
          ],
        },
      };
      return p;
    } else {
      const p: LogisticsProfile = {
        role: 'LOGISTICS_PARTNER',
        accountId: user.id,
        businessName: user.organizationName,
        description: '',
        primaryContact: {
          name: user.contactName,
          email: user.email,
          phone: user.phone,
        },
        operatingLocation: {
          hubCity: '',
          country: '',
        },
        serviceAreas: [],
        fleetCapabilities: {
          vehicleTypes: [],
          temperatureControlled: false,
        },
        shipmentCapacity: {
          palletsPerWeek: 0,
        },
        pickupCapability: '',
        deliveryCapability: '',
        operationalAvailability: 'Monday - Friday (08:00 - 18:00)',
        approvalStatus: 'PENDING_REVIEW',
        version: 1,
        createdAt: now,
        updatedAt: now,
        updatedBy: user.id,
        changeImpact: 'NO_IMPACT',
        completion: {
          isComplete: false,
          percentage: 25,
          missingRequiredFields: [
            'Fleet & Dispatch Overview',
            'Primary Terminal / Depot City',
            'Operating Country',
            'Coverage Regions / Service Areas',
            'Vehicle Fleet Types',
            'Pickup & Loading Capability',
            'Venue Delivery & Unloading Capability',
          ],
        },
      };
      return p;
    }
  }

  // --- User Repository ---
  public findUserByEmail(email: string): User | undefined {
    return this.schema.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
  }

  public findUserById(id: string): User | undefined {
    return this.schema.users.find((u) => u.id === id);
  }

  public getUserById(id: string): User | undefined {
    return this.findUserById(id);
  }

  public getAllUsers(): User[] {
    return this.schema.users.map((u) => JSON.parse(JSON.stringify(u)));
  }

  public getUsers(): User[] {
    return this.getAllUsers();
  }

  public createUser(userData: {
    email: string;
    role: UserRole;
    organizationName: string;
    contactName: string;
    phone?: string;
    password?: string;
  }): User {
    const id = generateInternalId('usr');
    const publicAccountId = generateBusinessId('AB-ACC');
    const now = new Date().toISOString();

    // Supplier & Logistics require operational review; Advertiser & Venue are active immediately
    const initialStatus: AccountStatus =
      userData.role === 'SUPPLIER' || userData.role === 'LOGISTICS_PARTNER'
        ? 'PENDING_REVIEW'
        : 'ACTIVE';

    const newUser: User = {
      id,
      publicAccountId,
      email: userData.email.toLowerCase().trim(),
      role: userData.role,
      organizationName: userData.organizationName.trim(),
      contactName: userData.contactName.trim(),
      phone: userData.phone?.trim(),
      createdAt: now,
      updatedAt: now,
      status: initialStatus,
    };

    this.schema.users.push(newUser);
    if (userData.password) {
      this.schema.passwords[id] = userData.password;
    }

    // Initialize blank operational profile for public accounts
    if (userData.role !== 'ADMIN') {
      const profile = this.createDefaultProfileForUser(newUser);
      this.schema.profiles[id] = profile;
    }

    this.save();
    return newUser;
  }

  public saveUser(user: User): void {
    const idx = this.schema.users.findIndex((u) => u.id === user.id);
    if (idx >= 0) {
      this.schema.users[idx] = user;
    } else {
      this.schema.users.push(user);
    }
    this.save();
  }

  public verifyPassword(userId: string, passwordAttempt: string): boolean {
    const stored = this.schema.passwords[userId];
    if (!stored) return false;
    return stored === passwordAttempt;
  }

  // --- Profile Repository ---
  public getProfile(userId: string): UserProfile | undefined {
    return this.schema.profiles[userId];
  }

  public getProfileByUserId(userId: string): UserProfile | undefined {
    return this.getProfile(userId);
  }

  public saveProfile(
    userId: string,
    updates: Partial<UserProfile>,
    actorId: string
  ): UserProfile {
    const user = this.findUserById(userId);
    if (!user) {
      throw new Error(`User not found for ID ${userId}`);
    }

    let existing = this.schema.profiles[userId];
    if (!existing) {
      existing = this.createDefaultProfileForUser(user);
    }

    const now = new Date().toISOString();
    const newVersion = (existing.version || 1) + 1;

    // Merge updates safely, protecting role and accountId immutability
    const merged: any = {
      ...existing,
      ...updates,
      role: existing.role, // immutable
      accountId: userId, // immutable
      version: newVersion,
      updatedAt: now,
      updatedBy: actorId,
      changeImpact: 'FUTURE_TRANSACTIONS',
    };

    // Recalculate completion and visibility status based on role
    if (existing.role === 'ADVERTISER') {
      const completion = calculateAdvertiserCompletion(merged);
      merged.completion = completion;
      if (merged.brandName) {
        user.organizationName = merged.brandName;
      }
      if (merged.primaryContact?.name) {
        user.contactName = merged.primaryContact.name;
      }
    } else if (existing.role === 'VENUE') {
      const { completion, visibilityState } = calculateVenueCompletion(merged);
      merged.completion = completion;
      merged.visibilityState = visibilityState;
      if (merged.capacity) {
        const max = merged.capacity.maxBottleHoldingCapacity || 0;
        const commit = merged.capacity.currentOngoingBottleCommitment || 0;
        merged.capacity.availableBottleCapacity = Math.max(0, max - commit);
      }
      if (merged.venueName) {
        user.organizationName = merged.venueName;
      }
      if (merged.operationalContact?.coordinatorName) {
        user.contactName = merged.operationalContact.coordinatorName;
      }
    } else if (existing.role === 'SUPPLIER') {
      // Protect approval status from user self-modification
      merged.approvalStatus = (existing as SupplierProfile).approvalStatus;
      merged.approvalNotes = (existing as SupplierProfile).approvalNotes;
      const completion = calculateSupplierCompletion(merged);
      merged.completion = completion;
      if (merged.supplierBusinessName) {
        user.organizationName = merged.supplierBusinessName;
      }
      if (merged.primaryContact?.name) {
        user.contactName = merged.primaryContact.name;
      }
    } else if (existing.role === 'LOGISTICS_PARTNER') {
      // Protect approval status from user self-modification
      merged.approvalStatus = (existing as LogisticsProfile).approvalStatus;
      merged.approvalNotes = (existing as LogisticsProfile).approvalNotes;
      const completion = calculateLogisticsCompletion(merged);
      merged.completion = completion;
      if (merged.businessName) {
        user.organizationName = merged.businessName;
      }
      if (merged.primaryContact?.name) {
        user.contactName = merged.primaryContact.name;
      }
    }

    user.updatedAt = now;
    this.schema.profiles[userId] = merged;
    this.save();
    return merged;
  }

  /**
   * Admin Approval Workflow
   * Updates approval status for Supplier or Logistics Partner
   */
  public updateApprovalStatus(
    targetUserId: string,
    decision: ApprovalStatus,
    reviewerId: string,
    notes?: string
  ): { user: User; profile: UserProfile } {
    const user = this.findUserById(targetUserId);
    if (!user) {
      throw new Error(`Target account ${targetUserId} not found.`);
    }

    const profile = this.schema.profiles[targetUserId];
    if (!profile) {
      throw new Error(`Target profile for ${targetUserId} not found.`);
    }

    const now = new Date().toISOString();

    if (profile.role === 'SUPPLIER' || profile.role === 'LOGISTICS_PARTNER') {
      profile.approvalStatus = decision;
      profile.approvalNotes = notes?.trim() || profile.approvalNotes;
      profile.reviewedAt = now;
      profile.reviewedBy = reviewerId;
      profile.updatedAt = now;
      profile.updatedBy = reviewerId;
      profile.version = (profile.version || 1) + 1;
    }

    if (decision === 'APPROVED') {
      user.status = 'ACTIVE';
    } else if (decision === 'REJECTED') {
      user.status = 'REJECTED';
    } else if (decision === 'MORE_INFORMATION') {
      user.status = 'PENDING_REVIEW';
    } else {
      user.status = 'PENDING_REVIEW';
    }

    user.updatedAt = now;
    this.save();
    return { user, profile };
  }

  public getPendingApplications(): Array<{ user: User; profile: UserProfile }> {
    const results: Array<{ user: User; profile: UserProfile }> = [];

    for (const user of this.schema.users) {
      if (user.role === 'SUPPLIER' || user.role === 'LOGISTICS_PARTNER') {
        const profile = this.schema.profiles[user.id];
        if (profile) {
          const appStatus = (profile as SupplierProfile | LogisticsProfile).approvalStatus;
          // Include all pending or reviewed applications for administrative oversight
          results.push({ user, profile });
        }
      }
    }

    return results;
  }

  // --- Session Repository ---
  public createSession(userId: string, role: UserRole): Session {
    const session: Session = {
      id: generateInternalId('ses'),
      userId,
      token: 'ab_tok_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2),
      role,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };

    // Update user's lastLoginAt
    const user = this.findUserById(userId);
    if (user) {
      user.lastLoginAt = new Date().toISOString();
    }

    this.schema.sessions.push(session);
    this.save();
    return session;
  }

  public getSession(token: string): Session | undefined {
    const session = this.schema.sessions.find((s) => s.token === token);
    if (!session) return undefined;

    if (new Date(session.expiresAt) < new Date()) {
      this.deleteSession(token);
      return undefined;
    }
    return session;
  }

  public deleteSession(token: string): void {
    this.schema.sessions = this.schema.sessions.filter((s) => s.token !== token);
    this.save();
  }

  // --- Audit Events Repository ---
  public recordEvent(event: AppEvent): void {
    this.schema.events.unshift(event);
    if (this.schema.events.length > 500) {
      this.schema.events.pop();
    }
    this.save();
  }

  public getEvents(): AppEvent[] {
    return this.schema.events;
  }

  // ==========================================
  // STEP 3: SUPPLIER PRODUCT CATALOG METHODS
  // ==========================================

  public createProduct(
    supplierId: string,
    input: CreateProductInput,
    actorId: string
  ): { product: Product; version: ProductVersion } {
    const productId = generateInternalId('prd');
    const publicProductId = generateBusinessId('AB-PRD');
    const versionId = generateInternalId('prv');
    const publicVersionId = generateBusinessId('AB-PRV');
    const now = new Date().toISOString();
    const effectiveFrom = input.effectiveFrom || now;

    const initialVersion: ProductVersion = {
      id: versionId,
      publicVersionId,
      productId,
      versionNumber: 1,
      effectiveFrom,
      effectiveUntil: null,
      customerFacingPrice: {
        amount: input.customerFacingPrice.amount,
        currency: 'INR',
      },
      supplierInternalCost: input.supplierInternalCost
        ? { amount: input.supplierInternalCost.amount, currency: 'INR' }
        : undefined,
      minimumOrderQuantity: input.minimumOrderQuantity,
      productionLeadTime: input.productionLeadTime,
      specifications: { ...input.specifications },
      changeReason: 'Initial Catalog Master Record Creation',
      changeImpact: 'NO_IMPACT',
      createdAt: now,
      createdBy: actorId,
    };

    const product: Product = {
      id: productId,
      publicProductId,
      supplierId,
      name: input.name.trim(),
      description: input.description.trim(),
      category: input.category.trim(),
      status: input.status || 'DRAFT',
      availability: input.availability || 'AVAILABLE',
      currentVersionNumber: 1,
      activeVersionId: versionId,
      specifications: { ...input.specifications },
      customerFacingPrice: {
        amount: input.customerFacingPrice.amount,
        currency: 'INR',
      },
      supplierInternalCost: input.supplierInternalCost
        ? { amount: input.supplierInternalCost.amount, currency: 'INR' }
        : undefined,
      minimumOrderQuantity: input.minimumOrderQuantity,
      productionLeadTime: input.productionLeadTime,
      productionCapacity: input.productionCapacity,
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
      changeImpact: 'NO_IMPACT',
    };

    this.schema.products.push(product);
    this.schema.productVersions.push(initialVersion);
    this.save();

    return { product, version: initialVersion };
  }

  public getProductsBySupplier(supplierId: string): Product[] {
    return this.schema.products.filter((p) => p.supplierId === supplierId);
  }

  public getProductById(productId: string): Product | undefined {
    return this.schema.products.find((p) => p.id === productId || p.publicProductId === productId);
  }

  public getProductByPublicId(publicProductId: string): Product | undefined {
    return this.schema.products.find((p) => p.publicProductId === publicProductId);
  }

  public getProductVersions(productId: string): ProductVersion[] {
    return this.schema.productVersions
      .filter((v) => v.productId === productId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public updateProduct(
    productId: string,
    updates: UpdateProductInput,
    actorId: string
  ): Product {
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const now = new Date().toISOString();
    if (updates.name !== undefined) product.name = updates.name.trim();
    if (updates.description !== undefined) product.description = updates.description.trim();
    if (updates.category !== undefined) product.category = updates.category.trim();
    if (updates.availability !== undefined) product.availability = updates.availability;
    if (updates.productionCapacity !== undefined) product.productionCapacity = updates.productionCapacity;

    product.updatedAt = now;
    product.updatedBy = actorId;
    this.save();
    return product;
  }

  public createProductVersion(
    productId: string,
    versionInput: CreateProductVersionInput,
    actorId: string
  ): { product: Product; version: ProductVersion } {
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const now = new Date().toISOString();
    const effectiveFrom = versionInput.effectiveFrom || now;

    // Close out previous active version
    const existingVersions = this.getProductVersions(product.id);
    const activeVersion = existingVersions.find((v) => v.id === product.activeVersionId) || existingVersions[0];
    if (activeVersion && (!activeVersion.effectiveUntil || new Date(activeVersion.effectiveUntil) > new Date(effectiveFrom))) {
      activeVersion.effectiveUntil = effectiveFrom;
    }

    const nextVersionNumber = product.currentVersionNumber + 1;
    const versionId = generateInternalId('prv');
    const publicVersionId = generateBusinessId('AB-PRV');

    const mergedSpecs: Product['specifications'] = {
      ...product.specifications,
      ...(versionInput.specifications || {}),
    };

    const newVersion: ProductVersion = {
      id: versionId,
      publicVersionId,
      productId: product.id,
      versionNumber: nextVersionNumber,
      effectiveFrom,
      effectiveUntil: null,
      customerFacingPrice: {
        amount: versionInput.customerFacingPrice.amount,
        currency: 'INR',
      },
      supplierInternalCost: versionInput.supplierInternalCost
        ? { amount: versionInput.supplierInternalCost.amount, currency: 'INR' }
        : product.supplierInternalCost,
      minimumOrderQuantity: versionInput.minimumOrderQuantity,
      productionLeadTime: versionInput.productionLeadTime,
      specifications: mergedSpecs,
      changeReason: versionInput.changeReason || `Version ${nextVersionNumber} Revision`,
      changeImpact: 'FUTURE_TRANSACTIONS',
      createdAt: now,
      createdBy: actorId,
    };

    // Update master product pointers
    product.currentVersionNumber = nextVersionNumber;
    product.activeVersionId = versionId;
    product.specifications = mergedSpecs;
    product.customerFacingPrice = {
      amount: versionInput.customerFacingPrice.amount,
      currency: 'INR',
    };
    if (versionInput.supplierInternalCost) {
      product.supplierInternalCost = {
        amount: versionInput.supplierInternalCost.amount,
        currency: 'INR',
      };
    }
    product.minimumOrderQuantity = versionInput.minimumOrderQuantity;
    product.productionLeadTime = versionInput.productionLeadTime;
    product.updatedAt = now;
    product.updatedBy = actorId;
    product.changeImpact = 'FUTURE_TRANSACTIONS';

    this.schema.productVersions.push(newVersion);
    this.save();

    return { product, version: newVersion };
  }

  public updateProductStatus(
    productId: string,
    newStatus: ProductStatus,
    actorId: string
  ): Product {
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const transitionCheck = validateStatusTransition(product.status, newStatus);
    if (!transitionCheck.isValid) {
      throw new Error(transitionCheck.errors[0]?.message || `Invalid status transition to ${newStatus}`);
    }

    const now = new Date().toISOString();
    product.status = newStatus;
    product.updatedAt = now;
    product.updatedBy = actorId;
    this.save();
    return product;
  }

  public updateProductAvailability(
    productId: string,
    newAvailability: ProductAvailability,
    actorId: string
  ): Product {
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const now = new Date().toISOString();
    product.availability = newAvailability;
    product.updatedAt = now;
    product.updatedBy = actorId;
    this.save();
    return product;
  }

  public deleteDraftProduct(productId: string, _actorId: string): boolean {
    const product = this.getProductById(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    if (product.status !== 'DRAFT') {
      throw new Error('Only DRAFT products can be deleted. Active, inactive, or discontinued products are preserved for historical audit trails.');
    }

    this.schema.products = this.schema.products.filter((p) => p.id !== product.id);
    this.schema.productVersions = this.schema.productVersions.filter((v) => v.productId !== product.id);
    this.save();
    return true;
  }

  public getActiveMarketplaceProducts(filters?: {
    category?: string;
    material?: string;
    maxPrice?: number;
    search?: string;
  }): CustomerFacingProductSummary[] {
    const activeProducts = this.schema.products.filter((product) => {
      // Must be ACTIVE status
      if (product.status !== 'ACTIVE') return false;

      // Owning supplier must be ACTIVE account
      const supplierUser = this.findUserById(product.supplierId);
      if (!supplierUser || supplierUser.status !== 'ACTIVE') return false;

      // Owning supplier must have APPROVED profile
      const supplierProfile = this.schema.profiles[product.supplierId] as SupplierProfile | undefined;
      if (!supplierProfile || supplierProfile.approvalStatus !== 'APPROVED') return false;

      // Category filter
      if (filters?.category && product.category.toLowerCase() !== filters.category.toLowerCase()) {
        return false;
      }

      // Material filter
      if (filters?.material && !product.specifications.bottleMaterial.toLowerCase().includes(filters.material.toLowerCase())) {
        return false;
      }

      // Max Price filter
      if (filters?.maxPrice !== undefined && product.customerFacingPrice.amount > filters.maxPrice) {
        return false;
      }

      // Search keyword
      if (filters?.search) {
        const query = filters.search.toLowerCase();
        const matchesName = product.name.toLowerCase().includes(query);
        const matchesDesc = product.description.toLowerCase().includes(query);
        const matchesId = product.publicProductId.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc && !matchesId) return false;
      }

      return true;
    });

    return activeProducts.map((p) => sanitizeProductForMarketplace(p));
  }

  // ==========================================
  // STEP 4: NOTIFICATIONS ENGINE
  // ==========================================

  public createNotification(
    userId: string,
    title: string,
    message: string,
    type: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' = 'INFO',
    campaignId?: string,
    publicCampaignId?: string
  ): AppNotification {
    const notification: AppNotification = {
      id: generateInternalId('notif'),
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
      campaignId,
      publicCampaignId,
    };

    this.schema.notifications.unshift(notification);
    // Keep max 200 notifications per user
    this.schema.notifications = this.schema.notifications.slice(0, 500);
    this.save();
    return notification;
  }

  public saveNotification(notification: AppNotification): AppNotification {
    this.schema.notifications.unshift(notification);
    this.save();
    return notification;
  }

  public getUserNotifications(userId: string): AppNotification[] {
    return this.schema.notifications
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public getNotificationsByUser(userId: string): AppNotification[] {
    return this.getUserNotifications(userId);
  }

  public markNotificationRead(notificationId: string, userId: string): boolean {
    const notification = this.schema.notifications.find(
      (n) => n.id === notificationId && n.userId === userId
    );
    if (!notification) return false;
    notification.read = true;
    this.save();
    return true;
  }

  // ==========================================
  // STEP 4: ADVERTISER CAMPAIGN ENGINE
  // ==========================================

  public createCampaign(
    advertiserId: string,
    input: CreateCampaignInput,
    actorId: string
  ): { campaign: Campaign; version: CampaignVersion } {
    // 1. Verify advertiser account eligibility
    const user = this.getUserById(advertiserId);
    const profile = this.getProfileByUserId(advertiserId) as AdvertiserProfile | undefined;
    const eligibility = validateAdvertiserEligibility(user, profile);

    if (!eligibility.isValid) {
      const err = new Error(eligibility.errors[0]?.message || 'Advertiser is not eligible to create campaigns.');
      (err as any).statusCode = 403;
      (err as any).code = eligibility.errors[0]?.code || 'ADVERTISER_INELIGIBLE';
      (err as any).details = eligibility.errors;
      throw err;
    }

    // 2. Validate input fields
    const isSubmittingForMatching = input.status === 'READY_FOR_MATCHING';
    const validation = validateCampaign(input, isSubmittingForMatching);

    if (!validation.isValid) {
      const err = new Error(validation.errors[0]?.message || 'Campaign input validation failed.');
      (err as any).statusCode = 400;
      (err as any).code = validation.errors[0]?.code || 'VALIDATION_FAILED';
      (err as any).details = validation.errors;
      throw err;
    }

    const now = new Date().toISOString();
    const campaignId = generateInternalId('cmp');
    const publicCampaignId = generateBusinessId('AB-CMP');
    const versionId = generateInternalId('cmv');
    const publicVersionId = generateBusinessId('AB-CMV');

    // Default structure normalization
    const initialStatus: CampaignStatus = isSubmittingForMatching ? 'READY_FOR_MATCHING' : 'DRAFT';

    const campaign: Campaign = {
      id: campaignId,
      publicCampaignId,
      advertiserId,
      name: input.name.trim(),
      description: (input.description || '').trim(),
      category: (input.category || 'General Commercial').trim(),
      objective: (input.objective || 'Brand Awareness').trim(),
      targetAudience: {
        demographics: input.targetAudience?.demographics || '',
        characteristics: input.targetAudience?.characteristics || [],
        interests: input.targetAudience?.interests || [],
        ageGroups: input.targetAudience?.ageGroups || [],
      },
      venueRequirements: {
        preferredVenueTypes: input.venueRequirements?.preferredVenueTypes || [],
        preferredLocations: input.venueRequirements?.preferredLocations || [],
        campaignPreferences: input.venueRequirements?.campaignPreferences || [],
        placementRequirements: input.venueRequirements?.placementRequirements || [],
      },
      bottleRequirements: {
        requiredQuantity: input.bottleRequirements?.requiredQuantity || 1000,
        preferredVolumeMl: input.bottleRequirements?.preferredVolumeMl || 500,
        volumeLabel: input.bottleRequirements?.volumeLabel || '500 ml Standard',
        preferredMaterial: input.bottleRequirements?.preferredMaterial || '100% rPET',
        preferredShape: input.bottleRequirements?.preferredShape || 'Classic Cylinder',
        bottleType: input.bottleRequirements?.bottleType || 'Standard Bottle',
        capType: input.bottleRequirements?.capType || 'Screw Cap (Tamper-Evident)',
        bottleFinish: input.bottleRequirements?.bottleFinish || 'Clear Gloss',
        labelType: input.bottleRequirements?.labelType || 'Full-Wrap Shrink Sleeve',
        printingCapability: input.bottleRequirements?.printingCapability || 'Digital CMYK Full-Color',
        packagingConfiguration: input.bottleRequirements?.packagingConfiguration || '24 bottles per case, shrink-wrapped',
        notes: input.bottleRequirements?.notes || '',
      },
      timing: {
        duration: {
          value: input.timing?.duration?.value || 4,
          unit: input.timing?.duration?.unit || 'WEEKS',
        },
        preferredStartPeriod: {
          label: input.timing?.preferredStartPeriod?.label || 'Immediate (Next 30 Days)',
          windowStart: input.timing?.preferredStartPeriod?.windowStart,
          windowEnd: input.timing?.preferredStartPeriod?.windowEnd,
          notes: input.timing?.preferredStartPeriod?.notes || '',
        },
      },
      distributionRequirements: {
        placementDetails: input.distributionRequirements?.placementDetails || 'Front Desk / Reception Display',
        estimatedDistributionPace: input.distributionRequirements?.estimatedDistributionPace || 'Evenly distributed across campaign duration',
        refrigerationRequired: !!input.distributionRequirements?.refrigerationRequired,
        handlingNotes: input.distributionRequirements?.handlingNotes || '',
      },
      collaborationRequirement: {
        status: input.collaborationRequirement?.status || 'NOT_REQUIRED',
        preferredTerms: input.collaborationRequirement?.preferredTerms || '',
        notes: input.collaborationRequirement?.notes || '',
      },
      eligibilityRequirements: {
        venueCriteria: input.eligibilityRequirements?.venueCriteria || [],
        minimumFootfall: input.eligibilityRequirements?.minimumFootfall,
        excludedVenueTypes: input.eligibilityRequirements?.excludedVenueTypes || [],
        notes: input.eligibilityRequirements?.notes || '',
      },
      proposalDeadline: input.proposalDeadline,
      publishedBudget: input.publishedBudget ? {
        disclosed: !!input.publishedBudget.disclosed,
        minAmount: input.publishedBudget.minAmount,
        maxAmount: input.publishedBudget.maxAmount,
        currency: 'INR',
      } : undefined,
      status: initialStatus,
      currentVersionNumber: 1,
      activeVersionId: versionId,
      changeImpact: 'FUTURE_TRANSACTIONS',
      createdAt: now,
      updatedAt: now,
      createdBy: actorId,
      updatedBy: actorId,
    };

    const initialVersion: CampaignVersion = {
      id: versionId,
      publicVersionId,
      campaignId,
      versionNumber: 1,
      snapshot: JSON.parse(JSON.stringify(campaign)),
      changedFields: ['INITIAL_CREATION'],
      changeReason: 'Initial Campaign Creation',
      changeImpact: 'FUTURE_TRANSACTIONS',
      createdAt: now,
      createdBy: actorId,
    };

    this.schema.campaigns.push(campaign);
    this.schema.campaignVersions.push(initialVersion);

    // Notification
    this.createNotification(
      advertiserId,
      initialStatus === 'READY_FOR_MATCHING' ? 'Campaign Ready for Matching' : 'Campaign Draft Saved',
      `Campaign "${campaign.name}" (${publicCampaignId}) is saved ${initialStatus === 'READY_FOR_MATCHING' ? 'and ready for matching' : 'as draft'}.`,
      'SUCCESS',
      campaignId,
      publicCampaignId
    );

    this.save();
    return { campaign, version: initialVersion };
  }

  public getCampaignsByAdvertiser(advertiserId: string): Campaign[] {
    return this.schema.campaigns
      .filter((c) => c.advertiserId === advertiserId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getAllCampaigns(): Campaign[] {
    return this.schema.campaigns.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  public getCampaignById(campaignIdOrPublicId: string): Campaign | undefined {
    return this.schema.campaigns.find(
      (c) => c.id === campaignIdOrPublicId || c.publicCampaignId === campaignIdOrPublicId
    );
  }

  public updateCampaign(
    campaignIdOrPublicId: string,
    input: UpdateCampaignInput,
    actorId: string,
    isAdmin: boolean = false
  ): { campaign: Campaign; version: CampaignVersion } {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) {
      const err = new Error(`Campaign '${campaignIdOrPublicId}' not found.`);
      (err as any).statusCode = 404;
      (err as any).code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    // Ownership check: must be owner or admin
    if (!isAdmin && campaign.advertiserId !== actorId) {
      const err = new Error('You do not own this campaign and are not authorized to modify it.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // Non-editable states check (commercial lock)
    const lockedStates: CampaignStatus[] = [
      'AGREEMENT_LOCKED',
      'ORDER_IN_PROGRESS',
      'IN_PRODUCTION',
      'ACTIVE',
      'COMPLETED',
      'CANCELLED',
    ];
    if (lockedStates.includes(campaign.status)) {
      const err = new Error(`Campaign is in '${campaign.status}' status and cannot be modified.`);
      (err as any).statusCode = 400;
      (err as any).code = 'CAMPAIGN_LOCKED';
      throw err;
    }

    const changedFields: string[] = [];

    if (input.name !== undefined && input.name.trim() !== campaign.name) {
      if (input.name.trim().length < 3) {
        const err = new Error('Campaign name must be at least 3 characters.');
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_CAMPAIGN_NAME';
        throw err;
      }
      campaign.name = input.name.trim();
      changedFields.push('name');
    }

    if (input.description !== undefined && input.description.trim() !== campaign.description) {
      campaign.description = input.description.trim();
      changedFields.push('description');
    }

    if (input.category !== undefined && input.category.trim() !== campaign.category) {
      campaign.category = input.category.trim();
      changedFields.push('category');
    }

    if (input.objective !== undefined && input.objective.trim() !== campaign.objective) {
      campaign.objective = input.objective.trim();
      changedFields.push('objective');
    }

    if (input.targetAudience) {
      campaign.targetAudience = {
        ...campaign.targetAudience,
        ...input.targetAudience,
        characteristics: input.targetAudience.characteristics || campaign.targetAudience.characteristics,
      };
      changedFields.push('targetAudience');
    }

    if (input.venueRequirements) {
      campaign.venueRequirements = {
        ...campaign.venueRequirements,
        ...input.venueRequirements,
        preferredVenueTypes: input.venueRequirements.preferredVenueTypes || campaign.venueRequirements.preferredVenueTypes,
        preferredLocations: input.venueRequirements.preferredLocations || campaign.venueRequirements.preferredLocations,
        placementRequirements: input.venueRequirements.placementRequirements || campaign.venueRequirements.placementRequirements,
      };
      changedFields.push('venueRequirements');
    }

    if (input.bottleRequirements) {
      if (
        input.bottleRequirements.requiredQuantity !== undefined &&
        (input.bottleRequirements.requiredQuantity <= 0 || !Number.isInteger(input.bottleRequirements.requiredQuantity))
      ) {
        const err = new Error('Bottle quantity must be a positive integer.');
        (err as any).statusCode = 400;
        (err as any).code = 'INVALID_QUANTITY';
        throw err;
      }
      campaign.bottleRequirements = {
        ...campaign.bottleRequirements,
        ...input.bottleRequirements,
      };
      changedFields.push('bottleRequirements');
    }

    if (input.timing) {
      if (input.timing.duration) {
        if (input.timing.duration.value !== undefined && input.timing.duration.value <= 0) {
          const err = new Error('Duration must be greater than zero.');
          (err as any).statusCode = 400;
          (err as any).code = 'INVALID_DURATION';
          throw err;
        }
        campaign.timing.duration = {
          ...campaign.timing.duration,
          ...input.timing.duration,
        };
      }
      if (input.timing.preferredStartPeriod) {
        campaign.timing.preferredStartPeriod = {
          ...campaign.timing.preferredStartPeriod,
          ...input.timing.preferredStartPeriod,
        };
      }
      changedFields.push('timing');
    }

    if (input.distributionRequirements) {
      campaign.distributionRequirements = {
        ...campaign.distributionRequirements,
        ...input.distributionRequirements,
      };
      changedFields.push('distributionRequirements');
    }

    if (input.collaborationRequirement) {
      campaign.collaborationRequirement = {
        ...campaign.collaborationRequirement,
        ...input.collaborationRequirement,
      };
      changedFields.push('collaborationRequirement');
    }

    if (input.eligibilityRequirements) {
      campaign.eligibilityRequirements = {
        ...campaign.eligibilityRequirements,
        ...input.eligibilityRequirements,
      };
      changedFields.push('eligibilityRequirements');
    }

    if (input.proposalDeadline !== undefined) {
      campaign.proposalDeadline = input.proposalDeadline;
      changedFields.push('proposalDeadline');
    }

    if (input.publishedBudget) {
      campaign.publishedBudget = {
        disclosed: !!input.publishedBudget.disclosed,
        minAmount: input.publishedBudget.minAmount,
        maxAmount: input.publishedBudget.maxAmount,
        currency: 'INR',
      };
      changedFields.push('publishedBudget');
    }

    // If campaign was READY_FOR_MATCHING, check if the updates violated readiness requirements
    if (campaign.status === 'READY_FOR_MATCHING') {
      const reval = validateCampaign(campaign, true);
      if (!reval.isValid) {
        // Revert to draft automatically since required fields are no longer compliant
        campaign.status = 'DRAFT';
        changedFields.push('status (auto-reverted to DRAFT)');
        this.createNotification(
          campaign.advertiserId,
          'Campaign Reverted to Draft',
          `Recent edits to "${campaign.name}" left some required fields incomplete. Status has been reverted to DRAFT.`,
          'WARNING',
          campaign.id,
          campaign.publicCampaignId
        );
      }
    }

    const now = new Date().toISOString();
    campaign.updatedAt = now;
    campaign.updatedBy = actorId;
    campaign.currentVersionNumber += 1;

    const versionId = generateInternalId('cmv');
    const publicVersionId = generateBusinessId('AB-CMV');
    campaign.activeVersionId = versionId;

    const newVersion: CampaignVersion = {
      id: versionId,
      publicVersionId,
      campaignId: campaign.id,
      versionNumber: campaign.currentVersionNumber,
      snapshot: JSON.parse(JSON.stringify(campaign)),
      changedFields: changedFields.length > 0 ? changedFields : ['MINOR_EDIT'],
      changeReason: input.changeReason || 'Campaign details revised by owner',
      changeImpact: 'FUTURE_TRANSACTIONS',
      createdAt: now,
      createdBy: actorId,
    };

    this.schema.campaignVersions.push(newVersion);
    this.save();

    return { campaign, version: newVersion };
  }

  public prepareCampaignForMatching(
    campaignIdOrPublicId: string,
    actorId: string,
    isAdmin: boolean = false
  ): { campaign: Campaign; validationResult: CampaignValidationResult } {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) {
      const err = new Error(`Campaign '${campaignIdOrPublicId}' not found.`);
      (err as any).statusCode = 404;
      (err as any).code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    if (!isAdmin && campaign.advertiserId !== actorId) {
      const err = new Error('You do not own this campaign and are not authorized to submit it.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    // State machine check
    const transitionCheck = validateCampaignStatusTransition(campaign.status, 'READY_FOR_MATCHING');
    if (!transitionCheck.isValid) {
      const err = new Error(transitionCheck.errors[0]?.message || 'Invalid status transition.');
      (err as any).statusCode = 400;
      (err as any).code = transitionCheck.errors[0]?.code || 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    // Exhaustive validation for matching readiness
    const val = validateCampaign(campaign, true);
    if (!val.isValid) {
      this.createNotification(
        campaign.advertiserId,
        'Campaign Validation Incomplete',
        `Campaign "${campaign.name}" could not be prepared for matching: ${val.errors[0]?.message}`,
        'WARNING',
        campaign.id,
        campaign.publicCampaignId
      );
      return { campaign, validationResult: val };
    }

    // Transition state
    campaign.status = 'READY_FOR_MATCHING';
    const now = new Date().toISOString();
    campaign.updatedAt = now;
    campaign.updatedBy = actorId;

    this.createNotification(
      campaign.advertiserId,
      'Campaign Ready for Matching',
      `Campaign "${campaign.name}" (${campaign.publicCampaignId}) is validated and ready for matching.`,
      'SUCCESS',
      campaign.id,
      campaign.publicCampaignId
    );

    this.save();
    return { campaign, validationResult: val };
  }

  public revertCampaignToDraft(
    campaignIdOrPublicId: string,
    actorId: string,
    isAdmin: boolean = false
  ): Campaign {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) {
      const err = new Error(`Campaign '${campaignIdOrPublicId}' not found.`);
      (err as any).statusCode = 404;
      (err as any).code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    if (!isAdmin && campaign.advertiserId !== actorId) {
      const err = new Error('You do not own this campaign and are not authorized to revert it.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const transitionCheck = validateCampaignStatusTransition(campaign.status, 'DRAFT');
    if (!transitionCheck.isValid) {
      const err = new Error(transitionCheck.errors[0]?.message || 'Invalid status transition.');
      (err as any).statusCode = 400;
      (err as any).code = transitionCheck.errors[0]?.code || 'INVALID_STATUS_TRANSITION';
      throw err;
    }

    campaign.status = 'DRAFT';
    campaign.updatedAt = new Date().toISOString();
    campaign.updatedBy = actorId;

    this.createNotification(
      campaign.advertiserId,
      'Campaign Reopened as Draft',
      `Campaign "${campaign.name}" (${campaign.publicCampaignId}) has been reopened as a draft for revisions.`,
      'INFO',
      campaign.id,
      campaign.publicCampaignId
    );

    this.save();
    return campaign;
  }

  public deleteDraftCampaign(
    campaignIdOrPublicId: string,
    actorId: string,
    isAdmin: boolean = false
  ): boolean {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) {
      const err = new Error(`Campaign '${campaignIdOrPublicId}' not found.`);
      (err as any).statusCode = 404;
      (err as any).code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    if (!isAdmin && campaign.advertiserId !== actorId) {
      const err = new Error('You do not own this campaign.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    if (campaign.status !== 'DRAFT') {
      const err = new Error(`Only DRAFT campaigns can be deleted. Current status: '${campaign.status}'.`);
      (err as any).statusCode = 400;
      (err as any).code = 'NON_DRAFT_DELETION_FORBIDDEN';
      throw err;
    }

    this.schema.campaigns = this.schema.campaigns.filter((c) => c.id !== campaign.id);
    this.schema.campaignVersions = this.schema.campaignVersions.filter((v) => v.campaignId !== campaign.id);
    this.save();
    return true;
  }

  public getCampaignVersions(campaignIdOrPublicId: string): CampaignVersion[] {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) return [];
    return this.schema.campaignVersions
      .filter((v) => v.campaignId === campaign.id)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public getCampaignOpportunity(campaignIdOrPublicId: string): CampaignOpportunityView | null {
    const campaign = this.getCampaignById(campaignIdOrPublicId);
    if (!campaign) return null;
    return getCampaignOpportunityView(campaign);
  }

  // ==========================================
  // STEP 5: VENUE MARKETPLACE & MATCHING
  // ==========================================

  public getMarketplaceVenues(
    query: VenueMarketplaceQuery,
    actor: User
  ): PaginatedResult<MarketplaceVenue> {
    // 1. Role verification: Only ADVERTISER or ADMIN can query the venue marketplace
    if (actor.role !== 'ADVERTISER' && actor.role !== 'ADMIN') {
      const err = new Error('Only authenticated Advertisers and Admins may access the Venue Marketplace.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN_ROLE';
      throw err;
    }

    // 2. If campaignId is supplied, retrieve and verify campaign ownership
    let campaign: Campaign | undefined;
    if (query.campaignId) {
      const found = this.getCampaignById(query.campaignId);
      if (!found) {
        const err = new Error(`Campaign '${query.campaignId}' not found.`);
        (err as any).statusCode = 404;
        (err as any).code = 'CAMPAIGN_NOT_FOUND';
        throw err;
      }

      if (actor.role !== 'ADMIN' && found.advertiserId !== actor.id) {
        const err = new Error('You do not own this campaign and cannot evaluate venue matches for it.');
        (err as any).statusCode = 403;
        (err as any).code = 'FORBIDDEN_CAMPAIGN_ACCESS';
        throw err;
      }
      campaign = found;
    }

    // 3. Find all venue accounts in the system
    const venueUsers = this.schema.users.filter((u) => u.role === 'VENUE');
    const eligibleVenues: MarketplaceVenue[] = [];

    for (const venueUser of venueUsers) {
      const venueProfile = this.schema.profiles[venueUser.id] as VenueProfile | undefined;
      if (!venueProfile) continue;

      // Hard eligibility evaluation
      const eligibility = evaluateVenueEligibility(venueUser, venueProfile, campaign);
      if (!eligibility.isEligible) {
        continue;
      }

      // Project sanitized marketplace venue
      const sanitized = sanitizeVenueForMarketplace(venueUser, venueProfile, campaign);

      // Apply query filters
      // Keyword search
      if (query.search) {
        const q = query.search.trim().toLowerCase();
        const matchesName = sanitized.venueName.toLowerCase().includes(q);
        const matchesCity = sanitized.location.city.toLowerCase().includes(q);
        const matchesType = sanitized.venueType.toLowerCase().includes(q);
        const matchesAudience = sanitized.audienceCategory.toLowerCase().includes(q);
        const matchesDesc = sanitized.description.toLowerCase().includes(q);
        if (!matchesName && !matchesCity && !matchesType && !matchesAudience && !matchesDesc) {
          continue;
        }
      }

      // City filter
      if (query.city && query.city.trim().length > 0 && query.city !== 'ALL') {
        if (!sanitized.location.city.toLowerCase().includes(query.city.trim().toLowerCase())) {
          continue;
        }
      }

      // Venue type filter
      if (query.venueType && query.venueType.trim().length > 0 && query.venueType !== 'ALL') {
        if (!sanitized.venueType.toLowerCase().includes(query.venueType.trim().toLowerCase())) {
          continue;
        }
      }

      // Audience category filter
      if (query.audienceCategory && query.audienceCategory.trim().length > 0 && query.audienceCategory !== 'ALL') {
        if (!sanitized.audienceCategory.toLowerCase().includes(query.audienceCategory.trim().toLowerCase())) {
          continue;
        }
      }

      // Capacity status filter (only applicable when campaign is provided)
      if (query.capacityStatus && query.capacityStatus !== 'ALL') {
        if (sanitized.capacityEvaluation) {
          if (sanitized.capacityEvaluation.status !== query.capacityStatus) {
            continue;
          }
        }
      }

      // Minimum score filter (only applicable when campaign is provided)
      if (query.minScore !== undefined && query.minScore > 0) {
        if (sanitized.matchEvaluation && sanitized.matchEvaluation.score !== null) {
          if (sanitized.matchEvaluation.score < query.minScore) {
            continue;
          }
        }
      }

      // Minimum footfall filter
      if (query.minFootfall !== undefined && query.minFootfall > 0) {
        if (sanitized.footfall.monthlyVisitors < query.minFootfall) {
          continue;
        }
      }

      eligibleVenues.push(sanitized);
    }

    // 4. Deterministic Sorting:
    // "All eligible venues should remain discoverable. Matched venues appear first."
    const sortBy = query.sortBy || 'MATCH_SCORE';
    const sortOrder = query.sortOrder || 'DESC';

    eligibleVenues.sort((a, b) => {
      if (sortBy === 'MATCH_SCORE') {
        const scoreA = a.matchEvaluation?.score ?? -1;
        const scoreB = b.matchEvaluation?.score ?? -1;
        if (scoreB !== scoreA) {
          return sortOrder === 'DESC' ? scoreB - scoreA : scoreA - scoreB;
        }
        // Secondary: Available capacity
        if (b.capacity.availableBottleCapacity !== a.capacity.availableBottleCapacity) {
          return b.capacity.availableBottleCapacity - a.capacity.availableBottleCapacity;
        }
        // Tertiary: Footfall
        if (b.footfall.monthlyVisitors !== a.footfall.monthlyVisitors) {
          return b.footfall.monthlyVisitors - a.footfall.monthlyVisitors;
        }
        // Quaternary: Name alphabetically
        return a.venueName.localeCompare(b.venueName);
      } else if (sortBy === 'CAPACITY') {
        const capA = a.capacity.availableBottleCapacity;
        const capB = b.capacity.availableBottleCapacity;
        return sortOrder === 'DESC' ? capB - capA : capA - capB;
      } else if (sortBy === 'FOOTFALL') {
        const footA = a.footfall.monthlyVisitors;
        const footB = b.footfall.monthlyVisitors;
        return sortOrder === 'DESC' ? footB - footA : footA - footB;
      } else if (sortBy === 'NAME') {
        return sortOrder === 'DESC'
          ? b.venueName.localeCompare(a.venueName)
          : a.venueName.localeCompare(b.venueName);
      }
      return 0;
    });

    // 5. Pagination
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, Math.min(100, query.pageSize || 10));
    const total = eligibleVenues.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = eligibleVenues.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public getMarketplaceVenueDetail(
    venueIdOrPublicId: string,
    campaignId?: string,
    actor?: User
  ): MarketplaceVenue {
    const venueUser = this.schema.users.find(
      (u) => (u.id === venueIdOrPublicId || u.publicAccountId === venueIdOrPublicId) && u.role === 'VENUE'
    );
    if (!venueUser) {
      const err = new Error(`Venue '${venueIdOrPublicId}' not found.`);
      (err as any).statusCode = 404;
      (err as any).code = 'VENUE_NOT_FOUND';
      throw err;
    }

    const venueProfile = this.schema.profiles[venueUser.id] as VenueProfile | undefined;
    if (!venueProfile) {
      const err = new Error(`Venue profile not initialized for '${venueIdOrPublicId}'.`);
      (err as any).statusCode = 404;
      (err as any).code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    let campaign: Campaign | undefined;
    if (campaignId) {
      const found = this.getCampaignById(campaignId);
      if (!found) {
        const err = new Error(`Campaign '${campaignId}' not found.`);
        (err as any).statusCode = 404;
        (err as any).code = 'CAMPAIGN_NOT_FOUND';
        throw err;
      }

      if (actor && actor.role !== 'ADMIN' && found.advertiserId !== actor.id) {
        const err = new Error('You do not own this campaign and cannot evaluate venue matches for it.');
        (err as any).statusCode = 403;
        (err as any).code = 'FORBIDDEN_CAMPAIGN_ACCESS';
        throw err;
      }
      campaign = found;
    }

    const eligibility = evaluateVenueEligibility(venueUser, venueProfile, campaign);
    if (!eligibility.isEligible) {
      const err = new Error(`Venue is not eligible for marketplace discovery: ${eligibility.reasons.join(', ')}`);
      (err as any).statusCode = 403;
      (err as any).code = 'VENUE_INELIGIBLE';
      throw err;
    }

    return sanitizeVenueForMarketplace(venueUser, venueProfile, campaign);
  }

  public getVenueCampaignOpportunities(
    venueUserId: string,
    query?: {
      category?: string;
      search?: string;
      minQuantity?: number;
      maxQuantity?: number;
      page?: number;
      pageSize?: number;
    }
  ): PaginatedResult<CampaignOpportunityView & { capacityEvaluation: CapacityEvaluation }> {
    const venueUser = this.findUserById(venueUserId);
    if (!venueUser || venueUser.role !== 'VENUE') {
      const err = new Error('Authenticated venue account required.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const venueProfile = this.schema.profiles[venueUser.id] as VenueProfile | undefined;
    if (!venueProfile) {
      const err = new Error('Venue operational profile required.');
      (err as any).statusCode = 404;
      (err as any).code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    // Filter campaigns that are READY_FOR_MATCHING or MATCHING
    const opportunities: Array<CampaignOpportunityView & { capacityEvaluation: CapacityEvaluation }> = [];
    const activeCampaigns = this.schema.campaigns.filter(
      (c) => c.status === 'READY_FOR_MATCHING' || c.status === 'MATCHING'
    );

    const forbidden = venueProfile.campaignPreferences?.forbiddenCategories || [];

    for (const campaign of activeCampaigns) {
      // Check venue forbidden category exclusion
      if (forbidden.some((cat) => cat.toLowerCase() === campaign.category.toLowerCase())) {
        continue;
      }

      // Check campaign excluded venue types
      const excludedTypes = campaign.eligibilityRequirements?.excludedVenueTypes || [];
      if (excludedTypes.some((t) => t.toLowerCase() === venueProfile.venueType.toLowerCase())) {
        continue;
      }

      // Search and filters
      if (query?.category && query.category !== 'ALL') {
        if (campaign.category.toLowerCase() !== query.category.toLowerCase()) {
          continue;
        }
      }

      if (query?.search) {
        const q = query.search.toLowerCase();
        const matchesName = campaign.name.toLowerCase().includes(q);
        const matchesObj = campaign.objective.toLowerCase().includes(q);
        const matchesCat = campaign.category.toLowerCase().includes(q);
        if (!matchesName && !matchesObj && !matchesCat) {
          continue;
        }
      }

      if (query?.minQuantity !== undefined && campaign.bottleRequirements.requiredQuantity < query.minQuantity) {
        continue;
      }

      if (query?.maxQuantity !== undefined && campaign.bottleRequirements.requiredQuantity > query.maxQuantity) {
        continue;
      }

      // Calculate venue capacity evaluation for this campaign
      const capEval = evaluateCapacity(venueProfile.capacity, campaign.bottleRequirements.requiredQuantity);
      const oppView = getCampaignOpportunityView(campaign);

      opportunities.push({
        ...oppView,
        capacityEvaluation: capEval,
      });
    }

    // Sort by recent updatedAt
    opportunities.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const page = Math.max(1, query?.page || 1);
    const pageSize = Math.max(1, Math.min(100, query?.pageSize || 10));
    const total = opportunities.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = opportunities.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  public getVenueCapacityOverview(venueUserId: string): VenueCapacityOverview {
    const venueUser = this.findUserById(venueUserId);
    if (!venueUser || venueUser.role !== 'VENUE') {
      const err = new Error('Authenticated venue account required.');
      (err as any).statusCode = 403;
      (err as any).code = 'FORBIDDEN';
      throw err;
    }

    const venueProfile = this.schema.profiles[venueUser.id] as VenueProfile | undefined;
    if (!venueProfile) {
      const err = new Error('Venue operational profile required.');
      (err as any).statusCode = 404;
      (err as any).code = 'PROFILE_NOT_FOUND';
      throw err;
    }

    const maxHolding = venueProfile.capacity?.maxBottleHoldingCapacity || 0;
    const currentCommitment = venueProfile.capacity?.currentOngoingBottleCommitment || 0;
    const available = Math.max(0, maxHolding - currentCommitment);

    return {
      venueId: venueUser.id,
      publicAccountId: venueUser.publicAccountId,
      venueName: venueProfile.venueName,
      maxBottleHoldingCapacity: maxHolding,
      currentOngoingBottleCommitment: currentCommitment,
      availableBottleCapacity: available,
      activeCommitmentCount: 0,
      commitments: [],
      operationalNotes:
        'Available capacity represents instant uncommitted storage for active bottle batches. Marketplace discovery and advertiser browsing DO NOT reserve or deduct capacity until a commercial Campaign Agreement is formalized in future transaction phases.',
    };
  }

  public getPublicVenues(): Array<{
    venueId: string;
    publicAccountId: string;
    venueName: string;
    venueType: string;
    description: string;
    location: {
      city: string;
      stateRegion: string;
      country: string;
    };
    audienceCategory: string;
    monthlyVisitors: number;
    availableBottleCapacity: number;
    campaignAvailability: string;
    placementPossibilities: string[];
  }> {
    const venueUsers = this.schema.users.filter((u) => u.role === 'VENUE');
    const publicVenues = [];

    for (const vUser of venueUsers) {
      const profile = this.schema.profiles[vUser.id] as VenueProfile | undefined;
      if (!profile || profile.visibilityState !== 'PUBLIC_ELIGIBLE' || !profile.completion.isComplete) {
        continue;
      }

      publicVenues.push({
        venueId: vUser.id,
        publicAccountId: vUser.publicAccountId,
        venueName: profile.venueName,
        venueType: profile.venueType,
        description: profile.description,
        location: {
          city: profile.location.city,
          stateRegion: profile.location.stateRegion || '',
          country: profile.location.country,
        },
        audienceCategory: profile.audienceCategory,
        monthlyVisitors: profile.footfall.monthlyVisitors,
        availableBottleCapacity: profile.capacity.availableBottleCapacity,
        campaignAvailability: profile.campaignAvailability,
        placementPossibilities: profile.placementPossibilities || [],
      });
    }

    return publicVenues;
  }

  // ==========================================
  // STEP 6: PROPOSAL & NEGOTIATION PERSISTENCE
  // ==========================================

  public saveProposal(proposal: Proposal): void {
    const idx = this.schema.proposals.findIndex(
      (p) => p.id === proposal.id || p.publicProposalId === proposal.publicProposalId
    );
    if (idx >= 0) {
      this.schema.proposals[idx] = proposal;
    } else {
      this.schema.proposals.push(proposal);
    }
    this.save();
  }

  public getProposalById(idOrPublicId: string): Proposal | undefined {
    return this.schema.proposals.find(
      (p) => p.id === idOrPublicId || p.publicProposalId === idOrPublicId
    );
  }

  public getAllProposals(): Proposal[] {
    return this.schema.proposals.slice();
  }

  public saveProposalVersion(version: ProposalVersion): void {
    const idx = this.schema.proposalVersions.findIndex((v) => v.id === version.id);
    if (idx >= 0) {
      this.schema.proposalVersions[idx] = version;
    } else {
      this.schema.proposalVersions.push(version);
    }
    this.save();
  }

  public getProposalVersions(proposalId: string): ProposalVersion[] {
    return this.schema.proposalVersions
      .filter((v) => v.proposalId === proposalId)
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public recordProposalEvent(event: ProposalNegotiationEvent): void {
    this.schema.proposalEvents.push(event);
    this.save();
  }

  public getProposalEvents(proposalId: string): ProposalNegotiationEvent[] {
    return this.schema.proposalEvents
      .filter((e) => e.proposalId === proposalId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  public saveCampaign(campaign: Campaign): void {
    const idx = this.schema.campaigns.findIndex(
      (c) => c.id === campaign.id || c.publicCampaignId === campaign.publicCampaignId
    );
    if (idx >= 0) {
      this.schema.campaigns[idx] = campaign;
    } else {
      this.schema.campaigns.push(campaign);
    }
    this.save();
  }

  // ==========================================
  // STEP 7: CAMPAIGN AGREEMENT PERSISTENCE
  // ==========================================

  /**
   * Executes a series of database operations within an atomic transaction.
   * If any step throws an error, the database rolls back to the pre-transaction state.
   */
  public runTransaction<T>(operation: () => T): T {
    const snapshot = JSON.parse(JSON.stringify(this.schema));
    try {
      const result = operation();
      this.save();
      return result;
    } catch (error) {
      this.schema = snapshot;
      throw error;
    }
  }

  public saveAgreement(agreement: CampaignAgreement): void {
    const idx = this.schema.agreements.findIndex(
      (a) => a.id === agreement.id || a.publicId === agreement.publicId
    );
    if (idx >= 0) {
      const existing = this.schema.agreements[idx];
      // Mutation protection: if already locked, reject any alterations to parties, terms, or commercial status
      if (existing.status === 'LOCKED') {
        if (
          agreement.status !== 'LOCKED' ||
          agreement.campaignId !== existing.campaignId ||
          agreement.advertiserId !== existing.advertiserId ||
          agreement.venueId !== existing.venueId ||
          agreement.terms.campaignQuantity !== existing.terms.campaignQuantity ||
          agreement.currentVersionNumber !== existing.currentVersionNumber ||
          JSON.stringify(agreement.terms) !== JSON.stringify(existing.terms)
        ) {
          throw new AgreementLockedError(
            'AGREEMENT_LOCKED: Normal commercial amendments, party changes, or term mutations are strictly forbidden on a LOCKED Campaign Agreement.'
          );
        }
      }
      this.schema.agreements[idx] = agreement;
    } else {
      this.schema.agreements.push(agreement);
    }
    this.save();
  }

  public getAgreementById(idOrPublicId: string): CampaignAgreement | undefined {
    const agr = this.schema.agreements.find(
      (a) => a.id === idOrPublicId || a.publicId === idOrPublicId
    );
    return agr ? JSON.parse(JSON.stringify(agr)) : undefined;
  }

  public getAllAgreements(): CampaignAgreement[] {
    return this.schema.agreements.map((a) => JSON.parse(JSON.stringify(a)));
  }

  public getAgreementByProposalId(proposalId: string): CampaignAgreement | undefined {
    const agr = this.schema.agreements.find(
      (a) =>
        a.sourceProposalId === proposalId ||
        a.sourceProposalPublicId === proposalId
    );
    return agr ? JSON.parse(JSON.stringify(agr)) : undefined;
  }

  public saveAgreementVersion(version: CampaignAgreementVersion): void {
    const agreement = this.getAgreementById(version.agreementId);
    if (agreement && agreement.status === 'LOCKED' && version.status !== 'LOCKED') {
      throw new AgreementLockedError(
        'AGREEMENT_LOCKED: Cannot add or update versions on a LOCKED Campaign Agreement.'
      );
    }

    const idx = this.schema.agreementVersions.findIndex((v) => v.id === version.id);
    if (idx >= 0) {
      this.schema.agreementVersions[idx] = version;
    } else {
      this.schema.agreementVersions.push(version);
    }
    this.save();
  }

  public getAgreementVersions(agreementId: string): CampaignAgreementVersion[] {
    return this.schema.agreementVersions
      .filter((v) => v.agreementId === agreementId)
      .map((v) => JSON.parse(JSON.stringify(v)))
      .sort((a, b) => b.versionNumber - a.versionNumber);
  }

  public saveAgreementSnapshot(snapshot: CampaignAgreementSnapshot): void {
    const idx = this.schema.agreementSnapshots.findIndex(
      (s) => s.id === snapshot.id || s.publicSnapshotId === snapshot.publicSnapshotId
    );
    // Snapshots are strictly immutable once created. If already stored, reject overwrites.
    if (idx >= 0) {
      throw new AgreementLockedError(
        'SNAPSHOT_IMMUTABLE: Campaign Agreement Snapshots are permanent, sealed legal records and cannot be overwritten.'
      );
    }
    // Deep clone to guarantee reference independence from all runtime and profile objects
    const frozen = JSON.parse(JSON.stringify(snapshot));
    this.schema.agreementSnapshots.push(frozen);
    this.save();
  }

  public getAgreementSnapshotById(idOrPublicId: string): CampaignAgreementSnapshot | undefined {
    const s = this.schema.agreementSnapshots.find(
      (item) => item.id === idOrPublicId || item.publicSnapshotId === idOrPublicId
    );
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public getAgreementSnapshotByAgreementId(agreementId: string): CampaignAgreementSnapshot | undefined {
    const s = this.schema.agreementSnapshots.find((item) => item.agreementId === agreementId);
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public saveAgreementInternalRecord(record: CampaignAgreementInternalRecord): void {
    const idx = this.schema.agreementInternalRecords.findIndex(
      (r) => r.id === record.id || r.agreementId === record.agreementId
    );
    if (idx >= 0) {
      this.schema.agreementInternalRecords[idx] = record;
    } else {
      this.schema.agreementInternalRecords.push(record);
    }
    this.save();
  }

  public getAgreementInternalRecord(agreementId: string): CampaignAgreementInternalRecord | undefined {
    return this.schema.agreementInternalRecords.find((r) => r.agreementId === agreementId);
  }

  // --- Step 8: Order Readiness & Data Handoff Methods ---

  public saveOrderReadiness(record: OrderReadiness): void {
    const idx = this.schema.orderReadinessRecords.findIndex(
      (r) => r.id === record.id || r.publicId === record.publicId
    );
    const cloned = JSON.parse(JSON.stringify(record));
    if (idx >= 0) {
      this.schema.orderReadinessRecords[idx] = cloned;
    } else {
      this.schema.orderReadinessRecords.push(cloned);
    }
    this.save();
  }

  public getOrderReadinessById(idOrPublicId: string): OrderReadiness | undefined {
    const r = this.schema.orderReadinessRecords.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getOrderReadinessByAgreementId(agreementId: string): OrderReadiness | undefined {
    const r = this.schema.orderReadinessRecords.find((item) => item.campaignAgreementId === agreementId);
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getOrderReadinessRecords(query?: { campaignId?: string; venueId?: string; advertiserId?: string; status?: string }): OrderReadiness[] {
    let list = this.schema.orderReadinessRecords.slice();
    if (query?.campaignId) {
      list = list.filter((r) => r.campaignId === query.campaignId);
    }
    if (query?.venueId) {
      list = list.filter((r) => r.venueId === query.venueId);
    }
    if (query?.advertiserId) {
      list = list.filter((r) => r.advertiserId === query.advertiserId);
    }
    if (query?.status) {
      list = list.filter((r) => r.status === query.status);
    }
    return JSON.parse(JSON.stringify(list));
  }

  public saveDataHandoff(record: DataHandoff): void {
    const idx = this.schema.dataHandoffRecords.findIndex(
      (h) => h.id === record.id || h.publicId === record.publicId
    );
    const cloned = JSON.parse(JSON.stringify(record));
    if (idx >= 0) {
      this.schema.dataHandoffRecords[idx] = cloned;
    } else {
      this.schema.dataHandoffRecords.push(cloned);
    }
    this.save();
  }

  public getDataHandoffById(idOrPublicId: string): DataHandoff | undefined {
    const h = this.schema.dataHandoffRecords.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return h ? JSON.parse(JSON.stringify(h)) : undefined;
  }

  public getDataHandoffByDestinationRef(destRef: string): DataHandoff | undefined {
    const h = this.schema.dataHandoffRecords.find((item) => item.destinationReference === destRef);
    return h ? JSON.parse(JSON.stringify(h)) : undefined;
  }

  public getDataHandoffBySourceId(sourceId: string): DataHandoff | undefined {
    const h = this.schema.dataHandoffRecords.find((item) => item.sourceId === sourceId);
    return h ? JSON.parse(JSON.stringify(h)) : undefined;
  }

  // ==========================================
  // STEP 9: SUPPLIER ASSIGNMENT & OFFER METHODS
  // ==========================================

  public saveSupplierOffer(offer: SupplierOperationalOffer): void {
    const cloned = JSON.parse(JSON.stringify(offer));
    const idx = this.schema.supplierOffers.findIndex((o) => o.id === offer.id);
    if (idx >= 0) {
      this.schema.supplierOffers[idx] = cloned;
    } else {
      this.schema.supplierOffers.push(cloned);
    }
    this.save();
  }

  public getSupplierOfferById(idOrPublicId: string): SupplierOperationalOffer | undefined {
    const offer = this.schema.supplierOffers.find(
      (o) => o.id === idOrPublicId || o.publicId === idOrPublicId
    );
    return offer ? JSON.parse(JSON.stringify(offer)) : undefined;
  }

  public getSupplierOffersByOrderReadiness(orderReadinessId: string): SupplierOperationalOffer[] {
    return this.schema.supplierOffers
      .filter((o) => o.orderReadinessId === orderReadinessId)
      .map((o) => JSON.parse(JSON.stringify(o)));
  }

  public getSupplierOffersBySupplier(supplierId: string): SupplierOperationalOffer[] {
    return this.schema.supplierOffers
      .filter((o) => o.supplierId === supplierId)
      .map((o) => JSON.parse(JSON.stringify(o)));
  }

  public saveSupplierAssignment(assignment: SupplierAssignment): void {
    const cloned = JSON.parse(JSON.stringify(assignment));
    const idx = this.schema.supplierAssignments.findIndex((a) => a.id === assignment.id);
    if (idx >= 0) {
      this.schema.supplierAssignments[idx] = cloned;
    } else {
      this.schema.supplierAssignments.push(cloned);
    }
    this.save();
  }

  public getSupplierAssignmentById(idOrPublicId: string): SupplierAssignment | undefined {
    const a = this.schema.supplierAssignments.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return a ? JSON.parse(JSON.stringify(a)) : undefined;
  }

  public getSupplierAssignmentByOrderReadiness(orderReadinessId: string): SupplierAssignment | undefined {
    // Return active or latest assignment
    const a = this.schema.supplierAssignments.find(
      (item) => item.orderReadinessId === orderReadinessId && item.status === 'ASSIGNED'
    );
    if (a) return JSON.parse(JSON.stringify(a));
    // If none assigned, check for any latest
    const anyA = this.schema.supplierAssignments
      .filter((item) => item.orderReadinessId === orderReadinessId)
      .pop();
    return anyA ? JSON.parse(JSON.stringify(anyA)) : undefined;
  }

  public getSupplierAssignmentsBySupplier(supplierId: string): SupplierAssignment[] {
    return this.schema.supplierAssignments
      .filter((item) => item.supplierId === supplierId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public getAllSupplierAssignments(): SupplierAssignment[] {
    return this.schema.supplierAssignments.map((item) => JSON.parse(JSON.stringify(item)));
  }

  // ==========================================
  // STEP 10: LOGISTICS ASSIGNMENT & OFFER METHODS
  // ==========================================

  public saveLogisticsOffer(offer: LogisticsOperationalOffer): void {
    const cloned = JSON.parse(JSON.stringify(offer));
    const idx = this.schema.logisticsOffers.findIndex((o) => o.id === offer.id);
    if (idx >= 0) {
      this.schema.logisticsOffers[idx] = cloned;
    } else {
      this.schema.logisticsOffers.push(cloned);
    }
    this.save();
  }

  public getLogisticsOfferById(idOrPublicId: string): LogisticsOperationalOffer | undefined {
    const offer = this.schema.logisticsOffers.find(
      (o) => o.id === idOrPublicId || o.publicId === idOrPublicId
    );
    return offer ? JSON.parse(JSON.stringify(offer)) : undefined;
  }

  public getLogisticsOffersByOrderReadiness(orderReadinessId: string): LogisticsOperationalOffer[] {
    return this.schema.logisticsOffers
      .filter((o) => o.orderReadinessId === orderReadinessId)
      .map((o) => JSON.parse(JSON.stringify(o)));
  }

  public getLogisticsOffersByLogisticsPartner(logisticsPartnerId: string): LogisticsOperationalOffer[] {
    return this.schema.logisticsOffers
      .filter((o) => o.logisticsPartnerId === logisticsPartnerId)
      .map((o) => JSON.parse(JSON.stringify(o)));
  }

  public saveLogisticsAssignment(assignment: LogisticsAssignment): void {
    const cloned = JSON.parse(JSON.stringify(assignment));
    const idx = this.schema.logisticsAssignments.findIndex((a) => a.id === assignment.id);
    if (idx >= 0) {
      this.schema.logisticsAssignments[idx] = cloned;
    } else {
      this.schema.logisticsAssignments.push(cloned);
    }
    this.save();
  }

  public getLogisticsAssignmentById(idOrPublicId: string): LogisticsAssignment | undefined {
    const a = this.schema.logisticsAssignments.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return a ? JSON.parse(JSON.stringify(a)) : undefined;
  }

  public getLogisticsAssignmentByOrderReadiness(orderReadinessId: string): LogisticsAssignment | undefined {
    // Return active assignment first
    const a = this.schema.logisticsAssignments.find(
      (item) => item.orderReadinessId === orderReadinessId && item.status === 'ASSIGNED'
    );
    if (a) return JSON.parse(JSON.stringify(a));
    // If none assigned, return latest
    const anyA = this.schema.logisticsAssignments
      .filter((item) => item.orderReadinessId === orderReadinessId)
      .pop();
    return anyA ? JSON.parse(JSON.stringify(anyA)) : undefined;
  }

  public getLogisticsAssignmentsByLogisticsPartner(partnerId: string): LogisticsAssignment[] {
    return this.schema.logisticsAssignments
      .filter((item) => item.logisticsPartnerId === partnerId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public getAllLogisticsAssignments(): LogisticsAssignment[] {
    return this.schema.logisticsAssignments.map((item) => JSON.parse(JSON.stringify(item)));
  }

  // ==========================================
  // STEP 11A: FINAL PRICING ENGINE METHODS
  // ==========================================

  public saveFinalPricingResult(result: FinalPricingCalculationResult): void {
    const cloned = JSON.parse(JSON.stringify(result));
    const idx = this.schema.finalPricingResults.findIndex((r) => r.id === result.id);
    if (idx >= 0) {
      this.schema.finalPricingResults[idx] = cloned;
    } else {
      this.schema.finalPricingResults.push(cloned);
    }
    this.save();
  }

  public getFinalPricingResultById(idOrPublicId: string): FinalPricingCalculationResult | undefined {
    const r = this.schema.finalPricingResults.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getFinalPricingResultByOrderReadiness(orderReadinessId: string): FinalPricingCalculationResult | undefined {
    // Return latest calculated or active result
    const results = this.schema.finalPricingResults.filter(
      (item) => item.orderReadinessId === orderReadinessId
    );
    if (results.length === 0) return undefined;
    // Prefer CALCULATED, or return latest
    const calculated = results.find((r) => r.status === 'CALCULATED');
    if (calculated) return JSON.parse(JSON.stringify(calculated));
    return JSON.parse(JSON.stringify(results[results.length - 1]));
  }

  public getAllFinalPricingResults(): FinalPricingCalculationResult[] {
    return this.schema.finalPricingResults.map((item) => JSON.parse(JSON.stringify(item)));
  }

  // ==========================================
  // STEP 11B: ORDER DATABASE METHODS
  // ==========================================

  public saveOrder(order: Order): void {
    const cloned = JSON.parse(JSON.stringify(order));
    const idx = this.schema.orders.findIndex((o) => o.id === order.id);
    if (idx >= 0) {
      this.schema.orders[idx] = cloned;
    } else {
      this.schema.orders.push(cloned);
    }
    this.save();
  }

  public getOrderById(idOrPublicId: string): Order | undefined {
    const o = this.schema.orders.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId || item.orderReference === idOrPublicId
    );
    return o ? JSON.parse(JSON.stringify(o)) : undefined;
  }

  public getOrderByOrderReadiness(orderReadinessId: string): Order | undefined {
    const o = this.schema.orders.find((item) => item.orderReadinessId === orderReadinessId);
    return o ? JSON.parse(JSON.stringify(o)) : undefined;
  }

  public getOrderByAgreementId(campaignAgreementId: string): Order | undefined {
    const o = this.schema.orders.find((item) => item.campaignAgreementId === campaignAgreementId);
    return o ? JSON.parse(JSON.stringify(o)) : undefined;
  }

  public getOrderByIdempotencyKey(key: string): Order | undefined {
    const o = this.schema.orders.find((item) => item.idempotencyKey && item.idempotencyKey === key);
    return o ? JSON.parse(JSON.stringify(o)) : undefined;
  }

  public getOrdersByAdvertiser(advertiserId: string): Order[] {
    return this.schema.orders
      .filter((item) => item.advertiserId === advertiserId)
      .map((item) => JSON.parse(JSON.stringify(item)));
  }

  public getAllOrders(): Order[] {
    return this.schema.orders.map((item) => JSON.parse(JSON.stringify(item)));
  }

  // ==========================================
  // Step 11C: Immutable Order Pricing Snapshots & Payment Readiness
  // ==========================================

  public saveOrderPricingSnapshot(snapshot: OrderPricingSnapshot): OrderPricingSnapshot {
    const existing = this.schema.orderPricingSnapshots.find(
      (s) => s.id === snapshot.id || s.publicId === snapshot.publicId || s.orderId === snapshot.orderId
    );

    if (existing) {
      // Financial immutability check
      if (
        existing.grandTotal.amountMinor !== snapshot.grandTotal.amountMinor ||
        existing.productPrice.productPriceTotalMinor !== snapshot.productPrice.productPriceTotalMinor ||
        existing.logisticsCost.logisticsCostTotalMinor !== snapshot.logisticsCost.logisticsCostTotalMinor ||
        existing.taxes.totalTaxMinor !== snapshot.taxes.totalTaxMinor
      ) {
        throw new ConflictError(
          `Order Pricing Snapshot is strictly immutable: Cannot overwrite snapshot for Order '${snapshot.orderPublicId}' with different financial amounts.`
        );
      }
      return JSON.parse(JSON.stringify(existing));
    }

    const cloned = JSON.parse(JSON.stringify(snapshot));
    this.schema.orderPricingSnapshots.push(cloned);
    this.save();
    return cloned;
  }

  public getOrderPricingSnapshotById(idOrPublicId: string): OrderPricingSnapshot | undefined {
    const s = this.schema.orderPricingSnapshots.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public getOrderPricingSnapshotByOrderId(orderIdOrPublicId: string): OrderPricingSnapshot | undefined {
    const s = this.schema.orderPricingSnapshots.find(
      (item) => item.orderId === orderIdOrPublicId || item.orderPublicId === orderIdOrPublicId
    );
    return s ? JSON.parse(JSON.stringify(s)) : undefined;
  }

  public getAllOrderPricingSnapshots(): OrderPricingSnapshot[] {
    return this.schema.orderPricingSnapshots.map((item) => JSON.parse(JSON.stringify(item)));
  }

  public saveOrderPaymentReadiness(record: OrderPaymentReadiness): OrderPaymentReadiness {
    const cloned = JSON.parse(JSON.stringify(record));
    const idx = this.schema.orderPaymentReadinessRecords.findIndex(
      (r) => r.id === record.id || r.publicId === record.publicId || r.orderId === record.orderId
    );
    if (idx >= 0) {
      this.schema.orderPaymentReadinessRecords[idx] = cloned;
    } else {
      this.schema.orderPaymentReadinessRecords.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getOrderPaymentReadinessById(idOrPublicId: string): OrderPaymentReadiness | undefined {
    const r = this.schema.orderPaymentReadinessRecords.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getOrderPaymentReadinessByOrderId(orderIdOrPublicId: string): OrderPaymentReadiness | undefined {
    const r = this.schema.orderPaymentReadinessRecords.find(
      (item) => item.orderId === orderIdOrPublicId || item.orderPublicId === orderIdOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getAllOrderPaymentReadiness(): OrderPaymentReadiness[] {
    return this.schema.orderPaymentReadinessRecords.map((item) => JSON.parse(JSON.stringify(item)));
  }

  // ==========================================
  // STEP 12: PAYMENT & PAYMENT ATTEMPTS
  // ==========================================

  public savePayment(payment: Payment): Payment {
    const cloned = JSON.parse(JSON.stringify(payment));
    const idx = this.schema.payments.findIndex(
      (p) => p.id === payment.id || p.publicId === payment.publicId
    );
    if (idx >= 0) {
      this.schema.payments[idx] = cloned;
    } else {
      this.schema.payments.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getPaymentById(idOrPublicId: string): Payment | undefined {
    const p = this.schema.payments.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return p ? JSON.parse(JSON.stringify(p)) : undefined;
  }

  public getPaymentByOrderId(orderIdOrPublicId: string): Payment | undefined {
    const p = this.schema.payments.find(
      (item) => item.orderId === orderIdOrPublicId || item.orderPublicId === orderIdOrPublicId
    );
    return p ? JSON.parse(JSON.stringify(p)) : undefined;
  }

  public getPaymentByIdempotencyKey(key: string): Payment | undefined {
    const p = this.schema.payments.find((item) => item.idempotencyKey === key);
    return p ? JSON.parse(JSON.stringify(p)) : undefined;
  }

  public getAllPayments(): Payment[] {
    return this.schema.payments.map((p) => JSON.parse(JSON.stringify(p)));
  }

  public savePaymentAttempt(attempt: PaymentAttempt): PaymentAttempt {
    const cloned = JSON.parse(JSON.stringify(attempt));
    const idx = this.schema.paymentAttempts.findIndex(
      (a) => a.id === attempt.id || a.publicId === attempt.publicId
    );
    if (idx >= 0) {
      this.schema.paymentAttempts[idx] = cloned;
    } else {
      this.schema.paymentAttempts.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getPaymentAttemptsByPaymentId(paymentId: string): PaymentAttempt[] {
    return this.schema.paymentAttempts
      .filter((a) => a.paymentId === paymentId)
      .map((a) => JSON.parse(JSON.stringify(a)));
  }

  public getPaymentAttemptsByOrderId(orderId: string): PaymentAttempt[] {
    return this.schema.paymentAttempts
      .filter((a) => a.orderId === orderId)
      .map((a) => JSON.parse(JSON.stringify(a)));
  }

  public getPaymentAttemptById(idOrPublicId: string): PaymentAttempt | undefined {
    const a = this.schema.paymentAttempts.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return a ? JSON.parse(JSON.stringify(a)) : undefined;
  }

  // ==========================================
  // STEP 12D: PAYMENT WEBHOOKS & RECONCILIATION
  // ==========================================

  public saveWebhookEventRecord(record: WebhookEventRecord): WebhookEventRecord {
    const cloned = JSON.parse(JSON.stringify(record));
    const idx = this.schema.webhookEventRecords.findIndex(
      (r) => r.id === record.id || r.providerEventId === record.providerEventId
    );
    if (idx >= 0) {
      this.schema.webhookEventRecords[idx] = cloned;
    } else {
      this.schema.webhookEventRecords.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getWebhookEventRecord(providerEventId: string): WebhookEventRecord | undefined {
    const r = this.schema.webhookEventRecords.find((item) => item.providerEventId === providerEventId);
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getAllWebhookEventRecords(): WebhookEventRecord[] {
    return this.schema.webhookEventRecords.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public savePaymentReconciliationRecord(record: PaymentReconciliationRecord): PaymentReconciliationRecord {
    const cloned = JSON.parse(JSON.stringify(record));
    const idx = this.schema.paymentReconciliationRecords.findIndex(
      (r) => r.id === record.id || r.publicId === record.publicId
    );
    if (idx >= 0) {
      this.schema.paymentReconciliationRecords[idx] = cloned;
    } else {
      this.schema.paymentReconciliationRecords.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getPaymentReconciliationRecordById(idOrPublicId: string): PaymentReconciliationRecord | undefined {
    const r = this.schema.paymentReconciliationRecords.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getPaymentReconciliationRecordsByOrderId(orderIdOrPublicId: string): PaymentReconciliationRecord[] {
    return this.schema.paymentReconciliationRecords
      .filter((r) => r.orderId === orderIdOrPublicId || r.orderPublicId === orderIdOrPublicId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public getPaymentReconciliationRecordsByPaymentId(paymentIdOrPublicId: string): PaymentReconciliationRecord[] {
    return this.schema.paymentReconciliationRecords
      .filter((r) => r.paymentId === paymentIdOrPublicId || r.paymentPublicId === paymentIdOrPublicId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public getAllPaymentReconciliationRecords(): PaymentReconciliationRecord[] {
    return this.schema.paymentReconciliationRecords.map((r) => JSON.parse(JSON.stringify(r)));
  }

  // ==========================================
  // STEP 12E: FINANCIAL LEDGER & VENUE COMPENSATION
  // ==========================================

  public saveFinancialLedgerEntry(entry: FinancialLedgerEntry): FinancialLedgerEntry {
    const cloned = JSON.parse(JSON.stringify(entry));
    const idx = this.schema.financialLedgerEntries.findIndex(
      (e) => e.id === entry.id || e.publicId === entry.publicId
    );
    if (idx >= 0) {
      this.schema.financialLedgerEntries[idx] = cloned;
    } else {
      this.schema.financialLedgerEntries.push(cloned);
    }
    this.save();
    return cloned;
  }

  public saveFinancialLedgerEntries(entries: FinancialLedgerEntry[]): FinancialLedgerEntry[] {
    const saved: FinancialLedgerEntry[] = [];
    for (const entry of entries) {
      const cloned = JSON.parse(JSON.stringify(entry));
      const idx = this.schema.financialLedgerEntries.findIndex(
        (e) => e.id === entry.id || e.publicId === entry.publicId
      );
      if (idx >= 0) {
        this.schema.financialLedgerEntries[idx] = cloned;
      } else {
        this.schema.financialLedgerEntries.push(cloned);
      }
      saved.push(cloned);
    }
    this.save();
    return saved;
  }

  public getFinancialLedgerEntryById(idOrPublicId: string): FinancialLedgerEntry | undefined {
    const e = this.schema.financialLedgerEntries.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return e ? JSON.parse(JSON.stringify(e)) : undefined;
  }

  public getFinancialLedgerEntriesByOrderId(orderIdOrPublicId: string): FinancialLedgerEntry[] {
    return this.schema.financialLedgerEntries
      .filter((e) => e.orderId === orderIdOrPublicId || e.orderPublicId === orderIdOrPublicId)
      .map((e) => JSON.parse(JSON.stringify(e)));
  }

  public getFinancialLedgerEntriesByPaymentId(paymentIdOrPublicId: string): FinancialLedgerEntry[] {
    return this.schema.financialLedgerEntries
      .filter((e) => e.paymentId === paymentIdOrPublicId || e.paymentPublicId === paymentIdOrPublicId)
      .map((e) => JSON.parse(JSON.stringify(e)));
  }

  public getAllFinancialLedgerEntries(): FinancialLedgerEntry[] {
    return this.schema.financialLedgerEntries.map((e) => JSON.parse(JSON.stringify(e)));
  }

  public saveVenueCompensationRecord(record: VenueCompensationRecord): VenueCompensationRecord {
    const cloned = JSON.parse(JSON.stringify(record));
    const idx = this.schema.venueCompensationRecords.findIndex(
      (r) => r.id === record.id || r.publicId === record.publicId
    );
    if (idx >= 0) {
      this.schema.venueCompensationRecords[idx] = cloned;
    } else {
      this.schema.venueCompensationRecords.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getVenueCompensationRecordById(idOrPublicId: string): VenueCompensationRecord | undefined {
    const r = this.schema.venueCompensationRecords.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return r ? JSON.parse(JSON.stringify(r)) : undefined;
  }

  public getVenueCompensationRecordsByOrderId(orderIdOrPublicId: string): VenueCompensationRecord[] {
    return this.schema.venueCompensationRecords
      .filter((r) => r.orderId === orderIdOrPublicId || r.orderPublicId === orderIdOrPublicId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public getVenueCompensationRecordsByVenueId(venueIdOrPublicId: string): VenueCompensationRecord[] {
    return this.schema.venueCompensationRecords
      .filter((r) => r.venueId === venueIdOrPublicId || r.venuePublicId === venueIdOrPublicId)
      .map((r) => JSON.parse(JSON.stringify(r)));
  }

  public getAllVenueCompensationRecords(): VenueCompensationRecord[] {
    return this.schema.venueCompensationRecords.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public saveFulfillmentAuthorization(auth: FulfillmentAuthorization): FulfillmentAuthorization {
    const cloned = JSON.parse(JSON.stringify(auth));
    const idx = this.schema.fulfillmentAuthorizations.findIndex(
      (a) => a.id === auth.id || a.publicId === auth.publicId
    );
    if (idx >= 0) {
      this.schema.fulfillmentAuthorizations[idx] = cloned;
    } else {
      this.schema.fulfillmentAuthorizations.push(cloned);
    }
    this.save();
    return cloned;
  }

  public getFulfillmentAuthorizationById(idOrPublicId: string): FulfillmentAuthorization | undefined {
    const a = this.schema.fulfillmentAuthorizations.find(
      (item) => item.id === idOrPublicId || item.publicId === idOrPublicId
    );
    return a ? JSON.parse(JSON.stringify(a)) : undefined;
  }

  public getFulfillmentAuthorizationByOrderId(orderIdOrPublicId: string): FulfillmentAuthorization | undefined {
    const a = this.schema.fulfillmentAuthorizations.find(
      (item) => item.orderId === orderIdOrPublicId || item.orderPublicId === orderIdOrPublicId
    );
    return a ? JSON.parse(JSON.stringify(a)) : undefined;
  }

  public getAllFulfillmentAuthorizations(): FulfillmentAuthorization[] {
    return this.schema.fulfillmentAuthorizations.map((a) => JSON.parse(JSON.stringify(a)));
  }
}

export const db = new DatabaseService();
