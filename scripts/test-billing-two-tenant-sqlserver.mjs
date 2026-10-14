import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';
import express from 'express';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import react from '@vitejs/plugin-react';
import { assertEviaEvidenceDeletionAllowed } from '../src/api/storage/eviaEvidenceRetention.js';

// Verify the same retention boundary before the disposable two-tenant SQL acceptance.
const stagedEvidence = 'tenants/feec0269-d580-49c3-a982-5b3ecbbb1a09/agreements/f2de49bb-d787-4319-8233-654059273b53/signed/staged/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/audit_trail.pdf';
assert.throws(() => assertEviaEvidenceDeletionAllowed('documents', [stagedEvidence]), { code: 'EVIA_EVIDENCE_DELETE_DENIED' });
assert.throws(() => assertEviaEvidenceDeletionAllowed('documents'), { code: 'EVIA_EVIDENCE_DELETE_DENIED' });

// Mandatory disposable Docker SQL Server; never use a preexisting/production endpoint.
const docker = args => execFileSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const connect = options => new sql.ConnectionPool({
  server: '127.0.0.1', port: options.port, database: options.database || 'master',
  user: 'sa', password: options.password, connectionTimeout: 10000, requestTimeout: 120000,
  options: { encrypt: false, trustServerCertificate: true },
  pool: { max: 5, min: 0, idleTimeoutMillis: 5000 }
}).connect();
const query = async (pool, statement, inputs = {}) => {
  const request = pool.request();
  Object.entries(inputs).forEach(([key, value]) => request.input(key, value));
  return (await request.query(statement)).recordset || [];
};
const first = async (pool, statement, inputs = {}) => (await query(pool, statement, inputs))[0] || null;
const guid = value => String(value).toLowerCase();

// Transaction/replay proof uses the very same isolated Docker SQL database
// as billing acceptance. No externally configured or production database.
async function verifyManualSigningAgainstDisposableSql(pool, a, b) {
  const { markAgreementSigned } = await import('../src/api/mssql/repositories.js');
  const unit = await first(pool,
    "INSERT INTO property_units (tenant_id, propertyid, unitnumber, status) OUTPUT INSERTED.id VALUES (@tenantId, @propertyId, 'SIGN-TEST', 'available')",
    { tenantId: a.tenantId, propertyId: a.propertyId });
  const unitId = guid(unit.id);
  const createAgreement = async ({ tenantId, renteeId, propertyId, status, evia = null, signatureStatus = null, withUnit = false }) => {
    const row = await first(pool,
      `INSERT INTO agreements (tenant_id, renteeid, propertyid, unitid, status, eviasignreference, signature_status)
       OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @unitId, @status, @evia, @signatureStatus)`,
      { tenantId, renteeId, propertyId, unitId: withUnit ? unitId : null, status, evia, signatureStatus });
    return guid(row.id);
  };
  const aPending = await createAgreement({
    ...a, status: 'pending', withUnit: true
  });
  const aActive = await createAgreement({ ...a, status: 'active' });
  const aEvia = await createAgreement({ ...a, status: 'pending', evia: 'disposable-evia-request' });
  const aInProgress = await createAgreement({ ...a, status: 'pending_signature', signatureStatus: 'in_progress' });
  const bPending = await createAgreement({ ...b, status: 'pending_signature' });

  const expectCode = async (operation, code) => {
    await assert.rejects(operation, error => {
      assert.equal(error?.code, code);
      return true;
    });
  };
  await expectCode(markAgreementSigned(aPending, b.tenantId), 'AGREEMENT_NOT_FOUND');
  await expectCode(markAgreementSigned(bPending, a.tenantId), 'AGREEMENT_NOT_FOUND');
  await expectCode(markAgreementSigned(aActive, a.tenantId), 'MANUAL_SIGN_STATE_INVALID');
  await expectCode(markAgreementSigned(aEvia, a.tenantId), 'EVIA_SIGNING_MANAGED');
  await expectCode(markAgreementSigned(aInProgress, a.tenantId), 'EVIA_SIGNING_MANAGED');
  for (const id of [aPending, aActive, aEvia, aInProgress]) {
    assert.equal((await first(pool, 'SELECT status FROM agreements WHERE id = @id', { id })).status,
      id === aActive ? 'active' : id === aInProgress ? 'pending_signature' : 'pending');
  }

  // Force a related property mutation to fail after the agreement is updated
  // in its transaction. SQL must roll back the agreement state and signeddate.
  await pool.request().batch(`
    CREATE TRIGGER dbo.sign_fixture_force_rollback ON dbo.properties
    AFTER UPDATE AS
    BEGIN
      IF EXISTS (SELECT 1 FROM inserted WHERE id = '${a.propertyId}')
        THROW 51001, 'Disposable signing rollback proof', 1;
    END
  `);
  try {
    await assert.rejects(markAgreementSigned(aPending, a.tenantId),
      /Disposable signing rollback proof/);
    const rolledBack = await first(pool,
      'SELECT status, signeddate FROM agreements WHERE id = @id', { id: aPending });
    assert.equal(rolledBack.status, 'pending');
    assert.equal(rolledBack.signeddate, null);
    assert.equal((await first(pool, 'SELECT status FROM property_units WHERE id = @id', { id: unitId })).status, 'available');
  } finally {
    await pool.request().batch('DROP TRIGGER IF EXISTS dbo.sign_fixture_force_rollback');
  }

  // A retry after rollback now performs the complete transaction; further
  // manual replays are read-only and cannot duplicate the side effects.
  const signed = await markAgreementSigned(aPending, a.tenantId);
  assert.equal(signed.status, 'signed');
  const snapshot = async () => ({
    agreement: await first(pool,
      'SELECT status, signeddate, updatedat FROM agreements WHERE id = @id', { id: aPending }),
    property: await first(pool,
      'SELECT status, updatedat FROM properties WHERE id = @id', { id: a.propertyId }),
    unit: await first(pool,
      'SELECT status, updatedat FROM property_units WHERE id = @id', { id: unitId }),
    rentee: await first(pool,
      'SELECT associated_property_ids, updatedat FROM app_users WHERE id = @id', { id: a.renteeId })
  });
  const beforeReplay = await snapshot();
  assert.ok(beforeReplay.agreement.signeddate);
  assert.equal(beforeReplay.unit.status, 'occupied');
  const associated = JSON.parse(beforeReplay.rentee.associated_property_ids || '[]')
    .map(guid);
  assert.equal(associated.filter(id => id === a.propertyId).length, 1);
  const twice = await markAgreementSigned(aPending, a.tenantId);
  assert.equal(twice.status, 'signed');
  assert.deepEqual(await snapshot(), beforeReplay,
    'second manual signing must not repeat any SQL side effects');
  // Concurrent requests must lock the same row and only one transition is
  // performed; both callers may observe a signed record afterwards.
  const simultaneous = await Promise.all([
    markAgreementSigned(bPending, b.tenantId),
    markAgreementSigned(bPending, b.tenantId)
  ]);
  assert.ok(simultaneous.every(row => row.status === 'signed'));
  assert.equal((await first(pool,
    'SELECT status FROM agreements WHERE id = @id', { id: bPending })).status, 'signed');
  console.log('PASS: tenant-isolated manual signing state, Evia protection, rollback, replay and concurrency');
}

async function verifyEviaProcessedDeliveryAgainstDisposableSql(pool, a, b) {
  const { processEviaWebhook } = await import('../src/api/evia/webhook.js');
  const requestId = 'disposable-evia-request-' + crypto.randomBytes(6).toString('hex');
  const deliveryId = 'delivery-' + crypto.randomBytes(5).toString('hex');
  const signatories = JSON.stringify([
    { name: 'Test Renter', email: a.email, status: 'pending', type: 'tenant' }
  ]);
  const pending = await first(pool,
    `INSERT INTO agreements (tenant_id, renteeid, propertyid, status,
                             signature_status, eviasignreference, signatories_status)
      OUTPUT INSERTED.id
      VALUES (@tenantId, @renteeId, @propertyId,
              'pending_signature', 'pending', @requestId, @signatories)`,
    { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
      requestId, signatories });
  const pendingId = guid(pending.id);
  const payload = {
    event: 'request.sent', RequestId: requestId, deliveryId,
    Email: a.email, Name: 'Test Renter', EmailDeliveryStatus: 'Delivered'
  };
  const call = () => processEviaWebhook(payload, {
    expectedAgreementId: pendingId, expectedTenantId: a.tenantId
  });
  const firstDelivery = await call();
  assert.equal(firstDelivery.statusCode, 200);
  assert.equal(firstDelivery.body.matched, true);
  assert.equal(firstDelivery.body.updated, true);
  const events = async () => query(pool,
    'SELECT id, processed FROM webhook_events WHERE tenant_id = @tenantId AND request_id = @requestId',
    { tenantId: a.tenantId, requestId });
  assert.equal((await events()).length, 1);
  const snapshot = async () => first(pool,
    'SELECT status, signature_status, signatories_status, updatedat FROM agreements WHERE id = @id',
    { id: pendingId });
  const before = await snapshot();
  const repeated = await call();
  assert.equal(repeated.statusCode, 200);
  assert.equal(repeated.body.duplicate, true);
  assert.equal(repeated.body.updated, false);
  assert.equal((await events()).length, 1, 'processed delivery must not create another event');
  assert.deepEqual(await snapshot(), before,
    'processed request.sent must not mutate signatory email status or timestamp again');
  const foreign = await processEviaWebhook(payload, {
    expectedAgreementId: pendingId, expectedTenantId: b.tenantId
  });
  assert.equal(foreign.statusCode, 200);
  assert.equal(foreign.body.matched, false);
  assert.equal((await events()).length, 1);

  // A previously completed callback that already retained its local signed
  // document must be acknowledged without rewriting completion timestamps.
  const completedId = 'disposable-evia-completed-' + crypto.randomBytes(5).toString('hex');
  const completed = await first(pool,
    `INSERT INTO agreements (tenant_id, renteeid, propertyid, status,
                             signature_status, eviasignreference, signed_document_url,
                             signeddate, signature_completed_at)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId,
            'signed', 'completed', @requestId, @signedUrl, '2026-10-01', '2026-10-01')`,
    { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
      requestId: completedId, signedUrl: '/storage/documents/tenants/test/agreement/signed.pdf' });
  const signedId = guid(completed.id);
  const completedDeliveryId = 'completed-' + crypto.randomBytes(5).toString('hex');
  await query(pool,
    `INSERT INTO webhook_events (tenant_id, event_type, request_id, raw_data, processed)
       VALUES (@tenantId, 'request.completed', @requestId, @rawData, 1)`,
    { tenantId: a.tenantId, requestId: completedId,
      rawData: JSON.stringify({ deliveryId: completedDeliveryId }) });
  const completedBefore = await first(pool,
    'SELECT status, signature_status, signeddate, signature_completed_at, updatedat, signed_document_url FROM agreements WHERE id = @id',
    { id: signedId });
  const repeatedCompletion = await processEviaWebhook({
    event: 'request.completed', Status: 'Completed', RequestId: completedId,
    deliveryId: completedDeliveryId
  }, { expectedAgreementId: signedId, expectedTenantId: a.tenantId });
  assert.equal(repeatedCompletion.statusCode, 200);
  assert.equal(repeatedCompletion.body.duplicate, true);
  assert.equal(repeatedCompletion.body.updated, false);
  const completedAfter = await first(pool,
    'SELECT status, signature_status, signeddate, signature_completed_at, updatedat, signed_document_url FROM agreements WHERE id = @id',
    { id: signedId });
  assert.deepEqual(completedAfter, completedBefore);
  const completedEvents = await query(pool,
    'SELECT id FROM webhook_events WHERE tenant_id = @tenantId AND request_id = @requestId',
    { tenantId: a.tenantId, requestId: completedId });
  assert.equal(completedEvents.length, 1);
  console.log('PASS: Evia verified processed-delivery idempotency and tenant-scoped callback isolation');
}

async function verifyEviaConcurrentClaimAgainstDisposableSql(pool, a, b) {
  const { claimEviaWebhookDelivery } = await import('../src/api/evia/deliveryClaim.js');
  const requestId = 'claim-' + crypto.randomBytes(8).toString('hex');
  const deliveryId = 'race-' + crypto.randomBytes(8).toString('hex');
  let inserts = 0;
  const insertEvent = (item, request, delivery) => async transaction => {
    assert.ok(transaction, 'claims with deliveryId must insert inside a SQL transaction');
    inserts++;
    const sqlRequest = new sql.Request(transaction);
    sqlRequest.input('tenantId', item.tenantId);
    sqlRequest.input('requestId', request);
    sqlRequest.input('rawData', JSON.stringify({ deliveryId: delivery }));
    const inserted = await sqlRequest.query(`
      INSERT INTO dbo.webhook_events
        (tenant_id, request_id, event_type, raw_data, processed)
      OUTPUT INSERTED.id
      VALUES (@tenantId, @requestId, 'request.sent', @rawData, 0)
    `);
    return inserted.recordset[0].id;
  };
  const claim = (tenant, req, delivery, recover = false) =>
    claimEviaWebhookDelivery({
      tenantId: tenant.tenantId, requestId: req, deliveryId: delivery,
      allowProcessedRecovery: recover, insertEvent: insertEvent(tenant, req, delivery)
    });
  const [firstClaim, otherClaim] = await Promise.all([
    claim(a, requestId, deliveryId),
    claim(a, requestId, deliveryId)
  ]);
  const claims = [firstClaim, otherClaim];
  assert.equal(claims.filter(x => Boolean(x.eventId)).length, 1,
    'concurrent claims must create only one processing owner');
  assert.equal(claims.filter(x => x.inFlight).length, 1,
    'concurrent duplicate must be retryable, not acknowledged as done');
  assert.equal(inserts, 1, 'only one event insert is permitted');
  const winner = claims.find(x => x.eventId);
  const ownEvents = () => query(pool,
    `SELECT id, processed FROM dbo.webhook_events
     WHERE tenant_id = @tenantId AND request_id = @requestId`,
    { tenantId: a.tenantId, requestId });
  assert.equal((await ownEvents()).length, 1);
  await query(pool,
    'UPDATE dbo.webhook_events SET processed = 1 WHERE id = @eventId',
    { eventId: winner.eventId });
  const processedDuplicate = await claim(a, requestId, deliveryId);
  assert.equal(processedDuplicate.duplicate, true);
  assert.equal(processedDuplicate.eventId, null);
  assert.equal((await ownEvents()).length, 1);

  // Same request+delivery value belongs to each tenant independently.
  const foreignClaim = await claim(b, requestId, deliveryId);
  assert.ok(foreignClaim.eventId);
  assert.notEqual(guid(foreignClaim.eventId), guid(winner.eventId));
  assert.equal((await ownEvents()).length, 1, 'foreign-tenant event must remain invisible');

  // Unprocessed events are only reclaimable after the bounded lease expires.
  const recoveryDelivery = 'recover-' + crypto.randomBytes(6).toString('hex');
  const abandoned = await claim(a, requestId, recoveryDelivery);
  assert.ok(abandoned.eventId);
  const pending = await claim(a, requestId, recoveryDelivery);
  assert.equal(pending.inFlight, true);
  await query(pool, `
    UPDATE dbo.webhook_events
    SET updatedat = DATEADD(MINUTE, -20, SYSUTCDATETIME())
    WHERE id = @id AND processed = 0
  `, { id: abandoned.eventId });
  const reclaimed = await claim(a, requestId, recoveryDelivery);
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(guid(reclaimed.eventId), guid(abandoned.eventId));
  const latest = await query(pool,
    `SELECT id FROM dbo.webhook_events
     WHERE tenant_id = @tenantId AND request_id = @requestId
     AND JSON_VALUE(raw_data, '$.deliveryId') = @deliveryId`,
    { tenantId: a.tenantId, requestId, deliveryId: recoveryDelivery });
  assert.equal(latest.length, 1, 'stale retry must reuse the same event row');
  console.log('PASS: concurrent Evia SQL claims, retry lease, stale recovery and tenant isolation');
}

