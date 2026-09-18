export * from './eviaSignServiceLegacy.js';

import { ENV } from '../utils/env';

const EVIA_SIGN_CLIENT_ID = ENV.EVIA_SIGN_CLIENT_ID || '';
const EVIA_AUTHORIZATION_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/oauth2/authorize';
const DEFAULT_EVIA_SIGN_SCOPES = [
  'documents:read',
  'documents:write',
  'webhooks:write',
  'webhook.documents.download',
  'audit:read'
].join(' ');
const EVIA_SIGN_SCOPES = ENV.EVIA_SIGN_SCOPES || DEFAULT_EVIA_SIGN_SCOPES;

/**
 * Evia Sign API V2 OAuth authorization URL.
 *
 * The current Evia API App UI exposes granular scopes. Keep them runtime
 * configurable so production can stay aligned with the permissions granted
 * to the registered application without another code change.
 */
export function getAuthorizationUrl() {
  if (!EVIA_SIGN_CLIENT_ID) {
    throw new Error('Evia Sign Client ID is not configured for this deployment.');
  }

  if (!EVIA_SIGN_SCOPES) {
    throw new Error('Evia Sign OAuth scopes are not configured for this deployment.');
  }

  return `${EVIA_AUTHORIZATION_URL}` +
    `?application_state=external` +
    `&resource=RESOURCE_APPLICATION` +
    `&client_id=${encodeURIComponent(EVIA_SIGN_CLIENT_ID)}` +
    `&scope=${encodeURIComponent(EVIA_SIGN_SCOPES)}` +
    `&response_type=code`;
}
