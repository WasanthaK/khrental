import {BILLING_ACCOUNT, entitlement, hash, problem} from './contract.js';
import {invoiceSubscription, objectId, subscriptionProjection} from './stripe.js';

export const endedSubscription = status => ['canceled', 'incomplete_expired'].includes(status);
const unavailable = () => problem(503, 'BILLING_BALANCE_UNAVAILABLE',
  'We could not verify all previous subscription dues. Try again before restarting.');

// This customer belongs to one workspace. Include earlier subscriptions on the
// same customer, including finalized invoices marked uncollectible.
export async function reactivationDues(stripe, account) {
  const customerId = account.stripe_customer_id;
  if (!customerId || account.stripe_account_id !== BILLING_ACCOUNT) {throw unavailable();}
  const customer = await stripe.request('GET', '/v1/customers/' + customerId, {expand: ['invoice_credit_balance']});
  if (customer.id !== customerId || customer.livemode !== false || customer.deleted ||
      !Number.isSafeInteger(customer.balance) || !customer.invoice_credit_balance ||
      typeof customer.invoice_credit_balance !== 'object' || Array.isArray(customer.invoice_credit_balance)) {
    throw unavailable();
  }
  const balances = new Map();
  const add = (currency, amount) => {
    if (!/^[a-z]{3}$/.test(currency) || !Number.isSafeInteger(amount)) {throw unavailable();}
    if (amount <= 0) {return;}
    const total = (balances.get(currency) || 0) + amount;
    if (!Number.isSafeInteger(total)) {throw unavailable();}
    balances.set(currency, total);
  };
  for (const [currency, amount] of Object.entries(customer.invoice_credit_balance)) {add(currency, amount);}
  // Stripe's legacy balance is for the customer's default currency. It is
  // another view of the same balance, not an additional debt.
  if (customer.balance > 0) {
    if (!customer.currency) {throw unavailable();}
    const byCurrency = customer.invoice_credit_balance[customer.currency];
    if (byCurrency === undefined) {add(customer.currency, customer.balance);}
    else if (byCurrency !== customer.balance) {throw unavailable();}
  }
  const seen = new Set();
  for (const status of ['open', 'uncollectible']) {
    let cursor;
    for (;;) {
      const params = {customer: customerId, status, limit: 100};
      if (cursor) {params.starting_after = cursor;}
      const page = await stripe.request('GET', '/v1/invoices', params);
      if (!Array.isArray(page.data) || typeof page.has_more !== 'boolean' || (page.has_more && !page.data.length)) {
        throw unavailable();
      }
      for (const invoice of page.data) {
        if (invoice.object !== 'invoice' || invoice.livemode !== false || objectId(invoice.customer) !== customerId ||
            invoice.status !== status || typeof invoice.id !== 'string' || !invoice.id || seen.has(invoice.id) ||
            !Number.isSafeInteger(invoice.amount_remaining) || invoice.amount_remaining < 0) {throw unavailable();}
        seen.add(invoice.id);
        add(invoice.currency, invoice.amount_remaining);
      }
      if (!page.has_more) {break;}
      cursor = page.data.at(-1).id;
    }
  }
  return Array.from(balances, ([currency, amountMinor]) => ({currency, amountMinor}));
}

export async function requireSettledDues(stripe, account) {
  const dues = await reactivationDues(stripe, account);
  if (dues.length) {
    throw problem(409, 'BILLING_REACTIVATION_DUES',
      'Settle all outstanding management subscription dues before starting a new paid period.');
  }
}

const review = message => problem(409, 'BILLING_REACTIVATION_REVIEW', message);

export function requireEndedAccount(account, now) {
  if (!account || account.market !== 'LK' || account.stripe_account_id !== BILLING_ACCOUNT ||
      !account.stripe_subscription_id || !account.stripe_customer_id ||
      !endedSubscription(account.subscription_status) || account.risk_hold || entitlement(account, now).state === 'complimentary') {
    throw review('Review the current subscription before starting a new paid period.');
  }
}

