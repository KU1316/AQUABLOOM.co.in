/**
 * AquaBloom Core Type Definitions — Step 1: Foundation
 * 
 * Strict boundary definition for User Roles, Visibility Scopes,
 * System Events, and Entity Identifiers.
 */

export type UserRole = 
  | 'ADVERTISER'
  | 'VENUE'
  | 'SUPPLIER'
  | 'LOGISTICS_PARTNER'
  | 'ADMIN';

export const PUBLIC_ROLES: UserRole[] = [
  'ADVERTISER',
  'VENUE',
  'SUPPLIER',
  'LOGISTICS_PARTNER'
];

export type VisibilityScope = 
  | 'PRIVATE'
  | 'ROLE_SHARED'
  | 'TRANSACTION_SHARED'
  | 'PUBLIC'
  | 'INTERNAL_ADMIN';

export type EventCategory = 
  | 'BUSINESS_TIMELINE'
  | 'AUDIT_EVENTS'
  | 'ANALYTICS_EVENTS';

/**
 * Account Lifecycle States
 * Governs the security and authentication lifecycle of the account.
 */
export type AccountStatus = 
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'RESTRICTED'
  | 'PENDING_REVIEW'
  | 'REJECTED'
  | 'DEACTIVATED';

/**
 * Operational Approval Status
 * Applies to Supplier and Logistics Partner accounts before becoming active in commercial matching.
 */
export type ApprovalStatus = 
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'MORE_INFORMATION';

/**
 * Venue Visibility States
 * Governs marketplace discoverability without leaking private property details.
 */
export type VenueVisibilityState = 
  | 'PRIVATE'
  | 'PUBLIC_ELIGIBLE'
  | 'PUBLIC';

/**
 * Prepared architecture for profile versioning and transaction snapshots.
 */
export type ChangeImpactClassification = 
  | 'FUTURE_TRANSACTIONS'
  | 'AFFECTED_ACTIVE_WORKFLOW'
  | 'NO_IMPACT';

export interface User {
  id: string; // Internal stable identifier, e.g. usr_xyz123
  publicAccountId: string; // Unguessable public account identifier, e.g. AB-ACC-8F2K9M-2026
  email: string;
  role: UserRole;
  organizationName: string;
  contactName: string;
  phone?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  status: AccountStatus;
}

export interface ProfileCompletion {
  isComplete: boolean;
  percentage: number;
  missingRequiredFields: string[];
}

export interface BaseProfileMetadata {
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  changeImpact?: ChangeImpactClassification;
}

// 1. ADVERTISER PROFILE
export interface AdvertiserProfile extends BaseProfileMetadata {
  role: 'ADVERTISER';
  accountId: string;
  brandName: string;
  industry: string;
  description: string;
  primaryContact: {
    name: string;
    email: string;
    phone?: string;
    title?: string;
  };
  location: {
    city: string;
    stateRegion?: string;
    country: string;
  };
  websiteUrl?: string;
  advertisingCategory?: string;
  targetAudience?: {
    demographics?: string;
    targetVenueTypes?: string[];
    preferredReach?: string;
  };
  campaignPreferences?: {
    sustainabilityFocus?: boolean;
    preferredLeadTimeWeeks?: number;
  };
  completion: ProfileCompletion;
}

// 2. VENUE PROFILE
export interface VenueProfile extends BaseProfileMetadata {
  role: 'VENUE';
  accountId: string;
  venueName: string;
  venueType: string;
  description: string;
  location: {
    address?: string;
    city: string;
    stateRegion?: string;
    postalCode?: string;
    country: string;
  };
  audienceCategory: string;
  footfall: {
    monthlyVisitors: number;
    peakTrafficTimes?: string;
  };
  bottleConsumption: {
    estimatedMonthlyBottles: number;
    consumptionRateNotes?: string;
  };
  capacity: {
    maxBottleHoldingCapacity: number;
    currentOngoingBottleCommitment: number;
    availableBottleCapacity: number;
  };
  campaignAvailability: string; // 'YEAR_ROUND' | 'SEASONAL' | 'EVENT_BASED' | 'CURRENTLY_ACCEPTING'
  campaignPreferences?: {
    acceptedCategories?: string[];
    forbiddenCategories?: string[];
  };
  placementPossibilities?: string[];
  operationalContact: {
    coordinatorName: string;
    email: string;
    phone?: string;
    dockNotes?: string;
  };
  visibilityState: VenueVisibilityState;
  completion: ProfileCompletion;
}

// 3. SUPPLIER PROFILE
export interface SupplierProfile extends BaseProfileMetadata {
  role: 'SUPPLIER';
  accountId: string;
  supplierBusinessName: string;
  description: string;
  primaryContact: {
    name: string;
    email: string;
    phone?: string;
    role?: string;
  };
  operatingLocation: {
    facilityCity: string;
    stateProvince?: string;
    country: string;
  };
  capabilities: {
    waterTypes: string[];
    bottleMaterials: string[];
    bottleSizes: string[];
    bottleShapes: string[];
    printingFinishes: string[];
  };
  productionCapacity: {
    bottlesPerMonth: number;
    minimumRunSize: number;
  };
  leadTimeInfo: {
    standardTurnaroundDays: number;
    rushOrderAvailable?: boolean;
  };
  operationalStatus: 'OPERATING' | 'MAINTENANCE' | 'UPGRADING';
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  completion: ProfileCompletion;
}

// 4. LOGISTICS PARTNER PROFILE
export interface LogisticsProfile extends BaseProfileMetadata {
  role: 'LOGISTICS_PARTNER';
  accountId: string;
  businessName: string;
  description: string;
  primaryContact: {
    name: string;
    email: string;
    phone?: string;
    dispatchTitle?: string;
  };
  operatingLocation: {
    hubCity: string;
    stateRegion?: string;
    country: string;
  };
  serviceAreas: string[];
  fleetCapabilities: {
    vehicleTypes: string[];
    temperatureControlled: boolean;
  };
  shipmentCapacity: {
    palletsPerWeek: number;
    maxPayloadWeightKg?: number;
  };
  pickupCapability: string;
  deliveryCapability: string;
  operationalAvailability: string;
  approvalStatus: ApprovalStatus;
  approvalNotes?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  completion: ProfileCompletion;
}

export type UserProfile = 
  | AdvertiserProfile 
  | VenueProfile 
  | SupplierProfile 
  | LogisticsProfile;

