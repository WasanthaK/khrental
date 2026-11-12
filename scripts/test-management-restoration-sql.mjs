import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';
import {inspectManagementRestoration} from './inspect-management-billing-schema.mjs';
import {BILLING_PRICE,entitlement} from '../src/api/managementBilling/contract.js';

export const verifyRestoration=async(pool,actorId)=>{
  const migration=fs.readFileSync('migrations/20261112_02_management_restoration.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  const inspection=await inspectManagementRestoration(pool);assert.equal(inspection.satisfied,true,inspection.detail);
  for(const mode of ['active','renewed','ending','complimentary','grace']){
    const tenantId=crypto.randomUUID(),propertyId=crypto.randomUUID(),second=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
    const env={MANAGEMENT_RESTORATION_SCHEMA_READY:'true',MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true',MANAGEMENT_INVENTORY_SCHEMA_READY:'true'};
    const store=createBillingStore({getPool:async()=>pool,env});
    await store.locked(tenantId,async q=>{
      await q("INSERT dbo.tenants(id,slug,status,[plan]) VALUES(@tenantId,@slug,'active','development-testing')",{tenantId,slug:`restore-${tenantId}`});
      await q("INSERT dbo.tenant_memberships(id,tenant_id,app_user_id,status,role) VALUES(@id,@tenantId,@actorId,'active','admin')",{id:crypto.randomUUID(),tenantId,actorId});
      for(const id of [propertyId,second]){await q("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Restoration SQL home','house','LK')",{id,tenantId});}
    });
    await store.enroll({tenantId,actorId,market:'LK',useApprovedSandboxBaseline:true,reason:'Disposable restoration acceptance.'});
    const sub={id:`sub_restore_${tenantId}`,customer:`cus_restore_${tenantId}`,object:'subscription',livemode:false,
      status:mode==='grace'?'past_due':'active',schedule:null,cancel_at_period_end:mode==='ending',latest_invoice:null,
      items:{data:[{id:'si_restore',quantity:2,current_period_end:now+86400,price:{id:BILLING_PRICE,currency:'usd',recurring:{interval:'month',usage_type:'licensed'}}}]}};
    await store.locked(tenantId,q=>q(`UPDATE dbo.management_billing_accounts SET stripe_customer_id=@customer,stripe_subscription_id=@subscription,
      stripe_item_id=@item,quantity=@quantity,subscription_status=@status,initial_payment_verified=@paid,paid_through=DATEADD(day,1,SYSUTCDATETIME()),
      grace_started_at=DATEADD(day,-1,SYSUTCDATETIME()),comp_type=@comp,cancel_at_period_end=@ending WHERE tenant_id=@tenantId`,
    {tenantId,customer:sub.customer,subscription:mode==='complimentary'?null:sub.id,item:mode==='complimentary'?null:'si_restore',quantity:mode==='complimentary'?0:2,
      status:mode==='complimentary'?'pending':sub.status,paid:mode==='complimentary'?0:1,comp:mode==='complimentary'?'ongoing':null,ending:mode==='ending'}));
    let schedule=null,lose=false,auditFault=false;const events=[],writes=[];
    const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body={},key)=>{
      if(method==='GET'){
        if(path===`/v1/subscriptions/${sub.id}`){return structuredClone(sub);}
        if(path.startsWith('/v1/subscription_schedules/')){assert.equal(path,`/v1/subscription_schedules/${schedule.id}`);return structuredClone(schedule);}
        if(path==='/v1/events'){return {data:structuredClone(events.filter(e=>e.type===body.type)),has_more:false};}
        throw Error(`Unexpected restoration read ${path}`);
      }
      assert.equal(method,'POST');assert.ok(key);
      assert.equal((await store.read('SELECT name FROM dbo.management_billing_steps WHERE idempotency_key=@key',{key})).length,1);
      writes.push({path,key,body:structuredClone(body)});let object,type;
      if(path==='/v1/subscription_schedules'){
        schedule={id:`sched_restore_${tenantId}`,livemode:false,status:'active',customer:sub.customer,subscription:sub.id,
          current_phase:{start_date:now-86400},phases:[],end_behavior:'release'};sub.schedule=schedule.id;object=schedule;type='subscription_schedule.created';
      }else if(path===`/v1/subscription_schedules/${schedule?.id}/release`){
        Object.assign(schedule,{status:'released',subscription:null,released_subscription:sub.id});sub.schedule=null;sub.cancel_at_period_end=false;object=schedule;type='subscription_schedule.released';
      }else if(path===`/v1/subscription_schedules/${schedule?.id}`){Object.assign(schedule,body);object=schedule;type='subscription_schedule.updated';}
      else{
        assert.equal(path,`/v1/subscriptions/${sub.id}`);
        if(body.items){sub.items.data[0].quantity=body.items[0].quantity;}else{sub.cancel_at_period_end=body.cancel_at_period_end;}
        object=sub;type='customer.subscription.updated';
      }
      events.push({id:`evt_restore_${tenantId}_${writes.length}`,type,livemode:false,created:now,request:{idempotency_key:key},data:{object:structuredClone(object)}});
      if(lose){lose=false;throw Object.assign(Error('Restoration response lost'),{status:503,code:'STRIPE_UNAVAILABLE'});}
      return structuredClone(object);
    }};
    const service=createBillingService({store:{...store,audit:async(q,args)=>{
      if(auditFault&&args.action==='sandbox.restore.recovered'){auditFault=false;throw Error('Restoration audit rollback');}return store.audit(q,args);
    }},stripe,env});
    const due=id=>store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id}));
    const cease=async propertyId=>{
      const preview=await service.cessationPreview({tenantId,actorId,propertyId});
      return service.ceaseStock({tenantId,actorId,id:crypto.randomUUID(),propertyId,inventoryHash:preview.inventoryHash,reason:'Close obligations before restoration proof.'});
    };
    await cease(propertyId);
    if(mode==='renewed'){
      sub.items.data[0].quantity=1;sub.schedule=null;
      await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET quantity=1,stripe_schedule_id=NULL,pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId}));
    }
    if(mode==='grace'){
      // Cleanup reduced current quantity. Recovery of paid capacity is explicit;
      // it is never silently purchased by a grace restoration.
      await assert.rejects(service.restorationPreview({tenantId,actorId,propertyId}),{code:'BILLING_RESTORE_CAPACITY_REQUIRED'});
      sub.items.data[0].quantity=2;
      await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET quantity=2 WHERE tenant_id=@tenantId',{tenantId}));
    }
    const before=await store.account(tenantId),preview=await service.restorationPreview({tenantId,actorId,propertyId});
    const id=crypto.randomUUID(),args={tenantId,actorId,id,propertyId,inventoryHash:preview.inventoryHash,reason:'Restore management without backdating.'};
    if(['active','renewed'].includes(mode)){
      lose=true;await assert.rejects(service.restoreStock(args),{code:'STRIPE_UNAVAILABLE'});await due(id);
      assert.equal((await store.inventory(tenantId)).length,1);
    }
    auditFault=true;await assert.rejects(service.restoreStock(args),/Restoration audit rollback/);
    assert.equal((await store.inventory(tenantId)).length,1,'Final audit rollback retains active cessation and private stock');
    await assert.rejects(store.locked(tenantId,q=>q("UPDATE dbo.properties SET status='available' WHERE id=@id",{id:propertyId})),/Management has ceased/);
    await due(id);const count=writes.length,result=await service.restoreStock(args);
    assert.equal(result.managementRestored,true);assert.equal((await store.inventory(tenantId)).length,2);
    assert.equal(writes.length,count,'Checkpoint/readback resumes without repeating provider writes');
    assert.deepEqual(await service.restoreStock(args),result);
    await assert.rejects(service.restorationPreview({tenantId,actorId,propertyId}),{code:'BILLING_RESTORE_NOT_CEASED'});
    const restored=(await store.read('SELECT * FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId AND property_id=@propertyId',{tenantId,propertyId}))[0];
    assert.ok(restored.restored_at>=restored.ceased_at);assert.equal(String(restored.restoration_command_id).toLowerCase(),id);
    const after=await store.account(tenantId);assert.deepEqual(after.comp_expires_at,before.comp_expires_at);assert.deepEqual(after.grace_started_at,before.grace_started_at);
    if(mode==='ending'){assert.equal(sub.cancel_at_period_end,true);assert.equal(writes.length,0);}
    if(mode==='complimentary'){assert.equal(writes.length,0);assert.equal(entitlement(after).state,'complimentary');}
    assert.equal((await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId)).status,'consistent');
    await cease(propertyId);
    const episodes=await store.read('SELECT id,restored_at FROM dbo.management_inventory_controls WHERE tenant_id=@tenantId AND property_id=@propertyId',{tenantId,propertyId});
    assert.equal(episodes.length,2);assert.equal(episodes.filter(r=>!r.restored_at).length,1);
    assert.equal((await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId)).status,'consistent');
    if(mode==='active'){
      sub.status='canceled';sub.cancel_at_period_end=false;sub.schedule=null;
      await assert.rejects(service.restorationPreview({tenantId,actorId,propertyId}),{code:'BILLING_REACTIVATION_REQUIRED'});
      assert.equal((await store.inventory(tenantId)).length,1);
    }
  }
  console.log('PASS: restoration SQL history/guard preservation, response-loss, rollback/retry, paid/ending/complimentary/grace capacity, cancelled reactivation denial and cease-restore-cease invariants; synthetic provider');
};
