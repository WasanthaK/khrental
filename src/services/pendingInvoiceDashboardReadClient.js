import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

// Keep the existing tenant-scoped platform SELECT authority, but remove the
// dashboard's dependency on the generic platformClient compatibility facade.
// This is a read-only transport; no payment/invoice/reading mutation is exposed.
const readRows = async ({ table, select, filters, order, range }) => {
  const response = await fetch(`${getApiBaseUrl()}/api/platform/query`, {
    method: 'POST',
    headers: buildRequestContextHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action: 'select', table, select, filters,
      ...(order ? { order } : {}),
      ...(range ? { range } : {})
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error || 'Scoped dashboard read failed.');
    error.status = response.status;
    error.code = payload?.code || null;
    throw error;
  }
  const result = await response.json();
  if (result?.error || result?.meta?.missingTable || result?.meta?.databaseConfigured === false) {
    throw new Error(result?.error?.message || 'Scoped dashboard data is unavailable.');
  }
  if (!Array.isArray(result?.data)) {
    throw new Error('Scoped dashboard read returned an invalid response.');
  }
  return result.data;
};

export const listPendingInvoiceReadingPage = (page, pageSize) => {
  const from = page * pageSize;
  return readRows({
    table: 'utility_readings',
    select: 'id, propertyid',
    filters: [
      { column: 'billing_status', operator: 'eq', value: 'pending_invoice' },
      { column: 'invoice_id', operator: 'is', value: null }
    ],
    order: [{ column: 'id', ascending: true }],
    range: { from, to: from + pageSize - 1 }
  });
};

export const listPendingInvoiceProperties = (propertyIds) => {
  if (!Array.isArray(propertyIds) || propertyIds.length === 0) return Promise.resolve([]);
  return readRows({
    table: 'properties',
    select: 'id, name, address',
    filters: [{ column: 'id', operator: 'in', value: propertyIds }]
  });
};
