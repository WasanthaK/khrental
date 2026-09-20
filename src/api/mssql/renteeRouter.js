import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from '../platform/authorization.js';
import { PERMISSIONS, hasPermission, isAdminRole } from '../platform/permissionEngine.js';
import { getAppUserInvitationStatus } from './repositories.js';
import {
  createOrAttachTenantRentee,
  getTenantRenteeById,
  listTenantRentees,
  updateTenantRentee
} from './renteeRepository.js';

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const ensureAdminUser = (req, res, next) => {
  if (!isAdminRole({ user: req.user, membership: req.membership })) {
    res.status(403).json({
      error: 'Administrator access is required for this route.',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
    return;
  }

  next();
};

const requirePermission = (req, permission) => authorizePermission(
  { user: req.user, membership: req.membership },
  permission
);

const canReadRentee = (req, renteeId) => (
  String(req.user?.id || '') === String(renteeId || '')
  || hasPermission({ user: req.user, membership: req.membership }, PERMISSIONS.RENTEES_READ)
);

export const createRenteeRouter = () => {
  const router = express.Router();
  const requireScopedTenant = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'mssql-rentee-directory',
    auditUnsafeOnly: false
  });
  const requireAdminContext = createTenantContextMiddleware({
    requireUser: true,
    auditLabel: 'mssql-rentee-admin',
    auditUnsafeOnly: false
  });

  router.get('/rentees', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.RENTEES_READ);
    const rentees = await listTenantRentees(req.tenantId, {
      search: req.query.search,
      pageSize: req.query.pageSize
    });

    res.json({ data: rentees, meta: { count: rentees.length } });
  }));

  router.get('/rentees/:id/invitation-status', requireScopedTenant, asyncHandler(async (req, res) => {
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);
    if (!rentee || !canReadRentee(req, req.params.id)) {
      res.status(404).json({ error: 'Renter not found in the active organization.', code: 'RENTEE_NOT_FOUND' });
      return;
    }

    const status = await getAppUserInvitationStatus(req.params.id);
    if (!status) {
      res.status(404).json({ error: 'Renter not found.', code: 'RENTEE_NOT_FOUND' });
      return;
    }

    res.json({ data: status });
  }));

  router.get('/rentees/:id', requireScopedTenant, asyncHandler(async (req, res) => {
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);
    if (!rentee || !canReadRentee(req, req.params.id)) {
      res.status(404).json({ error: 'Renter not found in the active organization.', code: 'RENTEE_NOT_FOUND' });
      return;
    }

    res.json({ data: rentee });
  }));

  router.post('/rentees', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.RENTEES_MANAGE);
    const result = await createOrAttachTenantRentee(req.tenantId, req.body || {});
    res.status(result.created ? 201 : 200).json({
      data: result.data,
      meta: {
        created: result.created,
        attached: result.attached,
        membershipId: result.membership_id
      }
    });
  }));

  router.put('/rentees/:id', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.RENTEES_MANAGE);
    const rentee = await updateTenantRentee(req.tenantId, req.params.id, req.body || {});
    if (!rentee) {
      res.status(404).json({ error: 'Renter not found in the active organization.', code: 'RENTEE_NOT_FOUND' });
      return;
    }
    res.json({ data: rentee });
  }));

  // Compatibility interception: old renter screens still request app-users URLs.
  // Only take over when the ID is actually a renter in this organization;
  // otherwise fall through to the legacy MSSQL router for staff/admin behavior.
  router.get('/app-users/:id/invitation-status', requireScopedTenant, asyncHandler(async (req, res, next) => {
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);
    if (!rentee) {
      next();
      return;
    }
    if (!canReadRentee(req, req.params.id)) {
      res.status(403).json({ error: 'Renter access is not allowed.', code: 'PERMISSION_REQUIRED' });
      return;
    }

    const status = await getAppUserInvitationStatus(req.params.id);
    res.json({ data: status });
  }));

  router.get('/app-users/:id', requireScopedTenant, asyncHandler(async (req, res, next) => {
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);
    if (!rentee) {
      next();
      return;
    }
    if (!canReadRentee(req, req.params.id)) {
      res.status(403).json({ error: 'Renter access is not allowed.', code: 'PERMISSION_REQUIRED' });
      return;
    }

    res.json({ data: rentee });
  }));

  router.put('/app-users/:id', requireScopedTenant, asyncHandler(async (req, res, next) => {
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);
    if (!rentee) {
      next();
      return;
    }

    requirePermission(req, PERMISSIONS.RENTEES_MANAGE);
    const updated = await updateTenantRentee(req.tenantId, req.params.id, req.body || {});
    res.json({ data: updated });
  }));

  router.get('/admin/tenants/:tenantId/rentees', requireAdminContext, ensureAdminUser, asyncHandler(async (req, res) => {
    const rentees = await listTenantRentees(req.params.tenantId, {
      search: req.query.search,
      pageSize: req.query.pageSize
    });
    res.json({ data: rentees, meta: { count: rentees.length } });
  }));

  router.post('/admin/tenants/:tenantId/rentees', requireAdminContext, ensureAdminUser, asyncHandler(async (req, res) => {
    const result = await createOrAttachTenantRentee(req.params.tenantId, req.body || {});
    res.status(result.created ? 201 : 200).json({
      data: result.data,
      meta: {
        created: result.created,
        attached: result.attached,
        membershipId: result.membership_id
      }
    });
  }));

  return router;
};
