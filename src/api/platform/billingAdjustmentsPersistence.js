import { sql } from '../mssql/pool.js';

const bindParams = (request, params = {}) => {
  Object.entries(params).forEach(([key, value]) => request.input(key, value));
  return request;
};

const queryTransaction = async (transaction, queryText, params = {}) => {
  const request = bindParams(new sql.Request(transaction), params);
  const result = await request.query(queryText);
  return result.recordset || [];
};

export const hasBillingAdjustmentsTable = async (transaction) => {
  const rows = await queryTransaction(
    transaction,
    `SELECT CASE WHEN OBJECT_ID(N'dbo.tenancy_billing_adjustments', N'U') IS NULL THEN 0 ELSE 1 END AS available`
  );
  return Boolean(rows[0]?.available);
};

export const loadApprovedBillingAdjustments = async (transaction, {
  tenantId,
  agreementId,
  billingPeriod
}) => {
  if (!await hasBillingAdjustmentsTable(transaction)) return [];

  return queryTransaction(
    transaction,
    `SELECT id, component_type, description, amount, approved_by, approved_at
     FROM tenancy_billing_adjustments WITH (UPDLOCK, HOLDLOCK)
     WHERE tenant_id = @tenantId
       AND agreement_id = @agreementId
       AND billing_period = @billingPeriod
       AND status = 'approved'
       AND invoice_id IS NULL
     ORDER BY created_at, id`,
    { tenantId, agreementId, billingPeriod }
  );
};

export const attachBillingAdjustmentsToInvoice = async (transaction, {
  tenantId,
  agreementId,
  billingPeriod,
  invoiceId
}) => {
  if (!await hasBillingAdjustmentsTable(transaction)) return;

  await queryTransaction(
    transaction,
    `UPDATE tenancy_billing_adjustments
     SET invoice_id = @invoiceId
     WHERE tenant_id = @tenantId
       AND agreement_id = @agreementId
       AND billing_period = @billingPeriod
       AND status = 'approved'
       AND invoice_id IS NULL`,
    { tenantId, agreementId, billingPeriod, invoiceId }
  );
};
