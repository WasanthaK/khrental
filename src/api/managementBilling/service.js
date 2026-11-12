import {BILLING_PORTAL, BILLING_PRODUCT, entitlement, localCessationAllowed, hash, problem} from './contract.js';
import {firstRenewalFailure, invoiceSubscription, objectId, subscriptionProjection} from './stripe.js';
import {requestObjectEvidence,uniqueProviderObject} from './recoveryEvidence.js';
import {createRecoveryRunner,billingClock} from './recovery.js';
import {createRecoveryJournal} from './recoveryJournal.js';
import {cancellationRecovery} from './recoveryCancellation.js';
import {quantityRecovery,quantityScheduleBody,quantityScheduleMatches,scheduleFingerprint} from './recoveryQuantity.js';

const safeUrl = (value, host) => {
  const url = new URL(value);
  if(url.protocol !== 'https:' || url.hostname !== host || url.username || url.password)
    {throw problem(502,'BILLING_URL_INVALID','Stripe returned an unexpected hosted URL.');}
  return url.href;
};
const assertPortalConfiguration=async stripe=>{
    const config=await stripe.request('GET',`/v1/billing_portal/configurations/${BILLING_PORTAL}`);
    if(!config.active||config.features?.subscription_update?.enabled||config.features?.subscription_cancel?.enabled||config.features?.subscription_pause?.enabled){
      throw problem(409,'BILLING_PORTAL_UNSAFE','Portal subscription controls must remain disabled.');
    }
};
// Exposed for the same process-interruption harness used by other recovery types.
export const createProviderRecoveryHandlers=({store,stripe,requireAccount,clock=billingClock})=>{
  const recoveryBinding=async job=>{
    const account=await requireAccount(job.tenant_id);
    if(account.stripe_subscription_id!==job.intent._subscriptionId||account.stripe_customer_id!==job.intent.customerId||
      account.stripe_price_id!==job.intent.priceId){
      throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved billing binding changed.');
    }
    await stripe.assertAccount();return account;
  };
  const checkoutSession=async(intent,sessionId,customerId)=>{
    const session=await stripe.request('GET',`/v1/checkout/sessions/${sessionId}`);
    const lines=await stripe.request('GET',`/v1/checkout/sessions/${sessionId}/line_items`,{limit:100});
    if(session.id!==sessionId||session.livemode!==false||session.mode!=='subscription'||objectId(session.customer)!==customerId||
      !Array.isArray(lines.data)||lines.has_more!==false||lines.data.length!==1||
      objectId(lines.data[0].price)!==intent.priceId||lines.data[0].quantity!==intent.inventory.length){
      throw problem(409,'BILLING_CHECKOUT_MISMATCH','Checkout ownership or inventory needs reconciliation.');
    }
    return session;
  };
  const recoverCheckout=async({job,step})=>{
    const {intent,tenant_id:tenantId,id}=job;await recoveryBinding(job);
    const key=`quixo:${tenantId}:${id}`;
    let customerId=intent.customerId;
    if(intent.existingSessionId){await checkoutSession(intent,intent.existingSessionId,customerId);return {sessionId:intent.existingSessionId,customerId};}
    if(!customerId){
      const proof=await step('create_customer',{input:{description:'Quixo.Homes organization sandbox subscription',
        metadata:{quixo_operation:id,quixo_tenant:tenantId}},key:`${key}:customer`,
      read:async input=>{
        const evidence=await requestObjectEvidence({stripe,type:'customer.created',key:`${key}:customer`,since:job.created_at,clock,
          matches:value=>value.metadata?.quixo_operation===id&&value.metadata?.quixo_tenant===tenantId});
        if(!evidence){return {confirmed:false};}
        const customer=await stripe.request('GET',`/v1/customers/${evidence.object.id}`);
        if(customer.deleted||customer.livemode!==false||customer.metadata?.quixo_operation!==input.metadata.quixo_operation||
          customer.metadata?.quixo_tenant!==tenantId){throw problem(409,'BILLING_CUSTOMER_MISMATCH','The saved customer needs review.');}
        return {confirmed:true,result:{customerId:customer.id,eventId:evidence.eventId}};
      },write:(input,stepKey)=>stripe.request('POST','/v1/customers',input,stepKey)});
      customerId=proof.customerId;
    }
    const metadata={quixo_operation:id,quixo_tenant:tenantId,inventory_hash:intent.inventoryHash};
    const body={mode:'subscription',customer:customerId,line_items:[{price:intent.priceId,quantity:intent.inventory.length}],
      integration_identifier:'quixo_homes_management_xmptkrva',metadata,
      success_url:`${intent.origin}/dashboard/subscription?checkout=returned`,cancel_url:`${intent.origin}/dashboard/subscription?checkout=cancelled`,
      automatic_tax:{enabled:false},allow_promotion_codes:false,
      custom_text:{submit:{message:'Sandbox test only. Monthly management subscription, no trial. Rent and deposits are separate.'}}};
    const saved=await step('create_checkout',{input:body,key:`${key}:checkout`,read:async()=>{
      let otherSession=false;
      const found=await uniqueProviderObject({stripe,path:'/v1/checkout/sessions',params:{customer:customerId},
        matches:session=>{
          if(session.metadata?.quixo_operation!==id&&['open','complete'].includes(session.status)){otherSession=true;}
          return session.metadata?.quixo_operation===id;
        }});
      if(otherSession){throw problem(409,'BILLING_CHECKOUT_PENDING','Another checkout needs review before continuing.');}
      if(!found){return {confirmed:false};}
      if(found.metadata?.quixo_tenant!==tenantId||found.metadata?.inventory_hash!==intent.inventoryHash){
        throw problem(409,'BILLING_CHECKOUT_MISMATCH','The saved checkout needs review.');
      }
      await checkoutSession(intent,found.id,customerId);
      return {confirmed:true,result:{sessionId:found.id,customerId}};
    },write:(input,stepKey)=>stripe.request('POST','/v1/checkout/sessions',input,stepKey)});
    return {sessionId:saved.sessionId,customerId};
  };
  const recoverPortal=async({job,step})=>{
    const {intent}=job;await recoveryBinding(job);
    const expired={requiresNewSession:true,message:'This billing link expired. Select Payment method & invoices again to open a fresh link.'};
    if(clock.now()-new Date(job.created_at).getTime()>300000){return expired;}
    await assertPortalConfiguration(stripe);
    const key=`quixo:${job.tenant_id}:${job.id}`;
    const read=()=>requestObjectEvidence({stripe,type:'billing_portal.session.created',customerId:intent.customerId,key,since:job.created_at,clock,
      matches:value=>objectId(value.configuration)===BILLING_PORTAL&&value.return_url===`${intent.origin}/dashboard/subscription`});
    let response;
    const saved=await step('create_portal',{input:{customer:intent.customerId,configuration:BILLING_PORTAL,return_url:`${intent.origin}/dashboard/subscription`},key,
      read:async()=>{const evidence=await read();return evidence?{confirmed:true,result:{sessionId:evidence.object.id,eventId:evidence.eventId}}:{confirmed:false};},
      write:(input,stepKey)=>stripe.request('POST','/v1/billing_portal/sessions',input,stepKey),
      confirmResponse:async value=>{
        if(value.livemode!==false||objectId(value.customer)!==intent.customerId||objectId(value.configuration)!==BILLING_PORTAL||!value.id){
          throw problem(409,'BILLING_PORTAL_MISMATCH','The billing link needs review.');
        }
        response=value;safeUrl(value.url,'billing.stripe.com');return {confirmed:true,result:{sessionId:value.id}};
      }});
    const value=response||(await read())?.object;
    if(!value||value.id!==saved.sessionId){throw problem(503,'BILLING_RECOVERY_EVIDENCE_UNAVAILABLE','The billing link is awaiting confirmation.');}
    return {url:safeUrl(value.url,'billing.stripe.com')};
  };
  const recoverPreview=async({job,step})=>{
    const {intent}=job;const account=await recoveryBinding(job);
    if(clock.now()>Date.parse(intent.preview.expiresAt)){
      return {expired:true,message:'This quantity preview expired. Select Review quantity change again.'};
    }
    if(hash(await store.inventory(job.tenant_id,undefined,{includePending:true}))!==intent.preview.inventoryHash||account.quantity!==intent.preview.from){
      throw problem(409,'BILLING_PREVIEW_STALE','Inventory or subscription changed. Request a new preview.');
    }
    let invoice={nextInvoiceTotalMinor:null,currency:'usd'};
    if(intent.preview.to>intent.preview.from){
      invoice=await step('preview_invoice',{input:{customer:intent.customerId,subscription:intent._subscriptionId,
        subscription_details:{items:[{id:intent.itemId,quantity:intent.preview.to}],proration_behavior:'create_prorations',proration_date:intent.preview.prorationDate}},
      key:`quixo:${job.tenant_id}:${job.id}`,read:async()=>({confirmed:false}),
      write:(input,stepKey)=>stripe.request('POST','/v1/invoices/create_preview',input,stepKey),
      confirmResponse:async value=>{
        if(value.livemode!==false||objectId(value.customer)!==intent.customerId||!Number.isSafeInteger(value.total)||value.currency!=='usd'){
          throw problem(409,'BILLING_PREVIEW_MISMATCH','The provider preview needs review.');
        }
        return {confirmed:true,result:{nextInvoiceTotalMinor:value.total,currency:value.currency}};
      }});
    }
    return {...intent.preview,...invoice};
  };
  return {checkout:recoverCheckout,portal:recoverPortal,quantity_preview:recoverPreview,checkoutSession};
};
export const createBillingService = ({store,stripe,env=process.env,clock=billingClock}) => {
  const configuredOrigin=()=>{
    let url;
    try {url=new URL(env.PUBLIC_APP_URL || env.PASSWORD_RESET_BASE_URL);} catch {throw problem(503,'BILLING_ORIGIN_REQUIRED','The application return URL is not configured.');}
    if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
      {throw problem(503,'BILLING_ORIGIN_REQUIRED','Use the application HTTPS origin for billing returns.');}
    return url.origin;
  };
  const requireAccount=async(tenantId,q)=>{
    const account=await store.account(tenantId,q);
    if(!account) {throw problem(409,'BILLING_NOT_ENROLLED','A platform administrator must enroll this test workspace first.');}
    return account;
  };
  const price=async id=>{
    const result=await stripe.request('GET',`/v1/prices/${id}`);
    if(!result.active || result.livemode!==false || objectId(result.product)!==BILLING_PRODUCT || result.type!=='recurring' ||
      result.billing_scheme!=='per_unit' || result.recurring?.interval!=='month' || result.recurring.interval_count!==1 ||
      result.recurring.usage_type!=='licensed' || result.recurring.trial_period_days || result.currency!=='usd' ||
      !Number.isSafeInteger(result.unit_amount) || result.unit_amount<1 || result.transform_quantity)
      {throw problem(409,'BILLING_PRICE_MISMATCH','The selected sandbox price does not match the approved monthly contract.');}
    return result;
  };
  const saveProjection=async(q,tenantId,projection)=>{
    await q(`UPDATE dbo.management_billing_accounts SET subscription_status=@subscription_status,stripe_item_id=@stripe_item_id,
      quantity=@quantity,initial_payment_verified=@initial_payment_verified,paid_through=@paid_through,
      grace_started_at=@grace_started_at,cancel_at_period_end=@cancel_at_period_end,stripe_schedule_id=@stripe_schedule_id,
      pending_quantity=CASE WHEN pending_quantity=@quantity THEN NULL ELSE pending_quantity END,
      version=version+1,updated_at=SYSUTCDATETIME() WHERE tenant_id=@tenantId`,{tenantId,...projection,
      paid_through:projection.paid_through?new Date(projection.paid_through):null,
      grace_started_at:projection.grace_started_at?new Date(projection.grace_started_at):null});
  };
  const loadInvoice=async id=>{
    const invoice=await stripe.request('GET',`/v1/invoices/${id}`);
    let page=invoice.lines;
    const lines=[...(page?.data || [])];
    while(page?.has_more){
      if(!page.data?.length || lines.length>=10000) {throw problem(409,'BILLING_INVOICE_REVIEW','Invoice lines could not be fully reconciled.');}
      page=await stripe.request('GET',`/v1/invoices/${id}/lines`,{limit:100,starting_after:page.data.at(-1).id});
      lines.push(...page.data);
    }
    return {...invoice,lines:{...invoice.lines,data:lines,has_more:false}};
  };
  const reconcileLocked=async(q,account,{promoteCheckout=true}={})=>{
    if(!account.stripe_subscription_id){
      const sessions=await q(`SELECT result_json FROM dbo.management_billing_commands
        WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed' ORDER BY created_at DESC`,{tenantId:account.tenant_id});
      for(const row of sessions){
        const session=await stripe.request('GET',`/v1/checkout/sessions/${JSON.parse(row.result_json).sessionId}`);
        if(objectId(session.customer)!==account.stripe_customer_id || session.mode!=='subscription' || session.livemode!==false)
          {throw problem(409,'BILLING_CHECKOUT_MISMATCH','Checkout ownership needs reconciliation.');}
        if(session.status==='complete' && objectId(session.subscription)){
          account={...account,stripe_subscription_id:objectId(session.subscription)};
          await q('UPDATE dbo.management_billing_accounts SET stripe_subscription_id=@subscriptionId WHERE tenant_id=@tenantId',
            {tenantId:account.tenant_id,subscriptionId:account.stripe_subscription_id});
          break;
        }
      }
    }
    if(!account.stripe_subscription_id) {return account;}
    const subscription=await stripe.request('GET',`/v1/subscriptions/${account.stripe_subscription_id}`);
    const invoiceId=objectId(subscription.latest_invoice);
    const invoice=invoiceId?await loadInvoice(invoiceId):null;
    const firstFailureAt=subscription.status==='past_due' && invoice?.status==='open' && invoice.attempted===true && account.initial_payment_verified
      ? await firstRenewalFailure({stripe,invoice,account,now:clock.now()}) : null;
    const projection=subscriptionProjection({subscription,invoice,account,firstFailureAt,now:clock.now()});
    await saveProjection(q,account.tenant_id,projection);
    const snapshot=JSON.parse(account.inventory_json||'[]');
    if(promoteCheckout&&snapshot[0]?.stagedRecords?.length&&projection.initial_payment_verified&&
      entitlement({...account,...projection},clock.now()).management){
      const rows=await q(`SELECT id,result_json FROM dbo.management_billing_commands
        WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed' ORDER BY created_at DESC`,{tenantId:account.tenant_id});
      let matched=null;
      for(const row of rows){
        const session=await stripe.request('GET',`/v1/checkout/sessions/${JSON.parse(row.result_json).sessionId}`);
        if(session.livemode===false&&session.mode==='subscription'&&session.status==='complete'&&
          objectId(session.customer)===account.stripe_customer_id&&objectId(session.subscription)===account.stripe_subscription_id){matched=row;break;}
      }
      if(!matched){throw problem(409,'BILLING_STOCK_CONFIRMATION','The prepared stock needs a matching completed checkout.');}
      await store.promoteStock(q,{tenantId:account.tenant_id,snapshot,commandId:matched.id});
      await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory WHERE tenant_id=@tenantId',
        {tenantId:account.tenant_id,inventory:JSON.stringify(await store.inventory(account.tenant_id,q))});
    }
    return {...account,...projection};
  };
  const summary=async tenantId=>{
    const account=await store.account(tenantId);
    const inventory=await store.inventory(tenantId);
    const proposedInventory=await store.inventory(tenantId,undefined,{includePending:true});
    const staged=await store.pendingStock?.(tenantId)||[];
    const pending=account?(await store.read(`SELECT id,kind,created_at,payload_json FROM dbo.management_billing_commands
      WHERE tenant_id=@tenantId AND status='pending'`,{tenantId}))[0]||null:null;
    const pendingPayload=pending?JSON.parse(pending.payload_json):null;
    if(pendingPayload) {delete pendingPayload._subscriptionId;}
    return {mode:'sandbox',configured:stripe.configured(),enrolled:Boolean(account),inventory,
      inventoryHash:hash(proposedInventory),inventoryQuantity:inventory.length,proposedInventoryQuantity:proposedInventory.length,
      stagingEnabled:Boolean(store.stagingEnabled?.()),pendingStock:staged.map(row=>({id:row.id,kind:row.kind,
        label:JSON.parse(row.payload_json)[row.kind==='property'?'name':'unitnumber']})),
      cessationEnabled:Boolean(store.cessationEnabled?.()),
      billedQuantity:account?.quantity || 0,pendingQuantity:account?.pending_quantity ?? null,
      status:account?.subscription_status || 'not_enrolled',entitlement:entitlement(account,clock.now()),
      cancelAtPeriodEnd:Boolean(account?.cancel_at_period_end),paidThrough:account?.paid_through || null,
      pendingOperation:pending?{id:pending.id,kind:pending.kind,createdAt:pending.created_at,payload:pendingPayload}:null,
      liveChargingEnabled:false,applicationEnforcementEnabled:false};
  };
  const runCommand=async({tenantId,id,kind,payload,actorId,action})=>{
    await stripe.assertAccount();
    await requireAccount(tenantId);
    const started=await store.beginCommand({tenantId,id,kind,payload,actorId});
    try {return await store.locked(tenantId,async q=>{
      await store.assertActor(q,tenantId,actorId);
      const command=(await q('SELECT * FROM dbo.management_billing_commands WHERE id=@id',{id}))[0];
      if(command.status==='completed') {return JSON.parse(command.result_json);}
      if(command.status==='failed') {const failure=JSON.parse(command.result_json);throw problem(failure.status,failure.code,failure.error);}
      const account=await requireAccount(tenantId,q);
      const binding=JSON.parse(command.payload_json)._subscriptionId;
      if(binding && binding!==account.stripe_subscription_id)
        {throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription changed. The unfinished operation needs review.');}
      const result=await action(q,account,`quixo:${tenantId}:${id}`,!started.createdNow);
      await store.completeCommand(q,id,result);
      await store.audit(q,{tenantId,actorId,action:`sandbox.${kind}`,resourceId:id,current:result,reason:'Authenticated sandbox billing operation.'});
      return result;
    });}catch(error){
      // These checks occur before a provider write. Do not let a rejected preview or stale form
      // strand a workspace. Ambiguous provider outcomes and resumed commands remain pending.
      const noRemoteChange=new Set(['BILLING_INVENTORY_CHANGED','BILLING_SUBSCRIPTION_EXISTS','BILLING_CUSTOMER_REQUIRED',
        'BILLING_PORTAL_UNSAFE','BILLING_CANCELLATION_UNAVAILABLE','BILLING_GOOD_STANDING_REQUIRED','BILLING_INVENTORY_EMPTY',
        'BILLING_PREVIEW_REQUIRED','BILLING_PREVIEW_EXPIRED','BILLING_PREVIEW_STALE','BILLING_CESSATION_BLOCKED','BILLING_CESSATION_QUANTITY_REVIEW']);
      if(started.createdNow&&noRemoteChange.has(error.code)){await store.locked(tenantId,async q=>{
        await q(`UPDATE dbo.management_billing_commands SET status='failed',result_json=@result,completed_at=SYSUTCDATETIME()
          WHERE id=@id AND status='pending'`,{id,result:JSON.stringify({error:error.message,code:error.code,status:error.status})});
        await store.audit(q,{tenantId,actorId,action:`sandbox.${kind}.rejected`,resourceId:id,current:{code:error.code},reason:'Operation rejected before any provider write.'});
      });}
      throw error;
    }
  };
  const legacyCheckout=async({tenantId,id,actorId,inventoryHash})=>{
    const origin=configuredOrigin();
    // Validate before opening a durable command so ordinary validation failures do not block retries.
    const current=await requireAccount(tenantId);
    const inventory=await store.inventory(tenantId,undefined,{includePending:true});
    if(!inventory.length || hash(inventory)!==inventoryHash) {throw problem(409,'BILLING_INVENTORY_CHANGED','Reload the dwelling preview before continuing.');}
    await price(current.stripe_price_id);
    return runCommand({tenantId,id,actorId,kind:'checkout',payload:{inventoryHash},action:async(q,account,key)=>{
      const items=await store.inventory(tenantId,q,{includePending:true});
      if(hash(items)!==inventoryHash) {throw problem(409,'BILLING_INVENTORY_CHANGED','Inventory changed during checkout.');}
      account=await reconcileLocked(q,account);
      if(account.stripe_subscription_id) {throw problem(409,'BILLING_SUBSCRIPTION_EXISTS','This workspace already has a subscription.');}
      const existing=await q(`SELECT result_json FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND kind='checkout'
        AND status='completed' ORDER BY created_at DESC`,{tenantId});
      for(const command of existing){
        const saved=JSON.parse(command.result_json);
        const session=await stripe.request('GET',`/v1/checkout/sessions/${saved.sessionId}`);
        if(session.status==='open') {return {...saved,url:safeUrl(session.url,'checkout.stripe.com')};}
      }
      if(!account.stripe_customer_id){
        const customer=await stripe.request('POST','/v1/customers',{description:'Quixo.Homes organization sandbox subscription'},`${key}:customer`);
        account={...account,stripe_customer_id:customer.id};
        await q('UPDATE dbo.management_billing_accounts SET stripe_customer_id=@customer WHERE tenant_id=@tenantId',{tenantId,customer:customer.id});
      }
      const session=await stripe.request('POST','/v1/checkout/sessions',{
        mode:'subscription',customer:account.stripe_customer_id,line_items:[{price:account.stripe_price_id,quantity:items.length}],
        integration_identifier:'quixo_homes_management_xmptkrva',
        success_url:`${origin}/dashboard/subscription?checkout=returned`,cancel_url:`${origin}/dashboard/subscription?checkout=cancelled`,
        automatic_tax:{enabled:false},allow_promotion_codes:false,
        custom_text:{submit:{message:'Sandbox test only. Monthly management subscription, no trial. Rent and deposits are separate.'}}
      },`${key}:checkout`);
      await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory WHERE tenant_id=@tenantId',{tenantId,inventory:JSON.stringify(items)});
      return {sessionId:session.id,url:safeUrl(session.url,'checkout.stripe.com')};
    }});
  };
  const journalCommand=async(args,kind,payload,prepareRecovery,legacy)=>{
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'){return legacy(args);}
    await stripe.assertAccount();
    await store.beginCommand({...args,kind,payload,recovery:true,prepareRecovery});
    const rows=await store.read('SELECT command_id FROM dbo.management_billing_recovery WHERE command_id=@id',{id:args.id});
    if(!rows.length){return legacy(args);}
    const result=await recoverOperation(args);
    if(result.requiresNewSession||result.expired){throw problem(409,'BILLING_REVIEW_EXPIRED',result.message);}
    if(kind==='checkout'){
      const saved=(await store.read('SELECT intent_json FROM dbo.management_billing_recovery WHERE command_id=@id',{id:args.id}))[0];
      const intent=JSON.parse(saved.intent_json),account=await requireAccount(args.tenantId);
      if(hash(await store.inventory(args.tenantId,undefined,{includePending:true}))!==intent.inventoryHash){
        throw problem(409,'BILLING_INVENTORY_CHANGED','Checkout inventory changed. Review the existing checkout before continuing.');
      }
      const session=await checkoutSession(intent,result.sessionId,account.stripe_customer_id);
      if(session.status!=='open'||session.expires_at*1000<=clock.now()){
        throw problem(409,'BILLING_REVIEW_EXPIRED',session.status==='complete'?'Checkout completed. Refresh subscription status.':'Checkout expired. Open sandbox checkout again.');
      }
      return {...result,url:safeUrl(session.url,'checkout.stripe.com')};
    }
    if(kind==='portal'){
      const row=(await store.read('SELECT created_at FROM dbo.management_billing_commands WHERE id=@id',{id:args.id}))[0];
      if(!row||clock.now()-new Date(row.created_at).getTime()>300000){throw problem(409,'BILLING_REVIEW_EXPIRED','This billing link expired. Select Payment method & invoices again.');}
    }
    if(kind==='quantity_preview'&&Date.parse(result.expiresAt)<clock.now()){
      throw problem(409,'BILLING_REVIEW_EXPIRED','This quantity preview expired. Select Review quantity change again.');
    }
    return result;
  };
  const checkout=async args=>journalCommand(args,'checkout',{inventoryHash:args.inventoryHash},async(q,current)=>{
    const account=await reconcileLocked(q,current),inventory=await store.inventory(args.tenantId,q,{includePending:true});
    if(account.stripe_subscription_id){throw problem(409,'BILLING_SUBSCRIPTION_EXISTS','This workspace already has a subscription.');}
    if(!inventory.length||hash(inventory)!==args.inventoryHash){throw problem(409,'BILLING_INVENTORY_CHANGED','Reload the dwelling preview before continuing.');}
    // An earlier open session remains authoritative; never create another one.
    const previous=await q("SELECT result_json FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed'",{tenantId:args.tenantId});
    let existingSessionId=null;
    for(const row of previous){
      const saved=JSON.parse(row.result_json),session=await stripe.request('GET',`/v1/checkout/sessions/${saved.sessionId}`);
      if(session.status==='complete'){throw problem(409,'BILLING_CHECKOUT_PENDING','Refresh subscription status before starting another checkout.');}
      if(session.status==='open'){
        if(existingSessionId&&existingSessionId!==session.id){throw problem(409,'BILLING_CHECKOUT_MISMATCH','Multiple open checkouts need review.');}
        existingSessionId=session.id;
      }
    }
    await price(account.stripe_price_id);
    return {origin:configuredOrigin(),priceId:account.stripe_price_id,inventory,existingSessionId};
  },legacyCheckout);
  const portal=async args=>journalCommand(args,'portal',{},async(_q,account)=>{
    if(!account.stripe_customer_id){throw problem(409,'BILLING_CUSTOMER_REQUIRED','Start checkout before opening billing management.');}
    await assertPortalConfiguration(stripe);
    return {priceId:account.stripe_price_id,origin:configuredOrigin()};
  },legacyPortal);
  const quantityPreview=async args=>journalCommand(args,'quantity_preview',{},async(q,current)=>{
    const account=await reconcileLocked(q,current);
    if(entitlement(account,clock.now()).state!=='active'){throw problem(409,'BILLING_GOOD_STANDING_REQUIRED','Quantity changes require a paid subscription in good standing.');}
    const inventory=await store.inventory(args.tenantId,q,{includePending:true}),prorationDate=Math.floor(clock.now()/1000),target=inventory.length;
    return {priceId:account.stripe_price_id,itemId:account.stripe_item_id,preview:{previewId:args.id,inventoryHash:hash(inventory),from:account.quantity,to:target,
      prorationDate,expiresAt:new Date((prorationDate+600)*1000).toISOString(),timing:target===0?'cancel_at_renewal':target>account.quantity?'prorated_next_invoice':target<account.quantity?'next_renewal':'unchanged'}};
  },legacyQuantityPreview);
  const refresh=async tenantId=>{
    await stripe.assertAccount();
    await store.locked(tenantId,async q=>reconcileLocked(q,await requireAccount(tenantId,q)));
    return summary(tenantId);
  };
  // Read back an interrupted cancellation without replaying a provider write.
  // This remains safe after the provider's idempotency retention window. Other
  // command kinds need their own evidence; quantity equality alone is not proof
  // that the intended proration or future schedule was applied.
  const reconcileCancellation=async({tenantId,id,actorId})=>{
    await stripe.assertAccount();
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY==='true'){
      const journaled=await store.locked(tenantId,async q=>{
        await store.assertActor(q,tenantId,actorId);
        return q(`SELECT r.command_id FROM dbo.management_billing_recovery r JOIN dbo.management_billing_commands c
          ON c.id=r.command_id WHERE c.tenant_id=@tenantId AND c.id=@id`,{tenantId,id});
      });
      if(journaled.length){return recoverOperation({tenantId,id});}
    }
    return store.locked(tenantId,async q=>{
      await store.assertActor(q,tenantId,actorId);
      const command=(await q(`SELECT * FROM dbo.management_billing_commands
        WHERE id=@id AND tenant_id=@tenantId`,{id,tenantId}))[0];
      if(!command) {throw problem(404,'BILLING_COMMAND_NOT_FOUND','This billing operation was not found.');}
      if(command.status==='completed') {return JSON.parse(command.result_json);}
      if(command.status!=='pending') {throw problem(409,'BILLING_COMMAND_NOT_PENDING','This billing operation is no longer awaiting confirmation.');}
      const payload=JSON.parse(command.payload_json);
      let inventory=null;
      if(command.kind==='quantity_apply'){
        const row=(await q(`SELECT result_json FROM dbo.management_billing_commands WHERE id=@previewId AND tenant_id=@tenantId
          AND kind='quantity_preview' AND status='completed'`,{previewId:payload.previewId,tenantId}))[0];
        const preview=row?JSON.parse(row.result_json):null;
        if(!preview || preview.to!==0 || preview.timing!=='cancel_at_renewal')
          {throw problem(409,'BILLING_RECONCILIATION_REQUIRED','This quantity change needs further review. It has not been repeated.');}
        inventory=await store.inventory(tenantId,q);
        if(inventory.length || hash(inventory)!==preview.inventoryHash)
          {throw problem(409,'BILLING_INVENTORY_CHANGED','Inventory changed. The unfinished cancellation needs review.');}
      }else if(command.kind!=='cancellation' || payload.cancelAtPeriodEnd!==true){
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','This operation needs further review. It has not been repeated.');
      }
      const account=await requireAccount(tenantId,q);
      if(!account.stripe_subscription_id || payload._subscriptionId!==account.stripe_subscription_id)
        {throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription binding needs review.');}
      const confirmed=await reconcileLocked(q,account);
      if(!confirmed.cancel_at_period_end || confirmed.stripe_schedule_id || !['active','past_due'].includes(confirmed.subscription_status))
        {throw problem(409,'BILLING_CANCELLATION_UNCONFIRMED','The subscription does not confirm this period-end cancellation. The operation remains pending.');}
      if(inventory!==null) {await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=0 WHERE tenant_id=@tenantId`,
        {tenantId,inventory:JSON.stringify(inventory)});}
      else {await q('UPDATE dbo.management_billing_accounts SET pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});}
      const result=inventory===null?{cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through}:
        {currentQuantity:confirmed.quantity,nextRenewalQuantity:0,timing:'cancel_at_renewal',cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through};
      await store.completeCommand(q,id,result);
      await store.audit(q,{tenantId,actorId,action:`sandbox.${command.kind}.reconciled`,resourceId:id,current:result,
        reason:'Confirmed interrupted cancellation by provider readback; no provider write replayed.'});
      return result;
    });
  };
  const legacyPortal=async({tenantId,id,actorId})=>runCommand({tenantId,id,actorId,kind:'portal',payload:{},action:async(_q,account,key)=>{
    if(!account.stripe_customer_id) {throw problem(409,'BILLING_CUSTOMER_REQUIRED','Start checkout before opening billing management.');}
    const config=await stripe.request('GET',`/v1/billing_portal/configurations/${BILLING_PORTAL}`);
    if(!config.active || config.features?.subscription_update?.enabled || config.features?.subscription_cancel?.enabled || config.features?.subscription_pause?.enabled)
      {throw problem(409,'BILLING_PORTAL_UNSAFE','Portal subscription controls must remain disabled.');}
    const session=await stripe.request('POST','/v1/billing_portal/sessions',{
      customer:account.stripe_customer_id,configuration:BILLING_PORTAL,return_url:`${configuredOrigin()}/dashboard/subscription`
    },key);
    return {url:safeUrl(session.url,'billing.stripe.com')};
  }});
  const cancelLocked=async(q,account,key,cancelAtPeriodEnd)=>{
    const tenantId=account.tenant_id;
    account=await reconcileLocked(q,account);
    if(!account.stripe_subscription_id || !['active','past_due'].includes(account.subscription_status))
      {throw problem(409,'BILLING_CANCELLATION_UNAVAILABLE','An active subscription is required.');}
    if(!cancelAtPeriodEnd && !(await store.inventory(tenantId,q)).length) {
      throw problem(409,'BILLING_INVENTORY_EMPTY','Add managed dwellings before choosing to renew this subscription.');
    }
    if(account.stripe_schedule_id){
      if(!cancelAtPeriodEnd) {throw problem(409,'BILLING_SCHEDULE_REVIEW','This subscription already has an active renewal schedule.');}
      const schedule=await stripe.request('GET',`/v1/subscription_schedules/${account.stripe_schedule_id}`);
      if(objectId(schedule.subscription)!==account.stripe_subscription_id || objectId(schedule.customer)!==account.stripe_customer_id)
        {throw problem(409,'BILLING_SCHEDULE_MISMATCH','The quantity schedule does not belong to this subscription.');}
      // Canceling at renewal means its scheduled next-period quantity will not be billed.
      await stripe.request('POST',`/v1/subscription_schedules/${schedule.id}/release`,{preserve_cancel_date:false},`${key}:release`);
      await q('UPDATE dbo.management_billing_accounts SET pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});
    }
    await stripe.request('POST',`/v1/subscriptions/${account.stripe_subscription_id}`,{cancel_at_period_end:cancelAtPeriodEnd},key);
    const confirmed=await reconcileLocked(q,account);
    if(confirmed.cancel_at_period_end!==cancelAtPeriodEnd) {throw problem(502,'BILLING_CANCELLATION_UNCONFIRMED','Stripe has not confirmed the cancellation change.');}
    return confirmed;
  };
  const legacyCancel=async({tenantId,id,actorId,cancelAtPeriodEnd})=>runCommand({tenantId,id,actorId,kind:'cancellation',payload:{cancelAtPeriodEnd},action:async(q,account,key)=>{
    const confirmed=await cancelLocked(q,account,key,cancelAtPeriodEnd);
    return {cancelAtPeriodEnd,paidThrough:confirmed.paid_through};
  }});
  const providerRecovery=createProviderRecoveryHandlers({store,stripe,requireAccount,clock});
  const {checkoutSession}=providerRecovery;
  const recovery=createRecoveryRunner({clock,journal:createRecoveryJournal({store,complete:async(q,row,result)=>{
    const intent=JSON.parse(row.intent_json);
    const account=await requireAccount(row.tenant_id,q);
    if(['checkout','portal','quantity_preview'].includes(row.kind)){
      if(account.stripe_subscription_id!==intent._subscriptionId||account.stripe_customer_id!==intent.customerId||account.stripe_price_id!==intent.priceId){
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved billing binding changed before completion.');
      }
      if(row.kind==='checkout'){
        if(hash(await store.inventory(row.tenant_id,q,{includePending:true}))!==intent.inventoryHash){
          throw problem(409,'BILLING_INVENTORY_CHANGED','Checkout inventory changed before completion.');
        }
        const session=await checkoutSession(intent,result.sessionId,result.customerId);
        await q('UPDATE dbo.management_billing_accounts SET stripe_customer_id=@customer,inventory_json=@inventory WHERE tenant_id=@tenantId',
          {tenantId:row.tenant_id,customer:result.customerId,inventory:JSON.stringify(intent.inventory)});
        return {sessionId:result.sessionId,...(session.status==='open'&&session.expires_at*1000>clock.now()?{url:safeUrl(session.url,'checkout.stripe.com')}:
          {requiresNewSession:true,message:session.status==='complete'?'Checkout completed. Refresh subscription status.':'Checkout expired. Open sandbox checkout again.'})};
      }
      if(row.kind==='quantity_preview'&&!result.expired&&hash(await store.inventory(row.tenant_id,q,{includePending:true}))!==intent.preview.inventoryHash){
        throw problem(409,'BILLING_INVENTORY_CHANGED','The reviewed inventory changed before completion.');
      }
      return result;
    }
    if(account.stripe_subscription_id!==intent._subscriptionId){throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription binding needs review.');}
    if(row.kind==='cessation'&&intent.localOnly){
      if(account.stripe_customer_id!==intent.customerId||account.stripe_price_id!==intent.priceId){
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The saved billing binding changed before completion.');
      }
      const current=await cessationAccount(q,account);
      if(!localCessationAllowed(current,clock.now())){
        throw problem(409,'BILLING_CESSATION_STATE_CHANGED','Subscription access changed. Review ending management again.');
      }
      const ceased=await store.ceaseStockLocked(q,{tenantId:row.tenant_id,actorId:row.actor_id,id:row.id,...intent});
      const inventory=await store.inventory(row.tenant_id,q);
      if(hash(inventory)!==intent.preview.inventoryHash){throw problem(409,'BILLING_INVENTORY_CHANGED','The reviewed inventory changed before completion.');}
      await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory WHERE tenant_id=@tenantId',
        {tenantId:row.tenant_id,inventory:JSON.stringify(inventory)});
      return {managementEnded:true,propertyId:intent.propertyId,unitId:intent.unitId,
        ceasedAt:new Date(ceased.record.ceased_at).toISOString(),timing:'unchanged',billingUnchanged:true,
        currentQuantity:current.quantity,nextRenewalQuantity:current.cancel_at_period_end||['canceled','incomplete_expired'].includes(current.subscription_status)?0:current.pending_quantity??current.quantity,
        cancelAtPeriodEnd:Boolean(current.cancel_at_period_end)};
    }
    if(row.kind==='quantity_apply'||row.kind==='cessation'){
      let ceased=null;
      if(row.kind==='cessation'){
        ceased=await store.ceaseStockLocked(q,{tenantId:row.tenant_id,actorId:row.actor_id,id:row.id,...intent});
      }
      const inventory=await store.inventory(row.tenant_id,q,{includePending:row.kind==='quantity_apply'});
      if(hash(inventory)!==intent.preview.inventoryHash){throw problem(409,'BILLING_INVENTORY_CHANGED','The reviewed inventory changed before completion.');}
      const confirmed=await reconcileLocked(q,account,{promoteCheckout:false});
      if(confirmed.quantity!==result.currentQuantity||Boolean(confirmed.cancel_at_period_end)!==Boolean(intent.ending||intent.preview.to===0)){
        throw problem(409,'BILLING_QUANTITY_UNCONFIRMED','The current subscription no longer confirms this quantity operation.');
      }
      if(result.schedule){
        const schedule=await stripe.request('GET',`/v1/subscription_schedules/${result.schedule.id}`);
        if(confirmed.stripe_schedule_id!==result.schedule.id||objectId(schedule.subscription)!==intent._subscriptionId||
          objectId(schedule.customer)!==intent.customerId||schedule.livemode!==false||!quantityScheduleMatches(schedule,result.schedule.body)){
          throw problem(409,'BILLING_SCHEDULE_UNCONFIRMED','The renewal schedule changed before completion.');
        }
      }else if(confirmed.stripe_schedule_id){throw problem(409,'BILLING_SCHEDULE_UNCONFIRMED','An unexpected schedule needs review.');}
      if(inventory[0]?.stagedRecords?.length){await store.promoteStock(q,{tenantId:row.tenant_id,snapshot:inventory,commandId:row.id});}
      await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=@pending WHERE tenant_id=@tenantId`,
        {tenantId:row.tenant_id,inventory:JSON.stringify(await store.inventory(row.tenant_id,q)),pending:intent.preview.to<confirmed.quantity?intent.preview.to:null});
      return {currentQuantity:confirmed.quantity,nextRenewalQuantity:intent.preview.to,timing:intent.preview.timing,
        ...((intent.ending||intent.preview.to===0)?{cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through}:{}),
        ...(ceased?{managementEnded:true,propertyId:intent.propertyId,unitId:intent.unitId,ceasedAt:new Date(ceased.record.ceased_at).toISOString()}:{})};
    }
    const confirmed=await reconcileLocked(q,account);
    if(confirmed.cancel_at_period_end!==result.cancelAtPeriodEnd||confirmed.stripe_schedule_id){
      throw problem(409,'BILLING_CANCELLATION_UNCONFIRMED','The subscription no longer confirms this operation.');
    }
    if(intent.scheduleId){await q('UPDATE dbo.management_billing_accounts SET pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId:row.tenant_id});}
    return {cancelAtPeriodEnd:result.cancelAtPeriodEnd,paidThrough:confirmed.paid_through};
  }}),handlers:{cancellation:cancellationRecovery({store,stripe}),quantity_apply:quantityRecovery({store,stripe,clock}),
    checkout:providerRecovery.checkout,portal:providerRecovery.portal,quantity_preview:providerRecovery.quantity_preview,cessation:async args=>{
      if(args.job.intent.localOnly){return {localOnly:true};}
      if(args.job.intent.ending){return {currentQuantity:args.job.intent.preview.from,nextRenewalQuantity:0,cancelAtPeriodEnd:true};}
      return quantityRecovery({store,stripe,clock})(args);
    }}});
  const recoverOperation=async({tenantId,id})=>{
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'){throw problem(503,'BILLING_RECOVERY_UNAVAILABLE','Billing recovery is not available.');}
    return recovery.run({tenantId,id});
  };
  const cancel=async args=>{
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'){return legacyCancel(args);}
    await stripe.assertAccount();
    await store.beginCommand({...args,kind:'cancellation',payload:{cancelAtPeriodEnd:args.cancelAtPeriodEnd},recovery:true});
    const rows=await store.read('SELECT command_id FROM dbo.management_billing_recovery WHERE command_id=@id',{id:args.id});
    // Existing unjournaled requests keep their original replay/readback path.
    return rows.length?recoverOperation(args):legacyCancel(args);
  };
  const legacyQuantityPreview=async({tenantId,id,actorId})=>runCommand({tenantId,id,actorId,kind:'quantity_preview',payload:{},action:async(q,account,key)=>{
    account=await reconcileLocked(q,account);
    if(entitlement(account,clock.now()).state!=='active') {throw problem(409,'BILLING_GOOD_STANDING_REQUIRED','Quantity changes require a paid subscription in good standing.');}
    const inventory=await store.inventory(tenantId,q,{includePending:true});
    const prorationDate=Math.floor(clock.now()/1000);
    const target=inventory.length;
    let invoice=null;
    if(target>account.quantity) {invoice=await stripe.request('POST','/v1/invoices/create_preview',{
      customer:account.stripe_customer_id,subscription:account.stripe_subscription_id,
      subscription_details:{items:[{id:account.stripe_item_id,quantity:target}],proration_behavior:'create_prorations',proration_date:prorationDate}
    },key);}
    return {previewId:id,inventoryHash:hash(inventory),from:account.quantity,to:target,
      prorationDate,expiresAt:new Date((prorationDate+600)*1000).toISOString(),
      nextInvoiceTotalMinor:invoice?.total ?? null,currency:invoice?.currency || 'usd',
      timing:target===0?'cancel_at_renewal':target>account.quantity?'prorated_next_invoice':target<account.quantity?'next_renewal':'unchanged'};
  }});
  const applyQuantityLocked=async(q,{tenantId,id,account,key,resuming,preview,inventory})=>{
    account=await reconcileLocked(q,account);
    const cancellationRetry=resuming && preview.to===0 && preview.timing==='cancel_at_renewal'
      && entitlement(account,clock.now()).state==='ending';
    if((entitlement(account,clock.now()).state!=='active' && !cancellationRetry) || (account.quantity!==preview.from && !(resuming&&account.quantity===Math.max(preview.from,preview.to))))
      {throw problem(409,'BILLING_PREVIEW_STALE','The subscription changed. Request a new preview.');}
    const target=inventory.length;
    if(target===0) {
      if(preview.to!==0 || preview.timing!=='cancel_at_renewal') {
        throw problem(409,'BILLING_PREVIEW_STALE','Review the period-end cancellation before continuing.');
      }
      const confirmed=await cancelLocked(q,account,`${key}:zero-stock`,true);
      await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=0 WHERE tenant_id=@tenantId`,
        {tenantId,inventory:JSON.stringify(inventory)});
      return {currentQuantity:confirmed.quantity,nextRenewalQuantity:0,timing:'cancel_at_renewal',
        cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through};
    }
    const subscription=await stripe.request('GET',`/v1/subscriptions/${account.stripe_subscription_id}`);
    const item=subscription.items.data[0];
    if(target<preview.from || account.stripe_schedule_id){
      const schedule=account.stripe_schedule_id ? await stripe.request('GET',`/v1/subscription_schedules/${account.stripe_schedule_id}`) :
        await stripe.request('POST','/v1/subscription_schedules',{from_subscription:subscription.id},`${key}:schedule`);
      if(objectId(schedule.subscription)!==subscription.id || objectId(schedule.customer)!==account.stripe_customer_id || schedule.status!=='active')
        {throw problem(409,'BILLING_SCHEDULE_MISMATCH','The schedule does not match this organization subscription.');}
      const currentQuantity=Math.max(preview.from,target);
      await stripe.request('POST',`/v1/subscription_schedules/${schedule.id}`,{
        end_behavior:'release',proration_behavior:target>preview.from?'create_prorations':'none',
        phases:[
          {start_date:schedule.current_phase.start_date,end_date:item.current_period_end,
            items:[{price:account.stripe_price_id,quantity:currentQuantity}],proration_behavior:'none'},
          {start_date:item.current_period_end,duration:{interval:'month',interval_count:1},
            items:[{price:account.stripe_price_id,quantity:target}],proration_behavior:'none'}]
      },`${key}:phases`);
      const savedSchedule=await stripe.request('GET',`/v1/subscription_schedules/${schedule.id}`);
      const currentPhase=savedSchedule.phases?.find(phase=>phase.start_date===schedule.current_phase.start_date);
      const nextPhase=savedSchedule.phases?.find(phase=>phase.start_date===item.current_period_end);
      const matches=(phase,quantity)=>phase?.items?.length===1 &&
        objectId(phase.items[0].price)===account.stripe_price_id && phase.items[0].quantity===quantity;
      if(savedSchedule.status!=='active' || objectId(savedSchedule.subscription)!==subscription.id ||
          objectId(savedSchedule.customer)!==account.stripe_customer_id || savedSchedule.end_behavior!=='release' ||
          currentPhase?.end_date!==item.current_period_end || !matches(currentPhase,currentQuantity) || !matches(nextPhase,target)) {
        throw problem(502,'BILLING_SCHEDULE_UNCONFIRMED','Stripe has not confirmed the expected renewal quantity. Retry this operation.');
      }
    } else if(target>preview.from){
      await stripe.request('POST',`/v1/subscriptions/${subscription.id}`,{
        items:[{id:account.stripe_item_id,quantity:target}],proration_behavior:'create_prorations',proration_date:preview.prorationDate
      },`${key}:increase`);
    }
    const confirmed=await reconcileLocked(q,account);
    if(confirmed.quantity!==Math.max(preview.from,target)) {throw problem(502,'BILLING_QUANTITY_UNCONFIRMED','Stripe has not confirmed the expected current quantity.');}
    if(inventory[0]?.stagedRecords?.length){await store.promoteStock(q,{tenantId,snapshot:inventory,commandId:id});}
    await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=@pending WHERE tenant_id=@tenantId`,
      {tenantId,inventory:JSON.stringify(await store.inventory(tenantId,q)),pending:target<confirmed.quantity?target:null});
    return {currentQuantity:confirmed.quantity,nextRenewalQuantity:target,timing:preview.timing};
  };
  const legacyQuantityApply=async({tenantId,id,actorId,previewId})=>runCommand({tenantId,id,actorId,kind:'quantity_apply',payload:{previewId},action:async(q,account,key,resuming)=>{
    const row=(await q(`SELECT result_json FROM dbo.management_billing_commands WHERE id=@previewId AND tenant_id=@tenantId
      AND kind='quantity_preview' AND status='completed'`,{previewId,tenantId}))[0];
    if(!row) {throw problem(409,'BILLING_PREVIEW_REQUIRED','Review a current quantity preview first.');}
    const preview=JSON.parse(row.result_json);
    const inventory=await store.inventory(tenantId,q,{includePending:true});
    if(hash(inventory)!==preview.inventoryHash || (!resuming&&Date.parse(preview.expiresAt)<clock.now()))
      {throw problem(409,'BILLING_PREVIEW_EXPIRED','Inventory or the preview changed. Request a new preview.');}
    return applyQuantityLocked(q,{tenantId,id,account,key,resuming,preview,inventory});
  }});
  const quantityApply=async args=>{
    if(env.MANAGEMENT_RECOVERY_SCHEMA_READY!=='true'){return legacyQuantityApply(args);}
    await stripe.assertAccount();
    const {tenantId,previewId}=args;
    await store.beginCommand({...args,kind:'quantity_apply',payload:{previewId},recovery:true,prepareRecovery:async(q,current)=>{
      const row=(await q(`SELECT result_json FROM dbo.management_billing_commands WHERE id=@previewId AND tenant_id=@tenantId
        AND kind='quantity_preview' AND status='completed'`,{previewId,tenantId}))[0];
      if(!row){throw problem(409,'BILLING_PREVIEW_REQUIRED','Review a current quantity preview first.');}
      const preview=JSON.parse(row.result_json),inventory=await store.inventory(tenantId,q,{includePending:true});
      if(hash(inventory)!==preview.inventoryHash||Date.parse(preview.expiresAt)<clock.now()){
        throw problem(409,'BILLING_PREVIEW_EXPIRED','Inventory or the preview changed. Request a new preview.');
      }
      const account=await reconcileLocked(q,current,{promoteCheckout:false});
      if(entitlement(account,clock.now()).state!=='active'||account.quantity!==preview.from||inventory.length!==preview.to){
        throw problem(409,'BILLING_PREVIEW_STALE','The subscription changed. Request a new preview.');
      }
      const subscription=await stripe.request('GET',`/v1/subscriptions/${account.stripe_subscription_id}`),item=subscription.items.data[0];
      const schedule=account.stripe_schedule_id?await stripe.request('GET',`/v1/subscription_schedules/${account.stripe_schedule_id}`):null;
      const body=schedule&&preview.to>0?quantityScheduleBody({phaseStart:schedule.current_phase?.start_date,periodEnd:item.current_period_end,
        priceId:account.stripe_price_id,from:preview.from,to:preview.to}):null;
      if(schedule&&(schedule.livemode!==false||schedule.status!=='active'||objectId(schedule.subscription)!==account.stripe_subscription_id||
        objectId(schedule.customer)!==account.stripe_customer_id)){throw problem(409,'BILLING_SCHEDULE_MISMATCH','The renewal schedule needs review.');}
      return {preview,itemId:account.stripe_item_id,priceId:account.stripe_price_id,periodEnd:item.current_period_end,
        scheduleId:account.stripe_schedule_id||null,phaseStart:schedule?.current_phase?.start_date||null,
        scheduleFingerprint:schedule?scheduleFingerprint(schedule):null,preconfirmedSchedule:Boolean(body&&quantityScheduleMatches(schedule,body))};
    }});
    const rows=await store.read('SELECT command_id FROM dbo.management_billing_recovery WHERE command_id=@id',{id:args.id});
    return rows.length?recoverOperation(args):legacyQuantityApply(args);
  };
  const cessationAccount=async(q,current)=>entitlement(current,clock.now()).state==='complimentary'
    ?current:reconcileLocked(q,current,{promoteCheckout:false});
  const cessationPreview=async({tenantId,actorId,propertyId,unitId=null})=>{
    if(!store.cessationEnabled?.()){throw problem(503,'BILLING_CESSATION_UNAVAILABLE','Ending management is not available yet.');}
    await stripe.assertAccount();
    return store.locked(tenantId,async q=>{
      await store.assertActor(q,tenantId,actorId);
      const current=await requireAccount(tenantId,q);
      const account=env.MANAGEMENT_RECOVERY_SCHEMA_READY==='true'?await cessationAccount(q,current):await reconcileLocked(q,current);
      const localOnly=env.MANAGEMENT_RECOVERY_SCHEMA_READY==='true'&&localCessationAllowed(account,clock.now());
      const preview=await store.cessationPreviewLocked(q,{tenantId,actorId,propertyId,unitId});
      const items=await store.inventory(tenantId,q);
      const remaining=items.filter(item=>unitId?String(item.unitId).toLowerCase()!==unitId.toLowerCase():String(item.propertyId).toLowerCase()!==propertyId.toLowerCase());
      const blockers=[...preview.blockers];
      if(!localOnly&&!['active','ending'].includes(entitlement(account,clock.now()).state)){blockers.push({code:'SUBSCRIPTION_REVIEW',message:'Restore the paid subscription to good standing before confirming this management and billing change.',count:1});}
      const visible={...preview};delete visible.record;
      return {...visible,eligible:!blockers.length,blockers,currentBilledQuantity:account.quantity,remainingManagedDwellings:remaining.length,
        timing:localOnly?'unchanged':account.cancel_at_period_end||!remaining.length?'cancel_at_renewal':'next_renewal'};
    });
  };
  const legacyCeaseStock=async({tenantId,id,actorId,propertyId,unitId=null,inventoryHash,reason})=>{
    if(!store.cessationEnabled?.()){throw problem(503,'BILLING_CESSATION_UNAVAILABLE','Ending management is not available yet.');}
    return runCommand({tenantId,id,actorId,kind:'cessation',payload:{propertyId,unitId,inventoryHash,reason},action:async(q,account,key,resuming)=>{
      account=await reconcileLocked(q,account);
      if(!['active','ending'].includes(entitlement(account,clock.now()).state)){throw problem(409,'BILLING_GOOD_STANDING_REQUIRED','Restore the paid subscription to good standing before confirming this management and billing change.');}
      const result=await store.ceaseStockLocked(q,{tenantId,actorId,id,propertyId,unitId,inventoryHash,reason});
      const inventory=await store.inventory(tenantId,q);
      if(inventory.length>account.quantity){throw problem(409,'BILLING_CESSATION_QUANTITY_REVIEW','Review the existing inventory and billed quantity before ending management. No stock or subscription change was saved.');}
      let billing;
      if(result.alreadyCeased||account.cancel_at_period_end){
        await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory WHERE tenant_id=@tenantId',{tenantId,inventory:JSON.stringify(inventory)});
        if(account.cancel_at_period_end){await q('UPDATE dbo.management_billing_accounts SET pending_quantity=0 WHERE tenant_id=@tenantId',{tenantId});}
        billing={currentQuantity:account.quantity,nextRenewalQuantity:account.cancel_at_period_end?0:account.pending_quantity??account.quantity,
          cancelAtPeriodEnd:Boolean(account.cancel_at_period_end)};
      }else{
        const preview={from:account.quantity,to:inventory.length,timing:inventory.length?'next_renewal':'cancel_at_renewal'};
        billing=await applyQuantityLocked(q,{tenantId,id,account,key,resuming,preview,inventory});
      }
      return {...billing,managementEnded:true,propertyId,unitId,ceasedAt:new Date(result.record.ceased_at).toISOString()};
    }});
  };
  const ceaseStock=async args=>{
    if(!store.cessationEnabled?.()){throw problem(503,'BILLING_CESSATION_UNAVAILABLE','Ending management is not available yet.');}
    const {propertyId,unitId=null,inventoryHash,reason}=args;
    return journalCommand(args,'cessation',{propertyId,unitId,inventoryHash,reason},async(q,current)=>{
      const account=await cessationAccount(q,current);
      const localOnly=localCessationAllowed(account,clock.now());
      if(!localOnly&&!['active','ending'].includes(entitlement(account,clock.now()).state)){throw problem(409,'BILLING_GOOD_STANDING_REQUIRED','Restore the paid subscription before ending management.');}
      const checked=await store.cessationPreviewLocked(q,{tenantId:args.tenantId,actorId:args.actorId,commandId:args.id,propertyId,unitId});
      if(checked.alreadyCeased||!checked.eligible||checked.inventoryHash!==inventoryHash){throw problem(409,'BILLING_CESSATION_BLOCKED','The reviewed management change needs review.');}
      const inventory=await store.inventory(args.tenantId,q),remaining=inventory.filter(item=>unitId?String(item.unitId).toLowerCase()!==unitId.toLowerCase():String(item.propertyId).toLowerCase()!==propertyId.toLowerCase());
      if(localOnly){return {localOnly:true,priceId:account.stripe_price_id,preview:{inventoryHash:hash(remaining),to:remaining.length,timing:'unchanged'}};}
      if(remaining.length>account.quantity){throw problem(409,'BILLING_CESSATION_QUANTITY_REVIEW','Review the managed inventory and billed quantity before ending management.');}
      const sub=await stripe.request('GET',`/v1/subscriptions/${account.stripe_subscription_id}`),item=sub.items.data[0];
      const schedule=account.stripe_schedule_id?await stripe.request('GET',`/v1/subscription_schedules/${account.stripe_schedule_id}`):null;
      if(schedule&&(schedule.livemode!==false||schedule.status!=='active'||objectId(schedule.subscription)!==account.stripe_subscription_id||objectId(schedule.customer)!==account.stripe_customer_id)){
        throw problem(409,'BILLING_SCHEDULE_MISMATCH','The renewal schedule needs review.');
      }
      const target=account.cancel_at_period_end?0:remaining.length;
      const body=schedule&&target?quantityScheduleBody({phaseStart:schedule.current_phase?.start_date,periodEnd:item.current_period_end,priceId:account.stripe_price_id,from:account.quantity,to:target}):null;
      return {ending:Boolean(account.cancel_at_period_end),priceId:account.stripe_price_id,itemId:account.stripe_item_id,periodEnd:item.current_period_end,
        scheduleId:account.stripe_schedule_id||null,phaseStart:schedule?.current_phase?.start_date||null,scheduleFingerprint:schedule?scheduleFingerprint(schedule):null,
        preconfirmedSchedule:Boolean(body&&quantityScheduleMatches(schedule,body)),
        preview:{from:account.quantity,to:target,inventoryHash:hash(remaining),timing:target?'next_renewal':'cancel_at_renewal'}};
    },legacyCeaseStock);
  };
  const webhook=async event=>{
    await stripe.assertAccount();
    const supported=/^(checkout\.session\.(completed|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_failed)|charge\.(refunded|dispute\.created)|radar\.early_fraud_warning\.created)$/;
    if(!supported.test(event.type)) {return {received:true,ignored:true};}
    // Retrieve using the configured account as well as verifying the signed payload.
    const verified=await stripe.request('GET',`/v1/events/${event.id}`);
    if(verified.type!==event.type || verified.livemode!==false) {throw problem(400,'BILLING_EVENT_MISMATCH','Unexpected Stripe event.');}
    let object=verified.data.object;
    const risk=/^(charge\.(refunded|dispute\.created)|radar\.)/.test(event.type);
    if(risk && object.object!=='charge') {object=await stripe.request('GET',`/v1/charges/${objectId(object.charge)}`);}
    const customerId=objectId(object.customer);
    const rows=customerId?await store.read('SELECT tenant_id FROM dbo.management_billing_accounts WHERE stripe_customer_id=@customerId',{customerId}):[];
    if(!rows.length) {throw problem(409,'BILLING_EVENT_UNBOUND','The Stripe event has no stored organization binding yet.');}
    const tenantId=rows[0].tenant_id;
    return store.locked(tenantId,async q=>{
      if((await q('SELECT stripe_event_id FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:event.id})).length)
        {return {received:true,duplicate:true};}
      let account=await requireAccount(tenantId,q);
      account=await reconcileLocked(q,account,{promoteCheckout:!risk});
      const targetSubscription=object.object==='subscription'?object.id:object.object==='invoice'?invoiceSubscription(object):object.object==='checkout.session'?objectId(object.subscription):null;
      if(!risk && (!account.stripe_subscription_id || targetSubscription!==account.stripe_subscription_id))
        {throw problem(409,'BILLING_EVENT_SUBSCRIPTION_MISMATCH','The event subscription is not bound to this organization.');}
      if(risk) {await q('UPDATE dbo.management_billing_accounts SET risk_hold=1,version=version+1 WHERE tenant_id=@tenantId',{tenantId});}
      await q('INSERT INTO dbo.management_billing_events(stripe_event_id,tenant_id,event_type) VALUES(@id,@tenantId,@type)',{id:event.id,tenantId,type:event.type});
      await store.audit(q,{tenantId,action:'stripe.event_reconciled',resourceId:event.id,current:{status:account.subscription_status,risk},reason:event.type});
      return {received:true};
    });
  };
  return {summary,checkout,refresh,reconcileCancellation,portal,cancel,recoverOperation,quantityPreview,quantityApply,cessationPreview,ceaseStock,webhook,price};
};
