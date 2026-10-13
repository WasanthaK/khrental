import express from 'express';
import { createSessionAuthMiddleware } from '../auth/index.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { runSingleQuery } from '../mssql/query.js';
import { authorizeFencedEviaAuditTrailRead } from '../evia/auditTrailAccess.js';
import { createStorageDeliveryHandler } from './index.js';

// Production uses the existing real authentication, tenant, SQL and storage.
// The same route accepts isolated dependencies for real HTTP security proofs.
const loadPublishedArchiveFromSql = ({ agreementId, tenantId }) => runSingleQuery([
  'SELECT TOP 1 a.id, a.tenant_id, a.status, a.signature_status,',
  '  a.signed_document_url,',
  '  e.processed AS lease_processed, e.raw_data AS lease_raw_data',
  'FROM dbo.agreements a',
  'INNER JOIN dbo.webhook_events e',
  '  ON e.tenant_id = a.tenant_id',
  '  AND e.request_id = a.eviasignreference',
  "  AND e.event_type = 'evia.archive.lease.v1'",
  '  AND e.processed = 1',
  '  AND ISJSON(e.raw_data) = 1',
  'WHERE a.id = @agreementId AND a.tenant_id = @tenantId',
  'ORDER BY e.createdat DESC'
].join('\n'), { agreementId, tenantId });

export const createAuthenticatedTenantStorageRouter = ({
  sessionMiddleware = createSessionAuthMiddleware({ allowStorageCookie: true }),
  tenantMiddleware = createTenantContextMiddleware({ requireUser: true, requireTenant: true }),
  loadPublishedArchive = loadPublishedArchiveFromSql,
  deliveryHandler = createStorageDeliveryHandler()
} = {}) => {
  const router = express.Router();

  router.use(sessionMiddleware, (req, res, next) => {
    if (!req.authSession) {
      res.status(401).json({ error: 'Authenticated session required.', code: 'AUTH_SESSION_REQUIRED' });
      return;
    }
    next();
  });

  router.use(
    '/:bucket',
    (req, res, next) => {
      const parts = String(req.path || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
      const tenantIdFromPath = parts[0] === 'tenants' ? parts[1] : null;
      if (!tenantIdFromPath) {
        res.status(403).json({ error: 'Tenant-scoped storage path required.', code: 'TENANT_STORAGE_PATH_REQUIRED' });
        return;
      }
      req.headers['x-tenant-id'] = tenantIdFromPath;
      next();
    },
    tenantMiddleware,
    async (req, res, next) => {
      try {
        const objectPath = String(req.params[0] || req.path || '').replace(/^\/+/, '');
        const result = await authorizeFencedEviaAuditTrailRead({
          bucket: req.params.bucket,
          path: objectPath,
          tenantId: req.tenantId,
          user: req.user,
          membership: req.membership,
          loadPublishedArchive
        });
        if (result.applies && !result.allowed) {
          res.status(403).json({
            error: 'Audit-trail access is not authorized.',
            code: 'EVIA_AUDIT_TRAIL_ACCESS_DENIED'
          });
          return;
        }
        next();
      } catch (error) { next(error); }
    },
    deliveryHandler
  );

  return router;
};
