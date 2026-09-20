const MAINTENANCE_TABLE = 'maintenance_requests';
const MAINTENANCE_COMMENT_TABLE = 'maintenance_request_comments';
const FULLY_PROTECTED_ACTIONS = new Set(['insert', 'delete', 'upsert']);
const LIFECYCLE_FIELDS = new Set([
  'propertyid',
  'renteeid',
  'agreementid',
  'unitid',
  'status',
  'assignedto',
  'assignedat',
  'assigned_by',
  'startedat',
  'completedat',
  'completed_by',
  'cancelledat',
  'cancelled_by',
  'cancellationreason',
  'completion_cost'
]);

const normalizeAction = (value) => String(value || 'select').trim().toLowerCase();
const normalizeTable = (value) => String(value || '').trim().toLowerCase();

const payloadRows = (payload) => (Array.isArray(payload) ? payload : [payload]).filter(Boolean);

export const hasMaintenanceLifecycleFields = (payload) => payloadRows(payload).some((row) => (
  Object.keys(row || {}).some((key) => LIFECYCLE_FIELDS.has(String(key).trim().toLowerCase()))
));

export const isProtectedMaintenanceCommentAccess = ({ table } = {}) => (
  normalizeTable(table) === MAINTENANCE_COMMENT_TABLE
);

export const isProtectedMaintenanceMutation = ({ action, table, payload } = {}) => {
  if (normalizeTable(table) !== MAINTENANCE_TABLE) return false;
  const normalizedAction = normalizeAction(action);
  if (FULLY_PROTECTED_ACTIONS.has(normalizedAction)) return true;
  return normalizedAction === 'update' && hasMaintenanceLifecycleFields(payload);
};

export const guardMaintenancePlatformQuery = (req, res, next) => {
  if (isProtectedMaintenanceCommentAccess({ table: req.body?.table })) {
    res.status(409).json({
      error: 'Maintenance comments must be read and written through the dedicated maintenance lifecycle API.',
      code: 'MAINTENANCE_COMMENTS_LIFECYCLE_REQUIRED'
    });
    return;
  }

  if (isProtectedMaintenanceMutation({
    action: req.body?.action,
    table: req.body?.table,
    payload: req.body?.payload
  })) {
    res.status(409).json({
      error: 'Maintenance creation, tenancy ownership, assignment and status transitions must use the dedicated maintenance lifecycle API.',
      code: 'MAINTENANCE_LIFECYCLE_REQUIRED'
    });
    return;
  }

  next();
};
