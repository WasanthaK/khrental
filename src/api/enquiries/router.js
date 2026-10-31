import express from 'express';
import process from 'node:process';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {resolvePersonalRentalContext} from '../auth/seekerContext.js';
import {hasActiveTenantMembership,isAdminRole} from '../platform/permissionEngine.js';
import {PUBLIC_LISTING_ENABLED} from '../publicListings/eligibility.js';
import {createEnquiryStore} from './store.js';
import {createOfferStore} from './offerStore.js';
import {parseOfferAction} from './offerContract.js';
import {createApplicationStore} from './applicationStore.js';
import {parseApplicationAction} from './applicationContract.js';
import {createViewingStore} from './viewingStore.js';
import {parseViewingAction} from './viewingContract.js';
import {isUuid,parseEnquiry,parseOwnerAction,enquiryError} from './contract.js';

const asyncRoute=fn=>(req,res,next)=>Promise.resolve().then(()=>fn(req,res)).catch(next);
export const createEnquiriesRouter=({
  owner=false,env=process.env,store=createEnquiryStore(),viewings=createViewingStore(),applications=createApplicationStore(),offers=createOfferStore(),
  context=createTenantContextMiddleware({requireUser:true,requireTenant:owner}),
  verifySeeker=resolvePersonalRentalContext,allowedOrigin='https://app.quixo.homes'
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
  const rentalActor=req=>({actorId:req.authSession.record.appUserId,authId:req.authSession.record.authId,
    sessionId:req.authSession.sessionId,...(owner?{tenantId:req.tenantId}:{})});
  // Personal rental history remains bound to its verified global actor,
  // independently of workspace membership. SQL rechecks that identity;
  // business actions separately require the target workspace administrator.
  const rentalGate=(req,res,next)=>{
    if(owner&&(!isAdminRole({user:req.user,membership:req.membership})||!hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId}))){
      return res.status(403).json({code:'ENQUIRY_ADMIN_REQUIRED',error:'Active tenant administrator required.'});
    }
    if(env.PROPERTY_RENTAL_OFFERS_SCHEMA_READY!=='true'){
      return res.status(404).json({code:'RENTAL_OFFERS_UNAVAILABLE',error:'Rental offers are not open yet.'});
    }
    if(req.method==='POST'&&env.PROPERTY_RENTAL_OFFERS_ENABLED!=='true'&&req.body?.action!=='withdraw'){
      return res.status(409).json({code:'RENTAL_OFFERS_CLOSED',error:'New offers are temporarily closed. Existing reservations can still be withdrawn.'});
    }
    next();
  };
  if(!owner){router.get('/journey',rentalGate,asyncRoute(async(req,res)=>{
    const offset=Number(req.query.offset||0);
    if(!Number.isInteger(offset)||offset<0||offset>100000){throw enquiryError(400,'INVALID_PAGE','Choose a valid page.');}
    res.json({data:await store.list(rentalActor(req),false,offset,true)});
  }));}
  router.get('/:id/offer',rentalGate,asyncRoute(async(req,res)=>{
    if(!isUuid(req.params.id)){throw enquiryError(404,'ENQUIRY_NOT_FOUND','Enquiry not found.');}
    res.json({data:{...await offers.get(rentalActor(req),req.params.id,owner),actionsEnabled:env.PROPERTY_RENTAL_OFFERS_ENABLED==='true'}});
  }));
  router.post('/:id/offer',rentalGate,asyncRoute(async(req,res)=>{
    if(!isUuid(req.params.id)){throw enquiryError(404,'ENQUIRY_NOT_FOUND','Enquiry not found.');}
    res.json({data:{...await offers.change(rentalActor(req),req.params.id,parseOfferAction(req.body,owner),owner),actionsEnabled:env.PROPERTY_RENTAL_OFFERS_ENABLED==='true'}});
  }));
  router.use((req,res,next)=>Promise.resolve().then(async()=>{
    if (owner) {
      if (!req.tenantId || !isAdminRole({user:req.user,membership:req.membership}) ||
          !hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId})) {
        throw enquiryError(403,'ENQUIRY_ADMIN_REQUIRED','Active tenant administrator required.');
      }
    } else {
      const proof=await verifySeeker({authSession:req.authSession,user:req.user,tenantContext:req.tenantContext});
      if (!proof.verified || !proof.eligible || (req.user.status && req.user.status!=='active')) {
        throw enquiryError(403,'VERIFIED_SEEKER_REQUIRED','Verify your account’s email address to continue your rental search.');
      }
    }
    req.enquiryActor={actorId:req.authSession.record.appUserId,
      authId:req.authSession.record.authId,sessionId:req.authSession.sessionId,
      ...(owner?{tenantId:req.tenantId}:{})};
    next();
  }).catch(next));
  router.use('/:id/viewing',(req,res,next)=>{
    if (env.PROPERTY_VIEWINGS_ENABLED!=='true') {return res.status(404).json({code:'VIEWINGS_UNAVAILABLE',error:'Viewing appointments are not open yet.'});}
    if (!isUuid(req.params.id)) {return res.status(404).json({code:'ENQUIRY_NOT_FOUND',error:'Enquiry not found.'});}
    next();
  });
  router.get('/:id/viewing',asyncRoute(async(req,res)=>{
    res.json({data:await viewings.get(req.enquiryActor,req.params.id,owner)});
  }));
  router.post('/:id/viewing',asyncRoute(async(req,res)=>{
    res.json({data:await viewings.change(req.enquiryActor,req.params.id,parseViewingAction(req.body,owner),owner)});
  }));
  router.use('/:id/application',(req,res,next)=>{
    if(env.PROPERTY_APPLICATIONS_ENABLED!=='true'){return res.status(404).json({code:'APPLICATIONS_UNAVAILABLE',error:'Rental applications are not open yet.'});}
    if(!isUuid(req.params.id)){return res.status(404).json({code:'ENQUIRY_NOT_FOUND',error:'Enquiry not found.'});}
    next();
  });
  router.get('/:id/application',asyncRoute(async(req,res)=>{
    res.json({data:await applications.get(req.enquiryActor,req.params.id,owner)});
  }));
  router.post('/:id/application',asyncRoute(async(req,res)=>{
    res.json({data:await applications.change(req.enquiryActor,req.params.id,parseApplicationAction(req.body,owner),owner)});
  }));
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
  router.use((error,req,res,next)=>{
    if (res.headersSent) {return next(error);}
    if (error.status && error.code) {return res.status(error.status).json({code:error.code,error:error.message});}
    // Never send SQL errors, query text or contact values to a browser/log.
    res.status(503).json({code:'ENQUIRY_STORAGE_UNAVAILABLE',error:'Enquiries are temporarily unavailable. Retry with the same request reference.'});
  });
  return router;
};
