import test from 'node:test';
import assert from 'node:assert/strict';
import {
  retrieveAndStoreEviaCompletedDocuments,
  sanitizeCompletedDocumentName,
  storeEviaWebhookCompletedDocuments,
  validateEviaDownloadUrl
} from '../src/api/evia/completedDocuments.js';

const jsonResponse = (payload, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null
  },
  json: async () => payload,
  text: async () => JSON.stringify(payload),
  arrayBuffer: async () => Buffer.from(JSON.stringify(payload))
});

const binaryResponse = (body, contentType = 'application/pdf', status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: {
    get: (name) => String(name).toLowerCase() === 'content-type' ? contentType : null
  },
  json: async () => { throw new Error('not json'); },
  text: async () => '',
  arrayBuffer: async () => Buffer.from(body)
});

test('retrieves completed signed agreement and audit trail into tenant-scoped storage', async () => {
  const calls = [];
  const signedDownloadUrl = 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/signed-token/download';
  const auditDownloadUrl = 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/audit-token/download';

  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).endsWith('/oauth/exchange')) {
      assert.equal(String(url), 'https://evia.enadocapp.com/api/v2/oauth/exchange');
      assert.equal(options.headers['X-Api-Key'], 'integration-key');
      return jsonResponse({ access_token: 'bearer-token', expires_in: 1800 });
    }

    if (String(url).includes('/requests/request-123/documents')) {
      assert.equal(
        String(url),
        'https://evia.enadocapp.com/_apis/sign/api/v2/requests/request-123/documents'
      );
      assert.equal(options.headers.Authorization, 'Bearer bearer-token');
      return jsonResponse([
        { documentName: 'Rental Agreement.pdf', downloadUrl: signedDownloadUrl },
        { documentName: 'audit_trail.pdf', downloadUrl: auditDownloadUrl }
      ]);
    }

    if (String(url) === signedDownloadUrl) {
      assert.equal(options.headers.Authorization, 'Bearer bearer-token');
      return binaryResponse('signed-pdf');
    }

    if (String(url) === auditDownloadUrl) {
      assert.equal(options.headers.Authorization, 'Bearer bearer-token');
      return binaryResponse('audit-pdf');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const uploads = [];
  const storageDriver = {
    upload: async (bucket, relativePath, body, contentType) => {
      uploads.push({ bucket, relativePath, body: Buffer.from(body), contentType });
      return { path: relativePath, fullPath: `${bucket}/${relativePath}` };
    }
  };

  const result = await retrieveAndStoreEviaCompletedDocuments({
    requestId: 'request-123',
    tenantId: 'tenant-abc',
    agreementId: 'agreement-xyz',
    apiKey: 'integration-key',
    fetchImpl,
    storageDriver
  });

  assert.equal(calls.length, 4);
  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].bucket, 'documents');
  assert.equal(
    uploads[0].relativePath,
    'tenants/tenant-abc/agreements/agreement-xyz/signed/Rental_Agreement.pdf'
  );
  assert.equal(
    uploads[1].relativePath,
    'tenants/tenant-abc/agreements/agreement-xyz/signed/audit_trail.pdf'
  );
  assert.equal(
    result.signedDocumentUrl,
    '/storage/documents/tenants/tenant-abc/agreements/agreement-xyz/signed/Rental_Agreement.pdf'
  );
  assert.equal(
    result.auditTrailUrl,
    '/storage/documents/tenants/tenant-abc/agreements/agreement-xyz/signed/audit_trail.pdf'
  );
});

