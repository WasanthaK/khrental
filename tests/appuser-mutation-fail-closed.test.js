import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/appUserRepository.js', import.meta.url), 'utf8');
const section = (start, end) => {
  const a = source.indexOf(start);
  const b = end ? source.indexOf(end, a + start.length) : source.length;
  assert.ok(a >= 0 && b > a, start + ' must remain exported');
  return source.slice(a, b).replaceAll('export const ', 'const ');
};
const implementations = [
  section('export const createAppUserRecord', 'export const findAppUserByEmailRecord'),
  section('export const updateAppUserRecord', 'export const fetchAppUserRecord'),
  section('export const deleteAppUserRecord')
].join('\n');

const instantiate = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'platformClient', 'ensureValidTimestamps',
  'normalizeCreatePayload', 'findAppUserByEmailRecord', 'isDuplicateEmailError',
  'createEmailConflictResult', 'console',
  implementations + '\nreturn {createAppUserRecord, linkAppUserRecord, updateAppUserRecord, deleteAppUserRecord};'
);

const operations = [
  { name: 'createAppUserRecord', args: [{ email: 'person@example.invalid' }, 'staff'], path: '/api/mssql/app-users', method: 'POST' },
  { name: 'linkAppUserRecord', args: ['auth-1', 'person-1'], path: '/api/mssql/app-users/person-1/link', method: 'POST' },
  { name: 'updateAppUserRecord', args: ['person-1', { name: 'Updated' }], path: '/api/mssql/app-users/person-1', method: 'PUT' },
  { name: 'deleteAppUserRecord', args: ['person-1'], path: '/api/mssql/app-users/person-1', method: 'DELETE' }
];

function fixture({ enabled = true, apiError = null } = {}) {
  const calls = [], compatibility = [];
  const client = {
    from(table) {
      compatibility.push(table);
      throw Error('Unexpected compatibility mutation of ' + table);
    }
  };
  const actions = instantiate(
    () => enabled,
    async (path, options) => {
      calls.push({path, options});
      if (apiError) throw apiError;
      return { id: 'person-1', name: 'Success' };
    },
    client, data => data,
    (user, userType) => ({...user, user_type: userType, email: user.email}),
    async () => ({success: true, data: null}),
    () => false,
    email => ({success:false,code:'APP_USER_EMAIL_CONFLICT',error:'Email conflict ' + email}),
    {log(){}, warn(){}, error(){}}
  );
  return {actions, calls, compatibility};
}

test('app-user write failures fail closed for 401/403/404/409/500/503 and ambiguous network errors', async () => {
  for (const status of [401, 403, 404, 409, 500, 503, null]) {
    for (const operation of operations) {
      const denial = Object.assign(new Error('authoritative failure'), {
        ...(status ? {status} : {})
      });
      const f = fixture({apiError:denial});
      const result = await f.actions[operation.name](...operation.args);
      assert.equal(result.success, false, operation.name);
      assert.equal(result.error, denial.message);
      if (status) assert.equal(result.status, status);
      assert.equal(f.calls.length, 1, operation.name + ' must not retry');
      assert.equal(f.calls[0].path, operation.path);
      assert.deepEqual(f.compatibility, [], operation.name + ' must not change app_users on another transport');
    }
  }
});

test('app-user writes use their correct authoritative method once on success', async () => {
  for (const operation of operations) {
    const f = fixture();
    const result = await f.actions[operation.name](...operation.args);
    assert.equal(result.success, true);
    assert.deepEqual(f.calls.map(call => [call.path, call.options?.method]), [
      [operation.path, operation.method]
    ]);
    assert.deepEqual(f.compatibility, []);
  }
});

test('explicitly disabled MSSQL mode still uses the compatibility transport', async () => {
  const f = fixture({enabled:false});
  const result = await f.actions.deleteAppUserRecord('person-1');
  assert.equal(result.success, false);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.compatibility, ['app_users']);
});

test('identity mutation boundaries remain tenant-scoped on the server', () => {
  const router = readFileSync(new URL('../src/api/mssql/router.js', import.meta.url), 'utf8');
  assert.match(router, /router\.use\(requireScopedTenant\)/);
  assert.match(router, /router\.post\('\/app-users'/);
  assert.match(router, /router\.post\('\/app-users\/:id\/link'/);
  assert.match(router, /router\.delete\('\/app-users\/:id'/);
  assert.doesNotMatch(source.slice(source.indexOf('export const createAppUserRecord'),
    source.indexOf('export const findAppUserByEmailRecord')), /shouldFallbackToPlatformQuery/);
});
