import assert from 'node:assert/strict';
import {createBillingService} from '../../src/api/managementBilling/service.js';

// Synthetic transport and transactional memory only. Never represents captured
// Stripe events, provider test-clock advancement or genuine payment acceptance.
export const billingReplay=()=>{
  const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let time=Date.parse('2030-01-01T00:00:00Z');
  let state={account:{tenant_id:tenantId,stripe_customer_id:'cus_replay',stripe_subscription_id:'sub_replay',stripe_price_id:'price_replay',
    quantity:1,initial_payment_verified:false,inventory_json:'[]',version:1},events:[],audit:[]};
  const remote=new Map(),history=[],requests=[];
  const q=async(statement,params={})=>{
    if(statement.startsWith('UPDATE dbo.management_billing_accounts SET subscription_status=')){
      Object.assign(state.account,params);state.account.version++;return [];
    }
    if(statement.startsWith('SELECT stripe_event_id')){return state.events.includes(params.id)?[{stripe_event_id:params.id}]:[];}
    if(statement.startsWith('INSERT INTO dbo.management_billing_events')){state.events.push(params.id);return [];}
    if(statement.includes('FROM dbo.management_billing_commands')){return [];}
    throw new Error(`Unhandled replay SQL: ${statement}`);
  };
  const store={
    account:async()=>structuredClone(state.account),inventory:async()=>[{propertyId:'home'}],
    read:async(statement,params)=>statement.includes('WHERE stripe_customer_id=')?
      params.customerId==='cus_replay'?[{tenant_id:tenantId}]:[]:q(statement,params),
    locked:async(_id,action)=>{const before=structuredClone(state);try{return await action(q);}catch(error){state=before;throw error;}},
    audit:async(_q,value)=>state.audit.push(value)
  };
  const stripe={configured:()=>true,assertAccount:async()=>{},request:async(method,path,body={})=>{
    assert.equal(method,'GET','Lifecycle replay must not charge or create provider objects');requests.push(path);
    if(path==='/v1/events'){return {data:history.filter(e=>e.type===body.type&&e.created>=body.created.gte),has_more:false};}
    assert.ok(remote.has(path),`Unknown synthetic provider read ${path}`);return structuredClone(remote.get(path));
  }};
  const service=createBillingService({store,stripe,clock:{now:()=>time}});
  const publish=({id,type='invoice.paid',paid=true,invoiceId='in_replay',created=Math.floor(time/1000),eventCreated=created,subscriptionId='sub_replay'}={})=>{
    const periodEnd=Math.floor(time/1000)+30*86400;
    const invoice={id:invoiceId,object:'invoice',customer:'cus_replay',livemode:false,currency:'usd',status:paid?'paid':'open',
      attempted:true,created,parent:{subscription_details:{subscription:subscriptionId}},amount_paid:paid?500:0,amount_due:500,amount_remaining:paid?0:500,
      lines:{data:[{parent:{subscription_item_details:{subscription_item:'si_replay',proration:false}},period:{end:periodEnd}}],has_more:false}};
    const subscription={id:'sub_replay',customer:'cus_replay',livemode:false,status:paid?'active':'past_due',latest_invoice:invoiceId,
      items:{data:[{id:'si_replay',quantity:1,current_period_end:periodEnd,price:{id:'price_replay',currency:'usd',recurring:{interval:'month',usage_type:'licensed'}}}]}};
    const event={id,type,created:eventCreated,livemode:false,data:{object:invoice}};
    remote.set(`/v1/events/${id}`,event);remote.set(`/v1/invoices/${invoiceId}`,invoice);remote.set('/v1/subscriptions/sub_replay',subscription);
    history.push(event);return event;
  };
  return {publish,deliver:id=>service.webhook(remote.get(`/v1/events/${id}`)),summary:()=>service.summary(tenantId),
    advance:ms=>{time+=ms;},state:()=>structuredClone(state),time:()=>time,requests,
    setComplimentary:expiry=>{state.account.comp_type='fixed';state.account.comp_expires_at=expiry;}};
};
