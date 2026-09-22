from pathlib import Path


def walk_sources(root):
    for path in Path(root).rglob('*'):
        if path.suffix in {'.js', '.jsx', '.mjs'} and path.is_file():
            yield path


# Prove all application consumers have already left the compatibility storage surface.
offenders = []
for path in walk_sources('src'):
    if path.as_posix() == 'src/services/platformClientCore.js':
        continue
    text = path.read_text()
    if 'platformClient.storage' in text or 'corePlatformClient.storage' in text:
        offenders.append(path.as_posix())
if offenders:
    raise SystemExit(f'Compatibility storage consumers remain: {offenders}')

# Remove the obsolete Supabase-shaped storage shim from the compatibility core.
core_path = Path('src/services/platformClientCore.js')
core = core_path.read_text()
start = core.find('const buildPublicUrl = (bucket, filePath) => {')
end = core.find('const authClient = {')
if start < 0 or end < 0 or end <= start:
    raise SystemExit('Could not locate compatibility storage block in platformClientCore.js')
core = core[:start] + core[end:]
core = core.replace('      storage: storageClient,\n', '')
for line in [
    "export const uploadFile = async (bucket, path, file) => platformClient.storage.from(bucket).upload(path, file);\n",
    "export const getFileUrl = (bucket, path) => platformClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;\n",
    "export const deleteFile = async (bucket, path) => platformClient.storage.from(bucket).remove([path]);\n",
    "export const getPublicUrl = getFileUrl;\n",
    "export const storage = storageClient;\n",
    "export const listBuckets = async () => storageClient.listBuckets();\n",
    "export const getBucket = async (bucketName) => storageClient.getBucket(bucketName);\n",
    "export const updateBucket = async (bucketName, options = {}) => storageClient.updateBucket(bucketName, options);\n",
    "export const createStorageBucket = async (bucketName, options = {}) => storageClient.createBucket(bucketName, options);\n",
]:
    if line not in core:
        raise SystemExit(f'Missing expected compatibility export: {line.strip()}')
    core = core.replace(line, '')
for forbidden in ['const storageClient =', 'storage: storageClient', 'export const storage =', 'platformClient.storage']:
    if forbidden in core:
        raise SystemExit(f'Compatibility storage residue remains in core: {forbidden}')
core_path.write_text(core)

# Remove the now-nonexistent storage aliases from the public compatibility facade.
facade_path = Path('src/services/platformClient.js')
facade = facade_path.read_text()
for name in [
    '  uploadFile,\n',
    '  getFileUrl,\n',
    '  getPublicUrl,\n',
    '  deleteFile,\n',
    '  createStorageBucket,\n',
    '  listBuckets,\n',
    '  getBucket,\n',
    '  updateBucket,\n',
    '  storage,\n',
]:
    if name not in facade:
        raise SystemExit(f'Missing facade export: {name.strip()}')
    facade = facade.replace(name, '')
facade_path.write_text(facade)

# Add an aggregate release-hardening test that checks the assembled architecture,
# rather than only one domain branch at a time.
release_test = r'''import test from 'node:test';
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
'''
Path('tests/release-hardening.test.js').write_text(release_test)

# Make the aggregate gate part of the same CI command used by production deployment.
package_path = Path('package.json')
package = package_path.read_text()
needle = 'tests/evia-webhook.test.js"'
replacement = 'tests/evia-webhook.test.js tests/release-hardening.test.js"'
if replacement not in package:
    if needle not in package:
        raise SystemExit('Could not locate test:authorization tail in package.json')
    package = package.replace(needle, replacement, 1)
package_path.write_text(package)
