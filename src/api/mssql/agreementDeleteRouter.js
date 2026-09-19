import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { isAdminRole } from '../platform/permissionEngine.js';
import { getMssqlPool, sql } from './pool.js';
import { getStorageDriver, normalizeStoragePath } from '../storage/index.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SIGNED_SIGNATURE_STATUSES = new Set([
  'completed',
  'complete',
  'signed',
  'signing_complete',
  'signed_by_landlord',
  'signed_by_tenant'
]);
const SAFE_CASCADE_DEPENDENCIES = new Set(['agreement_signature_status.agreement_id']);
const DOCUMENT_URL_FIELDS = [
  'documenturl',
  'signeddocumenturl',
  'signed_document_url',
  'pdfurl',
  'signatureurl',
  'signature_pdf_url'
];

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const safeIdentifier = (value) => {
  const normalized = String(value || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`Unsafe SQL identifier returned by schema metadata: ${normalized}`);
  }
  return `[${normalized}]`;
};

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== '';

export const getAgreementDeletionEligibility = (agreement) => {
  if (!agreement) {
    return { ok: false, status: 404, code: 'AGREEMENT_NOT_FOUND', message: 'Agreement not found.' };
  }

  if (String(agreement.status || '').trim().toLowerCase() !== 'cancelled') {
    return {
      ok: false,
      status: 409,
      code: 'AGREEMENT_DELETE_STATUS_NOT_ALLOWED',
      message: 'Only cancelled agreements can be permanently deleted.'
    };
  }

  const signatureStatus = String(agreement.signature_status || '').trim().toLowerCase();
  const hasHistoricalSignature = Boolean(
    agreement.signeddate ||
    agreement.activated_at ||
    agreement.signature_completed_at ||
    SIGNED_SIGNATURE_STATUSES.has(signatureStatus) ||
    hasValue(agreement.signeddocumenturl) ||
    hasValue(agreement.signed_document_url) ||
    hasValue(agreement.signature_pdf_url)
  );

  if (hasHistoricalSignature) {
    return {
      ok: false,
      status: 409,
      code: 'AGREEMENT_DELETE_HISTORICAL_RECORD',
      message: 'This cancelled agreement has signing or activation history and must be retained.'
    };
  }

  return { ok: true };
};

export const extractManagedAgreementStorageObjects = (agreement, tenantId) => {
  if (!agreement?.id || !tenantId) return [];

  const expectedPrefix = `tenants/${tenantId}/agreements/${agreement.id}/`.toLowerCase();
  const objects = new Map();

  for (const field of DOCUMENT_URL_FIELDS) {
    const value = agreement[field];
    if (!hasValue(value)) continue;

    try {
      const parsed = new URL(String(value), 'https://khrentals.local');
      const marker = '/storage/';
      const markerIndex = parsed.pathname.toLowerCase().indexOf(marker);
      if (markerIndex < 0) continue;

      const storagePath = decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
      const [bucket, ...pathParts] = storagePath.split('/').filter(Boolean);
      if (!bucket || pathParts.length === 0) continue;

      const relativePath = normalizeStoragePath(pathParts.join('/'));
      if (!relativePath.toLowerCase().startsWith(expectedPrefix)) continue;

      objects.set(`${bucket}:${relativePath}`, { bucket, path: relativePath });
    } catch (_error) {
      // External or malformed URLs are intentionally ignored. We only remove
      // exact KH Rentals managed-storage objects belonging to this agreement.
    }
  }

  return [...objects.values()];
};

const findAgreementDependencies = async (pool, agreementId) => {
  const metadataRequest = new sql.Request(pool);
  const metadata = await metadataRequest.query(`
    SELECT TABLE_NAME, COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND DATA_TYPE = 'uniqueidentifier'
      AND LOWER(COLUMN_NAME) LIKE '%agreement%id%'
    ORDER BY TABLE_NAME, COLUMN_NAME
  `);

  const blockers = [];
  for (const row of metadata.recordset || []) {
    const tableName = String(row.TABLE_NAME || '');
    const columnName = String(row.COLUMN_NAME || '');
    const normalizedReference = `${tableName}.${columnName}`.toLowerCase();

    if (tableName.toLowerCase() === 'agreements' && columnName.toLowerCase() === 'id') continue;
    if (SAFE_CASCADE_DEPENDENCIES.has(normalizedReference)) continue;

    const request = new sql.Request(pool);
    request.input('agreementId', sql.UniqueIdentifier, agreementId);
    const result = await request.query(`
      SELECT COUNT_BIG(1) AS dependency_count
      FROM dbo.${safeIdentifier(tableName)}
      WHERE ${safeIdentifier(columnName)} = @agreementId
    `);
    const count = Number(result.recordset?.[0]?.dependency_count || 0);

    if (count > 0) {
      blockers.push({ table: tableName, column: columnName, count });
    }
  }

  return blockers;
};

