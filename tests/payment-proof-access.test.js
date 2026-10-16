import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSubmittedPaymentProof, verifyStoredPaymentProof,
  parsePaymentProofPath, authorizePaymentProofAccess, denyPaymentProofMutation
} from '../src/api/platform/paymentProofAccess.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const path = 'tenants/' + A + '/payment_proofs/' + B + '/' + C + '.png';
const url = '/storage/invoices/' + path;
const bytes = Buffer.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82]);
test('submission path must be exactly same invoice and same tenant', () => {
  assert.equal(parseSubmittedPaymentProof(url,A,B).invoiceId, B);
  for (const bad of [
    '/storage/images/' + path, 'https://evil.invalid' + url,
    '/storage/invoices/' + path.replace(A,C),
    '/storage/invoices/' + path.replace(B,C), url + '?x=1'
  ]) assert.throws(() => parseSubmittedPaymentProof(bad,A,B), { code: 'PAYMENT_PROOF_PATH_INVALID' });
  assert.equal(parsePaymentProofPath('invoices',path).applies,true);
});
test('only valid uploaded image/PDF bytes may substantiate pending payment', async () => {
  assert.equal((await verifyStoredPaymentProof({proofUrl:url,tenantId:A,invoiceId:B,
    readObject:async()=>({body:bytes})})).path,path);
  await assert.rejects(verifyStoredPaymentProof({proofUrl:url,tenantId:A,invoiceId:B,
    readObject:async()=>({body:Buffer.from('not an image')})}), {code:'PAYMENT_PROOF_INVALID_BYTES'});
  await assert.rejects(verifyStoredPaymentProof({proofUrl:url,tenantId:A,invoiceId:B,
    readObject:async()=>{throw new Error('not found');}}), {code:'PAYMENT_PROOF_NOT_STORED'});
});
test('renter sees only own invoice; manager needs payments permission', async () => {
  const invoice = {id:B,tenant_id:A,renteeid:C,propertyid:C};
  const owner = {id:C,role:'rentee',user_type:'rentee'};
  const membership = {tenant_id:A,role:'rentee',status:'active'};
  const args = {bucket:'invoices',path,tenantId:A,loadInvoice:async()=>invoice};
  assert.equal((await authorizePaymentProofAccess({...args,user:owner,membership})).allowed,true);
  assert.equal((await authorizePaymentProofAccess({...args,user:{...owner,id:B},membership})).allowed,false);
  assert.equal((await authorizePaymentProofAccess({...args,user:owner,membership,operation:'delete'})).allowed,false);
  assert.throws(() => denyPaymentProofMutation('invoices',[path]),{code:'PAYMENT_PROOF_DELETE_FORBIDDEN'});
});


test('Phase 5: same-tenant renters may read/upload only their own invoice proof', async () => {
  const invoice = { id: B, tenant_id: A, renteeid: C, propertyid: C };
  const member = { tenant_id: A, role: 'rentee', status: 'active' };
  const loadInvoice = async () => invoice;
  for (const operation of ['read', 'upload']) {
    const own = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A,
      user: { id: C, role: 'rentee' }, membership: member, operation, loadInvoice
    });
    assert.deepEqual(own, { applies: true, allowed: true });
    const otherRenter = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A,
      user: { id: B, role: 'rentee' }, membership: member, operation, loadInvoice
    });
    assert.deepEqual(otherRenter, { applies: true, allowed: false });
  }
});

test('Phase 5: inactive and foreign tenant memberships fail closed before proof lookup', async () => {
  let lookups = 0;
  const loadInvoice = async () => {
    lookups += 1;
    return { id: B, tenant_id: A, renteeid: C, propertyid: C };
  };
  for (const membership of [
    { tenant_id: A, role: 'rentee', status: 'inactive' },
    { tenant_id: B, role: 'rentee', status: 'active' },
    null
  ]) {
    const result = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A,
      user: { id: C, role: 'rentee' }, membership, loadInvoice
    });
    assert.deepEqual(result, { applies: true, allowed: false });
  }
  assert.equal(lookups, 0);
});

test('Phase 5: payment staff need both payments permission and assigned property scope', async () => {
  const invoice = { id: B, tenant_id: A, renteeid: C, propertyid: C };
  const loadInvoice = async () => invoice;
  const cases = [
    { role: 'finance_staff', assigned: [C], allowed: true },
    { role: 'finance_staff', assigned: [B], allowed: false },
    { role: 'finance_staff', assigned: [], allowed: false },
    { role: 'maintenance_staff', assigned: [C], allowed: false }
  ];
  for (const entry of cases) {
    const result = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A,
      user: { id: B, role: entry.role },
      membership: {
        tenant_id: A, role: entry.role, status: 'active',
        assignedPropertyIds: entry.assigned
      }, loadInvoice
    });
    assert.equal(result.allowed, entry.allowed, entry.role + ' ' + entry.assigned.join(','));
    assert.equal(result.applies, true);
  }
});

