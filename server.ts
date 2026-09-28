/**
 * AquaBloom Enterprise Application Server
 * 
 * Express + Vite Full-Stack Architecture
 * Binds strictly to 0.0.0.0:3000.
 * Houses server-side authentication, role authorization, event dispatching,
 * and reliability guards.
 */

import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { db } from './src/server/db.js';
import { validateRegistrationInput, validateLoginInput } from './src/lib/validation.js';
import {
  validateAdvertiserProfile,
  validateVenueProfile,
  validateSupplierProfile,
  validateLogisticsProfile,
} from './src/lib/profileValidation.js';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  formatErrorForClient,
} from './src/lib/errors.js';
import { eventDispatcher } from './src/lib/events.js';
import { idempotencyManager } from './src/lib/reliability.js';
import { User, ApprovalStatus, VenueProfile, SupplierProfile, ProductStatus, ProductAvailability, AdvertiserProfile, CampaignStatus, VenueMarketplaceQuery, MarketplaceVenue } from './src/types.js';
import {
  validateProductCreation,
  validateProductVersionCreation,
  validateSupplierEligibility,
  sanitizeProductForMarketplace,
} from './src/lib/productValidation.js';
import {
  validateAdvertiserEligibility,
  validateCampaign,
  validateCampaignStatusTransition,
} from './src/lib/campaignValidation.js';
import { ProposalService, NegotiationService } from './src/server/proposalServices.js';
import { AgreementService } from './src/server/agreementServices.js';
import { OrderReadinessService } from './src/server/orderReadinessServices.js';
import {
  SupplierMatchingEngine,
  SupplierOperationalOfferService,
  SupplierAssignmentService,
  SupplierAssignmentAuthorizationService,
} from './src/server/supplierAssignmentServices.js';
import {
  LogisticsMatchingEngine,
  LogisticsOperationalOfferService,
  LogisticsAssignmentService,
  LogisticsAssignmentAuthorizationService,
} from './src/server/logisticsAssignmentServices.js';
import {
  OrderService,
  OrderReviewService,
} from './src/server/orderServices.js';
import {
  PaymentReadinessService,
  OrderPricingSnapshotEngine,
} from './src/server/paymentReadinessServices.js';
import {
  PaymentInitiationService,
  PaymentVerificationService,
} from './src/server/paymentInitiationServices.js';
import {
  PaymentWebhookService,
} from './src/server/paymentWebhookServices.js';
import {
  FinancialLedgerEngine,
  FinancialLedgerAuthorizationService,
} from './src/server/financialLedgerServices.js';
import {
  FulfillmentAuthorizationService,
} from './src/server/fulfillmentAuthorizationServices.js';

