export * from './eviaSignServiceLegacy.js';

import { ENV } from '../utils/env';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';

/**
 * Evia Sign API V2 OAuth authorization URL.
 *
 * V2 uses the registered callback URL configured in Evia Sign. The browser
 * request identifies the application, resource, requested scope, and response
 * type. The client secret is deliberately never exposed here.
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  const state = Math.random().toString(36).substring(2, 15);
  localStorage.setItem('eviaSignAuthState', state);

  const params = new URLSearchParams({
    application_state: 'external',
    resource: 'RESOURCE_APPLICATION',
    client_id: EVIA_SIGN_CLIENT_ID,
    scope: 'Sign Falcon Licensing',
    response_type: 'code',
    state
  });

  return `${EVIA_AUTHORIZATION_URL}?${params.toString()}`;
}
