import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import {
  PERMISSIONS,
  hasPermission,
  isAdminRole,
  isTenantRole
} from './permissionEngine.js';
import {
  MAINTENANCE_STATUS,
  assertMaintenanceTransition,
  canTenantCancelMaintenance
} from './maintenanceLifecycle.js';

const createRequestError = (status, message, code, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const bindParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

const queryTransaction = async (transaction, queryText, params = {}) => {
  const request = bindParams(new sql.Request(transaction), params);
  const result = await request.query(queryText);
  return result.recordset || [];
};

const singleTransaction = async (transaction, queryText, params = {}) => {
  const rows = await queryTransaction(transaction, queryText, params);
  return rows[0] || null;
};

const isManager = (req) => hasPermission(
  { user: req.user, membership: req.membership },
  PERMISSIONS.MAINTENANCE_MANAGE
);

const canUpdateAssigned = (req) => hasPermission(
  { user: req.user, membership: req.membership },
  PERMISSIONS.MAINTENANCE_UPDATE_ASSIGNED
);

const requireManager = (req) => {
  if (!isManager(req)) {
    throw createRequestError(403, 'Maintenance management permission is required.', 'MAINTENANCE_MANAGE_REQUIRED');
  }
};

const hasPropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return true;
  return (req.membership?.assignedPropertyIds || []).some((id) => String(id) === String(propertyId));
};

const loadRequest = async (tenantId, requestId) => {
  const request = await runSingleQuery(
    `SELECT TOP 1 mr.*,
            p.name AS property_name, p.address AS property_address,
            au.name AS rentee_name, au.email AS rentee_email,
            assigned.name AS assigned_name
     FROM maintenance_requests mr
     LEFT JOIN properties p ON p.id = mr.propertyid AND p.tenant_id = mr.tenant_id
     LEFT JOIN app_users au ON au.id = mr.renteeid AND au.tenant_id = mr.tenant_id
     LEFT JOIN app_users assigned ON assigned.id = mr.assignedto AND assigned.tenant_id = mr.tenant_id
     WHERE mr.tenant_id = @tenantId AND mr.id = @requestId`,
    { tenantId, requestId }
  );
  if (!request) throw createRequestError(404, 'Maintenance request not found.', 'MAINTENANCE_REQUEST_NOT_FOUND');
  return request;
};

const assertReadAccess = (req, request) => {
  if (isTenantRole({ user: req.user, membership: req.membership })) {
    if (String(request.renteeid || '') !== String(req.user?.id || '')) {
      throw createRequestError(403, 'This maintenance request does not belong to the current tenant.', 'RESOURCE_ACCESS_DENIED');
    }
    return;
  }

  if (isManager(req) && hasPropertyScope(req, request.propertyid)) return;
  if (canUpdateAssigned(req) && String(request.assignedto || '') === String(req.user?.id || '')) return;
  throw createRequestError(403, 'This maintenance request is outside the current assignment scope.', 'RESOURCE_ACCESS_DENIED');
};

