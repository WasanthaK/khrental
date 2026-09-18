const TOKEN_URL = 'https://evia.enadocapp.com/_apis/falcon/auth/api/v2/token';
const DEFAULT_SCOPES = [
  'documents:read',
  'documents:write',
  'webhooks:write',
  'webhook.documents.download',
  'audit:read'
];

const clientId = process.env.EVIA_SIGN_CLIENT_ID || '';
const clientSecret = process.env.EVIA_SIGN_CLIENT_SECRET || '';
const scope = process.env.EVIA_SIGN_SCOPES || DEFAULT_SCOPES.join(' ');

if (!clientId || !clientSecret) {
  console.error('Evia API App credentials are not configured.');
  process.exit(1);
}

const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
const body = new URLSearchParams({
  grant_type: 'client_credentials',
  client_id: clientId,
  client_secret: clientSecret,
  scope
});

const response = await fetch(TOKEN_URL, {
  method: 'POST',
  headers: {
    Authorization: `Basic ${basicAuth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json'
  },
  body: body.toString()
});

const raw = await response.text();
let payload = {};
try {
  payload = raw ? JSON.parse(raw) : {};
} catch {
  payload = { message: raw.slice(0, 500) };
}

if (!response.ok) {
  const safeError = {
    status: response.status,
    statusText: response.statusText,
    error: payload.error || payload.code || null,
    message: payload.error_description || payload.message || 'Evia token request failed'
  };
  console.error('Evia API App authentication failed:', safeError);
  process.exit(1);
}

const accessToken = payload.access_token || payload.authToken || payload.token;
if (!accessToken) {
  console.error('Evia API App authentication returned success but no access token.');
  process.exit(1);
}

console.log('Evia API App authentication succeeded.');
console.log(JSON.stringify({
  token_type: payload.token_type || 'bearer',
  expires_in: payload.expires_in || null,
  scope: payload.scope || scope,
  client_id_suffix: clientId.slice(-8)
}, null, 2));
