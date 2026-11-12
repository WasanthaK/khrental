import fs from 'node:fs';
import path from 'node:path';
import {createProviderRecoveryHandlers} from '../../src/api/managementBilling/service.js';
import {hash,BILLING_PORTAL} from '../../src/api/managementBilling/contract.js';
import {createRecoveryRunner} from '../../src/api/managementBilling/recovery.js';
import {quantityRecovery} from '../../src/api/managementBilling/recoveryQuantity.js';
import {cancellationRecovery} from '../../src/api/managementBilling/recoveryCancellation.js';

// Process-crash fixture only: disk substitutes for SQL and the provider. Real
// database transactions, claims and fencing have a separate disposable SQL proof.
const [directory,stopAt,scenario='cancellation',targetStep='']=process.argv.slice(2);
const now=Date.UTC(2026,10,12);
const clock={now:()=>now};
const read=(name,fallback)=>fs.existsSync(path.join(directory,name))?JSON.parse(fs.readFileSync(path.join(directory,name),'utf8')):fallback;
const save=(name,value)=>{
  const target=path.join(directory,name);fs.writeFileSync(`${target}.tmp`,JSON.stringify(value));fs.renameSync(`${target}.tmp`,target);
};
const stop=(point,step='')=>{if(stopAt===point&&(!targetStep||targetStep===step)){process.kill(process.pid,'SIGKILL');}};
const state=read('journal.json',{attempts:0,steps:{},result:null,completedCount:0});
const job={created_at:new Date(now).toISOString(),id:'operation',tenant_id:'tenant',kind:'cancellation',intent:{_subscriptionId:'sub_test',customerId:'cus_test',scheduleId:null,cancelAtPeriodEnd:true}};
const inventory=[{key:'one'},{key:'two'},{key:'three'}];
if(['checkout','portal','preview'].includes(scenario)){
  job.kind=scenario==='preview'?'quantity_preview':scenario;
  Object.assign(job.intent,{priceId:'price_test',itemId:'si_test',origin:'https://app.example.test',inventory,inventoryHash:hash(inventory),
    preview:{from:2,to:3,inventoryHash:hash(inventory),expiresAt:new Date(now+600000).toISOString(),prorationDate:now/1000}});
  if(scenario==='checkout'){job.intent.customerId=null;job.intent._subscriptionId=null;}
}else if(scenario!=='cancellation'){
  const target={increase:3,reduction:1,zero:0}[scenario];
  if(target===undefined){throw new Error('Unknown scenario');}
  job.kind='quantity_apply';
  Object.assign(job.intent,{itemId:'si_test',priceId:'price_test',periodEnd:Math.floor(now/1000)+86400,
    preview:{from:2,to:target,prorationDate:Math.floor(now/1000),
      timing:target===0?'cancel_at_renewal':target>2?'prorated_next_invoice':'next_renewal'}});
}
const journal={
  claim:async()=>{
    if(state.result){return {completed:true,result:state.result};}
    state.attempts++;save('journal.json',state);stop('after_claim');return {token:String(state.attempts),job:{...job,attempts:state.attempts}};
  },
  renew:async()=>{},
  prepareStep:async args=>{
    if(!state.steps[args.name]){state.steps[args.name]={input:args.input,input_hash:args.inputHash,idempotency_key:args.key,created_at:new Date(now).toISOString()};save('journal.json',state);}
    stop('after_intent',args.name);return state.steps[args.name];
  },
  completeStep:async({name,result})=>{
    Object.assign(state.steps[name],{completed_at:new Date().toISOString(),result_json:JSON.stringify(result)});save('journal.json',state);stop('after_checkpoint',name);
  },
  finish:async({result})=>{state.result=result;state.completedCount++;save('journal.json',state);stop('after_completion');return result;},
  fail:async()=>{throw new Error('Unexpected fixture failure');}
};
const initial={writes:[],events:[],subscription:{id:'sub_test',customer:'cus_test',livemode:false,status:'active',
  schedule:null,cancel_at_period_end:false,items:{data:[{id:'si_test',price:'price_test',quantity:2,
    current_period_end:Math.floor(now/1000)+86400}]}},schedule:null};
