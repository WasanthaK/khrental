import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createRecoveryJournal} from '../src/api/managementBilling/recoveryJournal.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';
import {inspectManagementSplits} from './inspect-management-billing-schema.mjs';
import {BILLING_PRICE,entitlement} from '../src/api/managementBilling/contract.js';

export const verifySplits=async(pool,actorId)=>{
  const migration=fs.readFileSync('migrations/20261112_03_management_splits.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  const inspection=await inspectManagementSplits(pool);assert.equal(inspection.satisfied,true,inspection.detail);
  for(const mode of ['active','complimentary','grace']){
    const tenantId=crypto.randomUUID(),propertyId=crypto.randomUUID(),second=crypto.randomUUID(),now=Math.floor(Date.now()/1000);
    const env={MANAGEMENT_SPLIT_SCHEMA_READY:'true',MANAGEMENT_RESTORATION_SCHEMA_READY:'true',MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true',MANAGEMENT_INVENTORY_SCHEMA_READY:'true'};
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
      if(auditFault&&args.action==='sandbox.split.recovered'){auditFault=false;throw Error('Split audit rollback');}return store.audit(q,args);
    }},stripe,env});
    const due=id=>store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id}));
    const units=[1,2,3].map(n=>({id:crypto.randomUUID(),propertyid:propertyId,unitnumber:`Unit ${n}`}));
    const parentAgreement=crypto.randomUUID();
    await store.locked(tenantId,q=>q("INSERT dbo.agreements(id,tenant_id,propertyid,status) VALUES(@id,@tenantId,@propertyId,'active')",{id:parentAgreement,tenantId,propertyId}));
    const before=await store.account(tenantId),preview=await service.splitPreview({tenantId,actorId,propertyId,units});
    assert.equal(preview.to,4);assert.equal(preview.from,mode==='complimentary'?0:2);
    const id=crypto.randomUUID(),args={tenantId,actorId,id,propertyId,units,inventoryHash:preview.inventoryHash,reason:'Split dwelling while retaining the original tenancy.'};
    if(mode!=='complimentary'){
      lose=true;await assert.rejects(service.splitStock(args),{code:'STRIPE_UNAVAILABLE'});await due(id);
      assert.equal((await store.inventory(tenantId)).length,2,'Reserved units are not live stock');
      assert.equal((await store.read('SELECT id FROM dbo.property_units WHERE propertyid=@propertyId',{propertyId})).length,0);
      assert.equal((await store.read('SELECT id FROM dbo.management_inventory_split_units WHERE command_id=@id',{id})).length,3);
    }
    auditFault=true;await assert.rejects(service.splitStock(args),/Split audit rollback/);
    assert.equal((await store.inventory(tenantId)).length,2,'Final audit failure rolls activation back');
    await due(id);const posts=writes.length,result=await service.splitStock(args);
    assert.equal(result.splitCompleted,true);assert.equal((await store.inventory(tenantId)).length,4);
    assert.equal(writes.length,posts,'Recovery reads confirmed billing without repeating effects');
    assert.deepEqual(await service.splitStock(args),result);
    const after=await store.account(tenantId);
    assert.deepEqual(after.comp_expires_at,before.comp_expires_at);assert.deepEqual(after.grace_started_at,before.grace_started_at);
    if(mode==='complimentary'){assert.equal(writes.length,0);assert.equal(entitlement(after).state,'complimentary');}
    else{
      assert.equal(sub.items.data[0].quantity,2);assert.deepEqual(schedule.phases.map(p=>p.items[0].quantity),[2,4]);
      assert.equal(schedule.proration_behavior,'none');assert.equal(after.pending_quantity,4);
      assert.equal(sub.latest_invoice,null);assert.ok(writes.every(w=>w.path.startsWith('/v1/subscription_schedules')));
    }
    const inspection=await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId);
    assert.equal(inspection.status,'consistent',JSON.stringify(inspection));
    await assert.rejects(service.splitPreview({tenantId,actorId,propertyId,units}),{code:'BILLING_SPLIT_ALREADY_SPLIT'});
    await assert.rejects(store.locked(tenantId,q=>q("INSERT dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(NEWID(),@tenantId,@propertyId,@unit,'draft')",{tenantId,propertyId,unit:units[0].id})),/cannot overlap/);
    await assert.rejects(store.locked(tenantId,q=>q('DELETE dbo.property_units WHERE id=@id',{id:units[0].id})),/Retain split identity/);
    await store.locked(tenantId,q=>q("UPDATE dbo.agreements SET status='closed' WHERE id=@id",{id:parentAgreement}));
    const childAgreement=crypto.randomUUID();
    await store.locked(tenantId,q=>q("INSERT dbo.agreements(id,tenant_id,propertyid,unitid,status) VALUES(@id,@tenantId,@propertyId,@unit,'active')",{id:childAgreement,tenantId,propertyId,unit:units[0].id}));
    await assert.rejects(store.locked(tenantId,q=>q("UPDATE dbo.agreements SET status='active' WHERE id=@id",{id:parentAgreement})),/cannot overlap/);
    await store.locked(tenantId,q=>q("UPDATE dbo.agreements SET status='closed' WHERE id=@id",{id:childAgreement}));
    if(mode==='active'||mode==='complimentary'){
      const ceasePreview=await service.cessationPreview({tenantId,actorId,propertyId,unitId:units[0].id});
      await service.ceaseStock({tenantId,actorId,id:crypto.randomUUID(),propertyId,unitId:units[0].id,inventoryHash:ceasePreview.inventoryHash,reason:'End one split unit after obligations close.'});
      const restorePreview=await service.restorationPreview({tenantId,actorId,propertyId,unitId:units[0].id});
      await service.restoreStock({tenantId,actorId,id:crypto.randomUUID(),propertyId,unitId:units[0].id,inventoryHash:restorePreview.inventoryHash,reason:'Restore the retained split unit for management.'});
      assert.equal((await store.inventory(tenantId)).length,4);
      const check=await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId);
      assert.equal(check.status,'consistent',JSON.stringify(check));
    }
    if(mode==='complimentary'){
      // Restored-parent -> split -> cease, including both original children.
      const secondCease=await service.cessationPreview({tenantId,actorId,propertyId:second});
      await service.ceaseStock({tenantId,actorId,id:crypto.randomUUID(),propertyId:second,inventoryHash:secondCease.inventoryHash,reason:'Cease before testing restored parent split.'});
      const secondRestore=await service.restorationPreview({tenantId,actorId,propertyId:second});
      await service.restoreStock({tenantId,actorId,id:crypto.randomUUID(),propertyId:second,inventoryHash:secondRestore.inventoryHash,reason:'Restore before splitting the same parent.'});
      const childUnits=[1,2].map(n=>({id:crypto.randomUUID(),propertyid:second,unitnumber:`Child ${n}`}));
      const fresh=await service.splitPreview({tenantId,actorId,propertyId:second,units:childUnits});
      const rollbackId=crypto.randomUUID(),payload={propertyId:second,units:childUnits,inventoryHash:fresh.inventoryHash,reason:'Prove reservation compensation before external intent.'};
      await store.beginCommand({tenantId,actorId,id:rollbackId,kind:'split',payload,recovery:true,prepareRecovery:async q=>{
        await store.reserveSplitLocked(q,{tenantId,actorId,id:rollbackId,...payload});return {};
      }});
      const journal=createRecoveryJournal({store,complete:async()=>({})}),claim=await journal.claim({tenantId,id:rollbackId});
      await journal.fail({tenantId,id:rollbackId,token:claim.token,review:true,code:'BILLING_SPLIT_STATE_CHANGED',delaySeconds:30});
      assert.equal((await store.read('SELECT id FROM dbo.management_inventory_split_units WHERE command_id=@id',{id:rollbackId})).length,0);
      assert.equal((await store.read('SELECT state FROM dbo.management_inventory_splits WHERE command_id=@id',{id:rollbackId}))[0].state,'aborted');
      await service.splitStock({tenantId,actorId,id:crypto.randomUUID(),...payload});
      const parentCease=await service.cessationPreview({tenantId,actorId,propertyId:second});
      await service.ceaseStock({tenantId,actorId,id:crypto.randomUUID(),propertyId:second,inventoryHash:parentCease.inventoryHash,reason:'Cease restored and split parent with both units.'});
      assert.equal((await store.inventory(tenantId)).length,3);
      const parentRestore=await service.restorationPreview({tenantId,actorId,propertyId:second});
      await service.restoreStock({tenantId,actorId,id:crypto.randomUUID(),propertyId:second,inventoryHash:parentRestore.inventoryHash,reason:'Restore split parent and both retained units.'});
      assert.equal((await store.inventory(tenantId)).length,5);
      assert.equal((await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId)).status,'consistent');
    }
    assert.equal((await store.read('SELECT propertyid,unitid FROM dbo.agreements WHERE id=@id',{id:parentAgreement}))[0].unitid,null);
  }
  console.log('PASS: split reservations, no-proration renewal billing, lost response, atomic activation/audit rollback, duplicate recovery, parent rental retention and overlap guards, split/cease/restore invariants');
};
