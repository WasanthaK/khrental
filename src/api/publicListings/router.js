import express from 'express';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {hasActiveTenantMembership,isAdminRole} from '../platform/permissionEngine.js';
import {PUBLIC_LISTING_ENABLED,parseCountry} from './eligibility.js';
import {isId,parsePreferenceInput,toPublicDTO} from './contract.js';
import * as store from './store.js';
import {consumeReadBudget} from './rateLimit.js';
const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
const hidden=res=>res.status(404).json({code:'PUBLIC_LISTINGS_DISABLED',error:'Public listings are not enabled.'});
const publicOrigins=new Set(['https://mango-grass-0314c0100.3.azurestaticapps.net','https://quixo.homes','https://www.quixo.homes']);

export const createPublicListingsRouter=({
  env=process.env,list=store.listEligible,find=store.findEligible,
  rateLimit=consumeReadBudget
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
  router.get('/',asyncRoute(async(req,res)=>{
    const country=parseCountry(req.query?.country);
    if(!country)return res.status(400).json({code:'PUBLIC_COUNTRY_REQUIRED',error:'Choose LK or BN.'});
    if(!await rateLimit(country))return res.status(429).json({code:'PUBLIC_RATE_LIMIT',error:'Please try again later.'});
    const rows=await list(country);
    return res.json({country,data:rows.map(toPublicDTO).filter(Boolean)});
  }));
  router.get('/:publicId',asyncRoute(async(req,res)=>{
    if(!isId(req.params.publicId))return res.status(404).json({code:'PUBLIC_LISTING_NOT_FOUND'});
    if(!await rateLimit('DETAIL'))return res.status(429).json({code:'PUBLIC_RATE_LIMIT'});
    const item=toPublicDTO(await find(req.params.publicId));
    if(!item)return res.status(404).json({code:'PUBLIC_LISTING_NOT_FOUND'});
    res.json({data:item});
  }));
  return router;
};

export const createPublicListingPreferencesRouter=({
  env=process.env,
  context=createTenantContextMiddleware({requireUser:true,requireTenant:true,auditLabel:'public-listing-optout'}),
  get=store.getPreference,
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
