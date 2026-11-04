import {BILLING_ACCOUNT, problem} from './contract.js';

const flatten = (value, prefix, output) => {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) value.forEach((item,index)=>flatten(item,`${prefix}[${index}]`,output));
  else if (typeof value === 'object') Object.entries(value).forEach(([key,item])=>flatten(item,prefix?`${prefix}[${key}]`:key,output));
  else output.append(prefix,String(value));
};
export const stripeForm = value => {const result=new URLSearchParams();flatten(value,'',result);return result;};

export const createStripeClient = ({env=process.env,fetchImpl=globalThis.fetch}={}) => {
  const key=env.STRIPE_SANDBOX_SECRET_KEY || '';
  const configured=()=>env.MANAGEMENT_BILLING_SANDBOX_ENABLED==='true' && /^(sk|rk)_test_/.test(key) &&
    env.STRIPE_SANDBOX_ACCOUNT_ID===BILLING_ACCOUNT;
  const request=async(method,path,body={},idempotencyKey)=>{
    if(!configured()) throw problem(503,'BILLING_NOT_CONFIGURED','Sandbox billing is not configured.');
    if(!/^\/v1\/[a-zA-Z0-9_/]+$/.test(path)) throw problem(500,'BILLING_API_PATH_INVALID','Invalid billing API operation.');
    if(method!=='GET'&&!idempotencyKey) throw problem(500,'BILLING_IDEMPOTENCY_REQUIRED','Billing writes require an operation identifier.');
    const form=stripeForm(body);
    let response;
    try {
      response=await fetchImpl(`https://api.stripe.com${path}${method==='GET'&&form.size?`?${form}`:''}`,{
        method,headers:{Authorization:`Bearer ${key}`,'Stripe-Version':'2026-09-30.endive',
          ...(method!=='GET'?{'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':idempotencyKey}:{})},
        ...(method!=='GET'?{body:form.toString()}:{}),signal:AbortSignal.timeout(20000),redirect:'error'
      });
    } catch {throw problem(503,'STRIPE_UNAVAILABLE','Stripe did not confirm this operation. Retry the same request.');}
    const data=await response.json().catch(()=>null);
    if(!response.ok || !data) throw problem(response.status===429?503:502,'STRIPE_REQUEST_FAILED',
      'Stripe could not complete this operation. Retry the same request or review the billing configuration.');
    if(data.livemode===true) throw problem(502,'STRIPE_MODE_MISMATCH','Live Stripe objects are not accepted by sandbox billing.');
    return data;
  };
  const assertAccount=async()=>{
    const account=await request('GET','/v1/account');
    if(account.id!==BILLING_ACCOUNT) throw problem(503,'STRIPE_ACCOUNT_MISMATCH','The configured Stripe key belongs to a different account.');
    return account;
  };
  return {request,assertAccount,configured};
};

export const objectId = object => typeof object === 'string' ? object : object?.id;
export const invoiceSubscription = invoice => objectId(invoice?.parent?.subscription_details?.subscription || invoice?.subscription);

export const subscriptionProjection = ({subscription,invoice,account,now=Date.now()}) => {
  const items=subscription.items?.data || [];
  const item=items[0];
  if(objectId(subscription.customer)!==account.stripe_customer_id || subscription.id!==account.stripe_subscription_id ||
      subscription.livemode!==false || items.length!==1 || objectId(item?.price)!==account.stripe_price_id ||
      item.price?.recurring?.interval!=='month' || item.price?.recurring?.usage_type!=='licensed' ||
      !Number.isSafeInteger(item.quantity) || item.quantity<1 || subscription.trial_end || subscription.trial_start)
    throw problem(409,'BILLING_SUBSCRIPTION_MISMATCH','Subscription ownership, price or billing terms need reconciliation.');
  const periodEnd=item.current_period_end || subscription.current_period_end;
  const invoiceMatches=invoice && invoice.livemode===false && objectId(invoice.customer)===account.stripe_customer_id &&
    invoiceSubscription(invoice)===subscription.id && invoice.currency===item.price.currency;
  // Subscription status by itself is insufficient; only its own paid invoice is payment proof.
  const paid=invoiceMatches && invoice.status==='paid' && invoice.amount_remaining===0 &&
    Number.isSafeInteger(invoice.amount_paid) && Number.isSafeInteger(invoice.amount_due) && invoice.amount_paid>=invoice.amount_due;
  const invoicePeriodEnd=paid ? Math.max(0,...(invoice.lines?.data || []).filter(line=>
    objectId(line.parent?.subscription_item_details?.subscription_item || line.subscription_item)===item.id &&
    !(line.parent?.subscription_item_details?.proration ?? line.proration)).map(line=>Number(line.period?.end)||0)) : 0;
  const paidThrough=paid && invoicePeriodEnd && periodEnd ? new Date(Math.min(invoicePeriodEnd,periodEnd)*1000).toISOString() : account.paid_through;
  const firstFailure=invoiceMatches && subscription.status==='past_due' && invoice.status==='open' && invoice.attempted===true && account.initial_payment_verified;
  return {
    subscription_status:subscription.status,stripe_item_id:item.id,quantity:item.quantity,
    initial_payment_verified:Boolean(account.initial_payment_verified || (paid && invoicePeriodEnd>0)),
    paid_through:paidThrough || null,
    // Pin to the failed renewal's period, never extend grace on webhook retries.
    grace_started_at:paid ? null : firstFailure ? account.grace_started_at ||
      new Date(Math.min(now,Number(invoice.period_end || invoice.created)*1000)).toISOString() : account.grace_started_at || null,
    cancel_at_period_end:Boolean(subscription.cancel_at_period_end),
    stripe_schedule_id:objectId(subscription.schedule) || null
  };
};
