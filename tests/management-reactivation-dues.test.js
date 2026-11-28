import assert from 'node:assert/strict';
import test from 'node:test';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';
import {reactivationDues, requireSettledDues, requireNoOtherSubscription, requireEndedAccount} from '../src/api/managementBilling/reactivation.js';

const account={market:'LK',tenant_id:'workspace',stripe_account_id:BILLING_ACCOUNT,stripe_customer_id:'cus_fixture',
  stripe_subscription_id:'sub_old',subscription_status:'canceled'};
const customer={id:account.stripe_customer_id,livemode:false,balance:0,currency:'usd',invoice_credit_balance:{}};
const invoice=(id,status,amount,currency='usd')=>({id,object:'invoice',customer:customer.id,livemode:false,status,amount_remaining:amount,currency});
const page=(data,has_more=false)=>({data,has_more});
function provider({balance=customer,invoices=()=>page([]),subscriptions=[]}={}) {
  return {request:async(method,path,params)=>{
    assert.equal(method,'GET');
    if(path==='/v1/customers/'+customer.id){assert.deepEqual(params,{expand:['invoice_credit_balance']});return balance;}
    if(path==='/v1/subscriptions/sub_old'){return subscriptions[0];}
    assert.equal(params.customer,customer.id);
    if(path==='/v1/subscriptions'){assert.equal(params.status,'all');return page(subscriptions);}
    assert.equal(path,'/v1/invoices');return invoices(params);
  }};
}

test('all open and uncollectible pages count, including dues from older subscriptions, with no cross-currency netting',async()=>{
  const stripe=provider({balance:{...customer,balance:70,invoice_credit_balance:{usd:70,lkr:-1000}},
    invoices:({status,starting_after})=>{
      if(status==='uncollectible'){return page([invoice('in_writtenoff',status,400,'lkr')]);}
      if(starting_after){assert.equal(starting_after,'in_newest');return page([invoice('in_old',status,75)]);}
      return page([invoice('in_newest',status,0)],true);
    }});
  assert.deepEqual(await reactivationDues(stripe,account),[{currency:'usd',amountMinor:145},{currency:'lkr',amountMinor:400}]);
  await assert.rejects(requireSettledDues(stripe,account),{code:'BILLING_REACTIVATION_DUES'});
});
test('a customer debit alone blocks restart, including a legacy balance omitted from the currency map',async()=>{
  for(const invoice_credit_balance of [{},{usd:70}]){
    const stripe=provider({balance:{...customer,balance:70,invoice_credit_balance}});
    assert.deepEqual(await reactivationDues(stripe,account),[{currency:'usd',amountMinor:70}]);
  }
  await requireSettledDues(provider(),account);
});
test('unknown balances, wrong customers, malformed or overlapping invoice pages cannot authorize a restart',async()=>{
  const cases=[provider({balance:{...customer,invoice_credit_balance:null}}),provider({balance:{...customer,balance:100,invoice_credit_balance:{usd:1}}}),
    provider({invoices:()=>page([],true)}),provider({invoices:({status})=>page([{...invoice('in_other',status,0),customer:'cus_other'}])}),
    provider({invoices:({status})=>page([invoice('in_repeat',status,0)],true)}),
    provider({invoices:({status})=>page([{...invoice('in_live',status,0),livemode:true}])})];
  for(const stripe of cases){await assert.rejects(requireSettledDues(stripe,account),{code:'BILLING_BALANCE_UNAVAILABLE'});}
});
test('only the explicitly verified new subscription can coexist with ended subscriptions',async()=>{
  const old={id:'sub_old',object:'subscription',status:'canceled',livemode:false,customer:customer.id};
  const paid={...old,id:'sub_paid',status:'active'};
  await requireNoOtherSubscription(provider({subscriptions:[old]}),account);
  await requireNoOtherSubscription(provider({subscriptions:[old,paid]}),account,paid.id);
  await assert.rejects(requireNoOtherSubscription(provider({subscriptions:[old,paid]}),account),{code:'BILLING_REACTIVATION_REVIEW'});
  await assert.rejects(requireNoOtherSubscription(provider({subscriptions:[old,paid,{...paid,id:'sub_foreign'}]}),account,paid.id),{code:'BILLING_REACTIVATION_REVIEW'});
});
test('overdue, risk-held and complimentary workspaces cannot use ended-subscription checkout',()=>{
  for(const change of [{subscription_status:'past_due'},{risk_hold:true},{comp_type:'ongoing'},{market:'BN'}]){
    assert.throws(()=>requireEndedAccount({...account,...change}),{code:'BILLING_REACTIVATION_REVIEW'});
  }
});
