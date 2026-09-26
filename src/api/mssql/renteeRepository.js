import { runQuery, runSingleQuery } from './query.js';
import {
  createAppUser,
  createTenantMembership,
  findAppUserByEmail,
  updateAppUser,
  updateTenantMembershipById
} from './repositories.js';

const JSON_FIELDS = new Set(['contact_details', 'associated_property_ids', 'skills', 'availability']);
const RENTEE_PROFILE_FIELDS = new Set([
  'name',
  'email',
  'contact_details',
  'id_copy_url',
  'associated_property_ids',
  'national_id',
  'permanent_address',
  'profile_image_url',
  'status'
]);

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const buildProfileUpdates = (payload = {}) => {
  const updates = {};

  Object.entries(payload || {}).forEach(([key, value]) => {
    if (RENTEE_PROFILE_FIELDS.has(key) && value !== undefined) {
      updates[key] = key === 'email' ? normalizeEmail(value) : value;
    }
  });

  return updates;
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

const mapRenteeRow = (row) => {
  if (!row) {
    return null;
  }

  const mapped = {};
  Object.entries(row).forEach(([key, value]) => {
    mapped[key] = JSON_FIELDS.has(key) ? parseJsonValue(value) : value;
  });

  const existingContactDetails = mapped.contact_details && typeof mapped.contact_details === 'object'
    ? mapped.contact_details
    : {};
  const canonicalEmail = normalizeEmail(mapped.email || existingContactDetails.email);

  if (canonicalEmail) {
    mapped.email = canonicalEmail;
    mapped.contact_details = {
      ...existingContactDetails,
      email: canonicalEmail
    };
  } else {
    mapped.contact_details = existingContactDetails;
  }

  mapped.associated_property_ids ??= [];
  mapped.skills ??= [];
  mapped.availability ??= null;
  mapped.invited = Boolean(mapped.invited);
  mapped.status ||= 'active';
  mapped.active = mapped.active === undefined ? mapped.status === 'active' : Boolean(mapped.active);

  // This is an organization-scoped directory projection. Membership role is
  // authoritative even when the same global identity has another role elsewhere.
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

export const isRenteeMembership = (membership) => {
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

export const listTenantRentees = async (tenantId, { search, pageSize = 250, status = 'active' } = {}) => {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 250, 1), 500);
  const normalizedStatus = normalizeRole(status);
  if (!['active', 'inactive', 'all'].includes(normalizedStatus)) {
    const error = new Error('Renter status filter must be active, inactive, or all.');
    error.status = 400;
    error.code = 'RENTEE_STATUS_FILTER_INVALID';
    throw error;
  }

  const params = { tenantId };
  const membershipStatusClause = normalizedStatus === 'all'
    ? ''
    : `AND LOWER(COALESCE(tm_link.status, 'active')) = @membershipStatus`;
  const legacyStatusClause = normalizedStatus === 'all'
    ? ''
    : `AND LOWER(COALESCE(au.status, 'active')) = @membershipStatus`;

  if (normalizedStatus !== 'all') {
    params.membershipStatus = normalizedStatus;
  }
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
       ORDER BY CASE WHEN tm.is_default = 1 THEN 0 ELSE 1 END, tm.createdat ASC
     ) tm_link
     WHERE (
       (
         tm_link.id IS NOT NULL
         AND LOWER(COALESCE(tm_link.role, '')) IN ('rentee', 'tenant')
         ${membershipStatusClause}
       )
       OR (
         tm_link.id IS NULL
         AND au.tenant_id = @tenantId
         AND (
           LOWER(COALESCE(au.user_type, '')) = 'rentee'
           OR LOWER(COALESCE(au.role, '')) = 'rentee'
         )
         ${legacyStatusClause}
       )
     )
     ${searchClause}
     ORDER BY COALESCE(NULLIF(au.name, ''), au.email) ASC, au.createdat ASC`,
    params
  );

  return rows.map(mapRenteeRow);
};

export const getTenantRenteeById = async (tenantId, appUserId) => {
  const rows = await listTenantRentees(tenantId, { pageSize: 500, status: 'all' });
  return rows.find((row) => String(row.id) === String(appUserId)) || null;
};

export const updateTenantRentee = async (tenantId, appUserId, payload = {}) => {
  const current = await getTenantRenteeById(tenantId, appUserId);
  if (!current) {
    return null;
  }

  const updates = buildProfileUpdates(payload);
  if (Object.keys(updates).length === 0) {
    return current;
  }

  await updateAppUser(appUserId, updates);
  return getTenantRenteeById(tenantId, appUserId);
};

export const updateTenantRenteeMembershipStatus = async (tenantId, appUserId, status) => {
  const normalizedStatus = normalizeRole(status);
  if (!['active', 'inactive'].includes(normalizedStatus)) {
    const error = new Error('Renter membership status must be active or inactive.');
    error.status = 400;
    error.code = 'RENTEE_MEMBERSHIP_STATUS_INVALID';
    throw error;
  }

  const current = await getTenantRenteeById(tenantId, appUserId);
  if (!current) {
    return null;
  }

  let membership = await getTenantMembership(tenantId, appUserId);
  if (membership) {
    if (!isRenteeMembership(membership)) {
      const error = new Error('This person belongs to the selected organization with a different portal role.');
      error.status = 409;
      error.code = 'RENTEE_MEMBERSHIP_ROLE_CONFLICT';
      throw error;
    }

    membership = await updateTenantMembershipById(tenantId, membership.id, {
      role: 'rentee',
      status: normalizedStatus,
      is_default: Boolean(membership.is_default)
    });
  } else {
    // Compatibility for a legacy renter whose organization relationship still
    // exists only through app_users.tenant_id. Create the canonical membership
    // rather than mutating the global identity status.
    membership = await createTenantMembership(tenantId, {
      app_user_id: appUserId,
      role: 'rentee',
      status: normalizedStatus,
      is_default: normalizedStatus === 'active'
    });
  }

  return {
    data: await getTenantRenteeById(tenantId, appUserId),
    membership
  };
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
    // Preserve any legacy/default organization before the same global identity
    // gains another organization membership.
    await seedLegacyDefaultMembership(user, tenantId);

    // Attach must behave like the business-level create operation. Apply the
    // submitted renter profile to the reused global identity instead of merely
    // creating a membership and returning stale/missing profile data.
    const profileUpdates = buildProfileUpdates({ ...payload, email });
    if (Object.keys(profileUpdates).length > 0) {
      user = await updateAppUser(user.id, profileUpdates);
    }
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
