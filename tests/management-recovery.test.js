import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryRunner,recoveryDelay,recoveryCode} from '../src/api/managementBilling/recovery.js';
import {cancellationRecovery} from '../src/api/managementBilling/recoveryCancellation.js';

const fixture=({schedule=false}={})=>{
  let now=Date.parse('2026-11-12T00:00:00Z'),lost=false,fenced=false,finishFailure=false;
  const job={id:'operation',tenant_id:'tenant',kind:'cancellation',attempts:0,
    intent:{_subscriptionId:'sub_fixture',customerId:'cus_fixture',scheduleId:schedule?'sched_fixture':null,cancelAtPeriodEnd:true}};
  const remote={id:'sub_fixture',customer:'cus_fixture',livemode:false,status:'active',cancel_at_period_end:false,schedule:schedule?'sched_fixture':null};
  const scheduleRemote={id:'sched_fixture',customer:'cus_fixture',subscription:'sub_fixture',livemode:false,status:'active'};
  const writes=[],steps=new Map(),alerts=[];let completed=null,review=false,claims=0;
  const journal={
    claim:async()=>{if(completed){return {completed:true,result:completed};}if(review){throw Object.assign(new Error('Review'),{status:409});}job.attempts++;claims++;return {token:String(claims),job:structuredClone(job)};},
    renew:async()=>{if(fenced){throw Object.assign(new Error('Fenced'),{code:'BILLING_RECOVERY_FENCED',status:409});}},
    prepareStep:async args=>{
      if(!steps.has(args.name)){steps.set(args.name,{input:structuredClone(args.input),created_at:new Date(now),idempotency_key:args.key});}
      return structuredClone(steps.get(args.name));
    },
    completeStep:async({name,result})=>{if(fenced){throw Object.assign(new Error('Fenced'),{code:'BILLING_RECOVERY_FENCED',status:409});}Object.assign(steps.get(name),{completed_at:new Date(now),result_json:JSON.stringify(result)});},
    finish:async({result})=>{if(finishFailure){finishFailure=false;throw new Error('Synthetic commit failure');}completed=result;return result;},
    fail:async args=>{review=args.review;return {review};}
  };
  const stripe={assertAccount:async()=>{},request:async(method,path,body,key)=>{
    if(method==='GET'){return structuredClone(path.includes('subscription_schedules')?scheduleRemote:remote);}
    writes.push({path,body,key});
    if(path.endsWith('/release')){scheduleRemote.status='released';scheduleRemote.released_subscription='sub_fixture';scheduleRemote.subscription=null;remote.schedule=null;}
    else{remote.cancel_at_period_end=body.cancel_at_period_end;}
    if(lost){lost=false;throw Object.assign(new Error('Response lost'),{code:'STRIPE_UNAVAILABLE',status:503});}
    return structuredClone(remote);
  }};
  const store={account:async()=>({stripe_subscription_id:'sub_fixture',stripe_customer_id:'cus_fixture'}),inventory:async()=>[{}]};
  const runner=createRecoveryRunner({journal,handlers:{cancellation:cancellationRecovery({store,stripe})},clock:{now:()=>now},logger:{error:(_message,data)=>alerts.push(data)}});
  return {run:()=>runner.run({tenantId:'tenant',id:'operation'}),writes,steps,remote,alerts,
    lose:()=>{lost=true;},fence:()=>{fenced=true;},failFinish:()=>{finishFailure=true;},advance:ms=>{now+=ms;},job,review:()=>review};
};

test('cancellation response loss recovers after key expiry by proof without a second POST',async()=>{
  const f=fixture();f.lose();await assert.rejects(f.run(),{code:'STRIPE_UNAVAILABLE'});
  assert.equal(f.writes.length,1);assert.equal(f.remote.cancel_at_period_end,true);
  f.advance(48*3600000);assert.deepEqual(await f.run(),{cancelAtPeriodEnd:true});
  assert.deepEqual(await f.run(),{cancelAtPeriodEnd:true});assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].key,'quixo:tenant:operation');
});
test('schedule release response loss resumes distinct steps with stable legacy keys',async()=>{
  const f=fixture({schedule:true});f.lose();await assert.rejects(f.run());
  f.advance(48*3600000);await f.run();
  assert.deepEqual(f.writes.map(w=>w.key),['quixo:tenant:operation:release','quixo:tenant:operation']);
  assert.equal(f.remote.schedule,null);assert.equal(f.remote.cancel_at_period_end,true);
});
test('local completion failure preserves completed provider steps and retries only local completion',async()=>{
  const f=fixture();f.failFinish();await assert.rejects(f.run());await f.run();assert.equal(f.writes.length,1);
});
test('older unconfirmed effect is reviewed and never gets a new provider write',async()=>{
  const f=fixture();f.lose();await assert.rejects(f.run());f.remote.cancel_at_period_end=false;f.advance(24*3600000);
  await assert.rejects(f.run(),{code:'BILLING_RECOVERY_EVIDENCE_REQUIRED'});assert.equal(f.writes.length,1);
  assert.equal(f.review(),true);assert.equal(f.alerts.length,1);
});
test('a fenced worker cannot issue its next provider write',async()=>{
  const f=fixture();f.fence();await assert.rejects(f.run(),{code:'BILLING_RECOVERY_FENCED'});assert.equal(f.writes.length,0);
});
test('provider outage reaches a bounded visible review state without logging raw errors',async()=>{
  const alerts=[];let attempts=0;
  const journal={claim:async()=>({token:'t',job:{kind:'outage',attempts:++attempts}}),fail:async a=>({review:a.review})};
  const run=createRecoveryRunner({journal,handlers:{outage:async()=>{throw new Error('secret and private provider response');}},logger:{error:(_m,data)=>alerts.push(data)}}).run;
  for(let i=0;i<8;i++){await assert.rejects(run({tenantId:'t',id:'i'}));}
  assert.deepEqual(alerts,[{commandId:'i',code:'BILLING_RECOVERY_FAILED'}]);
  assert.equal(recoveryDelay(1),30);assert.equal(recoveryDelay(8),3600);assert.equal(recoveryCode({code:'private email @example.test'}),'BILLING_RECOVERY_FAILED');
});
