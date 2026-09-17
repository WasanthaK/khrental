import 'dotenv/config';
import { getMssqlPool, closeMssqlPool, sql } from '../src/api/mssql/pool.js';

const TARGET_RENTEE_ID = '20921820-D86A-46F4-B7F5-30ADA7B3620C';
const TARGET_IDS = [
  '8D448FAA-2F86-4F98-9A57-EC038421B316',
  '60CCF88B-D542-46B3-8F00-674358D2EFAA',
  '045DB729-C274-4407-AA16-BFC3D44EEE1C',
  '3B4D4064-0034-4C6F-89CE-62A19BBF7654',
  'B6D344D5-08B8-4566-AAE6-B1ACF6A2BBB1'
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const bindIds = (request) => {
  TARGET_IDS.forEach((id, index) => request.input(`id${index}`, sql.UniqueIdentifier, id));
  return TARGET_IDS.map((_id, index) => `@id${index}`).join(', ');
};

const safeIdentifier = (value) => {
  const normalized = String(value || '');
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error(`Unsafe SQL identifier returned by schema metadata: ${normalized}`);
  }
  return `[${normalized}]`;
};

const connectWithRetry = async () => {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await getMssqlPool();
    } catch (error) {
      lastError = error;
      console.warn(`MSSQL connection attempt ${attempt}/4 failed: ${error.message}`);
      if (attempt < 4) await sleep(attempt * 5000);
    }
  }
  throw lastError;
};

const runWithIds = async (pool, sqlBuilder) => {
  const request = pool.request();
  const idList = bindIds(request);
  request.input('renteeId', sql.UniqueIdentifier, TARGET_RENTEE_ID);
  return request.query(sqlBuilder(idList));
};

