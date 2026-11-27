import assert from 'node:assert/strict';
import {createBillingStore} from '/app/src/api/managementBilling/store.js';
import {createStripeClient, objectId} from '/app/src/api/managementBilling/stripe.js';
import {closeMssqlPool} from '/app/src/api/mssql/pool.js';

const operation = process.env.R5_PAID_CESSATION_OPERATION;
const allowedOperations = new Set(['9a7430ca-4bb8-44b0-9226-1475c1dbfb1f', '46f51bf9-b6f9-4052-a4b9-1471f98a0599']);
const store = createBillingStore();
const stripe = createStripeClient();
const read = (path, params) => stripe.request('GET', path, params);
const params = {tenantId: operation, slug: 'r5-paid-stock-' + operation};
let stage = 'sandbox_account';
try {
  assert.ok(allowedOperations.has(operation));
  await stripe.assertAccount();
  stage = 'exact_fixture_sql';
  const [fixture] = await store.read('SELECT status FROM dbo.tenants WHERE id=@tenantId AND slug=@slug', params);
  const [binding] = await store.read(`SELECT stripe_customer_id,stripe_subscription_id,subscription_status
    FROM dbo.management_billing_accounts WHERE tenant_id=@tenantId`, params);
  const [counts] = await store.read(`SELECT
    (SELECT COUNT(*) FROM dbo.tenants WHERE id=@tenantId OR slug=@slug) AS tenantMatches,
    (SELECT COUNT(*) FROM dbo.app_users WHERE tenant_id=@tenantId AND (status IS NULL OR status<>'inactive')) AS remainingUsers,
    (SELECT COUNT(*) FROM dbo.tenant_memberships WHERE tenant_id=@tenantId AND status='active') AS activeMemberships,
    (SELECT COUNT(*) FROM dbo.properties WHERE tenant_id=@tenantId AND (status IS NULL OR status<>'inactive')) AS remainingProperties,
    (SELECT COUNT(*) FROM dbo.public_listing_preferences WHERE tenant_id=@tenantId AND opted_out=0) AS optedInListings,
    (SELECT COUNT(*) FROM dbo.management_billing_commands WHERE tenant_id=@tenantId) AS commands,
    (SELECT COUNT(*) FROM dbo.management_billing_audit WHERE tenant_id=@tenantId) AS audits`, params);
  assert.equal(counts.tenantMatches, Number(Boolean(fixture)));

  stage = 'exact_sandbox_customer';
  const search = await read('/v1/customers/search', {query: "metadata['acceptance_fixture']:'" + operation + "'", limit: 10});
  assert.ok(Array.isArray(search.data) && search.has_more === false);
  const customers = new Set(search.data.map(customer => {
    assert.equal(customer.livemode, false);
    assert.equal(customer.metadata?.acceptance_fixture, operation);
    return customer.id;
  }));
  if (binding?.stripe_customer_id) {
    const customer = await read('/v1/customers/' + binding.stripe_customer_id);
    assert.equal(customer.livemode, false);
    assert.equal(customer.metadata?.acceptance_fixture, operation);
    customers.add(customer.id);
  }
  stage = 'exact_sandbox_subscription';
  const seen = new Map();
  for (const customer of customers) {
    const subscriptions = await read('/v1/subscriptions', {customer, status: 'all', limit: 100});
    assert.ok(Array.isArray(subscriptions.data) && subscriptions.has_more === false);
    for (const sub of subscriptions.data) {
      assert.equal(sub.livemode, false);
      assert.equal(objectId(sub.customer), customer);
      assert.equal(sub.metadata?.acceptance_fixture, operation);
      seen.set(sub.id, sub.status);
    }
  }
  console.log('R5_PAID_CESSATION_READONLY='+JSON.stringify({
    operation, inspectOnly: true, fixtureStatus: fixture?.status ?? null, ...counts,
    boundStatus: binding?.subscription_status ?? null, customers: customers.size,
    subscriptions: seen.size, uncanceledSubscriptions: [...seen.values()].filter(status => status !== 'canceled').length,
    boundSubscriptionFound: Boolean(binding?.stripe_subscription_id && seen.has(binding.stripe_subscription_id))
  }));
} catch (error) {
  console.error('R5_PAID_CESSATION_READONLY_FAILED='+JSON.stringify({stage, sqlNumber: Number.isInteger(error.number) ? error.number : null}));
  process.exitCode = 1;
} finally {
  await closeMssqlPool();
}
