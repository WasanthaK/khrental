import { runQuery, runSingleQuery } from './query.js';
import {
  createAppUser,
  createTenantMembership,
  findAppUserByEmail,
  updateTenantMembershipById
} from './repositories.js';

const JSON_FIELDS = new Set(['contact_details', 'associated_property_ids', 'skills', 'availability']);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();

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

const mapRenteeRow = (row) => {
  if (!row) {
    return null;
  }

  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    mapped[key] = JSON_FIELDS.has(key) ? parseJsonValue(value) : value;
  });

  mapped.contact_details ??= null;
  mapped.associated_property_ids ??= [];
  mapped.skills ??= [];
  mapped.availability ??= null;
  mapped.invited = Boolean(mapped.invited);
  mapped.status ||= 'active';
  mapped.active = mapped.active === undefined ? mapped.status === 'active' : Boolean(mapped.active);

  // This is a tenant-directory projection. Membership role is authoritative for
  // the relationship even when the same global identity is staff elsewhere.
  mapped.directory_role = 'rentee';
  return mapped;
};

const getTenantMembership = async (tenantId, appUserId) => runSingleQuery(
  `SELECT TOP 1 id, tenant_id, app_user_id, role, status, is_default, createdat, updatedat
   FROM tenant_memberships
   WHERE tenant_id = @tenantId
     AND app_user_id = @appUserId
   ORDER BY createdat ASC`,
  { tenantId, appUserId }
);

const isRenteeMembership = (membership) => {
  const role = normalizeRole(membership?.role);
  return role === 'rentee' || role === 'tenant';
};

const seedLegacyDefaultMembership = async (user, currentTenantId) => {
  const legacyTenantId = user?.tenant_id;
  if (!legacyTenantId || legacyTenantId === currentTenantId) {
    return;
  }

  const existing = await getTenantMembership(legacyTenantId, user.id);
  if (existing) {
    return;
  }

  await createTenantMembership(legacyTenantId, {
    app_user_id: user.id,
    role: user.role || (normalizeRole(user.user_type) === 'rentee' ? 'rentee' : 'staff'),
    status: 'active',
    is_default: true
  });
};

export const listTenantRentees = async (tenantId, { search, pageSize = 250 } = {}) => {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 250, 1), 500);
  const params = { tenantId };
  const searchClause = search
    ? `AND (LOWER(COALESCE(au.name, '')) LIKE @search OR LOWER(COALESCE(au.email, '')) LIKE @search)`
    : '';

  if (search) {
    params.search = `%${String(search).trim().toLowerCase()}%`;
  }

  const rows = await runQuery(
    `SELECT TOP (${safePageSize})
       au.*,
       tm_link.id AS tenant_membership_id,
       tm_link.role AS tenant_membership_role,
       tm_link.status AS tenant_membership_status,
       tm_link.is_default AS tenant_membership_is_default
     FROM app_users au
     OUTER APPLY (
       SELECT TOP 1 tm.id, tm.role, tm.status, tm.is_default
       FROM tenant_memberships tm
       WHERE tm.tenant_id = @tenantId
         AND tm.app_user_id = au.id
         AND tm.status = 'active'
       ORDER BY CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC
     ) tm_link
     WHERE (
       (
         au.tenant_id = @tenantId
         AND (
           LOWER(COALESCE(au.user_type, '')) = 'rentee'
           OR LOWER(COALESCE(au.role, '')) = 'rentee'
         )
       )
       OR (
         tm_link.id IS NOT NULL
         AND LOWER(COALESCE(tm_link.role, '')) IN ('rentee', 'tenant')
       )
     )
     ${searchClause}
     ORDER BY COALESCE(NULLIF(au.name, ''), au.email) ASC, au.createdat ASC`,
    params
  );

  return rows.map(mapRenteeRow);
};

export const getTenantRenteeById = async (tenantId, appUserId) => {
  const rows = await listTenantRentees(tenantId, { pageSize: 500 });
  return rows.find((row) => String(row.id) === String(appUserId)) || null;
};

export const createOrAttachTenantRentee = async (tenantId, payload = {}) => {
  const email = normalizeEmail(payload.email || payload.contact_details?.email || payload.contactDetails?.email);
  if (!email) {
    const error = new Error('Email is required.');
    error.status = 400;
    error.code = 'RENTEE_EMAIL_REQUIRED';
    throw error;
  }

  let user = await findAppUserByEmail(email);
  let created = false;

  if (!user) {
    user = await createAppUser({
      ...payload,
      tenant_id: tenantId,
      email,
      role: 'rentee',
      user_type: 'rentee'
    });
    created = true;
  } else {
    // Older renter rows were intentionally not given memberships during the
    // multi-tenant backfill. Preserve their original organization before
    // attaching the same identity to another organization.
    await seedLegacyDefaultMembership(user, tenantId);
  }

  let membership = await getTenantMembership(tenantId, user.id);
  if (membership) {
    if (!isRenteeMembership(membership)) {
      const error = new Error('This person already belongs to the selected organization with a different portal role.');
      error.status = 409;
      error.code = 'RENTEE_MEMBERSHIP_ROLE_CONFLICT';
      throw error;
    }

    if (normalizeRole(membership.status) !== 'active') {
      membership = await updateTenantMembershipById(tenantId, membership.id, {
        role: 'rentee',
        status: 'active',
        is_default: Boolean(membership.is_default)
      });
    }
  } else {
    membership = await createTenantMembership(tenantId, {
      app_user_id: user.id,
      role: 'rentee',
      status: 'active',
      // New identities should resolve to the organization that created them.
      // Existing identities retain their current default membership.
      is_default: created
    });
  }

  const projected = await getTenantRenteeById(tenantId, user.id);
  return {
    data: projected || mapRenteeRow(user),
    created,
    attached: !created,
    membership_id: membership?.id || null
  };
};
