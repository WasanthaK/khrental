import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const propertyListSource = readFileSync(
  new URL('../src/pages/PropertyList.jsx', import.meta.url),
  'utf8'
);

const propertyDirectoryServiceSource = readFileSync(
  new URL('../src/services/propertyDirectoryService.js', import.meta.url),
  'utf8'
);

test('PropertyList uses the explicit tenant property directory', () => {
  assert.match(propertyListSource, /listTenantProperties/);
  assert.doesNotMatch(propertyListSource, /fetchData/);
  assert.doesNotMatch(propertyListSource, /platformClient/);
});


test('PropertyList tolerates nullable MSSQL text fields', () => {
  assert.match(propertyListSource, /String\(property\?\.name \|\| ''\)\.toLowerCase\(\)/);
  assert.match(propertyListSource, /String\(property\?\.address \|\| ''\)\.toLowerCase\(\)/);
  assert.match(propertyListSource, /String\(property\?\.description \|\| ''\)\.toLowerCase\(\)/);
});

test('property directory normalizes MSSQL JSON-backed property fields', () => {
  assert.match(propertyDirectoryServiceSource, /parseJsonValue\(property\.images, \[\]\)/);
  assert.match(propertyDirectoryServiceSource, /parseJsonValue\(property\.amenities, \[\]\)/);
  assert.match(propertyDirectoryServiceSource, /parseJsonValue\(property\.rentalvalues, \{\}\)/);
  assert.match(propertyDirectoryServiceSource, /properties\.map\(normalizeProperty\)/);
  assert.match(propertyDirectoryServiceSource, /return normalizeProperty\(property\)/);
});

test('property list uses central authorization and propagates denied access', async () => {
  const { normalizePropertyChecklist, normalizePropertyCoordinates } = await import('../src/utils/propertyDetailFields.js');
  const source = propertyDirectoryServiceSource.replace(/^import .*;\n/gm, '').replace(/export const /g, 'const ');
  const createList = new Function('fetchData', 'requestMssqlApi', 'normalizePropertyChecklist', 'normalizePropertyCoordinates', `${source}\nreturn listTenantProperties;`);
  const legacy = () => { throw new Error('Legacy route must not be called'); };
  const run = (query) => createList(query, legacy, normalizePropertyChecklist, normalizePropertyCoordinates)();
  const rows = await run(async (query) => {
    assert.deepEqual(query, { table: 'properties', limit: 500 });
    return { data: [{ id: 'assigned-property', images: '["photo.jpg"]' }], error: null };
  });
  assert.deepEqual(rows[0].images, ['photo.jpg']);
  assert.deepEqual(await run(async () => ({ data: [], error: null })), []);
  const denied = new Error('Forbidden');
  await assert.rejects(run(async () => ({ data: null, error: denied })), (error) => error === denied);
});
