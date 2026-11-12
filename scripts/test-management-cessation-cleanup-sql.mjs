import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';
import {BILLING_PRICE,entitlement} from '../src/api/managementBilling/contract.js';

// Disposable SQL only. Provider state/events are synthetic and never sent out.
export const verifyCessationCleanup=async(pool,actorId)=>{
  for(const scenario of ['grace','trial','grace_expiry','trial_risk']){
    const mode=scenario.split('_')[0],tenantId=crypto.randomUUID(),properties=[crypto.randomUUID(),crypto.randomUUID()];
    const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_INVENTORY_SCHEMA_READY:'true',MANAGEMENT_CESSATION_SCHEMA_READY:'true'};
    const store=createBillingStore({getPool:async()=>pool,env}),now=Math.floor(Date.now()/1000);
    const customer=`cus_${tenantId}`,subscriptionId=`sub_${tenantId}`,scheduleId=`sched_${tenantId}`;
    await store.locked(tenantId,async q=>{
      await q("INSERT dbo.tenants(id,slug,status,[plan]) VALUES(@tenantId,@slug,'active','development-testing')",{tenantId,slug:`cleanup-${tenantId}`});
      await q("INSERT dbo.tenant_memberships(id,tenant_id,app_user_id,status,role) VALUES(@id,@tenantId,@actorId,'active','admin')",{id:crypto.randomUUID(),tenantId,actorId});
      for(const id of properties){await q("INSERT dbo.properties(id,tenant_id,name,propertytype,country_code) VALUES(@id,@tenantId,'Cleanup SQL home','house','LK')",{id,tenantId});}
    });
    await store.enroll({tenantId,actorId,market:'LK',useApprovedSandboxBaseline:true,reason:'Synthetic cessation cleanup proof.'});
    const sub={id:subscriptionId,object:'subscription',customer,livemode:false,status:mode==='trial'?'trialing':'past_due',
      trial_start:mode==='trial'?now-86400:null,trial_end:mode==='trial'?now+86400:null,schedule:scheduleId,cancel_at_period_end:false,
      latest_invoice:`in_${tenantId}`,items:{data:[{id:'si_cleanup',quantity:2,current_period_end:now+86400,
        price:{id:BILLING_PRICE,currency:'usd',recurring:{interval:'month',usage_type:'licensed'}}}]}};
    const schedule={id:scheduleId,livemode:false,status:'active',customer,subscription:subscriptionId,phases:[],end_behavior:'release'};
    const invoice={id:sub.latest_invoice,object:'invoice',livemode:false,customer,subscription:subscriptionId,currency:'usd',
      status:'open',attempted:true,created:now-86400,amount_due:1000,amount_remaining:1000,amount_paid:0,lines:{data:[],has_more:false}};
    const originalInvoice=structuredClone(invoice),events=[{id:`evt_failure_${tenantId}`,type:'invoice.payment_failed',livemode:false,created:now-86400,data:{object:structuredClone(invoice)}}],writes=[];
    await store.locked(tenantId,q=>q(`UPDATE dbo.management_billing_accounts SET stripe_customer_id=@customer,stripe_subscription_id=@subscription,
      stripe_item_id='si_cleanup',stripe_schedule_id=@schedule,subscription_status=@status,quantity=2,initial_payment_verified=@paid,
      grace_started_at=@grace WHERE tenant_id=@tenantId`,
    {tenantId,customer,subscription:subscriptionId,schedule:scheduleId,status:sub.status,paid:mode==='grace'?1:0,grace:new Date((now-86400)*1000)}));
    let lose=false,auditFault=false,beforeWriteFault=false;
    const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body={},key)=>{
      if(method==='GET'){
        if(path===`/v1/subscriptions/${subscriptionId}`){return structuredClone(sub);}
        if(path===`/v1/subscription_schedules/${scheduleId}`){return structuredClone(schedule);}
        if(path===`/v1/invoices/${invoice.id}`){return structuredClone(invoice);}
        if(path==='/v1/events'){return {data:structuredClone(events.filter(e=>e.type===body.type)),has_more:false};}
        if(path.startsWith('/v1/events/')){return structuredClone(events.find(e=>path.endsWith(e.id)));}
        throw Error(`Unexpected cleanup read ${path}`);
      }
      assert.equal(method,'POST');assert.ok(key);
      assert.equal((await store.read('SELECT name FROM dbo.management_billing_steps WHERE idempotency_key=@key',{key})).length,1);
      if(beforeWriteFault){beforeWriteFault=false;throw Object.assign(Error('Before provider write'),{status:503,code:'STRIPE_UNAVAILABLE'});}
      writes.push({path,key,body:structuredClone(body)});let type,object;
      if(path===`/v1/subscription_schedules/${scheduleId}/release`){
        assert.deepEqual(body,{preserve_cancel_date:false});sub.schedule=null;sub.cancel_at_period_end=false;
        Object.assign(schedule,{status:'released',subscription:null,released_subscription:subscriptionId});type='subscription_schedule.released';object=schedule;
      }else{
        assert.equal(path,`/v1/subscriptions/${subscriptionId}`);assert.equal(body.proration_behavior,'none');
        assert.deepEqual(Object.keys(body).sort(),body.items?['items','proration_behavior']:['cancel_at_period_end','proration_behavior']);
        if(body.items){assert.ok(body.items[0].quantity>0);sub.items.data[0].quantity=body.items[0].quantity;}
        else{sub.cancel_at_period_end=body.cancel_at_period_end;}
        type='customer.subscription.updated';object=sub;
      }
      events.push({id:`evt_cleanup_${tenantId}_${writes.length}`,type,livemode:false,created:now,request:{idempotency_key:key},data:{object:structuredClone(object)}});
      if(lose){lose=false;throw Object.assign(Error('Lost cleanup response'),{status:503,code:'STRIPE_UNAVAILABLE'});}
      return structuredClone(object);
    }};
    const service=createBillingService({store:{...store,audit:async(q,args)=>{
      if(auditFault&&args.action==='sandbox.cessation.recovered'){auditFault=false;throw Error('Cleanup audit rollback');}
      return store.audit(q,args);
    }},stripe,env});
    const due=id=>store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id}));
    const graceBefore=(await store.account(tenantId)).grace_started_at;
    for(const [index,propertyId] of properties.entries()){
      const preview=await service.cessationPreview({tenantId,actorId,propertyId});assert.equal(preview.eligible,true);assert.equal(preview.cleanupMode,mode);
      const id=crypto.randomUUID(),args={tenantId,actorId,id,propertyId,inventoryHash:preview.inventoryHash,reason:'Cleanup interruption and atomic completion proof.'};
      if(scenario.includes('_')){
        beforeWriteFault=true;await assert.rejects(service.ceaseStock(args),{code:'STRIPE_UNAVAILABLE'});
        await store.locked(tenantId,q=>q(scenario==='grace_expiry'?
          'UPDATE dbo.management_billing_accounts SET grace_started_at=DATEADD(day,-8,SYSUTCDATETIME()) WHERE tenant_id=@tenantId':
          'UPDATE dbo.management_billing_accounts SET risk_hold=1 WHERE tenant_id=@tenantId',{tenantId}));
        await due(id);await assert.rejects(service.ceaseStock(args),{code:'BILLING_CESSATION_STATE_CHANGED'});
        assert.equal(writes.length,0);assert.equal((await store.inventory(tenantId)).length,2);
        assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id}))[0].state,'failed_needs_review');break;
      }
      lose=true;await assert.rejects(service.ceaseStock(args),{code:'STRIPE_UNAVAILABLE'});
      assert.equal((await store.inventory(tenantId)).length,2-index);
      await due(id);auditFault=true;await assert.rejects(service.ceaseStock(args),/Cleanup audit rollback/);
      assert.equal((await store.inventory(tenantId)).length,2-index);
      await due(id);const result=await service.ceaseStock(args);assert.equal(result.managementEnded,true);assert.equal(result.cleanupMode,mode);
      assert.deepEqual(await service.ceaseStock(args),result);assert.deepEqual(invoice,originalInvoice);
      assert.equal((await store.inventory(tenantId)).length,1-index);
      const check=await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId);
      assert.equal(check.status,'consistent',check.issues.join(','));
      const event=events.filter(e=>e.type==='customer.subscription.updated').at(-1);
      assert.deepEqual(await service.webhook(event),{received:true});assert.deepEqual(await service.webhook(event),{received:true,duplicate:true});
      const account=await store.account(tenantId);
      if(mode==='trial'){assert.equal(entitlement(account).management,false);assert.equal(account.initial_payment_verified,false);}
      else{assert.deepEqual(account.grace_started_at,graceBefore);}
      assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='inventory.ceased'",{id})).length,1);
    }
    if(!scenario.includes('_')){
      assert.equal(writes.length,3);assert.equal(sub.items.data[0].quantity,1);assert.equal(sub.cancel_at_period_end,true);
      if(mode==='trial'){
        sub.status='canceled';sub.cancel_at_period_end=false;
        const event={id:`evt_terminal_${tenantId}`,type:'customer.subscription.deleted',livemode:false,created:now,data:{object:structuredClone(sub)}};events.push(event);
        assert.deepEqual(await service.webhook(event),{received:true});assert.equal(entitlement(await store.account(tenantId)).management,false);
        assert.equal((await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId)).status,'consistent');
      }
    }
  }
  console.log('PASS: grace/trial cessation real SQL rollback, original-key response recovery, preserved invoices, duplicate/terminal webhooks, expiry/risk denial and no trial access; synthetic provider');
};
