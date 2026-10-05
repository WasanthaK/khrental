import { getMssqlPool, sql } from '../mssql/pool.js';
import {
  agreementOverlapsBillingPeriod,
  calculateProratedMonthlyRent,
  resolveAgreementBillingDay,
  resolveAgreementMonthlyRent
} from './billingLifecycle.js';
import {
  attachBillingAdjustmentsToInvoice,
  loadApprovedBillingAdjustments
} from './billingAdjustmentsPersistence.js';

const createRequestError = (status, message, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
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

export const normalizeBillingPeriod = (value) => {
  const period = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
    throw createRequestError(400, 'billingPeriod must use YYYY-MM format.', 'INVALID_BILLING_PERIOD');
  }
  return period;
};

export const getBillingPeriodBounds = (billingPeriod) => {
  const normalized = normalizeBillingPeriod(billingPeriod);
  const [year, month] = normalized.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start: start.toISOString(), end: end.toISOString() };
};

const toMoney = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

export const generateMonthlyInvoicesForTenant = async ({
  tenantId,
  billingPeriod,
  dueDate = null,
  agreementId = null,
  propertyId = null,
  actorUserId = null,
  notes = null,
  source = 'manual',
  automaticRunDate = null,
  authorizeProperty = () => {}
} = {}) => {
  if (!tenantId) {
    throw createRequestError(400, 'tenantId is required.', 'TENANT_REQUIRED');
  }

  const normalizedBillingPeriod = normalizeBillingPeriod(billingPeriod);
  const { start, end } = getBillingPeriodBounds(normalizedBillingPeriod);
  const pool = await getMssqlPool();

  const agreementRequest = bindParams(pool.request(), {
    tenantId,
    agreementId,
    propertyId
  });
  const agreementResult = await agreementRequest.query(
    `SELECT a.id, a.renteeid, a.propertyid, a.unitid, a.rentamount, a.terms,
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
      await authorizeProperty(agreement.propertyid, agreement);

      if (automaticRunDate) {
        const runDate = automaticRunDate instanceof Date ? automaticRunDate : new Date(automaticRunDate);
        const agreementStart = agreement.startdate ? new Date(agreement.startdate) : null;
        const billingDay = resolveAgreementBillingDay(agreement);

        if (
          Number.isNaN(runDate.getTime())
          || (agreementStart && !Number.isNaN(agreementStart.getTime()) && runDate < agreementStart)
        ) {
          results.skipped.push({
            agreementId: agreement.id,
            propertyId: agreement.propertyid,
            reason: 'before_tenancy_start',
            billingDay
          });
          continue;
        }

        if (runDate.getUTCDate() < billingDay) {
          results.skipped.push({
            agreementId: agreement.id,
            propertyId: agreement.propertyid,
            reason: 'before_tenancy_billing_day',
            billingDay
          });
          continue;
        }
      }

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
          { tenantId, agreementId: agreement.id, billingPeriod: normalizedBillingPeriod }
        );
        if (existing) {
          await transaction.rollback();
          results.skipped.push({
            agreementId: agreement.id,
            invoiceId: existing.id,
            reason: 'already_exists'
          });
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
             AND readingdate < @periodStart
             AND (@agreementStart IS NULL OR readingdate >= @agreementStart)
             AND (@agreementEnd IS NULL OR readingdate <= @agreementEnd)
           ORDER BY readingdate, createdat`,
          {
            tenantId,
            renteeId: agreement.renteeid,
            propertyId: agreement.propertyid,
            periodStart: start,
            agreementStart: agreement.startdate || null,
            agreementEnd: agreement.enddate || null
          }
        );

        const adjustmentRows = await loadApprovedBillingAdjustments(transaction, {
          tenantId,
          agreementId: agreement.id,
          billingPeriod: normalizedBillingPeriod
        });

        const fixedUtilityRows = await queryTransaction(
          transaction,
          `SELECT id, utilitytype, fixedamount
           FROM utility_configs
           WHERE tenant_id = @tenantId
             AND propertyid = @propertyId
             AND LOWER(COALESCE(billingtype, '')) = 'fixed'
             AND fixedamount > 0
           ORDER BY utilitytype`,
          { tenantId, propertyId: agreement.propertyid }
        );

        const componentRows = [];
        const legacyComponents = {
          rent: 0,
          electricity: 0,
          water: 0,
          pastDues: 0,
          taxes: 0,
          adjustments: 0,
          other: 0
        };

        const rent = calculateProratedMonthlyRent({
          monthlyRent: resolveAgreementMonthlyRent(agreement),
          agreementStart: agreement.startdate,
          agreementEnd: agreement.enddate,
          periodStart: start,
          periodEnd: end
        });
        const rentAmount = toMoney(rent.amount);
        if (rentAmount > 0) {
          legacyComponents.rent = rentAmount;
          componentRows.push({
            componentType: 'rent',
            description: rent.prorated
              ? `Prorated rent for ${normalizedBillingPeriod} (${rent.occupiedDays}/${rent.daysInMonth} days)`
              : `Rent for ${normalizedBillingPeriod}`,
            amount: rentAmount,
            sourceType: 'agreement',
            sourceId: agreement.id,
            metadata: {
              billingPeriod: normalizedBillingPeriod,
              fullMonthlyRent: rent.fullMonthlyRent,
              occupiedDays: rent.occupiedDays,
              daysInMonth: rent.daysInMonth,
              prorated: rent.prorated
            }
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
            description: `${reading.utilitytype || 'Utility'} charge from prior service period`,
            amount,
            sourceType: 'utility_reading',
            sourceId: reading.id,
            metadata: {
              readingDate: reading.readingdate,
              meterIdentifier: reading.meteridentifier || null
            }
          });
        }

        for (const config of fixedUtilityRows) {
          const amount = toMoney(config.fixedamount);
          if (amount <= 0) continue;
          const rawType = String(config.utilitytype || '').trim().toLowerCase();
          const componentType = rawType === 'electricity' || rawType === 'water' ? rawType : 'utility';
          if (rawType === 'electricity') legacyComponents.electricity += amount;
          if (rawType === 'water') legacyComponents.water += amount;
          componentRows.push({
            componentType,
            description: `Fixed ${config.utilitytype || 'utility'} charge for ${normalizedBillingPeriod}`,
            amount,
            sourceType: 'utility_config',
            sourceId: config.id,
            metadata: {
              billingPeriod: normalizedBillingPeriod,
              propertyId: agreement.propertyid,
              billingType: 'fixed'
            }
          });
        }

        for (const adjustment of adjustmentRows) {
          const amount = toMoney(adjustment.amount);
          if (amount === 0) continue;
          const componentType = String(adjustment.component_type || '').trim().toLowerCase();
          if (componentType === 'arrears') legacyComponents.pastDues += amount;
          if (componentType === 'tax') legacyComponents.taxes += amount;
          if (componentType === 'adjustment') legacyComponents.adjustments += amount;
          if (componentType === 'other') legacyComponents.other += amount;
          componentRows.push({
            componentType,
            description: adjustment.description,
            amount,
            sourceType: 'tenancy_billing_adjustment',
            sourceId: adjustment.id,
            metadata: {
              billingPeriod: normalizedBillingPeriod,
              approvedBy: adjustment.approved_by || null,
              approvedAt: adjustment.approved_at || null
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
             @components, @totalAmount, 'draft',
             COALESCE(@dueDate, DATEADD(day, 14, SYSUTCDATETIME())),
             NULL, NULL, @notes
           )`,
          {
            tenantId,
            renteeId: agreement.renteeid,
            propertyId: agreement.propertyid,
            agreementId: agreement.id,
            billingPeriod: normalizedBillingPeriod,
            components: JSON.stringify(legacyComponents),
            totalAmount,
            dueDate,
            issuedBy: actorUserId,
            notes
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
              tenantId,
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
               AND readingdate < @periodStart
               AND (@agreementStart IS NULL OR readingdate >= @agreementStart)
               AND (@agreementEnd IS NULL OR readingdate <= @agreementEnd)`,
            {
              tenantId,
              invoiceId: invoice.id,
              renteeId: agreement.renteeid,
              propertyId: agreement.propertyid,
              periodStart: start,
              agreementStart: agreement.startdate || null,
              agreementEnd: agreement.enddate || null
            }
          );
        }

        if (adjustmentRows.length > 0) {
          await attachBillingAdjustmentsToInvoice(transaction, {
            tenantId,
            agreementId: agreement.id,
            billingPeriod: normalizedBillingPeriod,
            invoiceId: invoice.id
          });
        }

        await queryTransaction(
          transaction,
          `INSERT INTO billing_lifecycle_events (
             tenant_id, invoice_id, event_type, to_status, actor_user_id, metadata
           ) VALUES (
             @tenantId, @invoiceId, 'invoice_drafted', 'draft', @actorUserId, @metadata
           )`,
          {
            tenantId,
            invoiceId: invoice.id,
            actorUserId,
            metadata: JSON.stringify({
              agreementId: agreement.id,
              billingPeriod: normalizedBillingPeriod,
              componentCount: componentRows.length,
              adjustmentCount: adjustmentRows.length,
              fixedUtilityCount: fixedUtilityRows.length,
              totalAmount,
              source
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
          componentCount: componentRows.length,
          adjustmentCount: adjustmentRows.length,
          fixedUtilityCount: fixedUtilityRows.length
        });
      } catch (error) {
        await transaction.rollback().catch(() => {});
        throw error;
      }
    } catch (error) {
      if (error?.number === 2601 || error?.number === 2627) {
        results.skipped.push({ agreementId: agreement.id, reason: 'already_exists' });
        continue;
      }
      results.errors.push({
        agreementId: agreement.id,
        propertyId: agreement.propertyid,
        error: error.message,
        code: error.code || null
      });
    }
  }

  return results;
};