test('uses a supplied Evia OAuth token without API-key exchange', async () => {
  const calls = [];
  const signedDownloadUrl = 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/oauth-token/download';
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    calls.push({ target, options });

    assert.equal(target.endsWith('/oauth/exchange'), false);

    if (target.includes('/requests/request-oauth/documents')) {
      assert.equal(options.headers.Authorization, 'Bearer existing-oauth-token');
      return jsonResponse([{ documentName: 'signed.pdf', downloadUrl: signedDownloadUrl }]);
    }

    if (target === signedDownloadUrl) {
      assert.equal(options.headers.Authorization, 'Bearer existing-oauth-token');
      return binaryResponse('signed-pdf');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const uploads = [];
  const storageDriver = {
    upload: async (bucket, relativePath, body) => {
      uploads.push({ bucket, relativePath, body: Buffer.from(body) });
      return { path: relativePath };
    }
  };

  const result = await retrieveAndStoreEviaCompletedDocuments({
    requestId: 'request-oauth',
    tenantId: 'tenant-abc',
    agreementId: 'agreement-xyz',
    accessToken: 'existing-oauth-token',
    fetchImpl,
    storageDriver
  });

  assert.equal(calls.length, 2);
  assert.equal(uploads.length, 1);
  assert.match(result.signedDocumentUrl, /signed\.pdf$/);
});

test('stores completed documents attached to a verified webhook', async () => {
  const uploads = [];
  const storageDriver = {
    upload: async (bucket, relativePath, body, contentType) => {
      uploads.push({ bucket, relativePath, body: Buffer.from(body), contentType });
      return { path: relativePath };
    }
  };

  const result = await storeEviaWebhookCompletedDocuments({
    tenantId: 'tenant-abc',
    agreementId: 'agreement-xyz',
    documents: [
      {
        DocumentName: 'Rental Agreement.pdf',
        DocumentContent: Buffer.from('signed-pdf').toString('base64')
      },
      {
        DocumentName: 'audit_trail.pdf',
        DocumentContent: Buffer.from('audit-pdf').toString('base64')
      }
    ],
    storageDriver
  });

  assert.equal(uploads.length, 2);
  assert.equal(uploads[0].body.toString(), 'signed-pdf');
  assert.equal(uploads[1].body.toString(), 'audit-pdf');
  assert.match(result.signedDocumentUrl, /Rental_Agreement\.pdf$/);
  assert.match(result.auditTrailUrl, /audit_trail\.pdf$/);
});

test('refreshes the short-lived Evia token once after a 401', async () => {
  let exchanges = 0;
  let listAttempts = 0;

  const fetchImpl = async (url, options = {}) => {
    const target = String(url);

    if (target.endsWith('/oauth/exchange')) {
      exchanges += 1;
      return jsonResponse({ access_token: `token-${exchanges}`, expires_in: 1800 });
    }

    if (target.includes('/requests/request-401/documents')) {
      listAttempts += 1;
      if (listAttempts === 1) {
        return jsonResponse({ error: 'expired' }, 401);
      }
      assert.equal(options.headers.Authorization, 'Bearer token-2');
      return jsonResponse([
        {
          documentName: 'signed.pdf',
          downloadUrl: 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/retry-token/download'
        }
      ]);
    }

    if (target.endsWith('/documents/retry-token/download')) {
      return binaryResponse('signed-pdf');
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  const storageDriver = {
    upload: async (_bucket, relativePath) => ({ path: relativePath })
  };

  const result = await retrieveAndStoreEviaCompletedDocuments({
    requestId: 'request-401',
    tenantId: 'tenant-abc',
    agreementId: 'agreement-xyz',
    apiKey: 'integration-key',
    fetchImpl,
    storageDriver
  });

  assert.equal(exchanges, 2);
  assert.equal(listAttempts, 2);
  assert.match(result.signedDocumentUrl, /signed\.pdf$/);
});

test('rejects completed-document download URLs outside the Evia V2 document endpoint', () => {
  assert.throws(
    () => validateEviaDownloadUrl('https://example.com/signed.pdf'),
    (error) => error?.code === 'EVIA_DOWNLOAD_URL_UNTRUSTED'
  );

  assert.throws(
    () => validateEviaDownloadUrl('http://evia.enadocapp.com/_apis/sign/api/v2/documents/a/download'),
    (error) => error?.code === 'EVIA_DOWNLOAD_URL_UNTRUSTED'
  );
});

test('sanitizes completed document names before storage', () => {
  assert.equal(
    sanitizeCompletedDocumentName('../../Rental Agreement (final).pdf'),
    'Rental_Agreement_final_.pdf'
  );
});
