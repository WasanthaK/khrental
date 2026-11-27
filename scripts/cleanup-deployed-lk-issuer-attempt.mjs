// R5 row 32: exact SQL cleanup for one reconciled disposable issuer-cutover fixture.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {BILLING_ACCOUNT} from '/app/src/api/managementBilling/contract.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const confirmation=process.env.R5_LK_ISSUER_CLEANUP_CONFIRMATION;
const label='R5 synthetic deployed issuer cutover '+operation;
const email=`r5-issuer-${operation}@example.invalid`;
const slug='r5-issuer-'+operation;
const store=createBillingStore();
const lower=value=>String(value||'').toLowerCase();
const expectedApprovals=new Set([
  'R5 row 32 isolated synthetic schedule',
  'R5 row 32 isolated later synthetic assignment',
]);
let stage='preflight';

const deleted=async(q,statement,params)=>Number((await q(statement+'; SELECT @@ROWCOUNT AS deleted',params))[0]?.deleted||0);

try{
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(confirmation,'CLEANUP-DEPLOYED-LK-ISSUER');
  const result=await store.locked(operation,async q=>{
    const [tenant]=await q('SELECT id,name,slug,status,[plan] FROM dbo.tenants WHERE id=@id',{id:operation});
    assert.ok(tenant,'The exact disposable workspace is absent; use read-only reconciliation.');
    assert.deepEqual([lower(tenant.id),tenant.name,tenant.slug,tenant.status,tenant.plan],
      [operation,label,slug,'active','development-testing']);

    const users=await q('SELECT id,tenant_id,name,email,role,user_type,auth_id,status FROM dbo.app_users WHERE tenant_id=@id OR email=@email',
      {id:operation,email});
    assert.equal(users.length,1);const actor=users[0];
    assert.deepEqual([lower(actor.tenant_id),actor.name,actor.email,actor.user_type,actor.status],
      [operation,label,email,'admin','active']);
    const memberships=await q('SELECT tenant_id,app_user_id,role,status,is_default FROM dbo.tenant_memberships WHERE tenant_id=@id',
      {id:operation});
    assert.equal(memberships.length,1);
    assert.deepEqual([lower(memberships[0].app_user_id),memberships[0].role,memberships[0].status,Boolean(memberships[0].is_default)],
      [lower(actor.id),'viewer','active',true]);

    const properties=await q('SELECT id,tenant_id,name,status,propertytype,country_code FROM dbo.properties WHERE tenant_id=@id',
      {id:operation});
    assert.equal(properties.length,1);const property=properties[0];
    assert.deepEqual([property.name,property.status,property.propertytype,property.country_code],
      ['R5 synthetic LKR 100000 dwelling','rented','house','LK']);
    const agreements=await q('SELECT id,tenant_id,propertyid,status,rentamount FROM dbo.agreements WHERE tenant_id=@id',
      {id:operation});
    assert.equal(agreements.length,1);
    assert.deepEqual([lower(agreements[0].propertyid),agreements[0].status,Number(agreements[0].rentamount)],
      [lower(property.id),'active',100000]);

    const accounts=await q(`SELECT tenant_id,stripe_account_id,market,subscription_status,initial_payment_verified,quantity
      FROM dbo.management_billing_accounts WHERE tenant_id=@id`,{id:operation});
    assert.equal(accounts.length,1);
    assert.deepEqual([accounts[0].stripe_account_id,accounts[0].market,accounts[0].subscription_status,
      Boolean(accounts[0].initial_payment_verified),Number(accounts[0].quantity)],
    [BILLING_ACCOUNT,'LK','active',true,1]);

    const assignments=await q(`SELECT a.id,a.market,a.issuer_id,a.approval_reference,i.legal_name,i.country_code
      FROM dbo.management_market_issuer_assignments a JOIN dbo.management_invoice_issuers i ON i.id=a.issuer_id
      WHERE a.market='XZ' ORDER BY a.effective_at_utc,a.id`);
    assert.equal(assignments.length,2);
    assert.deepEqual(new Set(assignments.map(row=>row.approval_reference)),expectedApprovals);
    assert.deepEqual(new Set(assignments.map(row=>row.legal_name)),
      new Set(['R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer']));
    assert.deepEqual(new Set(assignments.map(row=>row.country_code)),new Set(['US','LK']));
    const issuerIds=assignments.map(row=>lower(row.issuer_id));
    assert.equal(new Set(issuerIds).size,2);
    const foreignAssignments=await q(`SELECT id FROM dbo.management_market_issuer_assignments
      WHERE market<>'XZ' AND issuer_id IN (@initial,@later)`,{initial:issuerIds[0],later:issuerIds[1]});
    assert.equal(foreignAssignments.length,0);

    const authUsers=await q('SELECT id,app_user_id,email FROM dbo.auth_users WHERE app_user_id=@actor OR email=@email',
      {actor:actor.id,email});
    assert.equal(authUsers.length,1);
    assert.deepEqual([lower(authUsers[0].app_user_id),authUsers[0].email],[lower(actor.id),email]);

    stage='exact_sql_cleanup';
    const counts={};
    counts.authSessions=await deleted(q,`DELETE s FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id
      WHERE u.app_user_id=@actor AND u.email=@email`,{actor:actor.id,email});
    counts.events=await deleted(q,'DELETE dbo.management_billing_events WHERE tenant_id=@id',{id:operation});
    counts.audits=await deleted(q,'DELETE dbo.management_billing_audit WHERE tenant_id=@id OR actor_id=@actor',
      {id:operation,actor:actor.id});
    counts.accounts=await deleted(q,'DELETE dbo.management_billing_accounts WHERE tenant_id=@id',{id:operation});
    counts.agreements=await deleted(q,'DELETE dbo.agreements WHERE tenant_id=@id',{id:operation});
    counts.properties=await deleted(q,'DELETE dbo.properties WHERE tenant_id=@id',{id:operation});
    counts.authUsers=await deleted(q,'DELETE dbo.auth_users WHERE app_user_id=@actor AND email=@email',{actor:actor.id,email});
    counts.memberships=await deleted(q,'DELETE dbo.tenant_memberships WHERE tenant_id=@id AND app_user_id=@actor',
      {id:operation,actor:actor.id});
    counts.users=await deleted(q,'DELETE dbo.app_users WHERE tenant_id=@id AND id=@actor AND email=@email',
      {id:operation,actor:actor.id,email});
    counts.tenants=await deleted(q,'DELETE dbo.tenants WHERE id=@id AND slug=@slug',{id:operation,slug});
    counts.assignments=await deleted(q,`DELETE dbo.management_market_issuer_assignments
      WHERE market='XZ' AND issuer_id IN (@initial,@later)`,{initial:issuerIds[0],later:issuerIds[1]});
    counts.issuers=await deleted(q,`DELETE dbo.management_invoice_issuers WHERE id IN (@initial,@later)
      AND legal_name IN ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')`,
    {initial:issuerIds[0],later:issuerIds[1]});
    assert.deepEqual([counts.accounts,counts.agreements,counts.properties,counts.authUsers,counts.memberships,
      counts.users,counts.tenants,counts.assignments,counts.issuers],[1,1,1,1,1,1,1,2,2]);

    stage='verify_zero_residue';
    const [residue]=await q(`SELECT
      (SELECT COUNT_BIG(*) FROM dbo.tenants WHERE id=@id) AS tenants,
      (SELECT COUNT_BIG(*) FROM dbo.management_market_issuer_assignments WHERE market='XZ') AS assignments,
      (SELECT COUNT_BIG(*) FROM dbo.management_invoice_issuers WHERE legal_name IN
        ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')) AS issuers,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_accounts WHERE tenant_id=@id) AS accounts,
      (SELECT COUNT_BIG(*) FROM dbo.app_users WHERE tenant_id=@id OR email=@email) AS users,
      (SELECT COUNT_BIG(*) FROM dbo.tenant_memberships WHERE tenant_id=@id) AS memberships,
      (SELECT COUNT_BIG(*) FROM dbo.properties WHERE tenant_id=@id) AS properties,
      (SELECT COUNT_BIG(*) FROM dbo.agreements WHERE tenant_id=@id) AS agreements,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_events WHERE tenant_id=@id) AS events,
      (SELECT COUNT_BIG(*) FROM dbo.management_billing_audit WHERE tenant_id=@id) AS audits,
      (SELECT COUNT_BIG(*) FROM dbo.auth_users WHERE email=@email) AS authUsers,
      (SELECT COUNT_BIG(*) FROM dbo.auth_sessions s JOIN dbo.auth_users u ON u.id=s.auth_user_id WHERE u.email=@email) AS authSessions`,
    {id:operation,email});
    const remaining=Object.fromEntries(Object.entries(residue).map(([key,value])=>[key,Number(value)]));
    assert.ok(Object.values(remaining).every(value=>value===0));
    return {operation,cleaned:true,readOnlyPreflight:true,liveChargingEnabled:false,counts,remaining};
  });
  console.log('LK_ISSUER_EXACT_CLEANUP='+JSON.stringify(result));
}catch(error){
  console.error('LK_ISSUER_EXACT_CLEANUP_FAILED='+JSON.stringify({operation,stage,code:error.code||'ASSERTION'}));
  process.exitCode=1;
}finally{await closeMssqlPool();}
