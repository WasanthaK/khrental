import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchVerifiedSeekerBrowserContext } from '../src/services/seekerContextClient.js';
import { getDefaultLandingPath } from '../src/utils/accessPolicy.js';

const routes = readFileSync(new URL('../src/routes.jsx', import.meta.url), 'utf8');
const boundary = readFileSync(
  new URL('../src/components/auth/VerifiedSeekerBoundary.jsx', import.meta.url), 'utf8'
);
const login = readFileSync(new URL('../src/pages/Login.jsx', import.meta.url), 'utf8');
const root = readFileSync(new URL('../src/components/layouts/RootLayout.jsx', import.meta.url), 'utf8');
const request = readFileSync(new URL('../src/services/requestContext.js', import.meta.url), 'utf8');
const env = readFileSync(new URL('../src/utils/env.js', import.meta.url), 'utf8');
const protectedRoute = readFileSync(
  new URL('../src/components/common/ProtectedRoute.jsx', import.meta.url), 'utf8'
);

const SESSION = Object.freeze({
  access_token: 'synthetic-auth-token',
  user: { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }
});
const CERTIFIED = {
  data: { verified: true, eligible: true, userType: 'seeker', tenantId: null }
};
const supply = ({
  session = SESSION,
  later = session,
  httpStatus = 200,
  payload = CERTIFIED,
  throws = false
} = {}) => {
  const captures = [];
  let reads = 0;
  const getSession = async () => {
    reads++;
    return { data: { session: reads === 1 ? session : later }, error: null };
  };
  const fetchImpl = async (url, options) => {
    captures.push({ url, options });
    if (throws) throw new Error('network offline');
    return {
      ok: httpStatus >= 200 && httpStatus < 300,
      json: async () => payload
    };
  };
  return { captures, getSession, fetchImpl };
};

test('only same-origin explicit bearer certification may open seeker landing', async () => {
  const fixture = supply();
  const r = await fetchVerifiedSeekerBrowserContext({
    expectedAuthId: SESSION.user.id,
    getSession: fixture.getSession,
    fetchImpl: fixture.fetchImpl
  });
  assert.deepEqual(r, { verified: true, eligible: true });
  assert.equal(fixture.captures.length, 1);
  assert.equal(fixture.captures[0].url, '/api/platform/auth/seeker-context');
  assert.deepEqual(fixture.captures[0].options, {
    method: 'GET',
    headers: { Authorization: 'Bearer synthetic-auth-token' },
    credentials: 'omit', cache: 'no-store',
    referrerPolicy: 'no-referrer', redirect: 'error'
  });
});

test('feature readiness or bad server projection fails closed without privilege claim', async () => {
  const bad = [
    { verified: false, eligible: true, userType: 'seeker', tenantId: null },
    { verified: true, eligible: false, userType: 'seeker', tenantId: null },
    { verified: true, eligible: true, userType: 'rentee', tenantId: null },
    { verified: true, eligible: true, userType: 'seeker', tenantId: 'legacy' },
    { verified: 'true', eligible: true, userType: 'seeker', tenantId: null },
    { verified: true, eligible: true, userType: 'seeker' },
    null
  ];
  for (const httpStatus of [401, 403, 404, 429, 500, 503]) {
    const x = supply({ httpStatus });
    assert.deepEqual(await fetchVerifiedSeekerBrowserContext({
      expectedAuthId: SESSION.user.id, ...x
    }), { verified: false, eligible: false });
  }
  for (const projection of bad) {
    const x = supply({ payload: { data: projection } });
    assert.deepEqual(await fetchVerifiedSeekerBrowserContext({
      expectedAuthId: SESSION.user.id,
      getSession: x.getSession, fetchImpl: x.fetchImpl
    }), { verified: false, eligible: false });
  }
  const offline = supply({ throws: true });
  assert.deepEqual(await fetchVerifiedSeekerBrowserContext({
    expectedAuthId: SESSION.user.id, getSession: offline.getSession,
    fetchImpl: offline.fetchImpl
  }), { verified: false, eligible: false });
});

