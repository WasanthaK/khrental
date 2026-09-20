import express from 'express';
import { getMssqlPool, sql } from '../mssql/pool.js';
import { createTenantContextMiddleware } from '../tenant/context.js';
import { authorizePermission } from './authorization.js';
import { PERMISSIONS, isAdminRole } from './permissionEngine.js';
import { agreementOverlapsBillingPeriod } from './billingLifecycle.js';

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
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};

const toMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
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
      const dueDate = req.body?.dueDate || null;
      const requestedAgreementId = req.body?.agreementId || null;
      const requestedPropertyId = req.body?.propertyId || null;
      const { start, end } = getPeriodBounds(billingPeriod);

      const pool = await getMssqlPool();
      const agreementRequest = bindParams(pool.request(), {
        tenantId: req.tenantId,
        agreementId: requestedAgreementId,
        propertyId: requestedPropertyId
      });
      const agreementResult = await agreementRequest.query(
        `SELECT a.id, a.renteeid, a.propertyid, a.unitid, a.rentamount,
                a.startdate, a.enddate, p.name AS property_name
         FROM agreements a
         INNER JOIN properties p ON p.id = a.propertyid AND p.tenant_id = a.tenant_id
         WHERE a.tenant_id = @tenantId
           AND a.status = 'active'
           AND (@agreementId IS NULL OR a.id = @agreementId)
           AND (@propertyId IS NULL OR a.propertyid = @propertyId)
         ORDER BY a.createdat`
      );
      const agreements = agreementResult.recordset || [];

      const results = { created: [], skipped: [], errors: [] };

      for (const agreement of agreements) {
        try {
          requirePropertyScope(req, agreement.propertyid);

          if (!agreementOverlapsBillingPeriod({
            agreementStart: agreement.startdate,
            agreementEnd: agreement.enddate,
            periodStart: start,
            periodEnd: end
          })) {
            results.skipped.push({
              agreementId: agreement.id,
              propertyId: agreement.propertyid,
              reason: 'outside_agreement_period'
            });
            continue;
          }

          const transaction = new sql.Transaction(pool);
          await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
          try {
            const existing = await singleTransaction(
              transaction,
              `SELECT TOP 1 id, status, totalamount
               FROM invoices WITH (UPDLOCK, HOLDLOCK)
               WHERE tenant_id = @tenantId
                 AND agreementid = @agreementId
                 AND billingperiod = @billingPeriod`,
              { tenantId: req.tenantId, agreementId: agreement.id, billingPeriod }
            );
            if (existing) {
              await transaction.rollback();
              results.skipped.push({ agreementId: agreement.id, invoiceId: existing.id, reason: 'already_exists' });
              continue;
            }

            const utilityRows = await queryTransaction(
              transaction,
              `SELECT id, utilitytype, calculatedbill, readingdate, meteridentifier
               FROM utility_readings WITH (UPDLOCK, HOLDLOCK)
               WHERE tenant_id = @tenantId
                 AND renteeid = @renteeId
                 AND propertyid = @propertyId
                 AND invoice_id IS NULL
                 AND billing_status = 'pending_invoice'
                 AND readingdate >= @periodStart
                 AND readingdate < @periodEnd
                 AND (@agreementStart IS NULL OR readingdate >= @agreementStart)
                 AND (@agreementEnd IS NULL OR readingdate <= @agreementEnd)
               ORDER BY readingdate, createdat`,
              {
                tenantId: req.tenantId,
                renteeId: agreement.renteeid,
                propertyId: agreement.propertyid,
                periodStart: start,
                periodEnd: end,
                agreementStart: agreement.startdate || null,
                agreementEnd: agreement.enddate || null
              }
            );

            const componentRows = [];
            const legacyComponents = {
              rent: 0,
              electricity: 0,
              water: 0,
              pastDues: 0,
              taxes: 0
            };

            const rentAmount = toMoney(agreement.rentamount);
            if (rentAmount > 0) {
              legacyComponents.rent = rentAmount;
              componentRows.push({
                componentType: 'rent',
                description: `Rent for ${billingPeriod}`,
                amount: rentAmount,
                sourceType: 'agreement',
                sourceId: agreement.id,
                metadata: { billingPeriod }
              });
            }

            for (const reading of utilityRows) {
              const amount = toMoney(reading.calculatedbill);
              if (amount <= 0) continue;
              const rawType = String(reading.utilitytype || '').trim().toLowerCase();
              const componentType = rawType === 'electricity' || rawType === 'water' ? rawType : 'utility';
              if (rawType === 'electricity') legacyComponents.electricity += amount;
              if (rawType === 'water') legacyComponents.water += amount;
              componentRows.push({
                componentType,
                description: `${reading.utilitytype || 'Utility'} charge for ${billingPeriod}`,
                amount,
                sourceType: 'utility_reading',
                sourceId: reading.id,
                metadata: {
                  readingDate: reading.readingdate,
                  meterIdentifier: reading.meteridentifier || null
                }
              });
            }

            const totalAmount = Math.round(componentRows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
            if (totalAmount <= 0) {
              await transaction.rollback();
              results.skipped.push({ agreementId: agreement.id, reason: 'no_billable_components' });
              continue;
            }

            const invoice = await singleTransaction(
              transaction,
              `INSERT INTO invoices (
                 tenant_id, renteeid, propertyid, agreementid, billingperiod,
                 components, totalamount, status, duedate, issued_at, issued_by, notes
               ) OUTPUT INSERTED.*
               VALUES (
                 @tenantId, @renteeId, @propertyId, @agreementId, @billingPeriod,
                 @components, @totalAmount, 'pending',
                 COALESCE(@dueDate, DATEADD(day, 14, SYSUTCDATETIME())),
                 SYSUTCDATETIME(), @issuedBy, @notes
               )`,
              {
                tenantId: req.tenantId,
                renteeId: agreement.renteeid,
                propertyId: agreement.propertyid,
                agreementId: agreement.id,
                billingPeriod,
                components: JSON.stringify(legacyComponents),
                totalAmount,
                dueDate,
                issuedBy: req.user.id,
                notes: req.body?.notes || null
              }
            );

            for (const component of componentRows) {
              await queryTransaction(
                transaction,
                `INSERT INTO invoice_components (
                   tenant_id, invoice_id, component_type, description, amount,
                   source_type, source_id, metadata
                 ) VALUES (
                   @tenantId, @invoiceId, @componentType, @description, @amount,
                   @sourceType, @sourceId, @metadata
                 )`,
                {
                  tenantId: req.tenantId,
                  invoiceId: invoice.id,
                  componentType: component.componentType,
                  description: component.description,
                  amount: component.amount,
                  sourceType: component.sourceType,
                  sourceId: component.sourceId,
                  metadata: JSON.stringify(component.metadata || {})
                }
              );
            }

            if (utilityRows.length > 0) {
              await queryTransaction(
                transaction,
                `UPDATE utility_readings
                 SET invoice_id = @invoiceId,
                     billing_status = 'invoiced',
                     invoiced_date = SYSUTCDATETIME(),
                     updatedat = SYSUTCDATETIME()
                 WHERE tenant_id = @tenantId
                   AND renteeid = @renteeId
                   AND propertyid = @propertyId
                   AND invoice_id IS NULL
                   AND billing_status = 'pending_invoice'
                   AND readingdate >= @periodStart
                   AND readingdate < @periodEnd
                   AND (@agreementStart IS NULL OR readingdate >= @agreementStart)
                   AND (@agreementEnd IS NULL OR readingdate <= @agreementEnd)`,
                {
                  tenantId: req.tenantId,
                  invoiceId: invoice.id,
                  renteeId: agreement.renteeid,
                  propertyId: agreement.propertyid,
                  periodStart: start,
                  periodEnd: end,
                  agreementStart: agreement.startdate || null,
                  agreementEnd: agreement.enddate || null
                }
              );
            }

            await queryTransaction(
              transaction,
              `INSERT INTO billing_lifecycle_events (
                 tenant_id, invoice_id, event_type, to_status, actor_user_id, metadata
               ) VALUES (
                 @tenantId, @invoiceId, 'invoice_issued', 'pending', @actorUserId, @metadata
               )`,
              {
                tenantId: req.tenantId,
                invoiceId: invoice.id,
                actorUserId: req.user.id,
                metadata: JSON.stringify({
                  agreementId: agreement.id,
                  billingPeriod,
                  componentCount: componentRows.length,
                  totalAmount
                })
              }
            );

            await transaction.commit();
            results.created.push({
              invoiceId: invoice.id,
              agreementId: agreement.id,
              propertyId: agreement.propertyid,
              renteeId: agreement.renteeid,
              totalAmount,
              componentCount: componentRows.length
            });
          } catch (error) {
            await transaction.rollback().catch(() => {});
            throw error;
          }
        } catch (error) {
          results.errors.push({ agreementId: agreement.id, propertyId: agreement.propertyid, error: error.message, code: error.code || null });
        }
      }

      res.status(results.errors.length && !results.created.length ? 409 : 200).json({ data: results, error: null });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
