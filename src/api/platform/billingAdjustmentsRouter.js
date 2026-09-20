import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';
import { agreementOverlapsBillingPeriod } from './billingLifecycle.js';
import {
  isBillingAdjustmentAmountAllowed,
  isBillingAdjustmentTypeAllowed,
  normalizeBillingAdjustmentAmount,
  normalizeBillingAdjustmentType
} from './billingAdjustments.js';
import { getBillingReminderPortalUrl, sendBillingReminderEmail } from './billingReminderEmail.js';

const createRequestError = (status, message, code, details = null) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
};

const bindParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

const runQuery = async (executor, queryText, params = {}) => {
  const request = executor instanceof sql.Transaction
    ? new sql.Request(executor)
    : executor.request();
  bindParams(request, params);
  const result = await request.query(queryText);
  return result.recordset || [];
};

const runSingle = async (executor, queryText, params = {}) => {
  const rows = await runQuery(executor, queryText, params);
  return rows[0] || null;
};

const requireInvoiceManage = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.INVOICES_MANAGE);
};

const requirePropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return;
  const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
  if (!propertyId || !assigned.has(String(propertyId))) {
    throw createRequestError(403, 'The tenancy property is not assigned to the current staff account.', 'RESOURCE_ACCESS_DENIED');
  }
};

const normalizeBillingPeriod = (value) => {
  const period = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw createRequestError(400, 'billingPeriod must use YYYY-MM format.', 'INVALID_BILLING_PERIOD');
  }
  return period;
};

const getPeriodBounds = (billingPeriod) => {
  const [year, month] = billingPeriod.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, month, 1)).toISOString()
  };
};

const hasAdjustmentSchema = async (executor) => {
  const row = await runSingle(
    executor,
    `SELECT CASE WHEN OBJECT_ID(N'dbo.tenancy_billing_adjustments', N'U') IS NULL THEN 0 ELSE 1 END AS available`
  );
  return Boolean(row?.available);
};

const loadAgreement = async (pool, tenantId, agreementId) => runSingle(
  pool,
  `SELECT TOP 1 a.id, a.renteeid, a.propertyid, a.unitid, a.rentamount,
          a.startdate, a.enddate, a.status,
          p.name AS property_name, au.name AS rentee_name
   FROM agreements a
   INNER JOIN properties p ON p.id = a.propertyid AND p.tenant_id = a.tenant_id
   LEFT JOIN app_users au ON au.id = a.renteeid AND au.tenant_id = a.tenant_id
   WHERE a.tenant_id = @tenantId AND a.id = @agreementId`,
  { tenantId, agreementId }
);

const insertLifecycleEvent = async (executor, {
  tenantId,
  invoiceId = null,
  eventType,
  actorUserId,
  metadata
}) => {
  await runQuery(
    executor,
    `INSERT INTO billing_lifecycle_events (
       tenant_id, invoice_id, event_type, actor_user_id, metadata
     ) VALUES (
       @tenantId, @invoiceId, @eventType, @actorUserId, @metadata
     )`,
    {
      tenantId,
      invoiceId,
      eventType,
      actorUserId,
      metadata: JSON.stringify(metadata || {})
    }
  );
};

const formatMoney = (amount) => {
  const value = Number(amount || 0);
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
};

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

