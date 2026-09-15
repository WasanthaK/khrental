import { runQuery, runSingleQuery } from '../mssql/query.js';

const TABLE_EXISTS_CACHE = new Map();
const TABLE_CACHE_TTL_MS = 30_000;

const readRequestValue = (value) => Array.isArray(value) ? value[0] : value;

const normalizeString = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  const normalized = String(value).trim();
  return normalized || null;
};

const parseLegacyPropertyIds = (value) => {
  if (Array.isArray(value)) {
    return value.filter(Boolean).map((entry) => String(entry));
  }

  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.filter(Boolean).map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const isMissingTableError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('invalid object name') || message.includes('invalid column name');
};

const createTenantContextError = (status, message, code, details = undefined) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
};

const tableExists = async (tableName) => {
  const cacheKey = String(tableName || '').toLowerCase();
  const cached = TABLE_EXISTS_CACHE.get(cacheKey);

  if (cached && (Date.now() - cached.checkedAt) < TABLE_CACHE_TTL_MS) {
    return cached.exists;
  }

  const row = await runSingleQuery(
    `SELECT CASE WHEN OBJECT_ID(@objectName, 'U') IS NULL THEN 0 ELSE 1 END AS exists_value`,
    { objectName: `dbo.${tableName}` }
  );

  const exists = Boolean(row?.exists_value);
  TABLE_EXISTS_CACHE.set(cacheKey, { exists, checkedAt: Date.now() });
  return exists;
};

const areLegacyIdentityHeadersAllowed = () => process.env.NODE_ENV !== 'production'
  && String(process.env.ALLOW_LEGACY_AUTH_HEADERS || 'true').trim().toLowerCase() === 'true';

const readRequestIdentity = (req) => {
  if (req.authIdentity) {
    return {
      authId: normalizeString(req.authIdentity.authId),
      userId: normalizeString(req.authIdentity.userId),
      email: normalizeString(req.authIdentity.email)
    };
  }

  if (!areLegacyIdentityHeadersAllowed()) {
    return { authId: null, userId: null, email: null };
  }

  return {
    authId: normalizeString(readRequestValue(req.headers['x-auth-id'])),
    userId: normalizeString(readRequestValue(req.headers['x-user-id'])),
    email: normalizeString(readRequestValue(req.headers['x-user-email']))
  };
};

const readDevBypassRole = (req) => normalizeString(readRequestValue(req.headers['x-dev-bypass-role']));

const isDevBypassAllowed = () => String(process.env.VITE_ENABLE_DEV_BYPASS || '').trim().toLowerCase() === 'true';

const readRequestedTenantId = (req) => normalizeString(
  readRequestValue(req.headers['x-tenant-id'])
  || readRequestValue(req.headers['x-active-tenant-id'])
  || req.query?.tenantId
  || req.query?.tenant_id
  || req.body?.tenantId
  || req.body?.tenant_id
);

const getUserForIdentity = async ({ authId, userId, email }) => {
  if (!(await tableExists('app_users'))) {
    return null;
  }

  try {
    if (authId) {
      const user = await runSingleQuery(
        `SELECT TOP 1 *
         FROM app_users
         WHERE auth_id = @authId`,
        { authId }
      );

      if (user) {
        return user;
      }
    }

    if (userId) {
      const user = await runSingleQuery(
        `SELECT TOP 1 *
         FROM app_users
         WHERE id = @userId`,
        { userId }
      );

      if (user) {
        return user;
      }
    }

    if (email) {
      return runSingleQuery(
        `SELECT TOP 1 *
         FROM app_users
         WHERE email = @email`,
        { email }
      );
    }
  } catch (error) {
    if (isMissingTableError(error)) {
      return null;
    }

    throw error;
  }

  return null;
};

const listMembershipsForUser = async (appUserId) => {
  if (!appUserId) {
    return [];
  }

  const hasMembershipTable = await tableExists('tenant_memberships');
  const hasTenantsTable = await tableExists('tenants');

  if (!hasMembershipTable || !hasTenantsTable) {
    return [];
  }

  try {
    const rows = await runQuery(
      `SELECT
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
         t.createdat AS tenant_createdat,
         t.updatedat AS tenant_updatedat
       FROM tenant_memberships tm
       INNER JOIN tenants t ON t.id = tm.tenant_id
       WHERE tm.app_user_id = @appUserId
         AND tm.status = 'active'
         AND (t.status IS NULL OR t.status = 'active')
       ORDER BY CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC`,
      { appUserId }
    );

    return rows.map((row) => ({
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
        plan: row.tenant_plan,
        createdat: row.tenant_createdat,
        updatedat: row.tenant_updatedat
      }
    }));
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
};

