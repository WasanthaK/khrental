import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectManagementRecovery} from './inspect-management-billing-schema.mjs';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {createBillingService} from '../src/api/managementBilling/service.js';
import {createRecoveryJournal} from '../src/api/managementBilling/recoveryJournal.js';
import {createRecoveryWorker} from '../src/api/managementBilling/recoveryWorker.js';
import {createBillingInvariantInspector,readOnlyStripe} from '../src/api/managementBilling/invariants.js';

// Called only by the disposable SQL Server harness. Provider transport is synthetic.
export const verifyManagementRecovery=async(pool,{tenantId,otherTenant,actorId,stripe,remote,calls})=>{
  const migration=fs.readFileSync('migrations/20261112_01_management_recovery.sql','utf8');
  await pool.request().batch(migration);await pool.request().batch(migration);
  const inspection=await inspectManagementRecovery(pool);assert.equal(inspection.satisfied,true,inspection.detail);
  await pool.request().query('ALTER TABLE dbo.management_billing_recovery NOCHECK CONSTRAINT ALL');
  assert.equal((await inspectManagementRecovery(pool)).satisfied,false);
  await pool.request().query('ALTER TABLE dbo.management_billing_recovery WITH CHECK CHECK CONSTRAINT ALL');
  const env={MANAGEMENT_RECOVERY_SCHEMA_READY:'true'};
  const store=createBillingStore({getPool:async()=>pool,env});
  const account=await store.account(tenantId),sub=remote.get(`/v1/subscriptions/${account.stripe_subscription_id}`);
  sub.cancel_at_period_end=false;sub.schedule=null;
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_accounts SET stripe_schedule_id=NULL WHERE tenant_id=@tenantId',{tenantId}));
  const id=crypto.randomUUID(),args={tenantId,id,actorId,cancelAtPeriodEnd:true};
  let lost=true;
  const synthetic={...stripe,request:async(...args)=>{
    const result=await stripe.request(...args);
    if(args[0]==='POST'&&args[1]===`/v1/subscriptions/${sub.id}`&&lost){
      lost=false;
      assert.equal((await store.read('SELECT command_id FROM dbo.management_billing_steps WHERE command_id=@id',{id})).length,1,'Step intent committed before provider write');
      throw Object.assign(new Error('Synthetic lost response'),{status:503,code:'STRIPE_UNAVAILABLE'});
    }
    return result;
  }};
  const service=createBillingService({store,stripe:synthetic,env});
  await assert.rejects(service.cancel(args),{code:'STRIPE_UNAVAILABLE'});
  await assert.rejects(service.cancel({...args,id:crypto.randomUUID()}),{code:'BILLING_COMMAND_PENDING'});
  await assert.rejects(service.recoverOperation({tenantId:otherTenant,id}),{code:'BILLING_COMMAND_NOT_FOUND'});
  const posts=calls.filter(c=>c.method==='POST').length;
  await store.locked(tenantId,async q=>{
    await q('UPDATE dbo.management_billing_steps SET created_at=DATEADD(hour,-48,SYSUTCDATETIME()) WHERE command_id=@id',{id});
    await q('UPDATE dbo.management_billing_recovery SET next_attempt_at=SYSUTCDATETIME() WHERE command_id=@id',{id});
  });
  const result=await service.reconcileCancellation(args);
  assert.equal(result.cancelAtPeriodEnd,true);assert.deepEqual(await service.cancel(args),result);
  assert.equal(calls.filter(c=>c.method==='POST').length,posts,'Aged recovery proves the effect without a second provider write');
  assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id}))[0].state,'succeeded');
  assert.equal((await store.read("SELECT id FROM dbo.management_billing_audit WHERE resource_id=@id AND action='sandbox.cancellation.recovered'",{id})).length,1);

  const leaseId=crypto.randomUUID();
  await store.beginCommand({tenantId,id:leaseId,actorId,kind:'cancellation',payload:{cancelAtPeriodEnd:true},recovery:true});
  const journal=createRecoveryJournal({store,complete:async()=>({confirmed:true})}),claimArgs={tenantId,id:leaseId};
  const claims=await Promise.allSettled([journal.claim(claimArgs),journal.claim(claimArgs)]);
  assert.equal(claims.filter(c=>c.status==='fulfilled').length,1,'Only one worker can claim a tenant operation');
  assert.equal(claims.find(c=>c.status==='rejected').reason.code,'BILLING_RECOVERY_BUSY');
  const old=claims.find(c=>c.status==='fulfilled').value;
  await store.locked(tenantId,q=>q('UPDATE dbo.management_billing_recovery SET lease_until=DATEADD(second,-1,SYSUTCDATETIME()) WHERE command_id=@id',{id:leaseId}));
  const next=await journal.claim(claimArgs);assert.notEqual(next.token,old.token);
  await assert.rejects(journal.renew({...claimArgs,token:old.token}),{code:'BILLING_RECOVERY_FENCED'});
  await assert.rejects(journal.finish({...claimArgs,token:old.token,result:{}}),{code:'BILLING_RECOVERY_FENCED'});
  assert.deepEqual(await journal.fail({...claimArgs,token:old.token,review:true,code:'STALE',delaySeconds:30}),{review:false});
  const beforeVersion=(await store.account(tenantId)).version;
  const failingJournal=createRecoveryJournal({store:{...store,audit:async()=>{throw new Error('Synthetic audit failure');}},
    complete:async q=>{
      await q('UPDATE dbo.management_billing_accounts SET version=version+1 WHERE tenant_id=@tenantId',{tenantId});
      return {confirmed:true};
    }});
  await assert.rejects(failingJournal.finish({...claimArgs,token:next.token,result:{}}),/Synthetic audit failure/);
  assert.equal((await store.account(tenantId)).version,beforeVersion,'Projection rolls back when audit fails');
  assert.equal((await store.read('SELECT status FROM dbo.management_billing_commands WHERE id=@id',{id:leaseId}))[0].status,'pending');
  assert.equal((await store.read('SELECT state FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}))[0].state,'running');
  await store.locked(tenantId,q=>q("UPDATE dbo.tenant_memberships SET status='inactive' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId}));
  await assert.rejects(journal.finish({...claimArgs,token:next.token,result:{}}),{code:'BILLING_ADMIN_REQUIRED'});
  await store.locked(tenantId,async q=>{
    await q("UPDATE dbo.tenant_memberships SET status='active' WHERE tenant_id=@tenantId AND app_user_id=@actorId",{tenantId,actorId});
    await q('UPDATE dbo.management_billing_recovery SET attempts=8,lease_until=NULL WHERE command_id=@id',{id:leaseId});
  });
  assert.deepEqual(await journal.claim(claimArgs),{review:true});
  await assert.rejects(journal.claim(claimArgs),{code:'BILLING_RECOVERY_REVIEW'});
  const savedBefore=await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId});
  const dryRun=await createRecoveryWorker({store,service:null,env:{...env,MANAGEMENT_RECOVERY_TENANT_IDS:tenantId}}).run();
  assert.equal(dryRun.dryRun,true);assert.equal(dryRun.candidates.length,1);assert.equal(dryRun.candidates[0].due,0);
  assert.deepEqual(await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}),savedBefore,'Dry-run changes no recovery metadata');
  const observed=await createBillingInvariantInspector({store,stripe:readOnlyStripe(stripe)}).inspect(tenantId);
  assert.equal(observed.status,'operation_pending',JSON.stringify(observed));
  assert.equal(observed.nextRenewalQuantity,0);assert.equal(observed.currentPaidQuantity,account.quantity);
  assert.deepEqual(await store.read('SELECT * FROM dbo.management_billing_recovery WHERE command_id=@id',{id:leaseId}),savedBefore,'Invariant inspection changes no recovery metadata');
  console.log('PASS: recovery schema replay/drift, durable intent, aged provider readback, tenant isolation, atomic result/audit, exclusive leases, fencing, revoked actor and attempt cap');
};
