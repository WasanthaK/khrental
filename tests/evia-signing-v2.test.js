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
    message: 'Please sign',
    callbackUrl: 'https://example.com/api/evia/webhook?callback_token=abc',
    callbackTypes: [0],
    completedDocumentsAttached: true
  });

  assert.deepEqual(payload.Documents, ['doc-token']);
  assert.equal(payload.Title, 'Rental Agreement - A1');
  assert.equal(payload.Message, 'Please sign');
  assert.equal(payload.CallbackUrl, 'https://example.com/api/evia/webhook?callback_token=abc');
  assert.deepEqual(payload.CallbackTypes, [0]);
  assert.equal(payload.CompletedDocumentsAttached, true);
  assert.equal(payload.AuditDetails.AuthorType, 1);
  assert.deepEqual(payload.Connections, []);
});

test('V2 signatory and required signature AutoStamp preserve the KH Rentals anchor', () => {
  const landlord = { name: 'Property Owner', email: 'owner@example.com', textMarker: 'For Landlord:' };
  const signatory = buildV2SignatoryPayload(landlord, 0);
  const stamps = buildV2StampPayloads(landlord, 0);

  assert.equal(signatory.Email, 'owner@example.com');
  assert.equal(signatory.Name, 'Property Owner');
  assert.equal(signatory.Order, 1);
  assert.equal(signatory.SignatoryType, 1);
  assert.equal(signatory.OTP.IsRequired, false);
  assert.deepEqual(stamps, [
    { Identifier: 'For Landlord:', Type: 'signature' }
  ]);
});

test('V2 send follows create -> signatories -> stamps -> send sequence', async () => {
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
    callbackUrl: 'https://example.com/api/evia/webhook?callback_token=abc',
    callbackTypes: [0],
    completedDocumentsAttached: true,
    accessToken: 'access-token',
    fetchImpl
  });

  assert.equal(result.success, true);
  assert.equal(result.requestId, 'request-123');
  assert.equal(calls.length, 6);
  assert.match(calls[0].url, /\/api\/v2\/requests\?type=0$/);
  assert.match(calls.at(-1).url, /\/api\/v2\/requests\/request-123\/send$/);
  assert.equal(calls.at(-1).init.method, 'POST');

  const createBody = JSON.parse(calls[0].init.body);
  assert.deepEqual(createBody.Documents, ['doc-token']);
  assert.equal(createBody.CallbackUrl, 'https://example.com/api/evia/webhook?callback_token=abc');
  assert.deepEqual(createBody.CallbackTypes, [0]);
  assert.equal(createBody.CompletedDocumentsAttached, true);

  const firstSignerBody = JSON.parse(calls[1].init.body);
  assert.equal(firstSignerBody.SignatoryType, 1);
  const firstSignatureStamp = JSON.parse(calls[2].init.body);
  assert.deepEqual(firstSignatureStamp, { Identifier: 'For Landlord:', Type: 'signature' });

  const secondSignerBody = JSON.parse(calls[3].init.body);
  assert.equal(secondSignerBody.Email, 'tenant@example.com');
  const secondSignatureStamp = JSON.parse(calls[4].init.body);
  assert.deepEqual(secondSignatureStamp, { Identifier: 'For Tenant:', Type: 'signature' });
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