const run = async () => {
  const pool = await connectWithRetry();

  const agreements = await runWithIds(pool, (idList) => `
    SELECT
      CAST(id AS nvarchar(36)) AS id,
      CAST(tenant_id AS nvarchar(36)) AS tenant_id,
      CAST(renteeid AS nvarchar(36)) AS renteeid,
      CAST(propertyid AS nvarchar(36)) AS propertyid,
      CAST(unitid AS nvarchar(36)) AS unitid,
      status,
      startdate,
      enddate,
      createdat,
      signeddate,
      activated_at,
      eviasignreference,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(documenturl, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_documenturl,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(signeddocumenturl, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_signeddocumenturl,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(signed_document_url, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_signed_document_url,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(signatureurl, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_signatureurl,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(signature_pdf_url, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_signature_pdf_url,
      CASE WHEN NULLIF(LTRIM(RTRIM(COALESCE(pdfurl, ''))), '') IS NULL THEN 0 ELSE 1 END AS has_pdfurl
    FROM dbo.agreements
    WHERE id IN (${idList})
    ORDER BY createdat, id
  `);

  const foreignKeys = await pool.request().query(`
    SELECT
      fk.name AS foreign_key_name,
      OBJECT_SCHEMA_NAME(fk.parent_object_id) AS child_schema,
      OBJECT_NAME(fk.parent_object_id) AS child_table,
      pc.name AS child_column,
      OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS parent_schema,
      OBJECT_NAME(fk.referenced_object_id) AS parent_table,
      rc.name AS parent_column,
      fk.delete_referential_action_desc AS delete_action
    FROM sys.foreign_keys fk
    INNER JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
    INNER JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
    INNER JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
    WHERE fk.referenced_object_id = OBJECT_ID(N'dbo.agreements')
    ORDER BY child_schema, child_table, child_column
  `);

  const lifecycleEvents = await runWithIds(pool, (idList) => `
    SELECT
      CAST(id AS nvarchar(36)) AS id,
      CAST(agreement_id AS nvarchar(36)) AS agreement_id,
      CAST(tenant_id AS nvarchar(36)) AS tenant_id,
      event_type,
      from_status,
      to_status,
      CAST(actor_user_id AS nvarchar(36)) AS actor_user_id,
      metadata,
      createdat
    FROM dbo.tenancy_lifecycle_events
    WHERE agreement_id IN (${idList})
    ORDER BY agreement_id, createdat, id
  `);

  const checklists = await runWithIds(pool, (idList) => `
    SELECT
      CAST(id AS nvarchar(36)) AS id,
      CAST(agreement_id AS nvarchar(36)) AS agreement_id,
      CAST(tenant_id AS nvarchar(36)) AS tenant_id,
      CAST(propertyid AS nvarchar(36)) AS propertyid,
      CAST(unitid AS nvarchar(36)) AS unitid,
      status,
      CAST(created_by AS nvarchar(36)) AS created_by,
      CAST(completed_by AS nvarchar(36)) AS completed_by,
      completed_at,
      createdat,
      updatedat
    FROM dbo.tenancy_move_in_checklists
    WHERE agreement_id IN (${idList})
    ORDER BY agreement_id, createdat, id
  `);

  const checklistItems = await runWithIds(pool, (idList) => `
    SELECT
      CAST(i.id AS nvarchar(36)) AS id,
      CAST(i.checklist_id AS nvarchar(36)) AS checklist_id,
      CAST(c.agreement_id AS nvarchar(36)) AS agreement_id,
      i.item_order,
      i.label,
      i.is_required,
      i.status,
      i.notes,
      CAST(i.completed_by AS nvarchar(36)) AS completed_by,
      i.completed_at,
      i.createdat,
      i.updatedat
    FROM dbo.tenancy_move_in_checklist_items i
    INNER JOIN dbo.tenancy_move_in_checklists c
      ON c.id = i.checklist_id
     AND c.tenant_id = i.tenant_id
    WHERE c.agreement_id IN (${idList})
    ORDER BY c.agreement_id, i.item_order, i.createdat, i.id
  `);

  const deposits = await runWithIds(pool, (idList) => `
    SELECT
      CAST(id AS nvarchar(36)) AS id,
      CAST(agreement_id AS nvarchar(36)) AS agreement_id,
      transaction_type,
      amount,
      status,
      payment_method,
      payment_reference,
      received_at,
      createdat
    FROM dbo.tenancy_deposit_transactions
    WHERE agreement_id IN (${idList})
    ORDER BY agreement_id, createdat, id
  `);

  const referenceColumns = await pool.request().query(`
    SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE LOWER(COLUMN_NAME) LIKE '%agreement%'
      AND DATA_TYPE IN ('uniqueidentifier', 'nvarchar', 'varchar', 'nchar', 'char')
    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
  `);

  const referenceCounts = [];
  for (const column of referenceColumns.recordset || []) {
    const tableName = String(column.TABLE_NAME || '');
    const columnName = String(column.COLUMN_NAME || '');
    if (tableName.toLowerCase() === 'agreements' && columnName.toLowerCase() === 'id') continue;

    const request = pool.request();
    const idList = bindIds(request);
    const result = await request.query(`
      SELECT
        TRY_CONVERT(nvarchar(36), ${safeIdentifier(columnName)}) AS agreement_id,
        COUNT_BIG(1) AS dependency_count
      FROM ${safeIdentifier(column.TABLE_SCHEMA)}.${safeIdentifier(tableName)}
      WHERE TRY_CONVERT(nvarchar(36), ${safeIdentifier(columnName)}) IN (${idList})
      GROUP BY TRY_CONVERT(nvarchar(36), ${safeIdentifier(columnName)})
    `);

    for (const row of result.recordset || []) {
      referenceCounts.push({
        table_schema: column.TABLE_SCHEMA,
        table_name: tableName,
        column_name: columnName,
        agreement_id: row.agreement_id,
        dependency_count: Number(row.dependency_count || 0)
      });
    }
  }

  const agreementRows = agreements.recordset || [];
  const unexpectedOwnership = agreementRows.filter(
    (row) => String(row.renteeid || '').toUpperCase() !== TARGET_RENTEE_ID
  );
  const missingIds = TARGET_IDS.filter(
    (id) => !agreementRows.some((row) => String(row.id || '').toUpperCase() === id)
  );

  console.log('KNOWN_TEST_AGREEMENT_INSPECTION_BEGIN');
  console.log(`AGREEMENTS=${JSON.stringify(agreementRows)}`);
  console.log(`AGREEMENT_FOREIGN_KEYS=${JSON.stringify(foreignKeys.recordset || [])}`);
  console.log(`REFERENCE_COUNTS=${JSON.stringify(referenceCounts)}`);
  console.log(`LIFECYCLE_EVENTS=${JSON.stringify(lifecycleEvents.recordset || [])}`);
  console.log(`MOVE_IN_CHECKLISTS=${JSON.stringify(checklists.recordset || [])}`);
  console.log(`MOVE_IN_CHECKLIST_ITEMS=${JSON.stringify(checklistItems.recordset || [])}`);
  console.log(`DEPOSIT_TRANSACTIONS=${JSON.stringify(deposits.recordset || [])}`);
  console.log(`MISSING_TARGET_IDS=${JSON.stringify(missingIds)}`);
  console.log(`UNEXPECTED_OWNERSHIP=${JSON.stringify(unexpectedOwnership)}`);
  console.log('KNOWN_TEST_AGREEMENT_INSPECTION_END');

  if (unexpectedOwnership.length > 0) {
    throw new Error('Inspection found a target agreement belonging to an unexpected renter.');
  }
};

try {
  await run();
} finally {
  await closeMssqlPool().catch(() => {});
}
