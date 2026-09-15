import {
  PERMISSIONS,
  getRoleType,
  hasPermission,
  isAdminRole,
  isStaffRole,
  isTenantRole
} from './permissionEngine.js';

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
  app_users: { column: 'id', permission: PERMISSIONS.PROFILE_READ_SELF },
  agreements: { column: 'renteeid', permission: PERMISSIONS.AGREEMENTS_READ },
  invoices: { column: 'renteeid', permission: PERMISSIONS.INVOICES_READ },
  utility_readings: { column: 'renteeid', permission: PERMISSIONS.UTILITIES_READ },
  maintenance_requests: { column: 'renteeid' },
  notifications: { column: 'user_id' },
  action_records: { column: 'renteeid' },
  sent_letters: { column: 'renteeid' },
  properties: { relation: 'tenant-property', permission: PERMISSIONS.PROPERTIES_READ },
  property_units: { relation: 'tenant-unit', permission: PERMISSIONS.PROPERTIES_READ },
  payments: { relation: 'tenant-payment', permission: PERMISSIONS.PAYMENTS_READ },
  maintenance_request_images: { relation: 'tenant-maintenance-child' },
  maintenance_request_comments: { relation: 'tenant-maintenance-child' }
});

const STAFF_SELECT_SCOPES = Object.freeze({
  maintenance_requests: { column: 'assignedto', permission: PERMISSIONS.MAINTENANCE_READ_ASSIGNED },
  task_assignments: { column: 'teammemberid', permission: PERMISSIONS.TASKS_READ_ASSIGNED }
});

const STAFF_PROPERTY_SELECT_SCOPES = Object.freeze({
  properties: { column: 'id', permission: PERMISSIONS.PROPERTIES_READ },
  property_units: { column: 'propertyid', permission: PERMISSIONS.PROPERTIES_READ },
  agreements: { column: 'propertyid', permission: PERMISSIONS.AGREEMENTS_READ },
  invoices: { column: 'propertyid', permission: PERMISSIONS.INVOICES_READ },
  utility_readings: { column: 'propertyid', permission: PERMISSIONS.UTILITIES_READ },
  cameras: { column: 'propertyid', permission: PERMISSIONS.CAMERAS_READ }
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
  maintenance_requests: {
    fields: new Set(['status', 'notes', 'startedat', 'completedat', 'images', 'updatedat']),
    permission: PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED,
    ownerColumn: 'assignedto'
  },
  task_assignments: {
    fields: new Set(['status', 'notes', 'completiondate', 'updatedat']),
    permission: PERMISSIONS.TASKS_UPDATE_ASSIGNED,
    ownerColumn: 'teammemberid'
  }
});

const AGREEMENT_UPDATE_FIELDS = new Set([
  'templateid', 'renteeid', 'unitid', 'status', 'signeddate', 'startdate', 'enddate',
  'eviasignreference', 'documenturl', 'signeddocumenturl', 'signed_document_url', 'pdfurl', 'signatureurl',
  'signature_pdf_url', 'evia_document_id', 'title', 'content', 'processedcontent', 'rentamount', 'depositamount',
  'terms', 'notes', 'needs_document_generation', 'signature_status', 'signature_sent_at', 'signature_completed_at',
  'signatories_status', 'updatedat'
]);

const INVOICE_UPDATE_FIELDS = new Set([
  'renteeid', 'agreementid', 'status', 'amount', 'totalamount', 'duedate', 'billingperiod',
  'description', 'notes', 'paymentproofurl', 'reminderdate', 'updatedat'
]);

const STAFF_PROPERTY_UPDATE_FIELDS = Object.freeze({
  properties: {
    fields: new Set(['name', 'address', 'propertytype', 'description', 'images', 'status', 'updatedat']),
    permission: PERMISSIONS.PROPERTIES_MANAGE,
    propertyColumn: 'id'
  },
  agreements: {
    fields: AGREEMENT_UPDATE_FIELDS,
    permission: PERMISSIONS.AGREEMENTS_MANAGE,
    propertyColumn: 'propertyid'
  },
  invoices: {
    fields: INVOICE_UPDATE_FIELDS,
    permission: PERMISSIONS.INVOICES_MANAGE,
    propertyColumn: 'propertyid'
  }
});

const STAFF_PROPERTY_INSERT_FIELDS = Object.freeze({
  agreements: {
    fields: new Set(['id', 'propertyid', 'createdat', ...AGREEMENT_UPDATE_FIELDS]),
    permission: PERMISSIONS.AGREEMENTS_MANAGE
  },
  invoices: {
    fields: new Set(['id', 'propertyid', 'createdat', ...INVOICE_UPDATE_FIELDS]),
    permission: PERMISSIONS.INVOICES_MANAGE
  }
});

