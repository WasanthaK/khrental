// R5 row 32: read-only reconciliation for an ambiguous deployed issuer-cutover attempt.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createStripeClient} from '/app/src/api/managementBilling/stripe.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const store=createBillingStore(),stripe=createStripeClient();
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
  assert.equal(process.env.MANAGEMENT_BILLING_SCHEMA_READY,'true');
  await stripe.assertAccount();

  const [tenants,assignments,issuers,accounts,users,clocks,customers]=await Promise.all([
    store.read('SELECT id FROM dbo.tenants WHERE id=@id',{id:operation}),
    store.read('SELECT id FROM dbo.management_market_issuer_assignments WHERE market=\'XZ\''),
    store.read(`SELECT id FROM dbo.management_invoice_issuers
      WHERE legal_name IN ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')`),
    store.read('SELECT tenant_id FROM dbo.management_billing_accounts WHERE tenant_id=@id',{id:operation}),
    store.read('SELECT id FROM dbo.app_users WHERE tenant_id=@id OR email=@email',
      {id:operation,email:`r5-issuer-${operation}@example.invalid`}),
    listAll('test_helpers/test_clocks').then(values=>values.filter(value=>value.name===label)),
    read('customers/search',{query:`metadata['acceptance_fixture']:'${operation}'`,limit:100}).then(result=>result.data),
  ]);
  const providerLiveObjects=[...clocks,...customers].filter(value=>value.livemode!==false);
  const result={
    operation,readOnly:true,liveChargingEnabled:false,safeToRetry:false,
    sql:{tenants:tenants.length,assignments:assignments.length,issuers:issuers.length,
      accounts:accounts.length,users:users.length},
    provider:{clocks:clocks.length,customers:customers.length,liveObjects:providerLiveObjects.length},
  };
  result.safeToRetry=Object.values(result.sql).every(count=>count===0)&&
    result.provider.clocks===0&&result.provider.customers===0&&result.provider.liveObjects===0;
  console.log('LK_ISSUER_RECONCILIATION='+JSON.stringify(result));
  assert.equal(result.safeToRetry,true,'Ambiguous issuer-cutover residue requires manual cleanup; do not dispatch');
}catch(error){
  console.error('LK_ISSUER_RECONCILIATION_FAILED='+JSON.stringify({operation,code:error.code||'ASSERTION'}));
  process.exitCode=1;
}finally{await closeMssqlPool();}
