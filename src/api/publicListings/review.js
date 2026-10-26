import crypto from 'node:crypto';
import {getMssqlPool,sql} from '../mssql/pool.js';
import {getStorageDriver} from '../storage/index.js';
import {isId} from './contract.js';
import {mediaObjectPath,verifySafeWebp} from './media.js';
import {resolveRegisteredPhoto} from './sourceImages.js';

const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
export const photoReviewEnabled=env=>String(env?.PUBLIC_LISTING_MEDIA_REVIEW_ENABLED||'').toLowerCase()==='true';
const requireIds=({tenantId,propertyId,actorId,mediaId})=>{
  if(![tenantId,propertyId,actorId,mediaId].every(isId))
    throw problem(400,'INVALID_PUBLIC_PHOTO_REVIEW','Invalid property or image identifier.');
};
const begin=async()=>{
  const tx=new sql.Transaction(await getMssqlPool());
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  return tx;
};
const readWithin=async(tx,sqlText,params={})=>{
  const request=new sql.Request(tx);
  for(const [name,value] of Object.entries(params))request.input(name,value);
  return (await request.query(sqlText)).recordset||[];
};
export const REVIEW_SOURCE_SQL=`
 SELECT TOP(1) m.media_id AS mediaId,m.listing_public_id AS listingPublicId,
   m.display_order AS imageIndex,m.media_status AS mediaStatus,
   m.source_sha256 AS sourceSha256,m.derivative_sha256 AS derivativeSha256,
   m.image_bytes AS imageBytes,p.images AS sourceImages
 FROM dbo.public_listing_media m
 JOIN dbo.public_listing_preferences pref ON pref.public_id=m.listing_public_id
 JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
 JOIN dbo.tenants t ON t.id=p.tenant_id
 JOIN dbo.tenant_memberships member ON member.tenant_id=p.tenant_id
   AND member.app_user_id=@actorId
 JOIN dbo.app_users actor ON actor.id=member.app_user_id
 WHERE p.tenant_id=@tenantId AND p.id=@propertyId AND m.media_id=@mediaId
   AND member.role=N'admin' AND member.status=N'active'
   AND (t.status IS NULL OR t.status=N'active')
   AND (actor.status IS NULL OR actor.status=N'active')`;

export const loadPhotoForReview=async(args,{tx}={})=>{
  if(tx)return (await readWithin(tx,REVIEW_SOURCE_SQL+' WITHHOLD_PLACEHOLDER',args))[0];
  const {runSingleQuery}=await import('../mssql/query.js');
  return runSingleQuery(REVIEW_SOURCE_SQL,args);
};

// SQL Server lock hints are applied to the base tables when finalizing a decision.
export const REVIEW_LOCKED_SQL=REVIEW_SOURCE_SQL
  .replace('FROM dbo.public_listing_media m','FROM dbo.public_listing_media m WITH(UPDLOCK,HOLDLOCK)')
  .replace('JOIN dbo.public_listing_preferences pref','JOIN dbo.public_listing_preferences pref WITH(UPDLOCK,HOLDLOCK)')
  .replace('JOIN dbo.properties p','JOIN dbo.properties p WITH(UPDLOCK,HOLDLOCK)')
  .replace('JOIN dbo.tenant_memberships member','JOIN dbo.tenant_memberships member WITH(UPDLOCK,HOLDLOCK)');

