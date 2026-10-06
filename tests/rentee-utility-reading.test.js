import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authorizePlatformQuery } from '../src/api/platform/authorization.js';

const utilityReadingFormSource = readFileSync(
  new URL('../src/pages/rentee/UtilityReadingForm.jsx', import.meta.url),
  'utf8'
);

const propertyContextSource = readFileSync(
  new URL('../src/contexts/PropertyContext.jsx', import.meta.url),
  'utf8'
);

const renteeUtilitiesSource = readFileSync(
  new URL('../src/pages/rentee/RenteeUtilities.jsx', import.meta.url),
  'utf8'
);

const renteeInvoicesSource = readFileSync(
  new URL('../src/pages/rentee/RenteeInvoices.jsx', import.meta.url),
  'utf8'
);

const paymentProofUploadSource = readFileSync(
  new URL('../src/components/invoices/PaymentProofUpload.jsx', import.meta.url),
  'utf8'
);

const platformRouterSource = readFileSync(
  new URL('../src/api/platform/router.js', import.meta.url),
  'utf8'
);

const serverSource = readFileSync(
  new URL('../server.js', import.meta.url),
  'utf8'
);

const tenant = { id: 'rentee-1', role: 'rentee' };
const membership = {
  tenant_id: 'tenant-a',
  role: 'rentee',
  status: 'active'
};

test('rentee utility form bootstraps from canonical auth profile and active tenancy summary', () => {
  assert.match(utilityReadingFormSource, /getMyTenancySummary/);
  assert.match(utilityReadingFormSource, /authUser\?\.profileId/);
  assert.match(utilityReadingFormSource, /activeTenancy\?\.property_id/);
  assert.doesNotMatch(utilityReadingFormSource, /findAppUserByAuthId/);
  assert.doesNotMatch(utilityReadingFormSource, /\/api\/mssql\/app-users/);
  assert.doesNotMatch(utilityReadingFormSource, /\/api\/mssql\/properties/);
});

test('rentee utilities overview uses the authenticated profile id without legacy app-user lookup', () => {
  assert.match(renteeUtilitiesSource, /user\?\.profileId/);
  assert.doesNotMatch(renteeUtilitiesSource, /findAppUserByAuthId/);
  assert.doesNotMatch(renteeUtilitiesSource, /\/api\/mssql\/app-users/);
});

test('rentee invoices use central owner-scoped reads without legacy MSSQL directories', () => {
  assert.match(renteeInvoicesSource, /platformClient\s*\.from\('invoices'\)/);
  assert.match(renteeInvoicesSource, /user\?\.profileId/);
  assert.match(renteeInvoicesSource, /properties!propertyid/);
  assert.doesNotMatch(renteeInvoicesSource, /findAppUserByAuthId/);
  assert.doesNotMatch(renteeInvoicesSource, /listInvoices/);
  assert.doesNotMatch(renteeInvoicesSource, /listProperties/);
  assert.doesNotMatch(renteeInvoicesSource, /\/api\/mssql\/app-users/);
  assert.doesNotMatch(renteeInvoicesSource, /\/api\/mssql\/invoices/);
  assert.doesNotMatch(renteeInvoicesSource, /\/api\/mssql\/properties/);
});

test('payment proof required validation is controlled by React state rather than hidden native input', () => {
  assert.match(paymentProofUploadSource, /if \(!paymentProof\)/);
  assert.match(paymentProofUploadSource, /disabled=\{loading \|\| !paymentProof \|\| !paymentDetails\.amount\}/);
  assert.doesNotMatch(paymentProofUploadSource, /accept="image\/\*,application\/pdf"\s*required/);
  assert.match(paymentProofUploadSource, /label="Payment Proof \*"/);
});

test('tenant portal does not initialize the broad workspace property directory', () => {
  assert.match(propertyContextSource, /getEffectivePortalType/);
  assert.match(propertyContextSource, /PORTAL_TYPES\.TENANT/);
  assert.match(propertyContextSource, /!isAuthenticated \|\| !hasTenantAccess \|\| isTenantPortal/);
});

test('legacy MSSQL business directories remain blocked for non-admin renter sessions', () => {
  assert.match(serverSource, /CENTRAL_AUTHORIZATION_REQUIRED/);
  assert.match(serverSource, /This legacy MSSQL business route is restricted to administrators/);
});

test('rentee utility insert remains owner-bound and property-verified', () => {
  const result = authorizePlatformQuery({
    user: tenant,
    membership,
    action: 'insert',
    table: 'utility_readings',
    payload: {
      renteeid: 'another-rentee',
      propertyid: 'property-1',
      utilitytype: 'electricity',
      currentreading: 123,
      readingdate: '2026-10-06',
      photourl: '/storage/images/example.jpg',
      status: 'approved',
      calculatedbill: 9999
    }
  });

  assert.equal(result.resourceScope.kind, 'tenant-insert');
  assert.equal(result.resourceScope.userId, 'rentee-1');
  assert.equal(result.payload.renteeid, 'rentee-1');
  assert.equal(result.payload.propertyid, 'property-1');
  assert.equal(result.payload.utilitytype, 'electricity');
  assert.equal(result.payload.currentreading, 123);
  assert.equal(result.payload.status, undefined);
  assert.equal(result.payload.calculatedbill, undefined);

  assert.match(platformRouterSource, /table === 'maintenance_requests' \|\| table === 'utility_readings'/);
  assert.match(platformRouterSource, /AND renteeid = @userId/);
  assert.match(platformRouterSource, /AND propertyid = @propertyId/);
});
