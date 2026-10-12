import crypto from 'node:crypto';
import { getMssqlPool, sql } from '../mssql/pool.js';

// A transaction-owned application lock, scoped to one Evia agreement, stays
// held until archive storage AND its resulting agreement update are finished.
// It serializes distinct delivery IDs across different application replicas.
// No SQL row locks are held during the external document download/upload.
export const withEviaAgreementArchiveLock = async ({
  tenantId, agreementId, requestId, execute
}) => {
  if (!tenantId || !agreementId || !requestId || typeof execute !== 'function') {
    throw Object.assign(new Error('Agreement-scoped Evia archive identity is required.'), {
      status: 400, code: 'EVIA_ARCHIVE_IDENTITY_INVALID'
    });
  }
  const resource = 'evia-archive-' + crypto.createHash('sha256')
    .update(JSON.stringify([String(tenantId).toLowerCase(), String(agreementId).toLowerCase()]))
    .digest('hex');

  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  let committed = false;
  try {
    const lockRequest = new sql.Request(transaction);
    lockRequest.input('resource', resource);
    const lock = await lockRequest.query(`
      DECLARE @result INT;
      EXEC @result = sys.sp_getapplock
        @Resource = @resource,
        @LockMode = 'Exclusive',
        @LockOwner = 'Transaction',
        @LockTimeout = 0;
      SELECT @result AS result;
    `);
    if (Number(lock.recordset?.[0]?.result) < 0) {
      throw Object.assign(new Error('Another Evia completion is archiving this agreement.'), {
        status: 503, code: 'EVIA_ARCHIVE_IN_PROGRESS'
      });
    }

    const scopedRead = new sql.Request(transaction);
    scopedRead.input('agreementId', agreementId);
    scopedRead.input('tenantId', tenantId);
    scopedRead.input('requestId', requestId);
    const found = await scopedRead.query(`
      SELECT TOP 1 id, status, signature_status,
             signed_document_url, signeddocumenturl, signature_pdf_url
      FROM dbo.agreements
      WHERE id = @agreementId AND tenant_id = @tenantId
        AND eviasignreference = @requestId
    `);
    const latest = found.recordset?.[0] || null;
    if (!latest) {
      throw Object.assign(new Error('Agreement no longer belongs to this Evia request.'), {
        status: 404, code: 'EVIA_ARCHIVE_AGREEMENT_NOT_FOUND'
      });
    }

    const output = await execute(latest);
    await transaction.commit();
    committed = true;
    return output;
  } catch (error) {
    if (!committed) {
      try { await transaction.rollback(); }
      catch (rollbackError) { error.rollbackError = rollbackError; }
    }
    throw error;
  }
};
