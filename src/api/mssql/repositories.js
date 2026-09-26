import crypto from 'node:crypto';
import { paginateQuery, runQuery, runSingleQuery } from './query.js';
import { getMssqlPool, sql } from './pool.js';

const DEFAULT_PAGE_SIZE = 50;
const TABLE_COLUMN_CACHE = new Map();
const APP_USER_MUTABLE_FIELDS = [
  'tenant_id',
  'auth_id',
  'email',
  'name',
  'role',
  'user_type',
  'contact_details',
  'skills',
  'availability',
  'notes',
  'status',
  'active',
  'invited',
  'id_copy_url',
  'associated_property_ids',
  'associated_properties',
  'national_id',
  'permanent_address',
  'profile_image_url'
];
const APP_USER_CREATABLE_FIELDS = new Set([
  'id',
  ...APP_USER_MUTABLE_FIELDS,
  'createdat',
  'updatedat'
]);
const APP_USER_JSON_FIELDS = new Set([
  'contact_details',
  'skills',
  'availability',
  'associated_property_ids',
  'associated_properties'
]);
const AGREEMENT_JSON_FIELDS = new Set([
  'terms',
  'signatories_status'
]);
const AGREEMENT_UPDATABLE_FIELDS = [
  'templateid',
  'renteeid',
  'propertyid',
  'unitid',
  'status',
  'startdate',
  'enddate',
  'rentamount',
  'depositamount',
  'documenturl',
  'signeddocumenturl',
  'evia_document_id',
  'title',
  'content',
  'processedcontent',
  'terms',
  'notes',
  'needs_document_generation',
  'eviasignreference',
  'signature_status',
  'signature_sent_at',
  'signature_completed_at',
  'signatories_status',
  'signed_document_url',
  'pdfurl',
  'signatureurl',
  'signature_pdf_url',
  'signeddate',
  'cancellation_reason'
];
const AGREEMENT_TEMPLATE_UPDATABLE_FIELDS = [
  'name',
  'language',
  'content',
  'version',
  'updatedat'
];
const INVOICE_UPDATABLE_FIELDS = [
  'renteeid',
  'propertyid',
  'billingperiod',
  'components',
  'totalamount',
  'status',
  'paymentproofurl',
  'paymentdate',
  'duedate',
  'notes',
  'updatedat'
];
const INVOICE_JSON_FIELDS = new Set(['components']);
const TENANT_MUTABLE_FIELDS = [
  'name',
  'slug',
  'status',
  'plan'
];
const TENANT_SETTINGS_MUTABLE_FIELDS = [
  'branding_json',
  'email_json',
  'signature_json',
  'storage_json',
  'feature_flags_json'
];
const TENANT_SETTINGS_JSON_FIELDS = new Set(TENANT_SETTINGS_MUTABLE_FIELDS);
const TENANT_MEMBERSHIP_MUTABLE_FIELDS = [
  'role',
  'status',
  'is_default'
];

const parseJsonValue = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
};

const serializeDbValue = (key, value) => {
  if (value === undefined) {
    return value;
  }

  if (APP_USER_JSON_FIELDS.has(key) && value !== null && typeof value !== 'string') {
    return JSON.stringify(value);
  }

  return value;
};

const serializeAgreementValue = (key, value) => {
  if (value === undefined) {
    return value;
  }

  if (AGREEMENT_JSON_FIELDS.has(key) && value !== null && typeof value !== 'string') {
    return JSON.stringify(value);
  }

  return value;
};

const serializeTenantSettingsValue = (key, value) => {
  if (value === undefined) {
    return value;
  }

  if (TENANT_SETTINGS_JSON_FIELDS.has(key) && value !== null && typeof value !== 'string') {
    return JSON.stringify(value);
  }

  return value;
};

const isMissingColumnError = (error, columnName = '') => {
  const message = String(error?.message || error || '').toLowerCase();
  const normalizedColumnName = String(columnName || '').toLowerCase();
  return message.includes('invalid column name')
    && (!normalizedColumnName || message.includes(`'${normalizedColumnName}'`));
};

const createRepositoryError = (status, message, code, details = undefined) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
};

const UNIQUE_IDENTIFIER_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUniqueIdentifier = (value) => UNIQUE_IDENTIFIER_REGEX.test(String(value || '').trim());

