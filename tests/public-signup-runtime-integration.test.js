import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { request as httpRequest } from 'node:http';
import { createApprovedSignupPeerPredicate, createPublicSignupRuntime } from '../src/api/auth/publicSignupRuntime.js';

const serve = async (runtime, fn) => {
  const app = express();
  app.use('/api/public-signup', runtime);
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  try {
    const origin = 'http://127.0.0.1:' + server.address().port;
    await fn(origin);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
};

test('approved Azure socket peers are exact and fail closed on missing or broad trust', () => {
  assert.equal(createApprovedSignupPeerPredicate('')('10.0.0.5'), false);
  assert.equal(createApprovedSignupPeerPredicate('0.0.0.0')('0.0.0.0'), false);
  assert.equal(createApprovedSignupPeerPredicate('10.0.0.0/8')('10.0.0.5'), false);
  assert.equal(createApprovedSignupPeerPredicate('10.0.0.5,10.0.0.5')('10.0.0.5'), false);
  const predicate = createApprovedSignupPeerPredicate('10.0.0.5,2001:db8::1');
  assert.equal(predicate('10.0.0.5'), true);
  assert.equal(predicate('10.0.0.6'), false);
  assert.equal(predicate('2001:0DB8::1'), true);
});

test('production defaults return 404 before request parsing and send no email or SQL', async () => {
  for (const config of [
    {},
    { PUBLIC_SIGNUP_ENABLED: 'true' },
    { PUBLIC_SIGNUP_PILOT_APPROVED: 'true' }
  ]) {
    await serve(createPublicSignupRuntime({ config }), async origin => {
      for (const path of ['/challenge', '/redeem']) {
        const r = await fetch(origin + '/api/public-signup' + path, {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'this request must never reach a parser'
        });
        assert.equal(r.status, 404);
        assert.equal((await r.json()).code, 'PUBLIC_SIGNUP_DISABLED');
        assert.match(r.headers.get('cache-control'), /no-store/);
      }
    });
  }
});

test('two pilot flags cannot bypass trusted ingress, origin or verified sender', async () => {
  const config = {
    PUBLIC_SIGNUP_ENABLED: 'true', PUBLIC_SIGNUP_PILOT_APPROVED: 'true',
    PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS: '127.0.0.1',
    PUBLIC_SIGNUP_THROTTLE_SECRET: 'x'.repeat(48)
  };
  await serve(createPublicSignupRuntime({ config }), async origin => {
    const forbidden = await fetch(origin + '/api/public-signup/challenge', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Example', email: 'example@example.invalid' })
    });
    assert.equal(forbidden.status, 403, 'host/origin mismatch must be rejected before any SQL/mail');

    const noTrustedPeer = { ...config, PUBLIC_SIGNUP_TRUSTED_INGRESS_PEERS: '' };
    await serve(createPublicSignupRuntime({ config: noTrustedPeer }), async other => {
      const result = await fetch(other + '/api/public-signup/challenge', {
        method: 'POST',
        headers: { 'content-type': 'application/json',
          origin: 'https://app.quixo.homes', host: 'app.quixo.homes',
          'x-forwarded-for': '203.0.113.20' },
        body: JSON.stringify({ name: 'Example', email: 'example@example.invalid' })
      });
      assert.ok([403, 503].includes(result.status), 'untrusted ingress must never create a user');
    });
  });
});

test('production signup pilot flags alone cannot open registration without one mailbox', async () => {
  await serve(createPublicSignupRuntime({ config: {
    NODE_ENV: 'production', PUBLIC_SIGNUP_ENABLED: 'true',
    PUBLIC_SIGNUP_PILOT_APPROVED: 'true'
  } }), async origin => {
    const r = await fetch(origin + '/api/public-signup/challenge', { method: 'POST' });
    assert.equal(r.status, 404);
    assert.equal((await r.json()).code, 'PUBLIC_SIGNUP_DISABLED');
  });
});

test('ingress 503 is diagnosed before parsing without logging client addresses or body', async t => {
  const logged = [];
  t.mock.method(console, 'error', (...parts) => logged.push(parts));
  await serve(createPublicSignupRuntime({config:{
    PUBLIC_SIGNUP_ENABLED:'true', PUBLIC_SIGNUP_PILOT_APPROVED:'true'
  }}), async origin => {
    const body = 'private-invalid-json-token-password';
    const r = await new Promise((resolve, reject) => {
      // Native fetch controls Host itself; use the HTTP fixture client to
      // represent the actual pinned host/origin while retaining a local socket.
      const req = httpRequest(origin+'/api/public-signup/redeem', {
        method:'POST',headers:{'content-type':'application/json',host:'app.quixo.homes',
          origin:'https://app.quixo.homes','x-forwarded-for':'203.0.113.99',
          'content-length':Buffer.byteLength(body)}
      }, response => {
        let text = '';
        response.on('data', chunk => {text += chunk;});
        response.on('end', () => resolve({status:response.statusCode,body:JSON.parse(text)}));
      });
      req.on('error', reject);
      req.end(body);
    });
    assert.equal(r.status,503);
    assert.equal(r.body.code,'PUBLIC_SIGNUP_NOT_READY');
  });
  assert.deepEqual(logged,[['[PublicSignupUnavailable]',{
    stage:'ingress_client_address',category:'UNCLASSIFIED'
  }]]);
});
