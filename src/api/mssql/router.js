import express from 'express';
import { getMssqlConfigStatus, isMssqlConfigured } from './config.js';
import { createTenantContextMiddleware, serializeTenantContext } from '../tenant/context.js';
import {
  createAppUser,
  createAgreement,
  createAgreementTemplate,
  createTenant,
  createTenantMembership,
  createInvoice,
  deleteTenantMembershipById,
  deleteAppUserById,
  deleteAgreementById,
  deleteAgreementTemplateById,
  getAgreementById,
  getAgreementTemplateById,
  getAppUserById,
  getAppUserInvitationStatus,
  getCurrentUserProfile,
  getInvoiceById,
  getTenantById,
  getPropertyById,
  getPropertyUnitById,
  findAppUserByAuthId,
  findAppUserByEmail,
  linkAuthUserToAppUser,
  listAgreements,
  listAgreementTemplates,
  listAppUsers,
  listInvoices,
  listTenantMemberships,
  listTenants,
  listProperties,
  listPropertyUnits,
  markAgreementSigned,
  updateAppUser,
  updateAgreement,
  updateAgreementTemplate,
  updateTenantMembershipById,
  updateTenantById,
  updateInvoice,
  updatePropertyById
} from './repositories.js';

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const getPagination = (req) => ({
  page: req.query.page,
  pageSize: req.query.pageSize
});

const isMissingSchemaError = (error) => {
  const message = String(error?.message || error || '').toLowerCase();
  return message.includes('invalid object name') || message.includes('invalid column name');
};

const sendSchemaUnavailable = (res, resourceLabel) => {
  res.status(409).json({
    error: `${resourceLabel} are not available in the current local MSSQL schema.`,
    code: 'SCHEMA_NOT_AVAILABLE'
  });
};