async function verifyEviaTerminalOrderingAgainstDisposableSql(pool, a, b) {
  const { processEviaWebhook } = await import('../src/api/evia/webhook.js');
  const prefix = 'terminal-' + crypto.randomBytes(6).toString('hex');
  const savedPdf = '/storage/documents/tenants/test/agreements/terminal/signed.pdf';
  const create = async (item, suffix, status, signatureStatus, signedDocument = null) => {
    const requestId = prefix + '-' + suffix;
    const agreement = await first(pool,
      `INSERT INTO agreements
         (tenant_id, renteeid, propertyid, status, signature_status,
          eviasignreference, signed_document_url, signeddate, signature_completed_at)
       OUTPUT INSERTED.id
       VALUES (@tenantId, @renteeId, @propertyId, @status,
               @signatureStatus, @requestId, @signedDocument, @signedDate, @completedAt)`,
      { tenantId: item.tenantId, renteeId: item.renteeId, propertyId: item.propertyId,
        status, signatureStatus, requestId, signedDocument,
        signedDate: status === 'signed' ? '2026-10-01' : null,
        completedAt: status === 'signed' ? '2026-10-01' : null });
    return { item, requestId, id: guid(agreement.id) };
  };
  const signed = await create(a, 'signed', 'signed', 'completed', savedPdf);
  const cancelled = await create(b, 'cancelled', 'cancelled', 'failed');
  const pending = await create(a, 'pending', 'pending_signature', 'in_progress');

  const snapshot = async record => first(pool, `
    SELECT status, signature_status, signatories_status,
           signeddate, signature_completed_at, signed_document_url, updatedat
    FROM agreements WHERE id = @agreementId AND tenant_id = @tenantId`,
  { agreementId: record.id, tenantId: record.item.tenantId });

  const send = async (record, suffix, event, status, email = null) =>
    processEviaWebhook({
      event, Status: status, RequestId: record.requestId,
      deliveryId: prefix + '-delivery-' + suffix,
      ...(email ? { Email: email, Name: 'Test Renter' } : {})
    }, { expectedAgreementId: record.id, expectedTenantId: record.item.tenantId });

  const signedBefore = await snapshot(signed);
  for (const [suffix, event, status, email] of [
    ['late-cancel', 'request.cancelled', 'cancelled', null],
    ['late-reject', 'request.rejected', 'rejected', null],
    ['late-signer', 'signatory.completed', 'completed_signatory', a.email]
  ]) {
    const result = await send(signed, suffix, event, status, email);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.updated, false, 'terminal state cannot be revised by late callback');
    assert.equal(result.body.reason, 'evia_terminal_state_immutable');
    assert.deepEqual(await snapshot(signed), signedBefore,
      'late terminal or partial callback must preserve signed PDF and immutable timestamps');
  }
  const signedEvents = await query(pool,
    'SELECT processed FROM webhook_events WHERE tenant_id = @tenantId AND request_id = @requestId',
    { tenantId: a.tenantId, requestId: signed.requestId });
  assert.equal(signedEvents.length, 3);
  assert.ok(signedEvents.every(row => Boolean(row.processed)),
    'ignored terminal events must still be logged as processed for audit');

  const cancelledBefore = await snapshot(cancelled);
  const lateComplete = await send(cancelled, 'late-complete', 'request.completed', 'completed');
  assert.equal(lateComplete.statusCode, 200);
  assert.equal(lateComplete.body.updated, false);
  assert.deepEqual(await snapshot(cancelled), cancelledBefore,
    'late completion cannot re-open a cancelled agreement or attempt PDF retention');

  const deniedByTenant = await processEviaWebhook({
    event: 'request.rejected', Status: 'rejected',
    RequestId: signed.requestId, deliveryId: prefix + '-foreign'
  }, { expectedAgreementId: signed.id, expectedTenantId: b.tenantId });
  assert.equal(deniedByTenant.statusCode, 200);
  assert.equal(deniedByTenant.body.matched, false);
  assert.deepEqual(await snapshot(signed), signedBefore);

  // A valid first terminal failure must still be accepted, then become
  // immutable against a later conflicting completion callback.
  const firstReject = await send(pending, 'first-reject', 'request.rejected', 'rejected');
  assert.equal(firstReject.statusCode, 200);
  assert.equal(firstReject.body.updated, true);
  assert.equal((await snapshot(pending)).status, 'rejected');
  const rejectedBefore = await snapshot(pending);
  const lateCompletion = await send(pending, 'later-completion', 'request.completed', 'completed');
  assert.equal(lateCompletion.statusCode, 200);
  assert.equal(lateCompletion.body.updated, false);
  assert.deepEqual(await snapshot(pending), rejectedBefore);
  console.log('PASS: Evia terminal-state monotonicity, rejected/cancelled delay, signer replay and tenant isolation');
}

async function verifyEviaArchiveAgreementLockAgainstDisposableSql(pool, a, b) {
  const { withEviaAgreementArchiveLock } = await import('../src/api/evia/archiveLock.js');
  const ref = 'archive-' + crypto.randomBytes(8).toString('hex');
  const row = await first(pool, `
    INSERT INTO dbo.agreements (tenant_id, renteeid, propertyid,
                                status, signature_status, eviasignreference)
    OUTPUT INSERTED.id
    VALUES (@tenantId, @renteeId, @propertyId,
            'pending_signature', 'in_progress', @reference)
  `, { tenantId: a.tenantId, renteeId: a.renteeId,
    propertyId: a.propertyId, reference: ref });
  const agreementId = guid(row.id);
  const storedUrl = '/storage/documents/tenants/test/agreements/archive/signed.pdf';
  let onEntered;
  const entered = new Promise(resolve => { onEntered = resolve; });
  let releaseFirst;
  const blockFirst = new Promise(resolve => { releaseFirst = resolve; });
  const lock = (tenantId, execute) => withEviaAgreementArchiveLock({
    tenantId, agreementId, requestId: ref, execute
  });

  const firstArchive = lock(a.tenantId, async latest => {
    assert.equal(guid(latest.id), agreementId);
    assert.equal(latest.signed_document_url, null);
    onEntered();
    await blockFirst;
    await query(pool, `
      UPDATE dbo.agreements
      SET signed_document_url = @storedUrl, signature_status = 'completed',
          status = 'signed'
      WHERE id = @agreementId AND tenant_id = @tenantId
    `, { storedUrl, agreementId, tenantId: a.tenantId });
    return 'stored';
  });
  await entered;
  try {
    await assert.rejects(lock(a.tenantId, async () => {
      throw new Error('second archive should never enter');
    }), error => error?.code === 'EVIA_ARCHIVE_IN_PROGRESS' && error?.status === 503);
    const unchanged = await first(pool,
      'SELECT signed_document_url FROM dbo.agreements WHERE id = @agreementId',
      { agreementId });
    assert.equal(unchanged.signed_document_url, null);
  } finally {
    releaseFirst();
  }
  assert.equal(await firstArchive, 'stored');

  let archiveCalls = 0;
  const secondDelivery = await lock(a.tenantId, async latest => {
    // Real webhook processor rechecks this URL and does not upload again.
    assert.equal(latest.signed_document_url, storedUrl);
    return { duplicate: true };
  });
  assert.equal(secondDelivery.duplicate, true);
  assert.equal(archiveCalls, 0);

  await assert.rejects(lock(b.tenantId, async () => {
    throw new Error('foreign tenant must never enter');
  }), error => error?.code === 'EVIA_ARCHIVE_AGREEMENT_NOT_FOUND');
  const failedRef = 'archive-failure-' + crypto.randomBytes(5).toString('hex');
  const another = await first(pool, `
    INSERT INTO dbo.agreements (tenant_id, renteeid, propertyid,
                                status, signature_status, eviasignreference)
    OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId,
                               'pending_signature', 'pending', @reference)
  `, { tenantId: a.tenantId, renteeId: a.renteeId,
    propertyId: a.propertyId, reference: failedRef });
  const anotherId = guid(another.id);
  const failure = new Error('disposable archive upload failed');
  const failLock = execute => withEviaAgreementArchiveLock({
    tenantId: a.tenantId, agreementId: anotherId, requestId: failedRef, execute
  });
  await assert.rejects(failLock(async () => { throw failure; }), err => err === failure);
  assert.equal(await failLock(async () => 'recovered'), 'recovered',
    'failed archive releases the SQL application lock for a retry');
  const { withEviaArchiveCapacity, getEviaArchiveCapacityStatus } =
    await import('../src/api/evia/archiveCapacity.js');
  const quiet = { info() {}, warn() {} };
  let signalEntered;
  const enteredCapacity = new Promise(resolve => { signalEntered = resolve; });
  let releaseCapacity;
  const blockingArchive = new Promise(resolve => { releaseCapacity = resolve; });
  const occupying = withEviaArchiveCapacity({
    maxConcurrent: 1, logger: quiet,
    execute: () => lock(a.tenantId, async () => {
      signalEntered();
      await blockingArchive;
      return 'first archive complete';
    })
  });
  await enteredCapacity;
  try {
    assert.equal(getEviaArchiveCapacityStatus().active, 1);
    await assert.rejects(
      withEviaArchiveCapacity({
        maxConcurrent: 1, logger: quiet,
        execute: () => lock(a.tenantId, async () => {
          throw new Error('Over-capacity request reached the MSSQL transaction');
        })
      }),
      err => err?.code === 'EVIA_ARCHIVE_CAPACITY_EXCEEDED' && err?.status === 503
    );
    // The rejected admission has not occupied an additional pool connection.
    assert.equal((await first(pool, 'SELECT 1 AS available')).available, 1);
  } finally {
    releaseCapacity();
  }
  assert.equal(await occupying, 'first archive complete');
  assert.equal(getEviaArchiveCapacityStatus().active, 0);
  assert.equal(await withEviaArchiveCapacity({
    maxConcurrent: 1, logger: quiet,
    execute: () => lock(a.tenantId, async () => 'retry allowed')
  }), 'retry allowed');
  assert.equal(getEviaArchiveCapacityStatus().active, 0);
  // Prepare the future fenced lease proof: two holders can stage the same
  // PDF name without ever targeting the same storage object. The currently
  // deployed transaction-owned archive lock remains unchanged.
  const {
    createEviaArchiveAttemptId, buildEviaCompletedDocumentPath
  } = await import('../src/api/evia/completedDocuments.js');
  const firstAttempt = createEviaArchiveAttemptId();
  const nextAttempt = createEviaArchiveAttemptId();
  const pathFor = attempt => buildEviaCompletedDocumentPath({
    tenantId: a.tenantId, agreementId, archiveAttemptId: attempt,
    documentName: 'Lease.pdf'
  });
  assert.notEqual(pathFor(firstAttempt), pathFor(nextAttempt));
  assert.ok(pathFor(firstAttempt).includes('/signed/staged/' + firstAttempt + '/'));
  const tenantBPath = buildEviaCompletedDocumentPath({
    tenantId: b.tenantId, agreementId, archiveAttemptId: nextAttempt,
    documentName: 'Lease.pdf'
  });
  assert.notEqual(tenantBPath, pathFor(nextAttempt), 'staged documents remain tenant-scoped');
  console.log('PASS: Evia agreement-scoped archival lock serializes different deliveries and recovers after failures');
}

