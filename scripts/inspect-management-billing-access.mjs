import {managementBillingColumns} from './inspect-management-billing-schema.mjs';

// Runtime DML proof only; the release workflow separately requires strict schema
// verification by the dedicated executor. Never grant the web identity definition
// visibility just to run readiness checks. These queries read no business rows.
export const inspectManagementBillingApplicationAccess=async pool=>{
  for(const [table,columns] of Object.entries(managementBillingColumns)){
    await pool.request().query(`SELECT TOP(0) ${columns.map(name=>`[${name}]`).join(',')} FROM dbo.[${table}]`);
    const permissions=table==='management_billing_events'||table==='management_billing_audit'?['SELECT','INSERT']:['SELECT','INSERT','UPDATE'];
    for(const permission of permissions){
      const result=await pool.request().query(`SELECT HAS_PERMS_BY_NAME('dbo.${table}','OBJECT','${permission}') AS permitted`);
      if(result.recordset?.[0]?.permitted!==1)return {satisfied:false};
    }
  }
  return {satisfied:true};
};
