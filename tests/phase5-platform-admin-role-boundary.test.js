import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { createTenantRoleBoundaryRouter } from '../src/api/mssql/tenantRoleBoundaryRouter.js';
import { readFileSync } from 'node:fs';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');

const requestRouter = async ({ method, path, body }) => {
  const app = express();
  app.use(express.json());
  app.use(createTenantRoleBoundaryRouter());
  app.use((_req, res) => res.status(200).json({ allowed: true }));
  const server = createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    return { status: response.status, payload: await response.json() };
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
};

test('Phase 5: tenant-scoped legacy app-user writes cannot appoint platform administrators', async () => {
  for (const path of ['/app-users', '/app-users/example']) {
    for (const field of ['role', 'user_type', 'userType']) {
      for (const value of ['admin', ' ADMIN ']) {
        const result = await requestRouter({
          method: path === '/app-users' ? 'POST' : 'PUT',
          path,
          body: { [field]: value }
        });
        assert.equal(result.status, 403);
        assert.equal(result.payload.code, 'PLATFORM_ADMIN_APPOINTMENT_REQUIRED');
      }
    }
  }
});

test('Phase 5: non-admin staff mutations still pass through the role boundary', async () => {
  for (const method of ['POST', 'PUT']) {
    const result = await requestRouter({
      method,
      path: method === 'POST' ? '/app-users' : '/app-users/example',
      body: { role: 'staff', user_type: 'staff', name: 'Employee' }
    });
    assert.equal(result.status, 200);
    assert.equal(result.payload.allowed, true);
  }
});

test('Phase 5: the composite router installs platform and role guards ahead of legacy MSSQL handlers', () => {
  const composite = source('../src/api/mssql/compositeRouter.js');
  const platform = source('../src/api/mssql/platformAdminRouter.js');
  const legacy = source('../src/api/mssql/router.js');
  const order = [
    'router.use(createPlatformAdminRouter())',
    'router.use(createTenantRoleBoundaryRouter())',
    'router.use(createLegacyMssqlRouter())'
  ].map(fragment => composite.indexOf(fragment));
  assert.ok(order.every(index => index >= 0), 'all approved guards and legacy routes must be mounted');
  assert.ok(order[0] < order[1] && order[1] < order[2]);
  assert.match(platform, /router\.use\('\/admin', requireResolvedUser, requirePlatformAdmin\)/);
  assert.match(platform, /router\.post\('\/admin\/app-users'/);
  assert.match(platform, /GENERIC_PLATFORM_USER_CREATION_DISABLED/);
  assert.match(platform, /router\.post\('\/admin\/tenants\/\:tenantId\/memberships'/);
  assert.match(platform, /PLATFORM_MEMBERSHIP_ROLE_RESTRICTED/);
  assert.match(legacy, /router\.use\(requireScopedTenant\)/);
});

test('Phase 5: only platform administrators may appoint tenant admins on platform routes', () => {
  const platform = source('../src/api/mssql/platformAdminRouter.js');
  assert.match(platform, /router\.use\('\/admin', requireResolvedUser, requirePlatformAdmin\)/);
  assert.match(platform, /router\.post\('\/admin\/tenants\/\:tenantId\/administrators'/);
  assert.match(platform, /router\.post\('\/admin\/tenants\/\:tenantId\/administrators\/\:appUserId\/invitations'/);
  assert.match(platform, /TENANT_ADMIN_MEMBERSHIP_NOT_FOUND/);
  assert.match(platform, /normalizeRole\(membership\.role\) !== 'admin'/);
});
