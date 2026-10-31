import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicSignupChallengeToken } from '../src/api/auth/publicSignupChallenge.js';
import { consumeSeekerVerificationFragment } from '../src/utils/seekerVerificationFragment.js';

const routes = readFileSync(new URL('../src/routes.jsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/pages/VerifySeekerEmail.jsx', import.meta.url), 'utf8');
const env = readFileSync(new URL('../src/utils/env.js', import.meta.url), 'utf8');

const fixture = ({ hash = '', search = '' } = {}) => {
  const events = [];
  const location = { pathname: '/verify-email', hash, search };
  const history = {
    state: { existing: 'unrelated' },
    replaceState: (state, title, url) => events.push({ state, title, url })
  };
  return { events, location, history };
};

test('S3c consumes valid 256-bit URL fragment and immediately scrubs history', () => {
  const { token } = createPublicSignupChallengeToken();
  const context = fixture({ hash: '#token=' + token, search: '?legacy=1' });
  const decoded = consumeSeekerVerificationFragment(context);
  assert.equal(decoded, token);
  assert.deepEqual(context.events, [{
    state: { existing: 'unrelated' },
    title: '',
    url: '/verify-email'
  }]);
});

test('invalid and attacker-supplied fragments never produce a usable token', () => {
  const { token } = createPublicSignupChallengeToken();
  for (const hash of [
    '#token=short',
    '#token=' + token + '&role=admin',
    '#token=' + token + '#extra',
    '#token=%61' + token.slice(1),
    '#access_token=' + token,
    '#token=' + '<script>',
    '#token=' + token.slice(0, 20)
  ]) {
    const context = fixture({ hash });
    assert.equal(consumeSeekerVerificationFragment(context), null);
    assert.deepEqual(context.events.map(e => e.url), ['/verify-email']);
  }
});

test('failed browser-history scrub must refuse redemption', () => {
  const { token } = createPublicSignupChallengeToken();
  const location = { pathname: '/verify-email', hash: '#token=' + token, search: '' };
  assert.equal(consumeSeekerVerificationFragment({ location, history: null }), null);
  assert.equal(consumeSeekerVerificationFragment({
    location,
    history: { replaceState() { throw new Error('browser denied scrub'); } }
  }), null);
  assert.equal(consumeSeekerVerificationFragment({
    location: { ...location, pathname: '/dashboard' },
    history: { replaceState() { throw new Error('should not run'); } }
  }), null);
});

test('S3c UI routes are connected but screens remain disabled unless explicitly enabled', () => {
  assert.match(env, /isPublicSignupUiEnabled = \(\) => getEnvVar\('VITE_PUBLIC_SIGNUP_UI_ENABLED'\) === 'true'/);
  assert.match(page, /const permitted = isPublicSignupUiEnabled\(\);/);
  assert.match(routes, /path: 'verify-email', element: <VerifySeekerEmail \/>/);
  assert.match(routes, /path: 'seeker-sign-up', element: <PublicRoute><SeekerSignUp \/><\/PublicRoute>/);
});

test('S3c forms post only to same-origin API; no browser session or tenant claim', () => {
  assert.match(page, /fetch\('\/api\/public-signup\/redeem'/);
  assert.match(page, /credentials: 'omit'/);
  assert.match(page, /cache: 'no-store'/);
  assert.match(page, /referrerPolicy: 'no-referrer'/);
  assert.match(page, /redirect: 'error'/);
  assert.match(page, /body: JSON\.stringify\(\{ token, password,/);
  assert.match(page, /ownerSetupPath\(enquirySearch\)\?\{ownerCountry:/);
  assert.match(page, /role !== 'authenticated'/);
  assert.match(page, /user_type !== 'seeker'/);
  assert.doesNotMatch(page, /saveStoredSession|localStorage|sessionStorage|Authorization|x-tenant-id/);
  assert.doesNotMatch(page, /console\.(log|info|warn|error)/);
});

test('unmounted seeker page still compiles as JSX before it is ever activated', async () => {
  const { transformWithEsbuild } = await import('vite');
  const transformed = await transformWithEsbuild(
    page, 'src/pages/VerifySeekerEmail.jsx', { loader: 'jsx', jsx: 'automatic' }
  );
  assert.match(transformed.code, /VerifySeekerEmail/);
});