// Extend Express Request to include authenticated user & session
declare global {
  namespace Express {
    interface Request {
      user?: User;
      token?: string;
    }
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Subscribe event dispatcher to persist events to the database
  eventDispatcher.subscribe('AUDIT_EVENTS', (event) => {
    db.recordEvent(event);
  });
  eventDispatcher.subscribe('BUSINESS_TIMELINE', (event) => {
    db.recordEvent(event);
  });

  // Authentication Context Middleware
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-aquabloom-session'];
    const token =
      (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null) ||
      (typeof customHeader === 'string' ? customHeader : null);

    if (token) {
      const session = db.getSession(token);
      if (session) {
        const user = db.findUserById(session.userId);
        if (user) {
          req.user = user;
          req.token = token;
        }
      }
    }
    next();
  });

  // --- API ROUTES ---

  // Health Check
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      system: 'AquaBloom Architecture Foundation',
      version: '1.0.0-step1',
      timestamp: new Date().toISOString(),
    });
  });

  // Registration Endpoint (Strictly rejects ADMIN role)
  app.post('/api/auth/register', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password, role, organizationName, contactName, phone } = req.body;
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      // 1. Central validation check
      const validation = validateRegistrationInput({
        email,
        password,
        role,
        organizationName,
        contactName,
        phone,
      });

      if (!validation.isValid) {
        throw new ValidationError('Validation failed for registration', validation.errors);
      }

      // 2. Check for conflict
      const existing = db.findUserByEmail(email);
      if (existing) {
        throw new ConflictError('An account with this email address already exists.');
      }

      // 3. Create user and session
      const user = db.createUser({
        email,
        password,
        role,
        organizationName,
        contactName,
        phone,
      });

      const session = db.createSession(user.id, user.role);
      const profile = db.getProfile(user.id);

      // 4. Dispatch audit event
      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'USER_REGISTERED',
        userId: user.id,
        role: user.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          organizationName: user.organizationName,
          role: user.role,
        },
      });

      const responsePayload = {
        success: true,
        data: {
          user,
          profile,
          session,
        },
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: user.id,
          path: '/api/auth/register',
          responseStatus: 201,
          responseBody: responsePayload,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responsePayload);
    } catch (err) {
      next(err);
    }
  });

  // Login Endpoint
  app.post('/api/auth/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { email, password } = req.body;

      const validation = validateLoginInput({ email, password });
      if (!validation.isValid) {
        throw new ValidationError('Please provide valid credentials.', validation.errors);
      }

      const user = db.findUserByEmail(email);
      if (!user) {
        throw new AuthenticationError('Invalid email or password credentials.');
      }

      const isMatch = db.verifyPassword(user.id, password || '');
      if (!isMatch) {
        await eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'USER_LOGIN_FAILED',
          userId: user.id,
          role: user.role,
          scope: 'INTERNAL_ADMIN',
          payload: { reason: 'Incorrect password' },
        });
        throw new AuthenticationError('Invalid email or password credentials.');
      }

      const session = db.createSession(user.id, user.role);
      const profile = db.getProfile(user.id);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'USER_LOGIN_SUCCESS',
        userId: user.id,
        role: user.role,
        scope: 'INTERNAL_ADMIN',
        payload: { sessionTokenId: session.id },
      });

      return res.json({
        success: true,
        data: {
          user,
          profile,
          session,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Current Session Endpoint
  app.get('/api/auth/session', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || !req.token) {
        throw new AuthenticationError('No active session.');
      }

      const session = db.getSession(req.token);
      if (!session) {
        throw new AuthenticationError('Session expired.');
      }

      const profile = db.getProfile(req.user.id);

      return res.json({
        success: true,
        data: {
          user: req.user,
          profile,
          session,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Logout Endpoint
  app.post('/api/auth/logout', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.token) {
        if (req.user) {
          await eventDispatcher.dispatch({
            category: 'AUDIT_EVENTS',
            eventType: 'USER_LOGOUT',
            userId: req.user.id,
            role: req.user.role,
            scope: 'INTERNAL_ADMIN',
          });
        }
        db.deleteSession(req.token);
      }

      return res.json({
        success: true,
        data: { message: 'Session successfully terminated.' },
      });
    } catch (err) {
      next(err);
    }
  });

  // --- PROFILE API ROUTES (Step 2: Accounts + Profiles + Permissions) ---

  // Get authenticated user's profile
  app.get('/api/profile/me', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to access profile.');
      }

      const profile = db.getProfile(req.user.id);
      return res.json({
        success: true,
        data: {
          user: req.user,
          profile,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Update authenticated user's profile
  app.put('/api/profile/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to update profile.');
      }

      const updates = req.body;

      // Validate based on user's authorized role
      if (req.user.role === 'ADVERTISER') {
        const v = validateAdvertiserProfile(updates);
        if (!v.isValid) {
          throw new ValidationError('Advertiser profile validation failed', v.errors);
        }
      } else if (req.user.role === 'VENUE') {
        const v = validateVenueProfile(updates);
        if (!v.isValid) {
          throw new ValidationError('Venue profile validation failed', v.errors);
        }
      } else if (req.user.role === 'SUPPLIER') {
        const v = validateSupplierProfile(updates);
        if (!v.isValid) {
          throw new ValidationError('Supplier profile validation failed', v.errors);
        }
      } else if (req.user.role === 'LOGISTICS_PARTNER') {
        const v = validateLogisticsProfile(updates);
        if (!v.isValid) {
          throw new ValidationError('Logistics profile validation failed', v.errors);
        }
      }

      // Save profile and compute version increment
      const updatedProfile = db.saveProfile(req.user.id, updates, req.user.id);
      const updatedUser = db.findUserById(req.user.id)!;

      // Dispatch audit event
      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PROFILE_UPDATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          version: updatedProfile.version,
          completionPercentage: updatedProfile.completion?.percentage,
          isComplete: updatedProfile.completion?.isComplete,
        },
      });

      return res.json({
        success: true,
        data: {
          user: updatedUser,
          profile: updatedProfile,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // Get specific profile by user ID (Protected by visibility and ownership rules)
  app.get('/api/profiles/:userId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const targetUser = db.findUserById(userId);
      if (!targetUser) {
        throw new NotFoundError('Requested account profile was not found.');
      }

      const profile = db.getProfile(userId);
      if (!profile) {
        throw new NotFoundError('Requested profile has not been initialized.');
      }

      // Direct Owner or Internal Admin gets full private profile
      const isOwner = req.user?.id === userId;
      const isAdmin = req.user?.role === 'ADMIN';

      if (isOwner || isAdmin) {
        return res.json({
          success: true,
          data: {
            user: targetUser,
            profile,
          },
        });
      }

      // Public / Role-shared visibility check for Venues
      if (profile.role === 'VENUE') {
        const venueProfile = profile as VenueProfile;
        if (
          venueProfile.visibilityState === 'PUBLIC_ELIGIBLE' ||
          venueProfile.visibilityState === 'PUBLIC'
        ) {
          // Return sanitized public summary (No private coordinator cell phone or internal notes)
          return res.json({
            success: true,
            data: {
              venueName: venueProfile.venueName,
              venueType: venueProfile.venueType,
              city: venueProfile.location?.city,
              stateRegion: venueProfile.location?.stateRegion,
              country: venueProfile.location?.country,
              description: venueProfile.description,
              audienceCategory: venueProfile.audienceCategory,
              footfallVisitors: venueProfile.footfall?.monthlyVisitors,
              availableBottleCapacity: venueProfile.capacity?.availableBottleCapacity,
              campaignAvailability: venueProfile.campaignAvailability,
              placementPossibilities: venueProfile.placementPossibilities,
              visibilityState: venueProfile.visibilityState,
            },
          });
        }
      }

      // If not owner, admin, or eligible public venue, deny access
      throw new AuthorizationError(
        'Access denied. You do not possess the required visibility scope for this profile.'
      );
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 3: SUPPLIER PRODUCT CATALOG API ROUTES
  // ==========================================

  // Create new product (Authoritative master record + Version 1)
  app.post('/api/products', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to author products.');
      }

      if (req.user.role !== 'SUPPLIER') {
        throw new AuthorizationError('Only accounts with the SUPPLIER role can create catalog products.');
      }

      // Check Idempotency Key
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached && cached.userId === req.user.id) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      // Server-side Supplier Eligibility Verification
      const supplierProfile = db.getProfile(req.user.id) as SupplierProfile | undefined;
      const eligibility = validateSupplierEligibility(req.user, supplierProfile);
      if (!eligibility.isValid) {
        throw new AuthorizationError(
          eligibility.errors.map((e) => e.message).join(' ')
        );
      }

      // Validate Product Master Input
      const validation = validateProductCreation(req.body, req.user, supplierProfile);
      if (!validation.isValid) {
        throw new ValidationError('Product master validation failed', validation.errors);
      }

      // Persist in authoritative store
      const { product, version } = db.createProduct(req.user.id, req.body, req.user.id);

      // Record Audit Event
      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PRODUCT_CREATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: product.id,
          publicProductId: product.publicProductId,
          versionId: version.id,
          status: product.status,
          availability: product.availability,
          customerFacingPrice: product.customerFacingPrice,
          minimumOrderQuantity: product.minimumOrderQuantity,
          productionLeadTime: product.productionLeadTime,
        },
      });

      const responsePayload = {
        success: true,
        data: {
          product,
          version,
        },
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: '/api/products',
          responseStatus: 201,
          responseBody: responsePayload,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responsePayload);
    } catch (err) {
      next(err);
    }
  });

  // Get authenticated supplier's products
  app.get('/api/products/supplier', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      if (req.user.role !== 'SUPPLIER') {
        throw new AuthorizationError('Only accounts with the SUPPLIER role can query their supplier catalog.');
      }

      const products = db.getProductsBySupplier(req.user.id);
      return res.json({
        success: true,
        data: products,
      });
    } catch (err) {
      next(err);
    }
  });

  // Public/Marketplace catalog search (Sanitized for customer/advertiser selection)
  app.get('/api/products', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { category, material, maxPrice, search } = req.query as {
        category?: string;
        material?: string;
        maxPrice?: string;
        search?: string;
      };

      const parsedMaxPrice = maxPrice ? parseFloat(maxPrice) : undefined;
      const products = db.getActiveMarketplaceProducts({
        category,
        material,
        maxPrice: isNaN(parsedMaxPrice as number) ? undefined : parsedMaxPrice,
        search,
      });

      return res.json({
        success: true,
        data: products,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get specific product by ID or Public Product ID
  app.get('/api/products/:productId', (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      // Check access: Owning supplier or Admin receives full product + version history
      const isOwner = req.user?.id === product.supplierId;
      const isAdmin = req.user?.role === 'ADMIN';

      if (isOwner || isAdmin) {
        const versions = db.getProductVersions(product.id);
        return res.json({
          success: true,
          data: {
            product,
            versions,
          },
        });
      }

      // Public / Marketplace customer access: Only if product is ACTIVE and owning supplier is APPROVED
      if (product.status === 'ACTIVE') {
        const supplierUser = db.findUserById(product.supplierId);
        const supplierProfile = db.getProfile(product.supplierId) as SupplierProfile | undefined;
        if (supplierUser?.status === 'ACTIVE' && supplierProfile?.approvalStatus === 'APPROVED') {
          return res.json({
            success: true,
            data: sanitizeProductForMarketplace(product),
          });
        }
      }

      throw new AuthorizationError('Access denied. Product is not publicly accessible.');
    } catch (err) {
      next(err);
    }
  });

  // Update non-material product metadata
  app.put('/api/products/:productId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { productId } = req.params;
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      if (product.supplierId !== req.user.id) {
        throw new AuthorizationError('Only the owning supplier can update this product.');
      }

      if (product.status === 'DISCONTINUED') {
        throw new ValidationError('Discontinued products are permanently archived and cannot be edited.');
      }

      const updated = db.updateProduct(product.id, req.body, req.user.id);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PRODUCT_UPDATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: updated.id,
          publicProductId: updated.publicProductId,
          updatedFields: Object.keys(req.body),
        },
      });

      return res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  });

  // Create new version for material changes (price, MOQ, lead time, specs)
  app.post('/api/products/:productId/versions', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { productId } = req.params;
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      if (product.supplierId !== req.user.id) {
        throw new AuthorizationError('Only the owning supplier can create product versions.');
      }

      if (product.status === 'DISCONTINUED') {
        throw new ValidationError('Cannot create new versions for discontinued products.');
      }

      // Check Idempotency Key
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached && cached.userId === req.user.id) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const validation = validateProductVersionCreation(req.body);
      if (!validation.isValid) {
        throw new ValidationError('Product version validation failed', validation.errors);
      }

      const oldPrice = product.customerFacingPrice.amount;
      const result = db.createProductVersion(product.id, req.body, req.user.id);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PRODUCT_VERSION_CREATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: result.product.id,
          publicProductId: result.product.publicProductId,
          versionNumber: result.version.versionNumber,
          versionId: result.version.id,
          effectiveFrom: result.version.effectiveFrom,
          customerFacingPrice: result.version.customerFacingPrice,
          minimumOrderQuantity: result.version.minimumOrderQuantity,
          changeReason: result.version.changeReason,
        },
      });

      if (oldPrice !== result.product.customerFacingPrice.amount) {
        await eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'PRODUCT_PRICE_UPDATED',
          userId: req.user.id,
          role: req.user.role,
          scope: 'ROLE_SHARED',
          payload: {
            productId: result.product.id,
            oldPrice,
            newPrice: result.product.customerFacingPrice.amount,
            currency: 'INR',
          },
        });
      }

      const responsePayload = {
        success: true,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: `/api/products/${productId}/versions`,
          responseStatus: 201,
          responseBody: responsePayload,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responsePayload);
    } catch (err) {
      next(err);
    }
  });

  // Transition product status (ACTIVE, INACTIVE, DISCONTINUED)
  app.post('/api/products/:productId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { productId } = req.params;
      const { status } = req.body as { status: ProductStatus };
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      if (product.supplierId !== req.user.id) {
        throw new AuthorizationError('Only the owning supplier can update product status.');
      }

      // If activating, verify supplier is currently APPROVED and ACTIVE
      if (status === 'ACTIVE') {
        const supplierProfile = db.getProfile(req.user.id) as SupplierProfile | undefined;
        const eligibility = validateSupplierEligibility(req.user, supplierProfile);
        if (!eligibility.isValid) {
          throw new AuthorizationError(`Cannot activate product: ${eligibility.errors.map((e) => e.message).join(' ')}`);
        }
      }

      const oldStatus = product.status;
      const updated = db.updateProductStatus(product.id, status, req.user.id);

      const eventTypeMap: Record<ProductStatus, string> = {
        ACTIVE: 'PRODUCT_ACTIVATED',
        INACTIVE: 'PRODUCT_DEACTIVATED',
        DISCONTINUED: 'PRODUCT_DISCONTINUED',
        DRAFT: 'PRODUCT_STATUS_UPDATED',
      };

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: eventTypeMap[status] || 'PRODUCT_STATUS_UPDATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: updated.id,
          publicProductId: updated.publicProductId,
          oldStatus,
          newStatus: status,
        },
      });

      return res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  });

  // Update product availability (AVAILABLE, LIMITED, UNAVAILABLE)
  app.post('/api/products/:productId/availability', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { productId } = req.params;
      const { availability } = req.body as { availability: ProductAvailability };
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      if (product.supplierId !== req.user.id) {
        throw new AuthorizationError('Only the owning supplier can update product availability.');
      }

      const validAvailabilities: ProductAvailability[] = ['AVAILABLE', 'LIMITED', 'UNAVAILABLE'];
      if (!validAvailabilities.includes(availability)) {
        throw new ValidationError(`Invalid availability '${availability}'. Must be one of: ${validAvailabilities.join(', ')}`);
      }

      const oldAvailability = product.availability;
      const updated = db.updateProductAvailability(product.id, availability, req.user.id);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PRODUCT_AVAILABILITY_UPDATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: updated.id,
          publicProductId: updated.publicProductId,
          oldAvailability,
          newAvailability: availability,
        },
      });

      return res.json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  });

  // Delete draft product (Controlled deletion for DRAFT ONLY)
  app.delete('/api/products/:productId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { productId } = req.params;
      const product = db.getProductById(productId);
      if (!product) {
        throw new NotFoundError(`Product '${productId}' not found.`);
      }

      if (product.supplierId !== req.user.id) {
        throw new AuthorizationError('Only the owning supplier can delete this product.');
      }

      if (product.status !== 'DRAFT') {
        throw new ValidationError(
          `Cannot delete product in '${product.status}' status. Controlled deletion is permitted exclusively for DRAFT products.`
        );
      }

      db.deleteDraftProduct(product.id, req.user.id);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'PRODUCT_DELETED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          productId: product.id,
          publicProductId: product.publicProductId,
          productName: product.name,
        },
      });

      return res.json({
        success: true,
        data: { message: 'Draft product successfully deleted.' },
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 4: ADVERTISER CAMPAIGN ENGINE ROUTES
  // ==========================================

  // Create Campaign (DRAFT or READY_FOR_MATCHING)
  app.post('/api/campaigns', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to author campaigns.');
      }

      // Check idempotency key if provided
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached && cached.userId === req.user.id) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const result = db.createCampaign(req.user.id, req.body, req.user.id);

      // Dispatch audit event
      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'CAMPAIGN_CREATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: result.campaign.id,
          publicCampaignId: result.campaign.publicCampaignId,
          name: result.campaign.name,
          category: result.campaign.category,
          status: result.campaign.status,
          quantity: result.campaign.bottleRequirements.requiredQuantity,
          advertiserId: result.campaign.advertiserId,
          versionNumber: result.version.versionNumber,
        },
      });

      const responsePayload = {
        success: true,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: '/api/campaigns',
          responseStatus: 201,
          responseBody: responsePayload,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responsePayload);
    } catch (err) {
      next(err);
    }
  });

  // List campaigns (Owner-isolated: Advertisers see own; Admins see all)
  app.get('/api/campaigns', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      if (req.user.role === 'ADMIN') {
        const advertiserFilter = req.query.advertiserId as string | undefined;
        const campaigns = advertiserFilter
          ? db.getCampaignsByAdvertiser(advertiserFilter)
          : db.getAllCampaigns();
        return res.json({ success: true, data: campaigns });
      }

      if (req.user.role === 'ADVERTISER') {
        const campaigns = db.getCampaignsByAdvertiser(req.user.id);
        return res.json({ success: true, data: campaigns });
      }

      throw new AuthorizationError(
        'Role is not authorized to query private campaign listings. Campaign opportunities must be browsed through the public opportunity view.'
      );
    } catch (err) {
      next(err);
    }
  });

  // Get single campaign (Ownership protected)
  app.get('/api/campaigns/:campaignId', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const campaign = db.getCampaignById(req.params.campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${req.params.campaignId}' not found.`);
      }

      if (req.user.role !== 'ADMIN' && campaign.advertiserId !== req.user.id) {
        throw new AuthorizationError(
          'You do not own this campaign and are not authorized to view its internal operational parameters.'
        );
      }

      return res.json({ success: true, data: campaign });
    } catch (err) {
      next(err);
    }
  });

  // Update campaign (increments version, preserves audit history)
  app.put('/api/campaigns/:campaignId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const isAdmin = req.user.role === 'ADMIN';
      const result = db.updateCampaign(req.params.campaignId, req.body, req.user.id, isAdmin);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'CAMPAIGN_UPDATED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: result.campaign.id,
          publicCampaignId: result.campaign.publicCampaignId,
          versionNumber: result.version.versionNumber,
          changedFields: result.version.changedFields,
          changeReason: result.version.changeReason,
        },
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // Validate campaign (runs backend validator on current state)
  app.post('/api/campaigns/:campaignId/validate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const campaign = db.getCampaignById(req.params.campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${req.params.campaignId}' not found.`);
      }

      if (req.user.role !== 'ADMIN' && campaign.advertiserId !== req.user.id) {
        throw new AuthorizationError('You do not own this campaign.');
      }

      const validation = validateCampaign(campaign, true);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: validation.isValid ? 'CAMPAIGN_VALIDATED' : 'CAMPAIGN_VALIDATION_FAILED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: campaign.id,
          publicCampaignId: campaign.publicCampaignId,
          isValid: validation.isValid,
          errorCount: validation.errors.length,
          missingFields: validation.missingRequiredFields,
        },
      });

      return res.json({
        success: true,
        data: validation,
      });
    } catch (err) {
      next(err);
    }
  });

  // Prepare Campaign for Matching (Transitions DRAFT -> READY_FOR_MATCHING if valid)
  app.post('/api/campaigns/:campaignId/prepare-for-matching', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const isAdmin = req.user.role === 'ADMIN';
      const result = db.prepareCampaignForMatching(req.params.campaignId, req.user.id, isAdmin);

      if (!result.validationResult.isValid) {
        await eventDispatcher.dispatch({
          category: 'AUDIT_EVENTS',
          eventType: 'CAMPAIGN_VALIDATION_FAILED',
          userId: req.user.id,
          role: req.user.role,
          scope: 'ROLE_SHARED',
          payload: {
            campaignId: result.campaign.id,
            publicCampaignId: result.campaign.publicCampaignId,
            errors: result.validationResult.errors,
          },
        });

        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: result.validationResult.errors[0]?.message || 'Campaign validation failed.',
            details: result.validationResult.errors,
          },
          data: result,
        });
      }

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'CAMPAIGN_READY_FOR_MATCHING',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: result.campaign.id,
          publicCampaignId: result.campaign.publicCampaignId,
          name: result.campaign.name,
          quantity: result.campaign.bottleRequirements.requiredQuantity,
        },
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // Revert Campaign to Draft (Transitions READY_FOR_MATCHING -> DRAFT)
  app.post('/api/campaigns/:campaignId/revert-to-draft', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const isAdmin = req.user.role === 'ADMIN';
      const campaign = db.revertCampaignToDraft(req.params.campaignId, req.user.id, isAdmin);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'CAMPAIGN_REVERTED_TO_DRAFT',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: campaign.id,
          publicCampaignId: campaign.publicCampaignId,
        },
      });

      return res.json({
        success: true,
        data: campaign,
      });
    } catch (err) {
      next(err);
    }
  });

  // Version History of Campaign
  app.get('/api/campaigns/:campaignId/versions', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const campaign = db.getCampaignById(req.params.campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${req.params.campaignId}' not found.`);
      }

      if (req.user.role !== 'ADMIN' && campaign.advertiserId !== req.user.id) {
        throw new AuthorizationError('You do not own this campaign.');
      }

      const versions = db.getCampaignVersions(campaign.id);
      return res.json({
        success: true,
        data: versions,
      });
    } catch (err) {
      next(err);
    }
  });

  // Public Campaign Opportunity Projection (Safe for future venue discovery)
  app.get('/api/campaigns/:campaignId/opportunity', (req: Request, res: Response, next: NextFunction) => {
    try {
      const campaign = db.getCampaignById(req.params.campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${req.params.campaignId}' not found.`);
      }

      // If campaign is in DRAFT, it is not yet visible to the general public/venues.
      // Only owner or admin may preview its opportunity projection while in draft.
      if (campaign.status === 'DRAFT') {
        if (!req.user || (req.user.id !== campaign.advertiserId && req.user.role !== 'ADMIN')) {
          throw new AuthorizationError(
            'This campaign is currently in DRAFT status and is not published for opportunity discovery.'
          );
        }
      }

      const opportunity = db.getCampaignOpportunity(campaign.id);
      return res.json({
        success: true,
        data: opportunity,
      });
    } catch (err) {
      next(err);
    }
  });

  // Delete Draft Campaign (Controlled deletion for DRAFT only)
  app.delete('/api/campaigns/:campaignId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const campaign = db.getCampaignById(req.params.campaignId);
      if (!campaign) {
        throw new NotFoundError(`Campaign '${req.params.campaignId}' not found.`);
      }

      const isAdmin = req.user.role === 'ADMIN';
      db.deleteDraftCampaign(campaign.id, req.user.id, isAdmin);

      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: 'CAMPAIGN_DELETED',
        userId: req.user.id,
        role: req.user.role,
        scope: 'ROLE_SHARED',
        payload: {
          campaignId: campaign.id,
          publicCampaignId: campaign.publicCampaignId,
          name: campaign.name,
        },
      });

      return res.json({
        success: true,
        data: { message: 'Draft campaign successfully deleted.' },
      });
    } catch (err) {
      next(err);
    }
  });

  // Notifications: Get user notifications
  app.get('/api/notifications', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const notifications = db.getUserNotifications(req.user.id);
      return res.json({
        success: true,
        data: notifications,
      });
    } catch (err) {
      next(err);
    }
  });

  // Notifications: Mark notification as read
  app.post('/api/notifications/:notificationId/read', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const success = db.markNotificationRead(req.params.notificationId, req.user.id);
      return res.json({
        success: true,
        data: { success },
      });
    } catch (err) {
      next(err);
    }
  });

  // --- ADMIN APPLICATION REVIEW WORKFLOWS (Internal Only) ---

  // Get all supplier and logistics partner applications
  app.get('/api/admin/pending-applications', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Internal administrative privilege required.');
      }

      const applications = db.getPendingApplications();
      return res.json({
        success: true,
        data: applications,
      });
    } catch (err) {
      next(err);
    }
  });

  // Admin decision on an application (Approve, Reject, or Request Info)
  app.post('/api/admin/review-application', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user || req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Internal administrative privilege required.');
      }

      const { targetUserId, decision, notes } = req.body as {
        targetUserId: string;
        decision: ApprovalStatus;
        notes?: string;
      };

      if (!targetUserId || typeof targetUserId !== 'string') {
        throw new ValidationError('Target user ID is required.');
      }

      const validDecisions: ApprovalStatus[] = ['APPROVED', 'REJECTED', 'MORE_INFORMATION', 'PENDING_REVIEW'];
      if (!validDecisions.includes(decision)) {
        throw new ValidationError(`Invalid decision: ${decision}. Must be one of: ${validDecisions.join(', ')}`);
      }

      const result = db.updateApprovalStatus(targetUserId, decision, req.user.id, notes);

      // Record audit event
      const eventName = `${result.profile.role}_${decision}`;
      await eventDispatcher.dispatch({
        category: 'AUDIT_EVENTS',
        eventType: eventName,
        userId: targetUserId,
        role: result.user.role,
        scope: 'INTERNAL_ADMIN',
        payload: {
          decision,
          reviewerAdminId: req.user.id,
          notes: notes || null,
          accountStatus: result.user.status,
        },
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 5: VENUE MARKETPLACE & MATCHING ENGINE
  // ==========================================

  // Advertiser Venue Marketplace (with deterministic matching score & capacity evaluation)
  app.get('/api/marketplace/venues', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to access the Venue Marketplace.');
      }

      if (req.user.role !== 'ADVERTISER' && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only authenticated Advertisers and Admins may access the Venue Marketplace.');
      }

      const query: VenueMarketplaceQuery = {
        campaignId: req.query.campaignId as string | undefined,
        city: req.query.city as string | undefined,
        venueType: req.query.venueType as string | undefined,
        audienceCategory: req.query.audienceCategory as string | undefined,
        capacityStatus: req.query.capacityStatus as any,
        minScore: req.query.minScore ? Number(req.query.minScore) : undefined,
        minFootfall: req.query.minFootfall ? Number(req.query.minFootfall) : undefined,
        search: req.query.search as string | undefined,
        sortBy: req.query.sortBy as any,
        sortOrder: req.query.sortOrder as any,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 10,
      };

      const result = db.getMarketplaceVenues(query, req.user);
      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // Venue Marketplace Detail (by Internal ID or Public Account ID)
  app.get('/api/marketplace/venues/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view venue marketplace details.');
      }

      if (req.user.role !== 'ADVERTISER' && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only authenticated Advertisers and Admins may access venue marketplace profiles.');
      }

      const campaignId = req.query.campaignId as string | undefined;
      const venue = db.getMarketplaceVenueDetail(req.params.id, campaignId, req.user);

      return res.json({
        success: true,
        data: venue,
      });
    } catch (err) {
      next(err);
    }
  });

  // Venue Portal: Inbound Campaign Opportunities
  app.get('/api/venue/opportunities', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view campaign opportunities.');
      }

      if (req.user.role !== 'VENUE' && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only Venue accounts may access incoming campaign opportunities.');
      }

      const query = {
        category: req.query.category as string | undefined,
        search: req.query.search as string | undefined,
        minQuantity: req.query.minQuantity ? Number(req.query.minQuantity) : undefined,
        maxQuantity: req.query.maxQuantity ? Number(req.query.maxQuantity) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        pageSize: req.query.pageSize ? Number(req.query.pageSize) : 10,
      };

      const targetVenueUserId = req.user.role === 'ADMIN' && req.query.venueId
        ? (req.query.venueId as string)
        : req.user.id;

      const result = db.getVenueCampaignOpportunities(targetVenueUserId, query);
      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // Venue Portal: Capacity & Bottle Commitments Overview
  app.get('/api/venue/capacity', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view venue capacity.');
      }

      if (req.user.role !== 'VENUE' && req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only Venue accounts may access capacity overviews.');
      }

      const targetVenueUserId = req.user.role === 'ADMIN' && req.query.venueId
        ? (req.query.venueId as string)
        : req.user.id;

      const capacityOverview = db.getVenueCapacityOverview(targetVenueUserId);
      return res.json({
        success: true,
        data: capacityOverview,
      });
    } catch (err) {
      next(err);
    }
  });

  // Public Venue Discovery (Unauthenticated / Public Directory)
  app.get('/api/public/venues', (_req: Request, res: Response, next: NextFunction) => {
    try {
      const publicVenues = db.getPublicVenues();
      return res.json({
        success: true,
        data: publicVenues,
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 6: PROPOSAL & NEGOTIATION API ROUTES
  // ==========================================

  // Create & Initiate Proposal (Advertiser only)
  app.post('/api/proposals', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to create a proposal.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { campaignId, venueId, initialTerms, expiresAt } = req.body;
      const result = ProposalService.createProposal(req.user, {
        campaignId,
        venueId,
        initialTerms,
        expiresAt,
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: `Proposal ${result.proposal.publicProposalId} successfully submitted to venue.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 201,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // List Proposals for Current User (Advertiser, Venue, or Admin)
  app.get('/api/proposals', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to list proposals.');
      }

      const { campaignId, venueId, status, page, pageSize } = req.query;
      const proposals = ProposalService.listProposals(req.user, {
        campaignId: typeof campaignId === 'string' ? campaignId : undefined,
        venueId: typeof venueId === 'string' ? venueId : undefined,
        status: typeof status === 'string' ? status : undefined,
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 50,
      });

      return res.json({
        success: true,
        data: proposals,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Proposal Detail (including versions, timeline, live capacity evaluation, and permissions)
  app.get('/api/proposals/:proposalId', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to access proposal.');
      }

      const { proposalId } = req.params;
      const detail = ProposalService.getProposalDetail(proposalId, req.user);

      return res.json({
        success: true,
        data: detail,
      });
    } catch (err) {
      next(err);
    }
  });

  // Mark Proposal as Viewed (Venue recipient)
  app.post('/api/proposals/:proposalId/view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const { proposalId } = req.params;
      const proposal = ProposalService.markViewed(proposalId, req.user);

      return res.json({
        success: true,
        data: proposal,
      });
    } catch (err) {
      next(err);
    }
  });

  // Counter-Propose (creates new immutable version, resets mutual confirmation)
  app.post('/api/proposals/:proposalId/counter', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to negotiate proposal.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { proposalId } = req.params;
      const { expectedVersion, changeSummary, terms } = req.body;

      const result = NegotiationService.counter(proposalId, req.user, {
        expectedVersion: parseInt(expectedVersion, 10),
        changeSummary,
        terms: terms || {},
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: `Version ${result.proposal.currentVersionNumber} counter-proposal submitted.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // Accept Proposal (records confirmation, evaluates capacity overage, transitions to READY_FOR_AGREEMENT if both confirm)
  app.post('/api/proposals/:proposalId/accept', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to accept proposal.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { proposalId } = req.params;
      const { expectedVersion, capacityOverageDecision, notes } = req.body;

      const result = NegotiationService.accept(proposalId, req.user, {
        expectedVersion: parseInt(expectedVersion, 10),
        capacityOverageDecision,
        notes,
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: result.isMutuallyConfirmed
          ? 'Proposal mutually confirmed! Now READY FOR CAMPAIGN AGREEMENT.'
          : 'Proposal confirmation recorded. Waiting for counterparty confirmation.',
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // Decline Proposal (structured decline reason required)
  app.post('/api/proposals/:proposalId/decline', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to decline proposal.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { proposalId } = req.params;
      const { expectedVersion, reasonCode, explanation } = req.body;

      const proposal = NegotiationService.decline(proposalId, req.user, {
        expectedVersion: expectedVersion ? parseInt(expectedVersion, 10) : undefined,
        reasonCode,
        explanation,
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: 'Proposal has been declined.',
        data: proposal,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // Withdraw Proposal (Advertiser only)
  app.post('/api/proposals/:proposalId/withdraw', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to withdraw proposal.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { proposalId } = req.params;
      const { expectedVersion, explanation } = req.body;

      const proposal = NegotiationService.withdraw(proposalId, req.user, {
        expectedVersion: expectedVersion ? parseInt(expectedVersion, 10) : undefined,
        explanation,
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: 'Proposal has been withdrawn.',
        data: proposal,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 7: CAMPAIGN AGREEMENT & COMMERCIAL LOCK API ROUTES
  // ==========================================

  // Create Campaign Agreement (from READY_FOR_AGREEMENT proposal)
  app.post('/api/campaign-agreements', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to create a campaign agreement.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { sourceProposalId } = req.body;
      const agreement = AgreementService.createAgreement(
        { sourceProposalId, idempotencyKey },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Campaign Agreement ${agreement.publicId} generated successfully.`,
        data: agreement,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 201,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // List Campaign Agreements (Filtered by role: advertiser or venue)
  app.get('/api/campaign-agreements', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to list campaign agreements.');
      }

      const { campaignId, venueId, status, page, pageSize } = req.query;
      const result = AgreementService.listAgreements(
        {
          campaignId: typeof campaignId === 'string' ? campaignId : undefined,
          venueId: typeof venueId === 'string' ? venueId : undefined,
          status: typeof status === 'string' ? status : undefined,
          page: page ? parseInt(page as string, 10) : 1,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : 50,
        },
        req.user
      );

      return res.json({
        success: true,
        data: result.items,
        total: result.total,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Campaign Agreement Shared View (Role-aware sanitized representation)
  app.get('/api/campaign-agreements/:id/shared-view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const sharedView = AgreementService.getSharedView(req.params.id, req.user);
      return res.json({
        success: true,
        data: sharedView,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Campaign Agreement Preview (Human-readable document view)
  app.get('/api/campaign-agreements/:id/preview', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const preview = AgreementService.getPreview(req.params.id, req.user);
      return res.json({
        success: true,
        data: preview,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Campaign Agreement Version History
  app.get('/api/campaign-agreements/:id/versions', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const versions = AgreementService.getAgreementVersions(req.params.id, req.user);
      return res.json({
        success: true,
        data: versions,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Specific Campaign Agreement Historical Version
  app.get('/api/campaign-agreements/:id/versions/:versionIdentifier', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const version = AgreementService.getAgreementVersion(req.params.id, req.params.versionIdentifier, req.user);
      return res.json({
        success: true,
        data: version,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Campaign Agreement Locked Snapshot
  app.get('/api/campaign-agreements/:id/snapshot', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const snapshot = AgreementService.getAgreementSnapshot(req.params.id, req.user);
      return res.json({
        success: true,
        data: snapshot,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Single Campaign Agreement Detail
  app.get('/api/campaign-agreements/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const agreement = AgreementService.getAgreement(req.params.id, req.user);
      return res.json({
        success: true,
        data: agreement,
      });
    } catch (err) {
      next(err);
    }
  });

  // Confirm Campaign Agreement
  app.post('/api/campaign-agreements/:id/confirm', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to confirm agreement.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { expectedVersion, acknowledgement, notes } = req.body;
      const result = AgreementService.confirmAgreement(req.params.id, req.user, {
        expectedVersion: parseInt(expectedVersion, 10),
        acknowledgement: Boolean(acknowledgement),
        notes,
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: result.isReadyToLock
          ? `Both parties have confirmed Campaign Agreement ${result.agreement.publicId}. It is now READY TO LOCK.`
          : `Confirmation recorded for Campaign Agreement ${result.agreement.publicId}. Awaiting counterparty confirmation.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // Lock Campaign Agreement (Atomic commercial lock)
  app.post('/api/campaign-agreements/:id/lock', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to lock agreement.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { expectedVersion, lockVersion } = req.body;
      const result = AgreementService.lockAgreement(req.params.id, req.user, {
        expectedVersion: parseInt(expectedVersion, 10),
        lockVersion: parseInt(lockVersion, 10),
        idempotencyKey,
      });

      const responseBody = {
        success: true,
        message: `Campaign Agreement ${result.agreement.publicId} is now officially LOCKED. Commercial terms are sealed.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // --- STEP 8: ORDER READINESS & DATA HANDOFF API ENDPOINTS ---

  // Assess / Validate Order Readiness for a Locked Campaign Agreement
  app.post('/api/campaign-agreements/:id/order-readiness', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to access order readiness.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const result = OrderReadinessService.assessOrderReadiness(
        req.params.id,
        req.user,
        idempotencyKey
      );

      const responseBody = {
        success: true,
        message: result.validationSummary.isValid
          ? `Campaign Agreement has successfully achieved Order Readiness (${result.orderReadiness.publicId}).`
          : `Campaign Agreement Order Readiness is currently blocked due to outstanding validation issues.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // Get Order Readiness record by Agreement ID
  app.get('/api/campaign-agreements/:id/order-readiness', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view order readiness.');
      }

      const readiness = OrderReadinessService.getOrderReadinessByAgreement(req.params.id, req.user);
      return res.json({
        success: true,
        data: readiness,
      });
    } catch (err) {
      next(err);
    }
  });

  // Get Safe Counterparty Shared View for Order Readiness
  app.get('/api/order-readiness/:id/shared-view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view order readiness.');
      }

      const sharedView = OrderReadinessService.getSharedView(req.params.id, req.user);
      return res.json({
        success: true,
        data: sharedView,
      });
    } catch (err) {
      next(err);
    }
  });

  // --- STEP 9: SUPPLIER ASSIGNMENT & OPERATIONAL OFFER API ENDPOINTS ---

  // 1. Get Candidate Supplier Matches for an Order Readiness record
  app.get('/api/order-readiness/:id/supplier-candidates', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier candidate matches.');
      }

      const readiness = db.getOrderReadinessById(req.params.id);
      if (!readiness) {
        throw new NotFoundError(`Order Readiness record '${req.params.id}' not found.`);
      }

      SupplierAssignmentAuthorizationService.assertCanViewCandidates(readiness, req.user);

      const candidates = SupplierMatchingEngine.findEligibleSuppliers(readiness.id);
      return res.json({
        success: true,
        data: candidates,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Create / Dispatch a Supplier Operational Offer (Admin operation)
  app.post('/api/supplier-offers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to create supplier offers.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { orderReadinessId, supplierId, productId, expiresInHours } = req.body;
      if (!orderReadinessId || !supplierId || !productId) {
        throw new ValidationError('orderReadinessId, supplierId, and productId are required.');
      }

      const offer = SupplierOperationalOfferService.createOffer(
        { orderReadinessId, supplierId, productId, expiresInHours },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Supplier Operational Offer ${offer.publicId} successfully dispatched.`,
        data: offer,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 201,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 3. Get Supplier Operational Offers (Filtered by OrderReadiness or Current Supplier)
  app.get('/api/supplier-offers', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier offers.');
      }

      const { orderReadinessId } = req.query;

      let offers: any[] = [];
      if (req.user.role === 'SUPPLIER') {
        offers = db.getSupplierOffersBySupplier(req.user.id);
      } else if (orderReadinessId && typeof orderReadinessId === 'string') {
        const readiness = db.getOrderReadinessById(orderReadinessId);
        if (readiness) {
          SupplierAssignmentAuthorizationService.assertCanViewCandidates(readiness, req.user);
          offers = db.getSupplierOffersByOrderReadiness(readiness.id);
        }
      } else if (req.user.role === 'ADMIN') {
        offers = (db as any).schema.supplierOffers || [];
      } else {
        throw new AuthorizationError('Specify orderReadinessId to view offers.');
      }

      return res.json({
        success: true,
        data: offers,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Get a specific Supplier Operational Offer by ID
  app.get('/api/supplier-offers/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier offer.');
      }

      const offer = db.getSupplierOfferById(req.params.id);
      if (!offer) {
        throw new NotFoundError(`Supplier Operational Offer '${req.params.id}' not found.`);
      }

      SupplierAssignmentAuthorizationService.assertCanViewOffer(offer, req.user);

      return res.json({
        success: true,
        data: offer,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. Supplier Accepts an Operational Offer
  app.post('/api/supplier-offers/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to accept supplier offer.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const result = SupplierOperationalOfferService.acceptOffer(
        req.params.id,
        { idempotencyKey },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Supplier offer accepted. Supplier Assignment ${result.assignment.publicId} created.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 6. Supplier Declines an Operational Offer
  app.post('/api/supplier-offers/:id/decline', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to decline supplier offer.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { reasonCode, explanation } = req.body;
      if (!reasonCode) {
        throw new ValidationError('A valid reasonCode is required to decline an operational offer.');
      }

      const offer = SupplierOperationalOfferService.declineOffer(
        req.params.id,
        { reasonCode, explanation, idempotencyKey },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Supplier offer ${offer.publicId} declined.`,
        data: offer,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 7. Get Supplier Assignment by Order Readiness
  app.get('/api/order-readiness/:id/supplier-assignment', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier assignment.');
      }

      const assignment = SupplierAssignmentService.getAssignmentByOrderReadiness(req.params.id, req.user);
      return res.json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // 7b. Get Supplier Assignments (Filtered by current Supplier or Admin)
  app.get('/api/supplier-assignments', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier assignments.');
      }

      let assignments: any[] = [];
      if (req.user.role === 'SUPPLIER') {
        assignments = db.getSupplierAssignmentsBySupplier(req.user.id);
      } else if (req.user.role === 'ADMIN') {
        assignments = db.getAllSupplierAssignments();
      } else {
        throw new AuthorizationError('Access denied: You are not authorized to list supplier assignments.');
      }

      return res.json({
        success: true,
        data: assignments,
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. Get Supplier Assignment by ID
  app.get('/api/supplier-assignments/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier assignment.');
      }

      const assignment = SupplierAssignmentService.getAssignment(req.params.id, req.user);
      return res.json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. Get Supplier Assignment Shared View
  app.get('/api/supplier-assignments/:id/shared-view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier assignment.');
      }

      const sharedView = SupplierAssignmentService.getSharedView(req.params.id, req.user);
      return res.json({
        success: true,
        data: sharedView,
      });
    } catch (err) {
      next(err);
    }
  });

  // 10. Reassign Supplier (Admin Recovery Flow)
  app.post('/api/supplier-assignments/:id/reassign', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to reassign supplier.');
      }

      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        throw new ValidationError('A cancellation / reassignment reason is required.');
      }

      const result = SupplierAssignmentService.reassignSupplier(req.params.id, reason, req.user);
      return res.json({
        success: true,
        message: result.message,
        data: result.previousAssignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 10: LOGISTICS ASSIGNMENT & OFFER ROUTES
  // ==========================================

  // 1. Query Eligible Logistics Partner Candidates for an OrderReadiness record
  app.get('/api/order-readiness/:id/logistics-candidates', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics candidates.');
      }

      const readiness = db.getOrderReadinessById(req.params.id);
      if (!readiness) {
        throw new NotFoundError(`Order Readiness record '${req.params.id}' not found.`);
      }

      LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, req.user);

      const candidates = LogisticsMatchingEngine.findEligibleLogisticsPartners(readiness.id);
      return res.json({
        success: true,
        data: candidates,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Create / Dispatch a Logistics Operational Offer (Admin operation)
  app.post('/api/logistics-offers', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to create logistics offers.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { orderReadinessId, logisticsPartnerId, expiresInHours } = req.body;
      if (!orderReadinessId || !logisticsPartnerId) {
        throw new ValidationError('orderReadinessId and logisticsPartnerId are required.');
      }

      const offer = LogisticsOperationalOfferService.createOffer(
        { orderReadinessId, logisticsPartnerId, expiresInHours },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Logistics Operational Offer ${offer.publicId} successfully dispatched.`,
        data: offer,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 201,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.status(201).json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 3. Get Logistics Operational Offers (Filtered by OrderReadiness or Current Logistics Partner)
  app.get('/api/logistics-offers', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics offers.');
      }

      const { orderReadinessId } = req.query;

      let offers: any[] = [];
      if (req.user.role === 'LOGISTICS_PARTNER') {
        offers = db.getLogisticsOffersByLogisticsPartner(req.user.id);
      } else if (orderReadinessId && typeof orderReadinessId === 'string') {
        const readiness = db.getOrderReadinessById(orderReadinessId);
        if (readiness) {
          LogisticsAssignmentAuthorizationService.assertCanViewCandidates(readiness, req.user);
          offers = db.getLogisticsOffersByOrderReadiness(readiness.id);
        }
      } else if (req.user.role === 'ADMIN') {
        offers = (db as any).schema.logisticsOffers || [];
      } else {
        throw new AuthorizationError('Specify orderReadinessId to view offers.');
      }

      return res.json({
        success: true,
        data: offers,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Get a specific Logistics Operational Offer by ID
  app.get('/api/logistics-offers/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics offer.');
      }

      const offer = db.getLogisticsOfferById(req.params.id);
      if (!offer) {
        throw new NotFoundError(`Logistics Operational Offer '${req.params.id}' not found.`);
      }

      LogisticsAssignmentAuthorizationService.assertCanViewOffer(offer, req.user);

      return res.json({
        success: true,
        data: offer,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. Logistics Partner Accepts an Operational Offer
  app.post('/api/logistics-offers/:id/accept', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to accept logistics offer.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const result = LogisticsOperationalOfferService.acceptOffer(
        req.params.id,
        { idempotencyKey },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Logistics offer accepted. Logistics Assignment ${result.assignment.publicId} created.`,
        data: result,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 6. Logistics Partner Declines an Operational Offer
  app.post('/api/logistics-offers/:id/decline', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to decline logistics offer.');
      }

      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;
      if (idempotencyKey) {
        const cached = idempotencyManager.getRecord(idempotencyKey);
        if (cached) {
          return res.status(cached.responseStatus).json(cached.responseBody);
        }
      }

      const { reasonCode, explanation } = req.body;
      if (!reasonCode) {
        throw new ValidationError('A valid reasonCode is required to decline an operational offer.');
      }

      const offer = LogisticsOperationalOfferService.declineOffer(
        req.params.id,
        { reasonCode, explanation, idempotencyKey },
        req.user
      );

      const responseBody = {
        success: true,
        message: `Logistics offer ${offer.publicId} declined.`,
        data: offer,
      };

      if (idempotencyKey) {
        idempotencyManager.saveRecord({
          key: idempotencyKey,
          userId: req.user.id,
          path: req.path,
          responseStatus: 200,
          responseBody,
          createdAt: new Date().toISOString(),
        });
      }

      return res.json(responseBody);
    } catch (err) {
      next(err);
    }
  });

  // 7. Get Logistics Assignment for an OrderReadiness record
  app.get('/api/order-readiness/:id/logistics-assignment', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics assignment.');
      }

      const assignment = LogisticsAssignmentService.getAssignmentByOrderReadiness(req.params.id, req.user);
      return res.json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. Get Logistics Assignment by ID
  app.get('/api/logistics-assignments/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics assignment.');
      }

      const assignment = LogisticsAssignmentService.getAssignmentById(req.params.id, req.user);
      return res.json({
        success: true,
        data: assignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. Get Logistics Assignment Shared View
  app.get('/api/logistics-assignments/:id/shared-view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics assignment.');
      }

      const assignment = LogisticsAssignmentService.getAssignmentById(req.params.id, req.user);
      const sharedView = LogisticsAssignmentService.getSharedView(assignment, req.user);
      return res.json({
        success: true,
        data: sharedView,
      });
    } catch (err) {
      next(err);
    }
  });

  // 10. Reassign Logistics (Admin Recovery Flow)
  app.post('/api/logistics-assignments/:id/reassign', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to reassign logistics.');
      }

      const { reason } = req.body;
      if (!reason || !reason.trim()) {
        throw new ValidationError('A cancellation / reassignment reason is required.');
      }

      const result = LogisticsAssignmentService.reassignLogistics(req.params.id, { reason }, req.user);
      return res.json({
        success: true,
        message: result.message,
        data: result.cancelledAssignment,
      });
    } catch (err) {
      next(err);
    }
  });

  // ==========================================
  // STEP 11B & 11D: ORDER & ORDER REVIEW ENDPOINTS
  // ==========================================

  // 1. List Orders for Authenticated User (Advertiser: own orders; Admin: all)
  app.get('/api/orders', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view orders.');
      }

      const orders = OrderService.getOrdersForUser(req.user);
      return res.json({
        success: true,
        data: orders,
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Create Order from OrderReadiness
  app.post('/api/orders', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to create order.');
      }

      const order = await OrderService.createOrder(req.body, req.user);
      return res.status(201).json({
        success: true,
        data: order,
      });
    } catch (err) {
      next(err);
    }
  });

  // 3. Get Order Details
  app.get('/api/orders/:id', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view order.');
      }

      const order = OrderService.getOrder(req.params.id, req.user);
      return res.json({
        success: true,
        data: order,
      });
    } catch (err) {
      next(err);
    }
  });

  // 4. Get Order Shared View
  app.get('/api/orders/:id/shared-view', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view order.');
      }

      const sharedView = OrderService.getSharedView(req.params.id, req.user);
      return res.json({
        success: true,
        data: sharedView,
      });
    } catch (err) {
      next(err);
    }
  });

  // 5. STEP 11D: Get Advertiser Order Review View
  app.get('/api/orders/:id/review', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to review order.');
      }

      const review = OrderReviewService.getAdvertiserOrderReview(req.params.id, req.user);
      return res.json({
        success: true,
        data: review,
      });
    } catch (err) {
      next(err);
    }
  });

  // 6. Get Immutable Order Pricing Snapshot
  app.get('/api/orders/:id/pricing-snapshot', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view pricing snapshot.');
      }

      const snapshot = OrderPricingSnapshotEngine.getSnapshot(req.params.id, req.user);
      return res.json({
        success: true,
        data: snapshot,
      });
    } catch (err) {
      next(err);
    }
  });

  // 7. Get Order Payment Readiness Record
  app.get('/api/orders/:id/payment-readiness', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view payment readiness.');
      }

      const readiness = PaymentReadinessService.getPaymentReadiness(req.params.id, req.user);
      return res.json({
        success: true,
        data: readiness,
      });
    } catch (err) {
      next(err);
    }
  });

  // 8. STEP 11D: Initiate Payment Handoff to Step 12 Payment Gateway
  app.post('/api/orders/:id/initiate-payment-handoff', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to initiate payment handoff.');
      }

      const handoff = OrderReviewService.initiatePaymentHandoff(req.params.id, req.user);
      return res.json({
        success: true,
        data: handoff,
      });
    } catch (err) {
      next(err);
    }
  });

  // 9. STEP 12B: Advertiser Payment Initiation API
  app.post('/api/orders/:id/payments/initiate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to initiate payment.');
      }

      const result = await PaymentInitiationService.initiatePayment(
        {
          orderId: req.params.id,
          idempotencyKey: (req.headers['idempotency-key'] as string) || req.body?.idempotencyKey,
          providerPreference: req.body?.providerPreference,
          clientProvidedAmountMinor: req.body?.amountMinor,
          clientProvidedCurrency: req.body?.currency,
        },
        req.user
      );

      return res.status(201).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 10. STEP 12B: Get Payment Record for Order
  app.get('/api/orders/:id/payment', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view payment.');
      }

      const payment = PaymentInitiationService.getPaymentForOrder(req.params.id, req.user);
      return res.json({
        success: true,
        data: payment || null,
      });
    } catch (err) {
      next(err);
    }
  });

  // 11. STEP 12B: Get Payment Attempts for Order
  app.get('/api/orders/:id/payment-attempts', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view payment attempts.');
      }

      const attempts = PaymentInitiationService.getPaymentAttemptsForOrder(req.params.id, req.user);
      return res.json({
        success: true,
        data: attempts,
      });
    } catch (err) {
      next(err);
    }
  });

  // 12. STEP 12C: Server-Side Payment Verification API
  app.post('/api/orders/:id/payments/verify', async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to verify payment.');
      }

      const result = await PaymentVerificationService.verifyPayment(
        {
          orderId: req.params.id,
          providerReference: req.body?.providerReference,
          providerPreference: req.body?.providerPreference,
          simulationOverride: req.body?.simulationOverride,
        },
        req.user
      );

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 13. STEP 12D: Provider Payment Webhook Receiver
  app.post('/api/webhooks/payments/:provider', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const signatureHeader =
        (req.headers['x-aquabloom-signature'] as string) ||
        (req.headers['stripe-signature'] as string) ||
        (req.headers['x-webhook-signature'] as string) ||
        (req.headers['signature'] as string);

      const result = await PaymentWebhookService.processWebhook(
        req.body,
        signatureHeader,
        {
          providerName: req.params.provider?.toUpperCase(),
        }
      );

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 14. STEP 12D: Order Payment Reconciliation Records
  app.get('/api/orders/:id/reconciliation', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view reconciliation records.');
      }

      const order = db.getOrderById(req.params.id);
      if (!order) {
        throw new NotFoundError(`Order ${req.params.id} not found.`);
      }

      if (req.user.role !== 'ADMIN' && order.advertiserId !== req.user.id) {
        throw new AuthorizationError('You are not authorized to view reconciliation for this order.');
      }

      const records = db.getPaymentReconciliationRecordsByOrderId(order.id);
      return res.json({
        success: true,
        data: records,
      });
    } catch (err) {
      next(err);
    }
  });

  // 15. STEP 12D: Admin Global Reconciliation Records
  app.get('/api/reconciliations', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      if (req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only system administrators can access global financial reconciliation records.');
      }

      const records = db.getAllPaymentReconciliationRecords();
      return res.json({
        success: true,
        data: records,
      });
    } catch (err) {
      next(err);
    }
  });

  // 16. STEP 12E: Venue Compensation View (Counterparty isolated)
  app.get('/api/orders/:id/venue-compensation', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view venue compensation.');
      }

      const view = FinancialLedgerAuthorizationService.getVenueCompensationView(req.params.id, req.user);
      return res.json({
        success: true,
        data: view,
      });
    } catch (err) {
      next(err);
    }
  });

  // 17. STEP 12E: Supplier Payable View (Counterparty isolated)
  app.get('/api/orders/:id/supplier-payable', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view supplier payable information.');
      }

      const view = FinancialLedgerAuthorizationService.getSupplierPayableView(req.params.id, req.user);
      return res.json({
        success: true,
        data: view,
      });
    } catch (err) {
      next(err);
    }
  });

  // 18. STEP 12E: Logistics Payable View (Counterparty isolated)
  app.get('/api/orders/:id/logistics-payable', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view logistics payable information.');
      }

      const view = FinancialLedgerAuthorizationService.getLogisticsPayableView(req.params.id, req.user);
      return res.json({
        success: true,
        data: view,
      });
    } catch (err) {
      next(err);
    }
  });

  // 19. STEP 12E: Order Internal Financial Ledger Summary (Admin Only)
  app.get('/api/orders/:id/ledger-summary', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      const summary = FinancialLedgerAuthorizationService.getOrderLedgerSummary(req.params.id, req.user);
      return res.json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  });

  // 20. STEP 12E: Admin Global Financial Ledger Entries
  app.get('/api/ledger/entries', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      if (req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only system administrators can access full ledger entries.');
      }

      const orderId = req.query.orderId as string | undefined;
      const entries = orderId
        ? db.getFinancialLedgerEntriesByOrderId(orderId)
        : db.getAllFinancialLedgerEntries();

      return res.json({
        success: true,
        data: entries,
      });
    } catch (err) {
      next(err);
    }
  });

  // 21. STEP 12F: Order Fulfillment Authorization View (Role-Isolated)
  app.get('/api/orders/:id/fulfillment-authorization', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to view fulfillment authorization.');
      }

      const view = FulfillmentAuthorizationService.getFulfillmentAuthorizationView(
        req.params.id,
        req.user
      );

      return res.json({
        success: true,
        data: view,
      });
    } catch (err) {
      next(err);
    }
  });

  // 22. STEP 12F: Authorize Fulfillment Gate Execution
  app.post('/api/orders/:id/fulfillment-authorization', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required to execute fulfillment authorization.');
      }

      const result = FulfillmentAuthorizationService.authorizeFulfillment(req.params.id, {
        actor: req.user,
        sourcePaymentReference: req.body?.sourcePaymentReference,
      });

      return res.json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  });

  // 23. STEP 12F: Admin Global Fulfillment Authorizations
  app.get('/api/fulfillment-authorizations', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      if (req.user.role !== 'ADMIN') {
        throw new AuthorizationError('Only system administrators can access full fulfillment authorizations.');
      }

      const list = db.getAllFulfillmentAuthorizations();
      return res.json({
        success: true,
        data: list,
      });
    } catch (err) {
      next(err);
    }
  });

  // Protected Audit Events (for Admin & System Oversight)
  app.get('/api/audit/events', (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required.');
      }

      // Non-admins only see events tied to their own user ID
      const allEvents = db.getEvents();
      const visible =
        req.user.role === 'ADMIN'
          ? allEvents
          : allEvents.filter((e) => e.userId === req.user?.id);

      return res.json({
        success: true,
        data: visible.slice(0, 50),
      });
    } catch (err) {
      next(err);
    }
  });

  // Global Error Handler Middleware
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const formatted = formatErrorForClient(err);
    const statusCode =
      err instanceof AppError
        ? err.statusCode
        : typeof err === 'object' && err !== null && typeof (err as any).statusCode === 'number'
        ? (err as any).statusCode
        : formatted.code === 'VALIDATION_FAILED'
        ? 400
        : 500;
    res.status(statusCode).json({
      success: false,
      error: formatted,
    });
  });

  // --- VITE MIDDLEWARE OR STATIC SERVING ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AquaBloom Foundation Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
