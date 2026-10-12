import { randomUUID, createHash } from 'node:crypto';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { completeStoredEviaSignatories } from './archivedSignatories.js';

// PREPARATION ONLY. The live webhook still uses archiveLock.js.
// A reserved webhook_events row is an existing-schema durable lease journal.
// The transaction-scoped application lock is held ONLY for acquire/renew/finalize.
export const EVIA_ARCHIVE_LEASE_EVENT = 'evia.archive.lease.v1';
export const EVIA_ARCHIVE_LEASE_MS = 15 * 60 * 1000;

const err = (code, message, status = 409) =>
  Object.assign(new Error(message), { code, status });
const validGuid = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nonemptyRequest = value => typeof value === 'string'
  && value.length > 0 && value.length <= 255;

export const validateEviaArchiveLeaseIdentity = ({ tenantId, agreementId, requestId }) => {
  if (!validGuid(tenantId) || !validGuid(agreementId) || !nonemptyRequest(requestId)) {
    throw err('EVIA_ARCHIVE_LEASE_IDENTITY_INVALID', 'Tenant, agreement and Evia request IDs must be valid.', 400);
  }
};

const withLeaseTransaction = async (identity, operation) => {
  validateEviaArchiveLeaseIdentity(identity);
  const { tenantId, agreementId, requestId } = identity;
  const resource = 'evia-archive-lease-' + createHash('sha256')
    .update(JSON.stringify([tenantId.toLowerCase(), agreementId.toLowerCase()]))
    .digest('hex');
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let committed = false;
  try {
    const lock = new sql.Request(transaction);
    lock.input('resource', resource);
    const lockResult = await lock.query(`
      DECLARE @result INT;
      EXEC @result = sys.sp_getapplock
        @Resource = @resource, @LockMode = 'Exclusive',
        @LockOwner = 'Transaction', @LockTimeout = 10000;
      SELECT @result AS result;
    `);
    const lockCode = Number(lockResult.recordset?.[0]?.result);
    if (!Number.isInteger(lockCode) || lockCode < 0) {
      throw err('EVIA_ARCHIVE_LEASE_LOCK_BUSY', 'Agreement archive lease is being updated.', 503);
    }

    const agreementRequest = new sql.Request(transaction);
    agreementRequest.input('tenantId', tenantId);
    agreementRequest.input('agreementId', agreementId);
    agreementRequest.input('requestId', requestId);
    const scoped = await agreementRequest.query(`
      SELECT TOP 1 id, status, signature_status, signed_document_url,
             signeddocumenturl, signature_pdf_url, signatories_status
      FROM dbo.agreements
      WHERE id = @agreementId AND tenant_id = @tenantId
        AND eviasignreference = @requestId
    `);
    const agreement = scoped.recordset?.[0];
    if (!agreement) {
      throw err('EVIA_ARCHIVE_LEASE_AGREEMENT_NOT_FOUND',
        'Agreement does not belong to this tenant and Evia request.', 404);
    }

    const leaseRequest = new sql.Request(transaction);
    leaseRequest.input('tenantId', tenantId);
    leaseRequest.input('requestId', requestId);
    leaseRequest.input('agreementId', agreementId);
    leaseRequest.input('eventType', EVIA_ARCHIVE_LEASE_EVENT);
    const current = await leaseRequest.query(`
      SELECT TOP 1 id, processed, updatedat, SYSUTCDATETIME() AS serverNow,
             JSON_VALUE(raw_data, '$.attemptId') AS attemptId
      FROM dbo.webhook_events
      WHERE tenant_id = @tenantId
        AND request_id = @requestId
        AND event_type = @eventType
        AND ISJSON(raw_data) = 1
        AND JSON_VALUE(raw_data, '$.agreementId') = @agreementId
      ORDER BY createdat DESC, id DESC
    `);
    const context = {
      transaction, tenantId, agreementId, requestId, agreement,
      lease: current.recordset?.[0] || null
    };
    const result = await operation(context);
    await transaction.commit();
    committed = true;
    return result;
  } catch (error) {
    if (!committed) {
      try { await transaction.rollback(); }
      catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  }
};

const signedLocalUrl = agreement => [
  agreement.signed_document_url, agreement.signeddocumenturl, agreement.signature_pdf_url
].find(value => typeof value === 'string' && value.startsWith('/storage/documents/tenants/'));

const assertCanComplete = agreement => {
  const status = String(agreement.status || '').toLowerCase();
  const signature = String(agreement.signature_status || '').toLowerCase();
  if (['cancelled', 'rejected', 'terminated', 'expired'].includes(status) || signature === 'failed') {
    throw err('EVIA_ARCHIVE_TERMINAL_CONFLICT', 'The agreement has a conflicting terminal state.');
  }
};

const leaseAgeValid = lease => !!lease
  && Number.isFinite(new Date(lease.updatedat).getTime())
  && Number.isFinite(new Date(lease.serverNow).getTime())
  && new Date(lease.serverNow).getTime() >= new Date(lease.updatedat).getTime()
  && new Date(lease.serverNow).getTime() - new Date(lease.updatedat).getTime()
    < EVIA_ARCHIVE_LEASE_MS;

// Staging URLs are allowed as input to a future *fenced* finalization only.
// They must name the current winning attempt, never a stable production path.
export const validateEviaStagedArchiveUrl = ({
  tenantId, agreementId, attemptId, url
}) => {
  const prefix = `/storage/documents/tenants/${tenantId}/agreements/${agreementId}/signed/staged/${attemptId}/`;
  const filename = typeof url === 'string' && url.startsWith(prefix)
    ? url.slice(prefix.length) : '';
  if (!validGuid(tenantId) || !validGuid(agreementId) || !validGuid(attemptId)
    || typeof url !== 'string' || !url.startsWith(prefix)
    || !filename || filename === '.' || filename === '..' || filename.length > 180
    || !/^[A-Za-z0-9._-]+$/.test(filename)) {
    throw err('EVIA_ARCHIVE_STAGE_URL_INVALID',
      'Signed-document URL must point to the current immutable archive attempt.', 400);
  }
  return url;
};

export const acquireEviaArchiveLease = async (identity) =>
  withLeaseTransaction(identity, async ({ transaction, agreement, lease, tenantId, requestId, agreementId }) => {
    if (signedLocalUrl(agreement)) return { status: 'complete', url: signedLocalUrl(agreement) };
    assertCanComplete(agreement);
    if (lease && !lease.processed && leaseAgeValid(lease)) {
      return { status: 'busy', retryable: true };
    }

    const attemptId = randomUUID();
    const rawData = JSON.stringify({ agreementId, attemptId, state: 'staging' });
    if (lease) {
      const refresh = new sql.Request(transaction);
      refresh.input('id', lease.id);
      refresh.input('rawData', rawData);
      const result = await refresh.query(`
        UPDATE dbo.webhook_events
        SET raw_data = @rawData, processed = 0, processed_at = NULL,
            updatedat = SYSUTCDATETIME()
        OUTPUT INSERTED.id
        WHERE id = @id
      `);
      if (result.recordset?.length !== 1) {
        throw err('EVIA_ARCHIVE_LEASE_RECLAIM_FAILED', 'Lease takeover failed.', 503);
      }
    } else {
      const insert = new sql.Request(transaction);
      insert.input('tenantId', tenantId);
      insert.input('requestId', requestId);
      insert.input('eventType', EVIA_ARCHIVE_LEASE_EVENT);
      insert.input('rawData', rawData);
      const result = await insert.query(`
        INSERT INTO dbo.webhook_events
          (tenant_id, request_id, event_type, raw_data, processed)
        OUTPUT INSERTED.id
        VALUES (@tenantId, @requestId, @eventType, @rawData, 0)
      `);
      if (result.recordset?.length !== 1) {
        throw err('EVIA_ARCHIVE_LEASE_CLAIM_FAILED', 'Lease insertion failed.', 503);
      }
    }
    return { status: 'acquired', attemptId };
  });

export const renewEviaArchiveLease = async ({ attemptId, ...identity }) =>
  withLeaseTransaction(identity, async ({ transaction, lease, agreement }) => {
    if (!validGuid(attemptId) || !lease || lease.processed
      || String(lease.attemptId).toLowerCase() !== attemptId.toLowerCase()
      || !leaseAgeValid(lease) || signedLocalUrl(agreement)) {
      throw err('EVIA_ARCHIVE_LEASE_FENCED', 'Archive lease ownership is no longer valid.');
    }
    assertCanComplete(agreement);
    const request = new sql.Request(transaction);
    request.input('id', lease.id);
    const result = await request.query(`
      UPDATE dbo.webhook_events
      SET updatedat = SYSUTCDATETIME()
      OUTPUT INSERTED.id
      WHERE id = @id AND processed = 0
    `);
    if (result.recordset?.length !== 1) {
      throw err('EVIA_ARCHIVE_LEASE_FENCED', 'Archive lease was already completed.');
    }
    return { status: 'renewed', attemptId };
  });

const completedEventTypes = new Set([
  'request.completed', 'signing_completed', 'requestcompleted',
  'request completed', 'signing completed'
]);
const completedEventStatuses = new Set(['completed', 'complete', 'signed', 'signing_complete']);

const loadVerifiedCompletionDelivery = async ({
  transaction, tenantId, requestId, deliveryEventId, requireUnprocessed = false
}) => {
  if (!validGuid(deliveryEventId)) {
    throw err('EVIA_ARCHIVE_DELIVERY_ID_INVALID', 'Verified delivery event ID must be a UUID.', 400);
  }
  const request = new sql.Request(transaction);
  request.input('tenantId', tenantId);
  request.input('requestId', requestId);
  request.input('deliveryEventId', deliveryEventId);
  request.input('reservedType', EVIA_ARCHIVE_LEASE_EVENT);
  const result = await request.query(`
    SELECT TOP 1 id, processed, event_type, event_id, raw_data
    FROM dbo.webhook_events WITH (UPDLOCK, HOLDLOCK)
    WHERE id = @deliveryEventId
      AND tenant_id = @tenantId AND request_id = @requestId
      AND (event_type IS NULL OR event_type <> @reservedType)
  `);
  const event = result.recordset?.[0];
  if (!event) {
    throw err('EVIA_ARCHIVE_DELIVERY_NOT_FOUND', 'Completion delivery is not tenant/request scoped.', 404);
  }
  let metadata = {};
  try { metadata = JSON.parse(event.raw_data || '{}'); } catch {
    throw err('EVIA_ARCHIVE_DELIVERY_NOT_COMPLETED', 'Malformed completion delivery metadata.');
  }
  const status = String(metadata?.status || '').trim().toLowerCase();
  const type = String(event.event_type || '').trim().toLowerCase();
  if (!(completedEventTypes.has(type) || Number(event.event_id) === 3
      || completedEventStatuses.has(status))) {
    throw err('EVIA_ARCHIVE_DELIVERY_NOT_COMPLETED', 'Only verified completion events can publish.');
  }
  if (requireUnprocessed && event.processed) {
    throw err('EVIA_ARCHIVE_DELIVERY_PROCESSED', 'Completion delivery was already processed.');
  }
  return event;
};

const markCompletedDeliveryInTransaction = async ({
  transaction, tenantId, requestId, deliveryEventId
}) => {
  const request = new sql.Request(transaction);
  request.input('tenantId', tenantId);
  request.input('requestId', requestId);
  request.input('deliveryEventId', deliveryEventId);
  const result = await request.query(`
    UPDATE dbo.webhook_events
    SET processed = 1, processed_at = SYSUTCDATETIME(),
        updatedat = SYSUTCDATETIME()
    OUTPUT INSERTED.id
    WHERE id = @deliveryEventId AND tenant_id = @tenantId
      AND request_id = @requestId AND processed = 0
  `);
  if (result.recordset?.length !== 1) {
    throw err('EVIA_ARCHIVE_DELIVERY_ACCOUNTING_FAILED',
      'Verified completion delivery could not be marked processed.');
  }
};

export const finalizeEviaArchiveLease = async ({
  attemptId, signedDocumentUrl, auditTrailUrl = null, verifiedDeliveryEventId = null,
  ...identity
}) => withLeaseTransaction(identity, async ({
  transaction, lease, agreement, tenantId, agreementId, requestId
}) => {
  if (!validGuid(attemptId) || !lease || lease.processed
    || String(lease.attemptId).toLowerCase() !== attemptId.toLowerCase()
    || !leaseAgeValid(lease)) {
    throw err('EVIA_ARCHIVE_LEASE_FENCED', 'Expired or replaced archive attempt cannot publish.');
  }
  assertCanComplete(agreement);
  validateEviaStagedArchiveUrl({ tenantId, agreementId, attemptId, url: signedDocumentUrl });
  if (auditTrailUrl !== null) {
    validateEviaStagedArchiveUrl({ tenantId, agreementId, attemptId, url: auditTrailUrl });
  }
  if (signedLocalUrl(agreement)) {
    throw err('EVIA_ARCHIVE_ALREADY_PUBLISHED', 'Another signed document is already authoritative.');
  }
  if (verifiedDeliveryEventId !== null) {
    await loadVerifiedCompletionDelivery({
      transaction, tenantId, requestId, deliveryEventId: verifiedDeliveryEventId,
      requireUnprocessed: true
    });
  }
  const signatories = completeStoredEviaSignatories(
    agreement.signatories_status, new Date().toISOString()
  );

  const update = new sql.Request(transaction);
  update.input('tenantId', tenantId);
  update.input('agreementId', agreementId);
  update.input('requestId', requestId);
  update.input('signedDocumentUrl', signedDocumentUrl);
  update.input('completedSignatories', signatories);
  const winner = await update.query(`
    DECLARE @updated TABLE (id UNIQUEIDENTIFIER NOT NULL);
    UPDATE dbo.agreements
    SET signed_document_url = @signedDocumentUrl,
        signeddocumenturl = @signedDocumentUrl,
        signature_pdf_url = @signedDocumentUrl,
        status = 'signed', signature_status = 'completed',
        signeddate = COALESCE(signeddate, SYSUTCDATETIME()),
        signature_completed_at = COALESCE(signature_completed_at, SYSUTCDATETIME()),
        signatories_status = COALESCE(@completedSignatories, signatories_status),
        updatedat = SYSUTCDATETIME()
    OUTPUT INSERTED.id INTO @updated(id)
    WHERE id = @agreementId AND tenant_id = @tenantId
      AND eviasignreference = @requestId
      AND signed_document_url IS NULL AND signeddocumenturl IS NULL
      AND signature_pdf_url IS NULL
      AND LOWER(COALESCE(status, '')) NOT IN
        ('cancelled', 'rejected', 'terminated', 'expired')
      AND LOWER(COALESCE(signature_status, '')) <> 'failed';
    SELECT id FROM @updated;
  `);
  if (winner.recordset?.length !== 1) {
    throw err('EVIA_ARCHIVE_TERMINAL_CONFLICT', 'Agreement state changed before archive publication.');
  }

  const mark = new sql.Request(transaction);
  mark.input('id', lease.id);
  mark.input('rawData', JSON.stringify({
    agreementId, attemptId, state: 'completed', signedDocumentUrl, auditTrailUrl
  }));
  const saved = await mark.query(`
    UPDATE dbo.webhook_events
    SET processed = 1, processed_at = SYSUTCDATETIME(),
        updatedat = SYSUTCDATETIME(), raw_data = @rawData
    OUTPUT INSERTED.id
    WHERE id = @id AND processed = 0
  `);
  if (saved.recordset?.length !== 1) {
    throw err('EVIA_ARCHIVE_LEASE_FENCED', 'Archive lease completion was lost.');
  }
  // The provider delivery audit and its authoritative PDF pointer commit
  // together. A lost HTTP 200 cannot leave publication without an audit row.
  if (verifiedDeliveryEventId !== null) {
    await markCompletedDeliveryInTransaction({
      transaction, tenantId, requestId, deliveryEventId: verifiedDeliveryEventId
    });
  }
  return { status: 'published', attemptId, signedDocumentUrl, auditTrailUrl };
});

// Post-commit transport failure recovery: an authenticated webhook may
// deliver a new event row after an earlier worker has already published.
// Acknowledge only the tenant/request-bound completion row while the signed
// agreement and its processed archive lease prove a committed publication.
// This operation never modifies the agreement or its completion timestamps.
export const acknowledgePublishedEviaArchiveDelivery = async ({
  verifiedDeliveryEventId, ...identity
}) => withLeaseTransaction(identity, async ({
  transaction, tenantId, requestId, agreement, lease
}) => {
  const event = await loadVerifiedCompletionDelivery({
    transaction, tenantId, requestId, deliveryEventId: verifiedDeliveryEventId
  });
  if (String(agreement.status).toLowerCase() !== 'signed'
      || String(agreement.signature_status).toLowerCase() !== 'completed'
      || !signedLocalUrl(agreement) || !lease?.processed) {
    throw err('EVIA_ARCHIVE_PUBLICATION_NOT_PROVEN',
      'A completed, retained, lease-finalized Evia archive is required.');
  }
  if (event.processed) return { status: 'already_processed', signedDocumentUrl: signedLocalUrl(agreement) };
  await markCompletedDeliveryInTransaction({
    transaction, tenantId, requestId, deliveryEventId: verifiedDeliveryEventId
  });
  return { status: 'acknowledged', signedDocumentUrl: signedLocalUrl(agreement) };
});
