import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { createUserInvitation } from '../auth/invitations.js';
import { runSingleQuery } from './query.js';
import {
  createAppUser,
  createTenantMembership,
  findAppUserByEmail,
  getTenantById,
  listTenantMemberships,
  updateTenantMembershipById
} from './repositories.js';

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const normalizeRole = (value) => String(value || '').trim().toLowerCase();

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const isPlatformAdmin = async (appUserId) => {
  if (!appUserId) {
    return false;
  }

  const tableState = await runSingleQuery(
    `SELECT CASE WHEN OBJECT_ID(N'dbo.platform_admins', N'U') IS NULL THEN 0 ELSE 1 END AS exists_value`
  );

  if (!tableState?.exists_value) {
    return false;
  }

  const row = await runSingleQuery(
    `SELECT TOP 1 id
     FROM dbo.platform_admins
     WHERE app_user_id = @appUserId
       AND LOWER(COALESCE(status, 'active')) = 'active'`,
    { appUserId }
  );

  return Boolean(row?.id);
};

const requireResolvedUser = createTenantContextMiddleware({
  requireUser: true,
  auditLabel: 'platform-admin',
  auditUnsafeOnly: false
});

const requirePlatformAdmin = asyncHandler(async (req, res, next) => {
  if (!(await isPlatformAdmin(req.user?.id))) {
    res.status(403).json({
      error: 'Platform administrator access is required.',
      code: 'PLATFORM_ADMIN_REQUIRED'
    });
    return;
  }

  next();
});

const listMemberships = (tenantId) => listTenantMemberships(tenantId, { pageSize: 500 });

const findMembershipForUser = async (tenantId, appUserId) => {
  const memberships = await listMemberships(tenantId);
  return memberships.find((membership) => String(membership.app_user_id) === String(appUserId)) || null;
};

const findMembershipById = async (tenantId, membershipId) => {
  const memberships = await listMemberships(tenantId);
  return memberships.find((membership) => String(membership.id) === String(membershipId)) || null;
};

const requireAdministratorMembershipTarget = asyncHandler(async (req, res, next) => {
  const membership = await findMembershipById(req.params.tenantId, req.params.membershipId);
  if (!membership) {
    res.status(404).json({
      error: 'Tenant administrator membership not found.',
      code: 'TENANT_ADMIN_MEMBERSHIP_NOT_FOUND'
    });
    return;
  }

  if (normalizeRole(membership.role) !== 'admin') {
    res.status(403).json({
      error: 'Platform administrators may only modify tenant-administrator memberships.',
      code: 'PLATFORM_MEMBERSHIP_ROLE_RESTRICTED'
    });
    return;
  }

  req.platformTargetMembership = membership;
  next();
});

