import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');
const start = source.indexOf('export const saveAgreement = ');
const end = source.indexOf('/**\n * Fetches and prepares all necessary data for merge fields', start);
assert.ok(start > 0 && end > start, 'saveAgreement service boundaries must remain identifiable');

// Exercise the real saveAgreement implementation with its external transports
// injected; do not import browser/document modules in the Node CI environment.
const implementation = source.slice(start, end).replace('export const ', 'const ');
const instantiate = new Function(
  'crypto', 'toDatabaseFormat', 'toNullableNumber', 'isMssqlApiEnabled',
  'requestMssqlApi', 'platformClient', 'toast', 'console', 'updateAgreementData',
  `${implementation}\nreturn saveAgreement;`
);

const draft = Object.freeze({ status: 'draft', renteeid: 'renter-1', propertyid: 'property-1' });
const quiet = { log() {}, error() {} };

function fixture({ mssql = true, apiError = null, apiResult = undefined, legacyError = null } = {}) {
  const apiCalls = [];
  const genericCalls = [];
  const updates = [];
  const row = { ...draft, id: 'generated-agreement-id' };
  const genericQuery = {
    upsert(body) { genericCalls.push(['upsert', body]); return this; },
    select(...args) { genericCalls.push(['select', ...args]); return this; },
    single() {
      genericCalls.push(['single']);
      return Promise.resolve({ data: row, error: legacyError });
    }
  };
  const save = instantiate(
    { randomUUID: () => 'generated-agreement-id' },
    value => value,
    () => null,
    () => mssql,
    async (path, options) => {
      apiCalls.push({ path, options });
      if (apiError) throw apiError;
      return apiResult === undefined ? row : apiResult;
    },
    { from: table => { genericCalls.push(['from', table]); return genericQuery; } },
    { error() {} },
    quiet,
    async (...args) => {
      updates.push(args);
      return { ...row, id: args[0], ...args[1] };
    }
  );
  return { save, apiCalls, genericCalls, updates, row };
}

test('new agreement makes exactly one authoritative POST with no compatibility upsert', async () => {
  const f = fixture();
  const saved = await f.save({ ...draft });
  assert.equal(saved.id, f.row.id);
  assert.equal(f.apiCalls.length, 1);
  assert.equal(f.apiCalls[0].path, '/api/mssql/agreements');
  assert.equal(f.apiCalls[0].options.method, 'POST');
  assert.equal(f.apiCalls[0].options.body.id, 'generated-agreement-id');
  assert.equal(f.apiCalls[0].options.body.renteeid, 'renter-1');
  assert.deepEqual(f.genericCalls, []);
  assert.deepEqual(f.updates, []);
});

test('authoritative POST failure never retries as generic agreement upsert', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const apiError = Object.assign(new Error('authoritative agreement creation failed'), { status });
    const f = fixture({ apiError });
    await assert.rejects(f.save({ ...draft }), error => error === apiError);
    assert.equal(f.apiCalls.length, 1);
    assert.deepEqual(f.genericCalls, [], 'no second write after failed or ambiguous MSSQL POST');
    assert.deepEqual(f.updates, []);
  }
});

test('empty authoritative response fails closed instead of silently upserting', async () => {
  for (const apiResult of [null, {}, { status: 'draft' }]) {
    const f = fixture({ apiResult });
    await assert.rejects(f.save({ ...draft }), /did not return an ID from the MSSQL API/);
    assert.equal(f.apiCalls.length, 1);
    assert.deepEqual(f.genericCalls, []);
  }
});

test('generic agreement creation is allowed only when MSSQL mode is disabled', async () => {
  const f = fixture({ mssql: false });
  const saved = await f.save({ ...draft });
  assert.equal(saved.id, f.row.id);
  assert.deepEqual(f.apiCalls, []);
  assert.equal(f.genericCalls[0][0], 'from');
  assert.equal(f.genericCalls[0][1], 'agreements');
  assert.equal(f.genericCalls.filter(c => c[0] === 'upsert').length, 1);
});

test('legacy creation failure is surfaced without additional write', async () => {
  const failure = new Error('compatibility write rejected');
  const f = fixture({ mssql: false, legacyError: failure });
  await assert.rejects(f.save({ ...draft }), error => error === failure);
  assert.deepEqual(f.apiCalls, []);
  assert.equal(f.genericCalls.filter(c => c[0] === 'upsert').length, 1);
});

test('existing agreement updates still use the previous updateAgreementData boundary', async () => {
  const f = fixture();
  const existing = { ...draft, id: 'existing-agreement-id' };
  const saved = await f.save(existing);
  assert.equal(saved.id, existing.id);
  assert.equal(f.updates.length, 1);
  assert.equal(f.updates[0][0], existing.id);
  assert.deepEqual(f.apiCalls, []);
  assert.deepEqual(f.genericCalls, []);
});
