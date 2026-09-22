import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

const collectSourceFiles = (directory) => {
  const files = [];
  for (const name of readdirSync(directory)) {
    const fullPath = join(directory, name);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(?:js|jsx|mjs)$/.test(name)) {
      files.push(fullPath);
    }
  }
  return files;
};

const coreSource = read('../src/services/platformClientCore.js');
const facadeSource = read('../src/services/platformClient.js');
const storageApiSource = read('../src/services/storageApiService.js');
const renterFormSource = read('../src/pages/RenteeForm.jsx');
const renterDetailsSource = read('../src/pages/RenteeDetails.jsx');
const platformRouterSource = read('../src/api/platform/router.js');
const resetPageSource = read('../src/pages/ResetPassword.jsx');
const eviaSource = read('../src/services/eviaSignService.js');

test('no application source can use the retired platformClient storage shim', () => {
  const srcRoot = new URL('../src', import.meta.url).pathname;
  const offenders = collectSourceFiles(srcRoot)
    .filter((path) => /platformClient\.storage|corePlatformClient\.storage/.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);

  assert.doesNotMatch(coreSource, /const storageClient\s*=|storage:\s*storageClient|platformClient\.storage/);
  assert.doesNotMatch(coreSource, /export const (?:uploadFile|getFileUrl|getPublicUrl|deleteFile|storage|listBuckets|getBucket|updateBucket|createStorageBucket)\b/);
  assert.doesNotMatch(facadeSource, /\b(?:uploadFile|getFileUrl|getPublicUrl|deleteFile|createStorageBucket|listBuckets|getBucket|updateBucket|storage),/);
});

test('explicit storage API remains tenant scoped and server authorized', () => {
  assert.match(storageApiSource, /scopeTenantStoragePath/);
  assert.match(storageApiSource, /Cross-tenant storage paths are not allowed/);
  assert.match(storageApiSource, /buildRequestContextHeaders/);
  assert.match(platformRouterSource, /router\.post\('\/storage\/buckets', requireAuthenticated, requireAdmin/);
  assert.match(platformRouterSource, /router\.delete\('\/storage\/buckets\/:bucket', requireAuthenticated, requireAdmin/);
});

test('renter relationship state remains server canonical', () => {
  assert.doesNotMatch(renterFormSource, /sessionStorage\s*\./);
  assert.doesNotMatch(renterDetailsSource, /sessionStorage\s*\./);
  assert.match(renterFormSource, /associated_properties: formData\.structuredAssociations/);
  assert.match(renterDetailsSource, /await updateRentee\(id, \{ status: 'inactive' \}\)/);
});

test('password recovery and signing hardening remain present in the assembled candidate', () => {
  assert.match(resetPageSource, /validatePasswordResetToken|validate.*token/i);
  assert.match(eviaSource, /sendDocumentForSigningLegacy|AutoStamp|send.*legacy/i);
});