const getTableColumns = async (tableName) => {
  const normalizedTableName = String(tableName || '').trim().toLowerCase();
  if (!normalizedTableName) {
    return new Set();
  }

  if (TABLE_COLUMN_CACHE.has(normalizedTableName)) {
    return TABLE_COLUMN_CACHE.get(normalizedTableName);
  }

  const pool = await getMssqlPool();
  const request = new sql.Request(pool);
  request.input('tableName', sql.NVarChar, normalizedTableName);

  const result = await request.query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = 'dbo'
      AND TABLE_NAME = @tableName
  `);

  const columns = new Set(
    (result.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim().toLowerCase()).filter(Boolean)
  );

  TABLE_COLUMN_CACHE.set(normalizedTableName, columns);
  return columns;
};

const filterEntriesByTableColumns = async (tableName, entries) => {
  const supportedColumns = await getTableColumns(tableName);
  return entries.filter(([key]) => supportedColumns.has(String(key || '').trim().toLowerCase()));
};

const mapAppUserRow = (row) => {
  if (!row) {
    return null;
  }

  const appUser = {};

  Object.entries(row).forEach(([key, value]) => {
    appUser[key] = APP_USER_JSON_FIELDS.has(key)
      ? parseJsonValue(value)
      : value;
  });

  if (appUser.contact_details === undefined) {
    appUser.contact_details = null;
  }

  if (appUser.skills === undefined) {
    appUser.skills = [];
  }

  if (appUser.availability === undefined) {
    appUser.availability = null;
  }

  if (appUser.associated_property_ids === undefined) {
    appUser.associated_property_ids = [];
  }

  if (appUser.invited === undefined) {
    appUser.invited = false;
  }

  if (appUser.status === undefined) {
    appUser.status = 'active';
  }

  if (appUser.active === undefined) {
    appUser.active = appUser.status === 'active';
  }

  return appUser;
};

const createNestedEntity = (row, prefix) => {
  const nested = {};

  Object.entries(row).forEach(([key, value]) => {
    if (!key.startsWith(`${prefix}__`)) {
      return;
    }

    const nestedKey = key.slice(prefix.length + 2);
    nested[nestedKey] = parseJsonValue(value);
  });

  return Object.values(nested).some((value) => value !== null && value !== undefined)
    ? nested
    : null;
};

const mapAgreementRow = (row) => {
  const agreement = {};

  Object.entries(row).forEach(([key, value]) => {
    if (key.includes('__')) {
      return;
    }

    agreement[key] = parseJsonValue(value);
  });

  agreement.properties = createNestedEntity(row, 'property');
  agreement.property = agreement.properties;
  agreement.property_units = createNestedEntity(row, 'unit');
  agreement.unit = agreement.property_units;
  agreement.rentee = createNestedEntity(row, 'rentee');
  agreement.template = createNestedEntity(row, 'template');

  return agreement;
};

const mapInvoiceRow = (row) => {
  if (!row) {
    return null;
  }

  const invoice = {};

  Object.entries(row).forEach(([key, value]) => {
    invoice[key] = INVOICE_JSON_FIELDS.has(key)
      ? parseJsonValue(value)
      : value;
  });

  return invoice;
};

const mapTenantRow = (row) => {
  if (!row) {
    return null;
  }

  const tenant = {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status,
    plan: row.plan,
    createdat: row.createdat,
    updatedat: row.updatedat,
    membership_count: Number(row.membership_count || 0)
  };

  const settings = {};
  TENANT_SETTINGS_MUTABLE_FIELDS.forEach((key) => {
    const parsedValue = parseJsonValue(row[key]);
    tenant[key] = parsedValue;
    settings[key] = parsedValue;
  });

  tenant.settings = settings;
  return tenant;
};

const mapTenantMembershipRow = (row) => {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    app_user_id: row.app_user_id,
    role: row.role,
    status: row.status,
    is_default: Boolean(row.is_default),
    createdat: row.createdat,
    updatedat: row.updatedat,
    tenant: {
      id: row.tenant_id,
      name: row.tenant_name,
      slug: row.tenant_slug,
      status: row.tenant_status,
      plan: row.tenant_plan
    },
    app_user: {
      id: row.app_user_id,
      email: row.app_user_email,
      name: row.app_user_name,
      role: row.app_user_role,
      user_type: row.app_user_user_type,
      tenant_id: row.app_user_tenant_id,
      contact_details: parseJsonValue(row.app_user_contact_details)
    }
  };
};

const AGREEMENT_SELECT = `
  SELECT
    a.*,
    p.id AS property__id,
    p.name AS property__name,
    p.address AS property__address,
    p.images AS property__images,
    p.propertytype AS property__propertytype,
    p.status AS property__status,
    u.id AS unit__id,
    u.unitnumber AS unit__unitnumber,
    u.floor AS unit__floor,
    u.status AS unit__status,
    r.id AS rentee__id,
    r.name AS rentee__name,
    r.email AS rentee__email,
    r.contact_details AS rentee__contact_details,
    t.id AS template__id,
    t.name AS template__name
  FROM agreements a
  LEFT JOIN properties p ON p.id = a.propertyid
  LEFT JOIN property_units u ON u.id = a.unitid
  LEFT JOIN app_users r ON r.id = a.renteeid
  LEFT JOIN agreement_templates t ON t.id = a.templateid
`;

const assertTenantId = (tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }

  return tenantId;
};

const hasTenantScope = (tenantId) => tenantId !== undefined && tenantId !== null && tenantId !== '';

const normalizeTenantSlug = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9-]+/g, '-')
  .replace(/-{2,}/g, '-')
  .replace(/^-+|-+$/g, '');

const normalizeTenantPayload = (payload = {}) => ({
  id: payload.id,
  name: String(payload.name || '').trim(),
  slug: normalizeTenantSlug(payload.slug || payload.name),
  status: String(payload.status || 'active').trim() || 'active',
  plan: payload.plan == null ? 'legacy' : String(payload.plan).trim() || null
});

const extractTenantSettingsPayload = (payload = {}, tenantName = '') => {
  const source = payload?.settings && typeof payload.settings === 'object'
    ? payload.settings
    : payload;

  const settings = Object.entries(source)
    .filter(([key, value]) => TENANT_SETTINGS_MUTABLE_FIELDS.includes(key) && value !== undefined)
    .reduce((accumulator, [key, value]) => {
      accumulator[key] = serializeTenantSettingsValue(key, value);
      return accumulator;
    }, {});

  if (settings.branding_json === undefined && tenantName) {
    settings.branding_json = serializeTenantSettingsValue('branding_json', { name: tenantName });
  }

  return settings;
};

const ensureTenantSlugAvailable = async (slug, excludeTenantId = null) => {
  if (!slug) {
    throw createRepositoryError(400, 'Tenant slug is required.', 'TENANT_SLUG_REQUIRED');
  }

  const existing = await runSingleQuery(
    `SELECT TOP 1 id
     FROM tenants
     WHERE slug = @slug${excludeTenantId ? '\n       AND id <> @excludeTenantId' : ''}`,
    excludeTenantId ? { slug, excludeTenantId } : { slug }
  );

  if (existing) {
    throw createRepositoryError(409, 'A tenant with this slug already exists.', 'TENANT_SLUG_CONFLICT', { slug });
  }
};

const upsertTenantSettingsByTenantId = async (tenantId, payload = {}, tenantName = '') => {
  const settingsPayload = extractTenantSettingsPayload(payload, tenantName);

  if (Object.keys(settingsPayload).length === 0) {
    return;
  }

  const existing = await runSingleQuery(
    `SELECT TOP 1 tenant_id
     FROM tenant_settings
     WHERE tenant_id = @tenantId`,
    { tenantId }
  );

  if (!existing) {
    await runQuery(
      `INSERT INTO tenant_settings (
        tenant_id,
        branding_json,
        email_json,
        signature_json,
        storage_json,
        feature_flags_json,
        createdat,
        updatedat
      )
      VALUES (
        @tenantId,
        @branding_json,
        @email_json,
        @signature_json,
        @storage_json,
        @feature_flags_json,
        @createdat,
        @updatedat
      )`,
      {
        tenantId,
        branding_json: settingsPayload.branding_json ?? null,
        email_json: settingsPayload.email_json ?? null,
        signature_json: settingsPayload.signature_json ?? null,
        storage_json: settingsPayload.storage_json ?? null,
        feature_flags_json: settingsPayload.feature_flags_json ?? null,
        createdat: new Date().toISOString(),
        updatedat: new Date().toISOString()
      }
    );
    return;
  }

  const params = {
    tenantId,
    updatedat: new Date().toISOString()
  };
  const assignments = Object.entries(settingsPayload).map(([key, value], index) => {
    const paramKey = `setting${index}`;
    params[paramKey] = value;
    return `${key} = @${paramKey}`;
  });

  assignments.push('updatedat = @updatedat');

  await runQuery(
    `UPDATE tenant_settings
     SET ${assignments.join(', ')}
     WHERE tenant_id = @tenantId`,
    params
  );
};

const getPreferredActiveMembershipsForUser = async (appUserId) => runQuery(
  `SELECT
     tm.id,
     tm.tenant_id,
     tm.is_default,
     tm.createdat
   FROM tenant_memberships tm
   INNER JOIN tenants t ON t.id = tm.tenant_id
   WHERE tm.app_user_id = @appUserId
     AND tm.status = 'active'
     AND (t.status IS NULL OR t.status = 'active')
   ORDER BY CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC`,
  { appUserId }
);

const clearDefaultMembershipsForUser = async (appUserId) => {
  await runQuery(
    `UPDATE tenant_memberships
     SET is_default = 0,
         updatedat = @updatedat
     WHERE app_user_id = @appUserId`,
    {
      appUserId,
      updatedat: new Date().toISOString()
    }
  );
};

const syncAppUserDefaultTenant = async (appUserId, preferredMembershipId = null) => {
  if (!isUniqueIdentifier(appUserId)) {
    return;
  }

  const memberships = await getPreferredActiveMembershipsForUser(appUserId);

  if (memberships.length === 0) {
    await runQuery(
      `UPDATE app_users
       SET tenant_id = NULL,
           updatedat = @updatedat
       WHERE id = @appUserId`,
      { appUserId, updatedat: new Date().toISOString() }
    );
    return;
  }

  let defaultMembership = preferredMembershipId
    ? memberships.find((membership) => membership.id === preferredMembershipId)
    : memberships.find((membership) => Boolean(membership.is_default));

  if (!defaultMembership) {
    defaultMembership = memberships[0];
    await clearDefaultMembershipsForUser(appUserId);
    await runQuery(
      `UPDATE tenant_memberships
       SET is_default = 1,
           updatedat = @updatedat
       WHERE id = @membershipId`,
      {
        membershipId: defaultMembership.id,
        updatedat: new Date().toISOString()
      }
    );
  }

  await runQuery(
    `UPDATE app_users
     SET tenant_id = @tenantId,
         updatedat = @updatedat
     WHERE id = @appUserId`,
    {
      appUserId,
      tenantId: defaultMembership.tenant_id,
      updatedat: new Date().toISOString()
    }
  );
};

const getTenantMembershipByTenantAndId = async (tenantId, membershipId) => {
  if (!isUniqueIdentifier(tenantId) || !isUniqueIdentifier(membershipId)) {
    return null;
  }

  const row = await runSingleQuery(
    `SELECT TOP 1
       tm.id,
       tm.tenant_id,
       tm.app_user_id,
       tm.role,
       tm.status,
       tm.is_default,
       tm.createdat,
       tm.updatedat,
       t.name AS tenant_name,
       t.slug AS tenant_slug,
       t.status AS tenant_status,
       t.[plan] AS tenant_plan,
       au.email AS app_user_email,
       au.name AS app_user_name,
       au.role AS app_user_role,
       au.user_type AS app_user_user_type,
       au.tenant_id AS app_user_tenant_id,
       au.contact_details AS app_user_contact_details
     FROM tenant_memberships tm
     INNER JOIN tenants t ON t.id = tm.tenant_id
     INNER JOIN app_users au ON au.id = tm.app_user_id
     WHERE tm.tenant_id = @tenantId
       AND tm.id = @membershipId`,
    { tenantId, membershipId }
  );

  return mapTenantMembershipRow(row);
};

const applyTenantFilter = ({ filters, params, tenantId, column = 'tenant_id' }) => {
  if (!hasTenantScope(tenantId)) {
    return;
  }

  filters.push(`${column} = @tenantId`);
  params.tenantId = assertTenantId(tenantId);
};

const mergeTenantPayload = (payload = {}, tenantId) => {
  const scopedTenantId = assertTenantId(tenantId);

  if (payload.tenant_id && payload.tenant_id !== scopedTenantId) {
    throw new Error('Cross-tenant payload override is not allowed');
  }

  return {
    ...payload,
    tenant_id: scopedTenantId
  };
};

const ensureTenantScopedEntity = async ({ table, id, tenantId, label = table }) => {
  if (!id) {
    return null;
  }

  const row = await runSingleQuery(
    `SELECT TOP 1 id
     FROM ${table}
     WHERE id = @id
       AND tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  if (!row) {
    throw new Error(`${label} does not belong to the active tenant`);
  }

  return row;
};

