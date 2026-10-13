// Preserve Evia staged agreement evidence until an explicitly governed
// retention and deletion policy exists. This is a safety guard, not a purge API.
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const stagedEvidence = new RegExp(
  '^tenants/' + uuid + '/agreements/' + uuid + '/signed/staged(?:/|$)', 'i'
);
const stagedAncestors = new RegExp(
  '^tenants/' + uuid + '/agreements/' + uuid + '/signed(?:/|$)', 'i'
);

export const assertEviaEvidenceDeletionAllowed = (bucket, paths = []) => {
  // Whole documents-bucket deletion is never justified by object-level
  // tenant authorization: it spans multiple tenants and agreements.
  if (String(bucket || '').toLowerCase() === 'documents'
      && (!Array.isArray(paths) || paths.length === 0)) {
    const error = new Error('Document bucket deletion is not authorized.');
    error.status = 403;
    error.code = 'EVIA_EVIDENCE_DELETE_DENIED';
    throw error;
  }
  if (String(bucket || '').toLowerCase() !== 'documents') return;
  for (const path of paths) {
    const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    // Protect both exact staged objects and recursive ancestor deletion.
    const isAncestor = normalized === 'tenants'
      || /^tenants\/[0-9a-f-]{36}$/i.test(normalized)
      || /^tenants\/[0-9a-f-]{36}\/agreements$/i.test(normalized)
      || /^tenants\/[0-9a-f-]{36}\/agreements\/[0-9a-f-]{36}$/i.test(normalized);
    if (!normalized || stagedEvidence.test(normalized) || stagedAncestors.test(normalized) || isAncestor) {
      const error = new Error('Evia agreement evidence deletion is disabled.');
      error.status = 403;
      error.code = 'EVIA_EVIDENCE_DELETE_DENIED';
      throw error;
    }
  }
};


// The public tenant storage-upload API is not an Evia archive writer.
// Reject all agreement "signed" paths at that entry point, including stable
// legacy PDFs, historic audit evidence and immutable staged attempts.
// Internal Evia archive storage calls do NOT use this generic API guard.
// This deliberately does not claim object-lock / R2 credential immutability.
const agreementSignedNamespace = new RegExp(
  '^tenants/' + uuid + '/agreements/' + uuid + '/signed(?:/|$)', 'i'
);

export const assertEviaGenericDocumentUploadAllowed = (bucket, relativePath) => {
  if (String(bucket || '').toLowerCase() !== 'documents') return;
  const normalized = String(relativePath || '').replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (agreementSignedNamespace.test(normalized)) {
    const error = new Error('Signed agreement evidence is reserved for the Evia archive writer.');
    error.status = 403;
    error.code = 'EVIA_EVIDENCE_UPLOAD_DENIED';
    throw error;
  }
};
