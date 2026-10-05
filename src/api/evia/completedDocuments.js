import { getStorageDriver, normalizeStoragePath } from '../storage/index.js';

export const EVIA_DOCUMENT_API_BASE_URL = 'https://evia.enadocapp.com/_apis/sign/api/v2';
export const EVIA_INTEGRATION_API_BASE_URL = 'https://evia.enadocapp.com/api/v2';
const EVIA_DOWNLOAD_HOST = 'evia.enadocapp.com';
const MAX_COMPLETED_DOCUMENT_BYTES = 50 * 1024 * 1024;

const createHttpError = (message, status, code) => {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
};

const parseJsonResponse = async (response, errorCode) => {
  const contentType = response.headers?.get?.('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw createHttpError(
      payload?.error || payload?.message || `Evia request failed with status ${response.status}`,
      response.status,
      errorCode
    );
  }

  return payload;
};

const safeStorageSegment = (value, label) => {
  const normalized = String(value || '').trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    const error = new Error(`Invalid ${label} for signed-document storage.`);
    error.code = 'EVIA_SIGNED_DOCUMENT_STORAGE_ID_INVALID';
    throw error;
  }
  return normalized;
};

export const sanitizeCompletedDocumentName = (value, fallback = 'signed_agreement.pdf') => {
  const leafName = String(value || fallback).split(/[\\/]+/).filter(Boolean).pop() || fallback;
  const normalized = leafName
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 180);

  return normalized || fallback;
};

export const validateEviaDownloadUrl = (value) => {
  let parsed;
  try {
    parsed = new URL(String(value || ''));
  } catch (_error) {
    throw createHttpError('Evia returned an invalid completed-document download URL.', 502, 'EVIA_DOWNLOAD_URL_INVALID');
  }

  if (
    parsed.protocol !== 'https:'
    || parsed.hostname.toLowerCase() !== EVIA_DOWNLOAD_HOST
    || !parsed.pathname.startsWith('/_apis/sign/api/v2/documents/')
  ) {
    throw createHttpError('Evia returned an untrusted completed-document download URL.', 502, 'EVIA_DOWNLOAD_URL_UNTRUSTED');
  }

  return parsed.toString();
};

