import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  withEviaArchiveCapacity, getEviaArchiveCapacityLimit,
  getEviaArchiveCapacityStatus
} from '../src/api/evia/archiveCapacity.js';
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

test('different Evia delivery IDs must serialize one agreement signed-document archive', () => {
  const claim = readFileSync(new URL('../src/api/evia/archiveLock.js', import.meta.url), 'utf8');
  const webhook = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  assert.match(claim, /JSON\.stringify\(\[String\(tenantId\)\.toLowerCase\(\), String\(agreementId\)\.toLowerCase\(\)\]\)/);
  assert.match(claim, /sys\.sp_getapplock/);
  assert.match(claim, /@LockMode = 'Exclusive'/);
  assert.match(claim, /@LockOwner = 'Transaction'/);
  assert.match(claim, /@LockTimeout = 0/);
  assert.match(claim, /eviasignreference = @requestId/);
  assert.match(claim, /tenant_id = @tenantId/);
  assert.match(claim, /await execute\(latest\)/);
  assert.match(claim, /await transaction\.commit\(\)/);
  assert.match(claim, /await transaction\.rollback\(\)/);

  const terminal = webhook.slice(webhook.indexOf('const completeTerminal = '));
  assert.match(terminal, /withEviaAgreementArchiveLock\(/);
  assert.match(terminal, /getStoredSignedDocumentUrl\(latest\)/);
  assert.match(terminal, /return completeTerminal\(latest\)/);
  assert.match(terminal, /EVIA_ARCHIVE_IN_PROGRESS/);
  assert.match(terminal, /statusCode: 503/);
  // Callback intentionally encompasses the final state/URL SQL UPDATE, not
  // just the external document fetch, so the next delivery sees saved state.
  assert.ok(terminal.indexOf('const terminalUpdated = await runQuery(') <
    terminal.indexOf('withEviaAgreementArchiveLock('));
});

test('archive admission leaves query capacity available in the configured MSSQL pool', () => {
  assert.equal(getEviaArchiveCapacityLimit({ MSSQL_POOL_MAX: '10' }), 2);
  assert.equal(getEviaArchiveCapacityLimit({ MSSQL_POOL_MAX: '3' }), 1);
  assert.equal(getEviaArchiveCapacityLimit({ MSSQL_POOL_MAX: '2' }), 1);
  assert.equal(getEviaArchiveCapacityLimit({
    MSSQL_POOL_MAX: '12', EVIA_ARCHIVE_MAX_CONCURRENT: '4'
  }), 4);
  assert.equal(getEviaArchiveCapacityLimit({
    MSSQL_POOL_MAX: '4', EVIA_ARCHIVE_MAX_CONCURRENT: '500'
  }), 2);
  assert.equal(getEviaArchiveCapacityLimit({
    MSSQL_POOL_MAX: '4', EVIA_ARCHIVE_MAX_CONCURRENT: 'invalid'
  }), 2);
});

test('parallel PDF archives reject excess work before acquiring SQL connections and release slots', async () => {
  let entered = 0;
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let enteredResolve;
  const bothEntered = new Promise(resolve => { enteredResolve = resolve; });
  const events = [];
  const logger = {
    info: (event, details) => events.push({ event, details }),
    warn: (event, details) => events.push({ event, details })
  };
  const execute = async () => {
    entered += 1;
    if (entered === 2) enteredResolve();
    await blocked;
    return 'archived';
  };

  const first = withEviaArchiveCapacity({ execute, maxConcurrent: 2, logger });
  const second = withEviaArchiveCapacity({ execute, maxConcurrent: 2, logger });
  await bothEntered;
  try {
    assert.equal(getEviaArchiveCapacityStatus().active, 2);
    await assert.rejects(
      withEviaArchiveCapacity({
        maxConcurrent: 2, logger,
        execute: async () => { throw new Error('Over-capacity operation entered'); }
      }),
      err => err.code === 'EVIA_ARCHIVE_CAPACITY_EXCEEDED' && err.status === 503
    );
    assert.equal(entered, 2);
    assert.equal(events.filter(e => e.event.includes('capacity_rejected')).length, 1);
  } finally {
    release();
  }
  assert.deepEqual(await Promise.all([first, second]), ['archived', 'archived']);
  assert.equal(getEviaArchiveCapacityStatus().active, 0);
  const next = await withEviaArchiveCapacity({
    maxConcurrent: 2, logger, execute: async () => 'retry-accepted'
  });
  assert.equal(next, 'retry-accepted');
  assert.equal(getEviaArchiveCapacityStatus().active, 0);
});

test('failed and timed-out archive operations release slots without success claims', async () => {
  const failure = new Error('archive upload rejected');
  const logger = { info() {}, warn() {} };
  await assert.rejects(
    withEviaArchiveCapacity({ maxConcurrent: 1, logger, execute: async () => { throw failure; } }),
    err => err === failure
  );
  assert.equal(getEviaArchiveCapacityStatus().active, 0);
  await assert.rejects(
    withEviaArchiveCapacity({ maxConcurrent: 0, logger, execute: async () => {} }),
    /positive integer/
  );
});

test('webhook uses archive capacity before SQL lock and returns retryable 503 on saturation', () => {
  const webhook = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  const section = webhook.slice(webhook.indexOf('if (finalState.signatureStatus === \'completed\' && !getStoredSignedDocumentUrl(agreement))'));
  assert.match(section, /withEviaArchiveCapacity\(\{ execute: \(\) => withEviaAgreementArchiveLock\(/);
  assert.match(section, /EVIA_ARCHIVE_CAPACITY_EXCEEDED/);
  assert.match(section, /EVIA_ARCHIVE_IN_PROGRESS/);
  assert.match(section, /DATEADD\(MINUTE, -16, SYSUTCDATETIME\(\)\)/);
  assert.match(section, /statusCode: 503/);
});