const ensureAgreementRelationships = async ({ tenantId, payload = {} }) => {
  await ensureTenantScopedEntity({ table: 'properties', id: payload.propertyid, tenantId, label: 'Property' });
  await ensureTenantScopedEntity({ table: 'property_units', id: payload.unitid, tenantId, label: 'Property unit' });
  await ensureTenantScopedEntity({ table: 'app_users', id: payload.renteeid, tenantId, label: 'App user' });
  await ensureTenantScopedEntity({ table: 'agreement_templates', id: payload.templateid, tenantId, label: 'Agreement template' });
};

const ensureInvoiceRelationships = async ({ tenantId, payload = {} }) => {
  await ensureTenantScopedEntity({ table: 'properties', id: payload.propertyid, tenantId, label: 'Property' });
  await ensureTenantScopedEntity({ table: 'app_users', id: payload.renteeid, tenantId, label: 'App user' });
};

export const getCurrentUserProfile = async ({ authId, userId, email }) => {
  if (authId) {
    const authUser = await runSingleQuery(
      `SELECT TOP 1 *
       FROM app_users
       WHERE auth_id = @authId`,
      { authId }
    );

    if (authUser) {
      return mapAppUserRow(authUser);
    }
  }

  if (userId) {
    const user = await runSingleQuery(
      `SELECT TOP 1 *
       FROM app_users
       WHERE id = @userId`,
      { userId }
    );

    return mapAppUserRow(user);
  }

  if (email) {
    const user = await runSingleQuery(
      `SELECT TOP 1 *
       FROM app_users
       WHERE email = @email`,
      { email }
    );

    return mapAppUserRow(user);
  }

  return null;
};

