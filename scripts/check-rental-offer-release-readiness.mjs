import {getMssqlPool} from '../src/api/mssql/pool.js';
let pool;
try{
  if(['PROPERTY_ENQUIRIES_ENABLED','PROPERTY_APPLICATIONS_ENABLED','PROPERTY_VIEWINGS_ENABLED','PUBLIC_LISTING_READ_ENABLED'].some(k=>process.env[k]!=='true')){throw new Error('Prerequisites unavailable');}
  pool=await getMssqlPool();
  const tables={rental_offer_agreement_links:'agreement_id,enquiry_id,accepted_version,application_version,unit_id,rent,deposit,start_date,end_date',property_rental_offers:'enquiry_id,tenant_id,property_id,unit_id,unit_label,application_version,status,version,currency,rent,deposit,fees,start_date,end_date,terms,offer_until,hold_until,accepted_at,consent_version,agreement_id,updated_at',
    property_rental_offer_events:'id,enquiry_id,actor_id,request_id,payload_hash,version,event_type,snapshot,created_at',
    agreement_templates:'id,tenant_id,content,name,version',agreements:'id,tenant_id,renteeid,propertyid,unitid,status,terms,content,rentamount,depositamount,startdate,enddate,signature_status,signature_completed_at,signeddate',
    tenant_memberships:'id,tenant_id,app_user_id,role,status,is_default',tenancy_lifecycle_events:'tenant_id,agreement_id,event_type,actor_user_id,metadata',
    tenancy_deposit_transactions:'agreement_id,tenant_id,transaction_type,status,amount',tenancy_move_in_checklists:'id,tenant_id,agreement_id,status',tenancy_move_in_checklist_items:'checklist_id,tenant_id,is_required,status'};
  for(const [table,columns] of Object.entries(tables)){await pool.request().query(`SELECT TOP(0) ${columns} FROM dbo.${table}`);}
  for(const [table,permissions] of Object.entries({rental_offer_agreement_links:['SELECT','INSERT'],property_rental_offers:['SELECT','INSERT','UPDATE'],property_rental_offer_events:['SELECT','INSERT'],agreements:['SELECT','INSERT','UPDATE'],agreement_templates:['SELECT'],tenant_memberships:['SELECT','INSERT'],tenancy_lifecycle_events:['SELECT','INSERT']})){
    for(const permission of permissions){const r=await pool.request().query(`SELECT HAS_PERMS_BY_NAME('dbo.${table}','OBJECT','${permission}') AS allowed`);if(Number(r.recordset?.[0]?.allowed)!==1){throw new Error('Runtime access unavailable');}}
  }
  console.log('RENTAL_OFFER_RELEASE_READINESS=PASS');
}catch{console.error('RENTAL_OFFER_RELEASE_READINESS=FAIL');process.exitCode=1;}
finally{await pool?.close().catch(()=>{});}