export const finalizePhotoReview=async(args,{txFactory=begin}={})=>{
  const tx=await txFactory();
  try{
    const current=(await readWithin(tx,REVIEW_LOCKED_SQL,args))[0];
    if(!current)throw problem(403,'PHOTO_REVIEW_ACCESS_DENIED','Property/photo review is not authorized.');
    if(String(current.listingPublicId).toLowerCase()!==String(args.listingPublicId).toLowerCase() ||
      String(current.sourceImages||'')!==String(args.sourceImages||'') ||
      String(current.sourceSha256).toLowerCase()!==args.sourceSha256 ||
      String(current.derivativeSha256).toLowerCase()!==args.derivativeSha256)
      throw problem(409,'PHOTO_REVIEW_STALE','The registered property photograph changed during review.');
    if(current.mediaStatus!== 'withheld')
      throw problem(409,'PHOTO_REVIEW_STATE_CHANGED','Only withheld images may be approved.');
    const updated=await readWithin(tx,`
 UPDATE dbo.public_listing_media SET rights_confirmed=1,privacy_reviewed=1,
   media_status=N'ready',withdrawn_at=NULL
 OUTPUT INSERTED.media_id
 WHERE listing_public_id=@listingPublicId AND media_id=@mediaId AND media_status=N'withheld'
   AND source_sha256=@sourceSha256 AND derivative_sha256=@derivativeSha256`,args);
    if(updated.length!==1)throw problem(409,'PHOTO_REVIEW_CONFLICT','Photo approval state changed.');
    await readWithin(tx,`
 INSERT INTO dbo.public_listing_media_reviews
   (media_id,listing_public_id,actor_user_id,decision,rights_attested,privacy_attested,derivative_sha256)
 VALUES(@mediaId,@listingPublicId,@actorId,N'approved',1,1,@derivativeSha256)`,args);
    await tx.commit();
    return {mediaId:args.mediaId,status:'ready'};
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
};

export const reviewPreparedPhoto=async({
  tenantId,propertyId,actorId,mediaId,confirmRights,confirmPrivacy
},{
  env=process.env,storage=getStorageDriver(),load=loadPhotoForReview,
  finalize=finalizePhotoReview
}={})=>{
  if(!photoReviewEnabled(env))
    throw problem(404,'PHOTO_REVIEW_DISABLED','Public photo reviews are not enabled.');
  requireIds({tenantId,propertyId,actorId,mediaId});
  if(confirmRights!==true||confirmPrivacy!==true)
    throw problem(400,'PHOTO_REVIEW_ATTESTATION_REQUIRED','Confirm publication rights and personal-information privacy review.');
  const identity={tenantId,propertyId,actorId,mediaId};
  const source=await load(identity);
  if(!source)throw problem(403,'PHOTO_REVIEW_ACCESS_DENIED','Property/photo review is not authorized.');
  if(source.mediaStatus!=='withheld')
    throw problem(409,'PHOTO_REVIEW_STATE_CHANGED','Only withheld images may be approved.');
  const image=resolveRegisteredPhoto(source.sourceImages,Number(source.imageIndex),tenantId);
  const original=await storage.getObject(image.bucket,image.path);
  if(!Buffer.isBuffer(original?.body)||sha(original.body)!==String(source.sourceSha256).toLowerCase())
    throw problem(409,'PHOTO_REVIEW_SOURCE_CHANGED','The registered source photo no longer matches.');
  const path=mediaObjectPath(source.listingPublicId,mediaId);
  const derivative=await storage.getObject('media',path);
  verifySafeWebp(derivative?.body,{imageBytes:source.imageBytes,derivativeSha256:source.derivativeSha256});
  const output=await finalize({
    ...identity,
    listingPublicId:source.listingPublicId,sourceImages:source.sourceImages,
    sourceSha256:String(source.sourceSha256).toLowerCase(),
    derivativeSha256:String(source.derivativeSha256).toLowerCase()
  });
  return {mediaId:output.mediaId,status:output.status};
};

export const withdrawPreparedPhoto=async({
  tenantId,propertyId,actorId,mediaId
},{env=process.env,storage=getStorageDriver(),txFactory=begin}={})=>{
  if(!photoReviewEnabled(env))throw problem(404,'PHOTO_REVIEW_DISABLED','Public photo reviews are not enabled.');
  requireIds({tenantId,propertyId,actorId,mediaId});
  const tx=await txFactory();
  let publicId;
  try{
    const args={tenantId,propertyId,actorId,mediaId};
    const row=(await readWithin(tx,REVIEW_LOCKED_SQL,args))[0];
    if(!row)throw problem(403,'PHOTO_REVIEW_ACCESS_DENIED','Property/photo access denied.');
    if(row.mediaStatus==='withdrawn')throw problem(409,'PHOTO_ALREADY_WITHDRAWN','This photograph has already been withdrawn.');
    publicId=row.listingPublicId;
    const writeArgs={...args,listingPublicId:publicId,derivativeSha256:row.derivativeSha256};
    const result=await readWithin(tx,`
      UPDATE dbo.public_listing_media
      SET media_status=N'withdrawn',withdrawn_at=SYSUTCDATETIME()
      OUTPUT INSERTED.media_id
      WHERE media_id=@mediaId AND listing_public_id=@listingPublicId
        AND media_status IN(N'withheld',N'ready')`,writeArgs);
    if(result.length!==1)throw problem(409,'PHOTO_REVIEW_CONFLICT','Photo withdrawal conflicted.');
    await readWithin(tx,`
      INSERT INTO dbo.public_listing_media_reviews
        (media_id,listing_public_id,actor_user_id,decision,rights_attested,privacy_attested,derivative_sha256)
      VALUES(@mediaId,@listingPublicId,@actorId,N'withdrawn',0,0,@derivativeSha256)`,writeArgs);
    await tx.commit();
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
  // Durable database withdrawal is authoritative; deleted source objects should
  // be separately garbage-collected if R2 removal fails after the commit.
  let removed=true;
  try{await storage.deleteObjects('media',[mediaObjectPath(publicId,mediaId)]);}
  catch{removed=false;}
  return {mediaId,status:'withdrawn',storageDeletionSucceeded:removed};
};
