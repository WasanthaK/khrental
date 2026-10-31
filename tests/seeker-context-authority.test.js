import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveVerifiedSeekerContext, resolvePersonalRentalContext } from '../src/api/auth/seekerContext.js';

const routerSource = readFileSync(
  new URL('../src/api/platform/router.js', import.meta.url), 'utf8'
);
const mainServerSource = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

const userId = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const authId = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const fixture = () => ({
  authSession: { record: {
    authId, appUserId: userId, role: 'authenticated',
    metadata: { global_email_verified: true },
    email: 'verified@example.invalid'
  } },
  user: {
    id: userId, auth_id: authId, email: 'verified@example.invalid',
    role: 'authenticated', user_type: 'seeker', tenant_id: null
  },
  tenantContext: {
    tenantId: null, tenant: null, membership: null,
    memberships: [], resolution: 'none', requestedTenantId: null,
    identity: { devBypassRole: null }
  }
});

test('authenticated global seeker requires direct SQL evidence of no historic membership', async () => {
  const calls = [];
  const result = await resolveVerifiedSeekerContext({
    ...fixture(),
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    }
  });
  assert.deepEqual(result, {
    verified: true, eligible: true, userType: 'seeker', tenantId: null
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /FROM dbo\.tenant_memberships\s+WHERE app_user_id = @appUserId/);
  assert.doesNotMatch(calls[0].sql, /status\s*=\s*'active'/i,
    'revoked and inactive memberships must count as preexisting linkage');
  assert.deepEqual(calls[0].params, { appUserId: userId });
});

test('revoked, inactive or unrelated membership rows prevent zero-membership certification', async () => {
  const result = await resolveVerifiedSeekerContext({
    ...fixture(), query: async () => [{ id: 'revoked-association' }]
  });
  assert.deepEqual(result, { verified: true, eligible: false });
});

test('missing schema, SQL timeout and unknown responses fail closed', async () => {
  await assert.rejects(resolveVerifiedSeekerContext({
    ...fixture(), query: async () => { throw new Error('Invalid object name dbo.tenant_memberships'); }
  }), /Invalid object name/);
  await assert.rejects(resolveVerifiedSeekerContext({
    ...fixture(), query: async () => { throw new Error('Transient DB timeout'); }
  }), /Transient DB timeout/);
  assert.deepEqual(await resolveVerifiedSeekerContext({
    ...fixture(), query: async () => null
  }), { verified: false, eligible: false });
});

test('missing or forged bearer/app identity never performs a membership query', async () => {
  const current = fixture();
  const overrides = [
    { authSession: null },
    { authSession: { record: { ...current.authSession.record, appUserId: null } } },
    { authSession: { record: { ...current.authSession.record, appUserId: 'foreign-id' } } },
    { authSession: { record: { ...current.authSession.record, authId: 'foreign-id' } } },
    { authSession: { record: { ...current.authSession.record, email: 'foreign@example.invalid' } } },
    { authSession: { record: { ...current.authSession.record, role: 'admin' } } },
    { authSession: { record: { ...current.authSession.record, metadata: {} } } },
    { authSession: { record: { ...current.authSession.record, metadata: { global_email_verified: 'true' } } } },
    { user: { ...current.user, id: 'foreign-id' } },
    { user: { ...current.user, auth_id: null } },
    { user: { ...current.user, role: 'admin' } },
    { user: { ...current.user, user_type: 'rentee' } },
    { user: { ...current.user, user_type: 'admin' } },
    { user: { ...current.user, tenant_id: 'tenant-a' } },
    { user: { ...current.user, tenantId: 'tenant-a' } },
    { user: { ...current.user, is_dev_bypass: true } },
    { tenantContext: { ...current.tenantContext, tenantId: 'tenant-a' } },
    { tenantContext: { ...current.tenantContext, requestedTenantId: 'tenant-a' } },
    { tenantContext: { ...current.tenantContext, resolution: 'single-membership' } },
    { tenantContext: { ...current.tenantContext, memberships: null } },
    { tenantContext: { ...current.tenantContext, memberships: undefined } },
    { tenantContext: { ...current.tenantContext, membership: { role: 'rentee' } } },
    { tenantContext: { ...current.tenantContext, memberships: [{ role: 'rentee' }] } },
    { tenantContext: { ...current.tenantContext, identity: { devBypassRole: 'admin' } } }
  ];
  for (const override of overrides) {
    let calls = 0;
    const result = await resolveVerifiedSeekerContext({
      ...current, ...override,
      query: async () => { calls += 1; return []; }
    });
    assert.deepEqual(result, { verified: false, eligible: false }, JSON.stringify(override));
    assert.equal(calls, 0, 'unsafe request must not run certification query');
  }
});

