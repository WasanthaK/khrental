import assert from 'node:assert/strict';
import test from 'node:test';
import {fixtureFailure, readIssuerCleanupFixture} from '../scripts/lk-issuer-cleanup-fixture.mjs';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';

const operation = '11111111-2222-4333-8444-555555555555';

function fixtureReader({status = 'active', cancellation = false, sharedIssuer = false} = {}) {
  const label = 'R5 synthetic deployed issuer cutover ' + operation;
  const email = `r5-issuer-${operation}@example.invalid`;
  const rows = {
    tenants: [{id:operation,name:label,slug:'r5-issuer-'+operation,status:'active',plan:'development-testing'}],
    app_users: [{id:'actor',tenant_id:operation,name:label,email,user_type:'admin',status:'active'}],
    tenant_memberships: [{app_user_id:'actor',role:'viewer',status:'active',is_default:true}],
    properties: [{id:'property',name:'R5 synthetic LKR 100000 dwelling',status:'rented',propertytype:'house',country_code:'LK'}],
    agreements: [{propertyid:'property',status:'active',rentamount:100000}],
    management_billing_accounts: [{stripe_account_id:BILLING_ACCOUNT,market:'LK',subscription_status:status,initial_payment_verified:true,quantity:1}],
    auth_users: [{app_user_id:'actor',email}],
    management_market_issuer_assignments: [
      {issuer_id:'initial',approval_reference:'R5 row 32 isolated synthetic schedule',legal_name:'R5 Synthetic Initial Issuer',country_code:'US'},
      {issuer_id:'later',approval_reference:'R5 row 32 isolated later synthetic assignment',legal_name:'R5 Synthetic Later Issuer',country_code:'LK'},
    ],
  };
  return async (sql, params) => {
    assert.match(sql, /^SELECT /);
    if (sql.includes('FROM dbo.management_billing_events')) {
      assert.match(sql, /a.tenant_id=e.tenant_id AND a.resource_id=e.stripe_event_id/);
      assert.match(sql, /e.tenant_id=@id AND e.event_type='customer.subscription.deleted'/);
      assert.match(sql, /a.action='stripe.event_reconciled' AND a.reason=e.event_type/);
      assert.equal(params.id, operation);
      return cancellation ? [{stripe_event_id:'fixture-event'}] : [];
    }
    if (sql.includes("market<>'XZ'")) {
      return sharedIssuer ? [{id:'shared'}] : [];
    }
    return rows[sql.match(/FROM dbo\.(\w+)/)[1]];
  };
}

test('identifies the active fixture and its verified canceled projection', async () => {
  for (const status of ['active','canceled']) {
    const result = await readIssuerCleanupFixture(fixtureReader({status,cancellation:status==='canceled'}), operation);
    assert.equal(result.subscriptionStatus, status);
    assert.deepEqual(result.issuerIds, ['initial','later']);
  }
});

test('rejects unconfirmed cancellation, unexpected subscription state, and shared issuers', async () => {
  for (const [options, expected] of [
    [{status:'canceled'}, 'fixture.account.cancellation'],
    [{status:'past_due', cancellation:true}, 'fixture.account.status'],
    [{sharedIssuer:true}, 'fixture.issuer.foreign'],
  ]) {
    await assert.rejects(readIssuerCleanupFixture(fixtureReader(options), operation), error => fixtureFailure(error) === expected);
  }
  assert.equal(fixtureFailure(new Error('private driver detail')), 'query_or_internal_error');
});
