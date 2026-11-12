import express from 'express';
import {createTenantContextMiddleware} from '../tenant/context.js';
import {isPlatformAdmin} from '../mssql/platformAdminRouter.js';
import {hasActiveTenantMembership,isAdminRole} from '../platform/permissionEngine.js';
import {createBillingStore} from './store.js';
import {createStripeClient} from './stripe.js';
import {createBillingService} from './service.js';
import {uniqueProviderObject} from './recoveryEvidence.js';
import {BILLING_PRODUCT,hash,identifier,parsePricing,pricingPreview,problem,reason,verifyStripeSignature} from './contract.js';

const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){next(e);}};
const send=(res,data)=>res.json({data,error:null});
const exact=(input,keys)=>{
  if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key)))
    {throw problem(400,'BILLING_FIELDS_INVALID','Only the documented billing fields are accepted.');}
};
export const assertBillingAdministrator=req=>{
  if(!req.authSession || req.user?.is_dev_bypass || !req.user?.id ||
    !hasActiveTenantMembership({membership:req.membership,tenantId:req.tenantId}) || !isAdminRole({user:req.user,membership:req.membership}))
    {throw problem(403,'BILLING_ADMIN_REQUIRED','An active workspace administrator is required.');}
};

export const createManagementBillingRouter=({env=process.env,store=createBillingStore({env}),stripe=createStripeClient({env}),
  resolveContext=createTenantContextMiddleware({requireUser:true,auditLabel:'management-billing'}),checkPlatformAdmin=isPlatformAdmin}={})=>{
  const router=express.Router();
  const service=createBillingService({store,stripe,env});
  router.use((_req,res,next)=>env.MANAGEMENT_BILLING_SCHEMA_READY==='true'?next():res.status(503).json({error:'Subscription management is being prepared.',code:'BILLING_SCHEMA_NOT_READY'}));
  router.use(resolveContext);
  router.use((req,res,next)=>req.authSession && req.user?.id && !req.user?.is_dev_bypass?next():res.status(401).json({error:'An authenticated session is required.'}));
  const globalAdmin=wrap(async(req,_res,next)=>{if(!await checkPlatformAdmin(req.user)) {throw problem(403,'PLATFORM_ADMIN_REQUIRED','Platform administrator access is required.');}next();});
  const orgAdmin=wrap(async(req,_res,next)=>{assertBillingAdministrator(req);next();});
  router.get('/admin/pricing',globalAdmin,wrap(async(_req,res)=>send(res,{versions:await store.listPricing(),sandboxConfigured:stripe.configured(),liveChargingEnabled:false})));
  router.post('/admin/pricing/preview',globalAdmin,wrap(async(req,res)=>{
    exact(req.body,['rules','quantity']);send(res,pricingPreview(parsePricing(req.body.rules),req.body.quantity));
  }));
  router.post('/admin/pricing',globalAdmin,wrap(async(req,res)=>{
    exact(req.body,['rules','expectedVersion']);
    if(!Number.isInteger(req.body.expectedVersion)||req.body.expectedVersion<0) {throw problem(400,'BILLING_VERSION_INVALID','The current pricing version is required.');}
    send(res,await store.savePricing({rules:parsePricing(req.body.rules),expectedVersion:req.body.expectedVersion,actorId:req.user.id}));
  }));
  router.post('/admin/pricing/:id/publish-sandbox',globalAdmin,wrap(async(req,res)=>{
    exact(req.body,[]);const id=identifier(req.params.id);await stripe.assertAccount();
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY==='true'){
      const authorize=async q=>{
        if(!await checkPlatformAdmin(req.user,{query:async(statement,params)=>(await q(statement,params))[0]||null,env})){
          throw problem(403,'PLATFORM_ADMIN_REQUIRED','Platform administrator access is required.');
        }
      };
      const prepared=await store.locked(`pricing-publication:${id}`,async q=>{
        await authorize(q);
        const record=(await q('SELECT * FROM dbo.management_pricing_versions WHERE id=@id',{id}))[0];
        if(!record){throw problem(404,'BILLING_PRICING_NOT_FOUND','Pricing version not found.');}
        if(record.status==='sandbox_published'){return {completed:true,stripePriceId:record.stripe_price_id};}
        const rules=parsePricing(JSON.parse(record.rules_json));
        if(!pricingPreview(rules,1).ready){throw problem(409,'BILLING_PRICING_INCOMPLETE','Complete the pricing decision before sandbox publication.');}
        const attempts=await q("SELECT current_hash,created_at FROM dbo.management_billing_audit WHERE resource_id=@id AND action='pricing.publication.attempt' ORDER BY created_at",{id});
        if(attempts.some(row=>row.current_hash!==hash(rules))){throw problem(409,'BILLING_RECOVERY_INTENT_CHANGED','The saved publication terms changed.');}
        if(attempts.length>=8){throw problem(409,'BILLING_RECOVERY_REVIEW','This price publication requires review.');}
        await store.audit(q,{actorId:req.user.id,action:'pricing.publication.attempt',resourceId:id,current:rules,reason:'Persisted immutable pricing intent and original provider key before publication.'});
        return {rules};
      });
      if(prepared.completed){return send(res,{id,stripePriceId:prepared.stripePriceId});}
      const result=await store.locked(`pricing-publication:${id}`,async q=>{
        await authorize(q);
        const record=(await q('SELECT * FROM dbo.management_pricing_versions WHERE id=@id',{id}))[0];
        if(!record||hash(parsePricing(JSON.parse(record.rules_json)))!==hash(prepared.rules)){
          throw problem(409,'BILLING_RECOVERY_INTENT_CHANGED','The saved publication terms changed.');
        }
        if(record.status==='sandbox_published'){return {id,stripePriceId:record.stripe_price_id};}
        const rules=prepared.rules;
        const matches=p=>p.livemode===false&&p.active&&p.currency==='usd'&&p.unit_amount===rules.baseFeeMinor&&
          p.type==='recurring'&&p.billing_scheme==='per_unit'&&p.recurring?.interval==='month'&&p.recurring.interval_count===1&&
          p.recurring.usage_type==='licensed'&&!p.recurring.trial_period_days&&!p.transform_quantity;
        let reusable=null;
        let selected=await uniqueProviderObject({stripe,path:'/v1/prices',params:{product:BILLING_PRODUCT},matches:p=>{
          if(matches(p)&&!reusable){reusable=p;}
          return p.metadata?.pricing_version===id;
        }});
        if(selected&&!matches(selected)){throw problem(409,'BILLING_PRICE_MISMATCH','The original provider price changed and needs review.');}
        selected=selected||reusable;
        if(!selected){
          const age=(await q("SELECT DATEDIFF_BIG(second,created_at,SYSUTCDATETIME()) AS age FROM dbo.management_pricing_versions WHERE id=@id",{id}))[0]?.age;
          if(!Number.isFinite(Number(age))||age>=23*3600){throw problem(409,'BILLING_RECOVERY_EVIDENCE_REQUIRED','The older price publication needs provider evidence.');}
          await stripe.request('POST','/v1/prices',{product:BILLING_PRODUCT,currency:'usd',unit_amount:rules.baseFeeMinor,
            recurring:{interval:'month',usage_type:'licensed'},metadata:{pricing_version:id,market:rules.market}},`quixo:pricing:${id}`);
          selected=await uniqueProviderObject({stripe,path:'/v1/prices',params:{product:BILLING_PRODUCT},matches:p=>p.metadata?.pricing_version===id});
          if(!selected||!matches(selected)){throw problem(503,'BILLING_RECOVERY_UNCONFIRMED','The provider has not confirmed this price.');}
        }
        await service.price(selected.id);
        await q("UPDATE dbo.management_pricing_versions SET status='sandbox_published',stripe_price_id=@price,published_at=SYSUTCDATETIME() WHERE id=@id",{id,price:selected.id});
        await store.audit(q,{actorId:req.user.id,action:'pricing.sandbox_published',resourceId:id,previous:record,current:{price:selected.id,rules},reason:rules.reason});
        return {id,stripePriceId:selected.id};
      });
      return send(res,result);
    }
    const result=await store.locked(`pricing-publication:${id}`,async q=>{
      const record=(await q('SELECT * FROM dbo.management_pricing_versions WHERE id=@id',{id}))[0];
      if(!record) {throw problem(404,'BILLING_PRICING_NOT_FOUND','Pricing version not found.');}
      if(record.status==='sandbox_published') {return {id,stripePriceId:record.stripe_price_id};}
      const rules=parsePricing(JSON.parse(record.rules_json));
      if(!pricingPreview(rules,1).ready) {throw problem(409,'BILLING_PRICING_INCOMPLETE','Set the threshold, adjustment decision and effective date before sandbox publication.');}
      const prices=await stripe.request('GET','/v1/prices',{product:BILLING_PRODUCT,active:true,limit:100});
      let selected=prices.data.find(p=>p.currency==='usd' && p.unit_amount===rules.baseFeeMinor && p.billing_scheme==='per_unit' &&
        p.recurring?.interval==='month' && p.recurring.interval_count===1 && p.recurring.usage_type==='licensed' && !p.recurring.trial_period_days && !p.transform_quantity);
      if(!selected) {selected=await stripe.request('POST','/v1/prices',{product:BILLING_PRODUCT,currency:'usd',unit_amount:rules.baseFeeMinor,
        recurring:{interval:'month',usage_type:'licensed'},metadata:{pricing_version:id,market:rules.market}},`quixo:pricing:${id}`);}
      await service.price(selected.id);
      await q(`UPDATE dbo.management_pricing_versions SET status='sandbox_published',stripe_price_id=@price,published_at=SYSUTCDATETIME() WHERE id=@id`,{id,price:selected.id});
      await store.audit(q,{actorId:req.user.id,action:'pricing.sandbox_published',resourceId:id,previous:record,current:{price:selected.id,rules},reason:rules.reason});
      return {id,stripePriceId:selected.id};
    });send(res,result);
  }));
  router.post('/admin/enroll',globalAdmin,wrap(async(req,res)=>{
    exact(req.body,['tenantId','reason','market','useApprovedSandboxBaseline']);
    if(!['LK','BN'].includes(req.body.market) || typeof req.body.useApprovedSandboxBaseline!=='boolean')
      {throw problem(400,'BILLING_ENROLLMENT_INVALID','Choose an explicit market and sandbox pricing policy.');}
    await store.enroll({tenantId:identifier(req.body.tenantId),actorId:req.user.id,reason:reason(req.body.reason),market:req.body.market,useApprovedSandboxBaseline:req.body.useApprovedSandboxBaseline});send(res,{enrolled:true});
  }));
  router.get('/admin/complimentary/:tenantId',globalAdmin,wrap(async(req,res)=>{
    send(res,await store.complimentaryStatus(identifier(req.params.tenantId)));
  }));
  router.post('/admin/complimentary/:tenantId',globalAdmin,wrap(async(req,res)=>{
    exact(req.body,['mode','expiresAt','reason','expectedVersion']);
    send(res,await store.setComplimentary({tenantId:identifier(req.params.tenantId),actorId:req.user.id,...req.body}));
  }));
  router.get('/status',orgAdmin,wrap(async(req,res)=>send(res,await service.summary(req.tenantId))));
  router.post('/stock/prepare',orgAdmin,wrap(async(req,res)=>{
    exact(req.body,['records','reason']);
    send(res,await store.stageStock({tenantId:req.tenantId,actorId:req.user.id,records:req.body.records,reason:reason(req.body.reason)}));
  }));
  router.post('/stock/withdraw',orgAdmin,wrap(async(req,res)=>{
    exact(req.body,['ids','reason']);
    send(res,await store.withdrawStock({tenantId:req.tenantId,actorId:req.user.id,ids:req.body.ids,reason:reason(req.body.reason)}));
  }));
  router.post('/stock/cessation-preview',orgAdmin,wrap(async(req,res)=>{
    exact(req.body,['propertyId','unitId']);
    send(res,await service.cessationPreview({tenantId:req.tenantId,actorId:req.user.id,
      propertyId:identifier(req.body.propertyId),unitId:req.body.unitId===null?null:identifier(req.body.unitId)}));
  }));
  router.post('/stock/cessation',orgAdmin,wrap(async(req,res)=>{
    exact(req.body,['requestId','propertyId','unitId','inventoryHash','reason']);
    if(typeof req.body.inventoryHash!=='string'||!/^[a-f0-9]{64}$/.test(req.body.inventoryHash)){throw problem(400,'BILLING_PREVIEW_REQUIRED','Review the current managed inventory before ending management.');}
    send(res,await service.ceaseStock({tenantId:req.tenantId,actorId:req.user.id,id:identifier(req.body.requestId),
      propertyId:identifier(req.body.propertyId),unitId:req.body.unitId===null?null:identifier(req.body.unitId),
      inventoryHash:req.body.inventoryHash,reason:reason(req.body.reason)}));
  }));
  router.post('/refresh',orgAdmin,wrap(async(req,res)=>{exact(req.body,[]);send(res,await service.refresh(req.tenantId));}));
  const command=(kind,extraKeys,run)=>router.post(`/${kind}`,orgAdmin,wrap(async(req,res)=>{
    exact(req.body,['requestId',...extraKeys]);
    send(res,await run({tenantId:req.tenantId,id:identifier(req.body.requestId),actorId:req.user.id,...Object.fromEntries(extraKeys.map(key=>[key,req.body[key]]))}));
  }));
  command('checkout',['inventoryHash'],service.checkout);
  command('portal',[],service.portal);
  command('quantity-preview',[],service.quantityPreview);
  command('quantity-apply',['previewId'],args=>service.quantityApply({...args,previewId:identifier(args.previewId)}));
  command('reconcile-cancellation',[],service.reconcileCancellation);
  command('cancellation',['cancelAtPeriodEnd'],args=>{
    if(typeof args.cancelAtPeriodEnd!=='boolean') {throw problem(400,'BILLING_CANCEL_INVALID','Choose whether the subscription ends at renewal.');}
    return service.cancel(args);
  });
  router.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status?error.message:'Subscription management could not complete this request.',code:error.code||'BILLING_ERROR'}));
  return router;
};

export const createManagementBillingWebhook=({env=process.env,store=createBillingStore({env}),stripe=createStripeClient({env})}={})=>{
  const router=express.Router();
  router.post('/',(req,res,next)=>env.MANAGEMENT_BILLING_SCHEMA_READY==='true' && stripe.configured() && env.STRIPE_SANDBOX_WEBHOOK_SECRET?
    next():res.sendStatus(404),express.raw({type:'application/json',limit:'256kb'}),wrap(async(req,res)=>{
    const event=verifyStripeSignature({body:req.body,signature:req.headers['stripe-signature'],secret:env.STRIPE_SANDBOX_WEBHOOK_SECRET});
    send(res,await createBillingService({store,stripe,env}).webhook(event));
  }));
  router.use((error,_req,res,_next)=>res.status(error.status||500).json({error:error.status?error.message:'Webhook reconciliation failed.',code:error.code||'BILLING_WEBHOOK_ERROR'}));
  return router;
};
