import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';

export const verifyQuantityRecovery=async(pool,{tenantId,actorId,stripe,remote,calls,retiredFixtureId})=>{
  const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_INVENTORY_SCHEMA_READY:'true'};
  const store=createBillingStore({getPool:async()=>pool,env});
  const account=await store.account(tenantId),sub=remote.get(`/v1/subscriptions/${account.stripe_subscription_id}`);
  const existing=[crypto.randomUUID(),crypto.randomUUID()],prepared=crypto.randomUUID();
  await store.locked(tenantId,async q=>{
    // Retire only the artificial exhausted-lease fixture from the preceding proof.
    await q("UPDATE dbo.management_billing_commands SET status='failed' WHERE id=@id",{id:retiredFixtureId});
    await q('UPDATE dbo.management_billing_accounts SET stripe_schedule_id=NULL,pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});
    for(const id of existing){await q(`INSERT dbo.properties(id,tenant_id,name,propertytype,country_code)
      VALUES(@id,@tenantId,'Synthetic recovery home','house','LK')`,{id,tenantId});}
  });
  sub.cancel_at_period_end=false;sub.schedule=null;
  const events=[];let fault=null;
  const transport={...stripe,request:async(method,path,body={},key)=>{
    if(method==='GET'&&path==='/v1/events'&&['customer.subscription.updated','subscription_schedule.created','subscription_schedule.updated'].includes(body.type)){
      return {data:events.filter(e=>e.type===body.type&&e.created>=body.created.gte),has_more:false};
    }
    const value=await stripe.request(method,path,body,key);
    if(method==='POST'){
      let type;
      if(path==='/v1/subscription_schedules'){
        type='subscription_schedule.created';value.livemode=false;remote.get(`/v1/subscription_schedules/${value.id}`).livemode=false;
      }else if(path.startsWith('/v1/subscription_schedules/')&&!path.endsWith('/release')){type='subscription_schedule.updated';}
      else if(path.startsWith('/v1/subscriptions/')){type='customer.subscription.updated';}
      if(type){events.push({id:`evt_recovery_${events.length}`,type,created:Math.floor(Date.now()/1000),livemode:false,
        request:{idempotency_key:key},data:{object:structuredClone(value)}});}
      if(path===fault){fault=null;throw Object.assign(new Error('Synthetic quantity recovery response loss'),{status:503,code:'STRIPE_UNAVAILABLE'});}
    }
    return value;
  }};
  const service=createBillingService({store,stripe:transport,env});
  await service.refresh(tenantId);
  await store.stageStock({tenantId,actorId,reason:'Synthetic prepared recovery proof.',records:[{kind:'property',payload:{
    id:prepared,name:'Prepared recovery home',propertytype:'house',country_code:'LK'}}]});
  const applyWithLoss=async(path,{extraPosts=0}={})=>{
    const preview=await service.quantityPreview({tenantId,actorId,id:crypto.randomUUID()}),id=crypto.randomUUID();
    fault=path;
    await assert.rejects(service.quantityApply({tenantId,actorId,id,previewId:preview.previewId}),{code:'STRIPE_UNAVAILABLE'});
    const posts=calls.filter(c=>c.method==='POST').length;
    await store.locked(tenantId,async q=>{
      await q('UPDATE dbo.management_billing_steps SET created_at=DATEADD(hour,-48,SYSUTCDATETIME()) WHERE command_id=@id',{id});
      await q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id});
    });
    const result=await service.quantityApply({tenantId,actorId,id,previewId:preview.previewId});
    assert.deepEqual(await service.quantityApply({tenantId,actorId,id,previewId:preview.previewId}),result);
    assert.equal(calls.filter(c=>c.method==='POST').length,posts+extraPosts,'Recovery repeats no already-proven provider effect');
    assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='sandbox.quantity_apply.recovered'",{id})).length,1);
    return result;
  };
  const increased=await applyWithLoss(`/v1/subscriptions/${sub.id}`);assert.equal(increased.currentQuantity,3);
  assert.equal((await store.inventory(tenantId)).length,3);
  assert.equal((await store.read('SELECT status FROM dbo.management_inventory_staging WHERE id=@id',{id:prepared}))[0].status,'promoted');
  assert.equal((await store.read('SELECT name FROM dbo.properties WHERE id=@id',{id:prepared}))[0].name,'Prepared recovery home');
  await store.locked(tenantId,q=>q('DELETE dbo.properties WHERE id=@id AND tenant_id=@tenantId',{id:existing[0],tenantId}));
  const decreased=await applyWithLoss('/v1/subscription_schedules',{extraPosts:1});
  assert.equal(decreased.currentQuantity,3);assert.equal(decreased.nextRenewalQuantity,2);
  await store.locked(tenantId,q=>q('DELETE dbo.properties WHERE id=@id AND tenant_id=@tenantId',{id:existing[1],tenantId}));
  const scheduleId=(await store.account(tenantId)).stripe_schedule_id;
  const phased=await applyWithLoss(`/v1/subscription_schedules/${scheduleId}`);assert.equal(phased.nextRenewalQuantity,1);
  await store.locked(tenantId,q=>q('DELETE dbo.properties WHERE id=@id AND tenant_id=@tenantId',{id:prepared,tenantId}));
  const ended=await applyWithLoss(`/v1/subscriptions/${sub.id}`);assert.equal(ended.currentQuantity,3);assert.equal(ended.nextRenewalQuantity,0);
  assert.equal(ended.cancelAtPeriodEnd,true);assert.equal((await store.account(tenantId)).pending_quantity,0);
  assert.equal(calls.some(c=>c.body.items?.some(i=>i.quantity===0)||c.body.phases?.some(p=>p.items.some(i=>i.quantity===0))),false);
  console.log('PASS: journaled increase with exact staged promotion, schedule creation/phases, zero-stock cancellation, aged request evidence and no duplicate effects; real SQL with synthetic Stripe');
};
