import assert from 'node:assert/strict';
import {createHmac, randomUUID} from 'node:crypto';
import {once} from 'node:events';
import express from 'express';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';
import {createManagementBillingRouter, createManagementBillingWebhook} from '../src/api/managementBilling/router.js';

export async function verifyLocalRenewal({store, q, tenantId, versionId, laterIssuer, provider, issuerMarket='LK'}) {
  const customer = provider?.customer ?? 'cus_fixtureLK';
  const subscription = provider?.subscription ?? 'sub_fixtureLK';
  const item = provider?.item ?? 'si_fixtureLK';
  const price = provider?.price ?? 'price_fixtureLK';
  await q(`INSERT dbo.management_billing_accounts
    (tenant_id,stripe_account_id,stripe_customer_id,stripe_subscription_id,stripe_item_id,
     stripe_price_id,pricing_version_id,market,inventory_json)
    VALUES (@tenantId,@account,@customer,@subscription,@item,@price,@versionId,'LK','[]')`,
  {tenantId, account: BILLING_ACCOUNT, customer, subscription, item, price, versionId});

  const invoice = provider?.invoice ?? {
    object: 'invoice', id: 'in_fixtureLK', livemode: false, billing_reason: 'subscription_cycle',
    subscription, customer, currency: 'lkr', status: 'draft', created: Math.floor(Date.now() / 1000),
    lines: {has_more: false, data: [{currency: 'lkr', quantity: 6, amount: 60000,
      parent: {subscription_item_details: {subscription_item: item, proration: false}},
      pricing: {price_details: {price}}}]}
  };
  const event = provider?.event ?? {id: 'evt_fixtureLK', type: 'invoice.created', livemode: false, data: {object: structuredClone(invoice)}};
  let writes = 0;
  const stripe = provider?.stripe ?? {
    configured: () => true,
    assertAccount: async () => BILLING_ACCOUNT,
    async request(method, path, body, key) {
      if (method === 'GET' && path === '/v1/events/' + event.id) { return structuredClone(event); }
      if (method === 'GET' && path === '/v1/invoices/' + invoice.id) { return structuredClone(invoice); }
      assert.equal(method, 'POST');
      assert.equal(path, '/v1/invoiceitems');
      assert.equal(key, 'quixo-lk-renewal-' + invoice.id);
      assert.deepEqual([body.customer, body.invoice, body.currency, body.amount], [customer, invoice.id, 'lkr', 150002]);
      writes++;
      invoice.lines.data.push({...body, parent: {type: 'invoice_item_details'}});
      throw Object.assign(new Error('Synthetic lost response'), {status: 503, code: 'FIXTURE_RESPONSE_LOST'});
    }
  };
  // The outer SQL fixture owns the transaction and rolls back account, issuer and journal changes.
  const fixtureStore = {...store, read: q, account: id => store.account(id, q), locked: (_id, action) => action(q)};
  const env = {MANAGEMENT_BILLING_SCHEMA_READY: 'true', MANAGEMENT_LK_SANDBOX_INVOICE_TENANT: tenantId,
    MANAGEMENT_LK_SANDBOX_ISSUER_MARKET: issuerMarket,
    STRIPE_SANDBOX_WEBHOOK_SECRET: randomUUID()};
  const app = express();
  app.use('/events', createManagementBillingWebhook({env, store: fixtureStore, stripe}));
  const owner = randomUUID();
  let role = 'admin';
  app.use('/billing', createManagementBillingRouter({env, store: fixtureStore, stripe,
    resolveContext(req, _res, next) {
      Object.assign(req, {tenantId, authSession: {}, user: {id: owner}, membership: {tenant_id: tenantId, status: 'active', role}});
      next();
    }
  }));
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const origin = 'http://127.0.0.1:' + server.address().port;
    const body = JSON.stringify(event);
    const time = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', env.STRIPE_SANDBOX_WEBHOOK_SECRET).update(time + '.' + body).digest('hex');
    const deliver = () => fetch(origin + '/events', {method: 'POST', body,
      headers: {'Content-Type': 'application/json', 'Stripe-Signature': 't=' + time + ',v1=' + signature}});
    const receipt = () => fetch(origin + '/billing/invoices/' + invoice.id + '/local-fee');
    if (!provider) {assert.equal((await (await deliver()).json()).code, 'FIXTURE_RESPONSE_LOST');}
    assert.equal((await deliver()).status, 200);
    assert.equal((await (await deliver()).json()).data.duplicate, true);
    if (!provider) {assert.equal(writes, 1);}
    assert.equal((await (await receipt()).json()).code, 'BILLING_LOCAL_INVOICE_REVIEW');
    if (provider) {
      const issued = await provider.finalize();
      assert.deepEqual([issued.id, issued.livemode, issued.currency, issued.status, issued.total],
        [invoice.id, false, 'lkr', 'open', 210002]);
      assert.equal(issued.lines.has_more, false);
      assert.equal(issued.lines.data.filter(line => line.metadata?.quixo_fee === 'lk_recurring_fee_v1').length, 1);
      assert.ok(issued.hosted_invoice_url && issued.invoice_pdf);
    } else {
      invoice.status = 'open';
      invoice.status_transitions = {finalized_at: invoice.created + 1};
    }
    const before = (await (await receipt()).json()).data;
    assert.equal(before.issuer.legalName, 'Quixo Inc.');
    assert.equal(before.issuer.country, 'US');
    assert.equal(before.monthlyFeeMinor, 210002);
    await laterIssuer(new Date((invoice.created + 1) * 1000));
    assert.deepEqual((await (await receipt()).json()).data, before);
    role = 'viewer';
    assert.equal((await receipt()).status, 403);
    if (provider) {
      console.log('R5_LKR_REAL_PROVIDER_INVOICE=PASS sandbox LKR 210002 minor units, one adjustment on replay, finalized invoice links, historical owner route after issuer cutover and viewer denial');
    } else {
      role = 'admin';
      invoice.customer = 'cus_other';
      assert.equal((await receipt()).status, 404);
      console.log('PASS: signed synthetic renewal replay, one LKR adjustment, historical owner HTTP receipt after issuer cutover, role and customer isolation');
    }
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}
