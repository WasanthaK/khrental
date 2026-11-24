import assert from 'node:assert/strict';
import {createBillingStore} from '../src/api/managementBilling/store.js';
import {saveIssuerDraft, scheduleIssuer, listIssuerAssignments} from '../src/api/managementBilling/issuerAdministration.js';

export async function verifyIssuerAdministration(pool) {
  const store=createBillingStore({getPool:async()=>pool});
  const [actor]=await store.read('SELECT TOP (1) id FROM dbo.app_users ORDER BY id');
  const draft={market:'nz', issuerCountry:'us', legalName:'Administration fixture'};
  const [first,retry]=await Promise.all([saveIssuerDraft(store,actor.id,draft),saveIssuerDraft(store,actor.id,draft)]);
  assert.equal(first.id,retry.id);
  const effective=new Date();
  effective.setUTCFullYear(effective.getUTCFullYear()+1);
  effective.setUTCSeconds(0,0);
  const approval={effectiveAt:effective.toISOString(),approvalReference:'Controlled approval'};
  await scheduleIssuer(store,actor.id,first.id,approval);
  await scheduleIssuer(store,actor.id,first.id,approval);
  const other=await saveIssuerDraft(store,actor.id,{...draft,legalName:'Second fixture issuer'});
  await assert.rejects(scheduleIssuer(store,actor.id,other.id,approval),{code:'ISSUER_DATE_TAKEN'});
  await assert.rejects(scheduleIssuer(store,actor.id,other.id,{...approval,effectiveAt:'2000-01-01T00:00:00.000Z'}),{code:'ISSUER_DATE_PAST'});
  const rows=(await listIssuerAssignments(store)).filter(row=>row.market==='NZ');
  assert.deepEqual(rows.map(row=>row.status),['Scheduled','Draft']);
  assert.equal(rows[0].issuerCountry,'US');
  assert.equal(rows[0].approvalReference,approval.approvalReference);
  const actions=await store.read('SELECT action FROM dbo.management_billing_audit WHERE resource_id=@resource ORDER BY action',{resource:first.id});
  assert.deepEqual(actions.map(row=>row.action),['issuer.assignment.draft','issuer.assignment.scheduled']);
  console.log('PASS: concurrent issuer draft, schedule, retry, conflict, past-date denial, history and audit');
}
