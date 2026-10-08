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
