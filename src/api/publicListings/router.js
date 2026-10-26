import express from 'express';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {hasActiveTenantMembership,isAdminRole} from '../platform/permissionEngine.js';
import {PUBLIC_LISTING_ENABLED,parseCountry} from './eligibility.js';
import {isId,parsePreferenceInput,toPublicDTO} from './contract.js';
import * as store from './store.js';
import {consumeReadBudget} from './rateLimit.js';
import * as media from './media.js';
const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const hidden=res=>res.status(404).json({code:'PUBLIC_LISTINGS_DISABLED',error:'Public listings are not enabled.'});
const publicOrigins=new Set(['https://mango-grass-0314c0100.3.azurestaticapps.net','https://quixo.homes','https://www.quixo.homes']);

export const createPublicListingsRouter=({
  env=process.env,list=store.listEligible,find=store.findEligible,
  rateLimit=consumeReadBudget,
  listMedia=media.listReadyPublicMedia,findMedia=media.findReadyPublicMedia,
  readDerivative=media.readPublicDerivative
}={})=>{
  const router=express.Router();
  router.use((req,res,next)=>{
    if(!['GET','HEAD'].includes(req.method)||!PUBLIC_LISTING_ENABLED(env))return hidden(res);
    const origin=req.get('origin');
    if(origin&&publicOrigins.has(origin)){
      res.set('Access-Control-Allow-Origin',origin);res.set('Vary','Origin');
    }
    res.set('Cache-Control','no-store, max-age=0');
    next();
  });
  const attachPublicImages=async items=>{
    if(!media.publicMediaEnabled(env)||!items.length)return items;
    const ids=new Set(items.map(item=>String(item.id).toLowerCase()));
    const rows=await listMedia(items.map(item=>item.id));
    const groups=new Map();
    for(const r of rows){
      const id=String(r.listingPublicId||'').toLowerCase();
      if(!ids.has(id)||!isId(r.mediaId))continue;
      const group=groups.get(id)||[];
      if(group.length>=6)continue;
      const item=items.find(x=>String(x.id).toLowerCase()===id);
      if(!item)continue;
      group.push(media.publicMediaDTO(r,item.country));
      groups.set(id,group);
    }
    return items.map(item=>({...item,images:groups.get(String(item.id).toLowerCase())||[]}));
  };
  router.get('/',asyncRoute(async(req,res)=>{
    const country=parseCountry(req.query?.country);
    if(!country)return res.status(400).json({code:'PUBLIC_COUNTRY_REQUIRED',error:'Choose LK or BN.'});
    if(!await rateLimit(country))return res.status(429).json({code:'PUBLIC_RATE_LIMIT',error:'Please try again later.'});
    const rows=await list(country);
    // Defense in depth: a storage/query regression must never mix markets.
    const data=rows.map(toPublicDTO).filter(item=>item&&item.country===country);
    return res.json({country,data:await attachPublicImages(data)});
  }));
  router.get('/:publicId/media/:mediaId',asyncRoute(async(req,res)=>{
    // Separate release gate: even an enabled public listing feed returns NO photos
    // until trusted metadata stripping, rights review and public storage are attested.
    if(!media.publicMediaEnabled(env))return hidden(res);
    const country=parseCountry(req.query?.country);
    if(!country)return res.status(400).json({code:'PUBLIC_COUNTRY_REQUIRED'});
    const {publicId,mediaId}=req.params;
    if(!isId(publicId)||!isId(mediaId))return res.status(404).json({code:'PUBLIC_IMAGE_NOT_FOUND'});
    if(!await rateLimit('DETAIL'))return res.status(429).json({code:'PUBLIC_RATE_LIMIT'});
    const meta=await findMedia({listingId:publicId,mediaId,country});
    if(!meta)return res.status(404).json({code:'PUBLIC_IMAGE_NOT_FOUND'});
    let bytes;
    try{bytes=await readDerivative({listingId:publicId,mediaId,meta});}
    catch(error){
      // Any missing, malformed, replaced or unprocessed media fails closed.
      return res.status(404).json({code:'PUBLIC_IMAGE_NOT_FOUND'});
    }
    // Recheck visibility after reading object to narrow a reservation/opt-out race.
    const stillEligible=await findMedia({listingId:publicId,mediaId,country});
    if(!stillEligible||String(stillEligible.derivativeSha256).toLowerCase()!==String(meta.derivativeSha256).toLowerCase()){
      return res.status(404).json({code:'PUBLIC_IMAGE_NOT_FOUND'});
    }
    res.set('Cache-Control','no-store, max-age=0');
    res.set('X-Content-Type-Options','nosniff');
    res.set('Content-Disposition','inline; filename="listing-photo.webp"');
    res.type('image/webp');
    return res.send(bytes.body);
  }));
  router.get('/:publicId',asyncRoute(async(req,res)=>{
    const country=parseCountry(req.query?.country);
    if(!country)return res.status(400).json({code:'PUBLIC_COUNTRY_REQUIRED',error:'Choose LK or BN.'});
    if(!isId(req.params.publicId))return res.status(404).json({code:'PUBLIC_LISTING_NOT_FOUND'});
    if(!await rateLimit('DETAIL'))return res.status(429).json({code:'PUBLIC_RATE_LIMIT'});
    const item=toPublicDTO(await find(req.params.publicId));
    // A direct link cannot bypass the selected country even if an ID is known.
    if(!item||item.country!==country)return res.status(404).json({code:'PUBLIC_LISTING_NOT_FOUND'});
    const [enriched]=await attachPublicImages([item]);
    res.json({data:enriched});
  }));
  return router;
};

