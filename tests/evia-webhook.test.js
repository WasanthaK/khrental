import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVIA_CLAIM_LEASE_MS } from '../src/api/evia/deliveryClaim.js';
import { evaluateEviaTerminalDelivery, isEviaTerminalAgreement } from '../src/api/evia/terminalPolicy.js';
import {
  createEviaCallbackToken,
  extractSignedDocumentUrl,
  getEviaWebhookSignature,
  markAllSignatoriesCompleted,
  normalizeEviaWebhookPayload,
  shouldAcknowledgeUnmappedWebhook,
  shouldIgnoreProcessedEviaDelivery,
  updateSignatoryCompletion,
  updateSignatoryEmailDelivery,
  verifyEviaCallbackToken,
  verifyEviaWebhookHmac
} from '../src/api/evia/webhook.js';

test('normalizes Evia V2 request.completed payloads', () => {
  const result = normalizeEviaWebhookPayload({
    event: 'request.completed',
    deliveryId: 'delivery-123',
    RequestId: 'cdc41fd5-44c0-4000-8000-000000000001',
    Status: 'Completed'
  });

  assert.equal(result.requestId, 'cdc41fd5-44c0-4000-8000-000000000001');
  assert.equal(result.deliveryId, 'delivery-123');
  assert.equal(result.eventType, 'request.completed');
  assert.equal(result.status, 'completed');
});

test('normalizes documented completed-document webhook fields', () => {
  const result = normalizeEviaWebhookPayload({
    deliveryId: 'delivery-456',
    eventId: 'signing_completed',
    requestId: 'request-456',
    timestamp: '2026-09-04T10:00:00Z'
  });

  assert.equal(result.requestId, 'request-456');
  assert.equal(result.deliveryId, 'delivery-456');
  assert.equal(result.eventId, null);
  assert.equal(result.eventType, 'signing_completed');
  assert.equal(result.eventTime, '2026-09-04T10:00:00Z');
  assert.equal(shouldAcknowledgeUnmappedWebhook(result), false);
});

test('normalizes request.sent recipient and explicit delivery status', () => {
  const result = normalizeEviaWebhookPayload({
    event: 'request.sent',
    RequestId: 'cdc41fd5-44c0-4000-8000-000000000003',
    Name: 'Tenant',
    Email: 'Tenant@Example.com',
    EmailDeliveryStatus: 'Delivered'
  });

  assert.equal(result.eventType, 'request.sent');
  assert.equal(result.recipientEmail, 'tenant@example.com');
  assert.equal(result.recipientName, 'Tenant');
  assert.equal(result.deliveryStatus, 'delivered');
});

test('normalizes legacy completion callbacks', () => {
  const result = normalizeEviaWebhookPayload({
    RequestId: 'cdc41fd5-44c0-4000-8000-000000000002',
    EventId: 3,
    EventDescription: 'RequestCompleted',
    EventTime: '2026-09-19T05:00:00Z'
  });

  assert.equal(result.eventId, 3);
  assert.equal(result.eventType, 'requestcompleted');
  assert.equal(result.eventTime, '2026-09-19T05:00:00Z');
});

test('acknowledges authenticated connection-test and request.sent payloads without RequestId', () => {
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: '', eventId: null, status: '' }), true);
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: 'webhook.test', eventId: null, status: '' }), true);
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: 'request.sent', eventId: null, status: '' }), true);
});

test('does not acknowledge terminal payloads without RequestId', () => {
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: 'request.completed', eventId: null, status: 'completed' }), false);
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: '', eventId: 3, status: '' }), false);
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: '', eventId: null, status: 'cancelled' }), false);
  assert.equal(shouldAcknowledgeUnmappedWebhook({ eventType: '', eventId: null, status: 'rejected' }), false);
});

