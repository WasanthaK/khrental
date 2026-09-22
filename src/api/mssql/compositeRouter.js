import express from 'express';
import { createAgreementDeleteRouter } from './agreementDeleteRouter.js';
import { createMembershipAdminRouter } from './membershipAdminRouter.js';
import { createPlatformAdminRouter } from './platformAdminRouter.js';
import { createInvitationStatusRouter } from './invitationStatusRouter.js';
import { createRenteeRouter } from './renteeRouter.js';
import { createTeamMemberRouter } from './teamMemberRouter.js';
import { createTenantRoleBoundaryRouter } from './tenantRoleBoundaryRouter.js';
import { createMssqlRouter as createLegacyMssqlRouter } from './router.js';

export const createMssqlRouter = () => {
  const router = express.Router();

  // Platform ownership is resolved before any /admin/* compatibility or
  // canonical route can run. Tenant administrators use tenant-scoped business
  // routes; only registered platform administrators may manage organizations
  // and tenant administrators.
  router.use(createPlatformAdminRouter());

  // Old tenant-scoped app-user endpoints remain available for compatibility,
  // but they cannot be used to appoint administrators.
  router.use(createTenantRoleBoundaryRouter());

  // Canonical guarded routes take precedence over the legacy compatibility
  // router. This prevents unsafe fall-through for destructive operations and
  // makes the invitation ledger authoritative for invitation status.
  router.use(createAgreementDeleteRouter());
  router.use(createMembershipAdminRouter());
  router.use(createInvitationStatusRouter());
  router.use(createRenteeRouter());
  router.use(createTeamMemberRouter());
  router.use(createLegacyMssqlRouter());

  return router;
};
