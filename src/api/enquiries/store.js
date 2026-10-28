import {getMssqlPool,sql} from '../mssql/pool.js';
import {PUBLIC_LISTING_ELIGIBILITY_SQL} from '../publicListings/store.js';
import {toPublicDTO} from '../publicListings/contract.js';
import {PUBLIC_LISTING_SELECT_SQL} from '../publicListings/store.js';
import {enquiryError,seekerReceipt,ownerReceipt} from './contract.js';

export const createEnquiryStore = ({poolProvider=getMssqlPool}={}) => {
  const transaction = async work => {
    const tx = new sql.Transaction(await poolProvider());
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const query = async (statement,params={}) => {
      const req = new sql.Request(tx);
      for (const [key,value] of Object.entries(params)) {req.input(key,value);}
      return (await req.query(statement)).recordset || [];
    };
    try {
      const result = await work(query);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback().catch(()=>{});
      if (err.number===1205) {throw enquiryError(409,'ENQUIRY_RETRY','Another request changed this enquiry. Retry with the same request reference.');}
      throw err;
    }
  };
  const requireActor = async (query,actor,owner=false,journey=false) => {
    // Recheck live session, reciprocal global identity and authority inside the
    // serialized write/read. Headers, browser roles and middleware snapshots cannot grant access.
    const rows = await query(`SELECT TOP(1) au.id,au.name,au.email
      FROM dbo.app_users au WITH(UPDLOCK,HOLDLOCK)
      JOIN dbo.auth_users auth ON auth.app_user_id=au.id AND auth.auth_id=au.auth_id
        AND LOWER(LTRIM(RTRIM(auth.email)))=LOWER(LTRIM(RTRIM(au.email)))
      JOIN dbo.auth_sessions s ON s.auth_user_id=auth.id
      WHERE au.id=@actorId AND auth.auth_id=@authId AND s.id=@sessionId
        AND s.revoked_at IS NULL AND s.expires_at>SYSUTCDATETIME()
        AND (au.status IS NULL OR au.status=N'active')
        AND ${owner ? `EXISTS(SELECT 1 FROM dbo.tenant_memberships tm WITH(UPDLOCK,HOLDLOCK)
          JOIN dbo.tenants t ON t.id=tm.tenant_id WHERE tm.app_user_id=au.id
          AND tm.tenant_id=@tenantId AND tm.role=N'admin' AND tm.status=N'active'
          AND (t.status IS NULL OR t.status=N'active'))` : `au.tenant_id IS NULL
        AND au.role=N'authenticated' AND au.user_type=N'seeker' AND auth.role=N'authenticated'
        AND JSON_VALUE(CASE WHEN ISJSON(auth.metadata)=1 THEN auth.metadata ELSE N'{}' END,'$.global_email_verified')=N'true'
        AND ${journey?`NOT EXISTS(SELECT 1 FROM dbo.tenant_memberships tm WITH(UPDLOCK,HOLDLOCK) WHERE tm.app_user_id=au.id AND (tm.status<>N'active' OR tm.role NOT IN(N'rentee',N'tenant') OR NOT EXISTS(SELECT 1 FROM dbo.rental_offer_agreement_links rl JOIN dbo.property_enquiries re ON re.id=rl.enquiry_id WHERE re.seeker_id=au.id AND re.tenant_id=tm.tenant_id)))`:`NOT EXISTS(SELECT 1 FROM dbo.tenant_memberships tm WITH(UPDLOCK,HOLDLOCK) WHERE tm.app_user_id=au.id)`}`}`,
    {actorId:actor.actorId,authId:actor.authId,sessionId:actor.sessionId,...(owner?{tenantId:actor.tenantId}:{})});
    if (!rows[0]) {throw enquiryError(403,'ENQUIRY_ACTOR_REQUIRED','Your account permissions could not be confirmed. Sign in again.');}
    return rows[0];
  };
  const audit = (query,row,actorId,from=null) => query(`INSERT INTO dbo.property_enquiry_events
    (enquiry_id,actor_user_id,from_status,to_status,version,response) VALUES(@id,@actorId,@from,@to,@version,@response)`,
  {id:row.id,actorId,from,to:row.status,version:row.version,response:row.owner_response||null});
  return {
    withEnquiry:(actor,id,owner,work,journey=false) => transaction(async query => {
      await requireActor(query,actor,owner,journey);
      const enquiry=(await query(`SELECT * FROM dbo.property_enquiries WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@id AND ${owner?'tenant_id=@scope':'seeker_id=@scope'}`,
      {id,scope:owner?actor.tenantId:actor.actorId}))[0];
      if (!enquiry) {throw enquiryError(404,'ENQUIRY_NOT_FOUND','Enquiry not found.');}
      return work(query,enquiry);
    }),
    submit:(actor,input) => transaction(async query => {
      const user = await requireActor(query,actor);
      const args={...input,seekerId:actor.actorId};
      const previous=(await query(`SELECT * FROM dbo.property_enquiries WITH(UPDLOCK,HOLDLOCK)
        WHERE seeker_id=@seekerId AND request_id=@requestId`,args))[0];
      if (previous) {
        if (previous.payload_hash!==input.payloadHash) {throw enquiryError(409,'ENQUIRY_REQUEST_CONFLICT','This request reference was already used for different content.');}
        return {receipt:seekerReceipt(previous),created:false};
      }
      const available=(await query(`SELECT TOP(1) ${PUBLIC_LISTING_SELECT_SQL},
          p.id AS property_id,p.tenant_id
        ${PUBLIC_LISTING_ELIGIBILITY_SQL}
        AND pref.public_id=@listingId AND pref.country_code=@country`,args))[0];
      const publicListing=toPublicDTO(available);
      if (!publicListing) {throw enquiryError(409,'LISTING_UNAVAILABLE','This property is no longer available for enquiries.');}
      const open=(await query(`SELECT TOP(1) id FROM dbo.property_enquiries WITH(UPDLOCK,HOLDLOCK)
        WHERE seeker_id=@seekerId AND listing_public_id=@listingId AND status IN('pending','responded')`,args))[0];
      if (open) {throw enquiryError(409,'ENQUIRY_ALREADY_OPEN','You already have an open enquiry for this property. Check your enquiries below.');}
      const count=(await query(`SELECT COUNT(*) AS hits FROM dbo.property_enquiries
        WHERE seeker_id=@seekerId AND created_at>DATEADD(hour,-24,SYSUTCDATETIME())`,args))[0];
      if (Number(count.hits)>=10) {throw enquiryError(429,'ENQUIRY_LIMIT','You have reached the daily enquiry limit. Try again tomorrow.');}
      const row=(await query(`DECLARE @rental_changed TABLE(id UNIQUEIDENTIFIER);
INSERT INTO dbo.property_enquiries
        (listing_public_id,tenant_id,property_id,seeker_id,seeker_name,seeker_email,country_code,
         listing_title,message,consent_version,request_id,payload_hash)
        OUTPUT INSERTED.id INTO @rental_changed VALUES(@listingId,@tenantId,@propertyId,@seekerId,@name,@email,@country,
          @title,@message,'owner-contact-v1',@requestId,@payloadHash);
SELECT a.* FROM dbo.property_enquiries a JOIN @rental_changed c ON c.id=a.id;`,
      {...args,tenantId:available.tenant_id,propertyId:available.property_id,
        name:String(user.name||'Seeker').slice(0,200),email:user.email,title:publicListing.title}))[0];
      await audit(query,row,actor.actorId);
      return {receipt:seekerReceipt(row),created:true};
    }),
    list:(actor,owner=false,offset=0,journey=false) => transaction(async query => {
      await requireActor(query,actor,owner,journey);
      const rows=await query(`SELECT * FROM dbo.property_enquiries
        WHERE ${owner?'tenant_id=@scope':'seeker_id=@scope'}
        ORDER BY created_at DESC,id OFFSET @offset ROWS FETCH NEXT 51 ROWS ONLY`,
      {scope:owner?actor.tenantId:actor.actorId,offset});
      return {items:rows.slice(0,50).map(owner?ownerReceipt:seekerReceipt),hasMore:rows.length>50};
    }),
    change:(actor,id,input,owner=false) => transaction(async query => {
      await requireActor(query,actor,owner);
      const args={id,scope:owner?actor.tenantId:actor.actorId};
      const old=(await query(`SELECT * FROM dbo.property_enquiries WITH(UPDLOCK,HOLDLOCK)
        WHERE id=@id AND ${owner?'tenant_id=@scope':'seeker_id=@scope'}`,args))[0];
      if (!old) {throw enquiryError(404,'ENQUIRY_NOT_FOUND','Enquiry not found.');}
      if (old.version!==input.version || !['pending','responded'].includes(old.status)) {
        throw enquiryError(409,'ENQUIRY_CHANGED','This enquiry changed. Refresh before trying again.');
      }
      const row=(await query(`DECLARE @rental_changed TABLE(id UNIQUEIDENTIFIER);
UPDATE dbo.property_enquiries
        SET status=@status,owner_response=${owner?'@response':'owner_response'},updated_by=@actorId,
          updated_at=SYSUTCDATETIME(),version=version+1
        OUTPUT INSERTED.id INTO @rental_changed WHERE id=@id AND ${owner?'tenant_id=@scope':'seeker_id=@scope'} AND version=@version;
SELECT a.* FROM dbo.property_enquiries a JOIN @rental_changed c ON c.id=a.id;`,
      {...args,actorId:actor.actorId,version:input.version,status:owner?input.status:'withdrawn',response:input.response||null}))[0];
      await audit(query,row,actor.actorId,old.status);
      return (owner?ownerReceipt:seekerReceipt)(row);
    })
  };
};
