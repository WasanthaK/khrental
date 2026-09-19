const EVIA_V2_TOKEN_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/api/v2/token';

const buildBasicAuthorization = (clientId, clientSecret) =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

const createOAuthError = async (response) => {
  const details = await response.text().catch(() => '');
  const error = new Error(details || `Evia token request failed with status ${response.status}`);
  error.status = response.status;
  error.code = 'EVIA_TOKEN_EXCHANGE_FAILED';
  return error;
};

/**
 * Exchange or refresh an Evia Sign OAuth token using the API V2 contract.
 *
 * Authorization-code requests are application/x-www-form-urlencoded.
 * Refresh requests intentionally use multipart/form-data because Evia V2
 * documents Refresh_Token / Grant_Type in the form-data contract.
 */
export const exchangeEviaV2Token = async ({
  grantType,
  code,
  refreshToken,
  clientId,
  clientSecret,
  fetchImpl = globalThis.fetch
} = {}) => {
  if (!clientId || !clientSecret) {
    const error = new Error('Evia Sign server credentials are not configured.');
    error.status = 503;
    error.code = 'EVIA_CREDENTIALS_REQUIRED';
    throw error;
  }

  if (typeof fetchImpl !== 'function') {
    throw new Error('A fetch implementation is required for Evia OAuth.');
  }

  const normalizedGrantType = String(grantType || '').trim().toLowerCase();
  const authorization = buildBasicAuthorization(clientId, clientSecret);
  let requestInit;

  if (normalizedGrantType === 'authorization_code') {
    if (!code) {
      const error = new Error('Authorization code is required.');
      error.status = 400;
      error.code = 'EVIA_AUTHORIZATION_CODE_REQUIRED';
      throw error;
    }

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: String(code)
    });

    requestInit = {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: form.toString()
    };
  } else if (normalizedGrantType === 'refresh_token') {
    if (!refreshToken) {
      const error = new Error('Refresh token is required.');
      error.status = 400;
      error.code = 'EVIA_REFRESH_TOKEN_REQUIRED';
      throw error;
    }

    const form = new FormData();
    form.append('Refresh_Token', String(refreshToken));
    form.append('Grant_Type', 'Refresh_Token');

    requestInit = {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json'
      },
      body: form
    };
  } else {
    const error = new Error('grantType must be authorization_code or refresh_token.');
    error.status = 400;
    error.code = 'EVIA_GRANT_TYPE_INVALID';
    throw error;
  }

  const response = await fetchImpl(EVIA_V2_TOKEN_URL, requestInit);
  if (!response.ok) {
    throw await createOAuthError(response);
  }

  return response.json();
};

export { EVIA_V2_TOKEN_URL, buildBasicAuthorization };