const stripe={assertAccount:async()=>{},request:async(method,url,body,key)=>{
  const provider=read('provider.json',initial);
  if(method==='GET'){
    if(url==='/v1/customers/cus_created'){return provider.customer;}
    if(url==='/v1/checkout/sessions'){return {data:provider.checkout?[provider.checkout]:[],has_more:false};}
    if(url==='/v1/checkout/sessions/cs_created'){return provider.checkout;}
    if(url==='/v1/checkout/sessions/cs_created/line_items'){return {data:provider.checkout.line_items,has_more:false};}
    if(url.startsWith('/v1/billing_portal/configurations/')){return {active:true,features:{}};}
    if(url==='/v1/events'){return {data:provider.events.filter(event=>event.type===body.type),has_more:false};}
    if(url==='/v1/subscriptions/sub_test'){return provider.subscription;}
    if(url==='/v1/subscription_schedules/sched_test'){return provider.schedule;}
    throw new Error(`Unexpected read ${url}`);
  }
  if(method!=='POST'){throw new Error('Unexpected provider method');}
  let step,type,object;
  if(url==='/v1/customers'){
    step='create_customer';type='customer.created';object={id:'cus_created',livemode:false,...body};provider.customer=object;
  }else if(url==='/v1/checkout/sessions'){
    step='create_checkout';type='fixture.checkout.created';object={id:'cs_created',livemode:false,...body};provider.checkout=object;
  }else if(url==='/v1/billing_portal/sessions'){
    step='create_portal';type='billing_portal.session.created';object={id:'bps_created',livemode:false,...body,configuration:BILLING_PORTAL,url:'https://billing.stripe.com/p/proof'};
  }else if(url==='/v1/invoices/create_preview'){
    step='preview_invoice';type='fixture.preview';object={id:'upcoming',livemode:false,customer:body.customer,total:1500,currency:'usd'};
  }else if(url==='/v1/subscription_schedules'){
    step='create_schedule';type='subscription_schedule.created';
    provider.subscription.schedule='sched_test';
    provider.schedule={id:'sched_test',customer:'cus_test',subscription:'sub_test',livemode:false,status:'active',
      current_phase:{start_date:Math.floor(now/1000)-86400},phases:[],end_behavior:'release'};
    object=provider.schedule;
  }else if(url==='/v1/subscription_schedules/sched_test'){
    step='set_schedule_phases';type='subscription_schedule.updated';
    Object.assign(provider.schedule,body);object=provider.schedule;
  }else if(url==='/v1/subscriptions/sub_test'){
    if(body.items){
      step='increase_quantity';provider.subscription.items.data[0].quantity=body.items[0].quantity;
    }else{step='set_cancellation';provider.subscription.cancel_at_period_end=body.cancel_at_period_end;}
    type='customer.subscription.updated';object=provider.subscription;
  }else{throw new Error(`Unexpected write ${url}`);}
  // Count every request, including duplicate keys: a replay cannot hide behind
  // simulated provider deduplication in these readback recovery scenarios.
  provider.writes.push(key);
  provider.events.push({id:`evt_${provider.writes.length}`,type,livemode:false,created:Math.floor(now/1000),
    request:{idempotency_key:key},data:{object:structuredClone(object)}});
  save('provider.json',provider);stop('after_provider_effect',step);
  return object;
}};
const store={account:async()=>({stripe_subscription_id:job.intent._subscriptionId,stripe_customer_id:job.intent.customerId,stripe_price_id:'price_test',quantity:2}),inventory:async()=>inventory};
const handlers=createProviderRecoveryHandlers({store,stripe,requireAccount:store.account,clock});
await createRecoveryRunner({journal,clock,handlers:{cancellation:cancellationRecovery({store,stripe}),
  quantity_apply:quantityRecovery({store,stripe,clock}),...handlers}}).run({tenantId:'tenant',id:'operation'});
