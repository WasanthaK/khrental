import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {inspectManagementBilling} from './inspect-management-billing-schema.mjs';
import {createBillingStore} from '../src/api/managementBilling/store.js';

export const verifyManagementBilling=async pool=>{
  const sql=fs.readFileSync('migrations/20261103_01_management_billing.sql','utf8');
  await pool.request().batch(sql);await pool.request().batch(sql);
  let result=await inspectManagementBilling(pool);assert.equal(result.satisfied,true,result.detail);
  await pool.request().query('ALTER TABLE dbo.management_billing_accounts NOCHECK CONSTRAINT CK_management_billing_sandbox');
  assert.equal((await inspectManagementBilling(pool)).satisfied,false);
  await pool.request().query('ALTER TABLE dbo.management_billing_accounts WITH CHECK CHECK CONSTRAINT CK_management_billing_sandbox');
  // Use the existing disposable migration proof actors, never production records.
  const actor=(await pool.request().query('SELECT TOP 1 id FROM dbo.app_users')).recordset[0];
  assert.ok(actor,'The migration proof must provide an actor fixture.');
  const store=createBillingStore({getPool:async()=>pool});
  const rules={market:'LK',billingCurrency:'USD',baseFeeMinor:500,rentCurrency:'LKR',includedRentMinor:null,
    excessPolicy:'pending',effectiveAt:null,reason:'Synthetic migration proof; no commercial policy approval.'};
  const attempts=await Promise.allSettled(Array.from({length:4},()=>store.savePricing({rules,expectedVersion:0,actorId:actor.id})));
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1,'Concurrent drafts cannot overwrite or reuse a market version.');
  assert.equal(attempts.filter(a=>a.status==='rejected'&&a.reason.code==='BILLING_STALE_VERSION').length,3);
  const versions=await store.listPricing();assert.equal(versions.length,1);assert.equal(versions[0].status,'draft');
  const audit=(await pool.request().query('SELECT COUNT(*) AS count FROM dbo.management_billing_audit')).recordset[0];
  assert.equal(audit.count,1,'One successful draft creates exactly one audit record.');
  await assert.rejects(store.locked('rollback-proof',async q=>{
    await q(`INSERT INTO dbo.management_pricing_versions(id,market,version,rules_json,created_by)
      VALUES(@id,'BN',1,@rules,@actor)`,{id:crypto.randomUUID(),rules:JSON.stringify({...rules,market:'BN'}),actor:actor.id});
    throw new Error('simulated failure');
  }),/simulated failure/);
  assert.equal((await store.listPricing()).length,1,'Failed transaction leaves no partial pricing version.');
  console.log('PASS: management billing double migration, constraint drift denial, concurrent version serialization and atomic audit/rollback');
};
