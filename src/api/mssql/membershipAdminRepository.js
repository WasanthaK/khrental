import { paginateQuery, runQuery, runSingleQuery } from './query.js';
import { getAppUserById, getTenantById } from './repositories.js';
import {
  PORTAL_TYPES,
  STAFF_PERMISSION_BUNDLES,
  getPortalType,
  getStaffPermissionBundle
} from '../../utils/accessModel.js';

const DEFAULT_PAGE_SIZE = 50;
const STAFF_BUNDLES = new Set(Object.values(STAFF_PERMISSION_BUNDLES));
const UNIQUE_IDENTIFIER_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isUniqueIdentifier = (value) => UNIQUE_IDENTIFIER_REGEX.test(String(value || '').trim());
const normalizeValue = (value) => String(value || '').trim().toLowerCase();

const createRepositoryError = (status, message, code, details = undefined) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  return error;
};

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

const hasBundleInput = (payload = {}) => (
  Object.prototype.hasOwnProperty.call(payload, 'permission_bundle')
  || Object.prototype.hasOwnProperty.call(payload, 'permissionBundle')
);

const readBundleInput = (payload = {}) => normalizeValue(
  payload.permission_bundle ?? payload.permissionBundle
);

export const normalizeMembershipAccess = (payload = {}, currentMembership = null) => {
  const roleWasProvided = Object.prototype.hasOwnProperty.call(payload, 'role')
    && String(payload.role || '').trim() !== '';
  const bundleWasProvided = hasBundleInput(payload);

  if (!roleWasProvided && !bundleWasProvided && currentMembership) {
    return {
      role: currentMembership.role,
      permission_bundle: currentMembership.permission_bundle ?? null,
      portal_type: getPortalType({ membership: currentMembership })
    };
  }

  const requestedRole = roleWasProvided
    ? payload.role
    : (currentMembership?.role || 'staff');
  const portalType = getPortalType({ membership: { role: requestedRole } });

  if (portalType === PORTAL_TYPES.UNLINKED) {
    throw createRepositoryError(
      400,
      'Membership role must be administrator, staff, or tenant.',
      'TENANT_MEMBERSHIP_INVALID_ROLE',
      { role: requestedRole }
    );
  }

  if (portalType === PORTAL_TYPES.ADMIN) {
    return {
      role: 'admin',
      permission_bundle: null,
      portal_type: PORTAL_TYPES.ADMIN
    };
  }

  if (portalType === PORTAL_TYPES.TENANT) {
    return {
      role: 'rentee',
      permission_bundle: null,
      portal_type: PORTAL_TYPES.TENANT
    };
  }

  const requestedBundle = bundleWasProvided ? readBundleInput(payload) : '';
  if (requestedBundle && !STAFF_BUNDLES.has(requestedBundle)) {
    throw createRepositoryError(
      400,
      'Invalid staff permission bundle.',
      'TENANT_MEMBERSHIP_INVALID_PERMISSION_BUNDLE',
      {
        permission_bundle: requestedBundle,
        allowed: Array.from(STAFF_BUNDLES)
      }
    );
  }

  const currentIsStaff = currentMembership
    && getPortalType({ membership: currentMembership }) === PORTAL_TYPES.STAFF;
  const fallbackBundle = currentIsStaff
    ? getStaffPermissionBundle({ membership: currentMembership })
    : getStaffPermissionBundle({ membership: { role: requestedRole } });
  const permissionBundle = requestedBundle || fallbackBundle || STAFF_PERMISSION_BUNDLES.READ_ONLY;

  return {
    role: 'staff',
    permission_bundle: permissionBundle,
    portal_type: PORTAL_TYPES.STAFF
  };
};

const mapMembershipRow = (row) => {
  if (!row) {
    return null;
  }

  const membership = {
    id: row.id,
    tenant_id: row.tenant_id,
    app_user_id: row.app_user_id,
    role: row.role,
    permission_bundle: row.permission_bundle ?? null,
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

  membership.portal_type = getPortalType({ membership });
  if (membership.portal_type === PORTAL_TYPES.STAFF) {
    membership.permission_bundle = getStaffPermissionBundle({ membership });
  } else {
    membership.permission_bundle = null;
  }

  return membership;
};

const MEMBERSHIP_SELECT = `
  SELECT
    tm.id,
    tm.tenant_id,
    tm.app_user_id,
    tm.role,
    tm.permission_bundle,
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
`;

const getMembershipByTenantAndId = async (tenantId, membershipId) => {
  if (!isUniqueIdentifier(tenantId) || !isUniqueIdentifier(membershipId)) {
    return null;
  }

  const row = await runSingleQuery(
    `${MEMBERSHIP_SELECT}
     WHERE tm.tenant_id = @tenantId
       AND tm.id = @membershipId`,
    { tenantId, membershipId }
  );

  return mapMembershipRow(row);
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
    { appUserId, updatedat: new Date().toISOString() }
  );
};

