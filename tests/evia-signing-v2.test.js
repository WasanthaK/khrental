import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildV2CreateRequestPayload,
  buildV2SignatoryPayload,
  buildV2StampPayloads,
  createAndSendV2SignatureRequest
} from '../src/services/eviaV2SigningService.js';

test('V2 request payload uses the uploaded document and global webhook model', () => {
  const payload = buildV2CreateRequestPayload({
    documentToken: 'doc-token',
    title: 'Rental Agreement - A1',
    message: 'Please sign'
  });

  assert.deepEqual(payload.Documents, ['doc-token']);
  assert.equal(payload.Title, 'Rental Agreement - A1');
  assert.equal(payload.Message, 'Please sign');
  assert.equal(payload.AuditDetails.AuthorType, 1);
  assert.deepEqual(payload.Connections, []);
  assert.equal(Object.hasOwn(payload, 'CallbackUrl'), false);
  assert.equal(Object.hasOwn(payload, 'CallbackTypes'), false);
});

test('V2 signatory and AutoStamp payloads preserve KH Rentals identifiers', () => {
  const landlord = { name: 'Property Owner', email: 'owner@example.com', textMarker: 'For Landlord:' };
  const signatory = buildV2SignatoryPayload(landlord, 0);
  const stamps = buildV2StampPayloads(landlord, 0);

  assert.equal(signatory.Email, 'owner@example.com');
  assert.equal(signatory.Name, 'Property Owner');
  assert.equal(signatory.Order, 1);
  assert.equal(signatory.SignatoryType, 1);
  assert.equal(signatory.OTP.IsRequired, false);
  assert.deepEqual(stamps, [
    { Identifier: 'For Landlord:', Type: 'signature' },
    { Identifier: 'email1', Type: 'email' },
    { Identifier: 'Date1', Type: 'date' }
  ]);
});

test('V2 send creates all signatories before stamps, then sends', async () => {
  const calls = [];
  let signerCounter = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });

    if (url.endsWith('/requests?type=0')) {
      return new Response(JSON.stringify({ requestId: 'request-123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.endsWith('/signatories')) {
      signerCounter += 1;
      return new Response(JSON.stringify({ requestId: 'request-123', signatoryId: `signer-${signerCounter}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.endsWith('/stamps')) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.endsWith('/send')) {
      return new Response(JSON.stringify({ requestId: 'request-123', embeddedSigningUrl: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await createAndSendV2SignatureRequest({
    documentToken: 'doc-token',
    title: 'Rental Agreement',
    message: 'Please sign',
    signatories: [
      { name: 'Property Owner', email: 'owner@example.com', textMarker: 'For Landlord:' },
      { name: 'Tenant', email: 'tenant@example.com', textMarker: 'For Tenant:' }
    ],
    accessToken: 'access-token',
    fetchImpl
  });

  assert.equal(result.success, true);
  assert.equal(result.requestId, 'request-123');
  assert.equal(calls.length, 10);
  assert.match(calls[0].url, /\/api\/v2\/requests\?type=0$/);
  assert.match(calls.at(-1).url, /\/api\/v2\/requests\/request-123\/send$/);
  assert.equal(calls.at(-1).init.method, 'POST');

  const createBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(createBody.Documents, ['doc-token']);

  const firstSignerBody = JSON.parse(calls[1].init.body);
  const secondSignerBody = JSON.parse(calls[2].init.body);
  assert.equal(firstSignerBody.SignatoryType, 1);
  assert.equal(secondSignerBody.Email, 'tenant@example.com');

  const firstSignatureStamp = JSON.parse(calls[3].init.body);
  assert.deepEqual(firstSignatureStamp, { Identifier: 'For Landlord:', Type: 'signature' });
  const secondDateStamp = JSON.parse(calls[8].init.body);
  assert.deepEqual(secondDateStamp, { Identifier: 'Date2', Type: 'date' });
});

test('V2 stamp creation retries a transient signatory-not-found 404', async () => {
  const calls = [];
  let stampAttempts = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });

    if (url.endsWith('/requests?type=0')) {
      return new Response(JSON.stringify({ requestId: 'request-retry' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/signatories')) {
      return new Response(JSON.stringify({ signatoryId: 'signer-retry' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/stamps')) {
      stampAttempts += 1;
      if (stampAttempts === 1) {
        return new Response(JSON.stringify({ error: 'Signatory ID not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/send')) {
      return new Response(JSON.stringify({ requestId: 'request-retry' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const sleeps = [];
  const result = await createAndSendV2SignatureRequest({
    documentToken: 'doc-token',
    signatories: [{ name: 'Owner', email: 'owner@example.com', textMarker: 'For Landlord:' }],
    accessToken: 'access-token',
    fetchImpl,
    sleepImpl: async (milliseconds) => { sleeps.push(milliseconds); },
    stampRetryDelaysMs: [50]
  });

  assert.equal(result.success, true);
  assert.equal(stampAttempts, 4);
  assert.deepEqual(sleeps, [50]);
  assert.equal(calls.some(({ url }) => url.endsWith('/send')), true);
});

test('V2 send fails closed and does not send if stamp creation fails', async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });

    if (url.endsWith('/requests?type=0')) {
      return new Response(JSON.stringify({ requestId: 'request-456' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/signatories')) {
      return new Response(JSON.stringify({ signatoryId: 'signer-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    if (url.endsWith('/stamps')) {
      return new Response(JSON.stringify({ error: 'Invalid stamp identifier' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error('The request must not reach send after a failed stamp.');
  };

  await assert.rejects(
    createAndSendV2SignatureRequest({
      documentToken: 'doc-token',
      signatories: [{ name: 'Owner', email: 'owner@example.com', textMarker: 'For Landlord:' }],
      accessToken: 'access-token',
      fetchImpl
    }),
    /Invalid stamp identifier/
  );

  assert.equal(calls.some(({ url }) => url.endsWith('/send')), false);
});
