import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tenantContextInternals } from '../src/api/tenant/context.js';

const { selectActiveMembership } = tenantContextInternals;
const source = readFileSync(new URL('../src/api/tenant/context.js', import.meta.url), 'utf8');

const legacyUser = {
  id: 'user-1',
  role: 'admin',
  user_type: 'admin',
  tenant_id: 'tenant-old'
};

test('historical tenant pointer never grants access without an active membership', () => {
  const context = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser
  });
  assert.equal(context.tenantId, null);
  assert.equal(context.membership, null);
  assert.equal(context.resolution, 'none');
});

test('an explicit request for a tenant on a stale historical pointer fails closed', () => {
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [],
    user: legacyUser
  }), (error) => error.status === 403 && error.code === 'TENANT_NOT_RESOLVED');
});

test('legacy fallback cannot be reenabled through stale caller argument', () => {
  const context = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: true
  });
  assert.equal(context.resolution, 'none');
  assert.equal(context.tenantId, null);
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: true
  }), (error) => error.status === 403);
});

test('active membership still grants only its own tenant', () => {
  const context = selectActiveMembership({
    requestedTenantId: 'tenant-live',
    memberships: [{
      id: 'membership-1',
      tenant_id: 'tenant-live',
      role: 'rentee',
      status: 'active',
      is_default: true,
      tenant: { id: 'tenant-live', status: 'active' }
    }],
    user: legacyUser
  });
  assert.equal(context.tenantId, 'tenant-live');
  assert.equal(context.membership.role, 'rentee');
  assert.throws(() => selectActiveMembership({
    requestedTenantId: 'tenant-old',
    memberships: [{
      tenant_id: 'tenant-live', role: 'rentee', status: 'active',
      tenant: { id: 'tenant-live', status: 'active' }
    }],
    user: legacyUser
  }), (error) => error.status === 403 && error.code === 'TENANT_ACCESS_DENIED');
});

test('no legacy-user-tenant resolution or record-history compatibility branch remains', () => {
  assert.doesNotMatch(source, /legacy-user-tenant/);
  assert.doesNotMatch(source, /allowLegacyTenantFallback/);
  assert.doesNotMatch(source, /hasRecordedTenantMembership/);
  assert.match(source, /selectActiveMembership\(\{ requestedTenantId, memberships, user \}\)/);
});