const RENTEE_MANAGE_FIELDS = new Set([
  'id', 'name', 'email', 'contact_details', 'national_id', 'permanent_address', 'id_copy_url', 'status', 'invited',
  'createdat', 'updatedat'
]);

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

const requirePermission = ({ user, membership }, permission) => {
  if (permission && !hasPermission({ user, membership }, permission)) {
    throw createAuthorizationError(
      `The ${permission} permission is required for this operation.`,
      'PERMISSION_REQUIRED'
    );
  }
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

const addAssignedPropertyFilter = (filters, column, membership) => [
  ...(Array.isArray(filters) ? filters : []),
  {
    column,
    operator: 'in',
    value: Array.isArray(membership?.assignedPropertyIds) ? membership.assignedPropertyIds : []
  }
];

const addRenteeFilter = (filters) => [
  ...(Array.isArray(filters) ? filters : []),
  { column: 'user_type', operator: 'eq', value: 'rentee' }
];

const filtersTargetUser = (filters, userId) => Array.isArray(filters) && filters.some((filter) => (
  String(filter?.column || '').trim().toLowerCase() === 'id'
  && String(filter?.operator || 'eq').trim().toLowerCase() === 'eq'
  && String(filter?.value || '') === String(userId)
));

const requireAssignedPropertyPayload = (payload, membership) => {
  const assignedPropertyIds = new Set(
    (Array.isArray(membership?.assignedPropertyIds) ? membership.assignedPropertyIds : []).map(String)
  );
  const rows = Array.isArray(payload) ? payload : [payload];

  if (rows.length === 0 || rows.some((row) => !row?.propertyid || !assignedPropertyIds.has(String(row.propertyid)))) {
    throw createAuthorizationError(
      'The selected property is not assigned to the current staff account.',
      'RESOURCE_ACCESS_DENIED'
    );
  }
};

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

const authorizeTenantQuery = ({ action, table, filters, payload, user, membership }) => {
  const userId = requireUserId(user);
  const subject = { user, membership };
  const selectScope = TENANT_SELECT_SCOPES[table];

  if (action === 'select') {
    if (!selectScope) {
      throw createAuthorizationError('Tenant access to this resource is not allowed.', 'RESOURCE_ACCESS_DENIED');
    }
    requirePermission(subject, selectScope.permission);
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
    if (table === 'app_users') {
      requirePermission(subject, PERMISSIONS.PROFILE_UPDATE_SELF);
    }
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

const authorizeStaffQuery = ({ action, table, filters, payload, user, membership }) => {
  const userId = requireUserId(user);
  const subject = { user, membership };

  if (table === 'app_users') {
    const targetsSelf = filtersTargetUser(filters, userId);

    if (action === 'select') {
      if (targetsSelf) {
        requirePermission(subject, PERMISSIONS.PROFILE_READ_SELF);
        return { action, table, filters: addOwnerFilter(filters, 'id', userId), payload, resourceScope: null };
      }

      if (hasPermission(subject, PERMISSIONS.RENTEES_READ)) {
        return { action, table, filters: addRenteeFilter(filters), payload, resourceScope: null };
      }

      requirePermission(subject, PERMISSIONS.PROFILE_READ_SELF);
      return { action, table, filters: addOwnerFilter(filters, 'id', userId), payload, resourceScope: null };
    }

    if (action === 'update') {
      requireRecordFilter(filters, action);
      if (targetsSelf) {
        requirePermission(subject, PERMISSIONS.PROFILE_UPDATE_SELF);
        const sanitizedPayload = filterPayload(payload, TENANT_UPDATE_FIELDS.app_users);
        if (!hasPayloadFields(sanitizedPayload)) {
          throw createAuthorizationError('No staff-editable profile fields were supplied.', 'FIELD_ACCESS_DENIED');
        }
        return { action, table, filters: addOwnerFilter(filters, 'id', userId), payload: sanitizedPayload, resourceScope: null };
      }

      requirePermission(subject, PERMISSIONS.RENTEES_MANAGE);
      const sanitizedPayload = filterPayload(payload, RENTEE_MANAGE_FIELDS, { user_type: 'rentee', role: 'rentee' });
      return { action, table, filters: addRenteeFilter(filters), payload: sanitizedPayload, resourceScope: null };
    }

    if (action === 'insert') {
      requirePermission(subject, PERMISSIONS.RENTEES_MANAGE);
      const sanitizedPayload = filterPayload(payload, RENTEE_MANAGE_FIELDS, { user_type: 'rentee', role: 'rentee' });
      return { action, table, filters, payload: sanitizedPayload, resourceScope: null };
    }
  }

  if (action === 'select' && table === 'maintenance_requests' && hasPermission(subject, PERMISSIONS.MAINTENANCE_MANAGE)) {
    return {
      action,
      table,
      filters: addAssignedPropertyFilter(filters, 'propertyid', membership),
      payload,
      resourceScope: null
    };
  }

  const selectScope = STAFF_SELECT_SCOPES[table];
  if (action === 'select' && selectScope) {
    requirePermission(subject, selectScope.permission);
    return {
      action,
      table,
      filters: addOwnerFilter(filters, selectScope.column, userId),
      payload,
      resourceScope: null
    };
  }

  const propertySelectScope = STAFF_PROPERTY_SELECT_SCOPES[table];
  if (action === 'select' && propertySelectScope) {
    requirePermission(subject, propertySelectScope.permission);
    return {
      action,
      table,
      filters: addAssignedPropertyFilter(filters, propertySelectScope.column, membership),
      payload,
      resourceScope: null
    };
  }

  if (action === 'update' && table === 'maintenance_requests' && hasPermission(subject, PERMISSIONS.MAINTENANCE_MANAGE)) {
    requireRecordFilter(filters, action);
    const sanitizedPayload = filterPayload(payload, new Set(['status', 'priority', 'assignedto', 'notes', 'updatedat']));
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No staff-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: addAssignedPropertyFilter(filters, 'propertyid', membership),
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  const updatePolicy = STAFF_UPDATE_FIELDS[table];
  if (action === 'update' && updatePolicy) {
    requirePermission(subject, updatePolicy.permission);
    requireRecordFilter(filters, action);
    const sanitizedPayload = filterPayload(payload, updatePolicy.fields);
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No staff-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: addOwnerFilter(filters, updatePolicy.ownerColumn, userId),
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  const propertyUpdatePolicy = STAFF_PROPERTY_UPDATE_FIELDS[table];
  if (action === 'update' && propertyUpdatePolicy) {
    requirePermission(subject, propertyUpdatePolicy.permission);
    requireRecordFilter(filters, action);
    const sanitizedPayload = filterPayload(payload, propertyUpdatePolicy.fields);
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No staff-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    return {
      action,
      table,
      filters: addAssignedPropertyFilter(filters, propertyUpdatePolicy.propertyColumn, membership),
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  const propertyInsertPolicy = STAFF_PROPERTY_INSERT_FIELDS[table];
  if (action === 'insert' && propertyInsertPolicy) {
    requirePermission(subject, propertyInsertPolicy.permission);
    const sanitizedPayload = filterPayload(payload, propertyInsertPolicy.fields);
    if (!hasPayloadFields(sanitizedPayload)) {
      throw createAuthorizationError('No staff-editable fields were supplied.', 'FIELD_ACCESS_DENIED');
    }
    requireAssignedPropertyPayload(sanitizedPayload, membership);
    return {
      action,
      table,
      filters,
      payload: sanitizedPayload,
      resourceScope: null
    };
  }

  throw createAuthorizationError(
    'This staff account does not have permission for the requested resource.',
    'STAFF_PERMISSION_REQUIRED'
  );
};

export const authorizePermission = ({ user, membership }, permission) => {
  requirePermission({ user, membership }, permission);
  return permission;
};

export const authorizePlatformQuery = ({ action = 'select', table, filters = [], payload, user, membership }) => {
  const normalizedAction = String(action || 'select').trim().toLowerCase();
  const normalizedTable = String(table || '').trim().toLowerCase();
  const request = { action: normalizedAction, table: normalizedTable, filters, payload, user, membership };

  if (isAdminRole({ user, membership })) {
    return authorizeAdminQuery(request);
  }
  if (isTenantRole({ user, membership })) {
    return authorizeTenantQuery(request);
  }
  if (isStaffRole({ user, membership })) {
    return authorizeStaffQuery(request);
  }

  throw createAuthorizationError('This account is not linked to an authorized business role.', 'ROLE_ACCESS_DENIED');
};

export const authorizePlatformRpc = ({ name, user, membership }) => {
  const normalizedName = String(name || '').trim().toLowerCase();

  if (BLOCKED_RUNTIME_RPCS.has(normalizedName)) {
    throw createAuthorizationError('This RPC is disabled in the runtime application.', 'RPC_BLOCKED');
  }

  if (isAdminRole({ user, membership }) && ADMIN_RPCS.has(normalizedName)) {
    return normalizedName;
  }

  if (getRoleType({ user, membership }) === 'unlinked') {
    throw createAuthorizationError('This account is not linked to an authorized business role.', 'ROLE_ACCESS_DENIED');
  }

  throw createAuthorizationError('This RPC is not allowed for the current role.', 'RPC_ACCESS_DENIED');
};

export const getPlatformRoleType = ({ user, membership }) => getRoleType({ user, membership });
