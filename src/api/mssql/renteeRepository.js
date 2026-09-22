import { getMssqlPool, sql } from './pool.js';
import { runQuery, runSingleQuery } from './query.js';
import {
  createAppUser,
  createTenantMembership,
  findAppUserByEmail,
  updateAppUser,
  updateTenantMembershipById
} from './repositories.js';

const JSON_FIELDS = new Set([
  'contact_details',
  'associated_property_ids',
  'associated_properties',
  'skills',
  'availability'
]);
const RENTEE_PROFILE_FIELDS = new Set([
  'name',
  'email',
  'contact_details',
  'id_copy_url',
  'national_id',
  'permanent_address',
  'profile_image_url'
]);
const RENTEE_STATUSES = new Set(['active', 'inactive']);
const UNIQUE_IDENTIFIER_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const isUniqueIdentifier = (value) => UNIQUE_IDENTIFIER_REGEX.test(String(value || '').trim());

const createRenteeError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

export const normalizeRenteeStatus = (value, fallback = 'active') => {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (!RENTEE_STATUSES.has(normalized)) {
    throw createRenteeError(
      400,
      'Renter status must be active or inactive.',
      'RENTEE_INVALID_STATUS'
    );
  }
  return normalized;
};

const normalizeDirectoryStatus = (value) => {
  const normalized = String(value || 'active').trim().toLowerCase();
  if (normalized === 'all') return 'all';
  return normalizeRenteeStatus(normalized);
};

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

const normalizeAssignmentPayload = (payload = {}) => {
  const hasStructured = Object.prototype.hasOwnProperty.call(payload, 'associated_properties')
    || Object.prototype.hasOwnProperty.call(payload, 'associatedProperties');
  const hasLegacy = Object.prototype.hasOwnProperty.call(payload, 'associated_property_ids')
    || Object.prototype.hasOwnProperty.call(payload, 'associatedPropertyIds');

  if (!hasStructured && !hasLegacy) {
    return null;
  }

  const structured = payload.associated_properties ?? payload.associatedProperties;
  const source = Array.isArray(structured)
    ? structured
    : (Array.isArray(payload.associated_property_ids ?? payload.associatedPropertyIds)
      ? (payload.associated_property_ids ?? payload.associatedPropertyIds).map((propertyId) => ({ propertyId, unitId: null }))
      : []);

  const unique = new Map();
  source.forEach((assignment) => {
    const propertyId = String(assignment?.propertyId ?? assignment?.property_id ?? '').trim();
    const unitIdValue = assignment?.unitId ?? assignment?.unit_id ?? null;
    const unitId = unitIdValue ? String(unitIdValue).trim() : null;

    if (!isUniqueIdentifier(propertyId) || (unitId && !isUniqueIdentifier(unitId))) {
      throw createRenteeError(
        400,
        'Renter property assignments must reference valid property and unit IDs.',
        'RENTEE_PROPERTY_ASSIGNMENT_INVALID_ID'
      );
    }

    unique.set(`${propertyId}:${unitId || ''}`, { propertyId, unitId });
  });

  return Array.from(unique.values());
};

const validateTenantAssignments = async (tenantId, assignments) => {
  for (const assignment of assignments) {
    const property = await runSingleQuery(
      `SELECT TOP 1 id
       FROM dbo.properties
       WHERE id = @propertyId
         AND tenant_id = @tenantId`,
      { tenantId, propertyId: assignment.propertyId }
    );

    if (!property) {
      throw createRenteeError(
        400,
        'A selected property does not belong to the active organization.',
        'RENTEE_PROPERTY_OUTSIDE_TENANT'
      );
    }

    if (assignment.unitId) {
      const unit = await runSingleQuery(
        `SELECT TOP 1 id
         FROM dbo.property_units
         WHERE id = @unitId
           AND propertyid = @propertyId
           AND tenant_id = @tenantId`,
        {
          tenantId,
          propertyId: assignment.propertyId,
          unitId: assignment.unitId
        }
      );

      if (!unit) {
        throw createRenteeError(
          400,
          'A selected unit does not belong to the selected property in the active organization.',
          'RENTEE_UNIT_OUTSIDE_PROPERTY'
        );
      }
    }
  }
};