export async function checkPriorSubscription(stripe, account, now) {
  requireEndedAccount(account, now);
  const sub = await stripe.request('GET', '/v1/subscriptions/' + account.stripe_subscription_id);
  if (sub.id !== account.stripe_subscription_id || objectId(sub.customer) !== account.stripe_customer_id ||
      sub.livemode !== false || !endedSubscription(sub.status)) {
    throw review('The previous subscription must have ended before starting a new one.');
  }
}

// Stripe may deliver the new payment webhook before the browser returns. Both
// entry points acquire the same workspace lock and select the same durable intent.
export function restartCommands(q, account) {
  return q(`SELECT c.id, c.result_json, r.actor_id, r.intent_json
    FROM dbo.management_billing_commands c
    JOIN dbo.management_billing_recovery r ON r.command_id=c.id
    WHERE c.tenant_id=@tenantId AND c.kind='reactivation' AND c.status='completed'
      AND JSON_VALUE(r.intent_json,'$._subscriptionId')=@prior
    ORDER BY c.created_at DESC`, {tenantId:account.tenant_id, prior:account.stripe_subscription_id});
}

export async function restartInventory(store, q, tenantId, controlId) {
  if (!controlId) {return {items:await store.inventory(tenantId, q, {includePending:true}), control:null};}
  const controls = await store.ceasedStock(tenantId, q);
  const control = controls.find(c => String(c.id).toLowerCase() === controlId);
  if (!control || (control.unitId && controls.some(c => !c.unitId && c.propertyId === control.propertyId))) {
    throw review('Review the retained dwelling before starting a new period.');
  }
  if ((await store.pendingStock(tenantId, q)).length) {
    throw review('Resolve the prepared additions before restarting with a retained dwelling.');
  }
  const items = await store.inventory(tenantId, q, {restoreControlIds:[controlId]});
  const current = await store.inventory(tenantId, q);
  if (items.length <= current.length) {throw review('The selected dwelling cannot be restored in this review.');}
  return {items, control};
}

// An ended workspace may still have several historical subscriptions. Refuse
// a second subscription if the customer has a current or incomplete one.
export async function requireNoOtherSubscription(stripe, account, allowedId = null, now) {
  await checkPriorSubscription(stripe, account, now);
  const seen = new Set();
  let cursor;
  for (;;) {
    const params = {customer:account.stripe_customer_id, status:'all', limit:100};
    if (cursor) {params.starting_after = cursor;}
    const page = await stripe.request('GET', '/v1/subscriptions', params);
    if (!Array.isArray(page.data) || typeof page.has_more !== 'boolean' || (page.has_more && !page.data.length)) {throw unavailable();}
    for (const sub of page.data) {
      if (sub.object !== 'subscription' || sub.livemode !== false || objectId(sub.customer) !== account.stripe_customer_id ||
          !sub.id || seen.has(sub.id)) {throw unavailable();}
      if (!endedSubscription(sub.status) && sub.id !== allowedId) {throw review('A subscription is already in progress. Refresh billing before restarting.');}
      seen.add(sub.id);
    }
    if (!page.has_more) {break;}
    cursor = page.data.at(-1).id;
  }
  if (!seen.has(account.stripe_subscription_id) || (allowedId && !seen.has(allowedId))) {throw unavailable();}
}