const markDefaultMembership = async (membershipId) => {
  await runQuery(
    `UPDATE tenant_memberships
     SET is_default = 1,
         updatedat = @updatedat
     WHERE id = @membershipId`,
    { membershipId, updatedat: new Date().toISOString() }
  );
};

const syncAppUserDefaultTenant = async (appUserId, preferredMembershipId = null) => {
  if (!isUniqueIdentifier(appUserId)) {
    return;
  }

  const memberships = await getPreferredActiveMembershipsForUser(appUserId);

  if (memberships.length === 0) {
    await clearDefaultMembershipsForUser(appUserId);
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

  if (preferredMembershipId && defaultMembership) {
    await clearDefaultMembershipsForUser(appUserId);
    await markDefaultMembership(defaultMembership.id);
  } else if (!defaultMembership) {
    defaultMembership = memberships[0];
    await clearDefaultMembershipsForUser(appUserId);
    await markDefaultMembership(defaultMembership.id);
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

export const listCanonicalTenantMemberships = async (
  tenantId,
  { status, search, page = 1, pageSize = DEFAULT_PAGE_SIZE } = {}
) => {
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

  const rows = await paginateQuery({
    baseQuery: `${MEMBERSHIP_SELECT}
      WHERE ${filters.join(' AND ')}`,
    orderBy: 'CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC',
    page,
    pageSize,
    params
  });

  return rows.map(mapMembershipRow);
};

export const createCanonicalTenantMembership = async (tenantId, payload = {}) => {
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

  const access = normalizeMembershipAccess({
    role: payload.role || appUser.role || 'staff',
    ...(hasBundleInput(payload)
      ? { permission_bundle: payload.permission_bundle ?? payload.permissionBundle }
      : {})
  });
  const membershipStatus = String(payload.status || 'active').trim() || 'active';
  const isDefaultRequested = Boolean(payload.is_default ?? payload.isDefault);

  if (membershipStatus === 'active' && normalizeValue(tenant.status) !== 'active') {
    throw createRepositoryError(
      400,
      'Active memberships cannot be assigned to inactive tenants.',
      'TENANT_MEMBERSHIP_INVALID_STATUS'
    );
  }

  const priorActiveMemberships = await getPreferredActiveMembershipsForUser(appUserId);
  const rows = await runQuery(
    `INSERT INTO tenant_memberships (
      id,
      tenant_id,
      app_user_id,
      role,
      permission_bundle,
      status,
      is_default,
      createdat,
      updatedat
    )
    OUTPUT INSERTED.id
    VALUES (
      COALESCE(@id, NEWID()),
      @tenantId,
      @appUserId,
      @role,
      @permissionBundle,
      @status,
      @isDefault,
      @createdat,
      @updatedat
    )`,
    {
      id: payload.id || null,
      tenantId,
      appUserId,
      role: access.role,
      permissionBundle: access.permission_bundle,
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

  return getMembershipByTenantAndId(tenantId, membershipId);
};

export const updateCanonicalTenantMembership = async (tenantId, membershipId, payload = {}) => {
  const currentMembership = await getMembershipByTenantAndId(tenantId, membershipId);
  if (!currentMembership) {
    return null;
  }

  const nextStatus = payload.status !== undefined
    ? String(payload.status || '').trim() || currentMembership.status
    : currentMembership.status;
  const nextIsDefault = payload.is_default !== undefined || payload.isDefault !== undefined
    ? Boolean(payload.is_default ?? payload.isDefault)
    : currentMembership.is_default;
  const access = normalizeMembershipAccess(payload, currentMembership);

  const tenant = await getTenantById(tenantId);
  if (!tenant) {
    throw createRepositoryError(404, 'Tenant not found.', 'TENANT_NOT_FOUND');
  }

  if (nextStatus === 'active' && normalizeValue(tenant.status) !== 'active') {
    throw createRepositoryError(
      400,
      'Active memberships cannot be assigned to inactive tenants.',
      'TENANT_MEMBERSHIP_INVALID_STATUS'
    );
  }

  await runQuery(
    `UPDATE tenant_memberships
     SET role = @role,
         permission_bundle = @permissionBundle,
         status = @status,
         is_default = @isDefault,
         updatedat = @updatedat
     WHERE id = @membershipId
       AND tenant_id = @tenantId`,
    {
      membershipId,
      tenantId,
      role: access.role,
      permissionBundle: access.permission_bundle,
      status: nextStatus,
      isDefault: nextIsDefault && nextStatus === 'active',
      updatedat: new Date().toISOString()
    }
  );

  await syncAppUserDefaultTenant(
    currentMembership.app_user_id,
    nextStatus === 'active' && nextIsDefault ? membershipId : null
  );

  return getMembershipByTenantAndId(tenantId, membershipId);
};

export const deleteCanonicalTenantMembership = async (tenantId, membershipId) => {
  const currentMembership = await getMembershipByTenantAndId(tenantId, membershipId);
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