export const createPublicListingPreferencesRouter=({
  env=process.env,
  context=createTenantContextMiddleware({requireUser:true,requireTenant:true,auditLabel:'public-listing-optout'}),
  get=store.getPreference,
  listReadiness=store.listMarketReadiness,
  put=store.updatePreference
}={})=>{
  const router=express.Router();
  router.use((req,res,next)=>String(env.PUBLIC_LISTING_MANAGEMENT_ENABLED||'').toLowerCase()==='true'?next():hidden(res));
  router.use(context);
  router.use((req,res,next)=>{
    if(!req.authSession||!req.user?.id||!req.tenantId||
      !isAdminRole({user:req.user,membership:req.membership})||
      !hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId})){
      return res.status(403).json({code:'PUBLIC_LISTING_ADMIN_REQUIRED',error:'Active tenant administrator required.'});
    }
    res.set('Cache-Control','no-store');
    next();
  });
  const validId=(req,res)=>{
    if(isId(req.params.propertyId))return true;
    res.status(404).json({code:'PROPERTY_NOT_FOUND'});return false;
  };
  router.get('/market-readiness',asyncRoute(async(req,res)=>{
    // Readiness stays tenant-private and must be unavailable while management flag is off.
    const offset=Math.max(0,Math.min(100000,Number.parseInt(req.query?.offset,10)||0));
    const limit=Math.max(1,Math.min(100,Number.parseInt(req.query?.limit,10)||50));
    const data=await listReadiness(req.tenantId,{offset,limit});
    res.json({data});
  }));
  router.get('/:propertyId',asyncRoute(async(req,res)=>{
    if(!validId(req,res))return;
    const pref=await get(req.tenantId,req.params.propertyId);
    if(!pref)return res.status(404).json({code:'PROPERTY_NOT_FOUND'});
    res.json({data:{
      publicId:pref.public_id,countryCode:pref.country_code,
      optedOut:Boolean(pref.opted_out),headline:pref.public_headline,locationLabel:pref.location_label
    }});
  }));
  router.patch('/:propertyId',asyncRoute(async(req,res)=>{
    if(!validId(req,res))return;
    const changes=parsePreferenceInput(req.body);
    const value=await put({
      tenantId:req.tenantId,propertyId:req.params.propertyId,actorId:req.user.id,changes
    });
    res.json({data:{
      publicId:value.public_id,countryCode:value.country_code,optedOut:Boolean(value.opted_out),
      headline:value.public_headline,locationLabel:value.location_label
    }});
  }));
  return router;
};