export const listTenants = async ({ status, search, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const filters = [];
  const params = {};

  if (status) {
    filters.push('t.status = @status');
    params.status = status;
  }

  if (search) {
    filters.push('(t.name LIKE @search OR t.slug LIKE @search)');
    params.search = `%${String(search).trim()}%`;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await paginateQuery({
    baseQuery: `SELECT
        t.*,
        ts.branding_json,
        ts.email_json,
        ts.signature_json,
        ts.storage_json,
        ts.feature_flags_json,
        (
          SELECT COUNT(*)
          FROM tenant_memberships tm
          WHERE tm.tenant_id = t.id
            AND tm.status = 'active'
        ) AS membership_count
      FROM tenants t
      LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
      ${whereClause}`,
    orderBy: 't.createdat DESC',
    page,
    pageSize,
    params
  });

  return rows.map(mapTenantRow);
};

export const getTenantById = async (id) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const tenant = await runSingleQuery(
    `SELECT TOP 1
       t.*,
       ts.branding_json,
       ts.email_json,
       ts.signature_json,
       ts.storage_json,
       ts.feature_flags_json,
       (
         SELECT COUNT(*)
         FROM tenant_memberships tm
         WHERE tm.tenant_id = t.id
           AND tm.status = 'active'
       ) AS membership_count
     FROM tenants t
     LEFT JOIN tenant_settings ts ON ts.tenant_id = t.id
     WHERE t.id = @id`,
    { id }
  );

  return mapTenantRow(tenant);
};

export const createTenant = async (payload = {}) => {
  const normalizedPayload = normalizeTenantPayload(payload);

  if (!normalizedPayload.name) {
    throw createRepositoryError(400, 'Tenant name is required.', 'TENANT_NAME_REQUIRED');
  }

  if (!normalizedPayload.slug) {
    throw createRepositoryError(400, 'Tenant slug is required.', 'TENANT_SLUG_REQUIRED');
  }

  await ensureTenantSlugAvailable(normalizedPayload.slug);

  const now = new Date().toISOString();
  const rows = await runQuery(
    `INSERT INTO tenants (
      id,
      name,
      slug,
      status,
      [plan],
      createdat,
      updatedat
    )
    OUTPUT INSERTED.*
    VALUES (
      COALESCE(@id, NEWID()),
      @name,
      @slug,
      @status,
      @plan,
      @createdat,
      @updatedat
    )`,
    {
      id: normalizedPayload.id || null,
      name: normalizedPayload.name,
      slug: normalizedPayload.slug,
      status: normalizedPayload.status,
      plan: normalizedPayload.plan,
      createdat: now,
      updatedat: now
    }
  );

  const tenant = rows[0] || null;
  if (!tenant) {
    return null;
  }

  await upsertTenantSettingsByTenantId(tenant.id, payload, normalizedPayload.name);
  return getTenantById(tenant.id);
};

export const updateTenantById = async (id, payload = {}) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const currentTenant = await getTenantById(id);
  if (!currentTenant) {
    return null;
  }

  const normalizedPayload = normalizeTenantPayload({
    ...currentTenant,
    ...payload,
    name: payload.name !== undefined ? payload.name : currentTenant.name,
    slug: payload.slug !== undefined ? payload.slug : currentTenant.slug,
    status: payload.status !== undefined ? payload.status : currentTenant.status,
    plan: payload.plan !== undefined ? payload.plan : currentTenant.plan
  });

  if (!normalizedPayload.name) {
    throw createRepositoryError(400, 'Tenant name is required.', 'TENANT_NAME_REQUIRED');
  }

  if (!normalizedPayload.slug) {
    throw createRepositoryError(400, 'Tenant slug is required.', 'TENANT_SLUG_REQUIRED');
  }

  if (normalizedPayload.slug !== currentTenant.slug) {
    await ensureTenantSlugAvailable(normalizedPayload.slug, id);
  }

  const params = {
    id,
    updatedat: new Date().toISOString(),
    name: normalizedPayload.name,
    slug: normalizedPayload.slug,
    status: normalizedPayload.status,
    plan: normalizedPayload.plan
  };

  await runQuery(
    `UPDATE tenants
     SET name = @name,
         slug = @slug,
         status = @status,
         [plan] = @plan,
         updatedat = @updatedat
     WHERE id = @id`,
    params
  );

  await upsertTenantSettingsByTenantId(id, payload, normalizedPayload.name);
  return getTenantById(id);
};

export const listTenantMemberships = async (tenantId, { status, search, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  if (!isUniqueIdentifier(tenantId)) {
    return [];
  }

  const filters = ['tm.tenant_id = @tenantId'];
  const params = { tenantId };

  if (status) {
    filters.push('tm.status = @status');
    params.status = status;
  }

  if (search) {
    filters.push('(au.email LIKE @search OR au.name LIKE @search)');
    params.search = `%${String(search).trim()}%`;
  }

  const whereClause = `WHERE ${filters.join(' AND ')}`;
  const rows = await paginateQuery({
    baseQuery: `SELECT
        tm.id,
        tm.tenant_id,
        tm.app_user_id,
        tm.role,
        tm.status,
        tm.is_default,
        tm.createdat,
        tm.updatedat,
        t.name AS tenant_name,
        t.slug AS tenant_slug,
        t.status AS tenant_status,
        t.[plan] AS tenant_plan,
        au.email AS app_user_email,
        au.name AS app_user_name,
        au.role AS app_user_role,
        au.user_type AS app_user_user_type,
        au.tenant_id AS app_user_tenant_id,
        au.contact_details AS app_user_contact_details
      FROM tenant_memberships tm
      INNER JOIN tenants t ON t.id = tm.tenant_id
      INNER JOIN app_users au ON au.id = tm.app_user_id
      ${whereClause}`,
    orderBy: 'CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC',
    page,
    pageSize,
    params
  });

  return rows.map(mapTenantMembershipRow);
};

export const createTenantMembership = async (tenantId, payload = {}) => {
  if (!isUniqueIdentifier(tenantId)) {
    throw createRepositoryError(400, 'Valid tenant id is required.', 'TENANT_ID_REQUIRED');
  }

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    throw createRepositoryError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  }

  const appUserId = payload.app_user_id || payload.appUserId;
  if (!isUniqueIdentifier(appUserId)) {
    throw createRepositoryError(400, 'Valid app_user_id is required.', 'APP_USER_ID_REQUIRED');
  }

  const appUser = await getAppUserById(appUserId);
  if (!appUser) {
    throw createRepositoryError(404, 'App user not found.', 'APP_USER_NOT_FOUND');
  }

  const existingMembership = await runSingleQuery(
    `SELECT TOP 1 id
     FROM tenant_memberships
     WHERE tenant_id = @tenantId
       AND app_user_id = @appUserId`,
    { tenantId, appUserId }
  );

  if (existingMembership) {
    throw createRepositoryError(409, 'The user already belongs to this tenant.', 'TENANT_MEMBERSHIP_CONFLICT');
  }

  const role = String(payload.role || appUser.role || 'staff').trim() || 'staff';
  const membershipStatus = String(payload.status || 'active').trim() || 'active';
  const isDefaultRequested = Boolean(payload.is_default ?? payload.isDefault);

  if (membershipStatus === 'active' && String(tenant.status || '').trim().toLowerCase() !== 'active') {
    throw createRepositoryError(400, 'Active memberships cannot be assigned to inactive tenants.', 'TENANT_MEMBERSHIP_INVALID_STATUS');
  }

  const priorActiveMemberships = await getPreferredActiveMembershipsForUser(appUserId);
  const rows = await runQuery(
    `INSERT INTO tenant_memberships (
      id,
      tenant_id,
      app_user_id,
      role,
      status,
      is_default,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.*
    VALUES (
      COALESCE(@id, NEWID()),
      @tenantId,
      @appUserId,
      @role,
      @status,
      @isDefault,
      @createdat,
      @updatedat
    )`,
    {
      id: payload.id || null,
      tenantId,
      appUserId,
      role,
      status: membershipStatus,
      isDefault: isDefaultRequested && membershipStatus === 'active',
      createdat: new Date().toISOString(),
      updatedat: new Date().toISOString()
    }
  );

  const membershipId = rows[0]?.id || null;
  if (membershipId) {
    await syncAppUserDefaultTenant(
      appUserId,
      membershipStatus === 'active' && (isDefaultRequested || priorActiveMemberships.length === 0)
        ? membershipId
        : null
    );
  }

  return getTenantMembershipByTenantAndId(tenantId, membershipId);
};

