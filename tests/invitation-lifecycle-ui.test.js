import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendInvitationEmail } from '../src/services/invitationEmailService.js';
import {
  getInvitationActionLabel,
  isRegisteredInvitationStatus,
  shouldPollInvitationStatus
} from '../src/utils/invitationLifecycle.js';

const hookSource = readFileSync(new URL('../src/hooks/useInvitationStatus.js', import.meta.url), 'utf8');
const statusServiceSource = readFileSync(new URL('../src/services/invitationStatusService.js', import.meta.url), 'utf8');
const invitationEmailSource = readFileSync(new URL('../src/services/invitationEmailService.js', import.meta.url), 'utf8');
const inviteButtonSource = readFileSync(new URL('../src/components/common/InviteUserButton.jsx', import.meta.url), 'utf8');
const teamCardSource = readFileSync(new URL('../src/components/team/TeamMemberCard.jsx', import.meta.url), 'utf8');
const renteeCardSource = readFileSync(new URL('../src/components/rentees/RenteeCard.jsx', import.meta.url), 'utf8');
const renteeDetailsSource = readFileSync(new URL('../src/pages/RenteeDetails.jsx', import.meta.url), 'utf8');
const acceptInviteSource = readFileSync(new URL('../src/pages/AcceptInvite.jsx', import.meta.url), 'utf8');
const invitationRouterSource = readFileSync(new URL('../src/api/auth/invitationRouter.js', import.meta.url), 'utf8');
const badgeSource = readFileSync(new URL('../src/components/common/InvitationStatusBadge.jsx', import.meta.url), 'utf8');
const routesSource = readFileSync(new URL('../src/routes.jsx', import.meta.url), 'utf8');

test('invitation action labels follow canonical lifecycle state', () => {
  assert.equal(getInvitationActionLabel('not_invited'), 'Send Invitation');
  assert.equal(getInvitationActionLabel('unknown'), 'Send Invitation');
  assert.equal(getInvitationActionLabel('pending'), 'Resend Invitation');
  assert.equal(getInvitationActionLabel('expired'), 'Resend Invitation');
  assert.equal(getInvitationActionLabel('revoked'), 'Resend Invitation');
  assert.equal(getInvitationActionLabel('registered'), null);
  assert.equal(isRegisteredInvitationStatus('REGISTERED'), true);
  assert.equal(shouldPollInvitationStatus('pending'), true);
  assert.equal(shouldPollInvitationStatus('registered'), false);
});