test('missing bearer, wrong active account, and mid-request session changes fail closed', async () => {
  for (const session of [
    null,
    { access_token: '', user: SESSION.user },
    { access_token: SESSION.access_token, user: { id: 'foreign-id' } }
  ]) {
    const x = supply({ session });
    assert.deepEqual(await fetchVerifiedSeekerBrowserContext({
      expectedAuthId: SESSION.user.id,
      getSession: x.getSession, fetchImpl: x.fetchImpl
    }), { verified: false, eligible: false });
    assert.equal(x.captures.length, 0);
  }
  for (const later of [
    null,
    { ...SESSION, access_token: 'replacement' },
    { ...SESSION, user: { id: 'different-user' } }
  ]) {
    const x = supply({ later });
    assert.deepEqual(await fetchVerifiedSeekerBrowserContext({
      expectedAuthId: SESSION.user.id,
      getSession: x.getSession, fetchImpl: x.fetchImpl
    }), { verified: false, eligible: false });
  }
});

test('legacy tenant landing stays unchanged and seeker route is double flagged', async () => {
  assert.equal(getDefaultLandingPath({ user: {
    id: 'seeker-auth', role: 'authenticated', user_type: 'seeker'
  }, membership: null }), '/unauthorized');
  assert.match(env, /VITE_PUBLIC_SEEKER_LANDING_ENABLED'\) === 'true'/);
  assert.match(routes, /path: 'seeker', element: <VerifiedSeekerBoundary \/>/);
  assert.match(routes, /<VerifiedSeekerBoundary redirectOnly \/>/);
  assert.match(routes, /getDefaultLandingPath\(/);
  assert.match(routes, /defaultPath === '\/unauthorized'/);
  assert.match(boundary, /if \(!enabled\) return <Navigate to="\/unauthorized" replace \/>/);
  assert.match(boundary, /fetchVerifiedSeekerBrowserContext\(/);
  assert.match(boundary, /status\.key !== key/);
  assert.match(boundary, /if \(!status\.eligible\) return <Navigate to="\/unauthorized" replace \/>/);
  assert.match(boundary, /isVerifiedTenantlessSeeker\(profile\)/);
  assert.match(boundary, /if \(redirectOnly\) return <Navigate to=\{enquiryReturnPath\(location.search\) \|\| '\/seeker'\} replace \/>/);
  assert.match(login, /if \(proof\.verified && proof\.eligible\)/);
  assert.match(login, /navigate\(enquiryReturnPath\(location.search\) \|\| '\/seeker', \{ replace: true \}\)/);
  // The real hook returns { data }, not an in-scope data variable in Login.
  assert.match(login, /isPublicSeekerLandingEnabled\(\) && result\?\.data\?\.user\?\.id/);
  assert.match(login, /expectedAuthId: result\.data\.user\.id/);
  assert.match(login, /isPublicSignupUiEnabled\(\) &&/);
  assert.match(login, /to="\/seeker-sign-up"/);
  const config = readFileSync(new URL('../scripts/generate-env-config.js', import.meta.url), 'utf8');
  assert.match(config, /'VITE_PUBLIC_SIGNUP_UI_ENABLED'/);
  assert.match(config, /'VITE_PUBLIC_SEEKER_LANDING_ENABLED'/);
  assert.match(request, /AUTH_FLOW_ISOLATED_PATHS.*'\/seeker'/);
  assert.match(root, /if \(isAuthFlowIsolated\) \{\s*return <Outlet \/>;\s*\}/);
  assert.match(protectedRoute, /requiredPermissions/);
  assert.doesNotMatch(boundary, /saveStoredSession|setActiveTenantId|createTenant|stripe/);
  const { transformWithEsbuild } = await import('vite');
  const jsx = await transformWithEsbuild(boundary,
    'src/components/auth/VerifiedSeekerBoundary.jsx',
    { loader: 'jsx', jsx: 'automatic' });
  assert.match(jsx.code, /VerifiedSeekerBoundary/);
});
