import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CANONICAL_PORTAL_PATHS,
  resolveLegacyAdminPath,
  resolveLegacyTenantPath
} from '../src/utils/routePolicy.js';

test('canonical portal paths remain dashboard and rentee during compatibility period', () => {
  assert.equal(CANONICAL_PORTAL_PATHS.WORKSPACE, '/dashboard');
  assert.equal(CANONICAL_PORTAL_PATHS.TENANT, '/rentee');
});

test('legacy portal URLs resolve to the single tenant portal tree', () => {
  assert.equal(resolveLegacyTenantPath('/portal'), '/rentee');
  assert.equal(resolveLegacyTenantPath('/portal/'), '/rentee');
  assert.equal(resolveLegacyTenantPath('/portal/profile'), '/rentee/profile');
  assert.equal(resolveLegacyTenantPath('/portal/invoices'), '/rentee/invoices');
  assert.equal(resolveLegacyTenantPath('/portal/maintenance/abc'), '/rentee/maintenance/abc');
});

test('legacy admin URLs resolve to dashboard equivalents', () => {
  assert.equal(resolveLegacyAdminPath('/admin'), '/dashboard');
  assert.equal(resolveLegacyAdminPath('/admin/'), '/dashboard');
  assert.equal(resolveLegacyAdminPath('/admin/users'), '/dashboard/team');
  assert.equal(resolveLegacyAdminPath('/admin/users/member-1'), '/dashboard/team/member-1');
  assert.equal(resolveLegacyAdminPath('/admin/settings'), '/dashboard/settings');
  assert.equal(resolveLegacyAdminPath('/admin/rentees/tenant-1'), '/dashboard/rentees/tenant-1');
  assert.equal(resolveLegacyAdminPath('/admin/agreements'), '/dashboard/agreements');
  assert.equal(resolveLegacyAdminPath('/admin/invoices/generate'), '/dashboard/invoices/generate');
});

test('unknown legacy admin destinations default to the workspace dashboard', () => {
  assert.equal(resolveLegacyAdminPath('/admin/old-tool'), '/dashboard');
  assert.equal(resolveLegacyAdminPath('/not-admin'), '/dashboard');
});
