import crypto from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractSignedDocumentUrl,
  getEviaWebhookSignature,
  markAllSignatoriesCompleted,
  normalizeEviaWebhookPayload,
  shouldAcknowledgeUnmappedWebhook,
  updateSignatoryEmailDelivery,
  verifyEviaWebhookHmac
} from '../src/api/evia/webhook.js';

test('normalizes Evia V2 request.completed payloads', () => {
  const result = normalizeEviaWebhookPayload({
    event: 'request.completed',
    RequestId: 'cdc41fd5-44c0-4000-8000-000000000001',
    Status: 'Completed'
  });

  assert.equal(result.requestId, 'cdc41fd5-44c0-4000-8000-000000000001');
  assert.equal(result.eventType, 'request.completed');
  assert.equal(result.status, 'completed');
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