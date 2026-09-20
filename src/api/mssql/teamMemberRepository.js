import { runQuery, runSingleQuery } from './query.js';
import { createAppUser, findAppUserByEmail, updateAppUser } from './repositories.js';
import {
  createCanonicalTenantMembership,
  updateCanonicalTenantMembership
} from './membershipAdminRepository.js';
import { STAFF_PERMISSION_BUNDLES } from '../../utils/accessModel.js';

const PROFILE_FIELDS = new Set([
  'name',
  'email',
  'contact_details',
  'skills',
  'availability',
  'notes',
  'status',
  'profile_image_url'
]);
const ALLOWED_BUNDLES = new Set(Object.values(STAFF_PERMISSION_BUNDLES));

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeValue = (value) => String(value || '').trim().toLowerCase();

const parseJsonValue = (value) => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_error) {
    return value;
  }
};

const inferLegacyBundle = (role) => {
  const normalized = normalizeValue(role);
  if (normalized === 'manager') return STAFF_PERMISSION_BUNDLES.PROPERTY_OPERATIONS;
  if (normalized === 'finance_staff') return STAFF_PERMISSION_BUNDLES.FINANCE;
  if (['maintenance', 'maintenance_staff', 'supervisor', 'staff'].includes(normalized)) {
    return STAFF_PERMISSION_BUNDLES.MAINTENANCE;
  }
  return STAFF_PERMISSION_BUNDLES.READ_ONLY;
};

const normalizeBundle = (payload = {}, fallbackRole = null) => {
  const requested = normalizeValue(payload.permission_bundle ?? payload.permissionBundle);
  if (requested) {
    if (!ALLOWED_BUNDLES.has(requested)) {
      const error = new Error('Invalid staff permission bundle.');
      error.status = 400;
      error.code = 'TEAM_PERMISSION_BUNDLE_INVALID';
      throw error;
    }
    return requested;
  }

  return inferLegacyBundle(payload.role || fallbackRole);
};

const mapTeamRow = (row) => {
  if (!row) return null;

  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    mapped[key] = ['contact_details', 'skills', 'availability', 'associated_property_ids'].includes(key)
      ? parseJsonValue(value)
      : value;
  });

  const contactDetails = mapped.contact_details && typeof mapped.contact_details === 'object'
    ? mapped.contact_details
    : {};
  const email = normalizeEmail(mapped.email || contactDetails.email);
  mapped.email = email || mapped.email || null;
  mapped.contact_details = {
    ...contactDetails,
    ...(email ? { email } : {})
  };
  mapped.skills = Array.isArray(mapped.skills) ? mapped.skills : [];
  mapped.availability = mapped.availability && typeof mapped.availability === 'object' ? mapped.availability : {};
  mapped.invited = Boolean(mapped.invited);
  mapped.status ||= 'active';
  mapped.active = mapped.active === undefined ? mapped.status === 'active' : Boolean(mapped.active);
  mapped.directory_role = 'staff';
  mapped.permission_bundle = mapped.tenant_membership_permission_bundle
    || mapped.permission_bundle
    || inferLegacyBundle(mapped.role);
  mapped.team_role = mapped.permission_bundle;
  return mapped;
};

const getTenantMembership = async (tenantId, appUserId) => runSingleQuery(
  `SELECT TOP 1 id, tenant_id, app_user_id, role, permission_bundle, status, is_default, createdat, updatedat
   FROM tenant_memberships
   WHERE tenant_id = @tenantId
     AND app_user_id = @appUserId
   ORDER BY createdat ASC`,
  { tenantId, appUserId }
);

