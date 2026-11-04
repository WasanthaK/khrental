import {getMssqlPool} from '../src/api/mssql/pool.js';
import {inspectManagementBilling} from './inspect-management-billing-schema.mjs';

let pool;
try {
  pool=await getMssqlPool();
  if(!(await inspectManagementBilling(pool)).satisfied) throw new Error('Schema not ready');
  const tables=['management_pricing_versions','management_billing_accounts','management_billing_commands','management_billing_events','management_billing_audit'];
  for(const table of tables){
    const permissions=table==='management_billing_events'||table==='management_billing_audit'?['SELECT','INSERT']:['SELECT','INSERT','UPDATE'];
    for(const permission of permissions){
      const result=await pool.request().input('table',`dbo.${table}`).input('permission',permission)
        .query("SELECT HAS_PERMS_BY_NAME(@table,'OBJECT',@permission) AS permitted");
      if(result.recordset[0]?.permitted!==1) throw new Error('Runtime permission missing');
    }
  }
  console.log('MANAGEMENT_BILLING_RELEASE_SCHEMA=PASS');
}catch{
  console.error('MANAGEMENT_BILLING_RELEASE_SCHEMA=FAIL');process.exitCode=1;
}finally{await pool?.close().catch(()=>{});}
