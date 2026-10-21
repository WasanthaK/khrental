import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DELIVERY_EVENTS, classifyInvoiceEmailError, classifyInvoiceDeliveryAttemptError, deliveryOutcome } from '../src/api/platform/invoiceDeliveryState.js';

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

test('failures before the email provider boundary are retryable, never claimed delivered',()=>{
  for (const code of ['INVOICE_ARCHIVE_INTEGRITY_FAILED','INVOICE_ARCHIVE_R2_REQUIRED',
    'INVOICE_ISSUANCE_SNAPSHOT_MISSING','INVOICE_PDF_GENERATION_FAILED']) {
    assert.equal(classifyInvoiceDeliveryAttemptError({code},false),'failed',code);
  }
  assert.equal(classifyInvoiceDeliveryAttemptError(new Error('R2 temporarily unavailable'),false),'failed');
  assert.equal(classifyInvoiceDeliveryAttemptError({code:'EMAIL_PROVIDER_REQUEST_FAILED'},true),'unknown');
  assert.equal(classifyInvoiceDeliveryAttemptError(new Error('connection reset'),true),'unknown');
  assert.equal(classifyInvoiceDeliveryAttemptError({code:'EMAIL_PROVIDER_REJECTED'},true),'failed');
});

test('delivery crossing into the mail provider is fenced after PDF and payload creation',()=>{
  const source=readFileSync(new URL('../src/api/platform/billingRouter.js',import.meta.url),'utf8');
  const start=source.indexOf('const deliverIssuedInvoice =');
  const end=source.indexOf("router.post('/invoices/:invoiceId/issue'",start);
  const body=source.slice(start,end);
  assert.ok(start>0 && end>start);
  const steps=[
    'prepareImmutableIssuedInvoiceAttachment(',
    'const emailPayload =',
    'providerRequestStarted = true',
    'sendInvoiceEmail(emailPayload)',
    'classifyInvoiceDeliveryAttemptError(error, providerRequestStarted)'
  ].map(x=>body.indexOf(x));
  assert.ok(steps.every(x=>x>=0) && steps.every((x,i)=>i===0||x>steps[i-1]));
});
