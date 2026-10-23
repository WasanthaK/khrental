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

test('any revoked or inactive membership history prevents legacy tenant restoration', () => {
  const result = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: false
  });
  assert.equal(result.tenantId, null);
  assert.equal(result.membership, null);
  assert.equal(result.resolution, 'none');
});

test('requesting revoked tenant id explicitly fails closed', () => {
  assert.throws(
    () => selectActiveMembership({
      requestedTenantId: 'tenant-old',
      memberships: [],
      user: legacyUser,
      allowLegacyTenantFallback: false
    }),
    (error) => error.status === 403 && error.code === 'TENANT_NOT_RESOLVED'
  );
});

test('pre-membership legacy account may retain its matching tenant temporarily', () => {
  const result = selectActiveMembership({
    requestedTenantId: 'TENANT-OLD',
    memberships: [],
    user: legacyUser,
    allowLegacyTenantFallback: true
  });
  assert.equal(result.resolution, 'legacy-user-tenant');
  assert.equal(result.membership, null);
  assert.equal(result.tenantId, 'TENANT-OLD');

  assert.throws(
    () => selectActiveMembership({
      requestedTenantId: 'tenant-foreign',
      memberships: [],
      user: legacyUser,
      allowLegacyTenantFallback: true
    }),
    (error) => error.status === 403 && error.code === 'TENANT_NOT_RESOLVED'
  );
});

test('default resolver denies undocumented legacy fallback unless caller supplies evidence', () => {
  const result = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: legacyUser
  });
  assert.equal(result.tenantId, null);
  assert.equal(result.resolution, 'none');
});

test('real currently-active membership remains authoritative for tenant selection', () => {
  const result = selectActiveMembership({
    requestedTenantId: 'tenant-live',
    memberships: [{
      id: 'membership-1', tenant_id: 'tenant-live', role: 'rentee',
      status: 'active', is_default: true, tenant: { id: 'tenant-live', status: 'active' }
    }],
    user: legacyUser,
    allowLegacyTenantFallback: false
  });
  assert.equal(result.tenantId, 'tenant-live');
  assert.equal(result.resolution, 'requested');
});

test('revocation evidence query reads every membership status and is applied by resolver', () => {
  assert.match(source, /const hasRecordedTenantMembership = async \(appUserId\) =>/);
  assert.match(source, /SELECT TOP 1 id FROM tenant_memberships WHERE app_user_id = @appUserId/);
  assert.doesNotMatch(
    source.split('const hasRecordedTenantMembership = async')[1]?.split('const listAssignedPropertyIdsForUser')[0] || '',
    /tm\.status = 'active'/
  );
  assert.match(source, /&& !\(await hasRecordedTenantMembership\(resolvedUser\.id\)\)/);
  assert.match(source, /selectActiveMembership\(\{ requestedTenantId, memberships, user, allowLegacyTenantFallback \}\)/);
});
