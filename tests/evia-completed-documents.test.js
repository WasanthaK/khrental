import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EVIA_ARCHIVE_HEARTBEAT_MS,
  runDormantEviaFencedArchive,
  stageEviaDocumentsForFencedLease
} from '../src/api/evia/archiveCoordinator.js';
import {
  EVIA_ARCHIVE_LEASE_EVENT, EVIA_ARCHIVE_LEASE_MS,
  validateEviaArchiveLeaseIdentity, validateEviaStagedArchiveUrl
} from '../src/api/evia/archiveLease.js';
import {
  withEviaArchiveCapacity, getEviaArchiveCapacityLimit,
  getEviaArchiveCapacityStatus
} from '../src/api/evia/archiveCapacity.js';
import {
  retrieveAndStoreEviaCompletedDocuments,
  sanitizeCompletedDocumentName,
  storeEviaWebhookCompletedDocuments,
  validateEviaDownloadUrl,
  createEviaArchiveAttemptId,
  buildEviaCompletedDocumentPath
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

test('immutable Evia stage tokens isolate the same PDF name across independent worker attempts', async () => {
  const storedPaths = [];
  const storageDriver = {
    upload: async (bucket, path) => {
      assert.equal(bucket, 'documents');
      storedPaths.push(path);
      return { path };
    }
  };
  const firstAttempt = createEviaArchiveAttemptId();
  const secondAttempt = createEviaArchiveAttemptId();
  assert.notEqual(firstAttempt, secondAttempt);
  assert.match(firstAttempt, /^[0-9a-f-]{36}$/i);

  const documents = [
    { DocumentName: 'Agreement.pdf', DocumentContent: Buffer.from('signed').toString('base64') },
    { DocumentName: 'audit_trail.pdf', DocumentContent: Buffer.from('audit').toString('base64') }
  ];
  const inputs = {
    documents, tenantId: 'tenant-A', agreementId: 'agreement-1', storageDriver
  };
  const a = await storeEviaWebhookCompletedDocuments({ ...inputs, archiveAttemptId: firstAttempt });
  const b = await storeEviaWebhookCompletedDocuments({ ...inputs, archiveAttemptId: secondAttempt });
  assert.equal(storedPaths.length, 4);
  assert.equal(new Set(storedPaths).size, 4, 'no cross-attempt file overwrite is possible');
  assert.equal(a.signedDocumentUrl.includes('/signed/staged/' + firstAttempt + '/'), true);
  assert.equal(b.signedDocumentUrl.includes('/signed/staged/' + secondAttempt + '/'), true);
  assert.equal(a.auditTrailUrl.includes('/signed/staged/' + firstAttempt + '/'), true);
  assert.equal(b.auditTrailUrl.includes('/signed/staged/' + secondAttempt + '/'), true);
  assert.ok(a.signedDocumentUrl.endsWith('/Agreement.pdf'));
  assert.ok(b.signedDocumentUrl.endsWith('/Agreement.pdf'));
  assert.notEqual(a.signedDocumentUrl, b.signedDocumentUrl);
});

test('API-retrieved Evia PDF also uses attempt-scoped immutable path when opted in', async () => {
  const downloads = 'https://evia.enadocapp.com/_apis/sign/api/v2/documents/test/download';
  const writes = [];
  const driver = {
    upload: async (bucket, path) => {
      writes.push({ bucket, path });
      return { path };
    }
  };
  const fetchImpl = async url => {
    if (String(url).endsWith('/requests/request-1/documents')) {
      return jsonResponse([{ DocumentName: 'Lease.pdf', DownloadUrl: downloads }]);
    }
    if (String(url) === downloads) return binaryResponse('signed-by-evia');
    throw new Error('unexpected fetch: ' + url);
  };
  const archiveAttemptId = createEviaArchiveAttemptId();
  const result = await retrieveAndStoreEviaCompletedDocuments({
    tenantId: 'tenant-A', agreementId: 'agreement-1',
    requestId: 'request-1', accessToken: 'test-token',
    archiveAttemptId, fetchImpl, storageDriver: driver
  });
  assert.equal(writes.length, 1);
  assert.match(writes[0].path, new RegExp('/signed/staged/' + archiveAttemptId + '/Lease\\.pdf$'));
  assert.equal(result.signedDocumentUrl.includes('/signed/staged/' + archiveAttemptId + '/'), true);
});

test('archive attempt IDs are validated and legacy paths remain exactly unchanged', () => {
  const common = { tenantId: 'tenant-A', agreementId: 'agreement-1', documentName: 'Lease.pdf' };
  assert.equal(
    buildEviaCompletedDocumentPath(common),
    'tenants/tenant-A/agreements/agreement-1/signed/Lease.pdf'
  );
  for (const archiveAttemptId of ['../other', 'abc', 'A'.repeat(97), 'a/b', '', null]) {
    if (archiveAttemptId === null) {
      assert.equal(buildEviaCompletedDocumentPath({ ...common, archiveAttemptId }),
        'tenants/tenant-A/agreements/agreement-1/signed/Lease.pdf');
    } else {
      assert.throws(() => buildEviaCompletedDocumentPath({ ...common, archiveAttemptId }),
        error => error?.code === 'EVIA_ARCHIVE_ATTEMPT_ID_INVALID');
    }
  }
  assert.throws(() => buildEviaCompletedDocumentPath({
    ...common, tenantId: '../tenant', archiveAttemptId: createEviaArchiveAttemptId()
  }), error => error?.code === 'EVIA_SIGNED_DOCUMENT_STORAGE_ID_INVALID');
});

test('live Evia webhook does not opt into staged paths without fenced SQL lease promotion', () => {
  const webhook = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  assert.doesNotMatch(webhook, /archiveAttemptId:\s*createEviaArchiveAttemptId/);
  assert.match(webhook, /withEviaAgreementArchiveLock\(/);
});

test('dormant Evia durable archive lease identity requires tenant-bound UUIDs and request', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const agreementId = '22222222-2222-4222-8222-222222222222';
  const requestId = 'request-123';
  assert.equal(EVIA_ARCHIVE_LEASE_EVENT, 'evia.archive.lease.v1');
  assert.equal(EVIA_ARCHIVE_LEASE_MS, 15 * 60 * 1000);
  assert.doesNotThrow(() => validateEviaArchiveLeaseIdentity({ tenantId, agreementId, requestId }));
  for (const invalid of [
    { tenantId: '../other', agreementId, requestId },
    { tenantId, agreementId: 'not-a-guid', requestId },
    { tenantId, agreementId, requestId: '' },
    { tenantId, agreementId, requestId: 'x'.repeat(256) }
  ]) {
    assert.throws(() => validateEviaArchiveLeaseIdentity(invalid),
      error => error.code === 'EVIA_ARCHIVE_LEASE_IDENTITY_INVALID');
  }
});

test('fenced signed document promotion rejects paths from old attempts or other tenants', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';
  const agreementId = '22222222-2222-4222-8222-222222222222';
  const attemptId = '33333333-3333-4333-8333-333333333333';
  const prefix = '/storage/documents/tenants/' + tenantId + '/agreements/'
    + agreementId + '/signed/staged/' + attemptId + '/';
  const identity = { tenantId, agreementId, attemptId };
  const url = prefix + 'Lease.pdf';
  assert.equal(validateEviaStagedArchiveUrl({ ...identity, url }), url);
  const invalid = [
    prefix + '../Lease.pdf',
    prefix + '..',
    prefix + '.',
    prefix + 'a'.repeat(181),
    prefix.replace(tenantId, '44444444-4444-4444-8444-444444444444') + 'Lease.pdf',
    prefix.replace(attemptId, '55555555-5555-4555-8555-555555555555') + 'Lease.pdf',
    '/storage/documents/tenants/' + tenantId + '/agreements/' + agreementId + '/signed/Lease.pdf'
  ];
  for (const bad of invalid) {
    assert.throws(() => validateEviaStagedArchiveUrl({ ...identity, url: bad }),
      error => error.code === 'EVIA_ARCHIVE_STAGE_URL_INVALID');
  }
});