export const createBillingAdjustmentsRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'billing-adjustments'
  }));

  router.get('/monthly-billing-context', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const propertyId = String(req.query?.propertyId || '').trim();
      if (!propertyId) {
        throw createRequestError(400, 'propertyId is required.', 'PROPERTY_REQUIRED');
      }
      requirePropertyScope(req, propertyId);

      const billingPeriod = normalizeBillingPeriod(req.query?.billingPeriod);
      const { start, end } = getPeriodBounds(billingPeriod);
      const pool = await getMssqlPool();

      const agreements = await runQuery(
        pool,
        `SELECT a.id, a.renteeid, a.propertyid, a.unitid, a.rentamount,
                a.startdate, a.enddate,
                p.name AS property_name, au.name AS rentee_name,
                CASE WHEN EXISTS (
                  SELECT 1 FROM invoices i
                  WHERE i.tenant_id = a.tenant_id
                    AND i.agreementid = a.id
                    AND i.billingperiod = @billingPeriod
                ) THEN CAST(1 AS bit) ELSE CAST(0 AS bit) END AS invoice_exists
         FROM agreements a
         INNER JOIN properties p ON p.id = a.propertyid AND p.tenant_id = a.tenant_id
         LEFT JOIN app_users au ON au.id = a.renteeid AND au.tenant_id = a.tenant_id
         WHERE a.tenant_id = @tenantId
           AND a.propertyid = @propertyId
           AND a.status = 'active'
         ORDER BY au.name, a.createdat`,
        { tenantId: req.tenantId, propertyId, billingPeriod }
      );

      const tenancies = agreements.filter((agreement) => agreementOverlapsBillingPeriod({
        agreementStart: agreement.startdate,
        agreementEnd: agreement.enddate,
        periodStart: start,
        periodEnd: end
      }));

      const schemaAvailable = await hasAdjustmentSchema(pool);
      let adjustments = [];
      if (schemaAvailable) {
        adjustments = await runQuery(
          pool,
          `SELECT ba.*, p.name AS property_name, au.name AS rentee_name
           FROM tenancy_billing_adjustments ba
           INNER JOIN agreements a
             ON a.id = ba.agreement_id
            AND a.tenant_id = ba.tenant_id
           INNER JOIN properties p
             ON p.id = a.propertyid
            AND p.tenant_id = a.tenant_id
           LEFT JOIN app_users au
             ON au.id = a.renteeid
            AND au.tenant_id = a.tenant_id
           WHERE ba.tenant_id = @tenantId
             AND a.propertyid = @propertyId
             AND ba.billing_period = @billingPeriod
           ORDER BY ba.created_at, ba.id`,
          { tenantId: req.tenantId, propertyId, billingPeriod }
        );
      }

      res.json({
        data: {
          billingPeriod,
          schemaAvailable,
          tenancies,
          adjustments
        },
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/agreements/:agreementId/billing-adjustments', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const billingPeriod = normalizeBillingPeriod(req.body?.billingPeriod);
      const componentType = normalizeBillingAdjustmentType(req.body?.componentType);
      const amount = normalizeBillingAdjustmentAmount(req.body?.amount);
      const description = String(req.body?.description || '').trim();

      if (!isBillingAdjustmentTypeAllowed(componentType)) {
        throw createRequestError(400, 'componentType must be arrears, tax, adjustment, or other.', 'INVALID_ADJUSTMENT_TYPE');
      }
      if (!isBillingAdjustmentAmountAllowed(componentType, amount)) {
        throw createRequestError(
          400,
          componentType === 'adjustment'
            ? 'Adjustment amount must be non-zero.'
            : 'Arrears, tax, and other charges must be greater than zero.',
          'INVALID_ADJUSTMENT_AMOUNT'
        );
      }
      if (!description) {
        throw createRequestError(400, 'A description is required for an additional charge.', 'ADJUSTMENT_DESCRIPTION_REQUIRED');
      }

      const pool = await getMssqlPool();
      if (!await hasAdjustmentSchema(pool)) {
        throw createRequestError(503, 'Billing adjustments schema is not available yet.', 'BILLING_ADJUSTMENTS_SCHEMA_REQUIRED');
      }

      const agreement = await loadAgreement(pool, req.tenantId, req.params.agreementId);
      if (!agreement || String(agreement.status).toLowerCase() !== 'active') {
        throw createRequestError(404, 'Active tenancy agreement not found.', 'ACTIVE_AGREEMENT_NOT_FOUND');
      }
      requirePropertyScope(req, agreement.propertyid);

      const { start, end } = getPeriodBounds(billingPeriod);
      if (!agreementOverlapsBillingPeriod({
        agreementStart: agreement.startdate,
        agreementEnd: agreement.enddate,
        periodStart: start,
        periodEnd: end
      })) {
        throw createRequestError(409, 'The selected billing month is outside the tenancy period.', 'OUTSIDE_AGREEMENT_PERIOD');
      }

      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const existingInvoice = await runSingle(
          transaction,
          `SELECT TOP 1 id
           FROM invoices WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId
             AND agreementid = @agreementId
             AND billingperiod = @billingPeriod`,
          { tenantId: req.tenantId, agreementId: agreement.id, billingPeriod }
        );
        if (existingInvoice) {
          throw createRequestError(
            409,
            'An invoice already exists for this tenancy and billing month. Add the charge to a future billing period instead.',
            'BILLING_PERIOD_ALREADY_INVOICED'
          );
        }

        const adjustment = await runSingle(
          transaction,
          `INSERT INTO tenancy_billing_adjustments (
             tenant_id, agreement_id, billing_period, component_type,
             description, amount, status, created_by, approved_by, metadata
           ) OUTPUT INSERTED.*
           VALUES (
             @tenantId, @agreementId, @billingPeriod, @componentType,
             @description, @amount, 'approved', @actorUserId, @actorUserId, @metadata
           )`,
          {
            tenantId: req.tenantId,
            agreementId: agreement.id,
            billingPeriod,
            componentType,
            description,
            amount,
            actorUserId: req.user.id,
            metadata: JSON.stringify({ source: 'monthly_billing_ui' })
          }
        );

        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          eventType: 'billing_adjustment_approved',
          actorUserId: req.user.id,
          metadata: {
            adjustmentId: adjustment.id,
            agreementId: agreement.id,
            billingPeriod,
            componentType,
            amount
          }
        });

        await transaction.commit();
        res.status(201).json({ data: adjustment, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/billing-adjustments/:adjustmentId/void', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const reason = String(req.body?.reason || '').trim();
      if (!reason) {
        throw createRequestError(400, 'A void reason is required.', 'VOID_REASON_REQUIRED');
      }

      const pool = await getMssqlPool();
      if (!await hasAdjustmentSchema(pool)) {
        throw createRequestError(503, 'Billing adjustments schema is not available yet.', 'BILLING_ADJUSTMENTS_SCHEMA_REQUIRED');
      }

      const adjustment = await runSingle(
        pool,
        `SELECT TOP 1 ba.*, a.propertyid
         FROM tenancy_billing_adjustments ba
         INNER JOIN agreements a
           ON a.id = ba.agreement_id
          AND a.tenant_id = ba.tenant_id
         WHERE ba.tenant_id = @tenantId AND ba.id = @adjustmentId`,
        { tenantId: req.tenantId, adjustmentId: req.params.adjustmentId }
      );
      if (!adjustment) {
        throw createRequestError(404, 'Billing adjustment not found.', 'BILLING_ADJUSTMENT_NOT_FOUND');
      }
      requirePropertyScope(req, adjustment.propertyid);

      if (adjustment.invoice_id) {
        throw createRequestError(409, 'An invoiced adjustment cannot be voided.', 'ADJUSTMENT_ALREADY_INVOICED');
      }
      if (String(adjustment.status).toLowerCase() === 'voided') {
        res.json({ data: adjustment, error: null });
        return;
      }

      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const updated = await runSingle(
          transaction,
          `UPDATE tenancy_billing_adjustments
           SET status = 'voided',
               voided_by = @actorUserId,
               voided_at = SYSUTCDATETIME(),
               void_reason = @reason
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId
             AND id = @adjustmentId
             AND invoice_id IS NULL
             AND status = 'approved'`,
          {
            tenantId: req.tenantId,
            adjustmentId: adjustment.id,
            actorUserId: req.user.id,
            reason
          }
        );

        if (!updated) {
          throw createRequestError(409, 'The billing adjustment changed before it could be voided.', 'ADJUSTMENT_STATE_CHANGED');
        }

        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          eventType: 'billing_adjustment_voided',
          actorUserId: req.user.id,
          metadata: {
            adjustmentId: adjustment.id,
            agreementId: adjustment.agreement_id,
            billingPeriod: adjustment.billing_period,
            reason
          }
        });

        await transaction.commit();
        res.json({ data: updated, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices/:invoiceId/send-reminder', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const pool = await getMssqlPool();
      const invoice = await runSingle(
        pool,
        `SELECT TOP 1 i.id, i.propertyid, i.renteeid, i.billingperiod, i.totalamount,
                i.duedate, i.status, i.reminderdate,
                p.name AS property_name,
                au.name AS rentee_name,
                au.email AS rentee_email,
                COALESCE((
                  SELECT SUM(CASE WHEN pay.status = 'verified' THEN pay.amount ELSE 0 END)
                  FROM payments pay
                  WHERE pay.tenant_id = i.tenant_id AND pay.invoiceid = i.id
                ), 0) AS verified_amount,
                COALESCE((
                  SELECT SUM(CASE WHEN pay.status = 'pending' THEN 1 ELSE 0 END)
                  FROM payments pay
                  WHERE pay.tenant_id = i.tenant_id AND pay.invoiceid = i.id
                ), 0) AS pending_payment_count
         FROM invoices i
         LEFT JOIN properties p
           ON p.id = i.propertyid
          AND p.tenant_id = i.tenant_id
         LEFT JOIN app_users au
           ON au.id = i.renteeid
          AND au.tenant_id = i.tenant_id
         WHERE i.tenant_id = @tenantId AND i.id = @invoiceId`,
        { tenantId: req.tenantId, invoiceId: req.params.invoiceId }
      );

      if (!invoice) {
        throw createRequestError(404, 'Invoice not found.', 'INVOICE_NOT_FOUND');
      }
      requirePropertyScope(req, invoice.propertyid);

      const outstandingBalance = Math.max(
        0,
        Math.round((Number(invoice.totalamount || 0) - Number(invoice.verified_amount || 0)) * 100) / 100
      );
      if (String(invoice.status || '').toLowerCase() === 'paid' || outstandingBalance <= 0) {
        throw createRequestError(409, 'A reminder is not required for a paid invoice.', 'INVOICE_ALREADY_PAID');
      }
      if (Number(invoice.pending_payment_count || 0) > 0) {
        throw createRequestError(
          409,
          'A payment proof is already awaiting verification. Review it before sending a reminder.',
          'PAYMENT_VERIFICATION_PENDING'
        );
      }
      if (!invoice.rentee_email) {
        throw createRequestError(409, 'The tenant does not have an email address for payment reminders.', 'RENTEE_EMAIL_REQUIRED');
      }

      await insertLifecycleEvent(pool, {
        tenantId: req.tenantId,
        invoiceId: invoice.id,
        eventType: 'payment_reminder_attempted',
        actorUserId: req.user.id,
        metadata: {
          to: invoice.rentee_email,
          outstandingBalance
        }
      });

      const portalUrl = getBillingReminderPortalUrl();
      const subject = `KH Rentals payment reminder - ${invoice.billingperiod || 'invoice'}`;
      const tenantName = invoice.rentee_name || 'Tenant';
      const propertyName = invoice.property_name || 'your property';
      const dueDate = invoice.duedate ? new Date(invoice.duedate).toLocaleDateString('en-GB') : 'the invoice due date';
      const amountDue = formatMoney(outstandingBalance);
      const text = [
        `Dear ${tenantName},`,
        '',
        `This is a payment reminder for your KH Rentals invoice for ${propertyName}.`,
        `Billing period: ${invoice.billingperiod || 'N/A'}`,
        `Outstanding balance: ${amountDue}`,
        `Due date: ${dueDate}`,
        '',
        portalUrl ? `View your invoices: ${portalUrl}` : 'Please open the KH Rentals tenant portal to review your invoice.',
        '',
        'If you have already paid, please submit your payment proof in the tenant portal.',
        '',
        'KH Rentals'
      ].join('\n');
      const safeTenantName = escapeHtml(tenantName);
      const safePropertyName = escapeHtml(propertyName);
      const safeBillingPeriod = escapeHtml(invoice.billingperiod || 'N/A');
      const safeDueDate = escapeHtml(dueDate);
      const safeAmountDue = escapeHtml(amountDue);
      const safePortalUrl = portalUrl ? escapeHtml(portalUrl) : null;
      const html = `<p>Dear ${safeTenantName},</p><p>This is a payment reminder for your KH Rentals invoice for <strong>${safePropertyName}</strong>.</p><p><strong>Billing period:</strong> ${safeBillingPeriod}<br><strong>Outstanding balance:</strong> ${safeAmountDue}<br><strong>Due date:</strong> ${safeDueDate}</p>${safePortalUrl ? `<p><a href="${safePortalUrl}">View your invoices</a></p>` : '<p>Please open the KH Rentals tenant portal to review your invoice.</p>'}<p>If you have already paid, please submit your payment proof in the tenant portal.</p><p>KH Rentals</p>`;

      try {
        const delivery = await sendBillingReminderEmail({
          to: invoice.rentee_email,
          subject,
          text,
          html
        });

        const transaction = new sql.Transaction(pool);
        await transaction.begin();
        try {
          await runQuery(
            transaction,
            `UPDATE invoices
             SET reminderdate = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId AND id = @invoiceId`,
            { tenantId: req.tenantId, invoiceId: invoice.id }
          );
          await insertLifecycleEvent(transaction, {
            tenantId: req.tenantId,
            invoiceId: invoice.id,
            eventType: 'payment_reminder_sent',
            actorUserId: req.user.id,
            metadata: {
              to: invoice.rentee_email,
              provider: delivery.provider,
              outstandingBalance
            }
          });
          await transaction.commit();
        } catch (error) {
          await transaction.rollback().catch(() => {});
          throw error;
        }

        res.json({
          data: {
            invoiceId: invoice.id,
            sent: true,
            provider: delivery.provider,
            to: invoice.rentee_email,
            outstandingBalance
          },
          error: null
        });
      } catch (deliveryError) {
        await insertLifecycleEvent(pool, {
          tenantId: req.tenantId,
          invoiceId: invoice.id,
          eventType: 'payment_reminder_failed',
          actorUserId: req.user.id,
          metadata: {
            to: invoice.rentee_email,
            outstandingBalance,
            code: deliveryError?.code || null,
            error: deliveryError?.message || 'Email delivery failed'
          }
        }).catch(() => {});
        throw deliveryError;
      }
    } catch (error) {
      next(error);
    }
  });

  return router;
};
