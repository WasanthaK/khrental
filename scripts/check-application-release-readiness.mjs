import {getMssqlPool} from '../src/api/mssql/pool.js';
let pool;
try {
  if(process.env.PROPERTY_ENQUIRIES_ENABLED!=='true'||process.env.PUBLIC_LISTING_READ_ENABLED!=='true'||process.env.PROPERTY_VIEWINGS_ENABLED!=='true'){
    throw new Error('Prerequisites unavailable');
  }
  pool=await getMssqlPool();
  const result=await pool.request().query(`
    SELECT TOP(0) enquiry_id,status,move_in_date,occupants,term_months,statement,owner_note,consent_version,consent_at,version,updated_at FROM dbo.property_applications;
    SELECT TOP(0) id,enquiry_id,actor_id,request_id,payload_hash,status,move_in_date,occupants,term_months,statement,owner_note,consent_version,consent_at,version,created_at FROM dbo.property_application_events;
    SELECT CASE WHEN
      HAS_PERMS_BY_NAME('dbo.property_applications','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_applications','OBJECT','INSERT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_applications','OBJECT','UPDATE')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_application_events','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_application_events','OBJECT','INSERT')=1 THEN 1 ELSE 0 END AS permitted;
  `);
  if(Number(result.recordsets?.[2]?.[0]?.permitted)!==1){throw new Error('Access unavailable');}
  console.log('APPLICATION_RELEASE_READINESS=PASS');
} catch {
  console.error('APPLICATION_RELEASE_READINESS=FAIL');process.exitCode=1;
} finally {await pool?.close().catch(()=>{});}