export const updateTenantMembershipById = async (tenantId, membershipId, payload = {}) => {
  const currentMembership = await getTenantMembershipByTenantAndId(tenantId, membershipId);
  if (!currentMembership) {
    return null;
  }

  const nextStatus = payload.status !== undefined
    ? String(payload.status || '').trim() || currentMembership.status
    : currentMembership.status;
  const nextRole = payload.role !== undefined
    ? String(payload.role || '').trim() || currentMembership.role
    : currentMembership.role;
  const nextIsDefault = payload.is_default !== undefined || payload.isDefault !== undefined
    ? Boolean(payload.is_default ?? payload.isDefault)
    : currentMembership.is_default;

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    throw createRepositoryError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  }

  if (nextStatus === 'active' && String(tenant.status || '').trim().toLowerCase() !== 'active') {
    throw createRepositoryError(400, 'Active memberships cannot be assigned to inactive tenants.', 'TENANT_MEMBERSHIP_INVALID_STATUS');
  }

  await runQuery(
    `UPDATE tenant_memberships
     SET role = @role,
         status = @status,
         is_default = @isDefault,
         updatedat = @updatedat
     WHERE id = @membershipId
       AND tenant_id = @tenantId`,
    {
      membershipId,
      tenantId,
      role: nextRole,
      status: nextStatus,
      isDefault: nextIsDefault && nextStatus === 'active',
      updatedat: new Date().toISOString()
    }
  );

  await syncAppUserDefaultTenant(
    currentMembership.app_user_id,
    nextStatus === 'active' && nextIsDefault ? membershipId : null
  );

  return getTenantMembershipByTenantAndId(tenantId, membershipId);
};

export const deleteTenantMembershipById = async (tenantId, membershipId) => {
  const currentMembership = await getTenantMembershipByTenantAndId(tenantId, membershipId);
  if (!currentMembership) {
    return null;
  }

  await runQuery(
    `DELETE FROM tenant_memberships
     WHERE id = @membershipId
       AND tenant_id = @tenantId`,
    { membershipId, tenantId }
  );

  await syncAppUserDefaultTenant(currentMembership.app_user_id);
  return currentMembership;
};

export const getAppUserById = async (id, tenantId) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const queryText = hasTenantScope(tenantId)
    ? `SELECT TOP 1 *
       FROM app_users
       WHERE id = @id
         AND tenant_id = @tenantId`
    : `SELECT TOP 1 *
       FROM app_users
       WHERE id = @id`;

  const user = await runSingleQuery(queryText, hasTenantScope(tenantId) ? { id, tenantId: assertTenantId(tenantId) } : { id });

  return mapAppUserRow(user);
};

export const findAppUserByEmail = async (email, tenantId) => {
  const queryText = hasTenantScope(tenantId)
    ? `SELECT TOP 1 *
       FROM app_users
       WHERE email = @email
         AND tenant_id = @tenantId`
    : `SELECT TOP 1 *
       FROM app_users
       WHERE email = @email`;

  const user = await runSingleQuery(queryText, hasTenantScope(tenantId) ? { email, tenantId: assertTenantId(tenantId) } : { email });

  return mapAppUserRow(user);
};

export const findAppUserByAuthId = async (authId, tenantId) => {
  const queryText = hasTenantScope(tenantId)
    ? `SELECT TOP 1 *
       FROM app_users
       WHERE auth_id = @authId
         AND tenant_id = @tenantId`
    : `SELECT TOP 1 *
       FROM app_users
       WHERE auth_id = @authId`;

  const user = await runSingleQuery(queryText, hasTenantScope(tenantId) ? { authId, tenantId: assertTenantId(tenantId) } : { authId });

  return mapAppUserRow(user);
};

export const listAppUsers = async ({ tenantId, userType, email, authId, search, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const filters = [];
  const params = {};

  applyTenantFilter({ filters, params, tenantId });

  if (userType) {
    filters.push('user_type = @userType');
    params.userType = userType;
  }

  if (email) {
    filters.push('email = @email');
    params.email = email;
  }

  if (authId) {
    filters.push('auth_id = @authId');
    params.authId = authId;
  }

  if (search) {
    filters.push('(email LIKE @search OR name LIKE @search)');
    params.search = `%${String(search).trim()}%`;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await paginateQuery({
    baseQuery: `SELECT * FROM app_users ${whereClause}`,
    orderBy: 'createdat DESC',
    page,
    pageSize,
    params
  });

  return rows.map(mapAppUserRow);
};

export const createAppUser = async (payload = {}) => {
  const now = new Date().toISOString();
  const normalizedPayload = {
    ...payload,
    id: payload.id || crypto.randomUUID(),
    email: payload.email || payload.contact_details?.email || payload.contactDetails?.email || null,
    contact_details: payload.contact_details || payload.contactDetails || null,
    profile_image_url: payload.profile_image_url || payload.profileImageUrl || null,
    createdat: payload.createdat || now,
    updatedat: now
  };

  const entries = await filterEntriesByTableColumns(
    'app_users',
    Object.entries(normalizedPayload).filter(([key, value]) => APP_USER_CREATABLE_FIELDS.has(key) && value !== undefined)
  );

  if (entries.length === 0) {
    throw createRepositoryError(409, 'The local app_users table does not expose any writable columns for this request.', 'APP_USER_SCHEMA_NOT_WRITABLE');
  }

  const params = {};
  const columns = [];
  const values = [];

  entries.forEach(([key, value], index) => {
    const paramKey = `value${index}`;
    columns.push(key);
    values.push(`@${paramKey}`);
    params[paramKey] = serializeDbValue(key, value);
  });

  const rows = await runQuery(
    `INSERT INTO app_users (${columns.join(', ')})
     OUTPUT INSERTED.*
     VALUES (${values.join(', ')})`,
    params
  );

  return mapAppUserRow(rows[0] || null);
};

export const updateAppUser = async (id, payload = {}) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const entries = await filterEntriesByTableColumns(
    'app_users',
    Object.entries(payload).filter(([key, value]) => APP_USER_MUTABLE_FIELDS.includes(key) && value !== undefined)
  );
  const tenantId = payload.tenant_id;

  if (entries.length === 0) {
    return getAppUserById(id, tenantId);
  }

  const params = { id, updatedat: new Date().toISOString() };
  if (hasTenantScope(tenantId)) {
    params.tenantId = assertTenantId(tenantId);
  }
  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = serializeDbValue(key, value);
    return `${key} = @${paramKey}`;
  });

  assignments.push('updatedat = @updatedat');

  const rows = await runQuery(
    `UPDATE app_users
     SET ${assignments.join(', ')}
     OUTPUT INSERTED.*
     WHERE id = @id${hasTenantScope(tenantId) ? '\n       AND tenant_id = @tenantId' : ''}`,
    params
  );

  return mapAppUserRow(rows[0] || null);
};