const replaceTenantAssignments = async (tenantId, appUserId, assignments) => {
  if (assignments === null) return;

  await validateTenantAssignments(tenantId, assignments);

  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

  try {
    const removeRequest = new sql.Request(transaction);
    removeRequest.input('tenantId', sql.UniqueIdentifier, tenantId);
    removeRequest.input('appUserId', sql.UniqueIdentifier, appUserId);
    await removeRequest.query(`
      DELETE FROM dbo.rentee_property_assignments
      WHERE tenant_id = @tenantId
        AND app_user_id = @appUserId;
    `);

    for (const assignment of assignments) {
      const insertRequest = new sql.Request(transaction);
      insertRequest.input('tenantId', sql.UniqueIdentifier, tenantId);
      insertRequest.input('appUserId', sql.UniqueIdentifier, appUserId);
      insertRequest.input('propertyId', sql.UniqueIdentifier, assignment.propertyId);
      insertRequest.input('unitId', sql.UniqueIdentifier, assignment.unitId || null);
      await insertRequest.query(`
        INSERT INTO dbo.rentee_property_assignments (
          tenant_id,
          app_user_id,
          propertyid,
          unitid
        )
        VALUES (
          @tenantId,
          @appUserId,
          @propertyId,
          @unitId
        );
      `);
    }

    await transaction.commit();
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (_rollbackError) {
      // The transaction may already be closed after a database-level failure.
    }
    throw error;
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

  mapped.associated_properties = Array.isArray(mapped.associated_properties)
    ? mapped.associated_properties
    : [];
  mapped.associated_property_ids = [...new Set(
    mapped.associated_properties
      .map((assignment) => assignment?.propertyId || assignment?.propertyid)
      .filter(Boolean)
  )];
  mapped.skills ??= [];
  mapped.availability ??= null;
  mapped.invited = Boolean(mapped.invited);

  mapped.global_status = mapped.status || 'active';
  mapped.status = mapped.tenant_membership_status || 'active';
  mapped.active = mapped.status === 'active';

  // This is an organization-scoped directory projection. Membership role and
  // status are authoritative even when the same global identity has another
  // relationship with another organization.
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

export const listTenantRentees = async (
  tenantId,
  { search, pageSize = 250, status = 'active' } = {}
) => {
  const safePageSize = Math.min(Math.max(Number(pageSize) || 250, 1), 500);
  const directoryStatus = normalizeDirectoryStatus(status);
  const params = { tenantId, directoryStatus };
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
       tm_link.is_default AS tenant_membership_is_default,
       (
         SELECT
           assignment.propertyid AS propertyId,
           assignment.unitid AS unitId
         FROM dbo.rentee_property_assignments assignment
         WHERE assignment.tenant_id = @tenantId
           AND assignment.app_user_id = au.id
         ORDER BY assignment.createdat ASC, assignment.id ASC
         FOR JSON PATH
       ) AS associated_properties
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
         AND (@directoryStatus = 'all' OR LOWER(COALESCE(tm_link.status, 'active')) = @directoryStatus)
       )
       OR (
         tm_link.id IS NULL
         AND au.tenant_id = @tenantId
         AND (
           LOWER(COALESCE(au.user_type, '')) = 'rentee'
           OR LOWER(COALESCE(au.role, '')) = 'rentee'
         )
         AND (@directoryStatus = 'all' OR @directoryStatus = 'active')
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

  const profileUpdates = buildProfileUpdates(payload);
  if (Object.keys(profileUpdates).length > 0) {
    await updateAppUser(appUserId, profileUpdates);
  }

  if (payload.status !== undefined) {
    const nextStatus = normalizeRenteeStatus(payload.status, current.status);
    let membership = await getTenantMembership(tenantId, appUserId);

    if (!membership) {
      membership = await createTenantMembership(tenantId, {
        app_user_id: appUserId,
        role: 'rentee',
        status: nextStatus,
        is_default: false
      });
    } else {
      if (!isRenteeMembership(membership)) {
        throw createRenteeError(
          409,
          'This person belongs to the active organization with a different portal role.',
          'RENTEE_MEMBERSHIP_ROLE_CONFLICT'
        );
      }

      await updateTenantMembershipById(tenantId, membership.id, {
        role: 'rentee',
        status: nextStatus,
        is_default: Boolean(membership.is_default) && nextStatus === 'active'
      });
    }
  }

  const assignments = normalizeAssignmentPayload(payload);
  await replaceTenantAssignments(tenantId, appUserId, assignments);

  return getTenantRenteeById(tenantId, appUserId);
};

export const createOrAttachTenantRentee = async (tenantId, payload = {}) => {
  const email = normalizeEmail(payload.email || payload.contact_details?.email || payload.contactDetails?.email);
  if (!email) {
    throw createRenteeError(400, 'Email is required.', 'RENTEE_EMAIL_REQUIRED');
  }

  const requestedStatus = normalizeRenteeStatus(payload.status || 'active');
  const profile = buildProfileUpdates({ ...payload, email });
  const assignments = normalizeAssignmentPayload(payload);
  let user = await findAppUserByEmail(email);
  let created = false;

  if (!user) {
    user = await createAppUser({
      ...profile,
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

    // Apply only global identity/profile fields here. Organization status and
    // property/unit relationships belong to the tenant membership/assignment
    // records below and must not leak across organizations.
    if (Object.keys(profile).length > 0) {
      user = await updateAppUser(user.id, profile);
    }
  }

  let membership = await getTenantMembership(tenantId, user.id);
  if (membership) {
    if (!isRenteeMembership(membership)) {
      throw createRenteeError(
        409,
        'This person already belongs to the selected organization with a different portal role.',
        'RENTEE_MEMBERSHIP_ROLE_CONFLICT'
      );
    }

    if (normalizeRole(membership.status) !== requestedStatus) {
      membership = await updateTenantMembershipById(tenantId, membership.id, {
        role: 'rentee',
        status: requestedStatus,
        is_default: Boolean(membership.is_default) && requestedStatus === 'active'
      });
    }
  } else {
    membership = await createTenantMembership(tenantId, {
      app_user_id: user.id,
      role: 'rentee',
      status: requestedStatus,
      // New identities should resolve to the organization that created them.
      // Existing identities retain their current default membership.
      is_default: created && requestedStatus === 'active'
    });
  }

  await replaceTenantAssignments(tenantId, user.id, assignments);

  const projected = await getTenantRenteeById(tenantId, user.id);
  return {
    data: projected || mapRenteeRow(user),
    created,
    attached: !created,
    membership_id: membership?.id || null
  };
};
