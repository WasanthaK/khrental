import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDefaultLandingPath, getPermissions } from '../src/utils/accessPolicy.js';
import {
  isVerifiedTenantlessSeeker, getVerifiedSeekerLandingPath
} from '../src/utils/seekerLandingPolicy.js';

const routes = readFileSync(new URL('../src/routes.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/SeekerHome.jsx', import.meta.url), 'utf8');
const base = () => ({
  user: {
    id: 'seeker-global-1', role: 'authenticated', user_type: 'seeker',
    tenant_id: null
  },
  membership: null,
  memberships: [],
  tenantContextVerified: true
});

test('only resolved, no-tenant verified global seeker receives a separate landing path', () => {
  const context = base();
  assert.equal(isVerifiedTenantlessSeeker(context), true);
  assert.equal(getVerifiedSeekerLandingPath(context), '/seeker');
  assert.equal(getPermissions({ user: context.user, membership: null }).size, 0);
  assert.equal(getDefaultLandingPath({ user: context.user, membership: null }), '/unauthorized',
    'legacy redirect stays unchanged until integrated behind release gates');
  assert.equal(isVerifiedTenantlessSeeker({
    ...context, user: { ...context.user, user_type: undefined, userType: 'seeker' }
  }), true, 'explicitly supported identity field alias');
});

test('missing or stale membership context never counts as verified zero memberships', () => {
  const context = base();
  for (const altered of [
    { tenantContextVerified: false },
    { tenantContextVerified: undefined },
    { membership: undefined },
    { membership: { tenant_id: 'tenant-a', role: 'rentee' } },
    { memberships: undefined },
    { memberships: null },
    { memberships: [{ tenant_id: 'tenant-a', role: 'rentee', status: 'active' }] },
    { memberships: [{ tenant_id: 'tenant-old', role: 'rentee', status: 'revoked' }] },
    { user: null },
    { user: { role: 'authenticated', user_type: 'seeker' } },
    { user: { ...context.user, tenant_id: 'demo-tenant' } },
    { user: { ...context.user, tenantId: 'tenant-a' } },
    { user: { ...context.user, activeTenantId: 'tenant-a' } },
    { user: { ...context.user, membership: { role: 'rentee' } } }
  ]) {
    const input = { ...context, ...altered };
    assert.equal(isVerifiedTenantlessSeeker(input), false, JSON.stringify(altered));
    assert.equal(getVerifiedSeekerLandingPath(input), null);
  }
});

test('global user role, unlinked test renter and platform admin never become seeker authority', () => {
  const context = base();
  for (const role of ['admin', 'global_admin', 'staff', 'rentee', 'tenant', 'seeker', '']) {
    assert.equal(isVerifiedTenantlessSeeker({
      ...context, user: { ...context.user, role }
    }), false, role);
  }
  for (const user_type of ['admin', 'service_user', 'rentee', 'staff', 'tenant', null]) {
    assert.equal(isVerifiedTenantlessSeeker({
      ...context, user: { ...context.user, user_type }
    }), false, String(user_type));
  }
});

test('seeker UI remains standalone with no tenant APIs, billing operations or links', async () => {
  assert.match(page, /isVerifiedTenantlessSeeker/);
  assert.match(page, /if \(!allowed\)/);
  assert.match(page, /Your seeker account/);
  assert.match(page, /not currently linked to any rental organization/);
  assert.doesNotMatch(page, /fetch\(|requestMssqlApi|platformClient|localStorage|sessionStorage/);
  assert.doesNotMatch(page, /href="\/dashboard|href="\/rentee|\/api\/platform\/query|stripe/i);
  assert.doesNotMatch(routes, /import SeekerHome/);
  assert.doesNotMatch(routes, /path: 'seeker'/);
  const { transformWithEsbuild } = await import('vite');
  const result = await transformWithEsbuild(
    page, 'src/pages/SeekerHome.jsx', { loader: 'jsx', jsx: 'automatic' }
  );
  assert.match(result.code, /SeekerHome/);
});
