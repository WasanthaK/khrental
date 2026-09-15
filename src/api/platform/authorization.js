const ADMIN_ROLE = 'admin';
const TENANT_ROLE = 'rentee';
const STAFF_ROLES = new Set([
  'staff',
  'manager',
  'finance_staff',
  'maintenance_staff',
  'maintenance',
  'supervisor'
]);

const ADMIN_QUERY_TABLES = new Set([
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

const BLOCKED_RUNTIME_RPCS = new Set([
  'exec_sql',
  'create_policy',
  'enable_rls',
  'create_app_users_table',
  'create_create_app_users_table_procedure',
  'test_status_value'
]);

const ADMIN_RPCS = new Set([
  'get_table_columns',
  'reject_utility_reading',
  'update_agreement_status',
  'get_rentees_by_property',
  'get_rentees_by_unit'
]);

const TENANT_SELECT_SCOPES = Object.freeze({
  app_users: { column: 'id' },
  agreements: { column: 'renteeid' },
  invoices: { column: 'renteeid' },
  utility_readings: { column: 'renteeid' },
  maintenance_requests: { column: 'renteeid' },
  notifications: { column: 'user_id' },
  action_records: { column: 'renteeid' },
  sent_letters: { column: 'renteeid' },
  properties: { relation: 'tenant-property' },
  property_units: { relation: 'tenant-unit' },
  payments: { relation: 'tenant-payment' },
  maintenance_request_images: { relation: 'tenant-maintenance-child' },
  maintenance_request_comments: { relation: 'tenant-maintenance-child' }
});

const STAFF_SELECT_SCOPES = Object.freeze({
  app_users: { column: 'id' },
  maintenance_requests: { column: 'assignedto' },
  task_assignments: { column: 'teammemberid' }
});

const TENANT_INSERT_FIELDS = Object.freeze({
  maintenance_requests: new Set(['title', 'description', 'propertyid', 'priority', 'requesttype', 'notes', 'images', 'createdat', 'updatedat']),
  utility_readings: new Set(['propertyid', 'utilitytype', 'previousreading', 'currentreading', 'readingvalue', 'readingdate', 'photourl', 'meteridentifier', 'notes', 'createdat', 'updatedat']),
  maintenance_request_images: new Set(['maintenance_request_id', 'image_url', 'image_type', 'uploaded_at', 'description']),
  maintenance_request_comments: new Set(['maintenance_request_id', 'comment', 'created_at', 'updated_at'])
});

const TENANT_UPDATE_FIELDS = Object.freeze({
  app_users: new Set(['name', 'contact_details', 'permanent_address', 'profile_image_url', 'national_id', 'updatedat']),
  maintenance_requests: new Set(['status', 'cancelledat', 'cancellationreason', 'updatedat']),
  notifications: new Set(['is_read', 'updatedat'])
});

const STAFF_UPDATE_FIELDS = Object.freeze({
  maintenance_requests: new Set(['status', 'notes', 'startedat', 'completedat', 'images', 'updatedat']),
  task_assignments: new Set(['status', 'notes', 'completiondate', 'updatedat'])
});

const normalizeRole = (user, membership) => String(membership?.role || user?.role || user?.user_type || '')
  .trim()
  .toLowerCase();

const createAuthorizationError = (message, code = 'PLATFORM_ACCESS_DENIED') => {
  const error = new Error(message);
  error.status = 403;
  error.code = code;
  return error;
};

const requireUserId = (user) => {
  if (!user?.id) {
    throw createAuthorizationError('A linked application user is required.', 'LINKED_USER_REQUIRED');
  }
  return user.id;
};

const requireRecordFilter = (filters, action) => {
  const hasRecordFilter = Array.isArray(filters) && filters.some((filter) => {
    const column = String(filter?.column || '').trim().toLowerCase();
    return column && column !== 'tenant_id';
  });

  if (!hasRecordFilter) {
    throw createAuthorizationError(
      `Unfiltered ${action} operations are not allowed.`,
      'UNFILTERED_MUTATION_BLOCKED'
    );
  }
};

const filterPayload = (payload, allowedFields, forcedFields = {}) => {
  const sanitizeRow = (row = {}) => {
    const sanitized = {};
    Object.entries(row || {}).forEach(([key, value]) => {
      if (allowedFields.has(key)) {
        sanitized[key] = value;
      }
    });
    return { ...sanitized, ...forcedFields };
  };

  return Array.isArray(payload) ? payload.map(sanitizeRow) : sanitizeRow(payload);
};

const hasPayloadFields = (payload) => {
  const rows = Array.isArray(payload) ? payload : [payload];
  return rows.length > 0 && rows.every((row) => Object.keys(row || {}).length > 0);
};

const addOwnerFilter = (filters, column, userId) => [
  ...(Array.isArray(filters) ? filters : []),
  { column, operator: 'eq', value: userId }
];

const authorizeAdminQuery = ({ action, table, filters, payload }) => {
  if (!ADMIN_QUERY_TABLES.has(table)) {
    throw createAuthorizationError('This table is not available through the runtime platform API.', 'TABLE_BLOCKED');
  }

  if (action === 'update' || action === 'delete') {
    requireRecordFilter(filters, action);
  }

  if (!['select', 'insert', 'update', 'delete', 'upsert'].includes(action)) {
    throw createAuthorizationError(`Unsupported action: ${action}`, 'ACTION_BLOCKED');
  }

  return { action, table, filters, payload, resourceScope: null };
};

const authorizeTenantQuery = ({ action, table, filters, payload, user }) => {
  const userId = requireUserId(user);
  const selectScope = TENANT_SELECT_SCOPES[table];

  if (action === 'select') {
    if (!selectScope) {
      throw createAuthorizationError('Tenant access to this resource is not allowed.', 'RESOURCE_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: selectScope.column ? addOwnerFilter(filters, selectScope.column, userId) : filters,
      payload,
      resourceScope: selectScope.relation ? { kind: selectScope.relation, userId } : null
    };
  }

  if (action === 'insert' && TENANT_INSERT_FIELDS[table]) {
    const forcedFields = table === 'maintenance_requests' || table === 'utility_readings'
      ? { renteeid: userId }
      : table === 'maintenance_request_images'
        ? { uploaded_by: userId }
        : { user_id: userId };
    return {
      action,
      table,
      filters,
      payload: filterPayload(payload, TENANT_INSERT_FIELDS[table], forcedFields),
      resourceScope: { kind: 'tenant-insert', userId }
    };
  }

  if (action === 'update' && TENANT_UPDATE_FIELDS[table]) {
    requireRecordFilter(filters, action);
    const ownerColumn = table === 'app_users' ? 'id' : table === 'notifications' ? 'user_id' : 'renteeid';
    const sanitizedPayload = filterPayload(payload, TENANT_UPDATE_FIELDS[table]);
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No tenant-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    if (table === 'maintenance_requests' && sanitizedPayload.status && sanitizedPayload.status !== 'cancelled') {
      throw createAuthorizationError('Tenants may only cancel their own maintenance request.', 'FIELD_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: addOwnerFilter(filters, ownerColumn, userId),
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  throw createAuthorizationError('Tenant access to this operation is not allowed.', 'ACTION_ACCESS_DENIED');
};

const authorizeStaffQuery = ({ action, table, filters, payload, user }) => {
  const userId = requireUserId(user);
  const selectScope = STAFF_SELECT_SCOPES[table];

  if (action === 'select' && selectScope) {
    return {
      action,
      table,
      filters: addOwnerFilter(filters, selectScope.column, userId),
      payload,
      resourceScope: null
    };
  }

  if (action === 'update' && STAFF_UPDATE_FIELDS[table]) {
    requireRecordFilter(filters, action);
    const sanitizedPayload = filterPayload(payload, STAFF_UPDATE_FIELDS[table]);
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No staff-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: addOwnerFilter(filters, STAFF_SELECT_SCOPES[table].column, userId),
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  throw createAuthorizationError(
    'This staff account does not have permission for the requested resource.',
    'STAFF_PERMISSION_REQUIRED'
  );
};

export const authorizePlatformQuery = ({ action = 'select', table, filters = [], payload, user, membership }) => {
  const normalizedAction = String(action || 'select').trim().toLowerCase();
  const normalizedTable = String(table || '').trim().toLowerCase();
  const role = normalizeRole(user, membership);
  const request = { action: normalizedAction, table: normalizedTable, filters, payload, user };

  if (role === ADMIN_ROLE) {
    return authorizeAdminQuery(request);
  }
  if (role === TENANT_ROLE) {
    return authorizeTenantQuery(request);
  }
  if (STAFF_ROLES.has(role)) {
    return authorizeStaffQuery(request);
  }

  throw createAuthorizationError('This account is not linked to an authorized business role.', 'ROLE_ACCESS_DENIED');
};

export const authorizePlatformRpc = ({ name, user, membership }) => {
  const normalizedName = String(name || '').trim().toLowerCase();
  const role = normalizeRole(user, membership);

  if (BLOCKED_RUNTIME_RPCS.has(normalizedName)) {
    throw createAuthorizationError('This RPC is disabled in the runtime application.', 'RPC_BLOCKED');
  }

  if (role === ADMIN_ROLE && ADMIN_RPCS.has(normalizedName)) {
    return normalizedName;
  }

  if (!role || (!STAFF_ROLES.has(role) && role !== TENANT_ROLE && role !== ADMIN_ROLE)) {
    throw createAuthorizationError('This account is not linked to an authorized business role.', 'ROLE_ACCESS_DENIED');
  }

  throw createAuthorizationError('This RPC is not allowed for the current role.', 'RPC_ACCESS_DENIED');
};

export const getPlatformRoleType = ({ user, membership }) => {
  const role = normalizeRole(user, membership);
  if (role === ADMIN_ROLE) {
    return ADMIN_ROLE;
  }
  if (role === TENANT_ROLE) {
    return TENANT_ROLE;
  }
  if (STAFF_ROLES.has(role)) {
    return 'staff';
  }
  return 'unlinked';
};
