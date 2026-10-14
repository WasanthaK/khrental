import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateReviewedUtilityCharge } from '../src/api/platform/utilityReviewRouter.js';
const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');

test('governed utility review validates amounts without a guessed fallback rate', () => {
  assert.deepEqual(calculateReviewedUtilityCharge({previousreading: 100, currentreading: 103, rate: 12.5}),
    { consumption: 3, rate: 12.5, amount: 37.5 });
  assert.deepEqual(calculateReviewedUtilityCharge({previousreading: 1, currentreading: 2, rate: 0}),
    { consumption: 1, rate: 0, amount: 0 });
  for(const input of [
    {previousreading: 1,currentreading: 3,rate: null},
    {previousreading: 5,currentreading: 4,rate: 2},
    {previousreading: 1,currentreading: 2,rate: -1},
    {previousreading: '',currentreading: 2,rate: 1},
    {previousreading: 0,currentreading: 1,rate: 'nonsense'}
  ]) {
    assert.throws(() => calculateReviewedUtilityCharge(input), err => err.status === 422);
  }
});

test('utility transition API has transactional scope and no invoice issuance', () => {
  const route = read('../src/api/platform/utilityReviewRouter.js');
  const server = read('../server.js');
  assert.match(server, /app\.use\('\/api\/utility-reviews', createUtilityReviewRouter\(\)\)/);
  assert.match(route, /requireUser: true, requireTenant: true/);
  assert.match(route, /PERMISSIONS\.UTILITIES_REVIEW/);
  assert.match(route, /assignedPropertyIds/);
  assert.match(route, /sql\.ISOLATION_LEVEL\.SERIALIZABLE/);
  assert.match(route, /FROM utility_readings r WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(route, /r\.tenant_id = @tenantId/);
  assert.match(route, /invoice_id IS NULL/);
  assert.match(route, /READING_ALREADY_PROCESSED/);
  assert.match(route, /await transaction\.rollback\(\)/);
  assert.match(route, /await transaction\.commit\(\)/);
  assert.match(route, /billing_status = 'pending_invoice'/);
  assert.match(route, /billing_status = 'rejected'/);
  assert.doesNotMatch(route, /INSERT INTO invoices|UPDATE invoices|SET invoice_id =|UPDATE utility_billing|INSERT INTO utility_billing/);
});

test('existing monthly billing remains sole owner of invoice creation and linkage', () => {
  const monthly = read('../src/api/platform/monthlyBillingService.js');
  assert.match(monthly, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(monthly, /WHERE tenant_id = @tenantId/);
  assert.match(monthly, /invoice_id IS NULL/);
  assert.match(monthly, /UPDATE utility_readings[\s\S]*?WHERE tenant_id = @tenantId/);
});
