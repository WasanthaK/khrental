import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS } from './permissionEngine.js';

const STAFF_ROLES = new Set([
  'staff',
  'manager',
  'finance_staff',
  'maintenance_staff',
  'maintenance',
  'supervisor'
]);

const createRequestError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const requireAssignmentPermission = (req) => {
  authorizePermission(
    { user: req.user, membership: req.membership },
    PERMISSIONS.PROPERTY_ASSIGNMENTS_MANAGE
  );
};

const requireProperty = async (tenantId, propertyId) => {
  if (!propertyId) {
    throw createRequestError(400, 'propertyId is required.', 'PROPERTY_ID_REQUIRED');
  }

  const property = await runSingleQuery(
    `SELECT TOP 1 id, name
     FROM properties
     WHERE tenant_id = @tenantId
       AND id = @propertyId`,
    { tenantId, propertyId }
  );

  if (!property) {
    throw createRequestError(404, 'The property was not found in the active tenant.', 'PROPERTY_NOT_FOUND');
  }

  return property;
};

const loadActiveStaffMembership = async (tenantId, staffUserId) => runSingleQuery(
  `SELECT TOP 1 tm.id, tm.role, tm.status, au.name, au.email
   FROM tenant_memberships tm
   INNER JOIN app_users au ON au.id = tm.app_user_id
   WHERE tm.tenant_id = @tenantId
     AND tm.app_user_id = @staffUserId
     AND tm.status = 'active'`,
  { tenantId, staffUserId }
);

const repairMissingStaffMembership = async (tenantId, staffUserId) => {
  const appUser = await runSingleQuery(
    `SELECT TOP 1 id, role, user_type, status, name, email
     FROM app_users
     WHERE tenant_id = @tenantId
       AND id = @staffUserId`,
    { tenantId, staffUserId }
  );

  if (!appUser) {
    return null;
  }

  const userType = String(appUser.user_type || '').trim().toLowerCase();
  const role = String(appUser.role || '').trim().toLowerCase();
  const status = String(appUser.status || 'active').trim().toLowerCase();

  if (userType !== 'staff' || status !== 'active' || !STAFF_ROLES.has(role)) {
    return null;
  }

  await runQuery(
    `IF NOT EXISTS (
       SELECT 1
       FROM tenant_memberships
       WHERE tenant_id = @tenantId
         AND app_user_id = @staffUserId
     )
     BEGIN
       INSERT INTO tenant_memberships (
         id,
         tenant_id,
         app_user_id,
         role,
         status,
         is_default,
         createdat,
         updatedat
       )
       VALUES (
         NEWID(),
         @tenantId,
         @staffUserId,
         @role,
         'active',
         CASE
           WHEN EXISTS (
             SELECT 1
             FROM tenant_memberships
             WHERE app_user_id = @staffUserId
               AND status = 'active'
           ) THEN 0
           ELSE 1
         END,
         SYSUTCDATETIME(),
         SYSUTCDATETIME()
       );
     END`,
    { tenantId, staffUserId, role }
  );

  return loadActiveStaffMembership(tenantId, staffUserId);
};

const requireStaffMembership = async (tenantId, staffUserId) => {
  if (!staffUserId) {
    throw createRequestError(400, 'staffUserId is required.', 'STAFF_USER_ID_REQUIRED');
  }

  let membership = await loadActiveStaffMembership(tenantId, staffUserId);

  if (!membership) {
    membership = await repairMissingStaffMembership(tenantId, staffUserId);
  }

  if (!membership || !STAFF_ROLES.has(String(membership.role || '').trim().toLowerCase())) {
    throw createRequestError(
      400,
      'The selected user must have an active staff membership in the active tenant.',
      'ACTIVE_STAFF_MEMBERSHIP_REQUIRED'
    );
  }

  return membership;
};

