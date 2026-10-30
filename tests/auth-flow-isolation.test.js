import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAuthFlowIsolatedPath } from '../src/services/requestContext.js';

const requestContextSource = readFileSync(new URL('../src/services/requestContext.js', import.meta.url), 'utf8');
const rootLayoutSource = readFileSync(new URL('../src/components/layouts/RootLayout.jsx', import.meta.url), 'utf8');
const welcomeGuideSource = readFileSync(new URL('../src/components/WelcomeGuide.jsx', import.meta.url), 'utf8');
const acceptInviteSource = readFileSync(new URL('../src/pages/AcceptInvite.jsx', import.meta.url), 'utf8');

test('credential bootstrap and recovery routes are explicitly isolated from the authenticated app shell', () => {
  for (const path of ['/reset-password', '/accept-invite', '/seeker', '/seeker-sign-up', '/verify-email', '/enquire', '/rental-journey']) {
    assert.equal(isAuthFlowIsolatedPath(path), true, path);
  }
  assert.match(rootLayoutSource, /isAuthFlowIsolatedPath\(location\.pathname\)/);
  assert.match(rootLayoutSource, /if \(isAuthFlowIsolated\) \{\s*return <Outlet \/>;\s*\}/);
  assert.match(rootLayoutSource, /if \(isAuthFlowIsolated \|\| loading\) return;/);
  assert.match(requestContextSource, /'\/seeker-sign-up', '\/verify-email'/);
});

test('rental journey isolation covers normalized paths without isolating management routes', () => {
  assert.equal(isAuthFlowIsolatedPath('/rental-journey/?page=2'), true);
  for (const path of ['/dashboard', '/dashboard/enquiries', '/rentee', '/rental-journey-admin', '/rental-journey/details']) {
    assert.equal(isAuthFlowIsolatedPath(path), false, path);
  }
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