const listAssignedPropertyIdsForUser = async ({ appUserId, tenantId, user }) => {
  if (!appUserId || !tenantId) {
    return [];
  }

  if (await tableExists('staff_property_assignments')) {
    try {
      const rows = await runQuery(
        `SELECT propertyid
         FROM staff_property_assignments
         WHERE tenant_id = @tenantId
           AND staff_user_id = @appUserId
           AND status = 'active'`,
        { tenantId, appUserId }
      );

      return rows.map((row) => row.propertyid).filter(Boolean);
    } catch (error) {
      if (!isMissingTableError(error)) {
        throw error;
      }
    }
  }

  return parseLegacyPropertyIds(user?.associated_property_ids);
};

const listAssignedRenteeIdsForProperties = async ({ tenantId, propertyIds }) => {
  const normalizedPropertyIds = [...new Set(
    (Array.isArray(propertyIds) ? propertyIds : []).filter(Boolean).map((propertyId) => String(propertyId))
  )];

  if (!tenantId || normalizedPropertyIds.length === 0 || !(await tableExists('agreements'))) {
    return [];
  }

  const params = { tenantId };
  const propertyPlaceholders = normalizedPropertyIds.map((propertyId, index) => {
    const key = `assignedProperty${index}`;
    params[key] = propertyId;
    return `@${key}`;
  });

  try {
    const rows = await runQuery(
      `SELECT DISTINCT renteeid
       FROM agreements
       WHERE tenant_id = @tenantId
         AND renteeid IS NOT NULL
         AND propertyid IN (${propertyPlaceholders.join(', ')})`,
      params
    );

    return rows.map((row) => row.renteeid).filter(Boolean);
  } catch (error) {
    if (isMissingTableError(error)) {
      return [];
    }

    throw error;
  }
};

const selectActiveMembership = ({ requestedTenantId, memberships, user }) => {
  if (requestedTenantId) {
    const requestedMembership = memberships.find((entry) => entry.tenant_id === requestedTenantId);

    if (requestedMembership) {
      return {
        tenantId: requestedMembership.tenant_id,
        membership: requestedMembership,
        tenant: requestedMembership.tenant,
        resolution: 'requested'
      };
    }

    if (memberships.length > 0) {
      throw createTenantContextError(
        403,
        'The requested tenant is not available for the current user.',
        'TENANT_ACCESS_DENIED',
        { requestedTenantId }
      );
    }

    if (user?.tenant_id === requestedTenantId) {
      return {
        tenantId: requestedTenantId,
        membership: null,
        tenant: null,
        resolution: 'legacy-user-tenant'
      };
    }

    throw createTenantContextError(
      403,
      'The requested tenant could not be resolved for the current user.',
      'TENANT_NOT_RESOLVED',
      { requestedTenantId }
    );
  }

  if (memberships.length === 1) {
    return {
      tenantId: memberships[0].tenant_id,
      membership: memberships[0],
      tenant: memberships[0].tenant,
      resolution: 'single-membership'
    };
  }

  if (user?.tenant_id) {
    const userTenantMembership = memberships.find((entry) => entry.tenant_id === user.tenant_id);
    if (userTenantMembership) {
      return {
        tenantId: userTenantMembership.tenant_id,
        membership: userTenantMembership,
        tenant: userTenantMembership.tenant,
        resolution: 'user-record-tenant'
      };
    }

    if (memberships.length === 0) {
      return {
        tenantId: user.tenant_id,
        membership: null,
        tenant: null,
        resolution: 'legacy-user-tenant'
      };
    }
  }

  const defaultMembership = memberships.find((entry) => entry.is_default);
  if (defaultMembership) {
    return {
      tenantId: defaultMembership.tenant_id,
      membership: defaultMembership,
      tenant: defaultMembership.tenant,
      resolution: 'default-membership'
    };
  }

  if (memberships.length > 1) {
    throw createTenantContextError(
      409,
      'Multiple tenant memberships are available. Specify x-tenant-id to select the active tenant.',
      'TENANT_SELECTION_REQUIRED',
      { membershipCount: memberships.length }
    );
  }

  return {
    tenantId: null,
    membership: null,
    tenant: null,
    resolution: 'none'
  };
};

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    ...user,
    password: undefined,
    passwordHash: undefined
  };
};

const getFallbackTenantSelection = async (requestedTenantId) => {
  if (!(await tableExists('tenants'))) {
    return {
      tenantId: requestedTenantId || null,
      membership: null,
      tenant: null,
      resolution: requestedTenantId ? 'requested-without-user' : 'anonymous'
    };
  }

  try {
    const tenant = requestedTenantId
      ? await runSingleQuery(
          `SELECT TOP 1 *
           FROM tenants
           WHERE id = @tenantId
             AND ([status] IS NULL OR [status] = 'active')`,
          { tenantId: requestedTenantId }
        )
      : await runSingleQuery(
          `SELECT TOP 1 *
           FROM tenants
           WHERE [status] IS NULL OR [status] = 'active'
           ORDER BY CASE WHEN slug = 'default' THEN 0 ELSE 1 END, createdat ASC`
        );

    return {
      tenantId: tenant?.id || requestedTenantId || null,
      membership: null,
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            status: tenant.status,
            plan: tenant.plan,
            createdat: tenant.createdat,
            updatedat: tenant.updatedat
          }
        : null,
      resolution: tenant ? (requestedTenantId ? 'requested-dev-bypass-tenant' : 'default-dev-bypass-tenant') : (requestedTenantId ? 'requested-without-user' : 'anonymous')
    };
  } catch (error) {
    if (isMissingTableError(error)) {
      return {
        tenantId: requestedTenantId || null,
        membership: null,
        tenant: null,
        resolution: requestedTenantId ? 'requested-without-user' : 'anonymous'
      };
    }

    throw error;
  }
};

