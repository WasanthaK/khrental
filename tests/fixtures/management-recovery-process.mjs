import fs from 'node:fs';
import path from 'node:path';
import {createRecoveryRunner} from '../../src/api/managementBilling/recovery.js';
import {cancellationRecovery} from '../../src/api/managementBilling/recoveryCancellation.js';

// Process-crash fixture only: disk substitutes for SQL and the provider. Real
// database transactions, claims and fencing have a separate disposable SQL proof.
const [directory,stopAt]=process.argv.slice(2);
const read=(name,fallback)=>fs.existsSync(path.join(directory,name))?JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')):fallback;
const save=(name,value)=>{
  const target=path.join(directory,name);fs.writeFileSync(`${target}.tmp`,JSON.stringify(value));fs.renameSync(`${target}.tmp`,target);
};
const stop=point=>{if(stopAt===point){process.kill(process.pid,'SIGKILL');}};
const state=read('journal.json',{attempts:0,steps:{},result:null,completedCount:0});
const job={id:'operation',tenant_id:'tenant',kind:'cancellation',intent:{_subscriptionId:'sub_test',customerId:'cus_test',scheduleId:null,cancelAtPeriodEnd:true}};
const journal={
  claim:async()=>{
    if(state.result){return {completed:true,result:state.result};}
    state.attempts++;save('journal.json',state);stop('after_claim');return {token:String(state.attempts),job:{...job,attempts:state.attempts}};
  },
  renew:async()=>{},
  prepareStep:async args=>{
    if(!state.steps[args.name]){state.steps[args.name]={input:args.input,input_hash:args.inputHash,idempotency_key:args.key,created_at:new Date().toISOString()};save('journal.json',state);}
    stop('after_intent');return state.steps[args.name];
  },
  completeStep:async({name,result})=>{
    Object.assign(state.steps[name],{completed_at:new Date().toISOString(),result_json:JSON.stringify(result)});save('journal.json',state);stop('after_checkpoint');
  },
  finish:async({result})=>{state.result=result;state.completedCount++;save('journal.json',state);stop('after_completion');return result;},
  fail:async()=>{throw new Error('Unexpected fixture failure');}
};
const stripe={assertAccount:async()=>{},request:async(method,_path,body,key)=>{
  const provider=read('provider.json',{cancelled:false,writes:[]});
  if(method==='POST'){
    provider.cancelled=body.cancel_at_period_end;provider.writes.push(key);save('provider.json',provider);stop('after_provider_effect');
  }
  return {id:'sub_test',customer:'cus_test',livemode:false,status:'active',schedule:null,cancel_at_period_end:provider.cancelled};
}};
const store={account:async()=>({stripe_subscription_id:'sub_test',stripe_customer_id:'cus_test'})};
await createRecoveryRunner({journal,handlers:{cancellation:cancellationRecovery({store,stripe})}}).run({tenantId:'tenant',id:'operation'});
