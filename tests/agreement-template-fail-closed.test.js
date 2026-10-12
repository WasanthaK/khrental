import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(
  new URL('../src/services/agreementService.js', import.meta.url),
  'utf8'
);
const methods = ['getTemplate', 'listTemplates', 'createTemplate', 'updateTemplate', 'deleteTemplate'];

// Evaluate the actual five exported function bodies with replaceable transport
// boundaries. The UI module has browser and document dependencies, so direct
// Node import would initialize unrelated React/document facilities.
const from = source.indexOf('export const getTemplate = ');
const to = source.indexOf('/**\n * Cancel an agreement', from);
const schemaFrom = source.indexOf('const isSchemaUnavailableError = ');
const schemaTo = source.indexOf('const toNullableNumber = ', schemaFrom);
assert.ok(from > 0 && to > from && schemaFrom > 0 && schemaTo > schemaFrom);
const functionBodies = source.slice(from, to).replaceAll('export const ', 'const ');
const instantiate = new Function(
  'isMssqlApiEnabled', 'requestMssqlApi', 'platformClient', 'console',
  `${source.slice(schemaFrom, schemaTo)}
${functionBodies}
return { getTemplate, listTemplates, createTemplate, updateTemplate, deleteTemplate };`
);

const inputs = {
  getTemplate: ['template-1'],
  listTemplates: [{ language: 'en' }],
  createTemplate: [{ name: 'Lease Template' }],
  updateTemplate: ['template-1', { name: 'Updated Lease' }],
  deleteTemplate: ['template-1']
};

function harness({ mssqlEnabled = true, result = { id: 'template-1' }, apiError = null } = {}) {
  const apiCalls = [];
  const genericCalls = [];
  const dbResult = { data: result, error: null };
  const query = {
    select(...args) { genericCalls.push(['select', ...args]); return this; },
    eq(...args) { genericCalls.push(['eq', ...args]); return this; },
    single() { genericCalls.push(['single']); return Promise.resolve(dbResult); },
    order(...args) { genericCalls.push(['order', ...args]); return Promise.resolve({ data: [result], error: null }); },
    insert(...args) { genericCalls.push(['insert', ...args]); return this; },
    update(...args) { genericCalls.push(['update', ...args]); return this; },
    delete() { genericCalls.push(['delete']); return this; }
  };
  const platformClient = {
    from(table) { genericCalls.push(['from', table]); return query; }
  };
  const requestMssqlApi = async (path, options) => {
    apiCalls.push({ path, options });
    if (apiError) throw apiError;
    return result;
  };
  return {
    operations: instantiate(() => mssqlEnabled, requestMssqlApi, platformClient, { error() {} }),
    apiCalls,
    genericCalls
  };
}

for (const name of methods) {
  test(`${name}: MSSQL 401/403/409/500 errors fail closed without compatibility retry`, async () => {
    for (const status of [401, 403, 409, 500]) {
      const denial = Object.assign(new Error('authoritative API denied request'), { status });
      const fixture = harness({ apiError: denial });
      await assert.rejects(fixture.operations[name](...inputs[name]), error => error === denial);
      assert.equal(fixture.apiCalls.length, 1, 'one authoritative API attempt only');
      assert.deepEqual(fixture.genericCalls, [], 'must not touch the generic compatibility table');
    }
  });
}

test('successful MSSQL operations preserve their dedicated paths and HTTP verbs', async () => {
  const expected = {
    getTemplate: ['/api/mssql/agreement-templates/template-1', 'GET'],
    listTemplates: ['/api/mssql/agreement-templates?language=en&pageSize=500', 'GET'],
    createTemplate: ['/api/mssql/agreement-templates', 'POST'],
    updateTemplate: ['/api/mssql/agreement-templates/template-1', 'PUT'],
    deleteTemplate: ['/api/mssql/agreement-templates/template-1', 'DELETE']
  };
  for (const name of methods) {
    const fixture = harness();
    await fixture.operations[name](...inputs[name]);
    assert.deepEqual(
      fixture.apiCalls.map(c => [c.path, c.options?.method || 'GET']),
      [expected[name]]
    );
    assert.deepEqual(fixture.genericCalls, []);
  }
});

test('schema-unavailable reads preserve empty presentation; writes remain denied', async () => {
  const unavailable = Object.assign(new Error('Agreement templates are not available in the current local MSSQL schema.'), {
    status: 409, code: 'SCHEMA_NOT_AVAILABLE'
  });
  for (const name of methods) {
    const fixture = harness({ apiError: unavailable });
    if (name === 'getTemplate') {
      assert.equal(await fixture.operations[name](...inputs[name]), null);
    } else if (name === 'listTemplates') {
      assert.deepEqual(await fixture.operations[name](...inputs[name]), []);
    } else {
      await assert.rejects(
        fixture.operations[name](...inputs[name]),
        /Agreement templates are not available/
      );
    }
    assert.equal(fixture.apiCalls.length, 1);
    assert.deepEqual(fixture.genericCalls, [], 'schema errors must not trigger alternate transport');
  }
});

test('missing template preserves null presentation without generic retry', async () => {
  const missing = Object.assign(new Error('Not found'), { status: 404 });
  const fixture = harness({ apiError: missing });
  assert.equal(await fixture.operations.getTemplate('missing-id'), null);
  assert.equal(fixture.apiCalls.length, 1);
  assert.deepEqual(fixture.genericCalls, []);
});

test('compatibility transport is only used with MSSQL disabled', async () => {
  for (const name of methods) {
    const fixture = harness({ mssqlEnabled: false });
    await fixture.operations[name](...inputs[name]);
    assert.deepEqual(fixture.apiCalls, []);
    assert.ok(fixture.genericCalls.some(c => c[0] === 'from' && c[1] === 'agreement_templates'));
  }
});
