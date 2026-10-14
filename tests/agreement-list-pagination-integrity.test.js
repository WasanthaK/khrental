import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectAgreementPages } from '../src/services/agreementListReadContract.js';

const source = readFileSync(new URL('../src/services/agreementService.js', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');

test('property agreement list returns more than the old 500 row cutoff', async () => {
  const calls = [];
  const rows = Array.from({ length: 1001 }, (_, i) => ({ id: 'agreement-' + i }));
  const result = await collectAgreementPages((page, pageSize) => {
    calls.push(page);
    const start = (page - 1) * pageSize;
    return Promise.resolve(rows.slice(start, start + pageSize));
  });
  assert.deepEqual(result, rows);
  assert.deepEqual(calls, [1, 2, 3]);
});

test('exactly one full page requires a second page before concluding', async () => {
  const calls = [];
  const result = await collectAgreementPages(async (page, size) => {
    calls.push([page, size]);
    return page === 1 ? [{ id: 'a' }, { id: 'b' }] : [];
  }, { pageSize: 2 });
  assert.deepEqual(result.map(x => x.id), ['a', 'b']);
  assert.deepEqual(calls, [[1, 2], [2, 2]]);
});

test('malformed, oversized, duplicated or missing page rejects the entire directory', async () => {
  const bad = [
    async () => null,
    async () => ({ data: [] }),
    async () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    async () => [null],
    async () => [{ id: '' }],
    async page => page === 1 ? [{ id: 'X' }, { id: 'Y' }] : [{ id: 'x' }]
  ];
  for (const load of bad) {
    await assert.rejects(collectAgreementPages(load, { pageSize: 2 }),
      e => e.code === 'INVALID_AGREEMENT_LIST_RESPONSE');
  }
  await assert.rejects(collectAgreementPages(async () => [{ id: 'a' }], { pageSize: 1, maxPages: 2 }),
    e => e.code === 'INVALID_AGREEMENT_LIST_RESPONSE');
  await assert.rejects(collectAgreementPages(async page => [{ id: String(page) }], { pageSize: 1, maxPages: 2 }),
    e => e.code === 'AGREEMENT_LIST_PAGINATION_LIMIT');
});

test('live agreement property and unit directory readers use authorized paged API', () => {
  assert.match(source, /export const listAgreementsByProperty/);
  assert.match(source, /export const listAgreementsByUnitIds/);
  assert.match(source, /collectAgreementPages\(\(page, pageSize\) => requestMssqlApi/);
  assert.match(source, /params\.set\('page', String\(page\)\)/);
  assert.match(source, /unitIds: normalizedUnitIds\.join\(','\)/);
  assert.match(source, /params\.set\('statuses', normalizedStatuses\.join\(','\)\)/);
  assert.doesNotMatch(source, /return Array\.isArray\(agreements\) \? agreements : \[\]/);
  const start = repository.indexOf('export const listAgreements =');
  const end = repository.indexOf('export const getAgreementById', start);
  const list = repository.slice(start, end);
  assert.match(list, /applyTenantFilter\(\{ filters, params, tenantId, column: 'a\.tenant_id' \}\)/);
  assert.match(list, /orderBy: 'a\.createdat DESC, a\.id ASC'/);
});
