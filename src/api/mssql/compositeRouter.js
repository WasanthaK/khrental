import express from 'express';
import { createAgreementDeleteRouter } from './agreementDeleteRouter.js';
import { createMembershipAdminRouter } from './membershipAdminRouter.js';
import { createRenteeRouter } from './renteeRouter.js';
import { createMssqlRouter as createLegacyMssqlRouter } from './router.js';

export const createMssqlRouter = () => {
  const router = express.Router();

  // Canonical guarded routes take precedence over the legacy compatibility
  // router. This prevents unsafe fall-through for destructive operations.
  router.use(createAgreementDeleteRouter());
  router.use(createMembershipAdminRouter());
  router.use(createRenteeRouter());
  router.use(createLegacyMssqlRouter());

  return router;
};
