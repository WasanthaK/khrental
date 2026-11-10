import {BILLING_PORTAL, BILLING_PRODUCT, entitlement, hash, problem} from './contract.js';
import {firstRenewalFailure, invoiceSubscription, objectId, subscriptionProjection} from './stripe.js';

const safeUrl = (value, host) => {
  const url = new URL(value);
  if(url.protocol !== 'https:' || url.hostname !== host || url.username || url.password)
    throw problem(502,'BILLING_URL_INVALID','Stripe returned an unexpected hosted URL.');
  return url.href;
};
export const createBillingService = ({store,stripe,env=process.env}) => {
  const configuredOrigin=()=>{
    let url;
    try {url=new URL(env.PUBLIC_APP_URL || env.PASSWORD_RESET_BASE_URL);} catch {throw problem(503,'BILLING_ORIGIN_REQUIRED','The application return URL is not configured.');}
    if(url.protocol!=='https:' || url.username || url.password || url.pathname!=='/' || url.search || url.hash)
      throw problem(503,'BILLING_ORIGIN_REQUIRED','Use the application HTTPS origin for billing returns.');
    return url.origin;
  };
  const requireAccount=async(tenantId,q)=>{
    const account=await store.account(tenantId,q);
    if(!account) throw problem(409,'BILLING_NOT_ENROLLED','A platform administrator must enroll this test workspace first.');
    return account;
  };
  const price=async id=>{
    const result=await stripe.request('GET',`/v1/prices/${id}`);
    if(!result.active || result.livemode!==false || objectId(result.product)!==BILLING_PRODUCT || result.type!=='recurring' ||
      result.billing_scheme!=='per_unit' || result.recurring?.interval!=='month' || result.recurring.interval_count!==1 ||
      result.recurring.usage_type!=='licensed' || result.recurring.trial_period_days || result.currency!=='usd' ||
      !Number.isSafeInteger(result.unit_amount) || result.unit_amount<1 || result.transform_quantity)
      throw problem(409,'BILLING_PRICE_MISMATCH','The selected sandbox price does not match the approved monthly contract.');
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
      if(!page.data?.length || lines.length>=10000) throw problem(409,'BILLING_INVOICE_REVIEW','Invoice lines could not be fully reconciled.');
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
          throw problem(409,'BILLING_CHECKOUT_MISMATCH','Checkout ownership needs reconciliation.');
        if(session.status==='complete' && objectId(session.subscription)){
          account={...account,stripe_subscription_id:objectId(session.subscription)};
          await q('UPDATE dbo.management_billing_accounts SET stripe_subscription_id=@subscriptionId WHERE tenant_id=@tenantId',
            {tenantId:account.tenant_id,subscriptionId:account.stripe_subscription_id});
          break;
        }
      }
    }
    if(!account.stripe_subscription_id) return account;
    const subscription=await stripe.request('GET',`/v1/subscriptions/${account.stripe_subscription_id}`);
    const invoiceId=objectId(subscription.latest_invoice);
    const invoice=invoiceId?await loadInvoice(invoiceId):null;
    const firstFailureAt=subscription.status==='past_due' && invoice?.status==='open' && invoice.attempted===true && account.initial_payment_verified
      ? await firstRenewalFailure({stripe,invoice,account}) : null;
    const projection=subscriptionProjection({subscription,invoice,account,firstFailureAt});
    await saveProjection(q,account.tenant_id,projection);
    const snapshot=JSON.parse(account.inventory_json||'[]');
    if(promoteCheckout&&snapshot[0]?.stagedRecords?.length&&projection.initial_payment_verified&&
      entitlement({...account,...projection}).management){
      const rows=await q(`SELECT id,result_json FROM dbo.management_billing_commands
        WHERE tenant_id=@tenantId AND kind='checkout' AND status='completed' ORDER BY created_at DESC`,{tenantId:account.tenant_id});
      let matched=null;
      for(const row of rows){
        const session=await stripe.request('GET',`/v1/checkout/sessions/${JSON.parse(row.result_json).sessionId}`);
        if(session.livemode===false&&session.mode==='subscription'&&session.status==='complete'&&
          objectId(session.customer)===account.stripe_customer_id&&objectId(session.subscription)===account.stripe_subscription_id){matched=row;break;}
      }
      if(!matched)throw problem(409,'BILLING_STOCK_CONFIRMATION','The prepared stock needs a matching completed checkout.');
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
    if(pendingPayload) delete pendingPayload._subscriptionId;
    return {mode:'sandbox',configured:stripe.configured(),enrolled:Boolean(account),inventory,
      inventoryHash:hash(proposedInventory),inventoryQuantity:inventory.length,proposedInventoryQuantity:proposedInventory.length,
      stagingEnabled:Boolean(store.stagingEnabled?.()),pendingStock:staged.map(row=>({id:row.id,kind:row.kind,
        label:JSON.parse(row.payload_json)[row.kind==='property'?'name':'unitnumber']})),
      billedQuantity:account?.quantity || 0,pendingQuantity:account?.pending_quantity ?? null,
      status:account?.subscription_status || 'not_enrolled',entitlement:entitlement(account),
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
      if(command.status==='completed') return JSON.parse(command.result_json);
      if(command.status==='failed') {const failure=JSON.parse(command.result_json);throw problem(failure.status,failure.code,failure.error);}
      const account=await requireAccount(tenantId,q);
      const binding=JSON.parse(command.payload_json)._subscriptionId;
      if(binding && binding!==account.stripe_subscription_id)
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription changed. The unfinished operation needs review.');
      const result=await action(q,account,`quixo:${tenantId}:${id}`,!started.createdNow);
      await store.completeCommand(q,id,result);
      await store.audit(q,{tenantId,actorId,action:`sandbox.${kind}`,resourceId:id,current:result,reason:'Authenticated sandbox billing operation.'});
      return result;
    });}catch(error){
      // These checks occur before a provider write. Do not let a rejected preview or stale form
      // strand a workspace. Ambiguous provider outcomes and resumed commands remain pending.
      const noRemoteChange=new Set(['BILLING_INVENTORY_CHANGED','BILLING_SUBSCRIPTION_EXISTS','BILLING_CUSTOMER_REQUIRED',
        'BILLING_PORTAL_UNSAFE','BILLING_CANCELLATION_UNAVAILABLE','BILLING_GOOD_STANDING_REQUIRED','BILLING_INVENTORY_EMPTY',
        'BILLING_PREVIEW_REQUIRED','BILLING_PREVIEW_EXPIRED','BILLING_PREVIEW_STALE']);
      if(started.createdNow&&noRemoteChange.has(error.code))await store.locked(tenantId,async q=>{
        await q(`UPDATE dbo.management_billing_commands SET status='failed',result_json=@result,completed_at=SYSUTCDATETIME()
          WHERE id=@id AND status='pending'`,{id,result:JSON.stringify({error:error.message,code:error.code,status:error.status})});
        await store.audit(q,{tenantId,actorId,action:`sandbox.${kind}.rejected`,resourceId:id,current:{code:error.code},reason:'Operation rejected before any provider write.'});
      });
      throw error;
    }
  };
  const checkout=async({tenantId,id,actorId,inventoryHash})=>{
    const origin=configuredOrigin();
    // Validate before opening a durable command so ordinary validation failures do not block retries.
    const current=await requireAccount(tenantId);
    const inventory=await store.inventory(tenantId,undefined,{includePending:true});
    if(!inventory.length || hash(inventory)!==inventoryHash) throw problem(409,'BILLING_INVENTORY_CHANGED','Reload the dwelling preview before continuing.');
    await price(current.stripe_price_id);
    return runCommand({tenantId,id,actorId,kind:'checkout',payload:{inventoryHash},action:async(q,account,key)=>{
      const items=await store.inventory(tenantId,q,{includePending:true});
      if(hash(items)!==inventoryHash) throw problem(409,'BILLING_INVENTORY_CHANGED','Inventory changed during checkout.');
      account=await reconcileLocked(q,account);
      if(account.stripe_subscription_id) throw problem(409,'BILLING_SUBSCRIPTION_EXISTS','This workspace already has a subscription.');
      const existing=await q(`SELECT result_json FROM dbo.management_billing_commands WHERE tenant_id=@tenantId AND kind='checkout'
        AND status='completed' ORDER BY created_at DESC`,{tenantId});
      for(const command of existing){
        const saved=JSON.parse(command.result_json);
        const session=await stripe.request('GET',`/v1/checkout/sessions/${saved.sessionId}`);
        if(session.status==='open') return {...saved,url:safeUrl(session.url,'checkout.stripe.com')};
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
    return store.locked(tenantId,async q=>{
      await store.assertActor(q,tenantId,actorId);
      const command=(await q(`SELECT * FROM dbo.management_billing_commands
        WHERE id=@id AND tenant_id=@tenantId`,{id,tenantId}))[0];
      if(!command) throw problem(404,'BILLING_COMMAND_NOT_FOUND','This billing operation was not found.');
      if(command.status==='completed') return JSON.parse(command.result_json);
      if(command.status!=='pending') throw problem(409,'BILLING_COMMAND_NOT_PENDING','This billing operation is no longer awaiting confirmation.');
      const payload=JSON.parse(command.payload_json);
      let inventory=null;
      if(command.kind==='quantity_apply'){
        const row=(await q(`SELECT result_json FROM dbo.management_billing_commands WHERE id=@previewId AND tenant_id=@tenantId
          AND kind='quantity_preview' AND status='completed'`,{previewId:payload.previewId,tenantId}))[0];
        const preview=row?JSON.parse(row.result_json):null;
        if(!preview || preview.to!==0 || preview.timing!=='cancel_at_renewal')
          throw problem(409,'BILLING_RECONCILIATION_REQUIRED','This quantity change needs further review. It has not been repeated.');
        inventory=await store.inventory(tenantId,q);
        if(inventory.length || hash(inventory)!==preview.inventoryHash)
          throw problem(409,'BILLING_INVENTORY_CHANGED','Inventory changed. The unfinished cancellation needs review.');
      }else if(command.kind!=='cancellation' || payload.cancelAtPeriodEnd!==true){
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','This operation needs further review. It has not been repeated.');
      }
      const account=await requireAccount(tenantId,q);
      if(!account.stripe_subscription_id || payload._subscriptionId!==account.stripe_subscription_id)
        throw problem(409,'BILLING_RECONCILIATION_REQUIRED','The subscription binding needs review.');
      const confirmed=await reconcileLocked(q,account);
      if(!confirmed.cancel_at_period_end || confirmed.stripe_schedule_id || !['active','past_due'].includes(confirmed.subscription_status))
        throw problem(409,'BILLING_CANCELLATION_UNCONFIRMED','The subscription does not confirm this period-end cancellation. The operation remains pending.');
      if(inventory!==null) await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=0 WHERE tenant_id=@tenantId`,
        {tenantId,inventory:JSON.stringify(inventory)});
      else await q('UPDATE dbo.management_billing_accounts SET pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});
      const result=inventory===null?{cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through}:
        {currentQuantity:confirmed.quantity,nextRenewalQuantity:0,timing:'cancel_at_renewal',cancelAtPeriodEnd:true,paidThrough:confirmed.paid_through};
      await store.completeCommand(q,id,result);
      await store.audit(q,{tenantId,actorId,action:`sandbox.${command.kind}.reconciled`,resourceId:id,current:result,
        reason:'Confirmed interrupted cancellation by provider readback; no provider write replayed.'});
      return result;
    });
  };
  const portal=async({tenantId,id,actorId})=>runCommand({tenantId,id,actorId,kind:'portal',payload:{},action:async(_q,account,key)=>{
    if(!account.stripe_customer_id) throw problem(409,'BILLING_CUSTOMER_REQUIRED','Start checkout before opening billing management.');
    const config=await stripe.request('GET',`/v1/billing_portal/configurations/${BILLING_PORTAL}`);
    if(!config.active || config.features?.subscription_update?.enabled || config.features?.subscription_cancel?.enabled || config.features?.subscription_pause?.enabled)
      throw problem(409,'BILLING_PORTAL_UNSAFE','Portal subscription controls must remain disabled.');
    const session=await stripe.request('POST','/v1/billing_portal/sessions',{
      customer:account.stripe_customer_id,configuration:BILLING_PORTAL,return_url:`${configuredOrigin()}/dashboard/subscription`
    },key);
    return {url:safeUrl(session.url,'billing.stripe.com')};
  }});
  const cancelLocked=async(q,account,key,cancelAtPeriodEnd)=>{
    const tenantId=account.tenant_id;
    account=await reconcileLocked(q,account);
    if(!account.stripe_subscription_id || !['active','past_due'].includes(account.subscription_status))
      throw problem(409,'BILLING_CANCELLATION_UNAVAILABLE','An active subscription is required.');
    if(!cancelAtPeriodEnd && !(await store.inventory(tenantId,q)).length) {
      throw problem(409,'BILLING_INVENTORY_EMPTY','Add managed dwellings before choosing to renew this subscription.');
    }
    if(account.stripe_schedule_id){
      if(!cancelAtPeriodEnd) throw problem(409,'BILLING_SCHEDULE_REVIEW','This subscription already has an active renewal schedule.');
      const schedule=await stripe.request('GET',`/v1/subscription_schedules/${account.stripe_schedule_id}`);
      if(objectId(schedule.subscription)!==account.stripe_subscription_id || objectId(schedule.customer)!==account.stripe_customer_id)
        throw problem(409,'BILLING_SCHEDULE_MISMATCH','The quantity schedule does not belong to this subscription.');
      // Canceling at renewal means its scheduled next-period quantity will not be billed.
      await stripe.request('POST',`/v1/subscription_schedules/${schedule.id}/release`,{preserve_cancel_date:false},`${key}:release`);
      await q('UPDATE dbo.management_billing_accounts SET pending_quantity=NULL WHERE tenant_id=@tenantId',{tenantId});
    }
    await stripe.request('POST',`/v1/subscriptions/${account.stripe_subscription_id}`,{cancel_at_period_end:cancelAtPeriodEnd},key);
    const confirmed=await reconcileLocked(q,account);
    if(confirmed.cancel_at_period_end!==cancelAtPeriodEnd) throw problem(502,'BILLING_CANCELLATION_UNCONFIRMED','Stripe has not confirmed the cancellation change.');
    return confirmed;
  };
  const cancel=async({tenantId,id,actorId,cancelAtPeriodEnd})=>runCommand({tenantId,id,actorId,kind:'cancellation',payload:{cancelAtPeriodEnd},action:async(q,account,key)=>{
    const confirmed=await cancelLocked(q,account,key,cancelAtPeriodEnd);
    return {cancelAtPeriodEnd,paidThrough:confirmed.paid_through};
  }});
  const quantityPreview=async({tenantId,id,actorId})=>runCommand({tenantId,id,actorId,kind:'quantity_preview',payload:{},action:async(q,account,key)=>{
    account=await reconcileLocked(q,account);
    if(entitlement(account).state!=='active') throw problem(409,'BILLING_GOOD_STANDING_REQUIRED','Quantity changes require a paid subscription in good standing.');
    const inventory=await store.inventory(tenantId,q,{includePending:true});
    const prorationDate=Math.floor(Date.now()/1000);
    const target=inventory.length;
    let invoice=null;
    if(target>account.quantity) invoice=await stripe.request('POST','/v1/invoices/create_preview',{
      customer:account.stripe_customer_id,subscription:account.stripe_subscription_id,
      subscription_details:{items:[{id:account.stripe_item_id,quantity:target}],proration_behavior:'create_prorations',proration_date:prorationDate}
    },key);
    return {previewId:id,inventoryHash:hash(inventory),from:account.quantity,to:target,
      prorationDate,expiresAt:new Date((prorationDate+600)*1000).toISOString(),
      nextInvoiceTotalMinor:invoice?.total ?? null,currency:invoice?.currency || 'usd',
      timing:target===0?'cancel_at_renewal':target>account.quantity?'prorated_next_invoice':target<account.quantity?'next_renewal':'unchanged'};
  }});
  const quantityApply=async({tenantId,id,actorId,previewId})=>runCommand({tenantId,id,actorId,kind:'quantity_apply',payload:{previewId},action:async(q,account,key,resuming)=>{
    const row=(await q(`SELECT result_json FROM dbo.management_billing_commands WHERE id=@previewId AND tenant_id=@tenantId
      AND kind='quantity_preview' AND status='completed'`,{previewId,tenantId}))[0];
    if(!row) throw problem(409,'BILLING_PREVIEW_REQUIRED','Review a current quantity preview first.');
    const preview=JSON.parse(row.result_json);
    const inventory=await store.inventory(tenantId,q,{includePending:true});
    if(hash(inventory)!==preview.inventoryHash || (!resuming&&Date.parse(preview.expiresAt)<Date.now()))
      throw problem(409,'BILLING_PREVIEW_EXPIRED','Inventory or the preview changed. Request a new preview.');
    account=await reconcileLocked(q,account);
    const cancellationRetry=resuming && preview.to===0 && preview.timing==='cancel_at_renewal'
      && entitlement(account).state==='ending';
    if((entitlement(account).state!=='active' && !cancellationRetry) || (account.quantity!==preview.from && !(resuming&&account.quantity===Math.max(preview.from,preview.to))))
      throw problem(409,'BILLING_PREVIEW_STALE','The subscription changed. Request a new preview.');
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
        throw problem(409,'BILLING_SCHEDULE_MISMATCH','The schedule does not match this organization subscription.');
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
    if(confirmed.quantity!==Math.max(preview.from,target)) throw problem(502,'BILLING_QUANTITY_UNCONFIRMED','Stripe has not confirmed the expected current quantity.');
    if(inventory[0]?.stagedRecords?.length)await store.promoteStock(q,{tenantId,snapshot:inventory,commandId:id});
    await q(`UPDATE dbo.management_billing_accounts SET inventory_json=@inventory,pending_quantity=@pending WHERE tenant_id=@tenantId`,
      {tenantId,inventory:JSON.stringify(await store.inventory(tenantId,q)),pending:target<confirmed.quantity?target:null});
    return {currentQuantity:confirmed.quantity,nextRenewalQuantity:target,timing:preview.timing};
  }});
  const webhook=async event=>{
    await stripe.assertAccount();
    const supported=/^(checkout\.session\.(completed|async_payment_succeeded|async_payment_failed)|customer\.subscription\.(created|updated|deleted)|invoice\.(paid|payment_failed)|charge\.(refunded|dispute\.created)|radar\.early_fraud_warning\.created)$/;
    if(!supported.test(event.type)) return {received:true,ignored:true};
    // Retrieve using the configured account as well as verifying the signed payload.
    const verified=await stripe.request('GET',`/v1/events/${event.id}`);
    if(verified.type!==event.type || verified.livemode!==false) throw problem(400,'BILLING_EVENT_MISMATCH','Unexpected Stripe event.');
    let object=verified.data.object;
    const risk=/^(charge\.(refunded|dispute\.created)|radar\.)/.test(event.type);
    if(risk && object.object!=='charge') object=await stripe.request('GET',`/v1/charges/${objectId(object.charge)}`);
    const customerId=objectId(object.customer);
    const rows=customerId?await store.read('SELECT tenant_id FROM dbo.management_billing_accounts WHERE stripe_customer_id=@customerId',{customerId}):[];
    if(!rows.length) throw problem(409,'BILLING_EVENT_UNBOUND','The Stripe event has no stored organization binding yet.');
    const tenantId=rows[0].tenant_id;
    return store.locked(tenantId,async q=>{
      if((await q('SELECT stripe_event_id FROM dbo.management_billing_events WHERE stripe_event_id=@id',{id:event.id})).length)
        return {received:true,duplicate:true};
      let account=await requireAccount(tenantId,q);
      account=await reconcileLocked(q,account,{promoteCheckout:!risk});
      const targetSubscription=object.object==='subscription'?object.id:object.object==='invoice'?invoiceSubscription(object):object.object==='checkout.session'?objectId(object.subscription):null;
      if(!risk && (!account.stripe_subscription_id || targetSubscription!==account.stripe_subscription_id))
        throw problem(409,'BILLING_EVENT_SUBSCRIPTION_MISMATCH','The event subscription is not bound to this organization.');
      if(risk) await q('UPDATE dbo.management_billing_accounts SET risk_hold=1,version=version+1 WHERE tenant_id=@tenantId',{tenantId});
      await q('INSERT INTO dbo.management_billing_events(stripe_event_id,tenant_id,event_type) VALUES(@id,@tenantId,@type)',{id:event.id,tenantId,type:event.type});
      await store.audit(q,{tenantId,action:'stripe.event_reconciled',resourceId:event.id,current:{status:account.subscription_status,risk},reason:event.type});
      return {received:true};
    });
  };
  return {summary,checkout,refresh,reconcileCancellation,portal,cancel,quantityPreview,quantityApply,webhook,price};
};
