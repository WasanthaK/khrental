// A UI link to a *potentially* retained Evia audit PDF, not proof it exists.
// The existing authenticated storage route is solely responsible for
// authorizing agreement ownership, tenant scope and publication evidence.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const signedDocumentPattern = new RegExp(
  '^/storage/documents/tenants/(' + uuid + ')/agreements/(' + uuid +
  ')/signed/(?:staged/(' + uuid + ')/)?([A-Za-z0-9_-][A-Za-z0-9._-]*\\.pdf)$', 'i'
);

// Never construct audit paths from an agreement ID alone or from an arbitrary
// external URL. A locally retained signed-document path is the sole hint.
export const getEviaAuditTrailUrl = ({
  signedDocumentUrl, agreementId, tenantId, origin
} = {}) => {
  if (!signedDocumentUrl || !agreementId || !tenantId || !origin) return null;
  let source;
  try {
    source = new URL(signedDocumentUrl, origin);
    if (source.origin !== new URL(origin).origin || source.search || source.hash) return null;
  } catch {
    return null;
  }
  const match = signedDocumentPattern.exec(source.pathname);
  if (!match || match[1].toLowerCase() !== String(tenantId).toLowerCase()
    || match[2].toLowerCase() !== String(agreementId).toLowerCase()
    || match[4].toLowerCase() === 'audit_trail.pdf') return null;
  const slash = source.pathname.lastIndexOf('/');
  return source.pathname.slice(0, slash + 1) + 'audit_trail.pdf';
};
