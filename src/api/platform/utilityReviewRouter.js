import express from 'express';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';

const requestError = (status, code, message) => Object.assign(new Error(message), { status, code });

export const calculateReviewedUtilityCharge = ({ previousreading, currentreading, rate }) => {
  if ([previousreading, currentreading, rate].some(value => value === null || value === undefined || value === '')) {
    throw requestError(422, 'UTILITY_CHARGE_INCOMPLETE', 'Complete readings and configured utility rate are required.');
  }
  const previous = Number(previousreading);
  const current = Number(currentreading);
  const price = Number(rate);
  if (![previous, current, price].every(Number.isFinite) ||
      previous < 0 || current < previous || price < 0) {
    throw requestError(422, 'UTILITY_CHARGE_INVALID', 'Utility readings or configured rate are invalid.');
  }
  // Rates are stored to four decimal places and charges to two.
  const amount = Math.round((current - previous) * price * 100) / 100;
  if (!Number.isSafeInteger(Math.round(amount * 100)) || amount < 0) {
    throw requestError(422, 'UTILITY_CHARGE_INVALID', 'Computed utility charge exceeds supported precision.');
  }
  return { consumption: current - previous, rate: price, amount };
};

/** Exact DECIMAL(18,4) payload; reject implicit rounding and exponent notation. */
export const normalizeMeterReadingValue = (value, field = 'reading') => {
  const raw = typeof value === 'number' || typeof value === 'string'
    ? String(value).trim() : '';
  if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(raw) ||
      !Number.isFinite(Number(raw))) {
    throw requestError(422, 'INVALID_METER_READING', field + ' must be a nonnegative decimal with at most four fractional places.');
  }
  return Number(raw);
};

export const validateMeterReadingPair = (previous, current) => {
  const previousReading = normalizeMeterReadingValue(previous, 'Previous reading');
  const currentReading = normalizeMeterReadingValue(current, 'Current reading');
  if (currentReading <= previousReading) {
    throw requestError(422, 'INVALID_METER_READING_RANGE', 'Current reading must be greater than previous reading.');
  }
  return { previousReading, currentReading };
};

const query = async (transaction, text, values) => {
  const request = new sql.Request(transaction);
  Object.entries(values).forEach(([key, value]) => request.input(key, value));
  const result = await request.query(text);
  return result.recordset || [];
};

