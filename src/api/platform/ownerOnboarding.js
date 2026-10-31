import crypto from 'node:crypto';
import {getMssqlPool,sql} from '../mssql/pool.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const failure=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const parseOwnerSetup=body=>{
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['name','country','requestId'].includes(k))||
    typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>200||/[\x00-\x1f\x7f]/.test(body.name)||
    !['LK','BN'].includes(body.country)||typeof body.requestId!=='string'||!uuid.test(body.requestId)){
    throw failure(400,'OWNER_SETUP_INVALID','Enter a workspace name and choose a country.');
  }
  return {name:body.name.trim(),country:body.country,requestId:body.requestId.toLowerCase()};
};

// Only the authenticated identity may create its own new testing workspace.
// No caller-supplied role, tenant, existing property or billing IDs are accepted.
export const createOwnerTestingWorkspace=async({actorId,authId,input,getPool=getMssqlPool})=>{
  if(!uuid.test(actorId||'')||!uuid.test(authId||'')){throw failure(401,'OWNER_IDENTITY_REQUIRED','Please sign in again.');}
  const details=parseOwnerSetup(input);
  const pool=await getPool();
  const tx=new sql.Transaction(pool);
  const query=async(text,params={})=>{
    const r=new sql.Request(tx);for(const [k,v]of Object.entries(params)){r.input(k,v);}
    return (await r.query(text)).recordset||[];
  };
  let begun=false;
  try{
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);begun=true;
    // Profile metadata is editable through legacy account APIs. A marker alone
    // is never proof of email ownership; require the durable verification ledger
    // for this credential's lifetime (or an accepted invitation for this user).
    const identity=await query(`SELECT au.id,CASE WHEN
      EXISTS(SELECT 1 FROM dbo.public_signup_challenges c WHERE c.email_normalized=LOWER(au.email)
        AND c.sent_at IS NOT NULL AND c.revoked_at IS NULL
        AND c.consumed_at>=CAST(auth.createdat AS DATETIME2(3)))
      OR EXISTS(SELECT 1 FROM dbo.user_invitations i WHERE i.app_user_id=au.id AND LOWER(i.email)=LOWER(au.email)
        AND i.revoked_at IS NULL AND CAST(i.accepted_at AS DATETIME2(3))>=CAST(auth.createdat AS DATETIME2(3)))
      THEN 1 ELSE 0 END AS verified FROM dbo.app_users au WITH(UPDLOCK,HOLDLOCK)
      INNER JOIN dbo.auth_users auth ON auth.app_user_id=au.id AND auth.auth_id=au.auth_id
      AND LOWER(auth.email)=LOWER(au.email)
      WHERE au.id=@actorId AND au.auth_id=@authId AND au.status='active'`,{actorId,authId});
    if(identity.length!==1){throw failure(403,'OWNER_IDENTITY_REQUIRED','We couldn’t confirm your account. Please sign in again.');}
    if(Number(identity[0].verified)!==1){throw failure(403,'OWNER_VERIFICATION_REQUIRED','Verify your email before setting up a property workspace.');}
    const slug='owner-'+details.requestId;
    const existing=await query(`SELECT t.id,t.name,settings.feature_flags_json FROM dbo.tenants t WITH(UPDLOCK,HOLDLOCK)
      INNER JOIN dbo.tenant_memberships m ON m.tenant_id=t.id AND m.app_user_id=@actorId AND m.role='admin' AND m.status='active'
      INNER JOIN dbo.tenant_settings settings ON settings.tenant_id=t.id
      WHERE t.slug=@slug AND t.[plan]='development-testing'`,{actorId,slug});
    if(existing[0]){
      const metadata=JSON.parse(existing[0].feature_flags_json||'{}');
      if(existing[0].name!==details.name||metadata.ownerSetup?.country!==details.country){throw failure(409,'OWNER_SETUP_CHANGED','This workspace was already created with different details. Start a new setup to create another workspace.');}
      await tx.commit();begun=false;return {id:existing[0].id,name:existing[0].name,testing:true};
    }
    const id=crypto.randomUUID();
    await query(`INSERT INTO dbo.tenants(id,name,slug,status,[plan],createdat,updatedat)
      VALUES(@id,@name,@slug,'active','development-testing',SYSUTCDATETIME(),SYSUTCDATETIME());
      INSERT INTO dbo.tenant_settings(tenant_id,feature_flags_json,createdat,updatedat)
      VALUES(@id,@metadata,SYSUTCDATETIME(),SYSUTCDATETIME());
      INSERT INTO dbo.tenant_memberships(id,tenant_id,app_user_id,role,status,is_default,createdat,updatedat)
      VALUES(NEWID(),@id,@actorId,'admin','active',0,SYSUTCDATETIME(),SYSUTCDATETIME());`,{
      id,name:details.name,slug,actorId,metadata:JSON.stringify({developmentTesting:true,ownerSetup:{actorId,requestId:details.requestId,country:details.country,createdAt:new Date().toISOString()}})
    });
    await tx.commit();begun=false;
    return {id,name:details.name,testing:true};
  }catch(error){
    if(begun){await tx.rollback().catch(()=>{});}
    if([2601,2627].includes(Number(error?.number))){throw failure(409,'OWNER_SETUP_CONFLICT','This setup request is already in use. Please restart property setup.');}
    throw error;
  }
};

export const ownerSetupHandler=({createWorkspace=createOwnerTestingWorkspace,enabled=()=>process.env.PUBLIC_SIGNUP_ENABLED==='true'}={})=>async(req,res,next)=>{
  res.set('Cache-Control','no-store, private');
  if(!enabled()){return res.status(404).json({error:'Account setup is unavailable.'});}
  const record=req.authSession?.record;
  const metadata=record?.metadata||{};
  if(!record?.appUserId||String(record.appUserId).toLowerCase()!==String(req.user?.id||'').toLowerCase()||
    !(metadata.global_email_verified===true||metadata.invitation_registration_verified===true)){
    return res.status(403).json({error:'Verify your email before setting up a property workspace.',code:'OWNER_VERIFICATION_REQUIRED'});
  }
  try{
    const input=parseOwnerSetup(req.body);
    const data=await createWorkspace({actorId:record.appUserId,authId:record.authId,input});
    return res.status(201).json({data});
  }catch(error){
    if(error.status){return res.status(error.status).json({error:error.message,code:error.code});}
    next(error);
  }
};