test('seeker context endpoint remains read-only, bearer-only, and disabled by default', () => {
  const beginning = routerSource.indexOf("router.get('/auth/seeker-context'");
  const ending = routerSource.indexOf("router.post('/query'", beginning);
  assert.ok(beginning > 0 && ending > beginning);
  const endpoint = routerSource.slice(beginning, ending);
  assert.match(endpoint, /createTenantContextMiddleware\(\{ requireUser: true \}\)/);
  assert.match(endpoint, /PUBLIC_SEEKER_CONTEXT_ENABLED !== 'true'/);
  assert.match(endpoint, /req\.authSession\?\.record\?\.appUserId/);
  assert.match(endpoint, /req\.query\.purpose==='rental'\?resolvePersonalRentalContext:resolveVerifiedSeekerContext/);
  assert.match(endpoint, /res\.status\(401\)/);
  assert.match(endpoint, /res\.status\(503\)/);
  assert.match(endpoint, /Cache-Control', 'no-store, private'/);
  assert.doesNotMatch(endpoint, /\b(?:INSERT|UPDATE|DELETE)\b|\b(?:issueAuthSession|buildSession|createTenant)\s*\(/);
  assert.match(mainServerSource, /app\.use\('\/api', createSessionAuthMiddleware\(\)\)/);
});


test('verified personal rental context admits an organization member without tenant authority', async()=>{
  const current=fixture();current.authSession.sessionId='live-session';current.query=async()=>[{id:userId}];
  for(const role of ['authenticated','admin','staff','rentee']){
    const input={...current,authSession:{...current.authSession,record:{...current.authSession.record,role}},
      user:{...current.user,role,user_type:'staff',tenant_id:'organization-a'},
      tenantContext:{...current.tenantContext,tenantId:'organization-a',membership:{role:'admin'},memberships:[{role:'admin'}],resolution:'single-membership'}};
    assert.deepEqual(await resolvePersonalRentalContext(input),{verified:true,eligible:true,userType:'rental',tenantId:null});
    assert.deepEqual(await resolveVerifiedSeekerContext(input),{verified:false,eligible:false},'Legacy tenantless signup proof remains strict');
  }
});
test('personal rental proof rejects unverified, mismatched, inactive and delegated identities',async()=>{
  const current=fixture();current.authSession.sessionId='live-session';current.query=async()=>[{id:userId}];
  for(const patch of [
    {authSession:null}, {authSession:{...current.authSession,sessionId:null}},
    {authSession:{...current.authSession,record:{...current.authSession.record,metadata:{global_email_verified:false}}}},
    {user:{...current.user,id:'foreign'}},{user:{...current.user,auth_id:'foreign'}},
    {user:{...current.user,email:'foreign@example.invalid'}},{user:{...current.user,role:'admin'}},
    {user:{...current.user,status:'inactive'}},{user:{...current.user,active:false}},
    {user:{...current.user,is_dev_bypass:true}},
    {tenantContext:{...current.tenantContext,requestedTenantId:'foreign'}},
    {tenantContext:{...current.tenantContext,identity:{devBypassRole:'admin'}}}
  ]){assert.deepEqual(await resolvePersonalRentalContext({...current,...patch}),{verified:false,eligible:false});}
});


test('editable verification metadata cannot replace a consumed email proof',async()=>{
  const current=fixture();current.authSession.sessionId='live-session';
  for(const rows of [[],null]){assert.deepEqual(await resolvePersonalRentalContext({...current,query:async()=>rows}),{verified:false,eligible:false});}
  await assert.rejects(resolvePersonalRentalContext({...current,query:async()=>{throw new Error('Ledger unavailable');}}),/Ledger unavailable/);
});