test('Phase 5: payment staff and administrators cannot upload renter proof evidence', async () => {
  const invoice = { id: B, tenant_id: A, renteeid: C, propertyid: C };
  for (const role of ['finance_staff', 'admin']) {
    const membership = {
      tenant_id: A, role, status: 'active',
      assignedPropertyIds: [C]
    };
    const user = { id: B, role };
    const loadInvoice = async () => invoice;
    const read = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A, user, membership, loadInvoice
    });
    assert.equal(read.allowed, true);
    const upload = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A, user, membership, operation: 'upload', loadInvoice
    });
    assert.equal(upload.allowed, false);
    const deletion = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A, user, membership, operation: 'delete', loadInvoice
    });
    assert.equal(deletion.allowed, false);
  }
});

test('Phase 5: missing or cross-tenant invoice records cannot authorize evidence', async () => {
  const user = { id: C, role: 'rentee' };
  const membership = { tenant_id: A, role: 'rentee', status: 'active' };
  for (const invoice of [
    null,
    { id: C, tenant_id: A, renteeid: C },
    { id: B, tenant_id: B, renteeid: C }
  ]) {
    const result = await authorizePaymentProofAccess({
      bucket: 'invoices', path, tenantId: A,
      user, membership, loadInvoice: async () => invoice
    });
    assert.deepEqual(result, { applies: true, allowed: false });
  }
});

test('Phase 5: historical proof paths are read-only and cannot be resubmitted', async () => {
  const legacyPath = 'tenants/' + A + '/payment_proofs/' + B + '_1717000000.png';
  const parsed = parsePaymentProofPath('invoices', legacyPath);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.legacy, true);
  assert.throws(
    () => parseSubmittedPaymentProof('/storage/invoices/' + legacyPath, A, B),
    { code: 'PAYMENT_PROOF_PATH_INVALID' }
  );
  const args = {
    bucket: 'invoices', path: legacyPath, tenantId: A,
    user: { id: C, role: 'rentee' },
    membership: { tenant_id: A, role: 'rentee', status: 'active' },
    loadInvoice: async () => ({ id: B, tenant_id: A, renteeid: C, propertyid: C })
  };
  assert.equal((await authorizePaymentProofAccess({ ...args, operation: 'read' })).allowed, true);
  assert.equal((await authorizePaymentProofAccess({ ...args, operation: 'upload' })).allowed, false);
  assert.throws(
    () => denyPaymentProofMutation('invoices', [legacyPath]),
    { code: 'PAYMENT_PROOF_DELETE_FORBIDDEN' }
  );
});

test('Phase 5: malformed or differently scoped proof keys fail closed', async () => {
  const user = { id: C, role: 'rentee' };
  const membership = { tenant_id: A, role: 'rentee', status: 'active' };
  const loadInvoice = async () => ({ id: B, tenant_id: A, renteeid: C, propertyid: C });
  const badPaths = [
    'tenants/' + B + '/payment_proofs/' + B + '/' + C + '.png',
    'tenants/' + A + '/payment_proofs/' + C + '/' + C + '.png',
    'tenants/' + A + '/payment_proofs/' + B + '/../../' + C + '.png',
    'tenants/' + A + '/payment_proofs/' + B + '/' + C + '.exe'
  ];
  for (const candidate of badPaths) {
    const result = await authorizePaymentProofAccess({
      bucket: 'invoices', path: candidate, tenantId: A, user, membership, loadInvoice
    });
    assert.equal(result.allowed, false, candidate);
  }
  const otherBucket = await authorizePaymentProofAccess({
    bucket: 'images', path, tenantId: A, user, membership, loadInvoice
  });
  assert.deepEqual(otherBucket, { applies: true, allowed: false });
  for (const badUrl of [
    url + '#fragment', url + '?download=true',
    '/storage/invoices/' + path.replace(C + '.png', 'escape%2F' + C + '.png'),
    '/storage/invoices/' + path.replace(A, B)
  ]) {
    assert.throws(() => parseSubmittedPaymentProof(badUrl, A, B), {
      code: 'PAYMENT_PROOF_PATH_INVALID'
    });
  }
});

test('Phase 5: real upload bytes must match the file extension and 5 MiB limit', async () => {
  const expected = {
    png: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]),
    pdf: Buffer.from('%PDF-1.7'),
    jpg: Buffer.from([255, 216, 255, 0, 0])
  };
  const proofUrl = extension => url.replace(/\.png$/, '.' + extension);
  for (const [extension, body] of Object.entries(expected)) {
    const readObject = async () => ({ body });
    const verified = await verifyStoredPaymentProof({
      proofUrl: proofUrl(extension), tenantId: A, invoiceId: B, readObject
    });
    assert.equal(verified.invoiceId, B);
  }
  for (const [extension, body] of [
    ['png', expected.pdf],
    ['pdf', expected.png],
    ['jpg', expected.pdf],
    ['png', null],
    ['png', Buffer.alloc(5 * 1024 * 1024 + 1, 0)]
  ]) {
    await assert.rejects(
      () => verifyStoredPaymentProof({
        proofUrl: proofUrl(extension), tenantId: A, invoiceId: B,
        readObject: async () => ({ body })
      }),
      { code: 'PAYMENT_PROOF_INVALID_BYTES' }
    );
  }
});