async function verifyDormantFencedArchiveLeaseAgainstDisposableSql(pool, a, b) {
  const {
    acquireEviaArchiveLease, renewEviaArchiveLease, finalizeEviaArchiveLease,
    EVIA_ARCHIVE_LEASE_EVENT
  } = await import('../src/api/evia/archiveLease.js');
  const {
    buildEviaCompletedDocumentPath
  } = await import('../src/api/evia/completedDocuments.js');
  const insertAgreement = async (item, requestId) => {
    const row = await first(pool, `
      INSERT INTO dbo.agreements
        (tenant_id, renteeid, propertyid, eviasignreference, status, signature_status)
      OUTPUT INSERTED.id
      VALUES (@tenantId, @renteeId, @propertyId, @requestId,
              'pending_signature', 'in_progress')
    `, { tenantId: item.tenantId, renteeId: item.renteeId,
      propertyId: item.propertyId, requestId });
    return guid(row.id);
  };
  const requestId = 'lease-' + crypto.randomBytes(7).toString('hex');
  const agreementId = await insertAgreement(a, requestId);
  const identity = { tenantId: a.tenantId, agreementId, requestId };
  const eviaEvents = () => query(pool, `
    SELECT id, processed, raw_data, updatedat
    FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND event_type = @eventType
      AND request_id = @requestId
  `, { tenantId: a.tenantId, eventType: EVIA_ARCHIVE_LEASE_EVENT, requestId });
  const stage = (attemptId, name = 'Signed.pdf') => (
    '/storage/documents/' + buildEviaCompletedDocumentPath({
      tenantId: a.tenantId, agreementId, archiveAttemptId: attemptId, documentName: name
    })
  );

  // Two different delivery workers race for the same durable agreement
  // owner. SQL transactions are short and release before mocked uploading.
  const [firstClaim, rivalClaim] = await Promise.all([
    acquireEviaArchiveLease(identity), acquireEviaArchiveLease(identity)
  ]);
  const claims = [firstClaim, rivalClaim];
  const winner = claims.find(x => x.status === 'acquired');
  assert.ok(winner && winner.attemptId);
  assert.equal(claims.filter(x => x.status === 'busy').length, 1);
  assert.equal((await eviaEvents()).length, 1);
  assert.equal((await first(pool, 'SELECT 1 AS available')).available, 1,
    'after claim, an unrelated SQL query must not wait for external PDF storage');

  const wrongTenant = { ...identity, tenantId: b.tenantId };
  await assert.rejects(acquireEviaArchiveLease(wrongTenant),
    error => error?.code === 'EVIA_ARCHIVE_LEASE_AGREEMENT_NOT_FOUND');
  await assert.rejects(renewEviaArchiveLease({
    ...wrongTenant, attemptId: winner.attemptId
  }), error => error?.code === 'EVIA_ARCHIVE_LEASE_AGREEMENT_NOT_FOUND');

  const renewed = await renewEviaArchiveLease({ ...identity, attemptId: winner.attemptId });
  assert.equal(renewed.status, 'renewed');
  // Simulate worker A becoming unresponsive past the lease; worker B now
  // takes ownership without inserting a second record.
  const event = (await eviaEvents())[0];
  await query(pool, `
    UPDATE dbo.webhook_events
    SET updatedat = DATEADD(MINUTE, -18, SYSUTCDATETIME())
    WHERE id = @id
  `, { id: event.id });
  const successor = await acquireEviaArchiveLease(identity);
  assert.equal(successor.status, 'acquired');
  assert.notEqual(successor.attemptId, winner.attemptId);
  assert.equal((await eviaEvents()).length, 1);

  const stagedFiles = new Map();
  stagedFiles.set(stage(winner.attemptId), Buffer.from('old attempt pdf'));
  stagedFiles.set(stage(successor.attemptId), Buffer.from('winning pdf'));
  assert.notEqual(stage(winner.attemptId), stage(successor.attemptId));
  const losingContents = stagedFiles.get(stage(winner.attemptId)).toString();
  await assert.rejects(
    renewEviaArchiveLease({ ...identity, attemptId: winner.attemptId }),
    error => error?.code === 'EVIA_ARCHIVE_LEASE_FENCED'
  );
  await assert.rejects(
    finalizeEviaArchiveLease({
      ...identity, attemptId: winner.attemptId,
      signedDocumentUrl: stage(winner.attemptId)
    }), error => error?.code === 'EVIA_ARCHIVE_LEASE_FENCED'
  );
  assert.equal((await first(pool,
    'SELECT signed_document_url FROM dbo.agreements WHERE id = @id',
    { id: agreementId })).signed_document_url, null);
  await assert.rejects(
    finalizeEviaArchiveLease({
      ...identity, attemptId: successor.attemptId,
      signedDocumentUrl: stage(winner.attemptId)
    }), error => error?.code === 'EVIA_ARCHIVE_STAGE_URL_INVALID'
  );

  const published = await finalizeEviaArchiveLease({
    ...identity, attemptId: successor.attemptId,
    signedDocumentUrl: stage(successor.attemptId),
    auditTrailUrl: stage(successor.attemptId, 'audit_trail.pdf')
  });
  assert.equal(published.status, 'published');
  const completed = await first(pool, `
    SELECT status, signature_status, signed_document_url, signeddate,
           signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id`, { id: agreementId });
  assert.equal(completed.status, 'signed');
  assert.equal(completed.signature_status, 'completed');
  assert.equal(completed.signed_document_url, stage(successor.attemptId));
  assert.ok(completed.signeddate && completed.signature_completed_at);
  assert.equal(losingContents, 'old attempt pdf',
    'winning attempt must never overwrite the losing attempt staged content');
  assert.equal(stagedFiles.get(stage(successor.attemptId)).toString(), 'winning pdf');
  assert.equal((await eviaEvents()).length, 1);
  assert.equal((await eviaEvents())[0].processed, true);
  assert.equal((await acquireEviaArchiveLease(identity)).status, 'complete');
  await assert.rejects(
    finalizeEviaArchiveLease({
      ...identity, attemptId: winner.attemptId,
      signedDocumentUrl: stage(winner.attemptId)
    }), error => error?.code === 'EVIA_ARCHIVE_LEASE_FENCED'
  );
  const replay = await first(pool, `
    SELECT status, signature_status, signed_document_url,
           signeddate, signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id`, { id: agreementId });
  assert.deepEqual(replay, completed, 'stale attempt must not mutate completed agreement');

  // Rollback: a SQL-side failure after the agreement UPDATE must not mark
  // the lease completed or persist a signed URL; retry remains available.
  const request2 = 'lease-rollback-' + crypto.randomBytes(6).toString('hex');
  const agreement2 = await insertAgreement(a, request2);
  const secondIdentity = { tenantId: a.tenantId, agreementId: agreement2, requestId: request2 };
  const pending = await acquireEviaArchiveLease(secondIdentity);
  assert.equal(pending.status, 'acquired');
  await pool.request().batch(`
    CREATE TRIGGER dbo.archive_lease_disposable_rollback ON dbo.agreements
    AFTER UPDATE AS
    BEGIN
      IF EXISTS (SELECT 1 FROM inserted WHERE id = '${agreement2}')
        THROW 51011, 'Disposable archive publication rollback', 1;
    END
  `);
  try {
    await assert.rejects(
      finalizeEviaArchiveLease({
        ...secondIdentity, attemptId: pending.attemptId,
        signedDocumentUrl: '/storage/documents/' + buildEviaCompletedDocumentPath({
          tenantId: a.tenantId, agreementId: agreement2,
          archiveAttemptId: pending.attemptId, documentName: 'Lease.pdf'
        })
      }), /Disposable archive publication rollback/);
    const rolledBack = await first(pool, `
      SELECT status, signed_document_url FROM dbo.agreements WHERE id = @id
    `, { id: agreement2 });
    assert.equal(rolledBack.status, 'pending_signature');
    assert.equal(rolledBack.signed_document_url, null);
    const leaseRecord = await first(pool, `
      SELECT processed FROM dbo.webhook_events
      WHERE tenant_id = @tenantId AND request_id = @requestId
        AND event_type = @eventType
    `, { tenantId: a.tenantId, requestId: request2, eventType: EVIA_ARCHIVE_LEASE_EVENT });
    assert.equal(leaseRecord.processed, false);
  } finally {
    await pool.request().batch('DROP TRIGGER IF EXISTS dbo.archive_lease_disposable_rollback');
  }
  const recovered = await finalizeEviaArchiveLease({
    ...secondIdentity, attemptId: pending.attemptId,
    signedDocumentUrl: '/storage/documents/' + buildEviaCompletedDocumentPath({
      tenantId: a.tenantId, agreementId: agreement2,
      archiveAttemptId: pending.attemptId, documentName: 'Lease.pdf'
    })
  });
  assert.equal(recovered.status, 'published');
  console.log('PASS: dormant SQL-fenced Evia archive lease claims, stale takeover, immutable stages, publication and rollback');
}

async function verifyDormantEviaFencedCoordinatorAgainstDisposableSql(pool, a, b) {
  const { runDormantEviaFencedArchive, stageEviaDocumentsForFencedLease } =
    await import('../src/api/evia/archiveCoordinator.js');
  const { storeEviaWebhookCompletedDocuments } =
    await import('../src/api/evia/completedDocuments.js');
  const ref = 'coordinator-' + crypto.randomBytes(7).toString('hex');
  const row = await first(pool, `
    INSERT INTO dbo.agreements
      (tenant_id, renteeid, propertyid, eviasignreference, status, signature_status)
    OUTPUT INSERTED.id
    VALUES (@tenantId, @renteeId, @propertyId, @requestId,
            'pending_signature', 'in_progress')
  `, { tenantId: a.tenantId, renteeId: a.renteeId,
    propertyId: a.propertyId, requestId: ref });
  const identity = { tenantId: a.tenantId, agreementId: guid(row.id), requestId: ref };
  let signalEntered;
  const entered = new Promise(resolve => { signalEntered = resolve; });
  let releaseStorage;
  const blockedStorage = new Promise(resolve => { releaseStorage = resolve; });
  const writes = new Map();
  const storageDriver = {
    upload: async (bucket, relativePath, body) => {
      assert.equal(bucket, 'documents');
      writes.set(relativePath, Buffer.from(body));
      return { path: relativePath };
    }
  };
  const documents = [
    { DocumentName: 'Signed.pdf', DocumentContent: Buffer.from('signed-pdf').toString('base64') },
    { DocumentName: 'audit_trail.pdf', DocumentContent: Buffer.from('audit-pdf').toString('base64') }
  ];
  let stagingCalls = 0;
  const stageDocuments = async attempt => {
    stagingCalls++;
    signalEntered();
    // A blocked external upload does not keep the short SQL claim
    // transaction open; all other queries and competing claims may proceed.
    assert.equal((await first(pool, 'SELECT 1 AS ready')).ready, 1);
    await blockedStorage;
    return stageEviaDocumentsForFencedLease({
      ...attempt, documents,
      inlineStore: args => storeEviaWebhookCompletedDocuments({ ...args, storageDriver }),
      retrieve: async () => { throw new Error('valid inline signed PDF must not fetch Evia'); }
    });
  };
  const firstAttempt = runDormantEviaFencedArchive({ ...identity, stageDocuments });
  await entered;
  try {
    const concurrent = await runDormantEviaFencedArchive({
      ...identity, stageDocuments: async () => {
        throw new Error('in-flight rival must not stage documents');
      }
    });
    assert.deepEqual(concurrent, { status: 'busy', retryable: true });
    assert.equal((await first(pool, 'SELECT 1 AS ready')).ready, 1);
    assert.equal(writes.size, 0, 'no uploads while first fake worker remains blocked');
  } finally {
    releaseStorage();
  }
  const published = await firstAttempt;
  assert.equal(published.status, 'published');
  assert.equal(stagingCalls, 1);
  assert.equal(writes.size, 2);
  assert.ok(published.signedDocumentUrl.includes('/signed/staged/' + published.attemptId + '/'));
  assert.ok(published.auditTrailUrl.includes('/signed/staged/' + published.attemptId + '/'));
  const authoritative = await first(pool, `
    SELECT status, signature_status, signed_document_url, signeddate, signature_completed_at
    FROM dbo.agreements WHERE id = @agreementId AND tenant_id = @tenantId
  `, { agreementId: identity.agreementId, tenantId: a.tenantId });
  assert.equal(authoritative.status, 'signed');
  assert.equal(authoritative.signature_status, 'completed');
  assert.equal(authoritative.signed_document_url, published.signedDocumentUrl);
  assert.ok(authoritative.signeddate && authoritative.signature_completed_at);
  const replay = await runDormantEviaFencedArchive({
    ...identity, stageDocuments: async () => {
      throw new Error('completed replay must not upload');
    }
  });
  assert.equal(replay.status, 'complete');
  assert.equal(replay.signedDocumentUrl, published.signedDocumentUrl);
  assert.equal(writes.size, 2, 'replay must not upload or overwrite staged objects');
  await assert.rejects(
    runDormantEviaFencedArchive({
      ...identity, tenantId: b.tenantId,
      stageDocuments: async () => { throw new Error('foreign tenant must not reach storage'); }
    }),
    error => error?.code === 'EVIA_ARCHIVE_LEASE_AGREEMENT_NOT_FOUND'
  );
  console.log('PASS: dormant Evia staging coordinator with SQL claim, concurrent busy, released connection, publication and replay');
}

async function verifyDormantArchiveDeliveryAccountingAgainstSql(pool, a, b) {
  const {
    acquireEviaArchiveLease, finalizeEviaArchiveLease,
    acknowledgePublishedEviaArchiveDelivery, EVIA_ARCHIVE_LEASE_EVENT
  } = await import('../src/api/evia/archiveLease.js');
  const { buildEviaCompletedDocumentPath } =
    await import('../src/api/evia/completedDocuments.js');
  const ref = 'acct-' + crypto.randomBytes(7).toString('hex');
  const signatories = JSON.stringify([
    { name: 'Renter One', email: a.email, status: 'pending', signed_at: '2026-10-01T10:00:00Z' },
    { name: 'Manager', email: 'manager@example.invalid', status: 'pending' }
  ]);
  const row = await first(pool, `
    INSERT INTO dbo.agreements
      (tenant_id, renteeid, propertyid, eviasignreference, status, signature_status, signatories_status)
    OUTPUT INSERTED.id VALUES
      (@tenantId, @renteeId, @propertyId, @requestId, 'pending_signature', 'pending', @signatories)
  `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId, requestId: ref, signatories });
  const identity = { tenantId: a.tenantId, agreementId: guid(row.id), requestId: ref };
  const deliver = async (tenant, requestId, type = 'request.completed', status = 'completed') => {
    const event = await first(pool, `
      INSERT INTO dbo.webhook_events
        (tenant_id, request_id, event_type, event_id, raw_data, processed)
      OUTPUT INSERTED.id VALUES (@tenantId, @requestId, @eventType, 3, @rawData, 0)
    `, {
      tenantId: tenant.tenantId, requestId, eventType: type,
      rawData: JSON.stringify({ deliveryId: 'acct-' + crypto.randomBytes(6).toString('hex'), status })
    });
    return guid(event.id);
  };
  const eventId = await deliver(a, ref);
  const lease = await acquireEviaArchiveLease(identity);
  assert.equal(lease.status, 'acquired');
  const stageUrl = '/storage/documents/' + buildEviaCompletedDocumentPath({
    tenantId: a.tenantId, agreementId: identity.agreementId,
    documentName: 'Signed.pdf', archiveAttemptId: lease.attemptId
  });
  const audit = '/storage/documents/' + buildEviaCompletedDocumentPath({
    tenantId: a.tenantId, agreementId: identity.agreementId,
    documentName: 'audit_trail.pdf', archiveAttemptId: lease.attemptId
  });

  const foreignEvent = await deliver(b, ref);
  await assert.rejects(finalizeEviaArchiveLease({
    ...identity, attemptId: lease.attemptId, signedDocumentUrl: stageUrl,
    verifiedDeliveryEventId: foreignEvent
  }), error => error?.code === 'EVIA_ARCHIVE_DELIVERY_NOT_FOUND');
  assert.equal((await first(pool,
    'SELECT status FROM dbo.agreements WHERE id = @id', { id: identity.agreementId })).status, 'pending_signature');
  const foreignRequestEvent = await deliver(a, ref + '-foreign');
  await assert.rejects(finalizeEviaArchiveLease({
    ...identity, attemptId: lease.attemptId, signedDocumentUrl: stageUrl,
    verifiedDeliveryEventId: foreignRequestEvent
  }), error => error?.code === 'EVIA_ARCHIVE_DELIVERY_NOT_FOUND');
  const reservedEvent = await first(pool, `
    SELECT id FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND request_id = @requestId
      AND event_type = @eventType
  `, { tenantId: a.tenantId, requestId: ref, eventType: EVIA_ARCHIVE_LEASE_EVENT });
  await assert.rejects(finalizeEviaArchiveLease({
    ...identity, attemptId: lease.attemptId, signedDocumentUrl: stageUrl,
    verifiedDeliveryEventId: guid(reservedEvent.id)
  }), error => error?.code === 'EVIA_ARCHIVE_DELIVERY_NOT_FOUND');
  const wrongType = await deliver(a, ref, 'request.sent', 'sent');
  await query(pool, 'UPDATE dbo.webhook_events SET event_id = NULL WHERE id = @id', { id: wrongType });
  await assert.rejects(finalizeEviaArchiveLease({
    ...identity, attemptId: lease.attemptId, signedDocumentUrl: stageUrl,
    verifiedDeliveryEventId: wrongType
  }), error => error?.code === 'EVIA_ARCHIVE_DELIVERY_NOT_COMPLETED');
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: eventId })).processed, false);

  const finalized = await finalizeEviaArchiveLease({
    ...identity, attemptId: lease.attemptId, signedDocumentUrl: stageUrl,
    auditTrailUrl: audit, verifiedDeliveryEventId: eventId
  });
  assert.equal(finalized.status, 'published');
  const stored = await first(pool, `
    SELECT status, signature_status, signed_document_url, signatories_status,
      signeddate, signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id`, { id: identity.agreementId });
  assert.equal(stored.status, 'signed');
  assert.equal(stored.signature_status, 'completed');
  assert.equal(stored.signed_document_url, stageUrl);
  const completedSigners = JSON.parse(stored.signatories_status);
  assert.equal(completedSigners.length, 2);
  assert.ok(completedSigners.every(x => x.status === 'completed'));
  assert.equal(completedSigners[0].signed_at, '2026-10-01T10:00:00Z');
  assert.equal(completedSigners[0].signedAt, '2026-10-01T10:00:00Z');
  assert.ok(completedSigners[1].signed_at && completedSigners[1].signedAt);
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: eventId })).processed, true);
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: reservedEvent.id })).processed, true);

  // Simulated lost HTTP acknowledgment: a NEW verified provider callback
  // event is recorded; it may be acknowledged against the committed winner.
  const redelivery = await deliver(a, ref);
  const ack = await acknowledgePublishedEviaArchiveDelivery({
    ...identity, verifiedDeliveryEventId: redelivery
  });
  assert.equal(ack.status, 'acknowledged');
  assert.equal(ack.signedDocumentUrl, stageUrl);
  const replayAck = await acknowledgePublishedEviaArchiveDelivery({
    ...identity, verifiedDeliveryEventId: redelivery
  });
  assert.equal(replayAck.status, 'already_processed');
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: redelivery })).processed, true);
  const afterAck = await first(pool, `
    SELECT status, signature_status, signed_document_url, signatories_status,
      signeddate, signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id`, { id: identity.agreementId });
  assert.deepEqual(afterAck, stored, 'acknowledgment recovery must be strictly read-only on agreement');
  await assert.rejects(acknowledgePublishedEviaArchiveDelivery({
    ...identity, tenantId: b.tenantId, verifiedDeliveryEventId: redelivery
  }), error => error?.code === 'EVIA_ARCHIVE_LEASE_AGREEMENT_NOT_FOUND');
  await assert.rejects(acknowledgePublishedEviaArchiveDelivery({
    ...identity, verifiedDeliveryEventId: foreignEvent
  }), error => error?.code === 'EVIA_ARCHIVE_DELIVERY_NOT_FOUND');

  // A completed delivery must NEVER be acknowledged if the PDF was never
  // published: the provider needs a retry, not a false 200.
  const pendingRef = 'acct-pending-' + crypto.randomBytes(5).toString('hex');
  const pending = await first(pool, `
    INSERT INTO dbo.agreements
      (tenant_id, renteeid, propertyid, eviasignreference, status, signature_status)
    OUTPUT INSERTED.id VALUES
      (@tenantId, @renteeId, @propertyId, @requestId, 'pending_signature', 'in_progress')
  `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId, requestId: pendingRef });
  const pendingIdentity = { tenantId: a.tenantId, agreementId: guid(pending.id), requestId: pendingRef };
  const pendingEvent = await deliver(a, pendingRef);
  await acquireEviaArchiveLease(pendingIdentity);
  await assert.rejects(acknowledgePublishedEviaArchiveDelivery({
    ...pendingIdentity, verifiedDeliveryEventId: pendingEvent
  }), error => error?.code === 'EVIA_ARCHIVE_PUBLICATION_NOT_PROVEN');
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: pendingEvent })).processed, false);
  console.log('PASS: fenced Evia delivery event atomic publication, retained signatories and HTTP-ack recovery');
}