export function createReactivation({store, stripe, clock, priceForAccount, origin, checkoutSession,
  loadInvoice, saveProjection, runRecovery, checkoutUrl}) {
  const ready = () => {
    if (!store.recoveryEnabled?.()) {throw review('Subscription reactivation is unavailable for this workspace.');}
  };
  const plan = async (q, account, controlId) => {
    await checkPriorSubscription(stripe, account, clock.now());
    const {items,control} = await restartInventory(store, q, account.tenant_id, controlId);
    const price = await priceForAccount(account, q);
    const amount = price.unit_amount * items.length;
    if (price.id !== account.stripe_price_id || !Number.isSafeInteger(amount)) {throw review('The new period amount could not be verified.');}
    const inventoryHash = hash(items);
    const reviewHash = hash([account.tenant_id.toLowerCase(), account.stripe_subscription_id, account.stripe_customer_id,
      price.id, price.currency, price.unit_amount, controlId, inventoryHash]);
    return {controlId, control, items, inventoryHash, reviewHash, price, amount};
  };
  const existingSession = async (q, account) => {
    let current = null;
    for (const row of await restartCommands(q, account)) {
      const intent = JSON.parse(row.intent_json);
      const session = await checkoutSession(intent, JSON.parse(row.result_json).sessionId, account.stripe_customer_id);
      if (session.status === 'expired') {continue;}
      if (!['open','complete'].includes(session.status)) {throw review('The checkout sessions need reconciliation.');}
      if (session.status === 'complete' && session.payment_status === 'unpaid' && objectId(session.subscription)) {
        const failed = await stripe.request('GET','/v1/subscriptions/' + objectId(session.subscription));
        if (failed.id === objectId(session.subscription) && failed.livemode === false &&
            objectId(failed.customer) === account.stripe_customer_id && failed.status === 'incomplete_expired') {continue;}
      }
      if (current) {throw review('Multiple restart sessions need reconciliation.');}
      current = {row, intent, session};
    }
    return current;
  };
  const reviewRestart = async ({tenantId, actorId, controlId=null}) => {
    ready(); await stripe.assertAccount();
    return store.locked(tenantId, async q => {
      await store.assertActor(q, tenantId, actorId);
      const account = await store.account(tenantId, q);
      requireEndedAccount(account, clock.now());
      const prepared = await plan(q, account, controlId);
      const dues = await reactivationDues(stripe, account);
      const current = await existingSession(q, account);
      return {controlId, label:prepared.control?.label, reviewHash:prepared.reviewHash, quantity:prepared.items.length,
        currency:prepared.price.currency, amountMinor:prepared.amount, dues,
        awaitingPaymentConfirmation:current?.session.status === 'complete'};
    });
  };
  const start = async args => {
    ready(); await stripe.assertAccount();
    const {tenantId, actorId, controlId=null, reviewHash} = args;
    let id = args.id;
    // Reopen a valid hosted session after a reload or a lost browser response.
    const reusable = await store.locked(tenantId, async q => {
      await store.assertActor(q, tenantId, actorId);
      const account = await store.account(tenantId,q);
      const prepared = await plan(q, account, controlId);
      if (prepared.reviewHash !== reviewHash) {throw review('The reviewed dwellings or price changed. Review again.');}
      await requireSettledDues(stripe, account);
      const current = await existingSession(q, account);
      if (current && (current.intent.reviewHash !== reviewHash || current.session.status !== 'open')) {
        throw review('Another restart is awaiting confirmation. Refresh the subscription status.');
      }
      return current?.row.id;
    });
    if (reusable) {id = reusable;}
    await store.beginCommand({tenantId, actorId, id, kind:'reactivation', payload:{controlId,reviewHash}, recovery:true,
      prepareRecovery:async(q, account) => {
        const prepared = await plan(q, account, controlId);
        if (!prepared.items.length || prepared.reviewHash !== reviewHash) {throw review('Review at least one dwelling at the current price.');}
        await requireSettledDues(stripe, account);
        await requireNoOtherSubscription(stripe, account, null, clock.now());
        if (await existingSession(q,account)) {throw review('A restart is already in progress. Reopen the existing review.');}
        return {origin:origin(), priceId:prepared.price.id, currency:prepared.price.currency, amountMinor:prepared.amount,
          inventory:prepared.items, inventoryHash:prepared.inventoryHash, previousItemId:account.stripe_item_id,
          previousPricingVersionId:account.pricing_version_id};
      }});
    const result = await runRecovery({tenantId,id});
    return store.locked(tenantId,async q => {
      await store.assertActor(q,tenantId,actorId);
      const account = await store.account(tenantId,q);
      const prepared = await plan(q,account,controlId);
      if (prepared.reviewHash !== reviewHash) {throw review('The reviewed inventory changed.');}
      await requireSettledDues(stripe, account);
      await requireNoOtherSubscription(stripe, account, null, clock.now());
      const session = await checkoutSession({priceId:prepared.price.id,inventory:prepared.items},result.sessionId,account.stripe_customer_id);
      if (session.status !== 'open' || session.expires_at * 1000 <= clock.now()) {throw review('Refresh the subscription status and review again.');}
      return {url:checkoutUrl(session.url)};
    });
  };
  const reconcile = async (q, account) => {
    const current = await existingSession(q, account);
    if (!current || current.session.status !== 'complete' || current.session.payment_status !== 'paid') {return null;}
    const {intent, row, session} = current;
    const subscriptionId = objectId(session.subscription);
    if (!subscriptionId || subscriptionId === account.stripe_subscription_id || account.risk_hold ||
        String(session.metadata?.quixo_operation).toLowerCase() !== String(row.id).toLowerCase() ||
        String(session.metadata?.quixo_tenant).toLowerCase() !== account.tenant_id.toLowerCase() ||
        session.metadata?.inventory_hash !== intent.inventoryHash) {throw review('The new payment requires reconciliation.');}
    await store.assertActor(q, account.tenant_id,row.actor_id);
    const {items,control} = await restartInventory(store,q,account.tenant_id,intent.controlId);
    if (hash(items) !== intent.inventoryHash || intent.priceId !== account.stripe_price_id ||
        session.currency !== intent.currency || session.amount_subtotal !== intent.amountMinor) {throw review('The paid checkout does not match the reviewed dwellings and price.');}
    await requireSettledDues(stripe, account);
    await requireNoOtherSubscription(stripe, account, subscriptionId, clock.now());
    const sub = await stripe.request('GET','/v1/subscriptions/'+subscriptionId);
    const invoiceId = objectId(session.invoice) || objectId(sub.latest_invoice);
    if (!invoiceId || sub.status !== 'active') {return null;}
    const invoice = await loadInvoice(invoiceId);
    const line = invoice.lines?.data?.[0], item = sub.items?.data?.[0];
    if (invoice.id !== invoiceId || invoice.billing_reason !== 'subscription_create' ||
        invoiceSubscription(invoice) !== subscriptionId || invoice.currency !== intent.currency ||
        invoice.lines?.data?.length !== 1 || invoice.subtotal !== intent.amountMinor || invoice.total !== intent.amountMinor ||
        line.amount !== intent.amountMinor || line.quantity !== items.length ||
        item?.quantity !== items.length || !Number.isSafeInteger(line.period?.start) ||
        line.period.start < session.created || !Number.isSafeInteger(session.created)) {
      throw review('The new invoice does not confirm the reviewed period and amount.');
    }
    const candidate = {...account, stripe_subscription_id:subscriptionId, initial_payment_verified:false,
      paid_through:null, grace_started_at:null, pending_quantity:null};
    const projection = subscriptionProjection({subscription:sub, invoice, account:candidate, now:clock.now()});
    if (!projection.initial_payment_verified || !entitlement({...candidate,...projection},clock.now()).management ||
        !Number.isFinite(Date.parse(projection.paid_through)) || Date.parse(projection.paid_through) <= clock.now()) {return null;}
    await q(`UPDATE dbo.management_billing_accounts SET stripe_subscription_id=@newId,pending_quantity=NULL,
      inventory_json=@inventory WHERE tenant_id=@tenantId AND stripe_subscription_id=@oldId`,
      {tenantId:account.tenant_id,oldId:account.stripe_subscription_id,newId:subscriptionId,inventory:JSON.stringify(items)});
    await saveProjection(q, account.tenant_id, projection);
    if (control) {
      const previous = await store.inventory(account.tenant_id,q);
      await store.restoreStockLocked(q,{tenantId:account.tenant_id,actorId:row.actor_id,id:row.id,controlId:intent.controlId,
        propertyId:control.propertyId,unitId:control.unitId,inventoryHash:hash(previous),reason:'Administrator confirmed this dwelling for the new paid period.'});
    } else if (items[0]?.stagedRecords?.length) {
      await store.promoteStock(q,{tenantId:account.tenant_id,snapshot:items,commandId:row.id});
      await q('UPDATE dbo.management_billing_accounts SET inventory_json=@inventory WHERE tenant_id=@tenantId',
        {tenantId:account.tenant_id,inventory:JSON.stringify(await store.inventory(account.tenant_id,q))});
    }
    await store.audit(q,{tenantId:account.tenant_id,actorId:row.actor_id,action:'sandbox.reactivation.paid',
      resourceId:row.id,current:{subscriptionId,invoiceId},reason:'The prior dues and the first invoice of the new period were settled.'});
    return {...candidate,...projection};
  };
  return {reviewRestart,start,reconcile};
}
