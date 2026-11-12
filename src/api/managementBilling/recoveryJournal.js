import crypto from 'node:crypto';
import {hash,problem,cessationCleanupMode} from './contract.js';

// Reuses the account lock: independent property operations share one subscription.
// Claims and step checkpoints use short transactions. The completion callback
// retains the existing projection transaction during this first type migration.
export const createRecoveryJournal=({store,complete})=>{
  const load=async(q,tenantId,id)=>(await q(`SELECT c.*,r.actor_id,r.intent_json,r.state,r.attempts,r.lease_token,r.lease_until,
    r.next_attempt_at,SYSUTCDATETIME() AS checked_at FROM dbo.management_billing_commands c
    JOIN dbo.management_billing_recovery r ON r.command_id=c.id WHERE c.id=@id AND c.tenant_id=@tenantId`,{id,tenantId}))[0];
  const owned=async(q,{tenantId,id,token})=>{
    const row=await load(q,tenantId,id);
    if(!row||row.state!=='running'||String(row.lease_token).toLowerCase()!==String(token).toLowerCase()||
      new Date(row.lease_until)<=row.checked_at){throw problem(409,'BILLING_RECOVERY_FENCED','Another worker owns this billing operation.');}
    return row;
  };
  const claim=args=>store.locked(args.tenantId,async q=>{
    const row=await load(q,args.tenantId,args.id);
    if(!row){throw problem(404,'BILLING_COMMAND_NOT_FOUND','This recovery operation was not found.');}
    if(row.status==='completed'){return {completed:true,result:JSON.parse(row.result_json)};}
    if(row.state==='failed_needs_review'){throw problem(409,'BILLING_RECOVERY_REVIEW','This billing operation requires review.');}
    if((row.lease_until&&new Date(row.lease_until)>row.checked_at)||new Date(row.next_attempt_at)>row.checked_at){
      throw problem(409,'BILLING_RECOVERY_BUSY','This billing operation is awaiting its recovery attempt.');
    }
    if(row.attempts>=8){
      await q(`UPDATE dbo.management_billing_recovery SET state='failed_needs_review',last_error='BILLING_RECOVERY_LIMIT',
        lease_token=NULL,lease_until=NULL,updated_at=SYSUTCDATETIME() WHERE command_id=@id`,{id:args.id});
      return {review:true};
    }
    const token=crypto.randomUUID();
    await q(`UPDATE dbo.management_billing_recovery SET state='running',attempts=attempts+1,lease_token=@token,
      lease_until=DATEADD(minute,5,SYSUTCDATETIME()),updated_at=SYSUTCDATETIME() WHERE command_id=@id`,{id:args.id,token});
    return {token,job:{...row,intent:JSON.parse(row.intent_json),attempts:row.attempts+1}};
  });
  const renew=args=>store.locked(args.tenantId,async q=>{
    const row=await owned(q,args);
    await store.assertActor(q,args.tenantId,row.actor_id);
    const account=await store.account(args.tenantId,q);
    const intent=JSON.parse(row.intent_json);
    if(account?.stripe_subscription_id!==intent._subscriptionId||account?.stripe_customer_id!==intent.customerId||(intent.priceId&&account?.stripe_price_id!==intent.priceId)){
      throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription binding changed before this billing write.');
    }
    if(['quantity_apply','quantity_preview'].includes(row.kind)&&hash(await store.inventory(args.tenantId,q,{includePending:true}))!==intent.preview.inventoryHash){
      throw problem(409,'BILLING_INVENTORY_CHANGED','The reviewed inventory changed before this provider write.');
    }
    if(row.kind==='checkout'&&hash(await store.inventory(args.tenantId,q,{includePending:true}))!==intent.inventoryHash){
      throw problem(409,'BILLING_INVENTORY_CHANGED','The checkout inventory changed before this provider write.');
    }
    if(row.kind==='cessation'){
      if(intent.cleanupMode&&cessationCleanupMode(account,new Date(row.checked_at).getTime())!==intent.cleanupMode){
        throw problem(409,'BILLING_CESSATION_STATE_CHANGED','Subscription access changed before cleanup.');
      }
      const preview=await store.cessationPreviewLocked(q,{tenantId:args.tenantId,actorId:row.actor_id,commandId:args.id,...intent});
      if(!preview.eligible||preview.alreadyCeased||preview.inventoryHash!==intent.inventoryHash){
        throw problem(409,'BILLING_CESSATION_BLOCKED','The reviewed management change needs review.');
      }
    }
    await q(`UPDATE dbo.management_billing_recovery SET lease_until=DATEADD(minute,5,SYSUTCDATETIME()),
      updated_at=SYSUTCDATETIME() WHERE command_id=@id`,{id:args.id});
  });
  const prepareStep=args=>store.locked(args.tenantId,async q=>{
    await owned(q,args);
    const rows=await q('SELECT * FROM dbo.management_billing_steps WHERE command_id=@id AND name=@name',{id:args.id,name:args.name});
    if(rows.length){
      const saved=rows[0];
      if(saved.input_hash!==args.inputHash||saved.idempotency_key!==args.key){throw problem(409,'BILLING_RECOVERY_INTENT_CHANGED','The saved billing step no longer matches this operation.');}
      return {...saved,input:JSON.parse(saved.input_json)};
    }
    const saved=(await q(`INSERT dbo.management_billing_steps(command_id,name,input_hash,input_json,idempotency_key)
      OUTPUT inserted.* VALUES(@id,@name,@inputHash,@inputJson,@key)`,
    {id:args.id,name:args.name,inputHash:args.inputHash,inputJson:JSON.stringify(args.input),key:args.key}))[0];
    return {...saved,input:args.input};
  });
  const completeStep=args=>store.locked(args.tenantId,async q=>{
    await owned(q,args);
    await q(`UPDATE dbo.management_billing_steps SET result_json=@result,completed_at=SYSUTCDATETIME()
      WHERE command_id=@id AND name=@name AND completed_at IS NULL`,{id:args.id,name:args.name,result:JSON.stringify(args.result)});
  });
  const finish=args=>store.locked(args.tenantId,async q=>{
    const row=await owned(q,args);
    await store.assertActor(q,args.tenantId,row.actor_id);
    const result=await complete(q,row,args.result);
    await store.completeCommand(q,args.id,result);
    await q(`UPDATE dbo.management_billing_recovery SET state='succeeded',completed_at=SYSUTCDATETIME(),
      updated_at=SYSUTCDATETIME(),lease_token=NULL,lease_until=NULL,last_error=NULL WHERE command_id=@id`,{id:args.id});
    await store.audit(q,{tenantId:args.tenantId,actorId:row.actor_id,action:`sandbox.${row.kind}.recovered`,resourceId:args.id,
      current:result,reason:'Durable provider steps confirmed; operation and local result committed together.'});
    return result;
  });
  const fail=args=>store.locked(args.tenantId,async q=>{
    const row=await load(q,args.tenantId,args.id);
    if(!row||row.state!=='running'||String(row.lease_token).toLowerCase()!==String(args.token).toLowerCase()){return {review:false};}
    await q(`UPDATE dbo.management_billing_recovery SET state=@state,last_error=@code,lease_token=NULL,lease_until=NULL,
      next_attempt_at=DATEADD(second,@delay,SYSUTCDATETIME()),updated_at=SYSUTCDATETIME() WHERE command_id=@id`,
    {id:args.id,state:args.review?'failed_needs_review':'pending',code:args.code,delay:args.delaySeconds});
    return {review:args.review};
  });
  return {claim,renew,prepareStep,completeStep,finish,fail};
};