async function verifyEviaFencedCanaryAgainstDisposableSql(pool, a, b) {
  const { processEviaWebhook } = await import('../src/api/evia/webhook.js');
  const {
    stageEviaDocumentsForFencedLease
  } = await import('../src/api/evia/archiveCoordinator.js');
  const { storeEviaWebhookCompletedDocuments } =
    await import('../src/api/evia/completedDocuments.js');
  const ref = 'canary-' + crypto.randomBytes(7).toString('hex');
  const signers = JSON.stringify([
    { email: a.email, name: 'Tenant', status: 'pending' },
    { name: 'Owner', status: 'pending' }
  ]);
  const row = await first(pool, `
    INSERT INTO dbo.agreements
      (tenant_id, renteeid, propertyid, eviasignreference,
       status, signature_status, signatories_status)
    OUTPUT INSERTED.id VALUES
      (@tenantId, @renteeId, @propertyId, @requestId,
       'pending_signature', 'in_progress', @signers)
  `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId,
    requestId: ref, signers });
  const agreementId = guid(row.id);
  const env = {
    EVIA_FENCED_ARCHIVE_MODE: 'canary',
    EVIA_FENCED_ARCHIVE_CANARY_TENANTS: a.tenantId,
    EVIA_FENCED_ARCHIVE_CANARY_AGREEMENTS: agreementId
  };
  const uploads = new Map();
  const storageDriver = {
    upload: async (bucket, key, body) => {
      assert.equal(bucket, 'documents');
      assert.ok(key.includes('/signed/staged/'));
      uploads.set(key, Buffer.from(body));
      return { path: key };
    }
  };
  const docs = [
    { DocumentName: 'Signed.pdf', DocumentContent: Buffer.from('evia signed').toString('base64') },
    { DocumentName: 'audit_trail.pdf', DocumentContent: Buffer.from('evia audit').toString('base64') }
  ];
  const payload = {
    RequestId: ref, EventId: 3, event: 'request.completed', Status: 'completed',
    deliveryId: 'canary-delivery-' + crypto.randomBytes(8).toString('hex'),
    Documents: docs
  };
  const options = {
    expectedAgreementId: agreementId, expectedTenantId: a.tenantId,
    verifiedRequest: true, fencedCanaryEnv: env,
    fencedCanaryStage: args => stageEviaDocumentsForFencedLease({
      ...args,
      inlineStore: inputs => storeEviaWebhookCompletedDocuments({
        ...inputs, storageDriver
      }),
      retrieve: async () => { throw new Error('Inline signed pair should be authoritative'); }
    })
  };

  // A busy archive must not be falsely acknowledged. Its unprocessed
  // delivery claim is made reclaimable immediately.
  const busy = await processEviaWebhook(payload, {
    ...options, fencedCanaryRunner: async () => ({ status: 'busy' })
  });
  assert.equal(busy.statusCode, 503);
  assert.equal(busy.body.code, 'EVIA_FENCED_ARCHIVE_RETRY');
  assert.equal(uploads.size, 0);
  const staleClaim = await first(pool, `
    SELECT processed, updatedat FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND request_id = @requestId
      AND event_type = 'request.completed'
  `, { tenantId: a.tenantId, requestId: ref });
  assert.equal(staleClaim.processed, false);
  assert.ok(Date.now() - new Date(staleClaim.updatedat).getTime() > 15 * 60 * 1000);

  const accepted = await processEviaWebhook(payload, options);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.archiveTransport, 'fenced_canary');
  assert.equal(accepted.body.updated, true);
  assert.equal(uploads.size, 2);
  const completed = await first(pool, `
    SELECT status, signature_status, signatories_status, signed_document_url,
           signeddate, signature_completed_at, updatedat
    FROM dbo.agreements
    WHERE id = @id AND tenant_id = @tenantId
  `, { id: agreementId, tenantId: a.tenantId });
  assert.equal(completed.status, 'signed');
  assert.equal(completed.signature_status, 'completed');
  assert.ok(completed.signed_document_url.includes('/signed/staged/'));
  assert.ok(JSON.parse(completed.signatories_status).every(x => x.status === 'completed'));
  assert.ok(completed.signeddate && completed.signature_completed_at);
  const events = await query(pool, `
    SELECT event_type, processed, raw_data FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND request_id = @requestId
  `, { tenantId: a.tenantId, requestId: ref });
  assert.equal(events.length, 4, 'provider delivery, durable lease, immutable attempt and publication rows');
  assert.ok(events.every(x => Boolean(x.processed)));
  const lease = events.find(x => x.event_type === 'evia.archive.lease.v1');
  assert.ok(lease);
  assert.ok(JSON.parse(lease.raw_data).auditTrailUrl.includes('/signed/staged/'));
  assert.equal(events.filter(x => x.event_type === 'evia.archive.attempt.v1').length, 1);
  assert.equal(events.filter(x => x.event_type === 'evia.archive.publication.v1').length, 1);

  const replay = await processEviaWebhook(payload, options);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.body.updated, false);
  assert.equal(uploads.size, 2, 'same provider delivery cannot upload twice');
  const otherDelivery = await processEviaWebhook({
    ...payload, deliveryId: 'other-' + crypto.randomBytes(8).toString('hex')
  }, options);
  assert.equal(otherDelivery.statusCode, 200);
  assert.equal(otherDelivery.body.updated, false);
  assert.equal(uploads.size, 2);
  const unchanged = await first(pool, `
    SELECT status, signature_status, signatories_status, signed_document_url,
           signeddate, signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id AND tenant_id = @tenantId
  `, { id: agreementId, tenantId: a.tenantId });
  assert.deepEqual(unchanged, completed);

  // The canary is scoped to a token-verified tenant+agreement; a callback
  // purporting to be another tenant must not resolve or mutate this row.
  const foreign = await processEviaWebhook({
    ...payload, deliveryId: 'foreign-' + crypto.randomBytes(6).toString('hex')
  }, { ...options, expectedTenantId: b.tenantId });
  assert.equal(foreign.statusCode, 200);
  assert.equal(foreign.body.matched, false);
  assert.equal(uploads.size, 2);
  console.log('PASS: authenticated-scope canary policy routes real disposable SQL event claims to fenced PDF publishing and replay');
}

