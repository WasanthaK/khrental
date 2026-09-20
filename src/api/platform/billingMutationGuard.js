import { guardMaintenancePlatformQuery } from './maintenanceMutationGuard.js';

const PROTECTED_BILLING_TABLES = new Set(['invoices', 'payments']);
const MUTATING_ACTIONS = new Set(['insert', 'update', 'delete', 'upsert']);

const normalizeAction = (action) => String(action || 'select').trim().toLowerCase();
const normalizeTable = (table) => String(table || '').trim().toLowerCase();

export const isProtectedBillingMutation = ({ action, table } = {}) => (
  PROTECTED_BILLING_TABLES.has(normalizeTable(table))
  && MUTATING_ACTIONS.has(normalizeAction(action))
);

const sendBillingLifecycleRequired = (res) => {
  res.status(409).json({
    error: 'Invoice and payment mutations must use the dedicated billing lifecycle API.',
    code: 'BILLING_LIFECYCLE_REQUIRED'
  });
};

export const guardBillingPlatformQuery = (req, res, next) => {
  if (isProtectedBillingMutation({ action: req.body?.action, table: req.body?.table })) {
    sendBillingLifecycleRequired(res);
    return;
  }

  // This middleware is already mounted in front of the central platform query
  // endpoint. Delegate the next protected business lifecycle here so legacy
  // generic table writes cannot bypass the dedicated maintenance API.
  guardMaintenancePlatformQuery(req, res, next);
};

const getCompatibilityBillingTable = (path = '') => {
  const normalizedPath = String(path || '').trim().toLowerCase();
  if (normalizedPath === '/invoices' || normalizedPath.startsWith('/invoices/')) return 'invoices';
  if (normalizedPath === '/payments' || normalizedPath.startsWith('/payments/')) return 'payments';
  return null;
};

const getActionForMethod = (method = '') => {
  switch (String(method || '').trim().toUpperCase()) {
    case 'POST': return 'insert';
    case 'PUT':
    case 'PATCH': return 'update';
    case 'DELETE': return 'delete';
    default: return 'select';
  }
};

export const guardBillingMssqlCompatibility = (req, res, next) => {
  const table = getCompatibilityBillingTable(req.path);
  const action = getActionForMethod(req.method);

  if (isProtectedBillingMutation({ action, table })) {
    sendBillingLifecycleRequired(res);
    return;
  }

  next();
};
