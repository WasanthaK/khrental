import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');
const start = source.indexOf('export const fetchProperty =');
const end = source.indexOf('/**\n * Saves an agreement', start);
assert.ok(start >= 0 && end > start, 'agreement property/unit helpers remain discoverable');
const region = source.slice(start, end).replaceAll('export const ', 'const ');

const instantiate = new Function('isMssqlApiEnabled', 'requestMssqlApi',
  'fetchPropertyRecord', 'fetchPropertyUnitRecord', 'platformClient',
  region + '\nreturn { fetchProperty, listProperties, updatePropertyData, fetchPropertyUnit, listPropertyUnits };');

const cases = [
  { name: 'fetchProperty', args: ['property-a'], path: '/api/mssql/properties/property-a', method: 'GET' },
  { name: 'listProperties', args: [], path: '/api/mssql/properties?pageSize=500', method: 'GET' },
  { name: 'updatePropertyData', args: ['property-a', { status: 'available' }],
    path: '/api/mssql/properties/property-a', method: 'PUT' },
  { name: 'fetchPropertyUnit', args: ['unit-a'], path: '/api/mssql/property-units/unit-a', method: 'GET' },
  { name: 'listPropertyUnits', args: ['property-a'],
    path: '/api/mssql/property-units?propertyId=property-a&pageSize=500', method: 'GET' }
];

const fixture = ({ mssql = true, apiError = null } = {}) => {
  const api = [];
  const legacy = [];
  const assertNoLegacy = label => { legacy.push(label); throw Error('unexpected legacy fallback'); };
  const actions = instantiate(
    () => mssql,
    async (path, options) => {
      api.push({ path, options });
      if (apiError) throw apiError;
      return { path, options };
    },
    async id => mssql ? assertNoLegacy('fetchPropertyRecord') : { id, source: 'compatibility' },
    async id => mssql ? assertNoLegacy('fetchPropertyUnitRecord') : { id, source: 'compatibility' },
    { from(table) { return assertNoLegacy('platformClient.from(' + table + ')'); } }
  );
  return { actions, api, legacy };
};

test('agreement property/unit MSSQL errors never trigger second compatibility read or write', async () => {
  for (const status of [401, 403, 404, 409, 500, 503]) {
    const denial = Object.assign(new Error('Authoritative endpoint failed'), { status });
    for (const operation of cases) {
      const f = fixture({ apiError: denial });
      await assert.rejects(f.actions[operation.name](...operation.args), error => error === denial);
      assert.equal(f.api.length, 1, operation.name + ' must attempt exactly once');
      assert.equal(f.api[0].path, operation.path);
      assert.deepEqual(f.legacy, [], operation.name + ' must not invoke the fallback transport');
    }
  }
});

test('agreement property/unit MSSQL successes use only the authoritative endpoint', async () => {
  for (const operation of cases) {
    const f = fixture();
    const result = await f.actions[operation.name](...operation.args);
    assert.equal(result.path, operation.path);
    assert.equal(f.api.length, 1);
    assert.deepEqual(f.legacy, []);
    if (operation.method === 'PUT') {
      assert.equal(f.api[0].options.method, 'PUT');
      assert.deepEqual(f.api[0].options.body, { status: 'available' });
    }
  }
});

test('explicitly disabled MSSQL mode retains property and unit compatibility reads', async () => {
  const f = fixture({ mssql: false });
  assert.deepEqual(await f.actions.fetchProperty('property-a'),
    { id: 'property-a', source: 'compatibility' });
  assert.deepEqual(await f.actions.fetchPropertyUnit('unit-a'),
    { id: 'unit-a', source: 'compatibility' });
  assert.deepEqual(f.api, []);
});

test('agreement sign, template and property access contracts remain separated', () => {
  assert.match(source, /export const markAgreementAsSigned/);
  assert.match(source, /export const listTemplates/);
  assert.match(source, /export const updateAgreementData/);
  assert.match(region, /if \(isMssqlApiEnabled\(\)\)/);
  assert.doesNotMatch(region, /falling back to the local compatibility layer/);
});
