import crypto from 'node:crypto';
import { getMssqlPool, sql } from '../mssql/pool.js';

// The claim is short-lived and transactional. Processing of signed documents
// happens AFTER its lock is released, not inside a SQL transaction.
// A crashed worker leaves an unprocessed event that can be reclaimed after
// the lease. Evia receives 503 while an active claim is held, so it retries.
export const EVIA_CLAIM_LEASE_MS = 15 * 60 * 1000;

const errorWithCode = (message, code, status = 503) =>
  Object.assign(new Error(message), { code, status });

export const claimEviaWebhookDelivery = async ({
  tenantId, requestId, deliveryId, allowProcessedRecovery = false, insertEvent
}) => {
  if (typeof insertEvent !== 'function') {
    throw new TypeError('insertEvent must be provided.');
  }
  // Evia's legacy events can omit deliveryId. There is no safe identity to
  // deduplicate; retain their earlier logging and processing behavior.
  if (!deliveryId) {
    return { eventId: await insertEvent(null), alreadyProcessed: false, duplicate: false };
  }
  if (!tenantId || !requestId) {
    throw errorWithCode('Tenant and Evia request identity are required.', 'EVIA_DELIVERY_IDENTITY_MISSING', 400);
  }

  const resource = 'evia-delivery-' + crypto.createHash('sha256')
    .update(JSON.stringify([String(tenantId).toLowerCase(), String(requestId), String(deliveryId)]))
    .digest('hex');
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let committed = false;
  try {
    const lock = new sql.Request(transaction);
    lock.input('resource', resource);
    const result = await lock.query(`
      DECLARE @lockResult INT;
      EXEC @lockResult = sys.sp_getapplock
        @Resource = @resource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 10000;
      SELECT @lockResult AS lockResult;
    `);
    if (Number(result.recordset?.[0]?.lockResult) < 0) {
      throw errorWithCode('Evia delivery claim is temporarily unavailable.', 'EVIA_DELIVERY_LOCK_UNAVAILABLE');
    }

    const read = new sql.Request(transaction);
    read.input('tenantId', tenantId);
    read.input('requestId', requestId);
    read.input('deliveryId', deliveryId);
    const existing = await read.query(`
      SELECT id, processed, updatedat
      FROM dbo.webhook_events
      WHERE tenant_id = @tenantId
        AND request_id = @requestId
        AND ISJSON(raw_data) = 1
        AND JSON_VALUE(raw_data, '$.deliveryId') = @deliveryId
      ORDER BY createdat DESC, id DESC
    `);
    const rows = existing.recordset || [];
    const alreadyProcessed = rows.some(row => Boolean(row.processed));
    const outstanding = rows.find(row => !row.processed);

    // A processed result is final unless the signed document is missing and
    // the webhook processor explicitly requests document-recovery retry.
    if (alreadyProcessed && !allowProcessedRecovery) {
      await transaction.commit();
      committed = true;
      return { eventId: null, alreadyProcessed: true, duplicate: true };
    }

    if (outstanding) {
      const elapsed = Date.now() - new Date(outstanding.updatedat).getTime();
      if (!Number.isFinite(elapsed) || elapsed < EVIA_CLAIM_LEASE_MS) {
        await transaction.commit();
        committed = true;
        return { eventId: null, alreadyProcessed, inFlight: true, duplicate: false };
      }

      // Crash recovery: take over only a stale unprocessed delivery.
      // The application lock serializes contenders at this point.
      const renew = new sql.Request(transaction);
      renew.input('eventId', outstanding.id);
      await renew.query(`
        UPDATE dbo.webhook_events
        SET updatedat = SYSUTCDATETIME()
        WHERE id = @eventId AND processed = 0
      `);
      await transaction.commit();
      committed = true;
      return { eventId: outstanding.id, alreadyProcessed, duplicate: false, reclaimed: true };
    }

    const eventId = await insertEvent(transaction);
    if (!eventId) {
      throw errorWithCode('Evia delivery claim could not be recorded.', 'EVIA_DELIVERY_CLAIM_FAILED');
    }
    await transaction.commit();
    committed = true;
    return { eventId, alreadyProcessed, duplicate: false };
  } catch (error) {
    if (!committed) {
      try { await transaction.rollback(); }
      catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  }
};
