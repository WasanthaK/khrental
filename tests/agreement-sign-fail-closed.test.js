import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/services/agreementService.js', import.meta.url), 'utf8'
);
const start = source.indexOf('export const markAgreementAsSigned = ');
assert.ok(start > 0, 'markAgreementAsSigned must remain an exported service operation');
const implementation = source.slice(start).replace('export const ', 'const ');
const instantiate = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'fetchAgreement',
  'updateAgreementData', 'updatePropertyData', 'platformClient',
  'fetchAppUser', 'updateAppUser', 'console',
  `${implementation}\nreturn markAgreementAsSigned;`
);

const originalAgreement = {
  id: 'agreement-1', propertyid: 'property-1', unitid: 'unit-1', renteeid: 'rentee-1',
  status: 'review'
};
const signedAgreement = { ...originalAgreement, status: 'signed' };

function fixture({ mssql = true, apiError = null, apiResult = signedAgreement, legacyError = null } = {}) {
  const apiCalls = [];
  const effects = [];
  const genericQuery = {
    update(body) { effects.push(['unit.update', body]); return this; },
    eq(...args) { effects.push(['unit.eq', ...args]); return Promise.resolve({ error: null }); }
  };
  const sign = instantiate(
    () => mssql,
    async (path, options) => {
      apiCalls.push({ path, options });
      if (apiError) throw apiError;
      return apiResult;
    },
    async id => {
      effects.push(['fetchAgreement', id]);
      if (legacyError) throw legacyError;
      return originalAgreement;
    },
    async (id, updates) => {
      effects.push(['updateAgreementData', id, updates]);
      return signedAgreement;
    },
    async (id, updates) => {
      effects.push(['updatePropertyData', id, updates]);
      return { id, ...updates };
    },
    { from: table => {
      effects.push(['from', table]);
      return genericQuery;
    }},
    async id => {
      effects.push(['fetchAppUser', id]);
      return { id, associated_property_ids: [] };
    },
    async (id, updates) => {
      effects.push(['updateAppUser', id, updates]);
      return { success: true };
    },
    { error() {} }
  );
  return { sign, apiCalls, effects };
}

test('MSSQL sign success performs one scoped POST without client-side side effects', async () => {
  const f = fixture();
  assert.deepEqual(await f.sign('agreement-1'), signedAgreement);
  assert.deepEqual(f.apiCalls, [{
    path: '/api/mssql/agreements/agreement-1/sign', options: { method: 'POST' }
  }]);
  assert.deepEqual(f.effects, []);
});

test('401/403/404/409/500/503 signing failure fails closed with no second mutation', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const denial = Object.assign(new Error('signing endpoint failure'), { status });
    const f = fixture({ apiError: denial });
    await assert.rejects(f.sign('agreement-1'), error => error === denial);
    assert.equal(f.apiCalls.length, 1, 'exactly one server-side sign attempt');
    assert.deepEqual(f.effects, [], 'no fallback agreement/property/unit/user updates');
  }
});

test('ambiguous or empty successful MSSQL result does not trigger a second signing path', async () => {
  for (const apiResult of [null, {}, { id: 'agreement-1' }]) {
    const f = fixture({ apiResult });
    assert.equal(await f.sign('agreement-1'), apiResult);
    assert.equal(f.apiCalls.length, 1);
    assert.deepEqual(f.effects, []);
  }
});

test('explicitly disabled MSSQL mode retains existing legacy signing side effects', async () => {
  const f = fixture({ mssql: false });
  const result = await f.sign('agreement-1');
  assert.equal(result.status, 'signed');
  assert.deepEqual(f.apiCalls, []);
  assert.deepEqual(f.effects.map(effect => effect[0]), [
    'fetchAgreement', 'updateAgreementData', 'updatePropertyData',
    'from', 'unit.update', 'unit.eq', 'fetchAppUser', 'updateAppUser'
  ]);
});

test('legacy failure does not start an MSSQL signing request', async () => {
  const denial = new Error('agreement not readable');
  const f = fixture({ mssql: false, legacyError: denial });
  await assert.rejects(f.sign('agreement-1'), error => error === denial);
  assert.deepEqual(f.apiCalls, []);
  assert.deepEqual(f.effects.map(effect => effect[0]), ['fetchAgreement']);
});

test('server signing route remains tenant-bound and uses one SQL transaction', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  const router = readFileSync(new URL('../src/api/mssql/router.js', import.meta.url), 'utf8');
  const repo = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  assert.match(server, /isAdminRole\(\{ user: req\.user, membership: req\.membership \}\)/);
  assert.match(router, /router\.post\('\/agreements\/:id\/sign'/);
  assert.match(router, /markAgreementSigned\(req\.params\.id, req\.tenantId\)/);
  const signStart = repo.indexOf('export const markAgreementSigned = ');
  const signEnd = repo.indexOf('};', signStart);
  assert.ok(signStart > 0 && signEnd > signStart);
  const signRepo = repo.slice(signStart, signEnd);
  assert.match(signRepo, /new sql\.Transaction\(pool\)/);
  assert.match(signRepo, /WHERE id = @id\s+AND tenant_id = @tenantId/);
  assert.match(signRepo, /await transaction\.commit\(\)/);
  assert.match(signRepo, /await transaction\.rollback\(\)/);
});
