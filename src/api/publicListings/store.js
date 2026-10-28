import {getMssqlPool,sql} from '../mssql/pool.js';
import {runQuery,runSingleQuery} from '../mssql/query.js';

// Authenticated SQL is the truth for current vacancy; no cached "published" bit can
// outlive a reservation, active tenancy or opt-out. Every query rechecks status.
export const PUBLIC_LISTING_ELIGIBILITY_SQL=`
  FROM dbo.public_listing_preferences pref
  JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
  JOIN dbo.tenants t ON t.id=p.tenant_id
  WHERE pref.opted_out=0
    AND p.country_code COLLATE DATABASE_DEFAULT=pref.country_code
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
  pref.public_id,p.country_code,pref.opted_out,pref.public_headline,pref.location_label,p.propertytype,
  CASE WHEN ISJSON(p.rentalvalues)=1 THEN JSON_VALUE(p.rentalvalues,'$.listingCategory') ELSE NULL END AS listing_category,
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

// Authenticated administrator-only country readiness; never returned by anonymous catalog.
export const listMarketReadiness=async(tenantId,{offset=0,limit=50}={})=>{
  const safeOffset=Math.min(Math.max(Number(offset)||0,0),100000);
  const safeLimit=Math.min(Math.max(Number(limit)||50,1),100);
  const params={tenantId,offset:safeOffset,limit:safeLimit};
  const [summary,records]=await Promise.all([
    runSingleQuery(`
      SELECT COUNT_BIG(*) AS total,
        COALESCE(SUM(CASE WHEN p.country_code IS NULL THEN CONVERT(BIGINT,1) ELSE 0 END),0) AS unassigned,
        COALESCE(SUM(CASE WHEN p.country_code IS NOT NULL THEN CONVERT(BIGINT,1) ELSE 0 END),0) AS assigned,
        COALESCE(SUM(CASE WHEN pref.opted_out=1 THEN CONVERT(BIGINT,1) ELSE 0 END),0) AS optedOut
      FROM dbo.properties p
      LEFT JOIN dbo.public_listing_preferences pref
        ON pref.property_id=p.id AND pref.tenant_id=p.tenant_id
      WHERE p.tenant_id=@tenantId`,{tenantId}),
    runQuery(`
      SELECT p.id AS propertyId,p.name AS propertyName,p.status AS availabilityStatus,
        p.country_code AS countryCode,pref.opted_out AS optedOut
      FROM dbo.properties p
      LEFT JOIN dbo.public_listing_preferences pref
        ON pref.property_id=p.id AND pref.tenant_id=p.tenant_id
      WHERE p.tenant_id=@tenantId AND p.country_code IS NULL
      ORDER BY p.createdat DESC,p.id DESC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,params)
  ]);
  return {
    counts:{
      total:Number(summary?.total||0),unassigned:Number(summary?.unassigned||0),
      assigned:Number(summary?.assigned||0),optedOut:Number(summary?.optedOut||0)
    },
    records:records.map(row=>({
      propertyId:String(row.propertyId),
      propertyName:String(row.propertyName||'Unnamed property'),
      availabilityStatus:String(row.availabilityStatus||'unknown'),
      countryCode:row.countryCode||null,
      optedOut:Boolean(row.optedOut)
    })),
    offset:safeOffset,limit:safeLimit
  };
};

export const getPreference=(tenantId,propertyId)=>runSingleQuery(`
 SELECT TOP(1) pref.public_id,p.country_code,pref.opted_out,
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
    if(Object.hasOwn(changes,'countryCode')){
      await query(`UPDATE dbo.properties SET country_code=@countryCode
        WHERE id=@propertyId AND tenant_id=@tenantId`,{...args,countryCode:changes.countryCode});
    }
    const assignments=[],params={...args};
    const setters={
      optedOut:['opted_out','optedOut'],countryCode:['country_code','countryCode'],
      headline:['public_headline','headline'],locationLabel:['location_label','locationLabel']
    };
    for(const [key,value] of Object.entries(changes)){
      if(key==='countryCode'){continue;} // already updated on the canonical property
      const [field,param]=setters[key];
      assignments.push(`${field}=@${param}`);
      params[param]=value;
    }
    if(Object.hasOwn(changes,'optedOut')){
      assignments.push('opted_out_at=CASE WHEN @optedOut=1 THEN SYSUTCDATETIME() ELSE NULL END');
    }
    assignments.push('updated_by=@actorId','updated_at=SYSUTCDATETIME()');
    await query(`
      UPDATE dbo.public_listing_preferences SET ${assignments.join(',')}
      OUTPUT INSERTED.public_id,INSERTED.country_code,INSERTED.opted_out,
        INSERTED.public_headline,INSERTED.location_label
      WHERE tenant_id=@tenantId AND property_id=@propertyId`,params);
    const result=await query(`SELECT pref.public_id,p.country_code,pref.opted_out,
      pref.public_headline,pref.location_label FROM dbo.public_listing_preferences pref
      JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
      WHERE pref.property_id=@propertyId AND pref.tenant_id=@tenantId`,args);
    await tx.commit();
    return result[0];
  }catch(error){await tx.rollback().catch(()=>{});throw error;}
};

// Private administrator preflight: reuse the public eligibility predicate, bound
// to the authenticated tenant and exact source property. Never scan public inventory.
export const PRIVATE_LISTING_PREVIEW_SQL=`
 SELECT TOP(1) ${PUBLIC_LISTING_SELECT_SQL}
 ${PUBLIC_LISTING_ELIGIBILITY_SQL}
   AND pref.tenant_id=@tenantId AND p.id=@propertyId`;
export const findEligibleForProperty=(tenantId,propertyId)=>runSingleQuery(
  PRIVATE_LISTING_PREVIEW_SQL,{tenantId,propertyId});