test('tracks sent email independently from signature status', () => {
  const result = updateSignatoryEmailDelivery(JSON.stringify([
    { name: 'Tenant', email: 'tenant@example.com', type: 'tenant', status: 'pending' }
  ]), {
    email: 'Tenant@Example.com',
    name: 'Tenant',
    eventType: 'request.sent',
    eventTime: '2026-09-19T05:01:00Z'
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'pending');
  assert.equal(result[0].email_delivery_status, 'sent');
  assert.equal(result[0].email_sent_at, '2026-09-19T05:01:00Z');
});

test('records an explicit bounced delivery status without changing signing status', () => {
  const result = updateSignatoryEmailDelivery([
    { name: 'Tenant', email: 'tenant@example.com', type: 'tenant', status: 'pending' }
  ], {
    email: 'tenant@example.com',
    deliveryStatus: 'bounced',
    eventTime: '2026-09-19T05:02:00Z'
  });

  assert.equal(result[0].status, 'pending');
  assert.equal(result[0].email_delivery_status, 'bounced');
  assert.equal(result[0].email_failed_at, '2026-09-19T05:02:00Z');
});

test('marks stored signatories completed without losing identity fields', () => {
  const completedAt = '2026-09-19T05:00:00.000Z';
  const result = markAllSignatoriesCompleted(JSON.stringify([
    { name: 'Owner', email: 'owner@example.com', type: 'landlord', status: 'pending' },
    { name: 'Tenant', email: 'tenant@example.com', type: 'tenant', status: 'pending' }
  ]), completedAt);

  assert.equal(result.length, 2);
  assert.deepEqual(result.map((entry) => entry.status), ['completed', 'completed']);
  assert.equal(result[0].email, 'owner@example.com');
  assert.equal(result[1].signedAt, completedAt);
});

test('extracts only http(s) signed document URLs', () => {
  assert.equal(
    extractSignedDocumentUrl({ SignedDocumentUrl: 'https://example.com/signed.pdf' }),
    'https://example.com/signed.pdf'
  );
  assert.equal(extractSignedDocumentUrl({ SignedDocumentUrl: 'javascript:alert(1)' }), null);
});

test('verifies hex HMAC SHA-256 over the exact raw body', () => {
  const rawBody = Buffer.from('{"event":"request.completed","RequestId":"abc"}');
  const secret = 'test-webhook-secret';
  const signature = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  assert.equal(verifyEviaWebhookHmac({ rawBody, signature, secret }), true);
  assert.equal(verifyEviaWebhookHmac({ rawBody, signature: `sha256=${signature}`, secret }), true);
  assert.equal(verifyEviaWebhookHmac({ rawBody, signature: 'bad-signature', secret }), false);
});

test('recognizes common webhook signature header names', () => {
  assert.equal(getEviaWebhookSignature({ 'X-Evia-Signature': 'abc123' }), 'abc123');
  assert.equal(getEviaWebhookSignature({ 'x-custom-hmac': 'def456' }), 'def456');
});

test('records an individual signatory completion without marking the other signer complete', () => {
  const completedAt = '2026-10-03T10:00:00.000Z';
  const result = updateSignatoryCompletion(JSON.stringify([
    { name: 'Owner', email: 'owner@example.com', type: 'landlord', status: 'pending' },
    { name: 'Tenant', email: 'tenant@example.com', type: 'tenant', status: 'pending' }
  ]), {
    email: 'owner@example.com',
    name: 'Owner',
    eventTime: completedAt
  });

  assert.equal(result.length, 2);
  assert.equal(result[0].status, 'completed');
  assert.equal(result[0].signedAt, completedAt);
  assert.equal(result[1].status, 'pending');
});


test('creates and verifies agreement-bound Evia callback tokens', () => {
  const secret = 'test-callback-secret';
  const now = Date.parse('2026-10-04T00:00:00Z');
  const token = createEviaCallbackToken({
    agreementId: 'agreement-1',
    tenantId: 'tenant-1',
    secret,
    expiresInSeconds: 3600,
    now
  });

  const result = verifyEviaCallbackToken({ token, secret, now: now + 1000 });
  assert.equal(result.ok, true);
  assert.equal(result.agreementId, 'agreement-1');
  assert.equal(result.tenantId, 'tenant-1');

  const expired = verifyEviaCallbackToken({ token, secret, now: now + 3601 * 1000 });
  assert.equal(expired.ok, false);
  assert.equal(expired.expired, true);

  assert.equal(verifyEviaCallbackToken({ token: token + 'tampered', secret, now }).ok, false);
});

test('processed non-terminal Evia delivery is acknowledged without another mutation', () => {
  const agreement = { status: 'pending_signature', signature_status: 'in_progress' };
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: true, normalized: { eventType: 'request.sent', eventId: null, status: 'sent' }, agreement
  }), true);
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: false, normalized: { eventType: 'request.sent', eventId: null, status: 'sent' }, agreement
  }), false);
});

test('completed Evia delivery skips only when signed state and retained local document are present', () => {
  const normalized = { eventType: 'request.completed', eventId: 3, status: 'completed' };
  const completed = {
    status: 'signed', signature_status: 'completed',
    signed_document_url: '/storage/documents/tenants/tenant-1/agreements/agreement-1/signed.pdf'
  };
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: true, normalized, agreement: completed
  }), true);
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: true, normalized,
    agreement: { ...completed, signed_document_url: null }
  }), false, 'previous completion with missing archived PDF must remain recoverable');
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: true, normalized,
    agreement: { ...completed, signature_status: 'in_progress' }
  }), false, 'incomplete database transition must remain retryable');
  assert.equal(shouldIgnoreProcessedEviaDelivery({
    alreadyProcessed: false, normalized, agreement: completed
  }), false, 'a distinct deliveryId must remain processable');
});

