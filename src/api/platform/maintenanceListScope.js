/**
 * Build a tenant-local SQL predicate from SERVER-VERIFIED actor/membership
 * authority. Browser-supplied user IDs and property scopes are not accepted.
 */
export const buildMaintenanceListScope = ({
  actorId, isRenter = false, canManage = false,
  isAdmin = false, canUpdateAssigned = false, assignedPropertyIds = []
}) => {
  if (!actorId) throw Object.assign(new Error('Authenticated actor is required'), { status: 401 });
  if (isRenter) {
    return { predicate: 'mr.renteeid = @actorId', params: { actorId } };
  }
  if (canManage && isAdmin) return { predicate: '1 = 1', params: {} };
  const predicates = [];
  const params = {};
  if (canManage && Array.isArray(assignedPropertyIds) && assignedPropertyIds.length) {
    predicates.push(`mr.propertyid IN (
      SELECT TRY_CONVERT(uniqueidentifier, [value])
      FROM OPENJSON(@propertyScopeJson)
    )`);
    params.propertyScopeJson = JSON.stringify(assignedPropertyIds);
  }
  if (canUpdateAssigned) {
    predicates.push('mr.assignedto = @actorId');
    params.actorId = actorId;
  }
  if (!canManage && !canUpdateAssigned) {
    throw Object.assign(new Error('Maintenance list permission is required'), {
      status: 403, code: 'RESOURCE_ACCESS_DENIED'
    });
  }
  return { predicate: predicates.length ? '(' + predicates.join(' OR ') + ')' : '1 = 0', params };
};

/** Limits per-query work without truncating a legitimate caller's results. */
export const parseMaintenanceListPage = (query = {}) => {
  const limitString = String(query.limit ?? '100');
  const offsetString = String(query.offset ?? '0');
  if (!/^\d+$/.test(limitString) || !/^\d+$/.test(offsetString)) {
    throw Object.assign(new Error('Invalid maintenance list pagination'), { status: 400 });
  }
  const limit = Number(limitString), offset = Number(offsetString);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw Object.assign(new Error('Maintenance list pagination is out of bounds'), { status: 400 });
  }
  return { limit, offset };
};
