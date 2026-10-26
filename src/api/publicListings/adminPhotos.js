import {runQuery} from '../mssql/query.js';
import {getAuthorizedSourceSnapshot,imagePreparationEnabled} from './processor.js';
import {loadPhotoForReview,photoReviewEnabled} from './review.js';
import {readPublicDerivative} from './media.js';
import {resolveRegisteredPhoto,trustedPhotoOrigins} from './sourceImages.js';

const problem=(status,code,message)=>Object.assign(new Error(message),{status,code});
// Derive the same current actor/tenant/property authorization as preparation.
// Do not send source URLs, hashes, storage keys or audit identities to the UI.
export const ADMIN_PHOTOS_SQL=`
 SELECT TOP(50) m.media_id AS mediaId,m.display_order AS imageIndex,
   m.alt_text AS altText,m.media_status AS status
 FROM dbo.public_listing_media m
 JOIN dbo.public_listing_preferences pref ON pref.public_id=m.listing_public_id
 JOIN dbo.properties p ON p.id=pref.property_id AND p.tenant_id=pref.tenant_id
 JOIN dbo.tenant_memberships member ON member.tenant_id=p.tenant_id AND member.app_user_id=@actorId
 JOIN dbo.app_users actor ON actor.id=member.app_user_id
 JOIN dbo.tenants t ON t.id=p.tenant_id
 WHERE p.id=@propertyId AND p.tenant_id=@tenantId
   AND member.role=N'admin' AND member.status=N'active'
   AND (actor.status IS NULL OR actor.status=N'active')
   AND (t.status IS NULL OR t.status=N'active')
   AND m.media_status IN(N'withheld',N'ready')
 ORDER BY m.display_order,m.media_id`;

export const listAdminPhotos=async(args,{
  env=process.env,snapshot=getAuthorizedSourceSnapshot,
  rows=params=>runQuery(ADMIN_PHOTOS_SQL,params)
}={})=>{
  const source=await snapshot(args);
  if(!source)throw problem(404,'PROPERTY_NOT_FOUND','Property is unavailable.');
  let images=[];
  try{images=typeof source.sourceImages==='string'?JSON.parse(source.sourceImages):source.sourceImages;}
  catch{images=[];}
  const photos=[];
  // Invalid sources are never converted into browser URLs or fetched remotely.
  if(Array.isArray(images)&&images.length<=50){
    for(let imageIndex=0;imageIndex<images.length;imageIndex++){
      try{
        resolveRegisteredPhoto(images,imageIndex,args.tenantId,{allowedOrigins:trustedPhotoOrigins(env)});
        photos.push({imageIndex});
      }catch{/* Not eligible for preparation. */}
    }
  }
  const prepared=(await rows(args)).map(row=>({
    mediaId:row.mediaId,imageIndex:Number(row.imageIndex),altText:row.altText,status:row.status
  }));
  return {photos,prepared,canPrepare:imagePreparationEnabled(env),canReview:photoReviewEnabled(env)};
};

// This authenticated route also serves WITHHELD images for deliberate review.
// It is separate from the anonymous route and never redirects to storage.
export const previewAdminPhoto=async(args,{
  env=process.env,load=loadPhotoForReview,read=readPublicDerivative
}={})=>{
  if(!photoReviewEnabled(env))throw problem(404,'PHOTO_REVIEW_DISABLED','Photo review is not enabled.');
  const before=await load(args);
  if(!before||!['withheld','ready'].includes(before.mediaStatus))
    throw problem(404,'PUBLIC_IMAGE_NOT_FOUND','Photo is unavailable.');
  const bytes=await read({listingId:before.listingPublicId,mediaId:args.mediaId,meta:before});
  const after=await load(args);
  if(!after||after.mediaStatus!==before.mediaStatus||after.sourceImages!==before.sourceImages||
     String(after.listingPublicId)!==String(before.listingPublicId)||
     after.derivativeSha256!==before.derivativeSha256)
    throw problem(409,'PHOTO_REVIEW_STALE','The photo or access changed; reload before reviewing.');
  return bytes;
};