export const createPlatformAdminRouter = () => {
  const router = express.Router();

  // Unlike the container-level /api/health endpoint, this executes a real SQL
  // round-trip. Deploy verification and operators can therefore distinguish a
  // running web container from a working application database connection.
  router.get('/health', async (_req, res) => {
    try {
      const result = await runSingleQuery('SELECT 1 AS ready');
      res.json({
        ok: result?.ready === 1,
        provider: 'mssql',
        connection: 'ready'
      });
    } catch (error) {
      console.error('[MSSQL Health] Database probe failed:', error);
      res.status(503).json({
        ok: false,
        provider: 'mssql',
        connection: 'unavailable',
        error: 'The application database is unavailable.',
        code: 'MSSQL_HEALTHCHECK_FAILED'
      });
    }
  });

  // Any authenticated user may ask whether their identity is registered as a
  // platform administrator. The response grants no additional data or powers.
  router.get('/platform-admin/status', requireResolvedUser, asyncHandler(async (req, res) => {
    res.json({
      data: {
        isPlatformAdmin: await isPlatformAdmin(req.user?.id)
      }
    });
  }));

  // All legacy /admin/* routes are platform-level surfaces. Tenant
  // administrators must use tenant-scoped business routes instead.
  router.use('/admin', requireResolvedUser, requirePlatformAdmin);

  // Platform administrators may create organizations and appoint their tenant
  // administrators. They must not use platform routes for renter/staff
  // operations; those belong to the tenant administrator.
  router.use('/admin/tenants/:tenantId/rentees', (req, res, next) => {
    if (['GET', 'HEAD'].includes(req.method)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'Renter onboarding belongs to the tenant administrator. Use the tenant workspace.',
      code: 'TENANT_OPERATION_REQUIRED'
    });
  });

  router.post('/admin/app-users', (_req, res) => {
    res.status(403).json({
      error: 'Generic app-user creation is disabled for platform administration. Create a tenant administrator through the organization onboarding flow.',
      code: 'GENERIC_PLATFORM_USER_CREATION_DISABLED'
    });
  });

  router.post('/admin/tenants/:tenantId/memberships', (req, res, next) => {
    if (normalizeRole(req.body?.role) === 'admin') {
      next();
      return;
    }

    res.status(403).json({
      error: 'Platform administrators may only create tenant-administrator memberships.',
      code: 'PLATFORM_MEMBERSHIP_ROLE_RESTRICTED'
    });
  });

  router.put(
    '/admin/tenants/:tenantId/memberships/:membershipId',
    requireAdministratorMembershipTarget,
    (req, res, next) => {
      if (!req.body?.role || normalizeRole(req.body.role) === 'admin') {
        next();
        return;
      }

      res.status(403).json({
        error: 'Platform administrators may only manage tenant-administrator memberships.',
        code: 'PLATFORM_MEMBERSHIP_ROLE_RESTRICTED'
      });
    }
  );

  router.delete(
    '/admin/tenants/:tenantId/memberships/:membershipId',
    requireAdministratorMembershipTarget,
    (_req, _res, next) => next()
  );

  router.get('/admin/tenants/:tenantId/administrators', asyncHandler(async (req, res) => {
    const tenant = await getTenantById(req.params.tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.', code: 'TENANT_NOT_FOUND' });
      return;
    }

    const memberships = await listMemberships(req.params.tenantId);
    const administrators = memberships.filter((membership) => normalizeRole(membership.role) === 'admin');
    res.json({ data: administrators, meta: { count: administrators.length } });
  }));

  router.post('/admin/tenants/:tenantId/administrators', asyncHandler(async (req, res) => {
    const tenantId = req.params.tenantId;
    const tenant = await getTenantById(tenantId);
    if (!tenant) {
      res.status(404).json({ error: 'Tenant not found.', code: 'TENANT_NOT_FOUND' });
      return;
    }

    const email = normalizeEmail(req.body?.email);
    const name = String(req.body?.name || '').trim();
    if (!email || !name) {
      res.status(400).json({
        error: 'Name and email are required.',
        code: 'TENANT_ADMIN_IDENTITY_REQUIRED'
      });
      return;
    }

    let appUser = await findAppUserByEmail(email);
    let createdIdentity = false;

    if (!appUser) {
      appUser = await createAppUser({
        tenant_id: tenantId,
        email,
        name,
        role: 'admin',
        user_type: 'staff',
        status: 'active',
        active: true,
        invited: false
      });
      createdIdentity = true;
    }

    let membership = await findMembershipForUser(tenantId, appUser.id);
    if (membership) {
      if (normalizeRole(membership.role) !== 'admin' || normalizeRole(membership.status) !== 'active') {
        membership = await updateTenantMembershipById(tenantId, membership.id, {
          role: 'admin',
          status: 'active',
          is_default: Boolean(membership.is_default)
        });
      }
    } else {
      membership = await createTenantMembership(tenantId, {
        app_user_id: appUser.id,
        role: 'admin',
        status: 'active',
        is_default: createdIdentity
      });
    }

    res.status(createdIdentity ? 201 : 200).json({
      data: {
        user: appUser,
        membership
      },
      meta: {
        createdIdentity,
        attachedExistingIdentity: !createdIdentity
      }
    });
  }));

  router.post('/admin/tenants/:tenantId/administrators/:appUserId/invitations', asyncHandler(async (req, res) => {
    const tenantId = req.params.tenantId;
    const membership = await findMembershipForUser(tenantId, req.params.appUserId);

    if (!membership || normalizeRole(membership.role) !== 'admin' || normalizeRole(membership.status) !== 'active') {
      res.status(404).json({
        error: 'Active tenant administrator membership not found.',
        code: 'TENANT_ADMIN_MEMBERSHIP_NOT_FOUND'
      });
      return;
    }

    const invitation = await createUserInvitation({
      tenantId,
      appUserId: req.params.appUserId,
      createdBy: req.user?.id || null
    });

    res.status(201).json({
      data: {
        user: invitation.target,
        invitation: {
          token: invitation.token,
          expiresAt: invitation.expiresAt
        }
      }
    });
  }));

  return router;
};