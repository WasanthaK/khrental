import { getStorageDriver } from '../storage/index.js';
import { authorizeHistoricEviaAuditTrailRead } from './auditTrailAccess.js';
import { listEviaCompletedDocuments, downloadEviaCompletedDocument, exchangeEviaIntegrationApiKey } from './completedDocuments.js';

const failure = (message, status, code) => Object.assign(new Error(message), { status, code });
const missing = error => error?.status === 404 || error?.code === 'ENOENT' || error?.code === 'STORAGE_OBJECT_NOT_FOUND';
const validPdf = body => Buffer.isBuffer(body) && body.length >= 5
  && body.length <= 50 * 1024 * 1024 && body.subarray(0, 5).toString() === '%PDF-';

// Recover only the existing provider audit. Never rewrite the signed PDF,
// agreement status, signature rows or fenced archive publication records.
// Trusted, request-bound archival primitive. The HTTP handler authorizes the
// administrator before calling this; verified webhook processing supplies the
// agreement/request binding internally. Never accept a client-selected key.
export const retainEviaAuditForVerifiedRequest = async ({
  tenantId, agreementId, requestId, signedDocumentUrl, accessToken = '',
  storageDriver = getStorageDriver(), fetchImpl = fetch,
  apiKey = process.env.EVIA_SIGN_API_KEY || ''
}) => {
  const prefix = `/storage/documents/tenants/${tenantId}/agreements/${agreementId}/signed/`;
  const validSigned = typeof signedDocumentUrl === 'string'
    && signedDocumentUrl.toLowerCase().startsWith(prefix.toLowerCase())
    && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\\.pdf$/i.test(signedDocumentUrl.slice(prefix.length))
    && !signedDocumentUrl.toLowerCase().endsWith('/audit_trail.pdf');
  if (!validSigned) throw failure('Only retained historic agreement audits can be recovered here.', 409, 'EVIA_AUDIT_RECOVERY_SCOPE');
  if (!String(requestId || '').trim()) throw failure('Agreement has no Evia request reference.', 409, 'EVIA_REQUEST_REFERENCE_MISSING');
  const objectPath = signedDocumentUrl.slice('/storage/documents/'.length, signedDocumentUrl.lastIndexOf('/') + 1) + 'audit_trail.pdf';
  const auditTrailUrl = '/storage/documents/' + objectPath;
  try {
    const existing = await storageDriver.getObject('documents', objectPath);
    if (!validPdf(existing.body)) throw failure('The retained audit is invalid; recovery will not overwrite it.', 409, 'EVIA_AUDIT_RETAINED_INVALID');
    return { auditTrailUrl, recovered: false };
  } catch (error) { if (!missing(error)) throw error; }

  let token = String(accessToken || '').trim();
  const supplied = Boolean(token);
  if (!token) token = (await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl })).accessToken;
  const withRefresh = async operation => {
    try { return await operation(token); }
    catch (error) {
      if (error.status !== 401 || supplied) throw error;
      token = (await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl })).accessToken;
      return operation(token);
    }
  };
  const documents = await withRefresh(accessToken => listEviaCompletedDocuments({ requestId, accessToken, fetchImpl }));
  const audits = documents.filter(document => document.documentName.toLowerCase() === 'audit_trail.pdf');
  if (audits.length !== 1) throw failure('Evia must return exactly one audit_trail.pdf for this agreement request.', 502, 'EVIA_AUDIT_DOCUMENT_MISSING_OR_AMBIGUOUS');
  const downloaded = await withRefresh(accessToken => downloadEviaCompletedDocument({ downloadUrl: audits[0].downloadUrl, accessToken, fetchImpl }));
  if (!validPdf(downloaded.body)) throw failure('Evia did not return a valid audit PDF.', 502, 'EVIA_AUDIT_PDF_INVALID');
  await storageDriver.createEviaAuditIfAbsent('documents', objectPath, downloaded.body);
  const retained = await storageDriver.getObject('documents', objectPath);
  if (!Buffer.isBuffer(retained.body) || !retained.body.equals(downloaded.body)) {
    throw failure('Retained audit bytes differ from the provider document; nothing was overwritten.', 409, 'EVIA_AUDIT_READBACK_CONFLICT');
  }
  return { auditTrailUrl, recovered: true };
};

// Human-triggered recovery keeps its existing tenant/session/administrator
// checks; only the trusted archival primitive is shared with completion.
export const recoverHistoricEviaAudit = async ({
  agreementId, tenantId, user, membership, loadAgreement, accessToken = '',
  storageDriver = getStorageDriver(), fetchImpl = fetch,
  apiKey = process.env.EVIA_SIGN_API_KEY || ''
}) => {
  const path = `tenants/${tenantId}/agreements/${agreementId}/signed/audit_trail.pdf`;
  let agreement;
  const permission = await authorizeHistoricEviaAuditTrailRead({
    bucket: 'documents', path, tenantId, user, membership,
    loadHistoricAgreement: async () => { agreement = await loadAgreement(agreementId, tenantId); return agreement; }
  });
  if (!permission.applies || !permission.allowed) {
    throw failure('Audit recovery requires an active tenant administrator and a retained completed agreement.', 403, 'EVIA_AUDIT_RECOVERY_DENIED');
  }
  const prefix = `/storage/documents/tenants/${tenantId}/agreements/${agreementId}/signed/`;
  const signedDocumentUrl = [agreement.signed_document_url, agreement.signeddocumenturl, agreement.signature_pdf_url]
    .find(value => typeof value === 'string' && value.toLowerCase().startsWith(prefix.toLowerCase())
      && /^[A-Za-z0-9_-][A-Za-z0-9._-]*\\.pdf$/i.test(value.slice(prefix.length)));
  return retainEviaAuditForVerifiedRequest({
    tenantId, agreementId, requestId: agreement.eviasignreference,
    signedDocumentUrl, accessToken, storageDriver, fetchImpl, apiKey
  });
};
