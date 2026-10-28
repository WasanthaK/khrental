// Application identity proof only. Strict schema/ledger verification belongs to
// the separate migration executor; the web identity need not see definitions.
export const inspectEnquiryApplicationAccess = async pool => {
  const result=await pool.request().query(`
    SELECT TOP(0) id,listing_public_id,tenant_id,property_id,seeker_id,seeker_name,
      seeker_email,country_code,listing_title,message,consent_version,consent_at,
      request_id,payload_hash,status,owner_response,updated_by,created_at,updated_at,version
      FROM dbo.property_enquiries;
    SELECT TOP(0) id,enquiry_id,actor_user_id,from_status,to_status,version,response,created_at
      FROM dbo.property_enquiry_events;
    SELECT CASE WHEN
      HAS_PERMS_BY_NAME('dbo.property_enquiries','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_enquiries','OBJECT','INSERT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_enquiries','OBJECT','UPDATE')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_enquiry_events','OBJECT','SELECT')=1 AND
      HAS_PERMS_BY_NAME('dbo.property_enquiry_events','OBJECT','INSERT')=1
      THEN 1 ELSE 0 END AS permitted;
  `);
  return {satisfied:Number(result.recordsets?.[2]?.[0]?.permitted)===1};
};