export interface Session {
  id: string; // ses_xyz
  userId: string;
  token: string;
  role: UserRole;
  expiresAt: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface AppEvent {
  id: string;
  category: EventCategory;
  eventType: string;
  userId?: string;
  role?: UserRole;
  scope: VisibilityScope;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface RegisterInput {
  email: string;
  password?: string;
  role: UserRole;
  organizationName: string;
  contactName: string;
  phone?: string;
}

export interface LoginInput {
  email: string;
  password?: string;
}

export interface IdempotencyRecord {
  key: string;
  userId?: string;
  path: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: string;
}

/**
 * Prefix types for public business entities
 */
export type BusinessEntityPrefix = 
  | 'AB-ACC' // Account / Profile
  | 'AB-CMP' // Campaign
  | 'AB-CMV' // Campaign Version Snapshot
  | 'AB-PRP' // Campaign Proposal
  | 'AB-CAG' // Campaign Agreement
  | 'AB-CGV' // Campaign Agreement Version
  | 'AB-CGS' // Campaign Agreement Snapshot
  | 'AB-ORD' // Order
  | 'AB-ORDR' // Order Readiness
  | 'AB-DHO' // Data Handoff
  | 'AB-SAS' // Supplier Assignment
  | 'AB-SOO' // Supplier Operational Offer
  | 'AB-LAS' // Logistics Assignment
  | 'AB-LOO' // Logistics Operational Offer
  | 'AB-PRD' // Product Master Entity
  | 'AB-PRV' // Product Version Snapshot
  | 'AB-FPR' // Final Pricing Result (Step 11A)
  | 'AB-PAY' // Payment Record (Step 12B)
  | 'AB-PMA' // Payment Attempt Record (Step 12B)
  | 'AB-PRC' // Payment Reconciliation Record (Step 12D)
  | 'AB-FFA'; // Fulfillment Authorization Record (Step 12F)

/**
 * ==========================================
 * STEP 3: SUPPLIER PRODUCT CATALOG TYPES
 * ==========================================
 */

/**
 * Product Lifecycle States
 * Kept separate from operational availability.
 */
export type ProductStatus = 
  | 'DRAFT'
  | 'ACTIVE'
  | 'INACTIVE'
  | 'DISCONTINUED';

/**
 * Supplier-declared Product Availability
 * Distinct from warehouse inventory and lifecycle status.
 */
export type ProductAvailability = 
  | 'AVAILABLE'
  | 'LIMITED'
  | 'UNAVAILABLE';

export type LeadTimeUnit = 'DAYS' | 'WEEKS';

export interface LeadTime {
  value: number;
  unit: LeadTimeUnit;
}

export interface Money {
  amount: number;
  currency: 'INR';
}

export interface ProductCapacityMetrics {
  unitsPerMonth?: number;
  maxBatchRun?: number;
  notes?: string;
}

export interface ProductSpecifications {
  bottleMaterial: string; // e.g. '100% rPET', 'Aluminum', 'Glass Flint', 'Virgin Eco-PET'
  bottleCapacityMl: number; // Numeric volume, e.g. 250, 330, 500, 750, 1000
  volumeLabel: string; // e.g. '500 ml Standard', '330 ml Sleek Can'
  bottleShape: string; // e.g. 'Classic Cylinder', 'Sleek Slimline', 'Square Contour'
  bottleType: string; // e.g. 'Standard Bottle', 'Sleek Can', 'Flask Profile'
  capType: string; // e.g. 'Screw Cap (Tamper-Evident)', 'Crown Cap', 'Sport Cap'
  bottleFinish: string; // e.g. 'Clear Gloss', 'Frosted Matte', 'Amber UV-Tint'
  labelType: string; // e.g. 'Full-Wrap Shrink Sleeve', 'Pressure-Sensitive Label', 'Direct Screen Print'
  printingCapability: string; // e.g. 'Up to 8 Colors UV Flexo', 'Digital CMYK Full-Color'
  finishingOptions: string[]; // e.g. ['Matte Soft-Touch', 'Spot UV Highlighting', 'Metallic Hot Foil']
  packagingConfiguration: string; // e.g. '24 bottles per case, shrink-wrapped'
}

/**
 * Versioned Product Pricing & Operational Snapshot
 * Protects historical transactions from destructive price mutations.
 */
export interface ProductVersion {
  id: string; // prv_...
  publicVersionId: string; // AB-PRV-...
  productId: string; // prd_...
  versionNumber: number;
  effectiveFrom: string; // ISO date/time
  effectiveUntil: string | null; // ISO date/time or null if current active version
  customerFacingPrice: Money; // Inclusive of bottle, label, printing, and finishing
  supplierInternalCost?: Money; // Strictly private to owning supplier or admin
  minimumOrderQuantity: number;
  productionLeadTime: LeadTime;
  specifications: ProductSpecifications;
  changeReason?: string;
  changeImpact: ChangeImpactClassification;
  createdAt: string;
  createdBy: string;
}

/**
 * Authoritative Master Product Entity
 */
export interface Product {
  id: string; // Internal stable identifier, e.g. prd_xyz123
  publicProductId: string; // Non-sequential public ID, e.g. AB-PRD-8F2K9M-2026
  supplierId: string; // Internal user ID of owning supplier
  name: string;
  description: string;
  category: string; // e.g. 'Natural Spring Water', 'Sparkling Mineral', 'Electrolyte Alkaline'
  status: ProductStatus;
  availability: ProductAvailability;
  currentVersionNumber: number;
  activeVersionId: string; // Pointer to current effective ProductVersion
  specifications: ProductSpecifications;
  customerFacingPrice: Money; // Current effective customer price
  supplierInternalCost?: Money; // Private cost component (optional, strictly hidden from advertisers)
  minimumOrderQuantity: number; // MOQ (positive numeric)
  productionLeadTime: LeadTime;
  productionCapacity?: ProductCapacityMetrics;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  changeImpact?: ChangeImpactClassification;
}

/**
 * Sanitized Marketplace/Customer-Facing Product Model
 * Strict boundary: completely hides supplier internal costs, margins, and private contact notes.
 */
export interface CustomerFacingProductSummary {
  publicProductId: string;
  name: string;
  description: string;
  category: string;
  status: ProductStatus;
  availability: ProductAvailability;
  versionNumber: number;
  specifications: ProductSpecifications;
  customerFacingPrice: Money;
  minimumOrderQuantity: number;
  productionLeadTime: LeadTime;
  updatedAt: string;
}

export interface CreateProductInput {
  name: string;
  description: string;
  category: string;
  status?: 'DRAFT' | 'ACTIVE';
  availability?: ProductAvailability;
  specifications: ProductSpecifications;
  customerFacingPrice: {
    amount: number;
    currency?: 'INR';
  };
  supplierInternalCost?: {
    amount: number;
    currency?: 'INR';
  };
  minimumOrderQuantity: number;
  productionLeadTime: {
    value: number;
    unit: LeadTimeUnit;
  };
  productionCapacity?: ProductCapacityMetrics;
  effectiveFrom?: string; // Optional custom effective date
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  category?: string;
  availability?: ProductAvailability;
  productionCapacity?: ProductCapacityMetrics;
}

export interface CreateProductVersionInput {
  effectiveFrom?: string; // Defaults to now
  customerFacingPrice: {
    amount: number;
    currency?: 'INR';
  };
  supplierInternalCost?: {
    amount: number;
    currency?: 'INR';
  };
  minimumOrderQuantity: number;
  productionLeadTime: {
    value: number;
    unit: LeadTimeUnit;
  };
  specifications?: Partial<ProductSpecifications>;
  changeReason?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

/**
 * ==========================================
 * STEP 4: ADVERTISER CAMPAIGN ENGINE TYPES
 * ==========================================
 */

export type CampaignStatus =
  | 'DRAFT'
  | 'READY_FOR_MATCHING'
  | 'MATCHING'
  | 'PROPOSAL_ACTIVE'
  | 'AGREEMENT_PENDING'
  | 'AGREEMENT_LOCKED'
  | 'ORDER_IN_PROGRESS'
  | 'IN_PRODUCTION'
  | 'ACTIVE'
  | 'AT_RISK'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESOLVED';

export type CampaignDurationUnit = 'DAYS' | 'WEEKS' | 'MONTHS';

export interface CampaignDuration {
  value: number;
  unit: CampaignDurationUnit;
}

export interface PreferredStartPeriod {
  label: string; // e.g. "Q4 2026", "Immediate (Next 30 Days)", "November 2026"
  windowStart?: string; // Optional approximate ISO date
  windowEnd?: string; // Optional approximate ISO date
  notes?: string;
}

export interface CampaignTargetAudience {
  demographics?: string;
  characteristics: string[];
  interests?: string[];
  ageGroups?: string[];
}

export interface PreferredLocation {
  city: string;
  stateRegion?: string;
  area?: string;
  country: string;
}

export interface CampaignVenueRequirements {
  preferredVenueTypes: string[];
  preferredLocations: PreferredLocation[];
  campaignPreferences?: string[];
  placementRequirements: string[];
}

export interface CampaignBottleRequirements {
  requiredQuantity: number; // positive integer
  preferredVolumeMl?: number;
  volumeLabel?: string;
  preferredMaterial?: string;
  preferredShape?: string;
  bottleType?: string;
  capType?: string;
  bottleFinish?: string;
  labelType?: string;
  printingCapability?: string;
  packagingConfiguration?: string;
  notes?: string;
}

export interface CampaignDistributionRequirements {
  placementDetails: string;
  estimatedDistributionPace?: string;
  refrigerationRequired?: boolean;
  handlingNotes?: string;
}

export type CollaborationRequirementStatus =
  | 'NOT_REQUIRED'
  | 'OPEN_TO_COLLABORATION'
  | 'REQUIRED';

export interface CollaborationRequirement {
  status: CollaborationRequirementStatus;
  preferredTerms?: string;
  notes?: string;
}

export interface CampaignEligibilityRequirements {
  venueCriteria?: string[];
  minimumFootfall?: number;
  excludedVenueTypes?: string[];
  notes?: string;
}

export interface PublishedBudget {
  disclosed: boolean;
  minAmount?: number;
  maxAmount?: number;
  currency: 'INR';
}

/**
 * Authoritative Master Campaign Entity
 */
export interface Campaign {
  id: string; // Internal stable ID, e.g. cmp_xyz123
  publicCampaignId: string; // Non-sequential public ID, e.g. AB-CMP-8F2K9M-2026
  advertiserId: string; // Internal user ID of owning Advertiser
  name: string;
  description: string;
  category: string; // e.g. "Technology", "Beverage & Hospitality", "Wellness & Fitness"
  objective: string; // e.g. "Brand Awareness", "Product Launch"
  targetAudience: CampaignTargetAudience;
  venueRequirements: CampaignVenueRequirements;
  bottleRequirements: CampaignBottleRequirements;
  timing: {
    duration: CampaignDuration;
    preferredStartPeriod: PreferredStartPeriod;
  };
  distributionRequirements: CampaignDistributionRequirements;
  collaborationRequirement: CollaborationRequirement;
  eligibilityRequirements?: CampaignEligibilityRequirements;
  proposalDeadline?: string; // ISO date string where applicable
  publishedBudget?: PublishedBudget;
  status: CampaignStatus;
  currentVersionNumber: number;
  activeVersionId: string;
  changeImpact?: ChangeImpactClassification;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Versioned Campaign Record
 */
export interface CampaignVersion {
  id: string; // cmv_...
  publicVersionId: string; // AB-CMV-...
  campaignId: string; // cmp_...
  versionNumber: number;
  snapshot: Campaign;
  changedFields: string[];
  changeReason?: string;
  changeImpact: ChangeImpactClassification;
  createdAt: string;
  createdBy: string;
}

/**
 * Public Opportunity Projection for Future Venue Discovery
 * Strict boundary: never exposes private contact details, internal notes, supplier information,
 * margins, internal financial ledgers, or private audit logs.
 */
export interface CampaignOpportunityView {
  publicCampaignId: string;
  name: string;
  category: string;
  objective: string;
  targetAudience: {
    characteristics: string[];
    demographics?: string;
    ageGroups?: string[];
  };
  preferredVenueTypes: string[];
  preferredLocations: PreferredLocation[];
  requiredQuantity: number;
  expectedDuration: CampaignDuration;
  preferredStartPeriod: PreferredStartPeriod;
  bottleRequirements: {
    requiredQuantity?: number;
    preferredVolumeMl?: number;
    volumeLabel?: string;
    preferredMaterial?: string;
    preferredShape?: string;
    bottleType?: string;
    capType?: string;
    labelType?: string;
  };
  placementRequirements: string[];
  campaignPreferences?: string[];
  collaborationRequirement: CollaborationRequirement;
  eligibilityRequirements?: CampaignEligibilityRequirements;
  publishedBudget?: {
    disclosed: boolean;
    displayRange?: string; // e.g. "₹50,000 – ₹1,00,000" or "Not Disclosed"
    minAmount?: number;
    maxAmount?: number;
    currency: 'INR';
  };
  proposalDeadline?: string;
  status: CampaignStatus;
  updatedAt: string;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  category?: string;
  objective?: string;
  targetAudience?: Partial<CampaignTargetAudience>;
  venueRequirements?: Partial<CampaignVenueRequirements>;
  bottleRequirements?: Partial<CampaignBottleRequirements>;
  timing?: {
    duration?: Partial<CampaignDuration>;
    preferredStartPeriod?: Partial<PreferredStartPeriod>;
  };
  distributionRequirements?: Partial<CampaignDistributionRequirements>;
  collaborationRequirement?: Partial<CollaborationRequirement>;
  eligibilityRequirements?: Partial<CampaignEligibilityRequirements>;
  proposalDeadline?: string;
  publishedBudget?: Partial<PublishedBudget>;
  status?: 'DRAFT' | 'READY_FOR_MATCHING';
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  category?: string;
  objective?: string;
  targetAudience?: Partial<CampaignTargetAudience>;
  venueRequirements?: Partial<CampaignVenueRequirements>;
  bottleRequirements?: Partial<CampaignBottleRequirements>;
  timing?: {
    duration?: Partial<CampaignDuration>;
    preferredStartPeriod?: Partial<PreferredStartPeriod>;
  };
  distributionRequirements?: Partial<CampaignDistributionRequirements>;
  collaborationRequirement?: Partial<CollaborationRequirement>;
  eligibilityRequirements?: Partial<CampaignEligibilityRequirements>;
  proposalDeadline?: string;
  publishedBudget?: Partial<PublishedBudget>;
  changeReason?: string;
}

export interface CampaignValidationError {
  field: string;
  code: string;
  message: string;
}

export interface CampaignValidationResult {
  isValid: boolean;
  errors: CampaignValidationError[];
  missingRequiredFields: string[];
}

/**
 * ==========================================
 * STEP 5: VENUE MARKETPLACE & MATCHING TYPES
 * ==========================================
 */

export type CapacityStatus = 'WITHIN_CAPACITY' | 'OVER_CAPACITY';

export interface CapacityEvaluation {
  status: CapacityStatus;
  maxBottleHoldingCapacity: number;
  currentOngoingBottleCommitment: number;
  availableBottleCapacity: number;
  proposedCampaignQuantity: number;
  capacityOverage: number;
  isWarning: boolean;
  warningMessage?: string;
}

export type MatchReasonType = 'POSITIVE' | 'NEGATIVE' | 'WARNING' | 'NEUTRAL';

export interface MatchReason {
  reasonCode: string;
  reasonType: MatchReasonType;
  description: string;
  impact: number;
  sourceField: string;
  ruleVersion: string;
}

export interface MatchEvaluation {
  campaignId: string;
  venueId: string;
  score: number | null;
  scoreLabel: string;
  hasSufficientData: boolean;
  reasons: MatchReason[];
  ruleVersion: string;
  calculatedAt: string;
}

export interface MarketplaceVenue {
  id: string; // venue account user id
  publicAccountId: string;
  venueName: string;
  venueType: string;
  description: string;
  location: {
    city: string;
    stateRegion?: string;
    country: string;
  };
  audienceCategory: string;
  footfall: {
    monthlyVisitors: number;
    peakTrafficTimes?: string;
  };
  bottleConsumption: {
    estimatedMonthlyBottles: number;
    consumptionRateNotes?: string;
  };
  capacity: {
    maxBottleHoldingCapacity: number;
    currentOngoingBottleCommitment: number;
    availableBottleCapacity: number;
  };
  campaignAvailability: string;
  campaignPreferences?: {
    acceptedCategories?: string[];
    forbiddenCategories?: string[];
  };
  placementPossibilities?: string[];
  visibilityState: VenueVisibilityState;
  // Match & capacity evaluation when evaluated in campaign context
  capacityEvaluation?: CapacityEvaluation;
  matchEvaluation?: MatchEvaluation;
  isMarketplaceEligible: boolean;
}

export interface VenueMarketplaceQuery {
  campaignId?: string;
  search?: string;
  city?: string;
  venueType?: string;
  audienceCategory?: string;
  capacityStatus?: 'ALL' | 'WITHIN_CAPACITY' | 'OVER_CAPACITY';
  minScore?: number;
  minFootfall?: number;
  page?: number;
  pageSize?: number;
  sortBy?: 'MATCH_SCORE' | 'CAPACITY' | 'FOOTFALL' | 'NAME';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface VenueCapacityOverview {
  venueId: string;
  publicAccountId: string;
  venueName: string;
  maxBottleHoldingCapacity: number;
  currentOngoingBottleCommitment: number;
  availableBottleCapacity: number;
  activeCommitmentCount: number;
  commitments: Array<{
    campaignId: string;
    campaignName: string;
    committedQuantity: number;
    status: string;
    startDate?: string;
    endDate?: string;
  }>;
  operationalNotes: string;
}

/**
 * ==========================================
 * STEP 6: PROPOSAL & NEGOTIATION ENGINE TYPES
 * ==========================================
 */

export type ProposalStatus =
  | 'DRAFT'
  | 'SENT'
  | 'VIEWED'
  | 'UNDER_NEGOTIATION'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'READY_FOR_AGREEMENT';

export type DeclineReasonCode =
  | 'TERMS_NOT_ACCEPTABLE'
  | 'TIMING_NOT_SUITABLE'
  | 'QUANTITY_NOT_SUITABLE'
  | 'CAPACITY_ISSUE'
  | 'CAMPAIGN_PREFERENCE_MISMATCH'
  | 'OTHER';

export type CapacityOverageDecisionStatus =
  | 'PENDING'
  | 'ACCEPT_OVERAGE'
  | 'DO_NOT_ACCEPT_OVERAGE';

export interface CapacityOverageDecision {
  status: CapacityOverageDecisionStatus;
  decidedAt?: string;
  decidedBy?: string;
  notes?: string;
}

/**
 * Negotiated venue compensation term.
 * Capped strictly at 12.5% of eligible supplier total bottle advertising cost.
 * Note: Step 6 does NOT calculate final order settlement amount.
 */
export interface VenueCompensationTerms {
  termsDescription?: string;
  proposedPercentage?: number; // e.g., 10 (meaning 10%), maximum 12.5%
  notes?: string;
}

export interface ProposalProductRequirements {
  bottleType?: string;
  preferredVolumeMl?: number;
  volumeLabel?: string;
  preferredMaterial?: string;
  labelType?: string;
  capType?: string;
  notes?: string;
}

export interface ProposalTerms {
  campaignQuantity: number; // positive integer, bottle count
  campaignDuration: CampaignDuration;
  preferredStartPeriod: PreferredStartPeriod;
  distributionRequirements: CampaignDistributionRequirements;
  placementRequirements: string[];
  productRequirements: ProposalProductRequirements;
  collaborationRequirement: CollaborationRequirement;
  venueCompensationTerms: VenueCompensationTerms;
  capacityOverageDecision?: CapacityOverageDecision;
  customConditions?: string;
}

export interface ProposalVersion {
  id: string; // prv_...
  publicVersionId: string; // AB-PRV-...
  proposalId: string; // prp_...
  versionNumber: number; // 1, 2, 3...
  actor: {
    userId: string;
    role: UserRole;
    organizationName: string;
  };
  changeSummary: string;
  changedFields: string[];
  terms: ProposalTerms;
  createdAt: string;
  createdBy: string;
}

export type ProposalNegotiationAction =
  | 'CREATED'
  | 'SENT'
  | 'VIEWED'
  | 'COUNTERED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'WITHDRAWN'
  | 'EXPIRED'
  | 'READY_FOR_AGREEMENT';

export interface ProposalNegotiationEvent {
  id: string;
  proposalId: string;
  versionNumber: number;
  action: ProposalNegotiationAction;
  actor: {
    userId: string;
    role: UserRole;
    organizationName: string;
  };
  timestamp: string;
  changeSummary?: string;
  notes?: string;
}

export interface ProposalDeclineDetails {
  reasonCode: DeclineReasonCode;
  explanation?: string;
  declinedBy: string;
  declinedAt: string;
}

export interface ProposalWithdrawalDetails {
  explanation?: string;
  withdrawnBy: string;
  withdrawnAt: string;
}

export interface Proposal {
  id: string; // Internal stable identifier, e.g. prp_xyz123
  publicProposalId: string; // Non-sequential public ID: AB-PRP-XXXXXXXX
  campaignId: string; // cmp_...
  publicCampaignId: string; // AB-CMP-...
  campaignName: string;
  campaignCategory: string;
  advertiserId: string;
  advertiserPublicId: string;
  advertiserBrandName: string;
  venueId: string;
  venuePublicId: string;
  venueName: string;
  currentVersionNumber: number;
  status: ProposalStatus;
  terms: ProposalTerms;
  expiresAt: string; // ISO date string
  advertiserConfirmedAt?: string | null;
  advertiserConfirmedBy?: string | null;
  venueConfirmedAt?: string | null;
  venueConfirmedBy?: string | null;
  viewedAt?: string | null;
  declineDetails?: ProposalDeclineDetails;
  withdrawalDetails?: ProposalWithdrawalDetails;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface ProposalDetailView {
  proposal: Proposal;
  activeVersion: ProposalVersion;
  versions: ProposalVersion[];
  timeline: ProposalNegotiationEvent[];
  capacityEvaluation: CapacityEvaluation;
  permissions: {
    canView: boolean;
    canCounter: boolean;
    canAccept: boolean;
    canDecline: boolean;
    canWithdraw: boolean;
  };
}

export interface CreateProposalInput {
  campaignId: string;
  venueId: string;
  initialTerms?: Partial<ProposalTerms>;
  expiresAt?: string;
  idempotencyKey?: string;
}

export interface CounterProposalInput {
  expectedVersion: number;
  changeSummary: string;
  terms: Partial<ProposalTerms>;
  idempotencyKey?: string;
}

export interface AcceptProposalInput {
  expectedVersion: number;
  capacityOverageDecision?: 'ACCEPT_OVERAGE' | 'DO_NOT_ACCEPT_OVERAGE';
  notes?: string;
  idempotencyKey?: string;
}

export interface DeclineProposalInput {
  expectedVersion?: number;
  reasonCode: DeclineReasonCode;
  explanation?: string;
  idempotencyKey?: string;
}

export interface WithdrawProposalInput {
  expectedVersion?: number;
  explanation?: string;
  idempotencyKey?: string;
}

export interface ProposalFilterQuery {
  campaignId?: string;
  venueId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

// ==========================================
// STEP 7: CAMPAIGN AGREEMENT & COMMERCIAL LOCK
// ==========================================

export type CampaignAgreementStatus =
  | 'DRAFT'
  | 'AWAITING_ADVERTISER_CONFIRMATION'
  | 'AWAITING_VENUE_CONFIRMATION'
  | 'READY_TO_LOCK'
  | 'LOCKED'
  | 'SUPERSEDED'
  | 'TERMINATED';

export interface AgreementCommercialTerms {
  campaignQuantity: number;
  campaignDuration: CampaignDuration;
  preferredStartPeriod: PreferredStartPeriod;
  distributionRequirements: CampaignDistributionRequirements;
  placementRequirements: string[];
  productRequirements: ProposalTerms['productRequirements'];
  collaborationRequirement: CollaborationRequirement;
  venueCompensationTerms: {
    proposedPercentage: number;
    termsDescription: string;
    notes: string;
    eligibleBaseDescription: string;
    maximumCapPercentage: number; // Strictly capped at 12.5% max
  };
  advertiserResponsibilities: string[];
  venueResponsibilities: string[];
  aquaBloomResponsibilities: string[];
  deliveryTermsKnown: {
    stagingInstructions: string;
    specialHandling: string;
    refrigerationRequired: boolean;
    status: 'PENDING_LOGISTICS_ASSIGNMENT';
  };
  qrRequirements: {
    customRedirectUrl?: string;
    trackingEnabled: boolean;
    status: 'CONFIGURED_FOR_PRODUCTION';
  };
  cancellationTerms: {
    policyId: string;
    cutoffStage: 'PRODUCTION_START';
    termsSummary: string;
    eligibleCancellationStage: string;
    nonRecoverableCostPrinciple: string;
  };
  renewalTerms: {
    policyId: string;
    renewalType: 'EXPLICIT_APPROVAL_REQUIRED';
    termsSummary: string;
  };
  customConditions?: string;
  importantConditions: string[];
}

export interface CampaignAgreement {
  id: string; // Internal stable identifier, e.g. cag_xyz123
  publicId: string; // Authoritative Public ID: AB-CAG-XXXXXXXX
  campaignId: string;
  campaignPublicId: string;
  campaignName: string;
  campaignCategory: string;
  advertiserId: string;
  advertiserPublicId: string;
  advertiserBrandName: string;
  venueId: string;
  venuePublicId: string;
  venueName: string;
  sourceProposalId: string;
  sourceProposalPublicId: string;
  sourceProposalVersionId: string;
  sourceProposalVersionNumber: number;
  status: CampaignAgreementStatus;
  currentVersionId: string;
  currentVersionNumber: number;
  lockedSnapshotId?: string | null;
  advertiserConfirmedAt?: string | null;
  advertiserConfirmedBy?: string | null;
  venueConfirmedAt?: string | null;
  venueConfirmedBy?: string | null;
  lockedAt?: string | null;
  lockedBy?: string | null;
  lockVersion: number;
  cancellationPolicyId: string;
  renewalPolicyId: string;
  agreementReference: string;
  terms: AgreementCommercialTerms;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CampaignAgreementVersion {
  id: string; // cgv_...
  publicVersionId: string; // AB-CGV-XXXXXXXX-XX
  agreementId: string;
  versionNumber: number;
  sourceProposalVersionId: string;
  agreementData: AgreementCommercialTerms;
  createdAt: string;
  createdBy: string;
  advertiserConfirmedAt?: string | null;
  advertiserConfirmedBy?: string | null;
  venueConfirmedAt?: string | null;
  venueConfirmedBy?: string | null;
  status: 'DRAFT' | 'ACTIVE' | 'CONFIRMED' | 'LOCKED' | 'SUPERSEDED';
  supersedesVersionId?: string | null;
  changeSummary: string;
  confirmationMetadata?: {
    advertiserEventId?: string;
    venueEventId?: string;
    notes?: string;
  };
}

export interface CampaignAgreementSnapshot {
  id: string; // cgs_...
  publicSnapshotId: string; // AB-CGS-XXXXXXXX
  agreementId: string;
  agreementPublicId: string;
  agreementVersionId: string;
  versionNumber: number;
  lockedAt: string;
  lockedBy: string;
  lockVersion: number;
  // 14 conceptual areas
  campaignSnapshot: {
    campaignName: string;
    publicCampaignId: string;
    category: string;
    objective: string;
    targetAudience: string;
    durationWeeks: number;
    preferredStartMonthYear: string;
  };
  advertiserSnapshot: {
    brandName: string;
    publicAccountId: string;
    industry?: string;
    advertisingCategory?: string;
    primaryContactName?: string;
    contactEmail?: string;
    locationCity?: string;
    locationCountry?: string;
  };
  venueSnapshot: {
    venueName: string;
    publicAccountId: string;
    venueType: string;
    audienceCategory: string;
    locationCity: string;
    locationCountry: string;
    monthlyVisitors: number;
    availableBottleCapacity: number;
    maxBottleHoldingCapacity: number;
    placementPossibilities: string[];
  };
  campaignTermsSnapshot: {
    quantity: number;
    duration: CampaignDuration;
    preferredStartPeriod: PreferredStartPeriod;
    customConditions?: string;
    importantConditions: string[];
  };
  productRequirementsSnapshot: ProposalTerms['productRequirements'];
  distributionSnapshot: CampaignDistributionRequirements;
  placementSnapshot: {
    placementRequirements: string[];
  };
  collaborationSnapshot: CollaborationRequirement;
  compensationTermsSnapshot: {
    proposedPercentage: number;
    termsDescription: string;
    notes: string;
    eligibleBaseDescription: string;
    maximumCapPercentage: number;
  };
  responsibilitiesSnapshot: {
    advertiserResponsibilities: string[];
    venueResponsibilities: string[];
    aquaBloomResponsibilities: string[];
  };
  deliveryTermsSnapshot: {
    stagingInstructions: string;
    specialHandling: string;
    refrigerationRequired: boolean;
    status: 'PENDING_LOGISTICS_ASSIGNMENT';
  };
  qrRequirementsSnapshot: {
    customRedirectUrl?: string;
    trackingEnabled: boolean;
    status: 'CONFIGURED_FOR_PRODUCTION';
  };
  cancellationTermsSnapshot: {
    policyId: string;
    cutoffStage: 'PRODUCTION_START';
    termsSummary: string;
    eligibleCancellationStage: string;
    nonRecoverableCostPrinciple: string;
  };
  renewalTermsSnapshot: {
    policyId: string;
    renewalType: 'EXPLICIT_APPROVAL_REQUIRED';
    termsSummary: string;
  };
  commercialTermsSnapshot: AgreementCommercialTerms;
  agreementReference?: string;
  sourceReferences?: {
    sourceProposalId: string;
    sourceProposalPublicId: string;
    sourceProposalVersionId: string;
    sourceProposalVersionNumber: number;
  };
}

export interface CampaignAgreementSharedView {
  agreementId: string;
  publicId: string;
  status: CampaignAgreementStatus;
  currentVersionNumber: number;
  isLocked: boolean;
  lockedAt?: string | null;
  lockedSnapshotPublicId?: string | null;
  advertiserConfirmed: boolean;
  advertiserConfirmedAt?: string | null;
  venueConfirmed: boolean;
  venueConfirmedAt?: string | null;
  canCurrentUserConfirm: boolean;
  canCurrentUserLock: boolean;
  agreementReference: string;
  campaign: {
    id: string;
    publicId: string;
    name: string;
    category: string;
    objective: string;
    targetAudience: string | CampaignTargetAudience;
    duration: CampaignDuration;
    preferredStartPeriod: PreferredStartPeriod;
  };
  counterparty: {
    role: UserRole;
    name: string;
    publicAccountId: string;
    categoryOrType: string;
    city: string;
  };
  terms: AgreementCommercialTerms;
  permissions: {
    canView: boolean;
    canConfirm: boolean;
    canLock: boolean;
  };
}

export interface SanitizedAgreementVersion {
  id: string;
  publicVersionId: string;
  versionNumber: number;
  createdAt: string;
  createdDate: string;
  actor: {
    userId: string;
    role: UserRole | string;
    name: string;
    organizationName: string;
  };
  changeSummary: string;
  status: string;
  advertiserConfirmedAt?: string | null;
  venueConfirmedAt?: string | null;
}

export interface CampaignAgreementPreviewView {
  // 1. Agreement reference
  agreementReference: string;
  agreementId: string;
  publicId: string;

  // 2. Campaign
  campaign: {
    id: string;
    publicId: string;
    name: string;
    category: string;
    objective: string;
    targetAudience: string | CampaignTargetAudience;
    duration: CampaignDuration;
    preferredStartPeriod: PreferredStartPeriod;
  };

  // 3. Parties
  parties: {
    advertiser: {
      publicAccountId: string;
      brandName: string;
      industry: string;
      city: string;
      country: string;
      primaryContactName?: string;
    };
    venue: {
      publicAccountId: string;
      venueName: string;
      venueType: string;
      audienceCategory: string;
      city: string;
      country: string;
      monthlyVisitors?: number;
      availableBottleCapacity?: number;
      primaryContactName?: string;
    };
  };

  // 4. Advertiser
  advertiser: {
    publicAccountId: string;
    brandName: string;
    industry: string;
    city: string;
    country: string;
  };

  // 5. Venue
  venue: {
    publicAccountId: string;
    venueName: string;
    venueType: string;
    audienceCategory: string;
    city: string;
    country: string;
  };

  // Viewer context
  viewerRole: 'ADVERTISER' | 'VENUE' | 'ADMIN';

  // 6. Campaign objective
  campaignObjective: string;

  // 7. Target audience
  targetAudience: string | CampaignTargetAudience;

  // 8. Quantity
  quantity: number;

  // 9. Bottle/product requirements known at this stage
  productRequirements: ProposalTerms['productRequirements'];

  // 10. Campaign duration
  campaignDuration: CampaignDuration;

  // 11. Campaign dates / preferred period
  campaignDates: {
    preferredStartPeriod: PreferredStartPeriod;
    durationLabel: string;
  };

  // 12. Distribution requirements
  distributionRequirements: CampaignDistributionRequirements;

  // 13. Placement requirements
  placementRequirements: string[];

  // 14. Collaboration requirements
  collaborationRequirements: CollaborationRequirement;

  // 15. Responsibilities
  responsibilities: {
    advertiserResponsibilities: string[];
    venueResponsibilities: string[];
    aquaBloomResponsibilities: string[];
  };

  // 16. Compensation terms (preserving percentage, 12.5% cap note, no fabricated final amount)
  compensationTerms: {
    proposedPercentage: number;
    termsDescription: string;
    notes: string;
    eligibleBaseDescription: string;
    maximumCapPercentage: number;
    statutoryCapRule: string;
    finalAmountCalculated: false;
  };

  // Pricing Rule Safeguard Disclosure (Formula: Product Price + Logistics + Taxes = Final Total)
  pricingSafeguards: {
    status: 'NO_FINAL_PRICING_AT_AGREEMENT_STAGE';
    formulaNote: 'Product Price + Logistics + Applicable Taxes = Final Advertiser Total';
    supplierInternalCostExcluded: true;
    aquaBloomMarginExcluded: true;
    unconfirmedLogisticsExcluded: true;
    unconfirmedTaxesExcluded: true;
    fakeFinalAdvertiserTotalExcluded: true;
  };

  // 17. Delivery terms known at this stage
  deliveryTermsKnown: {
    stagingInstructions: string;
    specialHandling: string;
    refrigerationRequired: boolean;
    status: 'PENDING_LOGISTICS_ASSIGNMENT';
    logisticsNotice: string;
  };

  // 18. QR requirements
  qrRequirements: {
    customRedirectUrl?: string;
    trackingEnabled: boolean;
    status: 'CONFIGURED_FOR_PRODUCTION';
  };

  // 19. Cancellation terms
  cancellationTerms: {
    policyId: string;
    cutoffStage: 'PRODUCTION_START';
    termsSummary: string;
    eligibleCancellationStage: string;
    nonRecoverableCostPrinciple: string;
  };

  // 20. Renewal terms
  renewalTerms: {
    policyId: string;
    renewalType: 'EXPLICIT_APPROVAL_REQUIRED';
    termsSummary: string;
    renewalPolicyNote: string;
  };

  // 21. Confirmation status
  confirmationStatus: {
    advertiserConfirmed: boolean;
    advertiserConfirmedAt?: string | null;
    venueConfirmed: boolean;
    venueConfirmedAt?: string | null;
    canCurrentUserConfirm: boolean;
    statusSummary: string;
    readinessMessage: 'Confirmation will become available when the agreement is ready.';
  };

  // 22. Agreement status
  agreementStatus: CampaignAgreementStatus;

  // 23. Current version
  currentVersion: {
    versionNumber: number;
    publicVersionId: string;
    createdAt: string;
    createdDate: string;
    status: string;
    changeSummary: string;
  };

  // 24. Version history
  versionHistory: SanitizedAgreementVersion[];

  // Binding Operational Conditions
  importantConditions: string[];
  customConditions?: string;
  isLocked: boolean;
  lockedAt?: string | null;
  lockedSnapshotPublicId?: string | null;
  lockVersion: number;
}

export interface CampaignAgreementInternalRecord {
  id: string;
  agreementId: string;
  publicId: string;
  sourceProposalId: string;
  sourceProposalVersionId: string;
  lockedSnapshotId?: string | null;
  workflowStage: 'COMMERCIAL_LOCK';
  futureSupplierAssignmentReference: null; // Explicit extension point (Step 8+)
  futureLogisticsAssignmentReference: null; // Explicit extension point (Step 8+)
  internalFinancialReferences: {
    ledgerLockStatus: 'PENDING_SUPPLIER_LOGISTICS_PRICING';
    finalPayableCalculated: false;
  };
  technicalMetadata: {
    schemaVersion: '1.0-step7';
    lockVersion: number;
    environment: string;
  };
  riskMetadata: {
    capacityOverageAcknowledged: boolean;
    disputeRiskScore: 'LOW';
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateCampaignAgreementInput {
  sourceProposalId: string;
  idempotencyKey?: string;
}

export interface ConfirmCampaignAgreementInput {
  expectedVersion: number;
  acknowledgement: boolean;
  notes?: string;
  idempotencyKey?: string;
}

export interface LockCampaignAgreementInput {
  expectedVersion: number;
  lockVersion: number;
  idempotencyKey?: string;
}

export interface CampaignAgreementFilterQuery {
  campaignId?: string;
  venueId?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

/**
 * ========================================================
 * STEP 8: ORDER READINESS & DATA HANDOFF ENGINE TYPES
 * ========================================================
 */

export type OrderReadinessStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY_FOR_ORDER'
  | 'BLOCKED';

export type DataHandoffStatus =
  | 'PENDING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED';

export interface OrderReadinessValidationIssue {
  code: string;
  field: string;
  message: string;
  blocking: boolean;
}

export interface OrderReadinessValidationSummary {
  isValid: boolean;
  checkedAt: string;
  blockingIssueCount: number;
  warningIssueCount: number;
  issues: OrderReadinessValidationIssue[];
  checksPerformed: {
    campaignExists: boolean;
    agreementIsLocked: boolean;
    snapshotExists: boolean;
    snapshotIsValid: boolean;
    advertiserExists: boolean;
    venueExists: boolean;
    quantityIsValid: boolean;
    durationIsValid: boolean;
    campaignDatesPeriodValid: boolean;
    productRequirementsValid: boolean;
    distributionRequirementsValid: boolean;
    placementRequirementsValid: boolean;
    commercialTermsValid: boolean;
    responsibilitiesValid: boolean;
    deliveryTermsValid: boolean;
  };
}

/**
 * Controlled Downstream Order Readiness Snapshot
 * Contains strictly the locked data required for the future Order Engine.
 * Does NOT copy live editable master profile data.
 * Does NOT contain supplier assignments, logistics assignments, final pricing, or payment.
 */
export interface DownstreamOrderSnapshot {
  campaign: {
    campaignId: string;
    publicCampaignId: string;
    campaignName: string;
    objective: string;
    category: string;
    targetAudience: string;
    durationWeeks: number;
    preferredStartMonthYear: string;
  };
  venue: {
    venueId: string;
    publicAccountId: string;
    venueName: string;
    venueType: string;
    audienceCategory: string;
    locationCity: string;
    locationCountry: string;
    placementRequirements: string[];
    distributionRequirements: CampaignDistributionRequirements;
    venueResponsibilities: string[];
  };
  advertiser: {
    advertiserId: string;
    publicAccountId: string;
    brandName: string;
    advertiserResponsibilities: string[];
  };
  productRequirements: {
    requiredBottleQuantity: number;
    bottleType?: string;
    preferredVolumeMl?: number;
    volumeLabel?: string;
    preferredMaterial?: string;
    labelType?: string;
    capType?: string;
    notes?: string;
  };
  distribution: {
    quantity: number;
    distributionSchedule?: string;
    placementRequirements: string[];
    venueAllocation: number;
  };
  collaboration: CollaborationRequirement;
  qrRequirements: {
    customRedirectUrl?: string;
    trackingEnabled: boolean;
    status: 'CONFIGURED_FOR_PRODUCTION';
  };
  commercialTerms: {
    venueCompensationPercentage: number;
    venueCompensationTermsDescription: string;
    venueCompensationNotes: string;
    venueCompensationEligibleBaseDescription: string;
    venueCompensationStatutoryCapPercentage: number; // 12.5% max
    cancellationCutoffStage: 'PRODUCTION_START';
    cancellationTermsSummary: string;
    renewalType: 'EXPLICIT_APPROVAL_REQUIRED';
    renewalTermsSummary: string;
    customConditions?: string;
    importantConditions: string[];
  };
  boundaries: {
    finalPricingCalculated: false;
    supplierAssigned: false;
    logisticsAssigned: false;
    paymentCreated: false;
    productionStarted: false;
  };
}

/**
 * Controlled Downstream Order Readiness Record
 * Public identifier format: AB-ORDR-XXXXXXXX
 */
export interface OrderReadiness {
  id: string; // ordr_...
  publicId: string; // AB-ORDR-XXXXXXXX
  campaignAgreementId: string;
  campaignAgreementSnapshotId: string;
  campaignId: string;
  advertiserId: string;
  venueId: string;
  status: OrderReadinessStatus;
  sourceSnapshotVersion: number;
  validationSummary?: OrderReadinessValidationSummary;
  handoffId?: string;
  orderSnapshot?: DownstreamOrderSnapshot;
  createdAt: string;
  updatedAt: string;
  validatedAt?: string | null;
  createdBy: string;
  validatedBy?: string | null;
}

/**
 * Data Handoff Record
 * Public identifier format: AB-DHO-XXXXXXXX
 */
export interface DataHandoff {
  id: string; // dho_...
  publicId: string; // AB-DHO-XXXXXXXX
  sourceType: 'CAMPAIGN_AGREEMENT_SNAPSHOT';
  sourceId: string; // agreementId
  sourceSnapshotId: string; // snapshotId / publicSnapshotId
  destinationType: 'ORDER_READINESS';
  destinationReference: string; // orderReadinessId / publicId
  status: DataHandoffStatus;
  payloadVersion: number;
  idempotencyKey?: string;
  validationResult?: {
    isSuccess: boolean;
    reason?: string;
    validatedAt: string;
  };
  retryCount: number;
  maxRetries: number;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

/**
 * Safe, user-facing summary view of Order Readiness (Advertiser & Venue)
 * Strips internal technical metadata and ensures strict isolation.
 */
export interface OrderReadinessSharedView {
  orderReadinessId: string;
  publicId: string;
  agreementPublicId: string;
  campaignPublicId: string;
  status: OrderReadinessStatus;
  statusDisplay: string;
  isReadyForOrder: boolean;
  isBlocked: boolean;
  requiredBottleQuantity: number;
  campaignDurationWeeks: number;
  preferredStartMonthYear: string;
  advertiserBrandName: string;
  venueName: string;
  validatedAt?: string | null;
  publicValidationMessage: string;
  blockingReasons?: string[];
  boundaries: {
    orderCreated: false;
    supplierAssigned: false;
    logisticsAssigned: false;
    finalPricingCalculated: false;
    paymentCreated: false;
  };
}

/**
 * ==========================================
 * STEP 9: SUPPLIER ASSIGNMENT & OPERATIONAL OFFER
 * ==========================================
 */

export type SupplierOfferStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'EXPIRED'
  | 'CANCELLED';

export type SupplierAssignmentStatus =
  | 'ASSIGNED'
  | 'REASSIGNED'
  | 'CANCELLED';

export type SupplierDeclineReasonCode =
  | 'CAPACITY_UNAVAILABLE'
  | 'LEAD_TIME_INSUFFICIENT'
  | 'TIMELINE_UNAVAILABLE'
  | 'MATERIAL_SPEC_UNAVAILABLE'
  | 'PRODUCT_UNAVAILABLE'
  | 'MAINTENANCE_DOWNTIME'
  | 'OPERATIONAL_CONSTRAINTS'
  | 'PRODUCTION_CONSTRAINTS'
  | 'COMMERCIAL_TERMS_NOT_SUITABLE'
  | 'OTHER';

/**
 * Deterministic Candidate Match result for a supplier product
 */
export interface SupplierCandidateMatch {
  supplierId: string;
  supplierPublicAccountId: string;
  supplierBusinessName: string;
  facilityLocation: {
    city: string;
    stateProvince?: string;
    country: string;
  };
  product: {
    id: string;
    publicProductId: string;
    versionId: string;
    publicVersionId: string;
    versionNumber: number;
    name: string;
    category: string;
    specifications: ProductSpecifications;
    customerFacingPrice: Money;
    minimumOrderQuantity: number;
    productionLeadTime: LeadTime;
  };
  matchEvaluation: {
    isEligible: boolean;
    statusApproved: boolean;
    productAvailable: boolean;
    volumeMatches: boolean;
    materialMatches: boolean;
    capacitySufficient: boolean;
    moqSatisfied: boolean;
    leadTimeFeasible: boolean;
    rejectionReasons: string[];
  };
}

/**
 * Immutable Operational Snapshot delivered to Supplier inside Offer.
 * Strictly excludes: Advertiser commercial terms, Venue financial terms,
 * marketing strategy, budget, and campaign negotiation history.
 */
export interface SupplierOperationalRequirementsSnapshot {
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  bottleQuantity: number;
  productRequirements: {
    bottleType?: string;
    preferredVolumeMl?: number;
    volumeLabel?: string;
    preferredMaterial?: string;
    labelType?: string;
    capType?: string;
    notes?: string;
  };
  packagingAndStagingRequirements?: string;
  productionTimeline: {
    durationWeeks: number;
    preferredStartMonthYear: string;
  };
}

/**
 * Authoritative Supplier Operational Offer Entity
 */
export interface SupplierOperationalOffer {
  id: string; // Internal stable ID, e.g. soo_...
  publicId: string; // AB-SOO-XXXXXX-2026
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierId: string;
  supplierPublicAccountId: string;
  supplierBusinessName: string;
  productId: string;
  productPublicId: string;
  productVersionId: string;
  productVersionNumber: number;
  status: SupplierOfferStatus;
  operationalRequirementsSnapshot: SupplierOperationalRequirementsSnapshot;
  offerTerms: {
    bottleQuantity: number;
    unitCustomerFacingPrice: Money;
    totalBottleAmount: Money;
    productionLeadTime: LeadTime;
    currency: 'INR';
  };
  expiresAt: string;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  declineReasonCode?: SupplierDeclineReasonCode | null;
  declineExplanation?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Authoritative Supplier Assignment Entity
 */
export interface SupplierAssignment {
  id: string; // Internal stable ID, e.g. sas_...
  publicId: string; // AB-SAS-XXXXXX-2026
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierOperationalOfferId: string;
  supplierOperationalOfferPublicId: string;
  supplierId: string;
  supplierPublicAccountId: string;
  supplierBusinessName: string;
  productId: string;
  productPublicId: string;
  productVersionId: string;
  productVersionNumber: number;
  status: SupplierAssignmentStatus;
  assignedAt: string;
  assignedBy: string;
  lockedOfferSnapshot: {
    bottleQuantity: number;
    unitCustomerFacingPrice: Money;
    totalBottleAmount: Money;
    productionLeadTime: LeadTime;
    productSpecificationsSnapshot: ProductSpecifications;
    operationalRequirementsSnapshot: SupplierOperationalRequirementsSnapshot;
  };
  futureBoundaries: {
    logisticsAssigned: boolean;
    productionScheduled: boolean;
    qcInitiated: boolean;
    paymentCalculated: boolean;
  };
  reassignmentDetails?: {
    reassignedAt: string;
    reassignedBy: string;
    previousAssignmentId: string;
    reason: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Role-isolated views for Supplier Assignment
 */
export interface SupplierAssignmentSharedView {
  assignmentId: string;
  publicId: string;
  orderReadinessPublicId: string;
  campaignAgreementPublicId: string;
  supplierBusinessName: string;
  status: SupplierAssignmentStatus;
  assignedAt: string;
  bottleQuantity: number;
  productPublicId: string;
  leadTime: LeadTime;
  boundaries: {
    supplierAssigned: boolean;
    logisticsAssigned: boolean;
    productionStarted: boolean;
    paymentCompleted: boolean;
  };
}

export interface CreateSupplierOfferInput {
  orderReadinessId: string;
  supplierId: string;
  productId: string;
  expiresInHours?: number; // Defaults to 72 hours
}

export interface DeclineSupplierOfferInput {
  reasonCode: SupplierDeclineReasonCode;
  explanation?: string;
  idempotencyKey?: string;
}

export interface AcceptSupplierOfferInput {
  idempotencyKey?: string;
}

/**
 * ========================================================
 * STEP 10: LOGISTICS ASSIGNMENT & OPERATIONAL OFFER TYPES
 * ========================================================
 */

export type LogisticsOfferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';

export type LogisticsAssignmentStatus = 'ASSIGNED' | 'CANCELLED';

export type LogisticsDeclineReasonCode =
  | 'CAPACITY_UNAVAILABLE'
  | 'PICKUP_NOT_FEASIBLE'
  | 'DELIVERY_NOT_FEASIBLE'
  | 'TIMELINE_NOT_FEASIBLE'
  | 'SERVICE_AREA_ISSUE'
  | 'OTHER';

/**
 * Immutable Logistics Requirement Snapshot delivered to Logistics Partner inside Offer.
 * Derived deterministically from:
 * 1. SupplierAssignment (authoritative pickup location & supplier operational contact)
 * 2. CampaignAgreementSnapshot / OrderSnapshot (authoritative delivery destination & venue receiving details)
 * 
 * Strictly excludes:
 * - Advertiser private plan fees, total budget, commercial margins
 * - Venue commercial compensation
 * - Supplier internal production cost
 * - Other competing logistics partners
 */
export interface LogisticsRequirementSnapshot {
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  
  // Authoritative Pickup Location (derived from Supplier)
  pickupSource: {
    supplierId: string;
    supplierPublicAccountId: string;
    supplierBusinessName: string;
    facilityCity: string;
    stateProvince?: string;
    country: string;
    facilityAddress?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    pickupWindow: {
      startDate: string;
      endDate: string;
      windowDescription: string;
    };
  };

  // Authoritative Delivery Destination (derived from locked CampaignAgreementSnapshot)
  deliveryDestination: {
    venueId: string;
    venuePublicAccountId: string;
    venueName: string;
    venueType: string;
    city: string;
    country: string;
    deliveryAddress: string;
    dockRequirements?: string;
    receivingHours?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    deliveryWindow: {
      startDate: string;
      endDate: string;
      windowDescription: string;
    };
  };

  // Shipment Characteristics & Physical Handling
  shipmentCharacteristics: {
    bottleQuantity: number;
    estimatedPallets: number;
    estimatedTotalWeightKg: number;
    temperatureControlledRequired: boolean;
    productSpecifications: {
      bottleMaterial?: string;
      bottleCapacityMl?: number;
      labelType?: string;
      packagingType?: string;
    };
    handlingRequirements: string[];
    specialInstructions?: string;
  };

  transactionReference: string;
}

export interface LogisticsCandidateMatch {
  logisticsPartnerId: string;
  logisticsPartnerPublicAccountId: string;
  businessName: string;
  hubLocation: {
    city: string;
    stateRegion?: string;
    country: string;
  };
  serviceAreas: string[];
  fleetCapabilities: {
    vehicleTypes: string[];
    temperatureControlled: boolean;
  };
  shipmentCapacity: {
    palletsPerWeek: number;
    maxPayloadWeightKg?: number;
  };
  pricing: {
    pricingVersionId: string;
    rateType: string;
    currency: 'INR';
    estimatedLogisticsCost: Money;
  };
  matchEvaluation: {
    isEligible: boolean;
    statusApproved: boolean;
    pickupServiceable: boolean;
    deliveryServiceable: boolean;
    capacitySufficient: boolean;
    temperatureControlFeasible: boolean;
    timelineFeasible: boolean;
    rejectionReasons: string[];
  };
}

export interface LogisticsOperationalOffer {
  id: string; // Internal ID, e.g. loo_...
  publicId: string; // Business ID, e.g. AB-LOO-XXXXXX-2026
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  logisticsPartnerId: string;
  logisticsPartnerPublicAccountId: string;
  logisticsPartnerBusinessName: string;
  status: LogisticsOfferStatus;
  matchingRuleVersion: string;
  logisticsRequirementsSnapshot: LogisticsRequirementSnapshot;
  costInput: {
    logisticsCost: Money;
    pricingVersionId: string;
    rateType: string;
    currency: 'INR';
    pricingConfigurationReference: string;
    effectiveAt: string;
  };
  expiresAt: string;
  acceptedAt?: string | null;
  declinedAt?: string | null;
  declineReasonCode?: LogisticsDeclineReasonCode | null;
  declineExplanation?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface LogisticsAssignment {
  id: string; // Internal ID, e.g. las_...
  publicId: string; // Business ID, e.g. AB-LAS-XXXXXX-2026
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  logisticsOperationalOfferId: string;
  logisticsOperationalOfferPublicId: string;
  logisticsPartnerId: string;
  logisticsPartnerPublicAccountId: string;
  logisticsPartnerBusinessName: string;
  status: LogisticsAssignmentStatus;
  assignedAt: string;
  assignedBy: string;
  matchingRuleVersion: string;
  lockedOperationalSnapshot: {
    requirements: LogisticsRequirementSnapshot;
    costInput: {
      logisticsCost: Money;
      pricingVersionId: string;
      rateType: string;
      currency: 'INR';
      pricingConfigurationReference: string;
    };
  };
  futureBoundaries: {
    readyForFinalPricing: boolean;
    productionScheduled: boolean;
    shipmentExecuted: boolean;
    deliveryConfirmed: boolean;
    paymentCalculated: boolean;
  };
  reassignmentDetails?: {
    reassignedAt: string;
    reassignedBy: string;
    previousAssignmentId: string;
    reason: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface LogisticsAssignmentSharedView {
  assignmentId: string;
  publicId: string;
  orderReadinessPublicId: string;
  campaignAgreementPublicId: string;
  supplierAssignmentPublicId: string;
  logisticsPartnerBusinessName: string;
  status: LogisticsAssignmentStatus;
  assignedAt: string;
  bottleQuantity: number;
  estimatedPallets: number;
  pickupCity: string;
  deliveryCity: string;
  deliveryVenueName: string;
  pickupWindowDescription: string;
  deliveryWindowDescription: string;
  boundaries: {
    supplierAssigned: boolean;
    logisticsAssigned: boolean;
    readyForFinalPricing: boolean;
    productionStarted: boolean;
    shipmentExecuted: boolean;
    paymentCompleted: boolean;
  };
}

export interface CreateLogisticsOfferInput {
  orderReadinessId: string;
  logisticsPartnerId: string;
  expiresInHours?: number; // Defaults to 48 hours
}

export interface DeclineLogisticsOfferInput {
  reasonCode: LogisticsDeclineReasonCode;
  explanation?: string;
  idempotencyKey?: string;
}

export interface AcceptLogisticsOfferInput {
  idempotencyKey?: string;
}

export interface ReassignLogisticsInput {
  reason: string;
  idempotencyKey?: string;
}

/**
 * ========================================================
 * STEP 11A: FINAL PRICING ENGINE FOUNDATION TYPES
 * ========================================================
 */

export type FinalPricingStatus = 'CALCULATED' | 'PRICING_BLOCKED';

export interface TaxComponentBreakdown {
  taxType: 'CGST' | 'SGST' | 'IGST';
  ratePercentage: number;
  taxableAmountMinor: number;
  taxAmountMinor: number;
  taxableAmountFormatted: string;
  taxAmountFormatted: string;
}

export interface TaxCalculationResult {
  taxApplicable: boolean;
  jurisdiction: {
    originState: string;
    destinationState: string;
    isInterState: boolean;
  };
  ratePercentageTotal: number;
  taxComponents: TaxComponentBreakdown[];
  totalTaxMinor: number;
  totalTaxFormatted: string;
}

export interface FinalPricingCalculationResult {
  id: string; // fpr_...
  publicId: string; // AB-FPR-XXXXXX-2026
  orderReadinessId: string;
  orderReadinessPublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  logisticsAssignmentId: string;
  logisticsAssignmentPublicId: string;
  
  status: FinalPricingStatus;
  blockingReason?: string | null;
  currency: 'INR';
  pricingVersion: number;
  pricingReference: string; // e.g. FPR-REF-XXXXXX
  calculatedAt: string;
  calculatedBy: string;

  // Source references
  sourceReferences: {
    productId: string;
    productPublicId: string;
    productVersionId: string;
    productVersionNumber: number;
    supplierId: string;
    supplierBusinessName: string;
    logisticsPartnerId: string;
    logisticsPartnerBusinessName: string;
    contractedQuantity: number;
  };

  // Unit breakdown
  productUnitPrice: {
    amountMinor: number;
    formatted: string;
  };

  // Totals in integer minor units (paise)
  productPriceTotalMinor: number;
  productPriceTotalFormatted: string;

  logisticsCostTotalMinor: number;
  logisticsCostTotalFormatted: string;

  taxableAmountMinor: number;
  taxableAmountFormatted: string;

  taxes: TaxCalculationResult;

  grandTotalMinor: number;
  grandTotalFormatted: string;

  // Safeguards & disclosures
  safeguards: {
    formulaNote: 'PRODUCT PRICE + LOGISTICS COST + APPLICABLE TAXES = TOTAL';
    separateLabelFeeCharged: false;
    supplierInternalCostExcluded: true;
    advertiserPlanFeeExcluded: true;
  };

  // Venue compensation calculation support (server-side only, non-leaking)
  venueCompensationEvaluation: {
    statutoryCapPercentage: 12.5;
    agreedPercentage: number;
    eligibleBaseAmountMinor: number;
    eligibleBaseDescription: string;
    calculatedVenueCompensationMinor: number;
    calculatedVenueCompensationFormatted: string;
    cappedAtStatutoryLimit: boolean;
  };

  // Boundaries
  futureBoundaries: {
    orderCreated: boolean;
    paymentInitiated: boolean;
    productionScheduled: boolean;
  };

  createdAt: string;
  updatedAt: string;
}

/**
 * Clean sanitised counterparty-facing pricing view (strips venue compensation details, supplier margins)
 */
export interface FinalPricingSharedView {
  pricingId: string;
  publicId: string;
  orderReadinessPublicId: string;
  campaignAgreementPublicId: string;
  status: FinalPricingStatus;
  blockingReason?: string | null;
  currency: 'INR';
  contractedQuantity: number;
  productUnitPriceFormatted: string;
  productPriceTotalFormatted: string;
  logisticsCostTotalFormatted: string;
  taxableAmountFormatted: string;
  totalTaxFormatted: string;
  grandTotalFormatted: string;
  taxComponents: {
    taxType: string;
    ratePercentage: number;
    taxAmountFormatted: string;
  }[];
  formulaNote: string;
  calculatedAt: string;
}

/**
 * ==========================================
 * STEP 11B: ORDER TYPES & ENTITIES
 * ==========================================
 */

export type OrderStatus =
  | 'DRAFT'
  | 'PRICED'
  | 'PAYMENT_REQUIRED'
  | 'PAYMENT_PROCESSING'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'READY_FOR_FULFILLMENT'
  | 'CANCELLED';

export interface OrderStatusTransition {
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  transitionedAt: string;
  transitionedBy: string;
  reason: string;
}

export interface OrderAuthoritativeReferences {
  campaignId: string;
  campaignPublicId: string;
  campaignName: string;

  advertiserId: string;
  advertiserPublicId: string;
  advertiserBrandName: string;

  venueId: string;
  venuePublicId: string;
  venueName: string;

  campaignAgreementId: string;
  campaignAgreementPublicId: string;

  campaignAgreementSnapshotId: string;
  campaignAgreementSnapshotPublicId: string;

  orderReadinessId: string;
  orderReadinessPublicId: string;

  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  supplierId: string;
  supplierBusinessName: string;
  productId: string;
  productPublicId: string;
  productVersionId: string;
  productVersionNumber: number;

  logisticsAssignmentId: string;
  logisticsAssignmentPublicId: string;
  logisticsPartnerId: string;
  logisticsPartnerBusinessName: string;

  finalPricingResultId: string;
  finalPricingResultPublicId: string;
  pricingReference: string;
}

export interface OrderPricingSnapshot {
  id: string; // ops_...
  publicId: string; // AB-OPS-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  orderReference: string;

  currency: 'INR';
  contractedQuantity: number;

  productPrice: {
    unitPriceMinor: number;
    unitPriceFormatted: string;
    productPriceTotalMinor: number;
    productPriceTotalFormatted: string;
  };

  logisticsCost: {
    logisticsCostTotalMinor: number;
    logisticsCostTotalFormatted: string;
  };

  taxableAmount: {
    taxableAmountMinor: number;
    taxableAmountFormatted: string;
  };

  taxes: {
    totalTaxMinor: number;
    totalTaxFormatted: string;
    jurisdiction: {
      originState: string;
      destinationState: string;
      isInterState: boolean;
    };
    taxComponents: {
      taxType: string;
      ratePercentage: number;
      taxableAmountMinor: number;
      taxAmountMinor: number;
      taxableAmountFormatted: string;
      taxAmountFormatted: string;
    }[];
  };

  grandTotal: {
    amountMinor: number;
    amountFormatted: string;
  };

  // Authoritative versions
  productPricingVersion: {
    productId: string;
    productPublicId: string;
    productName: string;
    productVersionId: string;
    productVersionNumber: number;
    unitCustomerFacingPriceMinor: number;
    unitCustomerFacingPriceFormatted: string;
  };

  logisticsOfferVersion: {
    logisticsAssignmentId: string;
    logisticsAssignmentPublicId: string;
    logisticsPartnerId: string;
    logisticsPartnerBusinessName: string;
    logisticsCostMinor: number;
    logisticsCostFormatted: string;
    pricingVersionId?: string;
  };

  taxConfigurationVersion: {
    taxEngineVersion: string;
    jurisdiction: {
      originState: string;
      destinationState: string;
      isInterState: boolean;
    };
    taxComponents: {
      taxType: string;
      ratePercentage: number;
      taxableAmountMinor: number;
      taxAmountMinor: number;
      taxableAmountFormatted: string;
      taxAmountFormatted: string;
    }[];
  };

  calculationTimestamp: string;
  calculationReferenceId: string; // finalPricingResultId / pricingReference

  isFrozen: true;
  frozenAt: string;
  frozenBy: string;

  // Flattened convenience properties for backward compatibility with 11B
  unitPriceMinor: number;
  unitPriceFormatted: string;
  productPriceTotalMinor: number;
  productPriceTotalFormatted: string;
  logisticsCostTotalMinor: number;
  logisticsCostTotalFormatted: string;
  taxableAmountMinor: number;
  taxableAmountFormatted: string;
  totalTaxMinor: number;
  totalTaxFormatted: string;
  grandTotalMinor: number;
  grandTotalFormatted: string;
  taxJurisdiction: {
    originState: string;
    destinationState: string;
    isInterState: boolean;
  };
  taxComponents: {
    taxType: string;
    ratePercentage: number;
    taxableAmountMinor: number;
    taxAmountMinor: number;
    taxableAmountFormatted: string;
    taxAmountFormatted: string;
  }[];
  formulaNote: string;
}

export type OrderPaymentReadinessStatus = 'READY_FOR_PAYMENT' | 'PAYMENT_PENDING' | 'CANCELLED';

export interface OrderPaymentReadiness {
  id: string; // opr_...
  publicId: string; // AB-OPR-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  orderReference: string;

  advertiserId: string;
  advertiserPublicId: string;

  amount: {
    amountMinor: number;
    amountFormatted: string;
  };
  currency: 'INR';

  status: OrderPaymentReadinessStatus;

  snapshotReference: {
    snapshotId: string;
    snapshotPublicId: string;
  };

  readinessTimestamp: string;

  boundaries: {
    paymentInitiated: false;
    paymentCompleted: false;
  };

  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AdvertiserPaymentReadinessView {
  paymentReadinessId: string;
  publicId: string;
  orderPublicId: string;
  orderReference: string;
  status: OrderPaymentReadinessStatus;
  amountMinor: number;
  amountFormatted: string;
  currency: 'INR';
  pricingSnapshotPublicId: string;
  breakdown: {
    productPriceTotalFormatted: string;
    logisticsCostTotalFormatted: string;
    taxableAmountFormatted: string;
    totalTaxFormatted: string;
    grandTotalFormatted: string;
    taxes: {
      taxType: string;
      ratePercentage: number;
      taxAmountFormatted: string;
    }[];
  };
  readinessTimestamp: string;
}

export interface OrderOperationalTermsSnapshot {
  contractedQuantity: number;
  preferredStartPeriod: string;
  deliveryAddress: string;
  refrigerationRequired: boolean;
  stagingInstructions?: string;
  bottleSpecifications: {
    bottleMaterial: string;
    bottleCapacityMl: number;
    labelType: string;
    volumeLabel?: string;
    printingCapability?: string;
  };
}

export interface Order {
  id: string; // ord_...
  publicId: string; // AB-ORD-XXXXXX-2026
  orderReference: string; // ORD-REF-...
  idempotencyKey?: string;

  status: OrderStatus;
  statusHistory: OrderStatusTransition[];

  // 9 Required Authoritative References
  references: OrderAuthoritativeReferences;

  // Direct reference accessors for indexing and query convenience
  campaignId: string;
  campaignPublicId: string;
  advertiserId: string;
  advertiserPublicId: string;
  venueId: string;
  venuePublicId: string;
  campaignAgreementId: string;
  campaignAgreementPublicId: string;
  campaignAgreementSnapshotId: string;
  orderReadinessId: string;
  orderReadinessPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  logisticsAssignmentId: string;
  logisticsAssignmentPublicId: string;
  finalPricingResultId: string;
  finalPricingResultPublicId: string;

  pricingSnapshotId?: string;
  paymentReadinessId?: string;

  // Authoritative Pricing Snapshot
  pricing: OrderPricingSnapshot;

  // Operational snapshots preserved from authoritative agreements
  operationalTerms: OrderOperationalTermsSnapshot;

  // Safeguards & Downstream Boundaries (Payment & Production NOT yet implemented in 11B)
  boundaries: {
    orderCreated: true;
    paymentInitiated: false;
    productionStarted: false;
    fulfillmentScheduled: false;
  };

  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
}

export interface CreateOrderInput {
  orderReadinessId: string;
  idempotencyKey?: string;
}

export interface OrderSharedView {
  orderId: string;
  publicId: string;
  orderReference: string;
  status: OrderStatus;
  campaignName: string;
  advertiserBrandName: string;
  venueName: string;
  contractedQuantity: number;
  pricing: {
    currency: 'INR';
    grandTotalFormatted: string;
    productPriceTotalFormatted: string;
    logisticsCostTotalFormatted: string;
    totalTaxFormatted: string;
    taxComponents: {
      taxType: string;
      ratePercentage: number;
      taxAmountFormatted: string;
    }[];
  };
  references: {
    campaignPublicId: string;
    agreementPublicId: string;
    orderReadinessPublicId: string;
    supplierAssignmentPublicId: string;
    logisticsAssignmentPublicId: string;
    finalPricingPublicId: string;
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * ==========================================
 * STEP 11D: ADVERTISER ORDER REVIEW & PAYMENT HANDOFF
 * ==========================================
 */

export interface AdvertiserOrderReviewView {
  orderId: string;
  publicId: string;
  orderReference: string;
  status: OrderStatus;
  statusLabel: 'PAYMENT REQUIRED' | string;
  isPaymentRequired: boolean;

  // Campaign
  campaign: {
    id: string;
    publicId: string;
    name: string;
    preferredStartPeriod?: string;
  };

  // Venue
  venue: {
    id: string;
    publicId: string;
    name: string;
    city?: string;
    state?: string;
    address?: string;
    venueType?: string;
  };

  // Product
  product: {
    id: string;
    publicId: string;
    name: string;
    versionNumber: number;
    specifications: {
      bottleMaterial: string;
      bottleCapacityMl: number;
      labelType: string;
      volumeLabel?: string;
      printingCapability?: string;
    };
  };

  // Quantity
  contractedQuantity: number;

  // Logistics
  logistics: {
    assignmentPublicId: string;
    partnerBusinessName: string;
    deliveryAddress: string;
    preferredStartPeriod: string;
    refrigerationRequired: boolean;
    stagingInstructions?: string;
  };

  // Authoritative Pricing (strictly derived from OrderPricingSnapshot)
  pricing: {
    currency: 'INR';
    unitPriceFormatted: string;
    productPriceTotalFormatted: string;
    productPriceTotalMinor: number;
    logisticsCostTotalFormatted: string;
    logisticsCostTotalMinor: number;
    applicableTaxesFormatted: string;
    applicableTaxesMinor: number;
    grandTotalFormatted: string;
    grandTotalMinor: number;
    snapshotPublicId: string;
    isFrozen: true;
    pricingReference: string;
    calculatedAt: string;
    // Transparent expandable breakdown (NO internal cost, NO margin, NO venue compensation)
    taxBreakdown: {
      jurisdiction: {
        originState: string;
        destinationState: string;
        isInterState: boolean;
      };
      components: {
        taxType: string;
        ratePercentage: number;
        taxAmountFormatted: string;
      }[];
    };
  };

  // Payment Status & Readiness (Step 12G)
  payment: {
    status:
      | 'PAYMENT_REQUIRED'
      | 'PAYMENT REQUIRED'
      | 'PROCESSING'
      | 'VERIFICATION_PENDING'
      | 'PAID'
      | 'FAILED'
      | 'EXPIRED'
      | 'RECONCILIATION_PENDING'
      | string;
    statusLabel:
      | 'Payment Required'
      | 'Processing'
      | 'Verification Pending'
      | 'Paid'
      | 'Failed'
      | 'Expired'
      | 'Reconciliation Pending'
      | string;
    paymentReadinessPublicId: string;
    authoritativeAmountFormatted: string;
    authoritativeAmountMinor: number;
    currency: 'INR';
    canProceedToPayment: boolean;
    canRetryPayment: boolean;
    paymentReference?: string;
    paidAt?: string;
    failedAt?: string;
    lastFailureReason?: string;
    attemptsCount?: number;
    provider?: string;
    providerTransactionReference?: string;
    readinessTimestamp: string;
  };

  // Authoritative Fulfillment Authorization Status (Step 12F & 12G)
  fulfillmentAuthorization?: {
    authorizationId: string;
    authorizationPublicId: string;
    status: 'NOT_AUTHORIZED' | 'AUTHORIZED' | 'REVOKED' | string;
    isAuthorized: boolean;
    productionPermitted: boolean;
    authorizedAt?: string | null;
    commercialBoundary?: {
      productionStarted: boolean;
      cancellationPermitted: boolean;
      cancellationCutoffStage?: string;
      notice?: string;
    };
  };

  createdAt: string;
}

export interface OrderPaymentHandoffResult {
  orderId: string;
  orderPublicId: string;
  orderReference: string;
  paymentReadinessId: string;
  paymentReadinessPublicId: string;
  snapshotPublicId: string;
  authoritativeAmount: {
    amountMinor: number;
    amountFormatted: string;
    currency: 'INR';
  };
  status: 'HANDOFF_TO_PAYMENT_GATEWAY';
  nextStep: 'STEP_12_PAYMENT_GATEWAY';
  handoffTimestamp: string;
  message: string;
}

/**
 * ==========================================
 * STEP 12: PAYMENT ARCHITECTURE & INITIATION (STEP 12B)
 * ==========================================
 */

export type PaymentStatus =
  | 'PENDING'
  | 'REQUIRES_PAYMENT_METHOD'
  | 'REQUIRES_CONFIRMATION'
  | 'REQUIRES_ACTION'
  | 'PROCESSING'
  | 'PAID'
  | 'FAILED'
  | 'UNDERPAID_FLAGGED'
  | 'OVERPAID_RECONCILIATION_FLAGGED'
  | 'REVERSED'
  | 'RECONCILIATION_FLAGGED'
  | 'CANCELLED';

export type PaymentAttemptStatus =
  | 'INITIATED'
  | 'PROCESSING'
  | 'SUCCESS'
  | 'FAILED'
  | 'ABANDONED';

export interface PaymentAttempt {
  id: string; // pma_...
  publicId: string; // AB-PMA-XXXXXX-2026
  paymentId: string;
  orderId: string;
  attemptNumber: number;
  provider: string; // e.g. 'STRIPE', 'RAZORPAY', 'SIMULATED'
  providerReference?: string;
  status: PaymentAttemptStatus;
  amountMinor: number;
  currency: 'INR';
  failureReason?: string;
  errorCode?: string;
  metadata?: Record<string, any>;
  initiatedAt: string;
  completedAt?: string;
  verifiedAt?: string;
  verifiedAmountMinor?: number;
  verifiedCurrency?: string;
}

export interface Payment {
  id: string; // pay_...
  publicId: string; // AB-PAY-XXXXXX-2026
  paymentReference: string; // PAY-REF-...
  orderId: string;
  orderPublicId: string;
  orderReference: string;
  advertiserId: string;
  advertiserPublicId: string;

  // Authoritative financial amount frozen from OrderPricingSnapshot.grandTotal
  amountMinor: number;
  amountFormatted: string;
  currency: 'INR';

  // Authoritative snapshot link
  pricingSnapshotId: string;
  pricingSnapshotPublicId: string;

  status: PaymentStatus;
  provider: string;
  clientSecret?: string;
  paymentIntentId?: string;
  idempotencyKey?: string;

  attemptsCount: number;
  latestAttemptId?: string;

  // Step 12C Server-Side Payment Verification fields
  verifiedAt?: string;
  verifiedBy?: string;
  providerTransactionReference?: string;
  reconciliationStatus?: 'NONE' | 'UNDERPAID_FLAGGED' | 'OVERPAID_FLAGGED';
  reconciliationNotes?: string;
  discrepancyDetails?: {
    expectedAmountMinor: number;
    receivedAmountMinor: number;
    expectedCurrency: string;
    receivedCurrency: string;
  };

  // Timestamps & metadata
  initiatedAt: string;
  paidAt?: string;
  failedAt?: string;
  lastFailureReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Provider-independent Payment Intent options & result (Step 12B Provider Abstraction)
 */
export interface CreatePaymentIntentOptions {
  orderId: string;
  orderPublicId: string;
  amountMinor: number;
  currency: 'INR';
  advertiserId: string;
  customerEmail?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResult {
  paymentIntentId: string;
  clientSecret?: string;
  provider: string;
  status: 'REQUIRES_PAYMENT_METHOD' | 'REQUIRES_CONFIRMATION' | 'REQUIRES_ACTION' | 'PROCESSING';
  amountMinor: number;
  currency: 'INR';
  providerMetadata?: Record<string, any>;
}

/**
 * Step 12C Provider-independent verification result
 */
export interface ProviderVerificationResult {
  providerReference: string;
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'CANCELLED';
  amountMinor: number;
  currency: string;
  failureReason?: string;
  errorCode?: string;
  providerMetadata?: Record<string, any>;
  verifiedAt: string;
}

/**
 * Provider-independent Payment Provider interface
 */
export interface PaymentProvider {
  name: string;
  createPaymentIntent(options: CreatePaymentIntentOptions): Promise<PaymentIntentResult>;
  retrievePaymentIntent?(paymentIntentId: string): Promise<PaymentIntentResult>;
  verifyPayment(
    providerReference: string,
    metadata?: Record<string, any>
  ): Promise<ProviderVerificationResult>;
}

/**
 * Input & View types for Step 12B Payment Initiation API
 */
export interface InitiatePaymentInput {
  orderId: string;
  idempotencyKey?: string;
  providerPreference?: string;
  clientProvidedAmountMinor?: number; // Tamper check: if supplied and !== authoritative, must reject!
  clientProvidedCurrency?: string; // Tamper check: if supplied and !== 'INR', must reject!
}

export interface PaymentInitiationResult {
  paymentId: string;
  paymentPublicId: string;
  paymentReference: string;
  orderId: string;
  orderPublicId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  authoritativeAmount: {
    amountMinor: number;
    amountFormatted: string;
    currency: 'INR';
  };
  attemptNumber: number;
  attemptId: string;
  attemptPublicId: string;
  clientSecret?: string;
  paymentIntentId?: string;
  provider: string;
  isReused: boolean;
  message: string;
}

/**
 * Step 12C Server-Side Payment Verification Input & Result
 */
export interface VerifyPaymentInput {
  orderId: string;
  paymentId?: string;
  providerReference: string;
  providerPreference?: string;
  simulationOverride?: {
    status?: 'SUCCEEDED' | 'FAILED' | 'PENDING' | 'CANCELLED';
    amountMinor?: number;
    currency?: string;
    failureReason?: string;
    errorCode?: string;
  };
}

export interface PaymentVerificationResult {
  paymentId: string;
  paymentPublicId: string;
  paymentReference: string;
  orderId: string;
  orderPublicId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  isPaid: boolean;
  authoritativeAmount: {
    amountMinor: number;
    amountFormatted: string;
    currency: 'INR';
  };
  verifiedAmount: {
    amountMinor: number;
    amountFormatted: string;
    currency: string;
  };
  provider: string;
  providerReference: string;
  attemptId: string;
  attemptPublicId: string;
  attemptNumber: number;
  attemptStatus: PaymentAttemptStatus;
  reconciliationRequired: boolean;
  reconciliationType?: 'UNDERPAYMENT' | 'OVERPAYMENT';
  verifiedAt: string;
  message: string;
}

/**
 * ==========================================
 * STEP 12D: PAYMENT WEBHOOKS, IDEMPOTENCY & RECONCILIATION
 * ==========================================
 */

export type ReconciliationState = 'MATCHED' | 'PENDING_REVIEW' | 'MISMATCHED' | 'REVERSED';

export type WebhookProcessingStatus =
  | 'PROCESSED'
  | 'EVENT_ALREADY_PROCESSED'
  | 'REJECTED_INVALID_SIGNATURE'
  | 'REJECTED_REPLAY_ATTACK'
  | 'REJECTED_UNAUTHORIZED'
  | 'REJECTED_MISMATCH'
  | 'REVERSED'
  | 'FLAGGED_FOR_RECONCILIATION';

export interface ProviderWebhookEvent {
  id: string; // provider event ID, e.g. evt_...
  provider: string; // e.g. 'STRIPE', 'RAZORPAY', 'SIMULATED'
  eventType: string; // e.g. 'payment_intent.succeeded', 'payment_intent.payment_failed', 'charge.refunded', 'payment.reversed'
  timestamp: string; // ISO string or unix epoch string
  signature?: string;
  data: {
    orderId?: string;
    orderPublicId?: string;
    paymentIntentId?: string;
    providerReference: string;
    amountMinor: number;
    currency: string;
    status: 'SUCCEEDED' | 'FAILED' | 'REVERSED' | 'DISPUTED' | 'PROCESSING';
    failureReason?: string;
    errorCode?: string;
    reversalReason?: string;
    metadata?: Record<string, any>;
  };
}

export interface WebhookEventRecord {
  id: string; // whe_...
  providerEventId: string;
  provider: string;
  eventType: string;
  orderId?: string;
  paymentId?: string;
  status: WebhookProcessingStatus;
  receivedAt: string;
  processedAt: string;
  payloadDigestSha256: string;
  rawPayloadPreview?: string;
}

export interface PaymentReconciliationRecord {
  id: string; // prc_...
  publicId: string; // AB-PRC-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  paymentId?: string;
  paymentPublicId?: string;
  provider: string;
  providerEventId: string;
  providerReference: string;
  internalTransactionReference: string;
  reconciliationState: ReconciliationState;
  expectedAmountMinor: number;
  receivedAmountMinor: number;
  expectedCurrency: string;
  receivedCurrency: string;
  discrepancyReason?: string;
  eventTimestamp: string;
  receivedTimestamp: string;
  processedTimestamp: string;
  notes?: string;
  auditTrail: Array<{
    timestamp: string;
    action: string;
    details: string;
  }>;
}

export interface ProcessWebhookResult {
  received: boolean;
  status: WebhookProcessingStatus;
  providerEventId: string;
  paymentId?: string;
  orderId?: string;
  reconciliationState?: ReconciliationState;
  message: string;
  processedAt: string;
}

/**
 * ==========================================
 * STEP 12E: FINANCIAL LEDGER FOUNDATION
 * ==========================================
 */

export type FinancialTransactionType =
  | 'PAYMENT_RECEIVED'
  | 'SUPPLIER_PAYABLE_ACCRUAL'
  | 'VENUE_COMPENSATION_ACCRUAL'
  | 'LOGISTICS_PAYABLE_ACCRUAL'
  | 'TAX_LIABILITY_ACCRUAL'
  | 'PLATFORM_MARGIN_ACCRUAL';

export type LedgerEntryDirection = 'CREDIT' | 'DEBIT';

export type SettlementStatus = 'UNSETTLED' | 'PENDING_BATCH' | 'SETTLED';

export type FinancialPartyRole =
  | 'ADVERTISER'
  | 'SUPPLIER'
  | 'VENUE'
  | 'LOGISTICS_PARTNER'
  | 'PLATFORM'
  | 'TAX_AUTHORITY';

export interface FinancialParty {
  partyRole: FinancialPartyRole;
  partyId: string;
  partyPublicId?: string;
  partyName: string;
}

export interface FinancialLedgerEntry {
  id: string; // led_...
  publicId: string; // AB-FTX-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  paymentId: string;
  paymentPublicId: string;
  transactionType: FinancialTransactionType;
  amountMinor: number;
  amountFormatted: string;
  currency: 'INR';
  direction: LedgerEntryDirection;
  timestamp: string;
  sourceReference: string;
  reconciliationStatus: ReconciliationState;
  relatedParty: FinancialParty;
  settlementReference?: string | null;
  settlementStatus: SettlementStatus;
  notes?: string;
  metadata?: Record<string, any>;
}

export interface VenueCompensationRecord {
  id: string; // vcr_...
  publicId: string; // AB-VCR-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  campaignId: string;
  campaignPublicId: string;
  campaignName: string;
  venueId: string;
  venuePublicId: string;
  venueName: string;
  paymentId: string;
  paymentPublicId: string;
  eligibleSupplierBottleAdvertisingCostMinor: number;
  eligibleSupplierBottleAdvertisingCostFormatted: string;
  compensationRatePercentage: number;
  statutoryCapPercentage: 12.5;
  cappedAtStatutoryLimit: boolean;
  compensationAmountMinor: number;
  compensationAmountFormatted: string;
  currency: 'INR';
  compensationStatus: 'ACCRUED' | 'PENDING_SETTLEMENT' | 'SETTLED';
  settlementStatus: SettlementStatus;
  settlementReference?: string | null;
  accruedAt: string;
  exclusions: {
    advertiserPlanFeeExcluded: true;
    logisticsExcluded: true;
    taxExcluded: true;
    unrelatedChargesExcluded: true;
  };
}

export interface VenueCompensationSettlementView {
  compensationRecordId: string;
  compensationPublicId: string;
  orderPublicId: string;
  campaignName: string;
  venueName: string;
  eligibleBaseDescription: string;
  compensationRatePercentage: number;
  compensationAmountFormatted: string;
  currency: 'INR';
  compensationStatus: 'ACCRUED' | 'PENDING_SETTLEMENT' | 'SETTLED';
  expectedSettlementInformation: string;
  accruedAt: string;
}

export interface SupplierPayableSettlementView {
  ledgerEntryId: string;
  publicId: string;
  orderPublicId: string;
  supplierBusinessName: string;
  productName: string;
  quantity: number;
  payableAmountFormatted: string;
  currency: 'INR';
  settlementStatus: SettlementStatus;
  accruedAt: string;
}

export interface LogisticsPayableSettlementView {
  ledgerEntryId: string;
  publicId: string;
  orderPublicId: string;
  logisticsPartnerBusinessName: string;
  payableAmountFormatted: string;
  currency: 'INR';
  settlementStatus: SettlementStatus;
  accruedAt: string;
}

export interface OrderFinancialLedgerSummary {
  orderId: string;
  orderPublicId: string;
  paymentId: string;
  paymentPublicId: string;
  paymentReceivedTotalMinor: number;
  paymentReceivedTotalFormatted: string;
  supplierPayableMinor: number;
  supplierPayableFormatted: string;
  venueCompensationMinor: number;
  venueCompensationFormatted: string;
  logisticsPayableMinor: number;
  logisticsPayableFormatted: string;
  taxLiabilityMinor: number;
  taxLiabilityFormatted: string;
  platformMarginMinor: number;
  platformMarginFormatted: string;
  isBalanced: boolean;
  entriesCount: number;
  currency: 'INR';
  entries: FinancialLedgerEntry[];
}

/**
 * ==========================================
 * STEP 12F: PAYMENT -> FULFILLMENT AUTHORIZATION TYPES
 * ==========================================
 */

export type FulfillmentAuthorizationStatus = 'AUTHORIZED' | 'NOT_AUTHORIZED';

export type FulfillmentValidationCheckCode =
  | 'AGREEMENT_LOCKED'
  | 'SUPPLIER_ASSIGNED'
  | 'LOGISTICS_ASSIGNED'
  | 'ORDER_PAID'
  | 'PAYMENT_VERIFIED'
  | 'FINANCIAL_TRANSACTION_VALID';

export interface FulfillmentValidationCheck {
  code: FulfillmentValidationCheckCode;
  name: string;
  passed: boolean;
  details?: string;
  blocking: boolean;
}

export interface FulfillmentValidationSummary {
  isValid: boolean;
  checks: FulfillmentValidationCheck[];
  failureReasons: string[];
}

export interface FulfillmentCommercialBoundary {
  productionStarted: boolean; // Starts as false until production engine begins
  cancellationPermitted: boolean; // True before production starts; false once production starts
  boundaryNote: string;
}

export interface FulfillmentAuthorization {
  id: string; // ffa_...
  publicId: string; // AB-FFA-XXXXXX-2026
  orderId: string;
  orderPublicId: string;
  orderReference: string;
  paymentId: string;
  paymentPublicId: string;
  campaignId: string;
  campaignPublicId: string;
  supplierAssignmentId: string;
  supplierAssignmentPublicId: string;
  logisticsAssignmentId: string;
  logisticsAssignmentPublicId: string;
  agreementId: string;
  agreementPublicId: string;

  status: FulfillmentAuthorizationStatus; // 'AUTHORIZED' | 'NOT_AUTHORIZED'
  authorizedAt?: string | null;
  deniedAt?: string | null;
  authorizedBy: string; // Actor ID or system (e.g. 'SYSTEM_FINANCIAL_GATE')
  sourcePaymentReference: string; // Provider transaction reference or payment intent ID

  validationResults: FulfillmentValidationSummary;
  productionPermitted: boolean;
  commercialBoundary: FulfillmentCommercialBoundary;

  auditEventId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentAuthorizationView {
  authorizationId: string;
  authorizationPublicId: string;
  orderPublicId: string;
  orderReference: string;
  status: FulfillmentAuthorizationStatus;
  isAuthorized: boolean;
  productionPermitted: boolean;
  authorizedAt?: string | null;
  deniedAt?: string | null;
  sourcePaymentReference: string;
  commercialBoundary: {
    productionStarted: boolean;
    cancellationPermitted: boolean;
    notice: string;
  };
  validationSummary: {
    agreementLocked: boolean;
    supplierAssigned: boolean;
    logisticsAssigned: boolean;
    orderPaid: boolean;
    paymentVerified: boolean;
    financialTransactionValid: boolean;
    allChecksPassed: boolean;
    failureReasons: string[];
  };
  createdAt: string;
}

