import { hasPermission, isAdminRole, PERMISSIONS } from '../platform/permissionEngine.js';

// Only protected fenced *audit* objects. Do not alter legacy signed-PDF
// routes or historic stable archive downloads as part of this slice.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const fencedAuditPattern = new RegExp(
  '^tenants/(' + uuid + ')/agreements/(' + uuid +
  ')/signed/staged/(' + uuid + ')/audit_trail\\.pdf$', 'i'
);

export const parseFencedEviaAuditTrailPath = (bucket, path) => {
  if (String(bucket || '').toLowerCase() !== 'documents') return null;
  const match = fencedAuditPattern.exec(String(path || '').replace(/^[/]+/, ''));
  return match ? {
    tenantId: match[1], agreementId: match[2],
    attemptId: match[3],
    url: '/storage/documents/' + String(path).replace(/^[/]+/, '')
  } : null;
};

export const authorizeFencedEviaAuditTrailRead = async ({
  bucket, path, tenantId, user, membership, loadPublishedArchive
}) => {
  const target = parseFencedEviaAuditTrailPath(bucket, path);
  if (!target) return { applies: false, allowed: true };
  const deny = reason => ({ applies: true, allowed: false, reason });
  if (!tenantId || target.tenantId.toLowerCase() !== String(tenantId).toLowerCase()
      || !user?.id || !isAdminRole({ user, membership })
      || !hasPermission({ user, membership }, PERMISSIONS.AGREEMENTS_MANAGE)) {
    return deny('not_authorized');
  }
  if (typeof loadPublishedArchive !== 'function') return deny('publication_unavailable');
  const published = await loadPublishedArchive(target);
  if (!published || String(published.tenant_id || '').toLowerCase() !== target.tenantId.toLowerCase()
      || String(published.id || '').toLowerCase() !== target.agreementId.toLowerCase()
      || String(published.status || '').toLowerCase() !== 'signed'
      || String(published.signature_status || '').toLowerCase() !== 'completed'
      || !published.lease_processed) return deny('publication_unavailable');
  let proof;
  try { proof = JSON.parse(published.lease_raw_data || '{}'); }
  catch { return deny('publication_unavailable'); }
  if (String(proof.attemptId || '').toLowerCase() !== target.attemptId.toLowerCase()
      || String(proof.agreementId || '').toLowerCase() !== target.agreementId.toLowerCase()
      || published.signed_document_url !== proof.signedDocumentUrl
      || proof.state !== 'completed' || proof.auditTrailUrl !== target.url) {
    return deny('publication_unavailable');
  }
  return { applies: true, allowed: true };
};

 
// Legacy Evia completion stores audit_trail.pdf alongside the stable signed
// agreement file, not in a fenced attempt directory. Historic signing data
// has no processed archive-lease record to authenticate; keep disclosure
// restricted to a scoped tenant administrator and a completed agreement.
const historicAuditPattern = new RegExp(
  '^tenants/(' + uuid + ')/agreements/(' + uuid +
  ')/signed/audit_trail\\.pdf$', 'i'
);

export const parseHistoricEviaAuditTrailPath = (bucket, path) => {
  if (String(bucket || '').toLowerCase() !== 'documents') return null;
  const match = historicAuditPattern.exec(String(path || '').replace(/^[/]+/, ''));
  return match ? { tenantId: match[1], agreementId: match[2] } : null;
};

export const authorizeHistoricEviaAuditTrailRead = async ({
  bucket, path, tenantId, user, membership, loadHistoricAgreement
}) => {
  const target = parseHistoricEviaAuditTrailPath(bucket, path);
  if (!target) return { applies: false, allowed: true };
  const deny = reason => ({ applies: true, allowed: false, reason });
  if (!tenantId || String(tenantId).toLowerCase() !== target.tenantId.toLowerCase()
      || !user?.id || !isAdminRole({ user, membership })
      || !hasPermission({ user, membership }, PERMISSIONS.AGREEMENTS_MANAGE)
      || String(membership?.status || '').toLowerCase() !== 'active'
      || String(membership?.tenant_id || membership?.tenantId || '').toLowerCase()
        !== target.tenantId.toLowerCase()) {
    return deny('not_authorized');
  }
  if (typeof loadHistoricAgreement !== 'function') return deny('agreement_unavailable');
  const agreement = await loadHistoricAgreement(target);
  if (!agreement
      || String(agreement.id || '').toLowerCase() !== target.agreementId.toLowerCase()
      || String(agreement.tenant_id || '').toLowerCase() !== target.tenantId.toLowerCase()
      || String(agreement.status || '').toLowerCase() !== 'signed'
      || String(agreement.signature_status || '').toLowerCase() !== 'completed') {
    return deny('agreement_unavailable');
  }

  // Do not disclose a historic audit object solely because someone knows its
  // storage path. A completed, locally retained signed PDF is required.
  const expectedPrefix = '/storage/documents/tenants/' + target.tenantId.toLowerCase()
    + '/agreements/' + target.agreementId.toLowerCase() + '/signed/';
  const pdfs = [
    agreement.signed_document_url, agreement.signeddocumenturl,
    agreement.signature_pdf_url
  ].filter(value => typeof value === 'string');
  if (!pdfs.some(value => value.toLowerCase().startsWith(expectedPrefix)
      && !value.toLowerCase().includes('/signed/staged/'))) {
    return deny('signed_document_not_retained');
  }
  return { applies: true, allowed: true };
};
