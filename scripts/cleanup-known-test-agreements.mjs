import 'dotenv/config';
import { getMssqlPool, closeMssqlPool, sql } from '../src/api/mssql/pool.js';
import { getStorageDriver } from '../src/api/storage/index.js';

const TARGET_RENTEE_ID = '20921820-D86A-46F4-B7F5-30ADA7B3620C';
const TARGET_IDS = [
  '8D448FAA-2F86-4F98-9A57-EC038421B316',
  '60CCF88B-D542-46B3-8F00-674358D2EFAA',
  '045DB729-C274-4407-AA16-BFC3D44EEE1C',
  '3B4D4064-0034-4C6F-89CE-62A19BBF7654',
  'B6D344D5-08B8-4566-AAE6-B1ACF6A2BBB1'
];
const ALLOWED_STATUSES = new Set(['draft', 'review']);
const STORAGE_URL_FIELDS = [
  'documenturl',
  'signeddocumenturl',
  'signed_document_url',
  'signatureurl',
  'signature_pdf_url',
  'pdfurl'
];

const safeIdentifier = (value) => {
  const normalized = String(value || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`Unsafe SQL identifier returned by schema metadata: ${normalized}`);
  }
  return `[${normalized}]`;
};

const bindIds = (request) => {
  TARGET_IDS.forEach((id, index) => request.input(`id${index}`, sql.UniqueIdentifier, id));
  return TARGET_IDS.map((_id, index) => `@id${index}`).join(', ');
};

const parseStorageReference = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalize = (input) => String(input || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');

  try {
    const url = new URL(trimmed);
    const parts = normalize(url.pathname).split('/');
    const storageIndex = parts.indexOf('storage');
    if (storageIndex >= 0 && parts[storageIndex + 1]) {
      return {
        bucket: parts[storageIndex + 1],
        relativePath: parts.slice(storageIndex + 2).join('/')
      };
    }
  } catch (_error) {
    // Treat as a relative storage path below.
  }

  const parts = normalize(trimmed).split('/');
  if (parts[0] === 'storage' && parts[1]) {
    return { bucket: parts[1], relativePath: parts.slice(2).join('/') };
  }

  return null;
};

const run = async () => {
  if (String(process.env.CLEANUP_KNOWN_TEST_AGREEMENTS || '').toLowerCase() !== 'true') {
    console.log('Known agreement cleanup is disabled; no data changed.');
    return;
  }

  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  let deletedRows = [];

  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const selectRequest = new sql.Request(transaction);
    const idList = bindIds(selectRequest);
    selectRequest.input('renteeId', sql.UniqueIdentifier, TARGET_RENTEE_ID);

    const selected = await selectRequest.query(`
      SELECT
        CAST(id AS nvarchar(36)) AS id,
        CAST(renteeid AS nvarchar(36)) AS renteeid,
        status,
        documenturl,
        signeddocumenturl,
        signed_document_url,
        signatureurl,
        signature_pdf_url,
        pdfurl,
        eviasignreference,
        signeddate
      FROM dbo.agreements WITH (UPDLOCK, HOLDLOCK)
      WHERE id IN (${idList})
    `);

    const rows = selected.recordset || [];
    if (rows.length === 0) {
      console.log('Known test agreement rows are already absent.');
      await transaction.commit();
      return;
    }

    for (const row of rows) {
      if (String(row.renteeid || '').toUpperCase() !== TARGET_RENTEE_ID) {
        throw new Error(`Cleanup aborted: agreement ${row.id} belongs to an unexpected renter.`);
      }

      const status = String(row.status || '').toLowerCase();
      if (!ALLOWED_STATUSES.has(status)) {
        throw new Error(`Cleanup aborted: agreement ${row.id} has protected status ${row.status}.`);
      }

      if (row.eviasignreference || row.signeddate) {
        throw new Error(`Cleanup aborted: agreement ${row.id} has signature activity.`);
      }
    }

    const metadataRequest = new sql.Request(transaction);
    const referenceColumnsResult = await metadataRequest.query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE LOWER(COLUMN_NAME) LIKE '%agreement%'
        AND DATA_TYPE IN ('uniqueidentifier', 'nvarchar', 'varchar', 'nchar', 'char')
      ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
    `);

    const blockers = [];
    for (const column of referenceColumnsResult.recordset || []) {
      const tableName = String(column.TABLE_NAME || '');
      const columnName = String(column.COLUMN_NAME || '');
      if (tableName.toLowerCase() === 'agreements' && columnName.toLowerCase() === 'id') {
        continue;
      }

      const request = new sql.Request(transaction);
      const referenceIdList = bindIds(request);
      const query = `
        SELECT COUNT_BIG(1) AS dependency_count
        FROM ${safeIdentifier(column.TABLE_SCHEMA)}.${safeIdentifier(tableName)}
        WHERE TRY_CONVERT(nvarchar(36), ${safeIdentifier(columnName)}) IN (${referenceIdList})
      `;
      const result = await request.query(query);
      const count = Number(result.recordset?.[0]?.dependency_count || 0);
      if (count > 0) {
        blockers.push(`${column.TABLE_SCHEMA}.${tableName}.${columnName} (${count})`);
      }
    }

    if (blockers.length > 0) {
      throw new Error(`Cleanup aborted: downstream agreement references exist: ${blockers.join(', ')}`);
    }

    const deleteRequest = new sql.Request(transaction);
    const deleteIdList = bindIds(deleteRequest);
    deleteRequest.input('renteeId', sql.UniqueIdentifier, TARGET_RENTEE_ID);

    const deleted = await deleteRequest.query(`
      DELETE FROM dbo.agreements
      OUTPUT
        CAST(DELETED.id AS nvarchar(36)) AS id,
        DELETED.documenturl,
        DELETED.signeddocumenturl,
        DELETED.signed_document_url,
        DELETED.signatureurl,
        DELETED.signature_pdf_url,
        DELETED.pdfurl
      WHERE id IN (${deleteIdList})
        AND renteeid = @renteeId
        AND LOWER(status) IN ('draft', 'review')
    `);

    deletedRows = deleted.recordset || [];
    if (deletedRows.length !== rows.length) {
      throw new Error(`Cleanup aborted: expected to delete ${rows.length} rows but deleted ${deletedRows.length}.`);
    }

    await transaction.commit();
    console.log(`Deleted ${deletedRows.length} known Draft/Review agreement test row(s): ${deletedRows.map((row) => row.id).join(', ')}`);
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const storageRefs = new Map();
  for (const row of deletedRows) {
    for (const field of STORAGE_URL_FIELDS) {
      const parsed = parseStorageReference(row[field]);
      if (!parsed?.relativePath) continue;
      storageRefs.set(`${parsed.bucket}/${parsed.relativePath}`, parsed);
    }
  }

  if (storageRefs.size > 0) {
    const storage = getStorageDriver();
    for (const ref of storageRefs.values()) {
      try {
        await storage.deleteObjects(ref.bucket, [ref.relativePath]);
        console.log(`Deleted test agreement storage object ${ref.bucket}/${ref.relativePath}`);
      } catch (error) {
        console.warn(`Agreement row cleanup succeeded, but storage cleanup failed for ${ref.bucket}/${ref.relativePath}: ${error.message}`);
      }
    }
  }
};

try {
  await run();
} finally {
  await closeMssqlPool().catch(() => {});
}
