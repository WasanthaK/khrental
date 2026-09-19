import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVIA_V2_TOKEN_URL,
  buildBasicAuthorization,
  exchangeEviaV2Token
} from '../src/api/evia/oauthV2.js';

const jsonResponse = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'Content-Type': 'application/json' }
});

test('authorization code exchange uses Evia V2 Basic auth and form encoding', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return jsonResponse({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 3600
    });
  };

  const result = await exchangeEviaV2Token({
    grantType: 'authorization_code',
    code: 'auth-code',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl
  });

  assert.equal(captured.url, EVIA_V2_TOKEN_URL);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, buildBasicAuthorization('client-id', 'client-secret'));
  assert.equal(captured.init.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(captured.init.headers.Accept, 'application/json');

  const body = new URLSearchParams(captured.init.body);
  assert.equal(body.get('grant_type'), 'authorization_code');
  assert.equal(body.get('client_id'), 'client-id');
  assert.equal(body.get('client_secret'), 'client-secret');
  assert.equal(body.get('code'), 'auth-code');
  assert.equal(body.has('redirect_uri'), false);
  assert.equal(result.access_token, 'access-token');
  assert.equal(result.refresh_token, 'refresh-token');
});

test('refresh exchange uses the Evia V2 multipart Refresh_Token contract', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return jsonResponse({ access_token: 'new-access-token', refresh_token: 'new-refresh-token' });
  };

  const result = await exchangeEviaV2Token({
    grantType: 'refresh_token',
    refreshToken: 'existing-refresh-token',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    fetchImpl
  });

  assert.equal(captured.url, EVIA_V2_TOKEN_URL);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, buildBasicAuthorization('client-id', 'client-secret'));
  assert.equal(captured.init.headers.Accept, 'application/json');
  assert.equal(captured.init.headers['Content-Type'], undefined);
  assert.ok(captured.init.body instanceof FormData);
  assert.equal(captured.init.body.get('Refresh_Token'), 'existing-refresh-token');
  assert.equal(captured.init.body.get('Grant_Type'), 'Refresh_Token');
  assert.equal(result.access_token, 'new-access-token');
});

test('provider errors fail closed without falling back to API V1', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return new Response('invalid_grant', { status: 400 });
  };

  await assert.rejects(
    exchangeEviaV2Token({
      grantType: 'authorization_code',
      code: 'bad-code',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImpl
    }),
    (error) => {
      assert.equal(error.status, 400);
      assert.equal(error.code, 'EVIA_TOKEN_EXCHANGE_FAILED');
      assert.match(error.message, /invalid_grant/);
      return true;
    }
  );

  assert.equal(callCount, 1);
});

test('missing credentials and grant inputs are rejected before network calls', async () => {
  let callCount = 0;
  const fetchImpl = async () => {
    callCount += 1;
    return jsonResponse({});
  };

  await assert.rejects(
    exchangeEviaV2Token({
      grantType: 'authorization_code',
      code: 'code',
      fetchImpl
    }),
    (error) => error.code === 'EVIA_CREDENTIALS_REQUIRED'
  );

  await assert.rejects(
    exchangeEviaV2Token({
      grantType: 'authorization_code',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImpl
    }),
    (error) => error.code === 'EVIA_AUTHORIZATION_CODE_REQUIRED'
  );

  await assert.rejects(
    exchangeEviaV2Token({
      grantType: 'refresh_token',
      clientId: 'client-id',
      clientSecret: 'client-secret',
      fetchImpl
    }),
    (error) => error.code === 'EVIA_REFRESH_TOKEN_REQUIRED'
  );

  assert.equal(callCount, 0);
});