const cleanupAgreementStorage = async (agreement, tenantId) => {
  const objects = extractManagedAgreementStorageObjects(agreement, tenantId);
  const deleted = [];
  const warnings = [];

  for (const object of objects) {
    try {
      await getStorageDriver().deleteObjects(object.bucket, [object.path]);
      deleted.push(object);
    } catch (error) {
      warnings.push({
        bucket: object.bucket,
        path: object.path,
        error: String(error?.message || error)
      });
    }
  }

  return { deleted, warnings };
};

const deleteCancelledAgreement = async (agreementId, tenantId) => {
  const pool = await getMssqlPool();
  const lookup = new sql.Request(pool);
  lookup.input('agreementId', sql.UniqueIdentifier, agreementId);
  lookup.input('tenantId', sql.UniqueIdentifier, tenantId);

  const agreementResult = await lookup.query(`
    SELECT TOP 1 *
    FROM dbo.agreements
    WHERE id = @agreementId
      AND tenant_id = @tenantId
  `);
  const agreement = agreementResult.recordset?.[0] || null;
  const eligibility = getAgreementDeletionEligibility(agreement);
  if (!eligibility.ok) return { eligibility };

  const blockers = await findAgreementDependencies(pool, agreementId);
  if (blockers.length > 0) {
    return {
      eligibility: {
        ok: false,
        status: 409,
        code: 'AGREEMENT_DELETE_DEPENDENCIES',
        message: 'This agreement is referenced by tenancy or financial records and cannot be permanently deleted.',
        details: { blockers }
      }
    };
  }

  const deletion = new sql.Request(pool);
  deletion.input('agreementId', sql.UniqueIdentifier, agreementId);
  deletion.input('tenantId', sql.UniqueIdentifier, tenantId);

  try {
    const deletedResult = await deletion.query(`
      DELETE FROM dbo.agreements
      OUTPUT DELETED.*
      WHERE id = @agreementId
        AND tenant_id = @tenantId
        AND LOWER(status) = 'cancelled'
    `);
    const deletedAgreement = deletedResult.recordset?.[0] || null;
    if (!deletedAgreement) {
      return {
        eligibility: {
          ok: false,
          status: 409,
          code: 'AGREEMENT_DELETE_STATE_CHANGED',
          message: 'The agreement changed while deletion was being processed. Refresh and try again.'
        }
      };
    }

    return { eligibility: { ok: true }, agreement: deletedAgreement };
  } catch (error) {
    if (Number(error?.number) === 547 || String(error?.message || '').includes('REFERENCE constraint')) {
      return {
        eligibility: {
          ok: false,
          status: 409,
          code: 'AGREEMENT_DELETE_DEPENDENCIES',
          message: 'This agreement is still referenced by another record and cannot be permanently deleted.'
        }
      };
    }
    throw error;
  }
};

const ensureAdminUser = (req, res, next) => {
  if (!isAdminRole({ user: req.user, membership: req.membership })) {
    res.status(403).json({
      error: 'Administrator access is required to permanently delete agreements.',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
    return;
  }
  next();
};

export const createAgreementDeleteRouter = () => {
  const router = express.Router();
  const requireAdminContext = createTenantContextMiddleware({
    requireUser: true,
    auditLabel: 'mssql-agreement-delete',
    auditUnsafeOnly: true
  });

  router.delete('/agreements/:id', requireAdminContext, ensureAdminUser, asyncHandler(async (req, res) => {
    const agreementId = String(req.params.id || '').trim();
    if (!UUID_RE.test(agreementId)) {
      res.status(400).json({ error: 'Valid agreement id is required.', code: 'AGREEMENT_ID_INVALID' });
      return;
    }

    const result = await deleteCancelledAgreement(agreementId, req.tenantId);
    if (!result.eligibility.ok) {
      res.status(result.eligibility.status).json({
        error: result.eligibility.message,
        code: result.eligibility.code,
        ...(result.eligibility.details ? { details: result.eligibility.details } : {})
      });
      return;
    }

    const storageCleanup = await cleanupAgreementStorage(result.agreement, req.tenantId);
    res.json({
      data: {
        agreement: result.agreement,
        storage_cleanup: storageCleanup
      }
    });
  }));

  return router;
};
