import crypto from 'node:crypto';
import {getStorageDriver} from '../storage/index.js';
import {runQuery,runSingleQuery} from '../mssql/query.js';
import {PUBLIC_LISTING_ELIGIBILITY_SQL} from './store.js';
import {isId} from './contract.js';

// Public images are DERIVATIVES ONLY, never property.images, source URLs, or private
// /storage/* URLs. Release requires separately attested processor and privacy review.
export const publicMediaEnabled=env=>
  String(env?.PUBLIC_LISTING_MEDIA_ENABLED||'').toLowerCase()==='true' &&
  String(env?.PUBLIC_LISTING_IMAGE_PROCESSOR_READY||'').toLowerCase()==='true';

export const mediaObjectPath=(listingId,mediaId)=>{
  if(!isId(listingId)||!isId(mediaId))throw new Error('Invalid opaque public image identifier.');
  return 'public-listings/'+String(listingId).toLowerCase()+'/'+String(mediaId).toLowerCase()+'.webp';
};

export const mediaRelativeUrl=({listingId,mediaId,country})=>{
  if(country!=='LK'&&country!=='BN')throw new Error('Missing market for public media.');
  return '/api/public-listings/'+encodeURIComponent(listingId)+'/media/'+
    encodeURIComponent(mediaId)+'?country='+country;
};

export const publicMediaDTO=(r,country)=>({
  url:mediaRelativeUrl({listingId:String(r.listingPublicId),mediaId:String(r.mediaId),country}),
  alt:String(r.alt||'Property photo').slice(0,180)
});

export const verifySafeWebp=(bytes,expected)=>{
  if(!Buffer.isBuffer(bytes)||bytes.length<20||bytes.length>2097152)
    throw new Error('Public media file is missing or outside safe size.');
  if(bytes.toString('ascii',0,4)!=='RIFF'||bytes.toString('ascii',8,12)!=='WEBP'
    ||bytes.readUInt32LE(4)+8!==bytes.length)
    throw new Error('Invalid processed WebP container.');
  let offset=12,hasImage=false;
  while(offset+8<=bytes.length){
    const kind=bytes.toString('ascii',offset,offset+4);
    const length=bytes.readUInt32LE(offset+4);
    const next=offset+8+length+(length%2);
    if(next>bytes.length)throw new Error('Invalid WebP chunk length.');
    if(['EXIF','XMP ','ICCP','ANIM','ANMF'].includes(kind))
      throw new Error('Public derivative contains prohibited metadata or animation.');
    if(['VP8 ','VP8L'].includes(kind))hasImage=true;
    offset=next;
  }
  if(offset!==bytes.length||!hasImage)throw new Error('Invalid or missing WebP picture.');
  if(expected?.imageBytes!==undefined && Number(expected.imageBytes)!==bytes.length)
    throw new Error('Public image content length changed.');
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');
  if(expected?.derivativeSha256 && hash!==String(expected.derivativeSha256).toLowerCase())
    throw new Error('Public derivative hash mismatch.');
  return {body:bytes,contentType:'image/webp'};
};

// This query rechecks real-time occupancy and property opt-out on EVERY fetch,
// including after an image URL is copied/bookmarked and source images removed.
export const PUBLIC_MEDIA_ELIGIBILITY_SQL=PUBLIC_LISTING_ELIGIBILITY_SQL.replace(
  'FROM dbo.public_listing_preferences pref',
  'FROM dbo.public_listing_media m JOIN dbo.public_listing_preferences pref ON pref.public_id=m.listing_public_id'
);
export const findReadyPublicMedia=async({listingId,mediaId,country})=>runSingleQuery(`
 SELECT TOP(1)
  m.media_id AS mediaId,m.listing_public_id AS listingPublicId,
  m.image_bytes AS imageBytes,m.derivative_sha256 AS derivativeSha256
 ${PUBLIC_MEDIA_ELIGIBILITY_SQL}
 AND pref.public_id=@listingId AND m.media_id=@mediaId
   AND pref.country_code=@country AND m.media_status=N'ready'
   AND m.rights_confirmed=1 AND m.privacy_reviewed=1
 ORDER BY m.display_order`,{listingId,mediaId,country});

export const listReadyPublicMedia=async(publicIds=[])=>{
  const ids=[...new Set(publicIds.map(String))].filter(isId).slice(0,50);
  if(!ids.length)return [];
  // JSON array is a single bound parameter. Recheck exact property eligibility.
  return runQuery(`
    SELECT TOP(150)
      m.media_id AS mediaId,m.listing_public_id AS listingPublicId,
      m.alt_text AS alt
    ${PUBLIC_MEDIA_ELIGIBILITY_SQL}
      AND EXISTS(
        SELECT 1 FROM OPENJSON(@ids) AS requested
        WHERE TRY_CONVERT(UNIQUEIDENTIFIER,requested.value)=m.listing_public_id
      )
      AND m.media_status=N'ready'
      AND m.rights_confirmed=1 AND m.privacy_reviewed=1
    ORDER BY m.listing_public_id,m.display_order`,
    {ids:JSON.stringify(ids)});
};

export const readPublicDerivative=async({listingId,mediaId,meta,driver=getStorageDriver()})=>{
  const object=await driver.getObject('media',mediaObjectPath(listingId,mediaId));
  return verifySafeWebp(object?.body,meta);
};
