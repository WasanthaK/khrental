import {getMssqlPool} from '../src/api/mssql/pool.js';
import {inspectManagementBillingApplicationAccess} from './inspect-management-billing-access.mjs';

let pool;
try {
  pool=await getMssqlPool();
  if(!(await inspectManagementBillingApplicationAccess(pool)).satisfied) throw new Error('Runtime access not ready');
  console.log('MANAGEMENT_BILLING_RELEASE_SCHEMA=PASS');
}catch{
  console.error('MANAGEMENT_BILLING_RELEASE_SCHEMA=FAIL');process.exitCode=1;
}finally{await pool?.close().catch(()=>{});}
