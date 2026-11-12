import {problem} from './contract.js';
import {objectId} from './stripe.js';

// Cancellation rolls forward. Never restore an old schedule or invent a credit.
// Legacy operation keys are retained, including the unsuffixed cancellation key.
export const cancellationRecovery=({store,stripe})=>async({job,step})=>{
  const {tenant_id:tenantId,id,intent}=job;
  const subscriptionId=intent._subscriptionId;
  const current=await store.account(tenantId);
  if(!subscriptionId||current?.stripe_subscription_id!==subscriptionId||current?.stripe_customer_id!==intent.customerId){
    throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved subscription binding needs review.');
  }
  await stripe.assertAccount();
  const subscription=async()=>{
    const remote=await stripe.request('GET',`/v1/subscriptions/${subscriptionId}`);
    if(remote.livemode!==false||remote.id!==subscriptionId||objectId(remote.customer)!==intent.customerId){
      throw problem(409,'BILLING_SUBSCRIPTION_MISMATCH','Subscription ownership needs reconciliation.');
    }
    return remote;
  };
  const before=await subscription();
  if(!['active','past_due'].includes(before.status)){
    throw problem(409,'BILLING_CANCELLATION_UNAVAILABLE','An active subscription is required.');
  }
  if(!intent.cancelAtPeriodEnd&&!(await store.inventory(tenantId)).length){
    throw problem(409,'BILLING_INVENTORY_EMPTY','Add managed dwellings before choosing to renew this subscription.');
  }
  const key=`quixo:${tenantId}:${id}`;
  if(intent.scheduleId){
    if(!intent.cancelAtPeriodEnd){throw problem(409,'BILLING_SCHEDULE_REVIEW','This subscription already has an active renewal schedule.');}
    await step('release_schedule',{
      input:{scheduleId:intent.scheduleId,subscriptionId,customerId:intent.customerId},key:`${key}:release`,
      read:async input=>{
        const schedule=await stripe.request('GET',`/v1/subscription_schedules/${input.scheduleId}`);
        const bound=objectId(schedule.subscription)||objectId(schedule.released_subscription);
        if(schedule.livemode!==false||bound!==input.subscriptionId||objectId(schedule.customer)!==input.customerId){
          throw problem(409,'BILLING_SCHEDULE_MISMATCH','The quantity schedule does not belong to this subscription.');
        }
        return {confirmed:schedule.status==='released',result:{scheduleId:input.scheduleId,released:true}};
      },
      write:(input,stepKey)=>stripe.request('POST',`/v1/subscription_schedules/${input.scheduleId}/release`,{preserve_cancel_date:false},stepKey)
    });
  }
  await step('set_cancellation',{
    input:{subscriptionId,cancelAtPeriodEnd:intent.cancelAtPeriodEnd},key,
    read:async input=>{
      const remote=await subscription();
      if(objectId(remote.schedule)){
        throw problem(409,'BILLING_SCHEDULE_REVIEW','An unexpected schedule needs review before cancellation.');
      }
      return {confirmed:Boolean(remote.cancel_at_period_end)===input.cancelAtPeriodEnd,
        result:{subscriptionId,cancelAtPeriodEnd:input.cancelAtPeriodEnd}};
    },
    write:(input,stepKey)=>stripe.request('POST',`/v1/subscriptions/${input.subscriptionId}`,{cancel_at_period_end:input.cancelAtPeriodEnd},stepKey)
  });
  return {cancelAtPeriodEnd:intent.cancelAtPeriodEnd};
};
