import {hash,problem} from './contract.js';
import {objectId} from './stripe.js';
import {billingClock} from './clock.js';
import {requestEvidence} from './recoveryEvidence.js';
import {cancellationRecovery} from './recoveryCancellation.js';

export const scheduleFingerprint=schedule=>hash({phases:schedule.phases,endBehavior:schedule.end_behavior});
export const quantityScheduleBody=({phaseStart,periodEnd,priceId,from,to})=>({
  end_behavior:'release',proration_behavior:to>from?'create_prorations':'none',phases:[
    {start_date:phaseStart,end_date:periodEnd,items:[{price:priceId,quantity:Math.max(from,to)}],proration_behavior:'none'},
    {start_date:periodEnd,duration:{interval:'month',interval_count:1},items:[{price:priceId,quantity:to}],proration_behavior:'none'}]
});
export const splitScheduleBody=args=>{
  const body=quantityScheduleBody(args);
  body.proration_behavior='none';body.phases[0].items[0].quantity=args.from;
  return body;
};
export const quantityScheduleMatches=(schedule,body)=>{
  const matches=(actual,expected)=>actual?.items?.length===1&&objectId(actual.items[0].price)===expected.items[0].price&&
    actual.items[0].quantity===expected.items[0].quantity&&actual.proration_behavior==='none';
  const [current,next]=body.phases;
  return schedule?.status==='active'&&schedule.end_behavior==='release'&&
    schedule.phases?.filter(p=>p.start_date>=current.start_date).length===2&&
    matches(schedule.phases?.find(p=>p.start_date===current.start_date&&p.end_date===current.end_date),current)&&
    matches(schedule.phases?.find(p=>p.start_date===next.start_date),next);
};