test('lease is a dormant separate event type and live webhook retains transactional archive lock', () => {
  const source = readFileSync(new URL('../src/api/evia/archiveLease.js', import.meta.url), 'utf8');
  const webhook = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  assert.match(source, /sys\.sp_getapplock/);
  assert.match(source, /evia\.archive\.lease\.v1/);
  assert.match(source, /JSON_VALUE\(raw_data, '\$\.agreementId'\)/);
  assert.match(source, /JSON_VALUE\(raw_data, '\$\.attemptId'\)/);
  assert.match(source, /signed_document_url IS NULL AND signeddocumenturl IS NULL/);
  assert.match(source, /WHERE id = @agreementId AND tenant_id = @tenantId/);
  assert.match(source, /leaseAgeValid\(lease\)/);
  assert.match(source, /await transaction\.commit\(\)/);
  assert.match(source, /await transaction\.rollback\(\)/);
  assert.doesNotMatch(webhook, /acquireEviaArchiveLease|finalizeEviaArchiveLease/);
  assert.match(webhook, /withEviaAgreementArchiveLock/);
  assert.match(webhook, /withEviaArchiveCapacity/);
});

test('dormant archive coordinator leaves busy and complete claims without storage side effects', async () => {
  const id = { tenantId: 'tenant-1', agreementId: 'agreement-1', requestId: 'request-1' };
  let stored = 0;
  const args = {
    ...id,
    stageDocuments: async () => { stored++; throw new Error('storage must not run'); },
    renew: async () => { throw new Error('renew must not run'); },
    finalize: async () => { throw new Error('finalize must not run'); }
  };
  assert.equal(EVIA_ARCHIVE_HEARTBEAT_MS, 5 * 60 * 1000);
  assert.deepEqual(await runDormantEviaFencedArchive({
    ...args, acquire: async () => ({ status: 'busy' })
  }), { status: 'busy', retryable: true });
  assert.deepEqual(await runDormantEviaFencedArchive({
    ...args, acquire: async () => ({ status: 'complete', url: '/storage/documents/signed.pdf' })
  }), { status: 'complete', signedDocumentUrl: '/storage/documents/signed.pdf' });
  assert.equal(stored, 0);
});