test('delivery deduplication is scoped to tenant/request and precedes event insertion', () => {
  const source = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  const lookup = source.slice(source.indexOf('const hasProcessedWebhookDelivery = '),
    source.indexOf('const getStoredSignedDocumentUrl = '));
  assert.match(lookup, /tenant_id = @tenantId/);
  assert.match(lookup, /request_id = @requestId/);
  assert.match(lookup, /processed = 1/);
  assert.match(lookup, /JSON_VALUE\(raw_data, '\$\.deliveryId'\) = @deliveryId/);
  const handler = source.slice(source.indexOf('export const processEviaWebhook = '));
  assert.ok(handler.indexOf('shouldIgnoreProcessedEviaDelivery(') <
    handler.indexOf('recordVerifiedWebhookEvent('));
});

test('Evia claim is SQL-serialized by tenant, request, and delivery with crash recovery', () => {
  const claimSource = readFileSync(
    new URL('../src/api/evia/deliveryClaim.js', import.meta.url), 'utf8'
  );
  assert.equal(EVIA_CLAIM_LEASE_MS, 15 * 60 * 1000);
  assert.match(claimSource, /crypto\.createHash\('sha256'\)/);
  assert.match(claimSource, /JSON\.stringify\(\[String\(tenantId\)/);
  assert.match(claimSource, /sys\.sp_getapplock/);
  assert.match(claimSource, /@LockMode = 'Exclusive'/);
  assert.match(claimSource, /@LockOwner = 'Transaction'/);
  assert.match(claimSource, /processed = 0/);
  assert.match(claimSource, /return \{ eventId: null, alreadyProcessed, inFlight: true/);
  assert.match(claimSource, /transaction\.rollback\(\)/);

  const webhookSource = readFileSync(
    new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8'
  );
  const handler = webhookSource.slice(webhookSource.indexOf('export const processEviaWebhook = '));
  assert.ok(handler.indexOf('claimEviaWebhookDelivery(') < handler.indexOf('updateSignatoryEmailDelivery('));
  assert.match(handler, /statusCode: 503,/);
  assert.match(handler, /EVIA_DELIVERY_IN_PROGRESS/);
});

test('terminal Evia states are monotonic across delayed completion, cancellation and rejection', () => {
  const completed = { status: 'signed', signature_status: 'completed' };
  const cancelled = { status: 'cancelled', signature_status: 'failed' };
  const rejected = { status: 'rejected', signature_status: 'failed' };
  for (const agreement of [completed, cancelled, rejected]) {
    assert.equal(isEviaTerminalAgreement(agreement), true);
    for (const nextState of [
      { agreementStatus: 'signed', signatureStatus: 'completed' },
      { agreementStatus: 'cancelled', signatureStatus: 'failed' },
      { agreementStatus: 'rejected', signatureStatus: 'failed' },
      null
    ]) {
      const decision = evaluateEviaTerminalDelivery({
        agreement, nextState, hasRetainedSignedDocument: true
      });
      assert.equal(decision.action, 'ignore');
    }
  }
  assert.equal(evaluateEviaTerminalDelivery({
    agreement: { status: 'pending_signature', signature_status: 'in_progress' },
    nextState: { agreementStatus: 'signed', signatureStatus: 'completed' }
  }).action, 'process');
});

test('signed-document repair is the sole permitted terminal completion retry', () => {
  const agreement = { status: 'signed', signature_status: 'completed' };
  const nextState = { agreementStatus: 'signed', signatureStatus: 'completed' };
  assert.equal(evaluateEviaTerminalDelivery({
    agreement, nextState, hasRetainedSignedDocument: false
  }).action, 'recover_document');
  assert.equal(evaluateEviaTerminalDelivery({
    agreement, nextState, hasRetainedSignedDocument: true
  }).action, 'ignore');
  for (const oldState of [
    { status: 'cancelled', signature_status: 'failed' },
    { status: 'rejected', signature_status: 'failed' },
    { status: 'signed', signature_status: 'failed' }
  ]) {
    assert.equal(evaluateEviaTerminalDelivery({
      agreement: oldState, nextState, hasRetainedSignedDocument: false
    }).action, 'ignore');
  }
});

test('SQL update fences reject stale partial callbacks and terminal overrides', () => {
  const source = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  const processing = source.slice(source.indexOf('export const processEviaWebhook = '));
  assert.match(processing, /evaluateEviaTerminalDelivery\(/);
  assert.match(processing, /if \(terminalDecision\.action === 'ignore'\)/);
  assert.match(processing, /OUTPUT INSERTED\.id/);
  assert.match(processing, /LOWER\(COALESCE\(signature_status, ''\)\) NOT IN \('completed', 'failed'\)/);
  assert.match(processing, /@signatureStatus = 'completed'/);
  assert.match(processing, /@signatureStatus = 'failed'/);
  assert.match(processing, /if \(!terminalUpdated\.length\)/);
});
