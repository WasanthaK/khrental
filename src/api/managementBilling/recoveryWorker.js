import {problem,identifier} from './contract.js';
import {recoveryCode} from './recovery.js';

const scope=env=>{
  const values=String(env.MANAGEMENT_RECOVERY_TENANT_IDS||'').split(',').map(v=>v.trim()).filter(Boolean);
  if(values.length>10){throw problem(503,'BILLING_RECOVERY_CONFIGURATION','Recovery scope is limited to ten workspaces per process.');}
  return [...new Set(values.map(v=>identifier(v)))];
};

// Selection and dry-run are SELECT-only. Claims, authority, backoff and fencing
// remain in the shared runner, including when two processes select the same ID.
export const createRecoveryWorker=({store,service,env=process.env,logger=console})=>{
  const scan=async()=>{
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'){
      throw problem(503,'BILLING_RECOVERY_UNAVAILABLE','Verify the recovery schema before inspecting work.');
    }
    const candidates=[];
    for(const tenantId of scope(env)){
      const rows=await store.read(`SELECT TOP (10) c.id,c.tenant_id,c.kind,r.state,r.attempts,r.next_attempt_at,r.lease_until,
        CASE WHEN r.state IN ('pending','running') AND r.next_attempt_at<=SYSUTCDATETIME()
          AND (r.lease_until IS NULL OR r.lease_until<=SYSUTCDATETIME()) THEN 1 ELSE 0 END AS due
        FROM dbo.management_billing_commands c JOIN dbo.management_billing_recovery r ON r.command_id=c.id
        WHERE c.tenant_id=@tenantId AND c.status='pending'
        ORDER BY r.next_attempt_at,c.id`,{tenantId});
      candidates.push(...rows);
    }
    return candidates;
  };
  const run=async({dryRun=true}={})=>{
    if(!dryRun&&env.MANAGEMENT_RECOVERY_WORKER_ENABLED!=='true'){
      throw problem(503,'BILLING_RECOVERY_DISABLED','Automatic recovery is disabled.');
    }
    const candidates=await scan();
    if(dryRun){return {dryRun:true,candidates};}
    const outcomes=[];
    for(const row of candidates.filter(c=>c.due)){
      try{
        await service.recoverOperation({tenantId:row.tenant_id,id:row.id});
        outcomes.push({id:row.id,status:'completed'});
      }catch(error){
        const code=recoveryCode(error);
        outcomes.push({id:row.id,status:'deferred_or_review',code});
        if(code!=='BILLING_RECOVERY_BUSY'){
          logger.error?.('[ManagementBilling] recovery_attempt_incomplete',{commandId:row.id,code});
        }
      }
    }
    return {dryRun:false,outcomes};
  };
  return {run};
};

export const startRecoveryScheduler=({worker,env=process.env,logger=console,timers=globalThis})=>{
  if(env.MANAGEMENT_RECOVERY_WORKER_ENABLED!=='true'){return {stop:async()=>{}};}
  // Refuse incomplete rollout configuration before scheduling any work.
  if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'||env.MANAGEMENT_BILLING_SANDBOX_ENABLED!=='true'||!scope(env).length){
    throw problem(503,'BILLING_RECOVERY_CONFIGURATION','Recovery requires verified schema, sandbox billing and an explicit tenant scope.');
  }
  let stopped=false,timer=null,inFlight=null;
  const tick=async()=>{
    if(stopped){return;}
    inFlight=worker.run({dryRun:false});
    try{await inFlight;}catch(error){
      logger.error?.('[ManagementBilling] recovery_scan_failed',{code:recoveryCode(error)});
    }finally{
      inFlight=null;
      if(!stopped){timer=timers.setTimeout(tick,60000);timer?.unref?.();}
    }
  };
  timer=timers.setTimeout(tick,30000);timer?.unref?.();
  return {stop:async()=>{stopped=true;timers.clearTimeout(timer);await inFlight?.catch(()=>{});}};
};
