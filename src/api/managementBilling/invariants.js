import {BILLING_ACCOUNT,entitlement,localCessationAllowed,hash,identifier,problem} from './contract.js';
import {objectId} from './stripe.js';
import {billingClock} from './recovery.js';

// Compares three distinct facts: current paid capacity, managed inventory, and
// verified renewal quantity. This function never proposes a corrective write.
export const billingInvariants=({account,inventory,commands=[],subscription=null,schedule=null,trialCleanup=null,splitIssues=[],now})=>{
  const issues=[...splitIssues];
  const state=entitlement(account,now).state;
  if(!account){return {status:'not_enrolled',issues:[],managedQuantity:inventory.length,entitlement:state};}
  const current=account.quantity||0;
  const terminal=['canceled','incomplete_expired'].includes(subscription?.status);
  const ending=Boolean(subscription?.cancel_at_period_end)||terminal;
  const next=ending?0:account.pending_quantity??current;
  const result={currentPaidQuantity:current,managedQuantity:inventory.length,nextRenewalQuantity:next,entitlement:state};
  if(account.stripe_account_id!==BILLING_ACCOUNT){issues.push('ACCOUNT_BINDING');}
  if(account.stripe_subscription_id){
    if(!subscription||subscription.id!==account.stripe_subscription_id||objectId(subscription.customer)!==account.stripe_customer_id||subscription.livemode!==false){
      issues.push('SUBSCRIPTION_BINDING');
    }else{
      const items=subscription.items?.data||[],item=items[0];
      if(items.length!==1||objectId(item?.price)!==account.stripe_price_id||item?.id!==account.stripe_item_id||
        !Number.isSafeInteger(item?.quantity)||item.quantity<1||item.quantity!==current){issues.push('CURRENT_PAID_QUANTITY');}
      if(subscription.status!==account.subscription_status){issues.push('SUBSCRIPTION_STATUS');}
      if(Boolean(subscription.cancel_at_period_end)!==Boolean(account.cancel_at_period_end)){issues.push('CANCELLATION_STATE');}
      if((objectId(subscription.schedule)||null)!==(account.stripe_schedule_id||null)){issues.push('SCHEDULE_BINDING');}
      if(subscription.trial_start||subscription.trial_end){
        const saved=trialCleanup?.intent;
        const known=trialCleanup?.result?.managementEnded&&saved?.cleanupMode==='trial'&&saved._subscriptionId===subscription.id&&
          saved.customerId===account.stripe_customer_id&&saved.priceId===account.stripe_price_id&&saved.trialStart===subscription.trial_start&&
          saved.trialEnd===subscription.trial_end&&saved.preview?.inventoryHash===hash(inventory)&&
          ['trialing','canceled'].includes(subscription.status)&&!entitlement(account,now).management;
        if(!known){issues.push('UNSUPPORTED_TRIAL');}
      }
      if(account.stripe_schedule_id){
        const matches=(phase,quantity)=>phase?.items?.length===1&&objectId(phase.items[0].price)===account.stripe_price_id&&phase.items[0].quantity===quantity;
        const currentPhase=schedule?.phases?.find(p=>p.start_date===schedule.current_phase?.start_date);
        const nextPhase=schedule?.phases?.find(p=>p.start_date===item?.current_period_end);
        if(!schedule||schedule.id!==account.stripe_schedule_id||schedule.livemode!==false||schedule.status!=='active'||
          objectId(schedule.subscription)!==subscription.id||objectId(schedule.customer)!==account.stripe_customer_id||
          schedule.end_behavior!=='release'||!matches(currentPhase,current)||currentPhase?.end_date!==item?.current_period_end||
          !matches(nextPhase,next)||nextPhase?.proration_behavior!=='none'||ending){issues.push('RENEWAL_SCHEDULE');}
      }else if(!ending&&account.pending_quantity!==null&&account.pending_quantity!==undefined&&account.pending_quantity!==current){
        issues.push('MISSING_RENEWAL_SCHEDULE');
      }
      // Complimentary and nonpaying cessation retain provider obligations.
      // Quantity equality is required again when paid/grace access resumes.
      if(!ending&&!localCessationAllowed(account,now)&&next!==inventory.length){issues.push('RENEWAL_INVENTORY_QUANTITY');}
    }
  }else if(subscription||account.stripe_item_id||account.stripe_schedule_id||current!==0){issues.push('ORPHANED_BILLING_STATE');}
  const mismatch=issues.length>0,staleOperations=commands.filter(c=>c.stale).map(c=>c.id),reviewOperations=commands.filter(c=>c.state==='failed_needs_review').map(c=>c.id);
  if(staleOperations.length){issues.push('STALE_RECOVERY_OPERATION');}
  if(reviewOperations.length){issues.push('RECOVERY_REVIEW_REQUIRED');}
  return {...result,status:mismatch?'needs_review':commands.length?'operation_pending':'consistent',issues,staleOperations,reviewOperations,
    pendingOperations:commands.length,reactivationRequired:terminal&&inventory.length>0};
};

