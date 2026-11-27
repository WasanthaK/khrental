import assert from 'node:assert/strict';
import {once} from 'node:events';
import express from 'express';
import {BILLING_PRODUCT,problem} from '../src/api/managementBilling/contract.js';
import {createManagementBillingRouter} from '../src/api/managementBilling/router.js';

export async function verifyPricePublicationRecovery(store,actorId){
  const prices=[];
  let hide=false,authorized=true,writes=0;
  const stripe={assertAccount:async()=>{},request:async(method,path,body,key)=>{
    if(method==='GET' && path==='/v1/prices'){return {data:hide?[]:prices,has_more:false};}
    if(method==='GET'){return prices.find(price=>path==='/v1/prices/'+price.id);}
    assert.equal(path,'/v1/prices');assert.equal(key,'quixo:pricing:'+body.metadata.pricing_version);
    writes++;
    prices.push({...body,id:'price_publication'+writes,active:true,livemode:false,type:'recurring',billing_scheme:'per_unit',
      recurring:{...body.recurring,interval_count:1}});
    throw problem(503,'STRIPE_UNAVAILABLE','Synthetic response loss after publication.');
  }};
  const app=express();
  app.use(express.json());
  app.use(createManagementBillingRouter({store,stripe,env:{MANAGEMENT_BILLING_SCHEMA_READY:'true',MANAGEMENT_RECOVERY_SCHEMA_READY:'true'},
    resolveContext:(req,_res,next)=>{req.authSession={};req.user={id:actorId};next();},
    checkPlatformAdmin:async(_user,options)=>!options||authorized}));
  const server=app.listen(0,'127.0.0.1');
  try{
    await once(server,'listening');
    const versions=await store.listPricing();
    const latest=Math.max(0,...versions.filter(v=>v.market==='LK').map(v=>v.version));
    const rules={market:'LK',billingCurrency:'USD',baseFeeMinor:731,rentCurrency:'LKR',includedRentMinor:0,excessPolicy:'none',
      effectiveAt:'2026-01-01T00:00:00Z',reason:'Synthetic publication recovery fixture only'};
    const version=await store.savePricing({rules,expectedVersion:latest,actorId});
    const publish=async()=>{
      const res=await fetch('http://127.0.0.1:'+server.address().port+'/admin/pricing/'+version.id+'/publish-sandbox',
        {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      return {status:res.status,body:await res.json()};
    };
    assert.equal((await publish()).body.code,'STRIPE_UNAVAILABLE');
    assert.equal(writes,1);assert.equal(prices[0].product,BILLING_PRODUCT);
    hide=true;
    assert.equal((await publish()).body.code,'BILLING_RECOVERY_EVIDENCE_REQUIRED');
    hide=false;authorized=false;
    assert.equal((await publish()).status,403);
    authorized=true;
    const recovered=await publish();
    assert.equal(recovered.status,200,JSON.stringify(recovered.body));
    assert.equal(recovered.body.data.stripePriceId,prices[0].id);
    assert.equal((await publish()).status,200);
    assert.equal(writes,1);
    const [audit]=await store.read("SELECT COUNT(*) AS count FROM dbo.management_billing_audit WHERE resource_id=@id AND action='pricing.sandbox_published'",{id:version.id});
    assert.equal(audit.count,1);
    const expired=await store.savePricing({rules:{...rules,baseFeeMinor:732},expectedVersion:latest+1,actorId});
    await store.read('UPDATE dbo.management_pricing_versions SET created_at=DATEADD(day,-2,SYSUTCDATETIME()) WHERE id=@id',{id:expired.id});
    const stale=await fetch('http://127.0.0.1:'+server.address().port+'/admin/pricing/'+expired.id+'/publish-sandbox',
      {method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    assert.equal((await stale.json()).code,'BILLING_RECOVERY_EVIDENCE_REQUIRED');assert.equal(writes,1);
    console.log('PASS: synthetic price publication response loss, original price recovery, one publication audit, missing and expired evidence denial and revoked administrator');
  }finally{await new Promise(resolve=>server.close(resolve));}
}
