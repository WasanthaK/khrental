import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';

const createRequestError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const requirePropertyRead = (req) => {
  authorizePermission(
    { user: req.user, membership: req.membership },
    PERMISSIONS.PROPERTIES_READ
  );
};

const requirePropertyManage = (req) => {
  authorizePermission(
    { user: req.user, membership: req.membership },
    PERMISSIONS.PROPERTIES_MANAGE
  );
};

const requirePropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return;
  const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
  if (!propertyId || !assigned.has(String(propertyId))) {
    throw createRequestError(
      403,
      'The property is not assigned to the current staff account.',
      'RESOURCE_ACCESS_DENIED'
    );
  }
};

const loadProperty = async (tenantId, propertyId) => {
  const property = await runSingleQuery(
    `SELECT TOP 1 id, name
     FROM properties
     WHERE tenant_id = @tenantId AND id = @propertyId`,
    { tenantId, propertyId }
  );
  if (!property) {
    throw createRequestError(404, 'Property not found.', 'PROPERTY_NOT_FOUND');
  }
  return property;
};

const normalizeFixedConfigs = (configs) => {
  if (!Array.isArray(configs)) {
    throw createRequestError(400, 'configs must be an array.', 'INVALID_UTILITY_CONFIGS');
  }

  const seen = new Set();
  return configs.map((config) => {
    const utilityType = String(config?.utilityType || config?.utilitytype || '').trim().toLowerCase();
    const fixedAmount = Number(config?.fixedAmount ?? config?.fixedamount);

    if (!utilityType || utilityType.length > 100) {
      throw createRequestError(400, 'Each fixed utility requires a valid utilityType.', 'INVALID_UTILITY_TYPE');
    }
    if (!Number.isFinite(fixedAmount) || fixedAmount <= 0) {
      throw createRequestError(400, 'Each fixed utility amount must be greater than zero.', 'INVALID_FIXED_UTILITY_AMOUNT');
    }
    if (seen.has(utilityType)) {
      throw createRequestError(400, 'Duplicate fixed utility types are not allowed for one property.', 'DUPLICATE_UTILITY_TYPE');
    }

    seen.add(utilityType);
    return {
      utilityType,
      fixedAmount: Math.round(fixedAmount * 100) / 100
    };
  });
};

export const createPropertyUtilityConfigRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'property-utility-config'
  }));

  router.get('/:propertyId/fixed-utilities', async (req, res, next) => {
    try {
      requirePropertyRead(req);
      const property = await loadProperty(req.tenantId, req.params.propertyId);
      requirePropertyScope(req, property.id);

      const configs = await runQuery(
        `SELECT id, propertyid, utilitytype, billingtype, fixedamount, createdat, updatedat
         FROM utility_configs
         WHERE tenant_id = @tenantId
           AND propertyid = @propertyId
           AND LOWER(COALESCE(billingtype, '')) = 'fixed'
         ORDER BY utilitytype`,
        { tenantId: req.tenantId, propertyId: property.id }
      );

      res.json({ data: { property, configs }, error: null });
    } catch (error) {
      next(error);
    }
  });

  router.put('/:propertyId/fixed-utilities', async (req, res, next) => {
    try {
      requirePropertyManage(req);
      const property = await loadProperty(req.tenantId, req.params.propertyId);
      requirePropertyScope(req, property.id);
      const configs = normalizeFixedConfigs(req.body?.configs || []);

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

      try {
        const deleteRequest = new sql.Request(transaction);
        deleteRequest.input('tenantId', req.tenantId);
        deleteRequest.input('propertyId', property.id);
        await deleteRequest.query(
          `DELETE FROM utility_configs
           WHERE tenant_id = @tenantId
             AND propertyid = @propertyId
             AND LOWER(COALESCE(billingtype, '')) = 'fixed'`
        );

        for (const config of configs) {
          const insertRequest = new sql.Request(transaction);
          insertRequest.input('tenantId', req.tenantId);
          insertRequest.input('propertyId', property.id);
          insertRequest.input('utilityType', config.utilityType);
          insertRequest.input('fixedAmount', config.fixedAmount);
          await insertRequest.query(
            `INSERT INTO utility_configs (
               tenant_id, propertyid, utilitytype, billingtype, fixedamount, rate
             ) VALUES (
               @tenantId, @propertyId, @utilityType, 'fixed', @fixedAmount, NULL
             )`
          );
        }

        await transaction.commit();
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }

      const saved = await runQuery(
        `SELECT id, propertyid, utilitytype, billingtype, fixedamount, createdat, updatedat
         FROM utility_configs
         WHERE tenant_id = @tenantId
           AND propertyid = @propertyId
           AND LOWER(COALESCE(billingtype, '')) = 'fixed'
         ORDER BY utilitytype`,
        { tenantId: req.tenantId, propertyId: property.id }
      );

      res.json({ data: { propertyId: property.id, configs: saved }, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