export const createBillingInvariantInspector=({store,stripe,clock=billingClock})=>{
  const snapshot=tenantId=>store.locked(tenantId,async q=>({
    account:await store.account(tenantId,q),inventory:await store.inventory(tenantId,q),
    splitIssues:store.splitEnabled?.()?await(async()=>{
      const rows=await q(`SELECT s.command_id,s.state,c.status,
        (SELECT COUNT(*) FROM dbo.management_inventory_split_units r WHERE r.command_id=s.command_id) AS reserved,
        (SELECT COUNT(*) FROM dbo.property_units u WHERE u.split_operation_id=s.command_id AND u.tenant_id=s.tenant_id AND u.propertyid=s.property_id AND u.parent_stock_id=s.property_id AND u.stock_type='apartment_unit') AS live
        FROM dbo.management_inventory_splits s JOIN dbo.management_billing_commands c ON c.id=s.command_id WHERE s.tenant_id=@tenantId`,{tenantId});
      return rows.some(r=>r.state==='active'?(r.status!=='completed'||r.live!==r.reserved||r.live<2):r.live!==0)?['SPLIT_INVENTORY_STATE']:[];
    })():[],
    trialCleanup:store.recoveryEnabled?.()?await (async()=>{
      const rows=await q(`SELECT TOP (1) r.intent_json,c.result_json FROM dbo.management_billing_commands c
        JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.tenant_id=@tenantId AND c.kind='cessation'
        AND c.status='completed' AND JSON_VALUE(r.intent_json,'$.cleanupMode')='trial' ORDER BY c.completed_at DESC`,{tenantId});
      return rows.length?{intent:JSON.parse(rows[0].intent_json),result:JSON.parse(rows[0].result_json)}:null;
    })():null,
    commands:await q(store.recoveryEnabled?.()?`SELECT c.id,c.kind,c.status,r.state,
      CASE WHEN r.updated_at<DATEADD(minute,-5,SYSUTCDATETIME()) THEN 1 ELSE 0 END AS stale
      FROM dbo.management_billing_commands c LEFT JOIN dbo.management_billing_recovery r ON r.command_id=c.id
      WHERE c.tenant_id=@tenantId AND c.status='pending' ORDER BY c.id`:
      "SELECT id,kind,status FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND status='pending' ORDER BY id",{tenantId})
  }));
  const inspect=async value=>{
    const tenantId=identifier(value),before=await snapshot(tenantId);
    let subscription=null,schedule=null;
    if(before.account?.stripe_subscription_id){
      await stripe.assertAccount();
      subscription=await stripe.request('GET',`/v1/subscriptions/${before.account.stripe_subscription_id}`);
      if(before.account.stripe_schedule_id){schedule=await stripe.request('GET',`/v1/subscription_schedules/${before.account.stripe_schedule_id}`);}
    }
    const after=await snapshot(tenantId);
    if(hash(before)!==hash(after)){return {tenantId,status:'inconclusive',issues:['LOCAL_STATE_CHANGED']};}
    // This is an observation, not atomic provider acceptance or authorization.
    return {tenantId,...billingInvariants({...after,subscription,schedule,now:clock.now()})};
  };
  return {inspect};
};

export const readOnlyStripe=stripe=>({...stripe,request:(method,...args)=>{
  if(method!=='GET'){throw problem(500,'BILLING_INSPECTION_WRITE_DENIED','Inspection cannot write to the provider.');}
  return stripe.request(method,...args);
}});
