// Tenant-boundary checks for compatibility-repository writes. These reject
// client attempts to name or reference another organization with a
// structured 4xx; the reply never echoes the supplied identifier, and an id
// that is foreign is indistinguishable from one that does not exist.

const requestError = (status, code, message) => Object.assign(new Error(message), { status, code });

// SQL Server returns uniqueidentifier text in upper case while clients often
// send lower case, so the same organization must compare equal either way.
export const sameTenantId = (left, right) =>
  String(left).trim().toLowerCase() === String(right).trim().toLowerCase();

export const mergeTenantPayload = (payload = {}, tenantId) => {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  if (payload.tenant_id && !sameTenantId(payload.tenant_id, tenantId)) {
    throw requestError(403, 'TENANT_OVERRIDE_BLOCKED', 'Client-supplied tenant identifiers are not allowed.');
  }
  return { ...payload, tenant_id: tenantId };
};

export const tenantRelationshipError = label =>
  requestError(400, 'TENANT_RELATIONSHIP_INVALID', `${label} was not found in the active organization.`);
