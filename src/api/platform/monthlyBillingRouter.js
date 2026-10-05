import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';
import {
  generateMonthlyInvoicesForTenant,
  normalizeBillingPeriod
} from './monthlyBillingService.js';

const createRequestError = (status, message, code, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const requireInvoiceManage = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.INVOICES_MANAGE);
};

const requirePropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return;
  const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
  if (!propertyId || !assigned.has(String(propertyId))) {
    throw createRequestError(
      403,
      'The tenancy property is not assigned to the current staff account.',
      'RESOURCE_ACCESS_DENIED'
    );
  }
};

export const createMonthlyBillingRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'monthly-billing'
  }));

  router.post('/monthly-invoices', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod);
      const results = await generateMonthlyInvoicesForTenant({
        tenantId: req.tenantId,
        billingPeriod,
        dueDate: req.body?.dueDate || null,
        agreementId: req.body?.agreementId || null,
        propertyId: req.body?.propertyId || null,
        actorUserId: req.user.id,
        notes: req.body?.notes || null,
        source: 'manual',
        authorizeProperty: (propertyId) => requirePropertyScope(req, propertyId)
      });

      res.status(results.errors.length && !results.created.length ? 409 : 200).json({
        data: results,
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