const ensureAdminUser = (req, res, next) => {
  if (String(req.user?.role || '').trim().toLowerCase() !== 'admin') {
    res.status(403).json({
      error: 'Administrator access is required for this route.',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
    return;
  }

  next();
};

export const createMssqlRouter = () => {
  const router = express.Router();
  const requireAdmin = createTenantContextMiddleware({
    requireUser: true,
    auditLabel: 'mssql-admin-route',
    auditUnsafeOnly: false
  });
  const requireScopedTenant = createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'mssql-tenant-route'
  });

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      provider: 'mssql',
      ...getMssqlConfigStatus()
    });
  });

  router.use((req, res, next) => {
    if (!isMssqlConfigured()) {
      res.status(503).json({
        error: 'MSSQL is not configured.',
        required: [
          'MSSQL_SERVER',
          'MSSQL_DATABASE',
          'MSSQL_USER',
          'MSSQL_PASSWORD'
        ]
      });
      return;
    }

    next();
  });

  router.use(createTenantContextMiddleware());

  router.get('/me', createTenantContextMiddleware({ requireUser: true }), asyncHandler(async (req, res) => {
    const identity = req.tenantContext?.identity || {};
    const user = req.user || await getCurrentUserProfile(identity);

    if (!user) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    res.json({
      data: {
        ...user,
        tenantId: req.tenantId || user.tenant_id || null,
        tenant: req.tenant || null,
        membership: req.membership || null,
        memberships: req.memberships || []
      },
      meta: {
        tenantContext: serializeTenantContext(req.tenantContext)
      }
    });
  }));

  router.get('/tenant-context', createTenantContextMiddleware({ requireUser: true }), asyncHandler(async (req, res) => {
    res.json({
      data: {
        user: req.user,
        ...serializeTenantContext(req.tenantContext)
      }
    });
  }));

  router.get('/admin/tenants', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const tenants = await listTenants({
        status: req.query.status,
        search: req.query.search,
        ...getPagination(req)
      });

      res.json({ data: tenants });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenants');
        return;
      }

      throw error;
    }
  }));

  router.get('/admin/tenants/:id', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const tenant = await getTenantById(req.params.id);

      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found.' });
        return;
      }

      res.json({ data: tenant });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenants');
        return;
      }

      throw error;
    }
  }));

  router.post('/admin/tenants', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const tenant = await createTenant(req.body || {});
      res.status(201).json({ data: tenant });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenants');
        return;
      }

      throw error;
    }
  }));

  router.put('/admin/tenants/:id', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const tenant = await updateTenantById(req.params.id, req.body || {});

      if (!tenant) {
        res.status(404).json({ error: 'Tenant not found.' });
        return;
      }

      res.json({ data: tenant });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenants');
        return;
      }

      throw error;
    }
  }));

  router.get('/admin/app-users', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const users = await listAppUsers({
        userType: req.query.userType,
        email: req.query.email,
        authId: req.query.authId,
        search: req.query.search,
        ...getPagination(req)
      });

      res.json({ data: users });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'App users');
        return;
      }

      throw error;
    }
  }));

  router.post('/admin/app-users', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const tenantId = req.body?.tenant_id || req.body?.tenantId || null;

      if (tenantId) {
        const tenant = await getTenantById(tenantId);

        if (!tenant) {
          res.status(404).json({ error: 'Tenant not found.' });
          return;
        }
      }

      const user = await createAppUser({ ...(req.body || {}), ...(tenantId ? { tenant_id: tenantId } : {}) });
      res.status(201).json({ data: user });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'App users');
        return;
      }

      throw error;
    }
  }));

  router.get('/admin/tenants/:tenantId/memberships', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const memberships = await listTenantMemberships(req.params.tenantId, {
        status: req.query.status,
        search: req.query.search,
        ...getPagination(req)
      });

      res.json({ data: memberships });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenant memberships');
        return;
      }

      throw error;
    }
  }));

  router.post('/admin/tenants/:tenantId/memberships', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const membership = await createTenantMembership(req.params.tenantId, req.body || {});
      res.status(201).json({ data: membership });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenant memberships');
        return;
      }

      throw error;
    }
  }));

  router.put('/admin/tenants/:tenantId/memberships/:membershipId', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const membership = await updateTenantMembershipById(req.params.tenantId, req.params.membershipId, req.body || {});

      if (!membership) {
        res.status(404).json({ error: 'Tenant membership not found.' });
        return;
      }

      res.json({ data: membership });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenant memberships');
        return;
      }

      throw error;
    }
  }));

  router.delete('/admin/tenants/:tenantId/memberships/:membershipId', requireAdmin, ensureAdminUser, asyncHandler(async (req, res) => {
    try {
      const membership = await deleteTenantMembershipById(req.params.tenantId, req.params.membershipId);

      if (!membership) {
        res.status(404).json({ error: 'Tenant membership not found.' });
        return;
      }

      res.json({ data: membership });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Tenant memberships');
        return;
      }

      throw error;
    }
  }));

  router.use(requireScopedTenant);

  router.get('/app-users', asyncHandler(async (req, res) => {
    const users = await listAppUsers({
      tenantId: req.tenantId,
      userType: req.query.userType,
      email: req.query.email,
      authId: req.query.authId,
      ...getPagination(req)
    });

    res.json({ data: users });
  }));

  router.get('/app-users/lookup', asyncHandler(async (req, res) => {
    const { email, authId } = req.query;

    if (!email && !authId) {
      res.status(400).json({ error: 'Provide email or authId.' });
      return;
    }

    const user = authId
      ? await findAppUserByAuthId(authId, req.tenantId)
      : await findAppUserByEmail(email, req.tenantId);

    res.json({ data: user || null });
  }));

  router.post('/app-users', asyncHandler(async (req, res) => {
    const user = await createAppUser({ ...(req.body || {}), tenant_id: req.tenantId });
    res.status(201).json({ data: user });
  }));

  router.get('/app-users/:id/invitation-status', asyncHandler(async (req, res) => {
    const status = await getAppUserInvitationStatus(req.params.id, req.tenantId);

    if (!status) {
      res.status(404).json({ error: 'App user not found.' });
      return;
    }

    res.json({ data: status });
  }));

  router.get('/app-users/:id', asyncHandler(async (req, res) => {
    const user = await getAppUserById(req.params.id, req.tenantId);

    if (!user) {
      res.status(404).json({ error: 'App user not found.' });
      return;
    }

    res.json({ data: user });
  }));

  router.put('/app-users/:id', asyncHandler(async (req, res) => {
    const user = await updateAppUser(req.params.id, { ...(req.body || {}), tenant_id: req.tenantId });

    if (!user) {
      res.status(404).json({ error: 'App user not found.' });
      return;
    }

    res.json({ data: user });
  }));

  router.post('/app-users/:id/link', asyncHandler(async (req, res) => {
    const { authId } = req.body || {};

    if (!authId) {
      res.status(400).json({ error: 'authId is required.' });
      return;
    }

    const user = await linkAuthUserToAppUser(req.params.id, authId, req.tenantId);

    if (!user) {
      res.status(404).json({ error: 'App user not found.' });
      return;
    }

    res.json({ data: user });
  }));

  router.delete('/app-users/:id', asyncHandler(async (req, res) => {
    const user = await deleteAppUserById(req.params.id, req.tenantId);

    if (!user) {
      res.status(404).json({ error: 'App user not found.' });
      return;
    }

    res.json({ data: user });
  }));

  router.get('/properties', asyncHandler(async (req, res) => {
    const properties = await listProperties({ tenantId: req.tenantId, ...getPagination(req) });
    res.json({ data: properties });
  }));

  router.get('/properties/:id', asyncHandler(async (req, res) => {
    const property = await getPropertyById(req.params.id, req.tenantId);

    if (!property) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    res.json({ data: property });
  }));

  router.put('/properties/:id', asyncHandler(async (req, res) => {
    const property = await updatePropertyById(req.params.id, req.body || {}, req.tenantId);

    if (!property) {
      res.status(404).json({ error: 'Property not found.' });
      return;
    }

    res.json({ data: property });
  }));

  router.get('/property-units', asyncHandler(async (req, res) => {
    const units = await listPropertyUnits({
      tenantId: req.tenantId,
      propertyId: req.query.propertyId,
      ...getPagination(req)
    });

    res.json({ data: units });
  }));

  router.get('/property-units/:id', asyncHandler(async (req, res) => {
    const unit = await getPropertyUnitById(req.params.id, req.tenantId);

    if (!unit) {
      res.status(404).json({ error: 'Property unit not found.' });
      return;
    }

    res.json({ data: unit });
  }));

  router.get('/invoices', asyncHandler(async (req, res) => {
    const invoices = await listInvoices({
      tenantId: req.tenantId,
      propertyId: req.query.propertyId,
      renteeId: req.query.renteeId,
      status: req.query.status,
      billingPeriod: req.query.billingPeriod,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      ...getPagination(req)
    });

    res.json({ data: invoices });
  }));

  router.get('/invoices/:id', asyncHandler(async (req, res) => {
    const invoice = await getInvoiceById(req.params.id, req.tenantId);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    res.json({ data: invoice });
  }));

  router.post('/invoices', asyncHandler(async (req, res) => {
    const invoice = await createInvoice(req.body || {}, req.tenantId);
    res.status(201).json({ data: invoice });
  }));

  router.put('/invoices/:id', asyncHandler(async (req, res) => {
    const invoice = await updateInvoice(req.params.id, req.body || {}, req.tenantId);

    if (!invoice) {
      res.status(404).json({ error: 'Invoice not found.' });
      return;
    }

    res.json({ data: invoice });
  }));

  router.get('/agreement-templates', asyncHandler(async (req, res) => {
    try {
      const templates = await listAgreementTemplates({
        tenantId: req.tenantId,
        language: req.query.language,
        ...getPagination(req)
      });

      res.json({ data: templates });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        res.json({ data: [] });
        return;
      }

      throw error;
    }
  }));

  router.get('/agreement-templates/:id', asyncHandler(async (req, res) => {
    try {
      const template = await getAgreementTemplateById(req.params.id, req.tenantId);

      if (!template) {
        res.status(404).json({ error: 'Agreement template not found.' });
        return;
      }

      res.json({ data: template });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        res.status(404).json({ error: 'Agreement template not found.' });
        return;
      }

      throw error;
    }
  }));

  router.post('/agreement-templates', asyncHandler(async (req, res) => {
    try {
      const template = await createAgreementTemplate(req.body || {}, req.tenantId);
      res.status(201).json({ data: template });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreement templates');
        return;
      }

      throw error;
    }
  }));

  router.put('/agreement-templates/:id', asyncHandler(async (req, res) => {
    try {
      const template = await updateAgreementTemplate(req.params.id, req.body || {}, req.tenantId);

      if (!template) {
        res.status(404).json({ error: 'Agreement template not found.' });
        return;
      }

      res.json({ data: template });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreement templates');
        return;
      }

      throw error;
    }
  }));

  router.delete('/agreement-templates/:id', asyncHandler(async (req, res) => {
    try {
      const template = await deleteAgreementTemplateById(req.params.id, req.tenantId);

      if (!template) {
        res.status(404).json({ error: 'Agreement template not found.' });
        return;
      }

      res.json({ data: template });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreement templates');
        return;
      }

      throw error;
    }
  }));

  router.get('/agreements', asyncHandler(async (req, res) => {
    try {
      const agreements = await listAgreements({
        tenantId: req.tenantId,
        propertyId: req.query.propertyId,
        renteeId: req.query.renteeId,
        status: req.query.status,
        ...getPagination(req)
      });

      res.json({ data: agreements });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        res.json({ data: [] });
        return;
      }

      throw error;
    }
  }));

  router.get('/agreements/:id', asyncHandler(async (req, res) => {
    try {
      const agreement = await getAgreementById(req.params.id, req.tenantId);

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found.' });
        return;
      }

      res.json({ data: agreement });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        res.status(404).json({ error: 'Agreement not found.' });
        return;
      }

      throw error;
    }
  }));

  router.post('/agreements', asyncHandler(async (req, res) => {
    try {
      const agreement = await createAgreement(req.body || {}, req.tenantId);
      res.status(201).json({ data: agreement });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreements');
        return;
      }

      throw error;
    }
  }));

  router.put('/agreements/:id', asyncHandler(async (req, res) => {
    try {
      const agreement = await updateAgreement(req.params.id, req.body || {}, req.tenantId);

      if (!agreement) {
        res.status(404).json({ error: 'Agreement not found.' });
        return;
      }

      res.json({ data: agreement });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreements');
        return;
      }

      throw error;
    }
  }));

  router.post('/agreements/:id/sign', asyncHandler(async (req, res) => {
    try {
      const agreement = await markAgreementSigned(req.params.id, req.tenantId);
      res.json({ data: agreement });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreements');
        return;
      }

      throw error;
    }
  }));

  router.delete('/agreements/:id', asyncHandler(async (req, res) => {
    try {
      const deletedAgreement = await deleteAgreementById(req.params.id, req.tenantId);

      if (!deletedAgreement) {
        res.status(404).json({ error: 'Agreement not found.' });
        return;
      }

      res.json({ data: deletedAgreement });
    } catch (error) {
      if (isMissingSchemaError(error)) {
        sendSchemaUnavailable(res, 'Agreements');
        return;
      }

      throw error;
    }
  }));

  return router;
};