export const createUtilityReviewRouter = () => {
  const router = express.Router();
  router.use(createTenantContextMiddleware({
    requireUser: true, requireTenant: true, auditLabel: 'utility-review-lifecycle'
  }));

  router.post('/readings/:readingId/:transition', async (req, res, next) => {
    const transition = req.params.transition;
    if (!['approve', 'reject'].includes(transition)) {
      return res.status(404).json({ error: 'Unknown utility review action.', code: 'ACTION_NOT_FOUND' });
    }
    let transaction;
    try {
      authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.UTILITIES_REVIEW);
      const readingId = req.params.readingId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(readingId)) {
        throw requestError(400, 'INVALID_READING_ID', 'Valid utility reading ID required.');
      }
      const reason = String(req.body?.reason || '').trim();
      if (transition === 'reject' && (!reason || reason.length > 1000)) {
        throw requestError(400, 'INVALID_REJECTION_REASON', 'A rejection reason of 1 to 1000 characters is required.');
      }

      transaction = new sql.Transaction(await getMssqlPool());
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);

      const [reading] = await query(transaction,
        `SELECT TOP 1 r.id, r.renteeid, r.propertyid, r.utilitytype, r.previousreading,
                r.currentreading, r.readingdate, r.status, r.billing_status, r.invoice_id,
                p.electricity_rate, p.water_rate
         FROM utility_readings r WITH (UPDLOCK, HOLDLOCK)
         INNER JOIN properties p ON p.id = r.propertyid AND p.tenant_id = r.tenant_id
         WHERE r.tenant_id = @tenantId AND r.id = @readingId`,
        { tenantId: req.tenantId, readingId }
      );
      if (!reading) throw requestError(404, 'READING_NOT_FOUND', 'Utility reading not found.');
      if (!isAdminRole({ user: req.user, membership: req.membership })) {
        const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
        if (!assigned.has(String(reading.propertyid))) {
          throw requestError(403, 'RESOURCE_ACCESS_DENIED', 'Utility reading property is not assigned.');
        }
      }
      if (reading.status !== 'pending' || reading.invoice_id !== null ||
          (reading.billing_status && reading.billing_status !== 'pending')) {
        throw requestError(409, 'READING_ALREADY_PROCESSED', 'Only unlinked pending readings may be reviewed.');
      }

      let result;
      if (transition === 'approve') {
        const rate = reading.utilitytype === 'electricity' ? reading.electricity_rate
          : reading.utilitytype === 'water' ? reading.water_rate : null;
        const charge = calculateReviewedUtilityCharge({ ...reading, rate });
        const billingData = JSON.stringify({
          utility_type: reading.utilitytype, consumption: charge.consumption,
          rate: charge.rate, amount: charge.amount, reading_id: reading.id,
          property_id: reading.propertyid, rentee_id: reading.renteeid,
          reading_date: reading.readingdate, effective_status: 'approved',
          billing_status: 'pending_invoice'
        });
        const [updated] = await query(transaction,
          `UPDATE utility_readings
           SET status = 'approved', billing_status = 'pending_invoice',
               calculatedbill = @amount, billing_data = @billingData,
               approved_date = SYSUTCDATETIME(), updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.id, INSERTED.status, INSERTED.billing_status, INSERTED.calculatedbill
           WHERE id = @readingId AND tenant_id = @tenantId AND status = 'pending' AND invoice_id IS NULL`,
          { readingId, tenantId: req.tenantId, amount: charge.amount, billingData }
        );
        result = updated;
      } else {
        const [updated] = await query(transaction,
          `UPDATE utility_readings
           SET status = 'rejected', billing_status = 'rejected',
               rejection_reason = @reason, rejected_date = SYSUTCDATETIME(),
               updatedat = SYSUTCDATETIME()
           OUTPUT INSERTED.id, INSERTED.status, INSERTED.billing_status, INSERTED.rejection_reason
           WHERE id = @readingId AND tenant_id = @tenantId AND status = 'pending' AND invoice_id IS NULL`,
          { readingId, tenantId: req.tenantId, reason }
        );
        result = updated;
      }
      if (!result) throw requestError(409, 'READING_CONCURRENTLY_CHANGED', 'Utility reading changed during review.');
      await transaction.commit();
      transaction = null;
      return res.json({ data: result, error: null });
    } catch (error) {
      if (transaction) {
        try { await transaction.rollback(); } catch { /* preserve original error */ }
      }
      return next(error);
    }
  });

  // Meter corrections have no authority to approve, bill, or link invoices.
  router.put('/readings/:readingId/value', async (req, res, next) => {
    let transaction;
    try {
      authorizePermission({ user: req.user, membership: req.membership }, PERMISSIONS.UTILITIES_REVIEW);
      const readingId = req.params.readingId;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(readingId)) {
        throw requestError(400, 'INVALID_READING_ID', 'Valid utility reading ID required.');
      }
      const body = req.body || {};
      if (!Object.prototype.hasOwnProperty.call(body, 'expectedPreviousReading') ||
          !Object.prototype.hasOwnProperty.call(body, 'expectedCurrentReading')) {
        throw requestError(400, 'EXPECTED_READINGS_REQUIRED', 'Original readings are required to prevent overwriting concurrent changes.');
      }
      const values = validateMeterReadingPair(body.previousReading, body.currentReading);
      const expectedPrevious = body.expectedPreviousReading === null
        ? null : normalizeMeterReadingValue(body.expectedPreviousReading, 'Original previous reading');
      const expectedCurrent = body.expectedCurrentReading === null
        ? null : normalizeMeterReadingValue(body.expectedCurrentReading, 'Original current reading');

      transaction = new sql.Transaction(await getMssqlPool());
      await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      const [reading] = await query(transaction,
        `SELECT TOP 1 id, tenant_id, propertyid, status, billing_status, invoice_id,
                previousreading, currentreading
         FROM utility_readings WITH (UPDLOCK, HOLDLOCK)
         WHERE tenant_id = @tenantId AND id = @readingId`,
        { tenantId: req.tenantId, readingId }
      );
      if (!reading) throw requestError(404, 'READING_NOT_FOUND', 'Utility reading not found.');
      if (!isAdminRole({ user: req.user, membership: req.membership })) {
        const assigned = new Set((req.membership?.assignedPropertyIds || []).map(String));
        if (!assigned.has(String(reading.propertyid))) {
          throw requestError(403, 'RESOURCE_ACCESS_DENIED', 'Utility reading property is not assigned.');
        }
      }
      if (reading.status !== 'pending' || reading.invoice_id !== null ||
          (reading.billing_status && reading.billing_status !== 'pending')) {
        throw requestError(409, 'READING_ALREADY_PROCESSED', 'Only pending, unlinked readings can be edited.');
      }
      const currentPrevious = reading.previousreading === null ? null : Number(reading.previousreading);
      const currentCurrent = reading.currentreading === null ? null : Number(reading.currentreading);
      if (expectedPrevious !== currentPrevious || expectedCurrent !== currentCurrent) {
        throw requestError(409, 'STALE_METER_READING', 'This reading changed since it was opened. Refresh before editing.');
      }

      const [updated] = await query(transaction,
        `UPDATE utility_readings
         SET previousreading = @previousReading,
             currentreading = @currentReading,
             updatedat = SYSUTCDATETIME()
         OUTPUT INSERTED.id, INSERTED.previousreading, INSERTED.currentreading,
                INSERTED.status, INSERTED.billing_status
         WHERE id = @readingId AND tenant_id = @tenantId
           AND status = 'pending' AND invoice_id IS NULL
           AND (billing_status IS NULL OR billing_status = 'pending')`,
        { tenantId: req.tenantId, readingId, ...values }
      );
      if (!updated) throw requestError(409, 'READING_CONCURRENTLY_CHANGED', 'Utility reading changed during editing.');
      await transaction.commit();
      transaction = null;
      return res.json({ data: updated, error: null });
    } catch (error) {
      if (transaction) {
        try { await transaction.rollback(); } catch { /* preserve original error */ }
      }
      return next(error);
    }
  });
  return router;
};
