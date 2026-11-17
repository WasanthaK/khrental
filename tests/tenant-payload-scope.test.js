import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeTenantPayload, sameTenantId, tenantRelationshipError } from '../src/api/mssql/tenantPayloadScope.js';
import { publicApiError } from '../src/api/httpErrors.js';

const active = '1F0C2B8E-4A7D-4C1E-9B2A-0D3E5F6A7B8C';
const foreign = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

test('tenant payload merge stamps the active organization and accepts its own id in any letter case', () => {
  assert.deepEqual(mergeTenantPayload({ name: 'Lease' }, active), { name: 'Lease', tenant_id: active });
  assert.deepEqual(mergeTenantPayload({ name: 'Lease', tenant_id: active.toLowerCase() }, active), { name: 'Lease', tenant_id: active });
  assert.deepEqual(mergeTenantPayload({ name: 'Lease', tenant_id: ` ${active} ` }, active).tenant_id, active);
  for (const absent of [undefined, null, '']) {
    assert.equal(mergeTenantPayload({ tenant_id: absent }, active).tenant_id, active);
  }
  assert.equal(sameTenantId(active, active.toLowerCase()), true);
  assert.equal(sameTenantId(active, foreign), false);
  assert.throws(() => mergeTenantPayload({}, ''), { message: 'tenantId is required' });
});

test('naming another organization in a write payload is a structured 403 that never echoes the id', () => {
  for (const tenant_id of [foreign, foreign.toUpperCase(), 'not-a-guid', 42, { id: active }]) {
    let error;
    assert.throws(() => mergeTenantPayload({ name: 'Lease', tenant_id }, active), caught => { error = caught; return true; });
    assert.equal(error.status, 403);
    assert.equal(error.code, 'TENANT_OVERRIDE_BLOCKED');
    const reply = publicApiError(error);
    assert.equal(reply.status, 403, 'not masked as a 500 by the production error handler');
    assert.equal(reply.body.code, 'TENANT_OVERRIDE_BLOCKED');
    assert.equal(reply.body.details, undefined);
    assert.doesNotMatch(JSON.stringify(reply.body), new RegExp(`${foreign}|${active}`, 'i'));
  }
});

test('a foreign or missing related record is a structured 400 indistinguishable from absence', () => {
  for (const label of ['Property', 'Property unit', 'App user', 'Agreement template']) {
    const reply = publicApiError(tenantRelationshipError(label));
    assert.equal(reply.status, 400);
    assert.equal(reply.body.code, 'TENANT_RELATIONSHIP_INVALID');
    assert.equal(reply.body.error, `${label} was not found in the active organization.`);
    assert.equal(reply.body.details, undefined);
  }
});

test('every compatibility repository create and relationship check uses the structured tenant boundary', () => {
  const repository = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  assert.match(repository, /import \{ mergeTenantPayload, tenantRelationshipError \} from '\.\/tenantPayloadScope\.js';/);
  assert.doesNotMatch(repository, /const mergeTenantPayload =|Cross-tenant payload override|does not belong to the active tenant/);
  for (const creator of ['createAgreementTemplate', 'createInvoice', 'createAgreement']) {
    const start = repository.indexOf(`export const ${creator} = `);
    const body = repository.slice(start, repository.indexOf('\nexport ', start + 1));
    assert.ok(start > 0 && body.includes('mergeTenantPayload('), `${creator} merges the tenant payload`);
  }
  const relation = repository.slice(repository.indexOf('const ensureTenantScopedEntity = '), repository.indexOf('const ensureAgreementRelationships = '));
  assert.match(relation, /throw tenantRelationshipError\(label\);/);
});