export const createPropertyAssignmentsRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'staff-property-assignments'
  }));

  router.get('/', async (req, res, next) => {
    try {
      requireAssignmentPermission(req);
      const staffUserId = String(req.query?.staffUserId || req.query?.staff_user_id || '').trim() || null;
      const propertyId = String(req.query?.propertyId || req.query?.propertyid || '').trim() || null;
      const status = String(req.query?.status || '').trim().toLowerCase() || null;

      const rows = await runQuery(
        `SELECT
           spa.*,
           au.name AS staff_name,
           au.email AS staff_email,
           p.name AS property_name
         FROM staff_property_assignments spa
         INNER JOIN app_users au ON au.id = spa.staff_user_id
         INNER JOIN properties p ON p.id = spa.propertyid
         WHERE spa.tenant_id = @tenantId
           AND (@staffUserId IS NULL OR spa.staff_user_id = @staffUserId)
           AND (@propertyId IS NULL OR spa.propertyid = @propertyId)
           AND (@status IS NULL OR spa.status = @status)
         ORDER BY spa.createdat DESC`,
        {
          tenantId: req.tenantId,
          staffUserId,
          propertyId,
          status
        }
      );

      res.json({ data: rows, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    try {
      requireAssignmentPermission(req);
      const propertyId = req.body?.propertyId || req.body?.propertyid;
      const staffUserId = req.body?.staffUserId || req.body?.staff_user_id;
      const notes = req.body?.notes == null ? null : String(req.body.notes);

      await requireProperty(req.tenantId, propertyId);
      await requireStaffMembership(req.tenantId, staffUserId);

      const existing = await runSingleQuery(
        `SELECT TOP 1 *
         FROM staff_property_assignments
         WHERE tenant_id = @tenantId
           AND propertyid = @propertyId
           AND staff_user_id = @staffUserId`,
        { tenantId: req.tenantId, propertyId, staffUserId }
      );

      let assignment;
      if (existing) {
        assignment = await runSingleQuery(
          `UPDATE staff_property_assignments
           SET status = 'active',
               endedat = NULL,
               notes = @notes,
               assigned_by = @assignedBy,
               assignedat = SYSUTCDATETIME(),
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE id = @id
             AND tenant_id = @tenantId`,
          {
            id: existing.id,
            tenantId: req.tenantId,
            notes,
            assignedBy: req.user.id
          }
        );
      } else {
        assignment = await runSingleQuery(
          `INSERT INTO staff_property_assignments
             (tenant_id, propertyid, staff_user_id, status, assigned_by, notes)
           OUTPUT INSERTED.*
           VALUES
             (@tenantId, @propertyId, @staffUserId, 'active', @assignedBy, @notes)`,
          {
            tenantId: req.tenantId,
            propertyId,
            staffUserId,
            assignedBy: req.user.id,
            notes
          }
        );
      }

      res.status(existing ? 200 : 201).json({ data: assignment, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/:assignmentId', async (req, res, next) => {
    try {
      requireAssignmentPermission(req);
      const assignmentId = req.params.assignmentId;
      const status = req.body?.status == null ? null : String(req.body.status).trim().toLowerCase();
      const notesProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'notes');
      const notes = notesProvided && req.body.notes != null ? String(req.body.notes) : null;

      if (status && !['active', 'inactive'].includes(status)) {
        throw createRequestError(400, 'status must be active or inactive.', 'INVALID_ASSIGNMENT_STATUS');
      }

      if (!status && !notesProvided) {
        throw createRequestError(400, 'Provide status and/or notes to update.', 'ASSIGNMENT_UPDATE_REQUIRED');
      }

      const assignment = await runSingleQuery(
        `UPDATE staff_property_assignments
         SET status = COALESCE(@status, status),
             notes = CASE WHEN @notesProvided = 1 THEN @notes ELSE notes END,
             endedat = CASE
               WHEN @status = 'inactive' THEN SYSUTCDATETIME()
               WHEN @status = 'active' THEN NULL
               ELSE endedat
             END,
             updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.*
         WHERE id = @assignmentId
           AND tenant_id = @tenantId`,
        {
          assignmentId,
          tenantId: req.tenantId,
          status,
          notes,
          notesProvided: notesProvided ? 1 : 0
        }
      );

      if (!assignment) {
        throw createRequestError(404, 'Property assignment not found.', 'PROPERTY_ASSIGNMENT_NOT_FOUND');
      }

      res.json({ data: assignment, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:assignmentId', async (req, res, next) => {
    try {
      requireAssignmentPermission(req);
      const deleted = await runSingleQuery(
        `DELETE FROM staff_property_assignments
         OUTPUT DELETED.*
         WHERE id = @assignmentId
           AND tenant_id = @tenantId`,
        { assignmentId: req.params.assignmentId, tenantId: req.tenantId }
      );

      if (!deleted) {
        throw createRequestError(404, 'Property assignment not found.', 'PROPERTY_ASSIGNMENT_NOT_FOUND');
      }

      res.json({ data: deleted, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