test('pending invitation status refresh is canonical, no-cache and event driven', () => {
  assert.match(hookSource, /checkCanonicalInvitationStatus/);
  assert.doesNotMatch(hookSource, /appUserService|checkAppUserInvitationStatus/);
  assert.match(hookSource, /visibilitychange/);
  assert.match(hookSource, /addEventListener\('focus'/);
  assert.match(hookSource, /setInterval/);
  assert.match(hookSource, /shouldPollInvitationStatus\(status\)/);
  assert.match(statusServiceSource, /cache: 'no-store'/);
  assert.match(statusServiceSource, /'Cache-Control': 'no-cache'/);
  assert.doesNotMatch(statusServiceSource, /console\./);
});

test('invitation-specific email client uses only the observable server path', async () => {
  assert.doesNotMatch(invitationEmailSource, /directEmailService|EmailJS|console\./);
  assert.match(invitationEmailSource, /\/api\/send-email/);
  assert.match(invitationEmailSource, /'x-request-id'/);

  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedOptions;

  globalThis.fetch = async (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => name.toLowerCase() === 'content-type' ? 'application/json' : null },
      json: async () => ({
        success: true,
        provider: 'twilio-sendgrid',
        providerStatus: 202,
        providerMessageId: 'provider-message-1',
        requestId: 'server-request-1'
      })
    };
  };

  try {
    const result = await sendInvitationEmail({
      to: 'private@example.com',
      subject: 'Private Invitation',
      html: '<p>private token link</p>'
    });

    assert.equal(capturedUrl, '/api/send-email');
    assert.equal(capturedOptions.method, 'POST');
    assert.ok(capturedOptions.headers['x-request-id']);
    assert.equal(result.success, true);
    assert.equal(result.providerMessageId, 'provider-message-1');
    assert.equal(result.requestId, 'server-request-1');
    assert.equal(Object.hasOwn(result, 'to'), false);
    assert.equal(Object.hasOwn(result, 'subject'), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('invite button stays on secure invitation service and does not refetch user details', () => {
  assert.doesNotMatch(inviteButtonSource, /fetchAppUser|appUserService/);
  assert.match(inviteButtonSource, /resendInvitation\(userId, false\)/);
  assert.match(inviteButtonSource, /getInvitationActionLabel/);
  assert.match(inviteButtonSource, /Invitation accepted by SendGrid for delivery/);
});

test('team and tenant cards render one canonical invitation lifecycle', () => {
  assert.doesNotMatch(teamCardSource, /console\./);
  assert.match(teamCardSource, /invitationStatus=\{status\}/);
  assert.match(teamCardSource, /Invitation created:/);
  assert.match(teamCardSource, /Expires/);

  assert.match(renteeCardSource, /Tenant added:/);
  assert.doesNotMatch(renteeCardSource, /Registered:/);
  assert.match(renteeCardSource, /Invitation accepted:/);
  assert.match(renteeCardSource, /invitationStatus=\{status\}/);
});

test('renter details and badge cannot suppress or replace canonical status', () => {
  assert.match(renteeDetailsSource, /useInvitationStatus\([^\n]*id\)/);
  assert.match(renteeDetailsSource, /<InvitationStatusBadge status=\{invitationStatus\.status\}/);
  assert.doesNotMatch(badgeSource, /checkUserAuthStatus|userManagement|useEffect/);
  assert.match(badgeSource, /registered: 'Registered'/);
  assert.match(badgeSource, /pending: 'Invitation Pending'/);
});

test('secure invitation redemption is not swallowed by an existing authenticated browser session', () => {
  assert.match(routesSource, /path: 'accept-invite', element: <AcceptInvite \/>/);
  assert.doesNotMatch(routesSource, /path: 'accept-invite', element: <PublicRoute><AcceptInvite \/><\/PublicRoute>/);
});

test('secure invitation redemption preserves only a server-valid different browser session', () => {
  assert.match(acceptInviteSource, /platformClient\.auth\.getSession\(\)/);
  assert.match(acceptInviteSource, /hasServerValidatedDifferentSession\(existingSession, invitation\.email\)/);
  assert.match(acceptInviteSource, /\/api\/platform\/auth\/context/);
  assert.match(acceptInviteSource, /Authorization: `Bearer \$\{session\.access_token\}`/);
  assert.match(acceptInviteSource, /establishSession: !preserveSession/);
  assert.match(acceptInviteSource, /if \(preserveSession\) \{[\s\S]*setPreservedExistingSession\(true\);[\s\S]*setSuccess\(true\);[\s\S]*return;/);

  const preserveBlock = acceptInviteSource.match(/if \(preserveSession\) \{[\s\S]*?\n      \}/)?.[0] || '';
  assert.doesNotMatch(preserveBlock, /saveStoredSession|clearActiveTenantId/);
  assert.match(acceptInviteSource, /Your existing signed-in account was kept active in this browser/);
});

test('fresh or stale-session invitation redemption adopts the server-issued session without a second password login', () => {
  assert.doesNotMatch(acceptInviteSource, /signInWithPassword/);
  assert.match(acceptInviteSource, /redeemedSession = redeemPayload\?\.data\?\.session/);
  assert.match(acceptInviteSource, /clearActiveTenantId\(\)/);
  assert.match(acceptInviteSource, /saveStoredSession\(redeemedSession\)/);
  assert.match(acceptInviteSource, /window\.location\.assign\(getRoleRedirect\(role\)\)/);

  assert.match(invitationRouterSource, /verifyPasswordCredential\(record, password\)/);
  assert.match(invitationRouterSource, /updateAuthRecord\(record, \{ password \}\)/);
  assert.match(invitationRouterSource, /issueAuthSession\(record\)/);
  assert.match(invitationRouterSource, /setStorageSessionCookie\(res, session\)/);
  assert.match(invitationRouterSource, /session,/);
});
