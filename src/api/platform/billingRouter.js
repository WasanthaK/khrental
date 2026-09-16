import crypto from 'node:crypto';
import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { runQuery, runSingleQuery } from '../mssql/query.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole, isTenantRole } from './permissionEngine.js';
import {
  PAYMENT_STATUS,
  calculateOutstandingBalance,
  getInvoiceStatusAfterVerification,
  canSubmitPaymentProof
} from './billingLifecycle.js';

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

const singleTransaction = async (transaction, queryText, params = {}) => {
  const rows = await queryTransaction(transaction, queryText, params);
  return rows[0] || null;
};

const requireInvoiceRead = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.INVOICES_READ);
};

const requirePaymentManage = (req) => {
  authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.PAYMENTS_MANAGE);
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
    `SELECT TOP 1 i.*, a.status AS agreement_status, a.unitid, a.rentamount,
            p.name AS property_name, au.name AS rentee_name, au.email AS rentee_email
     FROM invoices i
     LEFT JOIN agreements a
       ON a.id = i.agreementid
      AND a.tenant_id = i.tenant_id
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
  `SELECT * FROM payments
   WHERE tenant_id = @tenantId AND invoiceid = @invoiceId
   ORDER BY createdat DESC`,
  { tenantId, invoiceId }
);

const loadReceipts = async (tenantId, invoiceId) => runQuery(
  `SELECT r.*, p.paymentmethod, p.transactionreference, p.paymentdate
   FROM payment_receipts r
   INNER JOIN payments p ON p.id = r.payment_id AND p.tenant_id = r.tenant_id
   WHERE r.tenant_id = @tenantId AND r.invoice_id = @invoiceId
   ORDER BY r.issued_at DESC`,
  { tenantId, invoiceId }
);

const assertInvoiceAccess = (req, invoice, manage = false) => {
  if (isTenantRole({ user: req.user, membership: req.membership })) {
    if (String(invoice.renteeid || '') !== String(req.user?.id || '')) {
      throw createRequestError(403, 'This invoice does not belong to the current tenant account.', 'RESOURCE_ACCESS_DENIED');
    }
    return;
  }

  if (manage) requirePaymentManage(req);
  else requireInvoiceRead(req);
  requirePropertyScope(req, invoice.propertyid);
};

const buildAccountProjection = async (req, invoice) => {
  const [payments, receipts, components] = await Promise.all([
    loadPayments(req.tenantId, invoice.id),
    loadReceipts(req.tenantId, invoice.id),
    runQuery(
      `SELECT * FROM invoice_components
       WHERE tenant_id = @tenantId AND invoice_id = @invoiceId
       ORDER BY createdat, component_type`,
      { tenantId: req.tenantId, invoiceId: invoice.id }
    )
  ]);
  const outstandingBalance = calculateOutstandingBalance(invoice.totalamount, payments);
  return { invoice, components, payments, receipts, outstandingBalance };
};

const makeReceiptNumber = () => {
  const date = new Date();
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `KHR-${y}${m}-${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`;
};

const insertLifecycleEvent = async (transaction, {
  tenantId,
  invoiceId,
  paymentId = null,
  eventType,
  fromStatus = null,
  toStatus = null,
  actorUserId = null,
  metadata = null
}) => {
  await queryTransaction(
    transaction,
    `INSERT INTO billing_lifecycle_events (
       tenant_id, invoice_id, payment_id, event_type, from_status, to_status, actor_user_id, metadata
     ) VALUES (
       @tenantId, @invoiceId, @paymentId, @eventType, @fromStatus, @toStatus, @actorUserId, @metadata
     )`,
    {
      tenantId,
      invoiceId,
      paymentId,
      eventType,
      fromStatus,
      toStatus,
      actorUserId,
      metadata: metadata ? JSON.stringify(metadata) : null
    }
  );
};

const issueReceipt = async (transaction, { tenantId, invoice, payment, actorUserId }) => {
  const existing = await singleTransaction(
    transaction,
    `SELECT TOP 1 * FROM payment_receipts
     WHERE tenant_id = @tenantId AND payment_id = @paymentId`,
    { tenantId, paymentId: payment.id }
  );
  if (existing) return existing;

  const snapshot = {
    invoiceId: invoice.id,
    billingPeriod: invoice.billingperiod,
    propertyId: invoice.propertyid,
    renteeId: invoice.renteeid,
    amount: Number(payment.amount),
    paymentMethod: payment.paymentmethod || null,
    transactionReference: payment.transactionreference || null
  };

  return singleTransaction(
    transaction,
    `INSERT INTO payment_receipts (
       tenant_id, payment_id, invoice_id, receipt_number, amount, issued_by, snapshot
     ) OUTPUT INSERTED.*
     VALUES (@tenantId, @paymentId, @invoiceId, @receiptNumber, @amount, @issuedBy, @snapshot)`,
    {
      tenantId,
      paymentId: payment.id,
      invoiceId: invoice.id,
      receiptNumber: makeReceiptNumber(),
      amount: payment.amount,
      issuedBy: actorUserId,
      snapshot: JSON.stringify(snapshot)
    }
  );
};

export const createBillingRouter = () => {
  const router = express.Router();

  router.use(createTenantContextMiddleware({
    requireUser: true,
    requireTenant: true,
    auditLabel: 'billing-lifecycle'
  }));

  router.get('/invoices/:invoiceId/account', async (req, res, next) => {
    try {
      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      assertInvoiceAccess(req, invoice, false);
      res.json({ data: await buildAccountProjection(req, invoice), error: null });
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices/:invoiceId/payment-proof', async (req, res, next) => {
    try {
      if (!isTenantRole({ user: req.user, membership: req.membership })) {
        throw createRequestError(403, 'Tenant portal access is required to submit payment proof.', 'TENANT_PORTAL_REQUIRED');
      }

      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      assertInvoiceAccess(req, invoice, false);
      const proofUrl = String(req.body?.proofUrl || '').trim();
      if (!proofUrl) throw createRequestError(400, 'proofUrl is required.', 'PAYMENT_PROOF_REQUIRED');

      const payments = await loadPayments(req.tenantId, invoice.id);
      const outstandingBalance = calculateOutstandingBalance(invoice.totalamount, payments);
      const hasPendingPayment = payments.some((payment) => String(payment.status).toLowerCase() === PAYMENT_STATUS.PENDING);
      if (!canSubmitPaymentProof({ invoiceStatus: invoice.status, outstandingBalance, hasPendingPayment })) {
        throw createRequestError(409, 'A payment proof cannot be submitted for this invoice in its current state.', 'PAYMENT_SUBMISSION_BLOCKED');
      }

      const requestedAmount = req.body?.amount === undefined ? outstandingBalance : Number(req.body.amount);
      if (!Number.isFinite(requestedAmount) || requestedAmount <= 0 || requestedAmount > outstandingBalance) {
        throw createRequestError(400, 'Payment amount must be greater than zero and cannot exceed the outstanding balance.', 'INVALID_PAYMENT_AMOUNT');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const lockedInvoice = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM invoices WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        if (!lockedInvoice) throw createRequestError(404, 'Invoice not found.', 'INVOICE_NOT_FOUND');

        const pending = await singleTransaction(
          transaction,
          `SELECT TOP 1 id FROM payments WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND invoiceid = @invoiceId AND status = 'pending'`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        if (pending) throw createRequestError(409, 'A payment is already awaiting verification for this invoice.', 'PAYMENT_ALREADY_PENDING');

        const payment = await singleTransaction(
          transaction,
          `INSERT INTO payments (
             tenant_id, invoiceid, propertyid, renteeid, amount, paymentmethod,
             transactionreference, paymentdate, status, notes, proofurl,
             submitted_by, submitted_at
           ) OUTPUT INSERTED.*
           VALUES (
             @tenantId, @invoiceId, @propertyId, @renteeId, @amount, @paymentMethod,
             @transactionReference, @paymentDate, 'pending', @notes, @proofUrl,
             @submittedBy, SYSUTCDATETIME()
           )`,
          {
            tenantId: req.tenantId,
            invoiceId: invoice.id,
            propertyId: invoice.propertyid,
            renteeId: invoice.renteeid,
            amount: requestedAmount,
            paymentMethod: req.body?.paymentMethod || null,
            transactionReference: req.body?.transactionReference || null,
            paymentDate: req.body?.paymentDate || new Date().toISOString(),
            notes: req.body?.notes || null,
            proofUrl,
            submittedBy: req.user.id
          }
        );

        await queryTransaction(
          transaction,
          `UPDATE invoices
           SET status = 'verification_pending', paymentproofurl = @proofUrl,
               paymentdate = @paymentDate, updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          {
            tenantId: req.tenantId,
            invoiceId: invoice.id,
            proofUrl,
            paymentDate: payment.paymentdate || new Date().toISOString()
          }
        );

        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          eventType: 'payment_submitted',
          fromStatus: invoice.status,
          toStatus: 'verification_pending',
          actorUserId: req.user.id,
          metadata: { amount: requestedAmount }
        });

        await transaction.commit();
        const refreshed = await loadInvoice(req.tenantId, invoice.id);
        res.status(201).json({ data: { invoice: refreshed, payment }, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices/:invoiceId/verify-payment', async (req, res, next) => {
    try {
      requirePaymentManage(req);
      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      requirePropertyScope(req, invoice.propertyid);
      const approved = Boolean(req.body?.approved);
      const notes = String(req.body?.notes || '').trim();
      if (!approved && !notes) {
        throw createRequestError(400, 'A rejection reason is required.', 'PAYMENT_REJECTION_REASON_REQUIRED');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const lockedInvoice = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM invoices WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        const payment = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM payments WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND invoiceid = @invoiceId AND status = 'pending'
           ORDER BY createdat DESC`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        if (!payment) throw createRequestError(409, 'No payment is awaiting verification for this invoice.', 'NO_PENDING_PAYMENT');

        const newPaymentStatus = approved ? PAYMENT_STATUS.VERIFIED : PAYMENT_STATUS.REJECTED;
        const updatedPayment = await singleTransaction(
          transaction,
          `UPDATE payments
           SET status = @status,
               verified_by = @verifiedBy,
               verified_at = SYSUTCDATETIME(),
               rejection_reason = @rejectionReason,
               notes = CASE WHEN @notes IS NULL OR @notes = '' THEN notes ELSE @notes END,
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.*
           WHERE tenant_id = @tenantId AND id = @paymentId AND status = 'pending'`,
          {
            tenantId: req.tenantId,
            paymentId: payment.id,
            status: newPaymentStatus,
            verifiedBy: req.user.id,
            rejectionReason: approved ? null : notes,
            notes: notes || null
          }
        );
        if (!updatedPayment) throw createRequestError(409, 'This payment has already been processed.', 'PAYMENT_ALREADY_PROCESSED');

        let receipt = null;
        if (approved) {
          receipt = await issueReceipt(transaction, {
            tenantId: req.tenantId,
            invoice: lockedInvoice,
            payment: updatedPayment,
            actorUserId: req.user.id
          });
        }

        const allPayments = await queryTransaction(
          transaction,
          `SELECT * FROM payments WHERE tenant_id = @tenantId AND invoiceid = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        const nextInvoiceStatus = getInvoiceStatusAfterVerification({
          invoiceAmount: lockedInvoice.totalamount,
          payments: allPayments,
          dueDate: lockedInvoice.duedate
        });

        await queryTransaction(
          transaction,
          `UPDATE invoices
           SET status = @status,
               paymentdate = CASE WHEN @status = 'paid' THEN COALESCE(paymentdate, SYSUTCDATETIME()) ELSE paymentdate END,
               updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id, status: nextInvoiceStatus }
        );

        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          eventType: approved ? 'payment_verified' : 'payment_rejected',
          fromStatus: lockedInvoice.status,
          toStatus: nextInvoiceStatus,
          actorUserId: req.user.id,
          metadata: { amount: Number(updatedPayment.amount), notes: notes || null, receiptId: receipt?.id || null }
        });

        await transaction.commit();
        const refreshed = await loadInvoice(req.tenantId, invoice.id);
        res.json({ data: { invoice: refreshed, payment: updatedPayment, receipt }, error: null });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices/:invoiceId/manual-payment', async (req, res, next) => {
    try {
      requirePaymentManage(req);
      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      requirePropertyScope(req, invoice.propertyid);
      const currentPayments = await loadPayments(req.tenantId, invoice.id);
      const outstanding = calculateOutstandingBalance(invoice.totalamount, currentPayments);
      const amount = req.body?.amount === undefined ? outstanding : Number(req.body.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > outstanding) {
        throw createRequestError(400, 'Payment amount must be greater than zero and cannot exceed the outstanding balance.', 'INVALID_PAYMENT_AMOUNT');
      }

      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        const lockedInvoice = await singleTransaction(
          transaction,
          `SELECT TOP 1 * FROM invoices WITH (UPDLOCK, HOLDLOCK)
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        const payment = await singleTransaction(
          transaction,
          `INSERT INTO payments (
             tenant_id, invoiceid, propertyid, renteeid, amount, paymentmethod,
             transactionreference, paymentdate, status, notes, submitted_by,
             submitted_at, verified_by, verified_at
           ) OUTPUT INSERTED.*
           VALUES (
             @tenantId, @invoiceId, @propertyId, @renteeId, @amount, @paymentMethod,
             @transactionReference, @paymentDate, 'verified', @notes, @actorUserId,
             SYSUTCDATETIME(), @actorUserId, SYSUTCDATETIME()
           )`,
          {
            tenantId: req.tenantId,
            invoiceId: invoice.id,
            propertyId: invoice.propertyid,
            renteeId: invoice.renteeid,
            amount,
            paymentMethod: req.body?.paymentMethod || 'manual',
            transactionReference: req.body?.transactionReference || null,
            paymentDate: req.body?.paymentDate || new Date().toISOString(),
            notes: req.body?.notes || null,
            actorUserId: req.user.id
          }
        );
        const receipt = await issueReceipt(transaction, {
          tenantId: req.tenantId,
          invoice: lockedInvoice,
          payment,
          actorUserId: req.user.id
        });
        const allPayments = await queryTransaction(
          transaction,
          `SELECT * FROM payments WHERE tenant_id = @tenantId AND invoiceid = @invoiceId`,
          { tenantId: req.tenantId, invoiceId: invoice.id }
        );
        const nextInvoiceStatus = getInvoiceStatusAfterVerification({
          invoiceAmount: lockedInvoice.totalamount,
          payments: allPayments,
          dueDate: lockedInvoice.duedate
        });
        await queryTransaction(
          transaction,
          `UPDATE invoices SET status = @status,
             paymentdate = CASE WHEN @status = 'paid' THEN COALESCE(paymentdate, @paymentDate) ELSE paymentdate END,
             updatedat = SYSUTCDATETIME()
           WHERE tenant_id = @tenantId AND id = @invoiceId`,
          {
            tenantId: req.tenantId,
            invoiceId: invoice.id,
            status: nextInvoiceStatus,
            paymentDate: payment.paymentdate || new Date().toISOString()
          }
        );
        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          invoiceId: invoice.id,
          paymentId: payment.id,
          eventType: 'manual_payment_recorded',
          fromStatus: lockedInvoice.status,
          toStatus: nextInvoiceStatus,
          actorUserId: req.user.id,
          metadata: { amount, receiptId: receipt.id }
        });
        await transaction.commit();
        res.status(201).json({
          data: { invoice: await loadInvoice(req.tenantId, invoice.id), payment, receipt },
          error: null
        });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      next(error);
    }
  });

  router.post('/invoices/:invoiceId/reminder', async (req, res, next) => {
    try {
      requireInvoiceManage(req);
      const invoice = await loadInvoice(req.tenantId, req.params.invoiceId);
      requirePropertyScope(req, invoice.propertyid);
      if (String(invoice.status).toLowerCase() === 'paid') {
        throw createRequestError(409, 'A reminder is not required for a paid invoice.', 'INVOICE_ALREADY_PAID');
      }
      await runQuery(
        `UPDATE invoices SET reminderdate = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
         WHERE tenant_id = @tenantId AND id = @invoiceId`,
        { tenantId: req.tenantId, invoiceId: invoice.id }
      );
      const pool = await getMssqlPool();
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        await insertLifecycleEvent(transaction, {
          tenantId: req.tenantId,
          invoiceId: invoice.id,
          eventType: 'payment_reminder_recorded',
          fromStatus: invoice.status,
          toStatus: invoice.status,
          actorUserId: req.user.id
        });
        await transaction.commit();
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
      res.json({ data: await loadInvoice(req.tenantId, invoice.id), error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
