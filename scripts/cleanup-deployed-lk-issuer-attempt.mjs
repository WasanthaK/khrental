// R5 row 32: exact SQL cleanup for one reconciled disposable issuer-cutover fixture.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {fixtureFailure, mutableIssuerIds, readIssuerCleanupFixture, verifyResidueCounts, verifyRetainedIssuer} from './lk-issuer-cleanup-fixture.mjs';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const confirmation=process.env.R5_LK_ISSUER_CLEANUP_CONFIRMATION;
const store=createBillingStore();
let stage='preflight';

const deleted=async(q,statement,params)=>Number((await q(statement+'; SELECT @@ROWCOUNT AS deleted',params))[0]?.deleted||0);

try{
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const mutableOnly=confirmation==='CLEANUP-DEPLOYED-LK-ISSUER-MUTABLE-ONLY';
  assert.ok(mutableOnly || confirmation==='CLEANUP-DEPLOYED-LK-ISSUER');
  const result=await store.locked(operation,async q=>{
    const {actor,email,slug,propertyId,preferenceId,issuerHistory}=await readIssuerCleanupFixture(q,operation);

    const removable=mutableIssuerIds(operation,issuerHistory,mutableOnly);

    stage='exact_sql_cleanup';
    const counts={};
    counts.authSessions=await deleted(q,`DELETE s FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id
      WHERE u.app_user_id=@actor AND u.email=@email`,{actor:actor.id,email});
    counts.events=await deleted(q,'DELETE dbo.management_billing_events WHERE tenant_id=@id',{id:operation});
    counts.audits=await deleted(q,'DELETE dbo.management_billing_audit WHERE tenant_id=@id',{id:operation});
    counts.accounts=await deleted(q,'DELETE dbo.management_billing_accounts WHERE tenant_id=@id',{id:operation});
    counts.agreements=await deleted(q,'DELETE dbo.agreements WHERE tenant_id=@id',{id:operation});
    counts.listingPreferences=await deleted(q,`DELETE dbo.public_listing_preferences
      WHERE tenant_id=@id AND property_id=@property AND public_id=@preference`,{id:operation,property:propertyId,preference:preferenceId});
    assert.equal(counts.listingPreferences,1);
    counts.properties=await deleted(q,'DELETE dbo.properties WHERE tenant_id=@id',{id:operation});
    counts.authUsers=await deleted(q,'DELETE dbo.auth_users WHERE app_user_id=@actor AND email=@email',{actor:actor.id,email});
    counts.memberships=await deleted(q,'DELETE dbo.tenant_memberships WHERE tenant_id=@id AND app_user_id=@actor',
      {id:operation,actor:actor.id});
    counts.users=await deleted(q,'DELETE dbo.app_users WHERE tenant_id=@id AND id=@actor AND email=@email',
      {id:operation,actor:actor.id,email});
    counts.tenants=await deleted(q,'DELETE dbo.tenants WHERE id=@id AND slug=@slug',{id:operation,slug});
    counts.assignments=0;
    counts.issuers=0;
    for (const issuer of removable) {
      const removed=await deleted(q,`DELETE dbo.management_market_issuer_assignments
        WHERE market='XZ' AND issuer_id=@issuer AND effective_at_utc>SYSUTCDATETIME()`,{issuer});
      assert.equal(removed,1);
      counts.assignments+=removed;
      counts.issuers+=await deleted(q,`DELETE dbo.management_invoice_issuers WHERE id=@issuer
        AND legal_name IN ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')`,{issuer});
    }
    assert.deepEqual([counts.accounts,counts.agreements,counts.properties,counts.authUsers,counts.memberships,
      counts.users,counts.tenants,counts.assignments,counts.issuers],[1,1,1,1,1,1,1,removable.length,removable.length]);

    stage='verify_remaining_records';
    const [residue]=await q(`SELECT
      (SELECT COUNT_BIG(*) FROM dbo.tenants WHERE id=@id) AS tenants,
      (SELECT COUNT_BIG(*) FROM dbo.management_market_issuer_assignments WHERE market='XZ') AS assignments,
      (SELECT COUNT_BIG(*) FROM dbo.management_invoice_issuers WHERE legal_name IN
        ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')) AS issuers,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_accounts WHERE tenant_id=@id) AS accounts,
      (SELECT COUNT_BIG(*) FROM dbo.app_users WHERE tenant_id=@id OR email=@email) AS users,
      (SELECT COUNT_BIG(*) FROM dbo.tenant_memberships WHERE tenant_id=@id) AS memberships,
      (SELECT COUNT_BIG(*) FROM dbo.properties WHERE tenant_id=@id) AS properties,
      (SELECT COUNT_BIG(*) FROM dbo.public_listing_preferences WHERE tenant_id=@id) AS listingPreferences,
      (SELECT COUNT_BIG(*) FROM dbo.agreements WHERE tenant_id=@id) AS agreements,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_events WHERE tenant_id=@id) AS events,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_audit WHERE tenant_id=@id) AS audits,
      (SELECT COUNT_BIG(*) FROM dbo.auth_users WHERE email=@email) AS authUsers,
      (SELECT COUNT_BIG(*) FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id WHERE u.email=@email) AS authSessions`,
    {id:operation,email});
    const remaining=Object.fromEntries(Object.entries(residue).map(([key,value])=>[key,Number(value)]));
    verifyResidueCounts(remaining,mutableOnly);
    const retainedIssuer=mutableOnly ? await verifyRetainedIssuer(q,operation) : null;
    return {operation,cleaned:!mutableOnly,workspaceRemoved:true,retainedIssuer,readOnlyPreflight:true,liveChargingEnabled:false,counts,remaining};
  });
  console.log('LK_ISSUER_EXACT_CLEANUP='+JSON.stringify(result));
}catch(error){
  console.error('LK_ISSUER_EXACT_CLEANUP_FAILED='+JSON.stringify({operation,stage,code:error.code||'ASSERTION',
    ...(stage==='preflight'?{check:fixtureFailure(error)}:{}),
    ...(Number.isInteger(error.number)?{sqlErrorNumber:error.number}:{})}));
  process.exitCode=1;
}finally{await closeMssqlPool();}
