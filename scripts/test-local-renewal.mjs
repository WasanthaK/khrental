import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';
import assert from 'node:assert/strict';
import {applyLocalRenewal,issuedLocalReceipt} from '../src/api/managementBilling/localRenewal.js';

// The SQL suite supplies the tenant, version, real inventory and dated assignments.
// Only the provider transport is synthetic.
export async function verifyLocalRenewal({store,q,tenantId,versionId,laterIssuer}){
  const account={tenant_id:tenantId,market:'LK',stripe_account_id:BILLING_ACCOUNT,pricing_version_id:versionId,stripe_price_id:'price_fixtureLK',
    stripe_customer_id:'cus_fixtureLK',stripe_subscription_id:'sub_fixtureLK',stripe_item_id:'si_fixtureLK'};
  const invoice={object:'invoice',id:'in_fixtureLK',livemode:false,billing_reason:'subscription_cycle',
    subscription:account.stripe_subscription_id,customer:account.stripe_customer_id,currency:'lkr',status:'draft',
    created:Math.floor(Date.now()/1000),lines:{has_more:false,data:[{currency:'lkr',quantity:6,amount:60000,
      parent:{subscription_item_details:{subscription_item:account.stripe_item_id,proration:false}},
      pricing:{price_details:{price:account.stripe_price_id}}}]}};
  let writes=0;
  const stripe={request:async(method,path,body,key)=>{
    assert.equal(method,'POST');assert.equal(path,'/v1/invoiceitems');
    assert.equal(body.invoice,invoice.id);assert.equal(body.customer,account.stripe_customer_id);
    assert.equal(body.currency,'lkr');assert.equal(body.amount,150002);assert.equal(key,'quixo-lk-renewal-'+invoice.id);
    writes++;
    invoice.lines.data.push({...body,parent:{type:'invoice_item_details'}});
    throw new Error('Synthetic lost response');
  }};
  const args={store,q,stripe,account,invoiceId:invoice.id,loadInvoice:async()=>structuredClone(invoice)};
  await assert.rejects(applyLocalRenewal(args),/Synthetic lost response/);
  const recovered=await applyLocalRenewal(args);
  assert.equal(writes,1);assert.equal(recovered.monthlyFeeMinor,210002);
  assert.equal(recovered.issuer.legalName,'Quixo Inc.');assert.equal(recovered.issuer.country,'US');
  assert.throws(()=>issuedLocalReceipt(invoice,account),{code:'BILLING_LOCAL_INVOICE_REVIEW'});
  invoice.status='open';invoice.status_transitions={finalized_at:invoice.created+1};
  await laterIssuer();
  assert.deepEqual(issuedLocalReceipt(invoice,account),{...recovered,status:'open'});
  assert.throws(()=>issuedLocalReceipt(invoice,{...account,stripe_customer_id:'cus_other'}),{code:'BILLING_LOCAL_INVOICE_REVIEW'});
  console.log('PASS: synthetic recurring LKR invoice 210002 minor units, lost-response replay, issued Quixo Inc. readback following issuer cutover and foreign customer denial');
}
