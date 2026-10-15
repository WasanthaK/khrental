import { hasPermission, isAdminRole, PERMISSIONS } from '../platform/permissionEngine.js';

// A retained Evia-signed PDF is more sensitive than an ordinary tenant file.
// The path, agreement owner, final state and published archive all have to
// agree. This is not a global storage ACL: it covers only signed agreements.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const pathPattern = new RegExp(
  '^tenants/(' + uuid + ')/agreements/(' + uuid + ')/signed(?:/(.*))?$', 'i'
);
const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

export const parseSignedAgreementDocumentPath = (bucket, path) => {
  if (String(bucket || '').toLowerCase() !== 'documents') return null;
  const normalized = String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
  const match = pathPattern.exec(normalized);
  if (!match) return null;
  return {
    tenantId: match[1],
    agreementId: match[2],
    relativePath: match[3] || '',
    url: '/storage/documents/' + normalized
  };
};

export const authorizeSignedAgreementDocumentRead = async ({
  bucket, path, tenantId, user, membership, loadSignedAgreement, loadPublishedArchive
}) => {
  const target = parseSignedAgreementDocumentPath(bucket, path);
  if (!target) return { applies: false, allowed: true };
  const deny = reason => ({ applies: true, allowed: false, reason });
  if (!target.relativePath || !/\.pdf$/i.test(target.relativePath)
      || !same(target.tenantId, tenantId) || !user?.id
      || !same(membership?.tenant_id || membership?.tenantId, target.tenantId)
      || String(membership?.status || '').toLowerCase() !== 'active') {
    return deny('tenant_or_path_denied');
  }
  const admin = isAdminRole({ user, membership })
    && hasPermission({ user, membership }, PERMISSIONS.AGREEMENTS_MANAGE);
  if (typeof loadSignedAgreement !== 'function') return deny('agreement_not_available');
  const agreement = await loadSignedAgreement(target);
  if (!agreement || !same(agreement.id, target.agreementId)
      || !same(agreement.tenant_id, target.tenantId)
      || !['signed', 'completed', 'active'].includes(String(agreement.status || '').toLowerCase())
      || (agreement.eviasignreference &&
        String(agreement.signature_status || '').toLowerCase() !== 'completed')) {
    return deny('agreement_not_completed');
  }
  if (!admin && !same(user.id, agreement.renteeid)) return deny('not_agreement_owner');

  const retainedUrls = [
    agreement.signed_document_url, agreement.signeddocumenturl, agreement.signature_pdf_url
  ].filter(value => typeof value === 'string');
  if (!retainedUrls.some(value => same(value.split('?')[0], target.url))) {
    return deny('signed_document_not_retained');
  }

  const staged = /^staged\/([0-9a-f-]{36})\//i.exec(target.relativePath);
  if (staged) {
    if (typeof loadPublishedArchive !== 'function') return deny('archive_not_published');
    const record = await loadPublishedArchive(target);
    if (!record || !record.lease_processed || !same(record.tenant_id, target.tenantId)
        || !same(record.id, target.agreementId)
        || !same(record.signed_document_url, target.url)) return deny('archive_not_published');
    let proof;
    try { proof = JSON.parse(record.lease_raw_data || '{}'); }
    catch { return deny('archive_not_published'); }
    if (proof.state !== 'completed' || !same(proof.agreementId, target.agreementId)
        || !same(proof.attemptId, staged[1])
        || !same(proof.signedDocumentUrl, target.url)) return deny('archive_not_published');
  }
  return { applies: true, allowed: true };
};
