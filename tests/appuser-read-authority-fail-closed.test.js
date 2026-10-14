import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/appUserRepository.js', import.meta.url), 'utf8');
const slice = (start, end) => {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, start + ' must remain exported');
  return source.slice(a, b).replaceAll('export const ', 'const ');
};
const reads = [
  slice('export const findAppUserByEmailRecord', 'export const updateAppUserRecord'),
  slice('export const fetchAppUserRecord', 'export const deleteAppUserRecord')
].join('\n');

const instantiateReads = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'platformClient',
  'ensureValidTimestamps', 'hasRequestIdentity', 'console',
  reads + '\nreturn { findAppUserByEmailRecord, findAppUserByAuthIdRecord, checkAppUserInvitationStatusRecord, fetchAppUserRecord, fetchAppUsersRecord };'
);
const testCases = [
  { name: 'findAppUserByEmailRecord', args: ['person@example.invalid'], fragment: '/lookup?email=' },
  { name: 'findAppUserByAuthIdRecord', args: ['auth-1'], fragment: '/lookup?authId=' },
  { name: 'checkAppUserInvitationStatusRecord', args: ['user-1'], fragment: '/user-1/invitation-status' },
  { name: 'fetchAppUserRecord', args: ['user-1'], fragment: '/app-users/user-1' },
  { name: 'fetchAppUsersRecord', args: ['staff', { status: 'active' }], fragment: '/app-users?userType=staff' }
];

function readFixture({ enabled = true, result = { id: 'user-1', status: 'registered' }, denial = null, identity = true } = {}) {
  const requests = [], compatibility = [];
  const platformClient = { from(table) {
    compatibility.push(table);
    throw new Error('Legacy lookup unexpectedly used');
  }};
  const funcs = instantiateReads(
    () => enabled,
    async path => {
      requests.push(path);
      if (denial) throw denial;
      return path.includes('/app-users?') ? (Array.isArray(result) ? result : [result]) : result;
    },
    platformClient, data => data, () => identity,
    { log() {}, error() {} }
  );
  return { funcs, requests, compatibility };
}

test('MSSQL app-user read denial remains authoritative and is never retried through generic SQL', async () => {
  for (const status of [401, 403, 404, 409, 500, 503, null]) {
    const denial = Object.assign(new Error('read rejected'), {
      ...(status ? { status } : {}),
      code: status === 403 ? 'TENANT_ACCESS_DENIED' : 'READ_UNAVAILABLE'
    });
    for (const op of testCases) {
      const f = readFixture({ denial });
      if (op.name === 'fetchAppUserRecord' || op.name === 'fetchAppUsersRecord') {
        await assert.rejects(f.funcs[op.name](...op.args), e => e === denial);
      } else {
        const out = await f.funcs[op.name](...op.args);
        assert.equal(out.success, false);
        assert.equal(out.error, denial.message);
        assert.equal(out.code, denial.code);
        if (status) assert.equal(out.status, status);
      }
      assert.equal(f.requests.length, 1, op.name);
      assert.ok(f.requests[0].includes(op.fragment), op.name);
      assert.deepEqual(f.compatibility, [], op.name);
    }
  }
});

test('genuine missing lookup and successful empty list are distinct from errors', async () => {
  for (const name of ['findAppUserByEmailRecord', 'findAppUserByAuthIdRecord']) {
    const f = readFixture({ result: null });
    const out = await f.funcs[name]('missing-id');
    assert.equal(out.success, true);
    assert.equal(out.data, null);
    assert.deepEqual(f.compatibility, []);
  }
  const list = readFixture({ result: [] });
  assert.deepEqual(await list.funcs.fetchAppUsersRecord('staff'), []);
  const noIdentity = readFixture({ identity: false });
  assert.deepEqual(await noIdentity.funcs.fetchAppUsersRecord('staff'), []);
  assert.deepEqual(noIdentity.requests, []);
});

test('malformed MSSQL app-user list fails instead of reporting no users', async () => {
  for (const bad of [null, {}, { id: null }, { id: '' }]) {
    const f = readFixture({ result: bad });
    await assert.rejects(f.funcs.fetchAppUsersRecord('staff'),
      e => e.code === 'INVALID_APP_USERS_RESPONSE');
    assert.equal(f.requests.length, 1);
    assert.deepEqual(f.compatibility, []);
  }
});

test('failed duplicate-email preflight prevents any account creation attempt', async () => {
  const create = slice('export const createAppUserRecord', 'export const linkAppUserRecord');
  const makeCreate = new Function(
    'normalizeCreatePayload', 'findAppUserByEmailRecord', 'createEmailConflictResult',
    'isMssqlApiEnabled', 'requestMssqlApi', 'isDuplicateEmailError',
    'ensureValidTimestamps', 'platformClient', 'normalizeEmail', 'console',
    create + '\nreturn createAppUserRecord;'
  );
  const api = [], compatibility = [];
  const createUser = makeCreate(
    (data, type) => ({...data, user_type: type}),
    async () => ({success: false, error: 'Lookup forbidden', code: 'TENANT_ACCESS_DENIED', status: 403}),
    () => ({success:false,code:'APP_USER_EMAIL_CONFLICT'}),
    () => true,
    async path => {api.push(path);return { id:'user-1' };},
    () => false, x => x,
    { from(table) { compatibility.push(table); throw Error('compatibility write forbidden'); } },
    value => value.toLowerCase(),
    {error() {}}
  );
  const result = await createUser({email:'Person@Example.invalid'},'staff');
  assert.deepEqual(result, {success:false,error:'Lookup forbidden',code:'TENANT_ACCESS_DENIED',status:403});
  assert.deepEqual(api, []);
  assert.deepEqual(compatibility, []);
});
