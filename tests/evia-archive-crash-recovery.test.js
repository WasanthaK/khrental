import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runDormantEviaFencedArchive } from '../src/api/evia/archiveCoordinator.js';

const identity = () => ({
  tenantId: randomUUID(), agreementId: randomUUID(), requestId: 'disposable-recovery-request'
});
const url = (id, attempt, name) =>
  '/storage/documents/tenants/' + id.tenantId + '/agreements/' + id.agreementId +
  '/signed/staged/' + attempt + '/' + name;

test('interrupted upload pair cannot publish; restarted worker takes over after expiry', async () => {
  const id = identity();
  let owner, current, published, attempts = [], audits = [], finalized = 0;
  const objects = new Map();
  const acquire = async () => {
    if (published) return { status: 'complete', url: published.signedDocumentUrl };
    if (current?.active) return { status: 'busy', retryable: true };
    owner = randomUUID();
    current = { attemptId: owner, active: true };
    attempts.push(owner);
    return { status: 'acquired', attemptId: owner };
  };
  const renew = async ({ attemptId }) => {
    if (published || !current.active || attemptId !== owner) {
      throw Object.assign(new Error('fenced'), { code: 'EVIA_ARCHIVE_LEASE_FENCED' });
    }
    return { status: 'renewed' };
  };
  const finalize = async candidate => {
    finalized++;
    assert.equal(candidate.attemptId, owner);
    assert.ok(candidate.auditTrailUrl, 'audit evidence is required');
    assert.ok(objects.has(candidate.signedDocumentUrl));
    assert.ok(objects.has(candidate.auditTrailUrl));
    published = candidate;
    current.active = false;
    audits.push(candidate.attemptId);
    return { status: 'published', ...candidate };
  };
  const args = { ...id, acquire, renew, finalize, heartbeatMs: 1000,
    acknowledge: async () => ({ status: 'already_processed', signedDocumentUrl: published?.signedDocumentUrl }) };
  await assert.rejects(runDormantEviaFencedArchive({
    ...args, stageDocuments: async ({ attemptId }) => {
      objects.set(url(id, attemptId, 'Signed.pdf'), 'partial signed bytes');
      throw Object.assign(new Error('audit upload failed'), { code: 'STORAGE_AUDIT_UPLOAD_FAILED' });
    }
  }), { code: 'STORAGE_AUDIT_UPLOAD_FAILED' });
  assert.equal(finalized, 0);
  assert.equal(published, undefined);
  assert.equal(attempts.length, 1);
  assert.equal((await acquire()).status, 'busy');
  // Simulate durable expiry after the first process has crashed.
  current.active = false;
  const completed = await runDormantEviaFencedArchive({
    ...args, stageDocuments: async ({ attemptId }) => {
      const signedDocumentUrl = url(id, attemptId, 'Signed.pdf');
      const auditTrailUrl = url(id, attemptId, 'audit_trail.pdf');
      objects.set(signedDocumentUrl, 'winning signed bytes');
      objects.set(auditTrailUrl, 'winning audit bytes');
      return { signedDocumentUrl, auditTrailUrl };
    }
  });
  assert.equal(completed.status, 'published');
  assert.notEqual(attempts[0], attempts[1]);
  assert.equal(audits.length, 1);
  assert.equal(finalized, 1);
  assert.match(published.signedDocumentUrl, new RegExp(attempts[1]));
  assert.ok(!published.signedDocumentUrl.includes(attempts[0]));
  await assert.rejects(renew({ ...id, attemptId: attempts[0] }), { code: 'EVIA_ARCHIVE_LEASE_FENCED' });
  const stable = published;
  const replay = await runDormantEviaFencedArchive({
    ...args, verifiedDeliveryEventId: randomUUID(),
    stageDocuments: async () => { throw new Error('replay must not upload'); }
  });
  assert.equal(replay.status, 'complete');
  assert.equal(replay.signedDocumentUrl, stable.signedDocumentUrl);
  assert.strictEqual(published, stable);
  assert.equal(finalized, 1);
  assert.equal(objects.size, 3, 'failed object remains protected, never silently deleted');
});

test('lost response after publication is read-only upon replay', async () => {
  const id = identity();
  const attemptId = randomUUID();
  const signedDocumentUrl = url(id, attemptId, 'Signed.pdf');
  let acquireCalls = 0, acknowledged = 0;
  const completed = await runDormantEviaFencedArchive({
    ...id, verifiedDeliveryEventId: randomUUID(), heartbeatMs: 1000,
    acquire: async () => { acquireCalls++; return { status: 'complete', url: signedDocumentUrl }; },
    renew: async () => { throw new Error('must not renew'); },
    finalize: async () => { throw new Error('must not finalize'); },
    stageDocuments: async () => { throw new Error('must not stage'); },
    acknowledge: async () => {
      acknowledged++;
      return { status: 'already_processed', signedDocumentUrl };
    }
  });
  assert.equal(completed.status, 'complete');
  assert.equal(completed.deliveryStatus, 'already_processed');
  assert.equal(completed.signedDocumentUrl, signedDocumentUrl);
  assert.equal(acquireCalls, 1);
  assert.equal(acknowledged, 1);
});