export const linkAuthUserToAppUser = async (id, authId, tenantId) => updateAppUser(id, {
  ...(tenantId ? { tenant_id: tenantId } : {}),
  auth_id: authId,
  invited: true
});

export const deleteAppUserById = async (id, tenantId) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const rows = await runQuery(
    `DELETE FROM app_users
     OUTPUT DELETED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  return mapAppUserRow(rows[0] || null);
};

export const getAppUserInvitationStatus = async (id, tenantId) => {
  if (!isUniqueIdentifier(id)) {
    return null;
  }

  const scopedParams = hasTenantScope(tenantId) ? { id, tenantId: assertTenantId(tenantId) } : { id };
  const invitationQuery = hasTenantScope(tenantId)
    ? `SELECT TOP 1 id, email, invited, auth_id
       FROM app_users
       WHERE id = @id
         AND tenant_id = @tenantId`
    : `SELECT TOP 1 id, email, invited, auth_id
       FROM app_users
       WHERE id = @id`;

  let user;

  try {
    user = await runSingleQuery(invitationQuery, scopedParams);
  } catch (error) {
    if (!isMissingColumnError(error, 'invited')) {
      throw error;
    }

    const fallbackQuery = hasTenantScope(tenantId)
      ? `SELECT TOP 1 id, email, auth_id
         FROM app_users
         WHERE id = @id
           AND tenant_id = @tenantId`
      : `SELECT TOP 1 id, email, auth_id
         FROM app_users
         WHERE id = @id`;

    user = await runSingleQuery(fallbackQuery, scopedParams);

    if (user) {
      user.invited = false;
    }
  }

  if (!user) {
    return null;
  }

  return {
    ...user,
    status: user.auth_id ? 'registered' : (user.invited ? 'invited' : 'not_invited')
  };
};

export const listProperties = async ({ tenantId, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => paginateQuery({
  baseQuery: 'SELECT * FROM properties WHERE tenant_id = @tenantId',
  orderBy: 'createdat DESC',
  page,
  pageSize,
  params: { tenantId: assertTenantId(tenantId) }
});

export const getPropertyById = async (id, tenantId) => runSingleQuery(
  `SELECT TOP 1 *
   FROM properties
   WHERE id = @id
     AND tenant_id = @tenantId`,
  { id, tenantId: assertTenantId(tenantId) }
);

export const updatePropertyById = async (id, payload = {}, tenantId) => {
  const mutableFields = ['status', 'updatedat'];
  const entries = Object.entries(payload).filter(([key, value]) => mutableFields.includes(key) && value !== undefined);

  if (entries.length === 0) {
    return getPropertyById(id, tenantId);
  }

  const params = { id, tenantId: assertTenantId(tenantId), updatedat: payload.updatedat || new Date().toISOString() };
  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = value;
    return `${key} = @${paramKey}`;
  });

  if (!entries.some(([key]) => key === 'updatedat')) {
    assignments.push('updatedat = @updatedat');
  }

  const rows = await runQuery(
    `UPDATE properties
     SET ${assignments.join(', ')}
     OUTPUT INSERTED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    params
  );

  return rows[0] || null;
};

