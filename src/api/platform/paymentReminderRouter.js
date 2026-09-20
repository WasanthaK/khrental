import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';
import { PAYMENT_STATUS, calculateOutstandingBalance } from './billingLifecycle.js';
import { buildPaymentReminderEmail } from './paymentReminder.js';

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

const queryTransaction = async (transaction, queryText, params = {}) => {
  const request = bindParams(new sql.Request(transaction), params);
  const result = await request.query(queryText);
  return result.recordset || [];
};

const requireInvoiceManage = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.INVOICES_MANAGE);
};

const requirePropertyScope = (req, propertyId) => {
  if (isAdminRole({ user: req.user, membership: req.membership })) return;
  const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
  if (!propertyId || !assigned.has(String(propertyId))) {
    throw createRequestError(403, 'The invoice property is not assigned to the current staff account.', 'RESOURCE_ACCESS_DENIED');
  }
};

const loadInvoice = async (tenantId, invoiceId) => {
  const invoice = await runSingleQuery(
    `SELECT TOP 1 i.*, p.name AS property_name, au.name AS rentee_name, au.email AS rentee_email
     FROM invoices i
     LEFT JOIN properties p
       ON p.id = i.propertyid
      AND p.tenant_id = i.tenant_id
     LEFT JOIN app_users au
       ON au.id = i.renteeid
      AND au.tenant_id = i.tenant_id
     WHERE i.tenant_id = @tenantId AND i.id = @invoiceId`,
    { tenantId, invoiceId }
  );

  if (!invoice) throw createRequestError(404, 'Invoice not found.', 'INVOICE_NOT_FOUND');
  return invoice;
};

const loadPayments = async (tenantId, invoiceId) => runQuery(
  `SELECT amount, status
   FROM payments
   WHERE tenant_id = @tenantId AND invoiceid = @invoiceId`,
  { tenantId, invoiceId }
);

const insertLifecycleEvent = async (transaction, {
  tenantId,
  invoiceId,
  eventType,
  invoiceStatus,
  actorUserId,
  metadata = null
}) => {
  await queryTransaction(
    transaction,
    `INSERT INTO billing_lifecycle_events (
       tenant_id, invoice_id, event_type, from_status, to_status, actor_user_id, metadata
     ) VALUES (
       @tenantId, @invoiceId, @eventType, @invoiceStatus, @invoiceStatus, @actorUserId, @metadata
     )`,
    {
      tenantId,
      invoiceId,
      eventType,
      invoiceStatus,
      actorUserId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  );
};

const recordEvent = async (payload) => {
  const pool = await getMssqlPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    await insertLifecycleEvent(transaction, payload);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => {});
    throw error;
  }
};

const safeFailureReason = (error) => String(error?.message || 'Email delivery failed').slice(0, 500);

export const createPaymentReminderRouter = ({ sendEmail } = {}) => {
  if (typeof sendEmail !== 'function') {
    throw new Error('createPaymentReminderRouter requires a sendEmail function.');
  }

  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'payment-reminder-delivery'
  }));

  router.post('/invoices/:invoiceId/reminder', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      requirePropertyScope(req, invoice.propertyid);

      const payments = await loadPayments(req.tenantId, invoice.id);
      const outstandingBalance = calculateOutstandingBalance(invoice.totalamount, payments);
      const hasPendingPayment = payments.some(
        (payment) => String(payment.status || '').toLowerCase() === PAYMENT_STATUS.PENDING
      );

      if (outstandingBalance <= 0 || String(invoice.status || '').toLowerCase() === 'paid') {
        throw createRequestError(409, 'A reminder is not required for a paid invoice.', 'INVOICE_ALREADY_PAID');
      }
      if (hasPendingPayment) {
        throw createRequestError(
          409,
          'A payment proof is awaiting verification. Verify or reject it before sending a payment reminder.',
          'PAYMENT_VERIFICATION_PENDING'
        );
      }

      const recipient = String(invoice.rentee_email || '').trim();
      const auditBase = {
        tenantId: req.tenantId,
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        actorUserId: req.user.id
      };

      await recordEvent({
        ...auditBase,
        eventType: 'payment_reminder_attempted',
        metadata: { channel: 'email', outstandingBalance }
      });

      if (!recipient) {
        await recordEvent({
          ...auditBase,
          eventType: 'payment_reminder_failed',
          metadata: { channel: 'email', reason: 'Tenant email is missing.' }
        });
        throw createRequestError(
          409,
          'The tenant does not have an email address on file.',
          'TENANT_EMAIL_REQUIRED'
        );
      }

      const message = buildPaymentReminderEmail({ invoice, outstandingBalance });
      let delivery;
      try {
        delivery = await sendEmail({
          to: recipient,
          subject: message.subject,
          text: message.text,
          html: message.html
        });
      } catch (deliveryError) {
        await recordEvent({
          ...auditBase,
          eventType: 'payment_reminder_failed',
          metadata: {
            channel: 'email',
            provider: deliveryError?.provider || null,
            code: deliveryError?.code || null,
            reason: safeFailureReason(deliveryError)
          }
        });
        throw createRequestError(
          Number(deliveryError?.status) || 502,
          'The payment reminder email could not be delivered.',
          'PAYMENT_REMINDER_DELIVERY_FAILED'
        );
      }

      const deliveredAt = new Date().toISOString();
      await runQuery(
        `UPDATE invoices
         SET reminderdate = @deliveredAt, updatedat = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @invoiceId`,
        { tenantId: req.tenantId, invoiceId: invoice.id, deliveredAt }
      );

      await recordEvent({
        ...auditBase,
        eventType: 'payment_reminder_sent',
        metadata: {
          channel: 'email',
          provider: delivery?.provider || 'email',
          outstandingBalance,
          deliveredAt
        }
      });

      res.json({
        data: {
          invoice: await loadInvoice(req.tenantId, invoice.id),
          delivery: {
            channel: 'email',
            provider: delivery?.provider || 'email',
            deliveredAt
          }
        },
        error: null
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
