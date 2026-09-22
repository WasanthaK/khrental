import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeStoragePath } from '../src/api/storage/index.js';

const fileServiceSource = readFileSync(
  new URL('../src/services/fileService.js', import.meta.url),
  'utf8'
);

const storageApiServiceSource = readFileSync(
  new URL('../src/services/storageApiService.js', import.meta.url),
  'utf8'
);

const maintenanceRequestCardSource = readFileSync(
  new URL('../src/components/maintenance/MaintenanceRequestCard.jsx', import.meta.url),
  'utf8'
);

const maintenanceServiceLegacySource = readFileSync(
  new URL('../src/services/maintenanceServiceLegacy.js', import.meta.url),
  'utf8'
);

test('normalizeStoragePath preserves nested tenant object paths', () => {
  assert.equal(
    normalizeStoragePath('/tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'),
    'tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'
  );
});

test('normalizeStoragePath rejects path traversal', () => {
  assert.throws(() => normalizeStoragePath('../secret.txt'), /Invalid storage path/);
});

test('shared file service uses the direct storage API instead of compatibility storage', () => {
  assert.doesNotMatch(fileServiceSource, /platformClient\.storage/);
  assert.match(fileServiceSource, /storageApiService\.js/);
  assert.match(fileServiceSource, /uploadTenantFile/);
  assert.match(fileServiceSource, /listTenantFiles/);
  assert.match(fileServiceSource, /deleteTenantFiles/);
});

test('direct storage API service covers shared file operations', () => {
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/buckets/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/list/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/upload/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/objects/);
});

test('direct storage URLs preserve active-tenant scoping from the compatibility client', () => {
  assert.match(storageApiServiceSource, /getActiveTenantId/);
  assert.match(storageApiServiceSource, /scopeTenantStoragePath/);
  assert.match(storageApiServiceSource, /Cross-tenant storage paths are not allowed/);
  assert.match(storageApiServiceSource, /const safePath = scopeTenantStoragePath\(path\)/);
});

test('maintenance images have one storage authority and cards use persisted URLs', () => {
  assert.doesNotMatch(maintenanceRequestCardSource, /platformClient\.storage/);
  assert.match(maintenanceRequestCardSource, /src=\{image\.image_url\}/);
  assert.doesNotMatch(maintenanceServiceLegacySource, /platformClient\.storage/);
  assert.match(maintenanceServiceLegacySource, /saveImage\(file/);
  assert.match(maintenanceServiceLegacySource, /saveFile\(image\.file/);
});
