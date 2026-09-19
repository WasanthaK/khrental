export * from './eviaSignServiceLegacy.js';

import { ENV, getApiBaseUrl } from '../utils/env';
import { buildRequestContextHeaders } from './requestContext';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';
const EVIA_AUTH_STORAGE_KEY = 'eviaSignAuth';

/**
 * Evia Sign API V2 OAuth authorization URL.
 *
 * Match Evia's documented authorization request exactly. The Evia example
 * uses the provider-specific `responce_type` spelling and requires the
 * registered redirect URI in the authorization request.
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('Evia Sign authorization requires a browser origin.');
  }

  const redirectUri = `${window.location.origin}/auth/evia-callback`;

  return `${EVIA_AUTHORIZATION_URL}` +
    `?application_state=external` +
    `&resource=RESOURCE_APPLICATION` +
    `&client_id=${encodeURIComponent(EVIA_SIGN_CLIENT_ID)}` +
    `&responce_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

/**
 * Exchange the Evia authorization code through the KH Rentals server.
 *
 * The callback runs in a same-origin popup after Evia redirects back to
 * /auth/evia-callback. Use the normal KH Rentals request context so the
 * protected /api/evia/token endpoint receives the user's existing bearer
 * session instead of returning AUTH_SESSION_REQUIRED.
 */
export async function handleAuthCallback(code) {
  if (!code) {
    throw new Error('No authorization code provided');
  }

  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('Evia Sign callback requires a browser origin.');
  }

  const redirectUri = `${window.location.origin}/auth/evia-callback`;
  const response = await fetch(`${getApiBaseUrl()}/api/evia/token`, {
    method: 'POST',
    headers: buildRequestContextHeaders({
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }),
    body: JSON.stringify({
      grantType: 'authorization_code',
      code,
      redirectUri
    })
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data?.error || data?.message || `Evia token request failed with status ${response.status}`);
  }

  const authToken = data.authToken || data.access_token || data.token;
  const refreshToken = data.refreshToken || data.refresh_token || null;
  if (!authToken) {
    throw new Error('Invalid token response: missing auth token');
  }

  const expiresIn = Number(data.expires_in) || 86400;
  const authData = {
    authToken,
    refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000),
    userEmail: data.userEmail || data.email || null
  };

  localStorage.setItem(EVIA_AUTH_STORAGE_KEY, JSON.stringify(authData));
  return authData;
}
