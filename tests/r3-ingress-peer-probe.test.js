import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { observeR3IngressPeer } from '../src/api/auth/r3IngressPeerProbe.js';

const secret = 'a'.repeat(43);
const req = ({ authorization = 'Bearer ' + secret, peer = '::ffff:10.0.0.5',
    xff = '203.0.113.13', method = 'POST' } = {}) => ({
  method, originalUrl: '/api/internal/r3-ingress-peer',
  headers: { authorization, 'x-forwarded-proto': 'https' },
  socket: { remoteAddress: peer },
  rawHeaders: ['Host', 'app.quixo.homes', 'X-Forwarded-For', xff]
});
const response = () => {
  const r = { code: 200, body: null, headers: {} };
  r.set = (key, value) => { r.headers[key] = value; return r; };
  r.status = code => { r.code = code; return r; };
  r.json = body => { r.body = body; return r; };
  return r;
};

test('R3 ingress observation is absent without temporary credential', () => {
  const res = response();
  observeR3IngressPeer(req(), res, {});
  assert.equal(res.code, 404);
  assert.equal(res.headers['Cache-Control'], 'no-store, private');
});

test('R3 ingress observation is never available to anonymous/invalid tokens', () => {
  for (const token of ['', 'Bearer ' + 'b'.repeat(43), 'Bearer badly-formed']) {
    const res = response();
    observeR3IngressPeer(req({ authorization: token }), res,
      { PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret, PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) + 900 });
    assert.equal(res.code, 404);
  }
});

test('a verified probe returns the socket peer and the rightmost XFF, not spoofed leftmost', () => {
  const r = response();
  observeR3IngressPeer(req({ xff: '192.0.2.66, 203.0.113.13' }), r,
    { PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret, PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) + 900 });
  assert.equal(r.code, 200);
  assert.deepEqual(r.body, {
    peer: '10.0.0.5',
    rightmost: '203.0.113.13',
    xffHeaders: 1,
    xffHops: 2,
    forwardedProto: 'https',
    source: 'server_socket_and_raw_headers'
  });
});

test('R3 observation performs no body parsing and rejects payloads', () => {
  const r = response();
  const input = req();
  input.headers['content-length'] = '15';
  observeR3IngressPeer(input, r, { PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret, PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) + 900 });
  assert.equal(r.code, 400);
  assert.equal(r.body.code, 'NO_BODY');
});

test('R3 observation rejects malformed request method and missing XFF without admitting signup', () => {
  const r = response();
  observeR3IngressPeer(req({ method: 'GET' }), r,
    { PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret, PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) + 900 });
  assert.equal(r.code, 404);
  const r2 = response();
  const noXff = req();
  noXff.rawHeaders = ['Host', 'app.quixo.homes'];
  observeR3IngressPeer(noXff, r2,
    { PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret, PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) + 900 });
  assert.equal(r2.code, 200);
  assert.equal(r2.body.rightmost, null);
});

test('the ingress observer fails closed when temporary probe expiry has passed', () => {
  const res = response();
  observeR3IngressPeer(req(), res, {
    PUBLIC_SIGNUP_INGRESS_PROBE_SECRET: secret,
    PUBLIC_SIGNUP_INGRESS_PROBE_EXPIRES_AT: Math.floor(Date.now() / 1000) - 1
  });
  assert.equal(res.code, 404);
});

test('server passes only req/res to observer, never Express next as config', () => {
  const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(server, /app\.post\('\/api\/internal\/r3-ingress-peer', \(req, res\) => observeR3IngressPeer\(req, res\)\)/);
  assert.doesNotMatch(server, /app\.post\('\/api\/internal\/r3-ingress-peer', observeR3IngressPeer\)/);
});