const writeTenantContext = (req, context) => {
  req.user = context.user;
  req.memberships = context.memberships;
  req.membership = context.membership;
  req.tenant = context.tenant;
  req.tenantId = context.tenantId;
  req.tenantContext = context;
};

const auditTenantRequest = (req, context, label = 'tenant-context') => {
  console.info(`[TenantContext] ${label}`, {
    method: req.method,
    path: req.originalUrl,
    authId: context.identity?.authId || null,
    userId: context.user?.id || null,
    tenantId: context.tenantId || null,
    resolution: context.resolution,
    membershipId: context.membership?.id || null
  });
};

export const resolveTenantContext = async (req) => {
  const identity = readRequestIdentity(req);
  const requestedTenantId = readRequestedTenantId(req);
  const devBypassRole = isDevBypassAllowed() ? readDevBypassRole(req) : null;
  const resolvedUser = sanitizeUser(await getUserForIdentity(identity));
  const memberships = resolvedUser?.id ? await listMembershipsForUser(resolvedUser.id) : [];
  const bypassSelection = !resolvedUser && devBypassRole
    ? await getFallbackTenantSelection(requestedTenantId)
    : null;
  const user = resolvedUser || (devBypassRole
    ? {
        id: `dev-bypass-${devBypassRole}`,
        auth_id: null,
        email: `dev+${devBypassRole}@localhost`,
        name: `Development ${devBypassRole}`,
        role: devBypassRole,
        user_type: devBypassRole,
        tenant_id: bypassSelection?.tenantId || null,
        is_dev_bypass: true
      }
    : null);
  const selection = resolvedUser
    ? selectActiveMembership({ requestedTenantId, memberships, user })
    : bypassSelection || {
        tenantId: requestedTenantId,
        membership: null,
        tenant: null,
        resolution: requestedTenantId ? 'requested-without-user' : 'anonymous'
      };
  const assignedPropertyIds = resolvedUser?.id && selection.tenantId
    ? await listAssignedPropertyIdsForUser({
        appUserId: resolvedUser.id,
        tenantId: selection.tenantId,
        user: resolvedUser
      })
    : [];
  const assignedRenteeIds = resolvedUser?.id && selection.tenantId && selection.membership
    ? await listAssignedRenteeIdsForProperties({
        tenantId: selection.tenantId,
        propertyIds: assignedPropertyIds
      })
    : [];
  const activeMembership = selection.membership
    ? { ...selection.membership, assignedPropertyIds, assignedRenteeIds }
    : selection.membership;

  return {
    identity: {
      ...identity,
      devBypassRole
    },
    requestedTenantId,
    isAuthenticated: Boolean(user),
    user,
    memberships,
    membership: activeMembership,
    tenantId: selection.tenantId || null,
    tenant: selection.tenant || null,
    resolution: selection.resolution
  };
};

export const createTenantContextMiddleware = ({
  requireUser = false,
  requireTenant = false,
  auditLabel = null,
  auditUnsafeOnly = true
} = {}) => {
  return async (req, res, next) => {
    try {
      const context = req.tenantContext || await resolveTenantContext(req);
      writeTenantContext(req, context);

      if (requireUser && !context.user) {
        res.status(401).json({
          error: 'Authenticated user context is required for this request.',
          code: 'AUTH_CONTEXT_REQUIRED'
        });
        return;
      }

      if (requireTenant && !context.tenantId) {
        res.status(403).json({
          error: 'An active tenant context is required for this request.',
          code: 'TENANT_CONTEXT_REQUIRED'
        });
        return;
      }

      if (auditLabel && (!auditUnsafeOnly || ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))) {
        auditTenantRequest(req, context, auditLabel);
      }

      next();
    } catch (error) {
      if (error?.status) {
        res.status(error.status).json({
          error: error.message,
          code: error.code || 'TENANT_CONTEXT_ERROR',
          details: error.details || null
        });
        return;
      }

      next(error);
    }
  };
};

export const serializeTenantContext = (context) => ({
  isAuthenticated: Boolean(context?.user),
  tenantId: context?.tenantId || null,
  tenant: context?.tenant || null,
  membership: context?.membership || null,
  memberships: Array.isArray(context?.memberships) ? context.memberships : [],
  resolution: context?.resolution || 'none',
  requestedTenantId: context?.requestedTenantId || null
});
