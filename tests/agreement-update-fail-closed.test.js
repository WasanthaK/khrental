import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');
const start = source.indexOf('export const updateAgreementData = ');
const end = source.indexOf('export const fetchProperty = ', start);
assert.ok(start > 0 && end > start, 'updateAgreementData boundaries must remain recognizable');
const functionBody = source.slice(start, end).replace('export const ', 'const ');
const instantiate = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'platformClient',
  `${functionBody}\nreturn updateAgreementData;`
);

function fixture({ mssql = true, apiError = null, apiResult = undefined, legacyError = null } = {}) {
  const apiCalls = [];
  const genericCalls = [];
  const result = { id: 'agreement-1', status: 'review' };
  const genericQuery = {
    update(body) { genericCalls.push(['update', body]); return this; },
    eq(...args) { genericCalls.push(['eq', ...args]); return this; },
    select(...args) { genericCalls.push(['select', ...args]); return this; },
    single() {
      genericCalls.push(['single']);
      return Promise.resolve({ data: result, error: legacyError });
    }
  };
  const updateAgreementData = instantiate(
    () => mssql,
    async (path, options) => {
      apiCalls.push({ path, options });
      if (apiError) throw apiError;
      return apiResult === undefined ? result : apiResult;
    },
    { from: table => { genericCalls.push(['from', table]); return genericQuery; } }
  );
  return { updateAgreementData, apiCalls, genericCalls, result };
}

test('successful MSSQL agreement update sends exactly one PUT with no compatibility mutation', async () => {
  const f = fixture();
  const body = { status: 'review', documenturl: '/doc/1' };
  assert.deepEqual(await f.updateAgreementData('agreement-1', body), f.result);
  assert.deepEqual(f.apiCalls, [{
    path: '/api/mssql/agreements/agreement-1',
    options: { method: 'PUT', body }
  }]);
  assert.deepEqual(f.genericCalls, []);
});

test('MSSQL denied, conflicting and ambiguous agreement updates never use generic retry', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const failure = Object.assign(new Error('authoritative update failed'), { status });
    const f = fixture({ apiError: failure });
    await assert.rejects(
      f.updateAgreementData('agreement-1', { status: 'review' }),
      error => error === failure
    );
    assert.equal(f.apiCalls.length, 1, 'one PUT attempt only');
    assert.deepEqual(f.genericCalls, [], 'never retry a failed PUT as a generic table update');
  }
});

test('empty authoritative response never triggers a compatibility update', async () => {
  const f = fixture({ apiResult: null });
  assert.equal(await f.updateAgreementData('agreement-1', { notes: 'test' }), null);
  assert.equal(f.apiCalls.length, 1);
  assert.deepEqual(f.genericCalls, []);
});

test('legacy agreement updates work only with MSSQL explicitly disabled', async () => {
  const f = fixture({ mssql: false });
  const body = { notes: 'renewal terms' };
  assert.deepEqual(await f.updateAgreementData('agreement-1', body), f.result);
  assert.deepEqual(f.apiCalls, []);
  assert.deepEqual(f.genericCalls, [
    ['from', 'agreements'], ['update', body],
    ['eq', 'id', 'agreement-1'], ['select', '*'], ['single']
  ]);
});

test('legacy agreement update failures surface without alternate retries', async () => {
  const failure = new Error('legacy update rejected');
  const f = fixture({ mssql: false, legacyError: failure });
  await assert.rejects(f.updateAgreementData('agreement-1', { status: 'draft' }),
    error => error === failure);
  assert.deepEqual(f.apiCalls, []);
  assert.equal(f.genericCalls.filter(c => c[0] === 'update').length, 1);
});
