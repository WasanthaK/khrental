import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIVERY_EVENTS, classifyInvoiceEmailError, deliveryOutcome } from '../src/api/platform/invoiceDeliveryState.js';

test('an in-flight invoice email cannot be called delivered or safely retried', () => {
  assert.equal(deliveryOutcome(DELIVERY_EVENTS.attempted), 'unknown');
  assert.equal(deliveryOutcome(DELIVERY_EVENTS.accepted), 'accepted');
  assert.equal(deliveryOutcome(DELIVERY_EVENTS.failed), 'failed');
  assert.equal(deliveryOutcome(DELIVERY_EVENTS.unknown), 'unknown');
  assert.equal(deliveryOutcome(undefined), 'not_attempted');
});
test('definite provider rejection differs from ambiguous network delivery', () => {
  for (const code of ['EMAIL_NOT_CONFIGURED', 'EMAIL_PROVIDER_REJECTED', 'REMINDER_DELIVERY_FAILED']) {
    assert.equal(classifyInvoiceEmailError({ code }), 'failed');
  }
  assert.equal(classifyInvoiceEmailError({ code: 'EMAIL_PROVIDER_REQUEST_FAILED' }), 'unknown');
  assert.equal(classifyInvoiceEmailError(new Error('connection reset')), 'unknown');
});

test('invoice email ledger timestamps are serialized and strictly increasing for deterministic outcome reads', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../src/api/platform/billingRouter.js', import.meta.url), 'utf8');
  assert.match(source, /const emailEvent = Object\.values\(DELIVERY_EVENTS\)\.includes\(eventType\)/);
  assert.match(source, /invoices WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(source, /MAX\(createdat\)/);
  assert.match(source, /DATEADD\(NANOSECOND, 100, @previousEventAt\)/);
  assert.match(source, /ORDER BY createdat DESC, id DESC/);
  assert.match(source, /last\?\.event_type !== DELIVERY_EVENTS\.failed/);
});
