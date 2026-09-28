/**
 * AquaBloom Step 3 Product Catalog Automated Verification Suite
 * 
 * Verifies:
 * - Supplier eligibility validation
 * - Business constraints (inclusive pricing, INR currency, non-sequential public IDs)
 * - State machine transitions
 * - Versioning & effective dating
 * - Controlled draft deletion
 * - Cost data isolation (zero internal cost leakage to marketplace)
 */

import { db } from '../src/server/db.js';
import {
  validateSupplierEligibility,
  validateProductCreation,
  validateProductVersionCreation,
  validateStatusTransition,
  sanitizeProductForMarketplace,
} from '../src/lib/productValidation.js';
import { User, SupplierProfile, CreateProductInput, CreateProductVersionInput } from '../src/types.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function runProductCatalogTests() {
  console.log('====================================================');
  console.log('STARTING AQUABLOOM STEP 3 PRODUCT CATALOG TESTS');
  console.log('====================================================\n');

  // Test 1: Supplier Eligibility Enforcement
  console.log('--- TEST GROUP 1: Supplier Eligibility Enforcement ---');
  const unapprovedSupplierUser: User = {
    id: 'usr_test_supp_unapp',
    publicAccountId: 'AB-ACC-TEST01',
    role: 'SUPPLIER',
    organizationName: 'Pending Bottling Co',
    email: 'unapproved@plant.com',
    contactName: 'Pending Representative',
    status: 'PENDING_REVIEW',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const unapprovedProfile: any = {
    userId: unapprovedSupplierUser.id,
    supplierBusinessName: 'Pending Bottling Co',
    approvalStatus: 'PENDING_REVIEW',
    completion: {
      isComplete: false,
      missingFields: ['facilityAddress', 'certifications'],
      percentage: 50,
    },
    plantLocations: [],
    supportedContainers: [],
    fillingCapabilities: [],
    printingCapabilities: [],
  };

  const unapprovedCheck = validateSupplierEligibility(unapprovedSupplierUser, unapprovedProfile);
  assert(!unapprovedCheck.isValid, 'Unapproved supplier rejected from product authoring');
  assert(
    unapprovedCheck.errors.some((e) => e.code === 'SUPPLIER_NOT_APPROVED'),
    'Reports SUPPLIER_NOT_APPROVED error code'
  );

  const approvedSupplierUser: User = {
    id: 'usr_test_supp_app',
    publicAccountId: 'AB-ACC-APPROVED01',
    role: 'SUPPLIER',
    organizationName: 'Himalayan Spring Bottlers Ltd',
    email: 'approved@himalayan.com',
    contactName: 'Chief Plant Engineer',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const approvedProfile: any = {
    userId: approvedSupplierUser.id,
    supplierBusinessName: 'Himalayan Spring Bottlers Ltd',
    approvalStatus: 'APPROVED',
    completion: {
      isComplete: true,
      missingFields: [],
      percentage: 100,
    },
    plantLocations: [
      {
        plantName: 'Dehradun Main Plant',
        address: 'Industrial Area, Selaqui, Dehradun, Uttarakhand',
        city: 'Dehradun',
        state: 'Uttarakhand',
        country: 'India',
        postalCode: '248011',
      },
    ],
    supportedContainers: ['PET', 'rPET', 'Glass'],
    fillingCapabilities: ['Still Water', 'Sparkling Water'],
    printingCapabilities: ['Full Wrap Shrink Sleeve', 'Direct Screen Print'],
  };

  const approvedCheck = validateSupplierEligibility(approvedSupplierUser, approvedProfile);
  assert(approvedCheck.isValid, 'Active, approved supplier passes eligibility verification');

  // Test 2: Product Creation Validation
  console.log('\n--- TEST GROUP 2: Product Master Creation Validation ---');
  const validProductInput: CreateProductInput = {
    name: 'Himalayan Artesian 500ml rPET Standard',
    category: 'Natural Spring Water',
    description: 'High-clarity cylindrical packaging engineered for full-wrap advertising sleeves.',
    status: 'DRAFT',
    availability: 'AVAILABLE',
    specifications: {
      bottleMaterial: '100% rPET (Post-Consumer Recycled)',
      bottleCapacityMl: 500,
      volumeLabel: '500 ml Standard Bottle',
      bottleShape: 'Classic Cylinder',
      bottleType: 'Standard Bottle',
      capType: 'Screw Cap (Tamper-Evident)',
      bottleFinish: 'Clear Gloss',
      labelType: 'Full-Wrap Shrink Sleeve',
      printingCapability: 'Up to 8 Colors UV Flexo',
      finishingOptions: ['Matte Soft-Touch', 'Spot UV Highlighting'],
      packagingConfiguration: '24 bottles per case, shrink-wrapped tray',
    },
    customerFacingPrice: {
      amount: 19.5,
      currency: 'INR',
    },
    supplierInternalCost: {
      amount: 12.2,
      currency: 'INR',
    },
    minimumOrderQuantity: 2500,
    productionLeadTime: {
      value: 14,
      unit: 'DAYS',
    },
    productionCapacity: {
      unitsPerMonth: 250000,
    },
  };

  const creationCheck = validateProductCreation(validProductInput, approvedSupplierUser, approvedProfile);
  assert(creationCheck.isValid, 'Valid product master configuration accepted');

  // Test invalid price (zero / negative)
  const invalidPriceInput: CreateProductInput = {
    ...validProductInput,
    customerFacingPrice: { amount: -5, currency: 'INR' },
  };
  const invalidPriceCheck = validateProductCreation(invalidPriceInput, approvedSupplierUser, approvedProfile);
  assert(!invalidPriceCheck.isValid, 'Negative pricing rejected');
  assert(
    invalidPriceCheck.errors.some((e) => e.field === 'customerFacingPrice.amount'),
    'Reports customerFacingPrice error'
  );

  // Test invalid currency (non-INR)
  const invalidCurrencyInput: CreateProductInput = {
    ...validProductInput,
    customerFacingPrice: { amount: 10, currency: 'USD' as any },
  };
  const invalidCurrencyCheck = validateProductCreation(invalidCurrencyInput, approvedSupplierUser, approvedProfile);
  assert(!invalidCurrencyCheck.isValid, 'Non-INR currency rejected under India-focused mandate');

  // Test invalid MOQ
  const invalidMoqInput: CreateProductInput = {
    ...validProductInput,
    minimumOrderQuantity: 0,
  };
  const invalidMoqCheck = validateProductCreation(invalidMoqInput, approvedSupplierUser, approvedProfile);
  assert(!invalidMoqCheck.isValid, 'Zero MOQ rejected');

  // Test 3: Status Transition State Machine
  console.log('\n--- TEST GROUP 3: Product Status Lifecycle State Machine ---');
  assert(validateStatusTransition('DRAFT', 'ACTIVE').isValid, 'Transition DRAFT -> ACTIVE permitted');
  assert(validateStatusTransition('ACTIVE', 'INACTIVE').isValid, 'Transition ACTIVE -> INACTIVE permitted');
  assert(validateStatusTransition('INACTIVE', 'ACTIVE').isValid, 'Transition INACTIVE -> ACTIVE permitted');
  assert(validateStatusTransition('ACTIVE', 'DISCONTINUED').isValid, 'Transition ACTIVE -> DISCONTINUED permitted');
  assert(validateStatusTransition('INACTIVE', 'DISCONTINUED').isValid, 'Transition INACTIVE -> DISCONTINUED permitted');
  assert(!validateStatusTransition('DISCONTINUED', 'ACTIVE').isValid, 'Transition DISCONTINUED -> ACTIVE strictly rejected');
  assert(!validateStatusTransition('DISCONTINUED', 'DRAFT').isValid, 'Transition DISCONTINUED -> DRAFT strictly rejected');
  assert(!validateStatusTransition('ACTIVE', 'DRAFT').isValid, 'Transition ACTIVE -> DRAFT strictly rejected');

  // Test 4: Database Product Persistence, Public ID Generation & Versioning
  console.log('\n--- TEST GROUP 4: Database Master Creation & Versioning ---');
  // Seed approved supplier in db
  (db as any).schema.users = (db as any).schema.users.filter((u: any) => u.id !== approvedSupplierUser.id);
  (db as any).schema.users.push(approvedSupplierUser);
  (db as any).schema.profiles[approvedSupplierUser.id] = approvedProfile;

  const created = db.createProduct(approvedSupplierUser.id, validProductInput, approvedSupplierUser.id);
  assert(Boolean(created.product.id), 'Master product internal ID generated');
  assert(
    created.product.publicProductId.startsWith('AB-PRD-'),
    `Public Product ID matches prefix AB-PRD-: ${created.product.publicProductId}`
  );
  assert(created.product.currentVersionNumber === 1, 'Initial product version is 1');
  assert(created.version.versionNumber === 1, 'Initial version record is version 1');
  assert(created.version.productId === created.product.id, 'Version references product ID');
  assert(created.version.effectiveUntil === null, 'Current active version effectiveUntil is null');

  // Create Version 2 (revision)
  console.log('\n--- TEST GROUP 5: Material Revision & Effective Dating ---');
  const version2Input: CreateProductVersionInput = {
    customerFacingPrice: {
      amount: 21.0,
      currency: 'INR',
    },
    minimumOrderQuantity: 3000,
    productionLeadTime: {
      value: 12,
      unit: 'DAYS',
    },
    changeReason: 'Q3 resin index revision & aluminum tooling update',
  };

  const v2 = db.createProductVersion(created.product.id, version2Input, approvedSupplierUser.id);
  assert(v2.product.currentVersionNumber === 2, 'Product currentVersionNumber updated to 2');
  assert(v2.version.versionNumber === 2, 'New version record created as version 2');
  assert(v2.product.customerFacingPrice.amount === 21.0, 'Product customerFacingPrice updated to 21.00');

  const allVersions = db.getProductVersions(created.product.id);
  assert(allVersions.length === 2, 'Product version history contains exactly 2 version records');
  const v1Record = allVersions.find((v) => v.versionNumber === 1);
  assert(Boolean(v1Record?.effectiveUntil), 'Version 1 effectiveUntil timestamp closed out');

  // Test 6: Controlled Draft Deletion
  console.log('\n--- TEST GROUP 6: Controlled Deletion Policy ---');
  // Create another draft product
  const draftProduct = db.createProduct(approvedSupplierUser.id, {
    ...validProductInput,
    name: 'Temporary Draft Test Bottle',
    status: 'DRAFT',
  }, approvedSupplierUser.id);

  assert(db.deleteDraftProduct(draftProduct.product.id, approvedSupplierUser.id), 'DRAFT product deleted successfully');
  assert(!db.getProductById(draftProduct.product.id), 'Deleted product is no longer in repository');

  // Attempt to delete active/non-draft product
  db.updateProductStatus(created.product.id, 'ACTIVE', approvedSupplierUser.id);
  let deleteErrorThrown = false;
  try {
    db.deleteDraftProduct(created.product.id, approvedSupplierUser.id);
  } catch {
    deleteErrorThrown = true;
  }
  assert(deleteErrorThrown, 'Attempting to delete ACTIVE product throws error to preserve audit trails');

  // Test 7: Cost Data Isolation & Marketplace Sanitization
  console.log('\n--- TEST GROUP 7: Commercial Cost Data Protection ---');
  const sanitized = sanitizeProductForMarketplace(created.product);
  assert(!('supplierInternalCost' in sanitized), 'supplierInternalCost stripped from sanitized product');
  assert((sanitized as any).supplierInternalCost === undefined, 'No internal cost exposed in public view');
  assert(sanitized.customerFacingPrice.amount === 21.0, 'Customer-facing price correctly maintained in sanitized view');
  assert(sanitized.publicProductId === created.product.publicProductId, 'Public product ID preserved');

  console.log('\n====================================================');
  console.log('ALL STEP 3 PRODUCT CATALOG TESTS PASSED SUCCESSFULLY');
  console.log('====================================================\n');
}

runProductCatalogTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
