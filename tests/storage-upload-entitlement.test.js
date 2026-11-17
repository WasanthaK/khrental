import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { uploadRequiresManagementEntitlement } from '../src/api/storage/mutationPolicy.js';
import { assertManagementEntitlement } from '../src/api/managementBilling/entitlementGate.js';

const T = '11111111-1111-4111-8111-111111111111';
const U = '22222222-2222-4222-8222-222222222222';

test('every new object needs management entitlement except a renter identity copy; unknown namespaces fail closed', () => {
  const requires = (bucket, path) => uploadRequiresManagementEntitlement({ bucket, path });
  for (const [bucket, path] of [
    ['images', `tenants/${T}/maintenance/${U}/leak.png`],
    ['images', `tenants/${T}/utility-readings/${U}/meter.jpg`],
    ['images', `tenants/${T}/properties/front.webp`],
    ['files', `tenants/${T}/agreements/${U}/final_agreement.pdf`],
    ['files', `tenants/${T}/documents/notice.pdf`],
    ['files', `tenants/${T}/payment-proofs/${U}/proof.png`],
    ['invoices', `tenants/${T}/payment_proofs/${U}/proof.png`],
    ['images', `tenants/${T}/unclassified/thing.png`],
    ['documents', `tenants/${T}/id-copies/${U}/passport.pdf`],
    ['images', `tenants/${T}/id-copies`],
    ['images', `tenants/${T}`],
    ['images', ''],
    ['images', undefined]
  ]) {
    assert.equal(requires(bucket, path), true, `${bucket}/${path}`);
  }
  for (const [bucket, path] of [
    ['images', `tenants/${T}/id-copies/${U}/passport.jpg`],
    ['files', `tenants/${T}/id-copies/${U}/nic.pdf`],
    ['FILES', `tenants/${T}/id-copies/nic.pdf`]
  ]) {
    assert.equal(requires(bucket, path), false, `${bucket}/${path}`);
  }
});

test('the entitlement gate needs no lock outside the server scope, delegates to the management-write lock, and fails closed when misconfigured', async () => {
  for (const env of [{}, { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'false' },
    { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'true', MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS: U }]) {
    assert.equal(await assertManagementEntitlement({ tenantId: T, env }), undefined, JSON.stringify(env));
  }
  await assert.rejects(assertManagementEntitlement({ tenantId: T,
    env: { MANAGEMENT_BILLING_WRITE_ENFORCEMENT_ENABLED: 'on', MANAGEMENT_BILLING_WRITE_ENFORCEMENT_TENANT_IDS: T } }),
  { code: 'BILLING_ENFORCEMENT_CONFIGURATION' });
  const calls = [];
  await assertManagementEntitlement({ tenantId: T, guard: async args => { calls.push(args.tenantId); return args.action(); } });
  assert.deepEqual(calls, [T]);
  await assert.rejects(assertManagementEntitlement({ tenantId: T,
    guard: async () => { throw Object.assign(new Error('read-only'), { status: 403, code: 'MANAGEMENT_READ_ONLY' }); } }),
  { code: 'MANAGEMENT_READ_ONLY' });
});

test('the upload route rejects path, tenant, proof and namespace violations, then checks entitlement before writing any byte', () => {
  const router = readFileSync(new URL('../src/api/platform/router.js', import.meta.url), 'utf8');
  const start = router.indexOf("router.post('/storage/upload'");
  const route = router.slice(start, router.indexOf('router.', start + 10));
  const order = ['resolveTenantStoragePath(', 'assertEviaGenericDocumentUploadAllowed(', 'assertGenericInvoiceArchiveMutationAllowed(',
    'authorizeProofObject(', 'storageUploadPolicy(', 'uploadRequiresManagementEntitlement({bucket,path:policy.path})',
    'assertManagementEntitlement({tenantId:req.tenantId})', 'getStorageDriver().upload('];
  const positions = order.map(marker => route.indexOf(marker));
  positions.forEach((position, index) => assert.ok(position > 0, `${order[index]} present`));
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, 'checks precede the storage write in order');
  assert.doesNotMatch(route, /req\.(query|body|headers)\??\.?\[?['"]?MANAGEMENT_BILLING/i, 'no request flag is consulted');
  for (const reader of ["router.get('/storage/list'", "router.get('/storage/buckets'"]) {
    const at = router.indexOf(reader);
    assert.doesNotMatch(router.slice(at, router.indexOf('router.', at + 10)), /assertManagementEntitlement/, `${reader} stays readable`);
  }
  const access = readFileSync(new URL('../src/api/managementBilling/accessAdministration.js', import.meta.url), 'utf8');
  assert.match(access, /export const assertAccessExpansionAllowed = args => assertManagementEntitlement\(args\);/);
});
