import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from '../platform/authorization.js';
import { PERMISSIONS, isAdminRole } from '../platform/permissionEngine.js';
import {
  createOrAttachTenantRentee,
  getTenantRenteeById,
  listTenantRentees
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

  router.get('/rentees/:id', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.RENTEES_READ);
    const rentee = await getTenantRenteeById(req.tenantId, req.params.id);

    if (!rentee) {
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
