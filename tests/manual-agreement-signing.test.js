import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  evaluateManualSigning, isEviaManagedAgreement, MANUAL_SIGNABLE_STATUSES
} from '../src/utils/manualAgreementSigning.js';

test('only pending manual agreement statuses can be signed', () => {
  assert.deepEqual(MANUAL_SIGNABLE_STATUSES, ['pending', 'pending_signature']);
  for (const status of ['pending', 'pending_signature']) {
    assert.equal(evaluateManualSigning({ status }).allowed, true, status);
  }
  for (const status of ['draft', 'review', 'active', 'pending_activation', 'cancelled',
    'completed', 'rejected', 'expired', 'terminated', null]) {
    const result = evaluateManualSigning({ status });
    assert.equal(result.allowed, false, String(status));
    assert.equal(result.code, 'MANUAL_SIGN_STATE_INVALID');
  }
  assert.equal(evaluateManualSigning(null).code, 'AGREEMENT_NOT_FOUND');
});

test('manual-sign replay preserves signed agreement and skips side effects', () => {
  const result = evaluateManualSigning({ status: 'signed' });
  assert.equal(result.allowed, false);
  assert.equal(result.alreadySigned, true);
});

test('Evia authority always blocks manual signing, including replay', () => {
  for (const evia of [
    { eviasignreference: 'request-1' },
    { evia_document_id: 'evia-document-1' },
    { signature_request_id: 'request-2' },
    { signature_sent_at: new Date('2026-09-01T00:00:00Z') },
    { signature_completed_at: new Date('2026-09-02T00:00:00Z') },
    { signature_status: 'in_progress' },
    { signature_status: 'completed' }
  ]) {
    for (const status of ['pending', 'pending_signature', 'signed']) {
      assert.equal(isEviaManagedAgreement({ status, ...evia }), true);
      assert.equal(evaluateManualSigning({ status, ...evia }).code, 'EVIA_SIGNING_MANAGED');
    }
  }
});

test('repository enforces tenant lock, no-op replay, Evia guard, and transactional side effects', () => {
  const repo = readFileSync(new URL('../src/api/mssql/repositories.js', import.meta.url), 'utf8');
  const start = repo.indexOf('export const markAgreementSigned = ');
  assert.ok(start > 0);
  const segment = repo.slice(start);
  assert.match(segment, /FROM agreements WITH \(UPDLOCK, HOLDLOCK\)/);
  assert.match(segment, /evaluateManualSigning\(current\)/);
  assert.match(segment, /eligibility\.alreadySigned/);
  assert.match(segment, /WHERE id = @id\s+AND tenant_id = @tenantId/);
  assert.match(segment, /status\)\)\) IN \('pending', 'pending_signature'\)/);
  assert.match(segment, /await transaction\.commit\(\)/);
  assert.match(segment, /await transaction\.rollback\(\)/);
});

test('agreement screen shares server signability policy, not editable-state policy', () => {
  const view = readFileSync(new URL('../src/pages/AgreementDetails.jsx', import.meta.url), 'utf8');
  assert.match(view, /evaluateManualSigning\(agreement\)\.allowed/);
  assert.doesNotMatch(view, /Show sign button only if agreement is still editable/);
});