test('dormant coordinator renews ownership during PDF staging, then fences before publication', async () => {
  const calls = [];
  const attemptId = '33333333-3333-4333-8333-333333333333';
  const identity = { tenantId: 'tenant-1', agreementId: 'agreement-1', requestId: 'request-1' };
  const signedDocumentUrl = '/storage/documents/staged/' + attemptId + '/Lease.pdf';
  const auditTrailUrl = '/storage/documents/staged/' + attemptId + '/audit.pdf';
  const result = await runDormantEviaFencedArchive({
    ...identity, heartbeatMs: 10,
    acquire: async args => { calls.push(['acquire', args]); return { status: 'acquired', attemptId }; },
    renew: async args => { calls.push(['renew', args]); return { status: 'renewed' }; },
    stageDocuments: async args => {
      calls.push(['stage', args.attemptId]);
      assert.equal(args.signal.aborted, false);
      await new Promise(resolve => setTimeout(resolve, 60));
      return { signedDocumentUrl, auditTrailUrl };
    },
    finalize: async args => {
      calls.push(['finalize', args]);
      return { status: 'published', attemptId: args.attemptId, signedDocumentUrl: args.signedDocumentUrl };
    }
  });
  assert.equal(result.status, 'published');
  assert.ok(calls.filter(x => x[0] === 'renew').length >= 2, 'heartbeat plus required final renewal');
  assert.equal(calls[0][0], 'acquire');
  assert.equal(calls.findIndex(x => x[0] === 'stage') < calls.findIndex(x => x[0] === 'finalize'), true);
  const final = calls.at(-1);
  assert.equal(final[0], 'finalize');
  assert.deepEqual(final[1], { ...identity, attemptId, signedDocumentUrl, auditTrailUrl });
});

