export * from './eviaSignServiceLegacy.js';

import { ENV, getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';
import { sendDocumentForSignature as sendDocumentWithProvenAutoStamp } from './eviaSignServiceLegacy.js';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';
const EVIA_AUTH_STORAGE_KEY = 'eviaSignAuth';
const EVIA_REQUEST_URL = 'https://evia.enadocapp.com/_apis/sign/api/Requests';
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

const normalizeEviaStatus = (value) => {
  if (value === 3 || value === '3') return 'completed';
  if (value === 2 || value === '2') return 'in_progress';
  if (value === 1 || value === '1') return 'pending';

  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['completed', 'complete', 'signed', 'fully_signed'].includes(status)) return 'completed';
  if (['in_progress', 'partially_signed', 'partial', 'signing'].includes(status)) return 'in_progress';
  if (['pending', 'pending_signature', 'sent', 'received', 'created', 'awaiting_signature'].includes(status)) return 'pending';
  if (['cancelled', 'canceled', 'recalled', 'declined', 'failed'].includes(status)) return status === 'canceled' ? 'cancelled' : status;
  return status || 'unknown';
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
 *
 * OAuth remains on the V2 contract. Signature placement is independent of the
 * OAuth token exchange and is handled by the proven type=3 AutoStamp request
 * below.
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
 * Reliable status fallback for existing V1/type-3 requests and missed webhooks.
 */
export async function getSignatureStatus(requestId) {
  try {
    if (!requestId) throw new Error('Evia request ID is required.');
    const accessToken = await getActiveEviaAccessToken();
    const response = await fetch(`${EVIA_REQUEST_URL}/${encodeURIComponent(requestId)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      }
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
      ? await response.json()
      : { error: await response.text() };

    if (!response.ok) {
      throw new Error(data?.error || data?.message || `Evia status request failed with status ${response.status}`);
    }

    const rawStatus = data?.status ?? data?.Status ?? data?.requestStatus ?? data?.RequestStatus;
    const status = normalizeEviaStatus(rawStatus);
    return {
      success: true,
      status,
      completed: status === 'completed',
      rawStatus,
      signatories: data?.signatories || data?.Signatories || []
    };
  } catch (error) {
    console.error('[eviaSignService] Status lookup failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to get signature status'
    };
  }
}

/**
 * Send through the previously proven Evia type=3 AutoStamp contract.
 *
 * The V2 migration retained only the marker Identifier/Type pair and production
 * testing then failed to locate the signature position. The working type=3
 * request preserves Identifier, Color, Order, Offset and StampSize for the
 * `For Landlord:` / `For Tenant:` markers. V2 OAuth and the separately secured
 * webhook subscription remain unchanged.
 */
export async function sendDocumentForSignature(params) {
  return sendDocumentWithProvenAutoStamp(params);
}
