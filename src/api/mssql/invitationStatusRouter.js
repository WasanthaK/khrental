import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { PERMISSIONS, hasPermission, isAdminRole } from '../platform/permissionEngine.js';
import { getCanonicalInvitationStatus } from '../auth/invitationStatus.js';

const asyncHandler = (handler) => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};

const canReadInvitationStatus = (req, targetId) => (
  String(req.user?.id || '') === String(targetId || '')
  || isAdminRole({ user: req.user, membership: req.membership })
  || hasPermission({ user: req.user, membership: req.membership }, PERMISSIONS.RENTEES_READ)
  || hasPermission({ user: req.user, membership: req.membership }, PERMISSIONS.MEMBERSHIPS_MANAGE)
);

export const createInvitationStatusRouter = () => {
  const router = express.Router();
  const requireScopedTenant = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'mssql-invitation-status',
    auditUnsafeOnly: false
  });

  router.get('/app-users/:id/invitation-status', requireScopedTenant, asyncHandler(async (req, res) => {
    if (!canReadInvitationStatus(req, req.params.id)) {
      res.status(403).json({ error: 'Invitation status access is not allowed.', code: 'PERMISSION_REQUIRED' });
      return;
    }

    const status = await getCanonicalInvitationStatus({
      tenantId: req.tenantId,
      appUserId: req.params.id
    });

    if (!status) {
      res.status(404).json({ error: 'App user not found in the active organization.', code: 'APP_USER_NOT_FOUND' });
      return;
    }

    res.json({ data: status });
  }));

  return router;
};