test('expired or stolen owner aborts staging and cannot finalize even if upload completes', async () => {
  const lost = Object.assign(new Error('worker lease taken over'), { code: 'EVIA_ARCHIVE_LEASE_FENCED' });
  const attemptId = '33333333-3333-4333-8333-333333333333';
  let finalizeCount = 0;
  let aborted;
  await assert.rejects(runDormantEviaFencedArchive({
    tenantId: 'tenant-1', agreementId: 'agreement-1', requestId: 'request-1',
    heartbeatMs: 5, logger: { warn() {} },
    acquire: async () => ({ status: 'acquired', attemptId }),
    renew: async () => { throw lost; },
    stageDocuments: async ({ signal }) => {
      await new Promise(resolve => {
        if (signal.aborted) return resolve();
        signal.addEventListener('abort', resolve, { once: true });
      });
      aborted = signal.aborted;
      // Deliberately represent an upload that ignored abort and finished.
      return { signedDocumentUrl: '/storage/documents/staged/old.pdf' };
    },
    finalize: async () => { finalizeCount++; }
  }), error => error === lost);
  assert.equal(aborted, true);
  assert.equal(finalizeCount, 0);
});

test('failed PDF retrieval or missing signed PDF does not publish an authoritative URL', async () => {
  const attemptId = '33333333-3333-4333-8333-333333333333';
  const failure = new Error('mock Evia download refused');
  let published = 0;
  let renewals = 0;
  const common = {
    tenantId: 'tenant-1', agreementId: 'agreement-1', requestId: 'request-1',
    acquire: async () => ({ status: 'acquired', attemptId }),
    renew: async () => { renewals++; return { status: 'renewed' }; },
    finalize: async () => { published++; }
  };
  await assert.rejects(runDormantEviaFencedArchive({
    ...common, stageDocuments: async () => { throw failure; }
  }), error => error === failure);
  await assert.rejects(runDormantEviaFencedArchive({
    ...common, stageDocuments: async () => ({ auditTrailUrl: '/storage/documents/staged/audit.pdf' })
  }), error => error.code === 'EVIA_ARCHIVE_SIGNED_PDF_REQUIRED');
  assert.equal(published, 0);
  assert.equal(renewals, 0);
});

test('fenced staging prefers verified inline documents and keeps scoped fallback identity', async () => {
  const identity = {
    tenantId: 'tenant-1', agreementId: 'agreement-1', requestId: 'request-1',
    archiveAttemptId: '33333333-3333-4333-8333-333333333333'
  };
  const calls = [];
  const common = {
    ...identity, documents: [{ DocumentName: 'Lease.pdf' }],
    inlineStore: async args => {
      calls.push(['inline', args]);
      return { signedDocumentUrl: '/storage/documents/inline.pdf' };
    },
    retrieve: async args => {
      calls.push(['retrieve', args]);
      return { signedDocumentUrl: '/storage/documents/api.pdf' };
    }
  };
  const preferred = await stageEviaDocumentsForFencedLease(common);
  assert.equal(preferred.signedDocumentUrl, '/storage/documents/inline.pdf');
  assert.deepEqual(calls.map(c => c[0]), ['inline']);
  calls.length = 0;
  const fallback = await stageEviaDocumentsForFencedLease({
    ...common,
    inlineStore: async args => { calls.push(['inline', args]); return { auditTrailUrl: 'audit-only' }; },
    retrievalOptions: { accessToken: 'test-oauth', tenantId: 'foreign', agreementId: 'wrong', archiveAttemptId: 'stale', requestId: 'wrong' }
  });
  assert.equal(fallback.signedDocumentUrl, '/storage/documents/api.pdf');
  assert.deepEqual(calls.map(c => c[0]), ['inline', 'retrieve']);
  assert.deepEqual(
    Object.fromEntries(['tenantId', 'agreementId', 'requestId', 'archiveAttemptId'].map(k => [k, calls[1][1][k]])),
    identity
  );
});

test('dormant Evia coordinator is not wired into the verified production webhook', () => {
  const source = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /runDormantEviaFencedArchive|stageEviaDocumentsForFencedLease/);
  assert.match(source, /withEviaAgreementArchiveLock/);
  assert.match(source, /withEviaArchiveCapacity/);
});
