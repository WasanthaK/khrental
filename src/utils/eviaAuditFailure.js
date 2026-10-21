// Map only a canonical authenticated Evia audit PDF request to a diagnostic.
// The server still owns authentication, agreement publication and object access.
// Do not expose provider error bodies, storage keys or personal details.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const auditPath = new RegExp('^/storage/documents/tenants/' + uuid
  + '/agreements/' + uuid + '/signed/(?:staged/' + uuid + '/)?audit_trail\\.pdf$', 'i');
const generic = 'Unable to retrieve this document. Check access and try again.';

export const describeEviaAuditFetchFailure = ({ documentUrl, status = null, invalidPdf = false } = {}) => {
  let isAudit = false;
  try {
    isAudit = auditPath.test(new URL(documentUrl, 'https://app.invalid').pathname);
  } catch { /* Invalid inputs retain the generic message. */ }
  if (!isAudit) return generic;
  if (invalidPdf) return 'Signing audit response was not a valid PDF. Contact support (HTTP 200).';
  if (status === 401) return 'Signing audit session expired or was not accepted (HTTP 401). Sign in again.';
  if (status === 403) return 'Access denied to the signing audit (HTTP 403). Verify administrator access and agreement eligibility.';
  if (status === 404) return 'Signing audit PDF not found (HTTP 404). It may not have been retained in storage.';
  if (Number.isInteger(status)) return 'Signing audit retrieval failed on the server (HTTP ' + status + ').';
  return generic;
};
