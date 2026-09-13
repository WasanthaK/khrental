import express from 'express';
import crypto from 'node:crypto';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import {
  createAppUser,
  createTenantMembership,
  findAppUserByEmail,
  updateAppUser
} from '../mssql/repositories.js';
import { isMssqlConfigured } from '../mssql/config.js';
import { createTenantContextMiddleware, serializeTenantContext } from '../tenant/context.js';
import {
  createAuthRecord,
  clearStorageSessionCookie,
  findAuthRecordByEmail,
  issueAuthSession,
  markSuccessfulLogin,
  revokeAccessToken,
  setStorageSessionCookie,
  updateAuthRecord,
  verifyPasswordCredential
} from '../auth/index.js';
import { getStorageDriver, normalizeStoragePath } from '../storage/index.js';

const IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TENANT_SCOPED_TABLES = new Set([
  'app_users',
  'properties',
  'property_units',
  'agreements',
  'agreement_templates',
  'invoices',
  'payments',
  'maintenance_requests',
  'maintenance_request_images',
  'maintenance_request_comments',
  'notifications',
  'webhook_events',
  'utility_readings',
  'utility_configs',
  'action_records',
  'scheduled_tasks',
  'task_assignments',
  'letter_templates',
  'sent_letters',
  'cameras',
  'camera_monitoring',
  'tenant_memberships',
  'tenant_settings'
]);
const ALLOWED_RPCS = new Set([
  'exec_sql',
  'get_table_columns',
  'reject_utility_reading',
  'update_agreement_status',
  'get_rentees_by_property',
  'get_rentees_by_unit',
  'test_status_value',
  'create_policy',
  'enable_rls',
  'create_app_users_table',
  'create_create_app_users_table_procedure'
]);

const RELATION_CONFIG = {
  invoices: {
    properties: { table: 'properties', localKey: 'propertyid', remoteKey: 'id', type: 'one' },
    app_users: { table: 'app_users', localKey: 'renteeid', remoteKey: 'id', type: 'one' }
  },
  utility_readings: {
    properties: { table: 'properties', localKey: 'propertyid', remoteKey: 'id', type: 'one' },
    app_users: { table: 'app_users', localKey: 'renteeid', remoteKey: 'id', type: 'one' },
    invoices: { table: 'invoices', localKey: 'invoice_id', remoteKey: 'id', type: 'one' }
  },
  maintenance_requests: {
    maintenance_request_images: { table: 'maintenance_request_images', localKey: 'id', remoteKey: 'maintenance_request_id', type: 'many' },
    properties: { table: 'properties', localKey: 'propertyid', remoteKey: 'id', type: 'one' },
    app_users: { table: 'app_users', localKey: 'renteeid', remoteKey: 'id', type: 'one' }
  },
  agreements: {
    properties: { table: 'properties', localKey: 'propertyid', remoteKey: 'id', type: 'one' },
    app_users: { table: 'app_users', localKey: 'renteeid', remoteKey: 'id', type: 'one' },
    property_units: { table: 'property_units', localKey: 'unitid', remoteKey: 'id', type: 'one' },
    agreement_templates: { table: 'agreement_templates', localKey: 'templateid', remoteKey: 'id', type: 'one' }
  }
};

const ensureIdentifier = (value, label = 'identifier') => {
  if (!IDENTIFIER_REGEX.test(value || '')) {
    throw new Error(`Invalid ${label}: ${value}`);
  }

  return value;
};

const splitSelect = (select = '*') => {
  const parts = [];
  let current = '';
  let depth = 0;

  for (const char of String(select)) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(depth - 1, 0);

    if (char === ',' && depth === 0) {
      if (current.trim()) parts.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
};

const parseRelationSpec = (part) => {
  const colonMatch = part.match(/^([A-Za-z_][A-Za-z0-9_]*)(?::|!)([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
  if (colonMatch) {
    return {
      alias: colonMatch[1],
      localKey: colonMatch[2],
      columns: colonMatch[3] || '*'
    };
  }

  const tableMatch = part.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)$/);
  if (tableMatch) {
    return {
      alias: tableMatch[1],
      columns: tableMatch[2] || '*'
    };
  }

  return null;
};

const normalizeValue = (value) => {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
};

const parseDbValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  }

  return value;
};

const mapRow = (row) => {
  const mapped = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    mapped[key] = parseDbValue(value);
  });
  return mapped;
};

