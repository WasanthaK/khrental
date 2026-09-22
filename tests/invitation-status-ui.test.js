import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const hookSource = readFileSync(new URL('../src/hooks/useInvitationStatus.js', import.meta.url), 'utf8');
const detailsSource = readFileSync(new URL('../src/pages/RenteeDetails.jsx', import.meta.url), 'utf8');
const inviteButtonSource = readFileSync(new URL('../src/components/common/InviteUserButton.jsx', import.meta.url), 'utf8');
const statusRouterSource = readFileSync(new URL('../src/api/mssql/invitationStatusRouter.js', import.meta.url), 'utf8');

test('invitation status cannot be skipped by details pages', () => {
  assert.doesNotMatch(hookSource, /skipCheck/);
  assert.match(hookSource, /fetchStatus\(\);/);
  assert.match(detailsSource, /useInvitationStatus\(id, true\)/);
});

test('pending invitation state refreshes after external acceptance', () => {
  assert.match(hookSource, /PENDING_REFRESH_INTERVAL_MS = 30000/);
  assert.match(hookSource, /status === 'pending'/);
  assert.match(hookSource, /window\.addEventListener\('focus'/);
  assert.match(hookSource, /document\.addEventListener\('visibilitychange'/);
  assert.match(hookSource, /fetchStatus\(\{ silent: true \}\)/);
});

test('invitation status endpoint disables caching', () => {
  assert.match(statusRouterSource, /Cache-Control', 'no-store, max-age=0/);
  assert.match(statusRouterSource, /Pragma', 'no-cache/);
});

test('shared invite button resolves live state when caller does not provide it', () => {
  assert.match(inviteButtonSource, /useInvitationStatus\(invitationStatus \? null : userId\)/);
  assert.match(inviteButtonSource, /effectiveStatus/);
  assert.match(inviteButtonSource, /Resend Invitation/);
});
