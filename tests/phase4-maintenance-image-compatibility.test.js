import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMaintenanceImageAttachment } from '../src/services/maintenanceImageAttachment.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = 'ea5bb203-8b68-4dd5-9b72-546738a83846';
const other = '3bcdf60a-368c-41d3-95f5-cb1e94b849cb';
const make = (overrides = {}) => {
  const calls = { gets: 0, uploads: 0, attaches: 0 };
  const fn = createMaintenanceImageAttachment({
    getRequest: async () => { calls.gets++; return { data: { request: { id } }, error: null }; },
    uploadImage: async () => { calls.uploads++; return { success: true, url: 'https://example.invalid/tenants/a/maintenance/image' }; },
    attachImage: async () => { calls.attaches++; return { data: { id: other }, error: null }; },
    isFile: value => value?.testFile === true,
    ...overrides
  });
  return { fn, calls };
};

test('legacy page image export is explicitly overridden with the scoped lifecycle implementation', () => {
  const facade = source('../src/services/maintenanceService.js');
  const service = source('../src/services/maintenanceImageService.js');
  assert.match(facade, /export \{ addMaintenanceRequestImage \} from '\.\/maintenanceImageService\.js'/);
  assert.match(service, /getMaintenanceLifecycleRequest/);
  assert.match(service, /attachMaintenanceLifecycleImage/);
  assert.doesNotMatch(service, /platformClient|maintenance_request_images/);
});

test('foreign request and denied access fail before file upload or metadata writes', async () => {
  for (const getRequest of [
    async () => ({ data: null, error: Object.assign(new Error('Forbidden'), { status: 403 }) }),
    async () => ({ data: { request: { id: other } }, error: null })
  ]) {
    const { fn, calls } = make({ getRequest });
    const result = await fn({ maintenance_request_id: id, image: { testFile: true } });
    assert.equal(result.success, false);
    assert.equal(calls.uploads, 0);
    assert.equal(calls.attaches, 0);
  }
});

test('actual image bytes upload before server-authoritative metadata attachment', async () => {
  const { fn, calls } = make();
  const result = await fn({ maintenance_request_id: id, image: { testFile: true }, userId: other, image_type: 'general' });
  assert.equal(result.success, true);
  assert.equal(calls.gets, 1);
  assert.equal(calls.uploads, 1);
  assert.equal(calls.attaches, 1);
});

test('failed attachment is never presented as success and never falls back to generic insert', async () => {
  const { fn } = make({
    attachImage: async () => ({ data: null, error: Object.assign(new Error('Foreign tenant'), { status: 403 }) })
  });
  const result = await fn({ maintenance_request_id: id, image: 'https://example.invalid/x' });
  assert.equal(result.success, false);
  assert.match(result.error, /Foreign tenant/);
});

test('malformed images/types and missing acknowledged rows are rejected', async () => {
  const { fn } = make({ attachImage: async () => ({ data: {}, error: null }) });
  assert.equal((await fn({ maintenance_request_id: id, image: {}, image_type: 'additional' })).success, false);
  assert.equal((await fn({ maintenance_request_id: id, image: 'url', image_type: 'signed' })).success, false);
  assert.equal((await fn({ maintenance_request_id: id, image: 'url', image_type: 'initial' })).success, false);
});
