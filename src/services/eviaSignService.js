export * from './eviaSignServiceLegacy.js';

import { ENV } from '../utils/env';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';

/**
 * Evia Sign API V2 OAuth authorization URL.
 *
 * Keep this request aligned exactly with Evia's documented V2 example.
 * Evia uses the redirect URI registered against the application; it is not
 * supplied as a query parameter in the documented authorization request.
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  return `${EVIA_AUTHORIZATION_URL}` +
    `?application_state=external` +
    `&resource=RESOURCE_APPLICATION` +
    `&client_id=${encodeURIComponent(EVIA_SIGN_CLIENT_ID)}` +
    `&scope=Sign%20Falcon%20Licensing` +
    `&response_type=code`;
}
