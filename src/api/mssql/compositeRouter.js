import express from 'express';
import { createMembershipAdminRouter } from './membershipAdminRouter.js';
import { createMssqlRouter as createLegacyMssqlRouter } from './router.js';

export const createMssqlRouter = () => {
  const router = express.Router();

  // Phase 3 canonical membership administration takes precedence for the
  // membership endpoints. All other MSSQL compatibility routes continue
  // through the existing router until later remediation slices migrate them.
  router.use(createMembershipAdminRouter());
  router.use(createLegacyMssqlRouter());

  return router;
};
