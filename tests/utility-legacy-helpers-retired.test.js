import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

test('retired utility invoice helpers cannot write or fabricate linkage', () => {
  const utility = read('../src/services/utilityBillingService.js');
  assert.doesNotMatch(utility, /export const markAsInvoiced|const discoverValidStatusValues|const READING_STATUS|validStatusValues/);
  assert.doesNotMatch(utility, /\.from\('utility_billing'\)/);
  assert.match(utility, /listUtilityInvoicePreviewRows\(options\)/);
});

test('live utility approval, rejection and governed invoice linkage remain intact', () => {
  const utility = read('../src/services/utilityBillingService.js');
  const review = read('../src/pages/UtilityBillingReview.jsx');
  const monthly = read('../src/api/platform/monthlyBillingService.js');
  assert.doesNotMatch(utility, /export const approveReading|export const rejectReading|export const updateReadingValue|const getValidStatusesFromConstraint/);
  const authority = read('../src/api/platform/utilityReviewRouter.js');
  assert.ok(authority.includes('STALE_METER_READING'));
  assert.ok(authority.includes('READING_ALREADY_PROCESSED'));
  assert.match(review, /transitionUtilityReading\(reading\.id, 'approve'\)/);
  assert.match(review, /transitionUtilityReading\(reading\.id, 'reject'/);
  assert.doesNotMatch(review, /await approveReading\(|await rejectReading\(/);
  assert.match(monthly, /FROM utility_readings WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(monthly, /invoice_id IS NULL/);
  assert.match(monthly, /UPDATE utility_readings[\s\S]*?WHERE tenant_id = @tenantId/);
});
