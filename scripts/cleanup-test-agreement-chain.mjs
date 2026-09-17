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
const ALLOWED_DIRECT_DEPENDENCIES = new Set([
  'dbo.tenancy_lifecycle_events.agreement_id',
  'dbo.tenancy_move_in_checklists.agreement_id'
]);
const STORAGE_FIELDS = ['documenturl','signeddocumenturl','signed_document_url','signatureurl','signature_pdf_url','pdfurl'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bindIds = (request, prefix = 'id') => {
  TARGET_IDS.forEach((id, index) => request.input(`${prefix}${index}`, sql.UniqueIdentifier, id));
  return TARGET_IDS.map((_id, index) => `@${prefix}${index}`).join(', ');
};

const safeIdentifier = (value) => {
  const normalized = String(value || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) throw new Error(`Unsafe SQL identifier: ${normalized}`);
  return `[${normalized}]`;
};

const parseStorageReference = (value) => {
  if (!value || typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    const parts = url.pathname.replace(/^\/+/, '').split('/');
    const index = parts.indexOf('storage');
    if (index >= 0 && parts[index + 1] && parts[index + 2]) {
      return { bucket: parts[index + 1], relativePath: parts.slice(index + 2).join('/') };
    }
  } catch (_error) {}
  return null;
};

const getPoolWithRetry = async () => {
  let lastError;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      return await getMssqlPool();
    } catch (error) {
      lastError = error;
      console.warn(`Database connection attempt ${attempt}/6 failed: ${error.message}`);
      await closeMssqlPool().catch(() => {});
      if (attempt < 6) await sleep(5000);
    }
  }
  throw lastError;
};

