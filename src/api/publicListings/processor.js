import crypto from 'node:crypto';
import {getMssqlPool,sql} from '../mssql/pool.js';
import {runSingleQuery} from '../mssql/query.js';
import {getStorageDriver} from '../storage/index.js';
import {verifySafeWebp,mediaObjectPath} from './media.js';
import {resolveRegisteredPhoto,sanitizePhotoAlt,trustedPhotoOrigins} from './sourceImages.js';
import {isId} from './contract.js';

const MAX_SOURCE_BYTES=10*1024*1024;
const MAX_PIXELS=18_000_000;
const error=(status,code,message)=>Object.assign(new Error(message),{status,code});
const sourceHash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');

export const imagePreparationEnabled=env=>String(env?.PUBLIC_LISTING_IMAGE_PREPARE_ENABLED||'').toLowerCase()==='true';

// A real server-side decode/reencode, never trust browser-supplied MIME, thumbnails,
// EXIF orientation or "compressed" source. Sharp strips source metadata by default.
export const convertPropertyPhoto=async(source,{sharpImpl}={})=>{
  if(!Buffer.isBuffer(source)||source.length<32||source.length>MAX_SOURCE_BYTES)
    throw error(400,'IMAGE_SOURCE_SIZE','Image source exceeds safe input limits.');
  const jpeg=source[0]===0xff&&source[1]===0xd8&&source[2]===0xff;
  const png=source.toString('hex',0,8)==='89504e470d0a1a0a';
  const webp=source.toString('ascii',0,4)==='RIFF'&&source.toString('ascii',8,12)==='WEBP';
  if(!jpeg&&!png&&!webp)
    throw error(400,'IMAGE_SOURCE_TYPE','Only valid registered JPEG, PNG or WebP images are supported.');
  let sharp=sharpImpl;
  if(!sharp){
    try{sharp=(await import('sharp')).default;}
    catch{throw error(503,'IMAGE_PROCESSOR_UNAVAILABLE','Trusted server-side image processor is not installed.');}
  }
  const options={limitInputPixels:MAX_PIXELS,animated:false,failOn:'error',sequentialRead:true};
  const inspect=await sharp(source,options).metadata();
  if(!['jpeg','png','webp'].includes(inspect?.format)||!inspect.width||!inspect.height||
    inspect.width*inspect.height>MAX_PIXELS||(inspect.pages||1)!==1)
    throw error(400,'IMAGE_FORMAT_INVALID','Source image dimensions or animation are not supported.');
  const bytes=await sharp(source,options).rotate()
    .resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true})
    .webp({quality:78,effort:4,lossless:false}).toBuffer();
  verifySafeWebp(bytes);
  // Sharp emits a new derivative; original metadata, thumbnails and source paths
  // must not be copied to the public object.
  const check=await sharp(bytes,options).metadata();
  if(check.format!=='webp'||check.exif||check.xmp||check.icc||check.iptc||
     check.width>1600||check.height>1200)
    throw error(500,'DERIVATIVE_PRIVACY_FAILED','Generated image contains metadata or invalid dimensions.');
  return bytes;
};

// Two separate authoritative checks: one before private storage read, then a
// SERIALIZABLE transaction after reencoding to prevent publishing a changed source.
export const getAuthorizedSourceSnapshot=({tenantId,propertyId,actorId})=>runSingleQuery(`
 SELECT TOP 1 p.images AS sourceImages,pref.public_id AS publicId
 FROM dbo.properties p
 JOIN dbo.public_listing_preferences pref
   ON pref.property_id=p.id AND pref.tenant_id=p.tenant_id
 JOIN dbo.tenant_memberships membership
   ON membership.tenant_id=p.tenant_id AND membership.app_user_id=@actorId
 JOIN dbo.app_users actor ON actor.id=membership.app_user_id
 JOIN dbo.tenants tenant ON tenant.id=p.tenant_id
 WHERE p.id=@propertyId AND p.tenant_id=@tenantId
   AND membership.role=N'admin' AND membership.status=N'active'
   AND (actor.status IS NULL OR actor.status=N'active')
   AND (tenant.status IS NULL OR tenant.status=N'active')
 `,{tenantId,propertyId,actorId});