export const exchangeEviaIntegrationApiKey = async ({
  apiKey,
  fetchImpl = fetch,
  baseUrl = EVIA_INTEGRATION_API_BASE_URL
}) => {
  if (!apiKey) {
    const error = new Error('Evia integration API key is not configured.');
    error.status = 503;
    error.code = 'EVIA_INTEGRATION_API_KEY_REQUIRED';
    throw error;
  }

  const response = await fetchImpl(`${baseUrl}/oauth/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey
    },
    body: '{}'
  });

  const payload = await parseJsonResponse(response, 'EVIA_API_KEY_EXCHANGE_FAILED');
  const accessToken = payload?.access_token || payload?.accessToken || null;
  if (!accessToken) {
    throw createHttpError('Evia API-key exchange returned no access token.', 502, 'EVIA_API_KEY_EXCHANGE_INVALID');
  }

  return {
    accessToken,
    expiresIn: Number(payload?.expires_in || payload?.expiresIn || 1800)
  };
};

export const listEviaCompletedDocuments = async ({
  requestId,
  accessToken,
  fetchImpl = fetch,
  baseUrl = EVIA_DOCUMENT_API_BASE_URL
}) => {
  if (!requestId || !accessToken) {
    throw new Error('requestId and accessToken are required to list completed Evia documents.');
  }

  const response = await fetchImpl(
    `${baseUrl}/requests/${encodeURIComponent(requestId)}/documents`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    }
  );

  const payload = await parseJsonResponse(response, 'EVIA_COMPLETED_DOCUMENT_LIST_FAILED');
  const documents = Array.isArray(payload) ? payload : payload?.documents;

  if (!Array.isArray(documents) || documents.length === 0) {
    throw createHttpError('Evia returned no completed documents for the request.', 502, 'EVIA_COMPLETED_DOCUMENTS_EMPTY');
  }

  return documents.map((document, index) => ({
    index,
    documentName: sanitizeCompletedDocumentName(
      document?.documentName || document?.DocumentName,
      `signed_document_${index + 1}.pdf`
    ),
    downloadUrl: validateEviaDownloadUrl(document?.downloadUrl || document?.DownloadUrl)
  }));
};

export const downloadEviaCompletedDocument = async ({
  downloadUrl,
  accessToken,
  fetchImpl = fetch
}) => {
  if (!accessToken) {
    throw new Error('accessToken is required to download a completed Evia document.');
  }

  const trustedUrl = validateEviaDownloadUrl(downloadUrl);
  const response = await fetchImpl(trustedUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw createHttpError(
      `Evia completed-document download failed with status ${response.status}`,
      response.status,
      'EVIA_COMPLETED_DOCUMENT_DOWNLOAD_FAILED'
    );
  }

  const body = Buffer.from(await response.arrayBuffer());
  if (body.length === 0) {
    throw createHttpError('Evia completed-document download returned an empty file.', 502, 'EVIA_COMPLETED_DOCUMENT_EMPTY');
  }
  if (body.length > MAX_COMPLETED_DOCUMENT_BYTES) {
    throw createHttpError('Evia completed document exceeds the supported 50 MB limit.', 502, 'EVIA_COMPLETED_DOCUMENT_TOO_LARGE');
  }

  return {
    body,
    contentType: response.headers?.get?.('content-type') || 'application/pdf'
  };
};

const buildStoredDocumentUrl = (bucket, relativePath) => {
  const encodedPath = normalizeStoragePath(relativePath)
    .split('/')
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');
  return `/storage/${encodeURIComponent(bucket)}/${encodedPath}`;
};

export const retrieveAndStoreEviaCompletedDocuments = async ({
  requestId,
  tenantId,
  agreementId,
  apiKey = process.env.EVIA_SIGN_API_KEY || '',
  fetchImpl = fetch,
  storageDriver = getStorageDriver(),
  documentBaseUrl = EVIA_DOCUMENT_API_BASE_URL,
  integrationBaseUrl = EVIA_INTEGRATION_API_BASE_URL
}) => {
  const safeTenantId = safeStorageSegment(tenantId, 'tenant ID');
  const safeAgreementId = safeStorageSegment(agreementId, 'agreement ID');
  if (!requestId) {
    throw new Error('Evia request ID is required to retrieve completed documents.');
  }

  let tokenState = await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl, baseUrl: integrationBaseUrl });

  const withTokenRefresh = async (operation) => {
    try {
      return await operation(tokenState.accessToken);
    } catch (error) {
      if (Number(error?.status) !== 401) throw error;
      tokenState = await exchangeEviaIntegrationApiKey({ apiKey, fetchImpl, baseUrl: integrationBaseUrl });
      return operation(tokenState.accessToken);
    }
  };

  const documents = await withTokenRefresh((accessToken) => listEviaCompletedDocuments({
    requestId,
    accessToken,
    fetchImpl,
    baseUrl: documentBaseUrl
  }));

  const storedDocuments = [];
  for (const document of documents) {
    const downloaded = await withTokenRefresh((accessToken) => downloadEviaCompletedDocument({
      downloadUrl: document.downloadUrl,
      accessToken,
      fetchImpl
    }));

    const relativePath = normalizeStoragePath(
      `tenants/${safeTenantId}/agreements/${safeAgreementId}/signed/${document.documentName}`
    );

    await storageDriver.upload('documents', relativePath, downloaded.body, downloaded.contentType);

    storedDocuments.push({
      documentName: document.documentName,
      relativePath,
      url: buildStoredDocumentUrl('documents', relativePath),
      auditTrail: document.documentName.toLowerCase() === 'audit_trail.pdf'
    });
  }

  const signedDocument = storedDocuments.find((document) => !document.auditTrail);
  if (!signedDocument) {
    throw createHttpError('Evia completed documents did not include a signed agreement.', 502, 'EVIA_SIGNED_DOCUMENT_MISSING');
  }

  const auditTrail = storedDocuments.find((document) => document.auditTrail) || null;

  return {
    signedDocumentUrl: signedDocument.url,
    signedDocumentName: signedDocument.documentName,
    auditTrailUrl: auditTrail?.url || null,
    storedDocuments
  };
};
