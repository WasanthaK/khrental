import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecoveryWorker,startRecoveryScheduler} from '../src/api/managementBilling/recoveryWorker.js';

const tenant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true',MANAGEMENT_RECOVERY_TENANT_IDS:tenant};
test('dry-run performs only scoped SELECTs and never claims, writes or contacts a provider',async()=>{
  let reads=0;
  const store={read:async(sql,params)=>{reads++;assert.match(sql,/^SELECT TOP \(10\)/);assert.equal(params.tenantId,tenant);return [{id:'op',due:1}];}};
  const worker=createRecoveryWorker({store,env,service:{recoverOperation:()=>assert.fail('Dry-run cannot recover')}});
  assert.deepEqual(await worker.run(),{dryRun:true,candidates:[{id:'op',due:1}]});assert.equal(reads,1);
  await assert.rejects(worker.run({dryRun:false}),{code:'BILLING_RECOVERY_DISABLED'});assert.equal(reads,1);
});
test('worker executes only due selected operations and lets the journal handle competing claims',async()=>{
  const calls=[],alerts=[];
  const worker=createRecoveryWorker({env:{...env,MANAGEMENT_RECOVERY_WORKER_ENABLED:'true'},
    store:{read:async()=>[{id:'a',tenant_id:tenant,due:1},{id:'b',tenant_id:tenant,due:0},{id:'c',tenant_id:tenant,due:1}]},
    service:{recoverOperation:async args=>{calls.push(args);if(args.id==='c'){throw Object.assign(new Error('private'),{code:'BILLING_RECOVERY_BUSY'});}}},
    logger:{error:(...args)=>alerts.push(args)}});
  const result=await worker.run({dryRun:false});
  assert.deepEqual(calls,[{tenantId:tenant,id:'a'},{tenantId:tenant,id:'c'}]);assert.equal(result.outcomes.length,2);assert.equal(alerts.length,0);
});
test('missing schema, malformed or excessive scope fails closed before selection',async()=>{
  for(const config of [{},{...env,MANAGEMENT_RECOVERY_TENANT_IDS:'*'},{...env,MANAGEMENT_RECOVERY_TENANT_IDS:Array(11).fill(tenant).join(',')}]){
    await assert.rejects(createRecoveryWorker({env:config,store:{read:()=>assert.fail('No query')}}).run());
  }
});
test('scheduler defaults off and refuses incomplete activation',async()=>{
  await startRecoveryScheduler({env:{},timers:{setTimeout:()=>assert.fail('Disabled scheduler')}}).stop();
  assert.throws(()=>startRecoveryScheduler({env:{MANAGEMENT_RECOVERY_WORKER_ENABLED:'true'}}),{code:'BILLING_RECOVERY_CONFIGURATION'});
});
test('scheduler waits for an in-flight attempt, serializes ticks and stops without scheduling more',async()=>{
  const tasks=[],delays=[];let resolve,stopped=false;
  const timer={unref:()=>{}};
  const scheduler=startRecoveryScheduler({env:{...env,MANAGEMENT_RECOVERY_WORKER_ENABLED:'true',MANAGEMENT_BILLING_SANDBOX_ENABLED:'true'},
    worker:{run:()=>new Promise(r=>{resolve=r;})},timers:{setTimeout:(fn,ms)=>{tasks.push(fn);delays.push(ms);return timer;},clearTimeout:()=>{}}});
  assert.deepEqual(delays,[30000]);const running=tasks[0]();
  const stopping=scheduler.stop().then(()=>{stopped=true;});await Promise.resolve();assert.equal(stopped,false);
  resolve({});await running;await stopping;assert.equal(stopped,true);assert.equal(tasks.length,1);
});
