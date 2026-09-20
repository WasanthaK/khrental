import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from '../platform/authorization.js';
import { PERMISSIONS } from '../platform/permissionEngine.js';
import {
  createOrAttachTenantTeamMember,
  getTenantTeamMemberById,
  listTenantTeamMembers,
  updateTenantTeamMember
} from './teamMemberRepository.js';

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const requirePermission = (req, permission) => authorizePermission(
  { user: req.user, membership: req.membership },
  permission
);

export const createTeamMemberRouter = () => {
  const router = express.Router();
  const requireScopedTenant = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'mssql-team-directory',
    auditUnsafeOnly: false
  });

  router.get('/team-members', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.MEMBERSHIPS_MANAGE);
    const members = await listTenantTeamMembers(req.tenantId, {
      search: req.query.search,
      pageSize: req.query.pageSize
    });
    res.json({ data: members, meta: { count: members.length } });
  }));

  router.get('/team-members/:id', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.MEMBERSHIPS_MANAGE);
    const member = await getTenantTeamMemberById(req.tenantId, req.params.id);
    if (!member) {
      res.status(404).json({ error: 'Team member not found in the active organization.', code: 'TEAM_MEMBER_NOT_FOUND' });
      return;
    }
    res.json({ data: member });
  }));

  router.post('/team-members', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.MEMBERSHIPS_MANAGE);
    const result = await createOrAttachTenantTeamMember(req.tenantId, req.body || {});
    res.status(result.created ? 201 : 200).json({
      data: result.data,
      meta: {
        created: result.created,
        attached: result.attached,
        membershipId: result.membership_id
      }
    });
  }));

  router.put('/team-members/:id', requireScopedTenant, asyncHandler(async (req, res) => {
    requirePermission(req, PERMISSIONS.MEMBERSHIPS_MANAGE);
    const member = await updateTenantTeamMember(req.tenantId, req.params.id, req.body || {});
    if (!member) {
      res.status(404).json({ error: 'Team member not found in the active organization.', code: 'TEAM_MEMBER_NOT_FOUND' });
      return;
    }
    res.json({ data: member });
  }));

  return router;
};
