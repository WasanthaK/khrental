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

const documentServiceSource = readFileSync(
  new URL('../src/services/DocumentService.js', import.meta.url),
  'utf8'
);

const agreementServiceSource = readFileSync(
  new URL('../src/services/agreementService.js', import.meta.url),
  'utf8'
);

const serverSource = readFileSync(
  new URL('../server.js', import.meta.url),
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

test('agreement document storage uses explicit tenant-scoped APIs only', () => {
  assert.doesNotMatch(documentServiceSource, /platformClient\.storage/);
  assert.match(documentServiceSource, /uploadTenantFile/);
  assert.match(documentServiceSource, /downloadTenantFile/);
  assert.match(documentServiceSource, /listTenantFiles/);
  assert.match(documentServiceSource, /buildStorageUrl/);
  assert.doesNotMatch(agreementServiceSource, /platformClient\.storage/);
  assert.match(agreementServiceSource, /uploadTenantFile/);
});

test('storage download client keeps tenant context and strips URL query from stored paths', () => {
  assert.match(storageApiServiceSource, /export const downloadTenantFile/);
  assert.match(storageApiServiceSource, /headers: buildRequestContextHeaders\(\)/);
  assert.match(storageApiServiceSource, /tenantId=/);
  assert.match(storageApiServiceSource, /split\(\/\[\?#\]\/\, 1\)/);
});

test('storage delivery requires the tenant encoded in the object path', () => {
  assert.match(serverSource, /TENANT_STORAGE_PATH_REQUIRED/);
  assert.match(serverSource, /tenantIdFromPath/);
  assert.match(serverSource, /createTenantContextMiddleware\(\{ requireUser: true, requireTenant: true \}\)/);
});