async function verifyExpiredEviaWorkerStagingRaceAgainstSql(pool, a, b) {
  const { runDormantEviaFencedArchive, stageEviaDocumentsForFencedLease } =
    await import('../src/api/evia/archiveCoordinator.js');
  const {
    acquireEviaArchiveLease, acknowledgePublishedEviaArchiveDelivery,
    EVIA_ARCHIVE_LEASE_EVENT
  } = await import('../src/api/evia/archiveLease.js');
  const { storeEviaWebhookCompletedDocuments } =
    await import('../src/api/evia/completedDocuments.js');
  const { reviewEviaStagedObject, EVIA_STAGE_REVIEW_MIN_AGE_MS } =
    await import('../src/api/evia/stagedOrphanReview.js');

  const ref = 'expired-race-' + crypto.randomBytes(7).toString('hex');
  const agreement = await first(pool, `
    INSERT INTO dbo.agreements
      (tenant_id, renteeid, propertyid, eviasignreference, status,
       signature_status, signatories_status)
    OUTPUT INSERTED.id VALUES
      (@tenantId, @renteeId, @propertyId, @requestId, 'pending_signature',
       'in_progress', '[]')
  `, { tenantId: a.tenantId, renteeId: a.renteeId,
    propertyId: a.propertyId, requestId: ref });
  const identity = { tenantId: a.tenantId, agreementId: guid(agreement.id), requestId: ref };
  const delivery = async worker => {
    const row = await first(pool, `
      INSERT INTO dbo.webhook_events
        (tenant_id, request_id, event_type, event_id, raw_data, processed)
      OUTPUT INSERTED.id
      VALUES (@tenantId, @requestId, 'request.completed', 3, @rawData, 0)
    `, { tenantId: a.tenantId, requestId: ref,
      rawData: JSON.stringify({ status: 'completed', deliveryId: worker + '-' + crypto.randomBytes(5).toString('hex') }) });
    return guid(row.id);
  };
  const deliveryA = await delivery('A');
  const deliveryB = await delivery('B');
  const documents = [
    { DocumentName: 'Signed.pdf', DocumentContent: Buffer.from('immutable signed').toString('base64') },
    { DocumentName: 'audit_trail.pdf', DocumentContent: Buffer.from('audit evidence').toString('base64') }
  ];
  const staged = new Map();
  const attempts = new Map();
  const storageDriver = {
    upload: async (bucket, key, body) => {
      assert.equal(bucket, 'documents');
      assert.ok(key.includes('/signed/staged/'));
      assert.equal(staged.has(key), false, 'staging must never overwrite an existing object');
      staged.set(key, Buffer.from(body));
      return { path: key };
    }
  };
  const store = async params => stageEviaDocumentsForFencedLease({
    ...params, documents,
    inlineStore: args => storeEviaWebhookCompletedDocuments({ ...args, storageDriver }),
    retrieve: async () => { throw new Error('Evia inline pair must be retained'); }
  });
  let signalFirstEntered;
  const firstEntered = new Promise(resolve => { signalFirstEntered = resolve; });
  let releaseFirst;
  const blockedUpload = new Promise(resolve => { releaseFirst = resolve; });

  const firstWorker = runDormantEviaFencedArchive({
    ...identity, verifiedDeliveryEventId: deliveryA,
    stageDocuments: async args => {
      attempts.set('A', args.attemptId);
      signalFirstEntered();
      await blockedUpload; // A loses its SQL lease while the external operation is paused
      return store(args);
    }
  });
  await firstEntered;
  try {
    const busy = await acquireEviaArchiveLease(identity);
    assert.equal(busy.status, 'busy');
    assert.equal((await first(pool, 'SELECT 1 AS available')).available, 1,
      'blocked external I/O must not pin a SQL connection');
    // Simulate a process that cannot renew while storage is stalled.
    const leaseRecord = await first(pool, `
      SELECT id FROM dbo.webhook_events
      WHERE tenant_id = @tenantId AND request_id = @requestId
        AND event_type = @eventType
    `, { tenantId: a.tenantId, requestId: ref, eventType: EVIA_ARCHIVE_LEASE_EVENT });
    await query(pool, `
      UPDATE dbo.webhook_events
      SET updatedat = DATEADD(MINUTE, -18, SYSUTCDATETIME())
      WHERE id = @id
    `, { id: leaseRecord.id });

    const publishedB = await runDormantEviaFencedArchive({
      ...identity, verifiedDeliveryEventId: deliveryB,
      stageDocuments: async args => {
        attempts.set('B', args.attemptId);
        return store(args);
      }
    });
    assert.equal(publishedB.status, 'published');
    assert.notEqual(attempts.get('A'), attempts.get('B'));
    assert.equal(staged.size, 2, 'only B has stored documents before delayed A resumes');
    const accepted = await first(pool, `
      SELECT id, tenant_id, status, signature_status, signed_document_url,
             signeddate, signature_completed_at, updatedat
      FROM dbo.agreements WHERE id = @agreementId AND tenant_id = @tenantId
    `, { agreementId: identity.agreementId, tenantId: a.tenantId });
    assert.equal(accepted.status, 'signed');
    assert.equal(accepted.signed_document_url, publishedB.signedDocumentUrl);
    assert.equal((await first(pool,
      'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: deliveryB })).processed, true);
    assert.equal((await first(pool,
      'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: deliveryA })).processed, false);
  } finally {
    releaseFirst();
  }
  await assert.rejects(firstWorker,
    error => error?.code === 'EVIA_ARCHIVE_LEASE_FENCED',
    'old owner must fail after uploading into its own immutable prefix');

  const urls = [...staged.keys()];
  assert.equal(urls.length, 4, 'both owners may upload but never to the same key');
  assert.equal(new Set(urls).size, 4);
  const latest = await first(pool, `
    SELECT id, tenant_id, status, signature_status, signed_document_url,
           signeddocumenturl, signature_pdf_url, signeddate, signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @agreementId AND tenant_id = @tenantId
  `, { agreementId: identity.agreementId, tenantId: a.tenantId });
  assert.ok(latest.signed_document_url.includes('/signed/staged/' + attempts.get('B') + '/'));
  assert.equal(staged.get(latest.signed_document_url.replace(/^\/storage\/documents\//, '')).toString(),
    'immutable signed');
  const audited = await first(pool, `
    SELECT raw_data, processed FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND request_id = @requestId
      AND event_type = @eventType
  `, { tenantId: a.tenantId, requestId: ref, eventType: EVIA_ARCHIVE_LEASE_EVENT });
  const auditUrl = JSON.parse(audited.raw_data).auditTrailUrl;
  assert.ok(auditUrl.includes('/signed/staged/' + attempts.get('B') + '/'));
  // Immutable history survives canonical lease takeover. Both claims and
  // B's winning publication are separate INSERT-only SQL records.
  const journal = await query(pool, `
    SELECT event_type, processed, raw_data
    FROM dbo.webhook_events
    WHERE tenant_id = @tenantId AND request_id = @requestId
      AND event_type IN (@claimEvent, @publicationEvent)
    ORDER BY createdat, id
  `, { tenantId: a.tenantId, requestId: ref,
    claimEvent: 'evia.archive.attempt.v1',
    publicationEvent: 'evia.archive.publication.v1' });
  assert.equal(journal.length, 3, 'two distinct lease claims and one winner publication retained');
  assert.ok(journal.every(row => Boolean(row.processed)));
  const claims = journal.filter(row => row.event_type === 'evia.archive.attempt.v1')
    .map(row => JSON.parse(row.raw_data));
  assert.deepEqual(new Set(claims.map(row => row.attemptId)),
    new Set([attempts.get('A'), attempts.get('B')]));
  assert.ok(claims.some(row => row.attemptId === attempts.get('A') && !row.priorAttemptId));
  assert.ok(claims.some(row => row.attemptId === attempts.get('B')
    && row.priorAttemptId === attempts.get('A')));
  const publication = JSON.parse(journal.find(row =>
    row.event_type === 'evia.archive.publication.v1').raw_data);
  assert.equal(publication.attemptId, attempts.get('B'));
  assert.equal(publication.auditTrailUrl, auditUrl);
  assert.equal(publication.signedDocumentUrl, latest.signed_document_url);
  const now = new Date('2026-12-15T00:00:00Z');
  const old = new Date(now.getTime() - EVIA_STAGE_REVIEW_MIN_AGE_MS - 86_400_000);
  const baseReview = { tenantId: a.tenantId, agreementId: identity.agreementId,
    agreement: latest, lease: audited, now, lastModified: old };
  assert.deepEqual(reviewEviaStagedObject({
    ...baseReview, attemptId: attempts.get('B'), objectUrl: latest.signed_document_url
  }).status, 'protected');
  assert.equal(reviewEviaStagedObject({
    ...baseReview, attemptId: attempts.get('B'), objectUrl: auditUrl
  }).reason, 'retained_or_audit_document');
  const staleUrl = '/storage/documents/' + urls.find(path =>
    path.includes('/signed/staged/' + attempts.get('A') + '/') && path.endsWith('/Signed.pdf'));
  const review = reviewEviaStagedObject({
    ...baseReview, attemptId: attempts.get('A'), objectUrl: staleUrl
  });
  assert.equal(review.status, 'manual_review_candidate');
  assert.equal(review.mayDelete, false, 'orphan review is never an automatic delete approval');
  assert.equal(reviewEviaStagedObject({
    ...baseReview, attemptId: attempts.get('A'), objectUrl: staleUrl,
    lastModified: new Date(now.getTime() - 60_000)
  }).status, 'protected');
  assert.equal(reviewEviaStagedObject({
    ...baseReview, attemptId: attempts.get('A'), objectUrl: staleUrl, tenantId: b.tenantId
  }).status, 'protected');

  const beforeRecovery = await first(pool, `
    SELECT status, signature_status, signed_document_url, signeddate,
           signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id
  `, { id: identity.agreementId });
  const recovery = await acknowledgePublishedEviaArchiveDelivery({
    ...identity, verifiedDeliveryEventId: deliveryA
  });
  assert.equal(recovery.status, 'acknowledged');
  assert.equal((await first(pool,
    'SELECT processed FROM dbo.webhook_events WHERE id = @id', { id: deliveryA })).processed, true);
  const afterRecovery = await first(pool, `
    SELECT status, signature_status, signed_document_url, signeddate,
           signature_completed_at, updatedat
    FROM dbo.agreements WHERE id = @id
  `, { id: identity.agreementId });
  assert.deepEqual(afterRecovery, beforeRecovery,
    'post-commit recovery must preserve original winning PDF and completion timestamps');
  console.log('PASS: Evia A expired, B publishes, A late upload cannot overwrite/commit, orphan review read-only, replay acknowledges');
}

async function fixture(pool, label, rent, water) {
  const suffix = crypto.randomBytes(6).toString('hex');
  const tenant = await first(pool,
    "INSERT INTO tenants (name, slug, status, [plan]) OUTPUT INSERTED.id VALUES (@name, @slug, 'active', 'test')",
    { name: label, slug: 'sqlbilling-' + suffix });
  const tenantId = guid(tenant.id);
  const property = await first(pool,
    "INSERT INTO properties (tenant_id, name, status) OUTPUT INSERTED.id VALUES (@tenantId, @name, 'available')",
    { tenantId, name: label + ' Property' });
  const propertyId = guid(property.id);
  const rentee = await first(pool,
    "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, @name, @email, 'rentee', 'rentee')",
    { tenantId, name: label + ' Rentee', email: 'sqlbilling-' + suffix + '@example.invalid' });
  const renteeId = guid(rentee.id);
  await query(pool,
    "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @renteeId, 'rentee', 'active', 1)",
    { tenantId, renteeId });
  const agreement = await first(pool,
    "INSERT INTO agreements (tenant_id, renteeid, propertyid, status, rentamount, startdate) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'active', @rent, '2026-01-01')",
    { tenantId, renteeId, propertyId, rent });
  const reading = await first(pool,
    "INSERT INTO utility_readings (tenant_id, renteeid, propertyid, utilitytype, readingdate, calculatedbill, status, billing_status) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'water', '2026-09-20', @water, 'approved', 'pending_invoice')",
    { tenantId, renteeId, propertyId, water });
  return { tenantId, propertyId, renteeId, email: 'sqlbilling-' + suffix + '@example.invalid', agreementId: guid(agreement.id),
    readingId: guid(reading.id), expected: rent + water };
}

async function verify(pool, item) {
  const invoices = await query(pool,
    "SELECT * FROM invoices WHERE tenant_id = @tenantId AND agreementid = @agreementId AND billingperiod = '2026-10'", item);
  assert.equal(invoices.length, 1, 'exactly one invoice per agreement and period');
  const invoice = invoices[0];
  assert.equal(guid(invoice.tenant_id), item.tenantId);
  assert.equal(guid(invoice.propertyid), item.propertyId);
  assert.equal(guid(invoice.renteeid), item.renteeId);
  assert.equal(String(invoice.status), 'draft');
  assert.equal(Number(invoice.totalamount), item.expected);
  const reading = await first(pool,
    'SELECT * FROM utility_readings WHERE tenant_id = @tenantId AND id = @readingId', item);
  assert.equal(guid(reading.invoice_id), guid(invoice.id));
  assert.equal(guid(reading.propertyid), item.propertyId);
  assert.equal(reading.billing_status, 'invoiced');
  const components = await query(pool,
    'SELECT * FROM invoice_components WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
    { tenantId: item.tenantId, invoiceId: invoice.id });
  assert.equal(components.reduce((sum, row) => sum + Number(row.amount), 0), item.expected);
  assert.ok(components.some(row => row.component_type === 'rent'));
  assert.ok(components.some(row => row.component_type === 'water'));
  const events = await query(pool,
    'SELECT * FROM billing_lifecycle_events WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
    { tenantId: item.tenantId, invoiceId: invoice.id });
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'invoice_drafted');
  return guid(invoice.id);
}

// Seed synthetic payment history directly into the disposable fixture only.
// This proves authenticated account/receipt READ behavior, not payment creation.
async function seedAccountHistory(pool, item, invoiceId, tag, verifiedAmount, pendingAmount) {
  const verified = await first(pool,
    `INSERT INTO payments
       (tenant_id, invoiceid, propertyid, renteeid, amount, paymentmethod,
        transactionreference, paymentdate, status)
     OUTPUT INSERTED.id
     VALUES (@tenantId, @invoiceId, @propertyId, @renteeId, @amount,
             'bank_transfer', @reference, '2026-10-05', 'verified')`,
    { tenantId: item.tenantId, invoiceId, propertyId: item.propertyId,
      renteeId: item.renteeId, amount: verifiedAmount,
      reference: 'FIXTURE-' + tag + '-VERIFIED' });
  await query(pool,
    `INSERT INTO payments
       (tenant_id, invoiceid, propertyid, renteeid, amount,
        paymentmethod, transactionreference, paymentdate, status)
     VALUES (@tenantId, @invoiceId, @propertyId, @renteeId, @amount,
             'bank_transfer', @reference, '2026-10-06', 'pending')`,
    { tenantId: item.tenantId, invoiceId, propertyId: item.propertyId,
      renteeId: item.renteeId, amount: pendingAmount,
      reference: 'FIXTURE-' + tag + '-PENDING' });
  item.receiptNumber = 'TEST-RECEIPT-' + tag;
  item.outstanding = item.expected - verifiedAmount;
  item.verifiedAmount = verifiedAmount;
  item.pendingAmount = pendingAmount;
  await query(pool,
    `INSERT INTO payment_receipts
       (tenant_id, invoice_id, payment_id, receipt_number, amount)
     VALUES (@tenantId, @invoiceId, @paymentId, @receiptNumber, @amount)`,
    { tenantId: item.tenantId, invoiceId, paymentId: verified.id,
      receiptNumber: item.receiptNumber, amount: verifiedAmount });
}


/**
 * Phase 4 acceptance on the disposable SQL Server already used by billing.
 * Exercise the real parameterized notification access contracts against two
 * tenant/user fixtures and inspect actual maintenance image metadata scope.
 * No shared/production database is contacted.
 */
async function verifyMaintenanceNotificationIsolationAgainstDisposableSql(pool, a, b) {
  const {
    listOwnNotificationPage,
    markOwnNotificationRead,
    requireNotificationTenantRecipient
  } = await import('../src/api/platform/notificationAccess.js');
  const {
    authorizeMaintenanceImageAttachment,
    normalizeMaintenanceImageUrl
  } = await import('../src/api/platform/maintenanceImagePolicy.js');
  const run = (statement, params) => query(pool, statement, params);
  const one = (statement, params) => first(pool, statement, params);

  const nA = await first(pool,
    `INSERT INTO notifications (tenant_id, user_id, message)
     OUTPUT INSERTED.id VALUES (@tenantId, @userId, 'Tenant A private notification')`,
    { tenantId: a.tenantId, userId: a.renteeId });
  const nB = await first(pool,
    `INSERT INTO notifications (tenant_id, user_id, message)
     OUTPUT INSERTED.id VALUES (@tenantId, @userId, 'Tenant B private notification')`,
    { tenantId: b.tenantId, userId: b.renteeId });
  const idA = guid(nA.id), idB = guid(nB.id);
  for (const [own, foreignId] of [[a, idB], [b, idA]]) {
    const rows = await listOwnNotificationPage({
      tenantId: own.tenantId, userId: own.renteeId,
      page: 1, pageSize: 100, query: run
    });
    assert.equal(rows.length, 1);
    assert.equal(guid(rows[0].id), own === a ? idA : idB);
    assert.ok(!rows.some(row => guid(row.id) === foreignId));
  }
  // Same tenant, different user must not be allowed to mark the notification.
  await assert.rejects(() => markOwnNotificationRead({
    tenantId: a.tenantId, userId: b.renteeId,
    notificationId: idA, queryOne: one
  }), error => error.code === 'NOTIFICATION_NOT_FOUND');
  // Foreign organization, even with the same owner ID, also must not update.
  await assert.rejects(() => markOwnNotificationRead({
    tenantId: b.tenantId, userId: a.renteeId,
    notificationId: idA, queryOne: one
  }), error => error.code === 'NOTIFICATION_NOT_FOUND');
  assert.equal((await first(pool, 'SELECT is_read FROM notifications WHERE id = @id', { id: idA })).is_read, false);
  const updated = await markOwnNotificationRead({
    tenantId: a.tenantId, userId: a.renteeId,
    notificationId: idA, queryOne: one
  });
  assert.equal(guid(updated.id), idA);
  assert.equal(Boolean(updated.is_read), true);
  assert.equal(Boolean((await first(pool, 'SELECT is_read FROM notifications WHERE id = @id', { id: idB })).is_read), false);

  assert.equal(await requireNotificationTenantRecipient({
    tenantId: a.tenantId, userId: a.renteeId, queryOne: one
  }), true);
  await assert.rejects(() => requireNotificationTenantRecipient({
    tenantId: a.tenantId, userId: b.renteeId, queryOne: one
  }), error => error.code === 'NOTIFICATION_RECIPIENT_SCOPE_DENIED');

  const requestA = await first(pool,
    `INSERT INTO maintenance_requests (tenant_id, propertyid, renteeid, title, description)
     OUTPUT INSERTED.* VALUES (@tenantId, @propertyId, @renteeId, 'Fixture A', 'Private maintenance request')`,
    a);
  const requestB = await first(pool,
    `INSERT INTO maintenance_requests (tenant_id, propertyid, renteeid, title, description)
     OUTPUT INSERTED.* VALUES (@tenantId, @propertyId, @renteeId, 'Fixture B', 'Private maintenance request')`,
    b);
  const reqA = guid(requestA.id), reqB = guid(requestB.id);
  assert.equal(authorizeMaintenanceImageAttachment({
    user: { id: a.renteeId }, request: requestA,
    isTenant: true, canManage: false, canUpdateAssigned: false, hasPropertyScope: false
  }), true);
  assert.equal(authorizeMaintenanceImageAttachment({
    user: { id: b.renteeId }, request: requestA,
    isTenant: true, canManage: false, canUpdateAssigned: false, hasPropertyScope: false
  }), false);
  const ownPath = `/storage/images/tenants/${a.tenantId}/maintenance/test-fixture.jpg`;
  assert.equal(normalizeMaintenanceImageUrl({
    value: ownPath, tenantId: a.tenantId, requestHost: 'localhost:5174'
  }), ownPath);
  assert.equal(normalizeMaintenanceImageUrl({
    value: ownPath, tenantId: b.tenantId, requestHost: 'localhost:5174'
  }), null);
  await query(pool,
    `INSERT INTO maintenance_request_images
       (tenant_id, maintenance_request_id, image_url, image_type, uploaded_by)
     VALUES (@tenantId, @requestId, @imageUrl, 'initial', @userId)`,
    { tenantId: a.tenantId, requestId: reqA, imageUrl: ownPath, userId: a.renteeId });
  assert.equal((await query(pool,
    'SELECT id FROM maintenance_request_images WHERE tenant_id = @tenantId AND maintenance_request_id = @requestId',
    { tenantId: a.tenantId, requestId: reqA })).length, 1);
  assert.equal((await query(pool,
    'SELECT id FROM maintenance_request_images WHERE tenant_id = @tenantId AND maintenance_request_id = @requestId',
    { tenantId: b.tenantId, requestId: reqA })).length, 0);
  assert.equal((await query(pool,
    'SELECT id FROM maintenance_request_images WHERE tenant_id = @tenantId AND maintenance_request_id = @requestId',
    { tenantId: a.tenantId, requestId: reqB })).length, 0);
  console.log('PASS: disposable two-tenant notification owner/tenant read, read-state and active-recipient isolation; maintenance image actor, tenant and request scope');
  return { notificationA: idA, notificationB: idB, requestA: reqA, requestB: reqB };
}

async function main() {
  const name = 'khrental-billing-test-' + process.pid + '-' + Date.now();
  const password = 'SqlTest!' + crypto.randomBytes(18).toString('base64url') + '9a';
  const database = 'billingproof_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  let started = false, master, pool, closeMssqlPool, httpServer, browser, vite;
  try {
    docker(['run', '-d', '--name', name, '-e', 'ACCEPT_EULA=Y',
      '-e', 'MSSQL_PID=Developer', '-e', 'MSSQL_SA_PASSWORD=' + password,
      '-p', '127.0.0.1::1433',
      process.env.MSSQL_TEST_IMAGE || 'mcr.microsoft.com/mssql/server:2022-latest']);
    started = true;
    const published = docker(['port', name, '1433/tcp']);
    const match = published.match(/:(\d+)\s*$/);
    assert.ok(match, 'test SQL Server port must be published on loopback');
    const port = Number(match[1]);
    for (let attempt = 0; attempt < 45; attempt++) {
      try { master = await connect({ port, password }); break; }
      catch (err) { if (attempt === 44) throw err; await delay(2000); }
    }
    await master.request().query('CREATE DATABASE [' + database + ']');
    await master.close();
    master = null;
    pool = await connect({ port, password, database });
    for (const filename of [
      '20260913_00_create_fresh_mssql_schema.sql',
      '20260916_02_add_staff_permission_bundles.sql',
      '20260916_04_add_billing_payment_lifecycle.sql',
      '20260920_01_add_tenancy_billing_adjustments.sql',
      '20261005_01_add_property_utility_configs.sql'
    ]) {
      await pool.request().batch(fs.readFileSync(path.resolve('migrations', filename), 'utf8'));
    }

    process.env.MSSQL_SERVER = '127.0.0.1';
    process.env.MSSQL_PORT = String(port);
    process.env.MSSQL_DATABASE = database;
    process.env.MSSQL_USER = 'sa';
    process.env.MSSQL_PASSWORD = password;
    process.env.MSSQL_AUTHENTICATION = 'sql-password';
    process.env.MSSQL_ENCRYPT = 'false';
    process.env.MSSQL_TRUST_SERVER_CERTIFICATE = 'true';
    const { generateMonthlyInvoicesForTenant } = await import('../src/api/platform/monthlyBillingService.js');
    ({ closeMssqlPool } = await import('../src/api/mssql/pool.js'));
    const a = await fixture(pool, 'Tenant A', 2000, 125);
    const b = await fixture(pool, 'Tenant B', 3000, 225);
    const phase4Seeded = await verifyMaintenanceNotificationIsolationAgainstDisposableSql(pool, a, b);
    const generate = tenantId => generateMonthlyInvoicesForTenant({
      tenantId, billingPeriod: '2026-10', source: 'test', authorizeProperty: () => {}
    });
    const resultA = await generate(a.tenantId);
    assert.deepEqual(resultA.errors, []);
    assert.equal(resultA.created.length, 1);
    const invoiceA = await verify(pool, a);

    const beforeB = await first(pool,
      'SELECT invoice_id, billing_status FROM utility_readings WHERE tenant_id = @tenantId AND id = @readingId', b);
    assert.equal(beforeB.invoice_id, null, 'tenant A must not invoice tenant B reading');
    assert.equal(beforeB.billing_status, 'pending_invoice');
    assert.equal((await query(pool, 'SELECT id FROM invoices WHERE tenant_id = @tenantId', b)).length, 0);
    const repeatA = await generate(a.tenantId);
    assert.equal(repeatA.created.length, 0);
    assert.ok(repeatA.skipped.some(row => row.reason === 'already_exists'));
    const foreignAgreement = await generateMonthlyInvoicesForTenant({
      tenantId: a.tenantId, billingPeriod: '2026-10', agreementId: b.agreementId,
      authorizeProperty: () => {}
    });
    assert.equal(foreignAgreement.created.length, 0);
    assert.deepEqual(foreignAgreement.errors, []);

    const resultB = await generate(b.tenantId);
    assert.deepEqual(resultB.errors, []);
    assert.equal(resultB.created.length, 1);
    const invoiceB = await verify(pool, b);
    assert.notEqual(invoiceA, invoiceB);
    const repeatB = await generate(b.tenantId);
    assert.equal(repeatB.created.length, 0);
    assert.ok(repeatB.skipped.some(row => row.reason === 'already_exists'));

    const { getInvoiceById, listInvoices } = await import('../src/api/mssql/repositories.js');
    assert.equal(await getInvoiceById(invoiceB, a.tenantId), null);
    assert.equal(await getInvoiceById(invoiceA, b.tenantId), null);
    assert.equal((await listInvoices({ tenantId: a.tenantId })).length, 1);
    assert.equal((await listInvoices({ tenantId: b.tenantId })).length, 1);
    assert.equal((await query(pool,
      'SELECT id FROM utility_readings WHERE tenant_id = @tenantId AND invoice_id = @invoiceId',
      { tenantId: a.tenantId, invoiceId: invoiceB })).length, 0);

    await verifyManualSigningAgainstDisposableSql(pool, a, b);
    await verifyEviaProcessedDeliveryAgainstDisposableSql(pool, a, b);
    await verifyEviaConcurrentClaimAgainstDisposableSql(pool, a, b);
    await verifyEviaTerminalOrderingAgainstDisposableSql(pool, a, b);
    await verifyEviaArchiveAgreementLockAgainstDisposableSql(pool, a, b);
    await verifyDormantFencedArchiveLeaseAgainstDisposableSql(pool, a, b);
    await verifyDormantEviaFencedCoordinatorAgainstDisposableSql(pool, a, b);
    await verifyDormantArchiveDeliveryAccountingAgainstSql(pool, a, b);
    await verifyEviaFencedCanaryAgainstDisposableSql(pool, a, b);
    await verifyExpiredEviaWorkerStagingRaceAgainstSql(pool, a, b);

    // Exercise real bearer sessions and actual HTTP routing over loopback,
    // never development identity headers or externally configured SQL.
    const { createAuthRecord, issueAuthSession, createSessionAuthMiddleware } =
      await import('../src/api/auth/index.js');
    const { createPlatformRouter } = await import('../src/api/platform/router.js');
    const { createBillingRouter } = await import('../src/api/platform/billingRouter.js');
    const { createMaintenanceLifecycleRouter } = await import('../src/api/platform/maintenanceLifecycleRouter.js');
    const { createNotificationSelfRouter } = await import('../src/api/platform/notificationSelfRouter.js');
    const { createUtilityReviewRouter } = await import('../src/api/platform/utilityReviewRouter.js');
    const { createMssqlRouter } = await import('../src/api/mssql/router.js');
    const { guardBillingMssqlCompatibility } =
      await import('../src/api/platform/billingMutationGuard.js');
    const auth = async item => {
      // Reproduce the real auth identity -> app_users profile relationship.
      // An authenticated browser must resolve profileId via the server, not a
      // fabricated browser-local ID or a development bypass.
      const authId = crypto.randomUUID();
      const record = await createAuthRecord({
        authId,
        appUserId: item.renteeId,
        email: item.email,
        role: 'rentee',
        password: crypto.randomBytes(24).toString('base64url')
      });
      const linked = await query(pool,
        'UPDATE app_users SET auth_id = @authId OUTPUT INSERTED.id WHERE tenant_id = @tenantId AND id = @renteeId',
        { authId, tenantId: item.tenantId, renteeId: item.renteeId });
      assert.equal(linked.length, 1, 'disposable renter must link to its real auth identity');
      item.authId = authId;
      return (await issueAuthSession(record)).accessToken;
    };
    const tokenA = await auth(a);
    const tokenB = await auth(b);
    const { createAuthenticatedTenantStorageRouter } = await import('../src/api/storage/authenticatedTenantRoute.js');
    const { createAuditHttpStorageProbe, verifyEviaRealSessionAuditHttp } = await import('./verify-evia-real-session-audit-http.mjs');
    const auditProbe = createAuditHttpStorageProbe();
    const app = express();
    app.use(express.json());
    app.use('/storage', createAuthenticatedTenantStorageRouter({ deliveryHandler: auditProbe.deliveryHandler }));
    app.use('/api', createSessionAuthMiddleware());
    app.use('/api/platform', createPlatformRouter());
    app.use('/api/billing', createBillingRouter());
    app.use('/api/maintenance-lifecycle', createMaintenanceLifecycleRouter());
    app.use('/api/notifications', createNotificationSelfRouter());
    app.use('/api/utility-reviews', createUtilityReviewRouter());
    app.use('/api/mssql', guardBillingMssqlCompatibility, createMssqlRouter());
    // Serve the real React application through Vite middleware on the same
    // loopback origin as the fixture API; no dev-bypass headers or production.
    delete process.env.VITE_ENABLE_DEV_BYPASS;
    vite = await createViteServer({
      plugins: [react()],
      server: { middlewareMode: true, hmr: false },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    app.use((err, req, res, next) => {
      res.status(Number(err?.status) || 500).json({
        error: err.message, code: err.code || null
      });
    });
    httpServer = await new Promise((resolve, reject) => {
      const server = app.listen(0, '127.0.0.1', () => resolve(server));
      server.once('error', reject);
    });
    const origin = 'http://127.0.0.1:' + httpServer.address().port;
    await verifyEviaRealSessionAuditHttp({
      pool, a, b, origin, tokenA, tokenB, createAuthRecord, issueAuthSession, probe: auditProbe
    });
    const call = async (path, { token, tenantId, method = 'GET', body } = {}) => {
      const response = await fetch(origin + path, {
        method,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      return { status: response.status, payload: await response.json() };
    };
    const { verifyUtilityReviewTransitions } =
      await import('./verify-utility-review-transitions.mjs');
    browser = await puppeteer.launch({
      headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    await verifyUtilityReviewTransitions({
      pool, a: { ...a, token: tokenA }, b: { ...b, token: tokenB },
      call, createAuthRecord, issueAuthSession, browser, origin
    });

    const { verifyPhase4MaintenanceNotificationHttp } = await import('./verify-phase4-maintenance-notification-http.mjs');
    await verifyPhase4MaintenanceNotificationHttp({
      a: { ...a, token: tokenA },
      b: { ...b, token: tokenB },
      seeded: phase4Seeded,
      call
    });

    const authContext = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(authContext.status, 200, JSON.stringify(authContext));
    assert.equal(guid(authContext.payload.data.tenantId), a.tenantId);

    // SQL Server returns uppercase UUID strings in some drivers, while
    // clients may send lowercase or uppercase tenant selection headers.
    const upperContext = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: a.tenantId.toUpperCase()
    });
    assert.equal(upperContext.status, 200, JSON.stringify(upperContext));
    assert.equal(guid(upperContext.payload.data.tenantId), a.tenantId);

    const forcedTenant = await call('/api/platform/auth/context', {
      token: tokenA, tenantId: b.tenantId
    });
    assert.equal(forcedTenant.status, 403);
    assert.equal(forcedTenant.payload.code, 'TENANT_ACCESS_DENIED');

    const unauthenticated = await call('/api/platform/query', {
      method: 'POST', tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings' }
    });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.payload.code, 'AUTH_CONTEXT_REQUIRED');

    const pendingA = await call('/api/platform/query', {
      method: 'POST', token: tokenA, tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'propertyid', operator: 'eq', value: b.propertyId }] }
    });
    assert.equal(pendingA.status, 200, JSON.stringify(pendingA));
    assert.deepEqual(pendingA.payload.data, [], 'cross-property reading query must not expose B');

    const ownA = await call('/api/platform/query', {
      method: 'POST', token: tokenA, tenantId: a.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'id', operator: 'eq', value: a.readingId }] }
    });
    assert.equal(ownA.status, 200, JSON.stringify(ownA));
    assert.equal(ownA.payload.data.length, 1, 'A may read own reading');
    assert.equal(guid(ownA.payload.data[0].id), a.readingId);

    // Same-tenant second renter: the compatibility list must apply owner and
    // draft predicates in SQL before pagination, and detail must return 404.
    const other = await first(pool, `
      INSERT INTO app_users (tenant_id, name, email, role, user_type)
      OUTPUT INSERTED.id VALUES (@tenantId, 'Other Renter', @email, 'rentee', 'rentee')
    `, { tenantId: a.tenantId, email: 'same-tenant-' + crypto.randomUUID() + '@example.invalid' });
    const otherId = guid(other.id);
    await query(pool, `
      INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default)
      VALUES (@tenantId, @appUserId, 'rentee', 'active', 1)
    `, { tenantId: a.tenantId, appUserId: otherId });
    const otherAuthId = crypto.randomUUID();
    const otherRecord = await createAuthRecord({
      authId: otherAuthId, appUserId: otherId,
      email: 'same-tenant-' + otherId + '@example.invalid',
      role: 'rentee', password: crypto.randomBytes(25).toString('base64url')
    });
    await query(pool, 'UPDATE app_users SET auth_id = @authId WHERE id = @appUserId AND tenant_id = @tenantId',
      { authId: otherAuthId, appUserId: otherId, tenantId: a.tenantId });
    const otherToken = (await issueAuthSession(otherRecord)).accessToken;
    // The generator's existing invoiceA is DRAFT by contract. Seed separate
    // issued invoices ONLY in this disposable SQL database to prove positive
    // visibility without modifying lifecycle-generated records.
    const issuedForA = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'issued', '2026-10', 75)
    `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId });
    const issuedForOther = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'issued', '2026-10', 90)
    `, { tenantId: a.tenantId, renteeId: otherId, propertyId: a.propertyId });
    // Add the newest row as a DRAFT, deliberately ahead of issued rows by
    // timestamp, so filtering after SQL OFFSET/FETCH would return an empty page.
    const newestDraft = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount, createdat)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'draft', '2026-10', 50,
        DATEADD(MINUTE, 5, SYSUTCDATETIME()))
    `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId });

    const ownLegacy = await call('/api/mssql/invoices?page=1&pageSize=1', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(ownLegacy.status, 200, JSON.stringify(ownLegacy));
    assert.equal(ownLegacy.payload.data.length, 1);
    assert.equal(guid(ownLegacy.payload.data[0].id), guid(issuedForA.id),
      'SQL must exclude drafts and other renter invoices before paging');
    const ownSecondPage = await call('/api/mssql/invoices?page=2&pageSize=1', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(ownSecondPage.status, 200, JSON.stringify(ownSecondPage));
    assert.deepEqual(ownSecondPage.payload.data, []);

    const otherLegacy = await call('/api/mssql/invoices?page=1&pageSize=1', {
      token: otherToken, tenantId: a.tenantId
    });
    assert.equal(otherLegacy.status, 200, JSON.stringify(otherLegacy));
    assert.equal(otherLegacy.payload.data.length, 1);
    assert.equal(guid(otherLegacy.payload.data[0].id), guid(issuedForOther.id),
      'second renter sees only their own issued invoice in same organization');
    const ownIssuedDetail = await call('/api/mssql/invoices/' + issuedForA.id, {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(ownIssuedDetail.status, 200, JSON.stringify(ownIssuedDetail));
    assert.equal(guid(ownIssuedDetail.payload.data.id), guid(issuedForA.id));
    const otherDetail = await call('/api/mssql/invoices/' + issuedForA.id, {
      token: otherToken, tenantId: a.tenantId
    });
    assert.equal(otherDetail.status, 404,
      'same-tenant foreign renter invoice detail is not visible');
    const hiddenDraft = await call('/api/mssql/invoices/' + invoiceA, {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(hiddenDraft.status, 404,
      'original monthly-billing draft stays hidden even from its own renter');
    const requestedForeign = await call('/api/mssql/invoices?renteeId=' + a.renteeId, {
      token: otherToken, tenantId: a.tenantId
    });
    assert.equal(requestedForeign.status, 200, JSON.stringify(requestedForeign));
    assert.deepEqual(requestedForeign.payload.data, [],
      'query parameter must never override authenticated owner');

    // Query parity: repeated status values and SQL sorting must be applied
    // after tenant/owner/draft authorization, but before OFFSET/FETCH.
    // This synthetic invoice exists only in the disposable SQL database.
    const paidForA = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'paid', '2026-10', 120)
    `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId });
    const sortedPage = (page, sortOrder) =>
      '/api/mssql/invoices?status=issued&status=paid&sortBy=totalamount&sortOrder='
      + sortOrder + '&page=' + page + '&pageSize=1';
    const ascendingFirst = await call(sortedPage(1, 'asc'), {
      token: tokenA, tenantId: a.tenantId
    });
    const ascendingSecond = await call(sortedPage(2, 'asc'), {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(ascendingFirst.status, 200, JSON.stringify(ascendingFirst));
    assert.equal(ascendingSecond.status, 200, JSON.stringify(ascendingSecond));
    assert.deepEqual(ascendingFirst.payload.data.map(entry => guid(entry.id)), [guid(issuedForA.id)]);
    assert.deepEqual(ascendingSecond.payload.data.map(entry => guid(entry.id)), [guid(paidForA.id)]);
    const descending = await call(sortedPage(1, 'desc'), {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(descending.status, 200, JSON.stringify(descending));
    assert.deepEqual(descending.payload.data.map(entry => guid(entry.id)), [guid(paidForA.id)]);
    const onlyPaid = await call('/api/mssql/invoices?status=paid', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(onlyPaid.status, 200, JSON.stringify(onlyPaid));
    assert.deepEqual(onlyPaid.payload.data.map(entry => guid(entry.id)), [guid(paidForA.id)]);
    const impossibleStatus = await call('/api/mssql/invoices?status=paid&status=impossible', {
      token: otherToken, tenantId: a.tenantId
    });
    assert.equal(impossibleStatus.status, 200, JSON.stringify(impossibleStatus));
    assert.deepEqual(impossibleStatus.payload.data, [],
      'status arrays never bypass authenticated owner scope');
    const invalidSort = await call('/api/mssql/invoices?sortBy=invalid_column&sortOrder=desc', {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(invalidSort.status, 200, JSON.stringify(invalidSort));
    assert.equal(invalidSort.payload.data.length, 2,
      'invalid sort names must be allowlisted/fallback, not interpolated into SQL');
    // Fiscal month-end parity: inclusive createdat <= toDate must include
    // late final-day invoices while excluding the next month's first instant.
    const monthEnd = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount, createdat)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'issued', '2026-10', 42,
        '2026-10-31T23:59:59.250+00:00')
    `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId });
    const nextMonth = await first(pool, `
      INSERT INTO invoices (tenant_id, renteeid, propertyid, status, billingperiod, totalamount, createdat)
      OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'issued', '2026-11', 43,
        '2026-11-01T00:00:00.000+00:00')
    `, { tenantId: a.tenantId, renteeId: a.renteeId, propertyId: a.propertyId });
    const withinOctober = await call('/api/mssql/invoices?' + new URLSearchParams({
      fromDate: '2026-10-31T00:00:00.000Z',
      toDate: '2026-10-31T23:59:59.999Z',
      status: 'issued'
    }), { token: tokenA, tenantId: a.tenantId });
    assert.equal(withinOctober.status, 200, JSON.stringify(withinOctober));
    assert.deepEqual(withinOctober.payload.data.map(x => guid(x.id)), [guid(monthEnd.id)]);
    const withinNovember = await call('/api/mssql/invoices?' + new URLSearchParams({
      fromDate: '2026-11-01T00:00:00.000Z',
      toDate: '2026-11-01T23:59:59.999Z',
      status: 'issued'
    }), { token: tokenA, tenantId: a.tenantId });
    assert.equal(withinNovember.status, 200, JSON.stringify(withinNovember));
    assert.deepEqual(withinNovember.payload.data.map(x => guid(x.id)), [guid(nextMonth.id)]);
    const otherCannotSee = await call('/api/mssql/invoices?' + new URLSearchParams({
      fromDate: '2026-10-31T00:00:00.000Z',
      toDate: '2026-10-31T23:59:59.999Z',
      status: 'issued'
    }), { token: otherToken, tenantId: a.tenantId });
    assert.equal(otherCannotSee.status, 200, JSON.stringify(otherCannotSee));
    assert.deepEqual(otherCannotSee.payload.data, []);
    await query(pool, 'DELETE FROM invoices WHERE tenant_id = @tenantId AND id IN (@monthEnd, @nextMonth)',
      { tenantId: a.tenantId, monthEnd: monthEnd.id, nextMonth: nextMonth.id });
    console.log('PASS: invoice month-end read boundaries retain renter isolation');

    await query(pool, 'DELETE FROM invoices WHERE id = @id AND tenant_id = @tenantId',
      { id: paidForA.id, tenantId: a.tenantId });

    // Restore the original billing lifecycle fixture, used below to prove
    // its own draft and subsequent authorized issuance transitions.
    await query(pool, `
      DELETE FROM invoices WHERE tenant_id = @tenantId
        AND id IN (@issuedA, @issuedOther, @draftId)
    `, { tenantId: a.tenantId, issuedA: issuedForA.id,
      issuedOther: issuedForOther.id, draftId: newestDraft.id });

    const foreignInvoice = await call('/api/mssql/invoices/' + invoiceB, {
      token: tokenA, tenantId: a.tenantId
    });
    assert.equal(foreignInvoice.status, 404);

    const blockedWrite = await call('/api/mssql/invoices/' + invoiceA, {
      token: tokenA, tenantId: a.tenantId, method: 'PUT',
      body: { status: 'paid' }
    });
    assert.equal(blockedWrite.status, 409);
    assert.equal(blockedWrite.payload.code, 'BILLING_LIFECYCLE_REQUIRED');

    const ownB = await call('/api/platform/query', {
      method: 'POST', token: tokenB, tenantId: b.tenantId,
      body: { action: 'select', table: 'utility_readings',
        filters: [{ column: 'id', operator: 'eq', value: b.readingId }] }
    });
    assert.equal(ownB.status, 200, JSON.stringify(ownB));
    assert.equal(ownB.payload.data.length, 1);
    assert.equal(guid(ownB.payload.data[0].id), b.readingId);


    // Only the new dedicated billing reader determines renter ownership, and
    // draft invoices remain invisible until issued, even to their owner.
    for (const item of [a, b]) {
      const token = item.tenantId === a.tenantId ? tokenA : tokenB;
      const draftList = await call('/api/billing/rentee/invoices', {
        token, tenantId: item.tenantId
      });
      assert.equal(draftList.status, 200, JSON.stringify(draftList));
      assert.deepEqual(draftList.payload.data, [], 'draft invoices must remain hidden');
    }
    const anonymousList = await call('/api/billing/rentee/invoices', {
      tenantId: a.tenantId
    });
    assert.equal(anonymousList.status, 401, 'anonymous renter invoice list must be denied');

    // Billing generator intentionally drafts invoices; the renter invoice list
    // intentionally hides drafts. Promote only disposable fixture rows to the
    // legacy visible "pending" state to test the actual renter-facing display.
    await query(pool,
      "UPDATE invoices SET status = 'pending' WHERE id IN (@invoiceA, @invoiceB)",
      { invoiceA, invoiceB });
    // Only the isolated Docker test database receives these synthetic records.
    await seedAccountHistory(pool, a, invoiceA, 'A', 500, 125);
    await seedAccountHistory(pool, b, invoiceB, 'B', 750, 150);

    // Audit that browser navigation and account GET calls never create, settle,
    // update, or verify payments, receipts, invoice states, or lifecycle events.
    const readOnlySnapshot = async () => ({
      invoices: (await query(pool,
        'SELECT id, status, totalamount FROM invoices ORDER BY id'))
        .map(row => ({ id: guid(row.id), status: row.status, amount: Number(row.totalamount) })),
      paymentCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM payments')).n),
      receiptCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM payment_receipts')).n),
      eventCount: Number((await first(pool, 'SELECT COUNT(*) AS n FROM billing_lifecycle_events')).n)
    });
    const beforeAccountReads = await readOnlySnapshot();
    assert.equal(beforeAccountReads.paymentCount, 4);
    assert.equal(beforeAccountReads.receiptCount, 2);
    assert.equal(beforeAccountReads.eventCount, 2);

    // Dedicated authenticated list has the same property projection shape
    // required by InvoiceCard and must never accept an arbitrary renter ID.
    for (const [item, token, foreign] of [[a, tokenA, b], [b, tokenB, a]]) {
      const own = await call('/api/billing/rentee/invoices?renteeId=' +
        encodeURIComponent(foreign.renteeId), {
        token, tenantId: item.tenantId
      });
      assert.equal(own.status, 200, JSON.stringify(own));
      assert.equal(own.payload.data.length, 1);
      assert.equal(guid(own.payload.data[0].renteeid), item.renteeId,
        'caller-provided renteeId must not override authenticated identity');
      assert.equal(Number(own.payload.data[0].totalamount), item.expected);
      assert.equal(own.payload.data[0].properties?.name,
        item.tenantId === a.tenantId ? 'Tenant A Property' : 'Tenant B Property');
    }

    // Verify legacy compatibility query parity before it can be retired globally.
    // This differentiates missing API data from a browser/profile rendering defect.
    for (const item of [a, b]) {
      const ownToken = item.tenantId === a.tenantId ? tokenA : tokenB;
      const ownProperty = item.tenantId === a.tenantId ? 'Tenant A Property' : 'Tenant B Property';
      const ownInvoiceQuery = await call('/api/platform/query', {
        token: ownToken, tenantId: item.tenantId, method: 'POST',
        body: {
          action: 'select', table: 'invoices',
          select: '*, properties!propertyid(id, name, address)',
          filters: [{ column: 'renteeid', operator: 'eq', value: item.renteeId }],
          order: [{ column: 'createdat', ascending: false }]
        }
      });
      assert.equal(ownInvoiceQuery.status, 200, JSON.stringify(ownInvoiceQuery));
      assert.equal(ownInvoiceQuery.payload.data?.length, 1,
        'tenant must receive exactly its own invoice from the authenticated API');
      assert.equal(ownInvoiceQuery.payload.data[0]?.properties?.name, ownProperty,
        'tenant-scoped invoice API must resolve its own property relationship');
      assert.equal(Number(ownInvoiceQuery.payload.data[0].totalamount), item.expected);
    }
    // Exercise real dedicated billing GET authority with genuine tenant sessions.
    for (const [ownItem, ownToken, ownInvoice, foreignItem, foreignInvoiceId] of [
      [a, tokenA, invoiceA, b, invoiceB],
      [b, tokenB, invoiceB, a, invoiceA]
    ]) {
      const response = await call('/api/billing/invoices/' + ownInvoice + '/account', {
        token: ownToken, tenantId: ownItem.tenantId
      });
      assert.equal(response.status, 200, JSON.stringify(response));
      const account = response.payload.data;
      assert.equal(guid(account.invoice.id), ownInvoice);
      assert.equal(guid(account.invoice.renteeid), ownItem.renteeId);
      assert.equal(Number(account.invoice.totalamount), ownItem.expected);
      assert.equal(Number(account.outstandingBalance), ownItem.outstanding,
        'pending payment must not reduce outstanding balance');
      assert.equal(account.payments.length, 2);
      assert.deepEqual(new Set(account.payments.map(p => p.status)), new Set(['verified', 'pending']));
      assert.equal(account.receipts.length, 1);
      assert.equal(account.receipts[0].receipt_number, ownItem.receiptNumber);
      assert.equal(Number(account.receipts[0].amount), ownItem.verifiedAmount);
      assert.equal(account.components.reduce((sum, row) => sum + Number(row.amount), 0), ownItem.expected);
      const foreign = await call('/api/billing/invoices/' + foreignInvoiceId + '/account', {
        token: ownToken, tenantId: ownItem.tenantId
      });
      assert.equal(foreign.status, 404, 'billing account lookup must hide foreign tenant invoices');
      assert.equal(foreign.payload.code, 'INVOICE_NOT_FOUND');
      assert.notEqual(ownItem.receiptNumber, foreignItem.receiptNumber);
    }
    const anonymousAccount = await call('/api/billing/invoices/' + invoiceA + '/account', {
      tenantId: a.tenantId
    });
    assert.equal(anonymousAccount.status, 401, 'anonymous billing account query must be denied');


    // Run the actual new browser-side pending-invoice dashboard read client
    // against the same disposable SQL backend with two real renter sessions.
    // Only synthetic fixture rows are inserted, and all are deleted afterwards.
    const pendingFixtures = [];
    let dashboardPage;
    try {
      for (const item of [a, a, b]) {
        const row = await first(pool, `
          INSERT INTO utility_readings
            (tenant_id, renteeid, propertyid, utilitytype, status, billing_status, readingdate, previousreading, currentreading, calculatedbill)
          OUTPUT INSERTED.id VALUES
            (@tenantId, @renteeId, @propertyId, 'water', 'approved', 'pending_invoice', '2026-09-15', 1, 3, 150)
        `, { tenantId: item.tenantId, renteeId: item.renteeId, propertyId: item.propertyId });
        pendingFixtures.push({ id: guid(row.id), tenantId: item.tenantId });
      }

      for (const [item, token, expectedCount] of [[a, tokenA, 2], [b, tokenB, 1]]) {
        dashboardPage = await browser.newPage();
        await dashboardPage.evaluateOnNewDocument((sessionToken, tenantId, authId, email) => {
          localStorage.removeItem('dev_bypass_role');
          localStorage.setItem('khrental.activeTenantId', tenantId);
          localStorage.setItem('khrental.local.session', JSON.stringify({
            access_token: sessionToken,
            user: { id: authId, email, role: 'rentee' }
          }));
        }, token, item.tenantId, item.authId, item.email);
        await dashboardPage.goto(origin + '/rentee/invoices',
          { waitUntil: 'domcontentloaded', timeout: 45000 });
        const observed = await dashboardPage.evaluate(async (ownId, otherId) => {
          const { listPendingInvoiceReadingPage, listPendingInvoiceProperties } =
            await import('/src/services/pendingInvoiceDashboardReadClient.js');
          const { getPropertiesWithPendingReadings } =
            await import('/src/services/invoiceService.js');
          const firstPage = await listPendingInvoiceReadingPage(0, 1);
          const secondPage = await listPendingInvoiceReadingPage(1, 1);
          const allPage = await listPendingInvoiceReadingPage(0, 10);
          const projects = await listPendingInvoiceProperties([ownId, otherId]);
          const summary = await getPropertiesWithPendingReadings();
          const { listUtilityInvoicePreviewRows } =
            await import('/src/services/utilityInvoicePreviewReadClient.js');
          const september = await listUtilityInvoicePreviewRows({
            month: 'September', year: 2026, pageSize: 1
          });
          const october = await listUtilityInvoicePreviewRows({
            month: 'October', year: 2026, pageSize: 1
          });
          const filteredOtherProperty = await listUtilityInvoicePreviewRows({
            month: 'September', year: 2026, propertyId: otherId
          });
          return {
            firstPage, secondPage, allPage, projects, summary,
            september, october, filteredOtherProperty
          };
        }, item.propertyId, item.tenantId === a.tenantId ? b.propertyId : a.propertyId);
        assert.equal(observed.allPage.length, expectedCount,
          'dashboard read must see only pending, unlinked readings owned by authenticated renter');
        assert.equal(observed.firstPage.length, 1);
        assert.equal(observed.secondPage.length, expectedCount === 2 ? 1 : 0);
        assert.equal(new Set(observed.allPage.map(row => guid(row.id))).size, expectedCount,
          'stable ID pagination cannot duplicate entries');
        assert.ok(observed.allPage.every(row => guid(row.propertyid) === item.propertyId));
        assert.deepEqual(observed.projects.map(row => guid(row.id)), [item.propertyId],
          'cross-tenant property expansion must remain denied');
        assert.equal(observed.summary.error, null, JSON.stringify(observed.summary));
        assert.equal(observed.summary.data.length, 1);
        assert.equal(guid(observed.summary.data[0].id), item.propertyId);
        assert.equal(observed.summary.data[0].pendingReadingsCount, expectedCount);
        assert.equal(observed.september.length, expectedCount,
          'utility preview must return only own pending unlinked September readings');
        assert.ok(observed.september.every(row =>
          guid(row.property_id) === item.propertyId && row.amount === 150 && row.consumption === 2
        ), 'preview preserves own SQL reading amounts and consumption');
        assert.deepEqual(observed.october, [],
          'preview month filter must exclude other service months');
        assert.deepEqual(observed.filteredOtherProperty, [],
          'cross-tenant property filters must not reveal utility preview rows');
        await dashboardPage.close();
        dashboardPage = null;
      }
      console.log('PASS: actual pending-invoice browser reader respects SQL tenant isolation, stable pages and dashboard counts');
    } finally {
      if (dashboardPage) await dashboardPage.close().catch(() => {});
      for (const fixture of pendingFixtures) {
        await query(pool, 'DELETE FROM utility_readings WHERE id = @id AND tenant_id = @tenantId',
          { id: fixture.id, tenantId: fixture.tenantId });
      }
    }

    const browserVisit = async (item, token, route, { visibleInvoice = false } = {}) => {
      const page = await browser.newPage();
      try {
        await page.evaluateOnNewDocument((sessionToken, tenantId, authId, email) => {
          localStorage.removeItem('dev_bypass_role');
          localStorage.setItem('khrental.activeTenantId', tenantId);
          localStorage.setItem('khrental.local.session', JSON.stringify({
            access_token: sessionToken,
            user: { id: authId, email, role: 'rentee' }
          }));
        }, token, item.tenantId, item.authId, item.email);
        await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForFunction(() => (
          !document.body.innerText.includes('Loading application...')
          && document.body.innerText.trim().length > 0
        ), { timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        const state = await page.evaluate(() => ({
          path: window.location.pathname, text: document.body.innerText.slice(0, 12000)
        }));
        // Only disposable fixture content is included in a failure; no bearer tokens.
        const browserEvidence = 'Path: ' + state.path + '\\nPage: ' + state.text.slice(-3000);
        assert.notEqual(state.path, '/login', 'valid fixture session must not bounce to login; ' + browserEvidence);
        assert.notEqual(state.path, '/unauthorized', 'valid rentee session must reach its portal');
        assert.ok(state.path.startsWith('/rentee/'), 'tenant portal route must be preserved');
        const ownProperty = item.tenantId === a.tenantId ? 'Tenant A Property' : 'Tenant B Property';
        const foreignProperty = item.tenantId === a.tenantId ? 'Tenant B Property' : 'Tenant A Property';
        assert.doesNotMatch(state.text, new RegExp(foreignProperty),
          'rentee-facing browser must not leak another tenant property');
        if (visibleInvoice) {
          assert.match(state.text, /My Invoices/, 'actual renter invoice screen must load');
          assert.match(state.text, new RegExp(ownProperty), 'own property must be visible on invoice; ' + browserEvidence);
          assert.match(state.text, new RegExp(item.expected.toLocaleString('en-US')),
            'the tenant-specific invoice total must be visible');
          assert.doesNotMatch(state.text, /No invoices found\./,
            'visible test invoice must not be silently omitted');

          // Click only the READ-only Account & Receipts button. Never submit
          // a payment proof or invoke a billing/payment mutation from the browser.
          await page.evaluate(() => {
            const button = [...document.querySelectorAll('button')]
              .find(entry => entry.textContent.trim() === 'Account & Receipts');
            if (!button) throw new Error('Account & Receipts read button is missing');
            button.click();
          });
          await page.waitForFunction(
            receiptNumber => document.body.innerText.includes(receiptNumber),
            { timeout: 30000 }, item.receiptNumber
          );
          const accountText = await page.evaluate(() => document.body.innerText);
          assert.match(accountText, /Invoice Account/);
          assert.match(accountText, /Payments/);
          assert.match(accountText, /Receipts/);
          assert.match(accountText, new RegExp(item.receiptNumber));
          assert.match(accountText, new RegExp(item.outstanding.toLocaleString('en-US')),
            'actual browser account view must show verified-payment outstanding balance');
          assert.match(accountText, /FIXTURE-[AB]-VERIFIED/,
            'real account view must show the verified transaction reference');
          const foreignReceipt = item.tenantId === a.tenantId ? b.receiptNumber : a.receiptNumber;
          assert.doesNotMatch(accountText, new RegExp(foreignReceipt),
            'foreign tenant receipt must never be rendered');
        }
      } finally { await page.close(); }
    };
    await browserVisit(a, tokenA, '/rentee/utilities/history');
    await browserVisit(b, tokenB, '/rentee/utilities/history');
    await browserVisit(a, tokenA, '/rentee/invoices', { visibleInvoice: true });
    await browserVisit(b, tokenB, '/rentee/invoices', { visibleInvoice: true });
    assert.deepEqual(await readOnlySnapshot(), beforeAccountReads,
      'account and receipt views must not mutate invoice/payment/receipt/lifecycle data');

    // One global app_users identity with active memberships in both A and B.
    // Keep the original independent renter sessions above as a separate guard.
    const sharedEmail = 'shared-renter-' + crypto.randomBytes(6).toString('hex') + '@example.invalid';
    const sharedRecord = await first(pool,
      "INSERT INTO app_users (tenant_id, name, email, role, user_type) OUTPUT INSERTED.id VALUES (@tenantId, 'Shared Test Renter', @email, 'rentee', 'rentee')",
      { tenantId: a.tenantId, email: sharedEmail });
    const sharedId = guid(sharedRecord.id);
    const shared = { renteeId: sharedId, tenantId: a.tenantId, email: sharedEmail };
    const scopedShared = [];
    for (const [item, suffix, total, verified] of [
      [a, 'A', 1300, 300],
      [b, 'B', 2500, 700]
    ]) {
      await query(pool,
        "INSERT INTO tenant_memberships (tenant_id, app_user_id, role, status, is_default) VALUES (@tenantId, @renteeId, 'rentee', 'active', @default)",
        { tenantId: item.tenantId, renteeId: sharedId, default: suffix === 'A' ? 1 : 0 });
      const agreement = await first(pool,
        "INSERT INTO agreements (tenant_id, renteeid, propertyid, status, rentamount, startdate) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, 'active', @amount, '2026-01-01')",
        { tenantId: item.tenantId, renteeId: sharedId, propertyId: item.propertyId, amount: total });
      const invoice = await first(pool,
        "INSERT INTO invoices (tenant_id, renteeid, propertyid, agreementid, status, totalamount, billingperiod) OUTPUT INSERTED.id VALUES (@tenantId, @renteeId, @propertyId, @agreementId, 'pending', @amount, '2026-09')",
        { tenantId: item.tenantId, renteeId: sharedId, propertyId: item.propertyId,
          agreementId: agreement.id, amount: total });
      const invoiceId = guid(invoice.id);
      await query(pool,
        "INSERT INTO invoice_components (tenant_id, invoice_id, component_type, description, amount) VALUES (@tenantId, @invoiceId, 'rent', 'Disposable fixture rent', @amount)",
        { tenantId: item.tenantId, invoiceId, amount: total });
      const record = { tenantId: item.tenantId, renteeId: sharedId,
        propertyId: item.propertyId, expected: total, invoiceId,
        propertyName: suffix === 'A' ? 'Tenant A Property' : 'Tenant B Property' };
      await seedAccountHistory(pool, record, invoiceId, 'SWITCH-' + suffix, verified, 50);
      scopedShared.push(record);
    }
    const [sharedA, sharedB] = scopedShared;
    const sharedToken = await auth(shared);
    assert.equal(shared.authId !== null, true);

    const distinctGlobalUsers = await query(pool, 'SELECT id, email FROM app_users WHERE email = @email',
      { email: sharedEmail });
    assert.equal(distinctGlobalUsers.length, 1, 'switching must preserve a single global app_users identity');
    assert.equal(guid(distinctGlobalUsers[0].id), sharedId);
    const sharedMemberships = await query(pool,
      "SELECT tenant_id FROM tenant_memberships WHERE app_user_id = @renteeId AND status = 'active'",
      { renteeId: sharedId });
    assert.deepEqual(
      new Set(sharedMemberships.map(row => guid(row.tenant_id))),
      new Set([a.tenantId, b.tenantId]),
      'same global user must have two active tenant memberships'
    );
    const nonMemberTenant = await first(pool,
      "INSERT INTO tenants (name, slug, status, [plan]) OUTPUT INSERTED.id VALUES ('Unentitled Fixture Tenant', @slug, 'active', 'test')",
      { slug: 'unentitled-' + crypto.randomBytes(5).toString('hex') });
    const deniedSelection = await call('/api/platform/auth/context', {
      token: sharedToken, tenantId: guid(nonMemberTenant.id)
    });
    assert.equal(deniedSelection.status, 403);
    assert.equal(deniedSelection.payload.code, 'TENANT_ACCESS_DENIED');

    // One bearer token remains valid across authorized selections but all data
    // access must be scoped by the requested and verified active membership.
    for (const [own, foreign] of [[sharedA, sharedB], [sharedB, sharedA], [sharedA, sharedB]]) {
      const context = await call('/api/platform/auth/context', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(context.status, 200, JSON.stringify(context));
      assert.equal(guid(context.payload.data.user.id), sharedId);
      assert.equal(guid(context.payload.data.tenantId), own.tenantId);
      assert.equal(context.payload.data.memberships.length, 2);
      const projection = await call('/api/platform/query', {
        token: sharedToken, tenantId: own.tenantId, method: 'POST',
        body: {
          action: 'select', table: 'invoices',
          select: '*, properties!propertyid(id, name, address)',
          filters: [{ column: 'renteeid', operator: 'eq', value: sharedId }]
        }
      });
      assert.equal(projection.status, 200, JSON.stringify(projection));
      assert.equal(projection.payload.data.length, 1, 'only the selected tenant invoice is visible');
      assert.equal(guid(projection.payload.data[0].id), own.invoiceId);
      assert.equal(projection.payload.data[0].properties?.name, own.propertyName);
      const explicitList = await call(
        '/api/billing/rentee/invoices?renteeId=' + encodeURIComponent(foreign.renteeId),
        { token: sharedToken, tenantId: own.tenantId }
      );
      assert.equal(explicitList.status, 200, JSON.stringify(explicitList));
      assert.equal(explicitList.payload.data.length, 1,
        'one authenticated global identity must see only the selected organization');
      assert.equal(guid(explicitList.payload.data[0].id), own.invoiceId);
      assert.equal(explicitList.payload.data[0].properties?.name, own.propertyName);
      const ownAccount = await call('/api/billing/invoices/' + own.invoiceId + '/account', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(ownAccount.status, 200, JSON.stringify(ownAccount));
      assert.equal(Number(ownAccount.payload.data.outstandingBalance), own.outstanding);
      assert.equal(ownAccount.payload.data.receipts[0].receipt_number, own.receiptNumber);
      const hiddenAccount = await call('/api/billing/invoices/' + foreign.invoiceId + '/account', {
        token: sharedToken, tenantId: own.tenantId
      });
      assert.equal(hiddenAccount.status, 404, 'shared identity does not bypass tenant invoice scope');
    }

    const beforeTenantSwitch = await readOnlySnapshot();
    const switchPage = await browser.newPage();
    try {
      await switchPage.evaluateOnNewDocument((token, tenantId, authId, email) => {
        localStorage.removeItem('dev_bypass_role');
        localStorage.setItem('khrental.activeTenantId', tenantId);
        localStorage.setItem('khrental.local.session', JSON.stringify({
          access_token: token,
          user: { id: authId, email, role: 'rentee' }
        }));
      }, sharedToken, a.tenantId, shared.authId, sharedEmail);
      await switchPage.goto(origin + '/rentee/invoices',
        { waitUntil: 'domcontentloaded', timeout: 45000 });

      const assertScopedBrowser = async (own, foreign) => {
        await switchPage.waitForFunction(
          ({ property, other }) => {
            const body = document.body.innerText;
            return body.includes('My Invoices') && body.includes(property)
              && !body.includes(other) && !body.includes('Loading your invoices...');
          },
          { timeout: 30000 },
          { property: own.propertyName, other: foreign.propertyName }
        );
        const beforeClick = await switchPage.evaluate(() => ({
          path: location.pathname, content: document.body.innerText,
          activeTenant: localStorage.getItem('khrental.activeTenantId'),
          sessionId: JSON.parse(localStorage.getItem('khrental.local.session') || '{}')?.user?.id
        }));
        assert.equal(beforeClick.path, '/rentee/invoices');
        assert.equal(guid(beforeClick.activeTenant), own.tenantId);
        assert.equal(guid(beforeClick.sessionId), shared.authId,
          'tenant switching must never replace the global auth identity');
        assert.match(beforeClick.content, new RegExp(own.expected.toLocaleString('en-US')));
        assert.doesNotMatch(beforeClick.content, new RegExp(foreign.propertyName));
        await switchPage.evaluate(() => {
          const button = [...document.querySelectorAll('button')]
            .find(entry => entry.textContent.trim() === 'Account & Receipts');
          if (!button) throw new Error('Missing read-only account button');
          button.click();
        });
        await switchPage.waitForFunction(
          receipt => document.body.innerText.includes(receipt),
          { timeout: 30000 }, own.receiptNumber
        );
        const opened = await switchPage.evaluate(() => document.body.innerText);
        assert.match(opened, /Invoice Account/);
        assert.match(opened, new RegExp(own.receiptNumber));
        assert.match(opened, new RegExp(own.outstanding.toLocaleString('en-US')));
        assert.doesNotMatch(opened, new RegExp(foreign.receiptNumber));
        await switchPage.evaluate(() => {
          const closeButton = [...document.querySelectorAll('button')]
            .find(entry => entry.textContent.trim() === 'Close');
          if (!closeButton) throw new Error('Cannot close account read-only view');
          closeButton.click();
        });
        await switchPage.waitForFunction(
          () => !document.body.innerText.includes('Invoice Account'),
          { timeout: 15000 }
        );
      };
      await assertScopedBrowser(sharedA, sharedB);

      // Interact with the actual React tenant selector rather than editing
      // localStorage or bypassing the application's switchTenant() flow.
      for (const [next, foreign] of [[sharedB, sharedA], [sharedA, sharedB]]) {
        await switchPage.waitForFunction(
          ({ first, second }) => [...document.querySelectorAll('header select')].some(select => (
            [...select.options].some(option => option.value.toLowerCase() === first)
            && [...select.options].some(option => option.value.toLowerCase() === second)
          )),
          { timeout: 30000 }, { first: a.tenantId, second: b.tenantId }
        );
        const optionValue = await switchPage.evaluate(wanted => {
          const selector = document.querySelector('header.hidden select');
          return [...selector.options].find(option => option.value.toLowerCase() === wanted)?.value || null;
        }, next.tenantId);
        assert.ok(optionValue, 'authorized tenant must be selectable');
        await switchPage.select('header.hidden select', optionValue);
        await assertScopedBrowser(next, foreign);
      }
    } finally {
      await switchPage.close();
    }
    assert.deepEqual(await readOnlySnapshot(), beforeTenantSwitch,
      'actual A-B-A tenant switches and account reads must not write billing data');

    console.log('PASS: disposable two-tenant SQL Server invoice and account/receipt read isolation, verified-only outstanding balances, non-mutating browser interaction and lifecycle contracts');
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (vite) await vite.close().catch(() => {});
    if (httpServer) await new Promise(resolve => httpServer.close(resolve));
    if (closeMssqlPool) await closeMssqlPool().catch(() => {});
    if (pool) await pool.close().catch(() => {});
    if (master) await master.close().catch(() => {});
    if (started) { try { docker(['rm', '-f', name]); } catch {} }
  }
}
main().catch(error => {
  console.error('Two-tenant SQL Server billing acceptance FAILED:', error);
  process.exitCode = 1;
});
