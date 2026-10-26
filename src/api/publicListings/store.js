import {getMssqlPool,sql} from '../mssql/pool.js';
import {runQuery,runSingleQuery} from '../mssql/query.js';

// Authenticated SQL is the truth for current vacancy; no cached "published" bit can
// outlive a reservation, active tenancy or opt-out. Every query rechecks status.
export const PUBLIC_LISTING_ELIGIBILITY_SQL=`
  FROM dbo.public_listing_preferences pref
  JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
  JOIN dbo.tenants t ON t.id=p.tenant_id
  WHERE pref.opted_out=0
    AND (t.status IS NULL OR t.status=N'active')
    AND LOWER(COALESCE(p.status,N'')) IN (N'active',N'available',N'rented')
    AND NOT EXISTS(
      SELECT 1 FROM dbo.agreements a
      WHERE a.tenant_id=p.tenant_id AND a.propertyid=p.id
        AND a.status=N'active' AND a.unitid IS NULL
    )
    AND (
      (
       EXISTS(SELECT 1 FROM dbo.property_units u WHERE u.propertyid=p.id AND u.tenant_id=p.tenant_id)
       AND EXISTS(
         SELECT 1 FROM dbo.property_units u
         WHERE u.propertyid=p.id AND u.tenant_id=p.tenant_id
           AND LOWER(COALESCE(u.status,N''))=N'available'
           AND NOT EXISTS(
             SELECT 1 FROM dbo.agreements a WHERE a.tenant_id=u.tenant_id
               AND a.propertyid=p.id AND a.unitid=u.id AND a.status=N'active'
           )
       )
      )
      OR (
       NOT EXISTS(SELECT 1 FROM dbo.property_units u WHERE u.propertyid=p.id AND u.tenant_id=p.tenant_id)
       AND LOWER(COALESCE(p.status,N'')) IN(N'active',N'available')
       AND NOT EXISTS(SELECT 1 FROM dbo.agreements a WHERE a.tenant_id=p.tenant_id
                      AND a.propertyid=p.id AND a.status=N'active')
      )
    )`;

// JSON rent extraction does NOT pass through banking/term/image JSON.
// Numeric rent from existing app properties.rentalvalues.rent is optional.
export const PUBLIC_LISTING_SELECT_SQL=`
  pref.public_id,pref.country_code,pref.opted_out,pref.public_headline,pref.location_label,p.propertytype,
  TRY_CONVERT(DECIMAL(18,2),CASE WHEN ISJSON(p.rentalvalues)=1
    THEN COALESCE(JSON_VALUE(p.rentalvalues,'$.rent'),JSON_VALUE(p.rentalvalues,'$.monthlyRent'))
    ELSE NULL END) AS monthly_rent`;

export const listEligible=country=>runQuery(`
 SELECT TOP(50) ${PUBLIC_LISTING_SELECT_SQL}
 ${PUBLIC_LISTING_ELIGIBILITY_SQL}
   AND pref.country_code=@country
 ORDER BY p.createdat DESC,p.id DESC`,{country});

export const findEligible=publicId=>runSingleQuery(`
 SELECT TOP(1) ${PUBLIC_LISTING_SELECT_SQL}
 ${PUBLIC_LISTING_ELIGIBILITY_SQL}
   AND pref.public_id=@publicId`,{publicId});

export const getPreference=(tenantId,propertyId)=>runSingleQuery(`
 SELECT TOP(1) pref.public_id,pref.country_code,pref.opted_out,
   pref.public_headline,pref.location_label
 FROM dbo.public_listing_preferences pref
 JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
 WHERE pref.tenant_id=@tenantId AND pref.property_id=@propertyId`,{tenantId,propertyId});

export const updatePreference=async({tenantId,propertyId,actorId,changes})=>{
  const pool=await getMssqlPool();
  const tx=new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{
    const query=async(sqlText,params={})=>{
      const request=new sql.Request(tx);
      for(const [key,value] of Object.entries(params))request.input(key,value);
      return (await request.query(sqlText)).recordset||[];
    };
    const args={tenantId,propertyId,actorId};
    // Recheck authoritative membership in the transaction, not just token/user.role.
    const user=await query(`
      SELECT TOP(1) tm.id FROM dbo.tenant_memberships tm WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.tenants t ON t.id=tm.tenant_id
      JOIN dbo.app_users au ON au.id=tm.app_user_id
      WHERE tm.tenant_id=@tenantId AND tm.app_user_id=@actorId
        AND tm.status=N'active' AND tm.role=N'admin'
        AND (t.status IS NULL OR t.status=N'active')
        AND (au.status IS NULL OR au.status=N'active')`,args);
    if(!user.length)throw Object.assign(new Error('An active tenant administrator is required.'),{status:403,code:'ACTIVE_ADMIN_REQUIRED'});
    const pref=await query(`
      SELECT TOP(1) pref.public_id FROM dbo.public_listing_preferences pref WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
      WHERE pref.tenant_id=@tenantId AND pref.property_id=@propertyId`,args);
    if(!pref.length)throw Object.assign(new Error('Property not found in this tenant.'),{status:404,code:'PROPERTY_NOT_FOUND'});
    const assignments=[],params={...args};
    const setters={
      optedOut:['opted_out','optedOut'],countryCode:['country_code','countryCode'],
      headline:['public_headline','headline'],locationLabel:['location_label','locationLabel']
    };
    for(const [key,value] of Object.entries(changes)){
      const [field,param]=setters[key];
      assignments.push(`${field}=@${param}`);
      params[param]=value;
    }
    if(Object.hasOwn(changes,'optedOut')){
      assignments.push('opted_out_at=CASE WHEN @optedOut=1 THEN SYSUTCDATETIME() ELSE NULL END');
    }
    assignments.push('updated_by=@actorId','updated_at=SYSUTCDATETIME()');
    const result=await query(`
      UPDATE dbo.public_listing_preferences SET ${assignments.join(',')}
      OUTPUT INSERTED.public_id,INSERTED.country_code,INSERTED.opted_out,
        INSERTED.public_headline,INSERTED.location_label
      WHERE tenant_id=@tenantId AND property_id=@propertyId`,params);
    await tx.commit();
    return result[0];
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
};
