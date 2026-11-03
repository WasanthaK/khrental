import { downloadEviaCompletedPackage } from './completedPackage.js';
import { retainEviaAuditForVerifiedRequest } from './auditRecovery.js';
import { withEviaArchiveCapacity } from './archiveCapacity.js';

const auditDocuments = documents => documents.filter(document =>
  String(document.DocumentName || document.documentName || '').toLowerCase() === 'audit_trail.pdf');

// Invoked only after the verified webhook has matched the persisted Evia
// request to an agreement. Runs before terminal/duplicate acknowledgements:
// those guards must not discard a newly delivered audit for a signed PDF.
export const prepareEviaCompletionEvidence = async ({
  verifiedRequest, completed, agreement, requestId, completedPackage,
  documents = [], signedDocumentUrl,
  downloadPackage = downloadEviaCompletedPackage,
  retainAudit = retainEviaAuditForVerifiedRequest
}) => {
  if (!completed || (!completedPackage && auditDocuments(documents).length === 0)) return documents;
  if (!verifiedRequest || !agreement?.id || !agreement?.tenant_id || !requestId) {
    throw Object.assign(new Error('Verified agreement-bound completion is required.'), { code: 'EVIA_PACKAGE_UNVERIFIED', status: 403 });
  }
  if (['cancelled', 'rejected', 'terminated', 'expired'].includes(String(agreement.status).toLowerCase())
      || String(agreement.signature_status).toLowerCase() === 'failed') return documents;
  // Fenced publications retain the signed/audit pair under one immutable
  // attempt. Their existing publication and replay guards own that lifecycle;
  // the historic audit-only writer must never run against a staged URL.
  const fencedPrefix = `/storage/documents/tenants/${agreement.tenant_id}/agreements/${agreement.id}/signed/staged/`;
  if (typeof signedDocumentUrl === 'string'
      && signedDocumentUrl.toLowerCase().startsWith(fencedPrefix.toLowerCase())) return documents;
  const loadDocuments = () => completedPackage
    ? withEviaArchiveCapacity({ execute: () => downloadPackage({ completedPackage, verifiedRequest: true }) })
    : Promise.resolve(documents);
  if (!signedDocumentUrl) return loadDocuments();
  await retainAudit({
    tenantId: agreement.tenant_id, agreementId: agreement.id, requestId, signedDocumentUrl,
    loadAuditBody: async () => {
      const audits = auditDocuments(await loadDocuments());
      if (audits.length !== 1) throw Object.assign(new Error('A single provider audit PDF is required.'), { code: 'EVIA_PACKAGE_AUDIT_AMBIGUOUS', status: 502 });
      return Buffer.from(String(audits[0].DocumentContent || audits[0].documentContent || ''), 'base64');
    }
  });
  return documents;
};
