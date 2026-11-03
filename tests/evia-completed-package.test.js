import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, deflateRawSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { downloadEviaCompletedPackage, extractEviaPackagePdfs } from '../src/api/evia/completedPackage.js';
import { prepareEviaCompletionEvidence } from '../src/api/evia/completionEvidence.js';
import { retainEviaAuditForVerifiedRequest } from '../src/api/evia/auditRecovery.js';
import { normalizeEviaWebhookPayload } from '../src/api/evia/webhook.js';

const pdf = Buffer.from('%PDF-1.7 original provider audit');
const signed = Buffer.from('%PDF-1.7 existing signed document');
// Real ZIP central directory and deflated entries exercise the production
// parser, rather than replacing it with a mocked list of document names.
function zip(entries = [{ name: 'signed.pdf', body: signed }, { name: 'audit_trail.pdf', body: pdf }]) {
  const locals = [], directory = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = entry.body || pdf, compressed = deflateRawSync(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8); local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(compressed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10); central.writeUInt32LE(entry.crc ?? crc32(data), 16);
    central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(entry.size ?? data.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt32LE(entry.attrs ?? 0, 38); central.writeUInt32LE(offset, 42);
    directory.push(central, name); offset += local.length + name.length + compressed.length;
  }
  const cd = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const descriptor = { url: 'https://evia.enadocapp.com/_apis/sign/api/v2/test-package', token: 'event-scoped-token', expiresAt: '2099-01-01T00:00:00Z' };
const args = { completedPackage: descriptor, verifiedRequest: true };

test('uses exact supplied package URL and event token without an API-key exchange', async () => {
  const calls = [];
  const documents = await downloadEviaCompletedPackage({ ...args, fetchImpl: async (url, options) => {
    calls.push(url); assert.equal(url, descriptor.url);
    assert.equal(options.redirect, 'error'); assert.equal(options.headers['X-Webhook-Download-Token'], 'Bearer event-scoped-token');
    assert.equal(options.headers.Authorization, undefined); assert.equal(options.headers.Accept, 'application/zip');
    return new Response(zip());
  } });
  assert.equal(calls.length, 1); assert.equal(documents.length, 2);
  assert.deepEqual(Buffer.from(documents[1].DocumentContent, 'base64'), pdf);
  const upper = await extractEviaPackagePdfs(zip([{ name: 'Signed.pdf', body: signed }, { name: 'AUDIT_TRAIL.PDF' }]));
  assert.equal(upper[1].DocumentName, 'audit_trail.pdf');
});

test('rejects unverified, expired or unsafe descriptors before any fetch', async () => {
  let calls = 0;
  for (const change of [
    { verifiedRequest: false },
    ...['http://evia.enadocapp.com/_apis/sign/package', 'https://evil.example/_apis/sign/package',
      'https://evia.enadocapp.com:444/_apis/sign/package', 'https://user:pass@evia.enadocapp.com/_apis/sign/package',
      'https://evia.enadocapp.com/other/package'].map(url => ({ completedPackage: { ...descriptor, url } })),
    { completedPackage: { ...descriptor, expiresAt: '2000-01-01' } },
    { completedPackage: { ...descriptor, token: 'bad\r\nheader' } }
  ]) await assert.rejects(downloadEviaCompletedPackage({ ...args, ...change, fetchImpl: async () => { calls++; } }));
  assert.equal(calls, 0);
});

test('provider redirects, HTML, failed downloads and oversized responses are not accepted', async () => {
  for (const response of [new Response('', { status: 302, headers: { location: 'https://other.example' } }),
    new Response('missing', { status: 404 }), new Response('<html>not a package</html>'),
    new Response(zip(), { headers: { 'content-length': String(51 * 1024 * 1024) } })]) {
    await assert.rejects(downloadEviaCompletedPackage({ ...args, fetchImpl: async () => response }));
  }
  await assert.rejects(downloadEviaCompletedPackage({ ...args, fetchImpl: async () => { throw new Error('secret URL'); } }),
    error => !error.message.includes('secret URL') && error.code === 'EVIA_PACKAGE_FETCH_FAILED');
});

test('rejects traversal, duplicate audit, normalization collisions, symlinks, corrupt PDFs and expansion bombs', async () => {
  for (const bad of [
    [{ name: '../audit_trail.pdf' }], [{ name: 'a\\audit_trail.pdf' }],
    [{ name: 'audit_trail.pdf' }, { name: 'AUDIT_TRAIL.pdf' }],
    [{ name: 'signed file.pdf' }, { name: 'signed_file.pdf' }, { name: 'audit_trail.pdf' }],
    [{ name: 'audit_trail.pdf', attrs: (0o120777 << 16) >>> 0 }],
    [{ name: 'audit_trail.pdf', body: Buffer.from('not PDF') }],
    [{ name: 'audit_trail.pdf', crc: 1 }],
    [{ name: 'audit_trail.pdf', size: 51 * 1024 * 1024 }],
    [{ name: 'signed.pdf' }],
    Array.from({ length: 101 }, (_, i) => ({ name: `${i}.pdf` }))
  ]) await assert.rejects(extractEviaPackagePdfs(zip(bad)));
});

const agreement = { id: '22222222-2222-4222-8222-222222222222', tenant_id: '11111111-1111-4111-8111-111111111111', status: 'signed', signature_status: 'completed' };
const signedUrl = `/storage/documents/tenants/${agreement.tenant_id}/agreements/${agreement.id}/signed/signed.pdf`;

test('late completed-package replay writes only the missing audit, and repeat skips expired package download', async () => {
  let retained, downloads = 0; const writes = [];
  const storageDriver = {
    getObject: async (bucket, path) => {
      assert.equal(bucket, 'documents'); assert.ok(path.endsWith('/signed/audit_trail.pdf'));
      if (!retained) throw Object.assign(new Error('missing'), { status: 404 });
      return { body: retained };
    },
    createEviaAuditIfAbsent: async (bucket, path, body) => { writes.push(path); retained ||= body; }
  };
  const input = { verifiedRequest: true, completed: true, agreement, requestId: 'persisted-request', completedPackage: descriptor,
    signedDocumentUrl: signedUrl,
    downloadPackage: async () => { downloads++; return extractEviaPackagePdfs(zip()); },
    retainAudit: input => retainEviaAuditForVerifiedRequest({ ...input, storageDriver, fetchImpl: () => { throw new Error('Must not exchange API key'); } }) };
  await prepareEviaCompletionEvidence(input);
  await prepareEviaCompletionEvidence({ ...input, completedPackage: { ...descriptor, expiresAt: '2000-01-01' } });
  assert.equal(downloads, 1); assert.equal(writes.length, 1); assert.deepEqual(retained, pdf);
  assert.equal(agreement.status, 'signed'); assert.equal(agreement.signature_status, 'completed');
});

test('first completion returns verified package PDFs for the existing archival pipeline', async () => {
  const documents = await prepareEviaCompletionEvidence({ verifiedRequest: true, completed: true,
    agreement: { ...agreement, status: 'pending', signature_status: 'pending' }, requestId: 'persisted-request',
    completedPackage: descriptor, downloadPackage: async () => extractEviaPackagePdfs(zip()),
    retainAudit: () => { throw new Error('No independent audit storage before signed PDF'); } });
  assert.equal(documents.length, 2);
});

test('published fenced replay stays with its archive guards and never invokes historic recovery', async () => {
  const documents = [{ DocumentName: 'audit_trail.pdf', DocumentContent: pdf.toString('base64') }];
  for (const signedDocumentUrl of [
    signedUrl.replace('/signed/', '/signed/staged/attempt/'),
    signedUrl.replace('/signed/', '/signed/staged/attempt/').toUpperCase()
  ]) {
    assert.equal(await prepareEviaCompletionEvidence({ verifiedRequest: true, completed: true,
      agreement, requestId: 'persisted-request', signedDocumentUrl, documents,
      completedPackage: { ...descriptor, expiresAt: '2000-01-01' },
      downloadPackage: () => { throw new Error('Published replay must not fetch expired package'); },
      retainAudit: () => { throw new Error('Historic recovery must not modify fenced publication'); }
    }), documents);
  }
});

test('late inline audit is retained without fetching any provider endpoint', async () => {
  let saved;
  await prepareEviaCompletionEvidence({ verifiedRequest: true, completed: true, agreement,
    requestId: 'persisted-request', signedDocumentUrl: signedUrl,
    documents: [{ DocumentName: 'audit_trail.pdf', DocumentContent: pdf.toString('base64') }],
    downloadPackage: () => { throw new Error('No package request'); },
    retainAudit: async ({ loadAuditBody }) => { saved = await loadAuditBody(); }
  });
  assert.deepEqual(saved, pdf);
});

test('package failure cannot write or acknowledge an audit', async () => {
  let writes = 0;
  await assert.rejects(prepareEviaCompletionEvidence({ verifiedRequest: true, completed: true, agreement,
    requestId: 'persisted-request', signedDocumentUrl: signedUrl, completedPackage: descriptor,
    downloadPackage: async () => { throw Object.assign(new Error('expired'), { code: 'EVIA_PACKAGE_EXPIRED' }); },
    retainAudit: input => retainEviaAuditForVerifiedRequest({ ...input, storageDriver: {
      getObject: async () => { throw Object.assign(new Error('missing'), { status: 404 }); },
      createEviaAuditIfAbsent: () => { writes++; }
    } })
  }), { code: 'EVIA_PACKAGE_EXPIRED' });
  assert.equal(writes, 0);
});

test('non-completion, rejected and unverified requests cannot retrieve a package', async () => {
  const base = { agreement, requestId: 'persisted-request', completedPackage: descriptor,
    downloadPackage: () => { throw new Error('Must not fetch'); }, retainAudit: () => { throw new Error('Must not store'); } };
  await prepareEviaCompletionEvidence({ ...base, verifiedRequest: true, completed: false });
  await prepareEviaCompletionEvidence({ ...base, verifiedRequest: true, completed: true, agreement: { ...agreement, status: 'cancelled' } });
  await assert.rejects(prepareEviaCompletionEvidence({ ...base, verifiedRequest: false, completed: true }), { code: 'EVIA_PACKAGE_UNVERIFIED' });
});

test('normalizes package casing and runs evidence retention before duplicate or terminal acknowledgement', () => {
  for (const payload of [{ completedPackage: descriptor }, { data: { CompletedPackage: descriptor } }]) {
    assert.deepEqual(normalizeEviaWebhookPayload(payload).completedPackage, descriptor);
  }
  const source = readFileSync(new URL('../src/api/evia/webhook.js', import.meta.url), 'utf8');
  const call = source.indexOf('await prepareEviaCompletionEvidence(');
  assert.ok(call > source.indexOf('if (!agreement)'));
  assert.ok(call < source.indexOf('const alreadyProcessed = await hasProcessedWebhookDelivery'));
  assert.ok(call < source.indexOf('const terminalDecision = evaluateEviaTerminalDelivery'));
});