const run = async () => {
  if (String(process.env.CLEANUP_TEST_AGREEMENT_CHAIN || '').toLowerCase() !== 'true') {
    console.log('Test agreement chain cleanup disabled.');
    return;
  }

  const pool = await getPoolWithRetry();
  const transaction = new sql.Transaction(pool);
  let deletedAgreements = [];
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const selectRequest = new sql.Request(transaction);
    const ids = bindIds(selectRequest);
    selectRequest.input('renteeId', sql.UniqueIdentifier, TARGET_RENTEE_ID);
    const selected = await selectRequest.query(`
      SELECT CAST(id AS nvarchar(36)) AS id, CAST(renteeid AS nvarchar(36)) AS renteeid,
             status, eviasignreference, signeddate,
             documenturl, signeddocumenturl, signed_document_url, signatureurl, signature_pdf_url, pdfurl
      FROM dbo.agreements WITH (UPDLOCK, HOLDLOCK)
      WHERE id IN (${ids})
    `);
    const rows = selected.recordset || [];
    if (rows.length === 0) {
      await transaction.commit();
      console.log('TEST_AGREEMENT_CHAIN_CLEANUP_OK already-absent');
      return;
    }

    for (const row of rows) {
      if (String(row.renteeid || '').toUpperCase() !== TARGET_RENTEE_ID) throw new Error(`Unexpected renter for ${row.id}`);
      if (!ALLOWED_STATUSES.has(String(row.status || '').toLowerCase())) throw new Error(`Protected agreement status for ${row.id}: ${row.status}`);
      if (row.eviasignreference || row.signeddate) throw new Error(`Signature activity exists for ${row.id}`);
    }

    const metadata = await new sql.Request(transaction).query(`
      SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE LOWER(COLUMN_NAME) LIKE '%agreement%'
        AND DATA_TYPE IN ('uniqueidentifier','nvarchar','varchar','nchar','char')
    `);
    const unexpected = [];
    for (const column of metadata.recordset || []) {
      const key = `${column.TABLE_SCHEMA}.${column.TABLE_NAME}.${column.COLUMN_NAME}`;
      if (key.toLowerCase() === 'dbo.agreements.id') continue;
      const request = new sql.Request(transaction);
      const list = bindIds(request, 'ref');
      const result = await request.query(`SELECT COUNT_BIG(1) AS n FROM ${safeIdentifier(column.TABLE_SCHEMA)}.${safeIdentifier(column.TABLE_NAME)} WHERE TRY_CONVERT(nvarchar(36), ${safeIdentifier(column.COLUMN_NAME)}) IN (${list})`);
      const count = Number(result.recordset?.[0]?.n || 0);
      if (count > 0 && !ALLOWED_DIRECT_DEPENDENCIES.has(key)) unexpected.push(`${key} (${count})`);
    }
    if (unexpected.length) throw new Error(`Unexpected downstream references: ${unexpected.join(', ')}`);

    const checklistRequest = new sql.Request(transaction);
    const checklistIds = bindIds(checklistRequest, 'cl');
    const checklists = await checklistRequest.query(`SELECT id FROM dbo.tenancy_move_in_checklists WHERE agreement_id IN (${checklistIds})`);
    const checklistRows = checklists.recordset || [];

    if (checklistRows.length) {
      const deleteItems = new sql.Request(transaction);
      const placeholders = checklistRows.map((row, index) => {
        deleteItems.input(`checklist${index}`, sql.UniqueIdentifier, row.id);
        return `@checklist${index}`;
      }).join(', ');
      const itemsResult = await deleteItems.query(`DELETE FROM dbo.tenancy_move_in_checklist_items OUTPUT DELETED.id WHERE checklist_id IN (${placeholders})`);
      console.log(`Deleted ${itemsResult.recordset?.length || 0} move-in checklist item(s).`);
    }

    const childRequest = new sql.Request(transaction);
    const childIds = bindIds(childRequest, 'child');
    const lifecycle = await childRequest.query(`DELETE FROM dbo.tenancy_lifecycle_events OUTPUT DELETED.id WHERE agreement_id IN (${childIds})`);
    console.log(`Deleted ${lifecycle.recordset?.length || 0} tenancy lifecycle event(s).`);

    const checklistDeleteRequest = new sql.Request(transaction);
    const checklistDeleteIds = bindIds(checklistDeleteRequest, 'checkdel');
    const checklistDelete = await checklistDeleteRequest.query(`DELETE FROM dbo.tenancy_move_in_checklists OUTPUT DELETED.id WHERE agreement_id IN (${checklistDeleteIds})`);
    console.log(`Deleted ${checklistDelete.recordset?.length || 0} move-in checklist(s).`);

    const deleteRequest = new sql.Request(transaction);
    const deleteIds = bindIds(deleteRequest, 'del');
    deleteRequest.input('renteeId', sql.UniqueIdentifier, TARGET_RENTEE_ID);
    const deleted = await deleteRequest.query(`
      DELETE FROM dbo.agreements
      OUTPUT CAST(DELETED.id AS nvarchar(36)) AS id, DELETED.documenturl, DELETED.signeddocumenturl,
             DELETED.signed_document_url, DELETED.signatureurl, DELETED.signature_pdf_url, DELETED.pdfurl
      WHERE id IN (${deleteIds}) AND renteeid = @renteeId AND LOWER(status) IN ('draft','review')
    `);
    deletedAgreements = deleted.recordset || [];
    if (deletedAgreements.length !== rows.length) throw new Error(`Expected ${rows.length} agreement deletions, got ${deletedAgreements.length}`);

    await transaction.commit();
    console.log(`Deleted ${deletedAgreements.length} known test agreement(s).`);
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }

  const storage = getStorageDriver();
  const refs = new Map();
  for (const row of deletedAgreements) {
    for (const field of STORAGE_FIELDS) {
      const ref = parseStorageReference(row[field]);
      if (ref) refs.set(`${ref.bucket}/${ref.relativePath}`, ref);
    }
  }
  for (const ref of refs.values()) {
    try { await storage.deleteObjects(ref.bucket, [ref.relativePath]); }
    catch (error) { console.warn(`Storage cleanup warning for ${ref.bucket}/${ref.relativePath}: ${error.message}`); }
  }

  console.log(`TEST_AGREEMENT_CHAIN_CLEANUP_OK deleted=${deletedAgreements.length}`);
};

try { await run(); } finally { await closeMssqlPool().catch(() => {}); }
