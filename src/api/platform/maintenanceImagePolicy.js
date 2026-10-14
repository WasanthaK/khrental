/**
 * Guards the scoped maintenance image metadata write. A valid tenant context
 * and a request loaded with tenant_id are required before this check.
 */
// SQL Server GUID values and session/membership IDs may have different
// letter casing. Normalize only identifier representation, not authority.
export const sameMaintenanceIdentifier = (left, right) => (
  left != null && right != null
  && String(left).trim() !== '' && String(right).trim() !== ''
  && String(left).trim().toLowerCase() === String(right).trim().toLowerCase()
);

export const authorizeMaintenanceImageAttachment = ({ user, membership, request, isTenant, canManage, canUpdateAssigned, hasPropertyScope }) => {
  const actor = String(user?.id || '').trim();
  if (!actor || !request || !['pending', 'in_progress'].includes(String(request.status || '').toLowerCase())) {
    return false;
  }

  if (isTenant) return sameMaintenanceIdentifier(request.renteeid, actor);
  if (canManage && hasPropertyScope) return true;
  return Boolean(canUpdateAssigned && sameMaintenanceIdentifier(request.assignedto, actor));
};

/**
 * Only record files stored in this tenant's images/maintenance namespace.
 * Local relative URLs and absolute URLs for the current API host are valid;
 * foreign remote URLs or another tenant's path are never accepted as evidence.
 */
export const normalizeMaintenanceImageUrl = ({ value, tenantId, requestHost }) => {
  const raw = String(value || '').trim();
  const tenant = String(tenantId || '').toLowerCase();
  const host = String(requestHost || '').toLowerCase();

  if (!raw || !tenant || !host || raw.startsWith('//')) return null;
  let url;
  try { url = new URL(raw, 'https://local.invalid'); } catch { return null; }
  if (url.username || url.password || url.search || url.hash) return null;
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (url.host !== 'local.invalid' && url.host.toLowerCase() !== host) return null;

  const path = url.pathname;
  const prefix = `/storage/images/tenants/${tenant}/maintenance/`;
  if (!path.toLowerCase().startsWith(prefix)) return null;
  const tail = path.slice(prefix.length);
  // Canonical saveImage() uploads one generated filename into maintenance/.
  if (!tail || tail.includes('/') || /%(?:2f|5c|2e|00)/i.test(tail) || tail === '.' || tail === '..') return null;
  return raw;
};
