// R5 row 32: read-only production SQL reconciliation from the isolated executor identity.
import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation=process.env.R5_LK_ISSUER_OPERATION;
const store=createBillingStore();
const email=`r5-issuer-${operation}@example.invalid`;
const count=async(sql,params)=>Number((await store.read(sql,params))[0]?.count||0);

try{
  assert.match(operation||'',/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const [tenants,assignments,issuers,accounts,users,memberships,properties,agreements,
    events,audits,authUsers,authSessions]=await Promise.all([
    count('SELECT COUNT_BIG(*) AS count FROM dbo.tenants WHERE id=@id',{id:operation}),
    count("SELECT COUNT_BIG(*) AS count FROM dbo.management_market_issuer_assignments WHERE market='XZ'"),
    count(`SELECT COUNT_BIG(*) AS count FROM dbo.management_invoice_issuers
      WHERE legal_name IN ('R5 Synthetic Initial Issuer','R5 Synthetic Later Issuer')`),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.management_billing_accounts WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.app_users WHERE tenant_id=@id OR email=@email',{id:operation,email}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.tenant_memberships WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.properties WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.agreements WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.management_billing_events WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.management_billing_audit WHERE tenant_id=@id',{id:operation}),
    count('SELECT COUNT_BIG(*) AS count FROM dbo.auth_users WHERE email=@email',{email}),
    count(`SELECT COUNT_BIG(*) AS count FROM dbo.auth_sessions s
      JOIN dbo.auth_users u ON u.id=s.auth_user_id WHERE u.email=@email`,{email}),
  ]);
  const result={operation,readOnly:true,tenants,assignments,issuers,accounts,users,memberships,
    properties,agreements,events,audits,authUsers,authSessions};
  result.safeToRetry=Object.entries(result).filter(([,value])=>typeof value==='number').every(([,value])=>value===0);
  console.log('LK_ISSUER_SQL_RECONCILIATION='+JSON.stringify(result));
  assert.equal(result.safeToRetry,true,'SQL residue requires cleanup; do not dispatch');
}catch(error){
  console.error('LK_ISSUER_SQL_RECONCILIATION_FAILED='+JSON.stringify({operation,code:error.code||'ASSERTION'}));
  process.exitCode=1;
}finally{await closeMssqlPool();}
