import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeStoragePath } from '../src/api/storage/index.js';

const fileServiceSource = readFileSync(
  new URL('../src/services/fileService.js', import.meta.url),
  'utf8'
);

const storageApiServiceSource = readFileSync(
  new URL('../src/services/storageApiService.js', import.meta.url),
  'utf8'
);

const appInitServiceSource = readFileSync(new URL('../src/services/appInitService.js', import.meta.url), 'utf8');
const bucketExplorerServiceSource = readFileSync(new URL('../src/services/bucketExplorer.js', import.meta.url), 'utf8');
const bucketExplorerComponentSource = readFileSync(new URL('../src/components/BucketExplorer.jsx', import.meta.url), 'utf8');
const adminPanelSource = readFileSync(new URL('../src/pages/AdminPanel.jsx', import.meta.url), 'utf8');
const eviaSignTestingSource = readFileSync(new URL('../src/components/admin/EviaSignTesting.jsx', import.meta.url), 'utf8');
const signatureTestingToolsSource = readFileSync(new URL('../src/components/admin/SignatureTestingTools.jsx', import.meta.url), 'utf8');
const platformRouterSource = readFileSync(new URL('../src/api/platform/router.js', import.meta.url), 'utf8');

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

test('browser startup verifies storage readiness without mutating storage', () => {
  assert.match(appInitServiceSource, /listStorageBuckets/);
  assert.doesNotMatch(appInitServiceSource, /platformClient\.storage|createBucket|uploadTenantFile|deleteTenantFiles/);
});

test('bucket explorer and admin test surfaces use explicit storage APIs', () => {
  for (const source of [bucketExplorerServiceSource, bucketExplorerComponentSource, adminPanelSource, eviaSignTestingSource, signatureTestingToolsSource]) {
    assert.doesNotMatch(source, /platformClient\.storage/);
  }
  assert.match(bucketExplorerServiceSource, /listStorageBuckets/);
  assert.match(bucketExplorerServiceSource, /uploadTenantFile/);
  assert.match(bucketExplorerServiceSource, /deleteTenantFiles/);
  assert.match(adminPanelSource, /uploadTenantFile/);
  assert.match(eviaSignTestingSource, /uploadTenantFile/);
  assert.match(signatureTestingToolsSource, /uploadTenantFile/);
});

test('bucket create and delete require administrator authorization', () => {
  assert.match(storageApiServiceSource, /export const createStorageBucket/);
  assert.match(storageApiServiceSource, /export const deleteStorageBucket/);
  assert.match(platformRouterSource, /router\.post\('\/storage\/buckets', requireAuthenticated, requireAdmin/);
  assert.match(platformRouterSource, /router\.delete\('\/storage\/buckets\/:bucket', requireAuthenticated, requireAdmin/);
});

test('obsolete browser bucket setup script is removed', () => {
  assert.equal(existsSync(new URL('../src/scripts/setup_storage_buckets.js', import.meta.url)), false);
});
