import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  createTenantContextMiddleware,
  tenantContextInternals
} from '../src/api/tenant/context.js';

const platformSource = readFileSync(
  new URL('../src/api/platform/router.js', import.meta.url),
  'utf8'
);
const { selectActiveMembership } = tenantContextInternals;

const membership = (tenantId, role = 'rentee') => ({
  tenant_id: tenantId,
  role,
  status: 'active',
  is_default: true,
  tenant: { id: tenantId, name: 'Example' }
});

const callGuard = async ({ user, tenantId }) => {
  const req = {
    method: 'POST',
    tenantContext: {
      user: user || null,
      tenantId: tenantId || null,
      memberships: [],
      membership: null,
      resolution: 'none'
    }
  };
  const response = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; }
  };
  let nextCalls = 0;
  const guard = createTenantContextMiddleware({ requireUser: true, requireTenant: true });
  await guard(req, response, () => { nextCalls += 1; });
  return { response, nextCalls };
};

test('global account with no organization membership resolves to no tenant, even if global role is admin', () => {
  const context = selectActiveMembership({
    requestedTenantId: null,
    memberships: [],
    user: { id: 'seeker-user', role: 'admin', tenant_id: null }
  });
  assert.equal(context.tenantId, null);
  assert.equal(context.membership, null);
  assert.equal(context.resolution, 'none');
});

test('global seeker cannot select a foreign organization by request header', () => {
  assert.throws(
    () => selectActiveMembership({
      requestedTenantId: 'some-foreign-tenant',
      memberships: [],
      user: { id: 'seeker-user', role: 'admin', tenant_id: null }
    }),
    (error) => error.status === 403 && error.code === 'TENANT_NOT_RESOLVED'
  );
});

test('an authorized member resolves only the organization actually joined', () => {
  const selected = selectActiveMembership({
    requestedTenantId: 'TENANT-A',
    memberships: [membership('tenant-a')],
    user: { id: 'shared-user', role: 'authenticated', tenant_id: null }
  });
  assert.equal(selected.tenantId, 'tenant-a');
  assert.equal(selected.membership.role, 'rentee');
  assert.throws(
    () => selectActiveMembership({
      requestedTenantId: 'tenant-b',
      memberships: [membership('tenant-a')],
      user: { id: 'shared-user', tenant_id: null }
    }),
    (error) => error.status === 403 && error.code === 'TENANT_ACCESS_DENIED'
  );
});

test('global authenticated seeker cannot access tenant-required middleware', async () => {
  const { response, nextCalls } = await callGuard({
    user: { id: 'global-seeker', role: 'admin', tenant_id: null },
    tenantId: null
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'TENANT_CONTEXT_REQUIRED');
  assert.equal(nextCalls, 0);
});

test('anonymous user never gains access from a requested tenant id', async () => {
  const { response, nextCalls } = await callGuard({
    user: null,
    tenantId: 'tenant-a'
  });
  assert.equal(response.statusCode, 401);
  assert.equal(response.body.code, 'AUTH_CONTEXT_REQUIRED');
  assert.equal(nextCalls, 0);
});

test('authenticated tenant context proceeds through tenant-required middleware', async () => {
  const { response, nextCalls } = await callGuard({
    user: { id: 'member-1', role: 'rentee', tenant_id: 'tenant-a' },
    tenantId: 'tenant-a'
  });
  assert.equal(response.statusCode, 200);
  assert.equal(nextCalls, 1);
});

test('all generic business and storage endpoints require tenant context', () => {
  assert.match(
    platformSource,
    /const requireBusinessTenant = createTenantContextMiddleware\(\{ requireUser: true, requireTenant: true \}\)/
  );
  for (const route of [
    "post('/query'",
    "post('/rpc/:name'",
    "get('/storage/buckets'",
    "post('/storage/buckets'",
    "delete('/storage/buckets/:bucket'",
    "get('/storage/list'",
    "post('/storage/upload'",
    "delete('/storage/objects'"
  ]) {
    assert.ok(platformSource.includes(`router.${route}, requireBusinessTenant`), `Missing tenant scope for ${route}`);
  }
  assert.match(platformSource, /router\.post\('\/auth\/invite', requireAuthenticated, requireAdmin, requireBusinessTenant,/);
});

test('public credential and authenticated account-context routes remain independent of tenant membership', () => {
  assert.match(platformSource, /router\.get\('\/auth\/context', createTenantContextMiddleware\(\{ requireUser: true \}\)/);
  assert.match(platformSource, /router\.post\('\/auth\/update-user', requireAuthenticated,/);
  assert.match(platformSource, /router\.post\('\/auth\/sign-up', async/);
  assert.match(platformSource, /router\.post\('\/auth\/sign-in', async/);
});