const insertEvent = async (transaction, {
  tenantId,
  requestId,
  eventType,
  fromStatus = null,
  toStatus = null,
  actorUserId = null,
  metadata = null
}) => {
  await queryTransaction(
    transaction,
    `INSERT INTO maintenance_lifecycle_events (
       tenant_id, maintenance_request_id, event_type, from_status, to_status, actor_user_id, metadata
     ) VALUES (
       @tenantId, @requestId, @eventType, @fromStatus, @toStatus, @actorUserId, @metadata
     )`,
    {
      tenantId,
      requestId,
      eventType,
      fromStatus,
      toStatus,
      actorUserId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  );
};

const loadProjection = async (req, requestId) => {
  const request = await loadRequest(req.tenantId, requestId);
  assertReadAccess(req, request);
  const isTenant = isTenantRole({ user: req.user, membership: req.membership });
  const [comments, images, events] = await Promise.all([
    runQuery(
      `SELECT c.*, u.name AS user_name
       FROM maintenance_request_comments c
       LEFT JOIN app_users u ON u.id = c.user_id AND u.tenant_id = c.tenant_id
       WHERE c.tenant_id = @tenantId
         AND c.maintenance_request_id = @requestId
         ${isTenant ? 'AND c.is_internal = 0' : ''}
       ORDER BY c.created_at`,
      { tenantId: req.tenantId, requestId }
    ),
    runQuery(
      `SELECT * FROM maintenance_request_images
       WHERE tenant_id = @tenantId AND maintenance_request_id = @requestId
       ORDER BY uploaded_at`,
      { tenantId: req.tenantId, requestId }
    ),
    runQuery(
      `SELECT * FROM maintenance_lifecycle_events
       WHERE tenant_id = @tenantId AND maintenance_request_id = @requestId
       ORDER BY createdat`,
      { tenantId: req.tenantId, requestId }
    )
  ]);
  return { request, comments, images, events };
};

export const createMaintenanceLifecycleRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'maintenance-lifecycle'
  }));

  router.post('/requests', async (req, res, next) => {
    try {
      if (!isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant portal access is required to submit a maintenance request.', 'TENANT_PORTAL_REQUIRED');
      }
      const title = String(req.body?.title || '').trim();
      const description = String(req.body?.description || '').trim();
      const propertyId = req.body?.propertyid || req.body?.propertyId || null;
      if (!title || !description || !propertyId) {
        throw createRequestError(400, 'title, description and propertyId are required.', 'INVALID_MAINTENANCE_REQUEST');
      }

      const agreement = await runSingleQuery(
        `SELECT TOP 1 id, propertyid, unitid
         FROM agreements
         WHERE tenant_id = @tenantId
           AND renteeid = @renteeId
           AND propertyid = @propertyId
           AND status = 'active'
         ORDER BY activated_at DESC, startdate DESC`,
        { tenantId: req.tenantId, renteeId: req.user.id, propertyId }
      );
      if (!agreement) {
        throw createRequestError(409, 'An active tenancy for the selected property is required.', 'ACTIVE_TENANCY_REQUIRED');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const created = await singleTransaction(
          transaction,
          `INSERT INTO maintenance_requests (
             tenant_id, propertyid, renteeid, agreementid, unitid,
             title, description, priority, status, requesttype, notes
           ) OUTPUT INSERTED.*
           VALUES (
             @tenantId, @propertyId, @renteeId, @agreementId, @unitId,
             @title, @description, @priority, 'pending', @requestType, @notes
           )`,
          {
            tenantId: req.tenantId,
            propertyId: agreement.propertyid,
            renteeId: req.user.id,
            agreementId: agreement.id,
            unitId: agreement.unitid || null,
            title,
            description,
            priority: req.body?.priority || 'medium',
            requestType: req.body?.requesttype || req.body?.requestType || 'other',
            notes: req.body?.notes || null
          }
        );
        await insertEvent(transaction, {
          tenantId: req.tenantId,
          requestId: created.id,
          eventType: 'request_created',
          toStatus: MAINTENANCE_STATUS.PENDING,
          actorUserId: req.user.id,
          metadata: { agreementId: agreement.id, unitId: agreement.unitid || null }
        });
        await transaction.commit();
        res.status(201).json({ data: created, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.get('/requests/:requestId', async (req, res, next) => {
    try {
      res.json({ data: await loadProjection(req, req.params.requestId), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:requestId/assign', async (req, res, next) => {
    try {
      requireManager(req);
      const request = await loadRequest(req.tenantId, req.params.requestId);
      if (!hasPropertyScope(req, request.propertyid)) {
        throw createRequestError(403, 'The maintenance property is outside the current staff scope.', 'RESOURCE_ACCESS_DENIED');
      }
      if ([MAINTENANCE_STATUS.COMPLETED, MAINTENANCE_STATUS.CANCELLED].includes(request.status)) {
        throw createRequestError(409, 'Closed maintenance requests cannot be reassigned.', 'MAINTENANCE_REQUEST_CLOSED');
      }
      const staffUserId = req.body?.staffUserId || req.body?.staffId;
      if (!staffUserId) throw createRequestError(400, 'staffUserId is required.', 'STAFF_USER_REQUIRED');

      const staffMembership = await runSingleQuery(
        `SELECT TOP 1 tm.app_user_id, tm.role, tm.permission_bundle
         FROM tenant_memberships tm
         WHERE tm.tenant_id = @tenantId
           AND tm.app_user_id = @staffUserId
           AND tm.status = 'active'
           AND tm.role NOT IN ('tenant', 'rentee')`,
        { tenantId: req.tenantId, staffUserId }
      );
      if (!staffMembership) {
        throw createRequestError(400, 'The assignee must be an active staff member in this organization.', 'INVALID_MAINTENANCE_ASSIGNEE');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const updated = await singleTransaction(
          transaction,
          `UPDATE maintenance_requests
           SET assignedto = @staffUserId,
               assignedat = COALESCE(@scheduledAt, SYSUTCDATETIME()),
               assigned_by = @actorUserId,
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @requestId`,
          {
            tenantId: req.tenantId,
            requestId: request.id,
            staffUserId,
            scheduledAt: req.body?.scheduledAt || req.body?.scheduledDate || null,
            actorUserId: req.user.id
          }
        );
        await insertEvent(transaction, {
          tenantId: req.tenantId,
          requestId: request.id,
          eventType: 'request_assigned',
          fromStatus: request.status,
          toStatus: request.status,
          actorUserId: req.user.id,
          metadata: { staffUserId, scheduledAt: updated.assignedat }
        });
        await transaction.commit();
        res.json({ data: updated, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:requestId/start', async (req, res, next) => {
    try {
      const request = await loadRequest(req.tenantId, req.params.requestId);
      const allowed = (isManager(req) && hasPropertyScope(req, request.propertyid))
        || (canUpdateAssigned(req) && String(request.assignedto || '') === String(req.user.id));
      if (!allowed) throw createRequestError(403, 'Only the assigned worker or maintenance manager can start work.', 'RESOURCE_ACCESS_DENIED');
      assertMaintenanceTransition(request.status, MAINTENANCE_STATUS.IN_PROGRESS);

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const updated = await singleTransaction(
          transaction,
          `UPDATE maintenance_requests
           SET status = 'in_progress', startedat = COALESCE(startedat, SYSUTCDATETIME()), updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @requestId AND status = 'pending'`,
          { tenantId: req.tenantId, requestId: request.id }
        );
        if (!updated) throw createRequestError(409, 'Maintenance request status changed before work could start.', 'MAINTENANCE_STATE_CONFLICT');
        await insertEvent(transaction, {
          tenantId: req.tenantId,
          requestId: request.id,
          eventType: 'work_started',
          fromStatus: request.status,
          toStatus: MAINTENANCE_STATUS.IN_PROGRESS,
          actorUserId: req.user.id
        });
        await transaction.commit();
        res.json({ data: updated, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:requestId/complete', async (req, res, next) => {
    try {
      const request = await loadRequest(req.tenantId, req.params.requestId);
      const allowed = (isManager(req) && hasPropertyScope(req, request.propertyid))
        || (canUpdateAssigned(req) && String(request.assignedto || '') === String(req.user.id));
      if (!allowed) throw createRequestError(403, 'Only the assigned worker or maintenance manager can complete work.', 'RESOURCE_ACCESS_DENIED');
      assertMaintenanceTransition(request.status, MAINTENANCE_STATUS.COMPLETED);
      const completionCost = req.body?.completionCost === undefined || req.body?.completionCost === null || req.body?.completionCost === ''
        ? null
        : Number(req.body.completionCost);
      if (completionCost !== null && (!Number.isFinite(completionCost) || completionCost < 0)) {
        throw createRequestError(400, 'completionCost must be zero or greater.', 'INVALID_MAINTENANCE_COST');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const updated = await singleTransaction(
          transaction,
          `UPDATE maintenance_requests
           SET status = 'completed', completedat = SYSUTCDATETIME(), completed_by = @actorUserId,
               completion_cost = @completionCost,
               notes = CASE WHEN @notes IS NULL OR @notes = '' THEN notes ELSE @notes END,
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @requestId AND status = 'in_progress'`,
          {
            tenantId: req.tenantId,
            requestId: request.id,
            actorUserId: req.user.id,
            completionCost,
            notes: req.body?.notes || null
          }
        );
        if (!updated) throw createRequestError(409, 'Maintenance request status changed before completion.', 'MAINTENANCE_STATE_CONFLICT');
        await insertEvent(transaction, {
          tenantId: req.tenantId,
          requestId: request.id,
          eventType: 'work_completed',
          fromStatus: request.status,
          toStatus: MAINTENANCE_STATUS.COMPLETED,
          actorUserId: req.user.id,
          metadata: { completionCost }
        });
        await transaction.commit();
        res.json({ data: updated, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:requestId/cancel', async (req, res, next) => {
    try {
      const request = await loadRequest(req.tenantId, req.params.requestId);
      const tenantOwner = isTenantRole({ user: req.user, membership: req.membership })
        && String(request.renteeid || '') === String(req.user.id)
        && canTenantCancelMaintenance(request.status);
      const managerAllowed = isManager(req) && hasPropertyScope(req, request.propertyid);
      if (!tenantOwner && !managerAllowed) {
        throw createRequestError(403, 'This account cannot cancel the maintenance request in its current state.', 'RESOURCE_ACCESS_DENIED');
      }
      assertMaintenanceTransition(request.status, MAINTENANCE_STATUS.CANCELLED);
      const reason = String(req.body?.reason || req.body?.cancellationReason || '').trim();
      if (!reason) throw createRequestError(400, 'A cancellation reason is required.', 'CANCELLATION_REASON_REQUIRED');

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const updated = await singleTransaction(
          transaction,
          `UPDATE maintenance_requests
           SET status = 'cancelled', cancelledat = SYSUTCDATETIME(), cancelled_by = @actorUserId,
               cancellationreason = @reason, updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @requestId AND status IN ('pending', 'in_progress')`,
          { tenantId: req.tenantId, requestId: request.id, actorUserId: req.user.id, reason }
        );
        if (!updated) throw createRequestError(409, 'Maintenance request status changed before cancellation.', 'MAINTENANCE_STATE_CONFLICT');
        await insertEvent(transaction, {
          tenantId: req.tenantId,
          requestId: request.id,
          eventType: 'request_cancelled',
          fromStatus: request.status,
          toStatus: MAINTENANCE_STATUS.CANCELLED,
          actorUserId: req.user.id,
          metadata: { reason }
        });
        await transaction.commit();
        res.json({ data: updated, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/requests/:requestId/comments', async (req, res, next) => {
    try {
      const request = await loadRequest(req.tenantId, req.params.requestId);
      assertReadAccess(req, request);
      const comment = String(req.body?.comment || '').trim();
      if (!comment) throw createRequestError(400, 'comment is required.', 'COMMENT_REQUIRED');
      const internalRequested = Boolean(req.body?.isInternal);
      if (internalRequested && isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant comments cannot be marked internal.', 'INTERNAL_COMMENT_FORBIDDEN');
      }

      const created = await runSingleQuery(
        `INSERT INTO maintenance_request_comments (
           tenant_id, maintenance_request_id, user_id, comment, is_internal
         ) OUTPUT INSERTED.*
         VALUES (@tenantId, @requestId, @userId, @comment, @isInternal)`,
        {
          tenantId: req.tenantId,
          requestId: request.id,
          userId: req.user.id,
          comment,
          isInternal: internalRequested ? 1 : 0
        }
      );
      res.status(201).json({ data: created, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
