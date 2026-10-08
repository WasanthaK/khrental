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

const agreementServiceSource = readFileSync(
  new URL('../src/services/agreementService.js', import.meta.url),
  'utf8'
);

const mssqlRouterSource = readFileSync(
  new URL('../src/api/mssql/router.js', import.meta.url),
  'utf8'
);

const mssqlRepositoriesSource = readFileSync(
  new URL('../src/api/mssql/repositories.js', import.meta.url),
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

test('PropertyDetails renter fallback reuses the explicit property agreement list', () => {
  assert.match(propertyDetailsSource, /const agreementRentees = \(agreementsData \|\| \[\]\)\.filter/);
  assert.match(propertyDetailsSource, /\['active', 'pending', 'review', 'signed'\]\.includes/);
});

test('PropertyDetails unit fallback uses the explicit tenant property-unit directory', () => {
  assert.match(propertyDetailsSource, /listTenantPropertyUnits\(id\)/);
  assert.doesNotMatch(propertyDetailsSource, /platformClient\s*\.from\('property_units'\)/);
  assert.match(propertyDirectoryServiceSource, /\/api\/mssql\/property-units\?propertyId=/);
});

test('PropertyDetails unit-agreement fallback uses the explicit tenant-scoped agreement API', () => {
  assert.match(propertyDetailsSource, /listAgreementsByUnitIds\(/);
  assert.doesNotMatch(propertyDetailsSource, /platformClient\s*\.from\('agreements'\)/);
  assert.doesNotMatch(propertyDetailsSource, /platform\s+as\s+platformClient/);
  assert.match(agreementServiceSource, /unitIds: normalizedUnitIds\.join\(','\)/);
  assert.match(agreementServiceSource, /params\.set\('statuses', normalizedStatuses\.join\(','\)\)/);
  assert.match(mssqlRouterSource, /unitIds: req\.query\.unitIds/);
  assert.match(mssqlRouterSource, /statuses: req\.query\.statuses/);
  assert.match(mssqlRepositoriesSource, /a\.unitid IN \(\$\{placeholders\.join\(', '\)\}\)/);
  assert.match(mssqlRepositoriesSource, /a\.status IN \(\$\{placeholders\.join\(', '\)\}\)/);
  assert.match(mssqlRepositoriesSource, /applyTenantFilter\(\{ filters, params, tenantId, column: 'a\.tenant_id' \}\)/);
});

test('PropertyDetails removes the unused maintenance compatibility read', () => {
  assert.doesNotMatch(propertyDetailsSource, /maintenance_requests/);
  assert.doesNotMatch(propertyDetailsSource, /maintenanceRequests/);
  assert.doesNotMatch(propertyDetailsSource, /setMaintenanceRequests/);
  assert.doesNotMatch(propertyDetailsSource, /fetchData/);
});

test('PropertyDetails keeps broader compatibility writes outside this bounded slice', () => {
  assert.match(propertyDetailsSource, /updateData\('properties'/);
  assert.match(propertyDetailsSource, /deleteData\('properties'/);
});
