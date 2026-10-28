import express from 'express';
import process from 'node:process';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {resolveVerifiedSeekerContext} from '../auth/seekerContext.js';
import {hasActiveTenantMembership,isAdminRole} from '../platform/permissionEngine.js';
import {PUBLIC_LISTING_ENABLED} from '../publicListings/eligibility.js';
import {createEnquiryStore} from './store.js';
import {isUuid,parseEnquiry,parseOwnerAction,enquiryError} from './contract.js';

const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
export const createEnquiriesRouter=({
  owner=false,env=process.env,store=createEnquiryStore(),
  context=createTenantContextMiddleware({requireUser:true,requireTenant:owner}),
  verifySeeker=resolveVerifiedSeekerContext,allowedOrigin='https://app.quixo.homes'
}={})=>{
  const router=express.Router();
  router.use((req,res,next)=>{
    res.set('Cache-Control','private, no-store, max-age=0');
    if (env.PROPERTY_ENQUIRIES_ENABLED!=='true' || !PUBLIC_LISTING_ENABLED(env)) {
      return res.status(404).json({code:'ENQUIRIES_UNAVAILABLE',error:'Property enquiries are not open yet.'});
    }
    if (!req.authSession?.record?.appUserId || !req.authSession?.sessionId) {
      return res.status(401).json({code:'AUTH_SESSION_REQUIRED',error:'Sign in to continue your enquiry.'});
    }
    if (!['GET','HEAD'].includes(req.method) && req.get('origin')!==allowedOrigin) {
      return res.status(403).json({code:'ENQUIRY_ORIGIN_REQUIRED',error:'Submit enquiries from the application.'});
    }
    next();
  });
  router.use(context);
  router.use((req,res,next)=>Promise.resolve().then(async()=>{
    if (owner) {
      if (!req.tenantId || !isAdminRole({user:req.user,membership:req.membership}) ||
          !hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId})) {
        throw enquiryError(403,'ENQUIRY_ADMIN_REQUIRED','Active tenant administrator required.');
      }
    } else {
      const proof=await verifySeeker({authSession:req.authSession,user:req.user,tenantContext:req.tenantContext});
      if (!proof.verified || !proof.eligible || (req.user.status && req.user.status!=='active')) {
        throw enquiryError(403,'VERIFIED_SEEKER_REQUIRED','A verified personal seeker account is required.');
      }
    }
    req.enquiryActor={actorId:req.authSession.record.appUserId,
      authId:req.authSession.record.authId,sessionId:req.authSession.sessionId,
      ...(owner?{tenantId:req.tenantId}:{})};
    next();
  }).catch(next));
  router.get('/',asyncRoute(async(req,res)=>{
    const offset=Number(req.query.offset||0);
    if (!Number.isInteger(offset) || offset<0 || offset>100000) {throw enquiryError(400,'INVALID_PAGE','Choose a valid page.');}
    res.json({data:await store.list(req.enquiryActor,owner,offset)});
  }));
  if (!owner) {
    router.post('/',asyncRoute(async(req,res)=>{
      const input=parseEnquiry(req.body);
      if (Object.hasOwn(env,'PUBLIC_LISTING_PILOT_PUBLIC_ID') &&
          String(env.PUBLIC_LISTING_PILOT_PUBLIC_ID).toLowerCase()!==input.listingId) {
        throw enquiryError(409,'LISTING_UNAVAILABLE','This property is not open for enquiries.');
      }
      const result=await store.submit(req.enquiryActor,input);
      res.status(result.created?201:200).json({data:result.receipt});
    }));
  }
  router.patch('/:id',asyncRoute(async(req,res)=>{
    if (!isUuid(req.params.id)) {throw enquiryError(404,'ENQUIRY_NOT_FOUND','Enquiry not found.');}
    let input;
    if (owner) {input=parseOwnerAction(req.body);}
    else {
      if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(k=>!['version','status'].includes(k)) ||
          req.body.status!=='withdrawn' || !Number.isInteger(req.body.version) || req.body.version<1) {
        throw enquiryError(400,'INVALID_ENQUIRY_ACTION','Choose an enquiry to withdraw using its current version.');
      }
      input={version:req.body.version};
    }
    res.json({data:await store.change(req.enquiryActor,req.params.id,input,owner)});
  }));
  router.use((error,req,res,_next)=>{
    if (error.status && error.code) {return res.status(error.status).json({code:error.code,error:error.message});}
    // Never send SQL errors, query text or contact values to a browser/log.
    res.status(503).json({code:'ENQUIRY_STORAGE_UNAVAILABLE',error:'Enquiries are temporarily unavailable. Retry with the same request reference.'});
  });
  return router;
};
