import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { rejectPublicSignupForExistingAppUser } from '../src/api/auth/publicSignupPolicy.js';

const platformRouterSource = readFileSync(
  new URL('../src/api/platform/router.js', import.meta.url),
  'utf8'
);
const serverSource = readFileSync(
  new URL('../server.js', import.meta.url),
  'utf8'
);

test('a new email with no preexisting app user can advance to registration', () => {
  assert.equal(rejectPublicSignupForExistingAppUser(null), undefined);
  assert.equal(rejectPublicSignupForExistingAppUser(undefined), undefined);
});

test('public registration rejects an existing unclaimed renter identity', () => {
  assert.throws(
    () => rejectPublicSignupForExistingAppUser({ id: 'renter-1', auth_id: null }),
    (error) => error.status === 409 && error.code === 'INVITATION_REQUIRED'
  );
});

test('public registration rejects a previously claimed identity without overwriting credentials', () => {
  assert.throws(
    () => rejectPublicSignupForExistingAppUser({ id: 'renter-1', auth_id: 'auth-1' }),
    (error) => error.status === 409 && error.code === 'ACCOUNT_ALREADY_EXISTS'
  );
});

test('the shared account helper rechecks ownership, and public signup cannot opt out', () => {
  assert.match(platformRouterSource, /const ensureAuthRecord = async \(\{[^\n]+allowExistingAppUser = false/);
  const helper = platformRouterSource.split('const ensureAuthRecord = async')[1]?.split('const coerceFilter')[0] || '';
  assert.match(helper, /let appUser = await findAppUserByEmail\(normalizedEmail\)/);
  assert.match(helper, /if \(!allowExistingAppUser\)\s*\{\s*rejectPublicSignupForExistingAppUser\(appUser\);\s*\}/);
  assert.ok(helper.indexOf('rejectPublicSignupForExistingAppUser(appUser)') < helper.indexOf('updateAppUser(appUser.id'));
  assert.ok(helper.indexOf('rejectPublicSignupForExistingAppUser(appUser)') < helper.indexOf('createAuthRecord({'));

  const signupHandler = platformRouterSource.split("router.post('/auth/sign-up'")[1]?.split("router.post('/auth/sign-in'")[0] || '';
  assert.match(signupHandler, /ensureAuthRecord\(\{ email, password, role: 'rentee', metadata: safeMetadata \}\)/);
  assert.doesNotMatch(signupHandler, /allowExistingAppUser\s*:/);
});

test('the existing secure-invitation guard stays mounted before the legacy platform router', () => {
  assert.match(
    serverSource,
    /app\.use\('\/api\/platform\/auth', createInvitationRouter\(\)\);[\s\S]*?app\.use\('\/api\/platform', createPlatformRouter\(\)\);/
  );
});

test('legacy administrative invitation remains an explicitly separate, non-public compatibility path', () => {
  const handler = platformRouterSource.split("router.post('/auth/invite'")[1]?.split("router.get('/storage/buckets'")[0] || '';
  assert.match(handler, /requireAuthenticated, requireAdmin/);
  assert.match(handler, /allowExistingAppUser: true/);
});
