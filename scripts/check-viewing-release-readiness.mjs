import {getMssqlPool} from '../src/api/mssql/pool.js';
let pool;
try {
  if(process.env.PROPERTY_ENQUIRIES_ENABLED!=='true'||process.env.PUBLIC_LISTING_READ_ENABLED!=='true'){
    throw new Error('Prerequisites unavailable');
  }
  pool=await getMssqlPool();
  const result=await pool.request().query(`
    SELECT TOP(0) enquiry_id,status,starts_at,ends_at,timezone,instructions,version,updated_at FROM dbo.property_viewings;
    SELECT TOP(0) id,enquiry_id,actor_id,request_id,payload_hash,status,starts_at,ends_at,timezone,instructions,version,created_at FROM dbo.property_viewing_events;
    SELECT CASE WHEN
      HAS_PERMS_BY_NAME('dbo.property_viewings','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_viewings','OBJECT','INSERT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_viewings','OBJECT','UPDATE')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_viewing_events','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_viewing_events','OBJECT','INSERT')=1 THEN 1 ELSE 0 END AS permitted;
  `);
  if(Number(result.recordsets?.[2]?.[0]?.permitted)!==1){throw new Error('Access unavailable');}
  console.log('VIEWING_RELEASE_READINESS=PASS');
} catch {
  console.error('VIEWING_RELEASE_READINESS=FAIL');process.exitCode=1;
} finally {await pool?.close().catch(()=>{});}
