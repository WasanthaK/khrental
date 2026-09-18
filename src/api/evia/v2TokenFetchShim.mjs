const V1_TOKEN_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/api/v1/Token';
const V2_TOKEN_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/api/v2/token';

const originalFetch = globalThis.fetch.bind(globalThis);

const parseBody = (body, contentType = '') => {
  if (!body) return {};
  if (typeof body !== 'string') return {};

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }

  return Object.fromEntries(new URLSearchParams(body).entries());
};

const basicAuthorization = (clientId, clientSecret) =>
  `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

globalThis.fetch = async (input, init = {}) => {
  const requestUrl = typeof input === 'string' ? input : input?.url;
  if (requestUrl !== V1_TOKEN_URL) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init.headers || {});
  const payload = parseBody(init.body, headers.get('content-type') || '');
  const clientId = payload.client_id || process.env.EVIA_SIGN_CLIENT_ID || process.env.VITE_EVIA_SIGN_CLIENT_ID || '';
  const clientSecret = payload.client_secret || process.env.EVIA_SIGN_CLIENT_SECRET || '';

  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Evia Sign server credentials are not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const authorization = basicAuthorization(clientId, clientSecret);
  const grantType = String(payload.grant_type || '').toLowerCase();

  if (grantType === 'authorization_code') {
    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: payload.code || ''
    });

    return originalFetch(V2_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: form.toString()
    });
  }

  if (grantType === 'refresh_token') {
    const form = new FormData();
    form.append('Refresh_Token', payload.refresh_token || payload.Refresh_Token || '');
    form.append('Grant_Type', 'Refresh_Token');

    return originalFetch(V2_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        Accept: 'application/json'
      },
      body: form
    });
  }

  return originalFetch(input, init);
};
