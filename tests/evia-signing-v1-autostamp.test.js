import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildV1AutoStampRequestPayload,
  createAndSendV1AutoStampRequest
} from '../src/services/eviaV1AutoStampService.js';

test('V1 AutoStamp payload preserves proven KH Rentals placement semantics', () => {
  const payload = buildV1AutoStampRequestPayload({
    documentToken: 'doc-token',
    title: 'Rental Agreement',
    message: 'Please sign',
    signatories: [
      { name: 'Owner', email: 'owner@example.com', textMarker: 'For Landlord:' },
      { name: 'Tenant', email: 'tenant@example.com', textMarker: 'For Tenant:' }
    ]
  });

  assert.deepEqual(payload.Documents, ['doc-token']);
  assert.equal(payload.Signatories.length, 2);

  assert.deepEqual(payload.Signatories[0].AutoStamps, [
    {
      Identifier: 'For Landlord:',
      Color: '#7c95f4',
      Order: 1,
      Offset: { X_offset: 0, Y_offset: -50 },
      StampSize: { Height: 50, Width: 100 },
      Type: 'signature'
    },
    {
      Identifier: 'email1',
      Color: '#7c95f4',
      Order: 1,
      Offset: { X_offset: 0, Y_offset: -25 },
      StampSize: { Height: 50, Width: 100 },
      Type: 'email'
    },
    {
      Identifier: 'Date1',
      Color: '#7c95f4',
      Order: 1,
      Offset: { X_offset: 0, Y_offset: -25 },
      StampSize: { Height: 50, Width: 100 },
      Type: 'date'
    }
  ]);

  assert.equal(payload.Signatories[1].AutoStamps[0].Identifier, 'For Tenant:');
  assert.equal(payload.Signatories[1].AutoStamps[1].Identifier, 'email2');
  assert.equal(payload.Signatories[1].AutoStamps[2].Identifier, 'Date2');
});

test('V1 AutoStamp sender posts one type=3 multipart request and returns request id', async () => {
  let captured = null;
  const fetchImpl = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({ requestId: 'request-123' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };

  const result = await createAndSendV1AutoStampRequest({
    documentToken: 'doc-token',
    signatories: [{ name: 'Owner', email: 'owner@example.com', textMarker: 'For Landlord:' }],
    accessToken: 'access-token',
    fetchImpl
  });

  assert.match(captured.url, /\/sign\/api\/Requests\?type=3$/);
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers.Authorization, 'Bearer access-token');
  assert.ok(captured.init.body instanceof FormData);

  const requestJson = JSON.parse(captured.init.body.get('RequestJson'));
  assert.equal(requestJson.Signatories[0].AutoStamps[0].Identifier, 'For Landlord:');
  assert.equal(requestJson.Signatories[0].AutoStamps[0].Offset.Y_offset, -50);
  assert.equal(result.success, true);
  assert.equal(result.requestId, 'request-123');
});

test('V1 AutoStamp sender fails closed when Evia does not return a request id', async () => {
  await assert.rejects(
    createAndSendV1AutoStampRequest({
      documentToken: 'doc-token',
      signatories: [{ name: 'Owner', email: 'owner@example.com' }],
      accessToken: 'access-token',
      fetchImpl: async () => new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }),
    /returned no requestId/
  );
});
