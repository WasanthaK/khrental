import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const requestContextSource = readFileSync(new URL('../src/services/requestContext.js', import.meta.url), 'utf8');
const rootLayoutSource = readFileSync(new URL('../src/components/layouts/RootLayout.jsx', import.meta.url), 'utf8');
const welcomeGuideSource = readFileSync(new URL('../src/components/WelcomeGuide.jsx', import.meta.url), 'utf8');
const acceptInviteSource = readFileSync(new URL('../src/pages/AcceptInvite.jsx', import.meta.url), 'utf8');

test('credential bootstrap and recovery routes are explicitly isolated from the authenticated app shell', () => {
  assert.match(requestContextSource, /AUTH_FLOW_ISOLATED_PATHS = new Set\(\['\/reset-password', '\/accept-invite'\]\)/);
  assert.match(rootLayoutSource, /isAuthFlowIsolatedPath\(location\.pathname\)/);
  assert.match(rootLayoutSource, /if \(isAuthFlowIsolated\) \{\s*return <Outlet \/>;\s*\}/);
  assert.match(rootLayoutSource, /if \(isAuthFlowIsolated \|\| loading\) return;/);
});

test('legacy authenticated onboarding does not infer invitation state from URL tokens', () => {
  assert.doesNotMatch(welcomeGuideSource, /URLSearchParams|inviteToken|location\.search/);
  assert.match(welcomeGuideSource, /force_password_change/);
  assert.match(welcomeGuideSource, /if \(!user\) \{[\s\S]*setIsOpen\(false\)/);
});

test('secure invitation redemption remains the sole owner of invited credential establishment', () => {
  assert.match(acceptInviteSource, /\/api\/platform\/auth\/invitations\/redeem/);
  assert.match(acceptInviteSource, /password,/);
  assert.match(acceptInviteSource, /establishSession: !preserveSession/);
  assert.match(acceptInviteSource, /saveStoredSession\(redeemedSession\)/);
  assert.doesNotMatch(acceptInviteSource, /update-user/);
});

test('invitation route isolation does not erase the existing-session preservation safety rule', () => {
  assert.match(acceptInviteSource, /hasServerValidatedDifferentSession/);
  assert.match(acceptInviteSource, /\/api\/platform\/auth\/context/);
  assert.match(acceptInviteSource, /Your existing signed-in account was kept active in this browser/);
});