export const quantityRecovery=({store,stripe,clock=billingClock})=>async({job,step})=>{
  const {intent,tenant_id:tenantId,id}=job,{preview}=intent;
  const account=await store.account(tenantId);
  if(account?.stripe_subscription_id!==intent._subscriptionId||account?.stripe_customer_id!==intent.customerId){
    throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved subscription binding changed.');
  }
  if(preview.to===0){
    await cancellationRecovery({store,stripe,keySuffix:':zero-stock'})({job:{...job,intent:{...intent,cancelAtPeriodEnd:true}},step});
    return {currentQuantity:preview.from,nextRenewalQuantity:0,timing:preview.timing,cancelAtPeriodEnd:true};
  }
  await stripe.assertAccount();
  const subscription=async()=>{
    const value=await stripe.request('GET',`/v1/subscriptions/${intent._subscriptionId}`),item=value.items?.data?.[0];
    if(value.id!==intent._subscriptionId||value.livemode!==false||objectId(value.customer)!==intent.customerId||
      value.items?.data?.length!==1||item?.id!==intent.itemId||objectId(item?.price)!==intent.priceId||
      value.status!==((job.kind==='restore'&&intent.restoreMode==='grace')||(job.kind==='split'&&intent.splitMode==='grace')?'past_due':'active')||value.cancel_at_period_end||value.trial_start||value.trial_end){
      throw problem(409,'BILLING_SUBSCRIPTION_MISMATCH','Subscription terms need review before quantity recovery.');
    }
    return value;
  };
  const schedule=async scheduleId=>{
    const value=await stripe.request('GET',`/v1/subscription_schedules/${scheduleId}`);
    if(value.id!==scheduleId||value.livemode!==false||value.status!=='active'||
      objectId(value.subscription)!==intent._subscriptionId||objectId(value.customer)!==intent.customerId){
      throw problem(409,'BILLING_SCHEDULE_MISMATCH','The saved schedule needs review.');
    }
    return value;
  };
  const evidence=(type,resourceId,key,matches)=>requestEvidence({stripe,type,resourceId,key,matches,
    customerId:intent.customerId,since:job.created_at,clock});
  const key=`quixo:${tenantId}:${id}`;
  const before=await subscription();
  let confirmedSchedule=null;
  if(job.kind==='split'||preview.to<preview.from||intent.scheduleId){
    let saved=intent.scheduleId?{scheduleId:intent.scheduleId,phaseStart:intent.phaseStart,fingerprint:intent.scheduleFingerprint}:null;
    if(!saved){
      saved=await step('create_schedule',{
        input:{subscriptionId:intent._subscriptionId},key:`${key}:schedule`,
        read:async()=>{
          const sub=await subscription(),scheduleId=objectId(sub.schedule);
          if(!scheduleId){
            if(sub.items.data[0].quantity!==preview.from||sub.items.data[0].current_period_end!==intent.periodEnd){
              throw problem(409,'BILLING_PREVIEW_STALE','The subscription changed before schedule creation.');
            }
            return {confirmed:false};
          }
          const value=await schedule(scheduleId);
          const proof=await evidence('subscription_schedule.created',scheduleId,`${key}:schedule`,s=>objectId(s.subscription)===intent._subscriptionId);
          if(!proof){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','The new schedule needs matching request evidence.');}
          return {confirmed:true,result:{scheduleId,phaseStart:value.current_phase?.start_date,fingerprint:scheduleFingerprint(value),...proof}};
        },
        write:(input,stepKey)=>stripe.request('POST','/v1/subscription_schedules',{from_subscription:input.subscriptionId},stepKey)
      });
    }
    const body=(job.kind==='split'?splitScheduleBody:quantityScheduleBody)({phaseStart:saved.phaseStart,periodEnd:intent.periodEnd,priceId:intent.priceId,from:preview.from,to:preview.to});
    await step('set_schedule_phases',{
      input:{scheduleId:saved.scheduleId,body},key:`${key}:phases`,
      read:async input=>{
        const sub=await subscription();
        if(objectId(sub.schedule)!==input.scheduleId){throw problem(409,'BILLING_SCHEDULE_MISMATCH','The subscription schedule changed.');}
        const value=await schedule(input.scheduleId);
        const proof=await evidence('subscription_schedule.updated',input.scheduleId,`${key}:phases`,s=>
          objectId(s.subscription)===intent._subscriptionId&&quantityScheduleMatches(s,input.body));
        if(quantityScheduleMatches(value,input.body)){
          if(!proof&&!intent.preconfirmedSchedule){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','The quantity schedule needs matching request evidence.');}
          return {confirmed:true,result:{scheduleId:input.scheduleId,nextQuantity:preview.to,...proof,preconfirmed:Boolean(intent.preconfirmedSchedule)}};
        }
        if(proof||scheduleFingerprint(value)!==saved.fingerprint||sub.items.data[0].quantity!==preview.from||
          sub.items.data[0].current_period_end!==intent.periodEnd){throw problem(409,'BILLING_SCHEDULE_MISMATCH','The schedule changed after the reviewed intent.');}
        return {confirmed:false};
      },
      write:(input,stepKey)=>stripe.request('POST',`/v1/subscription_schedules/${input.scheduleId}`,input.body,stepKey)
    });
    confirmedSchedule={id:saved.scheduleId,body};
  }else if(preview.to>preview.from){
    await step('increase_quantity',{
      input:{subscriptionId:intent._subscriptionId,body:{items:[{id:intent.itemId,quantity:preview.to}],
        proration_behavior:'create_prorations',proration_date:preview.prorationDate}},key:`${key}:increase`,
      read:async()=>{
        const value=await subscription();
        if(objectId(value.schedule)){throw problem(409,'BILLING_SCHEDULE_MISMATCH','An unexpected schedule needs review.');}
        const quantity=value.items.data[0].quantity;
        const proof=await evidence('customer.subscription.updated',value.id,`${key}:increase`,s=>
          s.items?.data?.length===1&&s.items.data[0].id===intent.itemId&&objectId(s.items.data[0].price)===intent.priceId&&s.items.data[0].quantity===preview.to);
        if(quantity===preview.to){
          if(!proof){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','The quantity change needs matching request evidence.');}
          return {confirmed:true,result:{subscriptionId:value.id,quantity,...proof}};
        }
        if(proof||quantity!==preview.from||value.items.data[0].current_period_end!==intent.periodEnd){throw problem(409,'BILLING_QUANTITY_UNCONFIRMED','The quantity or period changed after the reviewed intent.');}
        return {confirmed:false};
      },
      write:(input,stepKey)=>stripe.request('POST',`/v1/subscriptions/${input.subscriptionId}`,input.body,stepKey)
    });
  }else if(before.items.data[0].quantity!==preview.from||objectId(before.schedule)){
    throw problem(409,'BILLING_PREVIEW_STALE','The unchanged quantity preview no longer matches.');
  }
  return {currentQuantity:job.kind==='split'?preview.from:Math.max(preview.from,preview.to),nextRenewalQuantity:preview.to,timing:preview.timing,...(confirmedSchedule?{schedule:confirmedSchedule}:{})};
};

// Legacy grace/trial cleanup only. The service must persist reviewed intent and
// recheck local authority/obligations before writes and atomic completion. This
// handler does not grant access, enroll a trial, alter invoices or restore stock.
export const cessationCleanupRecovery=({store,stripe,clock=billingClock})=>async({job,step})=>{
  const {intent,tenant_id:tenantId,id}=job,{preview}=intent;
  if(job.kind!=='cessation'||!['grace','trial'].includes(intent.cleanupMode)||
    !Number.isSafeInteger(preview?.from)||preview.from<1||!Number.isSafeInteger(preview.to)||
    preview.to<0||preview.to>preview.from||!intent._subscriptionId||!intent.customerId||!intent.itemId||!intent.priceId||
    !Number.isSafeInteger(intent.periodEnd)||typeof intent.ending!=='boolean'){
    throw problem(409,'BILLING_CESSATION_STATE_CHANGED','The saved cleanup intent needs review.');
  }
  const account=await store.account(tenantId);
  if(account?.stripe_subscription_id!==intent._subscriptionId||account?.stripe_customer_id!==intent.customerId||account?.stripe_price_id!==intent.priceId){
    throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved subscription binding changed.');
  }
  await stripe.assertAccount();
  const subscription=async()=>{
    const value=await stripe.request('GET',`/v1/subscriptions/${intent._subscriptionId}`),item=value.items?.data?.[0];
    if(value.id!==intent._subscriptionId||value.livemode!==false||objectId(value.customer)!==intent.customerId||
      value.items?.data?.length!==1||item?.id!==intent.itemId||objectId(item.price)!==intent.priceId||
      item.current_period_end!==intent.periodEnd||value.status!==(intent.cleanupMode==='trial'?'trialing':'past_due')||
      (value.trial_start??null)!==intent.trialStart||(value.trial_end??null)!==intent.trialEnd){
      throw problem(409,'BILLING_SUBSCRIPTION_MISMATCH','Subscription terms changed after cleanup review.');
    }
    return value;
  };
  const key=`quixo:${tenantId}:${id}`,cancel=intent.ending||preview.to===0;
  const evidence=(type,resourceId,stepKey,matches)=>requestEvidence({stripe,type,resourceId,key:stepKey,matches,
    customerId:intent.customerId,since:job.created_at,clock});
  if(intent.scheduleId){
    await step('release_cleanup_schedule',{
      input:{scheduleId:intent.scheduleId},key:`${key}:cleanup-release`,
      read:async input=>{
        const sub=await subscription(),schedule=await stripe.request('GET',`/v1/subscription_schedules/${input.scheduleId}`);
        if(schedule.id!==input.scheduleId||schedule.livemode!==false||objectId(schedule.customer)!==intent.customerId||
          (objectId(schedule.subscription)||objectId(schedule.released_subscription))!==intent._subscriptionId){
          throw problem(409,'BILLING_SCHEDULE_MISMATCH','The cleanup schedule binding changed.');
        }
        if(schedule.status==='released'){
          if(objectId(sub.schedule)){throw problem(409,'BILLING_SCHEDULE_MISMATCH','A new schedule needs review.');}
          const proof=await evidence('subscription_schedule.released',schedule.id,`${key}:cleanup-release`,s=>
            objectId(s.released_subscription)===intent._subscriptionId);
          if(!proof){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Schedule release needs matching request evidence.');}
          return {confirmed:true,result:{scheduleId:schedule.id,released:true,...proof}};
        }
        if(schedule.status!=='active'||objectId(sub.schedule)!==schedule.id||scheduleFingerprint(schedule)!==intent.scheduleFingerprint||
          sub.items.data[0].quantity!==preview.from||Boolean(sub.cancel_at_period_end)!==intent.ending){
          throw problem(409,'BILLING_SCHEDULE_MISMATCH','The schedule changed after cleanup review.');
        }
        return {confirmed:false};
      },
      write:(input,stepKey)=>stripe.request('POST',`/v1/subscription_schedules/${input.scheduleId}/release`,{preserve_cancel_date:false},stepKey)
    });
  }
  const matches=value=>!objectId(value.schedule)&&value.items?.data?.length===1&&value.items.data[0].id===intent.itemId&&
    objectId(value.items.data[0].price)===intent.priceId&&value.items.data[0].quantity===(cancel?preview.from:preview.to)&&
    Boolean(value.cancel_at_period_end)===cancel;
  await step('cleanup_subscription',{
    input:{subscriptionId:intent._subscriptionId,body:cancel?{cancel_at_period_end:true,proration_behavior:'none'}:
      {items:[{id:intent.itemId,quantity:preview.to}],proration_behavior:'none'}},key:`${key}:cleanup`,
    read:async()=>{
      const sub=await subscription();
      if(objectId(sub.schedule)){throw problem(409,'BILLING_SCHEDULE_MISMATCH','An unexpected schedule needs review.');}
      const proof=await evidence('customer.subscription.updated',sub.id,`${key}:cleanup`,matches);
      if(matches(sub)){
        const unchanged=!intent.scheduleId&&(intent.ending||preview.to===preview.from);
        if(!proof&&!unchanged){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','Cleanup needs matching request evidence.');}
        return {confirmed:true,result:{subscriptionId:sub.id,quantity:sub.items.data[0].quantity,cancelAtPeriodEnd:cancel,...proof}};
      }
      // Releasing a reviewed schedule clears its cancellation date. Every other
      // unexpected quantity/cancellation transition requires manual review.
      if(proof||sub.items.data[0].quantity!==preview.from||Boolean(sub.cancel_at_period_end)!==(intent.scheduleId?false:intent.ending)){
        throw problem(409,'BILLING_CESSATION_STATE_CHANGED','Subscription quantity or cancellation changed after review.');
      }
      return {confirmed:false};
    },
    write:(input,stepKey)=>stripe.request('POST',`/v1/subscriptions/${input.subscriptionId}`,input.body,stepKey)
  });
  return {currentQuantity:cancel?preview.from:preview.to,nextRenewalQuantity:cancel?0:preview.to,
    cancelAtPeriodEnd:cancel,timing:cancel?'cancel_at_renewal':'future_invoices'};
};

export const splitRecovery=({store,stripe,clock=billingClock})=>async args=>{
  const {job,step}=args,{intent,tenant_id:tenantId,id}=job;
  if(job.kind!=='split'||!store.splitEnabled?.()){throw problem(503,'BILLING_SPLIT_UNAVAILABLE','Splitting dwellings is not available yet.');}
  await step('reserve_split_units',{
    input:{propertyId:intent.propertyId,unitsHash:intent.unitsHash},key:`quixo:${tenantId}:${id}:reserve`,
    read:async()=>{
      const rows=await store.read(`SELECT u.id,u.payload_json,u.payload_hash FROM dbo.management_inventory_split_units u
        JOIN dbo.management_inventory_splits s ON s.command_id=u.command_id
        WHERE s.command_id=@id AND s.tenant_id=@tenantId AND s.property_id=@propertyId AND s.state='reserved'`,{id,tenantId,propertyId:intent.propertyId});
      if(!Array.isArray(intent.units)||rows.length!==intent.units.length||hash(intent.units)!==intent.unitsHash||rows.some(row=>
        hash(JSON.parse(row.payload_json))!==row.payload_hash||!intent.units.some(unit=>unit.id===String(row.id).toLowerCase()&&hash(unit)===row.payload_hash))){
        throw problem(409,'BILLING_SPLIT_RESERVATION_CHANGED','The reserved units no longer match this split.');
      }
      return {confirmed:true,result:{unitCount:rows.length,unitsHash:intent.unitsHash}};
    },
    write:async()=>{throw problem(409,'BILLING_SPLIT_RESERVATION_CHANGED','Split reservation must precede billing.');}
  });
  if(intent.splitMode==='complimentary'){return {currentQuantity:intent.preview.from};}
  return quantityRecovery({store,stripe,clock})(args);
};
