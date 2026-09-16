import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { isAdminRole } from '../platform/permissionEngine.js';
import {
  createCanonicalTenantMembership,
  deleteCanonicalTenantMembership,
  listCanonicalTenantMemberships,
  updateCanonicalTenantMembership
} from './membershipAdminRepository.js';

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const getPagination = (req) => ({
  page: req.query.page,
  pageSize: req.query.pageSize
});

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

export const createMembershipAdminRouter = () => {
  const router = express.Router();
  const requireAdminContext = createTenantContextMiddleware({
    requireUser: true,
    auditLabel: 'mssql-membership-admin',
    auditUnsafeOnly: false
  });

  router.use('/admin/tenants/:tenantId/memberships', requireAdminContext, ensureAdminUser);

  router.get('/admin/tenants/:tenantId/memberships', asyncHandler(async (req, res) => {
    const memberships = await listCanonicalTenantMemberships(req.params.tenantId, {
      status: req.query.status,
      search: req.query.search,
      ...getPagination(req)
    });

    res.json({ data: memberships });
  }));

  router.post('/admin/tenants/:tenantId/memberships', asyncHandler(async (req, res) => {
    const membership = await createCanonicalTenantMembership(req.params.tenantId, req.body || {});
    res.status(201).json({ data: membership });
  }));

  router.put('/admin/tenants/:tenantId/memberships/:membershipId', asyncHandler(async (req, res) => {
    const membership = await updateCanonicalTenantMembership(
      req.params.tenantId,
      req.params.membershipId,
      req.body || {}
    );

    if (!membership) {
      res.status(404).json({ error: 'Tenant membership not found.' });
      return;
    }

    res.json({ data: membership });
  }));

  router.delete('/admin/tenants/:tenantId/memberships/:membershipId', asyncHandler(async (req, res) => {
    const membership = await deleteCanonicalTenantMembership(req.params.tenantId, req.params.membershipId);

    if (!membership) {
      res.status(404).json({ error: 'Tenant membership not found.' });
      return;
    }

    res.json({ data: membership });
  }));

  return router;
};
