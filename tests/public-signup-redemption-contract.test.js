import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicSignupChallengeToken } from '../src/api/auth/publicSignupChallenge.js';
import {isValidPublicSignupPassword} from '../src/utils/publicSignupPasswordPolicy.js';
import {createPasswordCredential,verifyPasswordCredential} from '../src/api/auth/index.js';
import { redeemPublicSignupChallenge } from '../src/api/auth/publicSignupRedemption.js';

const service = readFileSync(
  new URL('../src/api/auth/publicSignupRedemption.js', import.meta.url), 'utf8'
);
const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const identity = readFileSync(new URL('../src/api/auth/index.js', import.meta.url), 'utf8');

test('global signup cannot redeem invalid tokens, including empty and malformed input', async () => {
  for (const token of [null, undefined, '', 'short', 'bad/+/token']) {
    await assert.rejects(
      redeemPublicSignupChallenge({ token, password: 'A sufficiently long password' }),
      e => e.status === 400 && e.code === 'SIGNUP_VERIFICATION_UNAVAILABLE'
    );
  }
});

test('global signup requires bounded password length prior to DB transaction', async () => {
  const { token } = createPublicSignupChallengeToken();
  for (const password of [null, '', 'short', 'x'.repeat(7), 'x'.repeat(257)]) {
    await assert.rejects(
      redeemPublicSignupChallenge({ token, password }),
      e => e.status === 400 && e.code === 'SIGNUP_PASSWORD_INVALID'
    );
  }
});

test('redeem transaction enforces tenantless seeker and existing-account denial', () => {
  assert.match(service, /transaction\.begin\(sql\.ISOLATION_LEVEL\.SERIALIZABLE\)/);
  assert.match(service, /WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /FROM dbo\.app_users WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /FROM dbo\.auth_users WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(service, /if \(appUserMatches\.recordset\?\.length \|\| authMatches\.recordset\?\.length\)/);
  assert.match(service, /NULL, @authId, @email, @name,\s*N'authenticated', N'seeker'/);
  assert.match(service, /INSERT INTO dbo\.auth_users/);
  assert.match(service, /consumed_at = SYSUTCDATETIME\(\)/);
  assert.match(service, /!challenge\.sent_at/);
  assert.match(service, /await transaction\.commit\(\)/);
  assert.match(service, /await transaction\.rollback\(\)/);
  assert.doesNotMatch(service, /INSERT INTO dbo\.tenant_memberships/i);
  assert.doesNotMatch(service, /INSERT INTO dbo\.tenants/i);
  assert.doesNotMatch(service, /console\.(?:log|info|error|warn)/);
});

test('redemption is isolated in the dedicated default-off signup route, never legacy credentials', () => {
  assert.doesNotMatch(server, /createPublicSignupRouter|redeemPublicSignupChallenge/);
  assert.match(server, /createPublicSignupRuntime/);
  assert.match(server, /app\.use\('\/api\/public-signup', createPublicSignupRuntime\(\)\)/);
  assert.doesNotMatch(identity, /signup-challenges|public-signup\/redeem/);
});


test('owner-selected eight-character policy accepts 8 and 11 and uses the normal credential verifier',async()=>{
  assert.equal(isValidPublicSignupPassword('x'.repeat(7)),false);
  for(const length of [8,11,12,256])assert.equal(isValidPublicSignupPassword('x'.repeat(length)),true);
  assert.equal(isValidPublicSignupPassword('x'.repeat(257)),false);
  const credential=await createPasswordCredential('Bird8!xx');
  assert.equal(await verifyPasswordCredential(credential,'Bird8!xx'),true);
  assert.equal(await verifyPasswordCredential(credential,'not-the-same'),false);
});
