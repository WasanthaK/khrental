import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {BILLING_ACCOUNT, BILLING_PRODUCT} from '../src/api/managementBilling/contract.js';
import {createStripeClient, invoiceSubscription, objectId} from '../src/api/managementBilling/stripe.js';

export async function withSandboxLkrCycle(operation, verify) {
  assert.match(operation, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  const stripe = createStripeClient({env: {
    MANAGEMENT_BILLING_SANDBOX_ENABLED: 'true',
    STRIPE_SANDBOX_ACCOUNT_ID: BILLING_ACCOUNT,
    STRIPE_SANDBOX_SECRET_KEY: process.env.STRIPE_SANDBOX_SECRET_KEY
  }});
  await stripe.assertAccount();
  const label = 'R5 synthetic LKR renewal ' + operation;
  const read = (path, body) => stripe.request('GET', '/v1/' + path, body);
  const write = (path, body, step, method = 'POST') =>
    stripe.request(method, '/v1/' + path, body, 'r5-lkr:' + operation + ':' + step);
  const startedAt = Math.floor(Date.now() / 1000);
  let clock, price, customer, subscription;
  const attempt = {clock: false, price: false};
  let phase = 'clock';
  try {
    attempt.clock = true;
    clock = await write('test_helpers/test_clocks', {name: label, frozen_time: startedAt}, 'clock');
    assert.equal(clock.name, label);
    assert.equal(clock.status, 'ready');
    phase = 'price';
    attempt.price = true;
    price = await write('prices', {product: BILLING_PRODUCT, unit_amount: 10000, currency: 'lkr',
      recurring: {interval: 'month'}, nickname: label, metadata: {acceptance_fixture: operation}}, 'price');
    assert.equal(price.livemode, false);
    assert.equal(price.metadata.acceptance_fixture, operation);
    phase = 'subscription';
    customer = await write('customers', {description: label, test_clock: clock.id,
      payment_method: 'pm_card_visa', invoice_settings: {default_payment_method: 'pm_card_visa'},
      metadata: {acceptance_fixture: operation}}, 'customer');
    assert.equal(customer.metadata.acceptance_fixture, operation);
    assert.equal(objectId(customer.test_clock), clock.id);
    subscription = await write('subscriptions', {customer: customer.id, items: [{price: price.id, quantity: 6}],
      default_payment_method: objectId(customer.invoice_settings.default_payment_method),
      payment_behavior: 'error_if_incomplete', metadata: {acceptance_fixture: operation}}, 'subscription');
    assert.equal(subscription.metadata.acceptance_fixture, operation);
    assert.equal(objectId(subscription.test_clock), clock.id);
    assert.equal(subscription.status, 'active');
    const initial = await read('invoices/' + objectId(subscription.latest_invoice));
    assert.deepEqual([initial.billing_reason, initial.status, initial.currency, initial.amount_paid],
      ['subscription_create', 'paid', 'lkr', 60000]);
    const [item] = subscription.items.data;
    assert.equal(objectId(item.price), price.id);
    phase = 'advance_clock';
    const boundary = item.current_period_end;
    assert.ok(Number.isSafeInteger(boundary) && boundary > startedAt);
    await write('test_helpers/test_clocks/' + clock.id + '/advance', {frozen_time: boundary}, 'advance');
    const clockPath = 'test_helpers/test_clocks/' + clock.id;
    let current;
    for (let check = 0; check < 60; check++) {
      current = await read(clockPath);
      if (current.status !== 'advancing') {break;}
      await delay(1000);
    }
    assert.deepEqual([current.name, current.status, current.frozen_time], [label, 'ready', boundary]);
    phase = 'find_renewal';
    const invoices = await read('invoices', {customer: customer.id, subscription: subscription.id, limit: 10});
    assert.equal(invoices.has_more, false);
    const renewal = invoices.data.filter(invoice => invoice.billing_reason === 'subscription_cycle');
    assert.equal(renewal.length, 1);
    const [invoice] = renewal;
    assert.deepEqual([invoice.currency, invoice.status, invoice.total], ['lkr', 'draft', 60000]);
    assert.equal(invoiceSubscription(invoice), subscription.id);
    const event = await findInvoiceCreated(read, invoice.id, startedAt);
    phase = 'verify_mounted_invoice';
    await verify({
      stripe, event, invoice, price: price.id, customer: customer.id, subscription: subscription.id, item: item.id,
      finalize: () => write('invoices/' + invoice.id + '/finalize', {auto_advance: false}, 'finalize')
    });
  } catch (error) {
    console.log('R5_LKR_PROVIDER_FAILURE='+JSON.stringify({operation, phase, code:error.code ?? 'ASSERTION'}));
    throw error;
  } finally {
    const cleanup = await Promise.allSettled([
      (async () => {
        if (!attempt.clock) {return;}
        assert.ok(clock?.id, 'Clock creation requires reconciliation by fixture label');
        assert.equal((await read('test_helpers/test_clocks/' + clock.id)).name, label);
        if (subscription?.id) {
          const bound = await read('subscriptions/' + subscription.id);
          assert.equal(bound.metadata.acceptance_fixture, operation);
          assert.equal(objectId(bound.test_clock), clock.id);
          if (bound.status !== 'canceled') {
            const canceled = await write('subscriptions/' + bound.id, {invoice_now: false, prorate: false}, 'cancel', 'DELETE');
            assert.equal(canceled.status, 'canceled');
          }
        }
        const deleted = await write('test_helpers/test_clocks/' + clock.id, {}, 'delete-clock', 'DELETE');
        assert.equal(deleted.deleted, true);
      })(),
      (async () => {
        if (!attempt.price) {return;}
        assert.ok(price?.id, 'Price creation requires reconciliation by fixture metadata');
        const published = await read('prices/' + price.id);
        assert.equal(published.metadata.acceptance_fixture, operation);
        await write('prices/' + price.id, {active: false}, 'archive-price');
        assert.equal((await read('prices/' + price.id)).active, false);
      })()
    ]);
    const [clockCleanup, priceCleanup] = cleanup.map(result => result.status === 'fulfilled');
    console.log('R5_LKR_PROVIDER_CLEANUP='+JSON.stringify({operation, clockCleanup, priceCleanup}));
    assert.ok(clockCleanup && priceCleanup, 'Sandbox fixture cleanup requires reconciliation');
  }
}

async function findInvoiceCreated(read, invoiceId, startedAt) {
  // Provider events are timestamped in wall time even when the invoice uses simulated time.
  for (let poll = 0; poll < 8; poll++) {
    let startingAfter;
    for (let page = 0; page < 5; page++) {
      const events = await read('events', {type: 'invoice.created', created: {gte: startedAt - 10}, limit: 100,
        starting_after: startingAfter});
      const event = events.data.find(candidate => candidate.data?.object?.id === invoiceId);
      if (event) {
        assert.equal(event.livemode, false);
        return event;
      }
      if (!events.has_more) {break;}
      startingAfter = events.data.at(-1)?.id;
      assert.ok(startingAfter);
    }
    await delay(2000);
  }
  assert.fail('No invoice.created event matched the isolated renewal invoice');
}
