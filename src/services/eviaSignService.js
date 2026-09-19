export * from './eviaSignServiceLegacy.js';

import { ENV } from '../utils/env';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';

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
