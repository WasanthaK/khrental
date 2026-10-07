import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const propertyDetailsSource = readFileSync(
  new URL('../src/pages/PropertyDetails.jsx', import.meta.url),
  'utf8'
);

const propertyDirectoryServiceSource = readFileSync(
  new URL('../src/services/propertyDirectoryService.js', import.meta.url),
  'utf8'
);

test('PropertyDetails primary record uses the explicit tenant property detail read', () => {
  assert.match(propertyDetailsSource, /getTenantPropertyById\(id\)/);
  assert.doesNotMatch(propertyDetailsSource, /fetchData\('properties'/);
  assert.match(propertyDirectoryServiceSource, /\/api\/mssql\/properties\/\$\{encodeURIComponent\(propertyId\)\}/);
});

test('PropertyDetails displayed agreements use the explicit tenant-scoped agreement API', () => {
  assert.match(propertyDetailsSource, /listAgreementsByProperty\(id\)/);
  assert.doesNotMatch(propertyDetailsSource, /fetchData\('agreements'/);
});

test('PropertyDetails keeps broader compatibility paths outside this bounded slice', () => {
  assert.match(propertyDetailsSource, /fetchData\('maintenance_requests'/);
  assert.match(propertyDetailsSource, /updateData\('properties'/);
  assert.match(propertyDetailsSource, /deleteData\('properties'/);
  assert.match(propertyDetailsSource, /platformClient\s*\.from\('agreements'\)/);
  assert.match(propertyDetailsSource, /platformClient\s*\.from\('property_units'\)/);
});
