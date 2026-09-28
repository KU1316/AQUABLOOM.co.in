/**
 * AquaBloom Step 7 Part 4 Hardening, Audit, Security & Notification Test Suite
 */

import { strict as assert } from 'assert';
import { db } from '../src/server/db.js';
import {
  AgreementService,
  AgreementAuthorizationService,
  AgreementNotificationService,
  AgreementSnapshotService,
} from '../src/server/agreementServices.js';
import {
  AuthorizationError,
  AgreementLockedError,
  ConflictError,
  ValidationError,
} from '../src/lib/errors.js';
import { eventDispatcher } from '../src/lib/events.js';
import type { User, CampaignAgreement } from '../src/types.js';

// Setup mock actors
const nowIso = new Date().toISOString();

const adminUser: User = {
  id: 'usr_admin_audit',
  publicAccountId: 'AB-ACC-ADMIN-01',
  role: 'ADMIN',
  status: 'ACTIVE',
  contactName: 'Platform Admin',
  email: 'admin@aquabloom.internal',
  organizationName: 'AquaBloom Global',
  phone: '+1-555-0100',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const advertiserUser: User = {
  id: 'usr_adv_audit_party',
  publicAccountId: 'AB-ACC-ADV-01',
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Sarah Brand Director',
  email: 'sarah@zenithbeverages.com',
  organizationName: 'Zenith Beverages Co',
  phone: '+1-555-0200',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const venueUser: User = {
  id: 'usr_ven_audit_party',
  publicAccountId: 'AB-ACC-VEN-01',
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Marco Operations Lead',
  email: 'marco@metroluxhotel.com',
  organizationName: 'MetroLux Hotel & Suites',
  phone: '+1-555-0300',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const supplierUser: User = {
  id: 'usr_sup_blocked',
  publicAccountId: 'AB-ACC-SUP-01',
  role: 'SUPPLIER',
  status: 'ACTIVE',
  contactName: 'Sam Bottling Partner',
  email: 'sam@bottlingpartner.com',
  organizationName: 'Precision Eco-Bottling',
  phone: '+1-555-0400',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const logisticsUser: User = {
  id: 'usr_log_blocked',
  publicAccountId: 'AB-ACC-LOG-01',
  role: 'LOGISTICS_PARTNER',
  status: 'ACTIVE',
  contactName: 'Logan Transport',
  email: 'logan@fasttracklogistics.com',
  organizationName: 'FastTrack Fleet Logistics',
  phone: '+1-555-0500',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const crossTenantAdvertiser: User = {
  id: 'usr_adv_cross_alien',
  publicAccountId: 'AB-ACC-ADV-99',
  role: 'ADVERTISER',
  status: 'ACTIVE',
  contactName: 'Alien Brand Executive',
  email: 'alien@alienbrands.com',
  organizationName: 'Alien Brand Inc',
  phone: '+1-555-0600',
  createdAt: nowIso,
  updatedAt: nowIso,
};

const crossTenantVenue: User = {
  id: 'usr_ven_cross_alien',
  publicAccountId: 'AB-ACC-VEN-99',
  role: 'VENUE',
  status: 'ACTIVE',
  contactName: 'Alien Venue Manager',
  email: 'alien@alienhotel.com',
  organizationName: 'Alien Venue LLC',
  phone: '+1-555-0700',
  createdAt: nowIso,
  updatedAt: nowIso,
};

// Setup mock proposal and campaign with unique run ID
const testRunId = Date.now().toString(36);
const proposalId = `prp_hardening_${testRunId}`;
const campaignId = `cmp_hardening_${testRunId}`;

db.saveProposal({
  id: proposalId,
  publicProposalId: `AB-PRP-HARDEN-${testRunId}`,
  campaignId,
  publicCampaignId: `AB-CMP-HARDEN-${testRunId}`,
  campaignName: 'AquaSpring National Launch',
  campaignCategory: 'Beverages',
  advertiserId: advertiserUser.id,
  advertiserPublicId: 'AB-ADV-HARDEN',
  advertiserBrandName: 'Zenith Beverages Co',
  venueId: venueUser.id,
  venuePublicId: 'AB-VEN-HARDEN',
  venueName: 'MetroLux Hotel & Suites',
  status: 'READY_FOR_AGREEMENT',
  currentVersionNumber: 1,
  advertiserConfirmedAt: new Date().toISOString(),
  venueConfirmedAt: new Date().toISOString(),
  terms: {
    campaignQuantity: 20000,
    unitPrice: 1.5,
    totalAdvertiserCost: 30000,
    campaignDuration: { value: 6, unit: 'WEEKS' },
    preferredStartPeriod: { month: 'OCT', year: 2026, label: 'Oct 2026' },
    customConditions: 'Premium placement in VIP reception area',
    capacityOverageDecision: 'CAPPED_AT_QUOTA',
    venueCompensationTerms: {
      type: 'PERCENTAGE',
      percentage: 10.0,
      description: '10.0% venue distribution share',
    },
    venueResponsibilities: ['Receive 20000 units', 'Maintain refrigerated inventory'],
    advertiserResponsibilities: ['Provide approved artwork by deadline'],
    deliveryTermsKnown: 'Delivery by certified logistics partner directly to venue loading bay',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: advertiserUser.id,
  updatedBy: venueUser.id,
} as any);

db.saveCampaign({
  id: campaignId,
  publicCampaignId: `AB-CMP-HARDEN-${testRunId}`,
  campaignName: 'AquaSpring National Launch',
  category: 'Beverages',
  advertiserId: advertiserUser.id,
  status: 'PROPOSAL_ACTIVE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  createdBy: advertiserUser.id,
} as any);

async function runTests() {
  console.log('====================================================');
  console.log('STARTING STEP 7 PART 4: HARDENING, AUDIT & NOTIFICATION TESTS');
  console.log('====================================================');

  // Helper to fetch audit events
  const getAuditEvents = () => eventDispatcher.getRecentEvents('AUDIT_EVENTS', 200);

  // ==========================================
  // TEST SUITE 1: AUDIT EVENT COVERAGE
  // ==========================================
  console.log('--- TEST 1: Creation and Version Audit Events ---');

  const agreement = AgreementService.createAgreement(
    { sourceProposalId: proposalId },
    advertiserUser
  );

  assert.ok(agreement, 'Agreement must be created');
  assert.equal(agreement.status, 'DRAFT');

  // Check AGREEMENT_CREATED audit event
  const createdEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_CREATED');
  assert.ok(createdEvt, 'AGREEMENT_CREATED audit event must be dispatched');
  assert.equal(createdEvt.payload.agreementId, agreement.id);
  assert.equal(createdEvt.payload.actor, advertiserUser.id);
  assert.equal(createdEvt.payload.role, 'ADVERTISER');
  assert.ok(createdEvt.payload.timestamp, 'Timestamp must exist in payload');
  assert.equal(createdEvt.payload.versionNumber, 1);
  assert.equal(createdEvt.payload.version, 1);
  console.log('✅ AGREEMENT_CREATED audit event verified with complete payload');

  // Check AGREEMENT_VERSION_CREATED audit event
  const verCreatedEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_VERSION_CREATED');
  assert.ok(verCreatedEvt, 'AGREEMENT_VERSION_CREATED audit event must be dispatched');
  assert.equal(verCreatedEvt.payload.versionNumber, 1);
  assert.equal(verCreatedEvt.payload.agreementId, agreement.id);
  console.log('✅ AGREEMENT_VERSION_CREATED audit event verified');

  // Check notification on agreement creation
  const notifications = db.getUserNotifications(advertiserUser.id);
  const venueNotifications = db.getUserNotifications(venueUser.id);
  assert.ok(notifications.some((n) => n.title.includes('Generated') || n.title.includes('Agreement')), 'Advertiser notification must exist');
  assert.ok(venueNotifications.some((n) => n.title.includes('Available') || n.title.includes('Agreement')), 'Venue notification must exist');
  console.log('✅ Agreement created notifications dispatched to both parties');

  // ==========================================
  // TEST SUITE 2: ACCESS DENIED AUDIT EVENTS & CROSS-TENANT ISOLATION
  // ==========================================
  console.log('--- TEST 2: Access Denied & Isolation Audit Events ---');

  // Supplier access attempt
  let supplierDenied = false;
  try {
    AgreementService.getAgreement(agreement.id, supplierUser);
  } catch (e: any) {
    assert.ok(e instanceof AuthorizationError);
    supplierDenied = true;
  }
  assert.ok(supplierDenied, 'Supplier must be denied access');

  const supplierDeniedEvt = getAuditEvents().find(
    (e) => e.eventType === 'AGREEMENT_ACCESS_DENIED' && e.payload.role === 'SUPPLIER'
  );
  assert.ok(supplierDeniedEvt, 'AGREEMENT_ACCESS_DENIED audit event must be dispatched for supplier');
  assert.equal(supplierDeniedEvt.payload.actor, supplierUser.id);
  assert.equal(supplierDeniedEvt.payload.agreementId, agreement.id);
  assert.ok(supplierDeniedEvt.payload.reason, 'Reason must be logged');
  console.log('✅ Supplier access denied audit event verified');

  // Logistics access attempt
  let logisticsDenied = false;
  try {
    AgreementService.getAgreement(agreement.id, logisticsUser);
  } catch (e: any) {
    assert.ok(e instanceof AuthorizationError);
    logisticsDenied = true;
  }
  assert.ok(logisticsDenied, 'Logistics must be denied access');

  const logDeniedEvt = getAuditEvents().find(
    (e) => e.eventType === 'AGREEMENT_ACCESS_DENIED' && e.payload.role === 'LOGISTICS_PARTNER'
  );
  assert.ok(logDeniedEvt, 'AGREEMENT_ACCESS_DENIED audit event must be dispatched for logistics');
  console.log('✅ Logistics partner access denied audit event verified');

  // Cross-tenant advertiser access attempt
  let crossAdvDenied = false;
  try {
    AgreementService.getAgreement(agreement.id, crossTenantAdvertiser);
  } catch (e: any) {
    assert.ok(e instanceof AuthorizationError);
    crossAdvDenied = true;
  }
  assert.ok(crossAdvDenied, 'Cross-tenant advertiser must be denied');

  const crossAdvEvt = getAuditEvents().find(
    (e) => e.eventType === 'AGREEMENT_ACCESS_DENIED' && e.payload.actor === crossTenantAdvertiser.id
  );
  assert.ok(crossAdvEvt, 'AGREEMENT_ACCESS_DENIED audit event must be dispatched for cross-tenant advertiser');
  console.log('✅ Cross-tenant advertiser access denied audit event verified');

  // Cross-tenant venue access attempt
  let crossVenDenied = false;
  try {
    AgreementService.getAgreement(agreement.id, crossTenantVenue);
  } catch (e: any) {
    assert.ok(e instanceof AuthorizationError);
    crossVenDenied = true;
  }
  assert.ok(crossVenDenied, 'Cross-tenant venue must be denied');

  const crossVenEvt = getAuditEvents().find(
    (e) => e.eventType === 'AGREEMENT_ACCESS_DENIED' && e.payload.actor === crossTenantVenue.id
  );
  assert.ok(crossVenEvt, 'AGREEMENT_ACCESS_DENIED audit event must be dispatched for cross-tenant venue');
  console.log('✅ Cross-tenant venue access denied audit event verified');

  // ==========================================
  // TEST SUITE 3: AGREEMENT VIEWED AUDIT EVENT
  // ==========================================
  console.log('--- TEST 3: Agreement Viewed Audit Event ---');

  AgreementService.getAgreement(agreement.id, advertiserUser);
  const viewedEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_VIEWED');
  assert.ok(viewedEvt, 'AGREEMENT_VIEWED audit event must be dispatched');
  assert.equal(viewedEvt.payload.actor, advertiserUser.id);
  assert.equal(viewedEvt.payload.agreementId, agreement.id);
  assert.equal(viewedEvt.payload.versionNumber, 1);
  console.log('✅ AGREEMENT_VIEWED audit event verified');

  // ==========================================
  // TEST SUITE 4: CONFIRMATION AUDIT & NOTIFICATIONS
  // ==========================================
  console.log('--- TEST 4: Confirmation Lifecycle & Notifications ---');

  // Advertiser confirms
  const confirmAdvRes = AgreementService.confirmAgreement(agreement.id, advertiserUser, {
    expectedVersion: 1,
    acknowledgement: true,
    notes: 'Confirmed by advertiser executive',
  });

  assert.equal(confirmAdvRes.isReadyToLock, false);
  assert.equal(confirmAdvRes.agreement.status, 'AWAITING_VENUE_CONFIRMATION');

  // Check ADVERTISER_CONFIRMED event
  const advConfEvt = getAuditEvents().find((e) => e.eventType === 'ADVERTISER_CONFIRMED');
  assert.ok(advConfEvt, 'ADVERTISER_CONFIRMED audit event must be dispatched');
  assert.equal(advConfEvt.payload.actor, advertiserUser.id);
  assert.equal(advConfEvt.payload.role, 'ADVERTISER');
  assert.equal(advConfEvt.payload.isReadyToLock, false);
  assert.equal(advConfEvt.payload.notes, 'Confirmed by advertiser executive');
  console.log('✅ ADVERTISER_CONFIRMED audit event verified');

  // Check Venue received notification that Advertiser confirmed and venue action is required
  const venueNotifsAfterAdv = db.getUserNotifications(venueUser.id);
  assert.ok(
    venueNotifsAfterAdv.some((n) => n.title.includes('Advertiser Confirmed')),
    'Venue must receive notification that Advertiser confirmed'
  );
  assert.ok(
    venueNotifsAfterAdv.some((n) => n.title.includes('Requires Confirmation')),
    'Venue must receive notification that confirmation is required'
  );
  console.log('✅ Venue notified of advertiser confirmation and required action');

  // Venue confirms
  const confirmVenRes = AgreementService.confirmAgreement(agreement.id, venueUser, {
    expectedVersion: 1,
    acknowledgement: true,
    notes: 'Confirmed by venue general manager',
  });

  assert.equal(confirmVenRes.isReadyToLock, true);
  assert.equal(confirmVenRes.agreement.status, 'READY_TO_LOCK');

  // Check VENUE_CONFIRMED event
  const venConfEvt = getAuditEvents().find((e) => e.eventType === 'VENUE_CONFIRMED');
  assert.ok(venConfEvt, 'VENUE_CONFIRMED audit event must be dispatched');
  assert.equal(venConfEvt.payload.actor, venueUser.id);
  assert.equal(venConfEvt.payload.role, 'VENUE');
  assert.equal(venConfEvt.payload.isReadyToLock, true);
  console.log('✅ VENUE_CONFIRMED audit event verified');

  // Check AGREEMENT_READY_TO_LOCK event
  const readyEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_READY_TO_LOCK');
  assert.ok(readyEvt, 'AGREEMENT_READY_TO_LOCK audit event must be dispatched');
  assert.equal(readyEvt.payload.agreementId, agreement.id);
  console.log('✅ AGREEMENT_READY_TO_LOCK audit event verified');

  // Check both parties notified of READY_TO_LOCK
  const advNotifsReady = db.getUserNotifications(advertiserUser.id);
  const venNotifsReady = db.getUserNotifications(venueUser.id);
  assert.ok(advNotifsReady.some((n) => n.title.includes('Ready to Lock')), 'Advertiser notified ready to lock');
  assert.ok(venNotifsReady.some((n) => n.title.includes('Ready to Lock')), 'Venue notified ready to lock');
  console.log('✅ Both parties notified of READY_TO_LOCK state');

  // ==========================================
  // TEST SUITE 5: LOCK FAILURE & AUDIT
  // ==========================================
  console.log('--- TEST 5: Lock Failure Handling & Notifications ---');

  // Attempt lock with invalid lockVersion (stale version concurrency conflict)
  let lockFailed = false;
  try {
    AgreementService.lockAgreement(agreement.id, advertiserUser, {
      expectedVersion: 1,
      lockVersion: 999, // Intentional mismatch
    });
  } catch (e: any) {
    assert.ok(e instanceof ConflictError);
    lockFailed = true;
  }
  assert.ok(lockFailed, 'Lock with stale version must fail with ConflictError');

  const lockFailedEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_LOCK_FAILED');
  assert.ok(lockFailedEvt, 'AGREEMENT_LOCK_FAILED audit event must be dispatched');
  assert.equal(lockFailedEvt.payload.actor, advertiserUser.id);
  assert.equal(lockFailedEvt.payload.result, 'FAILED');
  console.log('✅ AGREEMENT_LOCK_FAILED audit event verified');

  // Check user received notification about action failed
  const advNotifsFail = db.getUserNotifications(advertiserUser.id);
  assert.ok(advNotifsFail.some((n) => n.title.includes('Action Failed')), 'Actor must receive action failed notification');
  console.log('✅ User notified of lock failure');

  // ==========================================
  // TEST SUITE 6: ATOMIC LOCK & SEALED INTEGRITY
  // ==========================================
  console.log('--- TEST 6: Atomic Lock & Snapshot Immutability ---');

  const lockRes = AgreementService.lockAgreement(agreement.id, advertiserUser, {
    expectedVersion: 1,
    lockVersion: 1,
  });

  assert.equal(lockRes.agreement.status, 'LOCKED');
  assert.ok(lockRes.snapshot, 'Snapshot must be created');
  assert.equal(lockRes.agreement.lockedSnapshotId, lockRes.snapshot.publicSnapshotId);

  // Check AGREEMENT_LOCKED audit event
  const lockedEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_LOCKED');
  assert.ok(lockedEvt, 'AGREEMENT_LOCKED audit event must be dispatched');
  assert.equal(lockedEvt.payload.actor, advertiserUser.id);
  assert.equal(lockedEvt.payload.lockedSnapshotId, lockRes.snapshot.publicSnapshotId);
  console.log('✅ AGREEMENT_LOCKED audit event verified');

  // Check both parties notified of locked agreement
  const advNotifsLocked = db.getUserNotifications(advertiserUser.id);
  const venNotifsLocked = db.getUserNotifications(venueUser.id);
  assert.ok(advNotifsLocked.some((n) => n.title.includes('Locked')), 'Advertiser notified agreement locked');
  assert.ok(venNotifsLocked.some((n) => n.title.includes('Locked')), 'Venue notified agreement locked');
  console.log('✅ Both parties notified of sealed & locked agreement');

  // Snapshot immutability check: attempting to overwrite existing snapshot throws AgreementLockedError
  let snapshotTamperBlocked = false;
  try {
    db.saveAgreementSnapshot({
      ...lockRes.snapshot,
      agreementPublicId: 'TAMPERED_PUBLIC_ID',
    });
  } catch (e: any) {
    assert.ok(e instanceof AgreementLockedError);
    snapshotTamperBlocked = true;
  }
  assert.ok(snapshotTamperBlocked, 'Snapshot database overwriting must be strictly rejected');
  console.log('✅ Snapshot database overwriting strictly blocked');

  // Mutation rejection on locked agreement
  let mutationBlocked = false;
  try {
    AgreementService.updateCommercialTerms(
      agreement.id,
      advertiserUser,
      { campaignQuantity: 99999 },
      'Illegal post-lock mutation'
    );
  } catch (e: any) {
    assert.ok(e instanceof AgreementLockedError);
    mutationBlocked = true;
  }
  assert.ok(mutationBlocked, 'Post-lock mutation must be strictly rejected');

  const updateRejectedEvt = getAuditEvents().find((e) => e.eventType === 'AGREEMENT_UPDATE_REJECTED');
  assert.ok(updateRejectedEvt, 'AGREEMENT_UPDATE_REJECTED audit event must be dispatched');
  assert.equal(updateRejectedEvt.payload.actor, advertiserUser.id);
  assert.equal(updateRejectedEvt.payload.result, 'REJECTED');
  console.log('✅ AGREEMENT_UPDATE_REJECTED audit event verified');

  // ==========================================
  // TEST SUITE 7: COMMERCIAL DATA REDACTION VERIFICATION
  // ==========================================
  console.log('--- TEST 7: Financial Redaction in Shared & Preview Views ---');

  const sharedView = AgreementService.getSharedView(agreement.id, advertiserUser);
  assert.equal((sharedView as any).supplierCost, undefined);
  assert.equal((sharedView as any).supplierInternalCost, undefined);
  assert.equal((sharedView as any).aquaBloomMargin, undefined);
  assert.equal((sharedView as any).unconfirmedLogisticsCost, undefined);
  assert.equal((sharedView as any).unconfirmedTaxes, undefined);
  assert.equal((sharedView as any).fakeFinalAdvertiserTotal, undefined);
  assert.equal((sharedView as any).ledgerLockStatus, undefined);
  console.log('✅ Financial data strictly excluded from shared view');

  const previewView = AgreementService.getPreview(agreement.id, venueUser);
  assert.equal((previewView as any).supplierCost, undefined);
  assert.equal((previewView as any).supplierInternalCost, undefined);
  assert.equal((previewView as any).aquaBloomMargin, undefined);
  assert.equal(previewView.pricingSafeguards.formulaNote, 'Product Price + Logistics + Applicable Taxes = Final Advertiser Total');
  assert.equal(previewView.pricingSafeguards.fakeFinalAdvertiserTotalExcluded, true);
  console.log('✅ Commercial safeguards and redacting strictly confirmed in preview view');

  console.log('====================================================');
  console.log('ALL STEP 7 PART 4 HARDENING, AUDIT & NOTIFICATION TESTS PASSED! 🎉');
  console.log('====================================================');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