export const listPropertyUnits = async ({ tenantId, propertyId, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const filters = [];
  const params = {};

  applyTenantFilter({ filters, params, tenantId });

  if (propertyId) {
    filters.push('propertyid = @propertyId');
    params.propertyId = propertyId;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  return paginateQuery({
    baseQuery: `SELECT * FROM property_units ${whereClause}`,
    orderBy: 'createdat DESC',
    page,
    pageSize,
    params
  });
};

export const listAgreementTemplates = async ({ tenantId, language, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const filters = [];
  const params = {};

  applyTenantFilter({ filters, params, tenantId });

  if (language) {
    filters.push('language = @language');
    params.language = language;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  return paginateQuery({
    baseQuery: `SELECT * FROM agreement_templates ${whereClause}`,
    orderBy: 'name ASC',
    page,
    pageSize,
    params
  });
};

export const getAgreementTemplateById = async (id, tenantId) => runSingleQuery(
  `SELECT TOP 1 *
   FROM agreement_templates
   WHERE id = @id
     AND tenant_id = @tenantId`,
  { id, tenantId: assertTenantId(tenantId) }
);

export const createAgreementTemplate = async (payload = {}, tenantId) => {
  const now = new Date().toISOString();
  const scopedPayload = mergeTenantPayload(payload, tenantId);
  const {
    id = null,
    name = null,
    language = 'English',
    content = null,
    version = '1.0',
    tenant_id = null
  } = scopedPayload;

  const rows = await runQuery(
    `INSERT INTO agreement_templates (
      id,
      tenant_id,
      name,
      language,
      content,
      version,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.*
    VALUES (
      COALESCE(@id, NEWID()),
      @tenant_id,
      @name,
      @language,
      @content,
      @version,
      @createdat,
      @updatedat
    )`,
    {
      id,
      tenant_id,
      name,
      language,
      content,
      version,
      createdat: now,
      updatedat: now
    }
  );

  return rows[0] || null;
};

export const updateAgreementTemplate = async (id, payload = {}, tenantId) => {
  const entries = Object.entries(payload).filter(([key, value]) => AGREEMENT_TEMPLATE_UPDATABLE_FIELDS.includes(key) && value !== undefined);

  if (entries.length === 0) {
    return getAgreementTemplateById(id, tenantId);
  }

  const params = { id, tenantId: assertTenantId(tenantId), updatedat: payload.updatedat || new Date().toISOString() };
  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = value;
    return `${key} = @${paramKey}`;
  });

  if (!entries.some(([key]) => key === 'updatedat')) {
    assignments.push('updatedat = @updatedat');
  }

  const rows = await runQuery(
    `UPDATE agreement_templates
     SET ${assignments.join(', ')}
     OUTPUT INSERTED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    params
  );

  return rows[0] || null;
};

export const deleteAgreementTemplateById = async (id, tenantId) => {
  const rows = await runQuery(
    `DELETE FROM agreement_templates
     OUTPUT DELETED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  return rows[0] || null;
};

export const getPropertyUnitById = async (id, tenantId) => runSingleQuery(
  `SELECT TOP 1 *
   FROM property_units
   WHERE id = @id
     AND tenant_id = @tenantId`,
  { id, tenantId: assertTenantId(tenantId) }
);

export const listInvoices = async ({
  tenantId,
  propertyId,
  renteeId,
  status,
  billingPeriod,
  fromDate,
  toDate,
  page = 1,
  pageSize = DEFAULT_PAGE_SIZE
} = {}) => {
  const filters = [];
  const params = {};

  applyTenantFilter({ filters, params, tenantId });

  if (propertyId) {
    filters.push('propertyid = @propertyId');
    params.propertyId = propertyId;
  }

  if (renteeId) {
    filters.push('renteeid = @renteeId');
    params.renteeId = renteeId;
  }

  if (status) {
    filters.push('status = @status');
    params.status = status;
  }

  if (billingPeriod) {
    filters.push('billingperiod = @billingPeriod');
    params.billingPeriod = billingPeriod;
  }

  if (fromDate) {
    filters.push('createdat >= @fromDate');
    params.fromDate = fromDate;
  }

  if (toDate) {
    filters.push('createdat <= @toDate');
    params.toDate = toDate;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';
  const rows = await paginateQuery({
    baseQuery: `SELECT * FROM invoices ${whereClause}`,
    orderBy: 'createdat DESC',
    page,
    pageSize,
    params
  });

  return rows.map(mapInvoiceRow);
};

export const getInvoiceById = async (id, tenantId) => {
  const row = await runSingleQuery(
    `SELECT TOP 1 *
     FROM invoices
     WHERE id = @id
       AND tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  return mapInvoiceRow(row);
};

export const createInvoice = async (payload = {}, tenantId) => {
  const now = new Date().toISOString();
  const scopedPayload = mergeTenantPayload(payload, tenantId);
  await ensureInvoiceRelationships({ tenantId, payload: scopedPayload });
  const {
    id = null,
    renteeid = null,
    propertyid = null,
    billingperiod = null,
    components = null,
    totalamount = null,
    status = 'pending',
    paymentproofurl = null,
    paymentdate = null,
    duedate = null,
    notes = null,
    tenant_id = null
  } = scopedPayload;

  const rows = await runQuery(
    `INSERT INTO invoices (
      id,
      tenant_id,
      renteeid,
      propertyid,
      billingperiod,
      components,
      totalamount,
      status,
      paymentproofurl,
      paymentdate,
      duedate,
      notes,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.*
    VALUES (
      COALESCE(@id, NEWID()),
      @tenant_id,
      @renteeid,
      @propertyid,
      @billingperiod,
      @components,
      @totalamount,
      @status,
      @paymentproofurl,
      @paymentdate,
      @duedate,
      @notes,
      @createdat,
      @updatedat
    )`,
    {
      id,
      tenant_id,
      renteeid,
      propertyid,
      billingperiod,
      components: components == null ? null : JSON.stringify(components),
      totalamount,
      status,
      paymentproofurl,
      paymentdate,
      duedate,
      notes,
      createdat: now,
      updatedat: now
    }
  );

  return mapInvoiceRow(rows[0] || null);
};

export const updateInvoice = async (id, payload = {}, tenantId) => {
  const entries = Object.entries(payload).filter(([key, value]) => INVOICE_UPDATABLE_FIELDS.includes(key) && value !== undefined);

  if (entries.length === 0) {
    return getInvoiceById(id, tenantId);
  }

  await ensureInvoiceRelationships({ tenantId, payload });

  const params = { id, tenantId: assertTenantId(tenantId), updatedat: payload.updatedat || new Date().toISOString() };
  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = INVOICE_JSON_FIELDS.has(key) && value !== null && typeof value !== 'string'
      ? JSON.stringify(value)
      : value;
    return `${key} = @${paramKey}`;
  });

  if (!entries.some(([key]) => key === 'updatedat')) {
    assignments.push('updatedat = @updatedat');
  }

  const rows = await runQuery(
    `UPDATE invoices
     SET ${assignments.join(', ')}
     OUTPUT INSERTED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    params
  );

  return mapInvoiceRow(rows[0] || null);
};

export const listAgreements = async ({ tenantId, propertyId, renteeId, status, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const filters = [];
  const params = {};

  applyTenantFilter({ filters, params, tenantId, column: 'a.tenant_id' });

  if (propertyId) {
    filters.push('a.propertyid = @propertyId');
    params.propertyId = propertyId;
  }

  if (renteeId) {
    filters.push('a.renteeid = @renteeId');
    params.renteeId = renteeId;
  }

  if (status) {
    filters.push('a.status = @status');
    params.status = status;
  }

  const whereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

  const rows = await paginateQuery({
    baseQuery: `${AGREEMENT_SELECT} ${whereClause}`,
    orderBy: 'createdat DESC',
    page,
    pageSize,
    params
  });

  return rows.map(mapAgreementRow);
};

export const getAgreementById = async (id, tenantId) => {
  const row = await runSingleQuery(
    `${AGREEMENT_SELECT}
     WHERE a.id = @id
       AND a.tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  return row ? mapAgreementRow(row) : null;
};

export const createAgreement = async (payload, tenantId) => {
  const now = new Date().toISOString();
  const scopedPayload = mergeTenantPayload(payload || {}, tenantId);
  await ensureAgreementRelationships({ tenantId, payload: scopedPayload });
  const {
    templateid = null,
    renteeid = null,
    propertyid = null,
    unitid = null,
    status = 'draft',
    startdate = null,
    enddate = null,
    rentamount = null,
    depositamount = null,
    documenturl = null,
    signeddocumenturl = null,
    evia_document_id = null,
    eviasignreference = null,
    title = null,
    content = null,
    processedcontent = null,
    terms = null,
    notes = null,
    needs_document_generation = false,
    signature_status = null,
    signature_sent_at = null,
    signature_completed_at = null,
    signatories_status = null,
    signed_document_url = null,
    pdfurl = null,
    signatureurl = null,
    signature_pdf_url = null,
    signeddate = null,
    cancellation_reason = null,
    tenant_id = null
  } = scopedPayload;

  const insertedRows = await runQuery(
    `INSERT INTO agreements (
      tenant_id,
      templateid,
      renteeid,
      propertyid,
      unitid,
      status,
      startdate,
      enddate,
      rentamount,
      depositamount,
      documenturl,
      signeddocumenturl,
      signed_document_url,
      signatureurl,
      signature_pdf_url,
      pdfurl,
      evia_document_id,
      eviasignreference,
      title,
      content,
      processedcontent,
      terms,
      notes,
      needs_document_generation,
      signature_status,
      signature_sent_at,
      signature_completed_at,
      signatories_status,
      signeddate,
      cancellation_reason,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.*
    VALUES (
      @tenant_id,
      @templateid,
      @renteeid,
      @propertyid,
      @unitid,
      @status,
      @startdate,
      @enddate,
      @rentamount,
      @depositamount,
      @documenturl,
      @signeddocumenturl,
      @signed_document_url,
      @signatureurl,
      @signature_pdf_url,
      @pdfurl,
      @evia_document_id,
      @eviasignreference,
      @title,
      @content,
      @processedcontent,
      @terms,
      @notes,
      @needs_document_generation,
      @signature_status,
      @signature_sent_at,
      @signature_completed_at,
      @signatories_status,
      @signeddate,
      @cancellation_reason,
      @createdat,
      @updatedat
    )`,
    {
      tenant_id,
      templateid,
      renteeid,
      propertyid,
      unitid,
      status,
      startdate,
      enddate,
      rentamount,
      depositamount,
      documenturl,
      signeddocumenturl,
      signed_document_url,
      signatureurl,
      signature_pdf_url,
      pdfurl,
      evia_document_id,
      eviasignreference,
      title,
      content,
      processedcontent,
      terms: serializeAgreementValue('terms', terms),
      notes,
      needs_document_generation,
      signature_status,
      signature_sent_at,
      signature_completed_at,
      signatories_status: serializeAgreementValue('signatories_status', signatories_status),
      signeddate,
      cancellation_reason,
      createdat: now,
      updatedat: now
    }
  );

  return insertedRows[0] || null;
};

export const updateAgreement = async (id, payload, tenantId) => {
  const entries = Object.entries(payload || {}).filter(([key]) => AGREEMENT_UPDATABLE_FIELDS.includes(key));

  if (entries.length === 0) {
    return getAgreementById(id, tenantId);
  }

  await ensureAgreementRelationships({ tenantId, payload });

  const params = { id, tenantId: assertTenantId(tenantId), updatedat: new Date().toISOString() };
  const assignments = entries.map(([key, value], index) => {
    const paramKey = `value${index}`;
    params[paramKey] = serializeAgreementValue(key, value);
    return `${key} = @${paramKey}`;
  });

  assignments.push('updatedat = @updatedat');

  const rows = await runQuery(
    `UPDATE agreements
     SET ${assignments.join(', ')}
     OUTPUT INSERTED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    params
  );

  return rows[0] ? getAgreementById(rows[0].id, tenantId) : null;
};

export const deleteAgreementById = async (id, tenantId) => {
  const rows = await runQuery(
    `DELETE FROM agreements
     OUTPUT DELETED.*
     WHERE id = @id
       AND tenant_id = @tenantId`,
    { id, tenantId: assertTenantId(tenantId) }
  );

  return rows[0] || null;
};

export const markAgreementSigned = async (id, tenantId) => {
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    const agreementRequest = new sql.Request(transaction);
    agreementRequest.input('id', id);
    agreementRequest.input('tenantId', assertTenantId(tenantId));
    agreementRequest.input('signeddate', new Date().toISOString());
    agreementRequest.input('updatedat', new Date().toISOString());

    const agreementResult = await agreementRequest.query(`
      UPDATE agreements
      SET status = 'signed',
          signeddate = @signeddate,
          updatedat = @updatedat
      OUTPUT INSERTED.*
      WHERE id = @id
        AND tenant_id = @tenantId
    `);

    const updatedAgreement = agreementResult.recordset[0];

    if (!updatedAgreement) {
      throw new Error('Agreement not found');
    }

    if (updatedAgreement.propertyid) {
      const propertyRequest = new sql.Request(transaction);
      propertyRequest.input('propertyId', updatedAgreement.propertyid);
      propertyRequest.input('tenantId', tenantId);
      propertyRequest.input('updatedat', new Date().toISOString());
      await propertyRequest.query(`
        UPDATE properties
        SET status = 'available',
            updatedat = @updatedat
        WHERE id = @propertyId
          AND tenant_id = @tenantId
      `);
    }

    if (updatedAgreement.unitid) {
      const unitRequest = new sql.Request(transaction);
      unitRequest.input('unitId', updatedAgreement.unitid);
      unitRequest.input('tenantId', tenantId);
      unitRequest.input('updatedat', new Date().toISOString());
      await unitRequest.query(`
        UPDATE property_units
        SET status = 'occupied',
            updatedat = @updatedat
        WHERE id = @unitId
          AND tenant_id = @tenantId
      `);
    }

    if (updatedAgreement.renteeid && updatedAgreement.propertyid) {
      const userRequest = new sql.Request(transaction);
      userRequest.input('renteeId', updatedAgreement.renteeid);
      userRequest.input('tenantId', tenantId);
      const userResult = await userRequest.query(`
        SELECT TOP 1 associated_property_ids
        FROM app_users
        WHERE id = @renteeId
          AND tenant_id = @tenantId
      `);

      const currentRaw = userResult.recordset[0]?.associated_property_ids;
      const currentValue = parseJsonValue(currentRaw);
      const currentProperties = Array.isArray(currentValue) ? currentValue : [];

      if (!currentProperties.includes(updatedAgreement.propertyid)) {
        currentProperties.push(updatedAgreement.propertyid);
        const updateUserRequest = new sql.Request(transaction);
        updateUserRequest.input('renteeId', updatedAgreement.renteeid);
        updateUserRequest.input('tenantId', tenantId);
        updateUserRequest.input('associatedPropertyIds', JSON.stringify(currentProperties));
        updateUserRequest.input('updatedat', new Date().toISOString());
        await updateUserRequest.query(`
          UPDATE app_users
          SET associated_property_ids = @associatedPropertyIds,
              updatedat = @updatedat
          WHERE id = @renteeId
            AND tenant_id = @tenantId
        `);
      }
    }

    await transaction.commit();
    return getAgreementById(id, tenantId);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
