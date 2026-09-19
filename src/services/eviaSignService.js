export * from './eviaSignServiceLegacy.js';

import { ENV, getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';
import { createAndSendV2SignatureRequest } from './eviaV2SigningService';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';
const EVIA_AUTH_STORAGE_KEY = 'eviaSignAuth';
const EVIA_DOCUMENT_UPLOAD_URL = 'https://evia.enadocapp.com/_apis/sign/thumbs/api/Requests/document';
let eviaAuthBridgeTimer = null;

const requestEviaToken = async (payload) => {
  const response = await fetch(`${getApiBaseUrl()}/api/evia/token`, {
    method: 'POST',
    headers: buildRequestContextHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }),
    body: JSON.stringify(payload)
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Evia token request failed with status ${response.status}`);
  }

  return data;
};

const persistEviaAuth = (data, fallbackUserEmail = null) => {
  const authToken = data.authToken || data.access_token || data.token;
  const refreshToken = data.refreshToken || data.refresh_token || null;
  if (!authToken) throw new Error('Invalid token response: missing auth token');

  const expiresIn = Number(data.expires_in) || 86400;
  const authData = {
    authToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000),
    userEmail: data.userEmail || data.email || fallbackUserEmail || null
  };

  localStorage.setItem(EVIA_AUTH_STORAGE_KEY, JSON.stringify(authData));
  return authData;
};

const getActiveEviaAccessToken = async () => {
  let storedAuth = {};
  try {
    storedAuth = JSON.parse(localStorage.getItem(EVIA_AUTH_STORAGE_KEY) || '{}');
  } catch (_error) {
    storedAuth = {};
  }

  if (storedAuth.authToken && storedAuth.expiresAt && storedAuth.expiresAt > Date.now()) {
    return storedAuth.authToken;
  }

  if (!storedAuth.refreshToken) {
    throw new Error('Evia Sign authentication is required.');
  }

  const refreshed = await requestEviaToken({
    grantType: 'refresh_token',
    refreshToken: storedAuth.refreshToken
  });
  return persistEviaAuth(refreshed, storedAuth.userEmail).authToken;
};

const uploadDocumentForV2Request = async (documentUrl, accessToken) => {
  if (!documentUrl) throw new Error('No document available for signature.');

  let blob;
  let fileName = `agreement_${Date.now()}.pdf`;

  if (documentUrl.startsWith('data:')) {
    const [metadata, encoded = ''] = documentUrl.split(',');
    const mimeType = metadata.match(/^data:([^;]+)/)?.[1] || 'application/pdf';
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    blob = new Blob([bytes], { type: mimeType });
    fileName = `agreement_${Date.now()}.${mimeType.includes('wordprocessingml') ? 'docx' : 'pdf'}`;
  } else {
    const documentResponse = await fetch(documentUrl);
    if (!documentResponse.ok) {
      throw new Error(`Failed to fetch agreement document: ${documentResponse.status} ${documentResponse.statusText}`);
    }
    blob = await documentResponse.blob();
    const lowerUrl = documentUrl.toLowerCase();
    if (lowerUrl.endsWith('.docx') || blob.type.includes('wordprocessingml')) {
      fileName = `agreement_${Date.now()}.docx`;
    }
  }

  const formData = new FormData();
  formData.append('File', blob, fileName);
  const uploadResponse = await fetch(EVIA_DOCUMENT_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    body: formData
  });

  const contentType = uploadResponse.headers.get('content-type') || '';
  const uploadData = contentType.includes('application/json')
    ? await uploadResponse.json()
    : await uploadResponse.text();

  if (!uploadResponse.ok) {
    const detail = typeof uploadData === 'string'
      ? uploadData
      : uploadData?.error || uploadData?.message || '';
    throw new Error(detail || `Evia document upload failed with status ${uploadResponse.status}`);
  }

  if (typeof uploadData === 'string' && uploadData.trim()) return uploadData.trim();
  const directToken = uploadData?.documentToken || uploadData?.DocumentToken;
  if (directToken) return directToken;

  const match = JSON.stringify(uploadData || {}).match(/[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}/);
  if (match?.[0]) return match[0];
  throw new Error('Evia document upload returned no document token.');
};

const startSameOriginAuthBridge = () => {
  if (typeof window === 'undefined') return;

  if (eviaAuthBridgeTimer) {
    window.clearInterval(eviaAuthBridgeTimer);
  }

  const initialValue = localStorage.getItem(EVIA_AUTH_STORAGE_KEY);
  const startedAt = Date.now();

  eviaAuthBridgeTimer = window.setInterval(() => {
    if (Date.now() - startedAt > 5 * 60 * 1000) {
      window.clearInterval(eviaAuthBridgeTimer);
      eviaAuthBridgeTimer = null;
      return;
    }

    const currentValue = localStorage.getItem(EVIA_AUTH_STORAGE_KEY);
    if (!currentValue || currentValue === initialValue) return;

    try {
      const authData = JSON.parse(currentValue);
      if (!authData?.authToken || !authData?.expiresAt || authData.expiresAt <= Date.now()) return;

      window.clearInterval(eviaAuthBridgeTimer);
      eviaAuthBridgeTimer = null;

      window.dispatchEvent(new MessageEvent('message', {
        data: {
          type: 'EVIA_AUTH_SUCCESS',
          data: {
            authToken: authData.authToken,
            refreshToken: authData.refreshToken || null,
            userEmail: authData.userEmail || null
          }
        }
      }));
    } catch (_error) {
      // Ignore incomplete storage writes and continue polling until timeout.
    }
  }, 500);
};

/**
 * Evia Sign API V2 OAuth authorization URL.
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('Evia Sign authorization requires a browser origin.');
  }

  const redirectUri = `${window.location.origin}/auth/evia-callback`;
  startSameOriginAuthBridge();

  return `${EVIA_AUTHORIZATION_URL}` +
    `?application_state=external` +
    `&resource=RESOURCE_APPLICATION` +
    `&client_id=${encodeURIComponent(EVIA_SIGN_CLIENT_ID)}` +
    `&responce_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange the Evia authorization code through the KH Rentals server.
 */
export async function handleAuthCallback(code) {
  if (!code) {
    throw new Error('No authorization code provided');
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('Evia Sign callback requires a browser origin.');
  }

  const redirectUri = `${window.location.origin}/auth/evia-callback`;
  const tokenResponse = await requestEviaToken({
    grantType: 'authorization_code',
    code,
    redirectUri
  });

  return persistEviaAuth(tokenResponse);
}

/**
 * Send the signature request through Evia Sign API V2.
 *
 * Keep the proven document-upload step, then follow Evia's V2 migration flow:
 * create skeleton request -> add signatories -> add AutoStamp identifiers -> send.
 * Webhook delivery is handled by the separately configured V2 webhook
 * subscription rather than by a request-specific callback URL.
 */
export async function sendDocumentForSignature(params) {
  try {
    const accessToken = await getActiveEviaAccessToken();
    const documentToken = await uploadDocumentForV2Request(params.documentUrl, accessToken);

    return await createAndSendV2SignatureRequest({
      documentToken,
      title: params.title,
      message: params.message,
      signatories: params.signatories,
      accessToken
    });
  } catch (error) {
    console.error('[eviaSignService] V2 signature request failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to send document for signature'
    };
  }
}
