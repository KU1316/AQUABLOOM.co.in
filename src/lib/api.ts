/**
 * AquaBloom Client API Service
 * 
 * Communicates with backend endpoints (/api/*)
 * Manages authorization headers and standardized error mapping.
 */

import {
  User,
  Session,
  RegisterInput,
  LoginInput,
  UserProfile,
  ApprovalStatus,
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
  CampaignValidationResult,
  CampaignOpportunityView,
  VenueMarketplaceQuery,
  MarketplaceVenue,
  PaginatedResult,
  CapacityEvaluation,
  VenueCapacityOverview,
  Proposal,
  ProposalVersion,
  ProposalDetailView,
  CreateProposalInput,
  CounterProposalInput,
  AcceptProposalInput,
  DeclineProposalInput,
  WithdrawProposalInput,
  ProposalFilterQuery,
  CampaignAgreementSharedView,
  CampaignAgreementPreviewView,
  SanitizedAgreementVersion,
  CampaignAgreementSnapshot,
  AppEvent,
  SupplierOperationalOffer,
  SupplierAssignment,
  SupplierCandidateMatch,
  SupplierAssignmentSharedView,
  CreateSupplierOfferInput,
  DeclineSupplierOfferInput,
  AcceptSupplierOfferInput,
  LogisticsOperationalOffer,
  LogisticsAssignment,
  LogisticsCandidateMatch,
  LogisticsAssignmentSharedView,
  CreateLogisticsOfferInput,
  DeclineLogisticsOfferInput,
  AcceptLogisticsOfferInput,
  ReassignLogisticsInput,
  Order,
  OrderSharedView,
  AdvertiserOrderReviewView,
  OrderPricingSnapshot,
  OrderPaymentReadiness,
  OrderPaymentHandoffResult,
  Payment,
  PaymentAttempt,
  InitiatePaymentInput,
  PaymentInitiationResult,
  PaymentVerificationResult,
  PaymentReconciliationRecord,
  FulfillmentAuthorizationView,
  VenueCompensationSettlementView,
  SupplierPayableSettlementView,
  LogisticsPayableSettlementView,
} from '../types.js';

const SESSION_STORAGE_KEY = 'aquabloom_session_token';

