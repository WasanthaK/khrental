import express from 'express';
import { createAgreementDeleteRouter } from './agreementDeleteRouter.js';
import { createMembershipAdminRouter } from './membershipAdminRouter.js';
import { createPlatformAdminRouter } from './platformAdminRouter.js';
import { createRenteeRouter } from './renteeRouter.js';
import { createMssqlRouter as createLegacyMssqlRouter } from './router.js';

export const createMssqlRouter = () => {
  const router = express.Router();

  // Platform ownership is resolved before any /admin/* compatibility or
  // canonical route can run. Tenant administrators use tenant-scoped business
  // routes; only registered platform administrators may manage organizations
  // and tenant administrators.
  router.use(createPlatformAdminRouter());

  // Canonical guarded routes take precedence over the legacy compatibility
  // router. This prevents unsafe fall-through for destructive operations.
  router.use(createAgreementDeleteRouter());
  router.use(createMembershipAdminRouter());
  router.use(createRenteeRouter());
  router.use(createLegacyMssqlRouter());

  return router;
};