// R5 row 32: read-only Stripe sandbox reconciliation for an ambiguous operation.
import assert from 'node:assert/strict';
import {createStripeClient} from '../src/api/managementBilling/stripe.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const stripe=createStripeClient();
const label='R5 synthetic deployed issuer cutover '+operation;
const read=(resource,params)=>stripe.request('GET','/v1/'+resource,params);

const listAll=async(resource,params={})=>{
  const values=[];
  let cursor;
  for(let page=0;page<20;page++){
    const result=await read(resource,{...params,limit:100,...(cursor?{starting_after:cursor}:{})});
    assert.ok(Array.isArray(result.data));
    values.push(...result.data);
    if(!result.has_more){return values;}
    cursor=result.data.at(-1)?.id;assert.ok(cursor);
  }
  assert.fail('Provider pagination exceeded the reconciliation bound');
};

try{
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  await stripe.assertAccount();
  const [allClocks,customerSearch]=await Promise.all([
    listAll('test_helpers/test_clocks'),
    read('customers/search',{query:`metadata['acceptance_fixture']:'${operation}'`,limit:100}),
  ]);
  assert.ok(Array.isArray(customerSearch.data));
  const clocks=allClocks.filter(value=>value.name===label);
  const customers=customerSearch.data;
  const liveObjects=[...clocks,...customers].filter(value=>value.livemode!==false);
  const result={operation,readOnly:true,liveChargingEnabled:false,
    clocks:clocks.length,customers:customers.length,liveObjects:liveObjects.length};
  result.safeToRetry=result.clocks===0&&result.customers===0&&result.liveObjects===0;
  console.log('LK_ISSUER_PROVIDER_RECONCILIATION='+JSON.stringify(result));
  assert.equal(result.safeToRetry,true,'Stripe sandbox residue requires cleanup; do not dispatch');
}catch(error){
  console.error('LK_ISSUER_PROVIDER_RECONCILIATION_FAILED='+JSON.stringify({operation,code:error.code||'ASSERTION'}));
  process.exitCode=1;
}
