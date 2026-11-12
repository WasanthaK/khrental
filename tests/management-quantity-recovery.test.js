import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryRunner} from '../src/api/managementBilling/recovery.js';
import {quantityRecovery} from '../src/api/managementBilling/recoveryQuantity.js';

const fixture=target=>{
  let now=Date.parse('2026-11-12T00:00:00Z'),fault=null;
  const sub={id:'sub_q',customer:'cus_q',status:'active',livemode:false,schedule:null,cancel_at_period_end:false,
    items:{data:[{id:'si_q',price:'price_q',quantity:2,current_period_start:now/1000-86400,current_period_end:now/1000+30*86400}]}};
  const job={id:'op',tenant_id:'tenant',kind:'quantity_apply',created_at:new Date(now),attempts:0,intent:{_subscriptionId:sub.id,customerId:sub.customer,
    itemId:'si_q',priceId:'price_q',periodEnd:sub.items.data[0].current_period_end,scheduleId:null,
    preview:{from:2,to:target,prorationDate:now/1000,timing:target===0?'cancel_at_renewal':target>2?'prorated_next_invoice':'next_renewal'}}};
  const schedules=new Map(),events=[],writes=[],steps=new Map();let result=null;
  const journal={claim:async()=>result?{completed:true,result}:{token:'t',job:{...job,attempts:++job.attempts}},renew:async()=>{},
    prepareStep:async args=>{
      if(!steps.has(args.name)){steps.set(args.name,{input:structuredClone(args.input),input_hash:args.inputHash,idempotency_key:args.key,created_at:new Date(now)});}
      const saved=steps.get(args.name);assert.equal(saved.input_hash,args.inputHash);assert.equal(saved.idempotency_key,args.key);return structuredClone(saved);
    },completeStep:async({name,result})=>Object.assign(steps.get(name),{completed_at:new Date(now),result_json:JSON.stringify(result)}),
    finish:async args=>{result=args.result;return result;},fail:async()=>({review:false})};
  const stripe={assertAccount:async()=>{},request:async(method,path,body={},key)=>{
    if(method==='GET'){
      if(path==='/v1/events'){return {data:structuredClone(events.filter(e=>e.type===body.type&&e.created>=body.created.gte)),has_more:false};}
      return structuredClone(path.includes('subscription_schedules')?schedules.get(path.split('/').at(-1)):sub);
    }
    writes.push({path,key,body:structuredClone(body)});let value,type;
    if(path==='/v1/subscription_schedules'){
      value={id:'sched_q',customer:sub.customer,subscription:sub.id,livemode:false,status:'active',end_behavior:'release',
        current_phase:{start_date:sub.items.data[0].current_period_start},phases:[{start_date:sub.items.data[0].current_period_start,
          end_date:sub.items.data[0].current_period_end,items:[{price:'price_q',quantity:2}],proration_behavior:'none'}]};
      schedules.set(value.id,value);sub.schedule=value.id;type='subscription_schedule.created';
    }else if(path.includes('subscription_schedules')){
      value=schedules.get('sched_q');Object.assign(value,body);sub.items.data[0].quantity=body.phases[0].items[0].quantity;type='subscription_schedule.updated';
    }else{
      if(body.items){sub.items.data[0].quantity=body.items[0].quantity;}
      if('cancel_at_period_end' in body){sub.cancel_at_period_end=body.cancel_at_period_end;}
      value=sub;type='customer.subscription.updated';
    }
    events.push({id:`evt_${events.length}`,type,livemode:false,created:now/1000,request:{idempotency_key:key},data:{object:structuredClone(value)}});
    if(fault===path){fault=null;throw Object.assign(new Error('Synthetic response loss'),{status:503,code:'STRIPE_UNAVAILABLE'});}
    return structuredClone(value);
  }};
  const store={account:async()=>({stripe_subscription_id:'sub_q',stripe_customer_id:'cus_q'})};
  const runner=createRecoveryRunner({journal,handlers:{quantity_apply:quantityRecovery({store,stripe,clock:{now:()=>now}})},clock:{now:()=>now},logger:{error:()=>{}}});
  return {run:()=>runner.run({tenantId:'tenant',id:'op'}),writes,events,sub,steps,schedules,
    lose:path=>{fault=path;},advance:ms=>{now+=ms;}};
};
test('increase recovers after response loss and key expiry only with matching provider request evidence',async()=>{
  const f=fixture(3);f.lose('/v1/subscriptions/sub_q');await assert.rejects(f.run(),{code:'STRIPE_UNAVAILABLE'});
  f.advance(48*3600000);assert.equal((await f.run()).currentQuantity,3);await f.run();
  assert.deepEqual(f.writes.map(w=>w.key),['quixo:tenant:op:increase']);assert.equal(f.writes[0].body.proration_behavior,'create_prorations');
});
test('schedule creation response loss resumes the phase write without a second schedule',async()=>{
  const f=fixture(1);f.lose('/v1/subscription_schedules');await assert.rejects(f.run());f.advance(48*3600000);
  const result=await f.run();assert.equal(result.currentQuantity,2);assert.equal(result.nextRenewalQuantity,1);
  assert.deepEqual(f.writes.map(w=>w.key),['quixo:tenant:op:schedule','quixo:tenant:op:phases']);
});
test('phase write response loss proves the saved request and does not repeat a phase update',async()=>{
  const f=fixture(1);f.lose('/v1/subscription_schedules/sched_q');await assert.rejects(f.run());f.advance(48*3600000);
  await f.run();assert.equal(f.writes.length,2);assert.equal(f.writes[1].body.proration_behavior,'none');
});
test('quantity equality with a different provider request key neither completes nor repeats a proration',async()=>{
  const f=fixture(3);f.lose('/v1/subscriptions/sub_q');await assert.rejects(f.run());
  f.events[0].request.idempotency_key='foreign';f.advance(48*3600000);
  await assert.rejects(f.run(),{code:'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE'});assert.equal(f.writes.length,1);
});
test('zero quantity retains paid capacity and uses the existing zero-stock cancellation key',async()=>{
  const f=fixture(0);f.lose('/v1/subscriptions/sub_q');await assert.rejects(f.run());f.advance(48*3600000);
  const result=await f.run();assert.equal(result.currentQuantity,2);assert.equal(result.nextRenewalQuantity,0);
  assert.deepEqual(f.writes,[{path:'/v1/subscriptions/sub_q',key:'quixo:tenant:op:zero-stock',body:{cancel_at_period_end:true}}]);
});
test('renewal rollover before a first increase requires review without writing an old proration',async()=>{
  const f=fixture(3);f.sub.items.data[0].current_period_end+=30*86400;
  await assert.rejects(f.run(),{code:'BILLING_QUANTITY_UNCONFIRMED'});assert.equal(f.writes.length,0);
});
