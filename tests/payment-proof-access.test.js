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
