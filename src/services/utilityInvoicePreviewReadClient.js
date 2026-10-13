import { getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

// Read-only preview of the same pending, unlinked utility readings eligible
// for the governed monthly invoice lifecycle. Server platform-query
// authorization supplies tenant/owner/assigned-property restrictions.
const MONTHS = Object.freeze([
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]);
const PAGE_SIZE = 250;
const MAX_PAGES = 1000;

const requestRows = async ({ filters, range }) => {
  const response = await fetch(`${getApiBaseUrl()}/api/platform/query`, {
    method: 'POST',
    headers: buildRequestContextHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      action: 'select',
      table: 'utility_readings',
      select: 'id, renteeid, propertyid, utilitytype, previousreading, currentreading, readingdate, calculatedbill, status, billing_status, invoice_id, app_users:renteeid(id,name), properties:propertyid(id,name)',
      filters,
      order: [{ column: 'id', ascending: true }],
      range
    })
  });

  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result?.error === 'string'
      ? result.error
      : result?.error?.message || 'Utility invoice preview read failed.';
    const error = new Error(message);
    error.status = response.status;
    error.code = result?.code || null;
    throw error;
  }
  if (result?.error || result?.meta?.databaseConfigured === false || result?.meta?.missingTable) {
    throw new Error(result?.error?.message || 'Utility invoice preview data is unavailable.');
  }
  if (!Array.isArray(result?.data)) {
    throw new Error('Utility invoice preview returned an invalid response.');
  }
  return result.data;
};

const normalizePeriodFilters = ({ month, year }) => {
  if (month != null && !MONTHS.includes(month)) {
    throw new Error('Unknown utility billing month.');
  }
  if (year == null) {
    if (month != null) throw new Error('A year is required with a billing month.');
    return [];
  }

  const numericYear = Number(year);
  if (!Number.isInteger(numericYear) || numericYear < 1900 || numericYear > 2100) {
    throw new Error('Invalid utility billing year.');
  }
  const monthIndex = month == null ? 0 : MONTHS.indexOf(month);
  const start = new Date(Date.UTC(numericYear, monthIndex, 1)).toISOString();
  const end = new Date(Date.UTC(numericYear + (month == null ? 1 : 0), month == null ? 0 : monthIndex + 1, 1)).toISOString();
  return [
    { column: 'readingdate', operator: 'gte', value: start },
    { column: 'readingdate', operator: 'lt', value: end }
  ];
};

const toFinite = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export const mapUtilityInvoicePreviewRow = (reading) => {
  const previous = toFinite(reading.previousreading);
  const current = toFinite(reading.currentreading);
  const consumption = previous === null || current === null ? null : current - previous;
  // Preserve persisted approved charge; never calculate or fabricate an
  // authoritative amount from a property rate in this review-only screen.
  const amount = toFinite(reading.calculatedbill);
  const rate = consumption !== null && consumption !== 0 && amount !== null
    ? amount / consumption : null;
  const readingDate = reading.readingdate ? new Date(reading.readingdate) : null;
  const validDate = readingDate && !Number.isNaN(readingDate.getTime());

  return {
    id: reading.id,
    utility_type: reading.utilitytype,
    consumption,
    rate,
    amount,
    reading_id: reading.id,
    property_id: reading.propertyid,
    rentee_id: reading.renteeid,
    reading_date: reading.readingdate,
    billing_month: validDate ? MONTHS[readingDate.getUTCMonth()] : null,
    billing_year: validDate ? readingDate.getUTCFullYear() : null,
    status: reading.billing_status,
    utility_readings: reading
  };
};

export const listUtilityInvoicePreviewRows = async ({
  month, year, propertyId, renteeId, pageSize = PAGE_SIZE
} = {}) => {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > PAGE_SIZE) {
    throw new Error('Invalid utility preview page size.');
  }

  const filters = [
    { column: 'billing_status', operator: 'eq', value: 'pending_invoice' },
    { column: 'invoice_id', operator: 'is', value: null },
    ...normalizePeriodFilters({ month, year })
  ];
  if (propertyId) filters.push({ column: 'propertyid', operator: 'eq', value: propertyId });
  if (renteeId) filters.push({ column: 'renteeid', operator: 'eq', value: renteeId });

  const readings = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const batch = await requestRows({ filters, range: { from, to: from + pageSize - 1 } });
    readings.push(...batch);
    if (batch.length < pageSize) return readings.map(mapUtilityInvoicePreviewRow);
  }
  throw new Error('Utility invoice preview exceeded its pagination limit.');
};
