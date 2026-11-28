import assert from 'node:assert/strict';
import test from 'node:test';
import {fixtureFailure, mutableIssuerIds, readIssuerCleanupFixture, reconciledOperation, verifyResidueCounts, verifyRetainedIssuer} from '../scripts/lk-issuer-cleanup-fixture.mjs';
import {BILLING_ACCOUNT} from '../src/api/managementBilling/contract.js';

const operation = '11111111-2222-4333-8444-555555555555';

function fixtureReader({status = 'active', cancellation = false, sharedIssuer = false, initialEffective = false, enquiries = 0} = {}) {
  const label = 'R5 synthetic deployed issuer cutover ' + operation;
  const email = `r5-issuer-${operation}@example.invalid`;
  const rows = {
    tenants: [{id:operation,name:label,slug:'r5-issuer-'+operation,status:'active',plan:'development-testing'}],
    app_users: [{id:'actor',tenant_id:operation,name:label,email,user_type:'admin',status:'active'}],
    tenant_memberships: [{app_user_id:'actor',role:'viewer',status:'active',is_default:true}],
    properties: [{id:'property',name:'R5 synthetic LKR 100000 dwelling',status:'rented',propertytype:'house',country_code:'LK'}],
    public_listing_preferences: [{public_id:'preference',tenant_id:operation,property_id:'property',country_code:'LK',
      updated_by:null,location_label:null,public_headline:null,opted_out:false,opted_out_at:null,media_count:0,enquiry_count:enquiries}],
    agreements: [{propertyid:'property',status:'active',rentamount:100000}],
    management_billing_accounts: [{stripe_account_id:BILLING_ACCOUNT,market:'LK',subscription_status:status,initial_payment_verified:true,quantity:1}],
    auth_users: [{app_user_id:'actor',email}],
    management_market_issuer_assignments: [
      {id:'initial-assignment',effective_utc:'2026-11-28T00:00:00',effective:Number(initialEffective),issuer_id:'initial',approval_reference:'R5 row 32 isolated synthetic schedule',legal_name:'R5 Synthetic Initial Issuer',country_code:'US'},
      {id:'later-assignment',effective_utc:'2026-12-28T00:00:00',effective:0,issuer_id:'later',approval_reference:'R5 row 32 isolated later synthetic assignment',legal_name:'R5 Synthetic Later Issuer',country_code:'LK'},
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
    if (sql.includes('FROM dbo.public_listing_preferences p')) {
      assert.equal(params.id, operation);
      assert.equal(params.property, 'property');
      return rows.public_listing_preferences;
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
    [{enquiries:1}, 'fixture.preference.children'],
  ]) {
    await assert.rejects(readIssuerCleanupFixture(fixtureReader(options), operation), error => fixtureFailure(error) === expected);
  }
  assert.equal(fixtureFailure(new Error('private driver detail')), 'query_or_internal_error');
});

test('reports the database effective-date classification for each validated synthetic issuer', async () => {
  const result = await readIssuerCleanupFixture(fixtureReader({initialEffective:true}), operation);
  assert.deepEqual(result.issuerHistory.map(row => [row.assignmentId,row.historical]),
    [['initial-assignment',true],['later-assignment',false]]);
  assert.equal(result.preferenceId, 'preference');
});

test('only the exact recorded fixture may remove the future schedule and preserve history', async () => {
  const history = [
    {assignmentId:'4a1aa809-e3ea-4c74-9c63-c18c7494d994',issuerId:'30f19aad-923c-44c5-993b-6980dbfec67a',
      effectiveUtc:'2026-11-28T00:01:57.7000000',historical:true},
    {assignmentId:'abdc3aa1-ef6f-4fa9-bb9c-6e487bc6bc88',issuerId:'7744c522-545e-4373-9ba5-305c338fb227',
      effectiveUtc:'2026-12-27T18:01:54',historical:false},
  ];
  assert.deepEqual(mutableIssuerIds(reconciledOperation,history,true),[history[1].issuerId]);
  assert.throws(()=>mutableIssuerIds(reconciledOperation,history,false));
  assert.throws(()=>mutableIssuerIds(operation,history,true));
  assert.throws(()=>mutableIssuerIds(reconciledOperation,[history[0],{...history[1],historical:true}],true));
  verifyResidueCounts({assignments:1,issuers:1,users:0},true);
  assert.throws(()=>verifyResidueCounts({assignments:1,issuers:1,users:1},true));
  assert.throws(()=>verifyResidueCounts({assignments:1,issuers:1,users:0},false));
  await assert.rejects(verifyRetainedIssuer(async()=>[],reconciledOperation));
  const retained=await verifyRetainedIssuer(async(sql,params)=>{
    assert.equal(params.assignment,history[0].assignmentId);
    assert.equal(params.issuer,history[0].issuerId);
    assert.match(sql,/other.issuer_id=i.id AND other.id<>a.id/);
    return [{effective_utc:history[0].effectiveUtc}];
  },reconciledOperation);
  assert.deepEqual(retained,history[0]);
});