const isMssqlUnavailableError = (error) => {
  const message = String(error?.message || error || '');
  return message.includes('MSSQL is not configured');
};

const isMissingTableError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('invalid object name') || message.includes('invalid column name');
};

const isInvalidUniqueIdentifierError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('conversion failed when converting from a character string to uniqueidentifier');
};

const isTenantScopedTable = (table) => TENANT_SCOPED_TABLES.has(String(table || '').toLowerCase());

const rejectTenantOverride = () => {
  const error = new Error('Client-supplied tenant filters are not allowed on platform queries.');
  error.status = 403;
  error.code = 'TENANT_OVERRIDE_BLOCKED';
  return error;
};

const requireTenantForTable = (table, tenantId) => {
  if (isTenantScopedTable(table) && !tenantId) {
    const error = new Error('An active tenant context is required for this table.');
    error.status = 403;
    error.code = 'TENANT_CONTEXT_REQUIRED';
    throw error;
  }
};

const applyTenantFilterToFilters = (filters = [], tenantId) => {
  const normalizedFilters = Array.isArray(filters) ? filters : [];
  if (normalizedFilters.some((filter) => String(filter?.column || '').toLowerCase() === 'tenant_id')) {
    throw rejectTenantOverride();
  }

  return [...normalizedFilters, { column: 'tenant_id', operator: 'eq', value: tenantId }];
};

const applyTenantToPayload = (payload, tenantId) => {
  const normalizeRow = (row = {}) => {
    if (row.tenant_id !== undefined && row.tenant_id !== tenantId) {
      throw rejectTenantOverride();
    }

    return {
      ...row,
      tenant_id: tenantId
    };
  };

  return Array.isArray(payload)
    ? payload.map((row) => normalizeRow(row || {}))
    : normalizeRow(payload || {});
};

const getScopedFilters = ({ table, filters = [], tenantId }) => {
  if (!isTenantScopedTable(table)) {
    return Array.isArray(filters) ? filters : [];
  }

  requireTenantForTable(table, tenantId);
  return applyTenantFilterToFilters(filters, tenantId);
};

const getScopedPayload = ({ table, payload, tenantId }) => {
  if (!isTenantScopedTable(table)) {
    return payload;
  }

  requireTenantForTable(table, tenantId);
  return applyTenantToPayload(payload, tenantId);
};

const auditPlatformRejection = (req, reason, details = {}) => {
  console.warn('[Platform] Rejected request', {
    method: req.method,
    path: req.originalUrl,
    reason,
    tenantId: req.tenantId || null,
    userId: req.user?.id || null,
    ...details
  });
};

const buildAuthUser = (record) => ({
  id: record.authId,
  email: record.email,
  role: record.role || 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'local-mssql', role: record.role || 'authenticated' },
  user_metadata: record.metadata || {}
});

const buildSession = async (record) => {
  const issued = await issueAuthSession(record);
  return {
    access_token: issued.accessToken,
    token_type: 'bearer',
    expires_at: Math.floor(new Date(issued.expiresAt).getTime() / 1000),
    user: buildAuthUser(record)
  };
};

const resolveSelfRegistrationTenant = async () => {
  const tenant = await runSingleQuery(`
    SELECT TOP 1 id
    FROM dbo.tenants
    WHERE slug = @slug
      AND ([status] IS NULL OR [status] = 'active')
  `, { slug: 'kh-rentals' });

  if (!tenant?.id) {
    const error = new Error('The KH Rentals tenant is not available for registration.');
    error.status = 503;
    error.code = 'REGISTRATION_TENANT_UNAVAILABLE';
    throw error;
  }

  return tenant.id;
};

const ensureAuthRecord = async ({ email, password, role = 'authenticated', metadata = {} }) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new Error('Email is required.');
  }

  const existing = await findAuthRecordByEmail(normalizedEmail);
  if (existing) {
    return { record: existing, created: false };
  }

  const authId = crypto.randomUUID();
  let appUser = await findAppUserByEmail(normalizedEmail);
  if (!appUser) {
    const tenantId = await resolveSelfRegistrationTenant();
    appUser = await createAppUser({
      tenant_id: tenantId,
      email: normalizedEmail,
      auth_id: authId,
      name: metadata.name || normalizedEmail.split('@')[0],
      role,
      user_type: metadata.user_type || (role === 'rentee' ? 'rentee' : 'staff'),
      status: metadata.status || 'active',
      invited: Boolean(metadata.invited)
    });

    await createTenantMembership(tenantId, {
      app_user_id: appUser.id,
      role,
      status: 'active',
      is_default: true
    });
  } else if (!appUser.auth_id) {
    appUser = await updateAppUser(appUser.id, { auth_id: authId, invited: true });
  }

  const record = await createAuthRecord({
    authId,
    appUserId: appUser?.id || null,
    email: normalizedEmail,
    password: password || crypto.randomUUID(),
    role,
    metadata
  });

  return { record, created: true };
};