class ApiService {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem(SESSION_STORAGE_KEY);
    }
  }

  public setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token) {
        localStorage.setItem(SESSION_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    }
  }

  public getToken(): string | null {
    return this.token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<{ data?: T; error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> } }> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const res = await fetch(endpoint, {
        ...options,
        headers,
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        return {
          error: json.error || {
            code: 'API_ERROR',
            message: 'Server returned an unsuccessful response.',
          },
        };
      }

      return { data: json.data as T };
    } catch (err: unknown) {
      return {
        error: {
          code: 'NETWORK_ERROR',
          message: err instanceof Error ? err.message : 'Unable to connect to AquaBloom network service.',
        },
      };
    }
  }

  // --- Auth Methods ---
  public async register(
    input: RegisterInput
  ): Promise<{ data?: { user: User; profile: UserProfile; session: Session }; error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> } }> {
    const res = await this.request<{ user: User; profile: UserProfile; session: Session }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (res.data?.session.token) {
      this.setToken(res.data.session.token);
    }
    return res;
  }

  public async login(
    input: LoginInput
  ): Promise<{ data?: { user: User; profile: UserProfile; session: Session }; error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> } }> {
    const res = await this.request<{ user: User; profile: UserProfile; session: Session }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    if (res.data?.session.token) {
      this.setToken(res.data.session.token);
    }
    return res;
  }

  public async getSession(): Promise<{ data?: { user: User; profile?: UserProfile; session: Session }; error?: { code: string; message: string } }> {
    if (!this.token) {
      return { error: { code: 'NO_SESSION', message: 'No stored session.' } };
    }

    const res = await this.request<{ user: User; profile?: UserProfile; session: Session }>('/api/auth/session', {
      method: 'GET',
    });

    if (res.error) {
      this.setToken(null);
    }
    return res;
  }

  public async logout(): Promise<void> {
    await this.request('/api/auth/logout', {
      method: 'POST',
    });
    this.setToken(null);
  }

  // --- Profile Methods (Step 2) ---
  public async getProfile(): Promise<{
    data?: { user: User; profile: UserProfile };
    error?: { code: string; message: string };
  }> {
    return this.request<{ user: User; profile: UserProfile }>('/api/profile/me', {
      method: 'GET',
    });
  }

  public async updateProfile(
    updates: Partial<UserProfile>
  ): Promise<{
    data?: { user: User; profile: UserProfile };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ user: User; profile: UserProfile }>('/api/profile/me', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async getProfileById(userId: string): Promise<{
    data?: { user?: User; profile?: UserProfile; [key: string]: unknown };
    error?: { code: string; message: string };
  }> {
    return this.request(`/api/profiles/${userId}`, {
      method: 'GET',
    });
  }

  // --- Admin Review Methods (Step 2) ---
  public async getAdminPendingApplications(): Promise<{
    data?: Array<{ user: User; profile: UserProfile }>;
    error?: { code: string; message: string };
  }> {
    return this.request<Array<{ user: User; profile: UserProfile }>>('/api/admin/pending-applications', {
      method: 'GET',
    });
  }

  public async adminReviewApplication(
    targetUserId: string,
    decision: ApprovalStatus,
    notes?: string
  ): Promise<{
    data?: { user: User; profile: UserProfile };
    error?: { code: string; message: string };
  }> {
    return this.request<{ user: User; profile: UserProfile }>('/api/admin/review-application', {
      method: 'POST',
      body: JSON.stringify({ targetUserId, decision, notes }),
    });
  }

  // ==========================================
  // STEP 3: PRODUCT CATALOG CLIENT METHODS
  // ==========================================

  public async createProduct(
    input: CreateProductInput,
    idempotencyKey?: string
  ): Promise<{
    data?: { product: Product; version: ProductVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return this.request<{ product: Product; version: ProductVersion }>('/api/products', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
  }

  public async getSupplierProducts(): Promise<{
    data?: Product[];
    error?: { code: string; message: string };
  }> {
    return this.request<Product[]>('/api/products/supplier', {
      method: 'GET',
    });
  }

  public async getProduct(productId: string): Promise<{
    data?: { product: Product; versions?: ProductVersion[] } | CustomerFacingProductSummary;
    error?: { code: string; message: string };
  }> {
    return this.request(`/api/products/${productId}`, {
      method: 'GET',
    });
  }

  public async updateProduct(
    productId: string,
    updates: UpdateProductInput
  ): Promise<{
    data?: Product;
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<Product>(`/api/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async createProductVersion(
    productId: string,
    versionInput: CreateProductVersionInput,
    idempotencyKey?: string
  ): Promise<{
    data?: { product: Product; version: ProductVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return this.request<{ product: Product; version: ProductVersion }>(`/api/products/${productId}/versions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(versionInput),
    });
  }

  public async updateProductStatus(
    productId: string,
    status: ProductStatus
  ): Promise<{
    data?: Product;
    error?: { code: string; message: string };
  }> {
    return this.request<Product>(`/api/products/${productId}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  public async updateProductAvailability(
    productId: string,
    availability: ProductAvailability
  ): Promise<{
    data?: Product;
    error?: { code: string; message: string };
  }> {
    return this.request<Product>(`/api/products/${productId}/availability`, {
      method: 'POST',
      body: JSON.stringify({ availability }),
    });
  }

  public async deleteDraftProduct(productId: string): Promise<{
    data?: { message: string };
    error?: { code: string; message: string };
  }> {
    return this.request<{ message: string }>(`/api/products/${productId}`, {
      method: 'DELETE',
    });
  }

  public async getMarketplaceProducts(filters?: {
    category?: string;
    material?: string;
    maxPrice?: number;
    search?: string;
  }): Promise<{
    data?: CustomerFacingProductSummary[];
    error?: { code: string; message: string };
  }> {
    const params = new URLSearchParams();
    if (filters?.category) params.append('category', filters.category);
    if (filters?.material) params.append('material', filters.material);
    if (filters?.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString());
    if (filters?.search) params.append('search', filters.search);

    const query = params.toString() ? `?${params.toString()}` : '';
    return this.request<CustomerFacingProductSummary[]>(`/api/products${query}`, {
      method: 'GET',
    });
  }

  // --- Step 4: Campaign Methods ---

  public async createCampaign(
    input: CreateCampaignInput,
    idempotencyKey?: string
  ): Promise<{
    data?: { campaign: Campaign; version: CampaignVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    const headers: Record<string, string> = {};
    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return this.request<{ campaign: Campaign; version: CampaignVersion }>('/api/campaigns', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
  }

  public async getCampaigns(advertiserId?: string): Promise<{
    data?: Campaign[];
    error?: { code: string; message: string };
  }> {
    const query = advertiserId ? `?advertiserId=${encodeURIComponent(advertiserId)}` : '';
    return this.request<Campaign[]>(`/api/campaigns${query}`, {
      method: 'GET',
    });
  }

  public async getCampaign(campaignId: string): Promise<{
    data?: Campaign;
    error?: { code: string; message: string };
  }> {
    return this.request<Campaign>(`/api/campaigns/${campaignId}`, {
      method: 'GET',
    });
  }

  public async updateCampaign(
    campaignId: string,
    updates: UpdateCampaignInput
  ): Promise<{
    data?: { campaign: Campaign; version: CampaignVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ campaign: Campaign; version: CampaignVersion }>(`/api/campaigns/${campaignId}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  public async validateCampaignDraft(campaignId: string): Promise<{
    data?: CampaignValidationResult;
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignValidationResult>(`/api/campaigns/${campaignId}/validate`, {
      method: 'POST',
    });
  }

  public async prepareCampaignForMatching(campaignId: string): Promise<{
    data?: { campaign: Campaign; validationResult: CampaignValidationResult };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ campaign: Campaign; validationResult: CampaignValidationResult }>(
      `/api/campaigns/${campaignId}/prepare-for-matching`,
      {
        method: 'POST',
      }
    );
  }

  public async revertCampaignToDraft(campaignId: string): Promise<{
    data?: Campaign;
    error?: { code: string; message: string };
  }> {
    return this.request<Campaign>(`/api/campaigns/${campaignId}/revert-to-draft`, {
      method: 'POST',
    });
  }

  public async getCampaignVersions(campaignId: string): Promise<{
    data?: CampaignVersion[];
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignVersion[]>(`/api/campaigns/${campaignId}/versions`, {
      method: 'GET',
    });
  }

  public async getCampaignOpportunity(campaignId: string): Promise<{
    data?: CampaignOpportunityView;
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignOpportunityView>(`/api/campaigns/${campaignId}/opportunity`, {
      method: 'GET',
    });
  }

  public async deleteDraftCampaign(campaignId: string): Promise<{
    data?: { message: string };
    error?: { code: string; message: string };
  }> {
    return this.request<{ message: string }>(`/api/campaigns/${campaignId}`, {
      method: 'DELETE',
    });
  }

  public async getNotifications(): Promise<{
    data?: Array<{
      id: string;
      userId: string;
      title: string;
      message: string;
      type: string;
      read: boolean;
      createdAt: string;
      campaignId?: string;
      publicCampaignId?: string;
    }>;
    error?: { code: string; message: string };
  }> {
    return this.request('/api/notifications', {
      method: 'GET',
    });
  }

  public async markNotificationRead(notificationId: string): Promise<{
    data?: { success: boolean };
    error?: { code: string; message: string };
  }> {
    return this.request(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
    });
  }

  // --- Step 5: Venue Marketplace & Discovery Methods ---

  public async getMarketplaceVenues(query: VenueMarketplaceQuery): Promise<{
    data?: PaginatedResult<MarketplaceVenue>;
    error?: { code: string; message: string };
  }> {
    const params = new URLSearchParams();
    if (query.campaignId) params.set('campaignId', query.campaignId);
    if (query.city && query.city !== 'ALL') params.set('city', query.city);
    if (query.venueType && query.venueType !== 'ALL') params.set('venueType', query.venueType);
    if (query.audienceCategory && query.audienceCategory !== 'ALL') params.set('audienceCategory', query.audienceCategory);
    if (query.capacityStatus && query.capacityStatus !== 'ALL') params.set('capacityStatus', query.capacityStatus);
    if (query.minScore) params.set('minScore', query.minScore.toString());
    if (query.minFootfall) params.set('minFootfall', query.minFootfall.toString());
    if (query.search) params.set('search', query.search);
    if (query.sortBy) params.set('sortBy', query.sortBy);
    if (query.sortOrder) params.set('sortOrder', query.sortOrder);
    if (query.page) params.set('page', query.page.toString());
    if (query.pageSize) params.set('pageSize', query.pageSize.toString());

    return this.request<PaginatedResult<MarketplaceVenue>>(`/api/marketplace/venues?${params.toString()}`, {
      method: 'GET',
    });
  }

  public async getMarketplaceVenueDetail(venueIdOrPublicId: string, campaignId?: string): Promise<{
    data?: MarketplaceVenue;
    error?: { code: string; message: string };
  }> {
    const params = new URLSearchParams();
    if (campaignId) params.set('campaignId', campaignId);
    const queryString = params.toString() ? `?${params.toString()}` : '';
    return this.request<MarketplaceVenue>(`/api/marketplace/venues/${venueIdOrPublicId}${queryString}`, {
      method: 'GET',
    });
  }

  public async getVenueOpportunities(query?: {
    category?: string;
    search?: string;
    minQuantity?: number;
    maxQuantity?: number;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data?: PaginatedResult<CampaignOpportunityView & { capacityEvaluation: CapacityEvaluation }>;
    error?: { code: string; message: string };
  }> {
    const params = new URLSearchParams();
    if (query?.category && query.category !== 'ALL') params.set('category', query.category);
    if (query?.search) params.set('search', query.search);
    if (query?.minQuantity) params.set('minQuantity', query.minQuantity.toString());
    if (query?.maxQuantity) params.set('maxQuantity', query.maxQuantity.toString());
    if (query?.page) params.set('page', query.page.toString());
    if (query?.pageSize) params.set('pageSize', query.pageSize.toString());

    return this.request<PaginatedResult<CampaignOpportunityView & { capacityEvaluation: CapacityEvaluation }>>(
      `/api/venue/opportunities?${params.toString()}`,
      { method: 'GET' }
    );
  }

  public async getVenueCapacity(): Promise<{
    data?: VenueCapacityOverview;
    error?: { code: string; message: string };
  }> {
    return this.request<VenueCapacityOverview>('/api/venue/capacity', {
      method: 'GET',
    });
  }

  public async getPublicVenues(): Promise<{
    data?: Array<{
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
    }>;
    error?: { code: string; message: string };
  }> {
    return this.request('/api/public/venues', {
      method: 'GET',
    });
  }

  // ==========================================
  // STEP 6: PROPOSAL & NEGOTIATION API METHODS
  // ==========================================

  public async createProposal(input: CreateProposalInput): Promise<{
    data?: { proposal: Proposal; version: ProposalVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ proposal: Proposal; version: ProposalVersion }>('/api/proposals', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  public async getProposals(query?: ProposalFilterQuery): Promise<{
    data?: Proposal[];
    error?: { code: string; message: string };
  }> {
    const params = new URLSearchParams();
    if (query?.campaignId) params.set('campaignId', query.campaignId);
    if (query?.venueId) params.set('venueId', query.venueId);
    if (query?.status && query.status !== 'ALL') params.set('status', query.status);
    if (query?.page) params.set('page', query.page.toString());
    if (query?.pageSize) params.set('pageSize', query.pageSize.toString());

    return this.request<Proposal[]>(`/api/proposals?${params.toString()}`, {
      method: 'GET',
    });
  }

  public async getProposalDetail(proposalId: string): Promise<{
    data?: ProposalDetailView;
    error?: { code: string; message: string };
  }> {
    return this.request<ProposalDetailView>(`/api/proposals/${proposalId}`, {
      method: 'GET',
    });
  }

  public async markProposalViewed(proposalId: string): Promise<{
    data?: Proposal;
    error?: { code: string; message: string };
  }> {
    return this.request<Proposal>(`/api/proposals/${proposalId}/view`, {
      method: 'POST',
    });
  }

  public async counterProposal(
    proposalId: string,
    input: CounterProposalInput
  ): Promise<{
    data?: { proposal: Proposal; version: ProposalVersion };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ proposal: Proposal; version: ProposalVersion }>(
      `/api/proposals/${proposalId}/counter`,
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async acceptProposal(
    proposalId: string,
    input: AcceptProposalInput
  ): Promise<{
    data?: { proposal: Proposal; isMutuallyConfirmed: boolean };
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<{ proposal: Proposal; isMutuallyConfirmed: boolean }>(
      `/api/proposals/${proposalId}/accept`,
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async declineProposal(
    proposalId: string,
    input: DeclineProposalInput
  ): Promise<{
    data?: Proposal;
    error?: { code: string; message: string; details?: Array<{ field?: string; message: string }> };
  }> {
    return this.request<Proposal>(`/api/proposals/${proposalId}/decline`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  public async withdrawProposal(
    proposalId: string,
    input: WithdrawProposalInput
  ): Promise<{
    data?: Proposal;
    error?: { code: string; message: string };
  }> {
    return this.request<Proposal>(`/api/proposals/${proposalId}/withdraw`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  // ==========================================
  // STEP 7: CAMPAIGN AGREEMENT CLIENT METHODS
  // ==========================================

  public async getCampaignAgreements(params?: {
    campaignId?: string;
    venueId?: string;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    data?: CampaignAgreementSharedView[];
    error?: { code: string; message: string };
  }> {
    const searchParams = new URLSearchParams();
    if (params?.campaignId) searchParams.append('campaignId', params.campaignId);
    if (params?.venueId) searchParams.append('venueId', params.venueId);
    if (params?.status && params.status !== 'ALL') searchParams.append('status', params.status);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    const qs = searchParams.toString();
    return this.request<CampaignAgreementSharedView[]>(`/api/campaign-agreements${qs ? `?${qs}` : ''}`, {
      method: 'GET',
    });
  }

  public async createCampaignAgreement(input: {
    sourceProposalId: string;
    idempotencyKey?: string;
  }): Promise<{
    data?: {
      id?: string;
      agreementId?: string;
      publicId?: string;
      status?: string;
    };
    error?: { code: string; message: string };
  }> {
    return this.request<{
      id?: string;
      agreementId?: string;
      publicId?: string;
      status?: string;
    }>('/api/campaign-agreements', {
      method: 'POST',
      body: JSON.stringify({ sourceProposalId: input.sourceProposalId }),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  public async getCampaignAgreement(agreementId: string): Promise<{
    data?: CampaignAgreementSharedView;
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignAgreementSharedView>(`/api/campaign-agreements/${agreementId}`, {
      method: 'GET',
    });
  }

  public async getCampaignAgreementPreview(agreementId: string): Promise<{
    data?: CampaignAgreementPreviewView;
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignAgreementPreviewView>(`/api/campaign-agreements/${agreementId}/preview`, {
      method: 'GET',
    });
  }

  public async getCampaignAgreementVersions(agreementId: string): Promise<{
    data?: SanitizedAgreementVersion[];
    error?: { code: string; message: string };
  }> {
    return this.request<SanitizedAgreementVersion[]>(`/api/campaign-agreements/${agreementId}/versions`, {
      method: 'GET',
    });
  }

  public async getCampaignAgreementVersion(
    agreementId: string,
    versionIdentifier: string | number
  ): Promise<{
    data?: SanitizedAgreementVersion;
    error?: { code: string; message: string };
  }> {
    return this.request<SanitizedAgreementVersion>(
      `/api/campaign-agreements/${agreementId}/versions/${versionIdentifier}`,
      {
        method: 'GET',
      }
    );
  }

  public async confirmCampaignAgreement(
    agreementId: string,
    input: {
      expectedVersion: number;
      acknowledgement: boolean;
      notes?: string;
      idempotencyKey?: string;
    }
  ): Promise<{
    data?: { agreement: CampaignAgreementSharedView };
    error?: { code: string; message: string };
  }> {
    return this.request<{ agreement: CampaignAgreementSharedView }>(
      `/api/campaign-agreements/${agreementId}/confirm`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          acknowledgement: input.acknowledgement,
          notes: input.notes,
        }),
        headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async lockCampaignAgreement(
    agreementId: string,
    input: {
      expectedVersion: number;
      lockVersion: number;
      idempotencyKey?: string;
    }
  ): Promise<{
    data?: { agreement: CampaignAgreementSharedView; snapshotPublicId: string };
    error?: { code: string; message: string };
  }> {
    return this.request<{ agreement: CampaignAgreementSharedView; snapshotPublicId: string }>(
      `/api/campaign-agreements/${agreementId}/lock`,
      {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: input.expectedVersion,
          lockVersion: input.lockVersion,
        }),
        headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async getCampaignAgreementSnapshot(agreementId: string): Promise<{
    data?: CampaignAgreementSnapshot;
    error?: { code: string; message: string };
  }> {
    return this.request<CampaignAgreementSnapshot>(`/api/campaign-agreements/${agreementId}/snapshot`, {
      method: 'GET',
    });
  }

  // ==========================================
  // AUDIT EVENTS CLIENT METHOD
  // ==========================================
  public async getAuditEvents(): Promise<{
    data?: AppEvent[];
    error?: { code: string; message: string };
  }> {
    return this.request<AppEvent[]>('/api/audit/events', {
      method: 'GET',
    });
  }

  // ==========================================
  // STEP 9: SUPPLIER ASSIGNMENT & OFFER METHODS
  // ==========================================
  public async getSupplierOffers(query?: { orderReadinessId?: string }): Promise<{
    data?: SupplierOperationalOffer[];
    error?: { code: string; message: string };
  }> {
    const url = query?.orderReadinessId
      ? `/api/supplier-offers?orderReadinessId=${encodeURIComponent(query.orderReadinessId)}`
      : '/api/supplier-offers';
    return this.request<SupplierOperationalOffer[]>(url, {
      method: 'GET',
    });
  }

  public async getSupplierOffer(offerId: string): Promise<{
    data?: SupplierOperationalOffer;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierOperationalOffer>(`/api/supplier-offers/${offerId}`, {
      method: 'GET',
    });
  }

  public async acceptSupplierOffer(
    offerId: string,
    input?: AcceptSupplierOfferInput
  ): Promise<{
    data?: { offer: SupplierOperationalOffer; assignment: SupplierAssignment };
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<{ offer: SupplierOperationalOffer; assignment: SupplierAssignment }>(
      `/api/supplier-offers/${offerId}/accept`,
      {
        method: 'POST',
        headers: input?.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async declineSupplierOffer(
    offerId: string,
    input: DeclineSupplierOfferInput
  ): Promise<{
    data?: SupplierOperationalOffer;
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierOperationalOffer>(`/api/supplier-offers/${offerId}/decline`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  public async getSupplierAssignments(): Promise<{
    data?: SupplierAssignment[];
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierAssignment[]>('/api/supplier-assignments', {
      method: 'GET',
    });
  }

  public async getSupplierAssignment(assignmentId: string): Promise<{
    data?: SupplierAssignment;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierAssignment>(`/api/supplier-assignments/${assignmentId}`, {
      method: 'GET',
    });
  }

  public async getSupplierAssignmentSharedView(assignmentId: string): Promise<{
    data?: SupplierAssignmentSharedView;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierAssignmentSharedView>(`/api/supplier-assignments/${assignmentId}/shared-view`, {
      method: 'GET',
    });
  }

  public async getSupplierAssignmentForReadiness(orderReadinessId: string): Promise<{
    data?: SupplierAssignment;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierAssignment>(
      `/api/order-readiness/${orderReadinessId}/supplier-assignment`,
      {
        method: 'GET',
      }
    );
  }

  // ==========================================
  // STEP 10: LOGISTICS ASSIGNMENT CLIENT METHODS
  // ==========================================
  public async getLogisticsCandidates(orderReadinessId: string): Promise<{
    data?: LogisticsCandidateMatch[];
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsCandidateMatch[]>(
      `/api/order-readiness/${orderReadinessId}/logistics-candidates`,
      {
        method: 'GET',
      }
    );
  }

  public async createLogisticsOffer(
    input: CreateLogisticsOfferInput,
    idempotencyKey?: string
  ): Promise<{
    data?: LogisticsOperationalOffer;
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsOperationalOffer>('/api/logistics-offers', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
    });
  }

  public async getLogisticsOffers(query?: { orderReadinessId?: string }): Promise<{
    data?: LogisticsOperationalOffer[];
    error?: { code: string; message: string };
  }> {
    const url = query?.orderReadinessId
      ? `/api/logistics-offers?orderReadinessId=${encodeURIComponent(query.orderReadinessId)}`
      : '/api/logistics-offers';
    return this.request<LogisticsOperationalOffer[]>(url, {
      method: 'GET',
    });
  }

  public async getLogisticsOffer(offerId: string): Promise<{
    data?: LogisticsOperationalOffer;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsOperationalOffer>(`/api/logistics-offers/${offerId}`, {
      method: 'GET',
    });
  }

  public async acceptLogisticsOffer(
    offerId: string,
    input?: AcceptLogisticsOfferInput
  ): Promise<{
    data?: { offer: LogisticsOperationalOffer; assignment: LogisticsAssignment };
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<{ offer: LogisticsOperationalOffer; assignment: LogisticsAssignment }>(
      `/api/logistics-offers/${offerId}/accept`,
      {
        method: 'POST',
        headers: input?.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  public async declineLogisticsOffer(
    offerId: string,
    input: DeclineLogisticsOfferInput
  ): Promise<{
    data?: LogisticsOperationalOffer;
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsOperationalOffer>(`/api/logistics-offers/${offerId}/decline`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
    });
  }

  public async getLogisticsAssignmentForReadiness(orderReadinessId: string): Promise<{
    data?: LogisticsAssignment;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsAssignment>(
      `/api/order-readiness/${orderReadinessId}/logistics-assignment`,
      {
        method: 'GET',
      }
    );
  }

  public async getLogisticsAssignment(assignmentId: string): Promise<{
    data?: LogisticsAssignment;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsAssignment>(`/api/logistics-assignments/${assignmentId}`, {
      method: 'GET',
    });
  }

  public async getLogisticsAssignmentSharedView(assignmentId: string): Promise<{
    data?: LogisticsAssignmentSharedView;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsAssignmentSharedView>(
      `/api/logistics-assignments/${assignmentId}/shared-view`,
      {
        method: 'GET',
      }
    );
  }

  public async reassignLogistics(
    assignmentId: string,
    input: ReassignLogisticsInput
  ): Promise<{
    data?: LogisticsAssignment;
    message?: string;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsAssignment>(
      `/api/logistics-assignments/${assignmentId}/reassign`,
      {
        method: 'POST',
        body: JSON.stringify(input),
        headers: input.idempotencyKey ? { 'idempotency-key': input.idempotencyKey } : undefined,
      }
    );
  }

  // ==========================================
  // STEP 11B & 11D: ORDER & REVIEW METHODS
  // ==========================================

  public async getOrders(): Promise<{
    data?: Order[];
    error?: { code: string; message: string };
  }> {
    return this.request<Order[]>('/api/orders', {
      method: 'GET',
    });
  }

  public async getOrder(orderId: string): Promise<{
    data?: Order;
    error?: { code: string; message: string };
  }> {
    return this.request<Order>(`/api/orders/${orderId}`, {
      method: 'GET',
    });
  }

  public async getOrderSharedView(orderId: string): Promise<{
    data?: OrderSharedView;
    error?: { code: string; message: string };
  }> {
    return this.request<OrderSharedView>(`/api/orders/${orderId}/shared-view`, {
      method: 'GET',
    });
  }

  public async getAdvertiserOrderReview(orderId: string): Promise<{
    data?: AdvertiserOrderReviewView;
    error?: { code: string; message: string };
  }> {
    return this.request<AdvertiserOrderReviewView>(`/api/orders/${orderId}/review`, {
      method: 'GET',
    });
  }

  public async getOrderPricingSnapshot(orderId: string): Promise<{
    data?: OrderPricingSnapshot;
    error?: { code: string; message: string };
  }> {
    return this.request<OrderPricingSnapshot>(`/api/orders/${orderId}/pricing-snapshot`, {
      method: 'GET',
    });
  }

  public async getOrderPaymentReadiness(orderId: string): Promise<{
    data?: OrderPaymentReadiness;
    error?: { code: string; message: string };
  }> {
    return this.request<OrderPaymentReadiness>(`/api/orders/${orderId}/payment-readiness`, {
      method: 'GET',
    });
  }

  public async initiatePaymentHandoff(orderId: string): Promise<{
    data?: OrderPaymentHandoffResult;
    error?: { code: string; message: string };
  }> {
    return this.request<OrderPaymentHandoffResult>(`/api/orders/${orderId}/initiate-payment-handoff`, {
      method: 'POST',
    });
  }

  // ==========================================
  // STEP 12B: PAYMENT INITIATION API
  // ==========================================

  public async initiatePayment(
    orderId: string,
    options?: {
      idempotencyKey?: string;
      providerPreference?: string;
      amountMinor?: number;
      currency?: string;
    }
  ): Promise<{
    data?: PaymentInitiationResult;
    error?: { code: string; message: string; details?: any };
  }> {
    const headers: Record<string, string> = {};
    if (options?.idempotencyKey) {
      headers['idempotency-key'] = options.idempotencyKey;
    }

    return this.request<PaymentInitiationResult>(`/api/orders/${orderId}/payments/initiate`, {
      method: 'POST',
      headers,
      body: JSON.stringify(options || {}),
    });
  }

  public async getOrderPayment(orderId: string): Promise<{
    data?: Payment | null;
    error?: { code: string; message: string };
  }> {
    return this.request<Payment | null>(`/api/orders/${orderId}/payment`, {
      method: 'GET',
    });
  }

  public async getOrderPaymentAttempts(orderId: string): Promise<{
    data?: PaymentAttempt[];
    error?: { code: string; message: string };
  }> {
    return this.request<PaymentAttempt[]>(`/api/orders/${orderId}/payment-attempts`, {
      method: 'GET',
    });
  }

  // ==========================================
  // STEP 12C: PAYMENT VERIFICATION API
  // ==========================================

  public async verifyPayment(
    orderId: string,
    options: {
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
  ): Promise<{
    data?: PaymentVerificationResult;
    error?: { code: string; message: string; details?: any };
  }> {
    return this.request<PaymentVerificationResult>(`/api/orders/${orderId}/payments/verify`, {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  // ==========================================
  // STEP 12D: PAYMENT RECONCILIATION API
  // ==========================================

  public async getOrderPaymentReconciliations(orderId: string): Promise<{
    data?: PaymentReconciliationRecord[];
    error?: { code: string; message: string; details?: any };
  }> {
    return this.request<PaymentReconciliationRecord[]>(`/api/orders/${orderId}/reconciliation`, {
      method: 'GET',
    });
  }

  // ==========================================
  // STEP 12E & 12F: ROLE VISIBILITY & FULFILLMENT
  // ==========================================

  public async getFulfillmentAuthorization(orderId: string): Promise<{
    data?: FulfillmentAuthorizationView;
    error?: { code: string; message: string };
  }> {
    return this.request<FulfillmentAuthorizationView>(`/api/orders/${orderId}/fulfillment-authorization`, {
      method: 'GET',
    });
  }

  public async getOrderVenueCompensation(orderId: string): Promise<{
    data?: VenueCompensationSettlementView;
    error?: { code: string; message: string };
  }> {
    return this.request<VenueCompensationSettlementView>(`/api/orders/${orderId}/venue-compensation`, {
      method: 'GET',
    });
  }

  public async getOrderSupplierPayable(orderId: string): Promise<{
    data?: SupplierPayableSettlementView;
    error?: { code: string; message: string };
  }> {
    return this.request<SupplierPayableSettlementView>(`/api/orders/${orderId}/supplier-payable`, {
      method: 'GET',
    });
  }

  public async getOrderLogisticsPayable(orderId: string): Promise<{
    data?: LogisticsPayableSettlementView;
    error?: { code: string; message: string };
  }> {
    return this.request<LogisticsPayableSettlementView>(`/api/orders/${orderId}/logistics-payable`, {
      method: 'GET',
    });
  }
}

export const api = new ApiService();