export const commitWithheldDerivative=async({
  tenantId,propertyId,actorId,sourceImages,publicId,mediaId,imageIndex,
  altText,sourceSha,derivativeSha,imageBytes,processorVersion='sharp-webp-v1'
})=>{
  const pool=await getMssqlPool();
  const tx=new sql.Transaction(pool);
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try{
    const request=async(query,params={})=>{
      const q=new sql.Request(tx);
      for(const [key,value] of Object.entries(params))q.input(key,value);
      return (await q.query(query)).recordset||[];
    };
    const base={tenantId,propertyId,actorId};
    // Lock source row and check membership *again* after expensive conversion.
    const current=await request(`
 SELECT TOP 1 p.images AS sourceImages,pref.public_id AS publicId
 FROM dbo.properties p WITH(UPDLOCK,HOLDLOCK)
 JOIN dbo.public_listing_preferences pref WITH(UPDLOCK,HOLDLOCK)
   ON pref.property_id=p.id AND pref.tenant_id=p.tenant_id
 JOIN dbo.tenant_memberships member
   ON member.tenant_id=p.tenant_id AND member.app_user_id=@actorId
 JOIN dbo.app_users actor ON actor.id=member.app_user_id
 JOIN dbo.tenants tenant ON tenant.id=p.tenant_id
 WHERE p.id=@propertyId AND p.tenant_id=@tenantId
   AND member.role=N'admin' AND member.status=N'active'
   AND (actor.status IS NULL OR actor.status=N'active')
   AND (tenant.status IS NULL OR tenant.status=N'active')`,base);
    if(!current.length)throw error(403,'IMAGE_PREPARATION_DENIED','Property or active administrator access changed.');
    if(String(current[0].publicId).toLowerCase()!==String(publicId).toLowerCase()||
       String(current[0].sourceImages||'')!==String(sourceImages||''))
      throw error(409,'IMAGE_SOURCE_CHANGED','Registered property photos changed during processing.');
    await request(`
 UPDATE dbo.public_listing_media SET media_status=N'withdrawn',withdrawn_at=SYSUTCDATETIME()
 WHERE listing_public_id=@publicId AND display_order=@imageIndex
   AND media_status IN(N'withheld',N'ready')`,{publicId,imageIndex});
    await request(`
 INSERT INTO dbo.public_listing_media
  (media_id,listing_public_id,display_order,alt_text,source_sha256,derivative_sha256,
   processor_version,image_bytes,rights_confirmed,privacy_reviewed,media_status,prepared_by)
 VALUES(@mediaId,@publicId,@imageIndex,@altText,@sourceSha,@derivativeSha,
        @processorVersion,@imageBytes,0,0,N'withheld',@actorId)`,
      {mediaId,publicId,imageIndex,altText,sourceSha,derivativeSha,processorVersion,imageBytes,actorId});
    await tx.commit();
    return {mediaId,status:'withheld'};
  }catch(e){await tx.rollback().catch(()=>{});throw e;}
};

export const preparePropertyPhoto=async({
  tenantId,propertyId,actorId,imageIndex,altText
},{
  env=process.env,storage=getStorageDriver(),
  readSnapshot=getAuthorizedSourceSnapshot,writeManifest=commitWithheldDerivative,
  convert=convertPropertyPhoto,allowedOrigins
}={})=>{
  if(!imagePreparationEnabled(env))
    throw error(404,'IMAGE_PREPARATION_DISABLED','Image preparation is not enabled.');
  if(![tenantId,propertyId,actorId].every(isId))
    throw error(400,'INVALID_IMAGE_CONTEXT','Invalid image owner context.');
  if(!Number.isInteger(imageIndex)||imageIndex<0||imageIndex>49)
    throw error(400,'INVALID_IMAGE_INDEX','Select an existing property image.');
  const alt=sanitizePhotoAlt(altText);
  const snapshot=await readSnapshot({tenantId,propertyId,actorId});
  if(!snapshot?.publicId||!isId(snapshot.publicId))
    throw error(404,'IMAGE_PROPERTY_UNAVAILABLE','Property is unavailable for image preparation.');
  const source=resolveRegisteredPhoto(snapshot.sourceImages,imageIndex,tenantId,{
    allowedOrigins:allowedOrigins||trustedPhotoOrigins(env)
  });
  const original=await storage.getObject(source.bucket,source.path);
  const originalBytes=original?.body;
  if(!Buffer.isBuffer(originalBytes)||originalBytes.length>MAX_SOURCE_BYTES)
    throw error(400,'IMAGE_SOURCE_SIZE','Invalid private image object.');
  const derivative=await convert(originalBytes);
  verifySafeWebp(derivative);
  const mediaId=crypto.randomUUID();
  const path=mediaObjectPath(snapshot.publicId,mediaId);
  await storage.upload('media',path,derivative,'image/webp');
  try{
    const result=await writeManifest({
      tenantId,propertyId,actorId,sourceImages:snapshot.sourceImages,
      publicId:snapshot.publicId,mediaId,imageIndex,altText:alt,
      sourceSha:sourceHash(originalBytes),derivativeSha:sourceHash(derivative),
      imageBytes:derivative.length
    });
    return {mediaId:result.mediaId,status:'withheld',imageIndex,
      requiresRightsAndPrivacyApproval:true};
  }catch(e){
    // If DB refuses a stale or unauthorized source, promptly remove the
    // inaccessible orphan derivative. No derivative URL is ever returned.
    await storage.deleteObjects('media',[path]).catch(()=>{});
    throw e;
  }
};
