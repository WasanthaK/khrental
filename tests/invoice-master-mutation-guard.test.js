import test from 'node:test';
import assert from 'node:assert/strict';
import { assertDedicatedInvoiceMasterMutation } from '../src/api/platform/invoiceMasterMutationGuard.js';

for (const [table,key] of [
 ['tenant_settings','invoice_issuer_profile_json'],
 ['properties','bank_beneficiary_name'],
 ['properties','invoice_party_overrides_json'],
 ['properties','billing_contact_email'],
 ['property_units','bank_beneficiary_name']
]) {
  test('reject unaudited '+table+'.'+key+' writes, including bulk data',()=>{
    for(const action of ['insert','update','upsert']){
      assert.throws(()=>assertDedicatedInvoiceMasterMutation({table,action,payload:{[key]:'fake'}}),e=>
        e?.status===403 && e?.code==='INVOICE_MASTER_DEDICATED_API_REQUIRED');
      assert.throws(()=>assertDedicatedInvoiceMasterMutation({table,action,payload:[{id:'1'}, {[key]:'fake'}]}),e=>
        e?.code==='INVOICE_MASTER_DEDICATED_API_REQUIRED');
    }
  });
}
test('normal property and tenant updates remain allowed',()=>{
  assert.doesNotThrow(()=>assertDedicatedInvoiceMasterMutation({
    table:'properties',action:'update',payload:{name:'Real property'}}));
  assert.doesNotThrow(()=>assertDedicatedInvoiceMasterMutation({
    table:'tenant_settings',action:'select',payload:{invoice_issuer_profile_json:'stored'}}));
});