const coerceFilter = (filter = {}, index = 0) => {
  const column = String(filter.column || '').trim();
  const operator = String(filter.operator || 'eq').trim().toLowerCase();
  const value = filter.value;

  if (!column) {
    throw new Error(`Missing filter column at index ${index}`);
  }

  return { column, operator, value };
};

const isSimpleColumn = (column) => IDENTIFIER_REGEX.test(column);

const buildWhereClause = (filters = []) => {
  const clauses = [];
  const params = {};
  const postFilters = [];

  filters.forEach((filter, index) => {
    const { column, operator, value } = coerceFilter(filter, index);

    if (!isSimpleColumn(column)) {
      postFilters.push({ column, operator, value });
      return;
    }

    const paramKey = `filter${index}`;

    switch (operator) {
      case 'eq':
        clauses.push(`${column} = @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'neq':
        clauses.push(`${column} <> @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'gt':
        clauses.push(`${column} > @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'gte':
        clauses.push(`${column} >= @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'lt':
        clauses.push(`${column} < @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'lte':
        clauses.push(`${column} <= @${paramKey}`);
        params[paramKey] = normalizeValue(value);
        break;
      case 'like':
      case 'ilike':
        clauses.push(`${operator === 'ilike' ? 'LOWER(' + column + ')' : column} LIKE ${operator === 'ilike' ? 'LOWER(' : ''}@${paramKey}${operator === 'ilike' ? ')' : ''}`);
        params[paramKey] = String(value || '');
        break;
      case 'in': {
        if (!Array.isArray(value) || value.length === 0) {
          clauses.push('1 = 0');
          break;
        }

        const inParams = value.map((entry, valueIndex) => {
          const itemKey = `${paramKey}_${valueIndex}`;
          params[itemKey] = normalizeValue(entry);
          return `@${itemKey}`;
        });
        clauses.push(`${column} IN (${inParams.join(', ')})`);
        break;
      }
      case 'is':
        clauses.push(value === null ? `${column} IS NULL` : `${column} = @${paramKey}`);
        if (value !== null) params[paramKey] = normalizeValue(value);
        break;
      default:
        postFilters.push({ column, operator, value });
    }
  });

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    postFilters
  };
};

const applyPostFilters = (rows, filters = []) => rows.filter((row) => {
  return filters.every(({ column, operator, value }) => {
    const pathParts = String(column).split('->').map((part) => part.trim()).filter(Boolean);
    const currentValue = pathParts.reduce((accumulator, part) => accumulator?.[part], row);

    switch (operator) {
      case 'eq':
        return currentValue === value;
      case 'neq':
        return currentValue !== value;
      case 'is':
        return value === null ? currentValue == null : currentValue === value;
      case 'like':
      case 'ilike':
        return String(currentValue || '').toLowerCase().includes(String(value || '').replace(/%/g, '').toLowerCase());
      default:
        return true;
    }
  });
});

const augmentRows = async (table, select, rows, tenantId = null) => {
  const relationSpecs = splitSelect(select).map(parseRelationSpec).filter(Boolean);
  if (relationSpecs.length === 0 || rows.length === 0) {
    return rows;
  }

  const tableRelations = RELATION_CONFIG[table] || {};
  const augmented = rows.map((row) => ({ ...row }));

  for (const spec of relationSpecs) {
    const relation = tableRelations[spec.alias] || {
      table: spec.alias,
      localKey: spec.localKey,
      remoteKey: 'id',
      type: spec.localKey ? 'one' : 'many'
    };

    if (!relation.localKey && relation.type !== 'many') {
      continue;
    }

    const ids = [...new Set(augmented.map((row) => row[spec.localKey || relation.localKey]).filter(Boolean))];
    if (relation.type === 'one' && ids.length === 0) {
      augmented.forEach((row) => {
        row[spec.alias] = null;
      });
      continue;
    }

    const selectedColumns = splitSelect(spec.columns)
      .map((column) => column.trim())
      .filter((column) => column === '*' || IDENTIFIER_REGEX.test(column));
    const columnSql = selectedColumns.length === 0 || selectedColumns.includes('*')
      ? '*'
      : selectedColumns.join(', ');

    if (relation.type === 'many') {
      const parentIds = [...new Set(augmented.map((row) => row[relation.localKey]).filter(Boolean))];
      if (parentIds.length === 0) {
        augmented.forEach((row) => {
          row[spec.alias] = [];
        });
        continue;
      }

      const params = {};
      const placeholders = parentIds.map((id, index) => {
        const key = `rel_${spec.alias}_${index}`;
        params[key] = id;
        return `@${key}`;
      });

      const tenantClause = isTenantScopedTable(relation.table)
        ? ` AND tenant_id = @rel_tenant_id_${spec.alias}`
        : '';
      if (tenantClause) {
        params[`rel_tenant_id_${spec.alias}`] = tenantId;
      }

      const relatedRows = (await runQuery(
        `SELECT ${columnSql} FROM ${ensureIdentifier(relation.table, 'table')} WHERE ${ensureIdentifier(relation.remoteKey, 'column')} IN (${placeholders.join(', ')})${tenantClause}`,
        params
      )).map(mapRow);

      augmented.forEach((row) => {
        row[spec.alias] = relatedRows.filter((relatedRow) => relatedRow[relation.remoteKey] === row[relation.localKey]);
      });
      continue;
    }

    const params = {};
    const placeholders = ids.map((id, index) => {
      const key = `rel_${spec.alias}_${index}`;
      params[key] = id;
      return `@${key}`;
    });

    const tenantClause = isTenantScopedTable(relation.table)
      ? ` AND tenant_id = @rel_tenant_id_${spec.alias}`
      : '';
    if (tenantClause) {
      params[`rel_tenant_id_${spec.alias}`] = tenantId;
    }

    const relatedRows = (await runQuery(
      `SELECT ${columnSql} FROM ${ensureIdentifier(relation.table, 'table')} WHERE ${ensureIdentifier(relation.remoteKey, 'column')} IN (${placeholders.join(', ')})${tenantClause}`,
      params
    )).map(mapRow);
    const relatedById = new Map(relatedRows.map((row) => [row[relation.remoteKey], row]));

    augmented.forEach((row) => {
      row[spec.alias] = relatedById.get(row[spec.localKey || relation.localKey]) || null;
    });
  }

  return augmented;
};

const executeSelect = async ({ table, select = '*', filters = [], order = [], limit, range, head, count, tenantId = null }) => {
  const safeTable = ensureIdentifier(table, 'table');
  const { whereClause, params, postFilters } = buildWhereClause(getScopedFilters({ table: safeTable, filters, tenantId }));
  const orderSpecs = Array.isArray(order) ? order : [order].filter(Boolean);
  const orderClause = orderSpecs.length > 0
    ? ' ORDER BY ' + orderSpecs.map((entry) => `${ensureIdentifier(entry.column, 'order column')} ${entry.ascending === false ? 'DESC' : 'ASC'}`).join(', ')
    : '';

  const topClause = limit && !range ? `TOP ${Number(limit)}` : '';
  const offsetClause = range
    ? ` OFFSET ${Math.max(Number(range.from) || 0, 0)} ROWS FETCH NEXT ${Math.max((Number(range.to) || 0) - (Number(range.from) || 0) + 1, 1)} ROWS ONLY`
    : '';

  const queryText = `SELECT ${topClause} * FROM ${safeTable} ${whereClause}${orderClause}${offsetClause}`.replace(/\s+/g, ' ').trim();
  let rows;

  try {
    rows = (await runQuery(queryText, params)).map(mapRow);
  } catch (error) {
    if (!isInvalidUniqueIdentifierError(error)) {
      throw error;
    }

    rows = [];
  }

  rows = applyPostFilters(rows, postFilters);
  rows = await augmentRows(safeTable, select, rows, tenantId);

  return {
    data: head ? null : rows,
    count: count ? rows.length : null,
    error: null
  };
};

const executeInsert = async ({ table, payload, tenantId = null }) => {
  const safeTable = ensureIdentifier(table, 'table');
  const rows = Array.isArray(getScopedPayload({ table: safeTable, payload, tenantId }))
    ? getScopedPayload({ table: safeTable, payload, tenantId })
    : [getScopedPayload({ table: safeTable, payload, tenantId })];
  const inserted = [];

  for (const row of rows) {
    const entries = Object.entries(row || {}).filter(([key, value]) => IDENTIFIER_REGEX.test(key) && value !== undefined);
    if (entries.length === 0) continue;

    const params = {};
    const columns = [];
    const values = [];
    entries.forEach(([key, value], index) => {
      const paramKey = `value${index}`;
      columns.push(key);
      values.push(`@${paramKey}`);
      params[paramKey] = normalizeValue(value);
    });

    const result = await runQuery(
      `INSERT INTO ${safeTable} (${columns.join(', ')}) OUTPUT INSERTED.* VALUES (${values.join(', ')})`,
      params
    );
    inserted.push(...result.map(mapRow));
  }

  return { data: Array.isArray(payload) ? inserted : inserted[0] || null, error: null };
};

const executeUpdate = async ({ table, payload, filters = [], tenantId = null }) => {
  const safeTable = ensureIdentifier(table, 'table');
  const scopedPayload = getScopedPayload({ table: safeTable, payload, tenantId });
  const entries = Object.entries(scopedPayload || {}).filter(([key, value]) => IDENTIFIER_REGEX.test(key) && value !== undefined);
  if (entries.length === 0) {
    return executeSelect({ table, filters, tenantId });
  }

  const { whereClause, params, postFilters } = buildWhereClause(getScopedFilters({ table: safeTable, filters, tenantId }));
  if (postFilters.length > 0) {
    throw new Error('Unsupported update filter.');
  }

  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = normalizeValue(value);
    return `${key} = @${paramKey}`;
  });

  let rows;

  try {
    rows = await runQuery(
      `UPDATE ${safeTable} SET ${assignments.join(', ')} OUTPUT INSERTED.* ${whereClause}`,
      params
    );
  } catch (error) {
    if (!isInvalidUniqueIdentifierError(error)) {
      throw error;
    }

    rows = [];
  }

  const mappedRows = rows.map(mapRow);
  return { data: mappedRows, error: null };
};

const executeDelete = async ({ table, filters = [], tenantId = null }) => {
  const safeTable = ensureIdentifier(table, 'table');
  const { whereClause, params, postFilters } = buildWhereClause(getScopedFilters({ table: safeTable, filters, tenantId }));
  if (postFilters.length > 0) {
    throw new Error('Unsupported delete filter.');
  }

  let rows;

  try {
    rows = await runQuery(
      `DELETE FROM ${safeTable} OUTPUT DELETED.* ${whereClause}`,
      params
    );
  } catch (error) {
    if (!isInvalidUniqueIdentifierError(error)) {
      throw error;
    }

    rows = [];
  }

  return { data: rows.map(mapRow), error: null };
};

const executeUpsert = async ({ table, payload, tenantId = null }) => {
  const safeTable = ensureIdentifier(table, 'table');
  const scopedPayload = getScopedPayload({ table: safeTable, payload, tenantId });
  const rows = Array.isArray(scopedPayload) ? scopedPayload : [scopedPayload];
  const results = [];

  for (const row of rows) {
    if (row?.id) {
      const scopedFilters = getScopedFilters({ table: safeTable, filters: [{ column: 'id', operator: 'eq', value: row.id }], tenantId });
      const { whereClause, params } = buildWhereClause(scopedFilters);
      let existing = null;

      try {
        existing = await runSingleQuery(`SELECT TOP 1 * FROM ${safeTable} ${whereClause}`, params);
      } catch (error) {
        if (!isInvalidUniqueIdentifierError(error)) {
          throw error;
        }
      }

      if (existing) {
        const updated = await executeUpdate({ table: safeTable, payload: row, filters: [{ column: 'id', operator: 'eq', value: row.id }], tenantId });
        results.push(...(updated.data || []));
        continue;
      }
    }

    const inserted = await executeInsert({ table: safeTable, payload: row, tenantId });
    results.push(...(Array.isArray(inserted.data) ? inserted.data : [inserted.data].filter(Boolean)));
  }

  return { data: Array.isArray(payload) ? results : results[0] || null, error: null };
};

const executeRpc = async (name, args = {}, tenantContext = null) => {
  if (!ALLOWED_RPCS.has(name)) {
    throw new Error(`Unsupported RPC: ${name}`);
  }

  switch (name) {
    case 'exec_sql': {
      if (tenantContext?.user) {
        const error = new Error('Raw SQL execution is blocked for authenticated runtime requests.');
        error.status = 403;
        error.code = 'RPC_BLOCKED';
        throw error;
      }

      const sqlText = args.sql || args.sql_query;
      if (!sqlText) {
        throw new Error('sql is required');
      }
      return { data: await runQuery(sqlText), error: null };
    }
    case 'get_table_columns': {
      const tableName = ensureIdentifier(args.table_name || args.tableName, 'table');
      const rows = await runQuery(
        `SELECT COLUMN_NAME AS column_name FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = @tableName ORDER BY ORDINAL_POSITION`,
        { tableName }
      );
      return { data: rows.map((row) => row.column_name), error: null };
    }
    case 'reject_utility_reading': {
      requireTenantForTable('utility_readings', tenantContext?.tenantId);
      const readingId = args.reading_id || args.readingId;
      if (!readingId) throw new Error('reading_id is required');
      const rows = await runQuery(
        `UPDATE utility_readings SET status = 'rejected', updatedat = @updatedat OUTPUT INSERTED.* WHERE id = @readingId AND tenant_id = @tenantId`,
        { readingId, tenantId: tenantContext.tenantId, updatedat: new Date().toISOString() }
      );
      return { data: rows.map(mapRow)[0] || null, error: null };
    }
    case 'update_agreement_status': {
      requireTenantForTable('agreements', tenantContext?.tenantId);
      const agreementId = args.agreement_id || args.agreementId;
      const status = args.new_status || args.status;
      if (!agreementId || !status) throw new Error('agreement_id and status are required');
      const rows = await runQuery(
        `UPDATE agreements SET status = @status, updatedat = @updatedat OUTPUT INSERTED.* WHERE id = @agreementId AND tenant_id = @tenantId`,
        { agreementId, tenantId: tenantContext.tenantId, status, updatedat: new Date().toISOString() }
      );
      return { data: rows.map(mapRow)[0] || null, error: null };
    }
    case 'get_rentees_by_property': {
      requireTenantForTable('app_users', tenantContext?.tenantId);
      const propertyId = args.property_id || args.propertyId;
      const rows = await runQuery(
        `SELECT DISTINCT u.*
         FROM app_users u
         LEFT JOIN agreements a ON a.renteeid = u.id
         WHERE u.tenant_id = @tenantId
           AND (a.propertyid = @propertyId OR u.associated_property_ids LIKE '%' + @propertyId + '%')
           AND u.user_type = 'rentee'`,
        { propertyId, tenantId: tenantContext.tenantId }
      );
      return { data: rows.map(mapRow), error: null };
    }
    case 'get_rentees_by_unit': {
      requireTenantForTable('app_users', tenantContext?.tenantId);
      const unitId = args.unit_id || args.unitId;
      const rows = await runQuery(
        `SELECT DISTINCT u.*
         FROM app_users u
         INNER JOIN agreements a ON a.renteeid = u.id
         WHERE u.tenant_id = @tenantId
           AND a.tenant_id = @tenantId
           AND a.unitid = @unitId
           AND u.user_type = 'rentee'`,
        { unitId, tenantId: tenantContext.tenantId }
      );
      return { data: rows.map(mapRow), error: null };
    }
    case 'test_status_value':
    case 'create_policy':
    case 'enable_rls':
    case 'create_app_users_table':
    case 'create_create_app_users_table_procedure':
      return { data: true, error: null };
  }
};

const STORAGE_TENANT_ROOT = 'tenants';

const getTenantStoragePrefix = (tenantId) => {
  const normalizedTenantId = normalizeStoragePath(tenantId);
  return normalizedTenantId ? `${STORAGE_TENANT_ROOT}/${normalizedTenantId}` : '';
};

const resolveTenantStoragePath = (relativePath, tenantId, { requireTenant = false } = {}) => {
  const normalizedPath = normalizeStoragePath(relativePath);
  const tenantPrefix = getTenantStoragePrefix(tenantId);

  if (!tenantPrefix) {
    if (requireTenant) {
      const error = new Error('A tenant context is required for this storage operation.');
      error.status = 403;
      error.code = 'TENANT_REQUIRED';
      throw error;
    }
    return normalizedPath;
  }

  if (!normalizedPath) return tenantPrefix;
  if (normalizedPath === tenantPrefix || normalizedPath.startsWith(`${tenantPrefix}/`)) return normalizedPath;

  if (normalizedPath.startsWith(`${STORAGE_TENANT_ROOT}/`)) {
    const error = new Error('Cross-tenant storage paths are not allowed.');
    error.status = 403;
    error.code = 'TENANT_STORAGE_OVERRIDE_BLOCKED';
    throw error;
  }

  return `${tenantPrefix}/${normalizedPath}`;
};

export const createPlatformRouter = () => {
  const router = express.Router();
  const requireAuthenticated = createTenantContextMiddleware({ requireUser: true });
  const requireAdmin = (req, res, next) => {
    if (String(req.user?.role || '').trim().toLowerCase() !== 'admin') {
      res.status(403).json({ error: 'Administrator access is required.', code: 'ADMIN_ACCESS_REQUIRED' });
      return;
    }
    next();
  };

  router.use(createTenantContextMiddleware());

  router.get('/auth/context', createTenantContextMiddleware({ requireUser: true }), async (req, res) => {
    res.json({
      data: {
        user: req.user,
        ...serializeTenantContext(req.tenantContext)
      }
    });
  });

  router.post('/query', requireAuthenticated, async (req, res, next) => {
    const { action = 'select', table, select, filters, order, limit, range, payload, head, count } = req.body || {};

    try {
      if (!table) {
        res.status(400).json({ error: 'table is required' });
        return;
      }

      let result;
      switch (action) {
        case 'select':
          if (!isMssqlConfigured()) {
            result = {
              data: head ? null : [],
              count: count ? 0 : null,
              error: null,
              meta: { databaseConfigured: false }
            };
            break;
          }

          result = await executeSelect({ table, select, filters, order, limit, range, head, count, tenantId: req.tenantId });
          break;
        case 'insert':
          result = await executeInsert({ table, payload, tenantId: req.tenantId });
          break;
        case 'update':
          result = await executeUpdate({ table, payload, filters, tenantId: req.tenantId });
          break;
        case 'delete':
          result = await executeDelete({ table, filters, tenantId: req.tenantId });
          break;
        case 'upsert':
          result = await executeUpsert({ table, payload, tenantId: req.tenantId });
          break;
        default:
          throw new Error(`Unsupported action: ${action}`);
      }

      res.json({
        ...result,
        meta: {
          ...(result?.meta || {}),
          tenantContext: serializeTenantContext(req.tenantContext)
        }
      });
    } catch (error) {
      if (error?.status === 403 || error?.code === 'TENANT_OVERRIDE_BLOCKED') {
        auditPlatformRejection(req, error.code || 'PLATFORM_QUERY_REJECTED', { table, action, message: error.message });
      }

      if (action === 'select' && (isMssqlUnavailableError(error) || isMissingTableError(error))) {
        res.json({
          data: head ? null : [],
          count: count ? 0 : null,
          error: null,
          meta: {
            databaseConfigured: !isMissingTableError(error),
            missingTable: isMissingTableError(error),
            tenantContext: serializeTenantContext(req.tenantContext)
          }
        });
        return;
      }

      next(error);
    }
  });

  router.post('/rpc/:name', requireAuthenticated, async (req, res, next) => {
    try {
      if (!isMssqlConfigured()) {
        if (req.params.name === 'get_table_columns') {
          res.json({ data: [], error: null, meta: { databaseConfigured: false } });
          return;
        }

        if (['create_policy', 'enable_rls', 'create_app_users_table', 'create_create_app_users_table_procedure', 'test_status_value'].includes(req.params.name)) {
          res.json({ data: true, error: null, meta: { databaseConfigured: false } });
          return;
        }
      }

      const result = await executeRpc(req.params.name, req.body || {}, req.tenantContext);
      res.json({
        ...result,
        meta: {
          ...(result?.meta || {}),
          tenantContext: serializeTenantContext(req.tenantContext)
        }
      });
    } catch (error) {
      if (error?.status === 403 || error?.code === 'RPC_BLOCKED') {
        auditPlatformRejection(req, error.code || 'PLATFORM_RPC_REJECTED', { rpc: req.params.name, message: error.message });
      }

      if (req.params.name === 'get_table_columns' && isMssqlUnavailableError(error)) {
        res.json({ data: [], error: null, meta: { databaseConfigured: false } });
        return;
      }

      next(error);
    }
  });

  router.post('/auth/sign-up', async (req, res, next) => {
    try {
      const { email, password, metadata = {} } = req.body || {};
      const safeMetadata = {
        name: metadata.name,
        user_type: 'rentee',
        status: 'active',
        invited: false
      };
      const { record, created } = await ensureAuthRecord({ email, password, role: 'rentee', metadata: safeMetadata });
      if (!created) {
        res.status(409).json({ error: 'User already exists.' });
        return;
      }
      const session = await buildSession(record);
      setStorageSessionCookie(res, session);
      res.status(201).json({ data: { user: buildAuthUser(record), session } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/sign-in', async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      let record = await findAuthRecordByEmail(email);
      if (!record || !(await verifyPasswordCredential(record, password))) {
        res.status(401).json({ error: 'Invalid login credentials' });
        return;
      }
      if (record.passwordAlgorithm === 'legacy-sha256') {
        record = await updateAuthRecord(record, { password });
      }
      await markSuccessfulLogin(record);
      const session = await buildSession(record);
      setStorageSessionCookie(res, session);
      res.json({ data: { user: buildAuthUser(record), session } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/update-user', requireAuthenticated, async (req, res, next) => {
    try {
      const { password, metadata } = req.body || {};
      const currentRecord = req.authSession?.record;
      const record = currentRecord ? await updateAuthRecord(currentRecord, { password, metadata }) : null;
      if (!record) {
        res.status(401).json({ error: 'Authenticated session required.' });
        return;
      }
      await revokeAccessToken(req.authSession.accessToken);
      const session = await buildSession(record);
      setStorageSessionCookie(res, session);
      res.json({ data: { user: buildAuthUser(record), session } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/sign-out', async (req, res, next) => {
    try {
      await revokeAccessToken(req.authSession?.accessToken);
      clearStorageSessionCookie(res);
      res.json({ data: { signedOut: true } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/reset-password', async (req, res) => {
    res.json({ data: { sent: true, email: req.body?.email || null } });
  });

  router.post('/auth/otp', (_req, res) => {
    res.status(501).json({
      error: 'OTP sign-in is unavailable until a verified one-time-code provider is configured.',
      code: 'OTP_NOT_CONFIGURED'
    });
  });

  router.post('/auth/invite', requireAuthenticated, requireAdmin, async (req, res, next) => {
    try {
      const { email, options = {} } = req.body || {};
      const requestedRole = String(options?.data?.role || 'rentee').trim().toLowerCase();
      const role = requestedRole === 'staff' ? 'staff' : 'rentee';
      const metadata = { ...(options?.data || {}), role, user_type: role, invited: true };
      const { record } = await ensureAuthRecord({ email, password: crypto.randomUUID(), role, metadata: { ...metadata, invited: true } });
      res.json({ data: { user: buildAuthUser(record) } });
    } catch (error) {
      next(error);
    }
  });

  router.get('/storage/buckets', requireAuthenticated, async (_req, res, next) => {
    try {
      res.json({ data: await getStorageDriver().listBuckets() });
    } catch (error) {
      next(error);
    }
  });

  router.post('/storage/buckets', requireAuthenticated, async (req, res, next) => {
    try {
      const bucketName = req.body?.bucketName || req.body?.name;
      res.status(201).json({ data: await getStorageDriver().createBucket(bucketName) });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/storage/buckets/:bucket', requireAuthenticated, async (req, res, next) => {
    try {
      await getStorageDriver().deleteBucket(req.params.bucket);
      res.json({ data: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/storage/list', requireAuthenticated, async (req, res, next) => {
    try {
      const relativePath = resolveTenantStoragePath(req.query.path, req.tenantId, { requireTenant: true });
      const items = await getStorageDriver().list(req.query.bucket, relativePath);
      res.json({ data: items, meta: { path: relativePath, tenantContext: serializeTenantContext(req.tenantContext) } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/storage/upload', requireAuthenticated, express.raw({ type: '*/*', limit: '25mb' }), async (req, res, next) => {
    try {
      const relativePath = resolveTenantStoragePath(req.query.path, req.tenantId, { requireTenant: true });
      const data = await getStorageDriver().upload(
        req.query.bucket,
        relativePath,
        req.body,
        req.headers['content-type'] || 'application/octet-stream'
      );
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/storage/objects', requireAuthenticated, async (req, res, next) => {
    try {
      const pathsToDelete = Array.isArray(req.body?.paths) ? req.body.paths : [];
      const scopedPaths = pathsToDelete.map((item) => resolveTenantStoragePath(item, req.tenantId, { requireTenant: true }));
      res.json({ data: await getStorageDriver().deleteObjects(req.body?.bucket || req.query.bucket, scopedPaths) });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
