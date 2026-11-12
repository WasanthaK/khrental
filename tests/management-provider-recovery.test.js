import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {hash,BILLING_PRODUCT} from '../src/api/managementBilling/contract.js';
import {createManagementBillingRouter} from '../src/api/managementBilling/router.js';
import {uniqueProviderObject,requestObjectEvidence} from '../src/api/managementBilling/recoveryEvidence.js';
import {createRecoveryRunner} from '../src/api/managementBilling/recovery.js';

const id='11111111-1111-4111-8111-111111111111';
const fixture=()=>{
  let record={id,status:'draft',rules_json:JSON.stringify({market:'LK',billingCurrency:'USD',baseFeeMinor:500,rentCurrency:'LKR',
    includedRentMinor:2500000,excessPolicy:'none',effectiveAt:'2026-12-01T00:00:00Z',reason:'Synthetic publication recovery.'})};
  let audits=[],lost=false,failAudit=false,age=0,allowed=true,truncated=false;
  const prices=[],writes=[];
  const query=async(statement,params={})=>{
    if(statement.startsWith('SELECT * FROM dbo.management_pricing_versions')){return [structuredClone(record)];}
    if(statement.includes('DATEDIFF_BIG')){return [{age}];}
    if(statement.includes('SELECT current_hash')){return audits.filter(a=>a.action==='pricing.publication.attempt').map(a=>({current_hash:hash(a.current),created_at:new Date()}));}
    if(statement.startsWith('UPDATE dbo.management_pricing_versions')){record={...record,status:'sandbox_published',stripe_price_id:params.price};return [];}
    throw Error(`Unexpected SQL ${statement}`);
  };
  const store={locked:async(_key,action)=>{
    const before=structuredClone({record,audits});
    try{return await action(query);}catch(error){record=before.record;audits=before.audits;throw error;}
  },audit:async(_q,value)=>{
    if(failAudit&&value.action==='pricing.sandbox_published'){failAudit=false;throw Error('Synthetic audit rollback');}
    audits.push(structuredClone(value));
  }};
  const stripe={assertAccount:async()=>{},request:async(method,path,body,key)=>{
    if(method==='GET'){
      if(path==='/v1/prices'){return {data:structuredClone(prices),has_more:truncated};}
      return structuredClone(prices.find(p=>path.endsWith(p.id)));
    }
    assert.equal(path,'/v1/prices');writes.push({body,key});
    const price={...body,id:'price_recovered',livemode:false,active:true,type:'recurring',billing_scheme:'per_unit',
      recurring:{...body.recurring,interval_count:1}};prices.push(price);
    if(lost){lost=false;throw Object.assign(Error('Synthetic response loss'),{status:503});}
    return price;
  }};
  const router=createManagementBillingRouter({store,stripe,env:{MANAGEMENT_BILLING_SCHEMA_READY:'true',MANAGEMENT_RECOVERY_SCHEMA_READY:'true'},
    resolveContext:(req,_res,next)=>{req.authSession={};req.user={id};next();},checkPlatformAdmin:async()=>allowed});
  return {router,prices,writes,audits:()=>audits,record:()=>record,lose:()=>{lost=true;},failAudit:()=>{failAudit=true;},
    age:value=>{age=value;},revoke:()=>{allowed=false;},truncate:()=>{truncated=true;},change:()=>{record.rules_json=record.rules_json.replace('500','600');}};
};
const run=async(f,action)=>{
  const app=express();app.use(express.json());app.use(f.router);const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const post=async()=>{
    const r=await fetch(`http://127.0.0.1:${server.address().port}/admin/pricing/${id}/publish-sandbox`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    return {status:r.status,...await r.json()};
  };
  try{await action(post);}finally{await new Promise(resolve=>server.close(resolve));}
};
test('price publication response loss recovers original price after key age without another POST',async()=>{
  const f=fixture();f.lose();await run(f,async post=>{
    assert.equal((await post()).status,503);f.age(48*3600);
    const result=await post();assert.equal(result.status,200);assert.equal(result.data.stripePriceId,'price_recovered');
    assert.equal((await post()).status,200);assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].key,`quixo:pricing:${id}`);
    assert.equal(f.audits().filter(a=>a.action==='pricing.sandbox_published').length,1);
  });
});
test('price publication audit rollback preserves prepared intent and recovers provider effect once',async()=>{
  const f=fixture();f.failAudit();await run(f,async post=>{
    assert.equal((await post()).status,500);assert.equal(f.record().status,'draft');assert.equal(f.audits().length,1);
    assert.equal((await post()).status,200);assert.equal(f.writes.length,1);
  });
});
test('aged missing price evidence never creates a new price',async()=>{
  const f=fixture();f.age(48*3600);await run(f,async post=>{
    assert.equal((await post()).code,'BILLING_RECOVERY_EVIDENCE_REQUIRED');assert.equal(f.writes.length,0);
  });
});
test('price recovery rejects duplicate ownership, changed rules and revoked authority',async()=>{
  for(const mode of ['duplicate','rules','revoked']){
    const f=fixture();f.lose();await run(f,async post=>{
      assert.equal((await post()).status,503);
      if(mode==='duplicate'){f.prices.push({...f.prices[0],id:'price_duplicate'});}
      if(mode==='rules'){f.change();}
      if(mode==='revoked'){f.revoke();}
      const result=await post();assert.equal(result.status,mode==='revoked'?403:409);assert.equal(f.writes.length,1);
    });
  }
});
test('price recovery exhausts history and caps attempts without publishing or repeating writes',async()=>{
  const f=fixture();f.truncate();f.prices.push({id:'price_unrelated',product:BILLING_PRODUCT});
  await run(f,async post=>{
    for(let i=0;i<8;i++){assert.equal((await post()).code,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE');}
    assert.equal((await post()).code,'BILLING_RECOVERY_REVIEW');assert.equal(f.writes.length,0);assert.equal(f.record().status,'draft');
  });
});
test('bounded provider listing rejects malformed/incomplete pages and ambiguous matches',async()=>{
  for(const page of [{data:[],has_more:true},{data:[]},{data:[{id:'one'},{id:'two'}],has_more:false}]){
    await assert.rejects(uniqueProviderObject({stripe:{request:async()=>page},path:'/v1/checkout/sessions',matches:()=>true}));
  }
});
test('customer creation proof requires its original request key, sandbox event and metadata',async()=>{
  const now=Date.now(),object={id:'cus_new',livemode:false,metadata:{operation:'ours'}};
  const event={id:'evt_created',type:'customer.created',created:Math.floor(now/1000),livemode:false,request:{idempotency_key:'original'},data:{object}};
  const args={stripe:{request:async()=>({data:[event],has_more:false})},type:'customer.created',key:'original',since:new Date(now),clock:{now:()=>now},matches:c=>c.metadata.operation==='ours'};
  assert.equal((await requestObjectEvidence(args)).object.id,'cus_new');
  event.request.idempotency_key='another';assert.equal(await requestObjectEvidence(args),null);
  event.request.idempotency_key='original';event.livemode=true;assert.equal(await requestObjectEvidence(args),null);
});
test('ephemeral response checkpoint survives local completion failure without a second POST',async()=>{
  let step=null,completed=null,fail=true,writes=0;
  const journal={claim:async()=>completed?{completed:true,result:completed}:{token:'lease',job:{kind:'preview',attempts:1}},
    prepareStep:async args=>step||(step={input:args.input,idempotency_key:args.key,created_at:new Date()}),renew:async()=>{},
    completeStep:async({result})=>Object.assign(step,{completed_at:new Date(),result_json:JSON.stringify(result)}),
    finish:async({result})=>{if(fail){fail=false;throw Error('Local commit failed');}completed=result;return result;},fail:async()=>({review:false})};
  const runner=createRecoveryRunner({journal,handlers:{preview:async({step:runStep})=>runStep('preview',{input:{quantity:3},key:'fixed',
    read:async()=>({confirmed:false}),write:async()=>{writes++;return {total:500};},confirmResponse:async value=>({confirmed:true,result:{total:value.total}})})},logger:{}});
  await assert.rejects(runner.run({tenantId:'tenant',id:'command'}));assert.deepEqual(await runner.run({tenantId:'tenant',id:'command'}),{total:500});assert.equal(writes,1);
});
