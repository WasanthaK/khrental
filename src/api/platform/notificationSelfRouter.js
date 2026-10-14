import express from 'express';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import {
  parseNotificationPage,
  listOwnNotificationPage,
  markOwnNotificationRead
} from './notificationAccess.js';

/**
 * Dedicated self-service endpoints. A caller cannot supply a user or tenant
 * identifier to widen either the read or the mutation.
 */
export const createNotificationSelfRouter = () => {
  const router = express.Router();
  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'notification-self'
  }));

  router.get('/me', async (req, res, next) => {
    try {
      const { page, pageSize } = parseNotificationPage(req.query);
      const rows = await listOwnNotificationPage({
        tenantId: req.tenantId,
        userId: req.user.id,
        page, pageSize,
        query: runQuery
      });
      res.json({ data: rows, error: null });
    } catch (error) { next(error); }
  });

  router.patch('/:notificationId/read', async (req, res, next) => {
    try {
      const row = await markOwnNotificationRead({
        tenantId: req.tenantId,
        userId: req.user.id,
        notificationId: req.params.notificationId,
        queryOne: runSingleQuery
      });
      res.json({ data: row, error: null });
    } catch (error) { next(error); }
  });

  return router;
};
