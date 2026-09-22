import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { normalizeStoragePath } from '../src/api/storage/index.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const fileServiceSource = read('../src/services/fileService.js');
const storageApiServiceSource = read('../src/services/storageApiService.js');
const documentServiceSource = read('../src/services/DocumentService.js');
const agreementServiceSource = read('../src/services/agreementService.js');
const serverSource = read('../server.js');
const paymentServiceSource = read('../src/services/paymentService.js');
const utilityReadingFormSource = read('../src/pages/rentee/UtilityReadingForm.jsx');
const utilityMeterFormSource = read('../src/components/utilities/UtilityMeterForm.jsx');
const maintenanceRequestCardSource = read('../src/components/maintenance/MaintenanceRequestCard.jsx');
const maintenanceServiceLegacySource = read('../src/services/maintenanceServiceLegacy.js');
const appInitServiceSource = read('../src/services/appInitService.js');
const bucketExplorerServiceSource = read('../src/services/bucketExplorer.js');
const bucketExplorerComponentSource = read('../src/components/BucketExplorer.jsx');
const adminPanelSource = read('../src/pages/AdminPanel.jsx');
const eviaSignTestingSource = read('../src/components/admin/EviaSignTesting.jsx');
const signatureTestingToolsSource = read('../src/components/admin/SignatureTestingTools.jsx');
const platformRouterSource = read('../src/api/platform/router.js');
const legacyEviaSource = read('../src/services/eviaSignServiceLegacy.js');

test('normalizeStoragePath preserves nested tenant object paths', () => {
  assert.equal(
    normalizeStoragePath('/tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'),
    'tenants/FEEC0269-D580-49C3-A982-5B3ECBBB1A09/properties/1789547843116_j94ui11e.jpg'
  );
});

test('normalizeStoragePath rejects path traversal', () => {
  assert.throws(() => normalizeStoragePath('../secret.txt'), /Invalid storage path/);
});

test('shared file service uses direct tenant storage APIs', () => {
  assert.doesNotMatch(fileServiceSource, /platformClient\.storage/);
  assert.match(fileServiceSource, /storageApiService\.js/);
  assert.match(fileServiceSource, /uploadTenantFile/);
  assert.match(fileServiceSource, /listTenantFiles/);
  assert.match(fileServiceSource, /deleteTenantFiles/);
});

test('direct storage API service covers tenant file operations', () => {
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/buckets/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/list/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/upload/);
  assert.match(storageApiServiceSource, /\/api\/platform\/storage\/objects/);
  assert.match(storageApiServiceSource, /getActiveTenantId/);
  assert.match(storageApiServiceSource, /scopeTenantStoragePath/);
  assert.match(storageApiServiceSource, /Cross-tenant storage paths are not allowed/);
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

test('storage download keeps tenant context and strips delivery query from stored paths', () => {
  assert.match(storageApiServiceSource, /export const downloadTenantFile/);
  assert.match(storageApiServiceSource, /headers: buildRequestContextHeaders\(\)/);
  assert.match(storageApiServiceSource, /tenantId=/);
  assert.match(storageApiServiceSource, /split\(\/\[\?#\]\/, 1\)/);
});

test('storage delivery requires the tenant encoded in the object path', () => {
  assert.match(serverSource, /TENANT_STORAGE_PATH_REQUIRED/);
  assert.match(serverSource, /tenantIdFromPath/);
  assert.match(serverSource, /createTenantContextMiddleware\(\{ requireUser: true, requireTenant: true \}\)/);
});

test('payment proof upload uses tenant storage before billing lifecycle mutation', () => {
  assert.doesNotMatch(paymentServiceSource, /platformClient\.storage/);
  assert.match(paymentServiceSource, /uploadTenantFile/);
  assert.match(paymentServiceSource, /bucket: 'invoices'/);
  assert.match(paymentServiceSource, /const proofUrl = uploadData\?\.url/);
  assert.match(paymentServiceSource, /submitInvoicePaymentProof\(invoiceId/);
});

test('utility reading photos use explicit tenant storage APIs', () => {
  for (const source of [utilityReadingFormSource, utilityMeterFormSource]) {
    assert.doesNotMatch(source, /platformClient\.storage/);
    assert.match(source, /uploadTenantFile/);
    assert.match(source, /uploadData\?\.url/);
  }
  assert.match(utilityReadingFormSource, /bucket: 'images'/);
  assert.match(utilityMeterFormSource, /bucket: 'media'/);
});

test('maintenance images have one storage authority and cards use persisted URLs', () => {
  assert.doesNotMatch(maintenanceRequestCardSource, /platformClient\.storage/);
  assert.match(maintenanceRequestCardSource, /src=\{image\.image_url\}/);
  assert.doesNotMatch(maintenanceServiceLegacySource, /platformClient\.storage/);
  assert.match(maintenanceServiceLegacySource, /saveImage\(file/);
  assert.match(maintenanceServiceLegacySource, /saveFile\(image\.file/);
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

test('legacy Evia completed documents use explicit tenant storage', () => {
  assert.doesNotMatch(legacyEviaSource, /platformClient\.storage/);
  assert.match(legacyEviaSource, /uploadTenantFile/);
  assert.match(legacyEviaSource, /bucket: 'files'/);
  assert.match(legacyEviaSource, /const documentUrl = uploadData\?\.url/);
});
