import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');
const start = source.indexOf('export const deleteAgreement = ');
const end = source.indexOf('/**\n * Mark an agreement as signed', start);
assert.ok(start > 0 && end > start, 'deleteAgreement service boundaries must remain recognizable');
const functionBody = source.slice(start, end).replace('export const ', 'const ');
const instantiate = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'platformClient', 'console',
  `${functionBody}\nreturn deleteAgreement;`
);

function harness({ mssql = true, apiError = null, legacyError = null } = {}) {
  const calls = [];
  const generic = [];
  const result = { id: 'agreement-1', status: 'draft' };
  const query = {
    delete() { generic.push('delete'); return this; },
    eq(...args) { generic.push(['eq', ...args]); return this; },
    select(...args) { generic.push(['select', ...args]); return this; },
    single() {
      generic.push('single');
      return Promise.resolve({ data: legacyError ? null : result, error: legacyError });
    }
  };
  const deletion = instantiate(
    () => mssql,
    async (route, options) => {
      calls.push({ route, options });
      if (apiError) throw apiError;
      return result;
    },
    { from: table => { generic.push(['from', table]); return query; } },
    { error() {} }
  );
  return { deletion, calls, generic, result };
}

test('successful MSSQL deletion uses exactly one authoritative DELETE request', async () => {
  const f = harness();
  assert.deepEqual(await f.deletion('agreement-1'), f.result);
  assert.deepEqual(f.calls, [
    { route: '/api/mssql/agreements/agreement-1', options: { method: 'DELETE' } }
  ]);
  assert.deepEqual(f.generic, []);
});

test('denied, conflicting, unavailable and ambiguous MSSQL deletions never use generic retry', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const failure = Object.assign(new Error('authoritative agreement deletion failed'), { status });
    const f = harness({ apiError: failure });
    await assert.rejects(f.deletion('agreement-1'), error => error === failure);
    assert.equal(f.calls.length, 1);
    assert.deepEqual(f.generic, [], 'a failed primary DELETE must not trigger a secondary DELETE');
  }
});

test('legacy agreement deletion is accessible only with MSSQL explicitly disabled', async () => {
  const f = harness({ mssql: false });
  assert.deepEqual(await f.deletion('agreement-1'), f.result);
  assert.deepEqual(f.calls, []);
  assert.deepEqual(f.generic, [
    ['from', 'agreements'], 'delete', ['eq', 'id', 'agreement-1'], ['select', '*'], 'single'
  ]);
});

test('legacy deletion failures still surface without a second attempt', async () => {
  const failure = new Error('legacy deletion blocked');
  const f = harness({ mssql: false, legacyError: failure });
  await assert.rejects(f.deletion('agreement-1'), error => error === failure);
  assert.equal(f.generic.filter(x => x === 'delete').length, 1);
});