export const listTenantTeamMembers = async (tenantId, { search, pageSize = 250 } = {}) => {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 250, 1), 500);
  const params = { tenantId };
  const searchClause = search
    ? `AND (LOWER(COALESCE(au.name, '')) LIKE @search OR LOWER(COALESCE(au.email, '')) LIKE @search)`
    : '';

  if (search) params.search = `%${String(search).trim().toLowerCase()}%`;

  const rows = await runQuery(
    `SELECT TOP (${safePageSize})
       au.*,
       tm_link.id AS tenant_membership_id,
       tm_link.role AS tenant_membership_role,
       tm_link.permission_bundle AS tenant_membership_permission_bundle,
       tm_link.status AS tenant_membership_status,
       tm_link.is_default AS tenant_membership_is_default
     FROM app_users au
     OUTER APPLY (
       SELECT TOP 1 tm.id, tm.role, tm.permission_bundle, tm.status, tm.is_default
       FROM tenant_memberships tm
       WHERE tm.tenant_id = @tenantId
         AND tm.app_user_id = au.id
       ORDER BY CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC
     ) tm_link
     WHERE (
       (
         tm_link.id IS NOT NULL
         AND LOWER(COALESCE(tm_link.status, 'active')) = 'active'
         AND LOWER(COALESCE(tm_link.role, '')) = 'staff'
       )
       OR (
         tm_link.id IS NULL
         AND au.tenant_id = @tenantId
         AND LOWER(COALESCE(au.user_type, '')) = 'staff'
         AND LOWER(COALESCE(au.role, '')) <> 'admin'
       )
     )
     ${searchClause}
     ORDER BY COALESCE(NULLIF(au.name, ''), au.email) ASC, au.createdat ASC`,
    params
  );

  return rows.map(mapTeamRow);
};

export const getTenantTeamMemberById = async (tenantId, appUserId) => {
  const rows = await listTenantTeamMembers(tenantId, { pageSize: 500 });
  return rows.find((row) => String(row.id) === String(appUserId)) || null;
};

const buildProfileUpdates = (payload = {}) => {
  const updates = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (PROFILE_FIELDS.has(key) && value !== undefined) {
      updates[key] = key === 'email' ? normalizeEmail(value) : value;
    }
  });
  return updates;
};

export const createOrAttachTenantTeamMember = async (tenantId, payload = {}) => {
  const email = normalizeEmail(payload.email || payload.contact_details?.email || payload.contactDetails?.email);
  if (!email) {
    const error = new Error('Email is required.');
    error.status = 400;
    error.code = 'TEAM_EMAIL_REQUIRED';
    throw error;
  }

  const bundle = normalizeBundle(payload);
  let user = await findAppUserByEmail(email);
  let created = false;

  if (!user) {
    user = await createAppUser({
      ...payload,
      tenant_id: tenantId,
      email,
      role: 'staff',
      user_type: 'staff'
    });
    created = true;
  } else {
    const updates = buildProfileUpdates({ ...payload, email });
    if (Object.keys(updates).length > 0) {
      user = await updateAppUser(user.id, updates);
    }
  }

  let membership = await getTenantMembership(tenantId, user.id);
  if (membership) {
    const currentRole = normalizeValue(membership.role);
    if (currentRole !== 'staff') {
      const error = new Error('This person already belongs to the organization with a different portal role.');
      error.status = 409;
      error.code = 'TEAM_MEMBERSHIP_ROLE_CONFLICT';
      throw error;
    }

    membership = await updateCanonicalTenantMembership(tenantId, membership.id, {
      role: 'staff',
      permission_bundle: bundle,
      status: 'active',
      is_default: Boolean(membership.is_default)
    });
  } else {
    membership = await createCanonicalTenantMembership(tenantId, {
      app_user_id: user.id,
      role: 'staff',
      permission_bundle: bundle,
      status: 'active',
      is_default: created
    });
  }

  return {
    data: await getTenantTeamMemberById(tenantId, user.id) || mapTeamRow(user),
    created,
    attached: !created,
    membership_id: membership?.id || null
  };
};

export const updateTenantTeamMember = async (tenantId, appUserId, payload = {}) => {
  const current = await getTenantTeamMemberById(tenantId, appUserId);
  if (!current) return null;

  const updates = buildProfileUpdates(payload);
  if (Object.keys(updates).length > 0) {
    await updateAppUser(appUserId, updates);
  }

  const membership = await getTenantMembership(tenantId, appUserId);
  if (membership) {
    const bundle = normalizeBundle(payload, current.permission_bundle || current.role);
    await updateCanonicalTenantMembership(tenantId, membership.id, {
      role: 'staff',
      permission_bundle: bundle,
      status: payload.membership_status || membership.status || 'active',
      is_default: Boolean(membership.is_default)
    });
  }

  return getTenantTeamMemberById(tenantId, appUserId);
};
